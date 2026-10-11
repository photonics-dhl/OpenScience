import { expect, test, type Page, type Route } from 'playwright/test';
import { mkdirSync } from 'node:fs';

const core = (problem: string) => ({ schemaVersion: '0.1.0', problem, insight: '', method: '', results: '', limitations: '', reproducibility: '' });
const research = (id: string, title: string) => ({ id, publicId: null, workspaceId: 'personal-1', title, version: 1, status: 'draft', visibility: 'private', createdAt: '2026-10-10T00:00:00.000Z', sdf: { core: core(id), nodes: [] } });
const task = { id: 'guide-task-1', researchObjectId: 'ro-new', sessionId: 'session-1', kind: 'workspace.guide', status: 'succeeded', progress: 100, retryCount: 0, canRetry: false, result: { summary: 'Hermes received this research question.', needsMoreInformation: false, nextSteps: [] }, error: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function fixture(page: Page, options: { delayedSelection?: boolean; publishedSource?: boolean } = {}) {
  const calls = { create: 0, guide: 0, confirm: 0, publish: 0, ingestionBodies: [] as string[], ingestionKeys: [] as string[] };
  let confirmed = false;
  const sourceTask = { id: 'source-1', artifactId: 'artifact-1', logicalPath: 'paper.pdf', state: confirmed ? 'confirmed' : 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent-source-1', result: { core: core('Hermes finding grounded in paper'), evidence: { problem: { quote: 'The paper states its research problem.' } } } };
  const publishedVersion = { versionId: 'version-public-1', versionNo: 1, publicationNo: 1, status: 'published', commitId: 'commit-1', createdAt: '2026-10-01T00:00:00.000Z' };
  const privateVersion = { versionId: 'version-private-2', versionNo: 2, publicationNo: null, status: 'draft', commitId: 'commit-2', createdAt: '2026-10-10T00:00:00.000Z' };
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    if (path === '/api/auth/me') return json(route, { userId: 'owner-1', email: 'researcher@example.invalid', displayName: 'Researcher', status: 'active', level: 'basic' });
    if (path === '/api/csrf-token') return json(route, { csrfToken: 'fixture-token' });
    if (path === '/api/workspaces') return json(route, { workspaces: [{ id: 'personal-1', name: 'Personal', type: 'personal', role: 'owner' }] });
    if (path === '/api/research-objects' && method === 'GET') return json(route, { researchObjects: [research('ro-old', 'Older study'), research('ro-next', 'Next study')] });
    if (path === '/api/research-objects' && method === 'POST') { calls.create++; return json(route, { researchObject: { id: 'ro-new', workspaceId: 'personal-1', version: 1 } }); }
    if (path === '/api/research-objects/ro-new/ingest' && method === 'POST') {
      calls.ingestionBodies.push(route.request().postDataBuffer()?.toString('utf8') ?? '');
      calls.ingestionKeys.push(route.request().headers()['idempotency-key']);
      return json(route, { batchId: 'text-batch-1', researchObjectId: 'ro-new', tasks: [{ id: 'text-source-1', artifactId: 'text-artifact-1', logicalPath: '研究内容.md', state: 'queued', retryCount: 0, error: null }], artifacts: [] });
    }
    if (path === '/api/agent/sessions' && method === 'POST') return json(route, { session: { id: 'session-1' } });
    if (path === '/api/agent/tasks' && method === 'POST') { calls.guide++; return json(route, { task }); }
    if (path === '/api/agent/tasks' && method === 'GET') return json(route, { tasks: [task] });
    if (path === '/api/agent/tasks/guide-task-1') return json(route, { task });
    if (options.publishedSource && path === '/api/ingestion/tasks/source-1') return json(route, { task: { ...sourceTask, state: confirmed ? 'confirmed' : 'needs_review' }, batchId: 'batch-1', researchObjectId: 'ro-old', version: confirmed ? 2 : 1 });
    if (options.publishedSource && path === '/api/ingestion/source-1/confirm' && method === 'POST') {
      calls.confirm++; confirmed = true;
      return json(route, { task: { ...sourceTask, state: 'confirmed' }, sdf: { core: core('Hermes finding grounded in paper') }, confirmation: { commitId: 'commit-2', versionId: 'version-private-2', versionNo: 2, version: 2, evidenceStatus: 'needs_review', missingFields: [] } });
    }
    if (path.endsWith('/publish') && method === 'POST') { calls.publish++; return json(route, {}); }
    if (options.publishedSource && path.startsWith('/api/versions/')) return json(route, { version: { versionId: path.split('/').at(-1), snapshot: { artifacts: [] } } });
    const match = path.match(/^\/api\/research-objects\/(ro-old|ro-next)(?:\/(versions|ingestion))?$/u);
    if (match) {
      if (options.delayedSelection && match[1] === 'ro-next') await new Promise((resolve) => setTimeout(resolve, 350));
      if (match[2] === 'versions') return json(route, { versions: options.publishedSource && match[1] === 'ro-old' ? confirmed ? [privateVersion, publishedVersion] : [publishedVersion] : [] });
      if (match[2] === 'ingestion') return json(route, { researchObjectId: match[1], version: confirmed ? 2 : 1, tasks: options.publishedSource && match[1] === 'ro-old' && !confirmed ? [{ ...sourceTask, result: undefined, confirmation: null }] : [], latestConfirmation: null });
      const row = research(match[1], match[1] === 'ro-old' ? 'Older study' : 'Next study');
      if (options.publishedSource && match[1] === 'ro-old') { row.version = confirmed ? 2 : 1; row.sdf.core = core(confirmed ? 'Hermes finding grounded in paper' : 'Original published problem'); }
      return json(route, { researchObject: row });
    }
    return json(route, {});
  });
  return calls;
}

