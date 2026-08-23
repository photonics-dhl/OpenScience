/* global localStorage, process */

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3198';
const output = resolve('test/visual/out/hermes-work-assistant');
await mkdir(output, { recursive: true });

const overlaps = (first, second) => first.x < second.x + second.width
  && first.x + first.width > second.x
  && first.y < second.y + second.height
  && first.y + first.height > second.y;

async function mockCreateFlow(page) {
  await page.route('**/api/workspaces', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ workspaces: [{ id: 'workspace-user', name: 'User research workspace', role: 'OWNER', type: 'PERSONAL' }] }),
  }));
  await page.route('**/api/csrf-token', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ csrfToken: 'experience-token' }),
  }));
  await page.route('**/api/research-objects', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      contentType: 'application/json',
      status: 201,
      body: JSON.stringify({ researchObject: { id: 'ro-experience', version: 1, workspaceId: 'workspace-user' } }),
    });
  });
}

async function dragStage(page, stage, target) {
  const hull = stage.locator('[data-hermes-carrier-interaction-hull="true"]');
  const bounds = await hull.boundingBox();
  assert.ok(bounds, 'Hermes drag hull must have geometry');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-hermes-workspace-stage]')?.getAttribute('data-hermes-dragging') === 'false');
}

const browser = await chromium.launch({ headless: true });

