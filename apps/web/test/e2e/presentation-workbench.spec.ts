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
  reviewedMedia?: boolean;
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
      return json(route, { assets: options.reviewedMedia ? [
        { ...currentAsset, id: 'media-image', kind: 'image', status: 'approved', canTransition: false },
        { ...currentAsset, id: 'media-video', kind: 'video', status: 'rejected', canTransition: false },
      ] : generated ? [currentAsset] : [] });
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
    if (path.endsWith('/presentation-assets/asset-chart/content') || path.endsWith('/presentation-assets/media-image/content')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><title>Claim map</title><rect width="120" height="60" fill="#fffdf8"/><text x="8" y="34" fill="#292722">Claim map</text></svg>' });
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

test('saved PNG review-only recovers a failed render without generating or approving again', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/auth/me', route => json(route, { userId: 'user-presentation', platformRole: 'platform_admin', status: 'email_verified' }));
  const saved = { ...asset, id: 'saved-png', kind: 'image', canTransition: true, canApprove: false,
    sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } };
  let reads = 0;
  const writes: Array<{ path: string; key?: string }> = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/versions/version-2/presentation-assets', route => json(route, { assets: ++reads > 1 ? [saved] : [] }));
  await page.route('**/presentation-tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return json(route, { task: { ...task(id === 'review-task' ? 'running' : 'failed', 80), id,
      error: '[blocked] Generated image review exceeds the source input budget (62621 > 61440 characters)' } });
  });
  await page.route('**/presentation-assets/**', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push({ path: new URL(route.request().url()).pathname, key: route.request().headers()['idempotency-key'] });
    await held;
    return json(route, { task: { ...task('pending', 0), id: 'review-task' } }, 202);
  });
  try {
    await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=saved-png`);
    const actions = page.locator('[data-media-asset-actions="saved-png"]');
    await expect(actions).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Review saved image only', exact: true })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Approve for publication', exact: true })).toHaveCount(0);
    await actions.getByRole('button', { name: 'Review saved image only', exact: true }).evaluate(button => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(actions.getByRole('button', { name: 'Submitting review…', exact: true })).toBeDisabled();
    await expect.poll(() => writes.length).toBe(1);
    release();
    await expect(actions).toContainText('Review submitted. The saved image will not be generated again.');
    await expect(page).toHaveURL(/task=review-task/);
    expect(writes[0].path).toBe(`/api/research-objects/${ro.id}/versions/version-2/presentation-assets/saved-png/review`);
    expect(writes[0].key).toBeTruthy();
  } finally { release(); }
});

test('saved PNG review-only hides recovered originals and accepted images, preserving system rejection', async ({ page }) => {
  await fixtures(page);
  const original = { ...asset, id: 'd075fc00-f0c4-4049-8f2b-97c255aa78d7', kind: 'image', canTransition: true, canApprove: false,
    sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } };
  const copy = { ...original, id: '2943e5cc-75c5-4f1e-a1a8-c78a3be6ec1f' };
  const accepted = { ...original, id: '2cc5003f-e5c4-40c7-8c5a-43de202aec4f', contentHash: 'b'.repeat(64), canApprove: true };
  await page.route('**/api/auth/me', route => json(route, { userId: 'user-presentation', platformRole: 'platform_admin', status: 'email_verified' }));
  await page.route('**/versions/version-2/presentation-assets', route => json(route, { assets: [original, copy, accepted] }));
  await page.route('**/presentation-tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return json(route, { task: { ...task(id === copy.id ? 'succeeded' : 'failed', 100), id,
      error: id === original.id ? '[blocked] Generated image review exceeds the source input budget (62621 > 61440 characters)' : null,
      result: id === copy.id ? { assetId: id, imageReview: { decision: 'blocked' } } : null } });
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  const copyActions = page.locator(`[data-media-asset-actions="${copy.id}"]`);
  await expect(copyActions).toContainText('System review did not pass.');
  await expect(copyActions.getByRole('button', { name: 'Reject draft', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review saved image only', exact: true })).toHaveCount(0);
  await expect(page.locator(`[data-media-asset-actions="${accepted.id}"]`).getByRole('button', { name: 'Approve for publication', exact: true })).toBeVisible();
});

test('saved PNG review-only requires platform admin as well as a writable version', async ({ page }) => {
  await fixtures(page);
  await page.route('**/versions/version-2/presentation-assets', route => json(route, { assets: [{ ...asset, id: 'saved-png', kind: 'image',
    canTransition: true, canApprove: false, sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } }] }));
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await expect(page.locator('[data-media-asset-actions="saved-png"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review saved image only', exact: true })).toHaveCount(0);
  await page.route('**/api/auth/me', route => json(route, { userId: 'user-presentation', platformRole: 'platform_admin', status: 'email_verified' }));
  await page.route(`**/api/research-objects/${ro.id}/versions`, route => json(route, { versions: versions.map(version => ({ ...version, status: 'published' })) }));
  await page.reload();
  await expect(page.locator('[data-media-asset-actions="saved-png"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review saved image only', exact: true })).toHaveCount(0);
});

test('saved PNG review-only isolates A-B-A requests and reuses the key after response loss', async ({ page }) => {
  await fixtures(page, { versionStates: versions.map(version => ({ ...version, status: 'draft' })) });
  await page.route('**/api/auth/me', route => json(route, { userId: 'user-presentation', platformRole: 'platform_admin', status: 'email_verified' }));
  await page.route('**/versions/*/presentation-assets', route => {
    const versionId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    return json(route, { assets: [{ ...asset, id: `saved-${versionId}`, versionId, kind: 'image', canTransition: true, canApprove: false,
      sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } }] });
  });
  await page.route('**/presentation-tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return json(route, { task: { ...task(id.startsWith('review-') ? 'running' : 'failed', 80), id, error: 'scientific review provider failed' } });
  });
  const writes: Array<{ version: string; key: string }> = [];
  let releaseA!: () => void; let releaseB!: () => void;
  const a = new Promise<void>(resolve => { releaseA = resolve; });
  const b = new Promise<void>(resolve => { releaseB = resolve; });
  await page.route('**/presentation-assets/*/review', async route => {
    const version = new URL(route.request().url()).pathname.split('/').at(-4)!;
    writes.push({ version, key: route.request().headers()['idempotency-key'] });
    const index = writes.length;
    if (index <= 2) await (version === 'version-2' ? a : b);
    if (index === 2) return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Response lost' } }, 503);
    return json(route, { task: { ...task('pending', 0), id: `review-${version}` } }, 202);
  });
  const select = page.locator('select').first();
  const submit = page.getByRole('button', { name: 'Review saved image only', exact: true });
  try {
    await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
    await submit.click();
    await expect.poll(() => writes.length).toBe(1);
    await select.selectOption('version-1');
    await submit.click();
    await expect.poll(() => writes.length).toBe(2);
    await select.selectOption('version-2');
    await expect(page.getByRole('button', { name: 'Submitting review…', exact: true })).toBeDisabled();
    releaseA();
    await expect(page.getByText('Review submitted. The saved image will not be generated again.', { exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/task=/);
    releaseB();
    await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toHaveCount(0);
    await select.selectOption('version-1');
    await expect(page.locator('[data-existing-image-review] [role="alert"]')).toContainText('Submission could not be confirmed.');
    expect(writes).toHaveLength(2);
    await page.getByRole('button', { name: 'Confirm review submission', exact: true }).click();
    await expect(page).toHaveURL(/task=review-version-1/);
    expect(writes).toHaveLength(3);
    expect(writes[1]).toEqual(writes[2]);
    expect(writes[0].key).not.toBe(writes[1].key);
  } finally { releaseA(); releaseB(); }
});

test('saved PNG review-only recovers the same receipt after a committed copy loses its response', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/auth/me', route => json(route, { userId: 'user-presentation', platformRole: 'platform_admin', status: 'email_verified' }));
  const original = { ...asset, id: 'original-png', kind: 'image', canTransition: true, canApprove: false,
    sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } };
  const copy = { ...original, id: 'persisted-review-copy' };
  let committed = false;
  const keys: string[] = [];
  await page.route('**/versions/version-2/presentation-assets', route => json(route, { assets: committed ? [original, copy] : [original] }));
  await page.route('**/presentation-tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return json(route, { task: { ...task(id === copy.id ? 'running' : 'failed', id === copy.id ? 92 : 80), id, error: 'scientific review provider failed' } });
  });
  await page.route('**/presentation-assets/*/review', async route => {
    expect(new URL(route.request().url()).pathname).toContain('/original-png/review');
    keys.push(route.request().headers()['idempotency-key']);
    if (!committed) { committed = true; return route.abort('failed'); }
    return json(route, { task: { ...task('running', 92), id: copy.id } }, 202);
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.getByRole('button', { name: 'Review saved image only', exact: true }).click();
  await expect(page.locator(`[data-media-asset-actions="${copy.id}"]`)).toBeVisible();
  const originalActions = page.locator(`[data-media-asset-actions="${original.id}"]`);
  await expect(originalActions.getByRole('alert')).toContainText('Submission could not be confirmed.');
  await expect(page.getByRole('button', { name: 'Review saved image only', exact: true })).toHaveCount(0);
  expect(keys).toHaveLength(1);
  await originalActions.getByRole('button', { name: 'Confirm review submission', exact: true }).click();
  await expect(page).toHaveURL(/task=persisted-review-copy/);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92');
  await expect(originalActions).toContainText('Review submitted. The saved image will not be generated again.');
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test('saved science retry refreshes a concurrent 409 without posting twice', async ({ page }) => {
  await fixtures(page);
  let posts = 0;
  await page.route('**/presentation-tasks/presentation-task', route => json(route, {
    task: { ...task(posts ? 'running' : 'failed', posts ? 37 : 10), canRetry: !posts },
  }));
  await page.route('**/api/agent/tasks/presentation-task/retry', route => {
    posts += 1;
    return json(route, { error: { code: 'ILLEGAL_TRANSITION', message: 'Another tab already continued this task.' } }, 409);
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=presentation-task`);
  await page.getByRole('button', { name: 'Continue task', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37');
  await expect(page.getByRole('button', { name: 'Continue task', exact: true })).toHaveCount(0);
  expect(posts).toBe(1);
});

