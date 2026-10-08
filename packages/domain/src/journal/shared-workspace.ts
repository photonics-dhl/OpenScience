import type { MalwareScanner, StorageAdapter } from '@openscience/storage';
import type { WorkspaceDeps } from '../workspace/types';
import { createArtifact } from '../artifact/artifacts';
import { createCommit } from '../commit/commits';
import { freezeResearchRecord } from '../commit/research-record-snapshot';
import { createSystemResearchObjectInTransaction } from '../research-object/research-objects';
import { JournalError } from './contracts';
import { assertArticleRevision, journalArticleEvent, journalArticleInScope, journalScope, journalTransaction, JOURNAL_EDIT_ROLES } from './articles';
import { Prisma, type JournalArticle } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { EMPTY_RIGHTS, journalDigest, type JournalSource } from './content';
import { journalJson } from './articles';
import { JOURNAL_FILE_LIMIT, validateJournalUploadContent } from './source-upload';
import type { JournalArticleSourceRecord } from './enhancements';
import { journalSourceProcessingAllowed } from './enhancements';
import { createIngestionBatchFromArtifact, type IngestionDeps } from '../ingestion/ingestion-service';
import { confirmIngestionTask, retryIngestionTask } from '../ingestion/ingestion-service';
import { createHermesResearchRun } from '../agent/research-run';
import { requireNativePaperAuthor } from '../ingestion/native-paper-author';
import { loadDocumentSourceMapReference, parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { projectSharedPaperToJournalDraft } from './shared-projection';

export const JOURNAL_ATTACHMENT_CATEGORIES = ['supplementary', 'data', 'code', 'figure'] as const;
export type JournalAttachmentCategory = (typeof JOURNAL_ATTACHMENT_CATEGORIES)[number];

const noPermissions = () => ({ internalProcessing: false, derivativeGeneration: false, publicSource: false,
  publicDerivative: false, externalProcessing: false, figureReuse: false, derivativeIllustration: false });
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function assertJournalStorageCapacity(deps: WorkspaceDeps, journalId: string, userId: string,
  bytes: Buffer, artifactKey: string) {
  await journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const replay = await tx.artifact.findUnique({ where: { idempotencyKey: artifactKey } });
    if (replay && (replay.workspaceId !== journal.workspaceId || replay.blobSha256 !== sha(bytes)
      || replay.size !== BigInt(bytes.length))) throw new JournalError('IDEMPOTENCY_CONFLICT', '上传标识已用于其他文件');
    const usage = await tx.artifact.aggregate({ where: { workspaceId: journal.workspaceId }, _sum: { size: true } });
    if ((usage._sum.size ?? 0n) + (replay ? 0n : BigInt(bytes.length)) > journal.storageLimitBytes)
      throw new JournalError('INVALID_STATE', '来源存储已达到期刊容量上限');
  });
}

/** A journal's issued RO stays immutable while this private RO remains a draft. */
export async function ensureJournalWorkingResearchObject(deps: WorkspaceDeps, tx: Prisma.TransactionClient,
  journalId: string, article: JournalArticle, userId: string) {
  const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
  if (article.workingResearchObjectId) {
    const existing = await tx.researchObject.findUnique({ where: { id: article.workingResearchObjectId } });
    if (!existing || existing.deletedAt || existing.workspaceId !== journal.workspaceId || existing.status !== 'draft') throw new JournalError('INVALID_STATE', '期刊私有加工空间不可用');
    return existing;
  }
  const metadata = article.metadata as { title?: string };
  const created = await createSystemResearchObjectInTransaction(deps, tx, { workspaceId: journal.workspaceId, userId,
    title: metadata.title || 'Journal paper', idempotencyKey: `system:journal-working:${article.id}` });
  await tx.journalArticle.update({ where: { id: article.id }, data: { workingResearchObjectId: created.id } });
  await tx.journalSharedBinding.create({ data: { articleId: article.id } });
  return created;
}

function attachmentPath(category: JournalAttachmentCategory, filename: string, existing: Set<string>): string {
  const name = filename.replace(/[\\/\p{Cc}]/gu, '_').trim();
  if (!name || name.length > 200) throw new JournalError('VALIDATION_ERROR', '附件名称无效');
  const base = `${category}/${name}`;
  let path = base;
  for (let index = 1; existing.has(path); index++) path = `${base}.${index}`;
  return path;
}

