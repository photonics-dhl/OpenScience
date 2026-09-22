import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { createSession } from '@openscience/auth';
import { cancelJournalJob, submitJournalJob } from '@openscience/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const enabled = process.env.JOURNAL_BROWSER_TEST === '1';
const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const apiPort = Number(process.env.JOURNAL_BROWSER_API_PORT ?? 3001);
const suite = enabled && databaseUrl ? describe.sequential : describe.skip;
const require = createRequire(import.meta.url);
const { chromium } = require('../../web/node_modules/playwright') as typeof import('../../web/node_modules/playwright');
const outputDir = resolve('../web/test/visual/out/journals');

const sourceSentence = 'Synthetic simulations predict a 14.7 TW peak; no complete-system experiment has yet been reported.';
const source = { kind: 'fulltext', text: sourceSentence, url: 'https://journal.example.invalid/synthetic-source', label: 'Synthetic source paragraph' } as const;
const rights = { internalProcessing: true, derivativeGeneration: true, publicSource: false, publicDerivative: true, externalProcessing: true, license: 'CC-BY-4.0', evidence: 'Synthetic local browser fixture authorization; no model worker runs in this test' };
const draft = {
  summary: 'This local synthetic paper reports a simulation result of 14.7 TW and clearly separates it from experimental evidence.',
  core: { problem: 'Preserve evidence scope.', insight: 'Simulation and experiment differ.', method: 'Numerical simulation.', results: 'Predicted 14.7 TW.', limitations: 'No complete-system experiment.', reproducibility: 'Synthetic fixture inputs.' },
  claims: [{ text: 'The reported 14.7 TW value is a simulation prediction.', kind: 'simulation', evidence: { quote: sourceSentence, locator: 'Synthetic results paragraph' } }],
  figures: [],
  faq: [{ question: 'Was the complete system experimentally demonstrated?', answer: 'No.', evidence: { quote: sourceSentence, locator: 'Synthetic results paragraph' } }],
  scope: 'fulltext', language: 'en',
} as const;

async function freePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate loopback port'));
      server.close((error) => error ? reject(error) : accept(address.port));
    });
  });
}

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; lastError = new Error(`HTTP ${response.status}`); }
    catch (error) { lastError = error; }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`Web server did not become ready: ${String(lastError)}`);
}

function validIssn(): string {
  const digits = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const check = (11 - [...digits].reduce((sum, digit, index) => sum + Number(digit) * (8 - index), 0) % 11) % 11;
  return `${digits}${check === 10 ? 'X' : check}`;
}