test('saved science retry deduplicates A-B-A round trips before either request commits', async ({ page }) => {
  await fixtures(page);
  const posts: string[] = [];
  const committed = new Set<string>();
  let releaseA!: () => void;
  const heldA = new Promise<void>(resolve => { releaseA = resolve; });
  let releaseB!: () => void;
  const heldB = new Promise<void>(resolve => { releaseB = resolve; });
  await page.route('**/presentation-tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return json(route, { task: { ...task(committed.has(id) ? 'running' : 'failed', committed.has(id) ? 63 : 10), id, canRetry: !committed.has(id) } });
  });
  await page.route('**/api/agent/tasks/*/retry', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    posts.push(id);
    await (id === 'task-a' ? heldA : heldB);
    committed.add(id);
    return json(route, { task: { ...task('pending', 0), id, canRetry: false } });
  });
  try {
    await page.goto(`/research-objects/${ro.id}/presentation?version=version-2&task=task-a`);
    await page.getByRole('button', { name: 'Continue task', exact: true }).click();
    await expect.poll(() => posts).toEqual(['task-a']);
    await page.evaluate(() => history.pushState(null, '', '?version=version-2&task=task-b'));
    await page.getByRole('button', { name: 'Continue task', exact: true }).click();
    await expect.poll(() => posts).toEqual(['task-a', 'task-b']);
    await expect(page.getByRole('button', { name: 'Continuing…', exact: true })).toBeDisabled();
    const unchangedA = page.waitForResponse(response => response.url().endsWith('/presentation-tasks/task-a'));
    await page.evaluate(() => history.pushState(null, '', '?version=version-2&task=task-a'));
    expect((await (await unchangedA).json()).task).toMatchObject({ status: 'failed', canRetry: true });
    await expect(page.getByRole('button', { name: 'Continuing…', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Continuing…', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    expect(posts).toEqual(['task-a', 'task-b']);
    await page.evaluate(() => history.pushState(null, '', '?version=version-2&task=task-b'));
    await expect(page.getByRole('button', { name: 'Continuing…', exact: true })).toBeDisabled();
    const oldResponse = page.waitForResponse(response => response.url().endsWith('/tasks/task-a/retry'));
    releaseA();
    await oldResponse;
    await expect(page.getByRole('button', { name: 'Continuing…', exact: true })).toBeDisabled();
    releaseB();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
    expect(posts).toEqual(['task-a', 'task-b']);
  } finally { releaseA(); releaseB(); }
});

test('creates a human claim, retries stable intents, generates a chart, refreshes a real conflict, and approves', async ({ page }) => {
  const observed = await fixtures(page, { startEmpty: true });
  await page.goto(`/research-objects/${ro.id}/presentation`);
  await expect(page.getByRole('heading', { name: /Visual explanations/i })).toBeVisible();
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
  await page.getByRole('button', { name: /Generate concept map/i }).click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText(/could not be started/i);
  await page.getByRole('button', { name: /Generate concept map/i }).click();
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
  await page.locator('[data-presentation-asset="asset-chart"] summary').click();
  await expect(page.locator('[data-presentation-asset="asset-chart"]')).toContainText(statement);
  expect(observed.patchExpectedTimes).toEqual(['2026-09-05T00:00:00Z', '2026-09-05T00:00:30Z']);
  await page.screenshot({ path: 'test/visual/out/presentation-workbench-desktop.png', fullPage: true });
});

test('gives an empty writable presentation a visible editor next step without a misleading zero count', async ({ page }) => {
  await fixtures(page, { startEmpty: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);

  const workbench = page.locator('[data-presentation-workbench]');
  await expect(workbench.getByRole('heading', { name: /Build a visual explanation/i })).toBeVisible();
  await expect(workbench.getByText(/No usable claims are available/i)).toBeVisible();
  await expect(workbench.getByRole('link', { name: /Open the SDF editor/i })).toHaveAttribute('href', `/research-objects/${ro.id}/edit`);
  await expect(workbench.locator('#presentation-preview-heading + span')).toHaveCount(0);
  await expect(workbench.locator('[data-source-tools]')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/token-smart-release/ux-empty-local-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workbench.getByRole('link', { name: /Open the SDF editor/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/token-smart-release/ux-empty-local-mobile.png', fullPage: true });
});

test('requires both a draft version and an active writer membership', async ({ page }) => {
  await fixtures(page, { role: 'viewer' });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await expect(page.getByText(/view access/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate concept map/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add claim/i })).toHaveCount(0);

  await page.unroute('**/api/**');
  await fixtures(page, { role: 'author', versionStates: versions.map((item) => item.versionId === 'version-2' ? { ...item, status: 'under_review' } : item) });
  await page.reload();
  await expect(page.locator('[data-readonly-reason="true"]')).toContainText(/under review/i);
  await expect(page.getByRole('button', { name: /Generate concept map/i })).toHaveCount(0);
});

test('does not let delayed or failed reads, or a delayed generation, move a changed version back to the old scope', async ({ page }) => {
  await fixtures(page, { delayVersionTwoReads: true, delayGeneration: true, failVersionOneReads: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.locator('select').first().selectOption('version-1');
  await expect(page).toHaveURL(/version=version-1/);
  await page.waitForTimeout(800);
  await expect(page.getByText(initialClaim.statement)).toHaveCount(0);
  await page.locator('select').first().selectOption('version-2');
  await expect(page.getByText(initialClaim.statement)).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(initialClaim.statement) }).check();
  await page.getByRole('button', { name: /Generate concept map/i }).click();
  await page.locator('select').first().selectOption('version-1');
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
  await expect(page.getByRole('button', { name: /Retry loading claims and presentation content/i })).toBeVisible();
  await expect(page.getByLabel(/Core claim statement/i)).toBeDisabled();
  expect(observed.taskReadCount()).toBe(0);
  await page.getByRole('button', { name: /Retry loading claims and presentation content/i }).click();
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
  await expect(page.getByRole('button', { name: /Generate concept map/i })).toBeEnabled();
});

test('shows every claim, caps a diagram at twelve selections, and restores URL state on browser back', async ({ page }) => {
  await fixtures(page, { manyClaims: true });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(13);
  for (let index = 0; index < 12; index += 1) await checkboxes.nth(index).check();
  await expect(checkboxes.nth(12)).toBeDisabled();
  await expect(page.getByText('12 of 12 selected')).toBeVisible();
  await page.locator('select').first().selectOption('version-1');
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
  await page.locator('select').first().selectOption('version-2');
  await expect(page).toHaveURL(/version=version-2$/);
});

test('published version is compact, read-only, and stays within a 390px viewport', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-1`);
  await expect(page.getByText(/Published versions are read-only/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate concept map/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/presentation-workbench-mobile.png', fullPage: true });
});


test('puts media first and keeps source details and editor keyboard accessible on desktop and mobile', async ({ page }) => {
  await fixtures(page, { reviewedMedia: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  const image = page.locator('[data-presentation-asset="media-image"]');
  const video = page.locator('[data-presentation-asset="media-video"]');
  const tools = page.locator('[data-source-tools]');
  await expect(image).toBeVisible();
  await expect(tools).not.toHaveAttribute('open');
  const bounds = await Promise.all([image.boundingBox(), video.boundingBox(), tools.boundingBox()]);
  expect(bounds[0]!.y).toBe(bounds[1]!.y);
  expect(bounds[0]!.x).toBeLessThan(bounds[1]!.x);
  expect(bounds[1]!.y).toBeLessThan(bounds[2]!.y);
  await expect.poll(() => image.locator('img').evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const imageStage = await image.locator('img').boundingBox();
  const videoStage = await video.locator('video').boundingBox();
  expect(Math.abs(imageStage!.height - imageStage!.width * 9 / 16)).toBeLessThan(2);
  expect(Math.abs(imageStage!.height - videoStage!.height)).toBeLessThan(2);
  const metadata = image.locator('summary');
  await metadata.focus();
  await page.keyboard.press('Enter');
  await expect(image.getByText(initialClaim.statement, { exact: false })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(image.getByText(initialClaim.statement, { exact: false })).not.toBeVisible();
  await tools.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel(/Core claim statement/i)).toBeVisible();
  await page.getByLabel(/Core claim statement/i).fill('Retain this draft when source tools close.');
  await tools.locator('summary').click();
  await tools.locator('summary').click();
  await expect(page.getByLabel(/Core claim statement/i)).toHaveValue('Retain this draft when source tools close.');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await Promise.all([image.boundingBox(), video.boundingBox()]);
  expect(mobileBounds[0]!.x).toBe(mobileBounds[1]!.x);
  expect(mobileBounds[0]!.y).toBeLessThan(mobileBounds[1]!.y);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(video.locator('video')).toHaveAttribute('controls', '');
  await expect(video.getByRole('button', { name: /Approve/i })).toHaveCount(0);
});

test('Hermes plans and revises sourced scenes, retaining the original through approval and reload', async ({ page }) => {
  await fixtures(page);
  const plans: Array<Record<string, unknown>> = [];
  const requests: Array<Record<string, unknown>> = [];
  const keys: string[] = [];
  let failedOnce = false;
  await page.route('**/api/**/presentation-assets/generations', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    keys.push(route.request().headers()['idempotency-key']);
    if (!failedOnce) { failedOnce = true; return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Temporary storyboard failure' } }, 503); }
    const revision = Boolean(body.storyboard.baseAssetId);
    plans.push({ ...asset, id: revision ? 'plan-revision' : 'plan-original', kind: 'interactive_html', canTransition: true, canApprove: true,
      storyboard: { ...body.storyboard, document: { schemaVersion: 1, title: revision ? 'Revised light journey' : 'Light journey', scenes: Array.from({ length: 3 }, (_, index) => ({ title: `Stage ${index + 1}`, narration: revision ? `Revised narration ${index}` : `Original narration ${index}`, visualAction: revision ? `Revised visual ${index}` : `Original visual ${index}`, durationSeconds: 8, sourceClaimIds: [initialClaim.id] })) } } });
    return json(route, { task: task('pending', 0) }, 202);
  });
  await page.route('**/api/**/presentation-assets', (route) => json(route, { assets: route.request().url().includes('/version-2/') ? plans : [] }));
  let storyboardTaskReads = 0;
  await page.route('**/api/**/presentation-tasks/presentation-task', (route) => {
    storyboardTaskReads += 1;
    return json(route, { task: storyboardTaskReads === 1 ? task('running', 35) : task('succeeded', 100) });
  });
  await page.route('**/api/**/presentation-assets/plan-revision', (route) => {
    plans[1] = { ...plans[1], status: 'approved' };
    return json(route, { asset: plans[1] });
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.getByRole('checkbox', { name: new RegExp(initialClaim.statement) }).check();
  await page.getByLabel('Intended artwork direction').selectOption('ink');
  await page.getByLabel(/What should the explanation emphasize/).fill('Explain propagation.');
  await page.getByRole('button', { name: 'Generate storyboard · 1 AI credit' }).click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText('Temporary storyboard failure');
  await page.getByRole('button', { name: 'Generate storyboard · 1 AI credit' }).click();
  await expect(page.getByRole('progressbar', { name: 'Presentation task progress' })).toBeVisible();
  await expect(page.locator('[data-presentation-task]')).toContainText('Preparing presentation content');
  await expect(page.locator('[data-presentation-task]')).not.toContainText(/diagram/i);
  const original = page.locator('[data-presentation-asset="plan-original"]');
  await expect(original).toBeVisible();
  expect(keys[0]).toBe(keys[1]);
  expect(requests[1]).toEqual({ kind: 'interactive_html', sourceClaimIds: [initialClaim.id], storyboard: { locale: 'en', style: 'ink', instruction: 'Explain propagation.' } });
  await original.locator('details').filter({ has: page.locator('[data-storyboard-panel]') }).locator('summary').first().click();
  await original.getByLabel('What should Hermes change?').fill('Show interference.');
  await original.getByRole('button', { name: 'Create revised draft · 1 AI credit' }).click();
  const revision = page.locator('[data-presentation-asset="plan-revision"]');
  await expect(revision).toBeVisible();
  expect(requests[2].storyboard).toEqual({ locale: 'en', style: 'ink', instruction: 'Show interference.', baseAssetId: 'plan-original' });
  expect(keys[2]).not.toBe(keys[1]);
  await expect(revision).toContainText('Original narration 0');
  await expect(revision).toContainText('Revised visual 0');
  await expect(original).toContainText('Original visual 0');
  await revision.getByRole('button', { name: /Approve/i }).click();
  await page.reload();
  await expect(revision).toContainText('Approved');
  await expect(original).toContainText('Needs review');
  expect(plans[0].status).toBe('draft');
  await page.screenshot({ path: 'test/visual/out/science-video/storyboard-local-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/science-video/storyboard-local-mobile.png', fullPage: true });
  await page.locator('select').first().selectOption('version-1');
  await expect(page.locator('[data-presentation-asset]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Generate storyboard/ })).toHaveCount(0);
});

test('approved scene produces an independently reviewable image with stable retry', async ({ page }) => {
  await fixtures(page);
  const plan = { ...asset, id: 'approved-plan', kind: 'interactive_html', status: 'approved', canGenerateSceneImage: true,
    storyboard: { locale: 'en', style: 'watercolor', document: { schemaVersion: 1, title: 'Wavefronts in motion', scenes: Array.from({ length: 3 }, (_, i) => ({ title: `Scene ${i + 1}`, narration: 'The wave spreads.', visualAction: 'Draw expanding blue wavefronts.', durationSeconds: 8, sourceClaimIds: [initialClaim.id] })) } } };
  const items: Array<Record<string, unknown>> = [plan];
  const keys: string[] = [];
  let requests = 0;
  await page.route('**/api/**/presentation-assets', route => json(route, { assets: route.request().url().includes('/version-2/') ? items : [] }));
  await page.route('**/api/**/presentation-assets/generations', route => {
    keys.push(route.request().headers()['idempotency-key']);
    expect(route.request().postDataJSON()).toEqual({ kind: 'image', sourceClaimIds: [initialClaim.id], sceneImage: { storyboardAssetId: 'approved-plan', sceneIndex: 1 } });
    if (requests++ === 0) return json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Please retry the image request.' } }, 503);
    items.push({ ...asset, id: 'scene-image', kind: 'image', canTransition: true, canApprove: true, sceneImage: { storyboardAssetId: 'approved-plan', sceneIndex: 1 } });
    return json(route, { task: task('pending', 0) }, 202);
  });
  await page.route('**/api/**/presentation-tasks/presentation-task', route => json(route, { task: task('succeeded', 100) }));
  await page.route('**/api/**/presentation-assets/scene-image/content', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/**/presentation-assets/scene-image', route => {
    items[1] = { ...items[1], status: 'approved' }; return json(route, { asset: items[1] });
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.locator('[data-presentation-asset="approved-plan"] details').filter({ has: page.locator('[data-storyboard-panel]') }).locator('summary').first().click();
  const action = page.locator('[data-scene-image="1"]');
  await expect(action).toBeVisible();
  await expect(page.getByText('One image costs 1 AI credit.', { exact: false }).first()).toBeVisible();
  await action.click();
  await expect(page.locator('[data-presentation-workbench] [role="alert"]')).toContainText('Please retry');
  await action.click();
  const image = page.locator('[data-presentation-asset="scene-image"]');
  await expect(image).toContainText('Storyboard: Wavefronts in motion · Scene 2');
  expect(keys[0]).toBe(keys[1]);
  await image.getByRole('button', { name: /Approve/i }).click();
  await page.reload();
  await expect(image).toContainText('Approved');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  plan.canGenerateSceneImage = false;
  await page.reload();
  await expect(page.locator('[data-scene-image]')).toHaveCount(0);
});

test('global Hermes reviews an exact revision and retries one uncertain submission', async ({ page }) => {
  await fixtures(page);
  const parent = { ...asset, id: 'global-plan', kind: 'interactive_html', status: 'approved', canGenerateSceneImage: false,
    storyboard: { locale: 'en', style: 'technical', document: { schemaVersion: 1, title: 'Original light journey', scenes: Array.from({ length: 3 }, (_, i) => ({ title: `Scene ${i + 1}`, narration: 'Light travels.', visualAction: 'Show propagation.', durationSeconds: 8, sourceClaimIds: [initialClaim.id] })) } } };
  await page.route('**/api/**/presentation-assets', route => json(route, { assets: [parent] }));
  const bodies: unknown[] = []; const keys: string[] = [];
  await page.route('**/api/**/presentation-assets/generations', route => {
    bodies.push(route.request().postDataJSON()); keys.push(route.request().headers()['idempotency-key']);
    return bodies.length === 1 ? json(route, { error: { code: 'TEMPORARY_FAILURE', message: 'Unknown outcome' } }, 503) : json(route, { task: task('pending', 0) }, 202);
  });
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.locator('[data-hermes-input-owner="true"]').click();
  await page.locator('#hermes-guide-goal').fill('Revise the storyboard to explain diffraction clearly');
  await page.locator('.hermes-guide-drawer form button[type="submit"]').click();
  const review = page.locator('[data-hermes-presentation-action="true"]');
  await expect(review).toContainText(ro.title);
  await review.getByLabel('Source storyboard').selectOption(parent.id);
  await expect(review.getByLabel('Visual style')).toHaveValue('technical');
  await review.getByLabel('Visual style').selectOption('ink');
  expect(bodies).toHaveLength(0);
  const buttonColors = await review.getByRole('button', { name: 'Confirm · 1 AI credit' }).evaluate(node => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color }; });
  expect(buttonColors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(buttonColors.background).not.toBe(buttonColors.color);
  await review.getByRole('button', { name: 'Confirm · 1 AI credit' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test/visual/out/token-smart-release/hermes-presentation-confirm-contrast.png', fullPage: true });
  await review.getByRole('button', { name: 'Confirm · 1 AI credit' }).click();
  await expect(review.getByRole('alert')).toContainText('outcome is unknown');
  await expect(review.getByLabel('Storyboard instructions')).toBeDisabled();
  await review.getByRole('button', { name: 'Retry the same submission' }).click();
  await expect(page).toHaveURL(/version=version-2&task=presentation-task/);
  expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
  expect(bodies[0]).toEqual({ kind: 'interactive_html', sourceClaimIds: [initialClaim.id], storyboard: { locale: 'en', style: 'ink', instruction: 'Revise the storyboard to explain diffraction clearly', baseAssetId: parent.id } });
  expect(bodies[1]).toEqual(bodies[0]);
  await page.locator('[data-hermes-input-owner="true"]').click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('#hermes-guide-goal')).toHaveValue('');
});

test('global Hermes does not fall back from an explicit published version', async ({ page }) => {
  const observed = await fixtures(page);
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-1`);
  await page.locator('[data-hermes-input-owner="true"]').click();
  await page.getByRole('button', { name: 'Storyboards and scene images', exact: true }).click();
  const review = page.locator('[data-hermes-presentation-action="true"]');
  await expect(review.getByLabel('Research version')).toHaveValue('version-1');
  await expect(review.getByRole('button', { name: 'Confirm · 1 AI credit' })).toBeDisabled();
  await expect(review).toContainText('Choose a draft version');
  expect(observed.generationBodies).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/science-video/global-hermes-mobile.png', fullPage: true });
});

test('global Hermes image selection follows server capability and version switches discard preparation', async ({ page }) => {
  await fixtures(page);
  const plan = { ...asset, id: 'allowed-plan', kind: 'interactive_html', status: 'approved', canGenerateSceneImage: true,
    storyboard: { locale: 'en', style: 'ink', document: { schemaVersion: 1, title: 'Allowed scene', scenes: [{ title: 'Wave', narration: 'Light travels.', visualAction: 'Draw the wavefront.', durationSeconds: 8, sourceClaimIds: [initialClaim.id] }] } } };
  await page.route('**/api/**/presentation-assets', route => json(route, { assets: [plan, { ...plan, id: 'denied-plan', canGenerateSceneImage: false, storyboard: { ...plan.storyboard, document: { ...plan.storyboard.document, title: 'Denied scene' } } }] }));
  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  await page.locator('[data-hermes-input-owner="true"]').click();
  await page.getByRole('button', { name: 'Storyboards and scene images', exact: true }).click();
  const review = page.locator('[data-hermes-presentation-action="true"]');
  await review.getByRole('combobox', { name: /^Action/ }).selectOption('scene.image');
  await expect(review.getByLabel('Source storyboard').locator('option')).toHaveCount(2);
  await review.getByLabel('Source storyboard').selectOption(plan.id);
  await expect(review).toContainText('Draw the wavefront.');
  await expect(review.getByRole('button', { name: 'Confirm · 1 AI credit' })).toBeEnabled();
  await page.evaluate(() => history.pushState(null, '', '?version=version-1'));
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: 'Storyboards and scene images', exact: true }).click();
  await expect(review.getByLabel('Research version')).toHaveValue('version-1');
  await expect(review.getByRole('combobox', { name: /^Action/ })).toHaveValue('storyboard.create');
  await expect(review.getByRole('button', { name: 'Confirm · 1 AI credit' })).toBeDisabled();
});

