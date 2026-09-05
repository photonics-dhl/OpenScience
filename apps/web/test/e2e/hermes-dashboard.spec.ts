import { expect, test, type Page, type Route } from 'playwright/test';

import { HERMES_PATROL_MOTION_ENVELOPE, HERMES_PATROL_TRANSLATION_ENVELOPE } from '../../lib/hermes/companion-placement';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const outDir = 'test/visual/out/hermes-dashboard';

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

interface PerformanceBubbleEvidence {
  action: string;
  actor: { x: number; y: number; width: number; height: number };
  bubble: { x: number; y: number; width: number; height: number };
  bubbleTransformY: number;
  cue: string;
  horizontal: string;
  protectedRegions: Array<{ x: number; y: number; width: number; height: number }>;
  scrollY: number;
  vertical: string;
  viewport: { height: number; width: number };
}

async function readPerformanceBubbleEvidence(page: Page): Promise<PerformanceBubbleEvidence | null> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
    const bubble = stage?.querySelector<HTMLElement>('[data-hermes-performance-bubble="true"]');
    const actor = stage?.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]');
    const cue = bubble?.dataset.hermesSpeechCue;
    const horizontal = stage?.dataset.hermesBubbleHorizontal;
    const vertical = stage?.dataset.hermesBubbleVertical;
    if (!stage || !bubble || !actor || !cue || !horizontal || !vertical
      || stage.dataset.hermesSpeechVisible !== 'true'
      || bubble.dataset.hermesSpeechVisible !== 'true'
      || stage.dataset.hermesBubbleSafe !== 'true') return null;
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const bubbleBounds = rect(bubble);
    const actorBounds = rect(actor);
    if (bubbleBounds.width <= 0 || bubbleBounds.height <= 0 || actorBounds.width <= 0 || actorBounds.height <= 0) return null;
    return {
      action: stage.dataset.hermesAction ?? 'missing',
      actor: actorBounds,
      bubble: bubbleBounds,
      bubbleTransformY: new DOMMatrixReadOnly(getComputedStyle(bubble).transform).m42,
      cue,
      horizontal,
      protectedRegions: Array.from(document.querySelectorAll('[data-hermes-protected="true"]')).map(rect)
        .filter((bounds) => bounds.width > 0 && bounds.height > 0),
      scrollY: window.scrollY,
      vertical,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
}

async function waitForPerformanceBubbleEvidence(
  page: Page,
  accept: (evidence: PerformanceBubbleEvidence) => boolean = isSafePerformanceBubble,
): Promise<PerformanceBubbleEvidence> {
  const actions = new Set<string>();
  for (let elapsed = 0; elapsed < 300_000; elapsed += 500) {
    const evidence = await readPerformanceBubbleEvidence(page);
    if (evidence) {
      actions.add(evidence.action);
      if (accept(evidence)) return evidence;
    }
    await page.clock.fastForward(500);
    await page.waitForTimeout(5);
  }
  throw new Error(`No measurable performance bubble; observed actions: ${Array.from(actions).join(', ')}`);
}

function isSafePerformanceBubble(evidence: PerformanceBubbleEvidence) {
  return !evidence.protectedRegions.some((region) => overlaps(evidence.bubble, region))
    && isPerformanceCompositeInsideViewport(evidence)
    && /^(left|right)$/u.test(evidence.horizontal)
    && /^(above|below)$/u.test(evidence.vertical);
}

function isPerformanceCompositeInsideViewport(evidence: PerformanceBubbleEvidence) {
  return evidence.actor.x >= 0
    && evidence.actor.y >= 0
    && evidence.actor.x + evidence.actor.width <= evidence.viewport.width
    && evidence.actor.y + evidence.actor.height <= evidence.viewport.height
    && evidence.bubble.x >= 0
    && evidence.bubble.y >= 0
    && evidence.bubble.x + evidence.bubble.width <= evidence.viewport.width
    && evidence.bubble.y + evidence.bubble.height <= evidence.viewport.height;
}

