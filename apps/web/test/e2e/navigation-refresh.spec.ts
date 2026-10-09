import { test, expect, type Page } from 'playwright/test';

async function setup(page: Page, authenticated = false, locale = 'zh') {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname === '/api/auth/me') return route.fulfill(authenticated
      ? { json: { userId: 'navigation-user', displayName: 'Navigation fixture', email: 'nav@example.invalid', status: 'email_verified', level: 'free' } }
      : { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } } });
    // No research, account mutations or email are created by these navigation checks.
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'No fixture data' } } });
  });
}

test('public header orders navigation and About supports keyboard navigation to contextual contact', async ({ page }) => {
  await setup(page);
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
  const mail = new URL((await page.getByRole('link', { name: '撰写演示申请', exact: true }).getAttribute('href'))!);
  expect(mail.pathname).toBe('chunanqing@opt.ac.cn');
  expect(mail.searchParams.get('subject')).toContain('情报分析演示申请');
  expect(mail.searchParams.get('body')).toContain('希望回答的问题');
  // Inspect the draft link without opening a mail client or sending a message.
  await page.getByRole('navigation', { name: '联系主题' }).getByRole('link', { name: '反馈问题', exact: true }).click();
  await expect(page.getByRole('heading', { name: '反馈问题', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '撰写问题反馈' })).toHaveAttribute('href', /subject=/);
});

test('mobile Features preserves creation mode and upload entry opens the complete guide', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/who-we-serve/researchers');
  const services = page.getByRole('button', { name: '服务对象', exact: true });
  await services.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  const features = page.getByRole('button', { name: '功能', exact: true });
  await expect(features).toBeFocused();
  await features.click();
  await expect(page.getByRole('link', { name: '管理我的学术主页', exact: true })).toHaveAttribute('href', '/me');
  await expect(page.getByRole('link', { name: '解析已发表论文', exact: true })).toHaveAttribute('href', '/research-objects/new?type=published');
  await page.getByRole('link', { name: '发布预出版成果', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
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
