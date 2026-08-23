/* global Image, document, getComputedStyle, process */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3198';
const output = resolve('test/visual/out/hermes-live2d');
const actions = [
  'blink-single', 'blink-double', 'observe-left', 'observe-right', 'evidence-check', 'page-tidy',
  'citation-trace', 'stretch', 'doze', 'wake', 'surprise-settle', 'patrol', 'return-dock',
  'pointer-approach', 'pointer-avoid', 'drag', 'guide-travel', 'guide-arrive', 'quiet-write',
  'read', 'compare', 'draft', 'possible-issue', 'success', 'milestone-dance', 'failed-settle',
  'cap-check', 'ear-perk', 'lamp-listen', 'happy-wiggle', 'thinking-pause',
];

await mkdir(output, { recursive: true });

async function comparePng(page, first, second) {
  return page.evaluate(async ({ firstBase64, secondBase64 }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await decode(firstBase64);
    const b = await decode(secondBase64);
    let changed = 0;
    let maximum = 0;
    for (let index = 0; index < a.length; index += 4) {
      const delta = Math.max(
        Math.abs(a[index] - b[index]),
        Math.abs(a[index + 1] - b[index + 1]),
        Math.abs(a[index + 2] - b[index + 2]),
        Math.abs(a[index + 3] - b[index + 3]),
      );
      if (delta >= 6) changed += 1;
      maximum = Math.max(maximum, delta);
    }
    return { changed, maximum };
  }, { firstBase64: first.toString('base64'), secondBase64: second.toString('base64') });
}

async function alphaBounds(page, image) {
  return page.evaluate(async (base64) => {
    const decoded = new Image();
    decoded.src = `data:image/png;base64,${base64}`;
    await decoded.decode();
    const canvas = document.createElement('canvas');
    canvas.width = decoded.naturalWidth;
    canvas.height = decoded.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(decoded, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let bottom = -1;
    let count = 0;
    let left = canvas.width;
    let right = -1;
    let top = canvas.height;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] <= 8) continue;
      const x = (index / 4) % canvas.width;
      const y = Math.floor((index / 4) / canvas.width);
      count += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    return count === 0 ? { bottom: -1, count: 0, height: 0, left: -1, right: -1, top: -1, width: 0 } : {
      bottom,
      count,
      height: bottom - top + 1,
      left,
      right,
      top,
      width: right - left + 1,
    };
  }, image.toString('base64'));
}

function transformAngle(transform) {
  if (!transform || transform === 'none') return 0;
  const values = transform.match(/^matrix\(([^)]+)\)$/u)?.[1].split(',').map(Number);
  return values ? Math.atan2(values[1], values[0]) * 180 / Math.PI : 0;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    const location = message.location();
    browserErrors.push(`${message.text()} @ ${location.url}:${location.lineNumber}:${location.columnNumber}`);
  }
});

