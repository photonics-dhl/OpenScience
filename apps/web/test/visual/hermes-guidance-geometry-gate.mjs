/* global document, localStorage, process, requestAnimationFrame, window */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3194';
const output = resolve('test/visual/out/hermes-companion');
await mkdir(output, { recursive: true });
const core = {
  schemaVersion: '0.1.0', problem: 'Original problem', insight: 'Original insight', method: 'Original method',
  results: 'Original results', limitations: 'Original limitations', reproducibility: 'Original reproducibility',
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('openscience:hermes-dock:v1:workspace-current:desktop', JSON.stringify({
  activity: 'balanced', particles: true, proactiveHints: true, sound: false, xRatio: .9, yRatio: .82,
})));
await page.addInitScript(() => {
  window.__hermesGuideGeometrySamples = [];
  window.__hermesGuideGeometrySamplingDone = false;
  window.__hermesGuideGeometryPlacement = { arrival: null, sawTravelHidden: false, travel: null };
});
await page.route('**/api/research-objects/ro-guide/versions', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ versions: [] }) }));
await page.route('**/api/research-objects/ro-guide', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObject: {
  id: 'ro-guide', workspaceId: 'workspace-guide', title: 'Guided object', status: 'draft', visibility: 'private', version: 1,
  createdAt: '2026-08-17T00:00:00.000Z', sdf: { core, nodes: [] },
} }) }));
await page.route('**/api/csrf-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'guide-token' }) }));
await page.route('**/api/agent/sessions', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: { id: 'guide-session' } }) }));
await page.route('**/api/agent/tasks', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ task: { id: 'guide-task', status: 'pending', progress: 0 } }) }));
await page.route('**/api/agent/tasks/guide-task', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: {
  id: 'guide-task', status: 'succeeded', progress: 100, error: null,
  result: { core: { ...core, problem: 'Proposed problem', results: 'Proposed results' } },
} }) }));

try {
  await page.goto(`${baseUrl}/research-objects/ro-guide/edit`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage]');
  const target = page.locator('[data-hermes-anchor="sdf-problem"]');
  await stage.waitFor();
  assert.equal(await stage.getAttribute('data-hermes-footprint-source'), 'carrier-travel-hull');
  await target.waitFor();
  await page.locator('[data-hermes-guide-bubble]').waitFor();
  assert.equal(await stage.getAttribute('data-hermes-guide-motion'), 'static', 'a saved user dock must stay static until the user explicitly requests guide travel');
  const stationary = await page.evaluate(() => {
    const stage = document.querySelector('[data-hermes-workspace-stage]');
    const actor = stage?.querySelector('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect();
    const bubble = stage?.querySelector('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')?.getBoundingClientRect();
    const target = document.querySelector('[data-hermes-anchor="sdf-problem"]')?.getBoundingClientRect();
    const obstacles = Array.from(document.querySelectorAll('[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]'))
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0);
    const serialize = (bounds) => bounds ? ({ bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top }) : null;
    return { actor: serialize(actor), bubble: serialize(bubble), obstacles: obstacles.map(serialize), target: serialize(target) };
  });
  assert.ok(stationary.actor && stationary.bubble && stationary.target, `stationary guide geometry must be measurable: ${JSON.stringify(stationary)}`);
  const overlaps = (part, obstacle) => part.left < obstacle.right && part.right > obstacle.left && part.top < obstacle.bottom && part.bottom > obstacle.top;
  for (const [name, part] of [['actor', stationary.actor], ['bubble', stationary.bubble]]) {
    assert.equal(overlaps(part, stationary.target), false, `${name} must not cover the editable target while the saved dock remains static`);
    const obstacle = stationary.obstacles.find((candidate) => overlaps(part, candidate));
    assert.equal(obstacle, undefined, `${name} must not cover extract/protected work while static: ${JSON.stringify(obstacle)}`);
  }
  const horizontalFlip = await page.evaluate(async () => {
    const stage = document.querySelector('[data-hermes-workspace-stage]');
    const bubble = document.querySelector('[data-hermes-guide-bubble]');
    if (!(stage instanceof globalThis.HTMLElement) || !(bubble instanceof globalThis.HTMLElement)) return null;
    const original = stage.getAttribute('data-hermes-bubble-horizontal');
    const measure = async (horizontal) => {
      stage.setAttribute('data-hermes-bubble-horizontal', horizontal);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const stageBounds = stage.getBoundingClientRect();
      const bubbleBounds = bubble.getBoundingClientRect();
      const center = stageBounds.left + stageBounds.width / 2;
      return { left: center - bubbleBounds.left, right: bubbleBounds.right - center };
    };
    const left = await measure('left');
    const right = await measure('right');
    if (original) stage.setAttribute('data-hermes-bubble-horizontal', original);
    return { left, right };
  });
  assert.ok(horizontalFlip, 'horizontal guide-bubble flip geometry must be measurable');
  assert.ok(Math.abs(horizontalFlip.left.left - horizontalFlip.right.right) <= .5,
    `left/right guide-bubble outer offsets must be symmetric: ${JSON.stringify(horizontalFlip)}`);
  assert.ok(Math.abs(horizontalFlip.left.right - horizontalFlip.right.left) <= .5,
    `left/right guide-bubble inner offsets must be symmetric: ${JSON.stringify(horizontalFlip)}`);
  const before = await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => node.value));
  await page.getByRole('button', { name: /Draft|草拟/ }).click();
  await page.locator('[data-before-after-proposal]').first().waitFor({ timeout: 5_000 });
  assert.deepEqual(await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => node.value)), before, 'drafting must not change SDF before acceptance');
  await page.locator('[data-before-after-proposal]').filter({ hasText: 'Proposed problem' }).getByRole('button', { name: /Review changes|审阅变更/ }).click();
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /01 Problem|01 问题/, exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: /Problem|问题/ }).inputValue(), 'Proposed problem');
  await stage.screenshot({ path: resolve(output, 'guide-arrival.png'), animations: 'allow' });
  await writeFile(resolve(output, 'guidance-metrics.json'), `${JSON.stringify({ guideMode: 'static', sdfFieldsBefore: before.length }, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}
