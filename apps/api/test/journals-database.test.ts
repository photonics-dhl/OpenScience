import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createSession } from '@openscience/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;
const sourceSentence = 'Numerical simulations predict a peak power of 14.7 TW; the complete system has not been experimentally demonstrated.';
const source = {
  kind: 'fulltext',
  text: sourceSentence,
  url: 'https://journals.example.test/synthetic-paper',
  label: 'Synthetic results paragraph',
} as const;
const rights = {
  internalProcessing: true,
  derivativeGeneration: true,
  publicSource: false,
  publicDerivative: true,
  externalProcessing: true,
  license: 'CC-BY-4.0',
  evidence: 'Synthetic test content owned by this isolated fixture',
};
const draft = {
  summary: 'The synthetic example predicts 14.7 TW by numerical simulation.',
  core: {
    problem: 'Test scientific evidence preservation.',
    insight: 'A numerical prediction.',
    method: 'Numerical simulation.',
    results: 'Predicted 14.7 TW.',
    limitations: 'The complete system has not been experimentally demonstrated.',
    reproducibility: 'Inputs are not reported in this synthetic paragraph.',
  },
  claims: [{
    text: 'Numerical prediction: 14.7 TW.',
    kind: 'simulation',
    evidence: { quote: sourceSentence, locator: 'Results paragraph' },
  }],
  figures: [],
  faq: [{
    question: 'Was the complete system experimentally demonstrated?',
    answer: 'No. This is a numerical prediction.',
    evidence: { quote: sourceSentence, locator: 'Results paragraph' },
  }],
  scope: 'fulltext',
  language: 'en',
};

function validIssn(): string {
  const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const check = (11 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (8 - index), 0) % 11) % 11;
  return `${digits}${check === 10 ? 'X' : check}`;
}

