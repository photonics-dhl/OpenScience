import { test, expect, type Page } from 'playwright/test';
import type { AcademicIdentityStatus, ResearchIdentityProfile } from '../../lib/api';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const isLocalContactFixture = (url: URL) => url.origin === new URL(baseUrl).origin && url.pathname === '/contact/email' && url.search === '';
const unexpectedWrites = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(unexpectedWrites.get(page) ?? [], 'Navigation must not mutate research/accounts or start tasks').toEqual([]);
});

async function setup(page: Page, authenticated = false, locale = 'zh', options: { contactFixture?: boolean; strictReads?: boolean } = {}) {
  const writes: string[] = [];
  unexpectedWrites.set(page, writes);
  page.on('request', request => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
    const url = new URL(request.url());
    // The original contact case fulfils its two compose-intent POSTs with a local 503 fixture.
    if (options.contactFixture && request.method() === 'POST' && isLocalContactFixture(url)) return;
    writes.push(request.method() + ' ' + url.pathname + url.search);
  });
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseUrl }]);
  await page.route('**/*', route => {
    const request = route.request();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && !(options.contactFixture && request.method() === 'POST' && isLocalContactFixture(new URL(request.url())))) return route.abort('blockedbyclient');
    return route.fallback();
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') throw new Error('Navigation fixture rejected write: ' + route.request().method() + ' ' + url.pathname);
    if (url.pathname === '/api/auth/me' && url.search === '') return route.fulfill(authenticated
      ? { json: { userId: 'navigation-user', displayName: 'Navigation fixture', email: 'nav@example.invalid', status: 'email_verified', level: 'free' } }
      : { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } } });
    if (url.pathname + url.search === '/api/explore?limit=20') return route.fulfill({ json: { items: [], nextCursor: null } });
    if (options.strictReads) throw new Error('Undeclared navigation GET: ' + url.pathname + url.search);
    // No research, account mutations or email are created by these navigation checks.
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'No fixture data' } } });
  });
}

