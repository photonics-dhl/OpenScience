import { expect, test, type Page } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

async function mockAuthenticatedUser(page: Page, options: {
  researchObjects?: unknown[];
  tasks?: unknown[];
} = {}) {
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
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjects: options.researchObjects ?? [] }) });
  });
  await page.route('**/api/ingestion?actionable=true', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: options.tasks ?? [] }) });
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

test('dashboard binds Hermes portrait and queue to the same real approval task', async ({ page }) => {
  const task = {
    id: 'ingestion-review-1',
    researchObjectId: 'ro-1',
    researchTitle: 'Transient-state spectroscopy',
    logicalPath: 'paper.pdf',
    state: 'needs_review',
    retryCount: 0,
    error: null,
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthenticatedUser(page, {
    researchObjects: [{ id: 'ro-1', publicId: 'OSR-2026-000123', title: task.researchTitle, version: 3, status: 'draft' }],
    tasks: [task],
  });

  await page.goto(`${baseUrl}/dashboard`);
  const href = `/research-objects/${task.researchObjectId}/hermes?task=${task.id}`;
  await expect(page.locator(`[href="${href}"]`)).toHaveCount(2);
  await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
  await expect(page.locator('[data-live2d-instance]')).toHaveCount(0);
  await expect(page.locator('[data-hermes-fallback="static"]')).toHaveAttribute('data-motion', 'still');
  await expect(page.locator('.rounded-card')).toHaveCount(0);
  await page.screenshot({ path: 'test/visual/out/dashboard-approval-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test/visual/out/dashboard-approval-mobile.png', fullPage: true });
});

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

test('personal literature acquisition recovers a running server task after reload without a second POST', async ({ page }) => {
  let serverHasTask = false;
  let submissions = 0;
  await mockAuthenticatedUser(page);
  await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) }));
  const runningTask = { id: 'literature-reload', sessionId: 'session-1', kind: 'source.retrieve', status: 'running', progress: 40, retryCount: 0, canRetry: false, executionAttempt: 1, result: null, error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' };
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: serverHasTask ? [runningTask] : [] }) });
  });
  await page.route('**/api/literature/acquisitions', async (route) => {
    submissions += 1;
    serverHasTask = true;
    expect(await route.request().postDataJSON()).toEqual({ query: 'Reload recovery', target: { kind: 'personal' } });
    await route.abort('failed');
  });
  await page.route('**/api/agent/tasks/literature-reload', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: runningTask }) }));

  await page.goto(`${baseUrl}/dashboard`);
  await page.getByLabel(/title, doi, or arxiv id/i).fill('Reload recovery');
  await page.getByRole('button', { name: /search metadata/i }).click();
  await expect.poll(() => submissions).toBe(1);
  await page.reload();
  await expect(page.getByText(/retrieving source/i)).toBeVisible();
  expect(submissions).toBe(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('openscience:literature:')))).toEqual([]);
});

test('a permanent 401 while polling routes the dashboard through established login recovery', async ({ page }) => {
  const runningTask = { id: 'literature-auth-lost', sessionId: 'session-1', kind: 'source.retrieve', status: 'running', progress: 40, retryCount: 0, canRetry: false, executionAttempt: 1, result: null, error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' };
  await mockAuthenticatedUser(page);
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [runningTask] }) }));
  await page.route('**/api/agent/tasks/literature-auth-lost', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SESSION_INVALID', message: 'signed out' } }) }));

  await page.goto(`${baseUrl}/dashboard`);
  await expect(page).toHaveURL(`${baseUrl}/auth/login?returnTo=%2Fdashboard`, { timeout: 5_000 });
});

for (const status of [403, 404]) {
  test(`a permanent ${status} while polling leaves a visible terminal recovery and an enabled search`, async ({ page }) => {
    const runningTask = { id: `literature-gone-${status}`, sessionId: 'session-1', kind: 'source.retrieve', status: 'running', progress: 40, retryCount: 0, canRetry: false, executionAttempt: 1, result: null, error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' };
    let polls = 0;
    await mockAuthenticatedUser(page);
    await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [runningTask] }) }));
    await page.route(`**/api/agent/tasks/literature-gone-${status}`, (route) => {
      polls += 1;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TASK_UNAVAILABLE', message: 'internal detail' } }) });
    });

    await page.goto(`${baseUrl}/dashboard`);
    await expect(page.getByText(/task could no longer be recovered/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel(/title, doi, or arxiv id/i)).toBeEnabled();
    await page.waitForTimeout(1_500);
    expect(polls).toBe(1);
  });
}

