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
  assert.equal(await stage.getAttribute('data-hermes-guide-motion'), 'edge-stop', 'a saved user dock must not be overridden by automatic guide travel');
  await page.evaluate(() => {
    window.__hermesGuideGeometrySamples = [];
    window.__hermesGuideGeometrySamplingDone = false;
    let sawTravel = false;
    let sawTravelHidden = false;
    const sample = () => {
      const stage = document.querySelector('[data-hermes-workspace-stage]');
      const actor = stage?.querySelector('[data-hermes-carrier-travel-hull="true"]')?.getBoundingClientRect();
      const bubble = stage?.querySelector('[data-hermes-guide-bubble]')?.getBoundingClientRect();
      const field = document.querySelector('[data-hermes-anchor="sdf-problem"]')?.getBoundingClientRect();
      sawTravel ||= stage?.getAttribute('data-hermes-guide-motion') === 'travel';
      const guideVisible = Boolean(document.querySelector('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]'));
      sawTravelHidden ||= sawTravel && !guideVisible;
      if (sawTravel && !window.__hermesGuideGeometryPlacement.travel) {
        window.__hermesGuideGeometryPlacement.travel = {
          horizontal: stage?.getAttribute('data-hermes-bubble-horizontal'),
          vertical: stage?.getAttribute('data-hermes-bubble-vertical'),
        };
      }
      window.__hermesGuideGeometryPlacement.sawTravelHidden ||= sawTravelHidden;
      if (sawTravel && actor && bubble && field) window.__hermesGuideGeometrySamples.push({
        actor: {
          bottom: Math.max(actor.bottom, bubble.bottom),
          left: Math.min(actor.left, bubble.left),
          right: Math.max(actor.right, bubble.right),
          top: Math.min(actor.top, bubble.top),
        },
        parts: {
          actor: { bottom: actor.bottom, left: actor.left, right: actor.right, top: actor.top },
          bubble: { bottom: bubble.bottom, left: bubble.left, right: bubble.right, top: bubble.top },
        },
        field: { bottom: field.bottom, left: field.left, right: field.right, top: field.top },
      });
      if (sawTravelHidden && guideVisible) {
        window.__hermesGuideGeometryPlacement.arrival = {
          horizontal: stage?.getAttribute('data-hermes-bubble-horizontal'),
          vertical: stage?.getAttribute('data-hermes-bubble-vertical'),
        };
        window.__hermesGuideGeometrySamplingDone = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: /Take me there|带我过去/ }).click();
  try {
    await page.waitForFunction(() => window.__hermesGuideGeometrySamplingDone, undefined, { timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const stage = document.querySelector('[data-hermes-workspace-stage]');
      const bubble = document.querySelector('[data-hermes-guide-bubble]');
      const target = document.querySelector('[data-hermes-anchor="sdf-problem"]');
      const actor = stage?.querySelector('[data-hermes-companion-actor="true"]');
      const travelHull = stage?.querySelector('[data-hermes-carrier-travel-hull="true"]');
      return {
        actor: actor?.getBoundingClientRect().toJSON(),
        bubbleDisplay: bubble ? window.getComputedStyle(bubble).display : null,
        bubble: bubble?.getBoundingClientRect().toJSON(),
        bubbleVisible: bubble?.getAttribute('data-hermes-guide-visible'),
        guideMotion: stage?.getAttribute('data-hermes-guide-motion'),
        guideSuppressed: stage?.getAttribute('data-hermes-guide-suppressed'),
        obstacles: Array.from(document.querySelectorAll('[data-before-after-proposal], [data-extract-sdf="true"], [data-hermes-protected="true"]')).map((element) => ({
          name: element.getAttribute('aria-label') ?? element.getAttribute('data-hermes-protected') ?? element.tagName,
          rect: element.getBoundingClientRect().toJSON(),
        })),
        samples: window.__hermesGuideGeometrySamples?.length ?? -1,
        stage: stage?.getBoundingClientRect().toJSON(),
        target: target?.getBoundingClientRect().toJSON(),
        travelHull: travelHull?.getBoundingClientRect().toJSON(),
      };
    });
    throw new Error(`guide sampling timeout: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const samples = await page.evaluate(() => window.__hermesGuideGeometrySamples);
  const placement = await page.evaluate(() => window.__hermesGuideGeometryPlacement);
  assert.ok(samples.length >= 10, `guide travel must yield real geometry samples, got ${samples.length}`);
  assert.equal(placement.sawTravelHidden, true, 'the guide bubble must stay hidden for the complete travel interval');
  assert.deepEqual(placement.arrival, placement.travel, 'the selected guide-bubble orientation must not drift between travel and arrival');
  const collision = samples.find(({ actor, field }) => actor.left < field.right && actor.right > field.left && actor.top < field.bottom && actor.bottom > field.top);
  assert.equal(collision, undefined, `Hermes swept across the editable target: ${JSON.stringify({ collision, first: samples.slice(0, 4), last: samples.slice(-4) })}`);
  const arrival = await page.evaluate(() => {
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
  assert.ok(arrival.actor && arrival.bubble && arrival.target, `arrival geometry must be measurable: ${JSON.stringify(arrival)}`);
  const overlaps = (part, obstacle) => part.left < obstacle.right && part.right > obstacle.left && part.top < obstacle.bottom && part.bottom > obstacle.top;
  for (const [name, part] of [['actor', arrival.actor], ['bubble', arrival.bubble]]) {
    assert.equal(overlaps(part, arrival.target), false, `${name} must not cover the editable target at arrival`);
    const obstacle = arrival.obstacles.find((candidate) => overlaps(part, candidate));
    assert.equal(obstacle, undefined, `${name} must not cover extract/protected work at arrival: ${JSON.stringify(obstacle)}`);
  }
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