suite('journal HTTP lifecycle against isolated PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const redis = createFakeRedis();
  const crossrefCalls: Array<{ url: string; init?: RequestInit }> = [];
  let ownerCookie: { openscience_session: string };
  let reviewerCookie: { openscience_session: string };
  let adminCookie: { openscience_session: string };
  let ownerId: string;
  let reviewerId: string;
  let journalId: string;
  let workspaceId: string;
  let issn: string;
  let crossrefArticleId: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/journal_test') {
      throw new Error('Journal API tests require the explicitly named loopback journal_test database');
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomUUID();
    const [owner, reviewer, admin] = await Promise.all([
      prisma.user.create({ data: { email: `api-owner-${suffix}@example.invalid`, displayName: 'Synthetic API owner', passwordHash: 'unusable-test-only', status: 'email_verified' } }),
      prisma.user.create({ data: { email: `api-reviewer-${suffix}@example.invalid`, displayName: 'Synthetic API reviewer', passwordHash: 'unusable-test-only', status: 'email_verified' } }),
      prisma.user.create({ data: { email: `api-admin-${suffix}@example.invalid`, displayName: 'Synthetic API admin', passwordHash: 'unusable-test-only', status: 'email_verified', platformRole: 'platform_admin' } }),
    ]);
    ownerId = owner.id;
    reviewerId = reviewer.id;
    ownerCookie = { openscience_session: await createSession(redis, { userId: owner.id, status: owner.status }) };
    reviewerCookie = { openscience_session: await createSession(redis, { userId: reviewer.id, status: reviewer.status }) };
    adminCookie = { openscience_session: await createSession(redis, { userId: admin.id, status: admin.status }) };
    const crossrefFixture: typeof fetch = async (input, init) => {
      const calledUrl = String(input);
      crossrefCalls.push({ url: calledUrl, init });
      const doi = decodeURIComponent(new URL(calledUrl).pathname.replace(/^\/works\//, ''));
      const body = JSON.stringify({
        message: {
          DOI: doi,
          type: 'journal-article',
          title: ['Synthetic Crossref import'],
          author: [{ given: 'Synthetic', family: 'Author' }],
          published: { 'date-parts': [[2026, 9, 15]] },
          'container-title': ['Synthetic API Journal'],
          ISSN: [issn],
          abstract: '<jats:p>PRIVATE_CROSSREF_ABSTRACT_MARKER</jats:p>',
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } });
    };
    app = await buildApp({
      prisma,
      redis,
      mailer: createFakeMailer(),
      cookieSecret: 'isolated-journal-api-test',
      secureCookies: false,
      journalsEnabled: true,
      journalMetadataFetcher: crossrefFixture,
      publicIdPrefix: 'TST',
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('authenticates application and verification routes and keeps Crossref on its fixed origin', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/journals/mine' });
    expect(anonymous.statusCode).toBe(401);

    issn = validIssn();
    const applicationResponse = await app.inject({
      method: 'POST',
      url: '/journals/applications',
      cookies: ownerCookie,
      payload: {
        nameEn: 'Synthetic API Journal',
        pIssn: issn,
        websiteUrl: 'https://journals.example.test',
        publisherName: 'Synthetic isolated publisher',
        subjects: ['Validation'],
        description: 'Synthetic API-only journal fixture',
        applicantName: 'Synthetic API owner',
        applicantTitle: 'Editor',
        applicantEmail: (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).email,
        representationEvidence: 'Synthetic fixture authorization',
        rightsDeclaration: 'Synthetic content rights are available for this isolated test.',
        rightsDeclarationVersion: '1',
      },
    });
    expect(applicationResponse.statusCode).toBe(200);
    const application = applicationResponse.json().application as { id: string; revision: number };
    const submitResponse = await app.inject({
      method: 'POST',
      url: `/journals/applications/${application.id}/submit`,
      cookies: ownerCookie,
      payload: { revision: application.revision, submissionKey: randomUUID() },
    });
    expect(submitResponse.statusCode).toBe(200);
    const submitted = submitResponse.json().application as { id: string };
    const verifyResponse = await app.inject({
      method: 'POST',
      url: `/admin/journals/applications/${submitted.id}/review`,
      cookies: adminCookie,
      payload: { decision: 'approved', slug: `api-${randomUUID()}` },
    });
    expect(verifyResponse.statusCode, verifyResponse.body).toBe(200);
    const journal = verifyResponse.json().journal as { id: string; workspaceId: string };
    journalId = journal.id;
    workspaceId = journal.workspaceId;
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/activate`, cookies: ownerCookie })).statusCode).toBe(200);
    const issnSearch = await app.inject({ method: 'GET', url: `/journals?query=${encodeURIComponent(issn)}&limit=1` });
    expect(issnSearch.statusCode).toBe(200);
    expect(issnSearch.json().items.map((item: { id: string }) => item.id)).toContain(journalId);

    const addReviewer = await app.inject({
      method: 'POST',
      url: `/journals/${journalId}/members`,
      cookies: ownerCookie,
      payload: { email: (await prisma.user.findUniqueOrThrow({ where: { id: reviewerId } })).email, role: 'reviewer' },
    });
    expect(addReviewer.statusCode).toBe(200);

    const doi = '10.5555/http://127.0.0.1/cloud-metadata';
    const beforePreview = await prisma.journalArticle.count({ where: { journalId } });
    const preview = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/preview`, cookies: ownerCookie, payload: { dois: [doi, 'invalid-doi'] } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().items.map((item: { status: string }) => item.status)).toEqual(['ready', 'failed']);
    expect(await prisma.journalArticle.count({ where: { journalId } })).toBe(beforePreview);
    crossrefCalls.length = 0;
    const importResponse = await app.inject({
      method: 'POST',
      url: `/journals/${journalId}/articles/import`,
      cookies: ownerCookie,
      payload: { dois: [doi] },
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json().items[0]).toMatchObject({ input: doi, status: 'imported' });
    expect(crossrefCalls).toHaveLength(1);
    const requestUrl = new URL(crossrefCalls[0]!.url);
    expect(requestUrl.origin).toBe('https://api.crossref.org');
    expect(requestUrl.pathname).toBe(`/works/${encodeURIComponent(doi)}`);
    expect(crossrefCalls[0]!.init).toMatchObject({ redirect: 'error' });

    crossrefArticleId = importResponse.json().items[0].articleId as string;
    const managed = await app.inject({
      method: 'GET', url: `/journals/${journalId}/articles/${crossrefArticleId}`, cookies: ownerCookie,
    });
    const crossrefRevision = managed.json().article.revision as number;
    expect((await app.inject({
      method: 'PATCH', url: `/journals/${journalId}/articles/${crossrefArticleId}`, cookies: ownerCookie,
      payload: { revision: crossrefRevision, directoryVisible: true },
    })).statusCode).toBe(200);
    const publicDirectory = await app.inject({ method: 'GET', url: `/journals/${journalId}/articles` });
    expect(publicDirectory.statusCode).toBe(200);
    const publicCrossref = publicDirectory.json().items.find((item: { id: string }) => item.id === crossrefArticleId);
    expect(publicCrossref.metadata).not.toHaveProperty('abstract');
    expect(JSON.stringify(publicCrossref)).not.toContain('PRIVATE_CROSSREF_ABSTRACT_MARKER');
  });

  it('scopes reviewers, blocks legacy writes, publishes one fixed package, and withdraws it', async () => {
    const metadata = (title: string) => ({
      title,
      authors: ['Synthetic Author'],
      publishedDate: '2026-09-15',
      journalTitle: 'Synthetic API Journal',
      issns: [issn],
      originalUrl: source.url,
    });
    const firstManaged = await app.inject({
      method: 'GET', url: `/journals/${journalId}/articles/${crossrefArticleId}`, cookies: ownerCookie,
    });
    const secondImport = await app.inject({
      method: 'POST', url: `/journals/${journalId}/articles`, cookies: ownerCookie,
      payload: { metadata: metadata('Synthetic unassigned comparison') },
    });
    expect(
      [firstManaged.statusCode, secondImport.statusCode],
      `${firstManaged.body}\n${secondImport.body}`,
    ).toEqual([200, 200]);
    const first = firstManaged.json().article as { id: string; researchObjectId: string; revision: number };
    const second = secondImport.json().article as { id: string; researchObjectId: string };

    const preparedResponse = await app.inject({
      method: 'PATCH',
      url: `/journals/${journalId}/articles/${first.id}`,
      cookies: ownerCookie,
      payload: { revision: first.revision, directoryVisible: true, source, rights, draft },
    });
    expect(preparedResponse.statusCode).toBe(200);
    const prepared = preparedResponse.json().article as { revision: number };

    const publicBeforeReview = await app.inject({ method: 'GET', url: `/journals/${journalId}/articles` });
    expect(publicBeforeReview.statusCode).toBe(200);
    const publicItem = publicBeforeReview.json().items.find((item: { id: string }) => item.id === first.id) as Record<string, unknown>;
    expect(publicItem).toBeDefined();
    expect(publicItem).not.toHaveProperty('source');
    expect(publicItem).not.toHaveProperty('rights');
    expect(publicItem).not.toHaveProperty('draft');
    expect(JSON.stringify(publicItem)).not.toContain(sourceSentence);

    const assignResponse = await app.inject({
      method: 'POST',
      url: `/journals/${journalId}/articles/${first.id}/reviewer`,
      cookies: ownerCookie,
      payload: { revision: prepared.revision, reviewerId },
    });
    expect(assignResponse.statusCode).toBe(200);
    const assigned = assignResponse.json().article as { revision: number };
    const reviewerAssigned = await app.inject({ method: 'GET', url: `/journals/${journalId}/articles/${first.id}`, cookies: reviewerCookie });
    const reviewerUnassigned = await app.inject({ method: 'GET', url: `/journals/${journalId}/articles/${second.id}`, cookies: reviewerCookie });
    expect([reviewerAssigned.statusCode, reviewerUnassigned.statusCode]).toEqual([200, 404]);

    const reviewerManage = await app.inject({ method: 'GET', url: `/journals/${journalId}/manage`, cookies: reviewerCookie });
    expect(reviewerManage.statusCode).toBe(200);
    expect(reviewerManage.json().articles.map((article: { id: string }) => article.id)).toEqual([first.id]);
    expect(reviewerManage.json().grants).toEqual([]);
    expect(reviewerManage.json().serviceRequests).toEqual([]);

    const assignedGeneric = await app.inject({ method: 'GET', url: `/research-objects/${first.researchObjectId}`, cookies: reviewerCookie });
    const unassignedGeneric = await app.inject({ method: 'GET', url: `/research-objects/${second.researchObjectId}`, cookies: reviewerCookie });
    const genericList = await app.inject({ method: 'GET', url: '/research-objects?limit=100', cookies: reviewerCookie });
    expect([assignedGeneric.statusCode, unassignedGeneric.statusCode]).toEqual([200, 404]);
    const listedIds = genericList.json().researchObjects.map((article: { id: string }) => article.id);
    expect(listedIds).toContain(first.researchObjectId);
    expect(listedIds).not.toContain(second.researchObjectId);

    const blockedWrites = await Promise.all([
      app.inject({ method: 'PATCH', url: `/research-objects/${first.researchObjectId}`, cookies: ownerCookie, payload: { version: 1, title: 'Bypass' } }),
      app.inject({ method: 'PUT', url: `/sdf/${first.researchObjectId}`, cookies: ownerCookie, payload: { version: 1, core: {} } }),
      app.inject({ method: 'PATCH', url: `/workspaces/${workspaceId}`, cookies: ownerCookie, payload: { name: 'Bypass' } }),
    ]);
    expect(blockedWrites.map((response) => response.statusCode)).toEqual([403, 403, 403]);
    for (const response of blockedWrites) expect(response.json().error.code).toBe('JOURNAL_WORKFLOW_REQUIRED');

    const submitReview = await app.inject({
      method: 'POST', url: `/journals/${journalId}/articles/${first.id}/review`, cookies: ownerCookie,
      payload: { revision: assigned.revision, decision: 'submit', note: 'Ready for independent review.' },
    });
    const approveReview = await app.inject({
      method: 'POST', url: `/journals/${journalId}/articles/${first.id}/review`, cookies: reviewerCookie,
      payload: { revision: assigned.revision, decision: 'approve', note: 'Evidence and simulation status checked.' },
    });
    expect([submitReview.statusCode, approveReview.statusCode]).toEqual([200, 200]);
    const publishResponse = await app.inject({
      method: 'POST', url: `/journals/${journalId}/articles/${first.id}/publish`, cookies: ownerCookie,
      payload: { revision: assigned.revision, requestKey: randomUUID(), humanConfirmed: true },
    });
    expect(publishResponse.statusCode).toBe(200);
    const published = publishResponse.json().release as { publicId: string; versionNo: number };
    const fixed = await app.inject({ method: 'GET', url: `/research/${published.publicId}/v/${published.versionNo}` });
    expect(fixed.statusCode).toBe(200);
    const research = fixed.json().research as { version: { contentSha256: string }; journalPackage: Record<string, unknown> };
    const release = await prisma.journalRelease.findFirstOrThrow({ where: { articleId: first.id }, orderBy: { publishedAt: 'desc' } });
    expect(research.journalPackage).toEqual({ ...(release.snapshot as Record<string, unknown>), articleId: crossrefArticleId });
    expect(research.version.contentSha256).toBe(release.digest);
    expect((research.journalPackage.source as Record<string, unknown>)).not.toHaveProperty('text');
    expect((research.journalPackage.metadata as Record<string, unknown>)).not.toHaveProperty('abstract');
    expect(JSON.stringify(research.journalPackage)).not.toContain('PRIVATE_CROSSREF_ABSTRACT_MARKER');

    const withdraw = await app.inject({
      method: 'POST', url: `/journals/${journalId}/articles/${first.id}/restrict`, cookies: ownerCookie,
      payload: { state: 'withdrawn', reason: 'Synthetic test withdrawal' },
    });
    expect(withdraw.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/research/${published.publicId}/v/${published.versionNo}` })).statusCode).toBe(404);

    const transfer = await app.inject({
      method: 'POST', url: `/journals/${journalId}/owner`, cookies: ownerCookie,
      payload: { newOwnerId: reviewerId, reason: 'Synthetic API ownership transfer' },
    });
    expect(transfer.statusCode, transfer.body).toBe(200);
    expect(transfer.json().journal).toMatchObject({ operationalState: 'reverification' });
    expect(typeof transfer.json().journal.storageLimitBytes).toBe('string');
    const resume = await app.inject({
      method: 'POST', url: `/admin/journals/${journalId}/state`, cookies: adminCookie,
      payload: { action: 'resume', reason: 'Synthetic API reverification completed' },
    });
    expect(resume.statusCode, resume.body).toBe(200);
    expect(resume.json().journal).toMatchObject({ operationalState: 'active' });
  });
});