async function expectMobilePaperHeader(page: Page, authenticated = false) {
  const header = page.locator('header[data-shell-header="true"]');
  const navigation = header.locator('[data-hermes-primary-navigation]');
  await expect(header.locator('[data-shell-utility] a[href="/guide"]')).toBeVisible();
  const account = header.locator('[data-account-link]');
  if (authenticated) {
    await expect(account).toBeVisible();
    const caption = account.locator('span:not([aria-hidden])');
    await expect(caption).toBeVisible();
    expect(await account.evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
  } else await expect(header.locator('[data-shell-utility] a[href^="/auth/login"]')).toBeVisible();
  await expect(navigation.locator('ul > li')).toHaveCount(4);
  const layout = await header.evaluate(node => {
    const brand = Array.from(node.querySelectorAll('a[aria-label="OpenScience home"]')).find(link => link.getClientRects().length)!;
    const utilities = node.querySelector('[data-shell-utility]')!;
    const navigation = node.querySelector('[data-hermes-primary-navigation]')!;
    const identity = brand.getBoundingClientRect(), tools = utilities.getBoundingClientRect(), routes = navigation.getBoundingClientRect();
    return {
      identityAndToolsShareRow: identity.top < tools.bottom && tools.top < identity.bottom,
      routesFollowTools: routes.top >= Math.max(identity.bottom, tools.bottom),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(layout).toEqual({ identityAndToolsShareRow: true, routesFollowTools: true, noHorizontalOverflow: true });
  const controls = header.locator('a, button, summary, select');
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    const target = await control.evaluate(node => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      return { largeEnough: element.offsetWidth >= 44 && element.offsetHeight >= 44, fitsHorizontally: box.left >= 0 && box.right <= innerWidth };
    });
    expect(target).toEqual({ largeEnough: true, fitsHorizontally: true });
  }
  // Full translated labels must fit their controls even when they wrap onto several lines.
  for (const text of await header.locator('[data-shell-utility] > div > a, [data-account-link] > span:not([aria-hidden])').all()) {
    await expect(text).toBeVisible();
    expect(await text.evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
  }
}

test('public header orders navigation and About supports keyboard navigation to contextual contact', async ({ page }) => {
  await setup(page, false, 'zh', { contactFixture: true });
  const requests: unknown[] = [];
  await page.route(isLocalContactFixture, route => {
    expect(route.request().method()).toBe('POST');
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/who-we-serve/researchers');
  const navigation = page.locator('header [data-hermes-primary-navigation]');
  await expect(navigation.locator('ul > li')).toHaveText(['服务对象', '功能', '探索', 'About']);
  await expect(page.locator('header').getByRole('link', { name: '上传／创建研究', exact: true })).toHaveAttribute('href', '/guide');
  await expect(page.locator('header').getByRole('link', { name: '登录／注册', exact: true })).toHaveAttribute('href', /\/auth\/login/);
  const about = navigation.getByRole('button', { name: 'About', exact: true });
  await about.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: '联系我们', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('link', { name: '接入 API', exact: true })).toBeFocused();
  await expect(page.getByRole('link', { name: '接入 API', exact: true })).toHaveAttribute('href', '/developers');
  await page.keyboard.press('Escape');
  await expect(about).toBeFocused();
  await about.click();
  await page.getByRole('link', { name: '申请情报分析演示', exact: true }).click();
  await expect(page).toHaveURL(/\/contact\?topic=demo$/);
  await expect(page.getByRole('heading', { name: '申请情报分析演示', exact: true })).toBeVisible();
  expect(await page.content()).not.toContain('chunanqing@opt.ac.cn');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  // Fail retrieval deliberately so QA cannot launch a mail client or send mail.
  await page.getByRole('button', { name: '撰写演示申请', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toBeVisible();
  expect(requests).toEqual([{ intent: 'compose' }]);
  await page.locator('main button').filter({ hasText: '重试' }).click();
  await expect.poll(() => requests.length).toBe(2);
  await page.getByRole('navigation', { name: '联系主题' }).getByRole('link', { name: '反馈问题', exact: true }).click();
  await expect(page.getByRole('heading', { name: '反馈问题', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '撰写问题反馈' })).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
});

test('mobile Features preserves creation mode and upload entry opens the complete guide', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/who-we-serve/researchers');
  await expectMobilePaperHeader(page);
  const services = page.getByRole('button', { name: '服务对象', exact: true });
  await services.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  const features = page.getByRole('button', { name: '功能', exact: true });
  await expect(features).toBeFocused();
  await features.click();
  await expect(page.getByRole('link', { name: '管理我的学术主页', exact: true })).toHaveAttribute('href', '/me/profile');
  await expect(page.getByRole('link', { name: '解析已发表论文', exact: true })).toHaveAttribute('href', '/research-objects/new?type=published');
  await page.getByRole('link', { name: '发布预出版成果', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/, { timeout: 20_000 });
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/research-objects/new?type=preprint');
  await page.locator('header').getByRole('link', { name: '上传／创建研究', exact: true }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('main article')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.getByRole('tab').nth(1).click();
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'tmp/navigation-refresh-mobile.png', fullPage: false });
});

test('375px owner header keeps full labels, account and native language actions reachable', async ({ page }) => {
  await setup(page, true, 'en', { strictReads: true });
  const profile: ResearchIdentityProfile = {
    identities: ['reader'], primaryIdentity: 'reader', disciplines: [], methods: [], topics: [], languages: [],
    profileVersion: 1, acceptedSignals: [], rejectedSignals: [],
  };
  const academic: AcademicIdentityStatus = {
    steps: { registered: true, emailVerified: true, orcidConnected: false, institutionEmailVerified: false },
    credentials: [], scopedRoles: [], capabilities: { orcid: false, institutionEmail: false },
  };
  const reads = new Map<string, unknown>([
    ['/api/research-objects?limit=20', { researchObjects: [] }],
    ['/api/ingestion?actionable=true', { tasks: [] }],
    ['/api/agent/tasks?actionable=false&kind=workspace.guide', { tasks: [] }],
    ['/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal', { tasks: [] }],
    ['/api/research-identity', { profile }],
    ['/api/auth/academic-identity', academic],
  ]);
  await page.route(url => reads.has(url.pathname + url.search), route => {
    if (route.request().method() !== 'GET') throw new Error('Owner navigation fixture rejected write');
    const url = new URL(route.request().url());
    return route.fulfill({ json: reads.get(url.pathname + url.search) });
  });
  await page.route('**/api/research/OSR-2026-000022/v/4', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'No guide publication fixture' } } });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard');
  const header = page.locator('header[data-shell-header="true"]');
  await expect(header.locator('[data-account-link]')).toContainText('My account');
  await expectMobilePaperHeader(page, true);
  await expect(header.locator('a[href="/admin/journals"]')).toHaveCount(0);
  await header.locator('[data-account-link]').click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.locator('[data-profile-research-identity="true"]')).toBeVisible();
  await header.getByLabel('Account tools', { exact: true }).click();
  await header.getByRole('link', { name: 'Research desk', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await header.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh');
  await expect(header.locator('[data-account-link]')).toContainText('个人中心');
  await expectMobilePaperHeader(page, true);
  const navigation = header.locator('[data-hermes-primary-navigation]');
  await expect(navigation.locator('ul > li')).toHaveText(['服务对象', '功能', '探索', 'About']);
  for (const name of ['服务对象', '功能', 'About']) {
    const opener = navigation.getByRole('button', { name, exact: true });
    await opener.focus();
    await opener.press('ArrowDown');
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    const panelId = await opener.getAttribute('aria-controls');
    expect(panelId).not.toBeNull();
    await expect(page.locator('[id="' + panelId + '"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  }
  await header.getByRole('link', { name: '探索', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator('[data-explore-index]')).toBeVisible();
  await header.getByRole('link', { name: '上传／创建研究', exact: true }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expectMobilePaperHeader(page, true);
});

test('dark Landing retains its full brand and existing keyboard menus on phone and desktop', async ({ page }) => {
  await setup(page, false, 'en', { strictReads: true });
  await page.goto('/');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.locator('header[data-shell-header="true"]');
    await expect(header.getByRole('link', { name: 'OpenScience home', exact: true })).toHaveText('OpenScience.');
    await expect(page.locator('[data-landing-module="hero"]')).toBeVisible();
    const about = header.getByRole('button', { name: 'About', exact: true });
    await about.focus();
    await about.press('ArrowDown');
    await expect(page.getByRole('link', { name: 'Contact us', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(about).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('authenticated English header keeps personal center and research desk reachable', async ({ page }) => {
  await setup(page, true, 'en');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/who-we-serve/researchers');
  await expect(page.locator('header [data-account-link]')).toContainText('My account');
  await expect(page.locator('header [data-account-link]')).toHaveAttribute('href', '/me');
  await expect(page.locator('header').getByRole('link', { name: 'Log in / Sign up', exact: true })).toHaveCount(0);
  await page.getByLabel('Account tools', { exact: true }).click();
  await expect(page.locator('header').getByRole('link', { name: 'Research desk', exact: true })).toHaveAttribute('href', '/dashboard');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.getByRole('link', { name: 'Access the API', exact: true }).click();
  await expect(page).toHaveURL(/\/developers$/);
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
