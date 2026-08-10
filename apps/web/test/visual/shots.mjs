/* global document, process, window */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('test/visual/out');
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
  const loopRequests = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/hero/ro-loop.')) loopRequests.push(request.url());
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'landing must not overflow horizontally');
  if (testCase.reducedMotion === 'no-preference') {
    const stage = page.locator('[data-optical-text-stage="true"]');
    const bounds = await stage.boundingBox();
    assert(bounds, 'interactive headline stage must be visible');
    const x = bounds.x + bounds.width * (testCase.symbol === 'a' ? 0.3 : 0.7);
    const y = bounds.y + bounds.height * 0.46;
    await page.mouse.move(x, y);
    await page.waitForTimeout(40);
    const interaction = await stage.evaluate((element) => ({
      opticalX: element.style.getPropertyValue('--os-optical-x'),
      scale: Number(element.querySelector('[data-optical-displace="true"]')?.getAttribute('scale') ?? 0),
    }));
    assert(interaction.opticalX.endsWith('px'), 'pointer must drive a pixel-local optical origin');
    assert(interaction.scale > 5, 'pointer movement must visibly activate text displacement');
  }
  const expectsLoop = testCase.width >= 1024 && testCase.reducedMotion === 'no-preference';
  assert.equal(loopRequests.length > 0, expectsLoop, 'loop video requests must follow the desktop motion policy');
  if (testCase.reducedMotion === 'reduce') {
    const activeBefore = await page.locator('[data-landing-module="evolution"] [aria-pressed="true"]').textContent();
    await page.waitForTimeout(2800);
    const activeAfter = await page.locator('[data-landing-module="evolution"] [aria-pressed="true"]').textContent();
    assert.equal(activeAfter, activeBefore, 'reduced-motion evolution must remain static');
  }
  await page.screenshot({
    path: path.join(outDir, `${testCase.symbol}-${testCase.width}x${testCase.height}${testCase.reducedMotion === 'reduce' ? '-reduced' : ''}.png`),
  });
  if (testCase.symbol === 'b' && testCase.width === 1440 && testCase.reducedMotion === 'no-preference') {
    const activeBefore = await page.locator('[data-landing-module="evolution"] [aria-pressed="true"]').textContent();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(2800);
    const activeAfter = await page.locator('[data-landing-module="evolution"] [aria-pressed="true"]').textContent();
    assert.equal(activeAfter, activeBefore, 'runtime reduced-motion switch must cancel evolution auto-advance');
  }
  if (testCase.symbol === 'a' && testCase.reducedMotion === 'no-preference' && [390, 1440].includes(testCase.width)) {
    for (const moduleName of ['evolution', 'hermes', 'trust']) {
      const module = page.locator(`[data-landing-module="${moduleName}"]`);
      await module.scrollIntoViewIfNeeded();
      assert.equal(await module.isVisible(), true, `${moduleName} must remain visible below the fold`);
    }
    await page.screenshot({
      fullPage: true,
      path: path.join(outDir, `a-${testCase.width}x${testCase.height}-full.png`),
    });
  }
  assert.deepEqual(runtimeErrors, [], `landing emitted browser errors: ${runtimeErrors.join(' | ')}`);
  await page.close();
}

await browser.close();
