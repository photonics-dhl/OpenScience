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

  await page.getByLabel(/verification code/i).focus();
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
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
    let uploaded = 0;
    let committedArtifacts: unknown[] = [];
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
    await page.route('**/api/artifacts/upload', async (route) => {
      uploaded += 1;
      const name = uploaded === 1 ? 'paper.md' : 'figure.png';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ artifact: { artifactId: `artifact-${uploaded}`, logicalPath: name } }),
      });
    });
    await page.route('**/api/research-objects/ro-created/commits', async (route) => {
      committedArtifacts = (await route.request().postDataJSON()).artifacts;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ commit: { commitId: 'commit-1' } }) });
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
    await page.getByLabel(/source materials/i).setInputFiles([
      { name: 'paper.md', mimeType: 'text/markdown', buffer: Buffer.from('# evidence') },
      { name: 'figure.png', mimeType: 'image/png', buffer: Buffer.from('png') },
    ]);
    await page.getByRole('button', { name: /create research object/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/research-objects/ro-created/edit`);
    expect(uploaded).toBe(2);
    expect(committedArtifacts).toEqual([
      { logicalPath: 'paper.md', artifactId: 'artifact-1' },
      { logicalPath: 'figure.png', artifactId: 'artifact-2' },
    ]);
  });
}
