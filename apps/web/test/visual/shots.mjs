/* global Buffer, HTMLElement, createImageBitmap, document, fetch, getComputedStyle, process, window */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  { name: 'desktop-reduced', width: 1672, height: 941, reducedMotion: 'reduce' },
  { name: 'mobile-reduced', width: 390, height: 844, reducedMotion: 'reduce' },
  { name: 'desktop', width: 1672, height: 941, reducedMotion: 'no-preference' },
  { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
];

const browser = await chromium.launch({ headless: true });
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const captureRendererFrame = async (page) => {
  const capture = await page.evaluate(async () => {
    if (!window.__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__) {
      throw new Error('Landing interaction frame capture bridge is unavailable');
    }
    return window.__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__();
  });
  return Buffer.from(capture.base64, 'base64');
};

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
    let titleCount = 0;
    let titleDelta = 0;
    let titleTotal = 0;
    for (let y = 0; y < first.height; y += 1) {
      for (let x = 0; x < first.width; x += 1) {
        const offset = (y * first.width + x) * 4;
        const delta = Math.max(
          Math.abs(first.data[offset] - second.data[offset]),
          Math.abs(first.data[offset + 1] - second.data[offset + 1]),
          Math.abs(first.data[offset + 2] - second.data[offset + 2]),
        );
        const inTitleBand = y >= first.height * .30 && y <= first.height * .70;
        if (inTitleBand) titleTotal += 1;
        if (delta < thresholdValue) continue;
        count += 1;
        if (inTitleBand) {
          titleCount += 1;
          titleDelta += delta;
        }
        quadrants[(y >= first.height / 2 ? 2 : 0) + (x >= first.width / 2 ? 1 : 0)] += 1;
      }
    }
    return { count, quadrants, titleCount, titleDelta, titleTotal, total: first.width * first.height };
  }, {
    afterBase64: after.toString('base64'),
    beforeBase64: before.toString('base64'),
    thresholdValue: threshold,
  });
}

