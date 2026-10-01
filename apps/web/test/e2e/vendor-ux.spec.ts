import { expect, test, type Page } from 'playwright/test';
import { LIVE2D_ASSET_ROOT } from '../../lib/hermes/live2d-assets.mjs';

async function prepare(page: Page, profileFails = false) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/research-identity' && profileFails) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'fixture profile unavailable' } } });
    const bodies: Record<string, unknown> = {
      '/api/auth/me': { userId: 'vendor-user', email: 'user@example.invalid', displayName: '研究者甲', status: 'email_verified', level: 'free' },
      '/api/research-identity': { profile: { identities: [], primaryIdentity: null, disciplines: [], methods: [], topics: [], languages: [], acceptedSignals: [], rejectedSignals: [], profileVersion: 1 } },
      '/api/auth/academic-identity': { steps: { registered: true, emailVerified: true, orcidConnected: false, institutionEmailVerified: false }, credentials: [], scopedRoles: [], capabilities: { orcid: false, institutionEmail: false } },
      '/api/research-objects': { researchObjects: [] },
      '/api/usage': { user: [{ resource: 'ai_credit', scope: 'user_monthly', limit: 500, used: 8, remaining: 492, allowed: true }], workspaces: [] },
    };
    await route.fulfill({ json: bodies[path] ?? {} });
  });
}

test('profile failure preserves session account and permits retry', async ({ page }) => {
  await prepare(page, true);
  await page.goto('/me');
  await expect(page.locator('main')).toContainText('研究者甲');
  await expect(page.locator('main')).not.toContainText('free');
  await expect(page.locator('#research-profile').getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
  await page.route('**/api/research-identity', route => route.fulfill({ json: { profile: { identities: [], primaryIdentity: null, disciplines: [], methods: [], topics: [], languages: [], acceptedSignals: [], rejectedSignals: [], profileVersion: 1 } } }));
  await page.locator('#research-profile').getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('[data-profile-research-identity]')).toBeVisible();
});

test('common login route keeps return destination', async ({ page }) => {
  await prepare(page);
  await page.goto('/login?returnTo=%2Fme');
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=%2Fme$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/auth\/register$/);
  await page.goto('/new');
  await expect(page).toHaveURL(/\/research-objects\/new$/);
});

