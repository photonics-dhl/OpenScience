import { randomUUID } from 'node:crypto';
import type { JournalJob } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { JournalError } from './contracts';
import { journalDigest, validateJournalDraft, validateJournalSource, type JournalRights, type JournalSource } from './content';
import { assertArticleRevision, JOURNAL_EDIT_ROLES, journalArticleEvent, journalArticleInScope, journalJson, journalScope, journalTransaction, type JournalTx } from './articles';

export const JOURNAL_JOB_LEASE_MS = 10 * 60_000;
const terminal = (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state);
const moment = (deps: Pick<WorkspaceDeps, 'now'>) => deps.now?.() ?? new Date();
export function journalSourceDigest(article: { source: unknown; rights: unknown }) { return journalDigest({ source: article.source, rights: article.rights }); }
function assertGenerationAllowed(article: { source: unknown; rights: unknown; contentState: string }) {
  const source = article.source as JournalSource;
  const rights = article.rights as JournalRights;
  validateJournalSource(source);
  if (source.kind === 'metadata') throw new JournalError('INVALID_STATE', '书目元数据不能用于生成科学解读，请补充摘要或全文');
  if (article.contentState !== 'active' || !rights.internalProcessing || !rights.derivativeGeneration || !rights.externalProcessing || !rights.license || !rights.evidence) throw new JournalError('FORBIDDEN', '需要有效的内部加工、衍生生成及外部 AI 处理授权');
}
function assertJobAllowed(job: { kind: string }, article: { source: unknown; rights: unknown; contentState: string }) {
  if (job.kind === 'generate') return assertGenerationAllowed(article);
  const rights = article.rights as JournalRights; const source = article.source as JournalSource;
  if (job.kind !== 'source_parse' || article.contentState !== 'active' || !rights.internalProcessing || !rights.evidence || !source.artifactId) throw new JournalError('FORBIDDEN', '需要有效的内部来源处理授权');
}
export async function submitJournalJob(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; language: 'zh' | 'en'; requestKey: string; retryOf?: string }) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const previous = await tx.journalJob.findUnique({ where: { journalId_requestKey: { journalId, requestKey: input.requestKey } } });
    if (previous) {
      if (previous.kind !== 'generate' || previous.articleId !== articleId || previous.requestedBy !== userId || previous.revision !== input.revision || previous.language !== input.language || previous.retryOf !== (input.retryOf ?? null)) throw new JournalError('IDEMPOTENCY_CONFLICT', '此请求标识已用于另一作业');
      return previous;
    }
    const article = await journalArticleInScope(tx, journalId, articleId);
    assertArticleRevision(article, input.revision);
    assertGenerationAllowed(article);
    if (input.retryOf) {
      const failed = await tx.journalJob.findFirst({ where: { id: input.retryOf, journalId, articleId, state: { in: ['failed', 'cancelled'] } } });
      if (!failed) throw new JournalError('VALIDATION_ERROR', '只能显式重试本刊此论文的失败或取消作业');
    }
    if (await tx.journalJob.count({ where: { articleId, state: { in: ['staging', 'pending', 'running'] } } })) throw new JournalError('INVALID_STATE', '此论文已有进行中的作业');
    if (await tx.journalJob.count({ where: { journalId, state: { in: ['staging', 'pending', 'running'] } } }) >= 100) throw new JournalError('INVALID_STATE', '期刊作业队列已满');
    const grants = await tx.journalGrant.findMany({ where: { journalId, expiresAt: { gt: moment(deps) }, remaining: { gt: 0 } }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
    const grant = grants.find((g) => g.remaining > g.reserved);
    if (!grant) throw new JournalError('INSUFFICIENT_CREDITS', '没有可用论文额度，请申请服务或等待已有任务结算');
    await tx.journalGrant.update({ where: { id: grant.id }, data: { reserved: { increment: 1 } } });
    const job = await tx.journalJob.create({ data: { journalId, articleId, grantId: grant.id, requestedBy: userId, requestKey: input.requestKey, revision: article.revision, sourceDigest: journalSourceDigest(article), language: input.language, retryOf: input.retryOf } });
    await tx.journalLedger.create({ data: { journalId, grantId: grant.id, jobId: job.id, kind: 'reserve', amount: 1, eventKey: `reserve:${job.id}` } });
    await journalArticleEvent(tx, journalId, userId, 'journal.job.submit', articleId, { jobId: job.id });
    return job;
  });
}
async function settle(tx: JournalTx, now: Date, job: JournalJob, state: 'succeeded' | 'failed' | 'cancelled', error?: string, result?: unknown) {
  if (terminal(job.state)) return job;
  const succeeded = state === 'succeeded';
  if (job.grantId) {
    const grant = await tx.journalGrant.findUniqueOrThrow({ where: { id: job.grantId } });
    const expiredRelease = !succeeded && grant.expiresAt <= now;
    await tx.journalGrant.update({ where: { id: job.grantId }, data: { reserved: { decrement: 1 }, ...(succeeded ? { remaining: { decrement: 1 }, consumed: { increment: 1 } } : expiredRelease ? { remaining: { decrement: 1 }, expired: { increment: 1 } } : {}) } });
    await tx.journalLedger.create({ data: { journalId: job.journalId, grantId: job.grantId, jobId: job.id, kind: succeeded ? 'consume' : 'release', amount: 1, eventKey: `settle:${job.id}` } });
    if (expiredRelease) await tx.journalLedger.create({ data: { journalId: job.journalId, grantId: job.grantId, jobId: job.id, kind: 'expire', amount: 1, eventKey: `expire-release:${job.id}` } });
  }
  const updated = await tx.journalJob.update({ where: { id: job.id }, data: { state, error: error ?? null, ...(result === undefined ? {} : { result: journalJson(result) }), leaseToken: null, leaseExpiresAt: null } });
  await tx.notification.create({ data: { userId: job.requestedBy, type: 'journal.job', payload: { journalId: job.journalId, articleId: job.articleId, jobId: job.id, state } } });
  return updated;
}
export async function cancelJournalJob(deps: WorkspaceDeps, userId: string, journalId: string, jobId: string) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES);
    const job = await tx.journalJob.findFirst({ where: { id: jobId, journalId } });
    if (!job) throw new JournalError('JOURNAL_NOT_FOUND', '作业不存在');
    return settle(tx, moment(deps), job, 'cancelled', '编辑取消了此作业');
  });
}
/** Durable SQL queue: committed pending rows survive Redis/process outages. No public callback endpoint. */
export async function claimJournalJob(deps: WorkspaceDeps) {
  const candidates = await deps.prisma.$queryRaw<Array<{ id: string; journalId: string }>>`
    SELECT q.id, q.journal_id AS "journalId" FROM journal_jobs q JOIN journals j ON j.id = q.journal_id
    WHERE q.state = 'pending' AND (SELECT count(*) FROM journal_jobs running WHERE running.journal_id = q.journal_id AND running.state = 'running') < j.max_running_jobs
    ORDER BY q.created_at, q.id LIMIT 100`;
  for (const candidate of candidates) {
    const claimed = await journalTransaction(deps, candidate.journalId, async (tx) => {
      const job = await tx.journalJob.findUniqueOrThrow({ where: { id: candidate.id } });
      if (job.state !== 'pending') return null;
      try {
        const { journal } = await journalScope(tx, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
        const article = await journalArticleInScope(tx, job.journalId, job.articleId);
        assertJobAllowed(job, article);
        assertArticleRevision(article, job.revision);
        if (journalSourceDigest(article) !== job.sourceDigest) throw new JournalError('REVISION_CONFLICT', '来源或授权已改变');
        if (await tx.journalJob.count({ where: { journalId: job.journalId, state: 'running' } }) >= journal.maxRunningJobs) return null;
        return tx.journalJob.update({ where: { id: job.id }, data: { state: 'running', leaseToken: randomUUID(), leaseExpiresAt: new Date(moment(deps).getTime() + JOURNAL_JOB_LEASE_MS) } });
      } catch (error) {
        if (!(error instanceof JournalError)) throw error;
        await settle(tx, moment(deps), job, 'failed', error.message);
        return null;
      }
    });
    if (claimed) return claimed;
  }
  return null;
}
export async function journalJobInput(deps: WorkspaceDeps, jobId: string, leaseToken: string) {
  const job = await deps.prisma.journalJob.findUnique({ where: { id: jobId } });
  if (!job || job.state !== 'running' || job.leaseToken !== leaseToken || !job.leaseExpiresAt || job.leaseExpiresAt <= moment(deps)) throw new JournalError('INVALID_STATE', '作业租约失效');
  await journalScope(deps.prisma, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, job.journalId, job.articleId);
  assertJobAllowed(job, article);
  assertArticleRevision(article, job.revision);
  if (journalSourceDigest(article) !== job.sourceDigest) throw new JournalError('REVISION_CONFLICT', '来源或授权已改变');
  const journal = await deps.prisma.journal.findUniqueOrThrow({ where: { id: job.journalId } });
  return { source: article.source as unknown as JournalSource, language: job.language as 'zh' | 'en', kind: job.kind, workspaceId: journal.workspaceId, actorId: job.requestedBy };
}
export async function finishJournalJob(deps: WorkspaceDeps, jobId: string, leaseToken: string, result: unknown, failure?: string) {
  const original = await deps.prisma.journalJob.findUniqueOrThrow({ where: { id: jobId } });
  return journalTransaction(deps, original.journalId, async (tx) => {
    const job = await tx.journalJob.findUniqueOrThrow({ where: { id: jobId } });
    if (terminal(job.state)) return job;
    if (job.state !== 'running' || job.leaseToken !== leaseToken) throw new JournalError('INVALID_STATE', '作业租约失效');
    if (failure) return settle(tx, moment(deps), job, 'failed', failure);
    try {
      await journalScope(tx, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
      const article = await journalArticleInScope(tx, job.journalId, job.articleId);
      assertJobAllowed(job, article);
      assertArticleRevision(article, job.revision);
      if (journalSourceDigest(article) !== job.sourceDigest || !job.leaseExpiresAt || job.leaseExpiresAt <= moment(deps)) throw new JournalError('REVISION_CONFLICT', '来源、权限或作业期限已改变');
      if (job.kind === 'source_parse') {
        const value = result as { text?: unknown };
        const source = { ...(article.source as unknown as JournalSource), text: typeof value?.text === 'string' ? value.text : '' };
        validateJournalSource(source);
        await tx.journalArticle.update({ where: { id: article.id }, data: { source: journalJson(source), revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
        return settle(tx, moment(deps), job, 'succeeded', undefined, { characters: source.text.length, kind: 'source_parse' });
      }
      const draft = validateJournalDraft(result, article.source as unknown as JournalSource);
      if (draft.language !== job.language) throw new JournalError('VALIDATION_ERROR', '生成语言与请求不一致');
      await tx.journalArticle.update({ where: { id: article.id }, data: { draft: journalJson(draft), revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
      return settle(tx, moment(deps), job, 'succeeded', undefined, draft);
    } catch (error) {
      // A conflicting draft is retained for editor comparison; it never overwrites an edit or consumes credit.
      const comparison = job.kind === 'generate' && JSON.stringify(result ?? null).length <= 128_000 ? result : undefined;
      return settle(tx, moment(deps), job, 'failed', error instanceof JournalError ? error.message : '生成结果未通过来源与格式校验', comparison);
    }
  });
}
export async function recoverJournalJobs(deps: WorkspaceDeps) {
  const expired = await deps.prisma.journalJob.findMany({ where: { OR: [{ state: 'running', leaseExpiresAt: { lt: moment(deps) } }, { state: { in: ['staging', 'pending'] }, createdAt: { lt: new Date(moment(deps).getTime() - 24 * 60 * 60_000) } }] }, take: 100 });
  for (const candidate of expired) await journalTransaction(deps, candidate.journalId, async (tx) => {
    const job = await tx.journalJob.findUniqueOrThrow({ where: { id: candidate.id } });
    if ((job.state === 'running' && job.leaseExpiresAt && job.leaseExpiresAt < moment(deps)) || (['staging', 'pending'].includes(job.state) && job.createdAt.getTime() < moment(deps).getTime() - 24 * 60 * 60_000)) await settle(tx, moment(deps), job, 'failed', '作业执行超时或工作进程中断；额度已释放，可显式重试');
  });
  const grants = await deps.prisma.$queryRaw<Array<{ id: string; journalId: string }>>`SELECT id, journal_id AS "journalId" FROM journal_grants WHERE expires_at <= ${moment(deps)} AND remaining > reserved LIMIT 100`;
  for (const candidate of grants) await journalTransaction(deps, candidate.journalId, async (tx) => {
    const grant = await tx.journalGrant.findUniqueOrThrow({ where: { id: candidate.id } });
    const amount = grant.remaining - grant.reserved;
    if (grant.expiresAt > moment(deps) || amount <= 0) return;
    await tx.journalGrant.update({ where: { id: grant.id }, data: { remaining: grant.reserved, expired: { increment: amount } } });
    await tx.journalLedger.create({ data: { journalId: grant.journalId, grantId: grant.id, kind: 'expire', amount, eventKey: `expire:${grant.id}` } });
  });
  return expired.length;
}
export async function renewJournalJobLease(deps: WorkspaceDeps, jobId: string, leaseToken: string) {
  return deps.prisma.journalJob.updateMany({ where: { id: jobId, state: 'running', leaseToken, leaseExpiresAt: { gt: moment(deps) } }, data: { leaseExpiresAt: new Date(moment(deps).getTime() + JOURNAL_JOB_LEASE_MS) } });
}