function expectSafePerformanceBubble(evidence: PerformanceBubbleEvidence) {
  expect(evidence.protectedRegions.some((region) => overlaps(evidence.bubble, region))).toBe(false);
  expect(evidence.actor.x).toBeGreaterThanOrEqual(0);
  expect(evidence.actor.y).toBeGreaterThanOrEqual(0);
  expect(evidence.actor.x + evidence.actor.width).toBeLessThanOrEqual(evidence.viewport.width);
  expect(evidence.actor.y + evidence.actor.height).toBeLessThanOrEqual(evidence.viewport.height);
  expect(evidence.bubble.x).toBeGreaterThanOrEqual(0);
  expect(evidence.bubble.y).toBeGreaterThanOrEqual(0);
  expect(evidence.bubble.x + evidence.bubble.width).toBeLessThanOrEqual(evidence.viewport.width);
  expect(evidence.bubble.y + evidence.bubble.height).toBeLessThanOrEqual(evidence.viewport.height);
  expect(evidence.horizontal).toMatch(/left|right/u);
  expect(evidence.vertical).toMatch(/above|below/u);
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockDashboard(page: Page, taskState?: string) {
  await page.route('**/api/**', (route) => {
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
    if (url.searchParams.get('actionable') === 'false' && url.searchParams.get('kind') === 'workspace.guide') {
      return json(route, { tasks: [] });
    }
    if (url.searchParams.get('actionable') === 'false' && url.searchParams.get('kind') === 'source.retrieve') {
      return json(route, { tasks: [] });
    }
    return route.fallback();
  });
}

async function expectDashboardProtectedRegions(page: Page) {
  const regions = [
    page.locator('header nav[data-hermes-primary-navigation="true"]'),
    page.locator('section[aria-labelledby="continue-title"]'),
    page.locator('section[aria-labelledby="import-stage-title"]'),
    page.locator('aside[aria-labelledby="hermes-task-title"]'),
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
  await expectDashboardProtectedRegions(page);
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

test('Hermes measures a real performance bubble into a protected-safe viewport placement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDashboard(page);
  await page.clock.install({ time: new Date('2026-08-23T00:00:00Z') });
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const initialEvidence = await waitForPerformanceBubbleEvidence(page);
  expectSafePerformanceBubble(initialEvidence);

  const transitionTarget = initialEvidence.protectedRegions.find((region) => (
    region.width >= initialEvidence.bubble.width && region.height >= initialEvidence.bubble.height
  ));
  expect(transitionTarget).toBeDefined();
  const transitionDelta = {
    x: transitionTarget!.x + (transitionTarget!.width - initialEvidence.bubble.width) / 2 - initialEvidence.bubble.x,
    y: transitionTarget!.y + (transitionTarget!.height - initialEvidence.bubble.height) / 2 - initialEvidence.bubble.y,
  };
  const forcedBubble = {
    ...initialEvidence.bubble,
    x: initialEvidence.bubble.x + transitionDelta.x,
    y: initialEvidence.bubble.y + transitionDelta.y,
  };
  expect(overlaps(forcedBubble, transitionTarget!)).toBe(true);
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
    if (!stage) throw new Error('Hermes stage missing');
    stage.dataset.hermesTestGeometryMutationCount = '0';
    new MutationObserver(() => {
      stage.dataset.hermesTestGeometryMutationCount = String(Number(stage.dataset.hermesTestGeometryMutationCount ?? '0') + 1);
    }).observe(stage, {
      attributeFilter: ['data-hermes-bubble-horizontal', 'data-hermes-bubble-safe', 'data-hermes-bubble-vertical', 'style'],
      attributes: true,
    });
  });
  await page.evaluate((delta) => {
    const anchor = document.querySelector<HTMLElement>('[data-hermes-dock-anchor="true"]');
    if (!anchor) throw new Error('Hermes anchor missing');
    anchor.style.transform = `translate(${delta.x}px, ${delta.y}px)`;
    window.dispatchEvent(new Event('resize'));
  }, transitionDelta);
  await expect.poll(async () => Number(await page.locator('[data-hermes-workspace-stage="true"]')
    .getAttribute('data-hermes-test-geometry-mutation-count') ?? '0')).toBeGreaterThan(0);
  const transitionedEvidence = await waitForPerformanceBubbleEvidence(page, (evidence) => {
    const targetStillPresent = evidence.protectedRegions.some((region) => (
      Math.abs(region.x - transitionTarget!.x) < 1
      && Math.abs(region.y - transitionTarget!.y) < 1
      && Math.abs(region.width - transitionTarget!.width) < 1
      && Math.abs(region.height - transitionTarget!.height) < 1
    ));
    return targetStillPresent
      && !overlaps(evidence.bubble, transitionTarget!)
      && !overlaps(evidence.actor, transitionTarget!)
      && isSafePerformanceBubble(evidence);
  });
  expectSafePerformanceBubble(transitionedEvidence);
  expect(overlaps(transitionedEvidence.bubble, transitionTarget!) || overlaps(transitionedEvidence.actor, transitionTarget!)).toBe(false);

  await page.evaluate(() => {
    document.querySelectorAll('[data-hermes-protected="true"]').forEach((element) => element.removeAttribute('data-hermes-protected'));
    const spacer = document.createElement('div');
    spacer.style.height = '1000px';
    document.body.append(spacer);
    document.body.classList.add('hermes-bubble-scroll-fixture');
  });
  let scrollEvidence: { before: PerformanceBubbleEvidence; after: PerformanceBubbleEvidence } | null = null;
  for (let attempt = 0; attempt < 4 && !scrollEvidence; attempt += 1) {
    const before = await waitForPerformanceBubbleEvidence(page, isPerformanceCompositeInsideViewport);
    await page.evaluate(() => window.scrollBy(0, 40));
    let after: PerformanceBubbleEvidence | null = null;
    await expect.poll(async () => {
      const candidate = await readPerformanceBubbleEvidence(page);
      if (!candidate
        || candidate.cue !== before.cue
        || candidate.horizontal !== before.horizontal
        || candidate.vertical !== before.vertical
        || candidate.scrollY < before.scrollY + 30) return false;
      after = candidate;
      return true;
    }, { timeout: 1_000 }).toBe(true).catch(() => undefined);
    if (after) scrollEvidence = { after, before };
  }
  expect(scrollEvidence).not.toBeNull();
  const beforeScroll = scrollEvidence!.before;
  const afterScroll = scrollEvidence!.after;
  expect(Math.abs(
    ((afterScroll.bubble.y - afterScroll.bubbleTransformY) - (beforeScroll.bubble.y - beforeScroll.bubbleTransformY))
      - (afterScroll.actor.y - beforeScroll.actor.y),
  )).toBeLessThan(3);
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
    await expect(page.getByRole('heading', { name: 'Research dashboard' })).toBeVisible({ timeout: 15_000 });
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
  const mobileStageBox = await page.locator('[data-hermes-workspace-stage]').boundingBox();
  const mobileMotionToggleBox = await page.locator('[data-hermes-motion-toggle]').boundingBox();
  expect(mobileStageBox).not.toBeNull();
  expect(mobileMotionToggleBox).not.toBeNull();
  expect((mobileMotionToggleBox?.y ?? Infinity) + (mobileMotionToggleBox?.height ?? 0))
    .toBeLessThanOrEqual(mobileStageBox?.y ?? 0);
  await page.screenshot({ path: `${outDir}/suggesting-needs-review-390x844.png`, fullPage: true, animations: 'disabled' });

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  const reducedVisual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  await expect(reducedVisual).toHaveAttribute('data-hermes-input-ready', 'false');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(page.locator('.hermes-rig-canvas')).toHaveCSS('display', 'block');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('opacity', '1');
  await expect(page.locator('.hermes-guide-nudge')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: `${outDir}/idle-reduced-390x844.png`, fullPage: true, animations: 'disabled' });
  expect(browserErrors).toEqual([]);
});

