import { createHash } from 'node:crypto';
import type { JournalEvent, Prisma } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { JournalError } from './contracts';
import { JOURNAL_EDIT_ROLES, journalJson, journalScope, journalTransaction, type JournalTx } from './articles';

export type JournalFeedbackStatus = 'open' | 'resolved' | 'declined';

export interface JournalFeedbackView {
  id: string;
  articleId: string;
  versionNo: number;
  content: string;
  status: JournalFeedbackStatus;
  response: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  reporterId: string;
}

interface FeedbackPayload {
  requestKey: string;
  articleId: string;
  versionId: string;
  versionNo: number;
  content: string;
  status: 'open';
}

interface ResponsePayload {
  parentFeedbackId: string;
  status: Exclude<JournalFeedbackStatus, 'open'>;
  response: string;
}

const CREATE_ACTION = 'journal.feedback.create';
const RESPOND_ACTION = 'journal.feedback.respond';
const TARGET_TYPE = 'feedback';
const VERIFIED_STATES = ['email_verified', 'identity_verified'];

function deterministicFeedbackId(journalId: string, reporterId: string, requestKey: string): string {
  const bytes = createHash('sha256').update(`journal-feedback\0${journalId}\0${reporterId}\0${requestKey}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function feedbackPayload(event: Pick<JournalEvent, 'after'>): FeedbackPayload | null {
  const value = record(event.after);
  return typeof value.requestKey === 'string' && typeof value.articleId === 'string' && typeof value.versionId === 'string'
    && Number.isInteger(value.versionNo) && typeof value.content === 'string' && value.status === 'open'
    ? value as unknown as FeedbackPayload : null;
}

function responsePayload(event: Pick<JournalEvent, 'after'> | undefined): ResponsePayload | null {
  if (!event) return null;
  const value = record(event.after);
  return typeof value.parentFeedbackId === 'string' && (value.status === 'resolved' || value.status === 'declined') && typeof value.response === 'string'
    ? value as unknown as ResponsePayload : null;
}

function view(event: JournalEvent, response?: JournalEvent): JournalFeedbackView {
  const created = feedbackPayload(event);
  if (!created) throw new JournalError('INVALID_STATE', '纠错工单记录无效');
  const answered = responsePayload(response);
  return {
    id: event.id,
    articleId: created.articleId,
    versionNo: created.versionNo,
    content: created.content,
    status: answered?.status ?? 'open',
    response: answered?.response ?? null,
    createdAt: event.createdAt,
    respondedAt: answered && response ? response.createdAt : null,
    reporterId: event.actorId,
  };
}

async function verifiedUser(tx: JournalTx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || !VERIFIED_STATES.includes(user.status)) throw new JournalError('FORBIDDEN', '请先完成邮箱验证');
  return user;
}

export async function createJournalFeedback(
  deps: WorkspaceDeps,
  reporterId: string,
  journalId: string,
  articleId: string,
  input: { versionNo: number; content: string; requestKey: string },
): Promise<JournalFeedbackView> {
  const content = input.content.trim();
  const requestKey = input.requestKey.trim();
  if (!Number.isInteger(input.versionNo) || input.versionNo < 1 || content.length < 1 || content.length > 5000 || requestKey.length < 1 || requestKey.length > 200) {
    throw new JournalError('VALIDATION_ERROR', '纠错内容、版本号或请求标识无效');
  }
  const feedbackId = deterministicFeedbackId(journalId, reporterId, requestKey);
  return journalTransaction(deps, journalId, async (tx) => {
    await verifiedUser(tx, reporterId);
    const previous = await tx.journalEvent.findUnique({ where: { id: feedbackId } });
    if (previous) {
      const payload = feedbackPayload(previous);
      if (previous.journalId !== journalId || previous.actorId !== reporterId || previous.action !== CREATE_ACTION || previous.targetType !== TARGET_TYPE
        || previous.targetId !== feedbackId || !payload || payload.requestKey !== requestKey || payload.articleId !== articleId
        || payload.versionNo !== input.versionNo || payload.content !== content) {
        throw new JournalError('IDEMPOTENCY_CONFLICT', '此请求标识已用于另一纠错工单');
      }
      const response = await tx.journalEvent.findFirst({ where: { journalId, action: RESPOND_ACTION, targetType: TARGET_TYPE, targetId: feedbackId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      return view(previous, response ?? undefined);
    }
    const release = await tx.journalRelease.findFirst({
      where: {
        articleId,
        article: { journalId, contentState: 'active' },
        version: { publicationNo: input.versionNo, status: 'published', researchObject: { visibility: 'public', deletedAt: null }, publications: { some: {} } },
      },
      include: { article: true },
    });
    if (!release || record(release.article.rights).publicDerivative !== true) throw new JournalError('JOURNAL_NOT_FOUND', '公开期刊版本不存在');
    const payload: FeedbackPayload = { requestKey, articleId, versionId: release.versionId, versionNo: input.versionNo, content, status: 'open' };
    const created = await tx.journalEvent.create({ data: {
      id: feedbackId, journalId, actorId: reporterId, action: CREATE_ACTION, targetType: TARGET_TYPE, targetId: feedbackId, after: journalJson(payload),
    } });
    const journal = await tx.journal.findUniqueOrThrow({ where: { id: journalId }, include: { workspace: true } });
    await tx.notification.create({ data: {
      userId: journal.workspace.ownerId,
      type: 'journal.feedback.opened',
      idempotencyKey: `journal.feedback.opened:${feedbackId}:${journal.workspace.ownerId}`,
      payload: journalJson({ journalId, articleId, versionNo: input.versionNo, feedbackId }),
    } });
    return view(created);
  });
}

export async function listJournalFeedback(
  deps: WorkspaceDeps,
  userId: string,
  journalId: string,
  input: { cursor?: string; limit?: number } = {},
): Promise<{ items: JournalFeedbackView[]; role: 'editor' | 'reporter'; nextCursor: string | null }> {
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new JournalError('VALIDATION_ERROR', '分页大小无效');
  await verifiedUser(deps.prisma, userId);
  const journal = await deps.prisma.journal.findUnique({ where: { id: journalId }, select: { workspaceId: true } });
  if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
  const membership = await deps.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId } }, select: { role: true } });
  const editor = !!membership && JOURNAL_EDIT_ROLES.includes(membership.role);
  const access = { journalId, action: CREATE_ACTION, targetType: TARGET_TYPE, ...(editor ? {} : { actorId: userId }) };
  let seek: { OR: Array<Record<string, unknown>> } | undefined;
  if (input.cursor) {
    const cursor = await deps.prisma.journalEvent.findFirst({ where: { id: input.cursor, ...access }, select: { id: true, createdAt: true } });
    if (!cursor) throw new JournalError('VALIDATION_ERROR', '分页游标无效');
    seek = { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
  }
  const rows = await deps.prisma.journalEvent.findMany({
    where: { ...access, ...seek }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
  });
  const visible = rows.slice(0, limit);
  const responses = visible.length ? await deps.prisma.journalEvent.findMany({
    where: { journalId, action: RESPOND_ACTION, targetType: TARGET_TYPE, targetId: { in: visible.map((item) => item.id) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }) : [];
  const responseByFeedback = new Map<string, JournalEvent>();
  for (const response of responses) if (!responseByFeedback.has(response.targetId)) responseByFeedback.set(response.targetId, response);
  return {
    items: visible.map((item) => view(item, responseByFeedback.get(item.id))),
    role: editor ? 'editor' : 'reporter',
    nextCursor: rows.length > limit ? visible.at(-1)!.id : null,
  };
}

export async function respondJournalFeedback(
  deps: WorkspaceDeps,
  userId: string,
  journalId: string,
  feedbackId: string,
  input: { expectedStatus: JournalFeedbackStatus; status: Exclude<JournalFeedbackStatus, 'open'>; response: string },
): Promise<JournalFeedbackView> {
  const responseText = input.response.trim();
  if (!responseText || responseText.length > 5000) throw new JournalError('VALIDATION_ERROR', '处理理由不能为空且不能超过 5000 字符');
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES);
    const created = await tx.journalEvent.findFirst({ where: { id: feedbackId, journalId, action: CREATE_ACTION, targetType: TARGET_TYPE, targetId: feedbackId } });
    const createdPayload = created && feedbackPayload(created);
    if (!created || !createdPayload) throw new JournalError('JOURNAL_NOT_FOUND', '纠错工单不存在');
    const previous = await tx.journalEvent.findFirst({ where: { journalId, action: RESPOND_ACTION, targetType: TARGET_TYPE, targetId: feedbackId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const current = responsePayload(previous ?? undefined)?.status ?? 'open';
    if (current !== input.expectedStatus) throw new JournalError('REVISION_CONFLICT', '纠错工单状态已改变，请刷新后处理');
    if (current !== 'open') throw new JournalError('INVALID_STATE', '纠错工单已处理');
    const answered = await tx.journalEvent.create({ data: {
      journalId, actorId: userId, action: RESPOND_ACTION, targetType: TARGET_TYPE, targetId: feedbackId,
      reason: responseText, after: journalJson({ parentFeedbackId: feedbackId, status: input.status, response: responseText } satisfies ResponsePayload),
    } });
    await tx.notification.create({ data: {
      userId: created.actorId,
      type: 'journal.feedback.responded',
      idempotencyKey: `journal.feedback.responded:${feedbackId}`,
      payload: journalJson({ journalId, articleId: createdPayload.articleId, versionNo: createdPayload.versionNo, feedbackId, status: input.status }),
    } });
    return view(created, answered);
  });
}
