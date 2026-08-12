/* global createImageBitmap, document, Event, fetch, getComputedStyle, HTMLCanvasElement, performance, process, queueMicrotask, setTimeout, window */

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { measureMsdfTypography, measureRestingMaterial } from './optical-lab-reference-metrics.mjs';
import { analyzeOpticalTopology } from './optical-lab-visual-metrics.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(scriptDir, 'out', 'optical-lab');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
const OPTICAL_LAB_RENDER_PHASES = Object.freeze({
  candidateBVisual: 'task-4-candidate-b-visual-v1',
  msdfGlyph: 'task-4-msdf-glyph-v1',
  restingMaterial: 'task-5-resting-material-v1',
  boundedFlow: 'task-6-bounded-flow-v1',
  acceptedFallback: 'task-7-accepted-fallback-v1',
  runtimeShell: 'task-3-runtime-shell-v1',
});
const OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: true,
  antialias: false,
  depth: true,
  powerPreference: 'default',
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  stencil: false,
});
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const measurements = [];
const cases = [
  { name: 'reference-desktop', width: 1672, height: 941, reducedMotion: 'no-preference' },
  { name: 'desktop', width: 1440, height: 900, reducedMotion: 'no-preference' },
  {
    name: 'resize-during-atlas-init',
    width: 1672,
    height: 941,
    reducedMotion: 'no-preference',
    dynamic: true,
    resizeDuringAtlasLoad: { width: 1440, height: 900 },
  },
  { name: 'webgl1-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'webgl1' },
  { name: 'webgl2-init-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'webgl2-init-failure' },
  { name: 'shader-compile-link-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'shader-failure' },
  { name: 'incomplete-framebuffer-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'framebuffer-incomplete' },
  { name: 'atlas-load-fallback', width: 900, height: 700, reducedMotion: 'no-preference', atlasFailure: true },
  { name: 'dom-fallback', width: 900, height: 700, reducedMotion: 'no-preference', forceContext: 'none' },
  { name: 'mobile', width: 390, height: 844, reducedMotion: 'no-preference' },
  { name: 'reduced', width: 1440, height: 900, reducedMotion: 'reduce' },
];

function createInkMask(image, threshold = 36) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    const pixel = index * 4;
    const luminance = image.pixels[pixel] * .2126
      + image.pixels[pixel + 1] * .7152
      + image.pixels[pixel + 2] * .0722;
    if (luminance >= threshold && image.pixels[pixel + 3] >= 32) mask[index] = 1;
  }
  return { height: image.height, mask, width: image.width };
}

function outsideTitleInkRatio(mask, title) {
  let outside = 0;
  let total = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.mask[y * mask.width + x]) continue;
      total += 1;
      if (x < title.left || x >= title.right || y < title.top || y >= title.bottom) outside += 1;
    }
  }
  return outside / Math.max(1, total);
}

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
        glyphDrawErrors: [],
        glyphDrawInkStates: [],
        glyphDraws: 0,
        atlasColorSpaceConversions: [],
        compileFailures: 0,
        compileFailureLogs: [],
        compileShaderCalls: 0,
        firstContextAcquisition: null,
        framebufferChecks: 0,
        instancedDraws: 0,
        instancedDrawErrors: [],
        instancedDrawInkStates: [],
        linkFailures: 0,
        linkProgramCalls: 0,
        preInstancedDrawErrors: [],
        pointDrawArrays: 0,
        pointDrawErrors: [],
        pointDrawInkStates: [],
        straightAlphaFrames: [],
      };
      window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = null;
      window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__ = 0;
      window.__OPTICAL_LAB_TEST_CONTROLLED_RAF_CALLBACKS__ = 0;
      window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__ = 0;
      window.__OPTICAL_LAB_TEST_HELD_RAF_CALLBACKS__ = 0;
      window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__ = null;
      window.__OPTICAL_LAB_TEST_POINTER_NOW_READS__ = 0;
      let controlledRendererFrameBudget = 0;
      let holdRaf = false;
      let forcedPointerNow = null;
      let nextHeldRafId = -1;
      const heldRafs = new Map();
      const requestAnimationFrame = window.requestAnimationFrame.bind(window);
      const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
      const performanceNow = performance.now.bind(performance);
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => {
          if (Number.isFinite(forcedPointerNow)) {
            window.__OPTICAL_LAB_TEST_POINTER_NOW_READS__ += 1;
            return forcedPointerNow;
          }
          return performanceNow();
        },
      });
      window.__OPTICAL_LAB_TEST_CONTROL_RAF__ = (timestamp, frameCount) => {
        window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = timestamp;
        controlledRendererFrameBudget = frameCount;
        holdRaf = false;
      };
      window.__OPTICAL_LAB_TEST_RELEASE_RAF__ = () => {
        window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__ = null;
        controlledRendererFrameBudget = 0;
        holdRaf = false;
        const queued = [...heldRafs.values()];
        heldRafs.clear();
        for (const callback of queued) window.requestAnimationFrame(callback);
      };
      window.__OPTICAL_LAB_TEST_RAF_STATE__ = () => ({
        controlledRendererFrameBudget,
        fixedTimestamp: window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__,
        heldRafCount: heldRafs.size,
        holdRaf,
      });
      window.requestAnimationFrame = (callback) => {
        if (holdRaf) {
          const heldId = nextHeldRafId;
          nextHeldRafId -= 1;
          heldRafs.set(heldId, callback);
          window.__OPTICAL_LAB_TEST_HELD_RAF_CALLBACKS__ += 1;
          return heldId;
        }
        let nativeId = 0;
        nativeId = requestAnimationFrame((timestamp) => {
          if (holdRaf) {
            heldRafs.set(nativeId, callback);
            window.__OPTICAL_LAB_TEST_HELD_RAF_CALLBACKS__ += 1;
            return;
          }
          window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__ += 1;
          const fixedTimestamp = window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__;
          if (Number.isFinite(fixedTimestamp) && controlledRendererFrameBudget > 0) {
            window.__OPTICAL_LAB_TEST_CONTROLLED_RAF_CALLBACKS__ += 1;
            callback(fixedTimestamp);
            return;
          }
          callback(timestamp);
        });
        return nativeId;
      };
      window.cancelAnimationFrame = (id) => {
        if (heldRafs.delete(id)) return;
        cancelAnimationFrame(id);
      };
      window.addEventListener('pointermove', () => {
        const pointerAt = performanceNow();
        window.__OPTICAL_LAB_TEST_LAST_POINTER_AT__ = pointerAt;
        window.__OPTICAL_LAB_TEST_POINTER_NOW_READS__ = 0;
        forcedPointerNow = pointerAt;
        setTimeout(() => {
          forcedPointerNow = null;
        }, 0);
      }, { capture: true, passive: true });
      const original = HTMLCanvasElement.prototype.getContext;
      const canvasIds = new WeakMap();
      let nextCanvasId = 1;
      const instrument = (context, type, canvas) => {
        if (!context || context.__opticalLabInstrumented) return context;
        context.__opticalLabInstrumented = true;
        if (!canvasIds.has(canvas)) canvasIds.set(canvas, nextCanvasId++);
        const canvasId = canvasIds.get(canvas);
        canvas.__opticalLabTestCanvasId = canvasId;
        const record = { canvasId, created: {}, deleted: {}, type };
        window.__OPTICAL_LAB_GL_TRACKER__.contexts.push(record);
        const pixelStorei = context.pixelStorei.bind(context);
        context.pixelStorei = (parameter, value) => {
          if (parameter === context.UNPACK_COLORSPACE_CONVERSION_WEBGL) {
            window.__OPTICAL_LAB_GL_TRACKER__.atlasColorSpaceConversions.push(value);
          }
          return pixelStorei(parameter, value);
        };
        const compileShader = context.compileShader.bind(context);
        context.compileShader = (...args) => {
          window.__OPTICAL_LAB_GL_TRACKER__.compileShaderCalls += 1;
          const result = compileShader(...args);
          if (!context.getShaderParameter(args[0], context.COMPILE_STATUS)) {
            window.__OPTICAL_LAB_GL_TRACKER__.compileFailures += 1;
            window.__OPTICAL_LAB_GL_TRACKER__.compileFailureLogs.push({
              log: context.getShaderInfoLog(args[0]),
              source: context.getShaderSource(args[0]),
            });
          }
          return result;
        };
        const linkProgram = context.linkProgram.bind(context);
        context.linkProgram = (...args) => {
          window.__OPTICAL_LAB_GL_TRACKER__.linkProgramCalls += 1;
          const result = linkProgram(...args);
          if (!context.getProgramParameter(args[0], context.LINK_STATUS)) {
            window.__OPTICAL_LAB_GL_TRACKER__.linkFailures += 1;
          }
          return result;
        };
        const checkFramebufferStatus = context.checkFramebufferStatus.bind(context);
        context.checkFramebufferStatus = (...args) => {
          window.__OPTICAL_LAB_GL_TRACKER__.framebufferChecks += 1;
          if (forceContext === 'framebuffer-incomplete') return context.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
          return checkFramebufferStatus(...args);
        };
        for (const resource of ['Shader', 'Program', 'Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Query']) {
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
        const recordGlyphDraw = (draw, args) => {
          let staleError = context.getError();
          while (staleError !== context.NO_ERROR && staleError !== context.CONTEXT_LOST_WEBGL) {
            window.__OPTICAL_LAB_GL_TRACKER__.glyphDrawErrors.push(staleError);
            staleError = context.getError();
          }
          const result = draw(...args);
          window.__OPTICAL_LAB_GL_TRACKER__.glyphDraws += 1;
          window.__OPTICAL_LAB_GL_TRACKER__.glyphDrawErrors.push(context.getError());
          if (
            window.__OPTICAL_LAB_GL_TRACKER__.straightAlphaFrames.length === 0
            && context.getParameter(context.FRAMEBUFFER_BINDING) === null
          ) {
            const pixels = new Uint8Array(context.canvas.width * context.canvas.height * 4);
            context.readPixels(0, 0, context.canvas.width, context.canvas.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
            let transparentRgb = 0;
            const whiteEdges = [];
            const vermilionEdges = [];
            for (let index = 0; index < pixels.length; index += 4) {
              const red = pixels[index];
              const green = pixels[index + 1];
              const blue = pixels[index + 2];
              const alpha = pixels[index + 3];
              if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) transparentRgb += 1;
              if (alpha < 32 || alpha > 224) continue;
              if (green >= red * .72 && blue >= red * .72) whiteEdges.push(Math.min(red, green, blue));
              if (red >= green * 2 && red >= blue * 2) vermilionEdges.push({ green, red });
            }
            const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
            window.__OPTICAL_LAB_GL_TRACKER__.straightAlphaFrames.push({
              transparentRgb,
              vermilionCount: vermilionEdges.length,
              vermilionGreen: mean(vermilionEdges.map(({ green }) => green)),
              vermilionRed: mean(vermilionEdges.map(({ red }) => red)),
              whiteCount: whiteEdges.length,
              whiteMinChannel: mean(whiteEdges),
            });
          }
          window.__OPTICAL_LAB_GL_TRACKER__.glyphDrawInkStates.push(
            document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-optical-ink') ?? null,
          );
          return result;
        };
        const drawArrays = context.drawArrays.bind(context);
        context.drawArrays = (...args) => {
          if (args[0] !== context.POINTS) return recordGlyphDraw(drawArrays, args);
          let staleError = context.getError();
          while (staleError !== context.NO_ERROR && staleError !== context.CONTEXT_LOST_WEBGL) {
            window.__OPTICAL_LAB_GL_TRACKER__.pointDrawErrors.push(staleError);
            staleError = context.getError();
          }
          const result = drawArrays(...args);
          window.__OPTICAL_LAB_GL_TRACKER__.pointDrawArrays += 1;
          window.__OPTICAL_LAB_GL_TRACKER__.pointDrawErrors.push(context.getError());
          window.__OPTICAL_LAB_GL_TRACKER__.pointDrawInkStates.push(
            document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-optical-ink') ?? null,
          );
          return result;
        };
        const drawElements = context.drawElements.bind(context);
        context.drawElements = (...args) => recordGlyphDraw(drawElements, args);
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
          queueMicrotask(() => {
            const stage = document.querySelector('[data-optical-lab-candidate-stage="true"]');
            window.__OPTICAL_LAB_GL_TRACKER__.instancedDrawInkStates.push(stage?.getAttribute('data-optical-ink') ?? null);
          });
          if (
            Number.isFinite(window.__OPTICAL_LAB_TEST_FIXED_RAF_TIME__)
            && controlledRendererFrameBudget > 0
          ) {
            controlledRendererFrameBudget -= 1;
            window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__ += 1;
            if (controlledRendererFrameBudget === 0) holdRaf = true;
          }
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
        if (forceContext === 'webgl2-init-failure' && type === 'webgl2') {
          const getParameter = context.getParameter.bind(context);
          let failedInitialization = false;
          context.getParameter = (parameter) => {
            if (!failedInitialization && parameter === context.MAX_COMBINED_TEXTURE_IMAGE_UNITS) {
              failedInitialization = true;
              throw new Error('forced OGL initialization failure');
            }
            return getParameter(parameter);
          };
        }
        return context;
      };
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...options) {
        if (
          window.__OPTICAL_LAB_GL_TRACKER__.firstContextAcquisition === null
          && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
        ) {
          window.__OPTICAL_LAB_GL_TRACKER__.firstContextAcquisition = {
            options: options[0] ? { ...options[0] } : null,
            type,
          };
        }
        if ((forceContext === 'webgl1' || forceContext === 'none') && type === 'webgl2') return null;
        if (forceContext === 'none' && (type === 'webgl' || type === 'experimental-webgl')) return null;
        const context = original.call(this, type, ...options);
        if (
          context
          && forceContext === 'shader-failure'
          && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
        ) {
          const shaderSource = context.shaderSource.bind(context);
          context.shaderSource = (shader, source) => shaderSource(shader, `${source}\nforced_invalid_shader_token`);
        }
        if (context && forceContext === 'webgl2-init-failure' && type === 'webgl2') {
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
  if (testCase.atlasFailure) {
    await page.route('**/optical-lab/atlas/*.png', (route) => route.abort('failed'));
  }
  let atlasRequestStarted;
  let releaseAtlasRequests;
  if (testCase.resizeDuringAtlasLoad) {
    let markAtlasRequestStarted;
    atlasRequestStarted = new Promise((resolve) => { markAtlasRequestStarted = resolve; });
    const atlasRequestsReleased = new Promise((resolve) => { releaseAtlasRequests = resolve; });
    await page.route('**/optical-lab/atlas/*.png', async (route) => {
      markAtlasRequestStarted();
      await atlasRequestsReleased;
      await route.continue();
    });
  }

  const navigation = page.goto(`${baseUrl}/_visual/optical-lab`, { waitUntil: 'networkidle' });
  if (testCase.resizeDuringAtlasLoad) {
    await atlasRequestStarted;
    await page.setViewportSize(testCase.resizeDuringAtlasLoad);
    releaseAtlasRequests();
  }
  const response = await navigation;
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
  const expectedDynamic = testCase.dynamic ?? (testCase.name === 'desktop' || testCase.name === 'reference-desktop');
  const renderPhase = await page.locator('[data-optical-lab-candidate-stage="true"]').getAttribute('data-optical-render-phase');

  const runTask3RuntimeShellAssertions = async () => {
    if (expectedDynamic) {
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
      return node?.getAttribute('data-context-status') === 'ready'
        && Number(node.getAttribute('data-frame-count') ?? 0) >= 2;
    }, undefined, { timeout: 5_000 });
    }
    const shell = await page.evaluate(() => {
    const diagnosticsNode = document.querySelector('[data-optical-lab-diagnostics="true"]');
    const stageNode = document.querySelector('[data-optical-lab-candidate-stage="true"]');
    const headline = document.querySelector('h1[data-optical-lab-semantic-title="true"]');
    const science = document.querySelector('[data-optical-lab-science="true"]');
    const evolves = document.querySelector('[data-optical-lab-evolves="true"]');
    const baseline = document.querySelector('[data-optical-lab-baseline-probe="true"]');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(headline);
    selection.removeAllRanges();
    selection.addRange(range);
    const selectedText = selection.toString();
    selection.removeAllRanges();
    const stageRect = stageNode.getBoundingClientRect();
    const scienceRect = science.getBoundingClientRect();
    const evolvesRect = evolves.getBoundingClientRect();
    const baselineRect = baseline.getBoundingClientRect();
    return {
      activeRaf: window.__OPENSCIENCE_OPTICAL_LAB__?.activeRaf ?? false,
      baseline: baselineRect.top - stageRect.top,
      canvasCount: document.querySelectorAll('canvas[data-optical-lab-canvas="true"]').length,
      contextCount: window.__OPTICAL_LAB_GL_TRACKER__.contexts.length,
      contextStatus: diagnosticsNode?.getAttribute('data-context-status'),
      firstCompleteFrame: diagnosticsNode?.getAttribute('data-first-complete-frame'),
      frameCount: Number(diagnosticsNode?.getAttribute('data-frame-count') ?? 0),
      firstContextAcquisition: window.__OPTICAL_LAB_GL_TRACKER__.firstContextAcquisition,
      ink: stageNode?.getAttribute('data-optical-ink'),
      mode: diagnosticsNode?.getAttribute('data-render-mode'),
      qualityTier: diagnosticsNode?.getAttribute('data-quality-tier'),
      selectedText,
      seamX: scienceRect.right - stageRect.left,
      evolvesX: evolvesRect.left - stageRect.left,
      stageWidth: stageRect.width,
    };
    });
    assert.equal(shell.selectedText, 'Science evolves.', `${testCase.name} must keep the exact selectable semantic heading`);
    if (testCase.width > 480 && testCase.reducedMotion !== 'reduce') {
      assert.deepEqual(
        shell.firstContextAcquisition,
        { options: OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES, type: 'webgl2' },
        `${testCase.name} first GL acquisition must use the shared WebGL2 context attributes`,
      );
    } else {
      assert.equal(
        shell.firstContextAcquisition,
        null,
        `${testCase.name} policy must not probe a GL context`,
      );
    }
    assert.equal(shell.firstCompleteFrame, 'false', `${testCase.name} shell must not claim a complete glyph/particle/composite frame`);
  assert.equal(shell.ink, 'dom', `${testCase.name} shell must preserve DOM ink`);
  assert(Math.abs(shell.seamX - shell.stageWidth * .58) <= 1, `${testCase.name} Science must end at the 58% aperture`);
  assert(Math.abs(shell.evolvesX - shell.stageWidth * .58) <= 1, `${testCase.name} evolves must start at the 58% aperture`);
  assert(Math.abs(shell.baseline - (await page.locator('[data-optical-lab-candidate-stage="true"]').evaluate((node) => node.getBoundingClientRect().height * .542))) <= 1, `${testCase.name} baseline must remain at 54.2%`);

  if (!expectedDynamic) {
    assert.equal(shell.mode, 'static-fallback', `${testCase.name} must choose the static fallback`);
    assert.equal(shell.canvasCount, 0, `${testCase.name} must mount no dynamic canvas`);
    assert.equal(shell.activeRaf, false, `${testCase.name} must schedule no renderer RAF`);
    if (testCase.forceContext === 'webgl1') {
      assert.equal(shell.contextCount, 0, 'forced WebGL1 must never initialize a dynamic context');
    }
  } else {
    assert.equal(shell.mode, 'webgl2-full', 'normal desktop must choose the WebGL2 full runtime');
    assert.equal(shell.contextStatus, 'ready', 'normal desktop OGL shell must become ready');
    assert.equal(shell.canvasCount, 1, 'normal desktop must mount exactly one canvas');
    assert.equal(shell.activeRaf, true, 'normal desktop must run one bounded renderer RAF chain');
    assert.equal(shell.qualityTier, 'shell', 'Task 3 must report the honest shell quality tier');
    assert(shell.frameCount >= 2, 'normal desktop shell must report real frames');
    assert(
      (await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__.contexts)).every((entry) => entry.type === 'webgl2'),
      'dynamic runtime must never initialize WebGL1',
    );

    const recoveryBefore = await page.evaluate(() => {
      const canvasNode = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
      const canvasId = canvasNode.__opticalLabTestCanvasId;
      const context = tracker.contexts.findLast((entry) => entry.canvasId === canvasId);
      const gl = canvasNode.getContext('webgl2');
      const lose = gl?.getExtension('WEBGL_lose_context');
      window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__ = lose;
      lose?.loseContext();
      return { canvasId, contextCount: tracker.contexts.length, created: { ...context.created } };
    });
    await page.waitForFunction(() => (
      document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status') === 'lost'
      && document.querySelectorAll('canvas[data-optical-lab-canvas="true"]').length === 0
      && window.__OPENSCIENCE_OPTICAL_LAB__?.activeRaf === false
    ), undefined, { timeout: 3_000 });
    await page.evaluate(() => window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__.restoreContext());
    await page.waitForFunction((before) => {
      const canvasNode = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      return document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status') === 'ready'
        && canvasNode?.__opticalLabTestCanvasId !== before.canvasId
        && window.__OPTICAL_LAB_GL_TRACKER__.contexts.length > before.contextCount;
    }, recoveryBefore, { timeout: 5_000 });
    const recoveryAfter = await page.evaluate((before) => {
      const canvasNode = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
      return {
        canvasId: canvasNode.__opticalLabTestCanvasId,
        contexts: tracker.contexts,
        oldContext: tracker.contexts.find((entry) => entry.canvasId === before.canvasId),
      };
    }, recoveryBefore);
    assert.notEqual(recoveryAfter.canvasId, recoveryBefore.canvasId, 'restoration must use a fresh canvas and context');
    assert(recoveryAfter.contexts.every((entry) => entry.type === 'webgl2'), 'restoration must not initialize WebGL1');
    for (const [resource, created] of Object.entries(recoveryBefore.created)) {
      assert.equal(recoveryAfter.oldContext.deleted[resource] ?? 0, created, `context loss leaked ${resource}`);
    }
  }
  measurements.push({ case: testCase.name, ...shell });
  await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
    assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
    await page.close();
  };

  const runTask5RestingMaterialAssertions = async () => {
    const stage = page.locator('[data-optical-lab-candidate-stage="true"]');
    const marker = page.locator('[data-optical-lab-evolves="true"] span span').last();
    const readGeometry = () => page.evaluate(() => {
      const stageNode = document.querySelector('[data-optical-lab-candidate-stage="true"]');
      const titleNode = document.querySelector('h1[data-optical-lab-semantic-title="true"]');
      const scienceNode = document.querySelector('[data-optical-lab-science="true"]');
      const evolvesNode = document.querySelector('[data-optical-lab-evolves="true"]');
      const baselineNode = document.querySelector('[data-optical-lab-baseline-probe="true"]');
      const stageRect = stageNode.getBoundingClientRect();
      const local = (node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: rect.bottom - stageRect.top,
          left: rect.left - stageRect.left,
          right: rect.right - stageRect.left,
          top: rect.top - stageRect.top,
        };
      };
      const title = local(titleNode);
      const science = local(scienceNode);
      const evolves = local(evolvesNode);
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(titleNode);
      selection.removeAllRanges();
      selection.addRange(range);
      const selectedText = selection.toString();
      selection.removeAllRanges();
      return {
        baselineY: baselineNode.getBoundingClientRect().top - stageRect.top,
        evolves,
        oneLine: getComputedStyle(titleNode).whiteSpace === 'nowrap'
          && Math.abs(science.right - evolves.left) <= 1
          && science.top < evolves.bottom
          && evolves.top < science.bottom,
        science,
        seamX: science.right,
        selectedText,
        title,
        viewport: { height: stageRect.height, width: stageRect.width },
      };
    });
    const assertGeometry = (geometry, label) => {
      const within = (value, target, tolerance) => Math.abs(value - target) <= tolerance;
      assert(within(geometry.title.left / geometry.viewport.width, .022, .01), `${label} title left drifted`);
      assert(within(geometry.title.right / geometry.viewport.width, .957, .01), `${label} title right drifted`);
      assert(within(geometry.baselineY / geometry.viewport.height, .542, .008), `${label} baseline drifted`);
      assert(within(geometry.seamX / geometry.viewport.width, .58, .005), `${label} seam drifted`);
      assert.equal(geometry.oneLine, true, `${label} must keep one visual line`);
      assert.equal(geometry.selectedText, 'Science evolves.', `${label} must keep exact selectable text`);
    };

    const initialGeometry = await readGeometry();
    assertGeometry(initialGeometry, testCase.name);
    assert.equal(await page.locator('h1').count(), 1, `${testCase.name} must expose exactly one h1`);

    if (!expectedDynamic) {
      await page.waitForFunction(() => {
        const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
        return node?.getAttribute('data-render-mode') !== 'webgl2-full';
      });
      assert.equal(await diagnostics.getAttribute('data-first-complete-frame'), 'false', `${testCase.name} static mode cannot publish GPU ink`);
      assert.equal(await stage.getAttribute('data-optical-ink'), 'dom', `${testCase.name} static mode must retain DOM ink`);
      assert.equal(await page.locator('canvas[data-optical-lab-canvas="true"]').count(), 0, `${testCase.name} static mode must remove its canvas`);
      assert.equal(await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_LAB__?.activeRaf ?? false), false, `${testCase.name} static mode must stop its RAF chain`);
      await page.waitForFunction(() => (
        document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-static-artwork') === 'loaded'
      ));
      const staticTracker = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
      for (const context of staticTracker.contexts) {
        for (const [resource, created] of Object.entries(context.created)) {
          assert.equal(context.deleted[resource] ?? 0, created, `${testCase.name} initialization failure leaked ${resource}`);
        }
      }
      assert.equal(
        await marker.evaluate((node) => getComputedStyle(node).color),
        'rgba(0, 0, 0, 0)',
        `${testCase.name} accepted artwork must replace duplicate DOM ink`,
      );
      assert.equal(
        await page.locator('[data-optical-lab-static-fallback="true"]').evaluate((node) => getComputedStyle(node).display),
        'block',
        `${testCase.name} must display the accepted resting artwork`,
      );
      measurements.push({
        case: testCase.name,
        failureEvidence: testCase.forceContext === 'shader-failure' || testCase.forceContext === 'framebuffer-incomplete'
          ? {
              compileFailures: staticTracker.compileFailures,
              compileShaderCalls: staticTracker.compileShaderCalls,
              contexts: staticTracker.contexts,
              framebufferChecks: staticTracker.framebufferChecks,
              glyphDraws: staticTracker.glyphDraws,
              linkFailures: staticTracker.linkFailures,
              linkProgramCalls: staticTracker.linkProgramCalls,
            }
          : null,
        geometry: initialGeometry,
        mode: await diagnostics.getAttribute('data-render-mode'),
      });
      await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
      if (testCase.atlasFailure) {
        assert(errors.length > 0, 'forced atlas failure must exercise the real texture error path');
      } else {
        assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
      }
      if (testCase.forceContext === 'shader-failure') {
        const tracker = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
        assert(tracker.compileShaderCalls >= 2, 'forced shader failure must execute real shader compile calls');
        assert(tracker.compileFailures >= 2, 'forced shader failure must produce real compile failures');
        assert(tracker.linkProgramCalls >= 1, 'forced shader failure must execute a real program link');
        assert(tracker.linkFailures >= 1, 'forced shader failure must produce a real link failure');
        assert.equal(tracker.glyphDraws, 0, 'an unlinked glyph program must not reach a draw');
      }
      if (testCase.forceContext === 'framebuffer-incomplete') {
        const tracker = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
        assert(tracker.framebufferChecks >= 1, 'forced incomplete framebuffer must execute a completeness check');
        assert.equal(tracker.glyphDraws, 0, 'an incomplete glyph target must not reach a draw');
      }
      await page.close();
      return;
    }

    try {
      await page.waitForFunction(() => {
        const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
        return node?.getAttribute('data-first-complete-frame') === 'true'
          && document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-optical-ink') === 'gpu';
      }, undefined, { timeout: 5_000 });
    } catch (error) {
      const evidence = await page.evaluate(() => ({
        diagnostics: document.querySelector('[data-optical-lab-diagnostics="true"]')?.outerHTML,
        stage: document.querySelector('[data-optical-lab-candidate-stage="true"]')?.outerHTML.slice(0, 600),
        tracker: window.__OPTICAL_LAB_GL_TRACKER__,
      }));
      throw new Error(`${testCase.name} MSDF publication timed out: ${JSON.stringify({ errors, evidence })}`, { cause: error });
    }

    assert.match(await diagnostics.getAttribute('data-quality-tier') ?? '', /^(full|reduced-particles|reduced-bloom)$/);
    assert.equal(await diagnostics.getAttribute('data-context-status'), 'ready');
    assert(Number(await diagnostics.getAttribute('data-particle-count')) > 0, 'Task 5 must publish mask-derived particles');
    if (
      renderPhase === OPTICAL_LAB_RENDER_PHASES.boundedFlow
      || renderPhase === OPTICAL_LAB_RENDER_PHASES.acceptedFallback
    ) {
      assert.match(
        await diagnostics.getAttribute('data-flow-texture') ?? '',
        /96x54-ping-pong/,
        'Task 6 must publish the bounded velocity flowmap',
      );
    } else {
      assert.equal(await diagnostics.getAttribute('data-flow-texture'), 'inactive', 'Task 5 must not publish a Task 6 flowmap');
    }
    assert.match(await diagnostics.getAttribute('data-precision') ?? '', /^rgba(16f|8)$/);
    assert.deepEqual(
      Object.keys(JSON.parse(await diagnostics.getAttribute('data-pass-energies') ?? '{}')).sort(),
      ['caustic', 'curtain', 'dissolution', 'intactGlyph', 'rightwardEmission'],
      'Task 5 must expose exactly five named resting pass energies',
    );
    const firstDraws = await page.evaluate(() => window.__OPTICAL_LAB_GL_TRACKER__);
    assert(firstDraws.glyphDraws >= 5, `${testCase.name} must complete mask, color, and composite draws`);
    assert(firstDraws.glyphDrawInkStates.slice(0, 5).every((ink) => ink === 'dom'), `${testCase.name} must retain DOM ink through the complete first GPU frame`);
    assert(firstDraws.glyphDrawErrors.every((error) => error === 0), `${testCase.name} glyph draw returned GL errors`);
    assert(
      firstDraws.atlasColorSpaceConversions.includes(0),
      `${testCase.name} must upload MSDF RGB channels without browser color-space conversion`,
    );

    let restingMaterial = null;
    if (testCase.name === 'reference-desktop') {
      const frameBeforeNative = Number(await diagnostics.getAttribute('data-frame-count'));
      await stage.evaluate(() => {
        const style = document.createElement('style');
        style.dataset.opticalLabNativeRestingProbe = 'true';
        style.textContent = `
          html, body { width: 1672px !important; height: 941px !important; margin: 0 !important; overflow: hidden !important; }
          [data-optical-lab="true"] { padding: 0 !important; }
          [data-optical-lab-candidate-stage="true"] {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483647 !important;
            width: 1672px !important;
            height: 941px !important;
            aspect-ratio: auto !important;
          }
        `;
        document.head.append(style);
        window.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction((before) => {
        const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
        const stageNode = document.querySelector('[data-optical-lab-candidate-stage="true"]');
        const bounds = stageNode?.getBoundingClientRect();
        return node?.getAttribute('data-first-complete-frame') === 'true'
          && Number(node.getAttribute('data-frame-count')) > before
          && Math.abs((bounds?.width ?? 0) - 1672) <= 1
          && Math.abs((bounds?.height ?? 0) - 941) <= 1;
      }, frameBeforeNative, { polling: 10, timeout: 5_000 });
      const nativeGeometry = await readGeometry();
      assertGeometry(nativeGeometry, `${testCase.name}/native-resting`);
      const nativeCandidate = await decodeScreenshot(
        page,
        await stage.screenshot({ path: path.join(outDir, 'desktop-resting.png') }),
      );
      assert.equal(nativeCandidate.width, 1672, 'desktop-resting.png must preserve native reference width');
      assert.equal(nativeCandidate.height, 941, 'desktop-resting.png must preserve native reference height');
      const targetNative = await decodeScreenshot(
        page,
        await readFile(path.resolve(scriptDir, '../../public/optical-lab/target-reference.png')),
      );
      assert.equal(targetNative.width, 1672, 'target-reference.png must preserve native width');
      assert.equal(targetNative.height, 941, 'target-reference.png must preserve native height');
      restingMaterial = measureRestingMaterial({
        apertureX: .58,
        candidate: nativeCandidate,
        target: targetNative,
      });
      assert(restingMaterial.intactGlyphContinuity >= .88, `native intact glyph continuity is too low: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.dissolutionTransfer >= .55, `native dissolution transfer is too low: ${JSON.stringify(restingMaterial)}`);
      assert(
        restingMaterial.curtainCoverage >= restingMaterial.targetCurtainCoverage * .75,
        `native curtain coverage is too low: ${JSON.stringify(restingMaterial)}`,
      );
      assert(
        restingMaterial.causticWidth >= .04 && restingMaterial.causticWidth <= .06,
        `native caustic width must stay within 4–6vw: ${JSON.stringify(restingMaterial)}`,
      );
      assert(restingMaterial.causticCenterError <= .005, `native caustic center drifted: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.rightwardEnergyRatio >= 1.25, `native rightward energy is too weak: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.leftwardEmissionRatio <= .12, `native leftward emission is too strong: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.maskedStructuralSimilarity >= .62, `native masked similarity is too low: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenRingScore < .72, `native frame contains a ring: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenSymmetricFanScore < .42, `native frame contains a symmetric fan: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenMechanicalLineScore < .42, `native frame contains a mechanical divider: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenStaircaseCausticScore < .12, `native frame contains a staircase caustic: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenUniformDotScore < .42, `native frame contains a uniform-dot curtain: ${JSON.stringify(restingMaterial)}`);
      assert(restingMaterial.forbiddenDuplicateTitleScore < .42, `native frame contains duplicate title ink: ${JSON.stringify(restingMaterial)}`);
      const frameBeforeRestore = Number(await diagnostics.getAttribute('data-frame-count'));
      await page.locator('style[data-optical-lab-native-resting-probe="true"]').evaluate((node) => node.remove());
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForFunction((before) => {
        const diagnosticsNode = document.querySelector('[data-optical-lab-diagnostics="true"]');
        const bounds = document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getBoundingClientRect();
        return diagnosticsNode?.getAttribute('data-first-complete-frame') === 'true'
          && Number(diagnosticsNode.getAttribute('data-frame-count')) > before
          && (bounds?.width ?? 1672) < 1000;
      }, frameBeforeRestore, { polling: 10, timeout: 5_000 });
    }
    assert.equal(firstDraws.instancedDraws, 0, 'Task 5 uses OGL GPGPU point state, not the rejected instanced Candidate B pass');
    assert(firstDraws.pointDrawArrays > 0, 'Task 5 must execute a real GPGPU-backed POINTS draw');
    assert(firstDraws.pointDrawErrors.every((error) => error === 0), 'Task 5 point draws must be GL-error free');
    assert.equal(firstDraws.pointDrawInkStates[0], 'dom', 'DOM ink must remain visible through the first particle draw');

    const straightAlpha = firstDraws.straightAlphaFrames[0];
    assert(straightAlpha, `${testCase.name} must capture the drawing buffer inside the complete composite draw`);
    assert.equal(straightAlpha.transparentRgb, 0, `${testCase.name} transparent drawing-buffer pixels must stay chroma-free`);
    assert(straightAlpha.whiteCount > 20, `${testCase.name} must expose measurable white antialiasing pixels`);
    assert(straightAlpha.whiteMinChannel >= 220, `${testCase.name} white edges are double attenuated: ${JSON.stringify(straightAlpha)}`);
    assert(straightAlpha.vermilionCount > 0, `${testCase.name} must expose measurable vermilion antialiasing pixels`);
    assert(straightAlpha.vermilionRed >= 245, `${testCase.name} vermilion red edges are double attenuated: ${JSON.stringify(straightAlpha)}`);
    assert(straightAlpha.vermilionGreen >= 65, `${testCase.name} vermilion edge chroma collapsed: ${JSON.stringify(straightAlpha)}`);

    await stage.scrollIntoViewIfNeeded();
    const materialFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-resting-material.png`) }),
    );
    if (renderPhase === OPTICAL_LAB_RENDER_PHASES.boundedFlow && testCase.name === 'reference-desktop') {
      const bounds = await stage.boundingBox();
      assert(bounds, 'Task 6 pointer captures require candidate bounds');
      const activeFrames = [];
      for (const [position, factor] of [['left', .22], ['slit', .58], ['right', .82]]) {
        await page.mouse.move(bounds.x + bounds.width * factor, bounds.y + bounds.height * .52);
        await page.waitForTimeout(150);
        activeFrames.push(await decodeScreenshot(
          page,
          await stage.screenshot({ path: path.join(outDir, `desktop-${position}-150ms.png`) }),
        ));
      }
      for (let index = 1; index < activeFrames.length; index += 1) {
        const difference = compareScreenshots(activeFrames[index - 1], activeFrames[index]);
        assert(
          difference.meanChannelDifference > 0,
          `Task 6 pointer positions must produce distinct frames: ${JSON.stringify(difference)}`,
        );
      }
      await page.waitForTimeout(650);
      const recoveredFrame = await decodeScreenshot(
        page,
        await stage.screenshot({ path: path.join(outDir, 'desktop-recovered-650ms.png') }),
      );
      const recoveredDifference = compareScreenshots(materialFrame, recoveredFrame);
      assert(
        recoveredDifference.meanChannelDifference < .25 && recoveredDifference.changedRatio < .01,
        `Task 6 must recover to the resting composition: ${JSON.stringify(recoveredDifference)}`,
      );
    }
    const frameBeforeGlyphProbe = Number(await diagnostics.getAttribute('data-frame-count'));
    await stage.evaluate((node) => { node.dataset.opticalLabGlyphParityProbe = 'all'; });
    await page.waitForFunction((before) => Number(
      document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-frame-count'),
    ) > before, frameBeforeGlyphProbe);
    const gpuFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-msdf-glyph.png`) }),
    );
    const frameBeforeEvolvesProbe = Number(await diagnostics.getAttribute('data-frame-count'));
    await stage.evaluate((node) => { node.dataset.opticalLabGlyphParityProbe = 'evolves'; });
    await page.waitForFunction((before) => Number(
      document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-frame-count'),
    ) > before, frameBeforeEvolvesProbe);
    const evolvesGpuFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-evolves-msdf-glyph.png`) }),
    );
    await stage.evaluate(() => {
      const style = document.createElement('style');
      style.dataset.opticalLabDomParityProbe = 'true';
      style.textContent = `
        [data-optical-lab-candidate-stage="true"]::before { display: none !important; }
        [data-optical-lab-candidate-stage="true"] canvas { visibility: hidden !important; }
        [data-optical-lab-candidate-stage="true"] h1,
        [data-optical-lab-candidate-stage="true"] h1 * { color: #f1eee7 !important; }
        [data-optical-lab-evolves="true"] span span { color: #ff4e22 !important; }
      `;
      document.head.append(style);
    });
    const domFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-dom-parity.png`) }),
    );
    await stage.evaluate(() => {
      const style = document.createElement('style');
      style.dataset.opticalLabEvolvesParityProbe = 'true';
      style.textContent = '[data-optical-lab-science="true"] { visibility: hidden !important; }';
      document.head.append(style);
    });
    const evolvesDomFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-evolves-dom-parity.png`) }),
    );
    await page.locator('style[data-optical-lab-evolves-parity-probe="true"]').evaluate((node) => node.remove());
    await page.locator('style[data-optical-lab-dom-parity-probe="true"]').evaluate((node) => node.remove());
    const frameBeforeMaterialRestore = Number(await diagnostics.getAttribute('data-frame-count'));
    await stage.evaluate((node) => { delete node.dataset.opticalLabGlyphParityProbe; });
    await page.waitForFunction((before) => Number(
      document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-frame-count'),
    ) > before, frameBeforeMaterialRestore);
    const gpuMask = createInkMask(gpuFrame);
    const domMask = createInkMask(domFrame);
    const typography = measureMsdfTypography({
      ...initialGeometry,
      domMask,
      msdfMask: gpuMask,
    });
    const evolvesTypography = measureMsdfTypography({
      ...initialGeometry,
      domMask: createInkMask(evolvesDomFrame),
      msdfMask: createInkMask(evolvesGpuFrame),
    });
    assert(typography.occupiedColumnContinuity >= .6, `${testCase.name} MSDF occupied columns are discontinuous: ${JSON.stringify(typography)}`);
    assert(typography.edgeBoundsOverlapWithDom >= .9, `${testCase.name} MSDF/DOM outer edges drifted: ${JSON.stringify(typography)}`);
    assert(typography.edgeOverlapWithDom >= .9, `${testCase.name} MSDF/DOM edge overlap is too low: ${JSON.stringify(typography)}`);
    assert(typography.scienceEdgeOverlapWithDom >= .9, `${testCase.name} Science silhouette overlap is too low: ${JSON.stringify(typography)}`);
    assert(evolvesTypography.evolvesEdgeOverlapWithDom >= .9, `${testCase.name} isolated evolves silhouette overlap is too low: ${JSON.stringify(evolvesTypography)}`);
    assert(outsideTitleInkRatio(createInkMask(materialFrame), initialGeometry.title) > .01, `${testCase.name} must contain Task 5 energy outside the title`);
    let vermilionPixels = 0;
    for (let index = 0; index < gpuFrame.pixels.length; index += 4) {
      const red = gpuFrame.pixels[index];
      const green = gpuFrame.pixels[index + 1];
      const blue = gpuFrame.pixels[index + 2];
      if (red >= 120 && red > green * 1.35 && red > blue * 1.35) vermilionPixels += 1;
    }
    assert(vermilionPixels > 0, `${testCase.name} GPU period must remain vermilion`);
    assert.equal(await page.locator('[data-optical-lab-canvas-host="true"]').evaluate((node) => getComputedStyle(node).pointerEvents), 'none');

    let resizedGeometry = null;
    if (testCase.name === 'reference-desktop') {
      const boundsBeforeResize = await diagnostics.getAttribute('data-stable-bounds');
      const frameBeforeResize = Number(await diagnostics.getAttribute('data-frame-count'));
      await diagnostics.evaluate((node) => {
        window.__OPTICAL_LAB_RESIZE_PUBLICATION__ = [];
        window.__OPTICAL_LAB_RESIZE_OBSERVER__ = new window.MutationObserver(() => {
          window.__OPTICAL_LAB_RESIZE_PUBLICATION__.push({
            bounds: node.getAttribute('data-stable-bounds'),
            complete: node.getAttribute('data-first-complete-frame'),
          });
        });
        window.__OPTICAL_LAB_RESIZE_OBSERVER__.observe(node, {
          attributeFilter: ['data-first-complete-frame', 'data-stable-bounds'],
          attributes: true,
        });
        let releaseFontMeasurement;
        const heldReady = new Promise((resolve) => { releaseFontMeasurement = resolve; });
        Object.defineProperty(document.fonts, 'ready', { configurable: true, value: heldReady });
        window.__OPTICAL_LAB_RELEASE_RESIZE_MEASUREMENT__ = () => {
          Reflect.deleteProperty(document.fonts, 'ready');
          releaseFontMeasurement();
        };
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => window.__OPTICAL_LAB_RESIZE_PUBLICATION__.some(({ complete }) => complete === 'false'));
      await page.waitForTimeout(80);
      await page.evaluate(() => window.__OPTICAL_LAB_RELEASE_RESIZE_MEASUREMENT__());
      await page.waitForFunction(({ boundsBeforeResize, frameBeforeResize }) => {
        const node = document.querySelector('[data-optical-lab-diagnostics="true"]');
        return node?.getAttribute('data-first-complete-frame') === 'true'
          && node.getAttribute('data-stable-bounds') !== boundsBeforeResize
          && Number(node.getAttribute('data-frame-count')) > frameBeforeResize;
      }, { boundsBeforeResize, frameBeforeResize });
      const resizePublication = await page.evaluate(() => {
        window.__OPTICAL_LAB_RESIZE_OBSERVER__.disconnect();
        return window.__OPTICAL_LAB_RESIZE_PUBLICATION__;
      });
      const retractionIndex = resizePublication.findIndex(({ complete }) => complete === 'false');
      assert(retractionIndex >= 0, 'resize must retract GPU ink before drawing the new layout');
      assert(
        resizePublication.slice(retractionIndex + 1).every(({ bounds, complete }) => (
          complete !== 'true' || bounds !== boundsBeforeResize
        )),
        'resize must not republish a complete frame with stale DOM bounds',
      );
      resizedGeometry = await readGeometry();
      assertGeometry(resizedGeometry, `${testCase.name}/resize`);
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-resized-msdf-glyph.png`) });

      const recoveryBefore = await page.evaluate(() => {
        const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
        const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
        const canvasId = canvas.__opticalLabTestCanvasId;
        const context = tracker.contexts.findLast((entry) => entry.canvasId === canvasId);
        const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__ = lose;
        const value = { canvasId, contextCount: tracker.contexts.length, created: { ...context.created } };
        lose.loseContext();
        return value;
      });
      await page.waitForFunction(() => (
        document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-optical-ink') === 'dom'
        && document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status') === 'lost'
      ));
      await page.evaluate(() => window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__.restoreContext());
      await page.waitForFunction((before) => {
        const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
        return canvas?.__opticalLabTestCanvasId !== before.canvasId
          && document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-first-complete-frame') === 'true';
      }, recoveryBefore);
      const recoveryAfter = await page.evaluate((before) => {
        const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
        const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
        return {
          canvasId: canvas.__opticalLabTestCanvasId,
          oldContext: tracker.contexts.find((entry) => entry.canvasId === before.canvasId),
        };
      }, recoveryBefore);
      assert.notEqual(recoveryAfter.canvasId, recoveryBefore.canvasId, 'context restore must use a fresh canvas');
      for (const [resource, created] of Object.entries(recoveryBefore.created)) {
        assert.equal(recoveryAfter.oldContext.deleted[resource] ?? 0, created, `context restore leaked ${resource}`);
      }
      assertGeometry(await readGeometry(), `${testCase.name}/restore`);
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-restored-msdf-glyph.png`) });
    }

    measurements.push({ case: testCase.name, geometry: initialGeometry, resizedGeometry, restingMaterial, straightAlpha, typography });
    await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
    assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
    await page.close();
  };

  const runCandidateBVisualPhaseAssertions = async () => {
    const marker = page.locator('[data-optical-lab-evolves="true"] > span');
  const semanticHeadline = page.locator('h1[data-optical-lab-semantic-title="true"]');
  if (testCase.name === 'desktop' || testCase.name === 'dom-fallback') {
    await semanticHeadline.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    const dragEndpoints = await semanticHeadline.evaluate((headline) => {
      const science = headline.querySelector('[data-optical-lab-science="true"]')?.firstChild;
      const markerNode = headline.querySelector('[data-optical-lab-evolves="true"] > span')?.firstChild;
      if (!science || !markerNode) return null;
      const firstCharacter = document.createRange();
      firstCharacter.setStart(science, 0);
      firstCharacter.setEnd(science, 1);
      const lastCharacter = document.createRange();
      lastCharacter.setStart(markerNode, 0);
      lastCharacter.setEnd(markerNode, markerNode.textContent?.length ?? 0);
      const first = firstCharacter.getBoundingClientRect();
      const last = lastCharacter.getBoundingClientRect();
      return {
        end: { x: last.right - last.width * .1, y: last.top + last.height * .5 },
        start: { x: first.left + first.width * .1, y: first.top + first.height * .5 },
      };
    });
    assert(dragEndpoints, `${testCase.name} semantic headline must have selectable character bounds`);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.mouse.move(dragEndpoints.start.x, dragEndpoints.start.y);
    await page.mouse.down();
    await page.mouse.move(dragEndpoints.end.x, dragEndpoints.end.y, { steps: 24 });
    await page.mouse.up();
    const selectedText = await semanticHeadline.evaluate(() => window.getSelection()?.toString() ?? '');
    assert.equal(
      selectedText,
      'Science evolves.',
      `${testCase.name} real mouse drag must select the exact semantic heading through the visual overlay`,
    );
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
  }
  let restingTopology = null;
  let targetTopology = null;
  let activePairwise = null;
  if (
    testCase.reducedMotion === 'reduce'
    || testCase.width <= 480
    || testCase.forceContext === 'none'
    || testCase.forceContext === 'shader-failure'
  ) {
    assert.equal(mode, 'static-fallback', `${testCase.name} must use the stable DOM/static fallback`);
    assert.equal(await page.locator('canvas[data-optical-lab-canvas="true"]').count(), 0, `${testCase.name} must not start a GPU loop`);
    await page.waitForFunction(() => (
      document.querySelector('[data-optical-lab-candidate-stage="true"]')?.getAttribute('data-static-artwork') === 'loaded'
    ));
    assert.equal(
      await marker.evaluate((node) => getComputedStyle(node).color),
      'rgba(0, 0, 0, 0)',
      `${testCase.name} accepted artwork must suppress duplicate DOM ink after loading`,
    );
    assert.equal(
      await page.locator('[data-optical-lab-static-fallback="true"]').evaluate((node) => getComputedStyle(node).display),
      'block',
      `${testCase.name} must display the accepted resting artwork`,
    );
  } else {
    if (testCase.forceContext === 'webgl1' || testCase.forceContext === 'webgl2-init-failure') {
      assert.equal(mode, 'static-fallback', `${testCase.name} must fail closed to the static fallback`);
    }
    else assert.equal(mode, 'webgl2-full', 'desktop must choose the reviewed WebGL2 full path');
    assert.equal(contextStatus, 'ready', 'desktop context must become ready');
    const gpuMarkerStyle = await marker.evaluate((node) => ({
      color: getComputedStyle(node).color,
      selectionColor: getComputedStyle(node, '::selection').color,
    }));
    assert.equal(gpuMarkerStyle.color, 'rgba(0, 0, 0, 0)', `${testCase.name} GPU ink must hide the DOM period`);
    assert.equal(
      gpuMarkerStyle.selectionColor,
      'rgb(255, 78, 34)',
      `${testCase.name} GPU ink must preserve vermilion marker selection`,
    );
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
    assert.equal(
      initialDrawEvidence.instancedDrawInkStates[0],
      'gpu',
      `${testCase.name} must switch to GPU ink immediately after the first complete particle draw`,
    );
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
    assert(
      Number(await diagnostics.getAttribute('data-particle-count')) <= 3_840,
      'desktop particle budget must retain the existing 3,840 hard cap',
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
        window.__OPTICAL_LAB_TEST_RELEASE_RAF__();
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
        window.__OPTICAL_LAB_TEST_CONTROL_RAF__(fixedTimestamp, 1);
        return {
          callbackCount: window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__,
          controlledCallbackCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RAF_CALLBACKS__,
          controlledRendererFrameCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__,
          drawCount: window.__OPTICAL_LAB_GL_TRACKER__.instancedDraws,
          fixedTimestamp,
          heldCallbackCount: window.__OPTICAL_LAB_TEST_HELD_RAF_CALLBACKS__,
          lastPointerAt,
          pointerNowReads: window.__OPTICAL_LAB_TEST_POINTER_NOW_READS__,
        };
      });
      let screenshot;
      try {
        assert.equal(
          controlledSample.fixedTimestamp - controlledSample.lastPointerAt,
          150,
          `${testCase.name}/${position} must sample exactly 150ms after the real pointer event`,
        );
        try {
          await page.waitForFunction(
            ({ controlledRendererFrameCount, drawCount }) => (
              window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__ >= controlledRendererFrameCount + 1
              && window.__OPTICAL_LAB_GL_TRACKER__.instancedDraws >= drawCount + 1
            ),
            controlledSample,
            { polling: 10, timeout: 3_000 },
          );
        } catch (error) {
          const clockEvidence = await page.evaluate(() => ({
            callbackCount: window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__,
            controlledCallbackCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RAF_CALLBACKS__,
            controlledRendererFrameCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__,
            drawCount: window.__OPTICAL_LAB_GL_TRACKER__.instancedDraws,
            state: window.__OPTICAL_LAB_TEST_RAF_STATE__(),
          }));
          throw new Error(`${testCase.name}/${position} controlled renderer frame timed out: ${JSON.stringify(clockEvidence)}`, { cause: error });
        }
        const current = await diagnostics.evaluate((node) => ({
          apertureX: Number(node.getAttribute('data-aperture-x')),
          mode: node.getAttribute('data-render-mode'),
        }));
        assert(Math.abs(current.apertureX - 0.58) < 0.0001, `${position} frame must retain the fixed slit`);
        assert.equal(current.mode, mode, `${position} frame must not change renderer mode`);
        screenshot = await stage.screenshot({ path: path.join(outDir, `${testCase.name}-${position}-150ms.png`) });
        const heldEvidence = await page.evaluate(() => ({
          callbackCount: window.__OPTICAL_LAB_TEST_RAF_CALLBACKS__,
          controlledCallbackCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RAF_CALLBACKS__,
          controlledRendererFrameCount: window.__OPTICAL_LAB_TEST_CONTROLLED_RENDERER_FRAMES__,
          drawCount: window.__OPTICAL_LAB_GL_TRACKER__.instancedDraws,
          heldCallbackCount: window.__OPTICAL_LAB_TEST_HELD_RAF_CALLBACKS__,
        }));
        assert(
          controlledSample.pointerNowReads >= 1,
          `${testCase.name}/${position} renderer must read the captured pointer event timestamp`,
        );
        assert(
          heldEvidence.controlledCallbackCount > controlledSample.controlledCallbackCount,
          `${testCase.name}/${position} must execute a fixed-time RAF callback`,
        );
        assert.equal(
          heldEvidence.controlledRendererFrameCount - controlledSample.controlledRendererFrameCount,
          1,
          `${testCase.name}/${position} must execute exactly one authorized fixed-time renderer frame`,
        );
        assert.equal(
          heldEvidence.drawCount - controlledSample.drawCount,
          1,
          `${testCase.name}/${position} must render exactly one controlled 150ms particle frame during capture`,
        );
        assert(
          heldEvidence.heldCallbackCount > controlledSample.heldCallbackCount,
          `${testCase.name}/${position} must hold the renderer's queued follow-up RAF during capture`,
        );
      } finally {
        await page.evaluate(() => {
          window.__OPTICAL_LAB_TEST_RELEASE_RAF__();
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
    activePairwise = {};
    for (const [first, second] of [['left', 'slit'], ['slit', 'right']]) {
      const difference = compareScreenshots(pointerFrames.get(first), pointerFrames.get(second));
      activePairwise[`${first}/${second}`] = difference;
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

    const recoveryBefore = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
      if (!(canvas instanceof HTMLCanvasElement)) return { tested: false };
      const canvasId = canvas.__opticalLabTestCanvasId;
      const context = tracker.contexts.findLast((entry) => entry.canvasId === canvasId);
      if (!context) return { tested: false };
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const lose = gl?.getExtension('WEBGL_lose_context');
      if (!lose) return { tested: false };
      window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__ = lose;
      const before = {
        canvasId,
        contextCount: tracker.contexts.length,
        created: { ...context.created },
        drawCount: tracker.instancedDraws,
        drawErrorCount: tracker.instancedDrawErrors.length,
        tested: true,
      };
      lose.loseContext();
      return before;
    });
    assert.equal(recoveryBefore.tested, true, `${testCase.name} cannot verify context loss because WEBGL_lose_context is unavailable`);
    await page.waitForFunction(() => (
      document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status') === 'lost'
    ), undefined, { polling: 10, timeout: 3_000 });
    const lost = await diagnostics.getAttribute('data-context-status');
    await page.evaluate(() => window.__OPTICAL_LAB_TEST_CONTEXT_LOSS_EXTENSION__.restoreContext());
    await page.waitForFunction((before) => {
      const diagnostics = document.querySelector('[data-optical-lab-diagnostics="true"]');
      const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
      return diagnostics?.getAttribute('data-context-status') === 'ready'
        && canvas?.__opticalLabTestCanvasId !== before.canvasId
        && tracker.contexts.length > before.contextCount
        && tracker.instancedDraws > before.drawCount
        && tracker.instancedDrawErrors.length > before.drawErrorCount;
    }, recoveryBefore, { polling: 10, timeout: 5_000 });
    const recoveryAfter = await page.evaluate((before) => {
      const canvas = document.querySelector('canvas[data-optical-lab-canvas="true"]');
      const tracker = window.__OPTICAL_LAB_GL_TRACKER__;
      return {
        canvasId: canvas?.__opticalLabTestCanvasId ?? null,
        contexts: tracker.contexts.map((context) => ({
          canvasId: context.canvasId,
          created: { ...context.created },
          deleted: { ...context.deleted },
          type: context.type,
        })),
        drawCount: tracker.instancedDraws,
        freshDrawErrors: tracker.instancedDrawErrors.slice(before.drawErrorCount),
        restored: document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-context-status'),
      };
    }, recoveryBefore);
    const newContexts = recoveryAfter.contexts.slice(recoveryBefore.contextCount);
    const newContext = newContexts.find((context) => context.canvasId === recoveryAfter.canvasId);
    const oldContext = recoveryAfter.contexts.find((context) => context.canvasId === recoveryBefore.canvasId);
    assert.equal(lost, 'lost', 'context loss must expose a DOM fallback state');
    assert.equal(recoveryAfter.restored, 'ready', 'context restoration must reinitialize the renderer');
    assert(newContext, `${testCase.name} restoration must create a new tracked GL context for the restored canvas`);
    assert.notEqual(recoveryAfter.canvasId, recoveryBefore.canvasId, `${testCase.name} restoration must mount a fresh canvas`);
    assert(oldContext, `${testCase.name} loss must retain the old context resource ledger`);
    assert.deepEqual(oldContext.created, recoveryBefore.created, `${testCase.name} old context must not allocate after loss`);
    for (const [resource, created] of Object.entries(recoveryBefore.created)) {
      assert.equal(
        oldContext.deleted[resource] ?? 0,
        created,
        `${testCase.name} context restoration leaked old ${resource}`,
      );
    }
    assert(recoveryAfter.drawCount > recoveryBefore.drawCount, `${testCase.name} restoration must issue a fresh instanced draw`);
    assert(recoveryAfter.freshDrawErrors.length > 0, `${testCase.name} restoration must record a fresh instanced draw error`);
    assert(
      recoveryAfter.freshDrawErrors.every((error) => error === 0),
      `${testCase.name} restored instanced draw returned GL errors: ${JSON.stringify(recoveryAfter.freshDrawErrors)}`,
    );
    const restoredFrame = await decodeScreenshot(
      page,
      await stage.screenshot({ path: path.join(outDir, `${testCase.name}-restored.png`) }),
    );
    const restoredTopology = analyzeOpticalTopology(restoredFrame, .58);
    assert(
      restoredTopology.verticalCurtainCoverage > 0 && restoredTopology.verticalCurtainSpread > 0,
      `${testCase.name} restoration must render a nonzero particle curtain: ${JSON.stringify(restoredTopology)}`,
    );
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
  measurements.push({ case: testCase.name, activePairwise, restingTopology, targetTopology, ...snapshot });
  await page.screenshot({ fullPage: true, path: path.join(outDir, `${testCase.name}.png`) });
  assert.deepEqual(errors, [], `${testCase.name} emitted browser errors: ${errors.join(' | ')}`);
    await page.close();
  };

  if (renderPhase === OPTICAL_LAB_RENDER_PHASES.runtimeShell) {
    await runTask3RuntimeShellAssertions();
  } else if (renderPhase === OPTICAL_LAB_RENDER_PHASES.msdfGlyph) {
    await runTask5RestingMaterialAssertions();
  } else if (renderPhase === OPTICAL_LAB_RENDER_PHASES.restingMaterial) {
    await runTask5RestingMaterialAssertions();
  } else if (renderPhase === OPTICAL_LAB_RENDER_PHASES.boundedFlow) {
    await runTask5RestingMaterialAssertions();
  } else if (renderPhase === OPTICAL_LAB_RENDER_PHASES.acceptedFallback) {
    await runTask5RestingMaterialAssertions();
  } else if (renderPhase === OPTICAL_LAB_RENDER_PHASES.candidateBVisual) {
    await runCandidateBVisualPhaseAssertions();
  } else {
    assert.fail(
      `${testCase.name} declared unreviewed Optical Lab render phase ${JSON.stringify(renderPhase)}; `
      + 'advance the production marker and this explicit gate together',
    );
  }
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
    for (const resource of ['Shader', 'Program', 'Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'VertexArray', 'Query']) {
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
await cleanupPage.waitForFunction(() => (
  document.querySelector('[data-optical-lab-diagnostics="true"]')?.getAttribute('data-first-complete-frame') === 'true'
));
await cleanupPage.locator('[data-optical-lab-exit="true"]').click();
await cleanupPage.waitForURL(`${baseUrl}/`);
await cleanupPage.waitForFunction(() => (
  window.__OPENSCIENCE_OPTICAL_LAB__?.activeRaf === false
  && window.__OPENSCIENCE_OPTICAL_LAB__?.contextStatus === 'disposed'
));
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
