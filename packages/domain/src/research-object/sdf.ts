import type { AuditContext } from '@openscience/observability';
import { validateSdfCore } from '@openscience/sdf-schema';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
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

/** 查 SDFDocument（成员 + core + nodes）。 */
export async function getSdfDocument(
  deps: WorkspaceDeps,
  input: { userId: string; roId: string },
): Promise<SdfDocumentView> {
  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.roId },
    include: { sdfDocument: { include: { nodes: true } } },
  });
  if (!ro) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
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
  // 合同校验（P1B-1）：非法 SDF 拒绝
  const check = validateSdfCore(input.core);
  if (!check.ok) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不符合 core Schema');

  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.roId },
    include: { sdfDocument: { include: { nodes: true } } },
  });
  if (!ro) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
  if (!ro.sdfDocument) throw new ResearchObjectError('VALIDATION_ERROR', 'SDF 文档不存在');

  // 乐观锁：RO.version 匹配才更新
  const result = await deps.prisma.$transaction(async (tx) => {
    const updated = await tx.researchObject.updateMany({
      where: { id: input.roId, version: input.version },
      data: { version: input.version + 1 },
    });
    if (updated.count === 0) throw new ResearchObjectError('CONCURRENT_UPDATE', '版本冲突，请刷新后重试');

    // 更新 core_json + 逐字段 nodes（SDF_NODE_TYPES 固定六型）
    await tx.sdfDocument.update({
      where: { researchObjectId: input.roId },
      data: { coreJson: input.core as object },
    });
    for (const nodeType of SDF_NODE_TYPES) {
      await tx.sdfNode.update({
        where: { sdfDocumentId_nodeType: { sdfDocumentId: ro.sdfDocument!.id, nodeType } },
        data: { content: (input.core[nodeType] as string | undefined) ?? '' },
      });
    }

    await recordAudit(
      deps, tx,
      {
        actorId: input.userId, action: 'sdf.update', workspaceId: ro.workspaceId,
        targetType: 'research_object', targetId: input.roId, metadata: { version: input.version },
      },
      ctx,
    );
  });

  void result;
  return getSdfDocument(deps, { userId: input.userId, roId: input.roId });
}
