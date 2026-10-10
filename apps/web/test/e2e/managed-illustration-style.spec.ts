import { expect, test, type Page } from 'playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ids = { ro: '10000000-0000-4000-8000-000000000001', version: '20000000-0000-4000-8000-000000000001',
  plan: '30000000-0000-4000-8000-000000000001', first: '40000000-0000-4000-8000-000000000001',
  image: '40000000-0000-4000-8000-000000000003', parent: '50000000-0000-4000-8000-000000000001',
  child: '50000000-0000-4000-8000-000000000002', claim: '60000000-0000-4000-8000-000000000001',
  secondClaim: '60000000-0000-4000-8000-000000000002' };
const targetStyle = 'infographic:technical-schematic';
const paperInstruction = "Explain the author's core scientific relationship in one research image.";

async function setup(page: Page, loseResponse = false, staleVersion = false, options: {
  platformRole?: 'user' | 'platform_admin'; role?: 'author' | 'viewer';
  capability?: 'null' | 'error'; waitForCapability?: Promise<void>;
  paper?: { sourceStatus?: 'succeeded' | 'failed'; claimVersionId?: string };
} = {}) {
  let actor = 'ordinary-author';
  let runReads = 0;
  let discoveredAfterLoss = false;
  const authReads: string[] = [];
  const capabilityQueries: string[] = [];
  const writes: Array<{ path: string; method: string; key: string; body: Record<string, unknown> }> = [];
  const choices = [{ styleId: 'article:watercolor', name: 'Watercolor', reason: 'Current sourced relation.' },
    { styleId: targetStyle, name: 'Technical schematic', reason: 'Clarifies the same scientific geometry.' }];
  const shared = { researchObjectId: ids.ro, versionId: ids.version, contentHash: 'a'.repeat(64), generator: 'Hermes',
    generatorVersion: '1', sourceClaimIds: [ids.claim], status: 'approved', canTransition: false, canApprove: false,
    label: 'presentation_not_evidence', createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z' };
  const plan = { ...shared, id: ids.plan, kind: 'interactive_html', storyboard: { locale: 'en', output: 'image', style: 'auto',
    narrative: true, document: { schemaVersion: 1, title: 'Three scenes', narrative: { mainMessage: 'Sourced geometry.', audience: 'Research readers' },
      scenes: [0, 1, 2].map(index => ({ title: `Scientific scene ${index + 1}`, narration: 'The supported scientific relation.',
        visualAction: 'Show the relation.', sourceClaimIds: [ids.claim],
        styleRecommendations: { selectedStyleId: 'article:watercolor', choices } })) } } };
  const images = [ids.first, ids.image].map((id, index) => ({ ...shared, id, kind: 'image',
    sceneImage: { storyboardAssetId: ids.plan, sceneIndex: index === 0 ? 0 : 2 } }));
  const child = { id: ids.child, actorId: 'ordinary-author', researchObjectId: ids.ro, versionId: ids.version, version: 1,
    profile: 'visual-narrative-v1', status: 'generating_storyboard', maxAgentTasks: 2, sourceClaimIds: [ids.claim], error: null,
    createdAt: shared.createdAt, updatedAt: shared.updatedAt,
    steps: [{ id: 'plan-step', stage: 'storyboard', ordinal: 0, status: 'running', agentTaskId: 'plan-task', error: null },
      { id: 'image-step', stage: 'scene_image', ordinal: 2, status: 'waiting', agentTaskId: null, error: null }] };
  const version = { versionId: ids.version, versionNo: 1, status: 'draft', commitId: 'commit', createdAt: shared.createdAt };
  const paperClaims = [ids.claim, ids.secondClaim].map((id, index) => ({ id, researchObjectId: ids.ro,
    versionId: options.paper?.claimVersionId ?? ids.version, kind: 'core', statement: `Reviewed paper relation ${index + 1}`,
    extractionStatus: options.paper?.sourceStatus ?? 'succeeded', updatedAt: shared.updatedAt,
    provenance: { source: 'reviewed_ingestion', sourceTaskId: 'reviewed-paper-task', sourceTaskLineage: 'reviewed-paper-task' } }));
  const guideTask = { id: 'paper-guide-task', kind: 'workspace.guide', sessionId: 'paper-guide-session',
    researchObjectId: ids.ro, status: 'succeeded', progress: 100, createdAt: shared.createdAt, result: {
      summary: 'Prepare a single research illustration.', nextSteps: [], needsMoreInformation: false,
      presentationDraft: { researchObjectId: ids.ro, versionId: ids.version, action: 'storyboard.create',
        style: 'auto', instruction: paperInstruction },
    } };
  const imagePlanTask = { id: 'paper-image-plan-task', kind: 'presentation.storyboard', researchObjectId: ids.ro,
    versionId: ids.version, status: 'running', progress: 5, createdAt: shared.createdAt };
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') {
      authReads.push(actor);
      return json({ userId: actor, email: 'author@example.invalid', displayName: 'Researcher', platformRole: options.platformRole ?? 'user', status: 'email_verified', level: 'free' });
    }
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/workspaces') return json({ workspaces: [{ id: 'workspace', name: 'Research', type: 'team', role: options.role ?? 'author', status: 'active', createdAt: shared.createdAt }] });
    if (path === `/api/research-objects/${ids.ro}`) return json({ researchObject: { id: ids.ro, workspaceId: 'workspace',
      title: 'Ordinary author research', version: 1, status: 'draft', visibility: 'private', sdf: { core: {}, nodes: [] } } });
    if (path.endsWith('/versions')) return json({ versions: [version] });
    if (path.endsWith('/claims')) return json({ claims: options.paper ? paperClaims : [] });
    if (path.endsWith('/ingestion')) return json({ tasks: [], version });
    if (path.endsWith('/presentation-assets')) return json({ assets: options.paper ? [] : [plan, ...images] });
    if (options.paper && request.method() === 'GET') {
      if (path === '/api/agent/tasks') return json({ tasks: [] });
      if (path === '/api/agent/sessions') return json({ sessions: [] });
      if (path === '/api/agent/tasks/paper-guide-task') return json({ task: guideTask });
      if (path.endsWith('/presentation-tasks/paper-image-plan-task')) return json({ task: imagePlanTask });
    }
    if (path.endsWith('/hermes-art-style-capability')) {
      expect(url.searchParams.get('versionId')).toBe(ids.version);
      const displayed = url.searchParams.get('imageAssetId');
      expect([ids.first, ids.image]).toContain(displayed);
      capabilityQueries.push(displayed!);
      if (options.waitForCapability) await options.waitForCapability;
      if (options.capability === 'error') return json({ error: { code: 'TEMPORARY_FAILURE', message: 'Capability unavailable' } }, 503);
      if (options.capability === 'null') return json({ styleContinuation: null });
      if (writes.length) discoveredAfterLoss = true;
      return json({ styleContinuation: displayed !== ids.image || (writes.length && !staleVersion) ? null : {
        runId: ids.parent, expectedVersion: staleVersion && writes.length ? 9 : 8, versionId: ids.version, imageAssetId: ids.image, storyboardAssetId: ids.plan,
        sceneIndex: 2, maxAgentTasks: 2, choices: choices.filter(choice => choice.styleId !== 'article:watercolor'),
      } });
    }
    if (path.endsWith(`/hermes-runs/${ids.child}`)) {
      runReads += 1;
      return json({ run: runReads < 2 ? child : { ...child, status: 'succeeded', availableImageCount: 1,
        steps: child.steps.map(step => ({ ...step, status: 'succeeded' })) } });
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push({ path, method: request.method(), key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      if (options.paper) {
        expect(request.method()).toBe('POST');
        if (path === '/api/agent/sessions') return json({ session: { id: 'paper-guide-session' } }, 201);
        if (path === '/api/agent/tasks') return json({ task: guideTask }, 201);
        expect(path).toBe(`/api/research-objects/${ids.ro}/versions/${ids.version}/presentation-assets/generations`);
        const generations = writes.filter(write => write.path.endsWith('/presentation-assets/generations'));
        if (loseResponse && generations.length === 1) return json({ error: { code: 'TEMPORARY_FAILURE', message: 'Unknown submission outcome' } }, 503);
        return json({ task: imagePlanTask }, 202);
      }
      expect(path).toBe(`/api/research-objects/${ids.ro}/hermes-runs/${ids.parent}/art-style-continuations`);
      expect(request.method()).toBe('POST');
      const persisted = await page.evaluate(() => Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('openscience:managed-image-style:')).map(([, value]) => JSON.parse(value)));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].key).toBe(writes.at(-1)!.key);
      expect(persisted[0].payload).toEqual(writes.at(-1)!.body);
      if (staleVersion && writes.length === 1) return json({ error: { code: 'CONCURRENT_UPDATE', message: 'Parent run changed' } }, 409);
      if (loseResponse && writes.length === 1) return route.abort('failed');
      return json({ run: child, taskIds: { storyboard: 'plan-task', sceneImage: null } }, 202);
    }
    if (path.endsWith('/content')) return route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="white"/></svg>' });
    return json({});
  });
  return { writes, authReads, capabilityQueries, runReads: () => runReads, discoveredAfterLoss: () => discoveredAfterLoss,
    changeActor: () => { actor = 'other-user'; } };
}

