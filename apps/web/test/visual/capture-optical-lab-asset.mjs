import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '../..');
const outDir = path.resolve(scriptDir, 'out', 'optical-lab');
const acceptedBaselinePath = path.resolve(
  scriptDir, 'fixtures', 'optical-lab-asset-accepted-1672x941.png',
);
const externalBaseUrl = process.env.OPTICAL_LAB_ASSET_BASE_URL?.replace(/\/$/, '');
const port = Number(process.env.OPTICAL_LAB_ASSET_PORT ?? 3063);
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const assetRoute = `${baseUrl}/_visual/optical-lab?candidate=asset`;
const reducedMotion = process.env.OPTICAL_LAB_ASSET_REDUCED_MOTION === '1';
const nextCli = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

async function assertPortIsAvailable() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      reject(new Error(`Optical Lab asset capture refuses pre-existing listener on ${port}: ${error.message}`));
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

function waitForExit(server) {
  return new Promise((resolve) => server.once('exit', resolve));
}

function timeout(label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after 3000ms`)), 3_000);
  });
}

let browser;
let server;
let serverExit;
let logs = '';
let primaryError;

function assertServerOwnedAndAlive() {
  assert(server, 'Asset capture did not spawn its browser server');
  assert.equal(serverExit, undefined, `Asset capture server exited prematurely: ${JSON.stringify(serverExit)}`);
  assert.equal(server.exitCode, null, 'Asset capture server exited before browser assertions completed');
}

async function stopServerAndVerifyPort() {
  if (!server) return;
  if (serverExit === undefined) {
    const exited = waitForExit(server);
    if (server.exitCode === null) server.kill('SIGTERM');
    await Promise.race([exited, timeout('Asset capture server cleanup')]);
  }
  if (serverExit === undefined) throw new Error('Asset capture server did not record an exit during cleanup');
  await assertPortIsAvailable();
}

async function closeBrowserBounded() {
  if (!browser) return;
  await Promise.race([browser.close(), timeout('Asset capture browser close')]);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    assertServerOwnedAndAlive();
    try {
      if ((await fetch(assetRoute)).ok) {
        assertServerOwnedAndAlive();
        return;
      }
    } catch {
      // The owned development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Asset candidate browser server did not start.\n${logs.slice(-4_000)}`);
}

async function assertExternalAssetRoute() {
  const response = await fetch(assetRoute);
  assert.equal(response.ok, true, `External asset capture health check failed: ${response.status}`);
  const markup = await response.text();
  assert(markup.includes('data-optical-lab-asset-only="true"'));
  assert.equal(markup.match(/data-optical-lab-panel=/g)?.length ?? 0, 1);
}

async function prepareNativeCandidate(page) {
  await page.evaluate(() => {
    Object.assign(document.documentElement.style, { height: '941px', width: '1672px' });
    Object.assign(document.body.style, { height: '941px', margin: '0', width: '1672px' });
    const main = document.querySelector('[data-optical-lab="true"]');
    const header = main?.querySelector('header');
    const comparison = main?.querySelector('section');
    const panel = main?.querySelector('[data-optical-lab-panel="candidate"]');
    const candidate = main?.querySelector('[data-asset-candidate="true"]');
    const diagnostics = panel?.querySelector('[data-optical-lab-diagnostics="true"]');
    Object.assign(main.style, { height: '941px', minHeight: '941px', padding: '0', width: '1672px' });
    if (header) header.style.display = 'none';
    Object.assign(comparison.style, { border: '0', display: 'block', height: '941px', margin: '0', width: '1672px' });
    Object.assign(panel.style, { height: '941px', padding: '0', width: '1672px' });
    if (diagnostics) diagnostics.style.display = 'none';
    Object.assign(candidate.style, { aspectRatio: 'auto', height: '941px', width: '1672px' });
  });
}

try {
  await mkdir(outDir, { recursive: true });
  if (externalBaseUrl) {
    await assertExternalAssetRoute();
  } else {
    await assertPortIsAvailable();
    server = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
      cwd: webRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.once('exit', (code, signal) => { serverExit = { code, signal }; });
    server.stdout.on('data', (chunk) => { logs += chunk.toString(); });
    server.stderr.on('data', (chunk) => { logs += chunk.toString(); });
    await waitForServer();
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  try {
    if (!externalBaseUrl) assertServerOwnedAndAlive();
    if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(assetRoute, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.locator('[data-optical-lab-asset-plate="true"]').evaluate((image) => {
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
        throw new Error('Asset plate failed to load');
      }
    });
    await page.locator('[data-optical-lab-target-typography-plate="true"]').evaluate((image) => {
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth !== 1672 || image.naturalHeight !== 941) {
        throw new Error('Target typography plate failed to load at its native size');
      }
    });
    assert.equal(await page.locator('[data-asset-candidate="true"]').count(), 1);
    assert.equal(await page.locator('[data-optical-lab-client-slot="true"]').count(), 0);
    assert.equal(await page.locator('canvas[data-optical-lab-canvas="true"]').count(), 0);
    const seamClip = await page.locator('[data-optical-lab-science="true"]').evaluate((science) => ({
      overflowX: getComputedStyle(science).overflowX,
      scienceRight: science.getBoundingClientRect().right,
      inkRight: science.firstElementChild?.getBoundingClientRect().right ?? 0,
    }));
    assert(seamClip.inkRight > seamClip.scienceRight, 'The Science ink must reach the optical seam before clipping');
    assert.equal(seamClip.overflowX, 'visible', 'Asset mode must preserve the complete Science glyph instead of hard-clipping its final e');
    const semanticTitle = page.locator('[data-optical-lab-semantic-title="true"]');
    assert.equal(await semanticTitle.evaluate((title) => getComputedStyle(title).color), 'rgba(0, 0, 0, 0)');
    assert.equal(
      await page.locator('[data-optical-lab-evolves-ink="true"]').evaluate((ink) => getComputedStyle(ink).webkitTextStrokeWidth),
      '0px',
      'Asset mode must suppress the legacy DOM stroke so it cannot ghost over the coupled typography plate',
    );
    assert.equal(await semanticTitle.evaluate((title) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(title);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const text = selection?.toString() ?? '';
      selection?.removeAllRanges();
      return text;
    }), 'Science evolves.');
    await prepareNativeCandidate(page);
    const candidate = page.locator('[data-asset-candidate="true"]');
    const box = await candidate.boundingBox();
    assert.deepEqual(
      box && { height: Math.round(box.height), width: Math.round(box.width) },
      { height: 941, width: 1672 },
    );
    const screenshot = await page.screenshot({
      clip: box,
      path: path.join(outDir, reducedMotion
        ? 'asset-candidate-reduced-motion-1672x941.png'
        : 'asset-candidate-1672x941.png'),
    });
    if (reducedMotion) {
      assert.equal(await page.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(), 0);
      assert.equal(await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf), false);
      assert.deepEqual(
        screenshot,
        await readFile(acceptedBaselinePath),
        'Reduced motion must expose the accepted static candidate pixel-for-pixel',
      );
    }
  } finally {
    await page.close();
  }
} catch (error) {
  primaryError = error;
}

let cleanupError;
try {
  await closeBrowserBounded();
} catch (error) {
  cleanupError = error;
}
try {
  await stopServerAndVerifyPort();
} catch (error) {
  cleanupError ??= error;
}
if (primaryError && cleanupError) primaryError.cleanupError = cleanupError;
if (primaryError) throw primaryError;
if (cleanupError) throw cleanupError;
