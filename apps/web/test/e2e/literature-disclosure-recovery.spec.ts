import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { openSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const harnessUrl = 'http://127.0.0.1:3011';
let harness: ChildProcess | undefined;
let harnessExit: Error | undefined;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const cwd = path.resolve(__dirname, '../literature-disclosure-harness');
  const workspace = path.resolve(__dirname, '../../../..');
  const vitePackage = readdirSync(path.join(workspace, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'));
  if (!vitePackage) throw new Error('Vite is unavailable for the test-only harness.');
  const vite = path.join(workspace, 'node_modules/.pnpm', vitePackage, 'node_modules/vite/bin/vite.js');
  const log = openSync(path.join(workspace, 'apps/web/test/research-intelligence/out/token-smart-live/harness-vite.log'), 'a');
  harness = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '3011', '--strictPort'], { cwd, stdio: ['ignore', log, log] });
  harness.once('exit', (code) => { harnessExit = new Error(`Test-only Vite harness exited before readiness (code ${code}); see harness-vite.log.`); });
  await expect.poll(async () => {
    if (harnessExit) throw harnessExit;
    try { return (await fetch(harnessUrl, { signal: AbortSignal.timeout(1_000) })).ok; } catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
});

test.afterAll(() => harness?.kill());
const researchObject = {
  id: 'ro-recovery-a', workspaceId: 'workspace-recovery', publicId: 'OSR-RECOVERY-A',
  title: 'Recovered literature', version: 1, status: 'draft', visibility: 'private',
  sdf: { core: { schemaVersion: '0.1.0', problem: 'Question', insight: 'Finding', method: 'Method', results: 'Result', limitations: 'Limit', reproducibility: 'Data' }, nodes: [] },
};

function runningTask(status: 'running' | 'succeeded' = 'running') {
  return {
    id: 'durable-ro-task', sessionId: 'session-recovery', kind: 'source.retrieve', status, progress: status === 'running' ? 42 : 100,
    retryCount: 0, canRetry: false, executionAttempt: 1,
    result: status === 'succeeded' ? { sources: [{ id: 'source-1', title: 'Recovered source', sourceUrl: 'https://example.test/source', identifiers: { doi: '10.1000/recovered' } }] } : null,
    error: null, createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:01:00.000Z',
  };
}

async function installRecoveryFixtures(page: Page, getTask: () => ReturnType<typeof runningTask>) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'user-recovery', email: 'recovery@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' }) });
    if (path === `/api/research-objects/${researchObject.id}`) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObject }) });
    if (path === '/api/ingestion') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) });
    if (path === '/api/agent/tasks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [getTask()] }) });
    if (path === '/api/agent/tasks/durable-ro-task') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: getTask() }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test('RO Files opens a disclosure when an internal recovery finds a durable task, without submitting another acquisition', async ({ page }) => {
  let status: 'running' | 'succeeded' = 'running';
  let posts = 0;
  await installRecoveryFixtures(page, () => runningTask(status));
  await page.route('**/api/literature/acquisitions', async (route) => {
    posts += 1;
    await route.abort();
  });

  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText(/retrieving source/i)).toBeVisible();
  status = 'succeeded';
  await expect(disclosure.getByText(/source ready/i)).toBeVisible({ timeout: 4_000 });
  await expect(disclosure.getByRole('button', { name: /get full text/i })).toBeVisible();
  expect(posts).toBe(0);
});

