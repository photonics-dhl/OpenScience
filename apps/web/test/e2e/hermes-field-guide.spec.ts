import { expect, test, type Locator, type Page, type Route } from 'playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const visualOut = resolve('test/visual/out/hermes-field-guide');

async function expectExactCenterHit(page: Page, locator: Locator, ownerSelector: string, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must have geometry`).not.toBeNull();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  expect(await page.evaluate(({ owner, x, y }) => document.elementFromPoint(x, y)?.closest(owner) !== null, {
    owner: ownerSelector,
    ...point,
  }), `${label} must own its visible center`).toBe(true);
  return point;
}

async function expectGuideClearOf(page: Page, obstacle: Locator) {
  const boxes = await Promise.all([
    page.locator('[data-hermes-carrier-travel-hull="true"]').boundingBox(),
    page.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]').boundingBox(),
    obstacle.boundingBox(),
  ]);
  expect(boxes.every(Boolean)).toBe(true);
  const [actor, bubble, target] = boxes as NonNullable<(typeof boxes)[number]>[];
  const occupied = {
    bottom: Math.max(actor.y + actor.height, bubble.y + bubble.height),
    left: Math.min(actor.x, bubble.x),
    right: Math.max(actor.x + actor.width, bubble.x + bubble.width),
    top: Math.min(actor.y, bubble.y),
  };
  expect(occupied.right <= target.x || occupied.left >= target.x + target.width || occupied.bottom <= target.y || occupied.top >= target.y + target.height).toBe(true);
}

async function mockWorkspace(page: Page) {
  await page.route('**/api/auth/me', (route) => json(route, { userId: 'guide-user', email: 'guide@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' }));
  await page.route('**/api/workspaces**', (route) => json(route, { workspaces: [{ id: 'workspace-guide', name: 'Ada lab' }] }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [] }));
  await page.route('**/api/ingestion?actionable=true', (route) => json(route, { tasks: [] }));
  await page.route('**/api/agent/tasks**', (route) => json(route, { tasks: [] }));
  await page.route('**/api/research-objects/ro-guide/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-guide', (route) => json(route, { researchObject: {
    id: 'ro-guide', workspaceId: 'workspace-guide', title: 'Attosecond optical sampling', visibility: 'private', version: 1,
    sdf: { core: { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' } },
  } }));
}

const boxesOverlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

test('a saved bottom-right dock travels with a fixed safe guide-bubble orientation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('openscience:hermes-dock:v1:workspace-current:desktop', JSON.stringify({
    activity: 'balanced', particles: true, proactiveHints: true, sound: false, xRatio: .9, yRatio: .82,
  })));
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/ro-guide/edit?hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  const bubble = page.locator('[data-hermes-guide-bubble]');
  await expect(stage).toHaveAttribute('data-hermes-guide-motion', 'edge-stop');
  await expect(bubble).toBeVisible();
  await page.evaluate(() => {
    window.__hermesFieldGuideJourney = { arrival: null, done: false, hiddenDuringTravel: false, samples: 0, travel: null };
    const sample = () => {
      const stage = document.querySelector('[data-hermes-workspace-stage]');
      const travelling = stage?.getAttribute('data-hermes-guide-motion') === 'travel';
      const visible = Boolean(document.querySelector('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]'));
      if (travelling) {
        window.__hermesFieldGuideJourney.samples += 1;
        window.__hermesFieldGuideJourney.hiddenDuringTravel ||= !visible;
        window.__hermesFieldGuideJourney.travel ??= {
          horizontal: stage?.getAttribute('data-hermes-bubble-horizontal'),
          vertical: stage?.getAttribute('data-hermes-bubble-vertical'),
        };
      }
      if (window.__hermesFieldGuideJourney.hiddenDuringTravel && visible) {
        window.__hermesFieldGuideJourney.arrival = {
          horizontal: stage?.getAttribute('data-hermes-bubble-horizontal'),
          vertical: stage?.getAttribute('data-hermes-bubble-vertical'),
        };
        window.__hermesFieldGuideJourney.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: /Take me there|带我过去/ }).click();
  await expect(stage).toHaveAttribute('data-hermes-guide-motion', 'travel');
  await expect(bubble).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__hermesFieldGuideJourney.done)).toBe(true);
  const journey = await page.evaluate(() => window.__hermesFieldGuideJourney);
  expect(journey.samples).toBeGreaterThanOrEqual(10);
  expect(journey.hiddenDuringTravel).toBe(true);
  expect(journey.arrival).toEqual(journey.travel);
  await expect(bubble).toBeVisible();

  const actorBox = await stage.locator('[data-hermes-carrier-travel-hull="true"]').boundingBox();
  const bubbleBox = await bubble.boundingBox();
  const targetBox = await page.locator('[data-hermes-anchor="sdf-problem"]').boundingBox();
  const obstacleBoxes = await page.locator('[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]').evaluateAll((elements) => elements
    .map((element) => element.getBoundingClientRect())
    .filter((bounds) => bounds.width > 0 && bounds.height > 0)
    .map(({ height, width, x, y }) => ({ height, width, x, y })));
  expect(actorBox && bubbleBox && targetBox).toBeTruthy();
  for (const part of [actorBox!, bubbleBox!]) {
    expect(boxesOverlap(part, targetBox!)).toBe(false);
    expect(obstacleBoxes.some((obstacle) => boxesOverlap(part, obstacle))).toBe(false);
  }
});

test('Hermes arrives beside the first RO field without covering it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=blank`, { waitUntil: 'networkidle' });

  const guide = page.locator('[data-hermes-guide-bubble]');
  const title = page.locator('input[name="title"]');
  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(guide).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'ro-title');
  await expect(guide).toContainText(/title|标题/i);
  await expectGuideClearOf(page, title);
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await title.focus();
  await expect(stage).toHaveAttribute('data-hermes-action', 'quiet-write');
});