/** Private RO manifests are the file inventory; journal rights and releases remain separate. */
export async function getJournalSharedFiles(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string) {
  const access = await journalScope(deps.prisma, journalId, userId);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (access.membership.role === 'reviewer' && article.assignedReviewerId !== userId) throw new JournalError('JOURNAL_NOT_FOUND', '未分配此论文的审核权限');
  const ro = article.workingResearchObjectId ? await deps.prisma.researchObject.findUnique({ where: { id: article.workingResearchObjectId }, select: { id: true, workspaceId: true, deletedAt: true } }) : null;
  if (ro && (ro.deletedAt || ro.workspaceId !== access.journal.workspaceId)) throw new JournalError('INVALID_STATE', '期刊论文工作区不可用');
  const version = ro ? await deps.prisma.version.findFirst({ where: { researchObjectId: ro.id }, orderBy: { versionNo: 'desc' }, include: { manifest: { include: { entries: true } } } }) : null;
  const binding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId } });
  const ingestion = binding?.ingestionTaskId ? await deps.prisma.ingestionTask.findUnique({ where: { id: binding.ingestionTaskId },
    include: { agentTask: { select: { status: true, progress: true, error: true } } } }) : null;
  const run = binding?.hermesRunId ? await deps.prisma.hermesResearchRun.findUnique({ where: { id: binding.hermesRunId },
    select: { status: true } }) : null;
  const files = (version?.manifest?.entries ?? []).map((entry) => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath,
    category: JOURNAL_ATTACHMENT_CATEGORIES.find((kind) => entry.logicalPath.startsWith(`${kind}/`)) ?? (entry.artifactId === (article.source as { artifactId?: string }).artifactId ? 'source' : 'other') }));
  return { researchObjectId: ro?.id ?? null, publishedResearchObjectId: article.researchObjectId, articleRevision: article.revision, versionId: version?.id ?? null, files,
    sourceArtifactId: (article.source as { artifactId?: string }).artifactId ?? null,
    processing: binding?.ingestionTaskId ? { ingestionTaskId: binding.ingestionTaskId,
      state: ingestion?.state ?? 'unavailable', agentStatus: ingestion?.agentTask?.status ?? null,
      progress: ingestion?.agentTask?.progress ?? null, error: ingestion?.agentTask?.error ?? null,
      hermesRunId: binding.hermesRunId, runStatus: run?.status ?? null,
      confirmedVersionId: binding.confirmedVersionId } : null };
}

/** Only artifacts in the current private journal file manifest are downloadable through this scope. */
export async function getJournalSharedFile(deps: WorkspaceDeps, userId: string, journalId: string,
  articleId: string, artifactId: string) {
  const access = await journalScope(deps.prisma, journalId, userId);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (access.membership.role === 'reviewer' && article.assignedReviewerId !== userId)
    throw new JournalError('JOURNAL_NOT_FOUND', '未分配此论文的审核权限');
  if (!article.workingResearchObjectId) throw new JournalError('JOURNAL_NOT_FOUND', '论文文件不存在');
  const version = await deps.prisma.version.findFirst({ where: { researchObjectId: article.workingResearchObjectId },
    orderBy: { versionNo: 'desc' }, include: { manifest: { include: { entries: true } } } });
  const entry = version?.manifest?.entries.find((item) => item.artifactId === artifactId);
  const artifact = entry ? await deps.prisma.artifact.findUnique({ where: { id: artifactId } }) : null;
  if (!artifact || artifact.deletedAt || artifact.workspaceId !== access.journal.workspaceId)
    throw new JournalError('JOURNAL_NOT_FOUND', '论文文件不存在');
  return { blobSha256: artifact.blobSha256, size: artifact.size, mimeType: artifact.mimeType,
    logicalPath: entry!.logicalPath };
}

