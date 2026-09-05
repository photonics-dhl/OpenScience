import { expect, test, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkspace(page: Page) {
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

test('anchored Hermes detaches only after drag intent and settles away from protected work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=reduced`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const anchor = page.locator('[data-hermes-dock-anchor="true"]');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '360');
  const [stageBox, anchorBox] = await Promise.all([stage.boundingBox(), anchor.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(anchorBox).not.toBeNull();
  expect({ width: Math.round(stageBox!.width), height: Math.round(stageBox!.height) }).toEqual({ width: 360, height: 360 });
  expect(Math.round(stageBox!.x + stageBox!.width / 2)).toBe(Math.round(anchorBox!.x + anchorBox!.width / 2));
  expect(Math.round(stageBox!.y + stageBox!.height / 2)).toBe(Math.round(anchorBox!.y + anchorBox!.height / 2));

  const input = stage.locator('[data-hermes-input-owner]');
  const inputBox = await input.boundingBox();
  expect(inputBox).not.toBeNull();
  const start = { x: inputBox!.x + inputBox!.width / 2, y: inputBox!.y + inputBox!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 3, start.y + 2);
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  await expect(stage).toHaveAttribute('data-hermes-invoke-count', '1');
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-assistant-open', 'true');
  await expect(stage).toHaveAttribute('aria-hidden', 'true');
  await expect(stage).toHaveAttribute('inert', '');
  await stage.locator('[data-hermes-input-owner]').evaluate((element: HTMLElement) => element.focus());
  expect(await stage.locator('[data-hermes-input-owner]').evaluate((element) => element === document.activeElement)).toBe(false);
  await page.getByRole('button', { name: 'Close Hermes' }).click();

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

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '200');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  const mobileBox = await stage.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect({ width: Math.round(mobileBox!.width), height: Math.round(mobileBox!.height) }).toEqual({ width: 200, height: 200 });
  const mobileInput = await input.boundingBox();
  expect(mobileInput).not.toBeNull();
  await page.mouse.move(mobileInput!.x + mobileInput!.width / 2, mobileInput!.y + mobileInput!.height / 2);
  await page.mouse.down();
  await page.mouse.move(90, 120, { steps: 8 });
  await page.mouse.up();
  const mobilePreferenceAfterRelease = await page.evaluate((key) => localStorage.getItem(key), mobileKey);
  expect(mobilePreferenceAfterRelease).not.toBeNull();
  expect(await page.evaluate(([desktop, mobile]) => localStorage.getItem(desktop) !== localStorage.getItem(mobile), [desktopKey, mobileKey])).toBe(true);
  const mobileStageAfterRelease = await stage.boundingBox();
  const mobileHullAfterRelease = await stage.locator('[data-hermes-carrier-travel-hull="true"]').boundingBox();
  expect(mobileStageAfterRelease).not.toBeNull();
  expect(mobileHullAfterRelease).not.toBeNull();
  expect(mobileHullAfterRelease!.x).toBeGreaterThanOrEqual(0);
  expect(mobileHullAfterRelease!.y).toBeGreaterThanOrEqual(0);
  expect(mobileHullAfterRelease!.x + mobileHullAfterRelease!.width).toBeLessThanOrEqual(390);
  expect(mobileHullAfterRelease!.y + mobileHullAfterRelease!.height).toBeLessThanOrEqual(844);

  const persistedSafeMobilePreference = await page.evaluate(({ key, value }) => {
    const preference = JSON.parse(value) as Record<string, unknown>;
    preference.xRatio = .500801;
    preference.yRatio = .118483;
    const serialized = JSON.stringify(preference);
    localStorage.setItem(key, serialized);
    return serialized;
  }, { key: mobileKey, value: mobilePreferenceAfterRelease! });
  await page.evaluate(() => window.history.replaceState(null, '', '/dashboard?hermes-motion=full'));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  await page.waitForTimeout(1_200);
  const [mobileStageAfterReload, mobileHullAfterReload] = await Promise.all([
    stage.boundingBox(),
    stage.locator('[data-hermes-carrier-travel-hull="true"]').boundingBox(),
  ]);
  expect(mobileStageAfterReload).not.toBeNull();
  expect(mobileHullAfterReload).not.toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBe(persistedSafeMobilePreference);
  const mobileLayoutViewport = await page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }));
  expect(Math.abs(
    mobileStageAfterReload!.x + mobileStageAfterReload!.width / 2 - .500801 * mobileLayoutViewport.width,
  )).toBeLessThan(1);
  expect(Math.abs(
    mobileStageAfterReload!.y + mobileStageAfterReload!.height / 2 - .118483 * mobileLayoutViewport.height,
  )).toBeLessThan(1);
  const protectedAfterMobileReload = await protectedRegions.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }).filter((bounds) => bounds.width > 0 && bounds.height > 0));
  expect(protectedAfterMobileReload.some((region) => overlaps(mobileHullAfterReload!, region))).toBe(false);
  expect(mobileHullAfterReload!.x).toBeGreaterThanOrEqual(0);
  expect(mobileHullAfterReload!.y).toBeGreaterThanOrEqual(0);
  expect(mobileHullAfterReload!.x + mobileHullAfterReload!.width).toBeLessThanOrEqual(390);
  expect(mobileHullAfterReload!.y + mobileHullAfterReload!.height).toBeLessThanOrEqual(844);
});

