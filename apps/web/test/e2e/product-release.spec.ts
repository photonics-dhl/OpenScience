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
  await page.route('**/api/research-objects/ro-release', (route) => json(route, { researchObject }));
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

    if (reducedMotion) {
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      expect(await page.locator('[data-optical-displace="true"]').getAttribute('scale')).toBe('0');
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