test('a failed source retrieval retries the same task without a new acquisition POST', async ({ page }) => {
  let retries = 0;
  let submissions = 0;
  const failedTask = { id: 'literature-failed', sessionId: 'session-1', kind: 'source.retrieve', status: 'failed', progress: 30, retryCount: 0, canRetry: true, executionAttempt: 1, result: null, error: '[retryable] upstream timeout', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' };
  const pendingTask = { ...failedTask, status: 'pending', progress: 0, retryCount: 1, canRetry: false, result: null, error: null };
  const succeededTask = { ...pendingTask, status: 'succeeded', progress: 100, result: { sources: [] } };
  await mockAuthenticatedUser(page);
  await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) }));
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [failedTask] }) }));
  await page.route('**/api/literature/acquisitions', (route) => {
    submissions += 1;
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNEXPECTED', message: 'unexpected acquisition' } }) });
  });
  await page.route('**/api/agent/tasks/literature-failed/retry', (route) => {
    retries += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: pendingTask }) });
  });
  await page.route('**/api/agent/tasks/literature-failed', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: succeededTask }) }));

  await page.goto(`${baseUrl}/dashboard`);
  await page.getByRole('button', { name: /try again/i }).press('Enter');
  await expect(page.getByText(/source ready/i)).toBeVisible({ timeout: 4_000 });
  expect(retries).toBe(1);
  expect(submissions).toBe(0);
});

test('concurrent retry activation sends one POST and reconciles a 409 through authoritative GET', async ({ page }) => {
  let retryRequests = 0;
  let taskReads = 0;
  const failedTask = { id: 'literature-concurrent', sessionId: 'session-1', kind: 'source.retrieve', status: 'failed', progress: 30, retryCount: 0, canRetry: true, executionAttempt: 1, result: null, error: '[retryable] upstream timeout', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' };
  const pendingTask = { ...failedTask, status: 'pending', progress: 0, retryCount: 1, canRetry: false, result: null, error: null, updatedAt: '2026-08-30T00:02:00.000Z' };
  await mockAuthenticatedUser(page);
  await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) }));
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [failedTask] }) }));
  await page.route('**/api/agent/tasks/literature-concurrent/retry', async (route) => {
    retryRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ILLEGAL_TRANSITION', message: 'already retried elsewhere' } }) });
  });
  await page.route('**/api/agent/tasks/literature-concurrent', (route) => {
    taskReads += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: pendingTask }) });
  });

  await page.goto(`${baseUrl}/dashboard`);
  const retry = page.getByRole('button', { name: /try again/i });
  await retry.click();
  expect(await retry.isDisabled()).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/waiting in queue/i)).toBeVisible({ timeout: 4_000 });
  expect(retryRequests).toBe(1);
  expect(taskReads).toBe(1);
  await expect(page.getByText(/source request could not be completed/i)).toHaveCount(0);
});

