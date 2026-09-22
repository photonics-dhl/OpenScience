import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type JournalArticle } from '@prisma/client';
import type { WorkspaceDeps } from '../workspace/types';
import { JournalError } from './contracts';
import { journalDigest, safeJournalUrl, type JournalMetadata, type JournalRights, type JournalSource } from './content';
import { assertArticleRevision, JOURNAL_EDIT_ROLES, journalArticleEvent, journalArticleInScope, journalJson, journalScope, journalTransaction } from './articles';

export const JOURNAL_SOURCE_TYPES = ['doi_metadata', 'abstract', 'public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'supplementary', 'figure_asset', 'parsed_text', 'ocr_visual_sidecar', 'manual_note'] as const;
export const JOURNAL_RIGHTS_STATUSES = ['unknown', 'metadata_only_allowed', 'abstract_processing_allowed', 'internal_processing_only', 'public_summary_allowed', 'figure_reuse_allowed', 'derivative_illustration_allowed', 'full_public_processing_allowed', 'restricted_blocked'] as const;
export const JOURNAL_SOURCE_CONFIDENCES = ['verified', 'editor_claimed', 'author_claimed', 'publicly_accessible', 'machine_parsed_only', 'conflict', 'expired', 'revoked'] as const;
export type JournalArticleSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];
export type JournalRightsStatus = (typeof JOURNAL_RIGHTS_STATUSES)[number];
export type JournalSourceConfidence = (typeof JOURNAL_SOURCE_CONFIDENCES)[number];
export interface JournalSourcePermissions {
  internalProcessing: boolean;
  derivativeGeneration: boolean;
  publicSource: boolean;
  publicDerivative: boolean;
  externalProcessing: boolean;
  figureReuse: boolean;
  derivativeIllustration: boolean;
}
export interface JournalSourceEvidence {
  statement: string;
  license?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  expiresAt?: string;
}
export interface JournalArticleSourceRecord {
  id: string;
  sourceType: JournalArticleSourceType;
  title?: string;
  url?: string;
  fileId?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  rightsStatus: JournalRightsStatus;
  sourceConfidence: JournalSourceConfidence;
  permissions: JournalSourcePermissions;
  evidence: JournalSourceEvidence;
  notes?: string;
  activeForGeneration: boolean;
  contentSha256?: string;
}
export interface ArticleProcessingCapability {
  journalArticleId: string;
  canGenerateMetadataPage: boolean;
  canGenerateAbstractSummary: boolean;
  canGenerateFullSixFields: boolean;
  canGenerateFigureExplanation: boolean;
  canGenerateReproducibilityField: boolean;
  canGenerateDerivativeIllustration: boolean;
  canPublishPublicSummary: boolean;
  canPublishFullInterpretation: boolean;
  canPublishFigures: boolean;
  canExposeViaApi: boolean;
  limitations: string[];
  blockingReasons: string[];
  lastEvaluatedAt: string;
  mode: 'matrix' | 'legacy';
  activeSourceId: string | null;
}

