import { Prisma, type JournalArticle } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { createSystemResearchObjectInTransaction } from '../research-object/research-objects';
import { publicVersionNumber } from '../publish/publication-metadata';
import { JournalError } from './contracts';
import { EMPTY_RIGHTS, JOURNAL_CORE_FIELDS, journalDigest, normalizeJournalDoi, safeJournalUrl, validateJournalDraft, validateJournalSource, type JournalMetadata, type JournalSource, type JournalRights, type JournalDraft } from './content';
import { assertJournalReviewCapability, journalSourceMaterials } from './enhancements';

export type JournalTx = Prisma.TransactionClient;
export const JOURNAL_EDIT_ROLES = ['owner', 'maintainer', 'author'];
export const JOURNAL_READ_ROLES = [...JOURNAL_EDIT_ROLES, 'reviewer'];
export const journalJson = (value: unknown) => value as Prisma.InputJsonValue;
export async function journalTransaction<T>(deps: Pick<WorkspaceDeps, 'prisma'>, journalId: string, fn: (tx: JournalTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await deps.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM journals WHERE id = ${journalId}::uuid FOR UPDATE`;
        return fn(tx);
      }, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) continue;
      throw error;
    }
  }
}
export async function journalScope(tx: JournalTx, journalId: string, userId: string, roles = JOURNAL_READ_ROLES, active = false) {
  const journal = await tx.journal.findUnique({ where: { id: journalId }, include: { identifiers: true, workspace: true } });
  const member = journal && await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: journal.workspaceId, userId } } });
  const user = member && await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!journal || !member || !user || ['suspended', 'deleted', 'invited'].includes(user.status)) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在或无访问权限');
  if (!roles.includes(member.role)) throw new JournalError('FORBIDDEN', '当前角色无权进行此操作');
  if (active && (journal.operationalState !== 'active' || journal.workspace.status !== 'active')) throw new JournalError('INVALID_STATE', '期刊当前暂停新的编辑、加工和发布');
  return { journal, membership: member };
}
export async function journalArticleInScope(tx: JournalTx, journalId: string, articleId: string) {
  const article = await tx.journalArticle.findFirst({ where: { id: articleId, journalId } });
  if (!article) throw new JournalError('JOURNAL_NOT_FOUND', '论文不存在或无访问权限');
  return article;
}
export function assertArticleRevision(article: JournalArticle, revision: number) {
  if (article.revision !== revision) throw new JournalError('REVISION_CONFLICT', '论文已被更新，请刷新后比较修改');
}
export function articleReviewDigest(article: Pick<JournalArticle, 'metadata' | 'source' | 'rights' | 'draft'>) {
  return journalDigest({ metadata: article.metadata, source: article.source, rights: article.rights, draft: article.draft });
}
export async function journalArticleEvent(tx: JournalTx, journalId: string, userId: string, action: string, targetId: string, after: unknown = {}) {
  await tx.journalEvent.create({ data: { journalId, actorId: userId, action, targetId, targetType: 'article', after: journalJson(after) } });
}
function validatedMetadata(input: JournalMetadata): JournalMetadata {
  if (!input.title?.trim() || input.title.length > 200 || !Array.isArray(input.authors) || input.authors.length > 200 || input.authors.some((a) => typeof a !== 'string' || a.length > 300)) throw new JournalError('VALIDATION_ERROR', '论文标题或作者信息无效');
  if (input.publishedDate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(input.publishedDate)) throw new JournalError('VALIDATION_ERROR', '原文日期应为 YYYY、YYYY-MM 或 YYYY-MM-DD');
  return { ...input, title: input.title.trim(), ...(input.doi ? { doi: normalizeJournalDoi(input.doi) } : {}), originalUrl: safeJournalUrl(input.originalUrl), issns: (input.issns ?? []).map((s) => s.replace(/-/g, '').toUpperCase()) };
}
function assertJournalMetadata(metadata: JournalMetadata, journal: { identifiers: Array<{ value: string }>; nameZh: string | null; nameEn: string | null }) {
  if (!metadata.issns.length && !metadata.journalTitle?.trim()) throw new JournalError('VALIDATION_ERROR', '请填写原文期刊名称或 ISSN 以核对归属');
  const own = journal.identifiers.map((i) => i.value);
  if (metadata.issns.length && !metadata.issns.some((issn) => own.includes(issn))) throw new JournalError('VALIDATION_ERROR', '来源 ISSN 属于其他期刊，请核对归属');
  if (!metadata.issns.length && metadata.journalTitle && ![journal.nameZh, journal.nameEn].some((name) => name?.trim().toLowerCase() === metadata.journalTitle?.trim().toLowerCase())) throw new JournalError('VALIDATION_ERROR', '来源期刊名称不匹配，需先核对');
}
export async function previewJournalArticle(deps: WorkspaceDeps, userId: string, journalId: string, input: JournalMetadata) {
  const metadata = validatedMetadata(input);
  const { journal } = await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES, true);
  assertJournalMetadata(metadata, journal);
  const existing = metadata.doi ? await deps.prisma.journalArticle.findFirst({ where: { journalId, work: { doi: metadata.doi } } }) : null;
  return { metadata, status: existing ? 'duplicate' as const : 'ready' as const, articleId: existing?.id };
}
export async function importJournalArticle(deps: WorkspaceDeps, userId: string, journalId: string, input: JournalMetadata) {
  const metadata = validatedMetadata(input);
  return journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    assertJournalMetadata(metadata, journal);
    const work = metadata.doi ? await tx.journalWork.upsert({ where: { doi: metadata.doi }, create: { doi: metadata.doi }, update: {} }) : await tx.journalWork.create({ data: {} });
    const existing = await tx.journalArticle.findUnique({ where: { journalId_workId: { journalId, workId: work.id } } });
    if (existing) return { article: existing, duplicate: true };
    if (await tx.journalArticle.count({ where: { journalId } }) >= journal.directoryLimit) throw new JournalError('INVALID_STATE', '期刊目录已达到容量上限');
    // Create a journal-owned interpretation. A DOI match never grants access to another RO.
    const ro = await createSystemResearchObjectInTransaction(deps, tx, { workspaceId: journal.workspaceId, userId, title: metadata.title, idempotencyKey: `system:journal:${journalId}:${work.id}` });
    const source: JournalSource = { kind: metadata.abstract ? 'abstract' : 'metadata', text: metadata.abstract ?? '', url: metadata.originalUrl, label: metadata.abstract ? '导入摘要，需核验来源许可' : '仅书目元数据' };
    const article = await tx.journalArticle.create({ data: { journalId, workId: work.id, researchObjectId: ro.id, metadata: journalJson(metadata), source: journalJson(source), rights: journalJson(EMPTY_RIGHTS) } });
    await journalArticleEvent(tx, journalId, userId, 'journal.article.import', article.id, { doi: metadata.doi ?? null });
    return { article, duplicate: false };
  });
}
export async function getManagedJournalArticle(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string) {
  const access = await journalScope(deps.prisma, journalId, userId);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (access.membership.role === 'reviewer' && article.assignedReviewerId !== userId) throw new JournalError('JOURNAL_NOT_FOUND', '未分配此论文的审核权限');
  const [releases, jobs] = await Promise.all([
    txReleases(deps.prisma, articleId), deps.prisma.journalJob.findMany({ where: { articleId, journalId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  return { ...article, releases, jobs: jobs.map((job) => ({
    id: job.id, journalId: job.journalId, articleId: job.articleId, requestedBy: job.requestedBy,
    requestKey: job.requestKey, state: job.state, kind: job.kind, revision: job.revision, language: job.language,
    error: job.error, retryOf: job.retryOf, createdAt: job.createdAt, updatedAt: job.updatedAt,
    ...(job.kind === 'generate' && job.state === 'failed' && job.result && (article.rights as unknown as JournalRights).internalProcessing ? { comparisonDraft: job.result } : {}),
  })) };
}
export async function txReleases(tx: JournalTx, articleId: string, publishedOnly = false) {
  const rows = await tx.journalRelease.findMany({ where: { articleId, ...(publishedOnly ? { version: { status: 'published', researchObject: { visibility: 'public' } } } : {}) }, orderBy: { publishedAt: 'desc' }, include: { version: { include: { researchObject: true } } } });
  return rows.map((r) => {
    const draft = (r.snapshot as unknown as { draft?: { scope?: unknown } }).draft;
    const scope = draft?.scope === 'abstract' || draft?.scope === 'fulltext' ? draft.scope : null;
    const versionNo = publicVersionNumber(r.version);
    if (versionNo === null) throw new JournalError('INVALID_STATE', '期刊公开版本编号缺失');
    return { id: r.id, revision: r.revision, versionNo, publicId: r.version.researchObject.publicId, publishedAt: r.publishedAt, scope, url: `/research/${r.version.researchObject.publicId}/v/${versionNo}` };
  });
}
export async function updateJournalArticle(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; metadata?: JournalMetadata; directoryVisible?: boolean; source?: JournalSource; rights?: JournalRights; draft?: JournalDraft }) {
  return journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const article = await journalArticleInScope(tx, journalId, articleId);
    assertArticleRevision(article, input.revision);
    if (article.contentState !== 'active') throw new JournalError('INVALID_STATE', '受限或撤回论文不可编辑');
    const existingMaterials = journalSourceMaterials(article.source);
    if (existingMaterials.length && input.rights !== undefined) throw new JournalError('REVISION_CONFLICT', '此论文已启用来源矩阵，请在来源与版权接口更新逐项授权');
    const metadata = input.metadata ? validatedMetadata(input.metadata) : article.metadata as unknown as JournalMetadata;
    assertJournalMetadata(metadata, journal);
    if (metadata.doi !== (article.metadata as unknown as JournalMetadata).doi) throw new JournalError('VALIDATION_ERROR', '更改 DOI 需要重新导入，以保留论文身份');
    const currentSource = article.source as unknown as JournalSource;
    const source = input.source ? { ...input.source, ...(currentSource.artifactId ? { artifactId: currentSource.artifactId } : {}), ...(existingMaterials.length ? { materials: existingMaterials } : {}) } as JournalSource : currentSource;
    if (input.source) validateJournalSource(source);
    const provenanceChanged = input.source !== undefined && journalDigest({ kind: source.kind, text: source.text, url: source.url, artifactId: source.artifactId }) !== journalDigest({ kind: currentSource.kind, text: currentSource.text, url: currentSource.url, artifactId: currentSource.artifactId });
    const rights = input.rights ?? (existingMaterials.length && provenanceChanged ? EMPTY_RIGHTS : article.rights as unknown as JournalRights);
    if (input.draft && (!rights.internalProcessing || !rights.derivativeGeneration)) throw new JournalError('FORBIDDEN', '保存衍生解读需要内部加工及衍生生成许可');
    if (Object.values(rights).some((v) => typeof v !== 'string' && typeof v !== 'boolean') || ((rights.derivativeGeneration || rights.publicDerivative || rights.publicSource) && (!rights.license.trim() || !rights.evidence.trim()))) throw new JournalError('VALIDATION_ERROR', '请填写明确的许可及核验依据');
    const sourceChanged = journalDigest(source) !== journalDigest(article.source);
    const draft = input.draft ? validateJournalDraft(input.draft, source) : sourceChanged ? null : article.draft;
    const changed = input.metadata !== undefined || input.source !== undefined || input.rights !== undefined || input.draft !== undefined;
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: {
      metadata: journalJson(metadata), source: journalJson(source), rights: journalJson(rights), draft: draft === null ? Prisma.DbNull : journalJson(draft),
      directoryVisible: input.directoryVisible, ...(changed ? { revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } : {}),
    } });
    if (sourceChanged || input.rights) {
      // Source permission withdrawal also closes existing derivative access immediately.
      if (!rights.publicDerivative && await tx.journalRelease.count({ where: { articleId } })) {
        await tx.researchObject.update({ where: { id: article.researchObjectId }, data: { visibility: 'private', status: 'restricted' } });
        await tx.version.updateMany({ where: { researchObjectId: article.researchObjectId, status: 'published' }, data: { status: 'restricted' } });
      }
    }
    await journalArticleEvent(tx, journalId, userId, 'journal.article.update', articleId, {
      revision: updated.revision, sourceChanged, sourceDigest: journalDigest(source), rightsDigest: journalDigest(rights),
      previousSourceDigest: journalDigest(article.source), previousRightsDigest: journalDigest(article.rights),
    });
    return updated;
  });
}
export async function reviewJournalArticle(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; decision: 'submit' | 'approve' | 'request_changes'; note: string }) {
  return journalTransaction(deps, journalId, async (tx) => {
    const access = await journalScope(tx, journalId, userId, input.decision === 'submit' ? JOURNAL_EDIT_ROLES : ['owner', 'maintainer', 'reviewer'], true);
    const article = await journalArticleInScope(tx, journalId, articleId);
    if (access.membership.role === 'reviewer' && article.assignedReviewerId !== userId) throw new JournalError('FORBIDDEN', '只能审核分配给自己的论文');
    assertArticleRevision(article, input.revision);
    if (article.contentState !== 'active' || !article.draft) throw new JournalError('INVALID_STATE', '需要可审核的解读草稿');
    assertJournalReviewCapability(article, deps.now?.() ?? new Date());
    validateJournalDraft(article.draft, article.source as unknown as JournalSource);
    if (input.decision !== 'submit' && article.reviewState !== 'submitted') throw new JournalError('INVALID_STATE', '请先提交当前版本审核');
    const approved = input.decision === 'approve';
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: { reviewState: approved ? 'approved' : input.decision === 'submit' ? 'submitted' : 'changes_requested', reviewedRevision: approved ? article.revision : null, reviewedDigest: approved ? articleReviewDigest(article) : null, reviewedBy: approved ? userId : null, reviewNote: input.note } });
    await journalArticleEvent(tx, journalId, userId, `journal.review.${input.decision}`, articleId, { revision: article.revision, note: input.note });
    const owner = await tx.workspace.findUnique({ where: { id: (await tx.journal.findUniqueOrThrow({ where: { id: journalId } })).workspaceId } });
    if (owner) await tx.notification.create({ data: { userId: owner.ownerId, type: 'journal.review', payload: { journalId, articleId, decision: input.decision } } });
    return updated;
  });
}
export function emptyJournalCore() { return Object.fromEntries(JOURNAL_CORE_FIELDS.map((key) => [key, ''])); }

export async function assignJournalReviewer(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; reviewerId: string }) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, ['owner', 'maintainer'], true);
    await journalScope(tx, journalId, input.reviewerId, ['owner', 'maintainer', 'reviewer'], true);
    const article = await journalArticleInScope(tx, journalId, articleId); assertArticleRevision(article, input.revision);
    const updated = await tx.journalArticle.update({ where: { id: articleId }, data: { assignedReviewerId: input.reviewerId, reviewState: 'draft', reviewedBy: null, reviewedRevision: null, reviewedDigest: null, revision: { increment: 1 } } });
    await journalArticleEvent(tx, journalId, userId, 'journal.reviewer.assign', articleId, { reviewerId: input.reviewerId });
    await tx.notification.create({ data: { userId: input.reviewerId, type: 'journal.review.assigned', payload: { journalId, articleId } } });
    return updated;
  });
}
