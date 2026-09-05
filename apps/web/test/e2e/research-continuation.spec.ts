import { expect, test, type Page } from 'playwright/test';

const ro = { id: 'journey-ro', workspaceId: 'workspace-journey', publicId: 'OSR-JOURNEY', title: 'Research continuation', version: 1, status: 'draft', visibility: 'private' };
const core = { schemaVersion: '0.1.0', problem: 'Question', insight: 'Finding', method: 'Measurement', results: 'Result', limitations: 'Limits', reproducibility: 'Data' };
const task = { id: 'journey-task', researchObjectId: ro.id, researchTitle: ro.title, logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, artifactId: 'artifact-journey', agentTaskId: null };

async function fixtures(page: Page, tasks = [task]) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/auth/me') body = { userId: 'user-journey', email: 'test@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' };
    else if (path === '/api/research-objects') body = { researchObjects: [ro] };
    else if (path === '/api/ingestion') body = { tasks };
    else if (path === '/api/ingestion/tasks/journey-task') body = { researchObjectId: ro.id, batchId: 'batch', version: 1, task: { ...task, result: { core } } };
    else if (path === `/api/research-objects/${ro.id}`) body = { researchObject: { ...ro, sdf: { core, nodes: [] } } };
    else if (path.endsWith('/versions')) body = { versions: [] };
    else if (path.includes('tasks')) body = { tasks: [] };
    else if (path === '/api/workspaces') body = { workspaces: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('dashboard primary continuation opens the actual pending review', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard');
  const continuation = page.locator('[data-continuation-priority="primary"]');
  await expect(continuation.getByRole('link')).toHaveAttribute('href', '/research-objects/journey-ro/hermes?task=journey-task');
  await continuation.getByRole('link').click();
  await expect(page).toHaveURL(/hermes\?task=journey-task$/);
  await expect(page.getByText('paper.pdf', { exact: true })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('Question');
});

test('direct Hermes entry offers current RO tasks rather than a missing parameter error', async ({ page }) => {
  await fixtures(page);
  await page.goto('/research-objects/journey-ro/hermes');
  const row = page.locator('li').filter({ hasText: 'paper.pdf' });
  await expect(row.getByRole('link')).toHaveAttribute('href', '/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});

test('a foreign task never exposes a proposal and can return to the current RO', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: 'foreign-ro', version: 1, task: { ...task, result: { core } } }) }));
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('main').getByRole('status')).toHaveCount(0);
  await expect(page.locator('main a[href="/research-objects/journey-ro/hermes"]').last()).toBeVisible();
});

test('failed loading can retry and confirmed results continue into the RO', async ({ page }) => {
  await fixtures(page);
  let failed = true;
  await page.route('**/api/ingestion/tasks/journey-task', async route => {
    if (failed) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Temporarily unavailable' } }) });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: ro.id, version: 1, task: { ...task, state: 'confirmed', result: { core } } }) });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toHaveText('Temporarily unavailable');
  await expect(page.locator('main').getByRole('status')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('textarea[readonly]')).toHaveCount(6);
  await expect(page.locator('main a[href="/research-objects/journey-ro/edit"]').last()).toBeVisible();
  await expect(page.locator('main a[href="/research-objects/journey-ro/versions"]').last()).toBeVisible();
});

test('empty Hermes entry keeps editing and source material reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, []);
  await page.goto('/research-objects/journey-ro/hermes');
  await expect(page.locator('main a[href="/research-objects/journey-ro/edit"]').last()).toBeVisible();
  await expect(page.locator('main a[href="/research-objects/journey-ro/files"]').last()).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/hermes-empty-mobile.png', fullPage: true });
});

test('confirmation writes only on request and keeps a route back into the research', async ({ page }) => {
  await fixtures(page);
  let writes = 0;
  await page.route('**/api/csrf-token', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) }));
  await page.route('**/api/ingestion/journey-task/confirm', async route => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ version: 1, core: { ...core, problem: 'Revised question' } });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...task, state: 'confirmed' }, sdf: { core: { ...core, problem: 'Revised question' } } }) });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await page.locator('textarea').first().fill('Revised question');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Confirm and create version', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled();
  expect(writes).toBe(1);
  await expect(page.locator('textarea[readonly]')).toHaveCount(6);
  await expect(page.getByRole('link', { name: 'Continue editing', exact: true })).toHaveAttribute('href', '/research-objects/journey-ro/edit');
});

test('the task hub opens the existing assistant in the same research context', async ({ page }) => {
  await fixtures(page, []);
  await page.goto('/research-objects/journey-ro/hermes');
  await page.getByRole('button', { name: 'Ask Hermes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