async function openPaperAction(page: Page) {
  await page.goto(`/research-objects/${ids.ro}/presentation?version=${ids.version}`);
  await page.locator('[data-presentation-workbench]').getByRole('button', { name: 'Ask Hermes to create', exact: true }).click();
  const composer = page.locator('#hermes-guide-goal');
  await composer.fill('Generate an image');
  await composer.press('Enter');
  const action = page.locator('[data-hermes-presentation-action="true"]');
  await expect(action).toBeVisible();
  return { action, composer };
}

test('ordinary author plans one paper image through the visible storyboard action with exact settings and claims', async ({ page }) => {
  const state = await setup(page, false, false, { paper: {} });
  await page.goto(`/research-objects/${ids.ro}/presentation?version=${ids.version}`);
  const sourceTools = page.locator('[data-source-tools="true"]');
  await sourceTools.locator(':scope > summary').click();
  const panel = sourceTools.locator('[data-storyboard-panel="true"]');
  const submit = panel.getByRole('button', { name: 'Plan one research image · 1 AI credit', exact: true });
  await expect(submit).toBeEnabled();
  await panel.getByText('Watercolor', { exact: true }).click();
  await panel.locator('details').getByText('Detailed instructions and narration', { exact: true }).click();
  await panel.getByLabel('Narration language').selectOption('zh');
  await panel.getByLabel('What should the explanation emphasize?').fill(paperInstruction);
  await submit.click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ method: 'POST',
    path: `/api/research-objects/${ids.ro}/versions/${ids.version}/presentation-assets/generations`,
    body: { kind: 'interactive_html', sourceClaimIds: [ids.claim, ids.secondClaim], storyboard: {
      locale: 'zh', style: 'watercolor', output: 'image', instruction: paperInstruction,
      narrative: true, narrativeSceneLimit: 1,
    } } });
  expect(state.writes[0].key).toBeTruthy();
  await expect(page.locator('[data-presentation-task="running"]')).toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test('ordinary author confirms a single paper image in Hermes and resumes an unknown response with the same exact request', async ({ page }) => {
  const state = await setup(page, true, false, { paper: {} });
  const { action, composer } = await openPaperAction(page);
  await expect(action).toContainText("Hermes will plan one research image explaining the paper's core relationship or conclusion.");
  await expect(action).toContainText('Reply “confirm production”');
  const generations = () => state.writes.filter(write => write.path.endsWith('/presentation-assets/generations'));
  expect(generations()).toHaveLength(0);
  await composer.fill('confirm production');
  await composer.press('Enter');
  await expect(action.getByRole('alert')).toContainText('Submission outcome is unknown');
  expect(generations()).toHaveLength(1);
  expect(generations()[0].body).toEqual({ kind: 'interactive_html', sourceClaimIds: [ids.claim, ids.secondClaim],
    storyboard: { locale: 'en', style: 'auto', output: 'image', instruction: paperInstruction,
      narrative: true, narrativeSceneLimit: 1 } });
  expect(generations()[0].key).toBeTruthy();
  await action.locator('details').getByText('Adjust style and detailed instructions', { exact: true }).click();
  await expect(action.getByLabel('Storyboard instructions')).toBeDisabled();
  await composer.fill('confirm production');
  await composer.press('Enter');
  await expect.poll(() => generations().length).toBe(2);
  expect(generations()[1]).toEqual(generations()[0]);
});

