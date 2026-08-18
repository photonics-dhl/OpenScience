import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function expectGuideClearOf(page: Page, obstacle: Locator) {
  const boxes = await Promise.all([
    page.locator('[data-hermes-companion-actor="true"]').boundingBox(),
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
  await expect(page.getByRole('button', { name: /Draft|草拟/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Check|检查/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Explain|解释/i }).click();
  await expect(page.locator('[data-hermes-guide-explanation]')).toBeVisible();
  await expect(stage).toHaveAttribute('data-hermes-guide-motion', 'static');
  await expect(stage.locator('[data-hermes-particles]')).toHaveCount(0);
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