test('balance uses remaining credit without implying a lifetime cap', async ({ page }) => {
  await prepare(page);
  await page.goto('/settings');
  const usage = page.locator('[data-usage-balance]');
  await expect(usage).toContainText('492');
  await expect(usage).toContainText('本月发放额度');
  await expect(usage.getByRole('progressbar')).toHaveCount(0);
  await expect(usage.locator('[data-low-credit]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('free');
});

test('low balance uses monthly grant threshold and tolerates carried credit', async ({ page }) => {
  await prepare(page);
  for (const [remaining, warning] of [[49, true], [50, false], [900, false]] as const) {
    await page.route('**/api/usage', route => route.fulfill({ json: { user: [{ resource: 'ai_credit', scope: 'user_monthly', limit: 500, used: 8, remaining, allowed: true }], workspaces: [] } }));
    await page.goto('/settings');
    const usage = page.locator('[data-usage-balance]');
    await expect(usage).toContainText(String(remaining));
    await expect(usage.locator('[data-low-credit]')).toHaveCount(warning ? 1 : 0);
  }
});

test('guide is reachable from common primary navigation and 404 is localized', async ({ page }) => {
  await prepare(page);
  await page.goto('/settings');
  await page.locator('nav a[href="/guide"]').click();
  await expect(page.getByRole('heading', { name: '从资料到公开研究' })).toBeVisible();
  await expect(page.locator('article')).not.toContainText(/\b(?:RO|SDF)\b/);
  await page.goto('/vendor-path-that-does-not-exist');
  await expect(page.getByRole('heading', { name: '页面未找到' })).toBeVisible();
  await page.getByRole('link', { name: '返回首页', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('headers wrap at 1024 and keep every primary entry on small screens', async ({ page }) => {
  await prepare(page);
  for (const width of [320, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings');
    const links = page.locator('nav [data-product-route-navigation] a');
    await expect(links).toHaveCount(6);
    for (const link of await links.all()) await expect(link).toBeVisible();
    const rects = await page.locator('header').first().locator('a').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1024) await page.screenshot({ path: '../../tmp/vendor-findings/settings-1024.png', fullPage: true });
  }
});

test('empty saved extraction cannot be confirmed and offers existing manual editing', async ({ page }) => {
  await prepare(page);
  const core = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
  const task = { id: 'empty-task', artifactId: 'paper-1', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'saved-analysis', result: { core } };
  let writes = 0;
  let versionsReads = 0;
  await page.route('**/api/research-objects/empty-ro/**', route => route.fulfill({ json: route.request().url().includes('hermes-runs') ? { run: null } : { researchObjectId: 'empty-ro', version: 1, tasks: [{ ...task, confirmation: null }], latestConfirmation: null } }));
  await page.route('**/api/ingestion/tasks/empty-task', route => route.fulfill({ json: { task, researchObjectId: 'empty-ro', batchId: 'batch', version: 1 } }));
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/versions')) versionsReads++; });
  await page.goto('/research-objects/empty-ro/hermes?task=empty-task&hermes-motion=reduced');
  await expect(page.getByRole('heading', { name: '未得到可确认的内容' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认并创建版本', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: '打开编辑器手动完善' })).toHaveAttribute('href', '/research-objects/empty-ro/edit?ingestionTask=empty-task');
  await expect(page.locator('main')).not.toContainText('解析失败');
  await expect(page.getByRole('button', { name: /重试结构化|重新分析/ })).toHaveCount(0);
  expect(writes).toBe(0);
  expect(versionsReads).toBe(0);
});

test('slow research profile offers retry while account stays readable', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/research-identity', async route => {
    await new Promise(resolve => setTimeout(resolve, 15_000));
    await route.fulfill({ json: {} }).catch(() => undefined);
  });
  await page.goto('/me');
  await expect(page.locator('main')).toContainText('研究者甲');
  await expect(page.locator('#research-profile').getByRole('button', { name: '重新加载', exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('#research-profile').getByRole('link', { name: '返回工作台', exact: true })).toBeVisible();
});

test('versioned Live2D serves model references from this origin with safe immutable caching', async ({ request }) => {
  const modelUrl = `${LIVE2D_ASSET_ROOT}/wanko/wanko_touch.model3.json`;
  const model = await request.get(modelUrl);
  expect(model.status()).toBe(200);
  expect(model.headers()['cache-control']).toContain('immutable');
  const refs = (await model.json()).FileReferences as { Moc: string; Physics: string; DisplayInfo: string; Textures: string[]; Motions: Record<string, Array<{ File: string }>> };
  const files = [refs.Moc, refs.Physics, refs.DisplayInfo, ...refs.Textures, ...Object.values(refs.Motions).flatMap(items => items.map(item => item.File))];
  for (const file of files) {
    expect(file).not.toMatch(/https?:|\.\./);
    const response = await request.get(`${LIVE2D_ASSET_ROOT}/wanko/${file}`);
    expect(response.status(), file).toBe(200);
    expect(response.headers()['cache-control'], file).toContain('immutable');
  }
  const mutable = await request.get('/hermes/live2d/wanko/wanko_touch.model3.json');
  expect(mutable.status()).toBe(200);
  expect(mutable.headers()['cache-control']).not.toContain('immutable');
});

test('station shows queued, review and failed work with static Hermes available', async ({ page }) => {
  await prepare(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tasks = ['queued', 'needs_review', 'failed_retryable'].map(state => ({ id: `task-${state}`, researchObjectId: 'station-ro', researchTitle: '正在进行的研究', logicalPath: `${state}.pdf`, state, retryCount: 0, error: null }));
  await page.route('**/api/ingestion?*', route => route.fulfill({ json: { tasks } }));
  await page.route('**/api/research-objects?*', route => route.fulfill({ json: { researchObjects: [{ id: 'station-ro', publicId: null, title: '正在进行的研究', version: 1, status: 'draft' }] } }));
  await page.route('**/api/workspaces', route => route.fulfill({ json: { workspaces: [] } }));
  const live2dRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/hermes/live2d/')) live2dRequests.push(request.url()); });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/dashboard');
  const rail = page.locator('aside[aria-labelledby="hermes-task-title"]');
  for (const task of tasks) await expect(rail.locator(`a[href="/research-objects/station-ro/edit?ingestionTask=${task.id}"]`)).toBeVisible();
  await expect(page.locator('[data-continuation-priority="primary"] a')).toHaveAttribute('href', '/research-objects/station-ro/edit?ingestionTask=task-needs_review');
  await expect(page.locator('.hermes-conversation-card img[alt="Hermes"]')).toBeVisible();
  expect(live2dRequests).toHaveLength(0);
  await page.screenshot({ path: '../../tmp/vendor-findings/dashboard-1024.png', fullPage: true });
});