type MatrixSource = JournalSource & { materials?: JournalArticleSourceRecord[] };
const mainTypes = new Set<JournalArticleSourceType>(['abstract', 'public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'parsed_text', 'ocr_visual_sidecar', 'manual_note']);
const fullTypes = new Set<JournalArticleSourceType>(['public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'parsed_text', 'ocr_visual_sidecar']);
const emptyPermissions = (): JournalSourcePermissions => ({ internalProcessing: false, derivativeGeneration: false, publicSource: false, publicDerivative: false, externalProcessing: false, figureReuse: false, derivativeIllustration: false });
const STATUS_ALLOWED: Record<JournalRightsStatus, Array<keyof JournalSourcePermissions>> = {
  unknown: [], metadata_only_allowed: [], abstract_processing_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing'],
  internal_processing_only: ['internalProcessing', 'derivativeGeneration', 'externalProcessing'],
  public_summary_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing', 'publicDerivative'],
  figure_reuse_allowed: ['publicSource', 'figureReuse'], derivative_illustration_allowed: ['internalProcessing', 'derivativeGeneration', 'externalProcessing', 'derivativeIllustration'],
  full_public_processing_allowed: ['internalProcessing', 'derivativeGeneration', 'publicSource', 'publicDerivative', 'externalProcessing', 'figureReuse', 'derivativeIllustration'], restricted_blocked: [],
};
const generationStatuses = new Set<JournalRightsStatus>(['abstract_processing_allowed', 'internal_processing_only', 'public_summary_allowed', 'full_public_processing_allowed']);
const digestText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const asDate = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const validAt = (item: JournalArticleSourceRecord, now: Date) => !['conflict', 'expired', 'revoked'].includes(item.sourceConfidence) && item.rightsStatus !== 'restricted_blocked' && !(asDate(item.evidence.expiresAt) && asDate(item.evidence.expiresAt)! <= now);
export function journalSourceMaterials(source: unknown): JournalArticleSourceRecord[] {
  const materials = (source as MatrixSource | null)?.materials;
  return Array.isArray(materials) ? materials : [];
}
function legacySourceMaterial(article: { source: unknown; rights: unknown }, id: string, actorId: string | undefined, now: Date): JournalArticleSourceRecord | null {
  const source = article.source as JournalSource; const rights = article.rights as JournalRights;
  if (source.kind === 'metadata') return null;
  return {
    id, sourceType: source.kind === 'abstract' ? 'abstract' : source.artifactId ? 'editor_uploaded_pdf' : 'publisher_full_text',
    title: source.label, url: source.url || undefined, fileId: source.artifactId, uploadedBy: actorId, uploadedAt: now.toISOString(),
    rightsStatus: rights.publicDerivative ? 'full_public_processing_allowed' : rights.internalProcessing ? 'internal_processing_only' : 'unknown',
    sourceConfidence: rights.evidence ? 'editor_claimed' : 'machine_parsed_only',
    permissions: { internalProcessing: rights.internalProcessing, derivativeGeneration: rights.derivativeGeneration, publicSource: rights.publicSource, publicDerivative: rights.publicDerivative, externalProcessing: rights.externalProcessing, figureReuse: rights.publicSource, derivativeIllustration: rights.derivativeGeneration },
    evidence: { statement: rights.evidence, license: rights.license }, activeForGeneration: true, contentSha256: digestText(source.text),
  };
}
export function visibleJournalSourceMaterials(article: { source: unknown; rights: unknown }, now = new Date()) {
  const materials = journalSourceMaterials(article.source);
  return materials.length ? materials : [legacySourceMaterial(article, 'legacy', undefined, now)].filter(Boolean) as JournalArticleSourceRecord[];
}

export function evaluateArticleProcessingCapability(article: { id: string; source: unknown; rights: unknown; contentState: string }, now = new Date()): ArticleProcessingCapability {
  const source = article.source as MatrixSource;
  const rights = article.rights as JournalRights;
  const materials = journalSourceMaterials(source);
  if (!materials.length) {
    const derivable = article.contentState === 'active' && source.kind !== 'metadata' && source.text.trim().length >= 50 && rights.internalProcessing && rights.derivativeGeneration && !!rights.license && !!rights.evidence;
    const usable = derivable && rights.externalProcessing;
    const publish = derivable && rights.publicDerivative;
    return {
      journalArticleId: article.id, canGenerateMetadataPage: true,
      canGenerateAbstractSummary: usable, canGenerateFullSixFields: usable && source.kind === 'fulltext',
      canGenerateFigureExplanation: usable && source.kind === 'fulltext' && rights.publicSource,
      canGenerateReproducibilityField: usable && source.kind === 'fulltext', canGenerateDerivativeIllustration: usable,
      canPublishPublicSummary: publish, canPublishFullInterpretation: publish && source.kind === 'fulltext',
      canPublishFigures: publish && rights.publicSource, canExposeViaApi: publish,
      limitations: source.kind === 'abstract' ? ['仅有摘要，不能生成完整方法、图义或复现条件'] : [],
      blockingReasons: article.contentState !== 'active' ? ['论文当前受限或已撤回'] : source.kind === 'metadata' ? ['仅有书目信息'] : usable ? [] : !derivable ? ['缺少可核验文本、加工、衍生许可、许可名称或依据'] : ['未允许外部 AI 处理'],
      lastEvaluatedAt: now.toISOString(), mode: 'legacy', activeSourceId: null,
    };
  }
  const active = materials.find((item) => item.activeForGeneration && mainTypes.has(item.sourceType));
  const bound = !!active && active.contentSha256 === digestText(source.text) && (source.artifactId ? active.fileId === source.artifactId : !!source.url && active.url === source.url);
  const activeValid = active && bound && validAt(active, now);
  const permission = emptyPermissions();
  if (activeValid) for (const key of STATUS_ALLOWED[active.rightsStatus]) permission[key] = active.permissions[key];
  const licensed = !!activeValid && !!active.evidence.statement.trim() && !!active.evidence.license?.trim();
  const canDerive = article.contentState === 'active' && !!activeValid && generationStatuses.has(active.rightsStatus) && permission.internalProcessing && permission.derivativeGeneration && licensed && source.text.trim().length >= 50;
  const canProcess = canDerive && permission.externalProcessing;
  const isFull = !!active && fullTypes.has(active.sourceType) && source.kind === 'fulltext';
  const isAbstract = !!active && (active.sourceType === 'abstract' || isFull) && source.kind !== 'metadata';
  const publicDerivative = canDerive && permission.publicDerivative && ['public_summary_allowed', 'full_public_processing_allowed'].includes(active!.rightsStatus);
  const figure = materials.some((item) => item.sourceType === 'figure_asset' && validAt(item, now) && STATUS_ALLOWED[item.rightsStatus].includes('figureReuse') && item.permissions.figureReuse && !!item.evidence.statement.trim() && !!item.evidence.license?.trim());
  const supplementary = materials.some((item) => item.sourceType === 'supplementary' && validAt(item, now) && STATUS_ALLOWED[item.rightsStatus].includes('internalProcessing') && STATUS_ALLOWED[item.rightsStatus].includes('derivativeGeneration') && item.permissions.internalProcessing && item.permissions.derivativeGeneration && !!item.evidence.statement.trim() && !!item.evidence.license?.trim());
  const limitations: string[] = [];
  const blockingReasons: string[] = [];
  if (!active) blockingReasons.push('未选择用于本次生成的主要来源');
  else if (!bound) blockingReasons.push('主要来源未与当前文本或文件建立不可混淆的绑定');
  else if (!activeValid) blockingReasons.push(active.sourceConfidence === 'conflict' ? '主要来源存在冲突' : active.sourceConfidence === 'revoked' ? '主要来源授权已撤回' : '主要来源授权无效或已过期');
  if (article.contentState !== 'active') blockingReasons.push('论文当前受限或已撤回');
  if (activeValid && !canDerive) blockingReasons.push('主要来源缺少可核验文本、内部加工、衍生生成许可、许可名称或证据');
  else if (activeValid && !canProcess) blockingReasons.push('主要来源未允许外部 AI 处理');
  if (source.kind === 'abstract') limitations.push('仅有摘要，不能生成完整方法、图义或复现条件');
  if (!figure) limitations.push('没有具有明确复用许可的图表来源');
  if (!supplementary) limitations.push('没有具有有效处理许可的补充材料，复现性字段受限');
  if (canProcess && !permission.publicDerivative) limitations.push('允许内部加工，但不允许公开衍生解读');
  return {
    journalArticleId: article.id, canGenerateMetadataPage: true,
    canGenerateAbstractSummary: canProcess && isAbstract, canGenerateFullSixFields: canProcess && isFull,
    canGenerateFigureExplanation: canProcess && isFull,
    canGenerateReproducibilityField: canProcess && isFull && supplementary,
    canGenerateDerivativeIllustration: canProcess && permission.derivativeIllustration,
    canPublishPublicSummary: publicDerivative && isAbstract, canPublishFullInterpretation: publicDerivative && isFull && active?.rightsStatus === 'full_public_processing_allowed',
    canPublishFigures: publicDerivative && figure, canExposeViaApi: publicDerivative && isAbstract,
    limitations, blockingReasons, lastEvaluatedAt: now.toISOString(), mode: 'matrix', activeSourceId: active?.id ?? null,
  };
}

export function assertJournalGenerationCapability(article: { id: string; source: unknown; rights: unknown; contentState: string }, now = new Date()) {
  const capability = evaluateArticleProcessingCapability(article, now);
  const source = article.source as JournalSource;
  if (source.kind === 'metadata') throw new JournalError('INVALID_STATE', '书目元数据不能用于生成科学解读，请补充摘要或全文');
  if (!(source.kind === 'abstract' ? capability.canGenerateAbstractSummary : capability.canGenerateFullSixFields)) throw new JournalError('FORBIDDEN', capability.blockingReasons.join('；') || '当前来源矩阵不允许生成此范围的解读');
  return capability;
}
export function assertJournalPublishCapability(article: { id: string; source: unknown; rights: unknown; contentState: string }, now = new Date()) {
  const capability = evaluateArticleProcessingCapability(article, now);
  const source = article.source as JournalSource;
  if (!(source.kind === 'abstract' ? capability.canPublishPublicSummary : capability.canPublishFullInterpretation)) throw new JournalError('FORBIDDEN', capability.blockingReasons.concat(capability.limitations).join('；') || '当前来源矩阵不允许公开解读');
  return capability;
}
export function assertJournalReviewCapability(article: { id: string; source: unknown; rights: unknown; contentState: string }, now = new Date()) {
  const capability = evaluateArticleProcessingCapability(article, now); const source = article.source as JournalSource;
  if (capability.mode === 'legacy') {
    const rights = article.rights as JournalRights;
    if (article.contentState !== 'active' || source.kind === 'metadata' || source.text.trim().length < 50 || !rights.internalProcessing || !rights.derivativeGeneration || !rights.license || !rights.evidence) throw new JournalError('FORBIDDEN', '当前来源缺少审核衍生解读所需的许可或证据');
    return capability;
  }
  const active = journalSourceMaterials(article.source).find((item) => item.id === capability.activeSourceId);
  const bound = !!active && active.contentSha256 === digestText(source.text) && (source.artifactId ? active.fileId === source.artifactId : !!source.url && active.url === source.url);
  const statusAllowsReview = !!active && generationStatuses.has(active.rightsStatus) && STATUS_ALLOWED[active.rightsStatus].includes('internalProcessing') && STATUS_ALLOWED[active.rightsStatus].includes('derivativeGeneration');
  if (!active || article.contentState !== 'active' || source.kind === 'metadata' || source.text.trim().length < 50 || !bound || !validAt(active, now) || !statusAllowsReview || !active.permissions.internalProcessing || !active.permissions.derivativeGeneration || !active.evidence.license?.trim() || !active.evidence.statement.trim()) throw new JournalError('FORBIDDEN', '当前来源矩阵不允许审核此衍生解读');
  return capability;
}

function validateSourceRecord(input: Omit<JournalArticleSourceRecord, 'id' | 'uploadedBy' | 'uploadedAt'>, currentSource: JournalSource, now: Date) {
  if (!JOURNAL_SOURCE_TYPES.includes(input.sourceType) || !JOURNAL_RIGHTS_STATUSES.includes(input.rightsStatus) || !JOURNAL_SOURCE_CONFIDENCES.includes(input.sourceConfidence)) throw new JournalError('VALIDATION_ERROR', '来源类型、权限或可信度状态无效');
  if (input.url) safeJournalUrl(input.url);
  if (input.title && input.title.length > 500 || input.notes && input.notes.length > 5000 || input.evidence.statement.length > 5000 || (input.evidence.license?.length ?? 0) > 500) throw new JournalError('VALIDATION_ERROR', '来源说明过长');
  if (input.evidence.expiresAt && !asDate(input.evidence.expiresAt)) throw new JournalError('VALIDATION_ERROR', '授权到期时间无效');
  if (Object.values(input.permissions).some((value) => typeof value !== 'boolean')) throw new JournalError('VALIDATION_ERROR', '来源权限必须明确为允许或不允许');
  if ((Object.values(input.permissions).some(Boolean) || input.rightsStatus !== 'unknown') && !input.evidence.statement.trim()) throw new JournalError('VALIDATION_ERROR', '明确权限必须同时记录核验依据');
  if ((input.permissions.derivativeGeneration || input.permissions.publicDerivative || input.permissions.publicSource || input.permissions.figureReuse || input.permissions.derivativeIllustration) && !input.evidence.license?.trim()) throw new JournalError('VALIDATION_ERROR', '衍生或公开权限必须记录许可名称');
  const exceedsStatus = (Object.keys(input.permissions) as Array<keyof JournalSourcePermissions>).some((key) => input.permissions[key] && !STATUS_ALLOWED[input.rightsStatus].includes(key));
  if (exceedsStatus) throw new JournalError('VALIDATION_ERROR', '所选权限超出当前授权状态允许的操作范围');
  if (input.rightsStatus === 'abstract_processing_allowed' && input.sourceType !== 'abstract') throw new JournalError('VALIDATION_ERROR', '摘要加工许可只适用于摘要来源');
  if (input.rightsStatus === 'figure_reuse_allowed' && (input.sourceType !== 'figure_asset' || !input.permissions.figureReuse)) throw new JournalError('VALIDATION_ERROR', '图表复用许可只适用于图表材料');
  if (input.rightsStatus === 'derivative_illustration_allowed' && !input.permissions.derivativeIllustration) throw new JournalError('VALIDATION_ERROR', '衍生示意许可必须明确允许衍生示意');
  if (input.activeForGeneration) {
    if (!mainTypes.has(input.sourceType)) throw new JournalError('VALIDATION_ERROR', '补充材料或图表不能单独授权主要来源');
    if (!generationStatuses.has(input.rightsStatus)) throw new JournalError('VALIDATION_ERROR', '此授权状态不能作为文字解读的主要来源');
    if (currentSource.kind === 'abstract' && input.sourceType !== 'abstract') throw new JournalError('VALIDATION_ERROR', '当前摘要内容只能链接摘要来源');
    if (currentSource.kind === 'fulltext' && !fullTypes.has(input.sourceType)) throw new JournalError('VALIDATION_ERROR', '当前全文内容必须链接全文或解析文本来源');
    if (currentSource.kind === 'metadata') throw new JournalError('VALIDATION_ERROR', '书目内容不能选择生成来源');
    if (currentSource.artifactId ? input.fileId !== currentSource.artifactId : !currentSource.url || input.url !== currentSource.url) throw new JournalError('VALIDATION_ERROR', '主要来源必须与当前文本的文件或网址完全一致');
  }
  if (input.evidence.expiresAt && asDate(input.evidence.expiresAt)! <= now && input.sourceConfidence !== 'expired') throw new JournalError('VALIDATION_ERROR', '已过期授权必须标记为 expired');
}
function legacyRightsFor(materials: JournalArticleSourceRecord[], previous: JournalRights, now: Date): JournalRights {
  const active = materials.find((item) => item.activeForGeneration && mainTypes.has(item.sourceType));
  if (!active || !validAt(active, now)) return { ...previous, internalProcessing: false, derivativeGeneration: false, publicSource: false, publicDerivative: false, externalProcessing: false, license: active?.evidence.license ?? '', evidence: active?.evidence.statement ?? '' };
  return { internalProcessing: active.permissions.internalProcessing, derivativeGeneration: active.permissions.derivativeGeneration, publicSource: active.permissions.publicSource, publicDerivative: active.permissions.publicDerivative, externalProcessing: active.permissions.externalProcessing, license: active.evidence.license ?? '', evidence: active.evidence.statement };
}
async function applyMatrixChange(tx: Prisma.TransactionClient, article: JournalArticle, userId: string, materials: JournalArticleSourceRecord[], action: string, detail: unknown, now: Date) {
  const source = { ...(article.source as unknown as MatrixSource), materials };
  const rights = legacyRightsFor(materials, article.rights as unknown as JournalRights, now);
  const capability = evaluateArticleProcessingCapability({ ...article, source, rights }, now);
  const updated = await tx.journalArticle.update({ where: { id: article.id }, data: { source: journalJson(source), rights: journalJson(rights), revision: { increment: 1 }, reviewState: 'draft', reviewedRevision: null, reviewedDigest: null, reviewedBy: null } });
  const activeMaterial = materials.find((item) => item.activeForGeneration);
  if (rights.internalProcessing && rights.evidence && (source as JournalSource).artifactId && activeMaterial?.fileId === (source as JournalSource).artifactId) {
    await tx.journalJob.updateMany({ where: { articleId: article.id, kind: 'source_parse', state: 'staging' }, data: { state: 'pending', revision: updated.revision, sourceDigest: journalDigest({ source, rights }), result: Prisma.DbNull } });
  }
  const releases = await tx.journalRelease.findMany({ where: { articleId: article.id }, select: { snapshot: true } });
  const exceedsCurrentRights = releases.some((release) => {
    const snapshot = release.snapshot as { draft?: { scope?: string; figures?: unknown[] }; source?: { text?: unknown } };
    return !capability.canPublishPublicSummary || snapshot.draft?.scope === 'fulltext' && !capability.canPublishFullInterpretation || snapshot.source?.text !== undefined && !rights.publicSource;
  });
  if (exceedsCurrentRights) {
    await tx.researchObject.update({ where: { id: article.researchObjectId }, data: { visibility: 'private', status: 'restricted' } });
    await tx.version.updateMany({ where: { researchObjectId: article.researchObjectId, status: 'published' }, data: { status: 'restricted' } });
  }
  await journalArticleEvent(tx, article.journalId, userId, action, article.id, { ...(detail as object), capability, sourceDigest: journalDigest(source), rightsDigest: journalDigest(rights) });
  return { articleRevision: updated.revision, sources: materials, capability };
}

export async function listJournalArticleSources(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string) {
  const access = await journalScope(deps.prisma, journalId, userId);
  const article = await journalArticleInScope(deps.prisma, journalId, articleId);
  if (access.membership.role === 'reviewer' && article.assignedReviewerId !== userId) throw new JournalError('JOURNAL_NOT_FOUND', '未分配此论文的审核权限');
  const history = await deps.prisma.journalEvent.findMany({ where: { journalId, targetId: articleId, action: { in: ['journal.source.add', 'journal.source.rights'] } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, actorId: true, after: true, createdAt: true } });
  return { articleRevision: article.revision, sources: visibleJournalSourceMaterials(article, deps.now?.() ?? new Date()), capability: evaluateArticleProcessingCapability(article, deps.now?.() ?? new Date()), history };
}
export async function addJournalArticleSource(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: { revision: number; source: Omit<JournalArticleSourceRecord, 'id' | 'uploadedBy' | 'uploadedAt'> }) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const article = await journalArticleInScope(tx, journalId, articleId); assertArticleRevision(article, input.revision);
    const persisted = journalSourceMaterials(article.source); const existing = persisted.length ? persisted : [legacySourceMaterial(article, randomUUID(), userId, deps.now?.() ?? new Date())].filter(Boolean) as JournalArticleSourceRecord[]; if (existing.length >= 50) throw new JournalError('INVALID_STATE', '每篇论文最多记录 50 项来源材料');
    const now = deps.now?.() ?? new Date(); validateSourceRecord(input.source, article.source as unknown as JournalSource, now);
    const created: JournalArticleSourceRecord = { ...input.source, evidence: { ...input.source.evidence, verifiedBy: userId, verifiedAt: now.toISOString() }, id: randomUUID(), uploadedBy: userId, uploadedAt: now.toISOString(), ...(input.source.activeForGeneration ? { contentSha256: digestText((article.source as unknown as JournalSource).text) } : {}) };
    const materials = input.source.activeForGeneration ? existing.map((item) => mainTypes.has(item.sourceType) ? { ...item, activeForGeneration: false } : item).concat(created) : existing.concat(created);
    return { ...await applyMatrixChange(tx, article, userId, materials, 'journal.source.add', { sourceId: created.id, sourceType: created.sourceType }, now), history: [] };
  });
}
export async function updateJournalArticleSourceRights(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, sourceId: string, input: { revision: number } & Pick<JournalArticleSourceRecord, 'rightsStatus' | 'sourceConfidence' | 'permissions' | 'evidence' | 'notes' | 'activeForGeneration'>) {
  return journalTransaction(deps, journalId, async (tx) => {
    await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true);
    const article = await journalArticleInScope(tx, journalId, articleId); assertArticleRevision(article, input.revision);
    let existing = journalSourceMaterials(article.source); if (!existing.length && sourceId === 'legacy') existing = [legacySourceMaterial(article, randomUUID(), userId, deps.now?.() ?? new Date())].filter(Boolean) as JournalArticleSourceRecord[]; const prior = existing.find((item) => item.id === sourceId) ?? (sourceId === 'legacy' ? existing[0] : undefined);
    if (!prior) throw new JournalError('JOURNAL_NOT_FOUND', '来源材料不存在');
    const now = deps.now?.() ?? new Date(); const rightsInput = { rightsStatus: input.rightsStatus, sourceConfidence: input.sourceConfidence, permissions: input.permissions, evidence: { ...input.evidence, verifiedBy: userId, verifiedAt: now.toISOString() }, notes: input.notes, activeForGeneration: input.activeForGeneration }; const changed = { ...prior, ...rightsInput, id: prior.id, uploadedBy: prior.uploadedBy, uploadedAt: prior.uploadedAt, ...(rightsInput.activeForGeneration ? { contentSha256: digestText((article.source as unknown as JournalSource).text) } : {}) };
    validateSourceRecord(changed, article.source as unknown as JournalSource, now);
    const materials = existing.map((item) => item.id === prior.id ? changed : input.activeForGeneration && mainTypes.has(item.sourceType) ? { ...item, activeForGeneration: false } : item);
    return { ...await applyMatrixChange(tx, article, userId, materials, 'journal.source.rights', { sourceId, before: prior, after: changed }, now), history: [] };
  });
}

