import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAgentSession, getAgentTask, submitAgentTask } from '@openscience/domain';
import type { AgentRouteDeps } from './agent';
import { requireCurrentUser } from './session-guard';

const figureAuditBody = z.object({
  presentationStyle: z.string().min(1).max(100).optional(),
  paperSummary: z.string().max(2000).optional(),
}).strict();

const figureAuditParams = z.object({
  researchObjectId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();

export function registerFigureAuditRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  app.post('/research-objects/:researchObjectId/versions/:versionId/presentation-figure-audit', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = figureAuditParams.parse(req.params);
    const body = figureAuditBody.parse(req.body ?? {});
    const session = await createAgentSession(deps, {
      userId: user.userId,
      kind: 'workspace.guide',
      researchObjectId: params.researchObjectId,
    });
    const idempotencyKey = `figure-audit:${params.researchObjectId}:${params.versionId}:${body.presentationStyle ?? 'default'}`;
    const task = await submitAgentTask(deps, {
      sessionId: session.id,
      userId: user.userId,
      kind: 'presentation.figure-audit',
      payload: { ...body, researchObjectId: params.researchObjectId, versionId: params.versionId },
      idempotencyKey,
    });
    return reply.status(202).send({ task, sessionId: session.id });
  });

  app.get('/research-objects/:researchObjectId/versions/:versionId/presentation-figure-audit/:taskId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = z.object({
      researchObjectId: z.string().uuid(),
      versionId: z.string().uuid(),
      taskId: z.string().uuid(),
    }).strict().parse(req.params);
    const task = await getAgentTask(deps, { userId: user.userId, taskId: params.taskId });
    return reply.send({ task });
  });
}