async function measureChromaticBandCoverage(page, frame, chromaThreshold = 8) {
  return page.evaluate(async ({ chromaThresholdValue, frameBase64 }) => {
    const blob = await (await fetch(`data:image/png;base64,${frameBase64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const columns = new Uint32Array(image.width);
    const rows = new Uint32Array(image.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        const maximum = Math.max(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
        const minimum = Math.min(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
        if (maximum < 8 || maximum - minimum < chromaThresholdValue) continue;
        rows[y] += 1;
        columns[x] += 1;
      }
    }
    return {
      maximumColumnRatio: Math.max(...columns) / image.height,
      maximumRowRatio: Math.max(...rows) / image.width,
    };
  }, { chromaThresholdValue: chromaThreshold, frameBase64: frame.toString('base64') });
}

async function measureContaminationZones(page, withPlate, withoutPlate, threshold = 2) {
  return page.evaluate(async ({ thresholdValue, withPlateBase64, withoutPlateBase64 }) => {
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
    const visible = await decode(withPlateBase64);
    const hidden = await decode(withoutPlateBase64);
    let changed = 0;
    let sampled = 0;
    for (let y = 0; y < visible.height; y += 1) {
      for (let x = 0; x < visible.width; x += 1) {
        const lowerLeftStatus = x <= visible.width * .28 && y >= visible.height * .62;
        const capturedCursor = x >= visible.width * .50 && x <= visible.width * .62
          && y >= visible.height * .61 && y <= visible.height * .72;
        if (!lowerLeftStatus && !capturedCursor) continue;
        sampled += 1;
        const offset = (y * visible.width + x) * 4;
        const delta = Math.max(
          Math.abs(visible.data[offset] - hidden.data[offset]),
          Math.abs(visible.data[offset + 1] - hidden.data[offset + 1]),
          Math.abs(visible.data[offset + 2] - hidden.data[offset + 2]),
        );
        if (delta >= thresholdValue) changed += 1;
      }
    }
    return { changed, sampled };
  }, {
    thresholdValue: threshold,
    withPlateBase64: withPlate.toString('base64'),
    withoutPlateBase64: withoutPlate.toString('base64'),
  });
}

async function measureLowerLeftBrightPixels(page, frame, threshold = 12) {
  return page.evaluate(async ({ frameBase64, thresholdValue }) => {
    const blob = await (await fetch(`data:image/png;base64,${frameBase64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let bright = 0;
    for (let y = Math.floor(image.height * .62); y < image.height; y += 1) {
      for (let x = 0; x <= image.width * .28; x += 1) {
        const offset = (y * image.width + x) * 4;
        if (Math.max(image.data[offset], image.data[offset + 1], image.data[offset + 2]) >= thresholdValue) {
          bright += 1;
        }
      }
    }
    return bright;
  }, { frameBase64: frame.toString('base64'), thresholdValue: threshold });
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
    assert.equal(
      await surface.evaluate((node) => getComputedStyle(node).cursor),
      'none',
      'the optical surface must not expose the black operating-system arrow over its dark field',
    );
    assert.deepEqual(
      await surface.evaluate((node) => [...node.querySelectorAll('*')]
        .filter((child) => getComputedStyle(child).cursor !== 'none')
        .map((child) => ({ cursor: getComputedStyle(child).cursor, tag: child.tagName }))),
      [],
      'every Landing optical descendant must keep the operating-system cursor hidden',
    );
    assert.equal(
      await surface.evaluate((node) => getComputedStyle(
        node.querySelector('[data-optical-asset-interaction-host="true"]'),
        '::after',
      ).animationName),
      'none',
      'idle attention must come from the shared WebGL water field, not a CSS sweep',
    );

    if (testCase.reducedMotion === 'reduce') {
      assert.equal(await surface.getAttribute('data-render-mode'), 'asset-static', 'reduced motion must retain the exact static surface');
      assert.equal(await surface.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(), 0, 'reduced motion must not create an interaction canvas');
      const targetPlate = surface.locator('[data-optical-lab-target-typography-plate="true"]');
      const withPlate = await surface.screenshot({ animations: 'disabled' });
      await targetPlate.evaluate((node) => { node.style.visibility = 'hidden'; });
      const withoutPlate = await surface.screenshot({ animations: 'disabled' });
      await targetPlate.evaluate((node) => { node.style.visibility = ''; });
      const contamination = await measureContaminationZones(page, withPlate, withoutPlate, 2);
      assert.equal(
        contamination.changed,
        0,
        `the typography plate must contribute no baked cursor or lower-left status pixels: ${JSON.stringify(contamination)}`,
      );
      if (testCase.width === 1672) {
        const cleanStatic = await surface.screenshot({ animations: 'disabled' });
        await writeFile(path.join(outDir, 'landing-clean-static-1672x941.png'), cleanStatic);
        assert.equal(
          sha256(cleanStatic),
          sha256(await readFile(acceptedBaselinePath)),
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
      const idleWindows = [];
      for (let index = 0; index < 3; index += 1) {
        const phaseBefore = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.ambientPhase);
        const idleBefore = await captureRendererFrame(page);
        await page.waitForTimeout(360);
        const idleAfter = await captureRendererFrame(page);
        const phaseAfter = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.ambientPhase);
        if (testCase.name === 'desktop' && index === 0) {
          await writeFile(path.join(outDir, 'landing-idle-canvas-before.png'), idleBefore);
          await writeFile(path.join(outDir, 'landing-idle-canvas-after.png'), idleAfter);
        }
        assert.equal(
          await measureLowerLeftBrightPixels(page, idleBefore, 12),
          0,
          'the live WebGL target contribution must not contain the baked lower-left status copy',
        );
        idleWindows.push({
          chromaticBands: await measureChromaticBandCoverage(page, idleBefore, 8),
          ...await measureTemporalQuadrants(page, idleBefore, idleAfter, 3),
          phaseAfter,
          phaseBefore,
        });
      }
      assert(idleWindows.every((motion) => (
        typeof motion.phaseBefore === 'number'
        && typeof motion.phaseAfter === 'number'
        && motion.phaseAfter !== motion.phaseBefore
      )), `Landing idle phase must advance in every observation window: ${JSON.stringify(idleWindows)}`);
      assert(idleWindows.every((motion) => (
        motion.titleCount / motion.titleTotal >= .015
        && motion.titleDelta / motion.titleTotal >= .06
        && motion.quadrants.every((count) => count > 0)
      )), `Landing idle motion must visibly animate the title band in every window and all four quadrants: ${JSON.stringify(idleWindows)}`);
      assert(idleWindows.every((motion) => (
        motion.chromaticBands.maximumRowRatio <= .20
        && motion.chromaticBands.maximumColumnRatio <= .20
      )), `Landing idle grazing light must remain narrow instead of becoming a broad chromatic band: ${JSON.stringify(idleWindows)}`);
      await surface.screenshot({
        path: path.join(outDir, `landing-idle-${testCase.width}x${testCase.height}.png`),
      });
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
      assert.equal(
        await page.evaluate(({ pointerX, pointerY }) => {
          const hit = document.elementFromPoint(pointerX, pointerY);
          return hit ? getComputedStyle(hit).cursor : null;
        }, { pointerX: endX, pointerY: y }),
        'none',
        'the live pointer hit target must not reveal a black operating-system cursor during interaction',
      );
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
