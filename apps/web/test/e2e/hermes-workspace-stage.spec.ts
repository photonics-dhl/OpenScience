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
  await page.route('**/api/ingestion?actionable=true', (route) => json(route, { tasks: [] }));
  await page.route('**/api/research-objects/ro-hermes/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-hermes', (route) => json(route, { researchObject: {
    id: 'ro-hermes', workspaceId: 'workspace-hermes', title: 'Coherent transport at the attosecond frontier',
    visibility: 'private', version: 2, sdf: { core: { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' } },
  } }));
}

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

  const rigBox = await stage.locator('[data-hermes-rig="mesh-2d"]').boundingBox();
  expect(rigBox).not.toBeNull();
  await page.mouse.move(rigBox!.x + rigBox!.width * .2, rigBox!.y + rigBox!.height / 2);
  await page.mouse.move(rigBox!.x + rigBox!.width * .8, rigBox!.y + rigBox!.height / 2);
  await page.mouse.move(rigBox!.x + rigBox!.width + 140, rigBox!.y + rigBox!.height / 2);
  await expect(stage).toHaveAttribute('data-hermes-action', 'pointer-avoid');
});

test('Hermes defaults to full motion and lets the user persist an explicit reduced preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  const canvas = stage.locator('[data-hermes-articulated-canvas="true"]');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const disable = page.getByRole('button', { name: /Reduce Hermes motion|关闭 Hermes 动效/i });
  await expect(disable).toBeVisible();
  await disable.click();
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(stage.locator('.hermes-companion-actor')).toHaveCSS('animation-name', 'none');
  await expect(stage.locator('.hermes-guide-nudge')).toHaveCSS('transition-duration', '0s');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=full'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'full');
  await page.evaluate(() => window.history.pushState(null, '', '?hermes-motion=reduced'));
  await expect(stage).toHaveAttribute('data-hermes-motion-preference', 'reduced');
  const enable = page.getByRole('button', { name: /Enable Hermes motion|开启 Hermes 动效/i });
  await expect(enable).toBeVisible();

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
