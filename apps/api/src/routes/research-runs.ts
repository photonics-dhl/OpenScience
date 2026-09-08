import type { AuthDeps } from '@openscience/auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHermesResearchRun, getHermesResearchRun, type HermesResearchRunDeps } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const paramsSchema = z.object({ id: z.string().uuid() }).strict();
const readParamsSchema = z.object({ id: z.string().uuid(), runId: z.string().uuid() }).strict();
const createSchema = z.object({ ingestionTaskIds: z.array(z.string().uuid()).min(1).max(20) }).strict();

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export function registerResearchRunRoutes(app: FastifyInstance, deps: HermesResearchRunDeps & AuthDeps): void {
  app.post('/research-objects/:id/hermes-runs', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = paramsSchema.parse(req.params);
    const body = createSchema.parse(req.body);
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const run = await createHermesResearchRun(deps, {
      actorId: user.userId, researchObjectId: id, ingestionTaskIds: body.ingestionTaskIds, idempotencyKey,
    }, auditCtx(req));
    return reply.status(202).send({ run });
  });

  app.get('/research-objects/:id/hermes-runs/:runId', async (req, reply) => {
    void reply.header('Cache-Control', 'private, no-store');
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, runId } = readParamsSchema.parse(req.params);
    return reply.send({ run: await getHermesResearchRun(deps, { actorId: user.userId, researchObjectId: id, runId }) });
  });
}
