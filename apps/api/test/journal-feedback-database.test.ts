import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSession } from '@openscience/auth';
import {
  activateJournalHomepage,
  addJournalMember,
  importJournalArticle,
  publishJournalArticle,
  reviewJournalArticle,
  saveJournalApplication,
  submitJournalApplication,
  updateJournalArticle,
  verifyJournalApplication,
} from '@openscience/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;
const sentence = 'A synthetic simulation predicts 14.7 TW; the complete system has not been experimentally demonstrated.';
const source = { kind: 'fulltext' as const, text: sentence, url: 'https://feedback.example.test/paper', label: 'Synthetic feedback source' };
const rights = { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Synthetic isolated feedback test' };
const draft = {
  summary: 'The synthetic simulation predicts 14.7 TW.',
  core: { problem: 'Test corrections.', insight: 'A numerical prediction.', method: 'Simulation.', results: 'Predicted 14.7 TW.', limitations: 'Not experimentally demonstrated.', reproducibility: 'Inputs are absent from the synthetic paragraph.' },
  claims: [{ text: 'Numerical prediction: 14.7 TW.', kind: 'simulation', evidence: { quote: sentence, locator: 'Synthetic paragraph' } }],
  figures: [],
  faq: [{ question: 'Was it experimentally demonstrated?', answer: 'No.', evidence: { quote: sentence, locator: 'Synthetic paragraph' } }],
  scope: 'fulltext' as const,
  language: 'en' as const,
};

function validIssn(): string {
  const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const check = (11 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (8 - index), 0) % 11) % 11;
  return `${digits}${check === 10 ? 'X' : check}`;
}

