import { expect, test, type Locator, type Page, type Route } from 'playwright/test';
import type { AgentTaskView, HermesResearchRun, IngestionTaskDetail, ResearchIngestion, SdfCore } from '../../lib/api';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const stageSelector = '[data-hermes-workspace-stage="true"]';
const hostSelector = '[data-hermes-avatar-anchor="true"]';
const inputSelector = '[data-hermes-input-owner="true"]';
const rigSelector = '[data-hermes-rig="live2d-wanko"]';
const canvasSelector = '[data-hermes-live2d-canvas="true"]';
const slotSelector = '.hermes-conversation-transcript > [data-hermes-conversation-companion="true"]';
const roPath = '/research-objects/ro-hermes';
const researchTitle = 'Coherent transport at the attosecond frontier';
const requests = new WeakMap<Page, { writes: string[]; unmocked: string[]; errors: string[] }>();

test.beforeEach(async ({ page }) => {
  const observed = { writes: [] as string[], unmocked: [] as string[], errors: [] as string[] };
  requests.set(page, observed);
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      const url = new URL(request.url());
      observed.writes.push(request.method() + ' ' + url.pathname + url.search);
    }
  });
  page.on('pageerror', (error) => observed.errors.push(error.message));
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  // Context routes survive page.unrouteAll; no undeclared API may reach a server.
  await page.context().route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const { pathname, searchParams } = url;
    if (route.request().method() === 'GET') {
      if (pathname === '/api/auth/me' && searchParams.size === 0) return json(route, { error: { code: 'SESSION_INVALID', message: 'Not signed in' } }, 401);
      if (pathname === '/api/workspaces' && searchParams.size === 0) return json(route, { workspaces: [{ id: 'workspace-hermes', name: 'Personal', type: 'personal', role: 'owner', status: 'active' }] });
      if (pathname === '/api/agent/tasks' && searchParams.get('actionable') === 'false') {
        if (searchParams.get('kind') === 'workspace.guide' && searchParams.size === 2) return json(route, { tasks: [] });
        const routeRo = new URL(page.url()).pathname.match(/^\/research-objects\/([^/]+)\//u)?.[1];
        if (searchParams.get('kind') === 'source.retrieve' && searchParams.get('recovery') === 'true'
          && searchParams.get('targetKind') === (routeRo ? 'research_object' : 'personal')
          && searchParams.get('researchObjectId') === (routeRo ?? null)
          && searchParams.size === (routeRo ? 5 : 4)) return json(route, { tasks: [] });
      }
    }
    const request = route.request().method() + ' ' + pathname + url.search;
    observed.unmocked.push(request);
    throw new Error('Unmocked API request: ' + request);
  });
});

test.afterEach(async ({ page }) => {
  const observed = requests.get(page)!;
  expect(observed.writes, 'Opening, moving and restoring Hermes must not write or start work').toEqual([]);
  expect(observed.unmocked, 'Only declared, scoped GET fixtures are allowed').toEqual([]);
  expect(observed.errors, 'Browser exceptions must not be hidden by application recovery').toEqual([]);
});

