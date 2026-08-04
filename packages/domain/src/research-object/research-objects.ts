import type { AuditContext } from '@openscience/observability';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { recordAudit } from '../workspace/audit';
import { requireMembership } from '../workspace/helpers';
import { requireRoAccess } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { ResearchObjectError } from './errors';
import { SDF_NODE_TYPES, type RoStatus, type RoVisibility } from './types';

export interface CreateResearchObjectInput {
  workspaceId: string;
  userId: string;
  title: string;
  /** 可选初始 SDF core（缺省用空六字段文档）。 */
  sdf?: {
    core: Record<string, string>;
  };
}

export interface ResearchObjectSummary {
  id: string;
  workspaceId: string;
  title: string;
  status: RoStatus;
  visibility: RoVisibility;
  version: number;
  createdAt: Date;
}

export interface ResearchObjectDetail extends ResearchObjectSummary {
  sdf: { core: Record<string, string>; nodes: Array<{ nodeType: string; content: string }> };
}

/** 空六字段文档（§5.1）。 */
function emptyCore(): Record<string, string> {
  const core: Record<string, string> = { schemaVersion: '0.1.0' };
  for (const field of SDF_CORE_FIELDS) core[field] = '';
  return core;
}

/**
 * 在个人 Workspace 创建私有 RO（验收步骤 2）：
 * 同事务建 RO + SDFDocument（core_json）+ 六 SDFNode + 审计（§17）。
 * 非成员 → 404（requireMembership 统一语义）。
 */
export async function createResearchObject(
  deps: WorkspaceDeps,
  input: CreateResearchObjectInput,
  ctx: AuditContext = {},
): Promise<ResearchObjectSummary> {
  const { workspace } = await requireMembership(deps, input.workspaceId, input.userId);
  void workspace;
  const title = input.title.trim();
  if (!title || title.length > 200) throw new ResearchObjectError('VALIDATION_ERROR', '标题长度需为 1-200 字符');
  const core = input.sdf?.core ?? emptyCore();

  const ro = await deps.prisma.$transaction(async (tx) => {
    const created = await tx.researchObject.create({
      data: {
        workspaceId: input.workspaceId,
        title,
        createdBy: input.userId,
        sdfDocument: {
          create: {
            coreJson: core as object,
            nodes: {
              create: SDF_NODE_TYPES.map((nodeType, i) => ({
                nodeType,
                content: (core[nodeType] as string | undefined) ?? '',
                sortOrder: i,
              })),
            },
          },
        },
      },
    });
    await recordAudit(
      deps, tx,
      {
        actorId: input.userId, action: 'research_object.create', workspaceId: input.workspaceId,
        targetType: 'research_object', targetId: created.id, metadata: { title },
      },
      ctx,
    );
    return created;
  });

  return { id: ro.id, workspaceId: ro.workspaceId, title: ro.title, status: ro.status, visibility: ro.visibility, version: ro.version, createdAt: ro.createdAt };
}

export interface UpdateResearchObjectInput {
  userId: string;
  roId: string;
  /** 乐观锁版本（§16）：必须匹配当前 version，否则 CONCURRENT_UPDATE。 */
  version: number;
  patch: {
    title?: string;
    status?: RoStatus;
    visibility?: RoVisibility;
  };
}

/** 乐观锁更新 RO（§16）：updateMany where id+version → count 0 = 并发冲突 409。写审计。 */
export async function updateResearchObject(
  deps: WorkspaceDeps,
  input: UpdateResearchObjectInput,
  ctx: AuditContext = {},
): Promise<ResearchObjectSummary> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.roId } });
  if (!ro) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const patch: { title?: string; status?: RoStatus; visibility?: RoVisibility } = {};
  if (input.patch.title !== undefined) {
    const t = input.patch.title.trim();
    if (!t || t.length > 200) throw new ResearchObjectError('VALIDATION_ERROR', '标题长度需为 1-200 字符');
    patch.title = t;
  }
  if (input.patch.status !== undefined) patch.status = input.patch.status;
  if (input.patch.visibility !== undefined) patch.visibility = input.patch.visibility;

  const result = await deps.prisma.$transaction(async (tx) => {
    const updated = await tx.researchObject.updateMany({
      where: { id: input.roId, version: input.version },
      data: { ...patch, version: input.version + 1 },
    });
    if (updated.count === 0) throw new ResearchObjectError('CONCURRENT_UPDATE', '版本冲突，请刷新后重试');
    await recordAudit(
      deps, tx,
      {
        actorId: input.userId, action: 'research_object.update', workspaceId: ro.workspaceId,
        targetType: 'research_object', targetId: input.roId, metadata: { version: input.version, ...patch },
      },
      ctx,
    );
    return tx.researchObject.findUnique({ where: { id: input.roId } });
  });

  if (!result) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  return { id: result.id, workspaceId: result.workspaceId, title: result.title, status: result.status, visibility: result.visibility, version: result.version, createdAt: result.createdAt };
}

/** 查 RO 详情（可见性判定 §4.2：成员/invite_only grant/public 可读 + SDFDocument + nodes）。非成员且非 grant → 404。 */
export async function getResearchObject(
  deps: WorkspaceDeps,
  input: { userId: string; roId: string },
): Promise<ResearchObjectDetail> {
  const ro = await deps.prisma.researchObject.findUnique({
    where: { id: input.roId },
    include: { sdfDocument: { include: { nodes: true } } },
  });
  if (!ro) throw new ResearchObjectError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  // 权限（P1B-7）：可见性判定（§4.2），invite_only grant 非成员可读；跨 Workspace 越权 → 404
  await requireRoAccess(deps, { researchObjectId: input.roId, userId: input.userId });

  const core = (ro.sdfDocument?.coreJson as Record<string, string>) ?? {};
  return {
    id: ro.id,
    workspaceId: ro.workspaceId,
    title: ro.title,
    status: ro.status,
    visibility: ro.visibility,
    version: ro.version,
    createdAt: ro.createdAt,
    sdf: {
      core,
      nodes: (ro.sdfDocument?.nodes ?? []).map((n) => ({ nodeType: n.nodeType, content: n.content })),
    },
  };
}
