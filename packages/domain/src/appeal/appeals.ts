import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { notify } from '../notification/notifications';
import type { WorkspaceDeps } from '../workspace/types';
import { AppealError } from './errors';

export interface AppealView {
  id: string;
  versionId: string;
  researchObjectId: string;
  aiReviewId: string;
  appellantId: string;
  reason: string;
  status: string;
  moderatorId: string | null;
  resolution: Record<string, unknown> | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

function toView(row: {
  id: string; versionId: string; researchObjectId: string; aiReviewId: string; appellantId: string;
  reason: string; status: string; moderatorId: string | null; resolution: unknown; createdAt: Date; resolvedAt: Date | null;
}): AppealView {
  return {
    id: row.id, versionId: row.versionId, researchObjectId: row.researchObjectId, aiReviewId: row.aiReviewId,
    appellantId: row.appellantId, reason: row.reason, status: row.status, moderatorId: row.moderatorId,
    resolution: (row.resolution ?? null) as Record<string, unknown> | null, createdAt: row.createdAt, resolvedAt: row.resolvedAt,
  };
}

/**
 * 提交申诉（§11.3 + §15 Appeal + §16 appeal.created）：
 * - 版本存在 + RO 成员（§17）
 * - aiReview 已存在且 blocked（§11.3 审核失败后）
 * - 幂等：同 version 有 pending 申诉 → 拒绝
 * - appeal.created 通知 + 审计
 */
export async function createAppeal(
  deps: WorkspaceDeps,
  input: { versionId: string; userId: string; reason: string },
  ctx: AuditContext = {},
): Promise<AppealView> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 2000) throw new AppealError('NOT_FOUND', '申诉理由需为 1-2000 字符');

  const version = await deps.prisma.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
  if (!version) throw new AppealError('NOT_FOUND', '版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);

  const aiReview = await deps.prisma.aiReview.findUnique({ where: { versionId: input.versionId } });
  if (!aiReview || aiReview.status !== 'blocked') {
    throw new AppealError('REVIEW_NOT_BLOCKED', '仅审核失败（blocked）的版本可申诉（§11.3）');
  }
  // 幂等：同 version 未决申诉去重
  const pending = await deps.prisma.appeal.findFirst({
    where: { versionId: input.versionId, status: 'pending' },
  });
  if (pending) throw new AppealError('ALREADY_PENDING', '该版本已有待处理申诉');

  const appeal = await deps.prisma.appeal.create({
    data: {
      versionId: version.id,
      researchObjectId: version.researchObjectId,
      aiReviewId: aiReview.id,
      appellantId: input.userId,
      reason,
    },
  });
  // §16 appeal.created 事件（P1C-9 通知通道）
  await notify(deps, {
    userId: input.userId,
    type: 'appeal.created',
    payload: { appealId: appeal.id, versionId: version.id, researchObjectId: version.researchObjectId },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'appeal.create', workspaceId: version.researchObject.workspaceId,
    targetType: 'appeal', targetId: appeal.id,
    metadata: { versionId: version.id, aiReviewId: aiReview.id },
  }, ctx);
  return toView(appeal);
}

/**
 * 申诉列表（§3.3 角色隔离）：
 * - moderator/platform_admin：全部（队列）
 * - 普通用户：仅自己的
 */
export async function listAppeals(
  deps: WorkspaceDeps,
  input: { userId: string },
): Promise<AppealView[]> {
  const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new AppealError('NOT_FOUND', '用户不存在');
  const isModerator = user.platformRole === 'moderator' || user.platformRole === 'platform_admin';

  const rows = await deps.prisma.appeal.findMany({
    where: isModerator ? {} : { appellantId: input.userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toView);
}

/**
 * 处理申诉（§3.3 仅 Moderator/Admin + §11.3 人工结果与理由写审计）：
 * pending → resolved/rejected + resolution {decision, note} + 审计
 */
export async function resolveAppeal(
  deps: WorkspaceDeps,
  input: { userId: string; appealId: string; decision: 'approved' | 'rejected'; note: string },
  ctx: AuditContext = {},
): Promise<AppealView> {
  const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || (user.platformRole !== 'moderator' && user.platformRole !== 'platform_admin')) {
    throw new AppealError('FORBIDDEN', '仅 Moderator/Admin 可处理申诉（§3.3）');
  }
  const appeal = await deps.prisma.appeal.findUnique({ where: { id: input.appealId } });
  if (!appeal) throw new AppealError('NOT_FOUND', '申诉不存在');
  if (appeal.status !== 'pending') throw new AppealError('NOT_FOUND', '申诉已处理');

  const nextStatus = input.decision === 'approved' ? 'resolved' : 'rejected';
  const updated = await deps.prisma.appeal.update({
    where: { id: appeal.id },
    data: {
      status: nextStatus,
      moderatorId: input.userId,
      resolution: { decision: input.decision, note: input.note } as never,
      resolvedAt: new Date(),
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'appeal.resolve', targetType: 'appeal', targetId: appeal.id,
    metadata: { versionId: appeal.versionId, decision: input.decision, note: input.note },
  }, ctx);
  return toView(updated);
}
