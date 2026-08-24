import { expect, test, type Page, type Route } from 'playwright/test';

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

for (const releaseCase of PRODUCT_RELEASE_CASES) {
  const { surface, route, state, viewport, reducedMotion } = releaseCase;
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

    if (reducedMotion) {
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const acceptedSurface = page.locator('[data-accepted-optical-surface="landing"]');
      await expect(acceptedSurface).toHaveCount(1);
      await expect(acceptedSurface.locator('[data-optical-lab-asset-plate="true"]')).toHaveCount(1);
      await expect(acceptedSurface.locator('[data-optical-lab-target-typography-plate="true"]')).toHaveCount(1);
      await expect(acceptedSurface.locator('canvas[data-optical-asset-interaction-canvas="true"]')).toHaveCount(0);
      await expect(acceptedSurface).toHaveAttribute('data-render-mode', 'asset-static');
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

test('Hermes action menu / desktop pointer and keyboard preserve the assistant entry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await page.waitForTimeout(4500);
  expect(await page.locator('[data-hermes-placement="anchored"] [data-hermes-performance-bubble][data-hermes-speech-visible="true"]').count()).toBe(0);
  expect(await page.locator('[data-hermes-placement="anchored"] .hermes-guide-nudge[data-visible="true"]').count()).toBe(0);
  const scrollBeforeMenu = await page.evaluate(() => window.scrollY);
  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  const desktopMenuGeometry = await page.evaluate(() => {
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    return { actor: actorRect.toJSON(), menu: menuRect.toJSON(), overlap: menuRect.left < actorRect.right && menuRect.right > actorRect.left && menuRect.top < actorRect.bottom && menuRect.bottom > actorRect.top };
  });
  expect(desktopMenuGeometry.overlap, JSON.stringify(desktopMenuGeometry)).toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeMenu);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ fullPage: true, path: `${outDir}/hermes-menu-dashboard-default.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');

  await trigger.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await trigger.focus();
  await page.keyboard.press('ContextMenu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');

  await trigger.click();
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toBeVisible();
});

test('Hermes action menu / mobile long press is compact and does not invoke the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 7, pointerType: 'touch' });
  await page.waitForTimeout(560);
  await trigger.dispatchEvent('pointerup', { button: 0, isPrimary: true, pointerId: 7, pointerType: 'touch' });
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toHaveCount(0);
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-compact', 'true');
  const mobileMenuGeometry = await page.evaluate(() => {
    const menuRect = document.querySelector<HTMLElement>('[data-hermes-action-menu="true"]')!.getBoundingClientRect();
    const actorRect = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    return { actor: actorRect.toJSON(), menu: menuRect.toJSON(), overlap: menuRect.left < actorRect.right && menuRect.right > actorRect.left && menuRect.top < actorRect.bottom && menuRect.bottom > actorRect.top };
  });
  expect(mobileMenuGeometry.overlap, JSON.stringify(mobileMenuGeometry)).toBe(false);
  await trigger.dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: /Hermes/u })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: `${outDir}/hermes-menu-mobile-long-press.png`, animations: 'disabled' });
});

test('Hermes action menu / editor companion feedback stays in the research margin', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClientFixtures(page);
  await page.goto(`${baseUrl}/research-objects/ro-release/edit`, { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-hermes-input-owner="true"]');
  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Hermes/u });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').last().click();
  const feedback = page.locator('[data-hermes-menu-feedback="true"]');
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveAttribute('data-hermes-speech-origin', 'mouth');
  await expect(feedback).toHaveAttribute('data-hermes-speech-copy', 'single');
  await expect(page.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')).toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const feedbackNode = document.querySelector<HTMLElement>('[data-hermes-menu-feedback="true"]')!;
    const feedback = feedbackNode.getBoundingClientRect();
    const margin = document.querySelector<HTMLElement>('[data-hermes-companion-margin="true"]')!.getBoundingClientRect();
    const actor = document.querySelector<HTMLElement>('[data-hermes-companion-actor="true"]')!.getBoundingClientRect();
    const mouth = document.querySelector<HTMLElement>('[data-hermes-mouth-anchor="true"]')!.getBoundingClientRect();
    const tail = getComputedStyle(feedbackNode, '::after');
    const tailTip = {
      x: feedback.right - Number.parseFloat(tail.right),
      y: feedback.bottom - Number.parseFloat(tail.bottom),
    };
    return {
      actorVisible: actor.width > 0 && actor.height > 0,
      contained: feedback.left >= margin.left && feedback.right <= margin.right && feedback.top >= margin.top && feedback.bottom <= margin.bottom,
      excess: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mouth: { x: mouth.x, y: mouth.y },
      mouthDistance: Math.hypot(tailTip.x - mouth.x, tailTip.y - mouth.y),
      tailTip,
      tailContained: tailTip.x >= margin.left && tailTip.x <= margin.right && tailTip.y >= margin.top && tailTip.y <= margin.bottom,
    };
  });
  expect(geometry.actorVisible).toBe(true);
  expect(geometry.contained).toBe(true);
  expect(geometry.excess).toBe(0);
  expect(geometry.tailContained).toBe(true);
  expect(geometry.mouthDistance, JSON.stringify(geometry)).toBeLessThanOrEqual(18);
  await page.screenshot({ fullPage: true, path: `${outDir}/hermes-menu-editor-feedback.png`, animations: 'disabled' });
  await expect(feedback).toBeHidden({ timeout: 5000 });
});
