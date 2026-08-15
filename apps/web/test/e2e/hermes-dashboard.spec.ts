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
  const browserErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));

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
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Research dashboard' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const visual = page.locator('[data-hermes-renderer="layered-pet"]');
    await expect(visual).toHaveAttribute('data-hermes-state', visualState);
    await expect(page.locator('[data-hermes-instance]')).toHaveCount(1);
    await expect(page.locator('[data-hermes-pet="true"]')).toHaveAttribute('data-pet-ready', 'true', { timeout: 20_000 });
    await expect(page.locator('[data-hermes-frame]')).toHaveCount(3);
    await expect(page.locator('[data-live2d-instance]')).toHaveCount(0);
    await expect(visual).toHaveAttribute('data-runtime-ready', visualState === 'awaiting_approval' ? 'false' : 'true');
    const box = await visual.boundingBox();
    if (box) await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3);
    const petX = await visual.evaluate((element) => element.style.getPropertyValue('--hermes-pet-x'));
    if (visualState === 'awaiting_approval') expect(petX || '0px').toBe('0px');
    else expect(petX).not.toBe('0px');
    if (box && visualState !== 'awaiting_approval') {
      await page.mouse.move(box.x + box.width - 1, box.y + 1);
      const lean = await visual.evaluate((element) => ({
        tilt: Number.parseFloat(element.style.getPropertyValue('--hermes-pet-tilt')),
        x: Number.parseFloat(element.style.getPropertyValue('--hermes-pet-x')),
        y: Number.parseFloat(element.style.getPropertyValue('--hermes-pet-y')),
      }));
      expect(Math.hypot(lean.x, lean.y)).toBeLessThanOrEqual(6.01);
      expect(Math.abs(lean.tilt)).toBeLessThanOrEqual(2.01);
      await page.mouse.move(0, 0);
      await expect.poll(() => visual.evaluate((element) => element.style.getPropertyValue('--hermes-pet-x'))).toBe('0px');
    }
    if (visualState === 'idle') {
      await expect(page.locator('.hermes-pet-blink')).toHaveCSS('animation-name', 'hermes-pet-blink');
    }
    if (visualState === 'scanning') {
      await expect(page.locator('.hermes-pet-working')).toHaveCSS('opacity', '1');
      await expect(page.locator('.hermes-pet-focus-line')).toHaveCSS('animation-name', 'hermes-pet-scan-line');
    }
    if (visualState === 'guiding' || visualState === 'suggesting') {
      await expect(page.locator('.hermes-pet-stage')).toHaveCSS('--hermes-state-x', '3px');
      await expect(page.locator('.hermes-pet-stage')).toHaveCSS('--hermes-state-tilt', '-1deg');
    }
    if (visualState === 'awaiting_approval') {
      await expect(page.locator('.hermes-pet-idle')).toHaveCSS('animation-name', 'none');
      await expect(page.locator('.hermes-pet-node-citation')).toHaveCSS('background-color', 'rgb(255, 78, 34)');
    }
    await page.screenshot({ path: `${outDir}/${visualState}-1440x900.png`, fullPage: true, animations: 'disabled' });
    if (visualState === 'scanning') {
      await page.locator('[data-hermes-frame="working"]').dispatchEvent('error');
      await expect(page.locator('[data-hermes-pet="true"]')).toHaveAttribute('data-pet-ready', 'false');
      await expect(page.locator('.hermes-vector-fallback')).toHaveCSS('opacity', '0.42');
    }
  }

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page, 'needs_review');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `${outDir}/awaiting_approval-390x844.png`, fullPage: true, animations: 'disabled' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page);
  await page.reload({ waitUntil: 'networkidle' });
  const reducedVisual = page.locator('[data-hermes-renderer="layered-pet"]');
  await expect(reducedVisual).toHaveAttribute('data-runtime-ready', 'false');
  await expect(page.locator('.hermes-pet-stage')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: `${outDir}/idle-reduced-390x844.png`, fullPage: true, animations: 'disabled' });

  await page.unrouteAll({ behavior: 'wait' });
  await mockDashboard(page, 'needs_review');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.hermes-pet-node-citation')).toHaveCSS('display', 'block');
  await expect(page.locator('.hermes-pet-node-citation')).toHaveCSS('background-color', 'rgb(255, 78, 34)');
  await expect(page.locator('.hermes-pet-node-citation')).toHaveCSS('animation-name', 'none');
  expect(browserErrors).toEqual([]);
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
