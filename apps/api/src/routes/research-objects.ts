import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  canAccessRo,
  createResearchObject,
  getResearchObject,
  getSdfDocument,
  grantVisibility,
  listResearchObjects,
  requestVisibilityChange,
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
}).strict();
const sdfBody = z.object({
  version: z.number().int().positive(),
  core: z.record(z.string(), z.string()),
});
const publicIdempotencyKey = z.string().min(1).max(200).refine(
  (key) => !key.startsWith('system:'),
  '系统保留幂等键不可由公开请求使用',
).optional();

/** P1B-2：/research-objects + /sdf API 骨架（幂等键 + 乐观锁 + 审计，§16/§17）。 */
export function registerResearchObjectRoutes(app: FastifyInstance, deps: ResearchObjectRouteDeps): void {
  app.get('/research-objects', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    return reply.send({ researchObjects: await listResearchObjects(deps, { userId: user.userId, limit }) });
  });

  app.post('/research-objects', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = createBody.parse(req.body);
    const idempotencyKey = publicIdempotencyKey.parse(req.headers['idempotency-key']);
    const ro = await createResearchObject(
      deps,
      { workspaceId: body.workspaceId, userId: user.userId, title: body.title, sdf: body.sdf, idempotencyKey },
      auditCtx(req),
    );
    return reply.status(201).send({ researchObject: ro });
  });

  app.get('/research-objects/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    // P1B-7：可见性访问判定（§4.2 invite_only grant 非成员可读；private 仅成员）
    const access = await canAccessRo(deps, { researchObjectId: id, userId: user.userId });
    if (access !== 'granted') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '未找到' } });
    }
    return reply.send({ researchObject: await getResearchObject(deps, { userId: user.userId, roId: id }) });
  });

  app.patch('/research-objects/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = updateBody.parse(req.body);
    const updated = await updateResearchObject(
      deps,
      { userId: user.userId, roId: id, version: body.version, patch: { title: body.title, status: body.status } },
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

  // P1B-7：可见性变更（§4.2 扩大需显式审批 → 阻断 + VisibilityRequest）
  app.post('/research-objects/:id/visibility', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = z.object({ toVisibility: z.enum(['private', 'invite_only', 'public']) }).parse(req.body);
    const result = await requestVisibilityChange(
      deps,
      { userId: user.userId, researchObjectId: id, toVisibility: body.toVisibility },
      auditCtx(req),
    );
    return reply.status(result.applied ? 200 : 202).send({ visibility: result });
  });

  // P1B-7：invite_only 指定账户（§4.2）
  app.post('/research-objects/:id/visibility-grants', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = z.object({ granteeId: z.string().uuid() }).parse(req.body);
    await grantVisibility(deps, { userId: user.userId, researchObjectId: id, granteeId: body.granteeId }, auditCtx(req));
    return reply.status(201).send({ granted: true });
  });
}
