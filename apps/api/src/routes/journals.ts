import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import type { StorageAdapter } from '@openscience/storage';
import type { AuthDeps } from '@openscience/auth';
import {
  JournalError, activateJournalHomepage, addJournalMember, cancelJournalJob, changeJournalMemberRole,
  createJournalFeedback, createJournalServiceRequest, getManagedJournalArticle, grantJournalCredits, importJournalArticle, listJournalFeedback, previewJournalArticle,
  journalScope, listAdminApplications, listJournalMembers, listManagedJournals, listMyJournalApplications,
  normalizeJournalDoi, publishJournalArticle, removeJournalMember, restrictJournalArticle,
  uploadJournalSource, JOURNAL_FILE_LIMIT,
  assignJournalReviewer,
  transferJournalOwnership, reopenJournalApplication,
  respondJournalFeedback, reviewJournalArticle, reviewJournalServiceRequest, saveJournalApplication, setJournalOperationalState, submitJournalApplication,
  submitJournalJob, txReleases, updateJournalArticle, updateJournalHomepage, verifyJournalApplication,
  addJournalArticleSource, getJournalServicePlan, listJournalArticleSources, listJournalProcessingPriorities,
  setJournalPriorityOverride, updateJournalArticleSourceRights,
  type JournalMetadata,
} from '@openscience/domain';
import { requireCurrentUser } from './session-guard';
import { requirePlatformAdmin } from './admin';

const ids = z.object({ id: z.string().uuid() });
const articleIds = ids.extend({ articleId: z.string().uuid() });
const revision = z.number().int().positive();
const requestKey = z.string().trim().min(1).max(200);
const safeUrl = z.string().url().max(2000).refine((s) => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } });
const applicationBody = z.object({
  revision: revision.optional(), nameZh: z.string().max(200).optional(), nameEn: z.string().max(200).optional(),
  pIssn: z.string().max(20).optional(), eIssn: z.string().max(20).optional(), websiteUrl: z.string().max(2000).optional(),
  publisherName: z.string().max(200).optional(), sponsorName: z.string().max(200).optional(), subjects: z.array(z.string().max(100)).max(30).optional(),
  description: z.string().max(10_000).optional(), logoUrl: z.string().max(2000).optional(), applicantName: z.string().max(200).optional(),
  applicantTitle: z.string().max(200).optional(), applicantEmail: z.string().max(300).optional(), representationEvidence: z.string().max(10_000).optional(),
  plannedArticleCount: z.number().int().min(0).max(1_000_000).optional(), requestedServices: z.array(z.string().max(100)).max(20).optional(),
  rightsDeclaration: z.string().max(4000).optional(), rightsDeclarationVersion: z.string().max(100).optional(),
}).strict();
const metadata = z.object({ title: z.string().trim().min(1).max(200), doi: z.string().max(300).optional(), authors: z.array(z.string().max(300)).max(200), publishedDate: z.string().max(10).optional(), journalTitle: z.string().max(300).optional(), issns: z.array(z.string().max(20)).max(5).default([]), originalUrl: safeUrl, abstract: z.string().max(50_000).optional() }).strict();
const source = z.object({ kind: z.enum(['metadata', 'abstract', 'fulltext']), text: z.string().max(200_000), url: safeUrl.or(z.literal('')), label: z.string().max(500) }).strict();
const rights = z.object({ internalProcessing: z.boolean(), derivativeGeneration: z.boolean(), publicSource: z.boolean(), publicDerivative: z.boolean(), externalProcessing: z.boolean(), license: z.string().max(500), evidence: z.string().max(5000) }).strict();
const sourcePermissions = z.object({ internalProcessing: z.boolean(), derivativeGeneration: z.boolean(), publicSource: z.boolean(), publicDerivative: z.boolean(), externalProcessing: z.boolean(), figureReuse: z.boolean(), derivativeIllustration: z.boolean() }).strict();
const sourceEvidence = z.object({ statement: z.string().max(5000), license: z.string().max(500).optional(), verifiedBy: z.string().max(300).optional(), verifiedAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional() }).strict();
const sourceRecord = z.object({
  sourceType: z.enum(['doi_metadata', 'abstract', 'public_full_text', 'publisher_full_text', 'editor_uploaded_pdf', 'author_material', 'supplementary', 'figure_asset', 'parsed_text', 'ocr_visual_sidecar', 'manual_note']),
  title: z.string().max(500).optional(), url: safeUrl.optional(), fileId: z.string().max(300).optional(),
  rightsStatus: z.enum(['unknown', 'metadata_only_allowed', 'abstract_processing_allowed', 'internal_processing_only', 'public_summary_allowed', 'figure_reuse_allowed', 'derivative_illustration_allowed', 'full_public_processing_allowed', 'restricted_blocked']),
  sourceConfidence: z.enum(['verified', 'editor_claimed', 'author_claimed', 'publicly_accessible', 'machine_parsed_only', 'conflict', 'expired', 'revoked']),
  permissions: sourcePermissions, evidence: sourceEvidence, notes: z.string().max(5000).optional(), activeForGeneration: z.boolean(),
}).strict();
const sourceRightsUpdate = sourceRecord.pick({ rightsStatus: true, sourceConfidence: true, permissions: true, evidence: true, notes: true, activeForGeneration: true }).extend({ revision }).strict();
const jobBody = z.object({ revision, language: z.enum(['zh', 'en']), requestKey, retryOf: z.string().uuid().optional(), manualConfirmation: z.boolean().optional() }).strict();
const memberRole = z.enum(['admin', 'editor', 'reviewer']);
const role = (r: string) => ({ maintainer: 'admin', author: 'editor' }[r] ?? r);
const pageQuery = z.object({ query: z.string().max(200).optional(), subject: z.string().max(100).optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });
type Deps = AuthDeps & { storage?: StorageAdapter; journalsEnabled?: boolean; publicIdPrefix?: string; journalMetadataFetcher?: typeof fetch };

