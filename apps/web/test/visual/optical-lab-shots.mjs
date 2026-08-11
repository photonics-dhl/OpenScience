/* global createImageBitmap, document, fetch, HTMLCanvasElement, process, setTimeout, window */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { analyzeOpticalTopology } from './optical-lab-visual-metrics.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(scriptDir, 'out', 'optical-lab');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const measurements = [];
const cases = [
  { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { name: 'webgl1-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'webgl1' },
  { name: 'webgl2-init-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'webgl2-init-failure' },
  { name: 'shader-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'shader-failure' },
  { name: 'dom-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'none' },
  { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
  { name: 'reduced', width: 1440, height: 900, reducedMotion: 'reduce' },
];

async function decodeScreenshot(page, buffer) {
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
    bitmap.close();
    return { height: canvas.height, pixels, width: canvas.width };
  }, buffer.toString('base64'));
}

function compareScreenshots(first, second) {
  assert.equal(first.width, second.width, 'pointer screenshots must have equal widths');
  assert.equal(first.height, second.height, 'pointer screenshots must have equal heights');
  let absoluteDifference = 0;
  let changedPixels = 0;
  const pixelCount = first.width * first.height;
  for (let index = 0; index < first.pixels.length; index += 4) {
    const difference = Math.abs(first.pixels[index] - second.pixels[index])
      + Math.abs(first.pixels[index + 1] - second.pixels[index + 1])
      + Math.abs(first.pixels[index + 2] - second.pixels[index + 2]);
    absoluteDifference += difference;
    if (difference >= 18) changedPixels += 1;
  }
  return {
    changedRatio: changedPixels / pixelCount,
    meanChannelDifference: absoluteDifference / (pixelCount * 3),
  };
}

function analyzeForbiddenGeometry(image, pointerFactor) {
  const { height, pixels, width } = image;
  const luminance = (x, y) => {
    const safeX = Math.max(0, Math.min(width - 1, Math.round(x)));
    const safeY = Math.max(0, Math.min(height - 1, Math.round(y)));
    const index = (safeY * width + safeX) * 4;
    return pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722;
  };
  const centerX = width * pointerFactor;
  const centerY = height * .52;
  let radialBoundaryCoverage = 0;
  let whiteRingCoverage = 0;
  for (let radius = 14; radius <= Math.min(width, height) * .32; radius += 3) {
    const positiveRadialEdges = Array.from({ length: 12 }, () => 0);
    const negativeRadialEdges = Array.from({ length: 12 }, () => 0);
    const whiteSamples = Array.from({ length: 12 }, () => 0);
    const sectorSamples = Array.from({ length: 12 }, () => 0);
    const samples = 96;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = (sample / samples) * Math.PI * 2;
      const sector = Math.floor(sample / (samples / 12));
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const onRing = luminance(centerX + cosine * radius, centerY + sine * radius);
      const radialGradient = luminance(centerX + cosine * (radius + 2), centerY + sine * (radius + 2))
        - luminance(centerX + cosine * (radius - 2), centerY + sine * (radius - 2));
      sectorSamples[sector] += 1;
      if (radialGradient >= 38) positiveRadialEdges[sector] += 1;
      if (radialGradient <= -38) negativeRadialEdges[sector] += 1;
      if (onRing >= 218) whiteSamples[sector] += 1;
    }
    radialBoundaryCoverage = Math.max(
      radialBoundaryCoverage,
      Math.max(
        Math.min(...positiveRadialEdges.map((count, sector) => count / sectorSamples[sector])),
        Math.min(...negativeRadialEdges.map((count, sector) => count / sectorSamples[sector])),
      ),
    );
    whiteRingCoverage = Math.max(
      whiteRingCoverage,
      Math.min(...whiteSamples.map((count, sector) => count / sectorSamples[sector])),
    );
  }

  let mechanicalLineCoverage = 0;
  for (let x = 1; x < width - 1; x += 1) {
    let edgeSamples = 0;
    let sampled = 0;
    for (let y = 2; y < height - 2; y += 2) {
      if (y > height * .29 && y < height * .72) continue;
      sampled += 1;
      if (Math.abs(luminance(x + 1, y) - luminance(x - 1, y)) >= 44) edgeSamples += 1;
    }
    mechanicalLineCoverage = Math.max(mechanicalLineCoverage, edgeSamples / Math.max(1, sampled));
  }
  return { mechanicalLineCoverage, radialBoundaryCoverage, whiteRingCoverage };
}

function analyzeGhostProbe(image) {
  let edgeEnergy = 0;
  let highEdgePixels = 0;
  let comparisons = 0;
  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const index = (y * image.width + x) * 4;
      const right = index + 4;
      const horizontalEdge = Math.abs(image.pixels[index] - image.pixels[right])
        + Math.abs(image.pixels[index + 1] - image.pixels[right + 1])
        + Math.abs(image.pixels[index + 2] - image.pixels[right + 2]);
      edgeEnergy += horizontalEdge;
      if (horizontalEdge >= 36) highEdgePixels += 1;
      comparisons += 3;
    }
  }
  return {
    edgeEnergy: edgeEnergy / comparisons,
    highEdgeRatio: highEdgePixels / ((image.width - 2) * (image.height - 2)),
  };
}

function createForbiddenRegressionFixture() {
  const width = 240;
  const height = 135;
  const pixels = new Array(width * height * 4).fill(0);
  for (let index = 0; index < pixels.length; index += 4) pixels[index + 3] = 255;
  const centerX = width * .58;
  const centerY = height * .52;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const radius = Math.hypot(x - centerX, y - centerY);
      if (Math.abs(radius - 34) <= 2 || Math.abs(x - centerX) <= 1) {
        const index = (y * width + x) * 4;
        pixels[index] = 245;
        pixels[index + 1] = 245;
        pixels[index + 2] = 245;
      }
    }
  }
  return { height, pixels, width };
}

