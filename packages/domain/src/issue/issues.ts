import type { AuditContext, AuditEvent } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { canAccessRo } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { notify } from '../notification/notifications';
import { IssueError } from './errors';

export const ISSUE_KINDS = ['question', 'method_repro', 'failure', 'bug_report', 'suggestion'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_STATUSES = ['open', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** 非事务审计写（deps.audit 缺省 no-op）。 */
function audit(deps: WorkspaceDeps, event: Omit<AuditEvent, 'requestId' | 'ip'>, ctx: AuditContext): void {
  void deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip });
}

export interface IssueSummary {
  id: string;
  title: string;
  body: string;
  kind: IssueKind;
  status: IssueStatus;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  commentCount: number;
}

export interface IssueDetail extends IssueSummary {
  comments: Array<{ id: string; authorId: string; body: string; createdAt: Date }>;
}

export interface CreateIssueInput {
  researchObjectId: string;
  userId: string;
  title: string;
  kind: IssueKind;
  body?: string;
}

export interface CreateCommentInput {
  researchObjectId: string;
  userId: string;
  body: string;
  /** 多态归属：至多一个（§15 Comment 实体）。本期 PR/Review 未实现，预留。 */
  issueId?: string;
  prId?: string;
  reviewId?: string;
}

function assertKind(kind: string): void {
  if (!(ISSUE_KINDS as readonly string[]).includes(kind)) {
    throw new IssueError('VALIDATION_ERROR', 'Issue 类型必须为 question/method_repro/failure/bug_report/suggestion 之一');
  }
}

function assertStatus(status: string): void {
  if (!(ISSUE_STATUSES as readonly string[]).includes(status)) {
    throw new IssueError('VALIDATION_ERROR', 'Issue 状态必须为 open/closed');
  }
}

/**
 * 创建 Issue（§8 概念表 + §4.2 可见性继承 + §17 越权/审计）：
 * 写权限 requireMembership（仅空间成员，非成员 404）；kind 对齐 §8 五类语义。
 */
export async function createIssue(
  deps: WorkspaceDeps,
  input: CreateIssueInput,
  ctx: AuditContext = {},
): Promise<IssueSummary> {
  const title = input.title.trim();
  if (!title || title.length > 200) throw new IssueError('VALIDATION_ERROR', '标题需为 1-200 字符');
  if (input.body && input.body.length > 20000) throw new IssueError('VALIDATION_ERROR', '正文过长（≤20000 字符）');
  assertKind(input.kind);

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const issue = await deps.prisma.issue.create({
    data: { researchObjectId: ro.id, title, body: input.body ?? '', kind: input.kind, status: 'open', authorId: input.userId },
  });
  audit(deps, {
    actorId: input.userId, action: 'issue.create', workspaceId: ro.workspaceId,
    targetType: 'issue', targetId: issue.id,
    metadata: { researchObjectId: ro.id, kind: input.kind },
  }, ctx);

  // P1C-9：Issue 动态通知（§18.1 Dashboard + Q2）
  await notify(deps, {
    userId: ro.createdBy,
    type: 'issue.updated',
    payload: { issueId: issue.id, researchObjectId: ro.id, kind: input.kind, link: `/research-objects/${ro.id}/issues/${issue.id}` },
  });

  return { ...issue, kind: issue.kind as IssueKind, status: issue.status as IssueStatus, commentCount: 0 };
}

/**
 * Issue 列表（§4.2 可见性继承）：读 canAccessRo（public 匿名可读）；kind/status 过滤。
 */
export async function listIssues(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string; kind?: string; status?: string },
): Promise<IssueSummary[]> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  if (input.kind) assertKind(input.kind);
  if (input.status) assertStatus(input.status);

  const rows = await deps.prisma.issue.findMany({
    where: {
      researchObjectId: input.researchObjectId,
      ...(input.kind ? { kind: input.kind as IssueKind } : {}),
      ...(input.status ? { status: input.status as IssueStatus } : {}),
    },
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id, title: r.title, body: r.body,
    kind: r.kind as IssueKind, status: r.status as IssueStatus,
    authorId: r.authorId, createdAt: r.createdAt, updatedAt: r.updatedAt,
    commentCount: r._count.comments,
  }));
}

/**
 * Issue 详情 + 评论（§15 Comment 挂接）。
 */
export async function getIssue(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string; issueId: string },
): Promise<IssueDetail> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const issue = await deps.prisma.issue.findFirst({
    where: { id: input.issueId, researchObjectId: input.researchObjectId },
    include: {
      comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true } } } },
      _count: { select: { comments: true } },
    },
  });
  if (!issue) throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', 'Issue 不存在');

  return {
    id: issue.id, title: issue.title, body: issue.body,
    kind: issue.kind as IssueKind, status: issue.status as IssueStatus,
    authorId: issue.authorId, createdAt: issue.createdAt, updatedAt: issue.updatedAt,
    commentCount: issue._count.comments,
    comments: issue.comments.map((c) => ({ id: c.id, authorId: c.authorId, body: c.body, createdAt: c.createdAt })),
  };
}

