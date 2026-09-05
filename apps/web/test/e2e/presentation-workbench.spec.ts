import { expect, test, type Page, type Route } from 'playwright/test';

const ro = { id: 'ro-presentation', workspaceId: 'ws-presentation', title: 'Claim diagram study', version: 2, status: 'draft', visibility: 'private' };
const versions = [
  { versionId: 'version-2', versionNo: 2, status: 'draft', commitId: 'commit-2', createdAt: '2026-09-05T00:00:00Z' },
  { versionId: 'version-1', versionNo: 1, status: 'published', commitId: 'commit-1', createdAt: '2026-09-04T00:00:00Z' },
];
const initialClaim = claim('11111111-1111-4111-8111-111111111111', 'The measured response increases under condition A.');
const unavailableClaim = claim('22222222-2222-4222-8222-222222222222', 'This extracted statement still needs review.', 'needs_review');
const asset = {
  id: 'asset-chart', researchObjectId: ro.id, versionId: 'version-2', kind: 'chart', contentHash: 'a'.repeat(64),
  generator: 'OpenScience deterministic renderer', generatorVersion: 'openscience-presentation-v1', status: 'draft',
  label: 'Claim evidence map', sourceClaimIds: [initialClaim.id], createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z',
};

function claim(id: string, statement: string, extractionStatus = 'succeeded') {
  return {
    id, researchObjectId: ro.id, versionId: 'version-2', parentClaimId: null, kind: 'core', statement,
    assessment: 'missing', conditions: [], limitations: [], provenance: { source: 'human' }, extractionStatus,
    createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z',
  };
}

function task(status: 'pending' | 'running' | 'succeeded' | 'failed', progress: number) {
  return {
    id: 'presentation-task', sessionId: 'session', kind: 'presentation.generate', status, progress,
    retryCount: 0, executionAttempt: 1, canRetry: false,
    result: status === 'succeeded' ? { assetId: asset.id } : null, error: status === 'failed' ? 'The renderer rejected this request.' : null,
    createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z',
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface FixtureOptions {
  role?: string;
  versionStates?: typeof versions;
  startEmpty?: boolean;
  delayVersionTwoReads?: boolean;
  delayGeneration?: boolean;
  pendingReads?: number;
  foreignTask?: boolean;
  manyClaims?: boolean;
  failVersionOneReads?: boolean;
  taskErrorOnce?: boolean;
  scopeLoadErrorOnce?: boolean;
  terminalTaskFailure?: boolean;
}

async function fixtures(page: Page, options: FixtureOptions = {}) {
  const records = options.startEmpty ? [] : options.manyClaims
    ? Array.from({ length: 13 }, (_, index) => claim(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, `Selectable research claim ${index + 1}.`))
    : [initialClaim, unavailableClaim];
  const claimPostIds: string[] = [];
  const claimPostBodies: Array<Record<string, unknown>> = [];
  const generationKeys: string[] = [];
  const generationBodies: Array<Record<string, unknown>> = [];
  const patchExpectedTimes: string[] = [];
  let claimWriteAttempts = 0;
  let generationAttempts = 0;
  let taskReads = 0;
  let claimLoadFailures = options.scopeLoadErrorOnce ? 1 : 0;
  let assetLoadFailures = options.scopeLoadErrorOnce ? 1 : 0;
  let generated = false;
  let currentAsset = { ...asset };
  let conflictOnce = true;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return json(route, { userId: 'user-presentation', email: 'presentation@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' });
    if (path === '/api/workspaces') return json(route, { workspaces: [{ id: ro.workspaceId, name: 'Research team', type: 'team', role: options.role ?? 'author', status: 'active', createdAt: '2026-09-01T00:00:00Z' }] });
    if (path === `/api/research-objects/${ro.id}`) return json(route, { researchObject: { ...ro, sdf: { core: {}, nodes: [] } } });
    if (path === `/api/research-objects/${ro.id}/versions`) return json(route, { versions: options.versionStates ?? versions });
    if (path.endsWith('/versions/version-2/claims')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        claimPostIds.push(String(body.id));
        claimPostBodies.push(body);
        claimWriteAttempts += 1;
        if (claimWriteAttempts === 1) return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'The claim could not be saved. Retry to continue with the same draft.' } }, 500);
        const created = claim(String(body.id), String(body.statement));
        records.push(created);
        return json(route, { claim: created }, 201);
      }
      if (claimLoadFailures > 0) {
        claimLoadFailures -= 1;
        return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Claims temporarily unavailable' } }, 503);
      }
      if (options.delayVersionTwoReads) await new Promise((resolve) => setTimeout(resolve, 600));
      return json(route, { claims: records });
    }
    if (path.endsWith('/versions/version-1/claims')) return options.failVersionOneReads ? json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Claims unavailable' } }, 500) : json(route, { claims: [] });
    if (path.endsWith('/versions/version-1/presentation-assets')) return options.failVersionOneReads ? json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Assets unavailable' } }, 500) : json(route, { assets: [] });
    if (path.endsWith('/versions/version-2/presentation-assets/generations') && request.method() === 'POST') {
      const body = request.postDataJSON() as { kind: string; sourceClaimIds: string[] };
      generationKeys.push(request.headers()['idempotency-key'] ?? '');
      generationBodies.push(body);
      currentAsset = { ...currentAsset, sourceClaimIds: body.sourceClaimIds };
      generationAttempts += 1;
      if (options.delayGeneration) await new Promise((resolve) => setTimeout(resolve, 600));
      if (!options.delayGeneration && generationAttempts === 1) return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'The diagram could not be started. Retry to continue with the same request.' } }, 500);
      return json(route, { task: task('running', 12) }, 202);
    }
    if (path.endsWith('/versions/version-2/presentation-assets') && request.method() === 'GET') {
      if (assetLoadFailures > 0) {
        assetLoadFailures -= 1;
        return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Assets temporarily unavailable' } }, 503);
      }
      if (options.delayVersionTwoReads) await new Promise((resolve) => setTimeout(resolve, 600));
      return json(route, { assets: generated ? [currentAsset] : [] });
    }
    if (path === `/api/research-objects/${ro.id}/versions/version-2/presentation-tasks/presentation-task`) {
      if (options.foreignTask) return json(route, { error: { code: 'NOT_FOUND', message: 'Presentation task not found' } }, 404);
      taskReads += 1;
      if (options.terminalTaskFailure) return json(route, { task: task('failed', 41) });
      if (options.taskErrorOnce && taskReads === 1) return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Task check temporarily unavailable' } }, 503);
      const completeAfter = options.pendingReads ?? 2;
      generated = taskReads >= completeAfter;
      return json(route, { task: task(generated ? 'succeeded' : 'running', generated ? 100 : Math.min(92, 12 + taskReads * 17)) });
    }
    if (path.endsWith('/presentation-assets/asset-chart/content')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><title>Claim map</title><rect width="120" height="60" fill="#fffdf8"/><text x="8" y="34" fill="#292722">Claim map</text></svg>' });
    if (path.endsWith('/presentation-assets/asset-chart') && request.method() === 'PATCH') {
      const body = request.postDataJSON() as { status: 'approved' | 'rejected'; expectedUpdatedAt: string };
      patchExpectedTimes.push(body.expectedUpdatedAt);
      if (conflictOnce) {
        conflictOnce = false;
        currentAsset = { ...currentAsset, updatedAt: '2026-09-05T00:00:30Z' };
        return json(route, { error: { code: 'CONCURRENT_UPDATE', message: 'asset changed concurrently' } }, 409);
      }
      currentAsset = { ...currentAsset, status: body.status, updatedAt: '2026-09-05T00:01:00Z' };
      const partialAsset = Object.fromEntries(Object.entries(currentAsset).filter(([key]) => key !== 'sourceClaimIds'));
      return json(route, { asset: partialAsset });
    }
    if (path === '/api/csrf-token') return json(route, { csrfToken: 'presentation-csrf' });
    return json(route, {});
  });

  return { claimPostIds, claimPostBodies, generationKeys, generationBodies, patchExpectedTimes, taskReadCount: () => taskReads };
}

