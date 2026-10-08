import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Prisma, PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import { describe, expect, it } from 'vitest';
import { saveJournalApplication, submitJournalApplication, verifyJournalApplication, activateJournalHomepage } from '../src/journal/onboarding';
import { importJournalArticle, updateJournalArticle, reviewJournalArticle } from '../src/journal/articles';
import { publishJournalArticle } from '../src/journal/publishing';
import { stageJournalSharedSource, startJournalSharedProcessing, getJournalSharedCandidate,
  confirmJournalSharedInterpretation } from '../src/journal/shared-workspace';
import { updateJournalArticleSourceRights } from '../src/journal/enhancements';
import { persistDocumentSourceMapReference } from '../src/research-intelligence/source-map-ref';
import { createBlockSourceLocator } from '../src/research-intelligence/source-locator';
import { requireNativePaperAuthor } from '../src/ingestion/native-paper-author';
import { recoverJournalJobs } from '../src/journal/processing';
import { fields } from './agent/direct-source-review-fixture';
import type { JournalDraft } from '../src/journal/content';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const text = 'The numerical model predicts coherent radiation under the stated optical geometry, and no experimental demonstration is reported.';
const oldText = 'Numerical simulations predict a peak power of 14.7 TW; the complete system has not been experimentally demonstrated.';
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function validIssn() {
  const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const check = (11 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (8 - index), 0) % 11) % 11;
  return `${digits}${check === 10 ? 'X' : check}`;
}

