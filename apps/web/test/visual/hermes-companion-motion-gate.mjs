/* global document, process */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
await page.route('**/api/agent/tasks**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) }));

try {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
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
      const actor = document.querySelector('[data-hermes-companion-actor]');
      const actorBounds = actor?.getBoundingClientRect();
      return {
        action: stageNode?.getAttribute('data-hermes-action') ?? '',
        actor: actorBounds ? { left: actorBounds.left, top: actorBounds.top } : null,
        kind: stageNode?.getAttribute('data-hermes-action-kind') ?? '',
        startedAt: stageNode?.getAttribute('data-hermes-action-started-at') ?? '',
        frame: '',
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
      const frame = await page.locator('[data-hermes-articulated-canvas]').screenshot({ animations: 'allow' });
      sample.frame = createHash('sha256').update(frame).digest('hex');
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
  assert.ok(new Set(actions.map((entry) => entry.frame)).size >= 8, 'classified actions must produce at least 8 distinct real Live2D canvas frames');
  assert.equal(patrolTracks.size, 0, 'anchored Dashboard Hermes must not patrol across the research surface');
  const visiblyMovingActions = new Set([...actionTracks.values()].filter(({ points }) => {
    if (points.length < 4) return false;
    const origin = points[0];
    return Math.max(...points.map((point) => Math.hypot(point.left - origin.left, point.top - origin.top))) >= 8;
  }).map(({ action }) => action));
  assert.deepEqual([...visiblyMovingActions], [],
    `anchored actions must articulate inside the reserved margin without moving the enclosing silhouette: ${JSON.stringify([...visiblyMovingActions])}`);

  const actor = page.locator('[data-hermes-companion-actor]');
  const inputOwner = page.locator('[data-hermes-input-owner="true"]');
  const interactiveRig = page.locator('[data-hermes-carrier-interaction-hull="true"]');
  await page.addStyleTag({ content: '.hermes-companion-actor{animation:none!important}' });
  await page.waitForTimeout(220);
  const beforeHover = await actor.boundingBox();
  const beforeHoverFrame = await page.locator('[data-hermes-articulated-canvas]').screenshot({ animations: 'allow' });
  const rigBounds = await interactiveRig.boundingBox();
  assert.ok(beforeHover, 'Hermes actor must expose a real product bounding box');
  assert.ok(rigBounds && rigBounds.width >= 44 && rigBounds.height >= 44, 'Hermes carrier must expose a 44px minimum cockpit hit area');
  const cockpitSample = {
    x: rigBounds.x + rigBounds.width * .8,
    y: rigBounds.y + rigBounds.height * .2,
  };
  const cockpitHit = await page.evaluate(({ x, y }) => {
    const hull = document.querySelector('[data-hermes-carrier-interaction-hull="true"]');
    const target = document.elementFromPoint(x, y);
    return {
      inside: Boolean(hull && target && (target === hull || hull.contains(target))),
      target: target?.getAttribute('data-hermes-carrier-interaction-hull')
        ?? target?.getAttribute('data-hermes-live2d-canvas')
        ?? target?.tagName
        ?? null,
    };
  }, cockpitSample);
  assert.ok(cockpitHit.inside,
    `cockpit pointer sample must hit the interaction hull or its descendant: ${JSON.stringify({ cockpitHit, cockpitSample, rigBounds })}`);
  await page.mouse.move(cockpitSample.x, cockpitSample.y);
  await page.waitForTimeout(220);
  const duringHover = await actor.boundingBox();
  const duringHoverFrame = await page.locator('[data-hermes-articulated-canvas]').screenshot({ animations: 'allow' });
  assert.ok(duringHover && Math.hypot(duringHover.x - beforeHover.x, duringHover.y - beforeHover.y) <= 2,
    `pointer interaction must articulate internal joints without dragging the whole actor: before=${JSON.stringify(beforeHover)} during=${JSON.stringify(duringHover)}`);
  assert.notEqual(
    createHash('sha256').update(duringHoverFrame).digest('hex'),
    createHash('sha256').update(beforeHoverFrame).digest('hex'),
    'pointer interaction must change real Live2D canvas pixels',
  );
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