test('creates a human claim, retries stable intents, generates a chart, refreshes a real conflict, and approves', async ({ page }) => {
  const observed = await fixtures(page, { startEmpty: true });
  await page.goto(`/research-objects/${ro.id}/presentation`);
  await expect(page.getByRole('heading', { name: /Turn research claims/i })).toBeVisible();
  const statement = 'Passive diffractive layers perform the learned optical transformation.';
  await page.getByLabel(/Core claim statement/i).fill(statement);
  await page.getByRole('button', { name: /Add claim/i }).click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText(/could not be saved/i);
  await page.getByRole('button', { name: /Add claim/i }).click();
  await expect(page.getByText(statement)).toBeVisible();
  expect(observed.claimPostIds).toHaveLength(2);
  expect(observed.claimPostIds[0]).toBe(observed.claimPostIds[1]);
  expect(observed.claimPostBodies[1]).toEqual({ id: observed.claimPostIds[1], kind: 'core', statement, assessment: 'missing', conditions: [], limitations: [] });
  await page.getByRole('checkbox', { name: new RegExp(statement) }).check();
  await page.getByRole('button', { name: /Generate diagram/i }).click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText(/could not be started/i);
  await page.getByRole('button', { name: /Generate diagram/i }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toBeVisible({ timeout: 10_000 });
  expect(observed.generationKeys).toHaveLength(2);
  expect(observed.generationKeys[0]).toBe(observed.generationKeys[1]);
  expect(observed.generationKeys[1]).not.toBe('');
  expect(observed.generationBodies[1]).toEqual({ kind: 'chart', sourceClaimIds: [observed.claimPostIds[1]] });
  await page.getByRole('button', { name: /Approve/i }).click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText('asset changed concurrently');
  await page.getByRole('button', { name: /Approve/i }).click();
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toContainText('Approved');
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toContainText(statement);
  expect(observed.patchExpectedTimes).toEqual(['2026-09-05T00:00:00Z', '2026-09-05T00:00:30Z']);
  await page.screenshot({ path: 'test/visual/out/presentation-workbench-desktop.png', fullPage: true });
});

test('requires both a draft version and an active writer membership', async ({ page }) => {
  await fixtures(page, { role: 'viewer' });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await expect(page.getByText(/view access/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate diagram/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add claim/i })).toHaveCount(0);

  await page.unroute('**/api/**');
  await fixtures(page, { role: 'author', versionStates: versions.map((item) => item.versionId === 'version-2' ? { ...item, status: 'under_review' } : item) });
  await page.reload();
  await expect(page.locator('[data-readonly-reason="true"]')).toContainText(/under review/i);
  await expect(page.getByRole('button', { name: /Generate diagram/i })).toHaveCount(0);
});

