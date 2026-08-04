import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import type { WorkspaceDeps } from '../workspace/types';
import { InAppChannel, type NotificationChannel, type NotificationMessage } from './channels';
import { NotificationError } from './errors';

export type { NotificationChannel, NotificationMessage } from './channels';

export interface NotificationView {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

/**
 * 发通知（§16 事件 → Notification + Q1 消费者幂等依赖事件源）：
 * - 渠道分发：InApp 当前唯一实现；Email §24 占位
 * - 幂等：事件源（PR idempotencyKey）保证不重复触发本函数
 */
export async function notify(
  deps: WorkspaceDeps,
  message: NotificationMessage,
  channels: NotificationChannel[] = [new InAppChannel(deps)],
): Promise<void> {
  for (const channel of channels) {
    await channel.deliver(message);
  }
}

/** 通知列表（§18.1 Dashboard）：仅当前用户（通知私有，非 RO 共享）；未读优先 + 分页。 */
export async function listNotifications(
  deps: WorkspaceDeps,
  input: { userId: string; limit?: number; offset?: number; unreadOnly?: boolean },
): Promise<NotificationView[]> {
  const limit = Math.min(input.limit ?? 50, 100);
  const rows = await deps.prisma.notification.findMany({
    where: { userId: input.userId, ...(input.unreadOnly ? { read: false } : {}) },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
    skip: input.offset ?? 0,
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    read: n.read,
    createdAt: n.createdAt,
  }));
}

/**
 * 标记已读（Q5）：仅本人（他人 → 404 不泄露）+ 幂等（已读 → 成功）+ 审计。
 */
export async function markNotificationRead(
  deps: WorkspaceDeps,
  input: { userId: string; notificationId: string },
  ctx: AuditContext = {},
): Promise<NotificationView> {
  const notif = await deps.prisma.notification.findUnique({ where: { id: input.notificationId } });
  if (!notif || notif.userId !== input.userId) {
    throw new NotificationError('NOTIFICATION_NOT_FOUND', '通知不存在');
  }
  if (!notif.read) {
    await deps.prisma.notification.update({ where: { id: notif.id }, data: { read: true } });
  }
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'notification.read', targetType: 'notification', targetId: notif.id,
    metadata: { idempotent: notif.read },
  }, ctx);
  return {
    id: notif.id,
    type: notif.type,
    payload: (notif.payload ?? {}) as Record<string, unknown>,
    read: true,
    createdAt: notif.createdAt,
  };
}
