/* global document, process, window */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'out');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const cases = [
  { symbol: 'a', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 1920, height: 1080, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 1920, height: 1080, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 390, height: 844, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 390, height: 844, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 1440, height: 900, reducedMotion: 'reduce' },
  { symbol: 'b', width: 1440, height: 900, reducedMotion: 'reduce' },
];

for (const testCase of cases) {
  const page = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
    deviceScaleFactor: 2,
    reducedMotion: testCase.reducedMotion,
  });
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'landing must not overflow horizontally');
  assert.equal(await page.locator('h1').count(), 1, 'landing must expose one semantic headline');
  const headline = page.locator('[data-optical-text-base="true"]');
  const evolves = page.locator('[data-optical-evolves="true"]').first();
  const fontFamily = await evolves.evaluate((node) => node.ownerDocument.defaultView?.getComputedStyle(node).fontFamily ?? '');
  assert.match(fontFamily, /Bodoni|editorial/i, 'evolves must use the Latin editorial face');
  assert.equal(await page.locator('.optical-cursor-ring').count(), 0, 'large cursor ring must be removed');
  if (testCase.width >= 1280) {
    assert.equal(await headline.getAttribute('data-headline-layout'), 'single-axis');
  }
  if (testCase.reducedMotion === 'no-preference') {
    const stage = page.locator('[data-optical-text-stage="true"]');
    const bounds = await stage.boundingBox();
    assert(bounds, 'interactive headline stage must be visible');
    const targetFactor = testCase.symbol === 'a' ? 0.3 : 0.7;
    const startFactor = testCase.symbol === 'a' ? 0.7 : 0.3;
    const y = bounds.y + bounds.height * 0.46;
    await page.mouse.move(bounds.x + bounds.width * startFactor, y);
    await page.waitForTimeout(120);
    await page.mouse.move(bounds.x + bounds.width * targetFactor, y);
    const readOpticalX = () => stage.evaluate((element) => Number.parseFloat(element.style.getPropertyValue('--os-optical-pointer-x')));
    const waitForNextOpticalX = async (previous) => {
      await page.waitForFunction(
        ({ value }) => {
          const element = document.querySelector('[data-optical-text-stage="true"]');
          const current = Number.parseFloat(element?.style.getPropertyValue('--os-optical-pointer-x') ?? 'NaN');
          return Number.isFinite(current) && current !== value;
        },
        { value: previous },
        { polling: 'raf', timeout: 2_000 },
      );
      return readOpticalX();
    };
    const firstX = await readOpticalX();
    const secondX = await waitForNextOpticalX(firstX);
    const thirdX = await waitForNextOpticalX(secondX);
    const targetX = bounds.width * targetFactor;
    assert(Math.abs(firstX - targetX) > 1, 'pointer target must not be applied in a single frame');
    assert(Math.abs(secondX - targetX) < Math.abs(firstX - targetX), 'optical origin must ease toward the pointer target');
    assert(Math.abs(thirdX - targetX) < Math.abs(secondX - targetX), 'optical origin must keep converging monotonically');
    const interaction = await stage.evaluate((element) => ({
      opticalX: element.style.getPropertyValue('--os-optical-x'),
      scale: Number(element.querySelector('[data-optical-displace="true"]')?.getAttribute('scale') ?? 0),
    }));
    assert(interaction.opticalX.endsWith('px'), 'pointer must drive a pixel-local optical origin');
    assert(interaction.scale > 5, 'pointer movement must visibly activate text displacement');
  }
  await page.screenshot({
    path: path.join(outDir, `${testCase.symbol}-${testCase.width}x${testCase.height}${testCase.reducedMotion === 'reduce' ? '-reduced' : ''}.png`),
  });
  if (testCase.symbol === 'a' && testCase.reducedMotion === 'no-preference' && [390, 1440].includes(testCase.width)) {
    const openRo = page.locator('[data-landing-module="open-ro"]');
    await openRo.scrollIntoViewIfNeeded();
    assert.equal(await openRo.isVisible(), true, 'Open RO anatomy must remain visible below the fold');
    assert.equal(await openRo.locator('[data-sdf-node]').count(), 6, 'Open RO anatomy must expose all six SDF layers');
    await page.screenshot({
      fullPage: true,
      path: path.join(outDir, `a-${testCase.width}x${testCase.height}-full.png`),
    });
  }
  assert.deepEqual(runtimeErrors, [], `landing emitted browser errors: ${runtimeErrors.join(' | ')}`);
  await page.close();
}

await browser.close();