test('rejected scene image remains in collapsed history after refresh', async ({ page }) => {
  const existing = await fixtures(page);
  const parent = { ...asset, id: 'history-plan', kind: 'interactive_html', status: 'approved',
    canTransition: false, canGenerateSceneImage: false,
    storyboard: { output: 'image', locale: 'en', style: 'technical', document: { schemaVersion: 1,
      title: 'One scientific scene', scenes: [{ title: 'Measured response', narration: initialClaim.statement,
        visualAction: 'Show the measured relation.', sourceClaimIds: [initialClaim.id] }] } } };
  const approved = { ...asset, id: 'history-approved', kind: 'image', status: 'approved',
    label: 'Earlier accepted image', canTransition: false, canApprove: false,
    sceneImage: { storyboardAssetId: parent.id, sceneIndex: 0 } };
  let candidate = { ...approved, id: 'history-candidate', status: 'draft', label: 'Latest image attempt',
    contentHash: 'b'.repeat(64), canTransition: true, canApprove: true,
    createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z' };
  const writes: Array<{ status: string; expectedUpdatedAt: string }> = [];
  let listReads = 0;
  const assetsPath = `/api/research-objects/${ro.id}/versions/version-2/presentation-assets`;
  await page.route(`**${assetsPath}`, route => {
    listReads += 1;
    return json(route, { assets: [parent, approved, candidate] });
  });
  await page.route(`**${assetsPath}/${candidate.id}`, route => {
    expect(route.request().method()).toBe('PATCH');
    const body = route.request().postDataJSON() as { status: string; expectedUpdatedAt: string };
    writes.push(body);
    candidate = { ...candidate, status: body.status, canTransition: false, canApprove: false,
      updatedAt: '2026-09-06T00:01:00Z' };
    return json(route, { asset: candidate });
  });
  await page.route(`**${assetsPath}/*/content`, route => route.fulfill({ status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><title>Saved scientific image</title><rect width="120" height="60" fill="white"/></svg>' }));

  await page.goto(`/research-objects/${ro.id}/presentation?version=version-2`);
  const workbench = page.locator('[data-presentation-workbench]');
  const latest = workbench.locator(`[data-presentation-result="${candidate.id}"]`);
  await expect(latest).toHaveAttribute('data-presentation-current', candidate.id);
  await latest.getByRole('button', { name: 'Reject draft', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ status: 'rejected', expectedUpdatedAt: '2026-09-06T00:00:00Z' });

  const history = workbench.locator('[data-presentation-history]');
  await expect(history.locator(`[data-presentation-result="${candidate.id}"]`)).toHaveCount(1);
  await expect(workbench.locator(`[data-presentation-current="${approved.id}"]`)).toBeVisible();
  const beforeRefresh = listReads;
  await page.reload();
  await expect.poll(() => listReads).toBeGreaterThan(beforeRefresh);
  await expect(history).toBeVisible();
  await expect(history).not.toHaveAttribute('open');
  await expect(workbench.locator(`[data-presentation-current="${approved.id}"]`)).toBeVisible();
  await expect(latest).toHaveCount(1);
  await expect(latest).not.toBeVisible();

  await history.locator('summary').click();
  await expect(latest).toBeVisible();
  await expect(latest).toContainText('Rejected');
  await expect(latest.getByRole('img')).toHaveAttribute('src', `${assetsPath}/${candidate.id}/content`);
  await expect.poll(() => latest.getByRole('img').evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(latest.getByRole('link', { name: 'Open full-size diagram', exact: true })).toHaveAttribute('href', `${assetsPath}/${candidate.id}/content`);
  await expect(latest.getByRole('button', { name: 'Approve for publication', exact: true })).toHaveCount(0);
  await expect(latest.getByRole('button', { name: 'Reject draft', exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(existing.generationBodies).toHaveLength(0);
});
