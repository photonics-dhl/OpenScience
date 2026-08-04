import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import { createComment, createIssue, getIssue, listIssues, updateIssueStatus, ISSUE_KINDS, ISSUE_STATUSES } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser, sessionTokenFrom } from './session-guard';

/** issues 路由依赖：AuthDeps（仅 prisma）。 */
export type IssueRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const roIdParams = z.object({ id: z.string().uuid() });
const issueParams = z.object({ id: z.string().uuid(), issueId: z.string().uuid() });
const createBody = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(ISSUE_KINDS),
  body: z.string().max(20000).optional(),
});
const statusBody = z.object({ status: z.enum(ISSUE_STATUSES) });
const commentBody = z.object({
  body: z.string().min(1).max(20000),
  issueId: z.string().uuid().optional(),
  prId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
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
 * P1C-3：/issues 评论交互 API（§8 概念表 + §2.5 决策 4 + §15 Comment 多态 + §16 幂等 + §17 审计/越权）。
 * POST  /research-objects/:id/issues                  创建 Issue
 * GET   /research-objects/:id/issues                  列表（?kind=&status= 过滤，public 匿名可读）
 * GET   /research-objects/:id/issues/:issueId         详情 + 评论
 * PATCH /research-objects/:id/issues/:issueId         状态流转（open/closed）
 * POST  /research-objects/:id/issues/:issueId/comments 回复 Issue
 */
export function registerIssueRoutes(app: FastifyInstance, deps: IssueRouteDeps): void {
  app.post('/research-objects/:id/issues', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = roIdParams.parse(req.params);
    const body = createBody.parse(req.body);
    const issue = await createIssue(
      deps,
      { researchObjectId: id, userId: user.userId, title: body.title, kind: body.kind, body: body.body },
      auditCtx(req),
    );
    return reply.status(201).send({ issue });
  });

  app.get('/research-objects/:id/issues', async (req, reply) => {
    const { id } = roIdParams.parse(req.params);
    const query = z.object({ kind: z.enum(ISSUE_KINDS).optional(), status: z.enum(ISSUE_STATUSES).optional() }).parse(req.query);
    const user = await optionalUser(deps, req);
    return reply.send({ issues: await listIssues(deps, { researchObjectId: id, userId: user?.userId, kind: query.kind, status: query.status }) });
  });

  app.get('/research-objects/:id/issues/:issueId', async (req, reply) => {
    const { id, issueId } = issueParams.parse(req.params);
    const user = await optionalUser(deps, req);
    return reply.send({ issue: await getIssue(deps, { researchObjectId: id, userId: user?.userId, issueId }) });
  });

  app.patch('/research-objects/:id/issues/:issueId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, issueId } = issueParams.parse(req.params);
    const body = statusBody.parse(req.body);
    const issue = await updateIssueStatus(
      deps,
      { researchObjectId: id, userId: user.userId, issueId, status: body.status },
      auditCtx(req),
    );
    return reply.send({ issue });
  });

  app.post('/research-objects/:id/issues/:issueId/comments', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, issueId } = issueParams.parse(req.params);
    const body = commentBody.parse(req.body);
    const comment = await createComment(
      deps,
      { researchObjectId: id, userId: user.userId, body: body.body, issueId },
      auditCtx(req),
    );
    return reply.status(201).send({ comment });
  });
}