/** Uploads and commits an auxiliary file without granting processing or publication rights. */
export async function addJournalSharedAttachment(deps: WorkspaceDeps & { storage: StorageAdapter; malwareScanner?: MalwareScanner }, userId: string,
  journalId: string, articleId: string, input: { revision: number; requestKey: string; category: JournalAttachmentCategory; filename: string; content: Buffer }) {
  if (!JOURNAL_ATTACHMENT_CATEGORIES.includes(input.category) || !input.requestKey.trim()) throw new JournalError('VALIDATION_ERROR', '附件类别或请求标识无效');
  const access = await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (article.contentState !== 'active' || !article.researchObjectId) throw new JournalError('INVALID_STATE', '期刊论文当前不可添加附件');
  const uploadKey = `journal-attachment:${articleId}:${input.requestKey}`;
  await assertJournalStorageCapacity(deps, journalId, userId, input.content, uploadKey);
  const artifact = await createArtifact(deps, { workspaceId: access.journal.workspaceId, uploadedBy: userId,
    logicalPath: `${input.category}/${input.filename}`, content: input.content, idempotencyKey: uploadKey });
  return journalTransaction(deps, journalId, async (tx) => {
    const scoped = { ...deps, prisma: tx as WorkspaceDeps['prisma'] };
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const current = await journalArticleInScope(tx, journalId, articleId);
    const commitKey = `system:journal-attachment:${articleId}:${input.requestKey}`;
    const replay = await tx.commit.findUnique({ where: { idempotencyKey: commitKey }, include: { versions: true } });
    if (replay) {
      if (replay.researchObjectId !== current.workingResearchObjectId || replay.authorId !== userId || !replay.versions[0]) throw new JournalError('IDEMPOTENCY_CONFLICT', '附件请求标识已用于其他论文');
      return { artifact: { artifactId: artifact.artifactId, logicalPath: artifact.logicalPath }, versionId: replay.versions[0].id, articleRevision: current.revision };
    }
    assertArticleRevision(current, input.revision);
    if (current.contentState !== 'active') throw new JournalError('INVALID_STATE', '期刊论文当前不可添加附件');
    const attachmentUsage = await tx.artifact.aggregate({ where: { workspaceId: journal.workspaceId }, _sum: { size: true } });
    if ((attachmentUsage._sum.size ?? 0n) > journal.storageLimitBytes)
      throw new JournalError('INVALID_STATE', '来源存储已达到期刊容量上限');
    if (await tx.journalJob.count({ where: { articleId, state: { in: ['staging', 'pending', 'running'] } } }))
      throw new JournalError('INVALID_STATE', '请先完成此论文正在进行的共享处理');
    const work = await ensureJournalWorkingResearchObject(deps, tx, journalId, current, userId);
    const ro = await tx.researchObject.findUnique({ where: { id: work.id }, include: { sdfDocument: true } });
    if (!ro || ro.deletedAt || ro.workspaceId !== journal.workspaceId || !ro.sdfDocument) throw new JournalError('INVALID_STATE', '期刊论文工作区不可用');
    const latest = await tx.version.findFirst({ where: { researchObjectId: ro.id }, orderBy: { versionNo: 'desc' }, include: { manifest: { include: { entries: true } } } });
    const previous = (latest?.manifest?.entries ?? []).map((entry) => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath }));
    const logicalPath = attachmentPath(input.category, input.filename, new Set(previous.map((entry) => entry.logicalPath)));
    const committed = await createCommit(scoped, { researchObjectId: ro.id, userId, version: ro.version,
      sdfCore: ro.sdfDocument.coreJson as Record<string, unknown>, artifacts: [...previous, { artifactId: artifact.artifactId, logicalPath }],
      message: `Journal attachment: ${logicalPath}`, idempotencyKey: commitKey }, {}, tx);
    await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: committed.versionId });
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: { revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
    await journalArticleEvent(tx, journalId, userId, 'journal.attachment.add', articleId, { artifactId: artifact.artifactId, versionId: committed.versionId, logicalPath });
    return { artifact: { artifactId: artifact.artifactId, logicalPath }, versionId: committed.versionId, articleRevision: updated.revision };
  });
}

