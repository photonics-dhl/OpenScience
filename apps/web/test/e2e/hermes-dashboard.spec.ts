import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Request, type Route } from 'playwright/test';

import { HERMES_PATROL_MOTION_ENVELOPE, HERMES_PATROL_TRANSLATION_ENVELOPE } from '../../lib/hermes/companion-placement';
import { LIVE2D_ASSET_ROOT } from '../../lib/hermes/live2d-assets.mjs';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const outDir = 'test/visual/out/hermes-dashboard';

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrl }]);
  // Page-specific failure fixtures take priority; clearing them keeps this isolation boundary.
  await page.context().route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      if (url.pathname === '/api/auth/me') return json(route, {
        userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
      });
      if (url.pathname === '/api/workspaces') return json(route, { workspaces: [{ id: 'workspace-hermes', name: 'Personal', type: 'personal', role: 'owner', status: 'active' }] });
      if (url.pathname === '/api/agent/tasks' && url.searchParams.get('actionable') === 'false') {
        if (url.searchParams.get('kind') === 'workspace.guide' && url.searchParams.size === 2) return json(route, { tasks: [] });
        const routeRo = new URL(page.url()).pathname.match(/^\/research-objects\/([^/]+)\//u)?.[1];
        if (url.searchParams.get('kind') === 'source.retrieve' && url.searchParams.get('recovery') === 'true'
          && url.searchParams.get('targetKind') === (routeRo ? 'research_object' : 'personal')
          && url.searchParams.get('researchObjectId') === (routeRo ?? null)
          && url.searchParams.size === (routeRo ? 5 : 4)) return json(route, { tasks: [] });
      }
    }
    throw new Error(`Unmocked API request: ${route.request().method()} ${url.pathname}${url.search}`);
  });
});

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockDashboard(page: Page, taskState?: string) {
  await page.route('**/api/**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return json(route, {
      userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
    });
    if (url.pathname === '/api/research-objects' && url.searchParams.get('limit') === '20') return json(route, { researchObjects: [{
      id: 'ro-hermes', publicId: 'OSR-2026-000042', title: 'Coherent transport at the attosecond frontier', version: 2, status: 'draft',
    }] });
    if (url.pathname === '/api/ingestion' && url.searchParams.get('actionable') === 'true') return json(route, { tasks: taskState ? [{
      id: 'task-hermes', researchObjectId: 'ro-hermes', researchTitle: 'Coherent transport at the attosecond frontier',
      logicalPath: 'manuscript.pdf', state: taskState, retryCount: 0, error: taskState.startsWith('failed_') ? 'Parser interrupted' : null,
    }] : [] });
    return route.fallback();
  });
}

async function expectDashboardProtectedRegions(page: Page, empty = false) {
  const regions = [
    page.locator('header nav[data-hermes-primary-navigation="true"]'),
    empty ? page.locator('section[aria-labelledby="import-stage-title"]')
      : page.locator('section[aria-labelledby="research-list-title"]'),
    page.locator('main header[data-hermes-protected="true"]'),
  ];
  for (const region of regions) {
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('data-hermes-protected', 'true');
  }
  await expect.poll(() => page.locator('[data-hermes-protected="true"]').count()).toBeGreaterThanOrEqual(regions.length);
}

test('Dashboard protects semantic navigation, continuation, import and Hermes task regions', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  await expectDashboardProtectedRegions(page);

  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [] }));
  await page.reload({ waitUntil: 'networkidle' });
  await expectDashboardProtectedRegions(page, true);
});

