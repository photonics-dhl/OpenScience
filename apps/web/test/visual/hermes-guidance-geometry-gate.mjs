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
  await target.waitFor();
  await page.locator('[data-hermes-guide-bubble]').waitFor();
  assert.equal(await stage.getAttribute('data-hermes-guide-motion'), 'edge-stop', 'a saved user dock must not be overridden by automatic guide travel');
  await page.evaluate(() => {
    window.__hermesGuideGeometrySamples = [];
    window.__hermesGuideGeometrySamplingDone = false;
    let sawTravel = false;
    let sawTravelHidden = false;
    const sample = () => {
      const stage = document.querySelector('[data-hermes-workspace-stage]');
      const actor = stage?.querySelector('[data-hermes-companion-actor="true"]')?.getBoundingClientRect();
      const bubble = stage?.querySelector('[data-hermes-guide-bubble]')?.getBoundingClientRect();
      const field = document.querySelector('[data-hermes-anchor="sdf-problem"]')?.getBoundingClientRect();
      sawTravel ||= stage?.getAttribute('data-hermes-guide-motion') === 'travel';
      const guideVisible = Boolean(document.querySelector('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]'));
      sawTravelHidden ||= sawTravel && !guideVisible;
      if (sawTravel && actor && bubble && field) window.__hermesGuideGeometrySamples.push({
        actor: {
          bottom: Math.max(actor.bottom, bubble.bottom),
          left: Math.min(actor.left, bubble.left),
          right: Math.max(actor.right, bubble.right),
          top: Math.min(actor.top, bubble.top),
        },
        field: { bottom: field.bottom, left: field.left, right: field.right, top: field.top },
      });
      if (sawTravelHidden && guideVisible) {
        window.__hermesGuideGeometrySamplingDone = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: /Take me there|带我过去/ }).click();
  await page.waitForFunction(() => window.__hermesGuideGeometrySamplingDone, undefined, { timeout: 10_000 });
  const samples = await page.evaluate(() => window.__hermesGuideGeometrySamples);
  assert.ok(samples.length >= 10, `guide travel must yield real geometry samples, got ${samples.length}`);
  const collision = samples.find(({ actor, field }) => actor.left < field.right && actor.right > field.left && actor.top < field.bottom && actor.bottom > field.top);
  assert.equal(collision, undefined, `Hermes swept across the editable target: ${JSON.stringify({ collision, first: samples.slice(0, 4), last: samples.slice(-4) })}`);
  const before = await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => node.value));
  await page.getByRole('button', { name: /Draft|草拟/ }).click();
  await page.locator('[data-before-after-proposal]').first().waitFor({ timeout: 5_000 });
  assert.deepEqual(await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => node.value)), before, 'drafting must not change SDF before acceptance');
  await page.locator('[data-before-after-proposal]').filter({ hasText: 'Proposed problem' }).getByRole('button', { name: /Review changes|审阅变更/ }).click();
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /01 Problem|01 问题/, exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: /Problem|问题/ }).inputValue(), 'Proposed problem');
  await stage.screenshot({ path: resolve(output, 'guide-arrival.png'), animations: 'allow' });
  await writeFile(resolve(output, 'guidance-metrics.json'), `${JSON.stringify({ geometrySamples: samples.length, sdfFieldsBefore: before.length }, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}
