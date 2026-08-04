import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import type { WorkspaceDeps } from '../workspace/types';
import { ApprovalError } from './errors';

export type ApprovalLevel = 0 | 1 | 2 | 3 | 4;
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

/** 状态机合法迁移（§9.4 审批生命周期）。 */
const ALLOWED: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'revoked'],
  approved: ['revoked'],
  rejected: [],
  revoked: [],
};

/**
 * 审批分级判定（§9.4，纯函数）：
 * R0 读自动 / R1 可撤销草稿批量 / R2 协作写入任务内同类 / R3 高影响摘要确认 / R4 危险逐项。
 * 未知 action → R3 安全默认。
 */
const LEVEL_0 = new Set(['read', 'get', 'list', 'search']);
const LEVEL_1 = new Set(['sdf.suggest.apply', 'draft.edit']);
const LEVEL_2 = new Set(['commit.create', 'issue.create', 'issue.comment', 'pr.create', 'review.create', 'agent.task.submit']);
const LEVEL_3 = new Set([
  'merge.pull_request', 'authorship.set', 'license.upsert', 'visibility.change',
  'version.publish', 'fork.create', 'pr.merge', 'notification.send',
]);
const LEVEL_4 = new Set(['ro.delete', 'ownership.transfer', 'secret.update', 'security.settings']);

export function approvalLevel(action: string): ApprovalLevel {
  if (LEVEL_0.has(action)) return 0;
  if (LEVEL_1.has(action)) return 1;
  if (LEVEL_2.has(action)) return 2;
  if (LEVEL_3.has(action)) return 3;
  if (LEVEL_4.has(action)) return 4;
  return 3; // 未知 → R3 安全默认
}

/** 五要素确认说明（§9.4 每次确认必须说明）。 */
export interface ConfirmationSpec {
  what: string;       // 将改变什么
  scope: string;      // 作用范围
  reversible: string; // 能否撤销
  estCost: string;    // 预计费用
  estTime: string;    // 预计耗时
}

/** 五要素生成（i18n 模板；中文优先 §2.5 决策 5）。 */
export function buildConfirmation(action: string, ctx: { title?: string; targetId?: string } = {}): ConfirmationSpec {
  const level = approvalLevel(action);
  return {
    what: `${action}${ctx.title ? `「${ctx.title}」` : ''}`,
    scope: level === 2 ? '当前任务内同类操作' : level >= 3 ? '本次操作（含相关副作用）' : '仅本次变更',
    reversible: level >= 4 ? '不可撤销，需重新验证' : '可撤销（草稿/回滚）',
    estCost: '预计消耗少量 AI Credit',
    estTime: level >= 3 ? '预计 30 秒内' : '即时',
  };
}

export interface ApprovalView {
  id: string;
  taskId: string;
  level: ApprovalLevel;
  scope: string;
  status: ApprovalStatus;
  prompt: Record<string, unknown>;
  approvedBy: string | null;
  createdAt: Date;
  /** §9.4 五要素 */
  confirmation: ConfirmationSpec;
}

export interface CreateApprovalInput {
  taskId: string;
  action: string;
  scope?: string;
  prompt?: Record<string, unknown>;
  title?: string;
}

/**
 * 创建审批（§9.4 + §15 ToolApproval）：
 * - level 0 自动执行 → 不建审批
 * - 同 task+scope 已 approved → 返回既有（同批去重，§9.4 不重复弹窗）
 */