try {
  await page.goto(`${baseUrl}/_visual/hermes-live2d`, { waitUntil: 'domcontentloaded' });
  const taskSurface = page.locator('[data-hermes-ro-create-fixture="true"]');
  const developerTray = page.locator('[data-hermes-dev-tray="true"]');
  assert.equal(await taskSurface.count(), 1, 'the preview must be a real RO-create task surface, not an action gallery');
  assert.equal(await developerTray.count(), 1, 'exhaustive controls must live in a developer tray');
  assert.equal(await developerTray.getAttribute('open'), null, 'the developer tray must be collapsed by default');
  await developerTray.evaluate((element) => { element.open = true; });
  const rig = page.locator('[data-hermes-rig="live2d-wanko"]');
  const fixture = page.locator('[data-hermes-live2d-fixture]');
  await rig.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  assert.equal(await page.locator('[data-hermes-live2d-canvas="true"]').count(), 1);
  assert.equal(await fixture.getAttribute('data-hermes-stage-size'), '200');
  assert.equal(await page.locator('[data-hermes-performance-bubble]').count(), 1);
  const primaryCreateBox = await page.locator('[data-hermes-primary-create]').boundingBox();
  const ordinaryFixtureBox = await fixture.boundingBox();
  assert.ok(primaryCreateBox && ordinaryFixtureBox, 'task action and ordinary assistant must both have geometry');
  const ordinaryOverlapsPrimary = ordinaryFixtureBox.left < primaryCreateBox.x + primaryCreateBox.width
    && ordinaryFixtureBox.right > primaryCreateBox.x
    && ordinaryFixtureBox.top < primaryCreateBox.y + primaryCreateBox.height
    && ordinaryFixtureBox.bottom > primaryCreateBox.y;
  assert.equal(ordinaryOverlapsPrimary, false, 'ordinary Hermes must not cover the primary RO-create action');

  const carrier = rig.locator('[data-hermes-carrier="true"]');
  const travelHull = rig.locator('[data-hermes-carrier-travel-hull="true"]');
  assert.equal(await carrier.count(), 1, 'the harness must render one native Live2D scene');
  assert.equal(await rig.locator('img,picture,[data-hermes-carrier-required-asset]').count(), 0);
  assert.equal(await rig.locator('[data-hermes-carrier-rear],[data-hermes-carrier-front],[data-hermes-carrier-glow],[data-hermes-carrier-effects]').count(), 0);
  assert.equal(await travelHull.count(), 1);
  assert.equal(await page.locator('[data-hermes-layer-control]').count(), 5);

  const metrics = [];
  let previous = await fixture.screenshot({ animations: 'allow' });
  for (const action of actions) {
    await page.locator(`[data-hermes-action-control="${action}"]`).click({ force: true });
    await page.waitForTimeout(520);
    const frame = await fixture.screenshot({ animations: 'allow' });
    await writeFile(resolve(output, `action-${action}.png`), frame);
    const response = await comparePng(page, previous, frame);
    const presentation = await rig.getAttribute('data-hermes-wanko-presentation');
    metrics.push({ action, hash: createHash('sha256').update(frame).digest('hex'), presentation, response });
    assert.ok(response.changed >= 180, `${action} must visibly change the rendered fixture, got ${JSON.stringify(response)}`);
    previous = frame;
  }

  assert.ok(new Set(metrics.map(({ hash }) => hash)).size >= 26, 'production actions must expose at least 26 distinguishable real frames');
  assert.deepEqual(new Set(metrics.map(({ presentation }) => presentation)), new Set(['quiet', 'evidence', 'trail', 'celebrate', 'missing']));

  await page.locator('[data-hermes-action-control="cap-check"]').click({ force: true });
  await page.waitForTimeout(260);
  const performanceBubble = page.locator('[data-hermes-performance-bubble]');
  assert.equal(await performanceBubble.getAttribute('data-hermes-speech-visible'), 'true');
  assert.match(await performanceBubble.getAttribute('data-hermes-performance-beat'), /^cap-check:/u);
  const bubbleMaterial = await performanceBubble.evaluate((node) => {
    const style = getComputedStyle(node);
    const dismiss = node.querySelector('.hermes-companion-dismiss');
    const dismissBox = dismiss?.getBoundingClientRect();
    return {
      backdropFilter: style.backdropFilter,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      dismissHeight: dismissBox?.height ?? 0,
      dismissWidth: dismissBox?.width ?? 0,
      maxWidth: style.maxWidth,
      shadow: style.boxShadow,
    };
  });
  assert.deepEqual(bubbleMaterial, {
    backdropFilter: 'none',
    backgroundImage: 'none',
    borderRadius: '4px',
    dismissHeight: 40,
    dismissWidth: 40,
    maxWidth: '248px',
    shadow: 'rgba(0, 0, 0, 0.18) 0px 8px 20px 0px',
  });
  await developerTray.evaluate((element) => { element.open = false; });
  await page.screenshot({ path: resolve(output, 'bubble-cap-check-desktop.png'), fullPage: true, animations: 'disabled' });
  await performanceBubble.getByRole('button').click({ force: true });
  assert.equal(await performanceBubble.getAttribute('data-hermes-speech-visible'), 'false');
  await developerTray.evaluate((element) => { element.open = true; });

  await page.locator('[data-hermes-action-control="read"]').click({ force: true });
  await page.waitForTimeout(420);
  const pointerBefore = await fixture.screenshot({ animations: 'allow' });
  await page.locator('[data-hermes-pointer-control="engage"]').click();
  await page.waitForTimeout(420);
  const pointerAfter = await fixture.screenshot({ animations: 'allow' });
  const pointerResponse = await comparePng(page, pointerBefore, pointerAfter);
  assert.ok(pointerResponse.changed >= 650, `pointer must visibly articulate Wanko: ${JSON.stringify(pointerResponse)}`);

  const layerIsolationStyle = await page.addStyleTag({ content: 'html,body,main,[data-hermes-live2d-fixture],.hermes-workspace-stage .hermes-visual{background:transparent!important;border-color:transparent!important}[data-hermes-ro-create-fixture]>:not([data-hermes-live2d-fixture]){visibility:hidden!important}' });
  const layerMetrics = {};
  for (const variant of ['desktop', 'mobile']) {
    await page.setViewportSize(variant === 'desktop' ? { height: 900, width: 1440 } : { height: 844, width: 390 });
    await page.locator(`[data-hermes-poster-size="${variant}"]`).evaluate((button) => button.click());
    await page.locator('[data-hermes-poster-control="normal"]').evaluate((button) => button.click());
    await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
    const bounds = {};
    for (const layer of ['all', 'wanko']) {
      await page.locator(`[data-hermes-layer-control="${layer}"]`).evaluate((button) => button.click());
      await page.waitForTimeout(80);
      const frame = await carrier.screenshot({ animations: 'disabled', omitBackground: true });
      bounds[layer] = await alphaBounds(page, frame);
      await writeFile(resolve(output, `${variant}-${layer}.png`), frame);
    }
    assert.ok(bounds.wanko.width > 0 && bounds.wanko.height > 0, `${variant} Wanko layer must be non-empty`);
    assert.equal(await fixture.getAttribute('data-hermes-stage-size'), variant === 'desktop' ? '360' : '200');
    const fixtureBox = await fixture.boundingBox();
    assert.equal(fixtureBox?.width, variant === 'desktop' ? 360 : 200, `${variant} stage must render at the declared width`);
    assert.equal(fixtureBox?.height, variant === 'desktop' ? 360 : 200, `${variant} stage must render at the declared height`);
    assert.ok(bounds.all.width / bounds.wanko.width <= 1.02, `${variant} native scene must not expand through external art: ${JSON.stringify(bounds)}`);
    const travelBounds = await travelHull.evaluate((node) => ({
      bottom: node.offsetTop + node.offsetHeight,
      left: node.offsetLeft,
      right: node.offsetLeft + node.offsetWidth,
      top: node.offsetTop,
    }));
    assert.ok(bounds.all.left >= travelBounds.left - 1, `${variant} travel hull misses native scene left edge: ${JSON.stringify({ bounds, travelBounds })}`);
    assert.ok(bounds.all.right <= travelBounds.right + 1, `${variant} travel hull misses native scene right edge: ${JSON.stringify({ bounds, travelBounds })}`);
    assert.ok(bounds.all.top >= travelBounds.top - 1, `${variant} travel hull misses native scene top edge: ${JSON.stringify({ bounds, travelBounds })}`);
    assert.ok(bounds.all.bottom <= travelBounds.bottom + 1, `${variant} travel hull misses native scene bottom edge: ${JSON.stringify({ bounds, travelBounds })}`);
    layerMetrics[variant] = bounds;
  }
  await layerIsolationStyle.evaluate((node) => node.remove());
  await page.setViewportSize({ height: 844, width: 390 });
  await page.locator('[data-hermes-poster-size="mobile"]').click();
  await page.locator('[data-hermes-action-control="happy-wiggle"]').click({ force: true });
  await page.waitForTimeout(260);
  const mobileBubbleBox = await page.locator('[data-hermes-performance-bubble]').boundingBox();
  assert.ok(mobileBubbleBox && mobileBubbleBox.x >= 0, `mobile performance bubble must not clip left: ${JSON.stringify(mobileBubbleBox)}`);
  assert.ok(mobileBubbleBox.x + mobileBubbleBox.width <= 390, `mobile performance bubble must not clip right: ${JSON.stringify(mobileBubbleBox)}`);
  const mobileBubbleContract = await page.locator('[data-hermes-performance-bubble]').evaluate((node) => {
    const paragraph = node.querySelector('p');
    const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
    const paragraphBox = paragraph?.getBoundingClientRect();
    const visibleToolbar = Array.from(node.querySelectorAll('.hermes-companion-actions, .hermes-companion-take-me'))
      .filter((element) => getComputedStyle(element).display !== 'none').length;
    return {
      lineCount: paragraphBox && paragraphStyle ? Math.ceil(paragraphBox.height / Number.parseFloat(paragraphStyle.lineHeight)) : 0,
      paragraphCount: node.querySelectorAll('p').length,
      visibleToolbar,
    };
  });
  assert.equal(mobileBubbleContract.paragraphCount, 1, 'mobile speech must remain one sentence');
  assert.ok(mobileBubbleContract.lineCount <= 2, `mobile speech must remain at most two short lines: ${JSON.stringify(mobileBubbleContract)}`);
  assert.equal(mobileBubbleContract.visibleToolbar, 0, 'mobile speech must not expose an action toolbar');
  await developerTray.evaluate((element) => { element.open = false; });
  await page.screenshot({ path: resolve(output, 'bubble-happy-wiggle-mobile.png'), fullPage: true, animations: 'disabled' });
  await developerTray.evaluate((element) => { element.open = true; });

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.locator('[data-hermes-poster-size="desktop"]').click();
  await page.waitForTimeout(360);
  await page.locator('[data-hermes-layer-control="all"]').click();
  await page.locator('[data-hermes-action-control="observe-left"]').click({ force: true });
  await page.waitForTimeout(200);
  const idleStart = await carrier.boundingBox();
  await page.waitForTimeout(3100);
  const idleEnd = await carrier.boundingBox();
  assert.ok(idleStart && idleEnd && Math.abs(idleEnd.y - idleStart.y) <= 2.1, `idle carrier hover must stay within 2px: ${JSON.stringify({ idleStart, idleEnd })}`);
  const travelHullBefore = await travelHull.evaluate((node) => ({ height: node.offsetHeight, left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth }));
  await page.locator('[data-hermes-action-control="success"]').click({ force: true });
  await page.waitForTimeout(300);
  const travelHullAfter = await travelHull.evaluate((node) => ({ height: node.offsetHeight, left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth }));
  assert.deepEqual(travelHullAfter, travelHullBefore, 'effects must not resize the collision hull');
  await page.locator('[data-hermes-action-control="guide-travel"]').click({ force: true });
  await page.waitForTimeout(300);
  const travelTransform = await carrier.evaluate((node) => getComputedStyle(node).transform);
  assert.ok(Math.abs(transformAngle(travelTransform)) <= 3.05, `travel bank must stay within 3 degrees, got ${travelTransform}`);

  const staticMetrics = {};
  for (const posterState of ['approval', 'reduced']) {
    await page.locator(`[data-hermes-poster-control="${posterState}"]`).click();
    await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-static-frame') === 'true');
    await page.waitForTimeout(120);
    await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
    await page.waitForTimeout(520);
    assert.equal(await page.locator('.hermes-rig-canvas').evaluate((node) => getComputedStyle(node).opacity), '1');
    const first = await fixture.screenshot({ animations: 'allow' });
    const staticBounds = await alphaBounds(page, first);
    assert.ok(staticBounds.count > 2_000, `${posterState} must preserve a non-empty static Wanko frame: ${JSON.stringify(staticBounds)}`);
    await page.waitForTimeout(1200);
    const second = await fixture.screenshot({ animations: 'allow' });
    staticMetrics[posterState] = await comparePng(page, first, second);
    assert.deepEqual(staticMetrics[posterState], { changed: 0, maximum: 0 }, `${posterState} must be exactly static`);
  }

  await writeFile(resolve(output, 'motion-metrics.json'), `${JSON.stringify({ layerMetrics, metrics, pointerResponse, staticMetrics }, null, 2)}\n`);
  await writeFile(resolve(output, 'wanko-motion-final.png'), previous);
  assert.deepEqual(browserErrors, []);
} finally {
  await context.close();
  await browser.close();
}