test('RO Hermes opens the same internal-recovery task without an acquisition POST', async ({ page }) => {
  let posts = 0;
  await installRecoveryFixtures(page, () => runningTask());
  await page.route('**/api/literature/acquisitions', async (route) => {
    posts += 1;
    await route.abort();
  });
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/hermes`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText(/retrieving source/i)).toBeVisible();
  expect(posts).toBe(0);
});

test('a user-collapsed recovered task remains collapsed through polling', async ({ page }) => {
  let poll: 'running' | 'succeeded' = 'running';
  await installRecoveryFixtures(page, () => runningTask(poll));
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toHaveAttribute('open', '');
  await disclosure.locator('summary').click();
  await expect(disclosure).not.toHaveAttribute('open', '');
  poll = 'succeeded';
  await page.waitForTimeout(1_500);
  await expect(disclosure).not.toHaveAttribute('open', '');

  await disclosure.locator('summary').click();
  await expect(disclosure.getByText(/source ready/i)).toBeVisible();
});

test('opening then closing during pending recovery remains closed when the first recovered task arrives', async ({ page }) => {
  let releaseRecovery: (() => void) | undefined;
  let recoveryRequested!: () => void;
  const recoveryRequestedPromise = new Promise<void>((resolve) => { recoveryRequested = resolve; });
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'user-recovery', email: 'recovery@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' }) });
    if (path === `/api/research-objects/${researchObject.id}`) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObject }) });
    if (path === '/api/agent/tasks') {
      recoveryRequested();
      await new Promise<void>((resolve) => { releaseRecovery = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [runningTask()] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  await recoveryRequestedPromise;
  const disclosure = page.locator('[data-literature-entry]');
  await disclosure.locator('summary').press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await disclosure.locator('summary').press('Space');
  await expect(disclosure).not.toHaveAttribute('open', '');
  releaseRecovery?.();
  await expect(disclosure.getByText(/retrieving source/i)).toBeAttached();
  await expect(disclosure).not.toHaveAttribute('open', '');
  await disclosure.locator('summary').click();
  await expect(disclosure.getByText(/retrieving source/i)).toBeVisible();
});

test('a recovered task that disappears shows the recovery error and leaves search enabled', async ({ page }) => {
  await installRecoveryFixtures(page, () => runningTask());
  await page.route('**/api/agent/tasks/durable-ro-task', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TASK_UNAVAILABLE' } }) }));
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText(/task could no longer be recovered/i)).toBeVisible({ timeout: 4_000 });
  await expect(disclosure.getByLabel(/title, doi, or arxiv id/i)).toBeEnabled();
});

test('a newly submitted task reopens a disclosure that the user closed for an earlier task', async ({ page }) => {
  let releaseSubmission: (() => void) | undefined;
  const recovered = {
    ...runningTask('succeeded'),
    result: { sources: [{ id: 'source-1', title: 'Recovered source', sourceUrl: 'https://example.test/source', identifiers: { doi: '10.1000/recovered' } }] },
  };
  await installRecoveryFixtures(page, () => recovered);
  await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) }));
  await page.route('**/api/literature/acquisitions', async (route) => {
    await new Promise<void>((resolve) => { releaseSubmission = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...runningTask(), id: 'new-task' } }) });
  });
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure.getByRole('button', { name: /get full text/i })).toBeVisible();
  const request = disclosure.getByRole('button', { name: /get full text/i }).click();
  await expect(disclosure.getByRole('button', { name: /get full text/i })).toBeDisabled();
  await disclosure.locator('summary').click();
  await expect(disclosure).not.toHaveAttribute('open', '');
  releaseSubmission?.();
  await request;
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText(/retrieving source/i)).toBeVisible();
});

test('retrying the same recovered task does not resubmit or reopen a user-collapsed disclosure', async ({ page }) => {
  let releaseRetry: (() => void) | undefined;
  let acquisitions = 0;
  const failed = { ...runningTask(), status: 'failed' as const, canRetry: true, error: '[retryable] upstream timeout' };
  await installRecoveryFixtures(page, () => failed);
  await page.route('**/api/literature/acquisitions', (route) => { acquisitions += 1; return route.abort(); });
  await page.route('**/api/agent/tasks/durable-ro-task/retry', async (route) => {
    await new Promise<void>((resolve) => { releaseRetry = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...failed, status: 'running', canRetry: false, error: null } }) });
  });
  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  const retry = disclosure.getByRole('button', { name: /try again/i });
  await expect(retry).toBeVisible();
  const request = retry.click();
  await expect(retry).toBeDisabled();
  await disclosure.locator('summary').click();
  await expect(disclosure).not.toHaveAttribute('open', '');
  releaseRetry?.();
  await request;
  await expect(disclosure).not.toHaveAttribute('open', '');
  expect(acquisitions).toBe(0);
});

test('a delayed submit cannot write task A after the mounted disclosure switches to RO B', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agent/tasks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: url.searchParams.get('researchObjectId') === 'ro-b' ? [{ ...runningTask('succeeded'), id: 'task-b', result: { sources: [{ title: 'B source' }] } }] : [] }) });
    if (url.pathname === '/api/literature/acquisitions') {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...runningTask(), id: 'task-a', result: { sources: [{ title: 'A source' }] } } }) });
    }
    if (url.pathname === '/api/csrf-token') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(harnessUrl);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toBeVisible();
  await disclosure.locator('summary').click();
  await disclosure.getByLabel(/title, doi, or arxiv id/i).fill('A request');
  const submitted = page.waitForRequest('**/api/literature/acquisitions');
  const submit = disclosure.getByRole('button', { name: /search metadata/i }).click();
  await submitted;
  await page.getByRole('button', { name: 'switch-target' }).click();
  await expect(disclosure.getByText('B source')).toBeVisible();
  expect(release).toBeDefined();
  release?.();
  await submit;
  await expect(disclosure.getByText('B source')).toBeVisible();
  await expect(disclosure).not.toContainText('A source');
});

test('the mounted disclosure clears a typed query in the first target and user scope commits', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/agent/tasks') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(harnessUrl);
  const disclosure = page.locator('[data-literature-entry]');
  await disclosure.locator('summary').click();
  const query = disclosure.getByLabel(/title, doi, or arxiv id/i);
  await query.fill('Scope A private query');

  await page.getByRole('button', { name: 'switch-target' }).click();

  await expect(disclosure.locator('[data-literature-acquisition]')).toHaveAttribute('data-literature-target', 'research-object:ro-b');
  await expect(page.locator('body')).toHaveAttribute('data-literature-query-at-scope-commit', '');
  await expect(query).toHaveValue('');

  await query.fill('Scope B private query');
  await page.getByRole('button', { name: 'switch-user' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-literature-query-at-scope-commit', '');
  await expect(query).toHaveValue('');
});

test('a delayed retry cannot write task A after the mounted disclosure switches to RO B', async ({ page }) => {
  let release: (() => void) | undefined;
  const failed = { ...runningTask(), status: 'failed', canRetry: true, error: '[retryable] timeout' };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agent/tasks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: url.searchParams.get('researchObjectId') === 'ro-b' ? [{ ...runningTask('succeeded'), id: 'task-b', result: { sources: [{ title: 'B source' }] } }] : [failed] }) });
    if (url.pathname === '/api/agent/tasks/durable-ro-task/retry') {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...runningTask(), id: 'task-a', result: { sources: [{ title: 'A source' }] } } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(harnessUrl);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure.getByRole('button', { name: /try again/i })).toBeVisible();
  const retried = page.waitForRequest('**/api/agent/tasks/durable-ro-task/retry');
  const retry = disclosure.getByRole('button', { name: /try again/i }).click();
  await retried;
  await page.getByRole('button', { name: 'switch-target' }).click();
  await expect(disclosure.getByText('B source')).toBeVisible();
  expect(release).toBeDefined();
  release?.();
  await retry;
  await expect(disclosure.getByText('B source')).toBeVisible();
  await expect(disclosure).not.toContainText('A source');
});

test('a delayed submit cannot write user A data after the mounted disclosure switches user', async ({ page }) => {
  let release: (() => void) | undefined;
  let recoveries = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agent/tasks') {
      recoveries += 1;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: recoveries > 1 ? [{ ...runningTask('succeeded'), id: 'task-user-b', result: { sources: [{ title: 'User B source' }] } }] : [] }) });
    }
    if (url.pathname === '/api/literature/acquisitions') {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...runningTask(), id: 'task-user-a', result: { sources: [{ title: 'User A source' }] } } }) });
    }
    if (url.pathname === '/api/csrf-token') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(harnessUrl);
  const disclosure = page.locator('[data-literature-entry]');
  await disclosure.locator('summary').click();
  await disclosure.getByLabel(/title, doi, or arxiv id/i).fill('User A request');
  const submitted = page.waitForRequest('**/api/literature/acquisitions');
  const submit = disclosure.getByRole('button', { name: /search metadata/i }).click();
  await submitted;
  await page.getByRole('button', { name: 'switch-user' }).click();
  await expect(disclosure.getByText('User B source')).toBeVisible();
  release?.();
  await submit;
  await expect(disclosure.getByText('User B source')).toBeVisible();
  await expect(disclosure).not.toContainText('User A source');
});

test('an unmounted disclosure ignores a delayed download response', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agent/tasks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [{ ...runningTask('succeeded'), result: { sources: [{ title: 'Downloadable', temporaryDocumentId: 'document-a' }] } }] }) });
    if (url.pathname === '/api/temporary-documents/document-a/download-link') {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ downloadUrl: '/stale-download' }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto(harnessUrl);
  const disclosure = page.locator('[data-literature-entry]');
  const download = disclosure.getByRole('button', { name: /download source/i });
  await expect(download).toBeVisible();
  const requested = page.waitForRequest('**/api/temporary-documents/document-a/download-link');
  const action = download.click();
  await requested;
  await page.getByRole('button', { name: 'unmount-disclosure' }).click();
  expect(release).toBeDefined();
  release?.();
  await action;
  await expect(page.getByText('unmounted')).toBeVisible();
  await expect(page).not.toHaveURL(/stale-download/);
});

test('a slow recovery from another RO cannot overwrite the current RO disclosure', async ({ page }) => {
  const roB = { ...researchObject, id: 'ro-recovery-b', publicId: 'OSR-RECOVERY-B', title: 'Current scope' };
  let releaseA: (() => void) | undefined;
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'user-recovery', email: 'recovery@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' }) });
    if (path === `/api/research-objects/${researchObject.id}`) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObject }) });
    if (path === `/api/research-objects/${roB.id}`) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObject: roB }) });
    if (path === '/api/agent/tasks') {
      const target = new URL(route.request().url()).searchParams.get('researchObjectId');
      if (target === researchObject.id) {
        await new Promise<void>((resolve) => { releaseA = resolve; });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [runningTask()] }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [{ ...runningTask(), id: 'task-b', result: { sources: [{ title: 'Current RO source' }] } }] }) });
    }
    if (path === '/api/agent/tasks/task-b') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...runningTask('succeeded'), id: 'task-b', result: { sources: [{ title: 'Current RO source' }] } } }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.goto(`${baseUrl}/research-objects/${researchObject.id}/files`);
  await page.goto(`${baseUrl}/research-objects/${roB.id}/files`);
  const disclosure = page.locator('[data-literature-entry]');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText('Current RO source')).toBeVisible({ timeout: 4_000 });
  releaseA?.();
  await page.waitForTimeout(100);
  await expect(disclosure).not.toContainText('Recovered source');
});
