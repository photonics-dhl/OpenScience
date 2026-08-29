import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';

const researchObject = {
  id: 'ro-readable',
  workspaceId: 'workspace-readable',
  title: 'Evidence-bounded coherent transport',
  status: 'draft',
  visibility: 'private',
  version: 1,
  sdf: { core: {
    schemaVersion: '0.1.0',
    problem: 'Which mechanism bounds coherent transport?',
    insight: 'The candidate mechanism is constrained by phase-sensitive evidence.',
    method: 'Compare time-resolved spectra with a constrained model.',
    results: '',
    limitations: 'No experimental result is available yet.',
    reproducibility: 'The proposed protocol and environment will be recorded.',
  }, nodes: [] },
};

async function json(route: Route, body: unknown) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkspace(page: Page) {
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'readable-user', email: 'reader@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/workspaces**', (route) => json(route, { workspaces: [{ id: 'workspace-readable', name: 'Coherent Systems Lab', role: 'admin' }] }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [researchObject] }));
  await page.route('**/api/research-objects/ro-readable/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-readable', (route) => json(route, { researchObject }));
  await page.route('**/api/ingestion**', (route) => json(route, { tasks: [] }));
  await page.route('**/api/agent/tasks**', (route) => json(route, { tasks: [] }));
}

async function expectMinimumFont(locator: Locator, minimumPx: number) {
  const sizes = await locator.evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(minimumPx);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`essential workspace text remains readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockWorkspace(page);

    for (const route of ['/dashboard', '/research-objects/new?mode=blank', '/research-objects/ro-readable/edit']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await expectMinimumFont(page.locator('[data-reading-role="control"]'), 14);
      await expectMinimumFont(page.locator('[data-reading-role="body"]'), 15);
      await expectMinimumFont(page.locator('[data-reading-role="reading"]'), 17);
    }

    await page.goto(`${baseUrl}/visual-public-reading`, { waitUntil: 'networkidle' });
    await expectMinimumFont(page.locator('[data-reading-role="body"]'), 15);
    await expectMinimumFont(page.locator('[data-reading-role="reading"]'), 17);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await expectMinimumFont(page.locator('[data-reading-role="control"]'), 14);
  });
}
