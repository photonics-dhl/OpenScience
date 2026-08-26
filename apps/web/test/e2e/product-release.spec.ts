import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

import { PRODUCT_RELEASE_BUDGETS, PRODUCT_RELEASE_CASES } from '../visual/product-release-manifest.mjs';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const outDir = 'test/visual/out/product-release';

const researchObject = {
  id: 'ro-release', workspaceId: 'workspace-release', title: 'Ultrafast carrier dynamics in layered semiconductors',
  status: 'draft', visibility: 'private', version: 4, createdAt: '2026-08-10T00:00:00.000Z',
  sdf: { core: {
    schemaVersion: '0.1.0', problem: 'How does interlayer coupling change sub-100 fs relaxation?',
    insight: 'Coherent coupling opens a resolved transfer channel.', method: 'Time-resolved photoemission and constrained kinetics.',
    results: 'A 43 fs transfer component appears in the coupled specimen.', limitations: 'Lateral disorder remains unresolved.',
    reproducibility: 'Raw spectra, notebooks and environment manifests are linked.',
  }, nodes: [] },
};

const approvalTask = {
  id: 'ingestion-release', researchObjectId: 'ro-release', researchTitle: researchObject.title,
  artifactId: 'artifact-release', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installClientFixtures(page: Page) {
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'user-release', email: 'release@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [researchObject] }));
  await page.route('**/api/ingestion?actionable=true', (route) => json(route, { tasks: [approvalTask] }));
  await page.route('**/api/ingestion/tasks/ingestion-release', (route) => json(route, {
    batchId: 'batch-release',
    researchObjectId: 'ro-release',
    task: { ...approvalTask, agentTaskId: 'agent-release', result: { core: researchObject.sdf.core } },
    version: 4,
  }));
  await page.route('**/api/workspaces', (route) => json(route, {
    workspaces: [{ id: 'workspace-release', name: 'Personal workspace', type: 'personal', role: 'owner' }],
  }));
  await page.route('**/api/explore**', (route) => json(route, { items: [{
    publicId: 'OSR-DEMO-000001', title: 'WrightTools · multidimensional spectroscopy',
    url: '/research/OSR-DEMO-000001', latestVersion: 1, publishedAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z', insight: 'Public spectroscopy methods and provenance.',
    fields: ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'],
    artifactTypes: ['document'], authors: ['OpenScience Demonstration Catalog'],
  }], nextCursor: null }));
  await page.route('**/api/research-objects/ro-release/versions', (route) => json(route, { versions: [
    { versionId: 'version-4', versionNo: 4, status: 'draft' },
    { versionId: 'version-3', versionNo: 3, status: 'published' },
  ] }));
  await page.route('**/api/research-objects/ro-release/issues**', (route) => json(route, { issues: [] }));
  await page.route('**/api/research-objects/ro-release/author-change-info', (route) => json(route, {}));
  await page.route('**/api/research-objects/ro-release/licenses/version-4', (route) => json(route, {
    licenses: null, source: 'none',
  }));
  await page.route('**/api/versions/version-4/review', (route) => json(route, { review: null }));
  await page.route('**/api/research-objects/ro-release', (route) => json(route, { researchObject }));
  await page.route('**/admin/editorial/candidates', (route) => json(route, { candidates: [{
    publicId: 'OSR-DEMO-000001', title: researchObject.title, versionId: 'version-4', versionNo: 4,
  }] }));
  await page.route('**/admin/editorial/collections/ultrafast-science/selections', (route) => json(route, {
    collection: { id: 'collection-release', slug: 'ultrafast-science', title: 'Ultrafast Science', description: 'Selected evidence-led research.', selections: [] },
  }));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'release-fixture' }));
  await page.route('**/api/agent/sessions', (route) => json(route, { session: { id: 'session-release' } }));
  await page.route('**/api/agent/tasks', (route) => json(route, { task: { id: 'task-release', status: 'pending', progress: 0 } }));
  await page.route('**/api/agent/tasks/task-release', (route) => json(route, { task: {
    id: 'task-release', status: 'succeeded', progress: 100, error: null,
    result: { core: { ...researchObject.sdf.core, results: 'The fitted lifetime is 43 ± 6 fs.' } },
  } }));
}