async function json(route: Route, body: unknown, status = 200) {
  // Page handlers take precedence over the context guard, so enforce read-only here too.
  if (route.request().method() !== 'GET') throw new Error('Fixture rejected non-GET: ' + route.request().method() + ' ' + route.request().url());
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockGet(page: Page, path: string, body: unknown, status = 200) {
  await page.route((url) => url.pathname + url.search === path, (route) => json(route, body, status));
}

const emptyCore: SdfCore = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
const reviewCore: SdfCore = { schemaVersion: '0.1.0', problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' };
const existingObject = {
  id: 'ro-hermes', workspaceId: 'workspace-hermes', publicId: 'OSR-2026-000042', title: researchTitle,
  visibility: 'private', status: 'draft', version: 2, sdf: { core: emptyCore },
};

async function mockWorkspace(page: Page) {
  page.on('console', (message) => { if (message.type() === 'error') requests.get(page)!.errors.push(message.text()); });
  // Legacy size/dock preferences must not replace the toolbar's automatic avatar.
  await page.addInitScript(() => localStorage.setItem('openscience:hermes-presence:workspace-current', 'original'));
  await mockGet(page, '/api/auth/me', {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  });
  await mockGet(page, '/api/research-objects?limit=20', { researchObjects: [{ ...existingObject, version: 2 }] });
  await mockGet(page, '/api/ingestion?actionable=true', { tasks: [] });
  await mockGet(page, '/api/ingestion?actionable=true&researchObjectId=ro-hermes', { tasks: [] });
  await mockGet(page, '/api/research-objects/ro-hermes/ingestion', { researchObjectId: 'ro-hermes', version: 2, tasks: [], latestConfirmation: null });
  await mockGet(page, '/api/research-objects/ro-hermes/authors', { authors: [] });
  await mockGet(page, '/api/research-objects/ro-hermes/versions', { versions: [] });
  await mockGet(page, '/api/research-objects/ro-hermes', { researchObject: existingObject });
}

// Reuse the read payload from hermes-dashboard.spec.ts:905–944 in this source tree.
const reviewDetail: IngestionTaskDetail = {
  batchId: 'batch-review', researchObjectId: 'ro-hermes', version: 2,
  task: {
    agentTaskId: 'agent-review', artifactId: 'artifact-review', error: null, id: 'task-review',
    logicalPath: 'manuscript.pdf', retryCount: 0, state: 'needs_review', result: { core: reviewCore },
  },
};

async function mockReview(page: Page) {
  await mockGet(page, '/api/ingestion/tasks/task-review', reviewDetail);
  await mockGet(page, '/api/research-objects/ro-hermes/ingestion', {
    researchObjectId: 'ro-hermes', version: 2, tasks: [{ ...reviewDetail.task, confirmation: null }], latestConfirmation: null,
  } satisfies ResearchIngestion);
  await mockGet(page, '/api/research-objects/ro-hermes/hermes-runs?ingestionTaskId=task-review', { run: null });
}

async function mockPublishedPreview(page: Page) {
  // edit/page.tsx:222–235, lib/research-materials.ts:12–20 and ResearchPresentation.tsx:249–252 consume these reads.
  await mockGet(page, '/api/research-objects/ro-hermes', { researchObject: { ...existingObject, sdf: { core: reviewCore } } });
  await mockGet(page, '/api/research-objects/ro-hermes/versions', { versions: [{
    versionId: 'version-review', versionNo: 3, version: 2, publicationNo: 1, status: 'published',
    createdAt: '2026-10-08T00:00:00.000Z', publishedAt: '2026-10-08T00:00:00.000Z',
  }] });
  await mockGet(page, '/api/versions/version-review', { version: { versionId: 'version-review', snapshot: { core: reviewCore, artifacts: [] } } });
  await mockGet(page, '/api/research-objects/ro-hermes/versions/version-review/record', { record: {
    objectId: 'ro-hermes', versionId: 'version-review', recordState: 'recorded', sdf: reviewCore, manifest: [], claims: [], evidence: [],
  } });
  await mockGet(page, '/api/research-objects/ro-hermes/versions/version-review/claims', { claims: [] });
  await mockGet(page, '/api/research-objects/ro-hermes/versions/version-review/presentation-assets', { assets: [] });
}

function guide(page: Page) {
  return page.getByRole('dialog', { name: 'Hermes research guide', exact: true })
    .or(page.getByRole('complementary', { name: 'Hermes research guide', exact: true }));
}

function graphic(page: Page, includeHidden = false) {
  return page.locator(hostSelector).getByRole('button', { name: 'Open conversation', exact: true, includeHidden });
}

function label(page: Page, includeHidden = false) {
  return page.locator('[data-hermes-avatar-entry="true"]').getByRole('button', { name: /^Open conversation · .+/u, includeHidden });
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

async function assertAvatar(page: Page, placement: 'viewport' | 'document-flow' = 'viewport', modalMenuOpen = false) {
  const stage = page.locator(stageSelector);
  const host = page.locator(hostSelector);
  // An open modal menu hides outside controls from the accessibility tree, not from layout.
  const input = graphic(page, modalMenuOpen);
  const entryLabel = label(page, modalMenuOpen);
  if (modalMenuOpen) {
    await expect(page.getByRole('menu', { name: 'Hermes action menu', exact: true })).toBeVisible();
    await expect(input).toHaveAttribute('data-hermes-menu-open', 'true');
  }
  await expect(page.locator('[data-hermes-avatar-entry="true"]')).toHaveCount(1);
  await expect(host).toHaveCount(1);
  await expect(host.locator(stageSelector)).toHaveCount(1);
  await expect(stage).toHaveAttribute('data-hermes-avatar', 'true');
  await expect(stage).toHaveAttribute('data-hermes-compact', 'true');
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '64');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(stage).toHaveAttribute('data-hermes-in-conversation', 'false');
  await expect(stage).toHaveAttribute('data-hermes-assistant-open', 'false');
  await expect(guide(page)).toHaveCount(0);
  await expect(page.locator(slotSelector)).toHaveCount(0);
  await expect(input).toHaveAttribute('data-hermes-input-owner', 'true');
  if (modalMenuOpen) await expect(input).toHaveAttribute('aria-label', 'Open conversation');
  else await expect(input).toHaveAccessibleName('Open conversation');
  await expect(input).toBeEnabled();
  await expect(entryLabel).toHaveClass('hermes-avatar-entry-label');
  await expect(entryLabel).toContainText('Hermes');
  await expect(entryLabel).toHaveAttribute('aria-expanded', 'false');
  for (const viewport of [host, stage, input, host.locator('[data-hermes-compact-placement]')]) {
    await expect(viewport).toBeVisible();
    await expect.poll(async () => {
      const bounds = await viewport.boundingBox();
      return bounds && { width: bounds.width, height: bounds.height };
    }).toEqual({ width: 64, height: 64 });
  }
  await expect(input).toHaveCSS('overflow', 'hidden');
  // The 160px composition is clipped by the 64px button; its carrier AABB is not a work collision.
  const composition = input.locator('[data-hermes-companion-actor="true"]');
  const compositionSize = await composition.evaluate((node) => {
    const { width, height } = node.getBoundingClientRect();
    return { width, height };
  });
  expect(compositionSize).toEqual({ width: 160, height: 160 });
  // Read related boxes in one browser task while their shared page-entry animation runs.
  const { visible, frame, stageBounds } = await host.evaluate((anchor) => {
    const currentStage = anchor.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
    const currentInput = currentStage?.querySelector<HTMLElement>('[data-hermes-input-owner="true"]');
    if (!currentStage || !currentInput) throw new Error('Avatar renderer is not inside its page-owned frame');
    const bounds = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return { visible: bounds(currentInput), frame: bounds(anchor), stageBounds: bounds(currentStage) };
  });
  expect(visible).toEqual(frame);
  expect(stageBounds).toEqual(frame);
  const viewport = page.viewportSize()!;
  expect(visible.x).toBeGreaterThanOrEqual(0);
  expect(visible.x + visible.width).toBeLessThanOrEqual(viewport.width);
  if (placement === 'viewport') {
    expect(visible.y).toBeGreaterThanOrEqual(0);
    expect(visible.y + visible.height).toBeLessThanOrEqual(viewport.height);
  } else {
    // A page-owned avatar scrolls with its real header after query navigation or field focus.
    const documentBounds = await page.evaluate(() => ({ scrollY: window.scrollY, height: document.documentElement.scrollHeight }));
    expect(frame.y + documentBounds.scrollY).toBeGreaterThanOrEqual(0);
    expect(frame.y + documentBounds.scrollY + frame.height).toBeLessThanOrEqual(documentBounds.height);
  }
  const protectedWork = await input.evaluate((button) => Array.from(document.querySelectorAll('[data-hermes-protected="true"]'))
    .filter((region) => !region.contains(button)) // Exclude the avatar's own toolbar/header.
    .map((region) => { const box = region.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; })
    .filter((box) => box.width > 0 && box.height > 0));
  expect(protectedWork.some((region) => overlaps(visible, region))).toBe(false);
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
  await expect(stage).not.toHaveAttribute('data-hermes-guide-target', /.+/u);
  await expect(stage.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'false');
  await expect(stage.locator('[data-hermes-performance-bubble="true"]:visible')).toHaveCount(0);
}

async function assertConversation(page: Page, role: 'dialog' | 'complementary' = 'dialog') {
  const conversation = page.getByRole(role, { name: 'Hermes research guide', exact: true });
  await expect(guide(page)).toHaveCount(1);
  await expect(conversation).toBeVisible();
  const slot = page.locator(slotSelector);
  await expect(slot).toHaveCount(1);
  await expect(conversation.locator(slotSelector)).toHaveCount(1);
  await expect(slot.locator(stageSelector)).toHaveCount(1);
  const stage = page.locator(stageSelector);
  await expect(stage).toHaveAttribute('data-hermes-in-conversation', 'true');
  await expect(stage).toHaveAttribute('data-hermes-compact', 'false');
  expect(await stage.getAttribute('data-hermes-avatar')).toBeNull();
  await expect(stage).toHaveAttribute('data-hermes-assistant-open', 'true');
  await expect(stage).toBeVisible();
  await expect(stage).toHaveCSS('opacity', '1');
  await expect(stage).not.toHaveAttribute('aria-hidden', 'true');
  await expect(stage).not.toHaveAttribute('inert', '');
  await expect(stage.locator(inputSelector)).toHaveAttribute('tabindex', '-1');
  await expect(page.locator(hostSelector).locator(stageSelector)).toHaveCount(0);
  await expect.poll(() => slot.evaluate((node) => {
    const current = node.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
    const size = Math.min(360, node.clientWidth, node.clientHeight);
    const box = current?.getBoundingClientRect();
    return size > 0 && Number(current?.dataset.hermesStageSize) === size && box?.width === size && box.height === size;
  })).toBe(true);
  await expect(conversation.locator('.hermes-conversation-composer textarea')).toBeEditable();
  await expect(conversation.getByRole('button', { name: 'Close Hermes', exact: true })).toBeEnabled();
}

async function captureRenderer(page: Page) {
  const stage = page.locator(stageSelector);
  const identity = await stage.evaluateHandle((node) => ({
    stage: node, canvas: node.querySelector('[data-hermes-live2d-canvas="true"]'),
    rig: node.querySelector('[data-hermes-rig="live2d-wanko"]'),
    carrier: node.closest('[data-hermes-portal-carrier="true"]'),
    generation: node.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-runtime-generation'),
  }));
  return {
    async assert() {
      expect(await identity.evaluate((original) => {
        const current = document.querySelector('[data-hermes-workspace-stage="true"]');
        return Boolean(original.canvas && original.rig && original.carrier && original.stage.isConnected)
          && current === original.stage && current?.querySelector('[data-hermes-live2d-canvas="true"]') === original.canvas
          && current?.querySelector('[data-hermes-rig="live2d-wanko"]') === original.rig
          && current?.closest('[data-hermes-portal-carrier="true"]') === original.carrier
          && original.rig?.getAttribute('data-hermes-runtime-generation') === original.generation;
      })).toBe(true);
      await expect(page.locator(stageSelector)).toHaveCount(1);
      await expect(page.locator(canvasSelector)).toHaveCount(1);
      await expect(page.locator(rigSelector)).toHaveCount(1);
      await expect(page.locator('[data-hermes-portal-carrier="true"]')).toHaveCount(1);
    },
    dispose: () => identity.dispose(),
  };
}

async function assertLive(page: Page) {
  const rig = page.locator(rigSelector);
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig.locator(canvasSelector)).toBeVisible();
  await expect(page.locator('[data-hermes-runtime-owner="running"]')).toHaveCount(1);
  const visibleAt = await page.evaluate(() => performance.now());
  await expect.poll(async () => Number(await rig.getAttribute('data-hermes-last-draw-at') ?? 0), { timeout: 20_000 }).toBeGreaterThan(visibleAt);
}

async function closeTo(page: Page, opener: Locator, escape = false) {
  const exactOpener = await opener.elementHandle();
  expect(exactOpener).not.toBeNull();
  try {
    if (escape) await guide(page).getByRole('button', { name: 'Close Hermes', exact: true }).press('Escape');
    else await guide(page).getByRole('button', { name: 'Close Hermes', exact: true }).click();
    await assertAvatar(page);
    await expect(opener).toBeFocused();
    expect(await exactOpener!.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
  } finally { await exactOpener?.dispose(); }
}

async function enterEditor(page: Page) {
  await page.locator('section[aria-labelledby="research-list-title"]').getByRole('link', { name: new RegExp(researchTitle) }).click();
  await expect(page).toHaveURL(new RegExp(roPath + '/edit$'));
}

test('only the primary left pointer invokes the toolbar avatar, without capture or drag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(baseUrl + '/dashboard?hermes-motion=reduced', { waitUntil: 'networkidle' });
  await assertAvatar(page);
  const stage = page.locator(stageSelector);
  const input = graphic(page);
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '0');
  await input.click({ button: 'right' });
  await expect(page.locator('[data-hermes-action-menu="true"]')).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '0');
  await expect(guide(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  const secondary = async () => input.evaluate((button) => {
    for (const type of ['pointerdown', 'pointerup']) button.dispatchEvent(new PointerEvent(type, {
      bubbles: true, button: 0, isPrimary: false, pointerId: 41, pointerType: 'touch',
    }));
    return { input: button.hasPointerCapture(41), stage: button.closest('[data-hermes-workspace-stage="true"]')!.hasPointerCapture(41) };
  });
  expect(await secondary()).toEqual({ input: false, stage: false });
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '0');
  await expect(guide(page)).toHaveCount(0);
  const box = (await input.boundingBox())!;
  await page.mouse.move(box.x + 32, box.y + 32);
  await page.mouse.down();
  expect(await secondary()).toEqual({ input: false, stage: false });
  expect(await input.evaluate((button) => button.hasPointerCapture(1) || button.closest('[data-hermes-workspace-stage="true"]')!.hasPointerCapture(1))).toBe(false);
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '1');
  await assertConversation(page);
  await closeTo(page, page.locator(stageSelector).locator(inputSelector));
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '1');
});

