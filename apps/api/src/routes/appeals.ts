import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { createAppeal, listAppeals, resolveAppeal } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** appeals 路由依赖：AuthDeps（仅 prisma）。 */
export type AppealRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

/**
 * P1D-7：/appeals 申诉 API（§11.3 + §3.3 Moderator 队列 + §16 事件）。
 * POST /appeals                提交申诉（versionId + reason）
 * GET  /appeals                列表（moderator 队列 / appellant 自己）
 * POST /appeals/:id/resolve    处理申诉（仅 Moderator/Admin）
 */
export function registerAppealRoutes(app: FastifyInstance, deps: AppealRouteDeps): void {
  app.post('/appeals', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = z.object({ versionId: z.string().uuid(), reason: z.string().min(1).max(2000) }).parse(req.body);
    const appeal = await createAppeal(deps, { versionId: body.versionId, userId: user.userId, reason: body.reason }, auditCtx(req));
    return reply.status(201).send({ appeal });
  });

  app.get('/appeals', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ appeals: await listAppeals(deps, { userId: user.userId }) });
  });

  app.post('/appeals/:id/resolve', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().min(1).max(2000) }).parse(req.body);
    const appeal = await resolveAppeal(deps, { userId: user.userId, appealId: id, decision: body.decision, note: body.note }, auditCtx(req));
    return reply.send({ appeal });
  });
}
