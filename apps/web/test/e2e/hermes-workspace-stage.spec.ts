import { expect, test, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkspace(page: Page) {
  // Legacy size preferences must not change the automatic floating stage.
  await page.addInitScript(() => localStorage.setItem('openscience:hermes-presence:workspace-current', 'original'));
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [{
    id: 'ro-hermes', publicId: 'OSR-2026-000042', title: 'Coherent transport at the attosecond frontier', version: 2, status: 'draft',
  }] }));
  await page.route('**/api/ingestion?actionable=true*', (route) => json(route, { tasks: [] }));
  await page.route('**/api/research-objects/ro-hermes/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-hermes', (route) => json(route, { researchObject: {
    id: 'ro-hermes', workspaceId: 'workspace-hermes', title: 'Coherent transport at the attosecond frontier',
    visibility: 'private', version: 2, sdf: { core: { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' } },
  } }));
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

test('only the primary left pointer can own Hermes click and drag state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const interaction = stage.locator('[data-hermes-carrier-interaction-hull="true"]');
  const startBounds = await interaction.boundingBox();
  expect(startBounds).not.toBeNull();
  const start = { x: startBounds!.x + startBounds!.width / 2, y: startBounds!.y + startBounds!.height / 2 };
  const invokeCount = await stage.getAttribute('data-hermes-invoke-count');

  await page.mouse.click(start.x, start.y, { button: 'right' });
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', invokeCount!);
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toHaveCount(0);

  const secondaryIdle = await stage.evaluate((stageNode, point) => {
    const target = stageNode.querySelector<HTMLElement>('[data-hermes-carrier-interaction-hull="true"]')!;
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: point.x, clientY: point.y, isPrimary: false, pointerId: 41, pointerType: 'touch',
    }));
    target.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, button: 0, clientX: point.x, clientY: point.y, isPrimary: false, pointerId: 41, pointerType: 'touch',
    }));
    return stageNode.hasPointerCapture(41);
  }, start);
  expect(secondaryIdle).toBe(false);
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', invokeCount!);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'true');
  const primaryCapture = await stage.evaluate((stageNode, point) => {
    const target = stageNode.querySelector<HTMLElement>('[data-hermes-carrier-interaction-hull="true"]')!;
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: point.x, clientY: point.y, isPrimary: false, pointerId: 42, pointerType: 'touch',
    }));
    return { primary: stageNode.hasPointerCapture(1), secondary: stageNode.hasPointerCapture(42) };
  }, start);
  expect(primaryCapture).toEqual({ primary: true, secondary: false });
  await page.mouse.move(start.x + 12, start.y + 8, { steps: 2 });
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');

  const settledBounds = await interaction.boundingBox();
  expect(settledBounds).not.toBeNull();
  await page.mouse.click(settledBounds!.x + settledBounds!.width / 2, settledBounds!.y + settledBounds!.height / 2);
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
});