test('the 64px toolbar avatar stays in its page frame during pointer travel and menus', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
  for (const width of [390, 800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertAvatar(page);
    const host = page.locator(hostSelector);
    const input = graphic(page);
    const box = (await input.boundingBox())!;
    const before = await host.boundingBox();
    await page.mouse.move(box.x + 32, box.y + 32);
    await page.mouse.down();
    await page.mouse.move(box.x + 96, box.y + 48, { steps: 4 });
    await expect(page.locator(stageSelector)).toHaveAttribute('data-hermes-dragging', 'false');
    await page.mouse.up();
    await page.mouse.move(8, 8);
    await expect.poll(() => input.evaluate((button) => button.matches(':active'))).toBe(false);
    expect(await host.boundingBox()).toEqual(before);
    await expect(guide(page)).toHaveCount(0);
    // A short viewport and positive scroll expose the legacy menu pre-scroll;
    // the toolbar avatar remains fully visible throughout the actual menu interaction.
    await page.setViewportSize({ width, height: 450 });
    await page.evaluate(() => window.scrollTo(0, 8));
    expect(await page.evaluate(() => window.scrollY)).toBe(8);
    await assertAvatar(page);
    for (const openMenu of ['pointer', 'keyboard']) {
      const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      const bounds = await host.boundingBox();
      const translate = await page.locator(stageSelector).evaluate((node) => (node as HTMLElement).style.translate);
      if (openMenu === 'pointer') await input.click({ button: 'right' });
      else { await input.focus(); await input.press('Shift+F10'); }
      await expect(page.locator('[data-hermes-action-menu="true"]')).toBeVisible();
      await expect(page.locator('[data-hermes-action-menu="true"]')).toBeInViewport({ ratio: 1 });
      await assertAvatar(page, 'viewport', true); // Physical bounds catch the old mobile 120×140/28rem menu rules.
      expect(await host.boundingBox()).toEqual(bounds);
      expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(scroll);
      expect(await page.locator(stageSelector).evaluate((node) => (node as HTMLElement).style.translate)).toBe(translate);
      await expect(page.locator('[data-hermes-menu-layout-shift]')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-hermes-action-menu="true"]')).toHaveCount(0);
      await expect(input).toBeFocused();
      await assertAvatar(page);
      expect(await host.boundingBox()).toEqual(bounds);
      expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(scroll);
    }
  }
  for (const kind of ['desktop', 'mobile']) expect(await page.evaluate((key) => localStorage.getItem(key), 'openscience:hermes-dock:v1:workspace-current:' + kind)).toBeNull();
});