suite('journal feedback against isolated PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const redis = createFakeRedis();
  const cookies = new Map<string, { openscience_session: string }>();
  let ownerId: string;
  let authorId: string;
  let reviewerId: string;
  let reporterId: string;
  let otherReporterId: string;
  let journalId: string;
  let otherJournalId: string;
  let articleId: string;
  let unpublishedArticleId: string;
  let versionId: string;
  let versionNo: number;
  let publicId: string;
  let articleRevision: number;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || decodeURIComponent(url.pathname) !== '/journal_test') {
      throw new Error('Journal feedback tests require the explicitly named loopback journal_test database');
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomUUID();
    const users = await Promise.all(['owner', 'author', 'reviewer', 'reporter', 'other-reporter', 'other-owner', 'admin'].map((name) => prisma.user.create({ data: {
      email: `feedback-${name}-${suffix}@example.invalid`, displayName: `Feedback ${name}`, passwordHash: 'unusable-test-only', status: 'email_verified',
      ...(name === 'admin' ? { platformRole: 'platform_admin' as const } : {}),
    } })));
    const [owner, author, reviewer, reporter, otherReporter, otherOwner, admin] = users;
    ownerId = owner!.id; authorId = author!.id; reviewerId = reviewer!.id; reporterId = reporter!.id; otherReporterId = otherReporter!.id;
    for (const user of users) cookies.set(user!.id, { openscience_session: await createSession(redis, { userId: user!.id, status: user!.status }) });
    const deps = { prisma, mailer: createFakeMailer() };
    async function journal(applicantId: string, name: string) {
      const applicant = users.find((user) => user!.id === applicantId)!;
      const application = await saveJournalApplication(deps, applicantId, {
        nameEn: name, pIssn: validIssn(), websiteUrl: 'https://feedback.example.test', publisherName: 'Isolated feedback publisher', subjects: ['Validation'],
        description: 'Synthetic journal feedback fixture', applicantName: applicant!.displayName, applicantTitle: 'Editor', applicantEmail: applicant!.email,
        representationEvidence: 'Synthetic feedback fixture', rightsDeclaration: 'Synthetic authorization for isolated feedback testing.', rightsDeclarationVersion: '1',
      });
      const submitted = await submitJournalApplication(deps, applicantId, { applicationId: application.id, revision: application.revision, submissionKey: randomUUID() });
      const verified = await verifyJournalApplication(deps, admin!.id, { applicationId: submitted.id, decision: 'approved', slug: `feedback-${randomUUID()}` });
      await activateJournalHomepage(deps, applicantId, verified.journal!.id);
      return { journal: verified.journal!, issn: (await prisma.journalIdentifier.findFirstOrThrow({ where: { journalId: verified.journal!.id } })).value };
    }
    const primary = await journal(ownerId, 'Synthetic Feedback Journal');
    const secondary = await journal(otherOwner!.id, 'Other Synthetic Feedback Journal');
    journalId = primary.journal.id; otherJournalId = secondary.journal.id;
    await addJournalMember(deps, ownerId, journalId, { targetUserId: authorId, role: 'editor' });
    await addJournalMember(deps, ownerId, journalId, { targetUserId: reviewerId, role: 'reviewer' });
    const imported = await importJournalArticle(deps, ownerId, journalId, { title: 'Synthetic feedback article', doi: `10.5555/${randomUUID()}`, authors: ['Synthetic Author'], publishedDate: '2026-09-15', journalTitle: 'Synthetic Feedback Journal', issns: [primary.issn], originalUrl: source.url });
    const prepared = await updateJournalArticle(deps, ownerId, journalId, imported.article.id, { revision: imported.article.revision, source, rights, draft });
    await reviewJournalArticle(deps, ownerId, journalId, prepared.id, { revision: prepared.revision, decision: 'submit', note: 'Ready for review.' });
    await reviewJournalArticle(deps, ownerId, journalId, prepared.id, { revision: prepared.revision, decision: 'approve', note: 'Synthetic evidence checked.' });
    const release = await publishJournalArticle(deps, ownerId, journalId, prepared.id, { revision: prepared.revision, requestKey: randomUUID(), humanConfirmed: true, publicIdPrefix: 'FDB' });
    const storedRelease = await prisma.journalRelease.findUniqueOrThrow({ where: { id: release.id } });
    articleId = prepared.id; articleRevision = prepared.revision; versionId = storedRelease.versionId; versionNo = release.versionNo; publicId = release.publicId!;
    const unpublished = await importJournalArticle(deps, ownerId, journalId, { title: 'Unpublished feedback target', doi: `10.5555/${randomUUID()}`, authors: ['Synthetic Author'], journalTitle: 'Synthetic Feedback Journal', issns: [primary.issn], originalUrl: source.url });
    unpublishedArticleId = unpublished.article.id;
    app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'isolated-feedback-api-test', secureCookies: false, journalsEnabled: true, publicIdPrefix: 'FDB' });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('keeps reader corrections private, idempotent, version-bound and editor-resolved', async () => {
    const requestKey = randomUUID();
    const create = () => app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/feedback`, cookies: cookies.get(reporterId), payload: { versionNo, content: '  The limitation should be stated more prominently.  ', requestKey } });
    const [first, replay] = await Promise.all([create(), create()]);
    expect([first.statusCode, replay.statusCode]).toEqual([200, 200]);
    const firstFeedback = first.json().feedback as { id: string; content: string; status: string; reporterId: string };
    expect(replay.json().feedback.id).toBe(firstFeedback.id);
    expect(firstFeedback).toMatchObject({ content: 'The limitation should be stated more prominently.', status: 'open', reporterId });
    expect(await prisma.notification.count({ where: { type: 'journal.feedback.opened', payload: { path: ['feedbackId'], equals: firstFeedback.id } } })).toBe(1);
    const event = await prisma.journalEvent.findUniqueOrThrow({ where: { id: firstFeedback.id } });
    expect(event.after).toMatchObject({ articleId, versionId, versionNo, status: 'open' });
    expect(event.after).not.toHaveProperty('reporterId');

    const conflict = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/feedback`, cookies: cookies.get(reporterId), payload: { versionNo, content: 'A different correction.', requestKey } });
    expect(conflict.statusCode).toBe(409); expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const unpublished = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${unpublishedArticleId}/feedback`, cookies: cookies.get(reporterId), payload: { versionNo: 1, content: 'This draft must not accept public feedback.', requestKey: randomUUID() } });
    expect(unpublished.statusCode).toBe(404);
    const crossJournal = await app.inject({ method: 'POST', url: `/journals/${otherJournalId}/articles/${articleId}/feedback`, cookies: cookies.get(reporterId), payload: { versionNo, content: 'Cross-journal target.', requestKey: randomUUID() } });
    expect(crossJournal.statusCode).toBe(404);

    const second = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/feedback`, cookies: cookies.get(reporterId), payload: { versionNo, content: 'A second correction for pagination.', requestKey: randomUUID() } });
    const outsider = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/feedback`, cookies: cookies.get(otherReporterId), payload: { versionNo, content: 'Another reader correction.', requestKey: randomUUID() } });
    const reviewer = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/feedback`, cookies: cookies.get(reviewerId), payload: { versionNo, content: 'Reviewer acting only as a public reader.', requestKey: randomUUID() } });
    expect([second.statusCode, outsider.statusCode, reviewer.statusCode]).toEqual([200, 200, 200]);

    const reporterPage = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback?limit=1`, cookies: cookies.get(reporterId) });
    expect(reporterPage.json().role).toBe('reporter'); expect(reporterPage.json().items).toHaveLength(1); expect(reporterPage.json().nextCursor).toBeTruthy();
    const reporterNext = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback?limit=1&cursor=${reporterPage.json().nextCursor}`, cookies: cookies.get(reporterId) });
    expect(reporterNext.json().items).toHaveLength(1);
    expect(new Set([...reporterPage.json().items, ...reporterNext.json().items].map((item: { reporterId: string }) => item.reporterId))).toEqual(new Set([reporterId]));
    const outsiderList = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback`, cookies: cookies.get(otherReporterId) });
    expect(outsiderList.json().items).toHaveLength(1); expect(outsiderList.json().items[0].reporterId).toBe(otherReporterId);
    const reviewerList = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback`, cookies: cookies.get(reviewerId) });
    expect(reviewerList.json().role).toBe('reporter'); expect(reviewerList.json().items).toHaveLength(1); expect(reviewerList.json().items[0].reporterId).toBe(reviewerId);
    for (const editorId of [ownerId, authorId]) {
      const all = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback`, cookies: cookies.get(editorId) });
      expect(all.json().role).toBe('editor'); expect(all.json().items).toHaveLength(4);
    }

    const forbidden = await app.inject({ method: 'POST', url: `/journals/${journalId}/feedback/${firstFeedback.id}/respond`, cookies: cookies.get(reviewerId), payload: { expectedStatus: 'open', status: 'declined', response: 'Reviewer cannot decide.' } });
    expect(forbidden.statusCode).toBe(403);
    const wrongJournal = await app.inject({ method: 'POST', url: `/journals/${otherJournalId}/feedback/${firstFeedback.id}/respond`, cookies: cookies.get(ownerId), payload: { expectedStatus: 'open', status: 'declined', response: 'Wrong journal.' } });
    expect(wrongJournal.statusCode).toBe(404);
    const resolved = await app.inject({ method: 'POST', url: `/journals/${journalId}/feedback/${firstFeedback.id}/respond`, cookies: cookies.get(authorId), payload: { expectedStatus: 'open', status: 'resolved', response: 'The limitation is already explicit in the fixed version.' } });
    expect(resolved.statusCode).toBe(200); expect(resolved.json().feedback).toMatchObject({ id: firstFeedback.id, status: 'resolved', response: 'The limitation is already explicit in the fixed version.' });
    const responseNotification = await prisma.notification.findMany({ where: { userId: reporterId, type: 'journal.feedback.responded', idempotencyKey: `journal.feedback.responded:${firstFeedback.id}` } });
    expect(responseNotification).toHaveLength(1);
    expect(responseNotification[0]!.payload).toEqual({ journalId, articleId, versionNo, feedbackId: firstFeedback.id, status: 'resolved' });
    expect(JSON.stringify(responseNotification[0]!.payload)).not.toContain('The limitation is already explicit');
    const stale = await app.inject({ method: 'POST', url: `/journals/${journalId}/feedback/${firstFeedback.id}/respond`, cookies: cookies.get(ownerId), payload: { expectedStatus: 'open', status: 'declined', response: 'Stale decision.' } });
    expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('REVISION_CONFLICT');
    expect(await prisma.notification.count({ where: { userId: reporterId, type: 'journal.feedback.responded', idempotencyKey: `journal.feedback.responded:${firstFeedback.id}` } })).toBe(1);
    const own = await app.inject({ method: 'GET', url: `/journals/${journalId}/feedback`, cookies: cookies.get(reporterId) });
    expect(own.json().items.find((item: { id: string }) => item.id === firstFeedback.id)).toMatchObject({ status: 'resolved', response: 'The limitation is already explicit in the fixed version.' });

    const article = await prisma.journalArticle.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.revision).toBe(articleRevision);
    const publicResearch = await app.inject({ method: 'GET', url: `/research/${publicId}/v/${versionNo}` });
    expect(publicResearch.statusCode).toBe(200); expect(publicResearch.json().research.journalPackage.articleId).toBe(articleId);
    expect(JSON.stringify(publicResearch.json())).not.toContain('The limitation should be stated more prominently.');
  });
});