test('Hermes contextual prompt is an integrated dark bubble instead of a white strip', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  const prompt = page.locator('.hermes-guide-nudge');
  await expect(prompt).toHaveAttribute('data-visible', 'true');
  const promptBackground = await prompt.evaluate((node) => getComputedStyle(node).backgroundColor);
  const promptChannels = promptBackground.match(/[\d.]+/gu)?.map(Number) ?? [];
  expect(promptChannels).toHaveLength(4);
  expect(Math.max(...promptChannels.slice(0, 3))).toBeLessThan(48);
  expect(promptChannels[3]).toBeGreaterThanOrEqual(.85);
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
  await expect(loadingSurface.locator('[aria-live="polite"]')).toBeVisible();
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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await researchErrorResponse;
  await expect(page.locator('p[role="alert"]')).toContainText('Research index unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `${outDir}/error-390x844.png`, fullPage: true, animations: 'disabled' });
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
  await expect(page.getByRole('heading', { name: 'Research dashboard' })).toBeVisible();
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
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(page.locator('.hermes-rig-canvas')).toHaveCSS('display', 'block');

  await page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
});

test('Hermes replaces a lost canvas when approval ends live', async ({ page }) => {
  await page.goto(`${baseUrl}/_visual/hermes-articulation`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  const firstCanvas = await page.locator('[data-hermes-articulated-canvas="true"]').elementHandle();

  await page.getByRole('button', { name: 'Approval' }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-static-frame', 'true');
  await page.getByRole('button', { name: 'Idle' }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  const resumedCanvas = await page.locator('[data-hermes-articulated-canvas="true"]').elementHandle();

  expect(await firstCanvas?.evaluate((first, second) => first !== second, resumedCanvas)).toBe(true);
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
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
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
  await page.route('**/hermes/live2d/wanko/wanko_touch.1024/texture_00.png', async (route) => {
    textureRequested = true;
    await textureHold;
    await route.continue();
  });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toBeVisible();
  await expect.poll(() => textureRequested).toBe(true);
  const offscreenStyle = await page.addStyleTag({ content: '[data-hermes-rig="live2d-wanko"] { transform: translateY(1800px) !important; }' });
  await page.waitForTimeout(120);
  releaseTexture?.();
  await page.waitForTimeout(600);
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'starting');
  await expect(page.locator('[data-hermes-articulated-canvas="true"]')).not.toHaveAttribute('data-hermes-head', /.+/);

  await offscreenStyle.evaluate((style) => style.remove());
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
});

test('Hermes aborts and releases a pending initialization on SPA unmount', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __hermesPendingContexts?: { acquired: number; lost: number };
      __releaseHermesPendingImages?: () => void;
    };
    testWindow.__hermesPendingContexts = { acquired: 0, lost: 0 };
    const originalContext = HTMLCanvasElement.prototype.getContext;
    const tracked = new WeakSet<object>();
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
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
    const pending: Array<() => void> = [];
    HTMLImageElement.prototype.decode = function () {
      if (!this.src.includes('/hermes/live2d/wanko/')) return originalDecode.call(this);
      return new Promise<void>((resolve, reject) => {
        pending.push(() => { void originalDecode.call(this).then(resolve, reject); });
      });
    };
    testWindow.__releaseHermesPendingImages = () => pending.splice(0).forEach((release) => release());
  });
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __hermesPendingContexts?: { acquired: number } }).__hermesPendingContexts?.acquired ?? 0
  ))).toBe(1);

  await page.getByRole('link', { name: /settings|设置/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect.poll(() => page.evaluate(() => {
    const counts = (window as Window & { __hermesPendingContexts?: { acquired: number; lost: number } }).__hermesPendingContexts;
    return (counts?.acquired ?? 0) - (counts?.lost ?? 0);
  })).toBe(0);
  await page.evaluate(() => (window as Window & { __releaseHermesPendingImages?: () => void }).__releaseHermesPendingImages?.());
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
  await visual.click();
  await expect(visual).toHaveAttribute('data-hermes-presence', 'open');
  await expect(canvas).toHaveAttribute('data-hermes-gesture', 'focus');
});

