/* global document, fetch, getComputedStyle, process, setTimeout, window */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { measureTypography } from './optical-lab-reference-metrics.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '../..');
const outDir = path.resolve(scriptDir, 'out', 'optical-lab');
const port = Number(process.env.OPTICAL_LAB_PORT ?? 3064);
const serverMode = process.env.OPTICAL_LAB_SERVER_MODE === 'start' ? 'start' : 'dev';
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const candidates = ['bricolage', 'archivo', 'arial-black-reference'];
const server = spawn(process.execPath, [nextCli, serverMode, '-p', String(port)], {
  cwd: webRoot,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk.toString(); });
server.stderr.on('data', (chunk) => { logs += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/_visual/optical-lab/type-specimen`);
      if (response.ok) return;
    } catch {
      // The server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Optical Lab typography server did not start.\n${logs.slice(-4_000)}`);
}

function assertTypographyContract(candidate, measured, selection) {
  assert.equal(measured.oneLine, true, `${candidate} must retain one title line`);
  assert(Math.abs(measured.apertureX - .58) <= .005, `${candidate} must keep the 58% aperture`);
  assert(measured.title.left >= .017 && measured.title.left <= .027, `${candidate} title left bound drifted`);
  assert(measured.title.right >= .952 && measured.title.right <= .962, `${candidate} title right bound drifted`);
  assert(measured.title.top >= .348 && measured.title.top <= .368, `${candidate} title top bound drifted`);
  assert(measured.title.bottom >= .59 && measured.title.bottom <= .61, `${candidate} title bottom bound drifted`);
  assert(Math.abs(measured.science.width - .558) <= .005, `${candidate} Science allocation drifted`);
  assert(Math.abs(measured.evolves.width - .377) <= .005, `${candidate} evolves allocation drifted`);
  assert(Math.abs(measured.baseline - .542) <= .005, `${candidate} baseline drifted`);
  assert.equal(selection, 'Science evolves.', `${candidate} must preserve exact text selection`);
}

try {
  await mkdir(outDir, { recursive: true });
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const metrics = [];

  for (const candidate of candidates) {
    const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/_visual/optical-lab/type-specimen?candidate=${candidate}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const specimen = page.locator('[data-optical-specimen="true"]');
    const title = page.locator('h1[data-optical-selectable="true"]');
    const science = page.locator('[data-optical-science="true"]');
    const evolves = page.locator('[data-optical-evolves="true"]');
    const baseline = page.locator('[data-optical-baseline="true"]');
    const [titleBox, scienceBox, evolvesBox, baselineBox] = await Promise.all([
      title.boundingBox(), science.boundingBox(), evolves.boundingBox(), baseline.boundingBox(),
    ]);
    assert(titleBox && scienceBox && evolvesBox && baselineBox, `${candidate} must expose measurable typography geometry`);
    const measurement = await page.evaluate(({ baselineSelector, evolvesSelector, scienceSelector, titleSelector }) => {
      const titleNode = document.querySelector(titleSelector);
      const scienceNode = document.querySelector(scienceSelector);
      const evolvesNode = document.querySelector(evolvesSelector);
      const baselineNode = document.querySelector(baselineSelector);
      if (!(titleNode && scienceNode && evolvesNode && baselineNode)) throw new Error('Typography geometry nodes are missing');
      const title = titleNode.getBoundingClientRect();
      const science = scienceNode.getBoundingClientRect();
      const evolves = evolvesNode.getBoundingClientRect();
      const baseline = baselineNode.getBoundingClientRect();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(titleNode);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return {
        baselineY: baseline.top,
        selection: selection?.toString() ?? '',
        title: { left: title.left, right: title.right, top: title.top, bottom: title.bottom },
        science: { left: science.left, right: science.right },
        evolves: { left: evolves.left, right: evolves.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        userSelect: getComputedStyle(titleNode).userSelect,
      };
    }, {
      baselineSelector: '[data-optical-baseline="true"]',
      evolvesSelector: '[data-optical-evolves="true"]',
      scienceSelector: '[data-optical-science="true"]',
      titleSelector: 'h1[data-optical-selectable="true"]',
    });
    assert.equal(measurement.userSelect, 'text', `${candidate} title must be selectable`);
    const measured = measureTypography(measurement);
    assertTypographyContract(candidate, measured, measurement.selection);
    assert.equal(await specimen.getAttribute('data-optical-aperture'), '0.58');
    assert.equal(await specimen.getAttribute('data-shipping-eligible'), candidate === 'arial-black-reference' ? 'false' : 'true');
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.screenshot({ path: path.join(outDir, `typography-${candidate}.png`) });
    metrics.push({ candidate, measured, raw: measurement });
    await page.close();
  }

  await writeFile(path.join(outDir, 'typography-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  await browser.close();
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
}