async function prepareNamedState(page: Page, surface: string, viewportWidth: number) {
  if (surface === 'workspace') {
    if (viewportWidth < 1024) await page.locator('[data-mobile-workspace-navigation="true"] button').nth(2).click();
    await page.locator('[data-extract-sdf="true"]').click();
    await page.locator('[data-before-after-proposal]').first().waitFor();
  }
  if (surface === 'intake') {
    await page.getByLabel(/research title/i).fill('Ultrafast evidence package');
    await page.getByLabel(/choose files/i).setInputFiles([
      { name: 'paper.md', mimeType: 'text/markdown', buffer: Buffer.from('# Evidence') },
      { name: 'figure.png', mimeType: 'image/png', buffer: Buffer.from('release-image') },
      { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y\n1,2') },
    ]);
  }
}

async function measureOpticalTitleMotion(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(async ({ afterBase64, beforeBase64 }) => {
    const decode = async (encoded: string) => {
      const blob = await (await fetch(`data:image/png;base64,${encoded}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Landing release gate could not decode the final composite');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const first = await decode(beforeBase64);
    const second = await decode(afterBase64);
    const quadrants = [0, 0, 0, 0];
    let titleCount = 0;
    let titleDelta = 0;
    let titleTotal = 0;
    const gridColumns = 24;
    const gridRows = 10;
    const grid = Array.from({ length: gridColumns * gridRows }, () => ({ changed: 0, delta: 0, total: 0 }));
    for (let y = 0; y < first.height; y += 1) {
      for (let x = 0; x < first.width; x += 1) {
        const offset = (y * first.width + x) * 4;
        const delta = Math.max(
          Math.abs(first.data[offset] - second.data[offset]),
          Math.abs(first.data[offset + 1] - second.data[offset + 1]),
          Math.abs(first.data[offset + 2] - second.data[offset + 2]),
        );
        const inTitleBand = y >= first.height * .30 && y <= first.height * .70;
        if (inTitleBand) {
          titleTotal += 1;
          const gridX = Math.min(gridColumns - 1, Math.floor(x / first.width * gridColumns));
          const gridY = Math.min(
            gridRows - 1,
            Math.floor((y / first.height - .30) / .40 * gridRows),
          );
          const cell = grid[gridY * gridColumns + gridX];
          cell.total += 1;
          cell.delta += delta;
          if (delta >= 3) cell.changed += 1;
        }
        if (delta < 3) continue;
        if (inTitleBand) {
          titleCount += 1;
          titleDelta += delta;
        }
        quadrants[(y >= first.height / 2 ? 2 : 0) + (x >= first.width / 2 ? 1 : 0)] += 1;
      }
    }
    const active = new Set(grid.flatMap((cell, index) => (
      cell.total > 0 && cell.changed / cell.total >= .06 && cell.delta / cell.total >= 1.5
        ? [index]
        : []
    )));
    let largestComponent = { cells: 0, spanColumns: 0, spanRows: 0 };
    while (active.size > 0) {
      const [firstIndex] = active;
      const queue = [firstIndex];
      active.delete(firstIndex);
      const component: number[] = [];
      while (queue.length > 0) {
        const index = queue.shift();
        if (index === undefined) continue;
        component.push(index);
        const x = index % gridColumns;
        const y = Math.floor(index / gridColumns);
        for (const neighbour of [
          x > 0 ? index - 1 : -1,
          x < gridColumns - 1 ? index + 1 : -1,
          y > 0 ? index - gridColumns : -1,
          y < gridRows - 1 ? index + gridColumns : -1,
        ]) {
          if (!active.has(neighbour)) continue;
          active.delete(neighbour);
          queue.push(neighbour);
        }
      }
      const columns = component.map((index) => index % gridColumns);
      const rows = component.map((index) => Math.floor(index / gridColumns));
      const candidate = {
        cells: component.length,
        spanColumns: Math.max(...columns) - Math.min(...columns) + 1,
        spanRows: Math.max(...rows) - Math.min(...rows) + 1,
      };
      if (candidate.cells > largestComponent.cells) largestComponent = candidate;
    }
    return { connected: largestComponent, quadrants, titleCount, titleDelta, titleTotal };
  }, { afterBase64: after.toString('base64'), beforeBase64: before.toString('base64') });
}

async function assertVisibleOpticalMotion(page: Page, acceptedSurface: Locator) {
  expect(
    await acceptedSurface.evaluate((node) => getComputedStyle(node).cursor),
  ).toMatch(/^(auto|default)$/u);
  expect(
    await acceptedSurface.evaluate((node) => [...node.querySelectorAll('*')]
      .filter((child) => getComputedStyle(child).cursor === 'none')
      .map((child) => child.tagName)),
  ).toEqual([]);
  const canvas = acceptedSurface.locator('canvas[data-optical-asset-interaction-canvas="true"]');
  await expect(canvas).toHaveCount(1, { timeout: 10_000 });
  await expect(acceptedSurface).toHaveAttribute('data-render-mode', 'asset-interactive');
  await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
  const idle = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
  expect(idle?.ambientStrength).toBe(.05);
  expect(idle?.follow).toBe(0);

  for (let index = 0; index < 3; index += 1) {
    const phaseBefore = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.ambientPhase);
    const before = await acceptedSurface.screenshot();
    await page.waitForTimeout(650);
    const after = await acceptedSurface.screenshot();
    const phaseAfter = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.ambientPhase);
    const motion = await measureOpticalTitleMotion(page, before, after);
    expect(phaseBefore).toEqual(expect.any(Number));
    expect(phaseAfter).toEqual(expect.any(Number));
    expect(phaseAfter).not.toBe(phaseBefore);
    expect(motion.titleCount / motion.titleTotal).toBeGreaterThanOrEqual(.18);
    expect(motion.titleDelta / motion.titleTotal).toBeGreaterThanOrEqual(1.10);
    expect(motion.quadrants.every((count) => count > 0)).toBe(true);
    expect(motion.connected.cells).toBeGreaterThanOrEqual(6);
    expect(motion.connected.spanColumns).toBeGreaterThanOrEqual(2);
    expect(motion.connected.spanRows).toBeGreaterThanOrEqual(2);
  }

  const bounds = await acceptedSurface.boundingBox();
  if (!bounds) throw new Error('Landing optical surface has no visible bounds');
  const slowStartX = bounds.x + bounds.width * .36;
  const slowY = bounds.y + bounds.height * .48;
  await page.mouse.move(slowStartX, slowY);
  await page.waitForTimeout(180);
  let slowPeak = 0;
  let slowEndPointerX = 0;
  for (let index = 1; index <= 6; index += 1) {
    await page.mouse.move(slowStartX + index * 2, slowY);
    await page.waitForTimeout(75);
    const snapshot = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
    slowPeak = Math.max(slowPeak, snapshot?.follow ?? 0);
    slowEndPointerX = snapshot?.pointerX ?? slowEndPointerX;
    await page.waitForTimeout(105);
  }
  expect(slowPeak).toBeGreaterThanOrEqual(.05);
  expect(Math.abs(slowEndPointerX - ((slowStartX + 12 - bounds.x) / bounds.width))).toBeLessThanOrEqual(.02);
  await page.mouse.move(bounds.x + bounds.width * .5, Math.max(0, bounds.y - 10));
  await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.follow === 0, undefined, {
    polling: 'raf',
    timeout: 900,
  });
  const startX = bounds.x + bounds.width * .3;
  const endX = bounds.x + bounds.width * .7;
  const y = bounds.y + bounds.height * .45;
  await page.mouse.move(startX, y);
  await page.waitForTimeout(48);
  await page.mouse.move(endX, y, { steps: 2 });
  await page.waitForTimeout(75);
  const response = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
  expect(response?.follow).toBeGreaterThan(slowPeak);
  expect(response?.follow).toBeLessThanOrEqual(1);
  expect(response?.pointerX).toBeGreaterThan(.5);
  await page.mouse.move(bounds.x + bounds.width * .5, Math.max(0, bounds.y - 10));
  await page.waitForFunction(() => {
    const snapshot = window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__;
    return Boolean(snapshot && snapshot.follow === 0 && snapshot.causticGain === 0);
  }, undefined, { polling: 'raf', timeout: 1_500 });
}

function expectedGlobalRoutes(surface: string) {
  if (surface === 'landing') return ['/explore', '/research-objects/new', '/auth/login'];
  if (surface === 'auth' || surface === 'login') return ['/dashboard', '/explore'];
  if (surface === 'public' || surface === 'explore' || surface === 'collection') {
    return ['/dashboard', '/explore', '/research-objects/new', '/auth/login'];
  }
  return ['/dashboard', '/explore', '/research-objects/new', '/settings'];
}

async function assertGlobalRouteNavigation(page: Page, surface: string) {
  for (const href of expectedGlobalRoutes(surface)) {
    const routeLink = page.locator(`header a[href="${href}"]`);
    await expect(routeLink, `${surface} must expose ${href} in its page header`).toHaveCount(1);
    await expect(routeLink, `${surface} must keep ${href} visibly reachable`).toBeVisible();
    expect(await routeLink.evaluate((element) => element.scrollWidth - element.clientWidth), `${surface} must not clip the ${href} label`).toBeLessThanOrEqual(1);
  }
}

for (const releaseCase of PRODUCT_RELEASE_CASES) {
  const { surface, route, state, viewport, reducedMotion, motionContract } = releaseCase;
  const name = `${surface} / ${state} / ${viewport.name}${reducedMotion ? ' / reduced' : ''}`;

  test(name, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    });
    await context.addInitScript(() => {
      window.__OPENSCIENCE_VISUAL_CLOCK__ = 1_250;
    });
    const page = await context.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('favicon')) runtimeErrors.push(message.text());
    });
    await installClientFixtures(page);
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.getAnimations().forEach((animation) => animation.pause());
    });
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await assertGlobalRouteNavigation(page, surface);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button,input:not([type="hidden"]),select,textarea')]
      .filter((element) => {
        const label = element.getAttribute('aria-label')
          || (element.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '))
          || (element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : '')
          || element.closest('label')?.textContent
          || element.textContent
          || element.getAttribute('title');
        return !label?.trim();
      }).length)).toBe(0);

    const skipLink = page.locator('a[href="#main-content"]').first();
    if (await skipLink.count()) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Tab');
      await expect(skipLink).toBeFocused();
    } else {
      await page.locator('a,button,input,select,textarea').first().focus();
      expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    }

    await prepareNamedState(page, surface, viewport.width);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const postStateGeometry = await page.evaluate(() => {
      const clientWidth = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({
          ancestors: Array.from((function *parents(node: Element | null) {
            let current = node?.parentElement ?? null;
            for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) yield current;
          })(element)).map((parent) => `${parent.tagName}.${typeof parent.className === 'string' ? parent.className.slice(0, 70) : ''}`),
          className: typeof element.className === 'string' ? element.className.slice(0, 90) : '',
          data: Array.from(element.attributes)
            .filter((attribute) => attribute.name.startsWith('data-'))
            .reduce<Record<string, string>>((attributes, attribute) => ({ ...attributes, [attribute.name]: attribute.value }), {}),
          rect: element.getBoundingClientRect().toJSON(),
          style: element.getAttribute('style'),
          tag: element.tagName,
        }))
        .filter(({ rect }) => rect.width > 0 && rect.right > clientWidth + 1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 5);
      const companion = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]');
      const protectedElements = [...document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]')];
      const companionBounds = companion?.getBoundingClientRect();
      const companionOverlaps = companionBounds ? protectedElements.filter((element) => {
        const bounds = element.getBoundingClientRect();
        return companionBounds.left < bounds.right && companionBounds.right > bounds.left
          && companionBounds.top < bounds.bottom && companionBounds.bottom > bounds.top;
      }).map((element) => element.tagName) : [];
      return {
        companionOverlaps,
        excess: document.documentElement.scrollWidth - clientWidth,
        offenders,
      };
    });
    expect(postStateGeometry.excess, JSON.stringify(postStateGeometry.offenders, null, 2)).toBe(0);
    expect(postStateGeometry.companionOverlaps).toEqual([]);
    expect(await page.locator('[data-hermes-placement="anchored"] [data-hermes-performance-bubble][data-hermes-speech-visible="true"]').count()).toBe(0);

    if (motionContract === 'static-optical') {
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const acceptedSurface = page.locator('[data-accepted-optical-surface="landing"]');
      await expect(acceptedSurface).toHaveCount(1);
      await expect(acceptedSurface.locator('[data-optical-lab-asset-plate="true"]')).toHaveCount(1);
      await expect(acceptedSurface.locator('[data-optical-lab-target-typography-plate="true"]')).toHaveCount(1);
      await expect(acceptedSurface.locator('canvas[data-optical-asset-interaction-canvas="true"]')).toHaveCount(0);
      await expect(acceptedSurface).toHaveAttribute('data-render-mode', 'asset-static');
    }
    if (motionContract === 'visible-optical') {
      await assertVisibleOpticalMotion(page, page.locator('[data-accepted-optical-surface="landing"]'));
    }

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime
        ?? navigation?.domContentLoadedEventEnd
        ?? 0;
      const transferBytes = performance.getEntriesByType('resource')
        .reduce((total, entry) => total + ((entry as PerformanceResourceTiming).transferSize || 0), 0);
      return { lcp, transferBytes, domNodes: document.getElementsByTagName('*').length };
    });
    expect(metrics.lcp).toBeLessThanOrEqual(PRODUCT_RELEASE_BUDGETS.lcpMs);
    expect(metrics.transferBytes).toBeLessThanOrEqual(PRODUCT_RELEASE_BUDGETS.transferBytes);
    expect(metrics.domNodes).toBeLessThanOrEqual(PRODUCT_RELEASE_BUDGETS.domNodes);
    expect(runtimeErrors).toEqual([]);

    const suffix = reducedMotion ? '-reduced' : '';
    await page.screenshot({
      path: `${outDir}/${surface}-${state}-${viewport.width}x${viewport.height}${suffix}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await context.close();
  });
}

for (const compactCase of [
  { surface: 'dashboard', route: '/dashboard' },
  { surface: 'auth', route: '/auth/register' },
  { surface: 'public', route: '/research/OSR-DEMO-000001/v/1' },
  { surface: 'workspace', route: '/research-objects/ro-release/edit' },
  { surface: 'review', route: '/research-objects/ro-release/hermes?task=ingestion-release' },
]) {
  test(`compact navigation / ${compactCase.surface} / 320px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await installClientFixtures(page);
    await page.goto(`${baseUrl}${compactCase.route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await assertGlobalRouteNavigation(page, compactCase.surface);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.screenshot({ path: `${outDir}/compact-navigation-${compactCase.surface}-320x740.png`, animations: 'disabled' });
    await context.close();
  });
}

test('Hermes action menu / desktop pointer and keyboard preserve the assistant entry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.waitForTimeout(4500);
  expect(await page.locator('[data-hermes-placement="anchored"] [data-hermes-performance-bubble][data-hermes-speech-visible="true"]').count()).toBe(0);
  expect(await page.locator('[data-hermes-placement="anchored"] .hermes-guide-nudge[data-visible="true"]').count()).toBe(0);
  await page.locator('[data-hermes-companion-margin="true"]').evaluate((margin) => {
    const actor = margin.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]');
    if (!actor) throw new Error('Hermes actor is missing');
    margin.style.translate = `0 ${320 - actor.getBoundingClientRect().top}px`;
  });
  const actorTopBeforeMenu = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().top);
  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-hermes-action-key]')).toHaveCount(12);
  const desktopMenuGeometry = await page.evaluate(() => {
    const menuNode = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!;
    const menuRect = menuNode.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const crownRect = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const marginRect = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]')!.getBoundingClientRect();
    const stage = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]');
    const protectedOverlaps = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return menuRect.left < rect.right && menuRect.right > rect.left && menuRect.top < rect.bottom && menuRect.bottom > rect.top;
      })
      .map((node) => ({ tag: node.tagName, rect: node.getBoundingClientRect().toJSON() }));
    return {
      actor: actorRect.toJSON(),
      stageInlineTranslate: stage?.style.translate ?? null,
      stageLayoutShift: stage?.getAttribute('data-hermes-menu-layout-shift') ?? null,
      stageTranslate: stage ? getComputedStyle(stage).translate : null,
      contained: menuRect.left >= marginRect.left - 1 && menuRect.right <= marginRect.right + 1,
      gap: actorRect.top - menuRect.bottom,
      visibleGap: crownRect.top + crownRect.height / 2 - menuRect.bottom,
      margin: marginRect.toJSON(),
      menu: menuRect.toJSON(),
      overlap: menuRect.bottom > crownRect.top + crownRect.height / 2,
      protectedOverlaps,
      tetherContent: getComputedStyle(menuNode, '::after').content,
      viewportContained: menuRect.top >= 8 && menuRect.bottom <= window.innerHeight - 8,
    };
  });
  expect(desktopMenuGeometry.overlap, JSON.stringify(desktopMenuGeometry)).toBe(false);
  expect(desktopMenuGeometry.visibleGap, JSON.stringify(desktopMenuGeometry)).toBeGreaterThanOrEqual(23.5);
  expect(desktopMenuGeometry.visibleGap, JSON.stringify(desktopMenuGeometry)).toBeLessThanOrEqual(48.5);
  expect(desktopMenuGeometry.contained, JSON.stringify(desktopMenuGeometry)).toBe(true);
  expect(desktopMenuGeometry.protectedOverlaps, JSON.stringify(desktopMenuGeometry)).toEqual([]);
  expect(desktopMenuGeometry.tetherContent, JSON.stringify(desktopMenuGeometry)).toBe('none');
  expect(desktopMenuGeometry.viewportContained, JSON.stringify(desktopMenuGeometry)).toBe(true);
  const actorLayoutShift = desktopMenuGeometry.actor.top - actorTopBeforeMenu;
  expect(actorLayoutShift, JSON.stringify({ actorTopBeforeMenu, desktopMenuGeometry })).toBeGreaterThanOrEqual(0);
  expect(desktopMenuGeometry.actor.bottom, JSON.stringify(desktopMenuGeometry)).toBeLessThanOrEqual(720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ fullPage: true, path: `${outDir}/hermes-menu-dashboard-default.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  const actorTopAfterMenu = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(actorTopAfterMenu - actorTopBeforeMenu)).toBeLessThanOrEqual(1.5);

  await trigger.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-hermes-action-key]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ContextMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-hermes-action-key]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toBeVisible();
});

test('Hermes action menu / high-DPI wide short viewport remains fully visible', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1612, height: 729 },
    deviceScaleFactor: 1.875,
  });
  const page = await context.newPage();
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });

  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  await page.mouse.click(
    triggerBox!.x + triggerBox!.width / 2,
    Math.min(triggerBox!.y + triggerBox!.height / 2, 728),
    { button: 'right' },
  );
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-hermes-action-key]')).toHaveCount(12);
  const upstreamProtected = page.locator('[data-hermes-primary-navigation="true"][data-hermes-protected="true"]');
  await upstreamProtected.evaluate((navigation) => {
    const header = navigation.closest<HTMLElement>('header');
    if (!header) throw new Error('Protected navigation header is missing');
    header.style.height = '32px';
    header.style.minHeight = '32px';
  });

  const readGeometry = () => page.evaluate(() => {
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const crownRect = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const marginRect = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]')!.getBoundingClientRect();
    const stage = document.querySelector<HTMLElement>('[data-hermes-workspace-stage="true"]')!;
    const protectedOverlaps = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return menuRect.left < rect.right && menuRect.right > rect.left && menuRect.top < rect.bottom && menuRect.bottom > rect.top;
      }).length;
    return {
      actor: actorRect.toJSON(),
      contained: menuRect.left >= marginRect.left - 1 && menuRect.right <= marginRect.right + 1,
      crown: crownRect.toJSON(),
      devicePixelRatio: window.devicePixelRatio,
      gap: crownRect.top + crownRect.height / 2 - menuRect.bottom,
      menu: menuRect.toJSON(),
      menuTranslate: getComputedStyle(document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!).translate,
      protectedOverlaps,
      scrollY: window.scrollY,
      stageLayoutShift: stage.getAttribute('data-hermes-menu-layout-shift'),
      stageTranslate: getComputedStyle(stage).translate,
      visualViewport: window.visualViewport ? {
        height: window.visualViewport.height,
        offsetTop: window.visualViewport.offsetTop,
        scale: window.visualViewport.scale,
        width: window.visualViewport.width,
      } : null,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
  await expect.poll(async () => (await readGeometry()).menu.top, { timeout: 2_000 }).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => {
    const candidate = await readGeometry();
    return candidate.viewport.height - candidate.menu.bottom;
  }, { timeout: 2_000 }).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => {
    const candidate = await readGeometry();
    return candidate.viewport.height - candidate.actor.bottom;
  }, { timeout: 2_000 }).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await readGeometry()).gap, { timeout: 2_000 }).toBeGreaterThanOrEqual(24);
  await expect.poll(async () => (await readGeometry()).gap, { timeout: 2_000 }).toBeLessThanOrEqual(48);
  await expect.poll(async () => (await readGeometry()).contained, { timeout: 2_000 }).toBe(true);
  await expect.poll(async () => (await readGeometry()).protectedOverlaps, { timeout: 2_000 }).toBe(0);
  const geometry = await readGeometry();
  await page.screenshot({ animations: 'disabled', path: `${outDir}/hermes-menu-high-dpi-wide-short.png` });
  expect(geometry.menu.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(8);
  expect(geometry.menu.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport.height - 8);
  expect(geometry.gap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(24);
  expect(geometry.gap, JSON.stringify(geometry)).toBeLessThanOrEqual(48);
  expect(geometry.contained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.protectedOverlaps, JSON.stringify(geometry)).toBe(0);
  expect(geometry.actor.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport.height);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await upstreamProtected.evaluate((navigation) => {
    const header = navigation.closest<HTMLElement>('header');
    header?.style.removeProperty('height');
    header?.style.removeProperty('min-height');
  });
  await context.close();
});

test('Hermes action menu / detached desktop dock remains joined to the visible crown', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1612, height: 729 },
    deviceScaleFactor: 1.875,
  });
  await context.addInitScript(() => {
    window.localStorage.setItem('openscience:hermes-dock:v1:workspace-current:desktop', JSON.stringify({
      activity: 'balanced',
      particles: true,
      proactiveHints: true,
      sound: false,
      xRatio: .86,
      yRatio: .72,
    }));
  });
  const page = await context.newPage();
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(stage).toHaveAttribute('data-hermes-placement', 'detached');
  const actorBeforeOpen = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());

  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-hermes-action-key]')).toHaveCount(12);

  const readGeometry = () => page.evaluate(() => {
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const crownRect = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    return {
      actor: actorRect.toJSON(),
      attachment: document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.dataset.hermesMenuAttachment,
      gap: crownRect.top + crownRect.height / 2 - menuRect.bottom,
      menu: menuRect.toJSON(),
      overlap: menuRect.left < actorRect.right && menuRect.right > actorRect.left && menuRect.top < actorRect.bottom && menuRect.bottom > actorRect.top,
      viewportBottom,
      viewportTop,
    };
  });

  await expect.poll(async () => (await readGeometry()).menu.top).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => {
    const geometry = await readGeometry();
    return geometry.viewportBottom - geometry.menu.bottom;
  }).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => (await readGeometry()).attachment).toBe('above');
  await expect.poll(async () => (await readGeometry()).gap).toBeGreaterThanOrEqual(24);
  await expect.poll(async () => (await readGeometry()).gap).toBeLessThanOrEqual(48);
  const geometry = await readGeometry();
  await page.screenshot({ animations: 'disabled', path: `${outDir}/hermes-menu-detached-desktop.png` });
  expect(geometry.menu.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.viewportTop + 8);
  expect(geometry.menu.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportBottom - 8);
  expect(geometry.attachment, JSON.stringify(geometry)).toBe('above');
  expect(geometry.gap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(24);
  expect(geometry.gap, JSON.stringify(geometry)).toBeLessThanOrEqual(48);
  expect(geometry.overlap, JSON.stringify(geometry)).toBe(false);
  expect(geometry.actor.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.viewportTop);
  expect(geometry.actor.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportBottom);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  const actorAfterClose = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  expect(Math.abs(actorAfterClose.left - actorBeforeOpen.left), JSON.stringify({ actorAfterClose, actorBeforeOpen })).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actorAfterClose.top - actorBeforeOpen.top), JSON.stringify({ actorAfterClose, actorBeforeOpen })).toBeLessThanOrEqual(1.5);

  // A detached Hermes may be parked in clear space immediately above a protected
  // surface. Opening the menu must not translate the visible actor through it.
  await stage.evaluate((node) => {
    node.style.top = `${Number.parseFloat(window.getComputedStyle(node).top) - 80}px`;
  });
  const actorBeforeProtectedOpen = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  const hullBeforeProtectedOpen = await page.locator('[data-hermes-carrier-travel-hull="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  await trigger.click({ button: 'right' });
  await expect(menu).toBeVisible();
  await page.evaluate((actor) => {
    const blocker = document.createElement('div');
    blocker.dataset.hermesProtected = 'true';
    blocker.dataset.hermesProtectedTest = 'detached-menu';
    blocker.style.cssText = `position:fixed;left:${actor.left}px;top:${actor.bottom + 8}px;width:${actor.width}px;height:56px;pointer-events:none;`;
    document.body.append(blocker);
  }, hullBeforeProtectedOpen);
  const readProtectedGeometry = () => page.evaluate(() => {
    const actor = document.querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')!.getBoundingClientRect();
    const blocker = document.querySelector<HTMLElement>('[data-hermes-protected-test="detached-menu"]')!.getBoundingClientRect();
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const attachment = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.dataset.hermesMenuAttachment;
    const crown = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    return {
      actor: actor.toJSON(),
      attachment,
      attachmentGap: attachment === 'left'
        ? actor.left - menuRect.right
        : attachment === 'right'
          ? menuRect.left - actor.right
          : crown.top + crown.height / 2 - menuRect.bottom,
      blocker: blocker.toJSON(),
      menu: menuRect.toJSON(),
      menuActorOverlap: menuRect.left < actor.right && menuRect.right > actor.left && menuRect.top < actor.bottom && menuRect.bottom > actor.top,
      menuActorHorizontalContinuity: menuRect.left < actor.right && menuRect.right > actor.left,
      protectedGap: blocker.top - actor.bottom,
      protectedOverlap: actor.left < blocker.right && actor.right > blocker.left && actor.top < blocker.bottom && actor.bottom > blocker.top,
      viewportBottom,
      viewportTop,
    };
  });
  await expect.poll(async () => (await readProtectedGeometry()).protectedGap).toBeGreaterThanOrEqual(0);
  const protectedGeometry = await readProtectedGeometry();
  expect(protectedGeometry.protectedGap, JSON.stringify(protectedGeometry)).toBeGreaterThanOrEqual(0);
  expect(protectedGeometry.actor.top, JSON.stringify(protectedGeometry)).toBeGreaterThanOrEqual(protectedGeometry.viewportTop);
  expect(protectedGeometry.actor.bottom, JSON.stringify(protectedGeometry)).toBeLessThanOrEqual(protectedGeometry.viewportBottom);
  expect(protectedGeometry.menu.top, JSON.stringify(protectedGeometry)).toBeGreaterThanOrEqual(protectedGeometry.viewportTop + 8);
  expect(protectedGeometry.menu.bottom, JSON.stringify(protectedGeometry)).toBeLessThanOrEqual(protectedGeometry.viewportBottom - 8);
  expect(['left', 'right', 'above-wide'], JSON.stringify(protectedGeometry)).toContain(protectedGeometry.attachment);
  expect(protectedGeometry.attachmentGap, JSON.stringify(protectedGeometry)).toBeGreaterThanOrEqual(24);
  expect(protectedGeometry.attachmentGap, JSON.stringify(protectedGeometry)).toBeLessThanOrEqual(48);
  expect(protectedGeometry.menuActorOverlap, JSON.stringify(protectedGeometry)).toBe(false);
  if (protectedGeometry.attachment === 'above-wide') {
    expect(protectedGeometry.menuActorHorizontalContinuity, JSON.stringify(protectedGeometry)).toBe(true);
  }
  await page.screenshot({ animations: 'disabled', path: `${outDir}/hermes-menu-detached-constrained.png` });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  const actorAfterProtectedClose = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  expect(Math.abs(actorAfterProtectedClose.left - actorBeforeProtectedOpen.left), JSON.stringify({ actorAfterProtectedClose, actorBeforeProtectedOpen })).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actorAfterProtectedClose.top - actorBeforeProtectedOpen.top), JSON.stringify({ actorAfterProtectedClose, actorBeforeProtectedOpen })).toBeLessThanOrEqual(1.5);
  await page.locator('[data-hermes-protected-test="detached-menu"]').evaluate((node) => node.remove());

  await trigger.click({ button: 'right' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  const actorAfterRepeatedClose = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().toJSON());
  expect(Math.abs(actorAfterRepeatedClose.left - actorBeforeProtectedOpen.left), JSON.stringify({ actorAfterRepeatedClose, actorBeforeProtectedOpen })).toBeLessThanOrEqual(1.5);
  expect(Math.abs(actorAfterRepeatedClose.top - actorBeforeProtectedOpen.top), JSON.stringify({ actorAfterRepeatedClose, actorBeforeProtectedOpen })).toBeLessThanOrEqual(1.5);
  await context.close();
});

test('Hermes action menu restores the researcher scroll position after closing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.waitForTimeout(4500);
  await page.evaluate(() => window.scrollTo({ behavior: 'auto', top: 220 }));
  await page.locator('[data-hermes-companion-margin="true"]').evaluate((margin) => {
    const actor = margin.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]');
    if (!actor) throw new Error('Hermes actor is missing');
    margin.style.translate = `0 ${240 - actor.getBoundingClientRect().top}px`;
  });
  const before = await page.evaluate(() => ({ scrollY: window.scrollY }));
  await trigger.click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /Hermes/u })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before.scrollY);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.scrollY);
});

test('Hermes companion choice moves before its varied speech appears', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  const actor = page.locator('[data-hermes-companion-actor="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await page.waitForTimeout(4500);

  const lines: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.click({ button: 'right' });
    await page.getByRole('menu', { name: /Hermes/u }).locator('[data-hermes-action-key="greet"]').click();
    await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-action', 'ear-perk');
    expect(await page.locator('[data-hermes-menu-feedback="true"]').count()).toBe(0);
    const firstFrame = await actor.screenshot({ animations: 'allow' });
    await page.waitForTimeout(120);
    const secondFrame = await actor.screenshot({ animations: 'allow' });
    expect(secondFrame.equals(firstFrame), `attempt ${attempt + 1} must produce real actor pixel motion`).toBe(false);
    expect(await page.locator('[data-hermes-menu-feedback="true"]').count()).toBe(0);
    const feedback = page.locator('[data-hermes-menu-feedback="true"]');
    await expect(feedback).toBeVisible();
    lines.push((await feedback.innerText()).trim());
    await expect(feedback).toBeHidden({ timeout: 5000 });
  }
  expect(new Set(lines).size).toBeGreaterThanOrEqual(2);
  expect(lines[1]).not.toBe(lines[0]);
  expect(lines[2]).not.toBe(lines[1]);
});

test('Hermes dashboard introduction stops when the researcher starts searching', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toBeVisible({ timeout: 2500 });
  const search = page.locator('input[type="search"]');
  await search.fill('carrier');
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-speech-visible', 'false');

  await search.fill('');
  await page.locator('[data-hermes-input-owner="true"]').click({ button: 'right' });
  await page.getByRole('menu', { name: /Hermes/u }).locator('[data-hermes-action-key="greet"]').click();
  await search.fill('carrier');
  await page.waitForTimeout(650);
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hermes-workspace-stage="true"]')).toHaveAttribute('data-hermes-speech-visible', 'false');
});

test('Hermes keeps approval work quiet when an action is selected', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/research-objects/ro-release/hermes?task=ingestion-release`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  await expect(stage).toHaveAttribute('data-hermes-presentation-state', 'awaiting_approval');
  await stage.locator('[data-hermes-input-owner="true"]').click({ button: 'right' });
  await page.getByRole('menu', { name: /Hermes/u }).locator('[data-hermes-action-key="greet"]').click();
  await page.waitForTimeout(650);
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-hermes-speech-visible', 'false');
});