test('a patrol cycle stays inside its shared motion envelope and clears adjacent protected work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const travelHull = stage.locator('[data-hermes-carrier-travel-hull="true"]');
  await expect(travelHull).toBeVisible();
  await expect(stage.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  const geometryVersion = Number(await stage.getAttribute('data-hermes-protected-geometry-version'));
  await page.evaluate((motionEnvelope) => {
    const hull = document.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!.getBoundingClientRect();
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    blocker.dataset.patrolEnvelopeBlocker = 'true';
    const useRight = hull.right + motionEnvelope.right + 41 <= innerWidth;
    Object.assign(blocker.style, {
      height: `${hull.height}px`,
      left: `${useRight ? hull.right + motionEnvelope.right + 1 : hull.left - motionEnvelope.left - 41}px`,
      pointerEvents: 'none',
      position: 'fixed', top: `${hull.top}px`, width: '40px', zIndex: '1',
    });
    document.body.append(blocker);
  }, HERMES_PATROL_MOTION_ENVELOPE);
  await expect.poll(async () => Number(await stage.getAttribute('data-hermes-protected-geometry-version'))).toBeGreaterThan(geometryVersion);
  await expect.poll(async () => {
    const [hull, blocker] = await Promise.all([
      travelHull.boundingBox(), page.locator('[data-patrol-envelope-blocker="true"]').boundingBox(),
    ]);
    return hull && blocker ? !overlaps(hull, blocker) : false;
  }).toBe(true);
  await expect(stage).toHaveAttribute('data-hermes-motion-envelope-safe', 'true');

  await page.evaluate(() => {
    const stageNode = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]')!;
    const forcePatrol = () => {
      if (stageNode.dataset.hermesAction !== 'patrol') stageNode.dataset.hermesAction = 'patrol';
    };
    forcePatrol();
    new MutationObserver(forcePatrol).observe(stageNode, { attributeFilter: ['data-hermes-action'], attributes: true });
  });
  await expect(stage).toHaveAttribute('data-hermes-action', 'patrol');
  await expect(stage).toHaveAttribute('data-hermes-motion-envelope-safe', 'true');
  const settledEnvelope = await page.evaluate((motionEnvelope) => {
    const hull = document.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!.getBoundingClientRect();
    const blocker = document.querySelector<HTMLElement>('[data-patrol-envelope-blocker="true"]')!.getBoundingClientRect();
    const envelope = {
      bottom: hull.bottom + motionEnvelope.bottom, left: hull.left - motionEnvelope.left,
      right: hull.right + motionEnvelope.right, top: hull.top - motionEnvelope.top,
    };
    const overlapsEnvelope = envelope.left < blocker.right && envelope.right > blocker.left
      && envelope.top < blocker.bottom && envelope.bottom > blocker.top;
    return { blocker: { bottom: blocker.bottom, left: blocker.left, right: blocker.right, top: blocker.top }, envelope, overlapsEnvelope };
  }, HERMES_PATROL_MOTION_ENVELOPE);
  expect(settledEnvelope.overlapsEnvelope, `settled patrol envelope: ${JSON.stringify(settledEnvelope)}`).toBe(false);
  const patrolOrigin = await travelHull.boundingBox();
  expect(patrolOrigin).not.toBeNull();
  const evidence = await page.evaluate(() => new Promise<{
    collisions: number; frames: number; maxBottomDelta: number; maxRightDelta: number; maxX: number; maxY: number;
    minLeftDelta: number; minTopDelta: number; minX: number; minY: number; viewportViolations: number;
  }>((resolveEvidence) => {
    const stageNode = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]')!;
    const actor = stageNode.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!;
    const hull = stageNode.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!;
    const blocker = document.querySelector<HTMLElement>('[data-patrol-envelope-blocker="true"]')!;
    const origin = hull.getBoundingClientRect();
    const result = {
      collisions: 0, frames: 0, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY,
      maxBottomDelta: Number.NEGATIVE_INFINITY, maxRightDelta: Number.NEGATIVE_INFINITY,
      minLeftDelta: Number.POSITIVE_INFINITY, minTopDelta: Number.POSITIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, viewportViolations: 0,
    };
    const started = performance.now();
    const overlapsRect = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const sample = () => {
      const bounds = hull.getBoundingClientRect();
      const obstacle = blocker.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(actor).transform);
      result.frames += 1;
      result.minX = Math.min(result.minX, matrix.m41);
      result.maxX = Math.max(result.maxX, matrix.m41);
      result.minY = Math.min(result.minY, matrix.m42);
      result.maxY = Math.max(result.maxY, matrix.m42);
      result.minLeftDelta = Math.min(result.minLeftDelta, bounds.left - origin.left);
      result.maxRightDelta = Math.max(result.maxRightDelta, bounds.right - origin.right);
      result.minTopDelta = Math.min(result.minTopDelta, bounds.top - origin.top);
      result.maxBottomDelta = Math.max(result.maxBottomDelta, bounds.bottom - origin.bottom);
      result.collisions += Number(overlapsRect(bounds, obstacle));
      result.viewportViolations += Number(bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight);
      if (performance.now() - started >= 4_190) resolveEvidence(result);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  expect(evidence.frames).toBeGreaterThan(120);
  expect(evidence.collisions, `patrol evidence: ${JSON.stringify({ evidence, patrolOrigin, settledEnvelope })}`).toBe(0);
  expect(evidence.viewportViolations, `patrol evidence: ${JSON.stringify(evidence)}`).toBe(0);
  expect(evidence.minLeftDelta).toBeGreaterThanOrEqual(-HERMES_PATROL_MOTION_ENVELOPE.left);
  expect(evidence.maxRightDelta).toBeLessThanOrEqual(HERMES_PATROL_MOTION_ENVELOPE.right);
  expect(evidence.minTopDelta).toBeGreaterThanOrEqual(-HERMES_PATROL_MOTION_ENVELOPE.top);
  expect(evidence.maxBottomDelta).toBeLessThanOrEqual(HERMES_PATROL_MOTION_ENVELOPE.bottom);
  const cssExtrema = await page.evaluate(async () => {
    const probeStage = document.createElement('div');
    probeStage.className = 'hermes-workspace-stage';
    probeStage.dataset.hermesAction = 'patrol';
    probeStage.dataset.hermesMotionEnvelopeSafe = 'true';
    probeStage.dataset.hermesMotionPreference = 'full';
    probeStage.style.visibility = 'hidden';
    const actor = document.createElement('div');
    actor.className = 'hermes-companion-actor';
    probeStage.append(actor);
    document.body.append(probeStage);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animation = actor.getAnimations().find((candidate) => (candidate as CSSAnimation).animationName === 'hermes-companion-patrol')!;
    animation.pause();
    const result = { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY };
    for (const progress of [0, .18, .38, .58, .78, .9, 1]) {
      animation.currentTime = 4_200 * progress;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(actor).transform);
      result.minX = Math.min(result.minX, matrix.m41);
      result.maxX = Math.max(result.maxX, matrix.m41);
      result.minY = Math.min(result.minY, matrix.m42);
      result.maxY = Math.max(result.maxY, matrix.m42);
    }
    probeStage.remove();
    return result;
  });
  expect(Math.abs(cssExtrema.minX + HERMES_PATROL_TRANSLATION_ENVELOPE.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(cssExtrema.maxX - HERMES_PATROL_TRANSLATION_ENVELOPE.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(cssExtrema.minY + HERMES_PATROL_TRANSLATION_ENVELOPE.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(cssExtrema.maxY - HERMES_PATROL_TRANSLATION_ENVELOPE.bottom)).toBeLessThanOrEqual(1);
});

test('anchored Hermes suppresses automatic performance speech while a live runtime advances', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDashboard(page);
  await page.clock.install({ time: new Date('2026-08-23T00:00:00Z') });
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  await expectDashboardProtectedRegions(page);
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const rig = stage.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(page.locator('[data-hermes-dock-anchor="true"]')).toHaveCount(1);
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'running');
  await expect(stage.locator('[data-hermes-articulated-canvas]')).toHaveCount(1);
  await expect(stage.locator('[data-hermes-articulated-canvas]')).toBeVisible();
  const firstDraw = Number(await rig.getAttribute('data-hermes-last-draw-at'));
  expect(firstDraw).toBeGreaterThan(0);
  const before = await page.evaluate(() => Date.now());
  await page.clock.fastForward(300_000);
  expect(await page.evaluate(() => Date.now())).toBeGreaterThanOrEqual(before + 300_000);
  await expect.poll(async () => Number(await rig.getAttribute('data-hermes-last-draw-at'))).toBeGreaterThan(firstDraw);
  await expect(stage).toHaveAttribute('data-hermes-speech-visible', 'false');
  await expect(stage.locator('[data-hermes-performance-bubble="true"]')).toHaveCount(0);
});

test('Hermes renders articulated, working and approval states with one visual owner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const browserErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  for (const [taskState, visualState] of [
    [undefined, 'idle'],
    ['queued', 'guiding'],
    ['parsing', 'scanning'],
    ['stored', 'suggesting'],
    ['needs_review', 'suggesting'],
    ['failed_retryable', 'failed'],
  ] as const) {
    await page.unrouteAll({ behavior: 'wait' });
    await mockDashboard(page, taskState);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Research desk' })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
    await expect(visual).toHaveAttribute('data-hermes-state', visualState);
    await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-carrier="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-carrier-rear], [data-hermes-carrier-front]')).toHaveCount(0);
    await expect(page.locator('[data-hermes-carrier-travel-hull="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-carrier-interaction-hull="true"]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-frame]')).toHaveCount(0);
    await expect(page.locator('[data-hermes-part], [data-hermes-idle-signal]')).toHaveCount(0);
    await expect(page.locator('[data-live2d-instance="wanko"]')).toHaveCount(1);
    await expect(page.locator('.hermes-wanko-citation-thread, .hermes-wanko-paper-fibre, .hermes-wanko-ground-layer')).toHaveCount(0);
    await expect(visual).toHaveAttribute('data-hermes-input-ready', 'true');
    const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
    const canvas = page.locator('[data-hermes-articulated-canvas="true"]');
    await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
    await expect(canvas).toBeVisible();
    if (visualState === 'failed') {
      await expect(canvas).toHaveAttribute('data-hermes-gesture', 'failed-settle');
      const failedPose = await Promise.all([
        canvas.getAttribute('data-hermes-head'),
        canvas.getAttribute('data-hermes-torso'),
        canvas.getAttribute('data-hermes-tail'),
      ]);
      const box = await rig.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width * .86, box!.y + box!.height * .18);
      await expect(canvas).toHaveAttribute('data-hermes-gesture', 'failed-settle');
      await page.waitForTimeout(180);
      const settledPose = await Promise.all([
        canvas.getAttribute('data-hermes-head'),
        canvas.getAttribute('data-hermes-torso'),
        canvas.getAttribute('data-hermes-tail'),
      ]);
      const maxPoseDelta = Math.max(...settledPose.flatMap((value, poseIndex) => {
        const baseline = failedPose[poseIndex]?.split(',').map(Number) ?? [];
        return (value?.split(',').map(Number) ?? []).map((part, partIndex) => Math.abs(part - (baseline[partIndex] ?? Number.POSITIVE_INFINITY)));
      }));
      // The renderer eases toward the fixed failed pose, so a pointer sample may
      // expose a small interpolation remainder without changing its restrained state.
      expect(maxPoseDelta).toBeLessThanOrEqual(.1);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${outDir}/${visualState}-1440x900.png`, fullPage: true, animations: 'disabled' });
      continue;
    }
    const box = await rig.locator('[data-hermes-carrier-interaction-hull="true"]').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * .86, box!.y + box!.height * .18);
    await expect(visual).toHaveAttribute('data-hermes-engaged', 'true');
    await expect(canvas).toHaveAttribute('data-hermes-gesture', 'focus');
    await expect.poll(async () => {
      const focusedHead = (await canvas.getAttribute('data-hermes-head'))?.split(',').map(Number) ?? [];
      const focusedTorso = (await canvas.getAttribute('data-hermes-torso'))?.split(',').map(Number) ?? [];
      const focusedTail = (await canvas.getAttribute('data-hermes-tail'))?.split(',').map(Number) ?? [];
      return {
        headLeads: Math.abs(focusedHead[0] ?? 0) > Math.abs(focusedTorso[0] ?? 0),
        tailCounters: Math.sign(focusedHead[0] ?? 0) === -Math.sign(focusedTail[0] ?? 0),
      };
    }).toEqual({ headLeads: true, tailCounters: true });
    await page.mouse.move(0, 0);
    await expect(visual).toHaveAttribute('data-hermes-engaged', 'false');
    await page.screenshot({ path: `${outDir}/${visualState}-1440x900.png`, fullPage: true, animations: 'disabled' });
  }

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page, 'needs_review');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const mobileStage = page.locator('[data-hermes-workspace-stage]');
  const mobileRig = page.locator('[data-hermes-rig="live2d-wanko"]');
  const mobileMotionToggle = page.locator('[data-hermes-motion-toggle]');
  await expect(mobileStage).toBeVisible();
  await expect(mobileStage).toHaveAttribute('data-hermes-compact', 'true');
  await expect(mobileStage).toHaveAttribute('data-hermes-stage-size', '120');
  await expect(mobileRig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(mobileStage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await expect(mobileMotionToggle).toHaveAttribute('data-motion-active', 'true');
  await expect(mobileMotionToggle).toBeHidden();

  await page.getByRole('button', { name: 'Talk with Hermes', exact: true }).click();
  const mobileDialog = page.getByRole('dialog', { name: 'Hermes research guide' });
  await expect(mobileDialog).toBeVisible();
  await expect(mobileStage).toHaveAttribute('data-hermes-in-conversation', 'true');
  await expect(mobileStage).toHaveAttribute('data-hermes-compact', 'false');
  await expect(mobileRig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(mobileStage).toHaveCount(1);
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
  await expect(mobileMotionToggle).toBeVisible();
  await expect(mobileMotionToggle).toBeEnabled();
  await expect(mobileMotionToggle).toBeInViewport({ ratio: 1 });
  const mobileStageBox = await mobileStage.boundingBox();
  const mobileMotionToggleBox = await mobileMotionToggle.boundingBox();
  expect(mobileStageBox).not.toBeNull();
  expect(mobileMotionToggleBox).not.toBeNull();
  expect((mobileMotionToggleBox?.y ?? Infinity) + (mobileMotionToggleBox?.height ?? 0))
    .toBeLessThanOrEqual(mobileStageBox?.y ?? 0);

  await mobileMotionToggle.click();
  await expect(mobileStage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await expect(mobileMotionToggle).toHaveAttribute('data-motion-active', 'false');
  await expect(mobileRig).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(page.locator('[data-hermes-renderer="articulated-mesh"]')).toHaveAttribute('data-hermes-input-ready', 'false');
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
  await expect(mobileMotionToggle).toBeEnabled();
  await mobileMotionToggle.click();
  await expect(mobileStage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await expect(mobileMotionToggle).toHaveAttribute('data-motion-active', 'true');
  await expect(mobileRig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-renderer="articulated-mesh"]')).toHaveAttribute('data-hermes-input-ready', 'true');

  await mobileDialog.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  await expect(mobileDialog).toHaveCount(0);
  await expect(mobileStage).toHaveAttribute('data-hermes-in-conversation', 'false');
  await expect(mobileStage).toHaveAttribute('data-hermes-compact', 'true');
  await expect(mobileStage).toHaveAttribute('data-hermes-stage-size', '120');
  await expect(mobileMotionToggle).toBeHidden();
  await expect(mobileStage).toHaveCount(1);
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
  await page.screenshot({ path: `${outDir}/suggesting-needs-review-390x844.png`, fullPage: true, animations: 'disabled' });

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  const reducedVisual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  await expect(reducedVisual).toHaveAttribute('data-hermes-input-ready', 'false');
  const reducedRig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(reducedRig).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(reducedRig).toHaveAttribute('data-hermes-runtime-owner', 'stopped');
  await expect(reducedRig.locator('.hermes-rig-vector-fallback .hermes-portrait')).toBeVisible();
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
  await expect(page.locator('.hermes-rig-canvas')).toHaveCSS('display', 'block');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'false');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('opacity', '0');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: `${outDir}/idle-reduced-390x844.png`, fullPage: true, animations: 'disabled' });
  expect(browserErrors).toEqual([]);
});

test('anchored Hermes keeps the automatic contextual prompt suppressed', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-anchored', 'true');
  const prompt = page.locator('.hermes-guide-nudge');
  await expect(prompt).toHaveAttribute('data-visible', 'false');
  await expect(prompt).toHaveAttribute('aria-hidden', 'true');
  await expect(prompt).toHaveCSS('opacity', '0');
  await expect(prompt).toHaveCSS('pointer-events', 'none');
});

test('Hermes loading and error surfaces are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseLoading!: () => void;
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve; });
  await page.route('**/api/auth/me', async (route) => {
    await loadingGate;
    await json(route, { userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' });
  });
  await page.route('**/api/research-objects?limit=20', async (route) => {
    await loadingGate;
    await json(route, { researchObjects: [] });
  });
  await page.route('**/api/ingestion?actionable=true*', async (route) => {
    await loadingGate;
    await json(route, { tasks: [] });
  });
  await page.route('**/api/agent/tasks**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('actionable') !== 'false' || url.searchParams.get('kind') !== 'source.retrieve') {
      await route.fallback();
      return;
    }
    await loadingGate;
    await json(route, { tasks: [] });
  });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  const loadingSurface = page.locator('[data-os-surface="dashboard"][aria-busy="true"]');
  await expect(loadingSurface).toBeVisible();
  await expect(loadingSurface.getByRole('status')).toBeVisible();
  await page.screenshot({ path: `${outDir}/loading-390x844.png`, fullPage: true });
  releaseLoading();

  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { error: { message: 'Research index unavailable' } }, 503));
  await page.route('**/api/ingestion?actionable=true*', (route) => json(route, { tasks: [] }));
  await page.route('**/api/agent/tasks**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('actionable') === 'false' && url.searchParams.get('kind') === 'source.retrieve') {
      return json(route, { tasks: [] });
    }
    return route.fallback();
  });
  const researchErrorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/research-objects'
      && url.searchParams.get('limit') === '20'
      && response.status() === 503;
  });
  const reloadErrors: Array<{ message: string; filename: string; line: number; column: number }> = [];
  const origin = new URL(baseUrl).origin;
  await page.exposeFunction('__recordHermesReloadError', (entry: typeof reloadErrors[number]) => {
    if (entry.filename && new URL(entry.filename, baseUrl).origin !== origin) return;
    reloadErrors.push(entry);
  });
  await page.addInitScript(() => {
    window.addEventListener('error', (event) => {
      const diagnosticWindow = window as unknown as Window & { __recordHermesReloadError(entry: { message: string; filename: string; line: number; column: number }): Promise<void> };
      void diagnosticWindow.__recordHermesReloadError({ message: event.message, filename: event.filename,
        line: event.lineno, column: event.colno }).catch(() => undefined);
    });
  });
  const scripts: Array<{ url: string; status?: number; headers?: Record<string, string>; bytes?: Buffer; error?: string }> = [];
  const captures: Promise<void>[] = [];
  const reloadStartedAt = Date.now();
  const captureScript = (request: Request) => {
    const url = new URL(request.url());
    if (request.resourceType() !== 'script' || request.method() !== 'GET' || url.origin !== origin
      || (!url.pathname.startsWith('/_next/') && !url.pathname.startsWith(`${LIVE2D_ASSET_ROOT}/`))
      || request.timing().startTime < reloadStartedAt) return;
    // Finished local fixture scripts only; exclude API bodies, cookies and earlier-document requests.
    const entry: typeof scripts[number] = { url: url.href };
    scripts.push(entry);
    captures.push((async () => {
      try {
        const response = await request.response();
        if (!response) return;
        entry.status = response.status();
        entry.headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) =>
          ['content-type', 'content-encoding', 'content-length', 'transfer-encoding'].includes(name)));
        entry.bytes = await response.body();
      } catch (error) { entry.error = error instanceof Error ? error.message : String(error); }
    })());
  };
  page.on('requestfinished', captureScript);
  let errorSurfaceVerified = false;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await researchErrorResponse;
    await expect(page.locator('p[role="alert"]')).toContainText('Research index unavailable');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `${outDir}/error-390x844.png`, fullPage: true, animations: 'disabled' });
    errorSurfaceVerified = true;
  } finally {
    page.off('requestfinished', captureScript);
    await Promise.allSettled(captures);
    if (!errorSurfaceVerified) {
      await mkdir(test.info().outputDir, { recursive: true });
      for (const [index, script] of scripts.entries()) {
        if (script.bytes) await writeFile(test.info().outputPath(`reload-script-${index}.bin`), script.bytes);
      }
      const metadata = scripts.map(({ bytes, ...script }, index) => ({ ...script,
        file: bytes ? `reload-script-${index}.bin` : null, byteLength: bytes?.length ?? null }));
      const path = test.info().outputPath('reload-diagnostics.json');
      await writeFile(path, JSON.stringify({ reloadErrors, scripts: metadata,
        representation: 'Playwright decoded response.body bytes; encoding headers retained, not raw compressed wire bytes' }, null, 2));
      await test.info().attach('reload-diagnostics', { path, contentType: 'application/json' });
    }
  }
});

test('Hermes keeps the guide usable when WebGL2 is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(`{
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === 'webgl2') return null;
      return original.call(this, kind, ...args);
    };
  }`);
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Research desk' })).toBeVisible();
  const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  await expect(visual.locator('.hermes-rig-vector-fallback .hermes-portrait')).toBeVisible();
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'fallback');
  await expect(rig).toHaveAttribute('data-hermes-runtime-reason', 'webgl2-unavailable');
  const retry = page.getByRole('button', { name: /Retry Hermes motion|重试 Hermes 动效/i });
  await expect(retry).toBeVisible();
  const generation = Number(await rig.getAttribute('data-hermes-runtime-generation'));
  await retry.click();
  await expect(rig).toHaveAttribute('data-hermes-runtime-generation', String(generation + 1));
  await expect(rig).toHaveAttribute('data-hermes-runtime-reason', 'webgl2-unavailable');
  await expect(page.locator('.hermes-rig-canvas')).toHaveCSS('opacity', '0');
  await visual.click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Hermes disposes and restores its mesh when the persistent motion control changes live', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });

  await page.getByRole('button', { name: /Reduce Hermes motion|关闭 Hermes 动效/i }).click();
  await expect(rig).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'stopped');
  await expect(rig.locator('.hermes-rig-vector-fallback .hermes-portrait')).toBeVisible();
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
  await expect(page.locator('.hermes-rig-canvas')).toHaveCSS('display', 'block');
  const stoppedDraw = Number(await rig.getAttribute('data-hermes-last-draw-at') ?? 0);

  await page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'running');
  await expect.poll(async () => Number(await rig.getAttribute('data-hermes-last-draw-at') ?? 0)).toBeGreaterThan(stoppedDraw);
});

test('Hermes pauses and resumes the same canvas when approval ends live', async ({ page }) => {
  await page.goto(`${baseUrl}/_visual/hermes-articulation`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  const firstCanvas = await page.locator('[data-hermes-articulated-canvas="true"]').elementHandle();

  await page.getByRole('button', { name: 'Approval' }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(rig).toHaveAttribute('data-hermes-gesture', 'still');
  const approvalDraw = await rig.getAttribute('data-hermes-last-draw-at');
  expect(approvalDraw).not.toBeNull();
  await page.waitForTimeout(180);
  await expect(rig).toHaveAttribute('data-hermes-last-draw-at', approvalDraw!);
  await page.getByRole('button', { name: 'Idle' }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-static-frame', 'false');
  await expect.poll(async () => Number(await rig.getAttribute('data-hermes-last-draw-at') ?? 0)).toBeGreaterThan(Number(approvalDraw));
  const resumedCanvas = await page.locator('[data-hermes-articulated-canvas="true"]').elementHandle();

  expect(await firstCanvas?.evaluate((first, second) => first === second, resumedCanvas)).toBe(true);
  await expect(rig).toHaveCount(1);
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
});

test('Hermes releases a fallback WebGL context when WebGL2 initialization fails', async ({ page }) => {
  const textureRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/hermes/live2d/')) textureRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const testWindow = window as Window & { __hermesContexts?: { acquired: number; lost: number } };
    testWindow.__hermesContexts = { acquired: 0, lost: 0 };
    const acquired = new WeakSet<object>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl2') return null;
      const context = original.call(this, kind as '2d', ...args as []) as WebGLRenderingContext | null;
      if (!context || (kind !== 'webgl' && kind !== 'experimental-webgl')) return context;
      if (!acquired.has(context)) {
        acquired.add(context);
        testWindow.__hermesContexts!.acquired += 1;
      }
      const getExtension = context.getExtension.bind(context);
      context.getExtension = ((name: string) => {
        const extension = getExtension(name);
        if (name !== 'WEBGL_lose_context' || !extension) return extension;
        const loseExtension = extension as WEBGL_lose_context;
        return {
          loseContext() {
            testWindow.__hermesContexts!.lost += 1;
            loseExtension.loseContext();
          },
          restoreContext: () => loseExtension.restoreContext(),
        } as WEBGL_lose_context;
      }) as typeof context.getExtension;
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'fallback');
  const fallbackAnimations = await page.locator('.hermes-rig-vector-fallback, .hermes-rig-vector-fallback *').evaluateAll((nodes) => nodes
    .map((node) => getComputedStyle(node).animationName)
    .filter((name) => name !== 'none'));
  expect(fallbackAnimations).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const counts = (window as Window & { __hermesContexts?: { acquired: number; lost: number } }).__hermesContexts;
    return (counts?.acquired ?? 0) - (counts?.lost ?? 0);
  })).toBe(0);
  expect(textureRequests).toEqual([]);
});

test('Hermes applies offscreen suspension after delayed initialization', async ({ page }) => {
  let releaseTexture: (() => void) | undefined;
  const textureHold = new Promise<void>((resolve) => { releaseTexture = resolve; });
  let textureRequested = false;
  await page.route(`**${LIVE2D_ASSET_ROOT}/wanko/wanko_touch.1024/texture_00.png`, async (route) => {
    textureRequested = true;
    await textureHold;
    await route.continue();
  });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toBeVisible();
  await expect.poll(() => textureRequested).toBe(true);
  await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'initializing');
  const offscreenStyle = await page.addStyleTag({ content: '[data-hermes-rig="live2d-wanko"] { transform: translateY(1800px) !important; }' });
  let offscreenDrawAt = 0;
  try {
    await expect.poll(() => rig.evaluate((node) => node.getBoundingClientRect().top >= window.innerHeight)).toBe(true);
    releaseTexture?.();
    // Initialization started while visible, so its first frame may finish offscreen.
    await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
    await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'running');
    offscreenDrawAt = Number(await rig.getAttribute('data-hermes-last-draw-at'));
    expect(offscreenDrawAt).toBeGreaterThan(0);
    await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveAttribute('data-hermes-head', /.+/);
    // The owner stays running while suspended; a stable draw timestamp proves
    // no continuous drawing in this interval, not an exact initialization frame count.
    await page.waitForTimeout(600);
    await expect(rig).toHaveAttribute('data-hermes-last-draw-at', String(offscreenDrawAt));
  } finally {
    releaseTexture?.();
    await offscreenStyle.evaluate((style) => (style as HTMLStyleElement).remove());
  }
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect.poll(async () => Number(await rig.getAttribute('data-hermes-last-draw-at'))).toBeGreaterThan(offscreenDrawAt);
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).toHaveCount(1);
});

test('Hermes aborts and releases a pending initialization on SPA unmount', async ({ page }) => {
  await page.addInitScript((assetRoot: string) => {
    const testWindow = window as Window & {
      __hermesPendingContexts?: { acquired: number; lost: number };
      __releaseHermesPendingImages?: () => Promise<void>;
    };
    testWindow.__hermesPendingContexts = { acquired: 0, lost: 0 };
    const originalContext = HTMLCanvasElement.prototype.getContext;
    const tracked = new WeakSet<object>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      const context = originalContext.call(this, kind as '2d', ...args as []) as WebGL2RenderingContext | null;
      if (kind !== 'webgl2' || !context || !this.matches('[data-hermes-articulated-canvas]')) return context;
      if (!tracked.has(context)) {
        tracked.add(context);
        testWindow.__hermesPendingContexts!.acquired += 1;
      }
      const getExtension = context.getExtension.bind(context);
      context.getExtension = ((name: string) => {
        const extension = getExtension(name);
        if (name !== 'WEBGL_lose_context' || !extension) return extension;
        const loseExtension = extension as WEBGL_lose_context;
        return {
          loseContext() {
            testWindow.__hermesPendingContexts!.lost += 1;
            loseExtension.loseContext();
          },
          restoreContext: () => loseExtension.restoreContext(),
        } as WEBGL_lose_context;
      }) as typeof context.getExtension;
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
    const originalDecode = HTMLImageElement.prototype.decode;
    const pending: Array<() => Promise<void>> = [];
    HTMLImageElement.prototype.decode = function () {
      if (!this.src.includes(`${assetRoot}/wanko/`)) return originalDecode.call(this);
      return new Promise<void>((resolve, reject) => {
        pending.push(async () => {
          try { await originalDecode.call(this); resolve(); } catch (error) { reject(error); }
        });
      });
    };
    testWindow.__releaseHermesPendingImages = async () => { await Promise.all(pending.splice(0).map((release) => release())); };
  }, LIVE2D_ASSET_ROOT);
  await mockDashboard(page);
  // Enter through the existing Next Link so browser Back unmounts the global stage
  // without the wordmark's ordinary anchor replacing the document.
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Research desk', exact: true }).click();
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
  try {
    await expect.poll(() => page.evaluate(() => (
      (window as Window & { __hermesPendingContexts?: { acquired: number } }).__hermesPendingContexts?.acquired ?? 0
    ))).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(`${baseUrl}/`);
    // The acquisition counter must survive: a document reload is not an SPA-unmount proof.
    expect(await page.evaluate(() => (window as Window & { __hermesPendingContexts?: { acquired: number } }).__hermesPendingContexts?.acquired)).toBe(1);
    await expect.poll(() => page.evaluate(() => {
      const counts = (window as Window & { __hermesPendingContexts?: { acquired: number; lost: number } }).__hermesPendingContexts;
      return (counts?.acquired ?? 0) - (counts?.lost ?? 0);
    })).toBe(0);
  } finally {
    await page.evaluate(() => (window as Window & { __releaseHermesPendingImages?: () => Promise<void> }).__releaseHermesPendingImages?.());
  }
  await expect.poll(() => page.evaluate(() => {
    const counts = (window as Window & { __hermesPendingContexts?: { acquired: number; lost: number } }).__hermesPendingContexts;
    return (counts?.acquired ?? 0) - (counts?.lost ?? 0);
  })).toBe(0);
  await expect(page.locator('[data-hermes-articulated-canvas]')).toHaveCount(0);
});

test('Hermes focus and open presence drive real mesh articulation', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  const canvas = page.locator('[data-hermes-articulated-canvas]');
  await expect(canvas).toHaveAttribute('data-hermes-gesture', /.+/);
  await visual.focus();
  await expect(visual).toHaveAttribute('data-hermes-presence', 'attentive');
  await expect(canvas).toHaveAttribute('data-hermes-gesture', 'focus');
  const opener = page.getByRole('button', { name: 'Talk with Hermes', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-assistant-open', 'true');
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-in-conversation', 'true');
  await expect(canvas).toHaveAttribute('data-hermes-gesture', 'focus');
  await expect(canvas).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-assistant-open', 'false');
});

test('Hermes remounts a fresh canvas after a live WebGL context loss', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-rig="live2d-wanko"]');
  const motionToggle = page.locator('[data-hermes-motion-toggle]');
  const oldCanvas = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'ready');
  const originalGeneration = Number(await stage.getAttribute('data-hermes-runtime-generation'));
  await expect(motionToggle).toHaveAttribute('data-motion-active', 'true');
  await page.locator('[data-hermes-articulated-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'ready');
  await expect(stage).toHaveAttribute('data-hermes-runtime-generation', String(originalGeneration + 1));
  const newCanvas = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  expect(await oldCanvas?.evaluate((old, next) => old !== next, newCanvas)).toBe(true);

  await page.locator('[data-hermes-articulated-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'fallback');
  await expect(stage).toHaveAttribute('data-hermes-runtime-owner', 'stopped');
  const boundedGeneration = await stage.getAttribute('data-hermes-runtime-generation');
  await page.waitForTimeout(500);
  await expect(stage).toHaveAttribute('data-hermes-runtime-generation', boundedGeneration!);
  await expect(motionToggle).toHaveAttribute('data-motion-runtime', 'fallback');
  await expect(motionToggle).toHaveAccessibleName(/Retry Hermes motion|重试 Hermes 动效/i);
  await expect(motionToggle).toBeEnabled();
  const preferenceBeforeRetry = await page.evaluate(() => localStorage.getItem('openscience.hermes.motion'));
  await motionToggle.click();
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'ready');
  await expect(stage).toHaveAttribute('data-hermes-runtime-owner', 'running');
  await expect(stage).toHaveAttribute('data-hermes-runtime-generation', String(Number(boundedGeneration) + 1));
  const manuallyRestored = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  expect(await newCanvas?.evaluate((automatic, manual) => automatic !== manual, manuallyRestored)).toBe(true);
  await expect(page.locator('[data-hermes-articulated-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('openscience.hermes.motion'))).toBe(preferenceBeforeRetry);
});

test('Hermes retries with a fresh runtime after the required Cubism model fails', async ({ page }) => {
  await mockDashboard(page);
  let failedModelRequests = 0;
  await page.route(`**${LIVE2D_ASSET_ROOT}/wanko/wanko_touch.model3.json`, (route) => {
    failedModelRequests += 1;
    return route.abort('failed');
  });
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'fallback', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-runtime-reason', 'asset-load-failed');
  expect(failedModelRequests).toBeGreaterThan(0);
  const failedGeneration = Number(await rig.getAttribute('data-hermes-runtime-generation'));
  const failedCanvas = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  const preferenceBeforeRetry = await page.evaluate(() => localStorage.getItem('openscience.hermes.motion'));

  await page.unroute(`**${LIVE2D_ASSET_ROOT}/wanko/wanko_touch.model3.json`);
  await page.getByRole('button', { name: /Retry Hermes motion|重试 Hermes 动效/i }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-runtime-owner', 'running');
  await expect(rig).toHaveAttribute('data-hermes-runtime-generation', String(failedGeneration + 1));
  const restoredCanvas = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  expect(await failedCanvas?.evaluate((failed, restored) => failed !== restored, restoredCanvas)).toBe(true);
  await expect(page.locator('[data-hermes-articulated-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('openscience.hermes.motion'))).toBe(preferenceBeforeRetry);
});

test('Hermes keeps the real six-field approval surface still until confirmation succeeds', async ({ page }) => {
  await mockDashboard(page);
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: baseUrl }]);
  const detail = {
    batchId: 'batch-review',
    researchObjectId: 'ro-hermes',
    version: 2,
    task: {
      agentTaskId: 'agent-review', artifactId: 'artifact-review', error: null, id: 'task-review',
      logicalPath: 'manuscript.pdf', retryCount: 0, state: 'needs_review',
      result: { core: {
        schemaVersion: '0.1.0', problem: 'Problem', insight: 'Insight', method: 'Method',
        results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility',
      } },
    },
  };
  const confirmation = { commitId: 'commit-review', versionId: 'version-review', versionNo: 3, version: 3, evidenceStatus: 'needs_review', missingFields: [] };
  let confirmations = 0;
  await page.route('**/api/research-objects/ro-hermes/ingestion', (route) => route.request().method() === 'GET' ? json(route, {
    researchObjectId: 'ro-hermes', version: detail.version,
    tasks: [{ ...detail.task, confirmation: detail.task.state === 'confirmed' ? confirmation : null }],
    latestConfirmation: detail.task.state === 'confirmed' ? confirmation : null,
  }) : route.fallback());
  await page.route('**/api/research-objects/ro-hermes/hermes-runs?ingestionTaskId=task-review', (route) => route.request().method() === 'GET' ? json(route, { run: null }) : route.fallback());
  await page.route('**/api/research-objects/ro-hermes', (route) => route.request().method() === 'GET' ? json(route, { researchObject: {
    id: 'ro-hermes', workspaceId: 'workspace-hermes', title: 'Reviewed research', version: detail.version,
    status: 'draft', visibility: 'private', sdf: { core: detail.task.result.core },
  } }) : route.fallback());
  await page.route('**/api/research-objects/ro-hermes/versions', (route) => route.request().method() === 'GET' ? json(route, {
    versions: detail.task.state === 'confirmed' ? [{ ...confirmation, status: 'draft', createdAt: '2026-10-08T00:00:00.000Z' }] : [],
  }) : route.fallback());
  await page.route('**/api/versions/version-review', (route) => route.request().method() === 'GET' ? json(route, {
    version: { versionId: confirmation.versionId, snapshot: { core: detail.task.result.core, artifacts: [] } },
  }) : route.fallback());
  await page.route('**/api/research-objects/ro-hermes/versions/version-review/record', (route) => route.request().method() === 'GET' ? json(route, {
    record: { objectId: 'ro-hermes', versionId: confirmation.versionId, recordState: 'recorded', sdf: detail.task.result.core, manifest: [], claims: [], evidence: [] },
  }) : route.fallback());
  await page.route('**/api/ingestion/tasks/task-review', (route) => json(route, detail));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'review-csrf' }));
  await page.route('**/api/ingestion/task-review/confirm', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ version: 2, core: detail.task.result.core, sourceAgentTaskId: 'agent-review' });
    confirmations += 1;
    detail.task.state = 'confirmed';
    detail.version = confirmation.version;
    return json(route, { sdf: { core: detail.task.result.core }, task: detail.task, confirmation });
  });
  await page.goto(`${baseUrl}/research-objects/ro-hermes/hermes?task=task-review&hermes-motion=full`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '确认你的研究结构' })).toBeVisible();
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'awaiting_approval');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(page.locator('.hermes-companion-actor')).toHaveCSS('animation-name', 'none');
  expect(confirmations).toBe(0);
  await page.getByRole('button', { name: '确认并创建版本' }).click();
  await expect(page).toHaveURL(`${baseUrl}/research-objects/ro-hermes/versions?version=version-review`);
  await expect(page.locator('[data-selected-version="version-review"]')).toContainText('Results');
  expect(confirmations).toBe(1);
  await page.goBack({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/hermes\?task=task-review&hermes-motion=full$/);
  await expect(page.getByText('已确认并写入新版本。')).toBeVisible();
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'idle');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'idle');
  await expect(page.getByRole('button', { name: '已确认' })).toBeDisabled();
  expect(confirmations).toBe(1);
});

test('Hermes keeps visible renderer-owned draw heartbeat gaps within 750ms', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  const heartbeats = await rig.evaluate((node) => new Promise<number[]>((resolve, reject) => {
    const values = [Number(node.getAttribute('data-hermes-last-draw-at'))];
    const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error(`heartbeat timeout: ${values.join(',')}`)); }, 4_000);
    const observer = new MutationObserver(() => {
      const value = Number(node.getAttribute('data-hermes-last-draw-at'));
      if (value > values.at(-1)!) values.push(value);
      if (values.length < 5) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(values);
    });
    observer.observe(node, { attributeFilter: ['data-hermes-last-draw-at'] });
  }));
  expect(heartbeats[0]).toBeGreaterThan(0);
  expect(Math.max(...heartbeats.slice(1).map((value, index) => value - heartbeats[index]))).toBeLessThanOrEqual(750);
});

test('anchored Hermes opens an explicit contextual guide without leaving the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDashboard(page);
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'test-csrf' }));
  await page.route('**/api/agent/sessions', async (route) => {
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({ kind: 'workspace.guide', title: 'Organise today’s imported paper' });
    await json(route, { session: { id: 'session-guide' } }, 201);
  });
  const succeededTask = {
    id: 'guide-task', sessionId: 'session-guide', kind: 'workspace.guide', status: 'succeeded', progress: 100,
    result: {
      summary: 'Review the imported evidence, then shape it into a reusable research object.',
      nextSteps: [{ label: 'Start an import', intent: 'start-import' }], needsMoreInformation: true,
    },
    error: null, createdAt: 'now', updatedAt: 'now',
  };
  await page.route('**/api/agent/tasks**', async (route) => {
    if (route.request().method() === 'GET') {
      await json(route, { tasks: [] });
      return;
    }
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    expect(route.request().postDataJSON()).toMatchObject({ sessionId: 'session-guide', kind: 'workspace.guide' });
    await json(route, { task: {
      id: 'guide-task', sessionId: 'session-guide', kind: 'workspace.guide', status: 'pending', progress: 0,
      result: null, error: null, createdAt: 'now', updatedAt: 'now',
    } }, 201);
  });
  let releaseGuideResult!: () => void;
  const guideResultGate = new Promise<void>((resolve) => { releaseGuideResult = resolve; });
  await page.route('**/api/agent/tasks/guide-task', async (route) => {
    await guideResultGate;
    return json(route, { task: succeededTask });
  });

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  await expect(visual).toHaveAttribute('data-hermes-presence', 'idle');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready');
  await expect(page.locator('[data-hermes-part], [data-hermes-idle-signal]')).toHaveCount(0);
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'false');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('opacity', '0');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('pointer-events', 'none');

  const opener = page.getByRole('button', { name: 'Talk with Hermes', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Hermes research guide' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-assistant-open', 'true');
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-in-conversation', 'true');
  await expect(page.locator('[data-hermes-articulated-canvas]')).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe('/dashboard');
  await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('Organise today’s imported paper');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  try {
    await expect(visual).toHaveAttribute('data-hermes-state', 'scanning');
    await expect(dialog.getByRole('status')).toHaveText('Hermes is organising the evidence…');
  } finally { releaseGuideResult(); }
  await expect(page.getByText('Review the imported evidence, then shape it into a reusable research object.')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('I need a little more context before I can offer reliable guidance.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start an import →' })).toHaveAttribute('href', '/research-objects/new?mode=import');

  await page.getByRole('button', { name: 'Close Hermes' }).click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-hermes-workspace-stage]')).toHaveAttribute('data-hermes-assistant-open', 'false');
  await expect(visual).toHaveAttribute('data-hermes-presence', 'idle');
  await page.keyboard.press('Tab');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'false');

  await page.unroute('**/api/agent/tasks**');
  await page.route('**/api/agent/tasks**', (route) => json(route, { tasks: [succeededTask] }));
  await page.reload({ waitUntil: 'networkidle' });
  await opener.click();
  await expect(page.getByText('Review the imported evidence, then shape it into a reusable research object.')).toBeVisible();
  await page.getByRole('button', { name: 'Close Hermes' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  const mobileDrawer = page.getByRole('dialog', { name: 'Hermes research guide' });
  await expect(mobileDrawer).toBeVisible();
  // The current conversation sheet keeps an 8px viewport inset on each side.
  const mobileDrawerBox = await mobileDrawer.boundingBox();
  expect(mobileDrawerBox).not.toBeNull();
  expect(Math.round(mobileDrawerBox!.x)).toBe(8);
  expect(Math.round(mobileDrawerBox!.width)).toBe(390 - 16);
  await expect(mobileDrawer).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(mobileDrawer).toHaveCSS('color', 'rgb(24, 47, 53)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `${outDir}/contextual-guide-390x844.png`, fullPage: true });
});

test('Hermes resumes polling the same task after a transient failure', async ({ page }) => {
  await mockDashboard(page);
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'test-csrf' }));
  await page.route('**/api/agent/sessions', (route) => json(route, { session: { id: 'session-retry' } }, 201));
  let submissions = 0;
  await page.route('**/api/agent/tasks**', async (route) => {
    if (route.request().method() === 'GET') return json(route, { tasks: [] });
    submissions += 1;
    return json(route, { task: {
      id: 'guide-retry', sessionId: 'session-retry', kind: 'workspace.guide', status: 'pending', progress: 10,
      result: null, error: null, createdAt: 'now', updatedAt: 'now',
    } }, 201);
  });
  let polls = 0;
  await page.route('**/api/agent/tasks/guide-retry', (route) => {
    polls += 1;
    if (polls === 1) return json(route, { error: { message: 'Temporary polling failure' } }, 503);
    return json(route, { task: {
      id: 'guide-retry', sessionId: 'session-retry', kind: 'workspace.guide', status: 'succeeded', progress: 100,
      result: { summary: 'The original task resumed.', nextSteps: [], needsMoreInformation: false },
      error: null, createdAt: 'now', updatedAt: 'now',
    } });
  });

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.locator('[data-hermes-renderer="articulated-mesh"]').click();
  await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('Resume safely');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' }).getByRole('alert')).toContainText('Temporary polling failure');
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Resume this task' }).click();
  await expect(page.getByText('The original task resumed.')).toBeVisible({ timeout: 5_000 });
  expect(submissions).toBe(1);
});

for (const recoveryCase of [
  { name: 'running', status: 'running', result: null, error: null, canRetry: false },
  { name: 'succeeded', status: 'succeeded', result: { sources: [], providers: [] }, error: null, canRetry: false },
  { name: 'auth_required', status: 'succeeded', result: { sources: [], providers: [{ provider: 'scansci', status: 'unavailable', code: 'auth_required' }] }, error: null, canRetry: false },
  { name: 'failed', status: 'failed', result: null, error: '[retryable] upstream timeout', canRetry: true },
] as const) {
  test(`Drawer close and reopen reconciles the same ${recoveryCase.name} literature task`, async ({ page }) => {
    await mockDashboard(page);
    await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'literature-csrf' }));
    let recoveryGets = 0;
    const unrelatedTaskB = {
      id: 'unrelated-active-b', sessionId: 'session-b', kind: 'source.retrieve', status: 'running', progress: 80,
      retryCount: 0, canRetry: false, executionAttempt: 1, result: null, error: null,
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:02:00.000Z',
    };
    await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal', (route) => {
      recoveryGets += 1;
      return json(route, { tasks: [unrelatedTaskB] });
    });
    await page.route('**/api/agent/tasks/unrelated-active-b', (route) => json(route, { task: unrelatedTaskB }));
    const callerKeys: string[] = [];
    const chargedKeys = new Set<string>();
    let retryWrites = 0;
    const task = {
      id: `literature-${recoveryCase.name}`, sessionId: 'literature-session', kind: 'source.retrieve',
      status: recoveryCase.status, progress: recoveryCase.status === 'running' ? 45 : 100, retryCount: 0,
      canRetry: recoveryCase.canRetry, executionAttempt: 1, result: recoveryCase.result, error: recoveryCase.error,
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:01:00.000Z',
    };
    await page.route('**/api/literature/acquisitions', (route) => {
      const key = route.request().headers()['idempotency-key'];
      if (!key) throw new Error('literature request is missing its caller key');
      callerKeys.push(key);
      chargedKeys.add(key);
      return json(route, {
        researchObject: { id: 'personal-library', workspaceId: 'personal-workspace', title: 'Personal Literature Library', status: 'draft', visibility: 'private', version: 1, createdAt: task.createdAt },
        session: { id: task.sessionId, researchObjectId: 'personal-library', kind: 'retrieval', title: '', status: 'active', createdAt: task.createdAt },
        task,
      }, 202);
    });
    await page.route(`**/api/agent/tasks/${task.id}/retry`, (route) => {
      retryWrites += 1;
      return json(route, { task: { ...task, status: 'pending', progress: 0, retryCount: 1, canRetry: false, result: null, error: null } });
    });
    await page.route(`**/api/agent/tasks/${task.id}`, (route) => json(route, { task }));

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const recoveryBaseline = recoveryGets;
    const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
    await visual.click();
    await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('download paper 10.1038/nature12373');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Hermes research guide' });
    await expect.poll(() => callerKeys.length).toBe(1);
    expect(recoveryGets).toBe(recoveryBaseline);
    await expect(dialog).not.toContainText('unrelated-active-b');
    await expect(dialog.locator('[data-literature-state]')).toHaveAttribute('data-literature-state', recoveryCase.name === 'auth_required' ? 'auth_required' : recoveryCase.status);
    await page.getByRole('button', { name: 'Close Hermes' }).click();
    await visual.click();
    dialog = page.getByRole('dialog', { name: 'Hermes research guide' });
    await expect.poll(() => callerKeys.length).toBe(2);
    expect(recoveryGets).toBe(recoveryBaseline);
    expect(new Set(callerKeys).size).toBe(1);
    expect(chargedKeys.size).toBe(1);
    await expect(dialog.locator('[data-literature-state]')).toHaveAttribute('data-literature-state', recoveryCase.name === 'auth_required' ? 'auth_required' : recoveryCase.status);
    if (recoveryCase.name === 'failed') {
      await page.getByRole('button', { name: 'Try again' }).click();
      expect(retryWrites).toBe(1);
      expect(chargedKeys.size).toBe(1);
    }
    if (recoveryCase.name === 'succeeded') {
      await page.getByRole('button', { name: 'Back to research guidance' }).click();
      await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('download paper 10.1000/new-intent');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect.poll(() => chargedKeys.size).toBe(2);
      expect(callerKeys.at(-1)).not.toBe(callerKeys[0]);
    }
  });
}

test('RO Hermes literature target comes from the route rather than a cross-RO task suggestion', async ({ page }) => {
  const routeRo = '00000000-0000-4000-8000-000000000701';
  const taskRo = '00000000-0000-4000-8000-000000000702';
  await page.route(`**/api/research-objects/${routeRo}/ingestion`, (route) => route.request().method() === 'GET' ? json(route, {
    researchObjectId: routeRo, version: 1, tasks: [], latestConfirmation: null,
  }) : route.fallback());
  await page.route(`**/api/research-objects/${routeRo}/hermes-runs?ingestionTaskId=task-cross-ro`, (route) => route.request().method() === 'GET' ? json(route, { run: null }) : route.fallback());
  await page.route('**/api/auth/me', (route) => json(route, { userId: 'cross-ro-user', email: 'cross@example.invalid', displayName: 'Cross RO', status: 'email_verified', level: 'free' }));
  await page.route('**/api/ingestion/tasks/task-cross-ro', (route) => json(route, {
    batchId: 'batch-cross', researchObjectId: taskRo, version: 1,
    task: { id: 'task-cross-ro', researchObjectId: taskRo, logicalPath: 'other-ro.pdf', state: 'needs_review', result: { core: { schemaVersion: '0.1.0', problem: 'p', insight: 'i', method: 'm', results: 'r', limitations: 'l', reproducibility: 'x' } } },
  }));
  let recoveryGets = 0;
  const unrelatedRouteB = {
    id: 'unrelated-route-b', sessionId: 'route-b-session', kind: 'source.retrieve', status: 'running', progress: 70,
    retryCount: 0, canRetry: false, executionAttempt: 1, result: null, error: null,
    createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:02:00.000Z',
  };
  await page.route(`**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=research_object&researchObjectId=${routeRo}`, (route) => {
    recoveryGets += 1;
    return json(route, { tasks: [unrelatedRouteB] });
  });
  await page.route('**/api/agent/tasks/unrelated-route-b', (route) => json(route, { task: unrelatedRouteB }));
  await page.route('**/api/agent/tasks?actionable=false&kind=workspace.guide', (route) => json(route, { tasks: [] }));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'cross-ro-csrf' }));
  let submittedTarget: unknown;
  await page.route('**/api/literature/acquisitions', (route) => {
    submittedTarget = route.request().postDataJSON()?.target;
    return json(route, { task: { id: 'cross-source', sessionId: 'cross-session', kind: 'source.retrieve', status: 'pending', progress: 0, retryCount: 0, canRetry: false, executionAttempt: 0, result: null, error: null, createdAt: 'now', updatedAt: 'now' }, researchObject: {}, session: {} }, 202);
  });

  await page.goto(`${baseUrl}/research-objects/${routeRo}/hermes?task=task-cross-ro`, { waitUntil: 'networkidle' });
  const recoveryBaseline = recoveryGets;
  await page.locator('[data-hermes-renderer="articulated-mesh"]').click();
  await page.getByLabel('Send an instruction to Hermes', { exact: true }).fill('download paper 10.1038/nature12373');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => submittedTarget).toEqual({ kind: 'research_object', researchObjectId: routeRo });
  expect(recoveryGets).toBe(recoveryBaseline);
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).not.toContainText('unrelated-route-b');
});

test('Evidence Intake ignores Enter while Chinese IME composition is active', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => json(route, { userId: 'ime-user', email: 'ime@example.invalid', displayName: 'IME', status: 'email_verified', level: 'free' }));
  await page.route('**/api/workspaces', (route) => json(route, { workspaces: [{ id: 'workspace-ime', name: 'Personal', type: 'personal', role: 'owner' }] }));
  await page.route('**/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal', (route) => json(route, { tasks: [] }));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'ime-csrf' }));
  let submissions = 0;
  await page.route('**/api/literature/acquisitions', (route) => {
    submissions += 1;
    return json(route, { task: { id: 'ime-task', sessionId: 'ime-session', kind: 'source.retrieve', status: 'pending', progress: 0, retryCount: 0, canRetry: false, executionAttempt: 0, result: null, error: null, createdAt: 'now', updatedAt: 'now' }, researchObject: {}, session: {} }, 202);
  });
  await page.goto(`${baseUrl}/research-objects/new?mode=import`, { waitUntil: 'networkidle' });
  await page.locator('summary').filter({ hasText: 'Get full text' }).click();
  const input = page.getByLabel('Title, DOI, or arXiv ID');
  await input.fill('阿秒脉冲产生与测量');
  await input.evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, isComposing: true, key: 'Enter', keyCode: 229,
  })));
  expect(submissions).toBe(0);
  await input.press('Enter');
  await expect.poll(() => submissions).toBe(1);
});