/** Fixed-origin metadata lookup. Never fetch DOI destination, paper URL, proof URL or redirects. */
export async function fetchJournalDoiMetadata(doiInput: string, fetcher: typeof fetch = fetch): Promise<JournalMetadata> {
  const doi = normalizeJournalDoi(doiInput);
  const response = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { redirect: 'error', signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json', 'User-Agent': 'OpenScience-Journal-Metadata/1.0' } });
  if (!response.ok) throw new Error('DOI 元数据暂不可用');
  if (Number(response.headers.get('content-length') ?? 0) > 2_000_000) throw new Error('元数据响应过大');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('元数据响应为空');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2_000_000) throw new Error('元数据响应过大'); chunks.push(part.value); } } finally { await reader.cancel(); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { message?: Record<string, unknown> };
  const m = data.message;
  if (!m || typeof m.DOI !== 'string' || normalizeJournalDoi(m.DOI) !== doi || m.type !== 'journal-article') throw new Error('元数据不是对应的期刊论文');
  const titles = m.title as string[] | undefined;
  const dates = (m.published as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0];
  return metadata.parse({ title: titles?.[0], doi, authors: Array.isArray(m.author) ? m.author.map((v) => { const a = v as { given?: string; family?: string; name?: string }; return [a.given, a.family].filter(Boolean).join(' ') || a.name || ''; }).filter(Boolean) : [], publishedDate: dates?.map((part, i) => i === 0 ? String(part) : String(part).padStart(2, '0')).join('-'), journalTitle: (m['container-title'] as string[] | undefined)?.[0], issns: m.ISSN ?? [], originalUrl: `https://doi.org/${doi}`, abstract: typeof m.abstract === 'string' ? m.abstract.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : undefined });
}
async function journalSummary(deps: Deps, journal: Awaited<ReturnType<typeof deps.prisma.journal.findUniqueOrThrow>>) {
  const [identifiers, publicArticleCount] = await Promise.all([deps.prisma.journalIdentifier.findMany({ where: { journalId: journal.id } }), deps.prisma.journalArticle.count({ where: { journalId: journal.id, directoryVisible: true } })]);
  return { ...journal, storageLimitBytes: journal.storageLimitBytes.toString(), publicArticleCount, pIssn: identifiers.find((i) => i.type === 'print')?.value ?? null, eIssn: identifiers.find((i) => i.type === 'electronic')?.value ?? null, status: journal.operationalState };
}
async function publicJournalSummary(deps: Deps, journal: Awaited<ReturnType<typeof deps.prisma.journal.findUniqueOrThrow>>) {
  const j = await journalSummary(deps, journal);
  return { id: j.id, slug: j.slug, nameZh: j.nameZh, nameEn: j.nameEn, description: j.description, subjects: j.subjects, logoUrl: j.logoUrl, websiteUrl: j.websiteUrl, publisherName: j.publisherName, sponsorName: j.sponsorName, verifiedAt: j.verifiedAt, pIssn: j.pIssn, eIssn: j.eIssn, status: j.status, publicArticleCount: j.publicArticleCount };
}
function publicArticleMetadata(value: unknown) {
  const m = value as JournalMetadata;
  return { title: m.title, doi: m.doi, authors: m.authors, publishedDate: m.publishedDate, journalTitle: m.journalTitle, issns: m.issns, originalUrl: m.originalUrl };
}
export function registerJournalRoutes(app: FastifyInstance, deps: Deps): void {
  void app.register(multipart, { limits: { fileSize: JOURNAL_FILE_LIMIT, files: 1, fields: 2, parts: 3 } });
  app.addHook('preHandler', async (req, reply) => {
    if ((deps.journalsEnabled === false || process.env.JOURNALS_ENABLED === 'false') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return reply.code(503).send({ error: { code: 'JOURNALS_PAUSED', message: '期刊服务暂时停止新的操作，已有公开内容仍可访问' } });
  });
  const member = (handler: (req: FastifyRequest, userId: string, reply: FastifyReply) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    reply.header('Cache-Control', 'no-store');
    return handler(req, user.userId, reply);
  };
  const admin = (handler: (req: FastifyRequest, userId: string) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePlatformAdmin(deps, req, reply); if (!user) return;
    reply.header('Cache-Control', 'no-store'); return handler(req, user.userId);
  };
  app.get('/journals', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = pageQuery.parse(req.query);
    const rows = await deps.prisma.journal.findMany({ where: { homepagePublished: true, ...(q.query ? { OR: [{ nameZh: { contains: q.query, mode: 'insensitive' } }, { nameEn: { contains: q.query, mode: 'insensitive' } }, { subjects: { has: q.query } }, { identifiers: { some: { value: { contains: q.query.replace(/-/g, '').toUpperCase() } } } }] } : {}), ...(q.subject ? { subjects: { has: q.subject } } : {}) }, orderBy: { id: 'asc' }, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}), take: q.limit + 1 });
    return { items: await Promise.all(rows.slice(0, q.limit).map((j) => publicJournalSummary(deps, j))), nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  });
  app.get('/journals/mine', member(async (_req, uid) => ({ items: await Promise.all((await listManagedJournals(deps, uid)).map(async (j) => ({ ...await journalSummary(deps, j), role: role(j.role) }))) })));
  app.get('/journals/applications', member(async (_req, uid) => ({ items: await listMyJournalApplications(deps, uid) })));
  app.post('/journals/applications', member(async (req, uid) => ({ application: await saveJournalApplication(deps, uid, applicationBody.parse(req.body)) })));
  app.get('/journals/applications/:id', member(async (req, uid) => {
    const application = (await listMyJournalApplications(deps, uid)).find((a) => a.id === ids.parse(req.params).id);
    if (!application) throw new JournalError('APPLICATION_NOT_FOUND', '申请不存在'); return { application };
  }));
  app.patch('/journals/applications/:id', member(async (req, uid) => ({ application: await saveJournalApplication(deps, uid, { ...applicationBody.extend({ revision }).parse(req.body), applicationId: ids.parse(req.params).id }) })));
  app.post('/journals/applications/:id/submit', member(async (req, uid) => ({ application: await submitJournalApplication(deps, uid, { applicationId: ids.parse(req.params).id, ...z.object({ revision, submissionKey: requestKey }).strict().parse(req.body) }) })));
  app.get('/journals/:id/manage', member(async (req, uid) => {
    const { id } = ids.parse(req.params); const access = await journalScope(deps.prisma, id, uid);
    const [articles, grants, jobs, serviceRequests, stats] = await Promise.all([
      deps.prisma.journalArticle.findMany({ where: { journalId: id, ...(access.membership.role === 'reviewer' ? { assignedReviewerId: uid } : {}) }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      deps.prisma.journalGrant.findMany({ where: { journalId: id }, orderBy: { createdAt: 'desc' } }),
      deps.prisma.journalJob.findMany({ where: { journalId: id, ...(access.membership.role === 'reviewer' ? { article: { assignedReviewerId: uid } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, articleId: true, state: true, createdAt: true, error: true } }),
      deps.prisma.journalServiceRequest.findMany({ where: { journalId: id }, orderBy: { createdAt: 'desc' } }), journalStats(deps, id),
    ]);
    return { journal: await journalSummary(deps, access.journal), articles: await Promise.all(articles.map(async (a) => ({ ...a, releases: await txReleases(deps.prisma, a.id), jobs: jobs.filter((j) => j.articleId === a.id) }))), grants: access.membership.role === 'reviewer' ? [] : grants, jobs, serviceRequests: access.membership.role === 'reviewer' ? [] : serviceRequests, stats: access.membership.role === 'reviewer' ? { articles: articles.length, published: null, jobsSucceeded: jobs.filter((j) => j.state === 'succeeded').length, pageViews: null, apiReads: null } : stats, membership: { role: role(access.membership.role) } };
  }));
  app.patch('/journals/:id/homepage', member(async (req, uid) => ({ journal: await journalSummary(deps, await updateJournalHomepage(deps, uid, ids.parse(req.params).id, applicationBody.pick({ revision: true, nameZh: true, nameEn: true, websiteUrl: true, publisherName: true, sponsorName: true, subjects: true, description: true, logoUrl: true }).extend({ revision }).parse(req.body))) })));
  app.post('/journals/:id/activate', member(async (req, uid) => ({ journal: await journalSummary(deps, await activateJournalHomepage(deps, uid, ids.parse(req.params).id)) })));
  app.get('/journals/:id/members', member(async (req, uid) => ({ items: (await listJournalMembers(deps, uid, ids.parse(req.params).id)).map((m) => ({ ...m, role: role(m.role) })) })));
  app.post('/journals/:id/members', member(async (req, uid) => {
    const { id } = ids.parse(req.params); await journalScope(deps.prisma, id, uid, ['owner', 'maintainer']);
    const body = z.object({ email: z.string().email(), role: memberRole }).strict().parse(req.body);
    const target = await deps.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (!target) throw new JournalError('VALIDATION_ERROR', '成员需先注册并验证邮箱');
    return { member: await addJournalMember(deps, uid, id, { targetUserId: target.id, role: body.role }) };
  }));
  app.patch('/journals/:id/members/:userId', member(async (req, uid) => {
    const p = ids.extend({ userId: z.string().uuid() }).parse(req.params);
    await changeJournalMemberRole(deps, uid, p.id, { targetUserId: p.userId, role: z.object({ role: memberRole }).strict().parse(req.body).role }); return { ok: true };
  }));
  app.delete('/journals/:id/members/:userId', member(async (req, uid) => { const p = ids.extend({ userId: z.string().uuid() }).parse(req.params); await removeJournalMember(deps, uid, p.id, p.userId); return { ok: true }; }));
  app.post('/journals/:id/owner', member(async (req, uid) => ({ journal: await journalSummary(deps, await transferJournalOwnership(deps, uid, ids.parse(req.params).id, z.object({ newOwnerId: z.string().uuid(), reason: z.string().trim().min(1).max(2000) }).strict().parse(req.body))) })));
  app.post('/journals/:id/articles', member(async (req, uid) => {
    const { id } = ids.parse(req.params); await journalScope(deps.prisma, id, uid, ['owner', 'maintainer', 'author'], true);
    const input = z.object({ metadata }).strict().parse(req.body).metadata;
    const authoritative = input.doi ? await fetchJournalDoiMetadata(input.doi, deps.journalMetadataFetcher) : input;
    const result = await importJournalArticle(deps, uid, id, authoritative); return { article: result.article };
  }));
  app.post('/journals/:id/articles/preview', member(async (req, uid) => {
    const { id } = ids.parse(req.params); await journalScope(deps.prisma, id, uid, ['owner', 'maintainer', 'author'], true);
    const { dois } = z.object({ dois: z.array(z.string().max(500)).min(1).max(50) }).strict().parse(req.body);
    const items = [];
    for (let i = 0; i < dois.length; i += 4) items.push(...await Promise.all(dois.slice(i, i + 4).map(async (doi) => {
      try { return { input: doi, ...await previewJournalArticle(deps, uid, id, await fetchJournalDoiMetadata(doi, deps.journalMetadataFetcher)) }; }
      catch (error) { return { input: doi, status: 'failed' as const, error: error instanceof JournalError ? error.message : 'DOI 格式、期刊归属或元数据服务不可用，请核对后重试' }; }
    })));
    return { items };
  }));
  app.post('/journals/:id/articles/import', member(async (req, uid) => {
    const { id } = ids.parse(req.params); await journalScope(deps.prisma, id, uid, ['owner', 'maintainer', 'author'], true);
    const { dois } = z.object({ dois: z.array(z.string().max(500)).min(1).max(50) }).strict().parse(req.body);
    const items: Array<{ input: string; status: string; articleId?: string; error?: string }> = [];
    for (let i = 0; i < dois.length; i += 4) items.push(...await Promise.all(dois.slice(i, i + 4).map(async (doi) => {
      try { const info = await fetchJournalDoiMetadata(doi, deps.journalMetadataFetcher); const r = await importJournalArticle(deps, uid, id, info); return { input: doi, status: r.duplicate ? 'duplicate' : 'imported', articleId: r.article.id }; }
      catch (error) { return { input: doi, status: 'failed', error: error instanceof JournalError ? error.message : 'DOI 格式、期刊归属或来源元数据不可用，请核对后重试' }; }
    })));
    return { items };
  }));
  app.get('/journals/:id/articles/:articleId', member(async (req, uid) => { const p = articleIds.parse(req.params); return { article: await getManagedJournalArticle(deps, uid, p.id, p.articleId) }; }));
  app.get('/journals/:id/articles/:articleId/sources', member(async (req, uid) => { const p = articleIds.parse(req.params); return listJournalArticleSources(deps, uid, p.id, p.articleId); }));
  app.post('/journals/:id/articles/:articleId/sources', member(async (req, uid) => { const p = articleIds.parse(req.params); return addJournalArticleSource(deps, uid, p.id, p.articleId, z.object({ revision, source: sourceRecord }).strict().parse(req.body)); }));
  app.patch('/journals/:id/articles/:articleId/sources/:sourceId/rights', member(async (req, uid) => { const p = articleIds.extend({ sourceId: z.string().min(1).max(200) }).parse(req.params); return updateJournalArticleSourceRights(deps, uid, p.id, p.articleId, p.sourceId, sourceRightsUpdate.parse(req.body)); }));
  app.post('/journals/:id/articles/:articleId/processing-capability/recalculate', member(async (req, uid) => { const p = articleIds.parse(req.params); const result = await listJournalArticleSources(deps, uid, p.id, p.articleId); return { capability: result.capability }; }));
  app.post('/journals/:id/articles/:articleId/source-file', member(async (req, uid) => {
    const p = articleIds.parse(req.params);
    await journalScope(deps.prisma, p.id, uid, ['owner', 'maintainer', 'author'], true);
    if (!deps.storage) throw new JournalError('INVALID_STATE', '来源存储服务尚未配置');
    let file: { filename: string; content: Buffer } | undefined; const fields: Record<string, unknown> = {};
    for await (const part of req.parts()) {
      if (part.type === 'file') { const content = await part.toBuffer(); if (part.file.truncated || content.length > JOURNAL_FILE_LIMIT) throw new JournalError('VALIDATION_ERROR', '来源文件超过 50 MB'); file = { filename: part.filename, content }; }
      else fields[part.fieldname] = part.value;
    }
    if (!file) throw new JournalError('VALIDATION_ERROR', '请选择来源文件');
    const input = z.object({ revision: z.coerce.number().int().positive(), requestKey }).strict().parse(fields);
    return uploadJournalSource({ ...deps, storage: deps.storage }, uid, p.id, p.articleId, { ...input, ...file });
  }));
  app.patch('/journals/:id/articles/:articleId', member(async (req, uid) => { const p = articleIds.parse(req.params); const body = z.object({ revision, metadata: metadata.optional(), directoryVisible: z.boolean().optional(), source: source.optional(), rights: rights.optional(), draft: z.unknown().optional() }).strict().parse(req.body); await updateJournalArticle(deps, uid, p.id, p.articleId, body as Parameters<typeof updateJournalArticle>[4]); return { article: await getManagedJournalArticle(deps, uid, p.id, p.articleId) }; }));
  app.post('/journals/:id/articles/:articleId/ai-drafts', member(async (req, uid) => { const p = articleIds.parse(req.params); return { job: await submitJournalJob(deps, uid, p.id, p.articleId, jobBody.parse(req.body)) }; }));
  app.post('/journals/:id/articles/:articleId/processing-jobs', member(async (req, uid) => { const p = articleIds.parse(req.params); return { job: await submitJournalJob(deps, uid, p.id, p.articleId, jobBody.parse(req.body)) }; }));
  app.get('/journals/:id/processing-priorities', member(async (req, uid) => { const p = ids.parse(req.params); return listJournalProcessingPriorities(deps, uid, p.id, z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().parse(req.query)); }));
  app.post('/journals/:id/articles/:articleId/priority-override', member(async (req, uid) => { const p = articleIds.parse(req.params); return { priority: await setJournalPriorityOverride(deps, uid, p.id, p.articleId, z.object({ editorPriorityScore: z.number().int().min(0).max(10), deferredUntil: z.string().datetime().nullable().default(null), reason: z.string().trim().min(1).max(2000) }).strict().parse(req.body)) }; }));
  app.post('/journals/:id/jobs/:jobId/cancel', member(async (req, uid) => { const p = ids.extend({ jobId: z.string().uuid() }).parse(req.params); return { job: await cancelJournalJob(deps, uid, p.id, p.jobId) }; }));
  app.post('/journals/:id/articles/:articleId/review', member(async (req, uid) => { const p = articleIds.parse(req.params); return { article: await reviewJournalArticle(deps, uid, p.id, p.articleId, z.object({ revision, decision: z.enum(['submit', 'approve', 'request_changes']), note: z.string().max(5000).default('') }).strict().parse(req.body)) }; }));
  app.post('/journals/:id/articles/:articleId/reviewer', member(async (req, uid) => { const p = articleIds.parse(req.params); return { article: await assignJournalReviewer(deps, uid, p.id, p.articleId, z.object({ revision, reviewerId: z.string().uuid() }).strict().parse(req.body)) }; }));
  app.post('/journals/:id/articles/:articleId/publish', member(async (req, uid) => { const p = articleIds.parse(req.params); return { release: await publishJournalArticle(deps, uid, p.id, p.articleId, { ...z.object({ revision, requestKey, humanConfirmed: z.literal(true) }).strict().parse(req.body), publicIdPrefix: deps.publicIdPrefix }) }; }));
  app.post('/journals/:id/articles/:articleId/feedback', member(async (req, uid) => {
    const p = articleIds.parse(req.params);
    return { feedback: await createJournalFeedback(deps, uid, p.id, p.articleId, z.object({ versionNo: z.number().int().positive(), content: z.string().trim().min(1).max(5000), requestKey }).strict().parse(req.body)) };
  }));
  app.get('/journals/:id/feedback', member(async (req, uid) => {
    const result = await listJournalFeedback(deps, uid, ids.parse(req.params).id, z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().parse(req.query));
    return result;
  }));
  app.post('/journals/:id/feedback/:feedbackId/respond', member(async (req, uid) => {
    const p = ids.extend({ feedbackId: z.string().uuid() }).parse(req.params);
    return { feedback: await respondJournalFeedback(deps, uid, p.id, p.feedbackId, z.object({ expectedStatus: z.enum(['open', 'resolved', 'declined']), status: z.enum(['resolved', 'declined']), response: z.string().trim().min(1).max(5000) }).strict().parse(req.body)) };
  }));
  app.post('/journals/:id/articles/:articleId/restrict', member(async (req, uid) => { const p = articleIds.parse(req.params); return { article: await restrictJournalArticle(deps, uid, p.id, p.articleId, z.object({ state: z.enum(['restricted', 'withdrawn']), reason: z.string().trim().min(1).max(5000) }).strict().parse(req.body)) }; }));
  app.get('/journals/:id/service-plan', member(async (req, uid) => getJournalServicePlan(deps, uid, ids.parse(req.params).id)));
  app.post('/journals/:id/service-requests', member(async (req, uid) => ({ request: await createJournalServiceRequest(deps, uid, ids.parse(req.params).id, z.object({ annualVolume: z.number().int().positive().max(1_000_000), language: z.string().max(100), figureScale: z.string().max(100), services: z.array(z.string().max(100)).min(1).max(20), notes: z.string().max(5000).optional(), requestKey, planChoice: z.enum(['free', 'starter', 'pro', 'premium', 'custom']).optional() }).strict().parse(req.body)) })));
  app.get('/journals/:id/stats', member(async (req, uid) => { const { id } = ids.parse(req.params); await journalScope(deps.prisma, id, uid, ['owner', 'maintainer', 'author']); return journalStats(deps, id); }));
  app.get('/admin/journals/applications', admin(async (_req, uid) => ({ items: await listAdminApplications(deps, uid) })));
  app.post('/admin/journals/applications/:id/reopen', admin(async (req, uid) => ({ application: await reopenJournalApplication(deps, uid, {
    applicationId: ids.parse(req.params).id,
    ...z.object({ expectedRevision: revision, reason: z.string().trim().min(1).max(2000) }).strict().parse(req.body),
  }) })));
  app.post('/admin/journals/applications/:id/review', admin(async (req, uid) => { const result = await verifyJournalApplication(deps, uid, { applicationId: ids.parse(req.params).id, ...z.object({ decision: z.enum(['approved', 'rejected', 'needs_information']), reason: z.string().max(5000).optional(), slug: z.string().min(3).max(80).optional() }).strict().parse(req.body) }); return { application: result.application, journal: result.journal ? await journalSummary(deps, result.journal) : null }; }));
  app.get('/admin/journals', admin(async () => ({ items: await Promise.all((await deps.prisma.journal.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map((j) => journalSummary(deps, j))) })));
  app.get('/admin/journals/service-requests', admin(async () => ({ items: await deps.prisma.journalServiceRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }) })));
  app.post('/admin/journals/service-requests/:id/review', admin(async (req, uid) => ({ request: await reviewJournalServiceRequest(deps, uid, ids.parse(req.params).id, z.object({ status: z.enum(['quoted', 'rejected', 'cancelled']), expectedStatus: z.enum(['submitted', 'quoted', 'approved', 'rejected', 'cancelled']), note: z.string().trim().min(1).max(5000) }).strict().parse(req.body)) })));
  app.post('/admin/journals/:id/state', admin(async (req, uid) => ({ journal: await journalSummary(deps, await setJournalOperationalState(deps, uid, { journalId: ids.parse(req.params).id, ...z.object({ action: z.enum(['pause', 'close', 'reverify', 'resume']), reason: z.string().trim().min(1).max(5000) }).strict().parse(req.body) })) })));
  app.post('/admin/journals/:id/grants', admin(async (req, uid) => { const body = z.object({ amount: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), expiresAt: z.string().datetime(), reason: z.string().trim().min(1).max(5000), requestKey, serviceRequestId: z.string().uuid().optional() }).strict().parse(req.body); return { grant: await grantJournalCredits(deps, uid, { ...body, journalId: ids.parse(req.params).id, expiresAt: new Date(body.expiresAt) }) }; }));
  app.get('/journals/:id/articles', async (req, reply) => {
    reply.header('Cache-Control', 'no-store'); const { id } = ids.parse(req.params); const q = pageQuery.parse(req.query);
    const journal = await deps.prisma.journal.findFirst({ where: { id, homepagePublished: true } }); if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
    const rows = await deps.prisma.journalArticle.findMany({ where: { journalId: id, directoryVisible: true }, orderBy: { id: 'asc' }, take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    return { items: await Promise.all(rows.slice(0, q.limit).map(async (a) => {
      // Keep the public bibliography entry visible even when the current source
      // rights do not permit exposing an interpretation. txReleases applies the
      // current rights gate to each published release.
      const releases = a.contentState === 'active' ? await txReleases(deps.prisma, a.id, true, deps.now?.() ?? new Date()) : [];
      return { id: a.id, journalId: id, workId: a.workId, metadata: publicArticleMetadata(a.metadata), directoryState: 'listed', contentState: a.contentState,
        interpretationKind: releases[0]?.scope ?? null, latestUrl: releases[0] ? `/research/${releases[0].publicId}` : null, releases };
    })), nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  });
  app.get('/journals/:slug', async (req, reply) => {
    reply.header('Cache-Control', 'no-store'); const { slug } = z.object({ slug: z.string().min(1).max(100) }).parse(req.params);
    const journal = await deps.prisma.journal.findFirst({ where: { homepagePublished: true, OR: [{ slug }, ...(z.string().uuid().safeParse(slug).success ? [{ id: slug }] : [])] } });
    if (!journal) throw new JournalError('JOURNAL_NOT_FOUND', '期刊不存在');
    // This is a measured API response count, never an AI citation or unique visitor estimate.
    if (process.env.NODE_ENV === 'production') { const day = new Date(); day.setUTCHours(0, 0, 0, 0); await deps.prisma.journalMetric.upsert({ where: { journalId_day_kind: { journalId: journal.id, day, kind: 'api_read' } }, create: { journalId: journal.id, day, kind: 'api_read', count: 1 }, update: { count: { increment: 1 } } }); }
    return { journal: await publicJournalSummary(deps, journal) };
  });
}
async function journalStats(deps: Deps, journalId: string) {
  const [articles, published, jobsSucceeded, metrics] = await Promise.all([
    deps.prisma.journalArticle.count({ where: { journalId } }),
    deps.prisma.journalArticle.count({ where: { journalId, contentState: 'active', releases: { some: { version: { status: 'published' } } } } }),
    deps.prisma.journalJob.count({ where: { journalId, state: 'succeeded' } }), deps.prisma.journalMetric.findMany({ where: { journalId } }),
  ]);
  return { articles, published, jobsSucceeded, pageViews: null, apiReads: metrics.filter((m) => m.kind === 'api_read').reduce((sum, m) => sum + m.count, 0), note: '访问与调用不能等同 AI 引用；页面访客统计尚未采集' };
}