/** Stage a paper in the same private RO file manifest; authorization is a later action. */
export async function stageJournalSharedSource(deps: WorkspaceDeps & { storage: StorageAdapter; malwareScanner?: MalwareScanner }, userId: string,
  journalId: string, articleId: string, input: { revision: number; requestKey: string; filename: string; content: Buffer }) {
  const ext = input.filename.split('.').at(-1)?.toLowerCase() ?? '';
  if (!['pdf', 'docx', 'txt', 'md'].includes(ext) || !input.content.length || input.content.length > JOURNAL_FILE_LIMIT)
    throw new JournalError('VALIDATION_ERROR', '支持 PDF、DOCX、TXT 和 Markdown，单文件上限 50 MB');
  validateJournalUploadContent(ext, input.content);
  const access = await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (article.contentState !== 'active') throw new JournalError('INVALID_STATE', '当前论文不能更换正文');
  await assertJournalStorageCapacity(deps, journalId, userId, input.content,
    `journal-shared-source:${articleId}:${input.requestKey}`);
  const artifact = await createArtifact(deps, { workspaceId: access.journal.workspaceId, uploadedBy: userId,
    logicalPath: `journal-sources/${articleId}/${input.requestKey}.${ext}`, content: input.content,
    idempotencyKey: `journal-shared-source:${articleId}:${input.requestKey}` });
  return journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const current = await journalArticleInScope(tx, journalId, articleId);
    const commitKey = `system:journal-shared-source:${articleId}:${input.requestKey}`;
    const replay = await tx.commit.findUnique({ where: { idempotencyKey: commitKey }, include: { versions: true } });
    if (replay) {
      if (replay.researchObjectId !== current.workingResearchObjectId || replay.authorId !== userId || !replay.versions[0])
        throw new JournalError('IDEMPOTENCY_CONFLICT', '正文上传标识已用于其他论文');
      return { artifactId: artifact.artifactId, versionId: replay.versions[0].id, articleRevision: current.revision };
    }
    assertArticleRevision(current, input.revision);
    if (current.contentState !== 'active') throw new JournalError('INVALID_STATE', '当前论文不能更换正文');
    const sourceUsage = await tx.artifact.aggregate({ where: { workspaceId: journal.workspaceId }, _sum: { size: true } });
    if ((sourceUsage._sum.size ?? 0n) > journal.storageLimitBytes)
      throw new JournalError('INVALID_STATE', '来源存储已达到期刊容量上限');
    if (await tx.journalJob.count({ where: { articleId, state: { in: ['staging', 'pending', 'running'] } } }))
      throw new JournalError('INVALID_STATE', '请先完成此论文正在进行的共享处理');
    const work = await ensureJournalWorkingResearchObject(deps, tx, journalId, current, userId);
    const ro = await tx.researchObject.findUnique({ where: { id: work.id }, include: { sdfDocument: true } });
    if (!ro || ro.deletedAt || ro.workspaceId !== journal.workspaceId || !ro.sdfDocument) throw new JournalError('INVALID_STATE', '私有论文工作区不可用');
    const latest = await tx.version.findFirst({ where: { researchObjectId: work.id }, orderBy: { versionNo: 'desc' }, include: { manifest: { include: { entries: true } } } });
    const previous = (latest?.manifest?.entries ?? []).filter((entry) => !entry.logicalPath.startsWith('source/'))
      .map((entry) => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath }));
    const label = input.filename.slice(0, 200);
    const logicalPath = attachmentPath('supplementary', label, new Set(previous.map((entry) => entry.logicalPath))).replace(/^supplementary\//, 'source/');
    const committed = await createCommit({ ...deps, prisma: tx as WorkspaceDeps['prisma'] }, { researchObjectId: work.id,
      userId, version: ro.version, sdfCore: ro.sdfDocument.coreJson as Record<string, unknown>,
      artifacts: [...previous, { artifactId: artifact.artifactId, logicalPath }], message: `Journal source: ${label}`,
      idempotencyKey: commitKey }, {}, tx);
    await freezeResearchRecord(tx, { researchObjectId: work.id, versionId: committed.versionId });
    const oldSource = current.source as unknown as JournalSource;
    const prior = Array.isArray((oldSource as JournalSource & { materials?: JournalArticleSourceRecord[] }).materials)
      ? (oldSource as JournalSource & { materials: JournalArticleSourceRecord[] }).materials : [];
    const material: JournalArticleSourceRecord = { id: randomUUID(), sourceType: 'editor_uploaded_pdf', title: label,
      url: oldSource.url || undefined, fileId: artifact.artifactId, uploadedBy: userId, uploadedAt: new Date().toISOString(),
      rightsStatus: 'unknown', sourceConfidence: 'editor_claimed', permissions: noPermissions(), evidence: { statement: '' },
      activeForGeneration: true, contentSha256: sha('') };
    const source = { kind: 'fulltext', text: '', url: oldSource.url, label, artifactId: artifact.artifactId,
      materials: [...prior.map((item) => ({ ...item, activeForGeneration: false })), material] };
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: { source: journalJson(source), rights: journalJson(EMPTY_RIGHTS),
      draft: Prisma.DbNull, revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
    await tx.journalSharedBinding.upsert({ where: { articleId }, create: { articleId }, update: {} });
    await tx.journalSharedBinding.update({ where: { articleId }, data: { sourceArtifactId: artifact.artifactId,
      sourceBlobSha256: artifact.blobSha256, sourceDigest: journalDigest(source), sourceRevision: updated.revision,
      actorId: userId, ingestionTaskId: null, hermesRunId: null, confirmedVersionId: null } });
    await journalArticleEvent(tx, journalId, userId, 'journal.shared_source.stage', articleId,
      { artifactId: artifact.artifactId, versionId: committed.versionId, sourceRevision: updated.revision });
    return { artifactId: artifact.artifactId, versionId: committed.versionId, articleRevision: updated.revision };
  });
}

