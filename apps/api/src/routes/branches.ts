import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import { createBranch, deleteBranch, listBranches, switchBranch } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** branches 路由依赖：AuthDeps（仅 prisma）。 */
export type BranchRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const branchParams = z.object({ id: z.string().uuid(), branchId: z.string().uuid() });
const createBody = z.object({
  name: z.string().min(1).max(64),
  headCommitId: z.string().uuid().optional(),
});

/** 可选会话：列表读走 canAccessRo（public 匿名可读，§4.2）；token 无效/无 → null。 */
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
 * P1C-2：/branches 分支管理 API（§8 概念表 + §2.3 决策 3 可见性继承 + §16 幂等/§17 越权）。
 * GET   /research-objects/:id/branches      列表（含 tipCommit + commitCount；public 匿名可读）
 * POST  /research-objects/:id/branches      创建（可选 headCommitId 起点；仅成员）
 * DELETE /research-objects/:id/branches/:branchId  删除（三规则保护）
 * POST  /research-objects/:id/branches/:branchId/switch  切换（无状态占位，审计）
 */
export function registerBranchRoutes(app: FastifyInstance, deps: BranchRouteDeps): void {
  app.get('/research-objects/:id/branches', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ branches: await listBranches(deps, { researchObjectId: id, userId: user?.userId }) });
  });

  app.post('/research-objects/:id/branches', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = createBody.parse(req.body);
    const branch = await createBranch(
      deps,
      { researchObjectId: id, userId: user.userId, name: body.name, headCommitId: body.headCommitId },
      auditCtx(req),
    );
    return reply.status(201).send({ branch });
  });

  app.delete('/research-objects/:id/branches/:branchId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, branchId } = branchParams.parse(req.params);
    await deleteBranch(deps, { researchObjectId: id, userId: user.userId, branchId }, auditCtx(req));
    return reply.status(204).send();
  });

  app.post('/research-objects/:id/branches/:branchId/switch', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, branchId } = branchParams.parse(req.params);
    const branch = await switchBranch(deps, { researchObjectId: id, userId: user.userId, branchId }, auditCtx(req));
    return reply.send({ branch });
  });
}
