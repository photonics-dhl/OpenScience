import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { listNotifications, markNotificationRead } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

/** notifications 路由依赖：AuthDeps（仅 prisma）。 */
export type NotificationRouteDeps = AuthDeps;

/**
 * P1C-9：/notifications 通知 API（§18.1 Dashboard + §15/§16）。
 * GET /notifications              当前用户通知（未读优先 + 分页）
 * POST /notifications/:id/read    标记已读（仅本人 + 幂等）
 */
export function registerNotificationRoutes(app: FastifyInstance, deps: NotificationRouteDeps): void {
  app.get('/notifications', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const query = z.object({
      unreadOnly: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }).parse(req.query);
    const notifications = await listNotifications(deps, {
      userId: user.userId,
      limit: query.limit,
      offset: query.offset,
      unreadOnly: query.unreadOnly === 'true',
    });
    return reply.send({ notifications });
  });

  app.post('/notifications/:id/read', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const notification = await markNotificationRead(deps, { userId: user.userId, notificationId: id });
    return reply.send({ notification });
  });
}