test('Hermes action menu / mobile long press is compact and does not invoke the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await trigger.scrollIntoViewIfNeeded();
  const closedGeometry = await page.evaluate(() => {
    const actor = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const nearestProtectedBottom = Math.max(...Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .map((node) => node.getBoundingClientRect().bottom)
      .filter((bottom) => bottom <= actor.top));
    return { actorTop: actor.top, precedingGap: actor.top - nearestProtectedBottom };
  });
  expect(closedGeometry.precedingGap, JSON.stringify(closedGeometry)).toBeLessThanOrEqual(160);
  await trigger.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 7, pointerType: 'touch' });
  await page.waitForTimeout(560);
  await trigger.dispatchEvent('pointerup', { button: 0, isPrimary: true, pointerId: 7, pointerType: 'touch' });
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toHaveCount(0);
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-compact', 'true');
  const mobileMenuGeometry = await page.evaluate(() => {
    const menuNode = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!;
    const menuRect = menuNode.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const crownRect = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const marginRect = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]')!.getBoundingClientRect();
    const protectedOverlap = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-protected="true"]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return menuRect.left < rect.right && menuRect.right > rect.left && menuRect.top < rect.bottom && menuRect.bottom > rect.top;
      })
      .length;
    const controlOverlap = Array.from(document.querySelectorAll<HTMLElement>('[data-hermes-presence-control="true"], .hermes-motion-enable'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none'
          && menuRect.left < rect.right && menuRect.right > rect.left && menuRect.top < rect.bottom && menuRect.bottom > rect.top;
      })
      .length;
    return {
      actor: actorRect.toJSON(),
      contained: menuRect.left >= marginRect.left - 1 && menuRect.right <= marginRect.right + 1 && menuRect.top >= marginRect.top - 1 && menuRect.bottom <= marginRect.bottom + 1,
      controlOverlap,
      gap: actorRect.top - menuRect.bottom,
      visibleGap: crownRect.top + crownRect.height / 2 - menuRect.bottom,
      margin: marginRect.toJSON(),
      menu: menuRect.toJSON(),
      overlap: menuRect.bottom > crownRect.top + crownRect.height / 2,
      protectedOverlap,
      tetherContent: getComputedStyle(menuNode, '::after').content,
    };
  });
  expect(mobileMenuGeometry.overlap, JSON.stringify(mobileMenuGeometry)).toBe(false);
  expect(Math.abs(mobileMenuGeometry.actor.top - closedGeometry.actorTop), JSON.stringify({ closedGeometry, mobileMenuGeometry })).toBeLessThanOrEqual(1.5);
  expect(mobileMenuGeometry.visibleGap, JSON.stringify(mobileMenuGeometry)).toBeGreaterThanOrEqual(23.5);
  expect(mobileMenuGeometry.visibleGap, JSON.stringify(mobileMenuGeometry)).toBeLessThanOrEqual(48.5);
  expect(mobileMenuGeometry.contained, JSON.stringify(mobileMenuGeometry)).toBe(true);
  expect(mobileMenuGeometry.controlOverlap, JSON.stringify(mobileMenuGeometry)).toBe(0);
  expect(mobileMenuGeometry.protectedOverlap, JSON.stringify(mobileMenuGeometry)).toBe(0);
  expect(mobileMenuGeometry.tetherContent, JSON.stringify(mobileMenuGeometry)).toBe('none');
  await menu.locator('[data-hermes-mobile-group-switch] [data-active="false"]').click();
  await expect(menu.locator('[data-hermes-action-key]:visible')).toHaveCount(4);
  const researchGroupGap = await page.evaluate(() => {
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const crownRect = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    return crownRect.top + crownRect.height / 2 - menuRect.bottom;
  });
  expect(researchGroupGap).toBeGreaterThanOrEqual(23.5);
  expect(researchGroupGap).toBeLessThanOrEqual(48.5);
  await menu.locator('[data-hermes-mobile-group-switch] [data-active="false"]').click();
  await expect(menu.locator('[data-hermes-action-key]:visible')).toHaveCount(8);
  await trigger.dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: `${outDir}/hermes-menu-mobile-long-press.png`, animations: 'disabled' });
  await menu.locator('[data-hermes-action-key="greet"]').click();
  await expect(menu).toBeHidden();
  const mobileFeedback = page.locator('[data-hermes-menu-feedback="true"]');
  await expect(mobileFeedback).toBeVisible();
  await expect(mobileFeedback.locator('[data-hermes-speech-contour="single"]')).toHaveCount(1);
  const mobileSpeechGeometry = await page.evaluate(() => {
    const mouth = document.querySelector<HTMLElement>('[data-hermes-visible-mouth-anchor="true"]')!.getBoundingClientRect();
    const crown = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const feedback = document.querySelector<HTMLElement>('[data-hermes-menu-feedback="true"]')!.getBoundingClientRect();
    const tip = document.querySelector<HTMLElement>('[data-hermes-speech-tip="true"]')!.getBoundingClientRect();
    const mouthPoint = { x: mouth.left + mouth.width / 2, y: mouth.top + mouth.height / 2 };
    const tipPoint = { x: tip.left + tip.width / 2, y: tip.top + tip.height / 2 };
    const bodyBottom = feedback.top + feedback.height * (92 / 148);
    return {
      bodyClearance: crown.top + crown.height / 2 - bodyBottom,
      distance: Math.hypot(tipPoint.x - mouthPoint.x, tipPoint.y - mouthPoint.y),
      mouthPoint,
      tipPoint,
    };
  });
  await page.screenshot({ path: `${outDir}/hermes-menu-mobile-feedback.png`, animations: 'disabled' });
  expect(mobileSpeechGeometry.bodyClearance, JSON.stringify(mobileSpeechGeometry)).toBeGreaterThanOrEqual(0);
  expect(mobileSpeechGeometry.distance, JSON.stringify(mobileSpeechGeometry)).toBeLessThanOrEqual(8);
  const restoredActorTop = await page.locator('[data-hermes-companion-actor="true"]').evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(restoredActorTop - closedGeometry.actorTop)).toBeLessThanOrEqual(1.5);
});

