import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import { addContribution, getAuthorChangeInfo, listAuthors, listContributions, setAuthors, CREDIT_ROLES } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** authors 路由依赖：AuthDeps（仅 prisma）。 */
export type AuthorRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const authorsBody = z.object({
  authors: z.array(z.object({ userId: z.string().uuid(), isCorresponding: z.boolean().optional() })).max(50),
});
const contributionBody = z.object({ creditRole: z.enum(CREDIT_ROLES) });

/** 可选会话：读走 canAccessRo（public 匿名可读，§4.2）。 */
async function optionalUser(deps: AuthDeps, req: FastifyRequest): Promise<{ userId: string } | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  try {
    const user = await getCurrentUser(deps, token);
    return user ? { userId: user.userId } : null;
  } catch {
    return null;
  }
}

/**
 * P1C-7：/authors 作者与贡献 API（§3.4 + §2.3 决策 2 + §4.2 可见性）。
 * GET  /research-objects/:id/authors           作者列表（作者组决定顺序，无自动排序）
 * PUT  /research-objects/:id/authors           全量替换（仅作者组，通讯至多一人）
 * POST /research-objects/:id/contributions     追加事实贡献（append-only，§3.4 不可抹除）
 * GET  /research-objects/:id/contributions     贡献列表
 * GET  /research-objects/:id/author-change-info Merge 高风险审批查询（P1C-8 用）
 */
export function registerAuthorRoutes(app: FastifyInstance, deps: AuthorRouteDeps): void {
  app.get('/research-objects/:id/authors', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ authors: await listAuthors(deps, { researchObjectId: id, userId: user?.userId }) });
  });

  app.put('/research-objects/:id/authors', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = authorsBody.parse(req.body);
    const authors = await setAuthors(deps, { researchObjectId: id, userId: user.userId, authors: body.authors }, auditCtx(req));
    return reply.send({ authors });
  });

  app.post('/research-objects/:id/contributions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = contributionBody.parse(req.body);
    const contribution = await addContribution(
      deps,
      { researchObjectId: id, userId: user.userId, creditRole: body.creditRole },
      auditCtx(req),
    );
    return reply.status(201).send({ contribution });
  });

  app.get('/research-objects/:id/contributions', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ contributions: await listContributions(deps, { researchObjectId: id, userId: user?.userId }) });
  });

  app.get('/research-objects/:id/author-change-info', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    return reply.send({ info: await getAuthorChangeInfo(deps, { researchObjectId: id, userId: user.userId }) });
  });
}