test('legacy mobile dock history cannot replace the page-owned avatar at any breakpoint', async ({ page }) => {
  const desktopKey = 'openscience:hermes-dock:v1:workspace-current:desktop';
  const mobileKey = 'openscience:hermes-dock:v1:workspace-current:mobile';
  const mobilePreference = JSON.stringify({ activity: 'balanced', particles: true, proactiveHints: true, sound: false, xRatio: .5, yRatio: .12 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: mobileKey, value: mobilePreference });
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
  for (const width of [390, 800, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await assertAvatar(page);
    expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBe(mobilePreference);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await assertAvatar(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBe(mobilePreference);
});

for (const width of [1440, 800, 390]) {
  test('one live renderer survives avatar/conversation moves and resizes at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkspace(page);
    await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
    await assertAvatar(page);
    await assertLive(page);
    const identity = await captureRenderer(page);
    try {
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await graphic(page).click();
        await assertConversation(page);
        await assertLive(page);
        const menu = page.locator(stageSelector).locator('[data-hermes-pet-menu-button="true"]');
        await guide(page).getByRole('button', { name: 'Close Hermes', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(menu).toBeFocused();
        await menu.press('Enter');
        await expect(page.locator('[data-hermes-action-menu="true"]')).toBeVisible();
        await page.locator('[data-hermes-action-key="greet"]').click();
        await identity.assert();
        await page.setViewportSize({ width: width <= 1100 ? 1440 : 390, height: 844 });
        await assertConversation(page);
        await assertLive(page);
        await identity.assert();
        await closeTo(page, page.locator(stageSelector).locator(inputSelector), cycle === 1);
        await identity.assert();
        await assertLive(page);
        await page.setViewportSize({ width, height: 900 });
        await assertAvatar(page);
        await identity.assert();
      }
    } finally { await identity.dispose(); }
  });
}

test('Hermes mounts and draws the real Wanko portrait in the clipped avatar and full original slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
  await assertAvatar(page);
  await assertLive(page);
  const rig = page.locator(rigSelector);
  await expect(rig.locator('canvas')).toHaveCount(1);
  const carrier = rig.locator('[data-hermes-carrier="true"]');
  await expect(carrier.locator('[data-hermes-carrier-interaction-hull="true"]')).toHaveCount(1);
  await expect(carrier.locator('[data-hermes-carrier-travel-hull="true"]')).toHaveCount(1);
  const identity = await captureRenderer(page);
  try {
    await graphic(page).click();
    await assertConversation(page);
    await assertLive(page);
    await expect(rig).toHaveAttribute('data-hermes-wanko-presentation', /quiet|evidence|trail|celebrate|missing/u);
    await identity.assert();
    await page.screenshot({ path: 'test/visual/out/hermes-live2d/wanko-dashboard.png', fullPage: true });
    await closeTo(page, page.locator(stageSelector).locator(inputSelector));
    await identity.assert();
  } finally { await identity.dispose(); }
});

test('Hermes Live2D visual harness exposes every production action on one real canvas', async ({ page }) => {
  await page.goto(baseUrl + '/_visual/hermes-live2d', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-live2d-harness="true"]')).toHaveCount(1);
  await expect(page.locator(rigSelector)).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-action-control]')).toHaveCount(32);
  await expect(page.locator(canvasSelector)).toHaveCount(1);
});

for (const width of [1440, 800, 390]) {
  test('client travel keeps one renderer and editor graphic/label return exact focus at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkspace(page);
    await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
    await assertLive(page);
    const identity = await captureRenderer(page);
    try {
      await enterEditor(page);
      await assertAvatar(page); // A plain editor visit is closed at every width.
      await expect(page.locator('[data-hermes-dashboard-local]')).toHaveCount(0);
      await expect(page.locator('[data-hermes-instance="single"]')).toHaveCount(1);
      await identity.assert();
      await assertLive(page);
      for (const entry of ['graphic', 'label']) {
        const opener = entry === 'graphic' ? graphic(page) : label(page);
        const physicalOpener = await opener.elementHandle();
        expect(physicalOpener).not.toBeNull();
        try {
          await opener.click();
          await assertConversation(page, width >= 1024 ? 'complementary' : 'dialog');
          await identity.assert();
          await assertLive(page);
          const returned = entry === 'graphic' ? page.locator(stageSelector).locator(inputSelector) : label(page);
          await closeTo(page, returned);
          expect(await physicalOpener!.evaluate((node) => document.activeElement === node && node.isConnected)).toBe(true);
          await returned.press('Enter');
          await assertConversation(page, width >= 1024 ? 'complementary' : 'dialog');
          await closeTo(page, returned, width < 1024);
          expect(await physicalOpener!.evaluate((node) => document.activeElement === node && node.isConnected)).toBe(true);
          await identity.assert();
        } finally { await physicalOpener?.dispose(); }
      }
    } finally { await identity.dispose(); }
  });
}