/** The staged file is inert until the editor records a valid source licence. */
export async function startJournalSharedProcessing(deps: IngestionDeps, userId: string, journalId: string,
  articleId: string, input: { revision: number; requestKey: string; processingConsent: true }) {
  if (input.processingConsent !== true) throw new JournalError('FORBIDDEN', '请先明确同意对当前正文进行 AI 处理');
  if (!input.requestKey.trim() || input.requestKey.length > 120)
    throw new JournalError('VALIDATION_ERROR', '论文处理请求标识无效');
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  assertArticleRevision(article, input.revision);
  const binding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId } });
  const source = article.source as unknown as JournalSource;
  if (!article.workingResearchObjectId || !binding?.sourceArtifactId || source.artifactId !== binding.sourceArtifactId
    || !journalSourceProcessingAllowed(article, false)) throw new JournalError('FORBIDDEN', '当前正文尚无有效的内部处理授权');
  const artifactId = binding.sourceArtifactId;
  const workRoId = article.workingResearchObjectId;
  const batch = await createIngestionBatchFromArtifact(deps, {
    userId, researchObjectId: workRoId, artifactId,
    idempotencyKey: `journal-shared-ingest:${articleId}:${input.requestKey}`,
    journalSponsorship: { reserve: async (tx) => {
      // Share the journal row lock with submitJournalJob: capacity and grant reservation are serialized.
      await tx.$queryRaw`SELECT id FROM journals WHERE id = ${journalId}::uuid FOR UPDATE`;
      await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
      const current = await journalArticleInScope(tx, journalId, articleId);
      assertArticleRevision(current, input.revision);
      if (current.workingResearchObjectId !== workRoId || (current.source as unknown as JournalSource).artifactId !== artifactId
        || !journalSourceProcessingAllowed(current, true)) throw new JournalError('FORBIDDEN', '正文缺少有效的 AI 处理授权');
      const jobKey = `shared-ingestion:${articleId}:${input.requestKey}`;
      const replay = await tx.journalJob.findUnique({ where: { journalId_requestKey: { journalId, requestKey: jobKey } } });
      if (replay) {
        if (replay.kind !== 'shared_ingestion' || replay.articleId !== articleId || replay.requestedBy !== userId
          || replay.revision !== input.revision || replay.sourceDigest !== journalDigest(current.source) || !replay.grantId
          || !['running', 'succeeded'].includes(replay.state)) throw new JournalError('IDEMPOTENCY_CONFLICT', '期刊额度请求标识已用于其他正文');
        return replay.id;
      }
      if (await tx.journalJob.count({ where: { journalId, state: { in: ['staging', 'pending', 'running'] } } }) >= 100)
        throw new JournalError('INVALID_STATE', '期刊作业队列已满');
      const journal = await tx.journal.findUniqueOrThrow({ where: { id: journalId } });
      if (await tx.journalJob.count({ where: { journalId, state: 'running' } }) >= journal.maxRunningJobs)
        throw new JournalError('INVALID_STATE', '期刊正在处理的论文数已达上限，请稍后再试');
      const grants = await tx.journalGrant.findMany({ where: { journalId, expiresAt: { gt: new Date() }, remaining: { gt: 0 } },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
      const grant = grants.find((item) => item.remaining > item.reserved);
      if (!grant) throw new JournalError('INSUFFICIENT_CREDITS', '期刊没有可用的论文处理额度');
      await tx.journalGrant.update({ where: { id: grant.id }, data: { reserved: { increment: 1 } } });
      const job = await tx.journalJob.create({ data: { journalId, articleId, grantId: grant.id, kind: 'shared_ingestion',
        requestedBy: userId, requestKey: jobKey, state: 'running', revision: current.revision,
        sourceDigest: journalDigest(current.source), language: 'zh' } });
      await tx.journalLedger.create({ data: { journalId, grantId: grant.id, jobId: job.id,
        kind: 'reserve', amount: 1, eventKey: `reserve:${job.id}` } });
      return job.id;
    } },
    beforeDispatch: async (tx, ingestionTaskId) => {
      await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
      const current = await journalArticleInScope(tx, journalId, articleId);
      assertArticleRevision(current, input.revision);
      const currentBinding = await tx.journalSharedBinding.findUnique({ where: { articleId } });
      const currentArtifact = await tx.artifact.findUnique({ where: { id: artifactId } });
      if (!currentBinding || currentBinding.sourceArtifactId !== artifactId || !currentArtifact
        || currentArtifact.blobSha256 !== currentBinding.sourceBlobSha256
        || current.workingResearchObjectId !== workRoId
        || (current.source as unknown as JournalSource).artifactId !== artifactId
        || !journalSourceProcessingAllowed(current, false)) throw new JournalError('FORBIDDEN', '正文或授权已变化，请重新检查');
      if (currentBinding.ingestionTaskId && currentBinding.ingestionTaskId !== ingestionTaskId)
        throw new JournalError('INVALID_STATE', '当前正文已有解析任务');
      const sponsorship = await tx.journalJob.findUnique({ where: { journalId_requestKey: {
        journalId, requestKey: `shared-ingestion:${articleId}:${input.requestKey}` } } });
      if (!sponsorship || sponsorship.kind !== 'shared_ingestion' || sponsorship.requestedBy !== userId
        || !['running', 'succeeded'].includes(sponsorship.state)
        || ((sponsorship.result as { ingestionTaskId?: string } | null)?.ingestionTaskId
          && (sponsorship.result as { ingestionTaskId: string }).ingestionTaskId !== ingestionTaskId))
        throw new JournalError('INVALID_STATE', '共享任务与期刊额度预留不匹配');
      await tx.journalJob.update({ where: { id: sponsorship.id }, data: {
        result: journalJson({ ingestionTaskId }) } });
      await tx.journalSharedBinding.update({ where: { articleId }, data: { sourceRevision: current.revision,
        sourceDigest: journalDigest(current.source), actorId: userId, ingestionTaskId } });
      await journalArticleEvent(tx, journalId, userId, 'journal.shared_source.process', articleId,
        { artifactId, ingestionTaskId, sourceRevision: current.revision });
    },
  });
  const taskId = batch.tasks.find((task) => task.artifactId === artifactId)?.id;
  if (!taskId) throw new JournalError('INVALID_STATE', '共享解析任务未绑定正文');
  const run = await createHermesResearchRun(deps, { actorId: userId, researchObjectId: workRoId,
    ingestionTaskIds: [taskId], idempotencyKey: `journal-shared-run:${articleId}:${input.requestKey}` });
  await journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const current = await journalArticleInScope(tx, journalId, articleId);
    const currentBinding = await tx.journalSharedBinding.findUnique({ where: { articleId } });
    if (current.revision !== input.revision || currentBinding?.sourceArtifactId !== artifactId
      || currentBinding.ingestionTaskId !== taskId || current.workingResearchObjectId !== workRoId)
      throw new JournalError('REVISION_CONFLICT', '正文或授权已变化');
    if (currentBinding.hermesRunId && currentBinding.hermesRunId !== run.id)
      throw new JournalError('INVALID_STATE', '当前正文已有理解任务');
    await tx.journalSharedBinding.update({ where: { articleId }, data: { hermesRunId: run.id } });
  });
  return { ...batch, run };
}

