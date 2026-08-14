/* global HTMLElement, createImageBitmap, document, fetch, process, window */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'out');
const acceptedBaselinePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'optical-lab-asset-accepted-1672x941.png',
);
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
await mkdir(outDir, { recursive: true });

const cases = [
  { name: 'desktop', width: 1672, height: 941, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
  { name: 'desktop-reduced', width: 1672, height: 941, reducedMotion: 'reduce' },
  { name: 'mobile-reduced', width: 390, height: 844, reducedMotion: 'reduce' },
];

const browser = await chromium.launch({ headless: true });

async function measureTemporalQuadrants(page, before, after, threshold = 1) {
  return page.evaluate(async ({ afterBase64, beforeBase64, thresholdValue }) => {
    const decode = async (encoded) => {
      const blob = await (await fetch(`data:image/png;base64,${encoded}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const first = await decode(beforeBase64);
    const second = await decode(afterBase64);
    const quadrants = [0, 0, 0, 0];
    let count = 0;
    for (let y = 0; y < first.height; y += 1) {
      for (let x = 0; x < first.width; x += 1) {
        const offset = (y * first.width + x) * 4;
        const delta = Math.max(
          Math.abs(first.data[offset] - second.data[offset]),
          Math.abs(first.data[offset + 1] - second.data[offset + 1]),
          Math.abs(first.data[offset + 2] - second.data[offset + 2]),
        );
        if (delta < thresholdValue) continue;
        count += 1;
        quadrants[(y >= first.height / 2 ? 2 : 0) + (x >= first.width / 2 ? 1 : 0)] += 1;
      }
    }
    return { count, quadrants };
  }, {
    afterBase64: after.toString('base64'),
    beforeBase64: before.toString('base64'),
    thresholdValue: threshold,
  });
}

try {
  for (const testCase of cases) {
    const page = await browser.newPage({
      viewport: { width: testCase.width, height: testCase.height },
      deviceScaleFactor: 1,
      reducedMotion: testCase.reducedMotion,
    });
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('favicon')) runtimeErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));

    const surface = page.locator('[data-accepted-optical-surface="landing"]');
    assert.equal(await surface.count(), 1, 'landing must render one shared accepted optical surface');
    assert.equal(await page.locator('main').count(), 1, 'landing must expose one main landmark');
    assert.equal(await page.locator('h1').count(), 1, 'landing must expose one semantic headline');
    assert.equal(await page.locator('[data-optical-field="true"]').count(), 0, 'legacy OpticalHeadline field must not mount');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'landing must not overflow horizontally');

    for (const href of ['/explore', '/research-objects/new', '/auth/login']) {
      assert((await page.locator(`a[href="${href}"]`).count()) > 0, `landing must retain ${href} navigation`);
    }
    assert.equal(await page.locator('[data-hero-action="primary"]').isVisible(), true, 'Explore CTA must remain visible');
    assert.equal(await page.locator('[data-hero-action="secondary"]').isVisible(), true, 'Create CTA must remain visible');
    assert.equal(await page.locator('[data-landing-module="open-ro"]').count(), 1, 'Latest Research/Open RO must remain below the Hero');

    const bounds = await surface.boundingBox();
    assert(bounds && bounds.width > 0 && bounds.height > 0, 'accepted surface must have visible bounds');
    assert(Math.abs(bounds.width / bounds.height - 16 / 9) < .02, 'accepted surface must retain its 16:9 plate geometry');
    assert.equal(await surface.locator('[data-optical-lab-asset-plate="true"]').count(), 1, 'accepted energy plate must remain mounted');
    assert.equal(await surface.locator('[data-optical-lab-target-typography-plate="true"]').count(), 1, 'accepted typography plate must remain mounted');
    assert.equal(await page.locator('#landing-optical-diagnostics').isVisible(), false, 'shared diagnostics must remain visually hidden');

    if (testCase.reducedMotion === 'reduce') {
      assert.equal(await surface.getAttribute('data-render-mode'), 'asset-static', 'reduced motion must retain the exact static surface');
      assert.equal(await surface.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(), 0, 'reduced motion must not create an interaction canvas');
      if (testCase.width === 1672) {
        assert.deepEqual(
          await surface.screenshot({ animations: 'disabled' }),
          await readFile(acceptedBaselinePath),
          'production reduced motion must expose the accepted static surface pixel-for-pixel',
        );
      }
    } else {
      const canvas = surface.locator('canvas[data-optical-asset-interaction-canvas="true"]');
      await canvas.waitFor({ state: 'attached', timeout: 10_000 });
      await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
      const idleSnapshot = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
      assert.equal(idleSnapshot?.ambientStrength, .05, 'Landing idle proof must exercise the exact ambient flow budget');
      assert.equal(idleSnapshot?.follow, 0, 'Landing idle proof must run before pointer input');
      const idleBefore = await canvas.screenshot();
      await page.waitForTimeout(360);
      const idleAfter = await canvas.screenshot();
      const idleMotion = await measureTemporalQuadrants(page, idleBefore, idleAfter, 1);
      assert(idleMotion.count > 0 && idleMotion.quadrants.every((count) => count > 0),
        `Landing idle motion must change real pixels in all four quadrants: ${JSON.stringify(idleMotion)}`);
      const startX = bounds.x + bounds.width * .3;
      const endX = bounds.x + bounds.width * .7;
      const y = bounds.y + bounds.height * .45;
      await page.mouse.move(startX, y);
      await page.waitForTimeout(48);
      await page.mouse.move(endX, y, { steps: 2 });
      await page.waitForFunction(() => {
        const snapshot = window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__;
        return Boolean(snapshot && snapshot.follow > .05 && snapshot.activeRaf);
      }, undefined, { polling: 'raf', timeout: 2_000 });
      const response = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
      assert(response && response.follow > .05, 'pointer movement must activate the amplified shared field');
      assert(response.pointerX > .5, 'pointer response must follow the production Hero input position');
    }

    await page.locator('[data-hero-action="primary"]').focus();
    assert.equal(await page.locator('[data-hero-action="primary"]').evaluate((node) => node === document.activeElement), true, 'primary CTA must be keyboard focusable');
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await page.waitForFunction(() => {
      const skipLink = document.querySelector('a[href="#main-content"]');
      return skipLink instanceof HTMLElement && skipLink.getBoundingClientRect().bottom <= 0;
    }, undefined, { polling: 'raf', timeout: 2_000 });
    assert.equal(
      await page.locator('a[href="#main-content"]').evaluate((node) => node.getBoundingClientRect().bottom <= 0),
      true,
      'skip link must settle outside the viewport before visual evidence is captured',
    );
    await page.screenshot({
      path: path.join(outDir, `landing-accepted-${testCase.width}x${testCase.height}${testCase.reducedMotion === 'reduce' ? '-reduced' : ''}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    assert.deepEqual(runtimeErrors, [], `landing emitted browser errors: ${runtimeErrors.join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