test('reduced motion retains the guide actions without positional travel or particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=reduced`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  const title = page.locator('input[name="title"]');
  const motionToggle = stage.locator('[data-hermes-motion-toggle]');
  await expect(page.locator('[data-hermes-guide-bubble]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Explain|解释/i })).toBeVisible();
  await expectGuideClearOf(page, title);
  await expect(motionToggle).toBeVisible();
  const [motionBox, titleBox] = await Promise.all([motionToggle.boundingBox(), title.boundingBox()]);
  expect(motionBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(boxesOverlap(motionBox!, titleBox!)).toBe(false);
  await expect(page.getByRole('button', { name: /Draft|草拟/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Check|检查/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Explain|解释/i }).click();
  const explanation = page.locator('[data-hermes-guide-explanation]');
  await expect(explanation).toBeVisible();
  const protectedGuideContent = page.locator('[data-hermes-guide-bubble] p, [data-hermes-guide-bubble] .hermes-companion-actions button, [data-hermes-guide-bubble] .hermes-companion-dismiss');
  const motionBounds = await motionToggle.boundingBox();
  const contentBounds = await protectedGuideContent.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
  }));
  expect(contentBounds.some((bounds) => boxesOverlap(motionBounds!, bounds)), 'motion control must not cover guide copy or actions').toBe(false);
  await expect(stage).toHaveAttribute('data-hermes-guide-motion', 'static');
  await expect(stage.locator('[data-hermes-particles]')).toHaveCount(0);
  await mkdir(visualOut, { recursive: true });
  await page.screenshot({ animations: 'disabled', path: resolve(visualOut, 'reduced-guide-390x844.png') });
});

test('mobile Live2D carrier stays single-layer and docks above the virtual keyboard inset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (window.visualViewport) {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 544 });
    }
  });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  const travelHull = stage.locator('[data-hermes-carrier-travel-hull="true"]');
  const interactionHull = stage.locator('[data-hermes-carrier-interaction-hull="true"]');
  await expect(stage).toHaveAttribute('data-hermes-footprint-source', 'carrier-travel-hull');
  await expect(stage.locator('[data-hermes-live2d-canvas="true"]')).toHaveCount(1);
  await expect(stage.locator('[data-hermes-carrier-rear], [data-hermes-carrier-front]')).toHaveCount(0);
  await expect.poll(async () => (await travelHull.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(544);
  const [travelBox, interactionBox] = await Promise.all([travelHull.boundingBox(), interactionHull.boundingBox()]);
  expect(travelBox).not.toBeNull();
  expect(interactionBox).not.toBeNull();
  expect(travelBox!.y + travelBox!.height).toBeLessThanOrEqual(545);
  expect(interactionBox!.width).toBeGreaterThanOrEqual(44);
  expect(interactionBox!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('a fully obstructed guide keeps Hermes and its motion control visible while suppressing only the bubble', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage.locator('[data-hermes-motion-toggle]')).toBeHidden();
  await page.evaluate(() => {
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    Object.assign(blocker.style, { position: 'fixed', inset: '0', zIndex: '1' });
    document.body.append(blocker);
  });
  await expect(stage).toHaveAttribute('data-hermes-guide-suppressed', 'true');
  await expect(stage).toBeVisible();
  await expect(stage.locator('[data-hermes-motion-toggle]')).toBeVisible();
  await expect(page.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')).toHaveCount(0);
});

test('creation guidance advances to source import and the route keeps a working Hermes entry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=import&hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  const title = page.locator('input[name="title"]');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'ro-title');
  await title.click();
  await expect(title).toBeFocused();
  await title.fill('Attosecond optical sampling');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'source-import');
  await expect(page.locator('[data-hermes-guide-bubble]')).toContainText(/source|证据/i);

  const workspace = page.locator('select').first();
  await workspace.click();
  await expect(workspace).toBeFocused();
  await page.keyboard.press('Escape');

  const browse = page.locator('button', { hasText: /Choose files|选择文件/i });
  const chooserPromise = page.waitForEvent('filechooser');
  await browse.click();
  const chooser = await chooserPromise;
  await chooser.setFiles([]);

  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const transparentPoint = { x: stageBox!.x + 4, y: stageBox!.y + 4 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-hermes-workspace-stage]') === null, transparentPoint),
    'the guide stage transparent perimeter must remain page-owned').toBe(true);

  const visibleHermes = stage.locator('[data-hermes-carrier-travel-hull="true"]');
  const visiblePoint = await expectExactCenterHit(page, visibleHermes, '[data-hermes-carrier-interaction-hull="true"]', 'visible Hermes art');
  const invokeCount = Number(await stage.getAttribute('data-hermes-invoke-count'));
  await page.mouse.click(visiblePoint.x, visiblePoint.y);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', String(invokeCount + 1));
});