/** Recover the no-cost run link after a crash between ingestion dispatch and run creation. */
export async function repairJournalSharedRunBindings(deps: IngestionDeps) {
  const jobs = await deps.prisma.journalJob.findMany({ where: { kind: 'shared_ingestion', state: 'running' },
    orderBy: { createdAt: 'asc' }, take: 100 });
  for (const job of jobs) {
    const article = await deps.prisma.journalArticle.findUnique({ where: { id: job.articleId } });
    const binding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId: job.articleId } });
    if (!article?.workingResearchObjectId || !binding?.ingestionTaskId || binding.hermesRunId
      || binding.actorId !== job.requestedBy || article.revision !== job.revision
      || binding.sourceDigest !== journalDigest(article.source) || job.sourceDigest !== journalDigest(article.source)
      || (job.result as { ingestionTaskId?: string } | null)?.ingestionTaskId !== binding.ingestionTaskId
      || !journalSourceProcessingAllowed(article, true)) continue;
    const requestPrefix = `shared-ingestion:${job.articleId}:`;
    if (!job.requestKey.startsWith(requestPrefix)) continue;
    const task = await deps.prisma.ingestionTask.findUnique({ where: { id: binding.ingestionTaskId }, include: { batch: true } });
    if (!task || task.batch.researchObjectId !== article.workingResearchObjectId
      || !['queued', 'parsing', 'needs_review'].includes(task.state)) continue;
    try {
      await journalScope(deps.prisma, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
      const run = await createHermesResearchRun(deps, { actorId: job.requestedBy,
        researchObjectId: article.workingResearchObjectId, ingestionTaskIds: [task.id],
        idempotencyKey: `journal-shared-run:${job.articleId}:${job.requestKey.slice(requestPrefix.length)}` });
      await journalTransaction(deps, job.journalId, async (tx) => {
        await journalScope(tx, job.journalId, job.requestedBy, JOURNAL_EDIT_ROLES, true);
        const current = await journalArticleInScope(tx, job.journalId, job.articleId);
        const bound = await tx.journalSharedBinding.findUnique({ where: { articleId: job.articleId } });
        if (current.revision !== job.revision || journalDigest(current.source) !== job.sourceDigest
          || bound?.ingestionTaskId !== task.id || bound.hermesRunId || !journalSourceProcessingAllowed(current, true)) return;
        await tx.journalSharedBinding.update({ where: { articleId: job.articleId }, data: { hermesRunId: run.id } });
      });
    } catch { /* Reconcile the same key later; never redispatch or charge the source task. */ }
  }
}

/** Retry the same bound task under the shared ingestion retry policy; never upload or charge implicitly. */
export async function retryJournalSharedProcessing(deps: IngestionDeps, userId: string, journalId: string,
  articleId: string, input: { revision: number; requestKey: string; processingConsent: true }) {
  if (input.processingConsent !== true || !input.requestKey.trim() || input.requestKey.length > 120)
    throw new JournalError('FORBIDDEN', '请明确同意重试当前正文的 AI 处理');
  await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  assertArticleRevision(article, input.revision);
  const binding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId } });
  if (!binding?.ingestionTaskId || !binding.sourceArtifactId || binding.actorId !== userId
    || binding.sourceRevision !== article.revision || binding.sourceDigest !== journalDigest(article.source)
    || article.workingResearchObjectId === null || (article.source as unknown as JournalSource).artifactId !== binding.sourceArtifactId
    || !journalSourceProcessingAllowed(article, true)) throw new JournalError('FORBIDDEN', '正文或授权已变化');
  const task = await deps.prisma.ingestionTask.findUnique({ where: { id: binding.ingestionTaskId }, include: { artifact: true, batch: true } });
  if (!task || task.batch.researchObjectId !== article.workingResearchObjectId || task.artifactId !== binding.sourceArtifactId
    || task.artifact.blobSha256 !== binding.sourceBlobSha256)
    throw new JournalError('INVALID_STATE', '当前正文任务不符合安全重试条件');
  const originalRun = binding.hermesRunId ? await deps.prisma.hermesResearchRun.findUnique({ where: { id: binding.hermesRunId } }) : null;
  if (binding.hermesRunId && (!originalRun || originalRun.researchObjectId !== article.workingResearchObjectId
    || originalRun.actorId !== userId)) throw new JournalError('INVALID_STATE', '共享理解任务绑定已变化');
  const needsTaskRetry = task.state === 'failed_retryable';
  if (needsTaskRetry && task.retryCount > 0)
    throw new JournalError('INSUFFICIENT_CREDITS', '当前任务的免费恢复次数已用尽，请重新提交正文并申请新的期刊处理额度');
  if (!needsTaskRetry && !(originalRun && ['failed', 'stopped'].includes(originalRun.status)
    && ['queued', 'parsing', 'needs_review'].includes(task.state)))
    throw new JournalError('INVALID_STATE', '当前正文任务不符合安全重试条件');
  const retried = needsTaskRetry ? await retryIngestionTask(deps, { userId, taskId: task.id })
    : { id: task.id, state: task.state };
  const run = originalRun && !['failed', 'stopped'].includes(originalRun.status) ? originalRun
    : await createHermesResearchRun(deps, { actorId: userId, researchObjectId: article.workingResearchObjectId,
      ingestionTaskIds: [task.id], idempotencyKey: `journal-shared-retry-run:${articleId}:${input.requestKey}` });
  await journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const current = await journalArticleInScope(tx, journalId, articleId);
    assertArticleRevision(current, input.revision);
    const bound = await tx.journalSharedBinding.findUnique({ where: { articleId } });
    if (bound?.ingestionTaskId !== task.id || bound.sourceDigest !== journalDigest(current.source)
      || bound.sourceArtifactId !== task.artifactId || !journalSourceProcessingAllowed(current, true))
      throw new JournalError('REVISION_CONFLICT', '正文或授权已变化');
    const oldRun = bound.hermesRunId ? await tx.hermesResearchRun.findUnique({ where: { id: bound.hermesRunId } }) : null;
    if (oldRun && oldRun.id !== run.id && !['failed', 'stopped'].includes(oldRun.status))
      throw new JournalError('INVALID_STATE', '已有活跃理解任务');
    await tx.journalSharedBinding.update({ where: { articleId }, data: { hermesRunId: run.id } });
  });
  return { task: retried, run };
}

