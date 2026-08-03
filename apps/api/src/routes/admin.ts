import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps, CurrentUser } from '@openscience/auth';
import { listAuditLogs } from '@openscience/domain';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z
    .string()
    .max(128)
    .refine(
      (c) => {
        const i = c.indexOf('|');
        return i > 0 && i < c.length - 1 && !Number.isNaN(new Date(c.slice(0, i)).getTime());
      },
      { message: 'cursor 格式应为 <createdAtISO>|<id>' },
    )
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** P1A-7：统一 admin 守卫。已登录非 platform_admin → 403；未登录由 requireCurrentUser 回 401。返回 admin 用户或 null。 */
export async function requirePlatformAdmin(
  deps: AuthDeps,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<CurrentUser | null> {
  const user = await requireCurrentUser(deps, req, reply);
  if (!user) return null;
  const row = await deps.prisma.user.findUnique({ where: { id: user.userId } });
  if (row?.platformRole !== 'platform_admin') {
    void reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
    return null;
  }
  return user;
}

/** 平台管理接口（最小集）：审计查询仅 platform_admin 可见（P1A-5 platformRole 首个消费方）。 */
export function registerAdminRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/audit-logs', async (req, reply) => {
    if (!(await requirePlatformAdmin(deps, req, reply))) return;
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
