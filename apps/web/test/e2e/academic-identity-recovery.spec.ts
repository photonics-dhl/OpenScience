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
  await page.goto('/settings');
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
  await page.goto('/settings');
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
  await page.goto('/settings');
  const panel = page.locator('[data-academic-identity]');
  await expect(panel.getByRole('button', { name: 'ORCID is not configured' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Send verification code', exact: true })).toBeDisabled();
});
