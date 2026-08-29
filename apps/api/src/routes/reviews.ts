import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import { createReview, listReviews, mergePullRequest, getPublicationReview, runPublicationReview, createAgentSession, submitAgentTask, REVIEW_VERDICTS } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** reviews 路由依赖：AuthDeps + StorageAdapter（assessHighRisk 经许可/作者查询）。 */
export type ReviewRouteDeps = AuthDeps & { storage: StorageAdapter };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const prParams = z.object({ id: z.string().uuid(), prId: z.string().uuid() });
const reviewBody = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  body: z.string().max(20000).optional(),
  items: z.array(z.object({ path: z.string().min(1), kind: z.string().min(1), comment: z.string().min(1) })).optional(),
});
const mergeBody = z.object({ confirmHighRisk: z.boolean() });

/** 可选会话：列表读走 canAccessRo（public 匿名可读，§4.2）。 */
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
 * P1C-8：/reviews Review 与 Merge API（§8.2 逐项评审 + §8.3 Owner/Maintainer Merge + 高风险确认）。
 * POST /research-objects/:id/pull-requests/:prId/reviews   逐项 Review
 * GET  /research-objects/:id/pull-requests/:prId/reviews   列表
 * POST /research-objects/:id/pull-requests/:prId/merge     Merge（body: confirmHighRisk）
 */
export function registerReviewRoutes(app: FastifyInstance, deps: ReviewRouteDeps): void {
  app.post('/research-objects/:id/pull-requests/:prId/reviews', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { prId } = prParams.parse(req.params);
    const body = reviewBody.parse(req.body);
    const review = await createReview(
      deps,
      { prId, userId: user.userId, verdict: body.verdict, body: body.body, items: body.items },
      auditCtx(req),
    );
    return reply.status(201).send({ review });
  });

  app.get('/research-objects/:id/pull-requests/:prId/reviews', async (req, reply) => {
    const { prId } = prParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ reviews: await listReviews(deps, { prId, userId: user?.userId }) });
  });

  app.post('/research-objects/:id/pull-requests/:prId/merge', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { prId } = prParams.parse(req.params);
    const body = mergeBody.parse(req.body);
    const result = await mergePullRequest(
      deps,
      { prId, userId: user.userId, confirmHighRisk: body.confirmHighRisk },
      auditCtx(req),
    );
    return reply.send({ merge: result });
  });

  // P1D-5/6：发布审核（§11.1 硬阻断 + §11.2 警告层）
  app.post('/versions/:versionId/review', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { versionId } = z.object({ versionId: z.string().uuid() }).parse(req.params);
    // 同步：七类硬阻断（§11.1）
    const review = await runPublicationReview(deps, { versionId, userId: user.userId }, auditCtx(req));
    // 异步：异步入队 review.analyze（§11.2 警告层，不阻断）
    void (async () => {
      try {
        const version = await deps.prisma.version.findUnique({ where: { id: versionId }, include: { manifest: true } });
        if (!version) return;
        const coreText = JSON.stringify(version?.manifest?.coreJson ?? {});
        const session = await createAgentSession(deps, {
          userId: user.userId, researchObjectId: version.researchObjectId, kind: 'review',
        });
        await submitAgentTask(deps, { sessionId: session.id, userId: user.userId, kind: 'review.analyze', payload: { versionId, coreText } });
      } catch { /* 异步分析失败不阻塞审核响应 */ }
    })();
    return reply.send({ review });
  });

  app.get('/versions/:versionId/review', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { versionId } = z.object({ versionId: z.string().uuid() }).parse(req.params);
    return reply.send({ review: await getPublicationReview(deps, { versionId, userId: user.userId }) });
  });
}
