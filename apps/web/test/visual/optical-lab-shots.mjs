/* global document, HTMLCanvasElement, process, setTimeout, window */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(scriptDir, 'out', 'optical-lab');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const measurements = [];
const cases = [
  { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { name: 'webgl1-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'webgl1' },
  { name: 'shader-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'shader-failure' },
  { name: 'dom-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'none' },
  { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
  { name: 'reduced', width: 1440, height: 900, reducedMotion: 'reduce' },
];

for (const testCase of cases) {
  const page = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
    deviceScaleFactor: 1,
    reducedMotion: testCase.reducedMotion,
  });
  const errors = [];
  if (testCase.forceContext) {
    await page.addInitScript((forceContext) => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...options) {
        if (type === 'webgl2') return null;
        if (forceContext === 'none' && (type === 'webgl' || type === 'experimental-webgl')) return null;
        const context = original.call(this, type, ...options);
        if (forceContext === 'shader-failure' && context && (type === 'webgl' || type === 'experimental-webgl')) {
          const originalGetShaderParameter = context.getShaderParameter.bind(context);
          context.getShaderParameter = (shader, parameter) => (
            parameter === context.COMPILE_STATUS ? false : originalGetShaderParameter(shader, parameter)
          );
          context.getShaderInfoLog = () => 'forced Optical Lab shader failure';
        }
        return context;
      };
    }, testCase.forceContext);
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto(`${baseUrl}/_visual/optical-lab`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, 'Optical Lab route must exist');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  assert.equal(await page.locator('[data-optical-lab-panel]').count(), 3, 'Lab must show three comparison panels');
  assert.equal(await page.locator('h1[data-optical-lab-semantic-title="true"]').count(), 1, 'candidate must keep one semantic h1');
  assert.equal(await page.locator('[data-optical-lab-forbidden]').count(), 0, 'candidate must not render forbidden overlay primitives');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Lab must not overflow horizontally');

  const diagnostics = page.locator('[data-optical-lab-diagnostics="true"]');
  await diagnostics.waitFor({ state: 'visible' });
  const mode = await diagnostics.getAttribute('data-render-mode');
  const contextStatus = await diagnostics.getAttribute('data-context-status');
  if (
    testCase.reducedMotion === 'reduce'
    || testCase.width <= 480
    || testCase.forceContext === 'none'
    || testCase.forceContext === 'shader-failure'
  ) {
    assert.equal(mode, 'dom-static', `${testCase.name} must use the stable DOM/static fallback`);
    assert.equal(await page.locator('canvas[data-optical-lab-canvas="true"]').count(), 0, `${testCase.name} must not start a GPU loop`);
  } else {
    if (testCase.forceContext === 'webgl1') assert.equal(mode, 'webgl1', 'half-float-capable fallback must use WebGL1');
    else assert.match(mode ?? '', /^webgl[12]$/, 'desktop must choose a viable WebGL path');
    assert.equal(contextStatus, 'ready', 'desktop context must become ready');
    assert.equal(
      await page.locator('h1[data-optical-lab-semantic-title="true"]').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      true,
      'continuous candidate headline must remain inside its stable DOM bounds',
    );
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
      return Number(node?.getAttribute('data-frame-count') ?? 0) >= 12;
    }, undefined, { timeout: 5_000 });

    const stage = page.locator('[data-optical-lab-candidate-stage="true"]');
    assert(
      Number(await diagnostics.getAttribute('data-particle-count')) > 0,
      'desktop must expose a non-empty sparse glyph-edge particle buffer',
    );
    assert.match(
      await diagnostics.getAttribute('data-flow-texture') ?? '',
      /ping-pong/,
      'desktop must expose the dissipating ping-pong flow texture',
    );
    const initialBounds = await stage.boundingBox();
    assert(initialBounds, 'candidate stage must have measurable bounds');
    const y = initialBounds.y + initialBounds.height * 0.52;
    for (const [position, factor] of [['left', 0.22], ['slit', 0.58], ['right', 0.82]]) {
      await page.mouse.move(initialBounds.x + 8, initialBounds.y + 8);
      await page.waitForTimeout(700);
      await page.mouse.move(initialBounds.x + initialBounds.width * factor, y);
      await page.waitForTimeout(150);
      const current = await diagnostics.evaluate((node) => ({
        apertureX: Number(node.getAttribute('data-aperture-x')),
        mode: node.getAttribute('data-render-mode'),
      }));
      assert(Math.abs(current.apertureX - 0.58) < 0.0001, `${position} frame must retain the fixed slit`);
      assert.equal(current.mode, mode, `${position} frame must not change renderer mode`);
      await page.screenshot({ path: path.join(outDir, `desktop-${position}-150ms.png`) });
    }
    const finalBounds = await stage.boundingBox();
    assert(finalBounds, 'candidate stage bounds must remain available');
    assert(Math.abs(finalBounds.x - initialBounds.x) < 1, 'pointer frames must not shift candidate x bounds');
    assert(Math.abs(finalBounds.y - initialBounds.y) < 1, 'pointer frames must not shift candidate y bounds');
    assert(Math.abs(finalBounds.width - initialBounds.width) < 1, 'pointer frames must not resize candidate width');
    assert(Math.abs(finalBounds.height - initialBounds.height) < 1, 'pointer frames must not resize candidate height');

    const recovery = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      if (!(canvas instanceof HTMLCanvasElement)) return { tested: false };
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const lose = gl?.getExtension('WEBGL_lose_context');
      if (!lose) return { tested: false };
      lose.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const lost = document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status');
      lose.restoreContext();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const restored = document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status');
      return { tested: true, lost, restored };
    });
    if (recovery.tested) {
      assert.equal(recovery.lost, 'lost', 'context loss must expose a DOM fallback state');
      assert.equal(recovery.restored, 'ready', 'context restoration must reinitialize the renderer');
    }
    await page.waitForFunction(() => {
      const value = document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-gpu-frame-ms');
      return value !== null && value !== 'unavailable' && Number(value) >= 0;
    }, undefined, { timeout: 3_000 });
  }

  const snapshot = await diagnostics.evaluate((node) => ({
    apertureX: Number(node.getAttribute('data-aperture-x')),
    bounds: node.getAttribute('data-stable-bounds'),
    contextStatus: node.getAttribute('data-context-status'),
    cpuFrameMs: Number(node.getAttribute('data-cpu-frame-ms')),
    fps: Number(node.getAttribute('data-fps')),
    frameCount: Number(node.getAttribute('data-frame-count')),
    gpuFrameMs: node.getAttribute('data-gpu-frame-ms'),
    gpuTiming: node.getAttribute('data-gpu-timing'),
    mode: node.getAttribute('data-render-mode'),
    renderer: node.getAttribute('data-renderer'),
  }));
  assert.equal(snapshot.apertureX, 0.58, 'all modes must declare the same fixed aperture');
  assert.notEqual(snapshot.bounds, 'pending', 'all modes must expose stable measured bounds');
  measurements.push({ case: testCase.name, ...snapshot });
  await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
  assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
  await page.close();
}

const cleanupPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await cleanupPage.goto(`${baseUrl}/_visual/optical-lab`, { waitUntil: 'networkidle' });
await cleanupPage.locator('[data-optical-lab-exit="true"]').click();
await cleanupPage.waitForURL(`${baseUrl}/`);
const cleanup = await cleanupPage.evaluate(() => window.__OPENSCIENCE_OPTICAL_LAB__ ?? null);
assert.equal(cleanup?.activeRaf, false, 'renderer RAF must stop after route unmount');
assert.equal(cleanup?.contextStatus, 'disposed', 'renderer resources must be disposed after route unmount');
assert.equal(await cleanupPage.locator('[data-optical-lab-canvas="true"]').count(), 0, 'production homepage must not import the Lab renderer');
await cleanupPage.close();

await writeFile(path.join(outDir, 'metrics.json'), `${JSON.stringify(measurements, null, 2)}\n`, 'utf8');
await browser.close();
