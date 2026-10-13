import { expect, test, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ro = uuid(1), version = uuid(2), runId = uuid(3), guideId = uuid(4), imageId = uuid(5);
const core = { schemaVersion: '0.1.0', problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Result', limitations: 'Limits', reproducibility: 'Methods' };
const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setup(page: Page, restore: boolean) {
  const state = { complete: false, unavailableOnce: false, actorId: 'first-image-user', versionId: version,
    submissions: [] as Record<string, unknown>[], unexpectedWrites: [] as string[], originGets: 0 };
  const task = () => ({ id: guideId, sessionId: uuid(6), researchObjectId: ro, kind: 'workspace.guide',
    status: restore ? 'failed' : 'succeeded', progress: 100, retryCount: 0, canRetry: false, error: restore ? 'Response interrupted' : null,
    createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
    result: restore ? null : { summary: 'Creating one private illustration.', nextSteps: [], needsMoreInformation: false, firstImageRun: { runId, versionId: version } } });
  const run = () => ({ id: runId, actorId: 'first-image-user', researchObjectId: ro, versionId: version,
    status: state.complete ? 'succeeded' : 'generating_storyboard', version: 1, profile: 'visual-narrative-v1', maxAgentTasks: 2,
    sourceClaimIds: [], canRetryGeneration: false, error: null, steps: [{ id: uuid(7), stage: 'scene_image', ordinal: 0,
      status: state.complete ? 'succeeded' : 'waiting', agentTaskId: imageId, ...(state.complete ? { presentationAssetId: imageId } : {}), error: null }] });
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  await page.context().route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/auth/me') return reply(route, { userId: state.actorId, email: 'image@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' });
    if (path === '/api/csrf-token') return reply(route, { csrfToken: 'first-image-csrf' });
    if (request.method() === 'POST' && path === '/api/agent/sessions') return reply(route, { session: { id: uuid(6) } }, 201);
    if (request.method() === 'POST' && path === '/api/agent/tasks') {
      state.submissions.push(request.postDataJSON()); return reply(route, { task: task() }, 201);
    }
    if (request.method() === 'POST' && path === `/api/research-objects/${ro}/commits`) return reply(route, { commit: { versionId: version, versionNo: 1, commitId: uuid(8) } }, 201);
    if (request.method() === 'PUT' && path === `/api/sdf/${ro}`) return reply(route, { sdf: { core } });
    if (request.method() !== 'GET') { state.unexpectedWrites.push(request.method() + ' ' + path); return reply(route, { error: { message: 'Unexpected write' } }, 400); }
    if (path === '/api/workspaces') return reply(route, { workspaces: [{ id: uuid(9), name: 'Lab', role: 'owner', status: 'active' }] });
    if (path === '/api/research-objects') return reply(route, { researchObjects: [] });
    if (path === '/api/ingestion') return reply(route, { tasks: [] });
    if (path === `/api/research-objects/${ro}`) return reply(route, { researchObject: {
      id: ro, workspaceId: uuid(9), title: 'First image', status: 'draft', visibility: 'private', version: 1, sdf: { core, nodes: [] } } });
    if (path.endsWith('/ingestion')) return reply(route, { researchObjectId: ro, version: 1, tasks: [], latestConfirmation: null });
    if (path.endsWith('/authors')) return reply(route, { authors: [] });
    if (path.endsWith('/versions')) return reply(route, { versions: [{ versionId: state.versionId, versionNo: 1, status: 'draft', publicationNo: null }] });
    if (path === `/api/versions/${state.versionId}`) return reply(route, { version: { versionId: state.versionId, snapshot: { core, artifacts: [] } } });
    if (path === `/api/research-objects/${ro}/versions/${state.versionId}/claims`) return reply(route, { claims: [] });
    if (path.endsWith('/record')) return reply(route, { record: { objectId: ro, versionId: state.versionId, versionNo: 1, citation: { title: 'First image' }, sdf: core, claims: [], evidence: [], manifest: [], media: [] } });
    if (path === '/api/agent/tasks') return reply(route, { tasks: restore ? [task()] : [] });
    if (path === `/api/agent/tasks/${guideId}`) return reply(route, { task: task() });
    if (path.endsWith('/hermes-runs') || path.endsWith(`/hermes-runs/${runId}`)) {
      if (url.searchParams.has('originGuideTaskId')) { expect(url.searchParams.get('originGuideTaskId')).toBe(guideId); state.originGets++; }
      if (state.unavailableOnce) { state.unavailableOnce = false; return reply(route, { error: { message: 'Temporarily unavailable' } }, 503); }
      return reply(route, { run: run() });
    }
    if (path.endsWith('/presentation-assets')) return reply(route, { assets: state.complete ? [{ id: imageId, researchObjectId: ro, versionId: version,
      kind: 'image', status: 'draft', label: 'Private first illustration', generator: 'Synclip', generatorVersion: 'gpt-image-2.5',
      contentHash: 'a'.repeat(64), sourceClaimIds: [], createdAt: '2026-10-13', updatedAt: '2026-10-13' }] : [] });
    if (path.endsWith(`/presentation-assets/${imageId}/content`)) return route.fulfill({ contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=', 'base64') });
    return reply(route, { error: { message: 'Unexpected read: ' + path } }, 404);
  });
  return state;
}

async function openResearchConversation(page: Page, versionId: string) {
  await page.goto(`${baseUrl}/research-objects/${ro}/edit?version=${versionId}`);
  await page.locator('[data-hermes-avatar-anchor="true"]').getByRole('button', { name: 'Open conversation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide', exact: true })
    .or(page.getByRole('complementary', { name: 'Hermes research guide', exact: true }))).toBeVisible();
}

test('current image request uses the saved-version marker once and shows the real private result', async ({ page }) => {
  const state = await setup(page, false);
  await openResearchConversation(page, version);
  const input = page.getByLabel('Send an instruction to Hermes', { exact: true });
  await expect(input).toBeVisible();
  await input.fill('Generate one image explaining this paper.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(1);
  expect(state.submissions[0]).toMatchObject({ kind: 'workspace.guide', payload: { executionIntent: 'first-image',
    context: { presentation: { researchObjectId: ro, versionId: version } } } });
  await expect(page.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  await expect(page.getByText(/Reply “confirm production”/)).toHaveCount(0);
  state.complete = true;
  await expect(page.getByAltText('Private first illustration')).toBeVisible();
  await expect(page.getByText('Your image is saved as a private draft. It has not been adopted or published.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View and manage images' })).toHaveAttribute('href', `/research-objects/${ro}/presentation?version=${version}`);
  expect(state.submissions).toHaveLength(1); expect(state.unexpectedWrites).toEqual([]);
});

test('restoring a lost guide result and retrying a failed GET never submits another task', async ({ page }) => {
  const state = await setup(page, true); state.unavailableOnce = true;
  await openResearchConversation(page, version);
  await page.getByRole('button', { name: 'Refresh original task' }).click();
  await expect(page.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  state.complete = true;
  await expect(page.getByAltText('Private first illustration')).toBeVisible();
  expect(state.originGets).toBeGreaterThan(1); expect(state.submissions).toEqual([]); expect(state.unexpectedWrites).toEqual([]);
});

test('a prior version result is not displayed as the current draft', async ({ page }) => {
  const state = await setup(page, true); state.complete = true; state.versionId = uuid(20);
  await openResearchConversation(page, state.versionId);
  await expect.poll(() => state.originGets).toBeGreaterThan(0);
  await expect(page.getByAltText('Private first illustration')).toHaveCount(0);
  expect(state.submissions).toEqual([]); expect(state.unexpectedWrites).toEqual([]);
});
