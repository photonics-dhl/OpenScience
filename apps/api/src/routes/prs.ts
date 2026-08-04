import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { createPullRequest, getPullRequest, listPullRequests, CREDIT_ROLES } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** pull-requests 路由依赖：AuthDeps + StorageAdapter（compareVersions 元数据 diff）。 */
export type PrRouteDeps = AuthDeps & { storage: StorageAdapter };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const prParams = z.object({ id: z.string().uuid(), prId: z.string().uuid() });

const contributor = z.object({ userId: z.string().uuid(), creditRole: z.array(z.enum(CREDIT_ROLES)).min(1) });
const createBody = z.object({
  sourceBranchId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(20000).optional(),
  // §8.2 全声明
  changedSdfFields: z.array(z.string().min(1)).min(1),
  changedFiles: z.array(z.string().min(1)).min(1),
  changesMethod: z.boolean(),
  changesData: z.boolean(),
  changesConclusion: z.boolean(),
  newContributors: z.array(contributor).min(1),
  dataLicense: z.string().min(1).max(64),
  codeLicense: z.string().min(1).max(64),
  conflictOfInterest: z.string().min(1).max(500),
  autoChecks: z.record(z.string(), z.unknown()).default({}),
  requestsRelease: z.boolean(),
});

/** 可选会话：列表/详情读走 canAccessRo（public 匿名可读，§4.2）。 */
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
 * P1C-6：/pull-requests PR API（§8.2 全声明 + §16 幂等/事件 + §7.3 diff + §4.2 可见性）。
 * POST /research-objects/:id/pull-requests      创建（§8.2 强制校验；Idempotency-Key 头）
 * GET  /research-objects/:id/pull-requests      列表（?status= 过滤）
 * GET  /research-objects/:id/pull-requests/:prId 详情 + 分支 diff
 */
export function registerPrRoutes(app: FastifyInstance, deps: PrRouteDeps): void {
  app.post('/research-objects/:id/pull-requests', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = createBody.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'];
    const pr = await createPullRequest(
      deps,
      {
        researchObjectId: id,
        userId: user.userId,
        sourceBranchId: body.sourceBranchId,
        targetBranchId: body.targetBranchId,
        title: body.title,
        body: body.body,
        changedSdfFields: body.changedSdfFields,
        changedFiles: body.changedFiles,
        changesMethod: body.changesMethod,
        changesData: body.changesData,
        changesConclusion: body.changesConclusion,
        newContributors: body.newContributors,
        dataLicense: body.dataLicense,
        codeLicense: body.codeLicense,
        conflictOfInterest: body.conflictOfInterest,
        autoChecks: body.autoChecks,
        requestsRelease: body.requestsRelease,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ pullRequest: pr });
  });

  app.get('/research-objects/:id/pull-requests', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const query = z.object({ status: z.enum(['open', 'merged', 'rejected']).optional() }).parse(req.query);
    const user = await optionalUser(deps, req);
    return reply.send({ pullRequests: await listPullRequests(deps, { researchObjectId: id, userId: user?.userId, status: query.status }) });
  });

  app.get('/research-objects/:id/pull-requests/:prId', async (req, reply) => {
    const { id, prId } = prParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ pullRequest: await getPullRequest(deps, { researchObjectId: id, userId: user?.userId, prId }) });
  });
}
