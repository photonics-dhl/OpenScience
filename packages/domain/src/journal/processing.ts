import { createHash, randomUUID } from 'node:crypto';
import type { JournalJob } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { JournalError } from './contracts';
import { journalDigest, validateJournalDraft, validateJournalSource, type JournalRights, type JournalSource } from './content';
import { assertArticleRevision, JOURNAL_EDIT_ROLES, journalArticleEvent, journalArticleInScope, journalJson, journalScope, journalTransaction, type JournalTx } from './articles';
import { assertJournalGenerationCapability, journalSourceMaterials } from './enhancements';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';

export const JOURNAL_JOB_LEASE_MS = 10 * 60_000;
const terminal = (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state);
const moment = (deps: Pick<WorkspaceDeps, 'now'>) => deps.now?.() ?? new Date();
export function journalSourceDigest(article: { source: unknown; rights: unknown }) { return journalDigest({ source: article.source, rights: article.rights }); }
function assertGenerationAllowed(article: { source: unknown; rights: unknown; contentState: string }, now = new Date()) {
  const source = article.source as JournalSource;
  validateJournalSource(source);
  assertJournalGenerationCapability({ id: '', ...article }, now);
}
function assertJobAllowed(job: { kind: string }, article: { source: unknown; rights: unknown; contentState: string }, now = new Date()) {
  if (job.kind === 'generate') return assertGenerationAllowed(article, now);
  const rights = article.rights as JournalRights; const source = article.source as JournalSource;
  if (job.kind !== 'source_parse' || article.contentState !== 'active' || !rights.internalProcessing || !rights.evidence || !source.artifactId) throw new JournalError('FORBIDDEN', '需要有效的内部来源处理授权');
}
export async function submitJournalJob(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; language: 'zh' | 'en'; requestKey: string; retryOf?: string; manualConfirmation?: boolean }, nativeReady = false) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const previous = await tx.journalJob.findUnique({ where: { journalId_requestKey: { journalId, requestKey: input.requestKey } } });
    if (previous) {
      if (previous.kind !== 'generate' || previous.articleId !== articleId || previous.requestedBy !== userId || previous.revision !== input.revision || previous.language !== input.language || previous.retryOf !== (input.retryOf ?? null)) throw new JournalError('IDEMPOTENCY_CONFLICT', '此请求标识已用于另一作业');
      return previous;
    }
    const article = await journalArticleInScope(tx, journalId, articleId);
    assertArticleRevision(article, input.revision);
    assertGenerationAllowed(article, moment(deps));
    if (!nativeReady) throw new JournalError('INVALID_STATE', '原生 Hermes 当前不可用，尚未预留额度；请稍后再试');
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
    await journalArticleEvent(tx, journalId, userId, 'journal.job.submit', articleId, { jobId: job.id, queueChoice: 'user_requested', manualConfirmation: input.manualConfirmation === true, estimatedCreditCost: 1 });
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
  await tx.agentTask.updateMany({ where: { idempotencyKey: `journal-native-task:${job.id}`, kind: 'journal.generate' },
    data: { status: succeeded ? 'succeeded' : 'failed', ...(succeeded ? { progress: 100 } : { error: error ?? 'Journal native job stopped' }) } });
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
export interface JournalNativeRuntime { runtimeId: string; skillCatalogueId: string; model: string }
export async function claimJournalJob(deps: WorkspaceDeps, nativeRuntime?: JournalNativeRuntime) {
  const candidates = await deps.prisma.$queryRaw<Array<{ id: string; journalId: string; kind: string }>>`
    SELECT q.id, q.journal_id AS "journalId", q.kind FROM journal_jobs q JOIN journals j ON j.id = q.journal_id
    WHERE q.state = 'pending' AND (${Boolean(nativeRuntime)} OR q.kind = 'source_parse')
      AND (SELECT count(*) FROM journal_jobs running WHERE running.journal_id = q.journal_id AND running.state = 'running') < j.max_running_jobs
    ORDER BY q.created_at, q.id LIMIT 100`;
  for (const candidate of candidates) {
    // Parsing stays local. A generation job cannot be claimed without the installed Agent.
    if (candidate.kind === 'generate' && !nativeRuntime) continue;
    const claimed = await journalTransaction(deps, candidate.journalId, async (tx) => {
      const job = await tx.journalJob.findUniqueOrThrow({ where: { id: candidate.id } });
      if (job.state !== 'pending') return null;
      try {
        const { journal } = await journalScope(tx, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
        const article = await journalArticleInScope(tx, job.journalId, job.articleId);
        assertJobAllowed(job, article, moment(deps));
        assertArticleRevision(article, job.revision);
        if (journalSourceDigest(article) !== job.sourceDigest) throw new JournalError('REVISION_CONFLICT', '来源或授权已改变');
        if (await tx.journalJob.count({ where: { journalId: job.journalId, state: 'running' } }) >= journal.maxRunningJobs) return null;
        const leaseToken = randomUUID();
        const running = await tx.journalJob.update({ where: { id: job.id }, data: { state: 'running', leaseToken, leaseExpiresAt: new Date(moment(deps).getTime() + JOURNAL_JOB_LEASE_MS) } });
        if (job.kind === 'generate') {
          if (!nativeRuntime) throw new JournalError('INVALID_STATE', '原生 Hermes 暂不可用');
          const session = await tx.agentSession.create({ data: { userId: job.requestedBy, kind: 'journal-editor', title: `Journal ${job.id}`, idempotencyKey: `journal-native-session:${job.id}` } });
          await tx.agentTask.create({ data: { sessionId: session.id, kind: 'journal.generate', status: 'running', executionAttempt: 1,
            idempotencyKey: `journal-native-task:${job.id}`, payload: { journalJobId: job.id, leaseToken, sourceDigest: job.sourceDigest, revision: job.revision },
            result: { nativeAgentExecution: { kind: 'hermes-agent', profile: 'journal-editor', ...nativeRuntime } } } });
        }
        return running;
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
/** Recheck the same live journal authority before every native tool and paid publication. */
export async function requireJournalNativeAuthority(tx: JournalTx, input: { taskId: string; executionAttempt: number; jobId: string; leaseToken: string; sourceDigest: string; revision: number }) {
  // Use the same journal lock as edits/cancel/settlement. Independent membership and user
  // revocations are locked too, so a provider/tool response cannot start across a revoke.
  const owners = await tx.$queryRaw<Array<{ workspaceId: string; requestedBy: string }>>`
    SELECT j.workspace_id AS "workspaceId", q.requested_by AS "requestedBy"
    FROM journals j JOIN journal_jobs q ON q.journal_id = j.id
    WHERE q.id = ${input.jobId}::uuid FOR UPDATE OF j`;
  if (owners.length !== 1) throw new JournalError('INVALID_STATE', '期刊 Hermes 作业不存在');
  await tx.$queryRaw`SELECT id FROM memberships WHERE workspace_id = ${owners[0]!.workspaceId}::uuid
    AND user_id = ${owners[0]!.requestedBy}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${owners[0]!.requestedBy}::uuid FOR SHARE`;
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  const job = await tx.journalJob.findUnique({ where: { id: input.jobId } });
  if (!task || task.deletedAt || task.kind !== 'journal.generate' || task.status !== 'running' || task.executionAttempt !== input.executionAttempt
    || task.idempotencyKey !== `journal-native-task:${input.jobId}` || task.session.deletedAt || task.session.status !== 'active'
    || task.session.kind !== 'journal-editor' || task.session.userId !== job?.requestedBy || job?.kind !== 'generate'
    || job.state !== 'running' || job.leaseToken !== input.leaseToken || !job.leaseExpiresAt || job.leaseExpiresAt <= new Date()
    || job.revision !== input.revision || job.sourceDigest !== input.sourceDigest
    || !task.payload || typeof task.payload !== 'object' || Array.isArray(task.payload)
    || Object.keys(task.payload).sort().join(',') !== 'journalJobId,leaseToken,revision,sourceDigest'
    || task.payload.journalJobId !== input.jobId || task.payload.leaseToken !== input.leaseToken
    || task.payload.sourceDigest !== input.sourceDigest || task.payload.revision !== input.revision)
    throw new JournalError('INVALID_STATE', '期刊 Hermes 作业绑定或租约已改变');
  await journalScope(tx, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(tx, job.journalId, job.articleId);
  assertJobAllowed(job, article, new Date());
  assertArticleRevision(article, job.revision);
  if (journalSourceDigest(article) !== job.sourceDigest) throw new JournalError('REVISION_CONFLICT', '期刊来源或授权已改变');
  return { task, job, source: article.source as unknown as JournalSource };
}
export async function journalJobInput(deps: WorkspaceDeps, jobId: string, leaseToken: string) {
  const job = await deps.prisma.journalJob.findUnique({ where: { id: jobId } });
  if (!job || job.state !== 'running' || job.leaseToken !== leaseToken || !job.leaseExpiresAt || job.leaseExpiresAt <= moment(deps)) throw new JournalError('INVALID_STATE', '作业租约失效');
  await journalScope(deps.prisma, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, job.journalId, job.articleId);
  assertJobAllowed(job, article, moment(deps));
  assertArticleRevision(article, job.revision);
  if (journalSourceDigest(article) !== job.sourceDigest) throw new JournalError('REVISION_CONFLICT', '来源或授权已改变');
  const journal = await deps.prisma.journal.findUniqueOrThrow({ where: { id: job.journalId } });
  return { source: article.source as unknown as JournalSource, rights: article.rights as unknown as JournalRights,
    language: job.language as 'zh' | 'en', kind: job.kind, workspaceId: journal.workspaceId, actorId: job.requestedBy };
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
      assertJobAllowed(job, article, moment(deps));
      assertArticleRevision(article, job.revision);
      if (journalSourceDigest(article) !== job.sourceDigest || !job.leaseExpiresAt || job.leaseExpiresAt <= moment(deps)) throw new JournalError('REVISION_CONFLICT', '来源、权限或作业期限已改变');
      if (job.kind === 'source_parse') {
        const value = result as { text?: unknown; sourceMapRef?: unknown };
        const parsedText = typeof value?.text === 'string' ? value.text : '';
        const sourceMapRef = value?.sourceMapRef === undefined ? undefined : parseDocumentSourceMapReference(value.sourceMapRef);
        if (sourceMapRef) {
          const currentSource = article.source as unknown as JournalSource;
          const artifact = await tx.artifact.findUnique({ where: { id: currentSource.artifactId } });
          if (sourceMapRef.parserStatus !== 'succeeded' || sourceMapRef.artifactId !== currentSource.artifactId
            || !artifact || artifact.workspaceId !== (await tx.journal.findUniqueOrThrow({ where: { id: job.journalId } })).workspaceId
            || sourceMapRef.contentHash !== artifact.blobSha256)
            throw new JournalError('VALIDATION_ERROR', '解析页码映射与期刊原始文件不一致');
        }
        const materials = journalSourceMaterials(article.source).map((item) => item.activeForGeneration ? { ...item, contentSha256: createHash('sha256').update(parsedText, 'utf8').digest('hex') } : item);
        const source = { ...(article.source as unknown as JournalSource), text: parsedText,
          ...(sourceMapRef ? { sourceMapRef } : {}), ...(materials.length ? { materials } : {}) };
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