test('creation opens the complete companion from its avatar without starting work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
  const identity = await captureRenderer(page);
  try {
    await page.getByRole('link', { name: 'Start a research object', exact: true }).click();
    await expect(page).toHaveURL(/\/research-objects\/new\?mode=import$/u);
    await assertAvatar(page);
    await graphic(page).click();
    await assertConversation(page);
    await identity.assert();
    await closeTo(page, page.locator(stageSelector).locator(inputSelector));
    await identity.assert();
  } finally { await identity.dispose(); }
});

test('Hermes respects system motion and persists explicit preferences after conversation and travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(baseUrl + '/dashboard', { waitUntil: 'networkidle' });
  const stage = page.locator(stageSelector);
  await assertAvatar(page);
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await expect(stage.locator(canvasSelector)).toBeVisible();
  const enable = page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i });
  await expect(enable).toBeHidden();
  await graphic(page).click(); // Motion controls belong to the expanded conversation.
  await assertConversation(page);
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await assertLive(page);
  await page.getByRole('button', { name: /Reduce Hermes motion|关闭 Hermes 动效/i }).click();
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  expect(await page.evaluate(() => localStorage.getItem('openscience.hermes.motion'))).toBe('reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(stage.locator('.hermes-companion-actor')).toHaveCSS('animation-name', 'none');
  await expect(stage.locator('.hermes-guide-nudge')).toHaveCSS('transition-duration', '0s');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=full'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=reduced'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await expect(enable).toBeVisible();
  await closeTo(page, page.locator(stageSelector).locator(inputSelector));
  await page.addInitScript(() => {
    const states: string[] = [];
    Object.defineProperty(window, '__hermesMotionBootStates', { configurable: true, value: states });
    const sample = () => {
      const current = document.querySelector('[data-hermes-workspace-stage="true"]');
      if (current) states.push(current.getAttribute('data-hermes-motion-preference') + ':' + current.querySelectorAll('[data-hermes-articulated-canvas="true"]').length);
    };
    new MutationObserver(sample).observe(document, { attributes: true, childList: true, subtree: true });
  });
  await enterEditor(page);
  await page.reload({ waitUntil: 'networkidle' });
  await assertAvatar(page);
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  const bootStates = await page.evaluate(() => (window as typeof window & { __hermesMotionBootStates: string[] }).__hermesMotionBootStates);
  expect(bootStates.some((value) => value.startsWith('full:'))).toBe(false);
  expect(await page.evaluate(() => window.location.search)).not.toContain('hermes-motion');
});

