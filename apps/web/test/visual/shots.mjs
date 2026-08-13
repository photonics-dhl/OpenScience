/* global HTMLElement, document, process, window */

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
      await surface.locator('canvas[data-optical-asset-interaction-canvas="true"]').waitFor({ state: 'attached', timeout: 10_000 });
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