async function sharedCandidate(deps: IngestionDeps, userId: string, journalId: string, articleId: string,
  language: 'zh' | 'en') {
  await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  const binding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId } });
  if (!binding?.ingestionTaskId || !binding.hermesRunId || !binding.sourceArtifactId || binding.confirmedVersionId
    || binding.sourceRevision !== article.revision || binding.sourceDigest !== journalDigest(article.source)
    || binding.sourceArtifactId !== (article.source as unknown as JournalSource).artifactId
    || !journalSourceProcessingAllowed(article, true)) throw new JournalError('FORBIDDEN', '正文或授权已变化');
  const task = await deps.prisma.ingestionTask.findUnique({ where: { id: binding.ingestionTaskId },
    include: { artifact: true, agentTask: true, batch: true } });
  if (!task || task.batch.researchObjectId !== article.workingResearchObjectId
    || task.artifactId !== binding.sourceArtifactId || task.artifact.blobSha256 !== binding.sourceBlobSha256
    || !task.agentTask || task.agentTask.id !== task.agentTaskId || task.agentTask.status !== 'succeeded'
    || !['needs_review', 'confirmed'].includes(task.state))
    throw new JournalError('INVALID_STATE', 'Native 论文自校尚未就绪');
  requireNativePaperAuthor(task.agentTask);
  const result = task.agentTask.result as Record<string, unknown>;
  const reference = parseDocumentSourceMapReference(result.sourceMapRef);
  if (reference.parserStatus !== 'succeeded' || reference.artifactId !== task.artifactId
    || reference.contentHash !== task.artifact.blobSha256) throw new JournalError('INVALID_STATE', '解析页码与正文文件不匹配');
  const map = await loadDocumentSourceMapReference(deps.storage, reference);
  const text = map.pages.flatMap((page) => page.blocks.flatMap((block) => {
    const value = block.text?.trim(); return value ? [value] : [];
  })).join('\n');
  if (text.trim().length < 50 || text.length > 5_000_000) throw new JournalError('INVALID_STATE', '正文解析结果不可用于六字段确认');
  const source = { ...(article.source as unknown as JournalSource), text, sourceMapRef: reference };
  const draft = projectSharedPaperToJournalDraft(result, source, language);
  return { article, binding, task, source, draft };
}

/** Candidate is read-only; human confirmation commits one shared RO version and editorial projection. */
export async function getJournalSharedCandidate(deps: IngestionDeps, userId: string, journalId: string,
  articleId: string, language: 'zh' | 'en') {
  const candidate = await sharedCandidate(deps, userId, journalId, articleId, language);
  return { articleRevision: candidate.article.revision, ingestionTaskId: candidate.task.id,
    runId: candidate.binding.hermesRunId, core: candidate.draft.core, draft: candidate.draft };
}