test('a fresh actor mismatch stops a new paper image before its generation request', async ({ page }) => {
  const state = await setup(page, false, false, { paper: {} });
  const { action, composer } = await openPaperAction(page);
  await expect(action).toContainText('Reply “confirm production”');
  const readsBefore = state.authReads.length;
  state.changeActor();
  await composer.fill('confirm production');
  await composer.press('Enter');
  await expect.poll(() => state.authReads.slice(readsBefore)).toContain('other-user');
  // The shared session owner clears the previous account's confirmation before its request can run.
  await expect(composer).toHaveValue('Generate an image');
  expect(state.writes.filter(write => write.path.endsWith('/presentation-assets/generations'))).toHaveLength(0);
});

for (const paper of [{ sourceStatus: 'failed' as const }, { claimVersionId: 'another-version' }]) {
  test(`Hermes does not submit a paper image from failed or foreign-version claims (${Object.keys(paper)[0]})`, async ({ page }) => {
    const state = await setup(page, false, false, { paper });
    const { action, composer } = await openPaperAction(page);
    await expect(action).toContainText('Confirm the extracted research content');
    await composer.fill('confirm production');
    await composer.press('Enter');
    expect(state.writes.filter(write => write.path.endsWith('/presentation-assets/generations'))).toHaveLength(0);
  });
}