test('Guide sends the entered idea once and keeps the restored Hermes conversation in the page', async ({ page }) => {
  const calls = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/guide');
  await expect(page.getByRole('combobox', { name: '选择研究' }).locator('option')).toHaveCount(3);
  await page.locator('#guide-research-idea').fill('Help explain the central experiment.');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('[data-guide-workspace] .guide-embedded-conversation')).toBeVisible();
  await expect(page.locator('[data-guide-workspace] .hermes-message')).toContainText(['Hermes received this research question.']);
  expect(calls.create).toBe(1);
  expect(calls.guide).toBe(1);
  await expect(page).toHaveURL(/\/guide$/u);
  if (process.env.GUIDE_SCREENSHOT_DIR) {
    mkdirSync(process.env.GUIDE_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.GUIDE_SCREENSHOT_DIR}/guide-auth-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-guide-workspace] .guide-embedded-conversation')).toBeVisible();
    await page.screenshot({ path: `${process.env.GUIDE_SCREENSHOT_DIR}/guide-auth-mobile.png`, fullPage: true });
  }
});

test('changing research hides the previous editor until the authorized target has loaded', async ({ page }) => {
  await fixture(page, { delayedSelection: true });
  await page.goto('/guide');
  const picker = page.getByRole('combobox', { name: '选择研究' });
  await picker.selectOption('ro-old');
  await expect(page.locator('#sdf-field-problem')).toHaveValue('ro-old');
  await picker.selectOption('ro-next');
  await expect(page.locator('#sdf-field-problem')).toHaveCount(0);
  await expect(page.locator('#sdf-field-problem')).toHaveValue('ro-next');
  await expect(page).toHaveURL(/\/guide$/u);
});

test('direct writing submits the complete passage as source material without filling six fields', async ({ page }) => {
  const calls = await fixture(page);
  await page.goto('/guide');
  await expect(page.getByRole('combobox', { name: '选择研究' }).locator('option')).toHaveCount(3);
  await page.getByRole('button', { name: '直接填写', exact: true }).click();
  await expect(page.locator('#sdf-field-problem')).toHaveCount(0);
  const passage = '研究内容：我们搭建了一套实验平台，并记录了方法、测量过程与初步发现。\n'.repeat(100);
  await page.locator('#guide-research-text').fill(passage);
  await page.getByRole('button', { name: '直接填写', exact: true }).click();
  await expect(page.locator('#guide-research-text')).toHaveValue(passage);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('私有草稿已保存');
  expect(calls.ingestionBodies).toHaveLength(1);
  expect(calls.ingestionBodies[0]).toContain(passage);
  expect(calls.create).toBe(1);
  expect(calls.guide).toBe(0);
  expect(calls.publish).toBe(0);
  await expect(page).toHaveURL(/\/guide$/u);
});

test('the three input cards align on desktop and remain equal and usable on a phone', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/auth/me', (route) => json(route, { error: { code: 'SESSION_INVALID', message: 'Anonymous preview' } }, 401));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/guide');
  const cards = page.locator('[data-guide-input-card]');
  await expect(cards).toHaveCount(3);
  const desktop = await cards.evaluateAll((items) => items.map((item) => { const box = item.getBoundingClientRect(); return { width: box.width, height: box.height, y: box.y }; }));
  expect(Math.max(...desktop.map((item) => item.width)) - Math.min(...desktop.map((item) => item.width))).toBeLessThan(1);
  expect(Math.max(...desktop.map((item) => item.height)) - Math.min(...desktop.map((item) => item.height))).toBeLessThan(1);
  expect(Math.max(...desktop.map((item) => item.y)) - Math.min(...desktop.map((item) => item.y))).toBeLessThan(1);
  if (process.env.GUIDE_SCREENSHOT_DIR) {
    mkdirSync(process.env.GUIDE_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.GUIDE_SCREENSHOT_DIR}/guide-cards-desktop.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await cards.evaluateAll((items) => items.map((item) => { const box = item.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
  expect(Math.max(...mobile.map((item) => item.width)) - Math.min(...mobile.map((item) => item.width))).toBeLessThan(1);
  expect(Math.max(...mobile.map((item) => item.height)) - Math.min(...mobile.map((item) => item.height))).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#guide-research-idea')).toHaveAttribute('placeholder', '上传您的论文及各类研究文件，在此告诉 Hermes 你想完成什么。');
  if (process.env.GUIDE_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.GUIDE_SCREENSHOT_DIR}/guide-cards-mobile.png`, fullPage: true });
});

test('reviewing a source creates a private revision while the published version remains available', async ({ page }) => {
  const calls = await fixture(page, { publishedSource: true });
  await page.goto('/guide');
  const picker = page.getByRole('combobox', { name: '选择研究' });
  await picker.selectOption('ro-old');
  await expect(page.locator('#sdf-field-problem')).toHaveValue('Original published problem');
  await expect(page.locator('[data-guide-workspace]')).toContainText('已公开的原版本会保留');
  await page.getByRole('button', { name: '刷新分析结果' }).click();
  await expect(page.locator('[data-hermes-source-evidence="problem"]')).toBeVisible();
  await page.getByRole('button', { name: '确认这六个字段' }).click();
  await expect(page.locator('#sdf-field-problem')).toHaveValue('Hermes finding grounded in paper');
  await expect(page.locator('[data-guide-workspace]')).toContainText('已公开的原版本会保留');
  expect(calls.confirm).toBe(1);
  expect(calls.publish).toBe(0);
});