test('Hermes remounts a fresh canvas after a live WebGL context loss', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-rig="live2d-wanko"]');
  const motionToggle = page.locator('[data-hermes-motion-toggle]');
  const oldCanvas = await page.locator('[data-hermes-articulated-canvas]').elementHandle();
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'ready');
  await expect(motionToggle).toHaveAttribute('data-motion-active', 'true');
  await page.locator('[data-hermes-articulated-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(stage).toHaveAttribute('data-hermes-rig-status', 'ready');
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
});

test('Hermes retries with a fresh runtime after the required Cubism model fails', async ({ page }) => {
  await mockDashboard(page);
  await page.route('**/hermes/live2d/wanko/wanko_touch.model3.json', (route) => route.abort('failed'));
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'fallback', { timeout: 20_000 });
  await expect(rig).toHaveAttribute('data-hermes-runtime-reason', 'asset-load-failed');

  await page.unroute('**/hermes/live2d/wanko/wanko_touch.model3.json');
  await page.getByRole('button', { name: /Retry Hermes motion|重试 Hermes 动效/i }).click();
  await expect(rig).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
});

test('Hermes keeps the real six-field approval surface still until confirmation succeeds', async ({ page }) => {
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
  await page.route('**/api/ingestion/tasks/task-review', (route) => json(route, detail));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'review-csrf' }));
  await page.route('**/api/ingestion/task-review/confirm', (route) => {
    detail.task.state = 'confirmed';
    return json(route, { sdf: { core: detail.task.result.core }, task: detail.task });
  });
  await page.goto(`${baseUrl}/research-objects/ro-hermes/hermes?task=task-review&hermes-motion=full`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '确认你的研究结构' })).toBeVisible();
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'awaiting_approval');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-static-frame', 'true');
  await expect(page.locator('.hermes-companion-actor')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: '确认并创建版本' }).click();
  await expect(page.getByText('已确认并写入新版本。')).toBeVisible();
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'idle');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-presentation-state', 'idle');
  await expect(page.getByRole('button', { name: '已确认' })).toBeDisabled();
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

