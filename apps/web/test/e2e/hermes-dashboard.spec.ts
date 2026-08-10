import { expect, test, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const outDir = 'test/visual/out/hermes-dashboard';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockDashboard(page: Page, taskState?: string) {
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [{
    id: 'ro-hermes', publicId: 'OSR-2026-000042', title: 'Coherent transport at the attosecond frontier', version: 2, status: 'draft',
  }] }));
  await page.route('**/api/ingestion?actionable=true', (route) => json(route, { tasks: taskState ? [{
    id: 'task-hermes', researchObjectId: 'ro-hermes', researchTitle: 'Coherent transport at the attosecond frontier',
    logicalPath: 'manuscript.pdf', state: taskState, retryCount: 0, error: taskState.startsWith('failed_') ? 'Parser interrupted' : null,
  }] : [] }));
}

test('Hermes renders empty, active and approval states with one original visual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [taskState, visualState] of [
    [undefined, 'idle'],
    ['queued', 'guiding'],
    ['parsing', 'scanning'],
    ['stored', 'suggesting'],
    ['needs_review', 'awaiting_approval'],
    ['failed_retryable', 'failed'],
  ] as const) {
    await page.unrouteAll({ behavior: 'wait' });
    await mockDashboard(page, taskState);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    const visual = page.locator('[data-hermes-renderer="original-vector"]');
    await expect(visual).toHaveAttribute('data-hermes-state', visualState);
    await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
    await expect(page.locator('[data-live2d-instance]')).toHaveCount(0);
    await expect(visual).toHaveAttribute('data-runtime-ready', visualState === 'awaiting_approval' ? 'false' : 'true');
    const box = await visual.boundingBox();
    if (box) await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3);
    const gazeX = await visual.evaluate((element) => element.style.getPropertyValue('--hermes-gaze-x'));
    if (visualState === 'awaiting_approval') expect(gazeX || '0px').toBe('0px');
    else expect(gazeX).not.toBe('0px');
    await page.screenshot({ path: `${outDir}/${visualState}-1440x900.png`, fullPage: true, animations: 'disabled' });
  }

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page, 'needs_review');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `${outDir}/awaiting_approval-390x844.png`, fullPage: true, animations: 'disabled' });
});

test('Hermes loading and error surfaces are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await json(route, { userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' });
  });
  await page.route('**/api/research-objects?limit=20', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await json(route, { researchObjects: [] });
  });
  await page.route('**/api/ingestion?actionable=true', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await json(route, { tasks: [] });
  });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
  await page.screenshot({ path: `${outDir}/loading-390x844.png`, fullPage: true });

  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { error: { message: 'Research index unavailable' } }, 503));
  await page.route('**/api/ingestion?actionable=true', (route) => json(route, { tasks: [] }));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('p[role="alert"]')).toContainText('Research index unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `${outDir}/error-390x844.png`, fullPage: true, animations: 'disabled' });
});
