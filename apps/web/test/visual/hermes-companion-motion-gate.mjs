/* global document, process */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3194';
const output = resolve('test/visual/out/hermes-companion');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
await page.route('**/api/auth/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'motion-user', email: 'motion@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free' }) }));
await page.route('**/api/research-objects?limit=20', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjects: [] }) }));
await page.route('**/api/ingestion?actionable=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) }));

try {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="mesh-2d"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  const stage = page.locator('[data-hermes-workspace-stage]');
  const canvasBounds = await page.locator('[data-hermes-articulated-canvas]').boundingBox();
  assert.ok(canvasBounds && canvasBounds.width >= 210 && canvasBounds.height >= 210,
    `Dashboard Hermes must remain readable at product size, got ${JSON.stringify(canvasBounds)}`);
  assert.ok(await stage.getAttribute('data-hermes-action-kind'), 'workspace stage must expose the director action kind');

  const started = Date.now();
  const actions = [];
  const actionTracks = new Map();
  const patrolTracks = new Map();
  let lastStartedAt = '';
  let duplicate = null;
  while (Date.now() - started < 90_000 && !duplicate) {
    const sample = await page.evaluate(() => {
      const stageNode = document.querySelector('[data-hermes-workspace-stage]');
      const canvas = document.querySelector('[data-hermes-articulated-canvas]');
      const actor = document.querySelector('[data-hermes-companion-actor]');
      const actorBounds = actor?.getBoundingClientRect();
      return {
        action: stageNode?.getAttribute('data-hermes-action') ?? '',
        actor: actorBounds ? { left: actorBounds.left, top: actorBounds.top } : null,
        kind: stageNode?.getAttribute('data-hermes-action-kind') ?? '',
        startedAt: stageNode?.getAttribute('data-hermes-action-started-at') ?? '',
        joints: [canvas?.getAttribute('data-hermes-head'), canvas?.getAttribute('data-hermes-torso'), canvas?.getAttribute('data-hermes-tail')].join('|'),
      };
    });
    if (sample.action === 'patrol' && sample.startedAt && sample.actor) {
      const track = patrolTracks.get(sample.startedAt) ?? [];
      track.push(sample.actor);
      patrolTracks.set(sample.startedAt, track);
    }
    if (sample.startedAt && sample.actor) {
      const track = actionTracks.get(sample.startedAt) ?? { action: sample.action, points: [] };
      track.points.push(sample.actor);
      actionTracks.set(sample.startedAt, track);
    }
    if (sample.startedAt && sample.startedAt !== lastStartedAt) {
      await page.waitForTimeout(260);
      sample.joints = await page.locator('[data-hermes-articulated-canvas]').evaluate((canvas) => [
        canvas.getAttribute('data-hermes-head'), canvas.getAttribute('data-hermes-torso'), canvas.getAttribute('data-hermes-tail'),
      ].join('|'));
      actions.push({ ...sample, elapsedMs: Date.now() - started });
      if (actions.length > 1 && actions.at(-2).action === sample.action) duplicate = [actions.at(-2), actions.at(-1)];
      lastStartedAt = sample.startedAt;
    }
    await page.waitForTimeout(180);
  }

  const distinct = new Set(actions.map((entry) => entry.action));
  const micro = actions.filter((entry) => entry.kind === 'micro');
  const signature = actions.filter((entry) => entry.kind === 'signature');
  const gaps = actions.slice(1).map((entry, index) => entry.elapsedMs - actions[index].elapsedMs);
  await writeFile(resolve(output, 'motion-metrics.json'), `${JSON.stringify({ actions, distinct: [...distinct], gaps }, null, 2)}\n`);
  assert.ok(distinct.size >= 8, `90s idle must show at least 8 distinct actions, got ${[...distinct].join(', ')}`);
  assert.ok(micro.length >= 8, `90s idle must include at least 8 micro actions, got ${micro.length}`);
  assert.ok(signature.length >= 2, `90s idle must include at least 2 signature actions, got ${signature.length}`);
  assert.ok(gaps.every((gap) => gap <= 8_500), `idle action gap exceeded 8.5s: ${gaps.join(', ')}`);
  assert.equal(duplicate, null, `consecutive actions must not repeat: ${JSON.stringify(duplicate)}`);
  assert.ok(new Set(actions.map((entry) => entry.joints)).size >= 8, 'classified actions must produce at least 8 distinct real mesh joint frames');
  const completedPatrol = [...patrolTracks.values()].find((track) => {
    if (track.length < 8) return false;
    const origin = track[0];
    const excursion = Math.max(...track.map((point) => Math.hypot(point.left - origin.left, point.top - origin.top)));
    const returned = Math.hypot(track.at(-1).left - origin.left, track.at(-1).top - origin.top);
    return excursion >= 30 && returned <= 6;
  });
  assert.ok(completedPatrol, `patrol must visibly leave and return to its dock: ${JSON.stringify([...patrolTracks.values()])}`);
  const visiblyMovingActions = new Set([...actionTracks.values()].filter(({ points }) => {
    if (points.length < 4) return false;
    const origin = points[0];
    return Math.max(...points.map((point) => Math.hypot(point.left - origin.left, point.top - origin.top))) >= 8;
  }).map(({ action }) => action));
  assert.ok(visiblyMovingActions.size >= 6,
    `at least six autonomous actions must move the whole silhouette >=8px, got ${JSON.stringify([...visiblyMovingActions])}`);

  const actor = page.locator('[data-hermes-companion-actor]');
  const inputOwner = page.locator('[data-hermes-input-owner="true"]');
  const interactiveRig = page.locator('[data-hermes-rig="mesh-2d"]');
  const beforeHover = await actor.boundingBox();
  const rigBounds = await interactiveRig.boundingBox();
  assert.ok(beforeHover, 'Hermes actor must expose a real product bounding box');
  assert.ok(rigBounds, 'Hermes rig must expose its real pointer hit area');
  await interactiveRig.hover({ position: { x: rigBounds.width - 2, y: 2 } });
  await page.waitForTimeout(220);
  const duringHover = await actor.boundingBox();
  assert.ok(duringHover && Math.hypot(duringHover.x - beforeHover.x, duringHover.y - beforeHover.y) >= 8,
    `pointer interaction must visibly move the whole actor: before=${JSON.stringify(beforeHover)} during=${JSON.stringify(duringHover)}`);
  await page.mouse.move(20, 20);
  await page.waitForTimeout(260);
  const pointerReset = await inputOwner.evaluate((node) => ({
    engaged: node.getAttribute('data-hermes-engaged'),
    x: node.style.getPropertyValue('--hermes-pointer-x'),
    y: node.style.getPropertyValue('--hermes-pointer-y'),
  }));
  assert.deepEqual(pointerReset, { engaged: 'false', x: '0px', y: '0px' },
    `pointer layer must reset while autonomous motion resumes: ${JSON.stringify(pointerReset)}`);
  await stage.screenshot({ path: resolve(output, 'idle-final.png'), animations: 'allow' });
} finally {
  await context.close();
  await browser.close();
}