suite('journal real-browser acceptance against isolated PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let nextProcess: ChildProcess;
  let baseUrl: string;
  let ownerToken: string;
  let adminToken: string;
  let ownerId: string;
  let journalId: string;
  let articleId: string;
  let slug: string;
  let journalName: string;
  let releaseUrl: string;

  beforeAll(async () => {
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Invalid loopback browser API port');
    const parsed = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/journal_test') throw new Error('Browser acceptance requires the explicit loopback journal_test database');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const redis = createFakeRedis();
    const suffix = randomUUID();
    journalName = `合成开放科学期刊-${suffix.slice(0, 8)}`;
    const [owner, admin] = await Promise.all([
      prisma.user.create({ data: { email: `browser-owner-${suffix}@example.invalid`, displayName: 'Synthetic Browser Editor', passwordHash: 'unusable-test-only', status: 'email_verified' } }),
      prisma.user.create({ data: { email: `browser-admin-${suffix}@example.invalid`, displayName: 'Synthetic Browser Administrator', passwordHash: 'unusable-test-only', status: 'email_verified', platformRole: 'platform_admin' } }),
    ]);
    ownerToken = await createSession(redis, { userId: owner.id, status: owner.status });
    ownerId = owner.id;
    adminToken = await createSession(redis, { userId: admin.id, status: admin.status });
    app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'isolated-journal-browser-test', secureCookies: false, journalsEnabled: true, publicIdPrefix: 'BRW' });

    const applicationResponse = await app.inject({ method: 'POST', url: '/journals/applications', cookies: { openscience_session: ownerToken }, payload: { nameZh: journalName, nameEn: 'Synthetic Open Science Journal', pIssn: validIssn(), websiteUrl: 'https://journal.example.invalid', publisherName: 'Synthetic Local Publisher', subjects: ['Open Science', 'Validation'], description: 'Only synthetic local data for bounded browser acceptance.', applicantName: owner.displayName, applicantTitle: 'Editor', applicantEmail: owner.email, representationEvidence: 'Synthetic local authorization', rightsDeclaration: 'Synthetic directory and derivative use only.', rightsDeclarationVersion: 'browser-v1' } });
    expect(applicationResponse.statusCode, applicationResponse.body).toBe(200);
    const application = applicationResponse.json().application as { id: string; revision: number };
    const submitted = await app.inject({ method: 'POST', url: `/journals/applications/${application.id}/submit`, cookies: { openscience_session: ownerToken }, payload: { revision: application.revision, submissionKey: randomUUID() } });
    expect(submitted.statusCode, submitted.body).toBe(200);
    slug = `browser-${suffix}`;
    const verified = await app.inject({ method: 'POST', url: `/admin/journals/applications/${application.id}/review`, cookies: { openscience_session: adminToken }, payload: { decision: 'approved', slug } });
    expect(verified.statusCode, verified.body).toBe(200);
    journalId = verified.json().journal.id as string;
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/activate`, cookies: { openscience_session: ownerToken } })).statusCode).toBe(200);

    const created = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles`, cookies: { openscience_session: ownerToken }, payload: { metadata: { title: 'Synthetic evidence comparison paper', authors: ['Synthetic Author'], publishedDate: '2026-09-15', journalTitle: journalName, issns: [], originalUrl: 'https://journal.example.invalid/synthetic-source' } } });
    expect(created.statusCode, created.body).toBe(200);
    const article = created.json().article as { id: string; revision: number };
    articleId = article.id;
    const prepared = await app.inject({ method: 'PATCH', url: `/journals/${journalId}/articles/${articleId}`, cookies: { openscience_session: ownerToken }, payload: { revision: article.revision, directoryVisible: true, source, rights, draft } });
    expect(prepared.statusCode, prepared.body).toBe(200);
    const revision = prepared.json().article.revision as number;
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/review`, cookies: { openscience_session: ownerToken }, payload: { revision, decision: 'submit', note: 'Synthetic submission' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/review`, cookies: { openscience_session: ownerToken }, payload: { revision, decision: 'approve', note: 'Synthetic evidence checked' } })).statusCode).toBe(200);
    const published = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles/${articleId}/publish`, cookies: { openscience_session: ownerToken }, payload: { revision, requestKey: randomUUID(), humanConfirmed: true } });
    expect(published.statusCode, published.body).toBe(200);
    releaseUrl = published.json().release.url as string;
    // Fixtures use direct injection; actual browser writes exercise the real CSRF token/cookie flow.
    await app.close();
    app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'isolated-journal-browser-test', secureCookies: false, security: { csrf: true }, journalsEnabled: true, publicIdPrefix: 'BRW' });
    const apiAddress = await app.listen({ host: '127.0.0.1', port: apiPort });
    const webPort = await freePort();
    baseUrl = `http://127.0.0.1:${webPort}`;
    const nextCli = resolve('../web/node_modules/next/dist/bin/next');
    nextProcess = spawn(process.execPath, [nextCli, 'start', '-p', String(webPort)], { cwd: resolve('../web'), env: { ...process.env, API_ORIGIN: apiAddress, JOURNAL_BROWSER_TEST: '1' }, stdio: 'pipe', windowsHide: true });
    await mkdir(outputDir, { recursive: true });
    await waitFor(`${baseUrl}/journals`);
  }, 90_000);

  afterAll(async () => {
    nextProcess?.kill();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('renders public, editor, article, release, and admin surfaces at desktop and 375px', async () => {
    const browser = await chromium.launch({ headless: true });
    const browserErrors: string[] = [];
    try {
      const publicContext = await browser.newContext();
      const ownerContext = await browser.newContext();
      const adminContext = await browser.newContext();
      await ownerContext.addCookies([{ name: 'openscience_session', value: ownerToken, url: baseUrl, sameSite: 'Lax' }]);
      await adminContext.addCookies([{ name: 'openscience_session', value: adminToken, url: baseUrl, sameSite: 'Lax' }]);

      const surfaces = [
        { name: 'directory', context: publicContext, path: '/journals', expected: ['期刊目录'] },
        { name: 'homepage', context: publicContext, path: `/journals/${slug}`, expected: ['编辑部身份已核验', 'Synthetic evidence comparison paper', '阅读固定解读版本'] },
        { name: 'release', context: publicContext, path: releaseUrl, expected: ['期刊解读', '14.7 TW'] },
        { name: 'workbench', context: ownerContext, path: `/journals/manage/${journalId}`, expected: ['我的期刊', '论文与审核队列', '试用与专业服务'] },
        { name: 'processing', context: ownerContext, path: `/journals/manage/${journalId}/processing`, expected: ['加工优先级', 'Synthetic evidence comparison paper'] },
        { name: 'services', context: ownerContext, path: `/journals/manage/${journalId}/services`, expected: ['服务包与额度', '可用 AI 草稿额度'] },
        { name: 'article', context: ownerContext, path: `/journals/manage/${journalId}/articles/${articleId}`, expected: ['来源与授权', '上传来源文件', '查看原文'] },
        { name: 'sources', context: ownerContext, path: `/journals/manage/${journalId}/articles/${articleId}/sources`, expected: ['材料矩阵', '加工与公开范围'] },
        { name: 'admin', context: adminContext, path: '/admin/journals', expected: ['期刊核验与运营', '期刊运营状态'] },
      ];

      for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile-375', width: 375, height: 812 }]) {
        for (const surface of surfaces) {
          const page = await surface.context.newPage();
          page.on('pageerror', (error) => browserErrors.push(`${surface.name}: ${error.message}`));
          page.on('console', (message) => {
            if (message.type() !== 'error') return;
            // Existing public reader probes account-only preferences and intentionally falls back for guests.
            const expectedGuestPreference = surface.name === 'release' && message.text().includes('401')
              && message.location().url === `${baseUrl}/api/reading-preferences`;
            if (!expectedGuestPreference) browserErrors.push(`${surface.name}: ${message.text()} @ ${message.location().url}`);
          });
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const response = await page.goto(`${baseUrl}${surface.path}`, { waitUntil: 'networkidle' });
          expect(response?.status(), `${surface.name} ${viewport.name}`).toBe(200);
          for (const text of surface.expected) await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible' });
          if (surface.name === 'directory') {
            await page.getByLabel('搜索期刊').fill(journalName);
            await page.getByRole('button', { name: '搜索' }).click();
            await page.getByText(journalName).waitFor({ state: 'visible' });
          }
          if (surface.name === 'release') {
            const sourceLink = page.getByRole('link', { name: /查看原始来源/ });
            await sourceLink.waitFor({ state: 'visible' });
            expect(await sourceLink.getAttribute('href')).toBe(source.url);
          }
          await page.screenshot({ path: resolve(outputDir, `${surface.name}-${viewport.name}.png`), fullPage: true });
          const layout = await page.evaluate(() => ({
            width: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            offenders: [...document.querySelectorAll('body *')].flatMap((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width && (rect.right > window.innerWidth + 1 || rect.left < -1)
                ? [{ tag: element.tagName, className: element.className, width: Math.round(rect.width), text: element.textContent?.slice(0, 100) }]
                : [];
            }).slice(-12),
          }));
          expect(layout.scrollWidth <= layout.width + 1, `${surface.name} overflows at ${viewport.width}px: ${JSON.stringify(layout)}`).toBe(true);
          await page.close();
        }
      }

      const indexSitemap = await fetch(`${baseUrl}/journals/sitemap.xml`);
      expect(indexSitemap.status).toBe(200);
      expect(await indexSitemap.text()).toContain(`/journals/${slug}/sitemap.xml`);
      const journalSitemapUrl = `${baseUrl}/journals/${slug}/sitemap.xml`;
      const journalSitemap = await fetch(journalSitemapUrl);
      expect(journalSitemap.status).toBe(200);
      expect(await journalSitemap.text()).toContain(releaseUrl);

      const feedbackText = `Synthetic correction ${randomUUID()}: verify the simulation qualifier.`;
      const responseText = 'Synthetic editorial response: qualifier verified and ticket resolved.';
      const feedbackPage = await ownerContext.newPage();
      feedbackPage.on('pageerror', (error) => browserErrors.push(`feedback: ${error.message}`));
      feedbackPage.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`feedback: ${message.text()}`); });
      await feedbackPage.goto(`${baseUrl}${releaseUrl}`, { waitUntil: 'networkidle' });
      const feedbackSection = feedbackPage.getByRole('region', { name: '反馈解读错误' });
      await feedbackSection.getByLabel(/对解读 v\d+ 的反馈/).fill(feedbackText);
      const feedbackResponse = feedbackPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/feedback'));
      await feedbackSection.getByRole('button', { name: '提交纠错反馈' }).click();
      const submittedFeedback = await feedbackResponse;
      expect(submittedFeedback.status(), await submittedFeedback.text()).toBe(200);
      await feedbackSection.getByRole('status').filter({ hasText: '反馈已提交给编辑部' }).waitFor({ state: 'visible' });

      const editorialPage = await ownerContext.newPage();
      editorialPage.on('pageerror', (error) => browserErrors.push(`editorial-feedback: ${error.message}`));
      editorialPage.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`editorial-feedback: ${message.text()}`); });
      await editorialPage.goto(`${baseUrl}/journals/manage/${journalId}`, { waitUntil: 'networkidle' });
      const editorialSection = editorialPage.getByRole('region', { name: '读者纠错反馈' });
      await editorialSection.getByRole('button', { name: '加载反馈工单' }).click();
      await editorialSection.getByText(feedbackText).waitFor({ state: 'visible' });
      await editorialSection.getByLabel('处理说明').fill(responseText);
      await editorialSection.getByRole('button', { name: '标记已处理' }).click();
      await editorialSection.getByText('编辑部处理说明：' + responseText).waitFor({ state: 'visible' });

      await feedbackPage.reload({ waitUntil: 'networkidle' });
      const refreshedFeedbackSection = feedbackPage.getByRole('region', { name: '反馈解读错误' });
      await refreshedFeedbackSection.getByRole('button', { name: '查看我的反馈与处理说明' }).click();
      await refreshedFeedbackSection.getByText(feedbackText).waitFor({ state: 'visible' });
      await refreshedFeedbackSection.getByText('编辑部处理说明：' + responseText).waitFor({ state: 'visible' });

      const anonymousFeedbackPage = await publicContext.newPage();
      await anonymousFeedbackPage.goto(`${baseUrl}${releaseUrl}`, { waitUntil: 'networkidle' });
      const anonymousSection = anonymousFeedbackPage.getByRole('region', { name: '反馈解读错误' });
      expect(await anonymousSection.getByText(feedbackText).count()).toBe(0);
      await anonymousSection.getByRole('button', { name: '查看我的反馈与处理说明' }).click();
      await anonymousSection.getByText('请登录后提交或查看反馈；已输入的内容仍保留。').waitFor({ state: 'visible' });

      const actionPage = await ownerContext.newPage();
      await actionPage.goto(`${baseUrl}/journals/manage/${journalId}`, { waitUntil: 'networkidle' });
      await actionPage.getByRole('button', { name: '提交服务申请' }).click();
      await actionPage.getByRole('status').filter({ hasText: '服务申请已提交' }).waitFor({ state: 'visible' });

      const currentArticle = await prisma.journalArticle.findUniqueOrThrow({ where: { id: articleId } });
      const pollDeps = { prisma, mailer: createFakeMailer() };
      const pollJob = await submitJournalJob(pollDeps, ownerId, journalId, articleId, {
        requestKey: `browser-poll-${randomUUID()}`, revision: currentArticle.revision, language: 'zh',
      });
      try {
        const editPage = await ownerContext.newPage();
        await editPage.goto(`${baseUrl}/journals/manage/${journalId}/articles/${articleId}`, { waitUntil: 'networkidle' });
        await editPage.getByRole('textbox', { name: '来源文本', exact: true }).waitFor({ state: 'visible', timeout: 10000 }).catch(async (error) => { await editPage.screenshot({ path: resolve(outputDir, 'article-edit-failure.png'), fullPage: true }); throw new Error(String(error) + '\nPAGE: ' + (await editPage.locator('body').innerText()).slice(0, 1800)); });
        const changedSource = `${sourceSentence} Local editor verification.`;
        const changedSummary = `${draft.summary} Local editor verification.`;
        await editPage.getByRole('textbox', { name: '来源文本', exact: true }).fill(changedSource);
        await editPage.getByRole('textbox', { name: '摘要', exact: true }).fill(changedSummary);
        await editPage.getByText('有未保存修改，请先保存再审核或发布。').waitFor({ state: 'visible' });
        expect(await editPage.getByRole('button', { name: '人工确认并发布' }).isDisabled()).toBe(true);
        expect(await editPage.getByRole('button', { name: '提交审核' }).isDisabled()).toBe(true);
        await editPage.waitForTimeout(2_500);
        expect(await editPage.getByRole('textbox', { name: '来源文本', exact: true }).inputValue()).toBe(changedSource);
        expect(await editPage.getByRole('textbox', { name: '摘要', exact: true }).inputValue()).toBe(changedSummary);
        await editPage.getByRole('button', { name: '保存修订' }).click();
        await editPage.getByText('已保存。来源或解读内容变更后，需要重新审核。').waitFor({ state: 'visible' });
        await expect.poll(() => editPage.getByRole('button', { name: '提交审核' }).isEnabled()).toBe(true);
        await editPage.getByRole('button', { name: '提交审核' }).click();
        await editPage.getByText(/fulltext · submitted · 修订/).waitFor({ state: 'visible' });
        await expect.poll(() => editPage.getByRole('button', { name: '批准当前修订' }).isEnabled()).toBe(true);
        await editPage.screenshot({ path: resolve(outputDir, 'article-edit-saved-submitted.png'), fullPage: true });
        const restricted = editPage.waitForResponse((response) => response.url().includes(`/journals/${journalId}/articles/${articleId}/restrict`) && response.ok());
        editPage.once('dialog', (dialog) => { void dialog.accept('Synthetic browser restriction verification'); });
        await editPage.getByRole('button', { name: '限制公开' }).click();
        await restricted;
        const sitemapDeadline = Date.now() + 10_000;
        let restrictedSitemap = '';
        do {
          restrictedSitemap = await (await fetch(journalSitemapUrl)).text();
          if (!restrictedSitemap.includes(releaseUrl)) break;
          await new Promise((accept) => setTimeout(accept, 200));
        } while (Date.now() < sitemapDeadline);
        expect(restrictedSitemap).not.toContain(releaseUrl);
        expect((await fetch(`${baseUrl}${releaseUrl}`)).status).toBe(404);
      } finally {
        await cancelJournalJob(pollDeps, ownerId, journalId, pollJob.id);
      }
      expect(browserErrors).toEqual([]);
      await Promise.all([publicContext.close(), ownerContext.close(), adminContext.close()]);
    } finally { await browser.close(); }
  }, 180_000);

  it('persists processing choices and reconciles queue credits through the new pages', async () => {
    const csrf = await app.inject({ url: '/csrf-token' });
    expect(csrf.statusCode).toBe(200);
    const fixtureCookies = { ...Object.fromEntries(csrf.cookies.map((cookie) => [cookie.name, cookie.value])), openscience_session: ownerToken };
    const fixtureHeaders = { 'x-csrf-token': csrf.json().csrfToken as string };
    const created = await app.inject({ method: 'POST', url: `/journals/${journalId}/articles`, cookies: fixtureCookies, headers: fixtureHeaders, payload: { metadata: { title: 'Synthetic priority and credits paper', authors: ['Synthetic Author'], publishedDate: '2026-09-22', journalTitle: journalName, issns: [], originalUrl: 'https://journal.example.invalid/priority-source' } } });
    expect(created.statusCode, created.body).toBe(200);
    const fresh = created.json().article as { id: string; revision: number };
    const prepared = await app.inject({ method: 'PATCH', url: `/journals/${journalId}/articles/${fresh.id}`, cookies: fixtureCookies, headers: fixtureHeaders, payload: { revision: fresh.revision, source, rights } });
    expect(prepared.statusCode, prepared.body).toBe(200);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await context.addCookies([{ name: 'openscience_session', value: ownerToken, url: baseUrl, sameSite: 'Lax' }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let submittedJobId: string | undefined;
    try {
      await page.goto(`${baseUrl}/journals/manage/${journalId}/articles/${fresh.id}/sources`, { waitUntil: 'networkidle' });
      const sourceForm = page.getByRole('region', { name: '添加来源材料' });
      await sourceForm.getByLabel('材料类型', { exact: true }).selectOption('supplementary');
      await sourceForm.getByLabel('材料标题', { exact: true }).fill('Synthetic supplementary registration');
      await sourceForm.getByLabel('来源链接', { exact: true }).fill('https://journal.example.invalid/supplementary');
      await sourceForm.getByLabel('授权或核验依据', { exact: true }).fill('Synthetic material registration; this record does not authorize the main source.');
      const addedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/articles/${fresh.id}/sources`));
      await sourceForm.getByRole('button', { name: '添加材料并评估', exact: true }).click();
      const added = await addedResponse;
      expect(added.status(), await added.text()).toBe(200);
      const matrix = await added.json() as { sources: Array<{ sourceType: string }>; capability: { canGenerateFullSixFields: boolean } };
      expect(matrix.sources.some((item) => item.sourceType === 'supplementary')).toBe(true);
      expect(matrix.capability.canGenerateFullSixFields).toBe(true);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Synthetic supplementary registration', exact: true }).waitFor({ state: 'visible' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: resolve(outputDir, 'sources-supplementary-mobile-375.png'), fullPage: true });
      await page.goto(`${baseUrl}/journals/manage/${journalId}/articles/${fresh.id}`, { waitUntil: 'networkidle' });
      await page.getByRole('textbox', { name: '来源文本', exact: true }).fill(`${sourceSentence} This source text was amended by the synthetic editor.`);
      expect(await page.getByRole('button', { name: '生成 AI 解读草稿', exact: true }).isDisabled()).toBe(true);
      await page.getByRole('button', { name: '保存修订', exact: true }).click();
      await page.getByText('已保存。来源或解读内容变更后，需要重新审核。', { exact: true }).waitFor();
      expect(await page.getByRole('button', { name: '生成 AI 解读草稿', exact: true }).isDisabled()).toBe(true);
      await page.goto(`${baseUrl}/journals/manage/${journalId}/articles/${fresh.id}/sources`, { waitUntil: 'networkidle' });
      const primary = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Synthetic source paragraph', exact: true }) });
      const reboundResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/articles/${fresh.id}/sources/`) && response.url().endsWith('/rights'));
      await primary.getByRole('button', { name: '保存此项授权', exact: true }).click();
      const rebound = await reboundResponse;
      expect(rebound.status(), await rebound.text()).toBe(200);
      expect((await rebound.json() as { capability: { canGenerateFullSixFields: boolean } }).capability.canGenerateFullSixFields).toBe(true);
      await page.goto(`${baseUrl}/journals/manage/${journalId}/processing`, { waitUntil: 'networkidle' });
      const row = page.getByRole('article').filter({ hasText: 'Synthetic priority and credits paper' });
      await row.getByRole('button', { name: '标记重点', exact: true }).click();
      await row.getByRole('button', { name: '取消重点', exact: true }).waitFor({ state: 'visible' });
      await page.reload({ waitUntil: 'networkidle' });
      await row.getByRole('button', { name: '取消重点', exact: true }).waitFor({ state: 'visible' });
      await row.getByRole('button', { name: '延后 7 天', exact: true }).click();
      await row.getByRole('button', { name: '恢复处理', exact: true }).waitFor({ state: 'visible' });
      await row.getByRole('button', { name: '恢复处理', exact: true }).click();
      await row.getByRole('button', { name: '延后 7 天', exact: true }).waitFor({ state: 'visible' });
      const before = (await app.inject({ url: `/journals/${journalId}/service-plan`, cookies: { openscience_session: ownerToken } })).json().credits as { available: number; reserved: number; consumed: number };
      page.once('dialog', (dialog) => { void dialog.accept(); });
      const queuedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/articles/${fresh.id}/processing-jobs`));
      await row.getByRole('button', { name: '确认并入队', exact: true }).click();
      const queued = await queuedResponse;
      expect(queued.status(), await queued.text()).toBe(200);
      submittedJobId = (await queued.json() as { job: { id: string } }).job.id;
      const during = (await app.inject({ url: `/journals/${journalId}/service-plan`, cookies: { openscience_session: ownerToken } })).json().credits as typeof before;
      expect(during.available).toBe(before.available - 1);
      expect(during.reserved).toBe(before.reserved + 1);
      expect(during.consumed).toBe(before.consumed);
      const cancelled = await cancelJournalJob({ prisma, mailer: createFakeMailer() }, ownerId, journalId, submittedJobId);
      expect(cancelled.state).toBe('cancelled');
      const after = (await app.inject({ url: `/journals/${journalId}/service-plan`, cookies: { openscience_session: ownerToken } })).json().credits as typeof before;
      expect(after.available).toBe(before.available);
      expect(after.reserved).toBe(before.reserved);
      expect(after.consumed).toBe(before.consumed);

      await page.goto(`${baseUrl}/journals/manage/${journalId}/services`, { waitUntil: 'networkidle' });
      await page.getByRole('radio', { name: /Starter/ }).check();
      await page.getByLabel('需求说明', { exact: true }).fill('Synthetic browser service request; no purchase or entitlement activation.');
      const serviceResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/journals/${journalId}/service-requests`));
      await page.getByRole('button', { name: '提交服务申请', exact: true }).click();
      const service = await serviceResponse;
      expect(service.status(), await service.text()).toBe(200);
      await page.getByRole('status').filter({ hasText: '服务申请已提交' }).waitFor({ state: 'visible' });
      expect((await prisma.journalServiceRequest.findUniqueOrThrow({ where: { id: (await service.json() as { request: { id: string } }).request.id } })).status).toBe('submitted');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: resolve(outputDir, 'services-request-mobile-375.png'), fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      if (submittedJobId) await cancelJournalJob({ prisma, mailer: createFakeMailer() }, ownerId, journalId, submittedJobId);
      await context.close();
      await browser.close();
    }
  }, 120_000);
});
