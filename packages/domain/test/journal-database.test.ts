import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activateJournalHomepage, addJournalMember, createJournalServiceRequest, reviewJournalServiceRequest, getPublicJournal, grantJournalCredits, removeJournalMember, saveJournalApplication, submitJournalApplication, verifyJournalApplication } from '../src/journal/onboarding';
import { assignJournalReviewer, getManagedJournalArticle, importJournalArticle, reviewJournalArticle, updateJournalArticle } from '../src/journal/articles';
import { cancelJournalJob, claimJournalJob, finishJournalJob, recoverJournalJobs, submitJournalJob } from '../src/journal/processing';
import { publishJournalArticle, restrictJournalArticle } from '../src/journal/publishing';
import type { JournalDraft, JournalMetadata } from '../src/journal/content';
import { uploadJournalSource } from '../src/journal/source-upload';
import { updateJournalArticleSourceRights } from '../src/journal/enhancements';
import type { WorkspaceDeps } from '../src/workspace/types';
import type { StorageAdapter } from '@openscience/storage';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const suiteRunId = randomUUID();
const sentence = 'Numerical simulations predict a peak power of 14.7 TW; the complete system has not been experimentally demonstrated.';
const source = { kind: 'fulltext' as const, text: sentence, url: 'https://journals.example.test/paper', label: 'Synthetic validation source: results paragraph' };
const rights = { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Synthetic content owned by this isolated test' };
const draft: JournalDraft = {
  summary: 'The synthetic example predicts 14.7 TW by numerical simulation.',
  core: { problem: 'Test scientific evidence preservation.', insight: 'A numerical prediction.', method: 'Numerical simulation.', results: 'Predicted 14.7 TW.', limitations: 'The complete system has not been experimentally demonstrated.', reproducibility: 'Inputs are not reported in this synthetic paragraph.' },
  claims: [{ text: 'Numerical prediction: 14.7 TW.', kind: 'simulation', evidence: { quote: sentence, locator: 'Results paragraph' } }],
  figures: [], faq: [{ question: 'Was the complete system experimentally demonstrated?', answer: 'No. This is a numerical prediction.', evidence: { quote: sentence, locator: 'Results paragraph' } }], scope: 'fulltext', language: 'en',
};
function validIssn() {
  const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const check = (11 - [...digits].reduce((s, n, i) => s + Number(n) * (8 - i), 0) % 11) % 11;
  return `${digits}${check === 10 ? 'X' : check}`;
}
suite('journal lifecycle against isolated PostgreSQL (not production)', () => {
  let prisma: PrismaClient; let deps: WorkspaceDeps; let adminId: string;
  const currentTestJournalIds = new Set<string>();
  async function settleActiveSyntheticJobs(journalIds?: string[]) {
    while (true) {
      const active = await prisma.journalJob.findMany({
        where: {
          state: { in: ['staging', 'pending', 'running'] },
          ...(journalIds ? { journalId: { in: journalIds } } : { journal: { is: {
            nameEn: 'Synthetic Validation Journal',
            websiteUrl: 'https://journals.example.test',
            publisherName: 'Isolated test publisher',
            application: { is: {
              representationEvidence: 'Synthetic test fixture',
              rightsDeclaration: 'I have authorization for this synthetic test.',
              rightsDeclarationVersion: '1',
              applicantEmail: { endsWith: '@example.invalid' },
            } },
          } } }),
        },
        select: { id: true, journalId: true, journal: { select: { workspace: { select: { ownerId: true } } } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      if (!active.length) return;
      for (const job of active) await cancelJournalJob(deps, job.journal.workspace.ownerId, job.journalId, job.id);
    }
  }
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || decodeURIComponent(url.pathname) !== '/journal_test') throw new Error('Journal tests require the explicitly named loopback journal_test database');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    deps = { prisma, mailer: { send: async () => undefined } };
    await settleActiveSyntheticJobs();
    adminId = (await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Isolated journal test admin', passwordHash: 'unusable-test-only', platformRole: 'platform_admin', status: 'email_verified' } })).id;
  });
  afterEach(async () => {
    await settleActiveSyntheticJobs([...currentTestJournalIds]);
    currentTestJournalIds.clear();
  });
  afterAll(async () => {
    if (prisma) await settleActiveSyntheticJobs();
    await prisma?.$disconnect();
  });
  async function user() {
    return prisma.user.create({ data: { email: `${suiteRunId}.${randomUUID()}@example.invalid`, displayName: 'Isolated test editor', passwordHash: 'unusable-test-only', status: 'email_verified' } });
  }
  async function journal() {
    const owner = await user(); const issn = validIssn();
    const application = await saveJournalApplication(deps, owner.id, { nameEn: 'Synthetic Validation Journal', pIssn: issn, websiteUrl: 'https://journals.example.test', publisherName: 'Isolated test publisher', subjects: ['Validation'], description: 'Test fixture, never a real participating journal', applicantName: owner.displayName, applicantTitle: 'Editor', applicantEmail: owner.email, representationEvidence: 'Synthetic test fixture', rightsDeclaration: 'I have authorization for this synthetic test.', rightsDeclarationVersion: '1' });
    const submitted = await submitJournalApplication(deps, owner.id, { applicationId: application.id, revision: application.revision, submissionKey: randomUUID() });
    const verified = await verifyJournalApplication(deps, adminId, { applicationId: submitted.id, decision: 'approved', slug: `test-${randomUUID()}` });
    currentTestJournalIds.add(verified.journal!.id);
    await activateJournalHomepage(deps, owner.id, verified.journal!.id);
    return { owner, journal: verified.journal!, issn, application: submitted };
  }
  async function article(ctx: Awaited<ReturnType<typeof journal>>, doi?: string) {
    const metadata: JournalMetadata = { title: 'Synthetic numerical prediction for verification', authors: ['Synthetic author'], publishedDate: '2026-01-01', journalTitle: 'Synthetic Validation Journal', issns: [ctx.issn], originalUrl: source.url, ...(doi ? { doi } : {}) };
    const imported = await importJournalArticle(deps, ctx.owner.id, ctx.journal.id, metadata);
    return updateJournalArticle(deps, ctx.owner.id, ctx.journal.id, imported.article.id, { revision: imported.article.revision, source, rights });
  }
  it('creates one trial on verification replay, keeps private applications and enforces cross-journal ownership', async () => {
    const a = await journal(); const b = await journal();
    expect((await getPublicJournal(deps, a.journal.slug)).id).toBe(a.journal.id);
    await verifyJournalApplication(deps, adminId, { applicationId: a.application.id, decision: 'approved', slug: 'ignored-replay' });
    expect(await prisma.journalGrant.count({ where: { journalId: a.journal.id } })).toBe(1);
    expect(await prisma.journalLedger.count({ where: { journalId: a.journal.id, kind: 'grant' } })).toBe(1);
    const item = await article(a);
    await expect(getManagedJournalArticle(deps, b.owner.id, a.journal.id, item.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.researchObject.findUniqueOrThrow({ where: { id: item.researchObjectId } })).visibility).toBe('private');
  });
  it('reviews a service request and grants its credits once, rejecting stale and duplicate opening', async () => {
    const ctx = await journal();
    const requestKey = randomUUID();
    const request = await createJournalServiceRequest(deps, ctx.owner.id, ctx.journal.id, { annualVolume: 100, language: ' en ', figureScale: ' 3 per article ', services: ['AI 标准解读包'], notes: ' Initial scope ', requestKey });
    const replay = await createJournalServiceRequest(deps, ctx.owner.id, ctx.journal.id, { annualVolume: 100, language: 'en', figureScale: '3 per article', services: ['AI 标准解读包'], notes: 'Initial scope', requestKey });
    expect(replay.id).toBe(request.id);
    await expect(createJournalServiceRequest(deps, ctx.owner.id, ctx.journal.id, { annualVolume: 100, language: 'en', figureScale: '3 per article', services: ['AI 标准解读包'], notes: 'Changed scope', requestKey })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(reviewJournalServiceRequest(deps, ctx.owner.id, request.id, { status: 'quoted', expectedStatus: 'submitted', note: 'Quote' })).rejects.toBeInstanceOf(Error);
    await reviewJournalServiceRequest(deps, adminId, request.id, { status: 'quoted', expectedStatus: 'submitted', note: 'Quote' });
    const grant = { journalId: ctx.journal.id, amount: 8, expiresAt: new Date(Date.now() + 86400000), reason: 'Agreed pilot service', requestKey: randomUUID(), serviceRequestId: request.id };
    await grantJournalCredits(deps, adminId, grant);
    await grantJournalCredits(deps, adminId, grant);
    expect(await prisma.journalGrant.count({ where: { serviceRequestId: request.id } })).toBe(1);
    await expect(grantJournalCredits(deps, adminId, { ...grant, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(reviewJournalServiceRequest(deps, adminId, request.id, { status: 'rejected', expectedStatus: 'quoted', note: 'Stale review' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('deduplicates canonical DOI under concurrent imports without claiming a personal RO', async () => {
    const ctx = await journal(); const doi = `10.5555/${randomUUID()}`;
    const metadata: JournalMetadata = { title: 'Dedup test', authors: ['Test'], issns: [ctx.issn], originalUrl: source.url, doi };
    const [a, b] = await Promise.all([importJournalArticle(deps, ctx.owner.id, ctx.journal.id, metadata), importJournalArticle(deps, ctx.owner.id, ctx.journal.id, { ...metadata, doi: `https://doi.org/${doi.toUpperCase()}` })]);
    expect(a.article.id).toBe(b.article.id);
    expect(await prisma.journalWork.count({ where: { doi } })).toBe(1);
    await expect(importJournalArticle(deps, ctx.owner.id, ctx.journal.id, { ...metadata, doi: undefined, issns: [validIssn()] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('reserves, delivers, reviews and publishes atomically; edits invalidate review and v1 remains immutable', async () => {
    const ctx = await journal(); const item = await article(ctx);
    const job = await submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: item.revision, language: 'en', requestKey: randomUUID() });
    const claimed = await claimJournalJob(deps); expect(claimed?.id).toBe(job.id);
    const completed = await finishJournalJob(deps, job.id, claimed!.leaseToken!, draft); expect(completed.state).toBe('succeeded');
    await finishJournalJob(deps, job.id, claimed!.leaseToken!, draft);
    const grant = await prisma.journalGrant.findFirstOrThrow({ where: { journalId: ctx.journal.id } });
    expect([grant.remaining, grant.reserved, grant.consumed]).toEqual([4, 0, 1]);
    const current = await getManagedJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id);
    const review = { revision: current.revision, note: 'Verified original evidence and prediction category.' };
    await reviewJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { ...review, decision: 'submit' });
    await reviewJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { ...review, decision: 'approve' });
    const publishInput = { revision: current.revision, humanConfirmed: true, requestKey: randomUUID() };
    const [published, replay] = await Promise.all([publishJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, publishInput), publishJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, publishInput)]);
    expect(published.id).toBe(replay.id);
    const v1 = await prisma.journalRelease.findUniqueOrThrow({ where: { id: published.id } });
    const snapshot = v1.snapshot as { source: Record<string, unknown> };
    expect(snapshot.source).not.toHaveProperty('text'); expect(snapshot).not.toHaveProperty('rights');
    const publicationV1 = await prisma.publication.findFirstOrThrow({ where: { versionId: v1.versionId } });
    expect(v1.digest).toMatch(/^[a-f0-9]{64}$/); expect(publicationV1.contentSha256).toBe(v1.digest);
    const frozenV1 = { snapshot: structuredClone(v1.snapshot), digest: v1.digest, contentSha256: publicationV1.contentSha256 };
    const edited = await updateJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: current.revision, draft: { ...draft, summary: 'A revised but still theoretical summary.' } });
    await expect(publishJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { ...publishInput, revision: edited.revision, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const unchangedV1 = await prisma.journalRelease.findUniqueOrThrow({ where: { id: published.id } });
    const unchangedPublicationV1 = await prisma.publication.findUniqueOrThrow({ where: { id: publicationV1.id } });
    expect({ snapshot: unchangedV1.snapshot, digest: unchangedV1.digest, contentSha256: unchangedPublicationV1.contentSha256 }).toEqual(frozenV1);
    const replacementBytes = Buffer.from('A replacement source immediately revokes public access until its own rights are confirmed.');
    const replacementStorage: StorageAdapter = {
      async headObject() { return null; }, async putObject(key, body) { if (!Buffer.isBuffer(body)) throw new Error('buffer expected'); return { key, size: body.length, etag: key }; },
      async getObject() { throw new Error('not used'); }, async deleteObject() { throw new Error('not used'); },
    };
    const replacement = await uploadJournalSource({ ...deps, storage: replacementStorage }, ctx.owner.id, ctx.journal.id, item.id, { revision: edited.revision, requestKey: randomUUID(), filename: 'replacement.txt', content: replacementBytes });
    expect((await prisma.researchObject.findUniqueOrThrow({ where: { id: item.researchObjectId } })).visibility).toBe('private');
    expect((await prisma.version.findUniqueOrThrow({ where: { id: v1.versionId } })).status).toBe('restricted');
    await cancelJournalJob(deps, ctx.owner.id, ctx.journal.id, replacement.job.id);
    await restrictJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { state: 'withdrawn', reason: 'Synthetic test withdrawal' });
    expect((await prisma.researchObject.findUniqueOrThrow({ where: { id: item.researchObjectId } })).visibility).toBe('private');
    expect((await prisma.version.findUniqueOrThrow({ where: { id: v1.versionId } })).status).toBe('withdrawn');
  });
  it('only one request can reserve the last credit; cancelling twice releases exactly once and expiration is not revived', async () => {
    const ctx = await journal(); const a = await article(ctx); const b = await article(ctx);
    await grantJournalCredits(deps, adminId, { journalId: ctx.journal.id, amount: -4, expiresAt: new Date(Date.now() + 60_000), reason: 'Isolated last-credit test', requestKey: randomUUID() });
    const attempts = await Promise.allSettled([a, b].map((item) => submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: item.revision, language: 'en', requestKey: randomUUID() })));
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const job = attempts.find((a) => a.status === 'fulfilled')!; if (job.status !== 'fulfilled') throw new Error('Expected one winner');
    await prisma.journalGrant.update({ where: { id: job.value.grantId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await cancelJournalJob(deps, ctx.owner.id, ctx.journal.id, job.value.id); await cancelJournalJob(deps, ctx.owner.id, ctx.journal.id, job.value.id);
    const grant = await prisma.journalGrant.findUniqueOrThrow({ where: { id: job.value.grantId! } });
    expect([grant.remaining, grant.reserved, grant.consumed]).toEqual([0, 0, 0]);
    expect(await prisma.journalLedger.count({ where: { jobId: job.value.id, kind: 'release' } })).toBe(1);
    await expect(submitJournalJob(deps, ctx.owner.id, ctx.journal.id, a.id, { revision: a.revision, language: 'en', requestKey: randomUUID() })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  });
  it('settles suite-owned active jobs during isolation cleanup without consuming their reserved credit', async () => {
    const ctx = await journal(); const item = await article(ctx);
    const job = await submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: item.revision, language: 'en', requestKey: randomUUID() });
    const before = await prisma.journalGrant.findUniqueOrThrow({ where: { id: job.grantId! } });
    expect(before.reserved).toBe(1);
    await settleActiveSyntheticJobs([ctx.journal.id]);
    await settleActiveSyntheticJobs([ctx.journal.id]);
    const after = await prisma.journalGrant.findUniqueOrThrow({ where: { id: job.grantId! } });
    expect((await prisma.journalJob.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('cancelled');
    expect([after.remaining, after.reserved, after.consumed, after.expired]).toEqual([before.remaining, 0, before.consumed, before.expired]);
    expect(await prisma.journalLedger.count({ where: { jobId: job.id, kind: 'release' } })).toBe(1);
  });
  it('rejects stale delivery after editing or revocation and reconciles abandoned workers', async () => {
    const ctx = await journal(); const editor = await user(); await addJournalMember(deps, ctx.owner.id, ctx.journal.id, { targetUserId: editor.id, role: 'editor' });
    const item = await article(ctx); const job = await submitJournalJob(deps, editor.id, ctx.journal.id, item.id, { revision: item.revision, language: 'en', requestKey: randomUUID() });
    const running = await claimJournalJob(deps); expect(running?.id).toBe(job.id);
    await removeJournalMember(deps, ctx.owner.id, ctx.journal.id, editor.id);
    expect((await finishJournalJob(deps, job.id, running!.leaseToken!, draft)).state).toBe('failed');
    expect((await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } })).draft).toBeNull();
    const next = await submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: item.revision, language: 'en', requestKey: randomUUID(), retryOf: job.id });
    const nextClaim = await claimJournalJob(deps); expect(nextClaim?.id).toBe(next.id);
    await prisma.journalJob.update({ where: { id: next.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await recoverJournalJobs(deps); await recoverJournalJobs(deps);
    expect((await prisma.journalJob.findUniqueOrThrow({ where: { id: next.id } })).state).toBe('failed');
    expect((await prisma.journalGrant.findUniqueOrThrow({ where: { id: next.grantId! } })).reserved).toBe(0);
  });
  it('stages source bytes behind measured artifacts and keeps replay, active-job and quota failures out of storage', async () => {
    const ctx = await journal(); const item = await article(ctx);
    const objects = new Map<string, Buffer>(); let putAttempts = 0; let failPut = false;
    const storage: StorageAdapter = {
      async headObject(key) { const body = objects.get(key); return body ? { size: body.length, etag: key } : null; },
      async putObject(key, body) {
        putAttempts += 1;
        if (failPut) throw new Error('synthetic storage failure');
        if (!Buffer.isBuffer(body)) throw new Error('buffer expected');
        objects.set(key, Buffer.from(body)); return { key, size: body.length, etag: key };
      },
      async getObject() { throw new Error('not used'); },
      async deleteObject() { throw new Error('shared CAS deletion must not be used'); },
    };
    const uploadDeps = { ...deps, storage };
    const content = Buffer.from('A measured synthetic full-text source for the journal upload transaction.');
    const requestKey = randomUUID();
    const input = { revision: item.revision, requestKey, filename: 'source.txt', content };
    const concurrent = await Promise.all([uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, input), uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, input)]);
    expect(concurrent[0].job.id).toBe(concurrent[1].job.id); expect(putAttempts).toBe(1);
    const durableJob = await prisma.journalJob.findUniqueOrThrow({ where: { id: concurrent[0].job.id } });
    expect(durableJob.state).toBe('staging');
    expect(await prisma.artifact.count({ where: { workspaceId: ctx.journal.workspaceId } })).toBe(1);
    expect((await uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, input)).job.id).toBe(durableJob.id);
    expect(putAttempts).toBe(1);
    const waitingArticle = await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } });
    const waitingSource = ((waitingArticle.source as { materials: Array<{ id: string }> }).materials)[0]!;
    await expect(submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: waitingArticle.revision, language: 'en', requestKey: randomUUID() })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await updateJournalArticleSourceRights(deps, ctx.owner.id, ctx.journal.id, item.id, waitingSource.id, {
      revision: waitingArticle.revision, rightsStatus: 'internal_processing_only', sourceConfidence: 'verified', activeForGeneration: true,
      permissions: { internalProcessing: true, derivativeGeneration: false, publicSource: false, publicDerivative: false, externalProcessing: false, figureReuse: false, derivativeIllustration: false }, evidence: { statement: 'File-specific permission to parse privately.' },
    });
    const claimedParse = await claimJournalJob(deps); expect(claimedParse?.id).toBe(durableJob.id);
    expect((await finishJournalJob(deps, durableJob.id, claimedParse!.leaseToken!, { text: content.toString('utf8') })).state).toBe('succeeded');
    const parsedArticle = await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } });
    await expect(submitJournalJob(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: parsedArticle.revision, language: 'en', requestKey: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await updateJournalArticleSourceRights(deps, ctx.owner.id, ctx.journal.id, item.id, waitingSource.id, {
      revision: parsedArticle.revision, rightsStatus: 'full_public_processing_allowed', sourceConfidence: 'verified', activeForGeneration: true,
      permissions: { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, figureReuse: false, derivativeIllustration: false }, evidence: { statement: 'File-specific derivative permission.', license: 'CC-BY-4.0' },
    });
    await expect(uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, { ...input, content: Buffer.from('Different unique bytes must conflict before reaching shared storage.') })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const replacementArticle = await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } });
    const replacementInput = { ...input, revision: replacementArticle.revision, requestKey: randomUUID(), content: Buffer.from('A replacement source can recover after the previous parse reaches a terminal state.') };
    const replacement = await uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, replacementInput);
    expect(replacement.job.state).toBe('staging');
    expect((await uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, replacementInput)).job.id).toBe(replacement.job.id);
    const replacementState = await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } });
    const replacementMaterials = (replacementState.source as { materials: Array<{ activeForGeneration: boolean }> }).materials;
    expect(replacementMaterials.filter((entry) => entry.activeForGeneration)).toHaveLength(1);
    expect(replacementMaterials).toHaveLength(2);
    expect(putAttempts).toBe(2);
    await prisma.journalJob.update({ where: { id: replacement.job.id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    await recoverJournalJobs(deps);
    expect((await prisma.journalJob.findUniqueOrThrow({ where: { id: replacement.job.id } })).state).toBe('failed');
    const timedOutArticle = await prisma.journalArticle.findUniqueOrThrow({ where: { id: item.id } });
    const recovery = await uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, item.id, { ...input, revision: timedOutArticle.revision, requestKey: randomUUID(), content: Buffer.from('A fresh replacement remains possible after an awaiting-rights upload times out.') });
    expect(recovery.job.state).toBe('staging');
    await cancelJournalJob(deps, ctx.owner.id, ctx.journal.id, recovery.job.id);
    expect(putAttempts).toBe(3);
    const failureItem = await article(ctx, `10.1234/${randomUUID()}`);
    const current = await prisma.journalArticle.findUniqueOrThrow({ where: { id: failureItem.id } });
    failPut = true; const failedKey = randomUUID();
    await expect(uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, failureItem.id, { revision: current.revision, requestKey: failedKey, filename: 'failed.txt', content: Buffer.from('This measured artifact remains private when its storage write fails.') })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await prisma.journalJob.findUniqueOrThrow({ where: { journalId_requestKey: { journalId: ctx.journal.id, requestKey: failedKey } } })).state).toBe('failed');
    expect(await prisma.artifact.count({ where: { workspaceId: ctx.journal.workspaceId } })).toBe(4);
    expect((await prisma.journalArticle.findUniqueOrThrow({ where: { id: failureItem.id } })).revision).toBe(current.revision);
    const failedUpload = await prisma.journalJob.findUniqueOrThrow({ where: { journalId_requestKey: { journalId: ctx.journal.id, requestKey: failedKey } } });
    await prisma.journalJob.update({ where: { id: failedUpload.id }, data: { state: 'staging', error: null, createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    await recoverJournalJobs(deps);
    expect((await prisma.journalJob.findUniqueOrThrow({ where: { id: failedUpload.id } })).state).toBe('failed');

    failPut = false;
    const measured = await prisma.artifact.aggregate({ where: { workspaceId: ctx.journal.workspaceId }, _sum: { size: true } });
    await prisma.journal.update({ where: { id: ctx.journal.id }, data: { storageLimitBytes: measured._sum.size! } });
    await expect(uploadJournalSource(uploadDeps, ctx.owner.id, ctx.journal.id, failureItem.id, { revision: current.revision, requestKey: randomUUID(), filename: 'over-quota.txt', content: Buffer.from('Quota rejection happens before another object-store write attempt.') })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(putAttempts).toBe(4); expect(await prisma.artifact.count({ where: { workspaceId: ctx.journal.workspaceId } })).toBe(4);
  });
  it('limits reviewers to assigned papers and cannot publish edited source without new approval', async () => {
    const ctx = await journal(); const reviewer = await user(); await addJournalMember(deps, ctx.owner.id, ctx.journal.id, { targetUserId: reviewer.id, role: 'reviewer' });
    const item = await article(ctx);
    await expect(getManagedJournalArticle(deps, reviewer.id, ctx.journal.id, item.id)).rejects.toMatchObject({ status: 404 });
    const assigned = await assignJournalReviewer(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: item.revision, reviewerId: reviewer.id });
    expect((await getManagedJournalArticle(deps, reviewer.id, ctx.journal.id, item.id)).id).toBe(item.id);
    const updated = await updateJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: assigned.revision, draft });
    await reviewJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: updated.revision, decision: 'submit', note: '' });
    await reviewJournalArticle(deps, reviewer.id, ctx.journal.id, item.id, { revision: updated.revision, decision: 'approve', note: 'Checked source.' });
    const changed = await updateJournalArticle(deps, ctx.owner.id, ctx.journal.id, item.id, { revision: updated.revision, source: { ...source, text: `${sentence} Updated source note.` } });
    expect(changed.reviewedRevision).toBeNull(); expect(changed.draft).toBeNull();
  });
});
