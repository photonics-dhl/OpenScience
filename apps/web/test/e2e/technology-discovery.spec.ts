import { test, expect, type Page } from 'playwright/test';
import { toBrowserSourceRetrieveResult } from '../../../../packages/domain/src/retrieval/browser-result';

const browserDiagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  browserDiagnostics.set(page, messages);
  page.on('pageerror', error => messages.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => messages.push(`requestfailed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.url().includes('/api/auth/me')) messages.push(`session response: ${response.status()}`); });
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('browser-diagnostics', { body: (browserDiagnostics.get(page) ?? []).join('\n'), contentType: 'text/plain' });
});

// The fixture passes through the real producer projection. It intentionally has
// no abstract, performance metrics, researcher contact or commercial assessment.
const sourceResult = toBrowserSourceRetrieveResult({
  sources: [
    { id: 'source-one', provider: 'semantic_scholar', title: 'Optical sensing research', sourceUrl: 'https://example.org/paper-one', identifiers: { doi: '10.1234/optical' }, rights: {} },
    { id: 'source-two', provider: 'semantic_scholar', title: 'Flexible sensor research', sourceUrl: 'https://example.org/paper-two', identifiers: { arxiv: '2302.00001' }, rights: {} },
  ],
  providers: [{ provider: 'semantic_scholar', status: 'succeeded' }],
});

async function setup(page: Page, signedIn = true) {
  const state = { signedIn, authDown: false, authGate: Promise.resolve(), failNextSubmission: false, restoreFailures: 0, empty: false, partial: false, userId: 'discovery-user' };
  const writes: Array<{ key: string | undefined; body: Record<string, unknown> }> = [];
  const task = () => ({
    id: 'discovery-task', sessionId: 'discovery-session', researchObjectId: 'personal-library',
    kind: 'source.retrieve', status: 'succeeded', canRetry: false, retryCount: 0,
    result: state.empty ? { sources: [], providers: sourceResult.providers } : {
      ...sourceResult,
      providers: [...sourceResult.providers, ...(state.partial ? [{ provider: 'tavily', status: 'unavailable', code: 'timeout' }] : [])],
    },
    error: null, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
  });
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') {
      await state.authGate;
      if (state.authDown) return route.fulfill({ status: 500, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Fixture unavailable' } } });
      return route.fulfill(state.signedIn
        ? { json: { userId: state.userId, email: 'fixture@example.invalid', displayName: 'Fixture user', status: 'email_verified', level: 'free' } }
        : { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } } });
    }
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'fixture-csrf' } });
    if (path === '/api/literature/acquisitions') {
      writes.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() as Record<string, unknown> });
      if (state.failNextSubmission) {
        state.failNextSubmission = false;
        return route.fulfill({ status: 500, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Uncertain submission' } } });
      }
      return route.fulfill({ status: 202, json: { researchObject: { id: 'personal-library' }, session: { id: 'discovery-session' }, task: task() } });
    }
    if (path === '/api/agent/tasks/discovery-task') {
      if (state.restoreFailures > 0) {
        state.restoreFailures -= 1;
        return route.fulfill({ status: 500, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary task load failure' } } });
      }
      return route.fulfill({ json: { task: task() } });
    }
    return route.fulfill({ json: { tasks: [], researchObjects: [], notifications: [] } });
  });
  return { state, writes };
}

test('audience navigation and login preserve a query without submitting automatically', async ({ page }) => {
  const { state, writes } = await setup(page, false);
  await page.goto('/who-we-serve/researchers');
  await page.getByRole('button', { name: 'Who we serve', exact: true }).click();
  await page.getByRole('link', { name: 'Industry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Industry', exact: true })).toBeVisible();
  await page.locator('#technology-query').fill('A low-temperature optical sensor');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page).toHaveURL(/auth\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/who-we-serve/industry');
  expect(page.url()).not.toContain('low-temperature');
  expect(writes).toHaveLength(0);
  state.signedIn = true;
  await page.goto('/who-we-serve/industry');
  await expect(page.locator('#technology-query')).toHaveValue('A low-temperature optical sensor');
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Who we serve', exact: true }).click();
  await page.getByRole('link', { name: 'Investors', exact: true }).click();
  await expect(page.locator('#technology-query')).toHaveAttribute('placeholder', 'search any potential technology with AI');
  await expect(page.locator('#technology-query')).toHaveValue('');
});

test('real producer-shaped records support comparison, export and a contextual email draft', async ({ page }) => {
  const { writes } = await setup(page);
  const recipientRequests: unknown[] = [];
  await page.route('**/contact/email', route => {
    recipientRequests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });
  await page.goto('/who-we-serve/investors');
  await page.locator('#technology-query').fill('10.1234/optical');
  await page.locator('#discovery-brief').fill('Evaluate low-temperature integration and pilot evidence.');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optical sensing research', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toEqual({ query: '10.1234/optical', target: { kind: 'personal' } });
  await page.getByRole('button', { name: 'Shortlist', exact: true }).first().click();
  await page.getByRole('button', { name: 'Shortlist', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Compare source records', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open source', exact: true }).first()).toHaveAttribute('href', 'https://example.org/paper-one');
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export brief & shortlist', exact: true }).click();
  expect((await exportDownload).suggestedFilename()).toContain('shortlist');
  await page.getByRole('button', { name: 'Get in touch', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Fixture Researcher');
  await page.getByRole('textbox', { name: 'Organization', exact: true }).fill('Fixture Lab');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.invalid');
  await page.getByRole('textbox', { name: 'What do you need to discuss?', exact: true }).fill('Please discuss A&B, not a new recipient.');
  const draft = await page.locator('main pre').textContent();
  expect(draft).toContain('Evaluate low-temperature integration');
  expect(draft).toContain('https://example.org/paper-one');
  expect(draft).toContain('A&B');
  expect(await page.content()).not.toContain('chunanqing@opt.ac.cn');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(recipientRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Open email draft', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('could not be opened');
  expect(recipientRequests).toEqual([{ intent: 'compose' }]);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Fixture Researcher');
  await expect(page.getByRole('textbox', { name: 'What do you need to discuss?', exact: true })).toHaveValue('Please discuss A&B, not a new recipient.');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(2);
});

test('ambiguous submissions reuse their idempotency key and healthy empty results are not outages', async ({ page }) => {
  const { state, writes } = await setup(page);
  state.failNextSubmission = true;
  state.empty = true;
  await page.goto('/who-we-serve/industry');
  await page.locator('#technology-query').fill('optical sensing');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('could not be completed');
  await expect(page.locator('#technology-query')).toHaveValue('optical sensing');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page.getByText('No source metadata was returned.', { exact: false })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]?.key).toBeTruthy();
  expect(writes[1]?.key).toBe(writes[0]?.key);
  await expect(page.getByText('reported a service problem', { exact: false })).toHaveCount(0);
});

test('mobile unavailable state retains editable draft and contact form stays usable', async ({ page }) => {
  const { state, writes } = await setup(page);
  state.authDown = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/who-we-serve/investors');
  await expect(page.getByRole('button', { name: 'Check sign-in again' })).toBeVisible();
  await page.locator('#technology-query').fill('A mobile test need');
  await page.getByRole('button', { name: 'Check sign-in again' }).click();
  await expect(page.locator('#technology-query')).toHaveValue('A mobile test need');
  await expect(page.getByRole('button', { name: 'Search sources', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Get in touch', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export request', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('valid email');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('main').count()).toBe(1);
  await page.screenshot({ path: 'tmp/investors-mobile.png', fullPage: true });
});

test('an account change clears the previous contact and research state', async ({ page }) => {
  const { state } = await setup(page);
  await page.goto('/who-we-serve/industry');
  await page.locator('#technology-query').fill('Private research for account A');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optical sensing research' })).toBeVisible();
  await page.getByRole('button', { name: 'Get in touch', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Account A private contact');
  state.userId = 'different-user';
  await page.evaluate(() => window.dispatchEvent(new Event('openscience-session-changed')));
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Optical sensing research' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Get in touch', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
  await expect(page.locator('#technology-query')).toHaveValue('');
});

test('a slow sign-in check gates editing until the draft scope is ready', async ({ page }) => {
  const { state, writes } = await setup(page);
  let resolveAuth!: () => void;
  state.authGate = new Promise<void>(resolve => { resolveAuth = resolve; });
  await page.goto('/who-we-serve/industry');
  await expect(page.locator('#technology-query')).toBeDisabled();
  await expect(page.locator('#discovery-brief')).toBeDisabled();
  resolveAuth();
  await expect(page.locator('#technology-query')).toBeEnabled();
  await page.locator('#technology-query').fill('Keep this query while checking identity');
  await page.locator('#discovery-brief').fill('Keep these application constraints');
  await expect(page.getByRole('button', { name: 'Search sources', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator('#technology-query')).toBeEnabled();
  await expect(page.locator('#technology-query')).toHaveValue('Keep this query while checking identity');
  await expect(page.locator('#discovery-brief')).toHaveValue('Keep these application constraints');
  expect(writes).toHaveLength(0);
});

test('partial source availability and exact-task recovery remain actionable', async ({ page }) => {
  const { state, writes } = await setup(page);
  state.partial = true;
  await page.goto('/who-we-serve/industry');
  await page.locator('#technology-query').fill('A technical search');
  await page.getByRole('button', { name: 'Search sources', exact: true }).click();
  await expect(page.getByText('Some source providers were unavailable.', { exact: false })).toBeVisible();
  state.restoreFailures = 1;
  await page.reload();
  await expect(page.getByText('The saved task could not be loaded.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry loading task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optical sensing research', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'tmp/industry-results-desktop.png', fullPage: true });
});
