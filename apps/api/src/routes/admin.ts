import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { listAuditLogs } from '@openscience/domain';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** 平台管理接口（最小集）：审计查询仅 platform_admin 可见（P1A-5 platformRole 首个消费方）。 */
export function registerAdminRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/audit-logs', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const row = await deps.prisma.user.findUnique({ where: { id: user.userId } });
    if (row?.platformRole !== 'platform_admin') {
      return reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
    }
    const q = querySchema.parse(req.query);
    return reply.send(
      await listAuditLogs(deps, {
        workspaceId: q.workspaceId,
        action: q.action,
        actorId: q.actorId,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        cursor: q.cursor,
        limit: q.limit,
      }),
    );
  });
}
