import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readdirSync, closeSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import english from '../../messages/en.json';

const harnessUrl = 'http://127.0.0.1:3037';
let harness: ChildProcess | undefined;
let log: number | undefined;
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

test.beforeAll(async () => {
  const workspace = path.resolve(__dirname, '../../../..');
  const vitePackage = readdirSync(path.join(workspace, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'));
  if (!vitePackage) throw new Error('The existing Vite test runtime is unavailable.');
  const output = path.join(workspace, 'tmp/media-retention-check');
  mkdirSync(output, { recursive: true });
  log = openSync(path.join(output, 'harness.log'), 'a');
  harness = spawn(process.execPath, [path.join(workspace, 'node_modules/.pnpm', vitePackage, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3037', '--strictPort'], {
    cwd: path.resolve(__dirname, '../media-retention-harness'), stdio: ['ignore', log, log], windowsHide: true,
  });
  let stopped = false;
  harness.once('exit', () => { stopped = true; });
  await expect.poll(async () => {
    if (stopped) throw new Error('The media test page could not start; see tmp/media-retention-check/harness.log.');
    try { return (await fetch(harnessUrl, { signal: AbortSignal.timeout(1_000) })).ok; } catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
});

test.afterAll(() => { harness?.kill(); if (log !== undefined) closeSync(log); });

const guideImage = (letter: string) => `${letter}1000000-0000-4000-8000-000000000001`;
async function selectedGuideFixture(page: Page) {
  const state = { posts: [] as Array<{ key: string; body: { sessionId: string; payload: { goal: string; context: { presentation: { selectedImageAssetId: string } } } } }>,
    loseResponse: false, release: null as (() => void) | null, runActor: 'fixture-viewer', runRo: 'ro', runVersion: 'working-version',
    runReads: 0, writes: [] as string[], errors: [] as string[] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'guide-fixture-token' } });
    if (pathname === '/api/auth/me') return route.fulfill({ json: { userId: 'fixture-viewer', role: 'researcher', platformRole: 'user', creditBalance: 10 } });
    if (request.method() === 'POST' && pathname === '/api/agent/sessions') return route.fulfill({ status: 201, json: { session: { id: 'guide-session' } } });
    const task = () => ({ id: 'selected-task', researchObjectId: 'ro', sessionId: 'guide-session', kind: 'workspace.guide', status: 'pending',
      progress: 0, retryCount: 0, canRetry: false, error: null, createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z',
      result: { selectedImageReference: { researchObjectId: 'ro', versionId: 'working-version', assetId: state.posts.at(-1)?.body.payload.context.presentation.selectedImageAssetId,
        contentHash: 'a'.repeat(64), storyboardAssetId: guideImage('d'), parentContentHash: 'b'.repeat(64), sceneIndex: 0, sourceClaimIds: ['claim'] } } });
    if (request.method() === 'POST' && pathname === '/api/agent/tasks') {
      state.posts.push({ key: request.headers()['idempotency-key']!, body: request.postDataJSON() });
      if (state.loseResponse) {
        state.loseResponse = false;
        await new Promise<void>(resolve => { state.release = resolve; });
        return route.abort('connectionreset');
      }
      return route.fulfill({ status: 201, json: { task: task() } });
    }
    if (request.method() !== 'GET') { state.writes.push(`${request.method()} ${pathname}`); return route.fulfill({ status: 400, json: { error: { message: 'Unexpected fixture write' } } }); }
    if (pathname === '/api/agent/tasks') return route.fulfill({ json: { tasks: [] } });
    if (pathname === '/api/agent/tasks/selected-task') return route.fulfill({ json: { task: task() } });
    if (pathname.endsWith('/versions')) return route.fulfill({ json: { versions: [{ versionId: 'working-version', status: 'draft' }] } });
    if (pathname.endsWith('/hermes-runs')) {
      await route.fulfill({ json: { run: { id: 'completed-run-f', actorId: state.runActor,
      researchObjectId: state.runRo, versionId: state.runVersion, status: 'succeeded', steps: [
        { stage: 'scene_image', ordinal: 0, status: 'succeeded', presentationAssetId: guideImage('f'), agentTaskId: guideImage('f') } ] } } });
      state.runReads += 1; return;
    }
    if (pathname.endsWith('/presentation-assets')) return route.fulfill({ json: { assets: [{ id: guideImage('f'), researchObjectId: 'ro', versionId: 'working-version', kind: 'image', status: 'draft', label: 'Image F' }] } });
    if (pathname.endsWith('/content')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>' });
    return route.fulfill({ status: 404, json: { error: { message: `Unimplemented fixture GET ${pathname}` } } });
  });
  await page.goto(`${harnessUrl}/?selected-guide-W`);
  await expect(page.getByLabel(english.hermesConversation.inputLabel, { exact: true })).toBeVisible();
  return state;
}

test('actual selected guide preserves a lost B request while a completed F arrives, and resumes only the same body and key after reload', async ({ page }) => {
  const state = await selectedGuideFixture(page);
  const snapshot = () => page.locator('[data-hermes-image-snapshot]').textContent().then(value => JSON.parse(value!));
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe(guideImage('a'));
  await page.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe(guideImage('b'));
  const goal = 'Make the leftmost arrow thinner';
  await page.getByLabel(english.hermesConversation.inputLabel, { exact: true }).fill(goal);
  state.loseResponse = true;
  await page.locator('.hermes-conversation-composer button[type="submit"]').click();
  await expect.poll(() => state.posts.length).toBe(1);
  const original = structuredClone(state.posts[0]!);
  expect(original.body.payload.context.presentation.selectedImageAssetId).toBe(guideImage('b'));
  await page.getByRole('button', { name: 'Observe completed image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe(guideImage('f'));
  await expect(page.locator('[data-hermes-image-reference]')).toHaveAttribute('data-hermes-image-reference', guideImage('b'));
  state.release!();
  await expect(page.locator('.hermes-conversation-error')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(english.hermesConversation.inputLabel, { exact: true })).toHaveValue(goal);
  await expect(page.locator('[data-hermes-image-reference]')).toHaveAttribute('data-hermes-image-reference', guideImage('b'));
  expect(state.posts).toEqual([original]);
  await page.locator('.hermes-conversation-composer button[type="submit"]').click();
  await expect.poll(() => state.posts.length).toBe(2);
  expect(state.posts[1]).toEqual(original);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('fresh F is the next visible reference and exact gallery selection; old completion or wrong scope cannot steal a later C selection', async ({ page }) => {
  const state = await selectedGuideFixture(page);
  const snapshot = () => page.locator('[data-hermes-image-snapshot]').textContent().then(value => JSON.parse(value!));
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe(guideImage('a'));
  await page.getByRole('button', { name: 'Next image', exact: true }).click();
  await page.getByRole('button', { name: 'Observe completed image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.pendingImageAssetId).toBe(guideImage('f'));
  await expect(page.locator('[data-hermes-image-reference]')).toHaveAttribute('data-hermes-image-reference', guideImage('f'));
  await expect(page.locator('[data-research-media-kind="image"] img')).toHaveCount(0);
  expect((await snapshot()).images.map((image: { assetId: string }) => image.assetId)).not.toContain(guideImage('f'));
  await page.getByRole('button', { name: 'Load completed image in gallery', exact: true }).click();
  await expect(page.locator('[data-research-media-kind="image"] img')).toHaveAttribute('alt', 'Image F');
  await expect.poll(async () => (await snapshot())?.pendingImageAssetId).toBeUndefined();
  await page.getByRole('button', { name: 'Previous image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe(guideImage('c'));
  const reads = state.runReads;
  await page.getByRole('button', { name: 'Restore same completed operation', exact: true }).click();
  await expect.poll(() => state.runReads).toBe(reads + 1);
  await expect(page.locator('.hermes-conversation-change img')).toHaveCount(1);
  await expect(page.locator('[data-hermes-image-reference]')).toHaveAttribute('data-hermes-image-reference', guideImage('c'));
  for (const scope of [{ runActor: 'other-user' }, { runRo: 'other-ro' }, { runVersion: 'other-version' }]) {
    Object.assign(state, { runActor: 'fixture-viewer', runRo: 'ro', runVersion: 'working-version' }, scope);
    const before = state.runReads;
    await page.getByRole('button', { name: 'Observe another completion', exact: true }).click();
    await expect.poll(() => state.runReads).toBe(before + 1);
    await expect(page.locator('.hermes-conversation-change img')).toHaveCount(0);
    await expect(page.locator('[data-research-media-kind="image"] img')).toHaveAttribute('alt', 'Image C');
    await expect(page.locator('[data-hermes-image-reference]')).toHaveAttribute('data-hermes-image-reference', guideImage('c'));
  }
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('Hermes image context retains the exact second image through reorder and remount, and clears a removed target', async ({ page }) => {
  const writes: unknown[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'local-fixture-token' } });
    if (pathname === '/api/trash') {
      writes.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: { entry: { id: 'trash-selected-b' } } });
    }
    expect(request.method()).toBe('GET');
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>' });
  });
  await page.goto(`${harnessUrl}/?selected-image`);
  const snapshot = () => page.locator('[data-hermes-image-snapshot]').textContent().then(value => JSON.parse(value!));
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe('image-a');
  await page.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe('image-b');
  await expect(page.getByRole('img', { name: 'Image B', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reverse images', exact: true }).click();
  await expect.poll(async () => (await snapshot()).images[0].assetId).toBe('image-b');
  await expect(page.getByRole('img', { name: 'Image B', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh media section', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe('image-b');
  await expect(page.getByRole('img', { name: 'Image B', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBeNull();
  expect((await snapshot()).images).toEqual([{ assetId: 'image-a', label: 'Image A' }]);
  await expect(page.getByRole('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect.poll(async () => (await snapshot())?.selectedImageAssetId).toBe('image-a');
  await expect(page.getByRole('img', { name: 'Image A', exact: true })).toBeVisible();
  expect(writes).toEqual([{ kind: 'asset', resourceId: 'image-b' }]); expect(errors).toEqual([]);
});

for (const embedded of [false, true]) test(`storyboard refresh preserves the exact selected parent and scene (embedded=${embedded})`, async ({ page }) => {
  await page.goto(`${harnessUrl}/?storyboards&embedded=${embedded}`);
  const parentId = embedded ? 'current' : 'old';
  if (embedded) await expect(page.getByLabel('Choose another plan')).toHaveCount(0);
  else await page.getByLabel('Choose another plan').selectOption('old');
  await page.getByLabel('Choose a scene to generate').selectOption('2');
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', parentId);
  await expect(page.locator('[data-scene-image]')).toHaveAttribute('data-scene-image', '2');
  await page.getByRole('button', { name: 'Begin refresh', exact: true }).click();
  await expect(page.locator('[data-scene-image]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish refresh', exact: true }).click();
  if (embedded) await expect(page.getByLabel('Choose another plan')).toHaveCount(0);
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', parentId);
  await expect(page.locator('[data-scene-image]')).toHaveAttribute('data-scene-image', '2');
  await expect(page.locator('[data-scene-image]')).toHaveAttribute('data-image-storyboard', parentId);
  await page.locator('[data-scene-image]').click();
  await expect(page.locator('[data-image-request]')).toHaveText(JSON.stringify({ claimIds: [`claim-${parentId}`], request: { storyboardAssetId: parentId, sceneIndex: 2 } }));
});

for (const action of ['Remove newest', 'Reject newest']) test(`storyboard new-result focus does not resurrect superseded selection after ${action}`, async ({ page }) => {
  await page.goto(`${harnessUrl}/?storyboards`);
  await page.getByLabel('Choose another plan').selectOption('old');
  await page.getByRole('button', { name: 'Add newest', exact: true }).click();
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', 'newest');
  await page.getByRole('button', { name: action, exact: true }).click();
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', 'current');
});

test('storyboard video selection resets for a different parent with more scenes', async ({ page }) => {
  await page.goto(`${harnessUrl}/?storyboards&video=true`);
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', 'old');
  await page.getByRole('button', { name: 'Add current', exact: true }).click();
  await expect(page.locator('[data-active-storyboard]')).toHaveAttribute('data-active-storyboard', 'current');
  const selects = page.getByRole('region', { name: english.mechanismVideo.title }).locator('select');
  await expect(selects).toHaveCount(4);
  for (let index = 0; index < 4; index++) await selects.nth(index).selectOption(`current-${index}-1`);
  const generate = page.getByRole('region', { name: english.mechanismVideo.title }).getByRole('button', { name: english.mechanismVideo.generate });
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.locator('[data-video-request]')).toHaveText(JSON.stringify({ claimIds: ['claim-current'], request: {
    profile: 'content-driven-v1', storyboardAssetId: 'current', sceneImageAssetIds: [0, 1, 2, 3].map(index => `current-${index}-1`),
  } }));
});

test('an owner keeps or deletes the selected published image with recoverable errors and a single pending submission', async ({ page }) => {
  const errors: string[] = [];
  const writes: unknown[] = [];
  let releaseDelete: (() => void) | undefined;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'local-fixture-token' } });
    if (pathname === '/api/trash') {
      writes.push(request.postDataJSON());
      expect(request.headers()['x-csrf-token']).toBe('local-fixture-token');
      if (writes.length === 1) return route.fulfill({ status: 409, json: { error: { code: 'CONFLICT', message: 'Refresh the image state and try again.' } } });
      await new Promise<void>((resolve) => { releaseDelete = resolve; });
      return route.fulfill({ status: 201, json: { entry: { id: 'trash-b' } } });
    }
    expect(request.method()).toBe('GET');
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#def"/></svg>' });
  });
  try {
    await page.goto(harnessUrl);
    await expect(page.locator('[data-media-asset-actions="image-a"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve for publication', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next image', exact: true }).click();
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Image B');
    await page.getByRole('button', { name: 'Keep image', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Refresh the image state and try again.');
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash', exact: true }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.getByRole('button', { name: 'Working…', exact: true })).toBeDisabled();
    await expect.poll(() => writes.length).toBe(2);
    releaseDelete?.();
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toHaveCount(0);
    await expect(page.locator('[data-media-asset-actions="image-a"]')).toBeVisible();
    await expect(page.getByText('Moved “Image B” to Trash.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Trash to restore' })).toHaveAttribute('href', '/trash');
    expect(writes).toEqual([{ kind: 'asset', resourceId: 'image-b' }, { kind: 'asset', resourceId: 'image-b' }]);
    expect(errors).toEqual([]);
  } finally { releaseDelete?.(); }
});
