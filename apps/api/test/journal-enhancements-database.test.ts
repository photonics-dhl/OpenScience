import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createSession } from '@openscience/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;
const sentence = 'Synthetic numerical simulations predict a bounded result; no complete-system experiment was performed.';
const source = { kind: 'fulltext', text: sentence, url: 'https://journal.example.invalid/enhancement', label: 'Synthetic source for HTTP acceptance' };
const rights = { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Synthetic local fixture authorization.' };
const noPermissions = { internalProcessing: false, derivativeGeneration: false, publicSource: false, publicDerivative: false, externalProcessing: false, figureReuse: false, derivativeIllustration: false };
const evidence = { quote: sentence, locator: 'Synthetic paragraph' };
const draft = { summary: 'A synthetic numerical prediction.', core: { problem: 'Preserve authorization.', insight: 'Bounded numerical prediction.', method: 'Simulation.', results: 'Synthetic result.', limitations: 'No experiment.', reproducibility: 'Not provided.' }, claims: [{ text: 'The result is a simulation.', kind: 'simulation', evidence }], figures: [], faq: [{ question: 'Was an experiment performed?', answer: 'No.', evidence }], scope: 'fulltext', language: 'en' };

suite('journal enhancement HTTP and PostgreSQL boundaries', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let journalId: string;
  let articleId: string;
  let revision: number;
  let mainSourceId: string;
  let ownerCookie: { openscience_session: string };
  let reviewerCookie: { openscience_session: string };
  let outsiderCookie: { openscience_session: string };
  let reviewerId: string;
  let publicPath: string;
  const path = () => `/journals/${journalId}/articles/${articleId}`;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/journal_test') throw new Error('Requires isolated loopback journal_test database');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const redis = createFakeRedis();
    async function user(role?: 'platform_admin') {
      const account = await prisma.user.create({ data: { email: `enhancement-${randomUUID()}@example.invalid`, displayName: 'Synthetic enhancement tester', passwordHash: 'unusable-test-only', status: 'email_verified', ...(role ? { platformRole: role } : {}) } });
      return { account, cookie: { openscience_session: await createSession(redis, { userId: account.id, status: account.status }) } };
    }
    const [owner, reviewer, outsider, admin] = await Promise.all([user(), user(), user(), user('platform_admin')]);
    ownerCookie = owner.cookie; reviewerCookie = reviewer.cookie; outsiderCookie = outsider.cookie; reviewerId = reviewer.account.id;
    app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'isolated-enhancements', secureCookies: false, journalsEnabled: true });
    const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
    const check = (11 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (8 - index), 0) % 11) % 11;
    const name = `Synthetic enhancement journal ${randomUUID()}`;
    const saved = await app.inject({ method: 'POST', url: '/journals/applications', cookies: ownerCookie, payload: { nameEn: name, pIssn: `${digits}${check === 10 ? 'X' : check}`, websiteUrl: 'https://journal.example.invalid', publisherName: 'Synthetic publisher', subjects: ['Validation'], description: 'Isolated HTTP test.', applicantName: 'Synthetic owner', applicantTitle: 'Editor', applicantEmail: owner.account.email, representationEvidence: 'Synthetic fixture.', rightsDeclaration: 'Synthetic authorization.', rightsDeclarationVersion: '1' } });
    expect(saved.statusCode, saved.body).toBe(200);
    const application = saved.json().application;
    expect((await app.inject({ method: 'POST', url: `/journals/applications/${application.id}/submit`, cookies: ownerCookie, payload: { revision: application.revision, submissionKey: randomUUID() } })).statusCode).toBe(200);
    const verified = await app.inject({ method: 'POST', url: `/admin/journals/applications/${application.id}/review`, cookies: admin.cookie, payload: { decision: 'approved', slug: `enhancement-${randomUUID()}` } });
    expect(verified.statusCode, verified.body).toBe(200); journalId = verified.json().journal.id;
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/activate`, cookies: ownerCookie })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/members`, cookies: ownerCookie, payload: { email: reviewer.account.email, role: 'reviewer' } })).statusCode).toBe(200);
    const created = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles`, cookies: ownerCookie, payload: { metadata: { title: 'Synthetic authorization test paper', authors: ['Synthetic Author'], publishedDate: '2026-09-22', journalTitle: name, issns: [], originalUrl: source.url } } });
    expect(created.statusCode, created.body).toBe(200); articleId = created.json().article.id;
    const prepared = await app.inject({ method: 'PATCH', url: path(), cookies: ownerCookie, payload: { revision: created.json().article.revision, source, rights, draft, directoryVisible: true } });
    expect(prepared.statusCode, prepared.body).toBe(200); revision = prepared.json().article.revision;
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  it('isolates sources and commercial details while preserving legacy source capabilities', async () => {
    for (const cookies of [outsiderCookie, reviewerCookie]) {
      expect((await app.inject({ url: `${path()}/sources`, cookies })).statusCode).toBe(404);
      expect([403, 404]).toContain((await app.inject({ url: `/journals/${journalId}/processing-priorities`, cookies })).statusCode);
      expect([403, 404]).toContain((await app.inject({ url: `/journals/${journalId}/service-plan`, cookies })).statusCode);
    }
    const matrix = await app.inject({ url: `${path()}/sources`, cookies: ownerCookie });
    expect(matrix.statusCode, matrix.body).toBe(200);
    expect(matrix.json().capability.canGenerateFullSixFields).toBe(true);
    expect(matrix.json().sources.length).toBe(1);
    expect(matrix.headers['cache-control']).toBe('no-store');
  });

  it('adds an inactive supplementary source without changing primary rights and rejects stale revisions', async () => {
    const added = await app.inject({ method: 'POST', url: `${path()}/sources`, cookies: ownerCookie, payload: { revision, source: { sourceType: 'supplementary', title: 'Supplementary record', url: 'https://journal.example.invalid/supplement', rightsStatus: 'unknown', sourceConfidence: 'editor_claimed', permissions: noPermissions, evidence: { statement: 'Registered only; no permission grant.' }, activeForGeneration: false } } });
    expect(added.statusCode, added.body).toBe(200);
    const body = added.json();
    expect(body.sources.length).toBe(2); expect(body.capability.canGenerateFullSixFields).toBe(true);
    mainSourceId = body.sources.find((item: { activeForGeneration: boolean }) => item.activeForGeneration).id;
    const stale = await app.inject({ method: 'PATCH', url: path(), cookies: ownerCookie, payload: { revision, rights } });
    expect(stale.statusCode, stale.body).toBe(409);
    revision = body.articleRevision;
    const assigned = await app.inject({ method: 'POST', url: `${path()}/reviewer`, cookies: ownerCookie, payload: { revision, reviewerId } });
    expect(assigned.statusCode, assigned.body).toBe(200); revision = assigned.json().article.revision;
    expect((await app.inject({ url: `${path()}/sources`, cookies: reviewerCookie })).statusCode).toBe(200);
    const denied = await app.inject({ method: 'POST', url: `${path()}/priority-override`, cookies: reviewerCookie, payload: { editorPriorityScore: 10, reason: 'Must be denied.', deferredUntil: null } });
    expect(denied.statusCode, denied.body).toBe(403);
  });

  it('publishes a reviewed matrix-backed version and checks authorization expiry on anonymous reads', async () => {
    for (const decision of ['submit', 'approve']) {
      const reviewed = await app.inject({ method: 'POST', url: `${path()}/review`, cookies: ownerCookie, payload: { revision, decision, note: 'Synthetic scientific and rights review.' } });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
    }
    const published = await app.inject({ method: 'POST', url: `${path()}/publish`, cookies: ownerCookie, payload: { revision, humanConfirmed: true, requestKey: randomUUID() } });
    expect(published.statusCode, published.body).toBe(200);
    const release = published.json().release; publicPath = `/research/${release.publicId}/v/${release.versionNo}`;
    expect((await app.inject({ url: publicPath })).statusCode).toBe(200);
    // Simulate time passing without invoking any mutation/cleanup hook: the read path must enforce expiry.
    const current = await prisma.journalArticle.findUniqueOrThrow({ where: { id: articleId } });
    const value = current.source as Record<string, unknown> & { materials: Array<{ id: string; evidence: Record<string, unknown> }> };
    value.materials = value.materials.map((material) => material.id === mainSourceId ? { ...material, evidence: { ...material.evidence, expiresAt: new Date(Date.now() - 1000).toISOString() } } : material);
    await prisma.journalArticle.update({ where: { id: articleId }, data: { source: value as Prisma.InputJsonValue } });
    expect((await app.inject({ url: publicPath })).statusCode).toBe(404);
    const directory = await app.inject({ url: `/journals/${journalId}/articles` });
    expect(directory.statusCode).toBe(200);
    expect(directory.json().items.find((item: { id: string }) => item.id === articleId).releases).toEqual([]);
    const job = await app.inject({ method: 'POST', url: `${path()}/processing-jobs`, cookies: ownerCookie, payload: { revision, language: 'en', requestKey: randomUUID(), manualConfirmation: true } });
    expect(job.statusCode, job.body).toBe(403);
  });

  it('excludes expired credits before background reconciliation and keeps reads free', async () => {
    const before = await app.inject({ url: `/journals/${journalId}/service-plan`, cookies: ownerCookie });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().credits.available).toBe(5);
    await prisma.journalGrant.updateMany({ where: { journalId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const after = await app.inject({ url: `/journals/${journalId}/service-plan`, cookies: ownerCookie });
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json().credits).toMatchObject({ available: 0, reserved: 0, consumed: 0, expired: 5 });
    expect(after.json().commercialModel).toBe('manual_quote');
    expect(after.json().planChoice).toBe('free');
  });
});