test('Hermes idle story opens a real contextual guide without leaving the workspace', async ({ page }) => {
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
  await page.route('**/api/agent/tasks/guide-task', (route) => json(route, { task: succeededTask }));

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const visual = page.locator('[data-hermes-renderer="articulated-mesh"]');
  await expect(visual).toHaveAttribute('data-hermes-presence', 'idle');
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready');
  await expect(page.locator('[data-hermes-part], [data-hermes-idle-signal]')).toHaveCount(0);
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'true', { timeout: 5_000 });
  const promptBox = await page.locator('.hermes-guide-nudge').boundingBox();
  expect(promptBox).not.toBeNull();
  expect(promptBox!.x).toBeGreaterThanOrEqual(0);
  expect(promptBox!.y).toBeGreaterThanOrEqual(0);
  expect(promptBox!.x + promptBox!.width).toBeLessThanOrEqual(1440);
  expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(900);
  const protectedBoxes = await page.locator('[data-hermes-protected="true"]').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }).filter((bounds) => bounds.width > 0 && bounds.height > 0));
  expect(protectedBoxes.some((region) => overlaps(promptBox!, region))).toBe(false);

  await visual.click();
  const dialog = page.getByRole('dialog', { name: 'Hermes research guide' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(visual).toHaveAttribute('data-hermes-presence', 'open');
  expect(new URL(page.url()).pathname).toBe('/dashboard');
  await page.getByLabel('What would you like to advance today?').fill('Organise today’s imported paper');
  await page.getByRole('button', { name: 'Ask Hermes to plan' }).click();
  await expect(visual).toHaveAttribute('data-hermes-state', 'scanning');
  await expect(page.getByText('Task progress 0%')).toBeVisible();
  await expect(page.getByText('Review the imported evidence, then shape it into a reusable research object.')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('I need a little more context before I can offer reliable guidance.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start an import →' })).toHaveAttribute('href', '/research-objects/new?mode=import');

  await page.getByRole('button', { name: 'Close Hermes' }).click();
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toHaveCount(0);
  await expect(visual).toBeFocused();
  await expect(visual).toHaveAttribute('data-hermes-presence', 'attentive');
  await page.keyboard.press('Tab');
  await expect(visual).toHaveAttribute('data-hermes-presence', 'idle');
  await expect(page.locator('.hermes-guide-nudge')).toHaveAttribute('data-visible', 'false');

  await page.unroute('**/api/agent/tasks**');
  await page.route('**/api/agent/tasks**', (route) => json(route, { tasks: [succeededTask] }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-hermes-renderer="articulated-mesh"]').click();
  await expect(page.getByText('Review the imported evidence, then shape it into a reusable research object.')).toBeVisible();
  await page.getByRole('button', { name: 'Close Hermes' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await visual.click();
  const mobileDrawer = page.getByRole('dialog', { name: 'Hermes research guide' });
  await expect(mobileDrawer).toBeVisible();
  expect(Math.round((await mobileDrawer.boundingBox())?.width ?? 0)).toBe(390);
  await expect(mobileDrawer).toHaveCSS('background-color', 'rgb(11, 15, 12)');
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
  await page.getByLabel('What would you like to advance today?').fill('Resume safely');
  await page.getByRole('button', { name: 'Ask Hermes to plan' }).click();
  await expect(page.locator('.hermes-guide-drawer [role="alert"]')).toContainText('Temporary polling failure');
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
    await page.getByLabel('What would you like to advance today?').fill('download paper 10.1038/nature12373');
    await page.getByRole('button', { name: 'Ask Hermes to plan' }).click();
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
      await page.getByLabel('What would you like to advance today?').fill('download paper 10.1000/new-intent');
      await page.getByRole('button', { name: 'Ask Hermes to plan' }).click();
      await expect.poll(() => chargedKeys.size).toBe(2);
      expect(callerKeys.at(-1)).not.toBe(callerKeys[0]);
    }
  });
}

test('RO Hermes literature target comes from the route rather than a cross-RO task suggestion', async ({ page }) => {
  const routeRo = '00000000-0000-4000-8000-000000000701';
  const taskRo = '00000000-0000-4000-8000-000000000702';
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
  await page.getByLabel('What would you like to advance today?').fill('download paper 10.1038/nature12373');
  await page.getByRole('button', { name: 'Ask Hermes to plan' }).click();
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