test('page-owned Hermes preserves click intent and settles away from protected work after dragging', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const anchor = page.locator('[data-hermes-dock-anchor="true"]');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '360');
  await expect(anchor).toBeVisible();
  await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
  await stage.scrollIntoViewIfNeeded();
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect({ width: Math.round(stageBox!.width), height: Math.round(stageBox!.height) }).toEqual({ width: 360, height: 360 });
  const viewport = page.viewportSize()!;
  expect(stageBox!.x).toBeGreaterThanOrEqual(0);
  expect(stageBox!.y).toBeGreaterThanOrEqual(0);
  expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(viewport.height);

  const input = stage.locator('[data-hermes-input-owner]');
  const inputBox = await input.boundingBox();
  expect(inputBox).not.toBeNull();
  const start = { x: inputBox!.x + inputBox!.width / 2, y: inputBox!.y + inputBox!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 3, start.y + 2);
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '1');
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-assistant-open', 'true');
  await expect(stage).toHaveAttribute('data-hermes-in-conversation', 'true');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(stage).not.toHaveAttribute('aria-hidden', 'true');
  await expect(stage).not.toHaveAttribute('inert', '');
  await expect(input).toHaveAttribute('tabindex', '-1');
  await expect(stage).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Close Hermes' }).click();
  await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '360');
  await expect(input).toBeFocused();

  const protectedRegions = page.locator('[data-hermes-protected="true"]');
  const protectedBoxes = await protectedRegions.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }).filter((bounds) => bounds.width > 0 && bounds.height > 0));
  const desktopKey = 'openscience:hermes-dock:v1:workspace-current:desktop';
  const mobileKey = 'openscience:hermes-dock:v1:workspace-current:mobile';

  await page.evaluate(() => {
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    blocker.dataset.hermesTestBlocker = 'true';
    blocker.style.cssText = 'position:fixed;inset:0;pointer-events:none';
    document.body.append(blocker);
  });
  const blockedInput = await input.boundingBox();
  expect(blockedInput).not.toBeNull();
  await page.mouse.move(blockedInput!.x + blockedInput!.width / 2, blockedInput!.y + blockedInput!.height / 2);
  await page.mouse.down();
  await page.mouse.move(120, 140, { steps: 8 });
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBeNull();
  await page.locator('[data-hermes-test-blocker="true"]').evaluate((element) => element.remove());

  const cancelInput = await input.boundingBox();
  expect(cancelInput).not.toBeNull();
  await stage.evaluate((element) => {
    element.addEventListener('lostpointercapture', () => {
      element.setAttribute('data-hermes-test-lost-capture-count', String(Number(element.getAttribute('data-hermes-test-lost-capture-count') ?? '0') + 1));
    });
  });
  await page.mouse.move(cancelInput!.x + cancelInput!.width / 2, cancelInput!.y + cancelInput!.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelInput!.x - 40, cancelInput!.y + 30, { steps: 4 });
  expect(await stage.evaluate((element) => element.hasPointerCapture(1))).toBe(true);
  await stage.evaluate((element) => element.releasePointerCapture(1));
  await expect(stage).toHaveAttribute('data-hermes-test-lost-capture-count', '1');
  await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await page.mouse.up();

  const desired = protectedBoxes[0];
  const safeInput = await input.boundingBox();
  expect(safeInput).not.toBeNull();
  await page.mouse.move(safeInput!.x + safeInput!.width / 2, safeInput!.y + safeInput!.height / 2);
  await page.mouse.down();
  await page.mouse.move(desired.x + desired.width / 2, desired.y + desired.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toHaveCount(0);
  const actorBox = await stage.locator('[data-hermes-companion-actor="true"]').boundingBox();
  expect(actorBox).not.toBeNull();
  expect(protectedBoxes.some((region) => overlaps(actorBox!, region))).toBe(false);
  const bubble = stage.locator('[data-hermes-performance-bubble="true"]');
  if (await bubble.count()) {
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox).not.toBeNull();
    expect(protectedBoxes.some((region) => overlaps(bubbleBox!, region))).toBe(false);
    await expect(stage).toHaveAttribute('data-hermes-bubble-safe', 'true');
  }

  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).not.toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBeNull();

  const actorBeforeReflow = await stage.locator('[data-hermes-companion-actor="true"]').boundingBox();
  expect(actorBeforeReflow).not.toBeNull();
  await page.evaluate((bounds) => {
    document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]').forEach((element) => {
      element.dataset.hermesResizeHidden = 'true';
      element.style.display = 'none';
    });
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    blocker.dataset.hermesResizeBlocker = 'true';
    blocker.style.cssText = `position:fixed;pointer-events:none;left:${bounds.x - 24}px;top:${bounds.y - 24}px;width:${bounds.width + 48}px;height:${bounds.height + 48}px`;
    document.body.append(blocker);
  }, actorBeforeReflow!);
  await page.setViewportSize({ width: 1280, height: 820 });
  await expect.poll(async () => {
    const actorAfterReflow = await stage.locator('[data-hermes-companion-actor="true"]').boundingBox();
    const blocker = await page.locator('[data-hermes-resize-blocker="true"]').boundingBox();
    return actorAfterReflow && blocker ? overlaps(actorAfterReflow, blocker) : true;
  }).toBe(false);
  const actorAfterReflow = await stage.locator('[data-hermes-companion-actor="true"]').boundingBox();
  const visibleProtectedAfterReflow = await protectedRegions.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }).filter((bounds) => bounds.width > 0 && bounds.height > 0));
  expect(actorAfterReflow).not.toBeNull();
  expect(visibleProtectedAfterReflow.some((region) => overlaps(actorAfterReflow!, region))).toBe(false);
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).not.toBeNull();
  await page.locator('[data-hermes-resize-blocker="true"]').evaluate((element) => {
    element.remove();
    document.querySelectorAll<HTMLElement>('[data-hermes-resize-hidden="true"]').forEach((region) => {
      region.style.removeProperty('display');
      delete region.dataset.hermesResizeHidden;
    });
  });

  const desktopPreference = await page.evaluate((key) => localStorage.getItem(key), desktopKey);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '120');
  await expect(stage).toHaveAttribute('data-hermes-compact', 'true');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBeNull();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '360');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBe(desktopPreference);
});