export interface JournalPriorityOverride { editorPriorityScore: number; deferredUntil: string | null; reason: string; actorId?: string; createdAt?: string }
export interface JournalArticlePriority {
  journalArticleId: string; sourceCompletenessScore: number; rightsClarityScore: number; recencyScore: number; showcaseValueScore: number; academicCentralityScore: number; parseSuccessScore: number; editorPriorityScore: number; topicMatchScore: number;
  totalScore: number; priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | 'blocked'; recommendedAction: 'process_now' | 'process_after_confirmation' | 'request_more_sources' | 'rights_review_required' | 'metadata_only' | 'blocked'; reasons: string[]; unknownDimensions: string[]; estimatedCreditCost: 1; lastCalculatedAt: string; override: JournalPriorityOverride | null; deferredUntil: string | null;
}
export function calculateJournalArticlePriority(article: { id: string; metadata: unknown; source: unknown; rights: unknown; contentState: string }, subjects: string[], override: JournalPriorityOverride | null, now = new Date()): JournalArticlePriority {
  const source = article.source as MatrixSource; const metadata = article.metadata as JournalMetadata; const materials = journalSourceMaterials(source); const capability = evaluateArticleProcessingCapability(article, now);
  const valid = materials.filter((item) => validAt(item, now)); const hasFull = valid.some((item) => fullTypes.has(item.sourceType)); const hasAbstract = source.kind === 'abstract' || valid.some((item) => item.sourceType === 'abstract'); const hasFigure = valid.some((item) => item.sourceType === 'figure_asset'); const hasSupp = valid.some((item) => item.sourceType === 'supplementary');
  const sourceCompletenessScore = materials.length ? Math.min(20, (hasAbstract ? 5 : 0) + (hasFull ? 9 : 0) + (hasFigure ? 3 : 0) + (hasSupp ? 3 : 0)) : source.kind === 'fulltext' ? 14 : source.kind === 'abstract' ? 5 : 0;
  const rightsClarityScore = capability.canPublishFullInterpretation ? 15 : capability.canPublishPublicSummary ? 12 : capability.canGenerateAbstractSummary || capability.canGenerateFullSixFields ? 5 : 0;
  const year = metadata.publishedDate && /^\d{4}/.test(metadata.publishedDate) ? Number(metadata.publishedDate.slice(0, 4)) : null; const age = year ? now.getUTCFullYear() - year : null;
  const recencyScore = age === null ? 0 : age <= 1 ? 10 : age <= 3 ? 8 : age <= 5 ? 6 : age <= 10 ? 3 : 1;
  const title = metadata.title.toLowerCase(); const central = /\b(review|method|perspective|guideline|protocol)\b|综述|方法|指南|视角/i.test(title);
  const academicCentralityScore = central ? 10 : 0; const showcaseValueScore = 0;
  const parseSuccessScore = source.text?.trim().length >= 50 ? source.kind === 'fulltext' ? 10 : 6 : 0;
  const editorPriorityScore = override?.editorPriorityScore ?? 0;
  const haystack = `${metadata.title} ${metadata.abstract ?? ''}`.toLowerCase(); const topicMatchScore = subjects.some((subject) => subject.trim() && haystack.includes(subject.trim().toLowerCase())) ? 10 : 0;
  const scores = { sourceCompletenessScore, rightsClarityScore, recencyScore, showcaseValueScore, academicCentralityScore, parseSuccessScore, editorPriorityScore, topicMatchScore };
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0); const deferred = !!override?.deferredUntil && new Date(override.deferredUntil) > now;
  const blocked = capability.blockingReasons.length > 0 || source.kind === 'metadata';
  const priorityLevel = blocked ? 'blocked' : totalScore >= 80 ? 'P0' : totalScore >= 60 ? 'P1' : totalScore >= 40 ? 'P2' : 'P3';
  const recommendedAction = blocked ? source.kind === 'metadata' ? 'metadata_only' : 'blocked' : deferred ? 'process_after_confirmation' : rightsClarityScore < 12 ? 'rights_review_required' : sourceCompletenessScore < 14 ? 'request_more_sources' : totalScore >= 60 ? 'process_now' : 'process_after_confirmation';
  const unknownDimensions = [year === null && 'recency', !central && 'academicCentrality', 'showcaseValue', subjects.length === 0 && 'topicMatch'].filter(Boolean) as string[];
  const reasons = [...capability.blockingReasons, ...capability.limitations, ...(deferred ? [`编辑已延后至 ${override!.deferredUntil}`] : []), ...(override ? [override.reason] : [])];
  return { journalArticleId: article.id, ...scores, totalScore, priorityLevel, recommendedAction, reasons, unknownDimensions, estimatedCreditCost: 1, lastCalculatedAt: now.toISOString(), override, deferredUntil: override?.deferredUntil ?? null };
}