async function openChoices(page: Page) {
  await page.goto(`/research-objects/${ids.ro}/presentation?version=${ids.version}`);
  const choices = page.locator(`[data-managed-style-image="${ids.image}"]`);
  await expect(choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true })).toBeEnabled();
  return choices;
}

test('ordinary author switches only displayed scene 2 and follows the managed child without manual approval', async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const choices = await openChoices(page);
  await expect(page.locator(`[data-presentation-result="${ids.first}"]`)).toBeVisible();
  await expect(choices.locator('[data-current-illustration-style]')).toContainText('Watercolor');
  await expect(choices.locator('[data-current-illustration-style]')).toContainText('Current sourced relation.');
  await expect(choices.locator('[data-current-illustration-style]').getByRole('button')).toHaveCount(0);
  await expect(choices).toContainText('up to 2 production tasks');
  const evidence = resolve(__dirname, '../../../../tmp/ro-journey-20260929');
  await mkdir(evidence, { recursive: true });
  await choices.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(evidence, 'managed-style-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => {
    const excess = document.documentElement.scrollWidth - innerWidth;
    if (excess <= 0) return [];
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter(element => element.getBoundingClientRect().right > innerWidth + .5)
      .map(element => ({ tag: element.tagName, className: element.className,
        right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width),
        position: getComputedStyle(element).position, visible: getComputedStyle(element).visibility,
        marker: element.getAttribute('data-hermes-global-companion') ?? element.getAttribute('data-hermes-performance-bubble') ?? element.getAttribute('data-hermes-menu-feedback') }))
      .slice(0, 15);
  })).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'managed-style-mobile-390.png'), fullPage: true });
  await choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/hermes\\?run=${ids.child}$`));
  await expect.poll(state.runReads).toBeGreaterThan(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({ expectedVersion: 8, versionId: ids.version, imageAssetId: ids.image, sceneIndex: 2, style: targetStyle });
  expect(state.writes[0].key).toBeTruthy();
  const result = page.locator(`a[href="/research-objects/${ids.ro}/overview?version=${ids.version}"]`);
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /approve|publish|review plan/i })).toHaveCount(0);
});

test('ordinary author explicitly resumes a lost style response with the original key when discovery becomes null', async ({ page }) => {
  const state = await setup(page, true);
  const choices = await openChoices(page);
  await choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true }).click();
  await expect(choices.getByRole('alert')).toContainText('submission outcome is unconfirmed');
  await page.reload();
  const resumed = page.locator(`[data-managed-style-image="${ids.image}"]`);
  await expect.poll(state.discoveredAfterLoss).toBe(true);
  const resume = resumed.getByRole('button', { name: 'Continue this operation', exact: true });
  await expect(resume).toBeEnabled();
  await expect(resumed).not.toContainText('up to 2 production tasks');
  expect(state.writes).toHaveLength(1);
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/hermes\\?run=${ids.child}$`));
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  await expect.poll(state.runReads).toBeGreaterThan(0);
});