test('Hermes never persists a transitional desktop hull after mobile edge history', async ({ page }) => {
  const desktopKey = 'openscience:hermes-dock:v1:workspace-current:desktop';
  const mobileKey = 'openscience:hermes-dock:v1:workspace-current:mobile';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-08-23T00:00:00Z') });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'true');
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).toBeNull();

  const dragHull = stage.locator('[data-hermes-carrier-interaction-hull="true"]');
  const mobileDockSettled = () => stage.evaluate((element, key) => {
    const preference = JSON.parse(localStorage.getItem(key) ?? 'null') as { xRatio?: number; yRatio?: number } | null;
    const stageBounds = element.getBoundingClientRect();
    const hull = element.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect();
    if (!preference || preference.xRatio === undefined || preference.yRatio === undefined || !hull) return false;
    const protectedRegions = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((node) => node.getBoundingClientRect()).filter((bounds) => bounds.width > 0 && bounds.height > 0);
    return Math.abs(stageBounds.left + stageBounds.width / 2 - preference.xRatio * innerWidth) < .5
      && Math.abs(stageBounds.top + stageBounds.height / 2 - preference.yRatio * innerHeight) < .5
      && hull.left >= 0 && hull.top >= 0 && hull.right <= innerWidth && hull.bottom <= innerHeight
      && protectedRegions.every((region) => !(
        hull.left < region.right && hull.right > region.left && hull.top < region.bottom && hull.bottom > region.top
      ));
  }, mobileKey);
  const edgeTargets = [
    { x: 1, y: 422 },
    { x: 195, y: 1 },
    { x: 389, y: 422 },
    { x: 195, y: 843 },
    { x: 195, y: 1 },
  ];
  for (const target of edgeTargets) {
    const bounds = await dragHull.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    await expect(stage).toHaveAttribute('data-hermes-dragging', 'false');
    await expect.poll(mobileDockSettled).toBe(true);
  }
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  const persistedMobilePreference = await page.evaluate((key) => localStorage.getItem(key), mobileKey);
  expect(persistedMobilePreference).not.toBeNull();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  expect(await page.evaluate((key) => localStorage.getItem(key), mobileKey)).not.toBeNull();
  for (let elapsed = 0; elapsed < 180_000 && await stage.getAttribute('data-hermes-action') !== 'return-dock'; elapsed += 250) {
    await page.clock.runFor(250);
  }
  await expect(stage).toHaveAttribute('data-hermes-action', 'return-dock');
  await page.evaluate((key) => {
    document.documentElement.dataset.hermesTestDesktopWrites = '[]';
    const storagePrototype = Object.getPrototypeOf(localStorage) as Storage;
    const original = storagePrototype.setItem;
    storagePrototype.setItem = function setItem(nextKey: string, value: string) {
      if (nextKey === key) {
        const writes = JSON.parse(document.documentElement.dataset.hermesTestDesktopWrites ?? '[]') as Array<{ hullHeight: number; value: string }>;
        const hullHeight = document.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect().height ?? 0;
        document.documentElement.dataset.hermesTestDesktopWrites = JSON.stringify([...writes, { hullHeight, value }]);
      }
      return original.call(this, nextKey, value);
    };
  }, desktopKey);

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(stage).toHaveAttribute('data-hermes-stage-size', '360');
  await page.clock.runFor(2_000);
  const readSettledSafety = () => stage.evaluate((element) => {
    const stageBounds = element.getBoundingClientRect();
    const hull = element.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect();
    if (!hull) return { finalHull: false, insideViewport: false, protectedSafe: false, stageSize: 0 };
    const protectedRegions = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((node) => node.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0);
    return {
      finalHull: hull.height >= 330,
      insideViewport: hull.left >= 0 && hull.top >= 0 && hull.right <= window.innerWidth && hull.bottom <= window.innerHeight,
      protectedSafe: protectedRegions.every((region) => !(
        hull.left < region.right && hull.right > region.left && hull.top < region.bottom && hull.bottom > region.top
      )),
      stageSize: Math.round(stageBounds.width),
    };
  });
  await expect.poll(async () => {
    const safety = await readSettledSafety();
    return { finalHull: safety.finalHull, insideViewport: safety.insideViewport, stageSize: safety.stageSize };
  }).toEqual({ finalHull: true, insideViewport: true, stageSize: 360 });
  let settledDesktopPreference = await page.evaluate((key) => localStorage.getItem(key), desktopKey);
  if (settledDesktopPreference === null) {
    expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.hermesTestDesktopWrites ?? '[]'))).toEqual([]);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.clock.runFor(2_000);
    await expect.poll(async () => (await readSettledSafety()).protectedSafe).toBe(true);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), desktopKey)).not.toBeNull();
    settledDesktopPreference = await page.evaluate((key) => localStorage.getItem(key), desktopKey);
  } else {
    expect((await readSettledSafety()).protectedSafe).toBe(true);
  }
  const desktopWrites = await stage.evaluate((element) => {
    const stageBounds = element.getBoundingClientRect();
    const hull = element.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!.getBoundingClientRect();
    const center = { x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 };
    const footprint = {
      bottom: hull.bottom - center.y, left: center.x - hull.left,
      right: hull.right - center.x, top: center.y - hull.top,
    };
    const protectedRegions = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((node) => node.getBoundingClientRect()).filter((bounds) => bounds.width > 0 && bounds.height > 0);
    return (JSON.parse(document.documentElement.dataset.hermesTestDesktopWrites ?? '[]') as Array<{ hullHeight: number; value: string }>).map((write) => {
      const preference = JSON.parse(write.value) as { xRatio: number; yRatio: number };
      const occupied = {
        bottom: preference.yRatio * innerHeight + footprint.bottom,
        left: preference.xRatio * innerWidth - footprint.left,
        right: preference.xRatio * innerWidth + footprint.right,
        top: preference.yRatio * innerHeight - footprint.top,
      };
      return { hullHeight: write.hullHeight, safe: occupied.left >= 0 && occupied.top >= 0
        && occupied.right <= innerWidth && occupied.bottom <= innerHeight && protectedRegions.every((region) => !(
          occupied.left < region.right && occupied.right > region.left
          && occupied.top < region.bottom && occupied.bottom > region.top
        )) };
    });
  });
  expect(desktopWrites.length).toBeLessThanOrEqual(1);
  expect(desktopWrites.every((write) => write.safe), JSON.stringify(desktopWrites)).toBe(true);
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  expect(settledDesktopPreference).not.toBeNull();
  expect(settledDesktopPreference).not.toBe(persistedMobilePreference);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBe(settledDesktopPreference);
  await expect(page.getByRole('dialog', { name: 'Hermes research guide' })).toHaveCount(0);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(stage).toHaveAttribute('data-hermes-anchored', 'false');
  await expect.poll(async () => {
    const safety = await readSettledSafety();
    return { finalHull: safety.finalHull, insideViewport: safety.insideViewport, protectedSafe: safety.protectedSafe, stageSize: safety.stageSize };
  }).toEqual({ finalHull: true, insideViewport: true, protectedSafe: true, stageSize: 360 });
  const restoredDesktopPreference = await page.evaluate((key) => localStorage.getItem(key), desktopKey);
  expect(restoredDesktopPreference).not.toBeNull();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate((key) => localStorage.getItem(key), desktopKey)).toBe(restoredDesktopPreference);
  expect(await page.evaluate(([desktop, mobile]) => localStorage.getItem(desktop) !== localStorage.getItem(mobile), [desktopKey, mobileKey])).toBe(true);
});

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

  await page.getByRole('link', { name: 'Continue research', exact: true }).click();
  await expect(page).toHaveURL(/\/research-objects\/ro-hermes\/edit$/);
  await page.waitForTimeout(500);
  if (browserErrors.length > 0) throw new Error(browserErrors.join('\n'));
  await expect(stage).toHaveCount(1);
  const routedStage = await stage.elementHandle();
  expect(await originalStage?.evaluate((oldStage, nextStage) => oldStage === nextStage, routedStage)).toBe(true);

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