test('metadata selection starts a second acquisition and finishes with one temporary download', async ({ page }) => {
  let submissions = 0;
  let metadataPolls = 0;
  let downloadLinks = 0;
  let finalDownloads = 0;
  const callerKeys: string[] = [];
  let releaseFullText: (() => void) | undefined;
  await mockAuthenticatedUser(page);
  await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) }));
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) }));
  await page.route('**/api/literature/acquisitions', async (route) => {
    submissions += 1;
    callerKeys.push(route.request().headers()['idempotency-key'] ?? '');
    if (submissions === 1) {
      expect(await route.request().postDataJSON()).toEqual({ query: 'Ultrafast response', target: { kind: 'personal' } });
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ task: { id: 'literature-metadata', sessionId: 'session-1', kind: 'source.retrieve', status: 'pending', progress: 0, retryCount: 0, canRetry: false, executionAttempt: 0, result: null, error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z' } }) });
    }
    expect(await route.request().postDataJSON()).toEqual({ query: 'Ultrafast response', identifier: '10.1038/nature12373', target: { kind: 'personal' } });
    await new Promise<void>((resolve) => { releaseFullText = resolve; });
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ task: { id: 'literature-fulltext', sessionId: 'session-1', kind: 'source.retrieve', status: 'pending', progress: 0, retryCount: 0, canRetry: false, executionAttempt: 0, result: null, error: null, createdAt: '2026-08-30T00:02:00.000Z', updatedAt: '2026-08-30T00:02:00.000Z' } }) });
  });
  await page.route('**/api/agent/tasks/literature-metadata', (route) => {
    metadataPolls += 1;
    if (metadataPolls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEMPORARY', message: 'temporary' } }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { id: 'literature-metadata', sessionId: 'session-1', kind: 'source.retrieve', status: 'succeeded', progress: 100, retryCount: 0, canRetry: false, executionAttempt: 1, result: { sources: [{ id: 'source-1', title: 'Ultrafast response', sourceUrl: 'https://example.test/source', identifiers: { doi: '10.1038/nature12373' }, rights: {} }], providers: [] }, error: null, createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z' } }) });
  });
  await page.route('**/api/agent/tasks/literature-fulltext', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { id: 'literature-fulltext', sessionId: 'session-1', kind: 'source.retrieve', status: 'succeeded', progress: 100, retryCount: 0, canRetry: false, executionAttempt: 1, result: { sources: [{ id: 'source-1', title: 'Ultrafast response', sourceUrl: 'https://example.test/source', identifiers: { doi: '10.1038/nature12373' }, rights: { cacheAllowed: true }, temporaryDocumentId: 'document-1', expiresAt: '2026-09-01T00:00:00.000Z' }], providers: [] }, error: null, createdAt: '2026-08-30T00:02:00.000Z', updatedAt: '2026-08-30T00:03:00.000Z' } }) }));
  await page.route('**/api/temporary-documents/document-1/download-link', (route) => {
    downloadLinks += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ downloadUrl: '/api/temporary-documents/document-1/download/access-1', expiresAt: '2026-09-01T00:00:00.000Z' }) });
  });
  await page.route('**/api/temporary-documents/document-1/download/access-1', (route) => {
    finalDownloads += 1;
    return route.fulfill({ contentType: 'application/pdf', body: '%PDF-final' });
  });
  await page.goto(`${baseUrl}/dashboard`);
  const input = page.getByLabel(/title, doi, or arxiv id/i);
  await input.focus();
  await page.keyboard.type('Ultrafast response');
  await page.keyboard.press('Enter');
  await expect.poll(() => submissions).toBe(1);
  await expect(page.getByText(/reconnecting to the task/i)).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole('button', { name: /get full text/i })).toBeVisible({ timeout: 6000 });
  const sourceLink = page.getByRole('link', { name: /open source record/i });
  const sourceBox = await sourceLink.boundingBox();
  expect(sourceBox?.width).toBeGreaterThanOrEqual(44);
  expect(sourceBox?.height).toBeGreaterThanOrEqual(44);
  const actionBox = await page.getByRole('button', { name: /get full text/i }).boundingBox();
  expect(actionBox?.width).toBeGreaterThanOrEqual(44);
  expect(actionBox?.height).toBeGreaterThanOrEqual(44);
  const getFullText = page.getByRole('button', { name: /get full text/i });
  const selecting = getFullText.press('Enter');
  await expect(getFullText).toBeDisabled();
  await expect(sourceLink).toHaveCount(0);
  await expect(page.getByText(/open source record/i)).toHaveAttribute('aria-disabled', 'true');
  releaseFullText?.();
  await selecting;
  await expect(page.getByRole('button', { name: /download source/i })).toBeVisible({ timeout: 4_000 });
  await page.getByRole('button', { name: /download source/i }).press('Enter');
  await expect.poll(() => finalDownloads).toBe(1);
  expect(submissions).toBe(2);
  expect(callerKeys[0]).toBeTruthy();
  expect(callerKeys[1]).toBeTruthy();
  expect(callerKeys[1]).not.toBe(callerKeys[0]);
  expect(downloadLinks).toBe(1);
  expect(await page.locator('text=/provider|account|CARSI|ScanSci/i').count()).toBe(0);
});