test('known stale-version rejection offers an explicit fresh choice without replacing an uncertain request', async ({ page }) => {
  const state = await setup(page, false, true);
  const choices = await openChoices(page);
  await choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true }).click();
  await expect(choices.getByRole('alert')).toContainText('Nothing was created or charged');
  await page.reload();
  const restored = page.locator(`[data-managed-style-image="${ids.image}"]`);
  await expect(restored.getByRole('alert')).toContainText('Nothing was created or charged');
  expect(state.writes).toHaveLength(1);
  await restored.getByRole('button', { name: 'Reload style options', exact: true }).click();
  const action = restored.getByRole('button', { name: 'Use this style and generate a new image', exact: true });
  await expect(action).toBeEnabled();
  expect(state.writes).toHaveLength(1);
  await action.click();
  await expect(page).toHaveURL(new RegExp(`/hermes\\?run=${ids.child}$`));
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].key).not.toBe(state.writes[0].key);
  expect(state.writes[1].body).toEqual({ ...state.writes[0].body, expectedVersion: 9 });
  await expect.poll(state.runReads).toBeGreaterThan(0);
});

test('fresh actor mismatch stops an ordinary style continuation before its write', async ({ page }) => {
  const state = await setup(page);
  const choices = await openChoices(page);
  state.changeActor();
  await choices.getByRole('button', { name: 'Use this style and generate a new image', exact: true }).click();
  await expect(choices.getByRole('alert')).toContainText('account, version or source changed');
  expect(state.writes).toHaveLength(0);
});

test('administrator prefers the eligible managed multi-scene path without duplicate style controls or writes', async ({ page }) => {
  const state = await setup(page, false, false, { platformRole: 'platform_admin' });
  const choices = await openChoices(page);
  const target = page.locator(`[data-presentation-result="${ids.image}"]`);
  await expect(target.getByRole('region', { name: 'Illustration styles', exact: true })).toHaveCount(1);
  await expect(choices.locator('[data-current-illustration-style]')).toContainText('Current style');
  const action = target.getByRole('button', { name: 'Use this style and generate a new image', exact: true });
  await expect(action).toHaveCount(1);
  await expect(choices).not.toContainText('supports single-scene illustrations');
  await action.click();
  await expect(page).toHaveURL(new RegExp(`/hermes\\?run=${ids.child}$`));
  await expect.poll(state.runReads).toBeGreaterThan(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.sceneIndex).toBe(2);
  expect(state.writes[0].path).toContain('/art-style-continuations');
});

for (const capability of ['null', 'error'] as const) {
  test(`administrator fallback waits for known null, never loading or errors (${capability})`, async ({ page }) => {
    let release!: () => void;
    const waitForCapability = new Promise<void>(resolve => { release = resolve; });
    const state = await setup(page, false, false, { platformRole: 'platform_admin', capability, waitForCapability });
    await page.goto(`/research-objects/${ids.ro}/presentation?version=${ids.version}`);
    const target = page.locator(`[data-presentation-result="${ids.image}"]`);
    await expect.poll(() => state.capabilityQueries.includes(ids.image)).toBe(true);
    await expect(target.getByRole('region', { name: 'Illustration styles', exact: true })).toHaveCount(0);
    release();
    if (capability === 'null') {
      await expect(target.getByRole('region', { name: 'Illustration styles', exact: true })).toHaveCount(1);
      await expect(target).toContainText('supports single-scene illustrations');
      await expect(target).toContainText('Current style');
      await expect(target.locator('[data-managed-style-image]')).toHaveCount(0);
      await expect(target.getByRole('button', { name: 'Use this style and generate a new image', exact: true })).toBeDisabled();
    } else {
      await expect(target.getByRole('alert')).toContainText('Could not check style options');
      await expect(target).not.toContainText('supports single-scene illustrations');
      await expect(target.getByRole('button', { name: 'Use this style and generate a new image', exact: true })).toHaveCount(0);
    }
    expect(state.writes).toHaveLength(0);
  });
}

test('read-only viewer never discovers write-scoped managed capabilities', async ({ page }) => {
  const state = await setup(page, false, false, { role: 'viewer' });
  await page.goto(`/research-objects/${ids.ro}/presentation?version=${ids.version}`);
  await expect(page.locator(`[data-presentation-result="${ids.image}"]`)).toBeVisible();
  await expect(page.locator('[data-managed-style-image]')).toHaveCount(0);
  expect(state.capabilityQueries).toEqual([]);
  expect(state.writes).toHaveLength(0);
});