export async function setJournalPriorityOverride(deps: WorkspaceDeps, userId: string, journalId: string, articleId: string, input: JournalPriorityOverride) {
  if (!Number.isInteger(input.editorPriorityScore) || input.editorPriorityScore < 0 || input.editorPriorityScore > 10 || !input.reason.trim()) throw new JournalError('VALIDATION_ERROR', '编辑权重须为 0–10，并填写原因');
  if (input.deferredUntil && (!asDate(input.deferredUntil) || asDate(input.deferredUntil)! <= (deps.now?.() ?? new Date()))) throw new JournalError('VALIDATION_ERROR', '延后时间必须晚于当前时间');
  return journalTransaction(deps, journalId, async (tx) => {
    const { journal } = await journalScope(tx, journalId, userId, JOURNAL_EDIT_ROLES, true); const article = await journalArticleInScope(tx, journalId, articleId);
    const now = deps.now?.() ?? new Date(); const value = { ...input, actorId: userId, createdAt: now.toISOString() };
    await journalArticleEvent(tx, journalId, userId, 'journal.priority.override', articleId, value);
    return calculateJournalArticlePriority(article, journal.subjects, value, now);
  });
}

export async function listJournalProcessingPriorities(deps: WorkspaceDeps, userId: string, journalId: string, input: { cursor?: string; limit: number }) {
  const access = await journalScope(deps.prisma, journalId, userId, JOURNAL_EDIT_ROLES); const rows = await deps.prisma.journalArticle.findMany({ where: { journalId }, orderBy: { id: 'asc' } });
  const events = await deps.prisma.journalEvent.findMany({ where: { journalId, targetId: { in: rows.map((row) => row.id) }, action: 'journal.priority.override' }, orderBy: { createdAt: 'desc' } });
  const override = new Map<string, JournalPriorityOverride>(); for (const event of events) if (!override.has(event.targetId)) override.set(event.targetId, event.after as unknown as JournalPriorityOverride);
  const rankingNow = deps.now?.() ?? new Date();
  const ranked = rows.map((article) => ({ article, priority: calculateJournalArticlePriority(article, access.journal.subjects, override.get(article.id) ?? null, rankingNow) })).sort((a, b) => {
    const group = (item: typeof a) => item.priority.priorityLevel === 'blocked' ? 2 : item.priority.deferredUntil && new Date(item.priority.deferredUntil) > rankingNow ? 1 : 0;
    return group(a) - group(b) || b.priority.totalScore - a.priority.totalScore || a.article.id.localeCompare(b.article.id);
  });
  const start = input.cursor ? ranked.findIndex((item) => item.article.id === input.cursor) + 1 : 0; if (input.cursor && start === 0) throw new JournalError('VALIDATION_ERROR', '分页游标无效'); const visible = ranked.slice(start, start + input.limit);
  return { items: visible.map(({ article, priority }) => { const metadata = article.metadata as unknown as JournalMetadata; return { article: { id: article.id, title: metadata.title, publishedDate: metadata.publishedDate ?? null, revision: article.revision, reviewState: article.reviewState, sourceKind: (article.source as unknown as JournalSource).kind }, priority }; }), nextCursor: ranked.length > start + input.limit ? visible.at(-1)!.article.id : null };
}

