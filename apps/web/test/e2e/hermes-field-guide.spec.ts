import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

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
  await expect(page.locator('[data-hermes-guide-bubble]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Explain|解释/i })).toBeVisible();
  await expectGuideClearOf(page, page.locator('input[name="title"]'));
  await expect(page.getByRole('button', { name: /Draft|草拟/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Check|检查/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Explain|解释/i }).click();
  await expect(page.locator('[data-hermes-guide-explanation]')).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-guide-motion', 'static');
  await expect(stage.locator('[data-hermes-particles]')).toHaveCount(0);
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

  await page.evaluate(() => {
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    Object.assign(blocker.style, { position: 'fixed', inset: '0', zIndex: '1' });
    document.body.append(blocker);
  });
  const stage = page.locator('[data-hermes-workspace-stage]');
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
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'ro-title');
  await page.locator('input[name="title"]').fill('Attosecond optical sampling');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'source-import');
  await expect(page.locator('[data-hermes-guide-bubble]')).toContainText(/source|证据/i);

  await stage.locator('[data-hermes-input-owner]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
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
