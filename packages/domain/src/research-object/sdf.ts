import type { AuditContext } from '@openscience/observability';
import { validateSdfDraftCore } from '@openscience/sdf-schema';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import { requirePrivateRoAccess } from '../visibility/access';
import { createCommit } from '../commit/commits';
import { carryVersionEvidence } from '../ingestion/ingestion-evidence';
import { freezeResearchRecord } from '../commit/research-record-snapshot';
import { carryVersionMedia } from '../commit/carry-media';
import { lockTrashReferences } from '../trash/trash';
import type { WorkspaceDeps } from '../workspace/types';
import { ResearchObjectError } from './errors';
import { SDF_NODE_TYPES } from './types';

export interface SdfDocumentView {
  core: Record<string, string>;
  nodes: Array<{ nodeType: string; content: string }>;
}

export interface UpdateSdfInput {
  userId: string;
  roId: string;
  /** 乐观锁版本（对齐 RO.version）。 */
  version: number;
  core: Record<string, string>;
}

/** 查 SDFDocument（可见性判定 §4.2：成员/invite_only grant 可读 + core + nodes）。 */
export async function getSdfDocument(
  deps: WorkspaceDeps,
  input: { userId: string; roId: string },
): Promise<SdfDocumentView> {
  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.roId },
    include: { sdfDocument: { include: { nodes: true } } },
  });
  if (!ro || ro.deletedAt) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requirePrivateRoAccess(deps, { researchObjectId: input.roId, userId: input.userId });
  if (!ro.sdfDocument) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不存在');

  return {
    core: ro.sdfDocument.coreJson as Record<string, string>,
    nodes: ro.sdfDocument.nodes.map((n) => ({ nodeType: n.nodeType, content: n.content })),
  };
}

/**
 * 更新 SDFDocument（§16 乐观锁 + P1B-1 合同校验）：
 * validateSdfCore → 同事务更新 core_json + 六 nodes + 审计 `sdf.update`。
 */
export async function updateSdfDocument(
  deps: WorkspaceDeps,
  input: UpdateSdfInput,
  ctx: AuditContext = {},
): Promise<SdfDocumentView> {
  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.roId },
    include: { sdfDocument: { include: { nodes: true } } },
  });
  if (!ro || ro.deletedAt) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
  if (!ro.sdfDocument) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不存在');

  // Every save is a private draft, including edits after a public release.
  const check = validateSdfDraftCore(input.core);
  if (!check.ok) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不符合 core Schema');

  // Saving creates a private history snapshot; createCommit advances the revision once.
  await deps.prisma.$transaction(async (tx) => {
    await lockTrashReferences(tx);
    await tx.$queryRaw`SELECT id FROM research_objects WHERE id = ${ro.id}::uuid FOR UPDATE`;
    const previous = await tx.version.findFirst({ where: { researchObjectId: ro.id, commit: { branch: { isDefault: true } } }, orderBy: { versionNo: 'desc' } });
    const changed = SDF_NODE_TYPES.filter(field => (ro.sdfDocument!.coreJson as Record<string, unknown>)[field] !== input.core[field]);
    const labels: Record<string, string> = { problem: '问题', insight: '洞见', method: '方法', results: '结果', limitations: '边界', reproducibility: '复现' };
    const saved = await createCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: input.version,
      sdfCore: input.core, message: changed.length ? `更新${changed.map(field => labels[field]).join('、')}` : '保存草稿' }, ctx, tx);
    if (previous) {
      await carryVersionEvidence(tx, { researchObjectId: ro.id, previousVersionId: previous.id, versionId: saved.versionId });
      await carryVersionMedia(tx, { researchObjectId: ro.id, previousVersionId: previous.id, versionId: saved.versionId });
    }
    await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: saved.versionId });

    await recordAudit(
      deps, tx,
      {
        actorId: input.userId, action: 'sdf.update', workspaceId: ro.workspaceId,
        targetType: 'research_object', targetId: input.roId, metadata: { version: input.version },
      },
      ctx,
    );
  }, { isolationLevel: 'Serializable' }).catch((error: unknown) => {
    if ((error as { code?: string }).code === 'P2034') throw new ResearchObjectError('CONCURRENT_UPDATE', '版本冲突，请刷新后重试');
    throw error;
  });
  return getSdfDocument(deps, { userId: input.userId, roId: input.roId });
}
