import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { createAgentSession, getAgentTask, listAgentSessions, submitAgentTask } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** agent 路由依赖：AuthDeps（含 redis，队列）。 */
export type AgentRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const sessionBody = z.object({
  researchObjectId: z.string().uuid().optional(),
  kind: z.string().min(1).max(64),
  title: z.string().max(200).optional(),
});
const taskBody = z.object({
  sessionId: z.string().uuid(),
  kind: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * P1D-2：/agent Hermes 会话与异步任务 API（§9.3 长任务 + §16 幂等 + §18.3 进度可恢复 + §9.1 配额）。
 * POST /agent/sessions       建会话
 * GET  /agent/sessions       当前用户会话列表
 * POST /agent/tasks          提交异步任务（Idempotency-Key 头；AI Credit 配额校验）
 * GET  /agent/tasks/:id      进度查询（轮询，断线可恢复 §18.3）
 */
export function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  app.post('/agent/sessions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = sessionBody.parse(req.body);
    const session = await createAgentSession(
      deps,
      { userId: user.userId, researchObjectId: body.researchObjectId, kind: body.kind, title: body.title },
      auditCtx(req),
    );
    return reply.status(201).send({ session });
  });

  app.get('/agent/sessions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ sessions: await listAgentSessions(deps, { userId: user.userId }) });
  });

  app.post('/agent/tasks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = taskBody.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'];
    const task = await submitAgentTask(
      deps,
      {
        sessionId: body.sessionId,
        userId: user.userId,
        kind: body.kind,
        payload: body.payload,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ task });
  });

  app.get('/agent/tasks/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ task: await getAgentTask(deps, { userId: user.userId, taskId: id }) });
  });
}
