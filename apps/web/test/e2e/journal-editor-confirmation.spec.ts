import { expect, test } from 'playwright/test';
import type { JournalArticle } from '../../lib/journal-api';

test('editor confirms a private interpretation before the owner can publish it', async ({ page }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  const article: JournalArticle = {
    id: 'article-1', journalId: 'journal-1', researchObjectId: null, workId: 'work-1',
    metadata: { title: 'Synthetic published paper', doi: '10.1000/synthetic', authors: ['A. Author'], journalTitle: 'Synthetic Journal', issns: [], originalUrl: 'https://publisher.example/paper' },
    directoryVisible: false, contentState: 'active', revision: 7,
    source: { kind: 'abstract', text: 'This synthetic abstract contains enough text to permit a private interpretation in the test.', url: 'https://publisher.example/paper', label: 'Publisher abstract' },
    rights: { internalProcessing: true, derivativeGeneration: true, externalProcessing: true, publicSource: false, publicDerivative: true, license: 'Synthetic permission', evidence: 'Permission document dated 2026-01-01' },
    draft: { summary: 'A private interpretation.', scope: 'abstract', language: 'zh', core: { problem: 'p', insight: 'i', method: 'm', results: 'r', limitations: 'l', reproducibility: 'x' }, claims: [], figures: [], faq: [] },
    reviewState: 'draft', reviewedRevision: null, reviewNote: null, releases: [], jobs: [],
  };
  let confirmationBody: unknown;
  let publishBody: unknown;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/journals/journal-1/articles/article-1/review') {
      confirmationBody = route.request().postDataJSON();
      article.reviewState = 'approved';
      article.reviewedRevision = article.revision;
      await route.fulfill({ json: { article } });
    } else if (url.pathname === '/api/journals/journal-1/articles/article-1/publish') {
      publishBody = route.request().postDataJSON();
      await route.fulfill({ json: { release: { versionNo: 1, publicId: 'synthetic-1', url: '/research/synthetic-1/v/1' } } });
    } else if (url.pathname === '/api/journals/journal-1/articles/article-1') {
      await route.fulfill({ json: { article, nativeGenerationReady: true } });
    } else if (url.pathname === '/api/journals/journal-1/articles/article-1/sources') {
      await route.fulfill({ json: { sources: [], articleRevision: article.revision, history: [], capability: { canGenerateFullSixFields: false, canPublishPublicSummary: false, canPublishFigures: false, limitations: [], blockingReasons: [] } } });
    } else if (url.pathname === '/api/journals/journal-1/articles/article-1/shared-files') {
      await route.fulfill({ json: { researchObjectId: null, articleRevision: article.revision, versionId: null, files: [], sourceArtifactId: null, processing: null } });
    } else if (url.pathname === '/api/journals/journal-1/manage') {
      await route.fulfill({ json: { membership: { role: 'owner' } } });
    } else if (url.pathname === '/api/journals/journal-1/members') {
      await route.fulfill({ json: { items: [] } });
    } else if (url.pathname === '/api/csrf-token') {
      await route.fulfill({ json: { csrfToken: 'synthetic-csrf' } });
    } else {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Synthetic route not used' } } });
    }
  });

  await page.goto('/journals/manage/journal-1/articles/article-1');
  const confirm = page.getByRole('button', { name: '确认当前解读' });
  const publish = page.getByRole('button', { name: '公开发布已确认版本' });
  await expect(confirm).toBeDisabled();
  await expect(publish).toBeDisabled();
  await page.getByRole('checkbox', { name: /我已核对摘要/ }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => confirmationBody).not.toBeUndefined();
  expect(confirmationBody).toMatchObject({ revision: 7, decision: 'confirm', humanConfirmed: true });
  await expect(publish).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await publish.click();
  await expect.poll(() => publishBody).not.toBeUndefined();
  expect(publishBody).toMatchObject({ revision: 7, humanConfirmed: true });
});
