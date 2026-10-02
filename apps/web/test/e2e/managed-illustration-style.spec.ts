import { expect, test, type Page } from 'playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ids = { ro: '10000000-0000-4000-8000-000000000001', version: '20000000-0000-4000-8000-000000000001',
  plan: '30000000-0000-4000-8000-000000000001', first: '40000000-0000-4000-8000-000000000001',
  image: '40000000-0000-4000-8000-000000000003', parent: '50000000-0000-4000-8000-000000000001',
  child: '50000000-0000-4000-8000-000000000002', claim: '60000000-0000-4000-8000-000000000001' };
const targetStyle = 'infographic:technical-schematic';

async function setup(page: Page, loseResponse = false, staleVersion = false, options: {
  platformRole?: 'user' | 'platform_admin'; role?: 'author' | 'viewer';
  capability?: 'null' | 'error'; waitForCapability?: Promise<void>;
} = {}) {
  let actor = 'ordinary-author';
  let runReads = 0;
  let discoveredAfterLoss = false;
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
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ userId: actor, email: 'author@example.invalid', displayName: 'Researcher', platformRole: options.platformRole ?? 'user', status: 'email_verified', level: 'free' });
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/workspaces') return json({ workspaces: [{ id: 'workspace', name: 'Research', type: 'team', role: options.role ?? 'author', status: 'active', createdAt: shared.createdAt }] });
    if (path === `/api/research-objects/${ids.ro}`) return json({ researchObject: { id: ids.ro, workspaceId: 'workspace',
      title: 'Ordinary author research', version: 1, status: 'draft', visibility: 'private', sdf: { core: {}, nodes: [] } } });
    if (path.endsWith('/versions')) return json({ versions: [version] });
    if (path.endsWith('/claims')) return json({ claims: [] });
    if (path.endsWith('/ingestion')) return json({ tasks: [], version });
    if (path.endsWith('/presentation-assets')) return json({ assets: [plan, ...images] });
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
  return { writes, capabilityQueries, runReads: () => runReads, discoveredAfterLoss: () => discoveredAfterLoss,
    changeActor: () => { actor = 'other-user'; } };
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