export async function getJournalServicePlan(deps: WorkspaceDeps, userId: string, journalId: string) {
  const access = await journalScope(deps.prisma, journalId, userId, ['owner', 'maintainer', 'author']); const now = deps.now?.() ?? new Date();
  const privileged = ['owner', 'maintainer'].includes(access.membership.role); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [grants, serviceRequests, storage, planEvents, ledger, monthlyUsage] = await Promise.all([
    deps.prisma.journalGrant.findMany({ where: { journalId }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] }), privileged ? deps.prisma.journalServiceRequest.findMany({ where: { journalId }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]), deps.prisma.artifact.aggregate({ where: { workspaceId: access.journal.workspaceId }, _sum: { size: true } }), privileged ? deps.prisma.journalEvent.findMany({ where: { journalId, action: 'journal.service_request.create' }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]), privileged ? deps.prisma.journalLedger.findMany({ where: { journalId }, orderBy: { createdAt: 'desc' }, take: 200 }) : Promise.resolve([]), deps.prisma.journalLedger.aggregate({ where: { journalId, kind: 'consume', createdAt: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const byRequest = new Map(planEvents.map((event) => [event.targetId, (event.after as { planChoice?: string } | null)?.planChoice]));
  const requests = serviceRequests.map((request) => ({ ...request, planChoice: byRequest.get(request.id) ?? 'custom' }));
  const approved = requests.find((request) => request.status === 'approved'); const requested = requests.find((request) => ['submitted', 'quoted'].includes(request.status));
  const credits = grants.reduce((sum, grant) => { const due = grant.expiresAt <= now; const unreserved = Math.max(0, grant.remaining - grant.reserved); sum.available += due ? 0 : unreserved; sum.reserved += grant.reserved; sum.consumed += grant.consumed; sum.expired += grant.expired + (due ? unreserved : 0); return sum; }, { available: 0, reserved: 0, consumed: 0, expired: 0 });
  const activeExpiry = grants.filter((grant) => grant.expiresAt > now && grant.remaining > 0).map((grant) => grant.expiresAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const monthlyUsed = monthlyUsage._sum.amount ?? 0;
  return { planChoice: approved?.planChoice ?? 'free', requestedPlanChoice: requested?.planChoice ?? null, commercialModel: 'manual_quote' as const, validUntil: activeExpiry, credits: { ...credits, monthlyUsed }, grants: privileged ? grants : [], ledger, storage: { usedBytes: (storage._sum.size ?? 0n).toString(), limitBytes: access.journal.storageLimitBytes.toString() }, serviceRequests: requests };
}