export async function confirmJournalSharedInterpretation(deps: IngestionDeps, userId: string, journalId: string,
  articleId: string, input: { revision: number; language: 'zh' | 'en' }) {
  await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  const previous = await journalArticleInScope(deps.prisma, journalId, articleId);
  const previousBinding = await deps.prisma.journalSharedBinding.findUnique({ where: { articleId } });
  if (previousBinding?.confirmedVersionId && previousBinding.hermesRunId && previous.revision === input.revision + 1
    && previousBinding.sourceRevision === previous.revision && previousBinding.sourceDigest === journalDigest(previous.source)
    && (previous.draft as { language?: string } | null)?.language === input.language) {
    return { articleRevision: previous.revision, versionId: previousBinding.confirmedVersionId,
      runId: previousBinding.hermesRunId, draft: previous.draft };
  }
  const candidate = await sharedCandidate(deps, userId, journalId, articleId, input.language);
  assertArticleRevision(candidate.article, input.revision);
  const workRoId = candidate.article.workingResearchObjectId!;
  const runId = candidate.binding.hermesRunId!;
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: workRoId } });
  if (!ro || ro.status !== 'draft') throw new JournalError('INVALID_STATE', '期刊论文工作区不可用');
  let projected: { articleRevision: number; versionId: string; runId: string; draft: typeof candidate.draft } | undefined;
  const verify = async (tx: Prisma.TransactionClient, versionId?: string) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const current = await journalArticleInScope(tx, journalId, articleId);
    assertArticleRevision(current, input.revision);
    const binding = await tx.journalSharedBinding.findUnique({ where: { articleId } });
    const run = await tx.hermesResearchRun.findUnique({ where: { id: runId }, include: { steps: true } });
    const version = versionId ? await tx.version.findUnique({ where: { id: versionId } }) : null;
    if (!binding || binding.sourceArtifactId !== candidate.task.artifactId || binding.sourceRevision !== current.revision
      || binding.sourceDigest !== journalDigest(current.source) || binding.ingestionTaskId !== candidate.task.id
      || binding.hermesRunId !== runId || current.workingResearchObjectId !== workRoId
      || !journalSourceProcessingAllowed(current, true) || (versionId && (!version || version.researchObjectId !== workRoId))
      || !run || run.actorId !== binding.actorId || run.researchObjectId !== workRoId || run.profile !== null
      || run.status !== 'awaiting_source_review' || binding.confirmedVersionId
      || run.steps.filter((step) => step.stage === 'source_ingestion').length !== 1
      || !run.steps.some((step) => step.stage === 'source_ingestion' && step.ingestionTaskId === candidate.task.id
        && step.agentTaskId === candidate.task.agentTaskId && step.artifactId === candidate.task.artifactId))
      throw new JournalError('REVISION_CONFLICT', '来源、权限或共享理解任务已变化');
    return current;
  };
  await confirmIngestionTask(deps, { userId, taskId: candidate.task.id, version: ro.version,
    sourceAgentTaskId: candidate.task.agentTaskId!,
    core: (candidate.task.agentTask!.result as { core: Record<string, string> }).core }, {}, {
    before: async (tx) => { await verify(tx); },
    after: async (tx, confirmation) => {
    await verify(tx, confirmation.versionId);
    const source = { ...candidate.source, materials: (candidate.source as JournalSource & { materials?: JournalArticleSourceRecord[] }).materials?.map(
      (material) => material.activeForGeneration ? { ...material, contentSha256: sha(candidate.source.text) } : material) };
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: { source: journalJson(source), draft: journalJson(candidate.draft),
      revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
    await tx.journalSharedBinding.update({ where: { articleId }, data: { sourceDigest: journalDigest(source),
      sourceRevision: updated.revision, confirmedVersionId: confirmation.versionId } });
    const sponsorships = (await tx.journalJob.findMany({ where: { journalId, articleId, kind: 'shared_ingestion',
      state: { in: ['running', 'succeeded'] }, revision: input.revision, sourceDigest: journalDigest(candidate.article.source) } }))
      .filter((job) => (job.result as { ingestionTaskId?: string } | null)?.ingestionTaskId === candidate.task.id);
    if (sponsorships.length !== 1 || !sponsorships[0]!.grantId || sponsorships[0]!.requestedBy !== candidate.binding.actorId)
      throw new JournalError('INVALID_STATE', '期刊额度预留与共享任务不匹配');
    const sponsorship = sponsorships[0]!;
    if (sponsorship.state === 'running') {
      await tx.journalGrant.update({ where: { id: sponsorship.grantId! }, data: {
        reserved: { decrement: 1 }, remaining: { decrement: 1 }, consumed: { increment: 1 } } });
      await tx.journalLedger.create({ data: { journalId, grantId: sponsorship.grantId!, jobId: sponsorship.id,
        kind: 'consume', amount: 1, eventKey: `settle:${sponsorship.id}` } });
    }
    await tx.journalJob.update({ where: { id: sponsorship.id }, data: { state: 'succeeded',
      result: journalJson({ ingestionTaskId: candidate.task.id, versionId: confirmation.versionId }) } });
    await tx.hermesResearchRun.update({ where: { id: runId }, data: {
      status: 'succeeded', versionId: confirmation.versionId, lastReconciledAt: new Date(), version: { increment: 1 } } });
    await journalArticleEvent(tx, journalId, userId, 'journal.shared_interpretation.confirm', articleId,
      { ingestionTaskId: candidate.task.id, runId, versionId: confirmation.versionId, articleRevision: updated.revision });
    projected = { articleRevision: updated.revision, versionId: confirmation.versionId, runId, draft: candidate.draft };
    },
  });
  if (!projected) throw new JournalError('INVALID_STATE', '共享确认未完成');
  return projected;
}
