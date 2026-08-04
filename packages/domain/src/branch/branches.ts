import type { AuditContext, AuditEvent } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { canAccessRo } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { BranchError } from './errors';

/** 非事务审计写（deps.audit 缺省 no-op）。分支操作均为单写，无需事务。 */
function audit(deps: WorkspaceDeps, event: Omit<AuditEvent, 'requestId' | 'ip'>, ctx: AuditContext): void {
  void deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip });
}

/** git 风格分支名：字母数字开头，可含 . _ / -，最长 64（§16 幂等：name 唯一即幂等）。 */
export const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,63}$/;

export interface BranchTip {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  /** 该分支最近一次 Commit（P1B-4 无显式 tip 字段，由 Commit.branchId 推导，§8）。 */
  tipCommit: { id: string; message: string; createdAt: Date } | null;
  commitCount: number;
}

export type BranchDetail = BranchTip;

export interface CreateBranchInput {
  researchObjectId: string;
  userId: string;
  name: string;
  /** 可选：分支起点 Commit（必须属于同一 RO，§21.2 步骤 11 Fork 后建分支前置）。 */
  headCommitId?: string;
}

export interface DeleteBranchInput {
  researchObjectId: string;
  userId: string;
  branchId: string;
}

export interface SwitchBranchInput {
  researchObjectId: string;
  userId: string;
  branchId: string;
}

function assertValidName(name: string): void {
  if (!BRANCH_NAME_PATTERN.test(name)) {
    throw new BranchError('VALIDATION_ERROR', '分支名需以字母/数字开头，仅含字母数字 . _ / -，最长 64 字符');
  }
}

/** 分支存在性 + 归属同一 RO。不存在/不属于 → RESEARCH_OBJECT_NOT_FOUND（§17 不泄露）。 */
async function requireBranch(
  deps: WorkspaceDeps,
  researchObjectId: string,
  branchId: string,
): Promise<{ branch: { id: string; name: string; isDefault: boolean; createdAt: Date } }> {
  const branch = await deps.prisma.branch.findFirst({ where: { id: branchId, researchObjectId } });
  if (!branch) throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '分支不存在');
  return { branch };
}

function toTip(row: {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  commits: Array<{ id: string; message: string; createdAt: Date }>;
  _count: { commits: number };
}): BranchTip {
  const tip = row.commits[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    tipCommit: tip ? { id: tip.id, message: tip.message, createdAt: tip.createdAt } : null,
    commitCount: row._count.commits,
  };
}

/**
 * 创建分支（§8 概念表 + §2.3 决策 3 可见性继承 + §17 越权防护 + §16 幂等）：
 * - 写权限：requireMembership（仅空间成员，非成员 → 404）
 * - 可见性继承：分支无自有 visibility，访问判定完全由 RO 承担（canAccessRo）
 * - 幂等：@@unique([roId, name]) —— 同名重发 → NAME_EXISTS（拒绝而非重复建）
 * - headCommitId：可选起点（必须同一 RO），供 Fork 分支（§21.2 步骤 11）锚定
 */
export async function createBranch(
  deps: WorkspaceDeps,
  input: CreateBranchInput,
  ctx: AuditContext = {},
): Promise<BranchDetail> {
  assertValidName(input.name);

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  if (input.headCommitId) {
    const head = await deps.prisma.commit.findUnique({ where: { id: input.headCommitId } });
    if (!head || head.researchObjectId !== ro.id) {
      throw new BranchError('CROSS_RO_COMMIT', '分支起点 Commit 不属于该研究对象');
    }
  }

  const row = await deps.prisma.branch
    .create({
      data: { researchObjectId: ro.id, name: input.name, isDefault: false, headCommitId: input.headCommitId },
      include: { commits: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { commits: true } } },
    })
    .catch((e: unknown) => {
      // P2002 = @@unique([roId, name]) 冲突（§16 幂等：同名重发拒绝）
      if (typeof (e as { code?: unknown })?.code === 'string' && (e as { code: string }).code === 'P2002') {
        throw new BranchError('NAME_EXISTS', '分支已存在', e);
      }
      throw e;
    });

  audit(deps, {
    actorId: input.userId, action: 'branch.create', workspaceId: ro.workspaceId,
    targetType: 'branch', targetId: row.id,
    metadata: { researchObjectId: ro.id, name: row.name, headCommitId: input.headCommitId ?? null },
  }, ctx);

  return toTip(row);
}

/**
 * 分支列表（§4.2 可见性继承）：读权限 = canAccessRo（public 公众可读；private/invite_only 成员或 grant）。
 */
export async function listBranches(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<BranchTip[]> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const rows = await deps.prisma.branch.findMany({
    where: { researchObjectId: input.researchObjectId },
    include: { commits: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { commits: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toTip);
}

/**
 * 删除分支（§3.4 不可抹除 + §8.2 引用保护）：三规则全开——
 * 1. isDefault 禁删（主分支常驻）
 * 2. 有 Commit 禁删（Commit.branchId Restrict 数据层兜底）
 * 3. 被 PR 引用（source/target）禁删（Restrict 兜底）
 * 写权限：requireMembership（§17 越权 → 404）。
 */
export async function deleteBranch(
  deps: WorkspaceDeps,
  input: DeleteBranchInput,
  ctx: AuditContext = {},
): Promise<void> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const { branch } = await requireBranch(deps, ro.id, input.branchId);

  if (branch.isDefault) throw new BranchError('DEFAULT_BRANCH', '主分支不可删除');

  const commitCount = await deps.prisma.commit.count({ where: { branchId: branch.id } });
  if (commitCount > 0) throw new BranchError('BRANCH_HAS_COMMITS', '已有提交的分支不可删除（§3.4 不可抹除）');

  const prCount = await deps.prisma.pullRequest.count({
    where: { OR: [{ sourceBranchId: branch.id }, { targetBranchId: branch.id }] },
  });
  if (prCount > 0) throw new BranchError('BRANCH_IN_USE', '被 Pull Request 引用的分支不可删除');

  await deps.prisma.branch.delete({ where: { id: branch.id } });
  audit(deps, {
    actorId: input.userId, action: 'branch.delete', workspaceId: ro.workspaceId,
    targetType: 'branch', targetId: branch.id,
    metadata: { researchObjectId: ro.id, name: branch.name },
  }, ctx);
}

/**
 * 分支切换（Q5 决策：无状态占位）。MVP 阶段「当前分支」= 下次 commit 的 branchId，
 * 服务端不存 RO.currentBranchId；本函数校验存在性 + 归属 + 写审计，返回目标分支详情。
 */
export async function switchBranch(
  deps: WorkspaceDeps,
  input: SwitchBranchInput,
  ctx: AuditContext = {},
): Promise<BranchDetail> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const row = await deps.prisma.branch.findFirst({
    where: { id: input.branchId, researchObjectId: ro.id },
    include: { commits: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { commits: true } } },
  });
  if (!row) throw new BranchError('RESEARCH_OBJECT_NOT_FOUND', '分支不存在');

  audit(deps, {
    actorId: input.userId, action: 'branch.switch', workspaceId: ro.workspaceId,
    targetType: 'branch', targetId: row.id,
    metadata: { researchObjectId: ro.id, name: row.name },
  }, ctx);

  return toTip(row);
}