for (const width of [1440, 390]) {
  for (const action of ['preview', 'review']) {
    test('external editor ' + action + ' retains its real opener at ' + width + 'px', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockWorkspace(page);
      if (action === 'preview') await mockPublishedPreview(page);
      else await mockReview(page);
      await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
      await enterEditor(page);
      await assertAvatar(page);
      await assertLive(page);
      const identity = await captureRenderer(page);
      try {
        if (action === 'review') {
          // Select the existing source in the original Drawer, then close before using the outside control.
          await graphic(page).click();
          await assertConversation(page, width >= 1024 ? 'complementary' : 'dialog');
          await guide(page).locator('details').filter({ has: page.locator('#ingestion-proposal-heading') }).locator('summary').click();
          await guide(page).getByRole('combobox').selectOption('task-review');
          await expect(page).toHaveURL(new RegExp(roPath + '/edit\\?ingestionTask=task-review$'));
          await expect(guide(page).locator('#ingestion-proposal-heading')).toBeVisible();
          await closeTo(page, page.locator(stageSelector).locator(inputSelector));
        }
        const opener = page.getByRole('button', { name: action === 'preview' ? 'Preview publication update' : 'Review pending analysis in Hermes', exact: true });
        await expect(opener).toBeEnabled();
        const physicalOpener = await opener.elementHandle();
        expect(physicalOpener).not.toBeNull();
        try {
          await opener.click();
          await assertConversation(page, width >= 1024 ? 'complementary' : 'dialog');
          await identity.assert();
          if (action === 'preview') await expect(guide(page).locator('.hermes-conversation-composer textarea')).toHaveValue('Preview publishing the current private draft as an update.');
          else {
            await expect(guide(page).getByRole('combobox')).toHaveValue('task-review');
            await expect(guide(page).locator('#ingestion-proposal-heading')).toBeVisible();
          }
          await closeTo(page, opener, width < 1024);
          expect(await physicalOpener!.evaluate((node) => document.activeElement === node && node.isConnected)).toBe(true);
          await identity.assert();
        } finally { await physicalOpener?.dispose(); }
      } finally { await identity.dispose(); }
    });
  }
}

