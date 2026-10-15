import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ro = uuid(1), version = uuid(2), runId = uuid(3), guideId = uuid(4), imageId = uuid(5);
const imageContentPath = `/api/research-objects/${ro}/versions/${version}/presentation-assets/${imageId}/content`;
const core = { schemaVersion: '0.1.0', problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Result', limitations: 'Limits', reproducibility: 'Methods' };
const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setup(page: Page, restore: boolean) {
  const state = { complete: false, unavailableOnce: false, actorId: 'first-image-user', versionId: version,
    submissions: [] as Record<string, unknown>[], submissionKeys: [] as string[],
    loseResponseOnce: false, withPublishedVersion: false, unexpectedWrites: [] as string[], originGets: 0, exactTaskGets: 0,
    runGets: [] as Array<{ actorId: string; runId?: string; originGuideTaskId?: string }> };
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
    const request = route.request(), url = new URL(request.url()), path = url.pathname, actorId = state.actorId;
    if (path === '/api/auth/me') return reply(route, { userId: state.actorId, email: 'image@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' });
    if (path === '/api/csrf-token') return reply(route, { csrfToken: 'first-image-csrf' });
    if (request.method() === 'POST' && path === '/api/agent/sessions') return reply(route, { session: { id: uuid(6) } }, 201);
    if (request.method() === 'POST' && path === '/api/agent/tasks') {
      state.submissions.push(request.postDataJSON()); state.submissionKeys.push(request.headers()['idempotency-key']);
      if (state.loseResponseOnce) { state.loseResponseOnce = false; return route.abort('connectionreset'); }
      return reply(route, { task: task() }, 201);
    }
    if (request.method() === 'POST' && path === `/api/research-objects/${ro}/commits`) return reply(route, { commit: { versionId: version, versionNo: 1, commitId: uuid(8) } }, 201);
    if (request.method() === 'PUT' && path === `/api/sdf/${ro}`) return reply(route, { sdf: { core } });
    if (request.method() !== 'GET') { state.unexpectedWrites.push(request.method() + ' ' + path); return reply(route, { error: { message: 'Unexpected write' } }, 400); }
    if (path === '/api/workspaces') return reply(route, { workspaces: [{ id: uuid(9), name: 'Lab', role: 'owner', status: 'active' }] });
    if (path === '/api/research-objects') return reply(route, { researchObjects: [] });
    if (path === '/api/ingestion') return reply(route, { tasks: [] });
    if (path === `/api/research-objects/${ro}`) return reply(route, { researchObject: {
      id: ro, workspaceId: uuid(9), title: 'First image', status: 'draft', visibility: 'private', version: 1,
      ...(state.withPublishedVersion ? { publicId: 'OSR-2026-000024' } : {}), sdf: { core, nodes: [] } } });
    if (path.endsWith('/ingestion')) return reply(route, { researchObjectId: ro, version: 1, tasks: [], latestConfirmation: null });
    if (path.endsWith('/authors')) return reply(route, { authors: [] });
    if (path.endsWith('/versions')) return reply(route, { versions: [
      { versionId: state.versionId, versionNo: state.withPublishedVersion ? 2 : 1, status: 'draft', publicationNo: null },
      ...(state.withPublishedVersion ? [{ versionId: uuid(21), versionNo: 1, status: 'published', publicationNo: 1 }] : []),
    ] });
    if (path === `/api/versions/${state.versionId}`) return reply(route, { version: { versionId: state.versionId, snapshot: { core, artifacts: [] } } });
    if (path === `/api/research-objects/${ro}/versions/${state.versionId}/claims`) return reply(route, { claims: [] });
    if (path.endsWith('/record')) return reply(route, { record: { objectId: ro, versionId: state.versionId, versionNo: 1, citation: { title: 'First image' }, sdf: core, claims: [], evidence: [], manifest: [], media: [] } });
    if (path === '/api/agent/tasks') return reply(route, { tasks: restore ? [task()] : [] });
    if (path === `/api/agent/tasks/${guideId}`) { state.exactTaskGets++; return reply(route, { task: task() }); }
    if (path.endsWith('/hermes-runs') || path.endsWith(`/hermes-runs/${runId}`)) {
      state.runGets.push({ actorId, ...(path.endsWith(`/hermes-runs/${runId}`) ? { runId } : {}),
        ...(url.searchParams.has('originGuideTaskId') ? { originGuideTaskId: url.searchParams.get('originGuideTaskId')! } : {}) });
      if (url.searchParams.has('originGuideTaskId')) { expect(url.searchParams.get('originGuideTaskId')).toBe(guideId); state.originGets++; }
      if (state.unavailableOnce) { state.unavailableOnce = false; return reply(route, { error: { message: 'Temporarily unavailable' } }, 503); }
      return reply(route, { run: run() });
    }
    if (path === `/api/research-objects/${ro}/versions/${state.versionId}/presentation-assets`
      || path === `/api/research-objects/${ro}/versions/${version}/presentation-assets`) return reply(route, {
      assets: state.complete && path === `/api/research-objects/${ro}/versions/${version}/presentation-assets` ? [{ id: imageId, researchObjectId: ro, versionId: version,
      kind: 'image', status: 'draft', label: 'Private first illustration', generator: 'Synclip', generatorVersion: 'gpt-image-2.5',
      contentHash: 'a'.repeat(64), sourceClaimIds: [], createdAt: '2026-10-13', updatedAt: '2026-10-13' }] : [] });
    if (path === `/api/research-objects/${ro}/versions/${version}/presentation-assets/${imageId}/content`) return route.fulfill({ contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=', 'base64') });
    return reply(route, { error: { message: 'Unexpected read: ' + path } }, 404);
  });
  return state;
}

async function privateResultLog(page: Page) {
  const guide = page.getByRole('dialog', { name: 'Hermes research guide', exact: true })
    .or(page.getByRole('complementary', { name: 'Hermes research guide', exact: true }));
  await expect(guide).toHaveCount(1);
  await expect(guide).toBeVisible();
  const log = guide.getByRole('log', { name: 'Conversation with Hermes', exact: true });
  await expect(log).toHaveCount(1);
  await expect(log).toBeVisible();
  return log;
}

async function expectPrivateImage(log: Locator) {
  const image = log.getByRole('img', { name: 'Private first illustration', exact: true });
  await expect(image).toHaveCount(1);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', imageContentPath);
  await expect(log.getByText('Your image is saved as a private draft. It has not been adopted or published.', { exact: true })).toBeVisible();
  await expect(log.getByRole('link', { name: 'View and manage images', exact: true }))
    .toHaveAttribute('href', `/research-objects/${ro}/edit?view=media&version=${version}`);
}

async function openResearchConversation(page: Page, versionId: string) {
  await page.goto(`${baseUrl}/research-objects/${ro}/edit?version=${versionId}`);
  await page.locator('[data-hermes-avatar-anchor="true"]').getByRole('button', { name: 'Open conversation', exact: true }).click();
  return privateResultLog(page);
}

test('current image request uses the saved-version marker once and shows the real private result', async ({ page }) => {
  const state = await setup(page, false);
  const log = await openResearchConversation(page, version);
  const input = page.getByLabel('Send an instruction to Hermes', { exact: true });
  await expect(input).toBeVisible();
  await input.fill('Generate one image explaining this paper.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(1);
  expect(state.submissions[0]).toMatchObject({ kind: 'workspace.guide', payload: { executionIntent: 'first-image',
    context: { presentation: { researchObjectId: ro, versionId: version } } } });
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  await expect(log.getByText(/Reply “confirm production”/)).toHaveCount(0);
  state.complete = true;
  await expectPrivateImage(log);
  expect(state.submissions).toHaveLength(1); expect(state.unexpectedWrites).toEqual([]);
});

test('the visible media shortcut submits through Hermes once without an extra Send', async ({ page }) => {
  const state = await setup(page, false);
  await page.goto(`${baseUrl}/research-objects/${ro}/edit?view=media`);
  const shortcut = page.getByRole('button', { name: 'Generate illustration', exact: true });
  await expect(shortcut).toBeEnabled();
  expect(state.submissions).toEqual([]);
  await shortcut.click();
  const log = await privateResultLog(page);
  await expect.poll(() => state.submissions.length).toBe(1);
  expect(state.submissions[0]).toMatchObject({ kind: 'workspace.guide', payload: { executionIntent: 'first-image',
    context: { presentation: { researchObjectId: ro, versionId: version } } } });
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  // The guide already succeeded, but its image child is still running.
  await shortcut.click();
  await expect.poll(() => state.originGets).toBeGreaterThan(0);
  expect(state.submissions).toHaveLength(1);
  await expect(page.locator('[data-scene-image]')).toHaveCount(0);
  state.complete = true;
  await expectPrivateImage(log);
  await expect(shortcut).toHaveCount(0);
  expect(state.unexpectedWrites).toEqual([]);
});

for (const priorPrefill of [false, true]) test(`shortcut response loss continues in place with the same goal and receipt; prior prefill=${priorPrefill}`, async ({ page }) => {
  const state = await setup(page, false); state.loseResponseOnce = true; state.withPublishedVersion = priorPrefill;
  await page.goto(`${baseUrl}/research-objects/${ro}/edit?view=media`);
  const input = page.getByLabel('Send an instruction to Hermes', { exact: true });
  if (priorPrefill) {
    await page.getByRole('button', { name: 'Preview publication update', exact: true }).click();
    await expect(input).toHaveValue('Preview publishing the current private draft as an update.');
    await page.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Generate illustration', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(1);
  const originalBody = state.submissions[0], originalKey = state.submissionKeys[0];
  await expect(input).toHaveValue('Generate one image');
  const resume = page.getByRole('button', { name: 'Continue request', exact: true });
  await expect(resume).toBeEnabled();
  // No reload, second shortcut or changed body is needed to continue this operation.
  await resume.click();
  await expect.poll(() => state.submissions.length).toBe(2);
  expect(state.submissionKeys[1]).toBe(originalKey);
  expect(state.submissions[1]).toEqual(originalBody);
  const log = await privateResultLog(page);
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  expect(state.unexpectedWrites).toEqual([]);
});

test('a lost POST response survives reload and explicit recovery keeps the original key and body', async ({ page }) => {
  const state = await setup(page, false); state.loseResponseOnce = true;
  const log = await openResearchConversation(page, version);
  const input = page.getByLabel('Send an instruction to Hermes', { exact: true });
  await input.fill('为这篇研究做一张图，使用淡彩；保留 x、y 与 ω。');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(1);
  const originalBody = state.submissions[0], originalKey = state.submissionKeys[0];
  expect(originalBody).toMatchObject({ payload: { goal: '为当前研究生成一张图，使用淡彩；保留 x、y 与 ω。', executionIntent: 'first-image' } });
  await page.reload();
  await page.locator('[data-hermes-avatar-anchor="true"]').getByRole('button', { name: 'Open conversation', exact: true }).click();
  await privateResultLog(page);
  await expect(log.getByText('The previous submission is unconfirmed. Continue to recover the same request without starting another image task.')).toBeVisible();
  expect(state.submissions).toHaveLength(1);
  await page.getByRole('button', { name: 'Continue request', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(2);
  expect(state.submissionKeys[1]).toBe(originalKey);
  expect(state.submissions[1]).toEqual(originalBody);
  await page.reload();
  await page.locator('[data-hermes-avatar-anchor="true"]').getByRole('button', { name: 'Open conversation', exact: true }).click();
  await privateResultLog(page);
  await expect.poll(() => state.exactTaskGets).toBeGreaterThan(0);
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  expect(state.submissions).toHaveLength(2);
  expect(state.unexpectedWrites).toEqual([]);
});

test('an account change does not restore another account image operation', async ({ page }) => {
  const state = await setup(page, false);
  const log = await openResearchConversation(page, version);
  await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('Generate one image explaining this paper.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => state.submissions.length).toBe(1);
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  const targetsOriginalRun = (request: { runId?: string; originGuideTaskId?: string }) => request.runId === runId || request.originGuideTaskId === guideId;
  await expect.poll(() => state.runGets.filter(request => request.actorId === 'first-image-user' && targetsOriginalRun(request)).length).toBeGreaterThan(0);
  const gets = state.exactTaskGets;
  state.actorId = 'another-user'; state.complete = true;
  await page.reload();
  await page.locator('[data-hermes-avatar-anchor="true"]').getByRole('button', { name: 'Open conversation', exact: true }).click();
  await privateResultLog(page);
  await expect(page.getByLabel('Send an instruction to Hermes', { exact: true })).toBeVisible();
  await expect(log.getByText('Tell me what to change or what image or video you need. You can edit the text directly and continue production or publication here.', { exact: true })).toBeVisible();
  await expect(log.getByRole('img', { name: 'Private first illustration', exact: true })).toHaveCount(0);
  await expect(log.getByText('Your image is saved as a private draft. It has not been adopted or published.', { exact: true })).toHaveCount(0);
  await expect(log.getByRole('link', { name: 'View and manage images', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Images & video', exact: true }).click();
  const media = page.locator('[data-workbench-section="media"]');
  await expect(media).toHaveCount(1);
  await expect(media).toBeVisible();
  const sharedImage = media.getByRole('img', { name: 'Private first illustration', exact: true });
  await expect(sharedImage).toHaveCount(1);
  await expect(sharedImage).toBeVisible();
  await expect(sharedImage).toHaveAttribute('src', imageContentPath);
  await privateResultLog(page);
  await expect(log.getByRole('img', { name: 'Private first illustration', exact: true })).toHaveCount(0);
  await expect(log.getByText('Your image is saved as a private draft. It has not been adopted or published.', { exact: true })).toHaveCount(0);
  await expect(log.getByRole('link', { name: 'View and manage images', exact: true })).toHaveCount(0);
  expect(state.runGets.filter(request => request.actorId === 'another-user' && targetsOriginalRun(request))).toEqual([]);
  expect(state.exactTaskGets).toBe(gets);
  expect(state.submissions).toHaveLength(1);
});

test('restoring a lost guide result and retrying a failed GET never submits another task', async ({ page }) => {
  const state = await setup(page, true); state.unavailableOnce = true;
  const log = await openResearchConversation(page, version);
  await log.getByRole('button', { name: 'Refresh original task' }).click();
  await expect(log.getByText('Hermes is planning and checking this illustration.')).toBeVisible();
  state.complete = true;
  await expectPrivateImage(log);
  expect(state.originGets).toBeGreaterThan(1); expect(state.submissions).toEqual([]); expect(state.unexpectedWrites).toEqual([]);
});

test('a prior version result is not displayed as the current draft', async ({ page }) => {
  const state = await setup(page, true); state.complete = true; state.versionId = uuid(20);
  const log = await openResearchConversation(page, state.versionId);
  await expect.poll(() => state.originGets).toBeGreaterThan(0);
  await expect(log.getByRole('img', { name: 'Private first illustration', exact: true })).toHaveCount(0);
  expect(state.submissions).toEqual([]); expect(state.unexpectedWrites).toEqual([]);
});