test('legacy mobile dock history cannot replace the page-owned rail at either breakpoint', async ({ page }) => {
  const desktopKey = 'openscience:hermes-dock:v1:workspace-current:desktop';
  const mobileKey = 'openscience:hermes-dock:v1:workspace-current:mobile';
  const mobilePreference = JSON.stringify({ activity: 'balanced', particles: true, proactiveHints: true, sound: false, xRatio: .5, yRatio: .12 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: mobileKey, value: mobilePreference });
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const anchor = page.locator('[data-hermes-dock-anchor="true"]');
  for (const width of [390, 800, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(stage).toHaveAttribute('data-hermes-stage-size', width <= 1100 ? '120' : '360');
    await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
    await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBe(mobilePreference);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '120');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
});

for (const width of [1440, 800, 390]) {
  test(`one live canvas survives conversation moves and compact changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkspace(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
    const stage = page.locator('[data-hermes-workspace-stage="true"]');
    const anchor = page.locator('[data-hermes-dock-anchor="true"]');
    await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
    await expect(stage.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
    const identity = await stage.evaluateHandle((node) => ({
      stage: node,
      canvas: node.querySelector('[data-hermes-live2d-canvas="true"]'),
      rig: node.querySelector('[data-hermes-rig="live2d-wanko"]'),
      carrier: node.closest('[data-hermes-portal-carrier="true"]'),
    }));
    const assertIdentity = async () => {
      expect(await identity.evaluate((original) => {
        const current = document.querySelector('[data-hermes-workspace-stage="true"]');
        return current === original.stage
          && current?.querySelector('[data-hermes-live2d-canvas="true"]') === original.canvas
          && current?.querySelector('[data-hermes-rig="live2d-wanko"]') === original.rig
          && current?.closest('[data-hermes-portal-carrier="true"]') === original.carrier;
      })).toBe(true);
      await expect(page.locator('[data-hermes-live2d-canvas="true"]')).toHaveCount(1);
      await expect(page.locator('[data-hermes-portal-carrier="true"]')).toHaveCount(1);
      await expect(page.locator('[data-hermes-runtime-owner="running"]')).toHaveCount(1);
    };
    try {
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await (width <= 1100 ? page.locator('.hermes-compact-invoke') : stage.locator('[data-hermes-input-owner="true"]')).click();
        const conversation = page.locator('.hermes-conversation-transcript > [data-hermes-conversation-companion="true"]');
        await expect(conversation.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
        await expect(stage).toHaveAttribute('data-hermes-in-conversation', 'true');
        await expect(stage).toHaveAttribute('data-hermes-compact', 'false');
        await expect(stage).toBeVisible();
        await expect(stage).toHaveCSS('opacity', '1');
        await expect(stage).not.toHaveAttribute('inert', '');
        await expect(stage).not.toHaveAttribute('aria-hidden', 'true');
        const invoke = stage.locator('[data-hermes-input-owner="true"]');
        await expect(invoke).toHaveAttribute('tabindex', '-1');
        const menu = stage.locator('[data-hermes-pet-menu-button="true"]');
        await page.getByRole('button', { name: 'Close Hermes' }).focus();
        await page.keyboard.press('Tab');
        await expect(menu).toBeFocused();
        await menu.press('Enter');
        await expect(page.locator('[data-hermes-action-menu="true"]')).toBeVisible();
        await page.locator('[data-hermes-action-key="greet"]').click();
        await assertIdentity();
        await page.setViewportSize({ width: width <= 1100 ? 1440 : 390, height: 844 });
        await expect.poll(() => conversation.evaluate((node) => {
          const stage = node.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
          return node.clientWidth > 0 && node.clientHeight > 0
            && Number(stage?.dataset.hermesStageSize) === Math.min(360, node.clientWidth, node.clientHeight);
        })).toBe(true);
        await assertIdentity();
        await page.getByRole('button', { name: 'Close Hermes' }).click();
        await expect(anchor.locator('[data-hermes-workspace-stage="true"]')).toHaveCount(1);
        await expect(stage).toHaveAttribute('data-hermes-in-conversation', 'false');
        await expect(stage).toHaveAttribute('data-hermes-stage-size', width <= 1100 ? '360' : '120');
        await assertIdentity();
        await page.setViewportSize({ width, height: 900 });
        await expect(stage).toHaveAttribute('data-hermes-stage-size', width <= 1100 ? '120' : '360');
        await assertIdentity();
      }
      expect(errors).toEqual([]);
    } finally {
      await identity.dispose();
    }
  });
}

test('Hermes mounts the real Wanko Live2D portrait inside the persistent stage', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });

  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  await expect(rig).toHaveCount(1);
  await expect(stage).toHaveAttribute('data-hermes-footprint-source', 'carrier-travel-hull');
  await expect.poll(async () => ({
    errors: browserErrors,
    status: await rig.getAttribute('data-hermes-rig-status'),
  }), { timeout: 20_000 }).toEqual({ errors: [], status: 'ready' });
  await expect(rig.locator('[data-hermes-live2d-canvas="true"]')).toBeVisible();
  await expect(rig.locator('canvas')).toHaveCount(1);
  const carrier = rig.locator('[data-hermes-carrier="true"]');
  const interactionHull = carrier.locator('[data-hermes-carrier-interaction-hull="true"]');
  await expect(carrier.locator('[data-hermes-carrier-travel-hull="true"]')).toHaveCount(1);
  const carrierBox = await carrier.boundingBox();
  const interactionBox = await interactionHull.boundingBox();
  expect(carrierBox).not.toBeNull();
  expect(interactionBox).not.toBeNull();
  expect(interactionBox!.width).toBeGreaterThanOrEqual(44);
  expect(interactionBox!.height).toBeGreaterThanOrEqual(44);

  await page.mouse.click(interactionBox!.x + interactionBox!.width / 2, interactionBox!.y + interactionBox!.height / 2);
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
  await expect(rig).toHaveAttribute('data-hermes-wanko-presentation', /quiet|evidence|trail|celebrate|missing/u);
  await page.screenshot({ path: 'test/visual/out/hermes-live2d/wanko-dashboard.png', fullPage: true });
});

test('Hermes Live2D visual harness exposes every production action on one real canvas', async ({ page }) => {
  await page.goto(`${baseUrl}/_visual/hermes-live2d`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-live2d-harness="true"]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(page.locator('[data-hermes-action-control]')).toHaveCount(32);
  await expect(page.locator('[data-hermes-live2d-canvas="true"]')).toHaveCount(1);
});

test('one Hermes stage persists across workspace routes and keeps direct manipulation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveCount(1);
  await expect(page.locator('[data-hermes-instance="single"]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-articulated-canvas]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-dashboard-local]')).toHaveCount(0);
  const originalStage = await stage.elementHandle();
  const originalCanvas = await stage.locator('[data-hermes-articulated-canvas]').elementHandle();

  await page.getByRole('link', { name: 'Continue research', exact: true }).click();
  await expect(page).toHaveURL(/\/research-objects\/ro-hermes\/edit$/);
  await page.waitForTimeout(500);
  if (browserErrors.length > 0) throw new Error(browserErrors.join('\n'));
  await expect(stage).toHaveCount(1);
  const routedStage = await stage.elementHandle();
  expect(await originalStage?.evaluate((oldStage, nextStage) => oldStage === nextStage, routedStage)).toBe(true);
  expect(await originalCanvas?.evaluate((canvas) => canvas === document.querySelector('[data-hermes-articulated-canvas]'))).toBe(true);
  await originalStage?.dispose();
  await originalCanvas?.dispose();
  await routedStage?.dispose();

  const input = page.locator('[data-hermes-input-owner]');
  const before = await stage.boundingBox();
  expect(before).not.toBeNull();
  await input.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x - 180, before!.y + 100, { steps: 8 });
  await page.mouse.up();
  const moved = await stage.boundingBox();
  expect(moved).not.toBeNull();
  expect(Math.abs(moved!.x - before!.x)).toBeGreaterThan(80);

  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(async () => {
    const restored = await stage.boundingBox();
    return restored ? Math.max(Math.abs(restored.x - moved!.x), Math.abs(restored.y - moved!.y)) : Number.POSITIVE_INFINITY;
  }).toBeLessThan(8);

  const interactionBox = await stage.locator('[data-hermes-carrier-interaction-hull="true"]').boundingBox();
  expect(interactionBox).not.toBeNull();
  await page.mouse.move(interactionBox!.x + interactionBox!.width * .2, interactionBox!.y + interactionBox!.height / 2);
  await page.mouse.move(interactionBox!.x + interactionBox!.width * .8, interactionBox!.y + interactionBox!.height / 2);
  await page.mouse.move(interactionBox!.x + interactionBox!.width + 140, interactionBox!.y + interactionBox!.height / 2);
  await expect(stage).toHaveAttribute('data-hermes-action', 'pointer-avoid');
});

test('Hermes respects system motion and persists explicit user preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  const canvas = stage.locator('[data-hermes-articulated-canvas="true"]');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const enable = page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  const disable = page.getByRole('button', { name: /Reduce Hermes motion|关闭 Hermes 动效/i });
  await disable.click();
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(stage.locator('.hermes-companion-actor')).toHaveCSS('animation-name', 'none');
  await expect(stage.locator('.hermes-guide-nudge')).toHaveCSS('transition-duration', '0s');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=full'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=reduced'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await expect(page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i })).toBeVisible();

  await page.addInitScript(() => {
    const states: string[] = [];
    Object.defineProperty(window, '__hermesMotionBootStates', { configurable: true, value: states });
    const sample = () => {
      const current = document.querySelector('[data-hermes-workspace-stage]');
      if (!current) return;
      states.push(`${current.getAttribute('data-hermes-motion-preference')}:${current.querySelectorAll('[data-hermes-articulated-canvas="true"]').length}`);
    };
    new MutationObserver(sample).observe(document, { attributes: true, childList: true, subtree: true });
  });

  await page.getByRole('link', { name: 'Continue research', exact: true }).click();
  await expect(page).toHaveURL(/\/research-objects\/ro-hermes\/edit$/);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  const bootStates = await page.evaluate(() => (window as typeof window & { __hermesMotionBootStates: string[] }).__hermesMotionBootStates);
  expect(bootStates.some((value) => value.startsWith('full:'))).toBe(false);
  expect(await page.evaluate(() => window.location.search)).not.toContain('hermes-motion');
});
