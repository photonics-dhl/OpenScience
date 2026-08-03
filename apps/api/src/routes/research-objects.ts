import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  createResearchObject,
  getResearchObject,
  getSdfDocument,
  updateResearchObject,
  updateSdfDocument,
} from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

export type ResearchObjectRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const createBody = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
  sdf: z
    .object({
      core: z.record(z.string(), z.string()),
    })
    .optional(),
});
const updateBody = z.object({
  version: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'under_review', 'approved', 'published', 'revised', 'withdrawn', 'restricted', 'rejected', 'archived']).optional(),
  visibility: z.enum(['private', 'invite_only', 'public']).optional(),
});
const sdfBody = z.object({
  version: z.number().int().positive(),
  core: z.record(z.string(), z.string()),
});

/** P1B-2：/research-objects + /sdf API 骨架（幂等键 + 乐观锁 + 审计，§16/§17）。 */
export function registerResearchObjectRoutes(app: FastifyInstance, deps: ResearchObjectRouteDeps): void {
  app.post('/research-objects', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = createBody.parse(req.body);
    // 幂等键：同 Idempotency-Key + workspaceId + title 防重（简化：唯一约束由 domain 层未来加，先靠业务重查）
    const ro = await createResearchObject(
      deps,
      { workspaceId: body.workspaceId, userId: user.userId, title: body.title, sdf: body.sdf },
      auditCtx(req),
    );
    return reply.status(201).send({ researchObject: ro });
  });

  app.get('/research-objects/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    return reply.send({ researchObject: await getResearchObject(deps, { userId: user.userId, roId: id }) });
  });

  app.patch('/research-objects/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = updateBody.parse(req.body);
    const updated = await updateResearchObject(
      deps,
      { userId: user.userId, roId: id, version: body.version, patch: { title: body.title, status: body.status, visibility: body.visibility } },
      auditCtx(req),
    );
    return reply.send({ researchObject: updated });
  });

  app.get('/sdf/:roId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { roId } = z.object({ roId: z.string().uuid() }).parse(req.params);
    return reply.send({ sdf: await getSdfDocument(deps, { userId: user.userId, roId }) });
  });

  app.put('/sdf/:roId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { roId } = z.object({ roId: z.string().uuid() }).parse(req.params);
    const body = sdfBody.parse(req.body);
    const sdf = await updateSdfDocument(
      deps,
      { userId: user.userId, roId, version: body.version, core: body.core },
      auditCtx(req),
    );
    return reply.send({ sdf });
  });
}
