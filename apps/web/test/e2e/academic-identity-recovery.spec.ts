import { expect, test, type Page } from 'playwright/test';

const identity = {
  steps: { registered: true, emailVerified: true, orcidConnected: false, institutionEmailVerified: false },
  credentials: [], scopedRoles: [], capabilities: { orcid: true, institutionEmail: true },
};

async function prepare(page: Page) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
      '/api/auth/me': { userId: 'identity-test', email: 'test@example.invalid', displayName: 'Identity Test', status: 'email_verified', level: 'free' },
      '/api/research-identity': { profile: { identities: [], primaryIdentity: null, disciplines: [], methods: [], topics: [], languages: [], acceptedSignals: [], rejectedSignals: [], profileVersion: 1 } },
      '/api/reading-preferences': { evidenceDefaultCollapsed: false, version: 1 },
      '/api/auth/academic-identity': identity,
      '/api/research-objects': { researchObjects: [{ id: 'my-project', publicId: null, title: 'Private test project', version: 1, status: 'draft' }] },
      '/api/csrf-token': { csrfToken: 'fixture-only' },
    };
    await route.fulfill({ json: bodies[path] ?? {} });
  });
}

test('loading failure stays unknown, blocks writes and can be retried', async ({ page }) => {
  await prepare(page);
  let attempts = 0;
  await page.route('**/api/auth/academic-identity', (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'private internal detail' } } })
      : route.fulfill({ json: identity });
  });
  await page.goto('/me');
  const panel = page.locator('[data-academic-identity]');
  await expect(panel.getByRole('alert')).toContainText('does not mean verification was lost');
  await expect(panel).not.toContainText('private internal detail');
  await expect(panel.getByRole('button', { name: 'Connect ORCID', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Reload identity status' }).click();
  await expect(panel.getByRole('button', { name: 'Connect ORCID', exact: true })).toBeEnabled();
});

test('institution challenge locks its email and offers recovery without credential loss', async ({ page }) => {
  await prepare(page);
  const sent: string[] = [];
  await page.route('**/api/auth/institution-email/request', async (route) => {
    sent.push(route.request().postDataJSON().email);
    await route.fulfill({ json: { ok: true, organization: { name: 'Test Institute', rorId: null, domain: 'example.invalid', source: 'configured_override' } } });
  });
  await page.route('**/api/auth/institution-email/verify', (route) => route.fulfill({ status: 400, json: { error: { code: 'CODE_INVALID', message: 'internal' } } }));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/me');
  const panel = page.locator('[data-academic-identity]');
  const email = panel.getByLabel('Institutional email address', { exact: true });
  await email.fill('test@example.invalid');
  await panel.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(email).toBeDisabled();
  await expect(panel).toContainText('Test Institute (not yet verified)');
  await panel.getByLabel('Six-digit verification code').fill('123456');
  await panel.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Verification has not been confirmed');
  await panel.getByRole('button', { name: 'Resend verification code' }).click();
  await expect(panel.getByLabel('Six-digit verification code')).toHaveValue('');
  await panel.getByRole('button', { name: 'Change verification email' }).click();
  await expect(email).toBeEnabled();
  await expect(panel.getByLabel('Six-digit verification code')).toHaveCount(0);
  expect(sent).toEqual(['test@example.invalid', 'test@example.invalid']);
});

test('unavailable integrations disable both operations', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/auth/academic-identity', (route) => route.fulfill({ json: { ...identity, capabilities: { orcid: false, institutionEmail: false } } }));
  await page.goto('/me');
  const panel = page.locator('[data-academic-identity]');
  await expect(panel.getByRole('button', { name: 'ORCID is not configured' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Send verification code', exact: true })).toBeDisabled();
});

test('account link supports keyboard and separates private profile from preferences', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Website preferences', exact: true })).toBeVisible();
  await expect(page.locator('[data-academic-identity]')).toHaveCount(0);
  await expect(page.locator('[data-profile-research-identity]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/settings"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-account-link]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.locator('[data-account-link]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('nav a[href="/settings"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-profile-research-identity]')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('test@example.invalid');
  await expect(page.getByLabel('Hermes motion preference')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/profile-320.png', fullPage: true });
  await page.locator('nav a[href="/settings"]').click();
  await expect(page.getByLabel('Hermes motion preference')).toBeVisible();
  await page.getByLabel('Hermes motion preference').selectOption('reduced');
  await page.reload();
  await expect(page.getByLabel('Hermes motion preference')).toHaveValue('reduced');
});

test('legacy research profile link opens its corresponding profile section', async ({ page }) => {
  await prepare(page);
  await page.goto('/settings#research-profile');
  await expect(page).toHaveURL(/\/me#research-profile$/);
  await expect(page.locator('#research-profile')).toBeVisible();
});

test('legacy ORCID return opens profile without claiming verification', async ({ page }) => {
  await prepare(page);
  await page.goto('/settings?identity=orcid-connected');
  await expect(page).toHaveURL(/\/me#identity$/);
  await expect(page.getByRole('button', { name: 'Connect ORCID', exact: true })).toBeEnabled();
  await page.goto('/settings?identityError=ORCID_AUTHORIZATION_FAILED');
  await expect(page).toHaveURL(/\/me\?identityError=retry#identity$/);
  await expect(page.getByText(/ORCID authorization did not complete/)).toBeVisible();
});

test('signed-out visitors cannot see profile and return to it after login', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in' } } }));
  await page.goto('/me');
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=%2Fme$/);
  await expect(page.locator('[data-academic-identity]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('test@example.invalid');
});

test('ORCID start requests the new profile return target', async ({ page }) => {
  await prepare(page);
  let returnTo = '';
  await page.route('**/api/auth/orcid/start', async (route) => {
    returnTo = route.request().postDataJSON().returnTo;
    await route.fulfill({ json: { authorizationUrl: `${process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010'}/me?identity=orcid-connected` } });
  });
  await page.goto('/me');
  await page.getByRole('button', { name: 'Connect ORCID', exact: true }).click();
  await expect(page).toHaveURL(/\/me\?identity=orcid-connected$/);
  expect(returnTo).toBe('/me');
});


test('profile uses the desktop canvas and keeps long project lists expandable', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 2048, height: 1100 });
  await page.route('**/api/research-objects?*', route => route.fulfill({ json: { researchObjects: Array.from({ length: 12 }, (_, i) => ({ id: 'project-' + i, publicId: null, title: 'Research project ' + i + ' — ' + 'Long scientific title '.repeat(7), version: 1, status: 'draft' })) } }));
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  const header = await page.locator('main > header').boundingBox();
  expect(header!.width).toBeGreaterThan(1100);
  expect(Math.abs(header!.x - (2048 - header!.x - header!.width))).toBeLessThan(8);
  await expect(page.locator('[data-profile-projects] li')).toHaveCount(6);
  await page.getByRole('button', { name: 'Show all projects' }).click();
  await expect(page.locator('[data-profile-projects] li')).toHaveCount(12);
  await page.getByRole('button', { name: 'Show fewer' }).click();
  await expect(page.locator('[data-profile-projects] li')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/profile-mobile.png', fullPage: true });
});