const forbiddenRegression = analyzeForbiddenGeometry(createForbiddenRegressionFixture(), .58);
const ghostRegression = analyzeGhostProbe(createForbiddenRegressionFixture());
assert(
  forbiddenRegression.radialBoundaryCoverage >= .48 || forbiddenRegression.whiteRingCoverage >= .4,
  'visual gate must reject a synthetic white radial boundary',
);
assert(
  forbiddenRegression.mechanicalLineCoverage >= .34,
  'visual gate must reject a synthetic mechanical vertical line',
);
assert(
  ghostRegression.edgeEnergy >= .4 || ghostRegression.highEdgeRatio >= .003,
  'visual gate must reject a synthetic grey/white edge ghost',
);

for (const testCase of cases) {
  const page = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
    deviceScaleFactor: 1,
    reducedMotion: testCase.reducedMotion,
  });
  const errors = [];
  await page.addInitScript((forceContext) => {
      window.__OPTICAL_LAB_GL_TRACKER__ = {
        contexts: [],
        instancedDraws: 0,
        instancedDrawErrors: [],
        preInstancedDrawErrors: [],
        pointDrawArrays: 0,
      };
      window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = null;
      window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__ = 0;
      window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__ = null;
      const requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => requestAnimationFrame((timestamp) => {
        window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__ += 1;
        const fixedTimestamp = window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__;
        callback(Number.isFinite(fixedTimestamp) ? fixedTimestamp : timestamp);
      });
      window.addEventListener('pointermove', () => {
        window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__ = performance.now();
      }, { capture: true, passive: true });
      const original = HTMLCanvasElement.prototype.getContext;
      const canvasIds = new WeakMap();
      let nextCanvasId = 1;
      const instrument = (context, type, canvas) => {
        if (!context || context.__opticalLabInstrumented) return context;
        context.__opticalLabInstrumented = true;
        if (!canvasIds.has(canvas)) canvasIds.set(canvas, nextCanvasId++);
        const record = { canvasId: canvasIds.get(canvas), created: {}, deleted: {}, type };
        window.__OPTICAL_LAB_GL_TRACKER__.contexts.push(record);
        for (const resource of ['Shader', 'Program', 'Buffer', 'Texture', 'Framebuffer', 'Query']) {
          const createName = `create${resource}`;
          const deleteName = `delete${resource}`;
          if (typeof context[createName] === 'function') {
            const create = context[createName].bind(context);
            context[createName] = (...args) => {
              const value = create(...args);
              if (value) record.created[resource] = (record.created[resource] ?? 0) + 1;
              return value;
            };
          }
          if (typeof context[deleteName] === 'function') {
            const remove = context[deleteName].bind(context);
            context[deleteName] = (value) => {
              if (value) record.deleted[resource] = (record.deleted[resource] ?? 0) + 1;
              return remove(value);
            };
          }
        }
        const drawArrays = context.drawArrays.bind(context);
        context.drawArrays = (...args) => {
          if (args[0] === context.POINTS) window.__OPTICAL_LAB_GL_TRACKER__.pointDrawArrays += 1;
          return drawArrays(...args);
        };
        const recordInstancedPointDraw = (draw, args) => {
          let staleError = context.getError();
          while (staleError !== context.NO_ERROR && staleError !== context.CONTEXT_LOST_WEBGL) {
            window.__OPTICAL_LAB_GL_TRACKER__.preInstancedDrawErrors.push(staleError);
            staleError = context.getError();
          }
          const result = draw(...args);
          const drawError = context.getError();
          window.__OPTICAL_LAB_GL_TRACKER__.instancedDraws += 1;
          window.__OPTICAL_LAB_GL_TRACKER__.instancedDrawErrors.push(drawError);
          return result;
        };
        if (typeof context.drawArraysInstanced === 'function') {
          const drawArraysInstanced = context.drawArraysInstanced.bind(context);
          context.drawArraysInstanced = (...args) => {
            return args[0] === context.POINTS
              ? recordInstancedPointDraw(drawArraysInstanced, args)
              : drawArraysInstanced(...args);
          };
        }
        const getExtension = context.getExtension.bind(context);
        context.getExtension = (name) => {
          if (forceContext === 'no-context-loss' && name === 'WEBGL_lose_context') return null;
          const extension = getExtension(name);
          if (name === 'ANGLE_instanced_arrays' && extension && !extension.__opticalLabInstrumented) {
            extension.__opticalLabInstrumented = true;
            const drawArraysInstanced = extension.drawArraysInstancedANGLE.bind(extension);
            extension.drawArraysInstancedANGLE = (...args) => {
              return args[0] === context.POINTS
                ? recordInstancedPointDraw(drawArraysInstanced, args)
                : drawArraysInstanced(...args);
            };
          }
          return extension;
        };
        return context;
      };
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...options) {
        if ((forceContext === 'webgl1' || forceContext === 'none') && type === 'webgl2') return null;
        if (forceContext === 'none' && (type === 'webgl' || type === 'experimental-webgl')) return null;
        const context = original.call(this, type, ...options);
        if (
          context
          && (forceContext === 'shader-failure' || (forceContext === 'webgl2-init-failure' && type === 'webgl2'))
        ) {
          const originalGetShaderParameter = context.getShaderParameter.bind(context);
          context.getShaderParameter = (shader, parameter) => (
            parameter === context.COMPILE_STATUS ? false : originalGetShaderParameter(shader, parameter)
          );
          context.getShaderInfoLog = () => 'forced Optical Lab shader failure';
        }
        return type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl'
          ? instrument(context, type, this)
          : context;
      };
    }, testCase.forceContext ?? null);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`);
  });

  const response = await page.goto(`${baseUrl}/_visual/optical-lab`, { waitUntil: 'networkidle' });
  assert.equal(
    response?.status(),
    200,
    `${testCase.name} Optical Lab route must exist: ${response ? (await response.text()).slice(0, 600) : 'no response'}`,
  );
  await page.evaluate(() => document.fonts.ready.then(() => true));
  assert.equal(await page.locator('[data-optical-lab-panel]').count(), 3, 'Lab must show three comparison panels');
  assert.equal(await page.locator('h1[data-optical-lab-semantic-title="true"]').count(), 1, 'candidate must keep one semantic h1');
  assert.equal(await page.locator('[data-optical-lab-forbidden]').count(), 0, 'candidate must not render forbidden overlay primitives');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Lab must not overflow horizontally');

  const diagnostics = page.locator('[data-optical-lab-diagnostics="true"]');
  await diagnostics.waitFor({ state: 'visible' });
  const mode = await diagnostics.getAttribute('data-render-mode');
  const contextStatus = await diagnostics.getAttribute('data-context-status');
  let restingTopology = null;
  let targetTopology = null;
  if (
    testCase.reducedMotion === 'reduce'
    || testCase.width <= 480
    || testCase.forceContext === 'none'
    || testCase.forceContext === 'shader-failure'
  ) {
    assert.equal(mode, 'dom-static', `${testCase.name} must use the stable DOM/static fallback`);
    assert.equal(await page.locator('canvas[data-optical-lab-canvas="true"]').count(), 0, `${testCase.name} must not start a GPU loop`);
  } else {
    if (testCase.forceContext === 'webgl1' || testCase.forceContext === 'webgl2-init-failure') {
      assert.equal(mode, 'webgl1', `${testCase.name} must continue on WebGL1`);
    }
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
    const initialDrawEvidence = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
    assert(initialDrawEvidence.instancedDrawErrors.length > 0, `${testCase.name} must record an instanced particle draw`);
    assert(
      initialDrawEvidence.instancedDrawErrors.every((error) => error === 0),
      `${testCase.name} instanced particle draw returned GL errors: ${JSON.stringify(initialDrawEvidence.instancedDrawErrors)}`,
    );
    assert.deepEqual(
      initialDrawEvidence.preInstancedDrawErrors,
      [],
      `${testCase.name} fullscreen draws returned GL errors before the particle pass`,
    );

    const stage = page.locator('[data-optical-lab-candidate-stage="true"]');
    await stage.scrollIntoViewIfNeeded();
    const visibleBounds = await stage.boundingBox();
    assert(visibleBounds, 'candidate stage must have measurable viewport bounds');
    assert(visibleBounds.x >= 0 && visibleBounds.y >= 0, `${testCase.name} candidate must start inside the screenshot viewport`);
    assert(
      visibleBounds.x + visibleBounds.width <= testCase.width + 1
        && visibleBounds.y + visibleBounds.height <= testCase.height + 1,
      `${testCase.name} candidate must fit inside the screenshot viewport`,
    );
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
    const targetImage = page.locator('[data-optical-lab-panel="target"] img');
    const targetFrame = await decodeScreenshot(
      page,
      await targetImage.screenshot({ path: path.join(outDir, `${testCase.name}-target-resting.png`) }),
    );
    const restingFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-resting.png`) }),
    );
    targetTopology = analyzeOpticalTopology(targetFrame, .58);
    restingTopology = analyzeOpticalTopology(restingFrame, .58);
    assert(
      restingTopology.waistConcentration >= Math.max(1.18, targetTopology.waistConcentration * .52),
      `${testCase.name} resting waist is too weak: candidate=${JSON.stringify(restingTopology)} target=${JSON.stringify(targetTopology)}`,
    );
    assert(
      restingTopology.downstreamSpread >= Math.max(.006, targetTopology.downstreamSpread * .38),
      `${testCase.name} resting downstream spread is too weak: candidate=${JSON.stringify(restingTopology)} target=${JSON.stringify(targetTopology)}`,
    );
    assert(restingTopology.continuity >= .68, `${testCase.name} resting glyph is discontinuous: ${JSON.stringify(restingTopology)}`);
    assert(
      restingTopology.directionality >= Math.max(1.04, targetTopology.directionality * .42),
      `${testCase.name} resting directionality is too weak: candidate=${JSON.stringify(restingTopology)} target=${JSON.stringify(targetTopology)}`,
    );
    assert(
      restingTopology.verticalCurtainCoverage >= Math.max(.24, targetTopology.verticalCurtainCoverage * .32),
      `${testCase.name} resting particle curtain is too short: candidate=${JSON.stringify(restingTopology)} target=${JSON.stringify(targetTopology)}`,
    );
    assert(
      restingTopology.verticalCurtainSpread >= Math.max(.18, targetTopology.verticalCurtainSpread * .48),
      `${testCase.name} resting particle curtain is too narrow: candidate=${JSON.stringify(restingTopology)} target=${JSON.stringify(targetTopology)}`,
    );
    const y = initialBounds.y + initialBounds.height * 0.52;
    const pointerFrames = new Map();
    for (const [position, factor] of [['left', 0.22], ['slit', 0.58], ['right', 0.82]]) {
      await page.evaluate(() => {
        window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = null;
      });
      await page.mouse.move(initialBounds.x + 8, initialBounds.y + 8);
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__ = null;
      });
      await page.mouse.move(initialBounds.x + initialBounds.width * factor, y);
      await page.waitForFunction(() => Number.isFinite(window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__));
      const controlledSample = await page.evaluate(() => {
        const lastPointerAt = window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__;
        if (!Number.isFinite(lastPointerAt)) throw new Error('Optical Lab pointer timestamp was not recorded.');
        const fixedTimestamp = lastPointerAt + 150;
        window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = fixedTimestamp;
        return {
          callbackCount: window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__,
          fixedTimestamp,
          lastPointerAt,
        };
      });
      let screenshot;
      try {
        assert.equal(
          controlledSample.fixedTimestamp - controlledSample.lastPointerAt,
          150,
          `${testCase.name}/${position} must sample exactly 150ms after the real pointer event`,
        );
        await page.waitForFunction(
          (callbackCount) => window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__ >= callbackCount + 2,
          controlledSample.callbackCount,
        );
        const current = await diagnostics.evaluate((node) => ({
          apertureX: Number(node.getAttribute('data-aperture-x')),
          mode: node.getAttribute('data-render-mode'),
        }));
        assert(Math.abs(current.apertureX - 0.58) < 0.0001, `${position} frame must retain the fixed slit`);
        assert.equal(current.mode, mode, `${position} frame must not change renderer mode`);
        screenshot = await stage.screenshot({ path: path.join(outDir, `${testCase.name}-${position}-150ms.png`) });
      } finally {
        await page.evaluate(() => {
          window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = null;
        });
      }
      const decoded = await decodeScreenshot(page, screenshot);
      assert(Math.abs(decoded.width - initialBounds.width) <= 2, `${testCase.name} screenshot must be candidate-only width`);
      assert(Math.abs(decoded.height - initialBounds.height) <= 2, `${testCase.name} screenshot must be candidate-only height`);
      const geometry = analyzeForbiddenGeometry(decoded, factor);
      assert(
        geometry.radialBoundaryCoverage < .48,
        `${testCase.name}/${position} has a radial boundary (${geometry.radialBoundaryCoverage.toFixed(3)})`,
      );
      assert(
        geometry.whiteRingCoverage < .4,
        `${testCase.name}/${position} has a white ring (${geometry.whiteRingCoverage.toFixed(3)})`,
      );
      assert(
        geometry.mechanicalLineCoverage < .34,
        `${testCase.name}/${position} has a mechanical vertical line (${geometry.mechanicalLineCoverage.toFixed(3)})`,
      );
      pointerFrames.set(position, decoded);
    }
    for (const [first, second] of [['left', 'slit'], ['slit', 'right']]) {
      const difference = compareScreenshots(pointerFrames.get(first), pointerFrames.get(second));
      assert(
        difference.meanChannelDifference >= .35 && difference.changedRatio >= .008,
        `${testCase.name} ${first}/${second} frames are visually indistinguishable: ${JSON.stringify(difference)}`,
      );
    }
    const activeDifferences = [
      compareScreenshots(pointerFrames.get('left'), pointerFrames.get('slit')),
      compareScreenshots(pointerFrames.get('left'), pointerFrames.get('right')),
      compareScreenshots(pointerFrames.get('slit'), pointerFrames.get('right')),
    ];
    const maximumActiveDifference = {
      changedRatio: Math.max(...activeDifferences.map((difference) => difference.changedRatio)),
      meanChannelDifference: Math.max(...activeDifferences.map((difference) => difference.meanChannelDifference)),
    };
    for (const [position, activeFrame] of pointerFrames) {
      const difference = compareScreenshots(restingFrame, activeFrame);
      assert(
        difference.meanChannelDifference > 0 && difference.changedRatio > 0,
        `${testCase.name} resting/${position} frames are visually indistinguishable: ${JSON.stringify(difference)}`,
      );
      assert(
        difference.meanChannelDifference < maximumActiveDifference.meanChannelDifference
          && difference.changedRatio < maximumActiveDifference.changedRatio,
        `${testCase.name} resting/${position} change exceeds the active-frame maximum: resting=${JSON.stringify(difference)} activeMax=${JSON.stringify(maximumActiveDifference)}`,
      );
    }

    await stage.evaluate((node) => {
      node.setAttribute('data-optical-lab-ghost-probe', 'true');
      const style = document.createElement('style');
      style.dataset.opticalLabGhostProbe = 'true';
      style.textContent = '[data-optical-lab-ghost-probe="true"]::before{display:none!important}[data-optical-lab-ghost-probe="true"] canvas{visibility:hidden!important}';
      document.head.append(style);
    });
    const ghostProbe = analyzeGhostProbe(await decodeScreenshot(page, await stage.screenshot()));
    assert(
      ghostProbe.highEdgeRatio < .003 && ghostProbe.edgeEnergy < .4,
      `${testCase.name} exposes a grey DOM ghost beneath WebGL: ${JSON.stringify(ghostProbe)}`,
    );
    await stage.evaluate((node) => {
      node.removeAttribute('data-optical-lab-ghost-probe');
      document.querySelector('style[data-optical-lab-ghost-probe="true"]')?.remove();
    });
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
    assert.equal(recovery.tested, true, `${testCase.name} cannot verify context loss because WEBGL_lose_context is unavailable`);
    assert.equal(recovery.lost, 'lost', 'context loss must expose a DOM fallback state');
    assert.equal(recovery.restored, 'ready', 'context restoration must reinitialize the renderer');
    await page.waitForFunction(() => {
      const value = document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-gpu-frame-ms');
      return value !== null && value !== 'unavailable' && Number(value) >= 0;
    }, undefined, { timeout: 3_000 });

    const drawEvidence = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
    assert(drawEvidence.instancedDraws > 0, `${testCase.name} must issue real instanced particle draws`);
    assert(
      drawEvidence.instancedDrawErrors.every((error) => error === 0),
      `${testCase.name} instanced particle draw returned GL errors: ${JSON.stringify(drawEvidence.instancedDrawErrors)}`,
    );
    assert.equal(drawEvidence.pointDrawArrays, 0, `${testCase.name} must not use non-instanced POINTS draws`);
    if (testCase.forceContext === 'webgl2-init-failure') {
      const failedWebgl2 = drawEvidence.contexts.find((context) => context.type === 'webgl2');
      const successfulWebgl1 = drawEvidence.contexts.find((context) => context.type === 'webgl');
      assert(failedWebgl2 && successfulWebgl1, 'WebGL2 init failure must attempt WebGL1 on a fresh context');
      assert.notEqual(failedWebgl2.canvasId, successfulWebgl1.canvasId, 'WebGL1 fallback must use a fresh canvas');
      for (const [resource, created] of Object.entries(failedWebgl2.created)) {
        assert.equal(
          failedWebgl2.deleted[resource] ?? 0,
          created,
          `failed WebGL2 transaction leaked ${resource}`,
        );
      }
    }
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
  measurements.push({ case: testCase.name, restingTopology, targetTopology, ...snapshot });
  await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
  assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
  await page.close();
}

const cleanupPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await cleanupPage.addInitScript(() => {
  window.__OPTICAL_LAB_RESOURCE_TOTALS__ = { created: {}, deleted: {} };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function trackedGetContext(type, ...options) {
    const context = original.call(this, type, ...options);
    if (
      !context
      || (type !== 'webgl2' && type !== 'webgl' && type !== 'experimental-webgl')
      || context.__opticalLabCleanupInstrumented
    ) return context;
    context.__opticalLabCleanupInstrumented = true;
    for (const resource of ['Shader', 'Program', 'Buffer', 'Texture', 'Framebuffer', 'Query']) {
      const createName = `create${resource}`;
      const deleteName = `delete${resource}`;
      if (typeof context[createName] === 'function') {
        const create = context[createName].bind(context);
        context[createName] = (...args) => {
          const value = create(...args);
          if (value) window.__OPTICAL_LAB_RESOURCE_TOTALS__.created[resource] = (window.__OPTICAL_LAB_RESOURCE_TOTALS__.created[resource] ?? 0) + 1;
          return value;
        };
      }
      if (typeof context[deleteName] === 'function') {
        const remove = context[deleteName].bind(context);
        context[deleteName] = (value) => {
          if (value) window.__OPTICAL_LAB_RESOURCE_TOTALS__.deleted[resource] = (window.__OPTICAL_LAB_RESOURCE_TOTALS__.deleted[resource] ?? 0) + 1;
          return remove(value);
        };
      }
    }
    return context;
  };
});
await cleanupPage.goto(`${baseUrl}/_visual/optical-lab`, { waitUntil: 'networkidle' });
await cleanupPage.locator('[data-optical-lab-exit="true"]').click();
await cleanupPage.waitForURL(`${baseUrl}/`);
const cleanup = await cleanupPage.evaluate(() => window.__OPENSCIENCE_OPTICAL_LAB__ ?? null);
assert.equal(cleanup?.activeRaf, false, 'renderer RAF must stop after route unmount');
assert.equal(cleanup?.contextStatus, 'disposed', 'renderer resources must be disposed after route unmount');
const cleanupResources = await cleanupPage.evaluate(() => window.__OPTICAL_LAB_RESOURCE_TOTALS__);
for (const [resource, created] of Object.entries(cleanupResources.created)) {
  assert.equal(cleanupResources.deleted[resource] ?? 0, created, `route cleanup leaked ${resource}`);
}
assert.equal(await cleanupPage.locator('[data-optical-lab-canvas="true"]').count(), 0, 'production homepage must not import the Lab renderer');
await cleanupPage.close();

await writeFile(path.join(outDir, 'metrics.json'), `${JSON.stringify(measurements, null, 2)}\n`, 'utf8');
await browser.close();