suite('journal shared Native confirmation against isolated PostgreSQL', () => {
  it('projects one saved Native paper-author result into one private version without changing the old public release', async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || decodeURIComponent(url.pathname) !== '/journal_test')
      throw new Error('Journal confirmation requires loopback journal_test');
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const objects = new Map<string, Buffer>();
    const storage: StorageAdapter = {
      async headObject(key) { const data = objects.get(key); return data ? { key, size: data.length, etag: key } : null; },
      async putObject(key, body) { const data = Buffer.isBuffer(body) ? body : Buffer.from(body); objects.set(key, data); return { key, size: data.length, etag: key }; },
      async getObject(key) { const data = objects.get(key); if (!data) throw new Error('Missing fixture object');
        return { size: data.length, body: Readable.from([data]) }; },
      async deleteObject(key) { objects.delete(key); },
    } as StorageAdapter;
    const queued: string[] = [];
    const nativeAgentRuntime = { runtimeId: 'fixture-native-runtime', skillCatalogueId: 'fixture-native-skills', model: 'MiniMax-M3' };
    const deps = { prisma, mailer: { send: async () => undefined }, storage, nativeAgentRuntime,
      redis: { lpush: async (_queue: string, taskId: string) => { queued.push(taskId); return 1; } } as never };
    try {
      const admin = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Journal DB fixture admin',
        passwordHash: 'unusable', platformRole: 'platform_admin', status: 'email_verified' } });
      const owner = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Journal DB fixture editor',
        passwordHash: 'unusable', status: 'email_verified' } });
      const application = await saveJournalApplication(deps, owner.id, { nameEn: 'Synthetic Validation Journal', pIssn: validIssn(),
        websiteUrl: 'https://journals.example.test', publisherName: 'Isolated test publisher', subjects: ['Validation'],
        description: 'Test fixture', applicantName: owner.displayName, applicantTitle: 'Editor', applicantEmail: owner.email,
        representationEvidence: 'Synthetic test fixture', rightsDeclaration: 'I have authorization for this synthetic test.',
        rightsDeclarationVersion: '1' });
      const submitted = await submitJournalApplication(deps, owner.id, { applicationId: application.id,
        revision: application.revision, submissionKey: randomUUID() });
      const verified = await verifyJournalApplication(deps, admin.id, { applicationId: submitted.id,
        decision: 'approved', slug: `confirmation-${randomUUID()}` });
      const journalId = verified.journal!.id;
      await activateJournalHomepage(deps, owner.id, journalId);
      const imported = await importJournalArticle(deps, owner.id, journalId, { title: 'Synthetic confirmation paper',
        authors: ['Synthetic author'], originalUrl: 'https://journals.example.test/paper' });
      const oldSource = { kind: 'fulltext' as const, text: oldText, url: 'https://journals.example.test/paper', label: 'Old public source' };
      const rights = { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true,
        externalProcessing: true, license: 'Synthetic test licence', evidence: 'Editor-owned synthetic text' };
      const oldDraft: JournalDraft = { summary: 'A synthetic numerical prediction.', core: {
        problem: 'Synthetic problem', insight: 'Numerical prediction', method: 'Simulation', results: 'Predicted 14.7 TW',
        limitations: 'No experimental demonstration', reproducibility: 'Inputs not supplied', },
        claims: [{ text: 'A numerical prediction', kind: 'simulation', evidence: { quote: oldText, locator: 'old source' } }],
        figures: [], faq: [{ question: 'Was it demonstrated?', answer: 'No.', evidence: { quote: oldText, locator: 'old source' } }],
        scope: 'fulltext', language: 'en' };
      const edited = await updateJournalArticle(deps, owner.id, journalId, imported.article.id, {
        revision: imported.article.revision, source: oldSource, rights, draft: oldDraft });
      await reviewJournalArticle(deps, owner.id, journalId, edited.id, { revision: edited.revision,
        decision: 'submit', note: 'Synthetic review' });
      await reviewJournalArticle(deps, owner.id, journalId, edited.id, { revision: edited.revision,
        decision: 'approve', note: 'Synthetic review' });
      const publicRelease = await publishJournalArticle(deps, owner.id, journalId, edited.id, {
        revision: edited.revision, requestKey: randomUUID(), humanConfirmed: true });
      const frozen = await prisma.journalRelease.findUniqueOrThrow({ where: { id: publicRelease.id } });
      const bytes = Buffer.from(text, 'utf8');
      const staged = await stageJournalSharedSource(deps, owner.id, journalId, edited.id, {
        revision: edited.revision, requestKey: randomUUID(), filename: 'new-paper.txt', content: bytes });
      const article = await prisma.journalArticle.findUniqueOrThrow({ where: { id: edited.id } });
      const material = (article.source as { materials: Array<{ id: string }> }).materials.at(-1)!;
      const permitted = await updateJournalArticleSourceRights(deps, owner.id, journalId, edited.id, material.id, {
        revision: article.revision, rightsStatus: 'internal_processing_only', sourceConfidence: 'editor_claimed',
        permissions: { internalProcessing: true, derivativeGeneration: true, externalProcessing: true, publicSource: false,
          publicDerivative: false, figureReuse: false, derivativeIllustration: false },
        evidence: { statement: 'Editor authorizes processing of the synthetic source', license: 'Synthetic test licence' },
        activeForGeneration: true });
      const started = await startJournalSharedProcessing(deps, owner.id, journalId, edited.id, {
        revision: permitted.articleRevision, requestKey: randomUUID(), processingConsent: true });
      expect(queued).toHaveLength(1);
      const ingestion = await prisma.ingestionTask.findUniqueOrThrow({ where: { id: started.tasks[0]!.id },
        include: { artifact: true } });
      expect(ingestion.artifactId).toBe(staged.artifactId);
      const agentTaskId = ingestion.agentTaskId!;
      expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: agentTaskId } })).result)
        .toMatchObject({ nativeAgentExecution: { profile: 'paper-author', ...nativeAgentRuntime } });
      const parser = { name: 'fixture', version: '1' };
      const map = { artifactId: staged.artifactId, contentHash: hash(bytes), parser, pages: [{ page: 1, width: 100,
        height: 100, blocks: [{ id: 'source', kind: 'paragraph' as const, text,
          boundingBox: { x: 1, y: 1, width: 90, height: 90 }, parser, transformations: [] }] }] };
      const ref = await persistDocumentSourceMapReference(storage, map, 'succeeded');
      const locator = createBlockSourceLocator(map, 'source', { charRange: { start: 0, end: text.length } });
      const runtime = nativeAgentRuntime;
      const cp = { taskId: agentTaskId, objectKey: `derived/native-agent/${'c'.repeat(64)}.json`, serializedSha256: 'c'.repeat(64),
        size: 100, artifactId: staged.artifactId, documentSha256: hash(bytes), sourceMapHash: ref.serializedSha256,
        executionAttempt: 1, turnCount: 3, state: 'completed', target: { provider: 'primary', model: runtime.model,
          promptHash: 'd'.repeat(64) }, responseHash: 'e'.repeat(64), finishReason: 'stop', hasToolCalls: false };
      const claim = { clientKey: 'core', sourceField: 'insight', kind: 'core', statement: text,
        conditions: [], limitations: [], sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] };
      const result = { nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-author', ...runtime, checkpoint: cp },
        canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef: ref,
        core: { schemaVersion: '0.1.0', ...fields(() => text) },
        evidence: fields(() => ({ quote: text, locator: 'passages:P00001' })),
        evidenceSegments: fields(() => [{ quote: text, sourceLocator: locator }]),
        evidenceLocation: fields(() => ({ status: 'located', origin: 'model_quote', matching: 'exact', sourceLocator: locator })),
        needsMoreInformation: [], reviewedClaimSuggestions: [{ ...claim, sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }],
        scientificReview: { kind: 'hermes_agent_review', profile: 'paper-author', contractVersion: '5', status: 'review_received',
          ...runtime, ...cp.target, responseHash: cp.responseHash, reviewedCandidateHash: 'f'.repeat(64), finishReason: 'stop',
          fieldReviews: fields(() => ({ verdict: 'accepted', summary: text, sourcePassageIds: ['P00001'], issues: [] })),
          draftClaims: [claim] } };
      await prisma.agentTask.update({ where: { id: agentTaskId }, data: { status: 'succeeded', executionAttempt: 1,
        result: result as unknown as Prisma.InputJsonValue } });
      await prisma.ingestionTask.update({ where: { id: ingestion.id }, data: { state: 'needs_review' } });
      await prisma.hermesResearchRun.update({ where: { id: started.run.id }, data: { status: 'awaiting_source_review' } });
      await prisma.hermesResearchStep.updateMany({ where: { runId: started.run.id, stage: 'source_ingestion' }, data: { status: 'succeeded' } });
      requireNativePaperAuthor(await prisma.agentTask.findUniqueOrThrow({ where: { id: agentTaskId } }));
      const candidate = await getJournalSharedCandidate(deps, owner.id, journalId, edited.id, 'en');
      expect(candidate.core.results).toBe(text);
      expect(candidate.draft.claims[0]?.evidence.quote).toBe(text);
      await recoverJournalJobs(deps);
      const sponsor = await prisma.journalJob.findFirstOrThrow({ where: { articleId: edited.id, kind: 'shared_ingestion' } });
      expect(sponsor.state).toBe('succeeded');
      const before = await prisma.journalGrant.findUniqueOrThrow({ where: { id: sponsor.grantId! } });
      expect([before.reserved, before.consumed]).toEqual([0, 1]);
      const confirmed = await confirmJournalSharedInterpretation(deps, owner.id, journalId, edited.id,
        { revision: permitted.articleRevision, language: 'en' });
      const replay = await confirmJournalSharedInterpretation(deps, owner.id, journalId, edited.id,
        { revision: permitted.articleRevision, language: 'en' });
      expect(replay.versionId).toBe(confirmed.versionId);
      expect(replay.articleRevision).toBe(confirmed.articleRevision);
      const final = await prisma.journalArticle.findUniqueOrThrow({ where: { id: edited.id } });
      expect(final.revision).toBe(permitted.articleRevision + 1);
      expect((final.draft as { core: { results: string } }).core.results).toBe(text);
      expect((await prisma.journalSharedBinding.findUniqueOrThrow({ where: { articleId: edited.id } })).confirmedVersionId).toBe(confirmed.versionId);
      expect(await prisma.version.count({ where: { researchObjectId: final.workingResearchObjectId!, id: confirmed.versionId } })).toBe(1);
      const after = await prisma.journalGrant.findUniqueOrThrow({ where: { id: sponsor.grantId! } });
      expect([after.reserved, after.consumed]).toEqual([before.reserved, before.consumed]);
      expect((await prisma.journalRelease.findUniqueOrThrow({ where: { id: frozen.id } })).snapshot).toEqual(frozen.snapshot);
      expect((await prisma.version.findUniqueOrThrow({ where: { id: frozen.versionId } })).status).toBe('published');
      expect((await prisma.researchObject.findUniqueOrThrow({ where: { id: edited.researchObjectId } })).visibility).toBe('public');
    } finally { await prisma.$disconnect(); }
  }, 120_000);
});
