import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { createAgentSession, getAgentTask, listAgentSessions, listAgentTasks, parseWorkspaceGuidePayload, submitAgentTask, approveApproval, listPendingApprovals, rejectApproval, revokeApproval } from '@openscience/domain';
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
const workspaceGuideTaskBody = z.object({
  sessionId: z.string().uuid(),
  kind: z.literal('workspace.guide'),
  payload: z.unknown().transform((payload, ctx) => {
    try { return parseWorkspaceGuidePayload(payload); }
    catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'workspace.guide payload 无效' });
      return z.NEVER;
    }
  }),
}).strict();
const genericTaskBody = z.object({
  sessionId: z.string().uuid(),
  kind: z.string().min(1).max(64).refine((kind) => kind !== 'workspace.guide'),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value.payload).length > 65_536) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'payload exceeds 64KB' });
});
export const agentTaskBodySchema = z.union([workspaceGuideTaskBody, genericTaskBody]);

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
    const idempotencyKey = req.headers['idempotency-key'];
    const session = await createAgentSession(
      deps,
      {
        userId: user.userId,
        researchObjectId: body.researchObjectId,
        kind: body.kind,
        title: body.title,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ session });
  });

  app.get('/agent/sessions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ sessions: await listAgentSessions(deps, { userId: user.userId }) });
  });

  app.get('/agent/tasks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { actionable, kind } = z.object({ actionable: z.enum(['true', 'false']).default('true'), kind: z.string().min(1).max(64).optional() }).parse(req.query);
    return reply.send({ tasks: await listAgentTasks(deps, { userId: user.userId, actionableOnly: actionable === 'true', kind }) });
  });

  app.post('/agent/tasks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = agentTaskBodySchema.parse(req.body);
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

  // P1D-4：R0-R4 审批（§9.4 + §15 ToolApproval）
  app.get('/agent/approvals/pending', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ approvals: await listPendingApprovals(deps, { userId: user.userId }) });
  });

  app.post('/agent/approvals/:id/approve', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ scopeGrant: z.string().max(200).optional() }).parse(req.body ?? {});
    return reply.send({ approval: await approveApproval(deps, { userId: user.userId, approvalId: id, scopeGrant: body.scopeGrant }, auditCtx(req)) });
  });

  app.post('/agent/approvals/:id/reject', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ approval: await rejectApproval(deps, { userId: user.userId, approvalId: id }, auditCtx(req)) });
  });

  app.post('/agent/approvals/:id/revoke', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ approval: await revokeApproval(deps, { userId: user.userId, approvalId: id }, auditCtx(req)) });
  });
}