/**
 * Issue 状态流转（open/closed，Q1/Q3 决策）：
 * - 权限：作者本人 或 空间成员（§3.3 Maintainer/Contributor 语义）
 * - 幂等：同状态重复 → 直接成功 + 审计
 * - 审计 issue.status_changed
 */
export async function updateIssueStatus(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string; issueId: string; status: IssueStatus },
  ctx: AuditContext = {},
): Promise<IssueSummary> {
  assertStatus(input.status);

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  const { membership } = await requireMembership(deps, ro.workspaceId, input.userId);

  const issue = await deps.prisma.issue.findFirst({ where: { id: input.issueId, researchObjectId: ro.id } });
  if (!issue) throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', 'Issue 不存在');

  // Q1：作者本人 或 空间成员（member 均有管理 Issue 权限；owner/maintainer/contributor 覆盖）
  const canManage = issue.authorId === input.userId || membership.role !== 'viewer';
  if (!canManage) throw new IssueError('FORBIDDEN', '仅作者或空间成员可变更 Issue 状态');

  // 幂等：同状态直接成功；否则更新
  if (issue.status !== input.status) {
    await deps.prisma.issue.update({ where: { id: issue.id }, data: { status: input.status } });
  }
  audit(deps, {
    actorId: input.userId, action: 'issue.status_changed', workspaceId: ro.workspaceId,
    targetType: 'issue', targetId: issue.id,
    metadata: { researchObjectId: ro.id, from: issue.status, to: input.status, idempotent: issue.status === input.status },
  }, ctx);

  const commentCount = await deps.prisma.comment.count({ where: { issueId: issue.id } }).catch(() => 0);
  return {
    id: issue.id, title: issue.title, body: issue.body,
    kind: issue.kind as IssueKind, status: input.status,
    authorId: issue.authorId, createdAt: issue.createdAt, updatedAt: new Date(),
    commentCount,
  };
}

/**
 * 创建评论（§15 Comment 多态：issueId/prId/reviewId 三选一 + 归属同 RO）：
 * - 写权限 requireMembership（§17 越权）
 * - 跨 RO 挂靠 → CROSS_RO_COMMENT
 * - 审计 comment.create
 */
export async function createComment(
  deps: WorkspaceDeps,
  input: CreateCommentInput,
  ctx: AuditContext = {},
): Promise<{ id: string; issueId: string | null; prId: string | null; reviewId: string | null; body: string; authorId: string; createdAt: Date }> {
  const body = input.body.trim();
  if (!body || body.length > 20000) throw new IssueError('VALIDATION_ERROR', '评论需为 1-20000 字符');

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new IssueError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // 三 FK 至多一个（§15 多态）
  const targets = [input.issueId, input.prId, input.reviewId].filter(Boolean);
  if (targets.length !== 1) throw new IssueError('COMMENT_TARGET_INVALID', '评论必须且只能挂接一个目标（Issue/PR/Review）');

  // 归属同 RO（防跨 RO 挂靠）
  if (input.issueId) {
    const issue = await deps.prisma.issue.findFirst({ where: { id: input.issueId, researchObjectId: ro.id } });
    if (!issue) throw new IssueError('CROSS_RO_COMMENT', '目标 Issue 不属于该研究对象');
  }
  if (input.prId) {
    const pr = await deps.prisma.pullRequest.findFirst({ where: { id: input.prId, researchObjectId: ro.id } });
    if (!pr) throw new IssueError('CROSS_RO_COMMENT', '目标 Pull Request 不属于该研究对象');
  }
  if (input.reviewId) {
    const review = await deps.prisma.review.findFirst({
      where: { id: input.reviewId },
      include: { pr: { select: { researchObjectId: true } } },
    });
    if (!review || review.pr.researchObjectId !== ro.id) {
      throw new IssueError('CROSS_RO_COMMENT', '目标 Review 不属于该研究对象');
    }
  }

  const comment = await deps.prisma.comment.create({
    data: { issueId: input.issueId, prId: input.prId, reviewId: input.reviewId, authorId: input.userId, body },
  });
  audit(deps, {
    actorId: input.userId, action: 'comment.create', workspaceId: ro.workspaceId,
    targetType: 'comment', targetId: comment.id,
    metadata: { researchObjectId: ro.id, issueId: input.issueId ?? null, prId: input.prId ?? null, reviewId: input.reviewId ?? null },
  }, ctx);

  return {
    id: comment.id, issueId: comment.issueId, prId: comment.prId, reviewId: comment.reviewId,
    body: comment.body, authorId: comment.authorId, createdAt: comment.createdAt,
  };
}
