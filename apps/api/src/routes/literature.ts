import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { submitLiteratureAcquisition } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import type { AgentRouteDeps } from './agent';
import { requireCurrentUser } from './session-guard';

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const personalTarget = z.object({ kind: z.literal('personal') }).strict();
const researchObjectTarget = z.object({
  kind: z.literal('research_object'),
  researchObjectId: z.string().uuid(),
}).strict();

/** The only browser contract for source retrieval: strategy and credentials are server-owned. */
export const literatureAcquisitionBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  identifier: z.string().trim().min(1).max(300).optional(),
  target: z.discriminatedUnion('kind', [personalTarget, researchObjectTarget]),
}).strict();

export function registerLiteratureRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  app.post('/literature/acquisitions', { bodyLimit: 4 * 1024 }, async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const idempotencyKey = z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
    const body = literatureAcquisitionBodySchema.parse(req.body);
    const acquisition = await submitLiteratureAcquisition(deps, {
      userId: user.userId,
      idempotencyKey,
      ...body,
    }, auditCtx(req));
    return reply.status(202).send(acquisition);
  });
}
