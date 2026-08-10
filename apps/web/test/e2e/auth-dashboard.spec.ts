import { expect, test, type Page } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

async function mockAuthenticatedUser(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'user-1',
        email: 'researcher@example.com',
        displayName: 'Ada Researcher',
        status: 'email_verified',
        level: 'free',
      }),
    });
  });
  await page.route('**/api/research-objects?limit=20', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjects: [] }) });
  });
  await page.route('**/api/agent/tasks?actionable=true', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) });
  });
  await page.route('**/api/workspaces', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ workspaces: [{ id: 'workspace-1', name: 'Personal workspace', type: 'personal', role: 'owner' }] }) });
  });
}

test('registration is keyboard-operable and restores the intended return path', async ({ page }) => {
  await page.route('**/api/auth/request-signup-code', async (route) => {
    expect(await route.request().postDataJSON()).toEqual({ email: 'researcher@example.com' });
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/auth/confirm-signup', async (route) => {
    expect(await route.request().postDataJSON()).toEqual({
      email: 'researcher@example.com',
      code: '123456',
      password: 'Method123',
      displayName: 'Ada Researcher',
    });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ userId: 'user-1', status: 'email_verified' }),
    });
  });
  await mockAuthenticatedUser(page);

  await page.goto(`${baseUrl}/auth/register?returnTo=%2Fdashboard`);
  await expect(page.getByLabel(/invite|invitation/i)).toHaveCount(0);

  await page.getByLabel(/display name/i).focus();
  await page.keyboard.type('Ada Researcher');
  await page.keyboard.press('Tab');
  await page.keyboard.type('researcher@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Method123');
  await page.keyboard.press('Enter');

  const verificationCode = page.getByLabel(/verification code/i);
  await expect(verificationCode).toBeFocused();
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
});

test('signup request failure remains visible and can be retried without losing the form', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/auth/request-signup-code', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'MAIL_UNAVAILABLE', message: 'Mail delivery is temporarily unavailable' } }),
      });
      return;
    }
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`${baseUrl}/auth/register?returnTo=%2Fdashboard`);
  await page.getByLabel(/display name/i).fill('Ada Researcher');
  await page.getByLabel(/^email$/i).fill('researcher@example.com');
  await page.getByLabel(/^password$/i).fill('Method123');
  const submit = page.getByRole('button', { name: /send verification code/i });
  await submit.click();
  await expect(page.locator('[data-auth-error-retryable="true"] [role="alert"]')).toContainText('Mail delivery is temporarily unavailable');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByLabel(/verification code/i)).toBeFocused();
  expect(attempts).toBe(2);
});

test('unauthenticated dashboard redirects safely to login', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SESSION_INVALID', message: 'Not signed in' } }),
    });
  });

  await page.goto(`${baseUrl}/dashboard`);
  await expect(page).toHaveURL(`${baseUrl}/auth/login?returnTo=%2Fdashboard`);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]) {
  test(`dashboard navigation remains complete at ${viewport.name} width`, async ({ page }) => {
    let uploadedBody = '';
    await page.setViewportSize(viewport);
    await mockAuthenticatedUser(page);
    await page.route('**/api/csrf-token', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) });
    });
    await page.route('**/api/research-objects', async (route) => {
      expect(await route.request().postDataJSON()).toEqual({ workspaceId: 'workspace-1', title: 'Imported study' });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ researchObject: { id: 'ro-created', workspaceId: 'workspace-1', version: 1 } }),
      });
    });
    const tasks = [
      { id: 'task-paper', artifactId: 'artifact-paper', logicalPath: 'paper.md', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent-paper' },
      { id: 'task-figure', artifactId: 'artifact-figure', logicalPath: 'figure.png', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent-figure' },
      { id: 'task-data', artifactId: 'artifact-data', logicalPath: 'measurements.csv', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent-data' },
      { id: 'task-code', artifactId: 'artifact-code', logicalPath: 'analysis.py', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent-code' },
    ];
    await page.route('**/api/research-objects/ro-created/ingest', async (route) => {
      uploadedBody = route.request().postDataBuffer()?.toString('utf8') ?? '';
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ batchId: 'batch-1', researchObjectId: 'ro-created', artifacts: tasks.map(({ artifactId, logicalPath }) => ({ artifactId, logicalPath })), tasks }),
      });
    });
    await page.route('**/api/ingestion/batch-1', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ batchId: 'batch-1', researchObjectId: 'ro-created', tasks }) });
    });
    await page.goto(`${baseUrl}/dashboard`);

    await expect(page.getByRole('heading', { name: /research dashboard/i })).toBeVisible();
    await expect(page.locator('[data-action-priority="primary"]').filter({ hasText: /upload materials/i })).toHaveAttribute(
      'href',
      '/research-objects/new?mode=import',
    );
    await expect(page.getByRole('link', { name: /create blank ro/i })).toHaveAttribute(
      'href',
      '/research-objects/new?mode=blank',
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.locator('[data-action-priority="primary"]').filter({ hasText: /upload materials/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/research-objects/new?mode=import`);
    await expect(page.getByRole('heading', { name: /create a research object/i })).toBeVisible();
    await page.getByLabel(/research title/i).fill('Imported study');
    await page.getByLabel(/choose files/i).setInputFiles([
      { name: 'paper.md', mimeType: 'text/markdown', buffer: Buffer.from('# evidence') },
      { name: 'figure.png', mimeType: 'image/png', buffer: Buffer.from('png') },
      { name: 'measurements.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y\n1,2') },
      { name: 'analysis.py', mimeType: 'text/x-python', buffer: Buffer.from('print(1)') },
    ]);
    await page.getByRole('button', { name: /create research object/i }).click();
    await expect(page.getByText(/evidence is ready for review/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /paper.md/i })).toHaveAttribute('href', '/research-objects/ro-created/hermes?task=task-paper');
    for (const filename of ['paper.md', 'figure.png', 'measurements.csv', 'analysis.py']) expect(uploadedBody).toContain(filename);
    const finalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(finalOverflow).toBe(false);
  });
}

test('a server-blocked material remains visible without a retry action', async ({ page }) => {
  await mockAuthenticatedUser(page);
  await page.route('**/api/csrf-token', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) });
  });
  await page.route('**/api/research-objects', async (route) => {
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ researchObject: { id: 'ro-blocked', workspaceId: 'workspace-1', version: 1 } }) });
  });
  await page.route('**/api/research-objects/ro-blocked/ingest', async (route) => {
    await route.fulfill({ status: 415, contentType: 'application/json', body: JSON.stringify({ error: { code: 'MALICIOUS_FILE', message: 'Security scan blocked this file' } }) });
  });

  await page.goto(`${baseUrl}/research-objects/new?mode=import`);
  await page.getByLabel(/research title/i).fill('Blocked evidence study');
  await page.getByLabel(/choose files/i).setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><script /></svg>') });
  await page.getByRole('button', { name: /create research object/i }).click();
  await expect(page.getByText('Security scan blocked this file').first()).toBeVisible();
  await expect(page.getByText(/KB · Blocked/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^retry$/i })).toHaveCount(0);
});