export async function createApproval(
  deps: WorkspaceDeps,
  input: CreateApprovalInput,
  ctx: AuditContext = {},
): Promise<ApprovalView | null> {
  const level = approvalLevel(input.action);
  if (level === 0) return null; // R0 自动执行

  // 同批去重：同 task+scope 已 approved → 返回既有（不再弹窗）
  const existing = await deps.prisma.toolApproval.findFirst({
    where: { taskId: input.taskId, scope: input.scope ?? '', status: 'approved' },
  });
  if (existing) return toView(existing, input.action, level);

  const row = await deps.prisma.toolApproval.create({
    data: {
      taskId: input.taskId,
      level: String(level),
      scope: input.scope ?? '',
      prompt: (input.prompt ?? { action: input.action, ...(input.title ? { title: input.title } : {}) }) as never,
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: null, action: 'approval.create', targetType: 'tool_approval', targetId: row.id,
    metadata: { taskId: input.taskId, level, scope: input.scope ?? '' },
  }, ctx);
  return toView(row, input.action, level);
}

async function requireOwner(deps: WorkspaceDeps, approvalId: string, userId: string): Promise<{ id: string; status: string; taskId: string }> {
  const approval = await deps.prisma.toolApproval.findUnique({
    where: { id: approvalId },
    include: { task: { include: { session: true } } },
  });
  if (!approval) throw new ApprovalError('NOT_FOUND', '审批不存在');
  const ownerId = approval.task?.session?.userId;
  if (!ownerId || ownerId !== userId) throw new ApprovalError('FORBIDDEN', '仅任务所有者可处理审批');
  return { id: approval.id, status: approval.status, taskId: approval.taskId };
}

function transition(status: ApprovalStatus, next: ApprovalStatus): void {
  if (status === next) return; // 幂等
  if (!(ALLOWED[status] ?? []).includes(next)) {
    throw new ApprovalError('ILLEGAL_TRANSITION', `审批状态 ${status} → ${next} 非法`);
  }
}

/** 批准（§9.4）：owner 校验 + pending→approved + 审计；scopeGrant 记录 R2 作用域授权。 */
export async function approveApproval(
  deps: WorkspaceDeps,
  input: { userId: string; approvalId: string; scopeGrant?: string },
  ctx: AuditContext = {},
): Promise<ApprovalView> {
  const { id, status, taskId } = await requireOwner(deps, input.approvalId, input.userId);
  transition(status as ApprovalStatus, 'approved');
  const row = await deps.prisma.toolApproval.update({
    where: { id },
    data: { status: 'approved', approvedBy: input.userId, scope: input.scopeGrant ?? undefined },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'approval.approve', targetType: 'tool_approval', targetId: id,
    metadata: { taskId, scopeGrant: input.scopeGrant ?? null },
  }, ctx);
  return toView(row, 'approved', Number(row.level) as ApprovalLevel);
}

/** 拒绝（§9.4）。 */
export async function rejectApproval(
  deps: WorkspaceDeps,
  input: { userId: string; approvalId: string },
  ctx: AuditContext = {},
): Promise<ApprovalView> {
  const { id, status, taskId } = await requireOwner(deps, input.approvalId, input.userId);
  transition(status as ApprovalStatus, 'rejected');
  const row = await deps.prisma.toolApproval.update({ where: { id }, data: { status: 'rejected' } });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'approval.reject', targetType: 'tool_approval', targetId: id,
    metadata: { taskId },
  }, ctx);
  return toView(row, 'rejected', Number(row.level) as ApprovalLevel);
}

/** 撤销（§2.5-7 撤销）：approved → revoked。 */
export async function revokeApproval(
  deps: WorkspaceDeps,
  input: { userId: string; approvalId: string },
  ctx: AuditContext = {},
): Promise<ApprovalView> {
  const { id, status, taskId } = await requireOwner(deps, input.approvalId, input.userId);
  transition(status as ApprovalStatus, 'revoked');
  const row = await deps.prisma.toolApproval.update({ where: { id }, data: { status: 'revoked' } });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'approval.revoke', targetType: 'tool_approval', targetId: id,
    metadata: { taskId },
  }, ctx);
  return toView(row, 'revoked', Number(row.level) as ApprovalLevel);
}

/** 当前用户待审批列表（§2.5-7 批量预览）。 */
export async function listPendingApprovals(
  deps: WorkspaceDeps,
  input: { userId: string },
): Promise<ApprovalView[]> {
  const tasks = await deps.prisma.agentTask.findMany({
    where: { session: { userId: input.userId }, approvals: { some: { status: 'pending' } } },
    include: { approvals: { where: { status: 'pending' } } },
  });
  const views: ApprovalView[] = [];
  for (const t of tasks) {
    for (const a of t.approvals) {
      views.push(toView(a, 'pending', Number(a.level) as ApprovalLevel));
    }
  }
  return views;
}

function toView(row: {
  id: string; taskId: string; level: string; scope: string; status: string;
  prompt: unknown; approvedBy: string | null; createdAt: Date;
}, action: string, level: ApprovalLevel): ApprovalView {
  return {
    id: row.id, taskId: row.taskId, level, scope: row.scope, status: row.status as ApprovalStatus,
    prompt: (row.prompt ?? {}) as Record<string, unknown>,
    approvedBy: row.approvedBy, createdAt: row.createdAt,
    confirmation: buildConfirmation(action, { title: (row.prompt as Record<string, unknown>)?.title as string | undefined }),
  };
}
