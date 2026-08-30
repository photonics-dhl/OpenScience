import type { AuditContext } from '@openscience/observability';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { recordAudit } from '../workspace/audit';
import type { Prisma, ResearchObject } from '@prisma/client';
import { requireActiveMembership, requireMembership } from '../workspace/helpers';
import { requireRoAccess } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { ResearchObjectError } from './errors';
import { SDF_NODE_TYPES, type RoStatus, type RoVisibility } from './types';

export interface CreateResearchObjectInput {
  workspaceId: string;
  userId: string;
  title: string;
  idempotencyKey?: string;
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

export interface ResearchObjectListItem extends ResearchObjectSummary {
  publicId: string | null;
  updatedAt: Date;
}

/** Dashboard list: only ROs from workspaces where the caller is a member. */
export async function listResearchObjects(
  deps: WorkspaceDeps,
  input: { userId: string; limit?: number },
): Promise<ResearchObjectListItem[]> {
  const rows = await deps.prisma.researchObject.findMany({
    where: { workspace: { members: { some: { userId: input.userId } } } },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 20, 1), 100),
  });
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    version: row.version,
    publicId: row.publicId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/** 空六字段文档（§5.1）。 */
function emptyCore(): Record<string, string> {
  const core: Record<string, string> = { schemaVersion: '0.1.0' };
  for (const field of SDF_CORE_FIELDS) core[field] = '';
  return core;
}

function validateTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized || normalized.length > 200) throw new ResearchObjectError('VALIDATION_ERROR', '标题长度需为 1-200 字符');
  return normalized;
}

function throwIdempotencyConstraintConflict(error: unknown): never {
  if ((error as { code?: unknown })?.code !== 'P2002') throw error;
  throw Object.assign(new Error('Idempotency constraint conflict'), {
    code: 'P2002', openscienceIdempotencyConflict: true, cause: error,
  });
}

async function createResearchObjectRecord(
  deps: WorkspaceDeps,
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    userId: string;
    title: string;
    idempotencyKey?: string;
    core: Record<string, string>;
    auditMetadata?: Record<string, unknown>;
  },
  ctx: AuditContext,
): Promise<ResearchObject> {
  let created: ResearchObject;
  try {
    created = await tx.researchObject.create({
      data: {
        workspaceId: input.workspaceId,
        title: input.title,
        createdBy: input.userId,
        idempotencyKey: input.idempotencyKey,
        sdfDocument: {
          create: {
            coreJson: input.core as object,
            nodes: {
              create: SDF_NODE_TYPES.map((nodeType, i) => ({
                nodeType,
                content: (input.core[nodeType] as string | undefined) ?? '',
                sortOrder: i,
              })),
            },
          },
        },
      },
    });
  } catch (error) {
    if (!input.idempotencyKey) throw error;
    throwIdempotencyConstraintConflict(error);
  }
  await recordAudit(
    deps, tx,
    {
      actorId: input.userId, action: 'research_object.create', workspaceId: input.workspaceId,
      targetType: 'research_object', targetId: created.id,
      metadata: { title: input.title, ...input.auditMetadata },
    },
    ctx,
  );
  return created;
}

/** Server-only RO creation primitive for callers that already own the outer transaction. */
export async function createSystemResearchObjectInTransaction(
  deps: WorkspaceDeps,
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; userId: string; title: string; idempotencyKey: `system:${string}` },
  ctx: AuditContext = {},
): Promise<ResearchObject> {
  if (!input.idempotencyKey.startsWith('system:')) {
    throw new ResearchObjectError('VALIDATION_ERROR', '系统研究对象必须使用保留幂等键');
  }
  await requireActiveMembership(tx, input.workspaceId, input.userId);
  const existing = await tx.researchObject.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.workspaceId !== input.workspaceId || existing.createdBy !== input.userId) {
      throw new ResearchObjectError('FORBIDDEN', '系统研究对象归属不一致');
    }
    return existing;
  }
  return createResearchObjectRecord(deps, tx, {
    ...input,
    title: validateTitle(input.title),
    core: emptyCore(),
    auditMetadata: { system: 'personal-literature' },
  }, ctx);
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
  if (input.idempotencyKey?.startsWith('system:')) {
    throw new ResearchObjectError('VALIDATION_ERROR', '系统保留幂等键不可由公开请求使用');
  }
  const { workspace } = await requireMembership(deps, input.workspaceId, input.userId);
  void workspace;
  const title = validateTitle(input.title);
  const core = input.sdf?.core ?? emptyCore();

  const replayExisting = async () => {
    if (!input.idempotencyKey) return null;
    const existing = await deps.prisma.researchObject.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.workspaceId !== input.workspaceId || existing.createdBy !== input.userId || existing.title !== title) {
        throw new ResearchObjectError('VALIDATION_ERROR', '幂等键已用于其他请求');
      }
      return { id: existing.id, workspaceId: existing.workspaceId, title: existing.title, status: existing.status, visibility: existing.visibility, version: existing.version, createdAt: existing.createdAt };
    }
    return null;
  };
  const replay = await replayExisting();
  if (replay) return replay;

  let ro;
  try {
    ro = await deps.prisma.$transaction((tx) => createResearchObjectRecord(deps, tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      title,
      idempotencyKey: input.idempotencyKey,
      core,
    }, ctx));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002' && input.idempotencyKey) {
      const concurrentReplay = await replayExisting();
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  }

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