test('RO run loading resolves to legacy backstage without changing the chosen fallback owner across real query links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await mockReview(page);
  const run: HermesResearchRun = {
    id: 'run-review', researchObjectId: 'ro-hermes', actorId: 'hermes-user', profile: null,
    status: 'awaiting_source_review', version: 2, versionId: null, maxAgentTasks: null, sourceClaimIds: [], error: null,
    createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
    steps: [{ id: 'step-review', stage: 'source_ingestion', ordinal: 0, status: 'succeeded', ingestionTaskId: 'task-review', artifactId: 'artifact-review', agentTaskId: 'agent-review', error: null }],
  };
  let release!: () => void;
  const profileReady = new Promise<void>((resolve) => { release = resolve; });
  let runReads = 0;
  await page.route((url) => url.pathname + url.search === '/api/research-objects/ro-hermes/hermes-runs/run-review', async (route) => {
    if (route.request().method() !== 'GET') return json(route, { run });
    runReads += 1;
    await profileReady;
    return json(route, { run });
  });
  await page.goto(baseUrl + roPath + '/hermes?run=run-review&hermes-motion=full', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Restoring Hermes workflow…', { exact: true })).toBeVisible();
  await assertAvatar(page);
  await assertLive(page);
  const opener = label(page);
  const physicalOpener = await opener.elementHandle();
  const identity = await captureRenderer(page);
  const rememberedGoal = 'Keep this RO conversation while reviewing its original source.';
  try {
    await opener.click();
    await assertConversation(page);
    await guide(page).locator('.hermes-conversation-composer textarea').fill(rememberedGoal);
    const originalConversation = await guide(page).elementHandle();
    try {
      release();
      const reviewLink = page.getByRole('link', { name: 'Review paper structure and sources', exact: true });
      await expect(reviewLink).toBeVisible();
      await expect(reviewLink).toHaveAttribute('href', roPath + '/hermes?run=run-review&task=task-review');
      expect(await originalConversation!.evaluate((node) => node.isConnected && node === document.querySelector('.hermes-assistant-shell'))).toBe(true);
      await assertConversation(page);
      await expect(guide(page).locator('.hermes-conversation-composer textarea')).toHaveValue(rememberedGoal);
      await assertLive(page);
      await identity.assert();
      await closeTo(page, opener);
      expect(await physicalOpener!.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
      await reviewLink.click(); // Same pathname, real task/run query; the business child is keyed and remounts.
      await expect(page).toHaveURL(new RegExp(roPath + '/hermes\\?run=run-review&task=task-review$'));
      await expect(page.locator('[data-hermes-review-page="true"]')).toBeVisible();
      const field = page.locator('[data-hermes-review-field]').first();
      await expect(field).toHaveValue('Problem');
      await expect(field).toBeEditable();
      await field.focus();
      await expect(field).toBeFocused();
      await expect(page.getByRole('button', { name: 'Confirm and create version', exact: true })).toBeEnabled();
      await assertAvatar(page, 'document-flow');
      await label(page).click();
      await assertConversation(page);
      await expect(guide(page).locator('.hermes-conversation-composer textarea')).toHaveValue(rememberedGoal);
      await identity.assert();
      await closeTo(page, label(page), true);
      // The real opener is now visible again; offscreen Live2D legitimately suspends drawing.
      const awaitingStage = page.locator(stageSelector);
      await expect(awaitingStage).toHaveAttribute('data-hermes-presentation-state', 'awaiting_approval');
      await expect(awaitingStage).toHaveAttribute('data-hermes-motion-preference', 'full');
      await expect(awaitingStage.locator('[data-hermes-input-ready]')).toHaveAttribute('data-hermes-input-ready', 'true');
      await assertLive(page);
      await page.getByRole('link', { name: 'Save this workflow link', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(roPath + '/hermes\\?run=run-review$'));
      await expect(page.getByRole('link', { name: 'Review paper structure and sources', exact: true })).toBeVisible();
      await assertAvatar(page, 'document-flow');
      await graphic(page).click();
      await assertConversation(page);
      await expect(guide(page).locator('.hermes-conversation-composer textarea')).toHaveValue(rememberedGoal);
      await identity.assert();
      await closeTo(page, page.locator(stageSelector).locator(inputSelector));
      expect(runReads).toBeGreaterThan(0);
    } finally { await originalConversation?.dispose(); }
  } finally { release(); await physicalOpener?.dispose(); await identity.dispose(); }
});

for (const initial of ['hermesTask', 'ingestionTask']) {
  test('editor ' + initial + ' deep-link restores the seeded existing task without POST', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWorkspace(page);
    if (initial === 'ingestionTask') await mockReview(page);
    // Existing workspace.guide result shape: hermes-dashboard.spec.ts:1006–1024.
    const task: AgentTaskView = {
      id: 'guide-task', sessionId: 'session-guide', researchObjectId: 'ro-hermes', kind: 'workspace.guide',
      status: 'succeeded', progress: 100, retryCount: 0, canRetry: false,
      result: { summary: 'Review the imported evidence, then shape it into a reusable research object.', nextSteps: [{ label: 'Start an import', intent: 'start-import' }], needsMoreInformation: true },
      error: null, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
    };
    const reads: string[] = [];
    if (initial === 'hermesTask') {
      await page.addInitScript(() => sessionStorage.setItem('openscience.hermes-handoff:hermes-user:ro-hermes:guide-task', JSON.stringify({
        viewerId: 'hermes-user', researchObjectId: 'ro-hermes', taskId: 'guide-task', expiresAt: Date.now() + 60_000,
      })));
      await page.route((url) => url.pathname + url.search === '/api/agent/tasks/guide-task', (route) => { reads.push('guide-task'); return json(route, { task }); });
    }
    const id = initial === 'hermesTask' ? 'guide-task' : 'task-review';
    await page.goto(baseUrl + roPath + '/edit?' + initial + '=' + id, { waitUntil: 'networkidle' });
    await assertConversation(page, 'complementary');
    if (initial === 'hermesTask') {
      await expect(guide(page).locator('[data-hermes-drawer-state="succeeded"]')).toBeVisible();
      await expect(guide(page).getByText(String(task.result!.summary), { exact: true })).toBeVisible();
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((id) => id === 'guide-task')).toBe(true);
    } else {
      await expect(guide(page).getByRole('combobox')).toHaveValue('task-review');
      await expect(guide(page).locator('#ingestion-proposal-heading')).toBeVisible();
      await expect(guide(page).getByRole('textbox', { name: 'Problem', exact: true })).toHaveValue('Problem');
    }
    await guide(page).getByRole('button', { name: 'Close Hermes', exact: true }).click();
    await assertAvatar(page);
    await label(page).click();
    await assertConversation(page, 'complementary');
    if (initial === 'hermesTask') await expect(guide(page).getByText(String(task.result!.summary), { exact: true })).toBeVisible();
    else await expect(guide(page).getByRole('combobox')).toHaveValue('task-review');
    await closeTo(page, label(page));
  });
}

test('existing RO overview and files consume their real entries and keep the same avatar renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'networkidle' });
  await assertLive(page);
  const identity = await captureRenderer(page);
  try {
    await enterEditor(page);
    await assertAvatar(page);
    await page.getByRole('link', { name: 'Research details', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(roPath + '/overview$'));
    await expect(page.getByRole('heading', { name: researchTitle, exact: true })).toBeVisible();
    await assertAvatar(page);
    await label(page).click();
    await assertConversation(page);
    await identity.assert();
    await closeTo(page, label(page));
    const nav = page.locator('[data-research-workspace-nav="true"]');
    await nav.locator('a[href="' + roPath + '/files"]').click();
    await expect(page).toHaveURL(new RegExp(roPath + '/files$'));
    await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeVisible();
    await expect(page.locator('[data-object-header="true"] strong')).toHaveText(researchTitle);
    await assertAvatar(page);
    await assertLive(page);
    await graphic(page).click();
    await assertConversation(page);
    await identity.assert();
    await closeTo(page, page.locator(stageSelector).locator(inputSelector), true);
    await identity.assert();
  } finally { await identity.dispose(); }
});