test('does not let delayed or failed reads, or a delayed generation, move a changed version back to the old scope', async ({ page }) => {
  await fixtures(page, { delayVersionTwoReads: true, delayGeneration: true, failVersionOneReads: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.getByRole('combobox').selectOption('version-1');
  await expect(page).toHaveURL(/version=version-1/);
  await page.waitForTimeout(800);
  await expect(page.getByText(initialClaim.statement)).toHaveCount(0);
  await page.getByRole('combobox').selectOption('version-2');
  await expect(page.getByText(initialClaim.statement)).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(initialClaim.statement) }).check();
  await page.getByRole('button', { name: /Generate diagram/i }).click();
  await page.getByRole('combobox').selectOption('version-1');
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/version=version-1$/);
  await expect(page.locator('[data-presentation-asset]')).toHaveCount(0);
  await expect(page.getByText(initialClaim.statement)).toHaveCount(0);
});

test('restores a scoped pending task from the URL and reports foreign tasks without leaking another scope', async ({ page }) => {
  await fixtures(page, { pendingReads: 3, taskErrorOnce: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=presentation-task`);
  await expect(page.getByRole('button', { name: /Resume checking/i })).toBeVisible();
  await page.getByRole('button', { name: /Resume checking/i }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /\d+/);
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/version=version-2$/);
  await page.unroute('**/api/**');
  await fixtures(page, { foreignTask: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=presentation-task`);
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText('Presentation task not found');
  await expect(page.locator('[data-presentation-asset]')).toHaveCount(0);
});

test('keeps writes and task polling blocked until a failed whole-scope load is retried successfully', async ({ page }) => {
  const observed = await fixtures(page, { scopeLoadErrorOnce: true, pendingReads: 1 });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=presentation-task`);
  await expect(page.getByRole('button', { name: /Retry loading claims and diagrams/i })).toBeVisible();
  await expect(page.getByLabel(/Core claim statement/i)).toBeDisabled();
  expect(observed.taskReadCount()).toBe(0);
  await page.getByRole('button', { name: /Retry loading claims and diagrams/i }).click();
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toBeVisible({ timeout: 10_000 });
  expect(observed.taskReadCount()).toBeGreaterThan(0);
});

test('shows a terminal task failure without offering an endless resume loop', async ({ page }) => {
  await fixtures(page, { terminalTaskFailure: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=presentation-task`);
  await expect(page.locator('[data-presentation-task="failed"]')).toContainText('Generation failed');
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText('The renderer rejected this request.');
  await expect(page.getByRole('button', { name: /Resume checking/i })).toHaveCount(0);
  await page.getByRole('checkbox').first().check();
  await expect(page.getByRole('button', { name: /Generate diagram/i })).toBeEnabled();
});

test('shows every claim, caps a diagram at twelve selections, and restores URL state on browser back', async ({ page }) => {
  await fixtures(page, { manyClaims: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(13);
  for (let index = 0; index < 12; index += 1) await checkboxes.nth(index).check();
  await expect(checkboxes.nth(12)).toBeDisabled();
  await expect(page.getByText('12 of 12 selected')).toBeVisible();
  await page.getByRole('combobox').selectOption('version-1');
  await expect(page).toHaveURL(/version=version-1$/);
  await page.goBack();
  await expect(page).toHaveURL(/version=version-2$/);
  await expect(page.getByText('0 of 12 selected')).toBeVisible();
});

test('keeps an unavailable version link explicit instead of silently changing its scope', async ({ page }) => {
  await fixtures(page);
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-missing`);
  await expect(page.getByText(/version in this link isn't available/i)).toBeVisible();
  await expect(page).toHaveURL(/version=version-missing$/);
  await page.getByRole('combobox').selectOption('version-2');
  await expect(page).toHaveURL(/version=version-2$/);
});

test('published version is compact, read-only, and stays within a 390px viewport', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-1`);
  await expect(page.getByText(/Published versions are read-only/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate diagram/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/presentation-workbench-mobile.png', fullPage: true });
});
