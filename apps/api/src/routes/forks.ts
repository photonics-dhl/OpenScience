import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { forkResearchObject, getForkSource } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** forks 路由依赖：AuthDeps + StorageAdapter（assignPublicId 经 ArtifactDeps 用）+ publicIdPrefix（§24）。 */
export type ForkRouteDeps = AuthDeps & { storage: StorageAdapter; publicIdPrefix?: string };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const forkBody = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  licenses: z.object({
    text: z.string().min(1).max(64),
    code: z.string().min(1).max(64),
    data: z.string().min(1).max(64),
  }).optional(),
});

/** 可选会话：来源详情读走 canAccessRo（public 匿名可读，§4.2）。 */
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
 * P1C-5：/forks Fork API（§8.1 来源保留 + §4.2 仅 public 源 + §6.3 许可继承 + §7.1 Blob 共享 + §6.1 unique ID）。
 * POST /research-objects/:id/forks      Fork 到目标 workspace（body: workspaceId/title?/licenses?）
 * GET  /research-objects/:id/fork-source 来源关系详情（只读，§8.1 不可移除）
 */
export function registerForkRoutes(app: FastifyInstance, deps: ForkRouteDeps): void {
  app.post('/research-objects/:id/forks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = forkBody.parse(req.body);
    const result = await forkResearchObject(
      deps,
      {
        sourceResearchObjectId: id,
        userId: user.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        licenses: body.licenses,
        publicIdPrefix: deps.publicIdPrefix ?? 'OSR',
      },
      auditCtx(req),
    );
    return reply.status(201).send({ researchObject: result.researchObject, forkRelation: result.forkRelation });
  });

  app.get('/research-objects/:id/fork-source', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const user = await optionalUser(deps, req);
    const source = await getForkSource(deps, { researchObjectId: id, userId: user?.userId });
    return reply.send({ forkSource: source });
  });
}