try {
  const desktopContext = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const desktop = await desktopContext.newPage();
  await mockCreateFlow(desktop);
  await desktop.goto(`${baseUrl}/research-objects/new?mode=blank`, { waitUntil: 'networkidle' });

  const stage = desktop.locator('[data-hermes-workspace-stage="true"]');
  const title = desktop.locator('input[name="title"]');
  const create = desktop.getByRole('button', { name: /Create Research Object|创建 Research Object/u });
  await stage.waitFor({ state: 'visible' });
  await desktop.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  assert.equal(await stage.getAttribute('data-hermes-stage-size'), '176');
  await title.fill('Coherent transport in a driven optical lattice');
  assert.equal(await title.inputValue(), 'Coherent transport in a driven optical lattice');

  const initialStage = await stage.boundingBox();
  const titleBox = await title.boundingBox();
  const createBox = await create.boundingBox();
  assert.ok(initialStage && titleBox && createBox, 'desktop task controls and Hermes must have geometry');
  assert.equal(overlaps(initialStage, titleBox), false, 'Hermes must not cover the active RO title control');
  assert.equal(overlaps(initialStage, createBox), false, 'Hermes must not cover the primary RO-create action');

  await dragStage(desktop, stage, { x: 2, y: 2 });
  const clamped = await stage.boundingBox();
  assert.ok(clamped && clamped.x >= 0 && clamped.y >= 0, `dragging must keep Hermes recoverable: ${JSON.stringify(clamped)}`);
  const edgeBubble = desktop.locator('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]');
  if (await edgeBubble.count()) {
    const edgeBubbleBox = await edgeBubble.boundingBox();
    assert.ok(edgeBubbleBox && edgeBubbleBox.x >= 0 && edgeBubbleBox.y >= 0
      && edgeBubbleBox.x + edgeBubbleBox.width <= 1440 && edgeBubbleBox.y + edgeBubbleBox.height <= 900,
    `the guide bubble must flip inward at a user dock edge: ${JSON.stringify(edgeBubbleBox)}`);
  }
  const saved = await desktop.evaluate(() => JSON.parse(localStorage.getItem('openscience:hermes-dock:v1:workspace-current:desktop') ?? 'null'));
  assert.ok(saved && saved.xRatio >= 0 && saved.xRatio <= 1 && saved.yRatio >= 0 && saved.yRatio <= 1, `saved dock must remain in viewport ratios: ${JSON.stringify(saved)}`);

  await desktop.reload({ waitUntil: 'networkidle' });
  await stage.waitFor({ state: 'visible' });
  const restored = await stage.boundingBox();
  assert.ok(restored && clamped && Math.abs(restored.x - clamped.x) <= 2 && Math.abs(restored.y - clamped.y) <= 2, `reload must restore the user's dock: ${JSON.stringify({ clamped, restored })}`);

  await desktop.setViewportSize({ height: 640, width: 800 });
  await desktop.waitForFunction(() => {
    const bounds = document.querySelector('[data-hermes-workspace-stage]')?.getBoundingClientRect();
    return bounds && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  });
  const resized = await stage.boundingBox();
  assert.ok(resized && resized.x >= 0 && resized.y >= 0
    && resized.x + resized.width <= 800 && resized.y + resized.height <= 640,
  `viewport resize must keep the saved assistant recoverable: ${JSON.stringify(resized)}`);
  await desktop.setViewportSize({ height: 900, width: 1440 });

  await title.fill('Coherent transport in a driven optical lattice');
  await dragStage(desktop, stage, { x: 120, y: 720 });
  assert.equal(await desktop.locator('.hermes-companion-bubble:visible').count(), 0, 'moving Hermes must dismiss stale contextual speech');
  await desktop.screenshot({ path: resolve(output, 'ro-create-desktop-final.png'), fullPage: true, animations: 'disabled' });
  await create.click();
  await desktop.waitForURL('**/research-objects/ro-experience/edit');
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const mobile = await mobileContext.newPage();
  await mockCreateFlow(mobile);
  await mobile.goto(`${baseUrl}/research-objects/new?mode=blank`, { waitUntil: 'networkidle' });
  const mobileStage = mobile.locator('[data-hermes-workspace-stage="true"]');
  const mobileTitle = mobile.locator('input[name="title"]');
  const mobileCreate = mobile.getByRole('button', { name: /Create Research Object|创建 Research Object/u });
  await mobileStage.waitFor({ state: 'visible' });
  assert.equal(await mobileStage.getAttribute('data-hermes-stage-size'), '120');
  await mobileTitle.fill('Mobile optical evidence draft');
  const mobileStageBox = await mobileStage.boundingBox();
  const mobileTitleBox = await mobileTitle.boundingBox();
  const mobileCreateBox = await mobileCreate.boundingBox();
  assert.ok(mobileStageBox && mobileTitleBox && mobileCreateBox, 'mobile task controls and Hermes must have geometry');
  assert.equal(overlaps(mobileStageBox, mobileTitleBox), false, 'mobile Hermes must not cover the title control');
  assert.equal(overlaps(mobileStageBox, mobileCreateBox), false, 'mobile Hermes must not cover the create action');
  await dragStage(mobile, mobileStage, { x: 388, y: 842 });
  const mobileClamped = await mobileStage.boundingBox();
  assert.ok(mobileClamped && mobileClamped.x >= 0 && mobileClamped.y >= 0
    && mobileClamped.x + mobileClamped.width <= 390 && mobileClamped.y + mobileClamped.height <= 844,
  `mobile drag must keep Hermes on-screen: ${JSON.stringify(mobileClamped)}`);
  assert.equal(await mobile.locator('.hermes-companion-bubble:visible').count(), 0, 'moving mobile Hermes must dismiss stale contextual speech');
  assert.equal(await mobileStage.getAttribute('data-hermes-stage-size'), '120', 'mobile guidance must keep the compact assistant footprint');
  const mobileBubble = mobile.locator('.hermes-companion-bubble:visible');
  if (await mobileBubble.count()) {
    const mobileBubbleBox = await mobileBubble.boundingBox();
    assert.ok(mobileBubbleBox && mobileBubbleBox.width <= 192 && mobileBubbleBox.x >= 0
      && mobileBubbleBox.x + mobileBubbleBox.width <= 390,
    `mobile speech must stay a compact in-viewport note: ${JSON.stringify(mobileBubbleBox)}`);
    const visibleGuideControls = await mobileBubble.locator('.hermes-companion-actions, .hermes-companion-take-me').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== 'none').length);
    assert.equal(visibleGuideControls, 0, 'mobile contextual speech must not expand into a floating toolbar');
  }
  await mobile.screenshot({ path: resolve(output, 'ro-create-mobile-final.png'), fullPage: true, animations: 'disabled' });
  await mobileContext.close();
} finally {
  await browser.close();
}