test('field guidance leaves the primary blank-RO create action directly operable', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockWorkspace(page);
  let createRequests = 0;
  await page.route('**/api/research-objects', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    createRequests += 1;
    return json(route, { researchObject: { id: 'ro-created', workspaceId: 'workspace-guide', version: 1 } });
  });
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  await page.locator('a[href="/research-objects/new?mode=blank"]').click();
  await page.waitForURL('**/research-objects/new?mode=blank');

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'ro-title');
  await page.waitForFunction(() => document.querySelector<HTMLSelectElement>('select')?.value === 'workspace-guide');
  await page.locator('input[name="title"]').fill('Visible guide hit ownership');
  await expect(page.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')).toBeVisible();
  const create = page.getByRole('button', { name: /Create research object|创建 Research Object/i });
  await expect(create).toHaveAttribute('data-hermes-protected', 'true');
  const createBox = await create.boundingBox();
  expect(createBox).not.toBeNull();
  const geometry = await page.evaluate(({ x, y }) => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds ? { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top } : null;
    };
    const target = document.elementFromPoint(x, y);
    return {
      actor: rect('[data-hermes-companion-actor="true"]'),
      button: rect('button[type="submit"]'),
      hit: target instanceof Element ? { className: target.className, tagName: target.tagName } : null,
      interaction: rect('[data-hermes-carrier-interaction-hull="true"]'),
      stage: rect('[data-hermes-workspace-stage]'),
      travel: rect('[data-hermes-carrier-travel-hull="true"]'),
    };
  }, { x: createBox!.x + createBox!.width / 2, y: createBox!.y + createBox!.height / 2 });
  await expect(stage).toHaveAttribute('data-hermes-action', 'guide-arrive', { timeout: 15_000 });
  const settledGeometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds ? { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top } : null;
    };
    const button = document.querySelector('button[type="submit"]')?.getBoundingClientRect();
    const hit = button ? document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2) : null;
    const stageNode = document.querySelector('[data-hermes-workspace-stage]');
    return {
      action: stageNode?.getAttribute('data-hermes-action'),
      actor: rect('[data-hermes-carrier-travel-hull="true"]'),
      bubble: rect('[data-hermes-guide-bubble]'),
      button: rect('button[type="submit"]'),
      guideSuppressed: stageNode?.getAttribute('data-hermes-guide-suppressed'),
      hit: hit instanceof Element ? { className: hit.className, tagName: hit.tagName } : null,
      protectedCount: document.querySelectorAll('[data-hermes-protected="true"]').length,
      stage: rect('[data-hermes-workspace-stage]'),
    };
  });
  expect(settledGeometry.hit?.tagName, `settled protected replan must expose Create: ${JSON.stringify({ geometry, settledGeometry })}`).toBe('BUTTON');

  await create.click();
  await page.waitForTimeout(500);
  const afterClick = {
    assistantOpen: await stage.getAttribute('data-hermes-assistant-open'),
    createRequests,
    invokeCount: await stage.getAttribute('data-hermes-invoke-count'),
  };
  expect(createRequests, `real create click must submit exactly once: ${JSON.stringify({ afterClick, geometry })}`).toBe(1);
});

test('editing guidance follows the selected SDF field and keeps functional draft actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/research-objects/ro-guide/edit?hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-problem');
  await page.locator('[data-sdf-node="2"] > button').click();
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-insight');
  await expect(page.getByRole('button', { name: /Draft|草拟/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Check|检查/i })).toBeVisible();
  await expectGuideClearOf(page, page.getByRole('textbox', { name: /Insight|洞见/i }));
  await page.getByRole('button', { name: /Explain|解释/i }).click();
  await expect(page.locator('[data-hermes-guide-explanation]')).toContainText(/claim|evidence|论断|证据/i);
});
