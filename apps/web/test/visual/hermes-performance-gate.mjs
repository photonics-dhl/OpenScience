/* global HTMLCanvasElement, URL, document, performance, process, window */

import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3194';
const percentile = (values, ratio) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
const page = await context.newPage();
const session = await context.newCDPSession(page);
await session.send('Network.enable');
await session.send('Network.setCacheDisabled', { cacheDisabled: true });
await page.addInitScript(() => {
  const metricsWindow = window;
  metricsWindow.__hermesDrawCount = 0;
  metricsWindow.__hermesDrawTimestamps = [];
  metricsWindow.__hermesJointSamples = [];
  metricsWindow.__hermesRendererRafDurations = [];
  const wrappedContexts = new WeakSet();
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(kind, ...args) {
    const context = originalGetContext.call(this, kind, ...args);
    if (kind === 'webgl2' && context && this.matches('[data-hermes-articulated-canvas]') && !wrappedContexts.has(context)) {
      wrappedContexts.add(context);
      for (const method of ['drawArrays', 'drawElements']) {
        const originalDraw = context[method].bind(context);
        context[method] = (...drawArgs) => {
          const result = originalDraw(...drawArgs);
          metricsWindow.__hermesDrawCount += 1;
          metricsWindow.__hermesDrawTimestamps.push(performance.now());
          return result;
        };
      }
    }
    return context;
  };
  const originalRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => originalRaf((now) => {
    const beforeDraws = metricsWindow.__hermesDrawCount;
    const started = performance.now();
    callback(now);
    if (metricsWindow.__hermesDrawCount > beforeDraws) {
      metricsWindow.__hermesRendererRafDurations.push(performance.now() - started);
      const canvas = document.querySelector('[data-hermes-articulated-canvas]');
      metricsWindow.__hermesJointSamples.push([
        canvas?.getAttribute('data-hermes-head') ?? '',
        canvas?.getAttribute('data-hermes-torso') ?? '',
        canvas?.getAttribute('data-hermes-tail') ?? '',
      ].join('|'));
    }
  });
});
await page.route('**/api/auth/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'perf-user', email: 'perf@example.invalid', displayName: 'Performance Researcher', status: 'email_verified', level: 'free' }) }));
await page.route('**/api/research-objects?limit=20', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjects: [] }) }));
await page.route('**/api/ingestion?actionable=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) }));

try {
  const navigationStartedAt = Date.now();
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="mesh-2d"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  const firstReadyMs = Date.now() - navigationStartedAt;
  assert.ok(firstReadyMs <= 2_500, `Hermes first ready must complete within 2500ms, got ${firstReadyMs}`);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const resource = entry;
    return {
      decodedBodySize: resource.decodedBodySize ?? 0,
      duration: resource.duration,
      encodedBodySize: resource.encodedBodySize ?? 0,
      initiatorType: resource.initiatorType,
      name: resource.name,
      transferSize: resource.transferSize ?? 0,
    };
  }));
  const scripts = resources.filter((entry) => entry.name.includes('/_next/static/') && entry.name.endsWith('.js'));
  const textures = resources.filter((entry) => entry.name.includes('/hermes/pet/hermes-pet-') && entry.name.endsWith('.png'));
  const transferred = resources.reduce((sum, entry) => sum + entry.transferSize, 0);
  const scriptEncoded = scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0);
  const textureEncoded = textures.reduce((sum, entry) => sum + entry.encodedBodySize, 0);
  assert.equal(new Set(textures.map((entry) => new URL(entry.name).pathname)).size, 3, `all three Hermes textures must be measured: ${JSON.stringify(textures)}`);
  assert.ok(scriptEncoded <= 300_000, `Dashboard client scripts must stay <=300KB encoded, got ${scriptEncoded}`);
  assert.ok(textureEncoded <= 1_600_000, `Hermes textures must stay <=1.6MB encoded, got ${textureEncoded}`);
  assert.ok(transferred <= 2_600_000, `cold Dashboard transfer must stay <=2.6MB, got ${transferred}`);

  const rig = page.locator('[data-hermes-rig="mesh-2d"]');
  const bounds = await rig.boundingBox();
  assert.ok(bounds, 'Hermes performance stage must have geometry');
  const measure = async (label, interactive) => {
    await page.evaluate(() => {
      window.__hermesDrawCount = 0;
      window.__hermesDrawTimestamps = [];
      window.__hermesJointSamples = [];
      window.__hermesRendererRafDurations = [];
    });
    if (interactive) {
      for (let index = 0; index < 72; index += 1) {
        const angle = index / 8;
        await page.mouse.move(
          bounds.x + bounds.width * (.5 + Math.cos(angle) * .34),
          bounds.y + bounds.height * (.5 + Math.sin(angle) * .30),
        );
        await page.waitForTimeout(100);
      }
    } else await page.waitForTimeout(7_500);
    const measured = await page.evaluate(() => ({
      cpu: window.__hermesRendererRafDurations.slice(),
      joints: window.__hermesJointSamples.slice(),
      timestamps: window.__hermesDrawTimestamps.slice(),
    }));
    const deltas = measured.timestamps.slice(1).map((timestamp, index) => timestamp - measured.timestamps[index]);
    const cpu = measured.cpu;
    const median = percentile(deltas, .5);
    const p95 = percentile(deltas, .95);
    const cpuP95 = percentile(cpu, .95);
    const drops = deltas.filter((delta) => delta > Math.max(40, median * 1.8)).length;
    const result = { cpuP95, draws: measured.timestamps.length, drops, frames: deltas.length, jointStates: new Set(measured.joints).size, label, median, p95 };
    assert.ok(result.draws >= 200, `${label} must sustain at least ~27fps, got ${result.draws} real Hermes draws`);
    assert.ok(result.jointStates >= 3, `${label} must render changing Hermes joints, got ${result.jointStates} states`);
    assert.ok(result.median <= 34, `${label} median frame interval must be <=34ms, got ${result.median}`);
    assert.ok(result.p95 <= 50, `${label} p95 frame interval must be <=50ms, got ${result.p95}`);
    assert.ok(result.cpuP95 <= 12, `${label} p95 RAF callback CPU must be <=12ms, got ${result.cpuP95}`);
    assert.ok(result.drops / result.frames <= .05, `${label} cadence drops must stay <=5%, got ${result.drops}/${result.frames}`);
    return result;
  };
  const idle = await measure('idle', false);
  const pointer = await measure('pointer', true);
  const gpu = await page.evaluate(() => {
    const canvas = document.querySelector('[data-hermes-articulated-canvas]');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'masked',
      vendor: gl && debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'masked',
    };
  });
  process.stdout.write(`${JSON.stringify({ firstReadyMs, gpu, idle, pointer, resources: { scriptEncoded, scriptFiles: scripts.length, textureEncoded, textureFiles: textures.length, transferred } }, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}