test('Hermes action menu / editor companion feedback stays in the research margin', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/research-objects/ro-release/edit`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const presence = page.locator('[data-hermes-presence-control="true"]');
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await expect(trigger.locator('[data-hermes-rig="live2d-wanko"]')).toHaveAttribute('data-hermes-rig-status', 'ready', { timeout: 20_000 });
  await expect(presence).toBeVisible();
  await presence.locator('summary').click();
  await presence.getByRole('menuitemradio', { name: /original/i }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(presence.getByRole('menuitemradio', { name: /compact/i })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(presence.locator('summary')).toBeFocused();

  for (const [choice, expectedSize] of [['compact', '200'], ['quiet', '200'], ['original', '360']] as const) {
    await presence.locator('summary').click();
    await presence.getByRole('menuitemradio', { name: new RegExp(choice, 'i') }).click();
    await expect(stage).toHaveAttribute('data-hermes-presence-mode', choice);
    await expect(stage).toHaveAttribute('data-hermes-stage-size', expectedSize);
    await expect(presence.locator('summary')).toBeFocused();
    if (choice !== 'original') {
      await trigger.click({ button: 'right' });
      await expect(page.getByRole('menu', { name: /Hermes/u })).toHaveAttribute('data-compact', 'true');
      await page.keyboard.press('Escape');
    }
  }
  await page.screenshot({ fullPage: true, path: `${outDir}/hermes-presence-editor.png`, animations: 'disabled' });

  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await menu.locator('[data-hermes-action-key="greet"]').click();
  const feedback = page.locator('[data-hermes-menu-feedback="true"]');
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(/Hello — I’m right here\.|There you are\. I kept your place\.|Hi\. What are we curious about today\?/u);
  await expect(feedback).toHaveAttribute('data-hermes-feedback-action', 'ear-perk');
  await expect(feedback).toHaveAttribute('data-hermes-speech-origin', 'mouth');
  await expect(feedback).toHaveAttribute('data-hermes-speech-copy', 'single');
  await expect(feedback.locator('[data-hermes-speech-silhouette="true"]')).toHaveCount(1);
  await expect(feedback.locator('[data-hermes-speech-contour="single"]')).toHaveCount(1);
  await expect(feedback.locator('[data-hermes-speech-tip="true"]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-visible-mouth-anchor="true"]')).toHaveCount(1);
  await expect(page.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')).toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const feedbackNode = document.querySelector<HTMLElement>('[data-hermes-menu-feedback="true"]')!;
    const feedback = feedbackNode.getBoundingClientRect();
    const margin = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]')!.getBoundingClientRect();
    const actor = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const crown = document.querySelector<HTMLElement>('[data-hermes-visible-crown-anchor="true"]')!.getBoundingClientRect();
    const mouth = document.querySelector<HTMLElement>('[data-hermes-visible-mouth-anchor="true"]')!.getBoundingClientRect();
    const tail = document.querySelector<HTMLElement>('[data-hermes-speech-tip="true"]')!.getBoundingClientRect();
    const stateLabel = document.querySelector<HTMLElement>('.hermes-visual-state-label')!.getBoundingClientRect();
    const presence = document.querySelector<HTMLElement>('[data-hermes-presence-control="true"]')!.getBoundingClientRect();
    const motion = document.querySelector<HTMLElement>('.hermes-motion-enable')!.getBoundingClientRect();
    const tailTip = {
      x: tail.left + tail.width / 2,
      y: tail.top + tail.height / 2,
    };
    const overlaps = (first: DOMRect, second: DOMRect) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
    return {
      actorVisible: actor.width > 0 && actor.height > 0,
      bodyClearance: crown.top + crown.height / 2 - (feedback.top + feedback.height * (92 / 148)),
      contained: feedback.left >= margin.left && feedback.right <= margin.right && feedback.top >= margin.top && feedback.bottom <= margin.bottom,
      excess: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mouth: { x: mouth.left + mouth.width / 2, y: mouth.top + mouth.height / 2 },
      mouthDistance: Math.hypot(tailTip.x - (mouth.left + mouth.width / 2), tailTip.y - (mouth.top + mouth.height / 2)),
      pseudoTailCount: [getComputedStyle(feedbackNode, '::before').content, getComputedStyle(feedbackNode, '::after').content].filter((content) => content !== 'none').length,
      stateCollision: overlaps(feedback, stateLabel),
      presenceCollision: overlaps(feedback, presence),
      motionCollision: overlaps(feedback, motion),
      tailTip,
      tailContained: tailTip.x >= margin.left && tailTip.x <= margin.right && tailTip.y >= margin.top && tailTip.y <= margin.bottom,
    };
  });
  expect(geometry.actorVisible).toBe(true);
  expect(geometry.bodyClearance, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.contained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.excess).toBe(0);
  expect(geometry.tailContained).toBe(true);
  expect(geometry.mouthDistance, JSON.stringify(geometry)).toBeLessThanOrEqual(8);
  expect(geometry.pseudoTailCount, JSON.stringify(geometry)).toBe(0);
  expect(geometry.stateCollision, JSON.stringify(geometry)).toBe(false);
  expect(geometry.presenceCollision, JSON.stringify(geometry)).toBe(false);
  expect(geometry.motionCollision, JSON.stringify(geometry)).toBe(false);
  await page.screenshot({ fullPage: true, path: `${outDir}/hermes-menu-editor-feedback.png`, animations: 'disabled' });
  await expect(feedback).toBeHidden({ timeout: 5000 });
});

test('Hermes research action shows its reaction before navigating to a real work surface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/research-objects/ro-release/edit`, { waitUntil: 'networkidle' });
  await page.locator('[data-hermes-input-owner="true"]').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await menu.locator('[data-hermes-action-key="sources"]').click();
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toHaveAttribute('data-hermes-feedback-action', 'citation-trace');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/research-objects\/ro-release\/edit$/);
  await expect(page).toHaveURL(/\/research-objects\/ro-release\/files$/, { timeout: 3000 });

  await page.goto(`${baseUrl}/research-objects/ro-release/edit`, { waitUntil: 'networkidle' });
  await page.locator('[data-hermes-input-owner="true"]').click({ button: 'right' });
  await page.getByRole('menu', { name: /Hermes/u }).locator('[data-hermes-action-key="compare"]').click();
  await expect(page.locator('[data-hermes-menu-feedback="true"]')).toBeVisible();
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await expect(page).toHaveURL(/\/settings$/);
});
