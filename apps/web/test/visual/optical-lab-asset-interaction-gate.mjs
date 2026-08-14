/* global Buffer, Event, EventTarget, HTMLCanvasElement, HTMLImageElement, PointerEvent, WebGL2RenderingContext, createImageBitmap, document, fetch, getComputedStyle, performance, process, setTimeout, window */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '../..');
const outDir = path.resolve(scriptDir, 'out', 'optical-lab', 'asset-interaction');
const acceptedBaselinePath = path.resolve(
  scriptDir,
  'fixtures',
  'optical-lab-asset-accepted-1672x941.png',
);
const energyPlatePath = path.resolve(webRoot, 'public', 'optical-lab', 'energy-plate-black-alpha-v1.png');
const externalBaseUrl = process.env.OPTICAL_LAB_ASSET_INTERACTION_BASE_URL?.replace(/\/$/, '');
const patchFollowProof = process.env.OPTICAL_LAB_ASSET_PATCH_FOLLOW_PROOF === '1';
const radialHaloMutation = process.env.OPTICAL_LAB_ASSET_RADIAL_HALO_MUTATION === '1';
const fixedCenterMutation = process.env.OPTICAL_LAB_ASSET_FIXED_CENTER_MUTATION === '1';
const overlaySkipDrawMutation = process.env.OPTICAL_LAB_ASSET_OVERLAY_SKIP_DRAW_MUTATION === '1';
const overlayMaskProof = process.env.OPTICAL_LAB_ASSET_OVERLAY_MASK_PROOF === '1';
const overlayCentroidLimit = .04;
const visibleCentroidLimit = .08;
const localityFloor = .80;
const spatialSamplePhases = [0, .25, .5, .75];
const port = Number(process.env.OPTICAL_LAB_ASSET_INTERACTION_PORT ?? 3065);
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const assetRoute = `${baseUrl}/_visual/optical-lab?candidate=asset`;
const nextCli = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

async function assertPortIsAvailable() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => reject(new Error(
      `Asset interaction gate refuses pre-existing listener on ${port}: ${error.message}`,
    )));
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
const fixedCenterMutationComplete = new Error('fixed-centre mutation proof complete');
const overlaySkipDrawMutationComplete = new Error('overlay-skip-draw mutation proof complete');
const overlayMaskProofComplete = new Error('overlay-mask proof complete');

function assertServerOwnedAndAlive() {
  assert(server, 'Asset interaction gate did not spawn its browser server');
  assert.equal(serverExit, undefined, `Owned server exited prematurely: ${JSON.stringify(serverExit)}`);
  assert.equal(server.exitCode, null, 'Owned server exited before browser assertions completed');
}

async function stopServerAndVerifyPort() {
  if (!server) return;
  if (serverExit === undefined) {
    const exited = waitForExit(server);
    if (server.exitCode === null) server.kill('SIGTERM');
    await Promise.race([exited, timeout('Asset interaction server cleanup')]);
  }
  if (serverExit === undefined) throw new Error('Owned server did not record an exit during cleanup');
  await assertPortIsAvailable();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    assertServerOwnedAndAlive();
    try {
      if ((await fetch(assetRoute)).ok) return;
    } catch {
      // The owned development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Asset interaction browser server did not start.\n${logs.slice(-4_000)}`);
}

async function assertExternalAssetRoute() {
  const response = await fetch(assetRoute);
  assert.equal(response.ok, true, `External asset route health check failed: ${response.status} ${assetRoute}`);
  const markup = await response.text();
  assert(markup.includes('data-optical-lab-asset-only="true"'), 'External route is not the exact asset-only candidate');
  assert.equal(
    markup.match(/data-optical-lab-panel=/g)?.length ?? 0,
    1,
    'External asset route must contain exactly one Optical Lab panel',
  );
}

async function waitForImages(page) {
  await page.locator('[data-optical-lab-asset-plate="true"]').evaluate((image) => image.decode());
  await page.locator('[data-optical-lab-target-typography-plate="true"]').evaluate((image) => image.decode());
}

async function waitForAmbientSamplePhase(page, samplePhase) {
  await page.waitForFunction((targetPhase) => {
    const phase = (performance.now() % 8_000) / 8_000;
    return phase >= targetPhase && phase < targetPhase + .004;
  }, samplePhase, { polling: 'raf', timeout: 9_000 });
}

async function moveMouse(page, box, xRatio, yRatio = .5) {
  const x = box.x + box.width * xRatio;
  const y = box.y + box.height * yRatio;
  await page.mouse.move(x - 18, y, { steps: 2 });
  await page.mouse.move(x, y, { steps: 2 });
}

function captureCandidate(page, box, outputPath) {
  return page.screenshot({
    clip: box,
    ...(outputPath ? { path: outputPath } : {}),
  });
}

async function captureInteractionCanvas(page, outputPath) {
  const captured = await page.evaluate(() => {
    const capture = window.__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__;
    if (!capture) throw new Error('Renderer-owned interaction frame capture bridge is unavailable');
    return capture();
  });
  const buffer = Buffer.from(captured.base64, 'base64');
  if (outputPath) await writeFile(outputPath, buffer);
  return {
    buffer,
    completedAt: captured.capturedAt,
    nonZeroAlpha: captured.nonZeroAlpha,
    nonZeroRgb: captured.nonZeroRgb,
  };
}

async function countAllPixelDifferences(page, baseline, candidate) {
  return page.evaluate(async ({ baselineBase64, candidateBase64 }) => {
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
    const expected = await decode(baselineBase64);
    const actual = await decode(candidateBase64);
    if (expected.width !== actual.width || expected.height !== actual.height) return Number.MAX_SAFE_INTEGER;
    let differences = 0;
    for (let offset = 0; offset < expected.data.length; offset += 4) {
      if (
        expected.data[offset] !== actual.data[offset]
        || expected.data[offset + 1] !== actual.data[offset + 1]
        || expected.data[offset + 2] !== actual.data[offset + 2]
        || expected.data[offset + 3] !== actual.data[offset + 3]
      ) differences += 1;
    }
    return differences;
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
  });
}

async function measureChangedPixels(page, baseline, candidate, threshold = 8) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    let count = 0;
    let magnitude = 0;
    let weightedX = 0;
    let weightedY = 0;
    const quadrants = [0, 0, 0, 0];
    for (let y = 0; y < before.height; y += 1) {
      for (let x = 0; x < before.width; x += 1) {
        const offset = (y * before.width + x) * 4;
        const delta = Math.max(
          Math.abs(before.data[offset] - after.data[offset]),
          Math.abs(before.data[offset + 1] - after.data[offset + 1]),
          Math.abs(before.data[offset + 2] - after.data[offset + 2]),
        );
        if (delta < thresholdValue) continue;
        count += 1;
        magnitude += delta;
        weightedX += x;
        weightedY += y;
        quadrants[(y >= before.height / 2 ? 2 : 0) + (x >= before.width / 2 ? 1 : 0)] += 1;
      }
    }
    return {
      centroid: count ? { x: weightedX / count / before.width, y: weightedY / count / before.height } : null,
      count,
      magnitude,
      quadrants,
    };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    thresholdValue: threshold,
  });
}

async function measureLocalChange(page, baseline, candidate, center, radius, threshold = 2) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, centerPoint, radiusRatio, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    let count = 0;
    let maximum = 0;
    let weightedX = 0;
    let weightedY = 0;
    const radiusPx = before.width * radiusRatio;
    for (let y = 0; y < before.height; y += 1) {
      for (let x = 0; x < before.width; x += 1) {
        if (Math.hypot(x - before.width * centerPoint.x, y - before.height * centerPoint.y) > radiusPx) continue;
        const offset = (y * before.width + x) * 4;
        const delta = Math.max(
          Math.abs(before.data[offset] - after.data[offset]),
          Math.abs(before.data[offset + 1] - after.data[offset + 1]),
          Math.abs(before.data[offset + 2] - after.data[offset + 2]),
        );
        maximum = Math.max(maximum, delta);
        if (delta < thresholdValue) continue;
        count += 1;
        weightedX += x;
        weightedY += y;
      }
    }
    return {
      centroid: count ? { x: weightedX / count / before.width, y: weightedY / count / before.height } : null,
      count,
      maximum,
    };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    centerPoint: center,
    radiusRatio: radius,
    thresholdValue: threshold,
  });
}

async function measureSpatialResponse(page, baseline, candidate, center, radius = .16, threshold = 3) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, centerPoint, radiusRatio, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    const radiusPx = before.width * radiusRatio;
    let changed = 0;
    let inside = 0;
    let weightedX = 0;
    let weightedY = 0;
    let localMagnitude = 0;
    let localPixels = 0;
    let maximum = 0;
    for (let y = 0; y < before.height; y += 1) {
      for (let x = 0; x < before.width; x += 1) {
        const offset = (y * before.width + x) * 4;
        const delta = Math.max(
          Math.abs(before.data[offset] - after.data[offset]),
          Math.abs(before.data[offset + 1] - after.data[offset + 1]),
          Math.abs(before.data[offset + 2] - after.data[offset + 2]),
        );
        const distance = Math.hypot(
          x - before.width * centerPoint.x,
          y - before.height * centerPoint.y,
        );
        if (distance <= radiusPx) {
          localMagnitude += delta;
          localPixels += 1;
          maximum = Math.max(maximum, delta);
        }
        if (delta < thresholdValue) continue;
        changed += 1;
        weightedX += x;
        weightedY += y;
        if (distance <= radiusPx) inside += 1;
      }
    }
    return {
      centroid: changed ? { x: weightedX / changed / before.width, y: weightedY / changed / before.height } : null,
      changed,
      inside,
      locality: changed ? inside / changed : 0,
      maximum,
      meanLocalMagnitude: localPixels ? localMagnitude / localPixels : 0,
    };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    centerPoint: center,
    radiusRatio: radius,
    thresholdValue: threshold,
  });
}

async function measureAlphaSpatialResponse(page, baseline, candidate, center, radius = .22, threshold = 1) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, centerPoint, radiusRatio, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    const radiusPx = before.width * radiusRatio;
    let changed = 0;
    let inside = 0;
    let maximum = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let y = 0; y < before.height; y += 1) {
      for (let x = 0; x < before.width; x += 1) {
        const offset = (y * before.width + x) * 4;
        const delta = Math.abs(before.data[offset + 3] - after.data[offset + 3]);
        maximum = Math.max(maximum, delta);
        if (delta < thresholdValue) continue;
        changed += 1;
        weightedX += x;
        weightedY += y;
        if (Math.hypot(x - before.width * centerPoint.x, y - before.height * centerPoint.y) <= radiusPx) {
          inside += 1;
        }
      }
    }
    return {
      centroid: changed ? { x: weightedX / changed / before.width, y: weightedY / changed / before.height } : null,
      changed,
      inside,
      locality: changed ? inside / changed : 0,
      maximum,
    };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    centerPoint: center,
    radiusRatio: radius,
    thresholdValue: threshold,
  });
}

async function measureWiderFieldProbes(page, baseline, candidate, center, threshold = 3) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, centerPoint, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    const samplePatch = (radius) => {
      const centerX = Math.round(before.width * (centerPoint.x + radius));
      const centerY = Math.round(before.height * centerPoint.y);
      let maximum = 0;
      let responsive = 0;
      for (let y = centerY - 3; y <= centerY + 3; y += 1) {
        for (let x = centerX - 3; x <= centerX + 3; x += 1) {
          const offset = (y * before.width + x) * 4;
          const delta = Math.max(
            Math.abs(before.data[offset] - after.data[offset]),
            Math.abs(before.data[offset + 1] - after.data[offset + 1]),
            Math.abs(before.data[offset + 2] - after.data[offset + 2]),
          );
          maximum = Math.max(maximum, delta);
          if (delta >= thresholdValue) responsive += 1;
        }
      }
      return { maximum, responsive };
    };
    const atRadius18 = samplePatch(.18);
    const outsideRadius22 = samplePatch(.24);
    return { atRadius18, outsideRadius22, threshold: thresholdValue };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    centerPoint: center,
    thresholdValue: threshold,
  });
}

async function measureHaloShape(page, baseline, candidate, center, radiusRatio = .20, threshold = 3) {
  return page.evaluate(async ({ baselineBase64, candidateBase64, centerPoint, radiusValue, thresholdValue }) => {
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
    const before = await decode(baselineBase64);
    const after = await decode(candidateBase64);
    const sectors = new Array(16).fill(0);
    const centerX = before.width * centerPoint.x;
    const centerY = before.height * centerPoint.y;
    const innerRadius = before.width * .16;
    const outerRadius = before.width * radiusValue;
    const centerOffset = (Math.round(centerY) * before.width + Math.round(centerX)) * 4;
    for (let y = 0; y < before.height; y += 1) {
      for (let x = 0; x < before.width; x += 1) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.hypot(dx, dy);
        if (distance < innerRadius || distance > outerRadius) continue;
        const offset = (y * before.width + x) * 4;
        const delta = Math.max(
          Math.abs(before.data[offset] - after.data[offset]),
          Math.abs(before.data[offset + 1] - after.data[offset + 1]),
          Math.abs(before.data[offset + 2] - after.data[offset + 2]),
        );
        if (delta < thresholdValue) continue;
        const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        sectors[Math.floor(angle / (Math.PI * 2) * sectors.length)] += 1;
      }
    }
    const occupied = sectors.filter((count) => count >= 12).length;
    return {
      centerMaximum: Math.max(
        before.data[centerOffset],
        before.data[centerOffset + 1],
        before.data[centerOffset + 2],
      ),
      edgeClearance: Math.min(
        centerX - outerRadius,
        (before.width - 1) - centerX - outerRadius,
        centerY - outerRadius,
        (before.height - 1) - centerY - outerRadius,
      ),
      occupied,
      sectorCoverage: occupied / sectors.length,
      sectors,
    };
  }, {
    baselineBase64: baseline.toString('base64'),
    candidateBase64: candidate.toString('base64'),
    centerPoint: center,
    radiusValue: radiusRatio,
    thresholdValue: threshold,
  });
}

async function dispatchGesture(candidate, point, pointerType = 'mouse', pointerId = 41, distancePx = 18) {
  return candidate.evaluate(async (stage, input) => {
    const bounds = stage.getBoundingClientRect();
    const endX = bounds.left + bounds.width * input.point.x;
    const endY = bounds.top + bounds.height * input.point.y;
    const startX = endX - input.distancePx;
    const baseStamp = performance.now();
    const emit = (type, clientX, stamp) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        clientX,
        clientY: endY,
        pointerId: input.pointerId,
        pointerType: input.pointerType,
      });
      Object.defineProperty(event, 'timeStamp', { value: stamp });
      stage.dispatchEvent(event);
    };
    stage.dispatchEvent(new PointerEvent('pointerleave', {
      bubbles: false,
      pointerId: input.pointerId,
      pointerType: input.pointerType,
    }));
    if (input.pointerType === 'touch') emit('pointerdown', startX, baseStamp);
    else emit('pointermove', startX, baseStamp);
    await new Promise((resolve) => setTimeout(resolve, 16));
    emit('pointermove', endX, baseStamp + 24);
    return performance.now();
  }, { distancePx, point, pointerId, pointerType });
}

async function measureHorizontalRegistration(
  page,
  shifted,
  reference,
  energyPlate,
  { maximumShift = 6, minimumEnergySignal = .48, minimumShift = -6 } = {},
) {
  return page.evaluate(async ({
    energyBase64,
    maximumShiftValue,
    minimumEnergySignalValue,
    minimumShiftValue,
    referenceBase64,
    shiftedBase64,
  }) => {
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
    const actual = await decode(shiftedBase64);
    const expected = await decode(referenceBase64);
    const energy = await decode(energyBase64);
    const scores = [];
    for (let shift = minimumShiftValue; shift <= maximumShiftValue; shift += 1) {
      let error = 0;
      let samples = 0;
      for (let y = Math.round(expected.height * .12); y < Math.round(expected.height * .88); y += 1) {
        for (let x = Math.round(expected.width * .50); x < Math.round(expected.width * .70); x += 1) {
          const shiftedX = x + shift;
          if (shiftedX < 0 || shiftedX >= actual.width) continue;
          const expectedOffset = (y * expected.width + x) * 4;
          const actualOffset = (y * actual.width + shiftedX) * 4;
          const energyLuminance = (
            energy.data[expectedOffset] * .2126
            + energy.data[expectedOffset + 1] * .7152
            + energy.data[expectedOffset + 2] * .0722
          ) / 255;
          const energySignal = energyLuminance * energy.data[expectedOffset + 3] / 255;
          if (energySignal < minimumEnergySignalValue) continue;
          error += Math.abs(expected.data[expectedOffset] - actual.data[actualOffset]);
          error += Math.abs(expected.data[expectedOffset + 1] - actual.data[actualOffset + 1]);
          error += Math.abs(expected.data[expectedOffset + 2] - actual.data[actualOffset + 2]);
          samples += 3;
        }
      }
      scores.push({ meanError: samples ? error / samples : Number.MAX_SAFE_INTEGER, shift });
    }
    const ranked = [...scores].sort((left, right) => left.meanError - right.meanError);
    return { best: ranked[0], scores };
  }, {
    energyBase64: energyPlate.toString('base64'),
    maximumShiftValue: maximumShift,
    minimumEnergySignalValue: minimumEnergySignal,
    minimumShiftValue: minimumShift,
    referenceBase64: reference.toString('base64'),
    shiftedBase64: shifted.toString('base64'),
  });
}

async function capturePatchFollowProofFrame(
  browserInstance,
  { capScalePx = 10, disableFollow = false, fullFlow = false } = {},
) {
  const proofPage = await browserInstance.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  try {
    await proofPage.addInitScript(({ capScale, disable, forceFullFlow }) => {
      window.__TASK16_PATCH_FOLLOW_PROOF__ = { cap: 0, composite: 0, flow: 0, overlay: 0 };
      const originalShaderSource = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function patchFollowProofShaderSource(shader, source) {
        let mutated = source;
        if (source.includes('float localMemory = min(uLocalStrength')) {
          mutated = source.replace(
            'fragColor = vec4(velocity * 0.5 + 0.5, localMemory, carrier * 0.5 + 0.5);',
            forceFullFlow
              ? 'fragColor = vec4(1.0, 0.5, localMemory, carrier * 0.5 + 0.5);'
              : 'fragColor = vec4(0.51, 0.5, localMemory, carrier * 0.5 + 0.5);',
          );
          window.__TASK16_PATCH_FOLLOW_PROOF__.flow += Number(mutated !== source);
        }
        if (source.includes('uniform float uPatchFollowPx')) {
          if (disable) {
            mutated = mutated.replace('clamp(uPatchFollowPx, -5.0, 5.0)', '0.0');
          }
          if (capScale === 14) {
            const beforeCapMutation = mutated;
            mutated = mutated.replace(
              'combinedPx *= 10.0 / combinedLength;',
              'combinedPx *= 14.0 / combinedLength;',
            );
            window.__TASK16_PATCH_FOLLOW_PROOF__.cap += Number(mutated !== beforeCapMutation);
          }
          window.__TASK16_PATCH_FOLLOW_PROOF__.composite += Number(mutated !== source || !disable);
        }
        if (source.includes('float overlayAlpha = min(0.16')) {
          const beforeOverlayMutation = mutated;
          mutated = mutated.replace(
            'float overlayAlpha = min(0.16, abs(carrier) * 0.16);',
            'float overlayAlpha = 0.0;',
          );
          window.__TASK16_PATCH_FOLLOW_PROOF__.overlay += Number(mutated !== beforeOverlayMutation);
        }
        return originalShaderSource.call(this, shader, mutated);
      };
    }, { capScale: capScalePx, disable: disableFollow, forceFullFlow: fullFlow });
    await proofPage.goto(assetRoute, { waitUntil: 'networkidle' });
    await proofPage.evaluate(() => document.fonts.ready.then(() => true));
    await waitForImages(proofPage);
    await prepareNativeCandidate(proofPage);
    const candidate = proofPage.locator('[data-asset-candidate="true"]');
    const canvas = proofPage.locator('canvas[data-optical-asset-interaction-canvas="true"]');
    await canvas.waitFor({ timeout: 5_000 });
    await proofPage.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
    const mutations = await proofPage.evaluate(() => window.__TASK16_PATCH_FOLLOW_PROOF__);
    assert.deepEqual(
      mutations,
      { cap: capScalePx === 14 ? 1 : 0, composite: 1, flow: 1, overlay: 1 },
      `Patch-follow proof must intercept one flow, composite and overlay shader: ${JSON.stringify(mutations)}`,
    );
    const proofPointerId = disableFollow ? 82 : 81;
    await dispatchGesture(candidate, { x: .58, y: .5 }, 'mouse', proofPointerId, 48);
    await proofPage.waitForTimeout(100);
    await dispatchGesture(candidate, { x: .58, y: .5 }, 'mouse', proofPointerId, 48);
    await proofPage.waitForFunction(() => {
      const snapshot = window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__;
      return (snapshot?.patchFollowPx ?? 0) >= 4.85
        && Math.hypot(snapshot?.refractionPx?.x ?? 0, snapshot?.refractionPx?.y ?? 0) <= 10.00001;
    }, undefined, { polling: 'raf', timeout: 2_000 });
    const peakSnapshot = await proofPage.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
    assert(
      peakSnapshot.patchFollowPx >= 4.85,
      `Patch-follow proof did not reach the 5px envelope: ${JSON.stringify(peakSnapshot)}`,
    );
    const capture = await captureInteractionCanvas(proofPage);
    return { buffer: capture.buffer, snapshot: peakSnapshot };
  } finally {
    await proofPage.close();
  }
}

async function prepareNativeCandidate(page, { hideAuthoredPlates = false } = {}) {
  await page.evaluate(({ hidePlates }) => {
    document.documentElement.style.width = '1672px';
    document.documentElement.style.height = '941px';
    document.body.style.width = '1672px';
    document.body.style.height = '941px';
    document.body.style.margin = '0';
    const main = document.querySelector('[data-optical-lab="true"]');
    const header = main?.querySelector('header');
    const comparison = main?.querySelector('section');
    const candidatePanel = main?.querySelector('[data-optical-lab-panel="candidate"]');
    const candidate = main?.querySelector('[data-asset-candidate="true"]');
    const diagnostics = candidatePanel?.querySelector('[data-optical-lab-diagnostics="true"]');
    if (hidePlates) {
      for (const plate of candidate?.querySelectorAll('img') ?? []) plate.style.visibility = 'hidden';
      candidate.style.background = '#000';
    }
    Object.assign(main.style, { height: '941px', minHeight: '941px', padding: '0', width: '1672px' });
    if (header) header.style.display = 'none';
    Object.assign(comparison.style, {
      border: '0', display: 'block', height: '941px', margin: '0', width: '1672px',
    });
    Object.assign(candidatePanel.style, { height: '941px', padding: '0', width: '1672px' });
    if (diagnostics) diagnostics.style.display = 'none';
    Object.assign(candidate.style, {
      aspectRatio: 'auto', height: '941px', width: '1672px',
    });
  }, { hidePlates: hideAuthoredPlates });
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
  if (patchFollowProof) {
    const renderedFollow = await capturePatchFollowProofFrame(browser);
    const disabledFollow = await capturePatchFollowProofFrame(browser, { disableFollow: true });
    const cappedCombined = await capturePatchFollowProofFrame(browser, { fullFlow: true });
    const fourteenPxCapMutation = await capturePatchFollowProofFrame(
      browser,
      { capScalePx: 14, fullFlow: true },
    );
    const analysisPage = await browser.newPage();
    try {
      const changedPixels = await countAllPixelDifferences(
        analysisPage,
        disabledFollow.buffer,
        renderedFollow.buffer,
      );
      const registration = await measureHorizontalRegistration(
        analysisPage,
        renderedFollow.buffer,
        disabledFollow.buffer,
        await readFile(energyPlatePath),
      );
      const capChangedPixels = await countAllPixelDifferences(
        analysisPage,
        cappedCombined.buffer,
        fourteenPxCapMutation.buffer,
      );
      const capRegistration = await measureHorizontalRegistration(
        analysisPage,
        fourteenPxCapMutation.buffer,
        cappedCombined.buffer,
        await readFile(energyPlatePath),
        { minimumEnergySignal: .98 },
      );
      assert(
        changedPixels > 100,
        `Disabling patch follow must change real native rendered pixels: ${changedPixels}`,
      );
      assert.equal(
        registration.best.shift,
        5,
        `The native image-space patch-follow contribution must register at exactly +5 CSS px: ${JSON.stringify(registration)}`,
      );
      assert(
        renderedFollow.snapshot.patchFollowPx >= 4.85
          && renderedFollow.snapshot.patchFollowPx <= 5,
        `The production follow sample must approach but never exceed the 5px cap: ${JSON.stringify(renderedFollow.snapshot)}`,
      );
      assert(
        Math.hypot(
          renderedFollow.snapshot.refractionPx.x,
          renderedFollow.snapshot.refractionPx.y,
        ) <= 10.00001,
        `The patch-follow proof must retain the total 10px local envelope: ${JSON.stringify(renderedFollow.snapshot)}`,
      );
      assert(
        capChangedPixels > 100,
        `Changing only the combined cap from 10px to 14px must alter real native pixels: ${capChangedPixels}`,
      );
      assert.equal(
        capRegistration.best.shift,
        4,
        `The native cap mutation must expose exactly the forbidden extra 4px: ${JSON.stringify(capRegistration)}`,
      );
      await writeFile(path.join(outDir, 'patch-follow-proof.json'), `${JSON.stringify({
        capChangedPixels,
        cappedSnapshot: cappedCombined.snapshot,
        capRegistration,
        changedPixels,
        disabledSnapshot: disabledFollow.snapshot,
        registration,
        renderedSnapshot: renderedFollow.snapshot,
        fourteenPxCapMutationSnapshot: fourteenPxCapMutation.snapshot,
      }, null, 2)}\n`);
    } finally {
      await analysisPage.close();
    }
  }
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  if (overlayMaskProof) {
    await page.addInitScript(() => {
      window.__TASK19_OVERLAY_MASK_MUTATIONS__ = 0;
      const originalShaderSource = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function overlayMaskShaderSource(shader, source) {
        let mutated = source;
        mutated = mutated.replace(
          'fragColor = vec4(color, replacement);',
          'fragColor = vec4(0.0);',
        );
        window.__TASK19_OVERLAY_MASK_MUTATIONS__ += Number(mutated !== source);
        return originalShaderSource.call(this, shader, mutated);
      };
    });
  }
  if (overlaySkipDrawMutation) {
    await page.addInitScript(() => {
      window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__ = { overlayShaders: 0, skippedDraws: 0 };
      const attachedPrograms = new WeakMap();
      const overlayPrograms = new WeakSet();
      let currentProgram = null;
      const originalShaderSource = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function trackedOverlayShaderSource(shader, source) {
        if (source.includes('float overlayAlpha = min(0.16')) {
          for (const program of attachedPrograms.get(shader) ?? []) overlayPrograms.add(program);
          window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__.overlayShaders += 1;
        }
        return originalShaderSource.call(this, shader, source);
      };
      const originalAttachShader = WebGL2RenderingContext.prototype.attachShader;
      WebGL2RenderingContext.prototype.attachShader = function trackedAttachShader(program, shader) {
        const programs = attachedPrograms.get(shader) ?? [];
        programs.push(program);
        attachedPrograms.set(shader, programs);
        return originalAttachShader.call(this, program, shader);
      };
      const originalUseProgram = WebGL2RenderingContext.prototype.useProgram;
      WebGL2RenderingContext.prototype.useProgram = function trackedUseProgram(program) {
        currentProgram = program;
        return originalUseProgram.call(this, program);
      };
      const originalDrawArrays = WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays = function skipOverlayDrawArrays(...args) {
        if (currentProgram && overlayPrograms.has(currentProgram)) {
          window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__.skippedDraws += 1;
          return undefined;
        }
        return originalDrawArrays.apply(this, args);
      };
      const originalDrawElements = WebGL2RenderingContext.prototype.drawElements;
      WebGL2RenderingContext.prototype.drawElements = function skipOverlayDrawElements(...args) {
        if (currentProgram && overlayPrograms.has(currentProgram)) {
          window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__.skippedDraws += 1;
          return undefined;
        }
        return originalDrawElements.apply(this, args);
      };
    });
  }
  if (fixedCenterMutation) {
    await page.addInitScript(() => {
      window.__TASK17_FIXED_CENTER_MUTATIONS__ = 0;
      const originalShaderSource = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function fixedCenterShaderSource(shader, source) {
        let mutated = source;
        if (source.includes('vec2 localDelta = vec2(vUv.x - uPointer.x')) {
          mutated = source.replace(
            'vec2 localDelta = vec2(vUv.x - uPointer.x, (vUv.y - uPointer.y)',
            'vec2 localDelta = vec2(vUv.x - 0.5, (vUv.y - 0.5)',
          );
          window.__TASK17_FIXED_CENTER_MUTATIONS__ += Number(mutated !== source);
        }
        return originalShaderSource.call(this, shader, mutated);
      };
    });
  }
  if (radialHaloMutation) {
    await page.addInitScript(() => {
      window.__TASK14_RADIAL_HALO_MUTATIONS__ = 0;
      const originalShaderSource = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function radialHaloShaderSource(shader, source) {
        let mutated = source;
        if (source.includes('float localMemory = min(uLocalStrength')) {
          mutated = source.replace(
            'float localMemory = min(uLocalStrength, max(previousLocal * 0.94, influence));',
            `float screenDistance = length(vec2(
              vUv.x - uPointer.x,
              (vUv.y - uPointer.y) / max(0.001, uAspect)
            ));
            float rimDistance = screenDistance / max(0.001, uRadius);
            float radialRim = smoothstep(0.80, 0.84, rimDistance)
              * (1.0 - smoothstep(0.96, 1.0, rimDistance)) * uLocalStrength
              * (1.0 - step(0.01, length(uPointer - vec2(0.30, 0.63))));
            float localMemory = min(
              uLocalStrength,
              max(previousLocal * 0.94, max(influence, radialRim))
            );`,
          );
          window.__TASK14_RADIAL_HALO_MUTATIONS__ += 1;
        }
        return originalShaderSource.call(this, shader, mutated);
      };
    });
  }
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    const text = message.text();
    const screenshotReadbackWarning = text.includes('GL Driver Message')
      && text.includes('GPU stall due to ReadPixels');
    const nextDevUnusedStylePreload = text.includes('/_next/static/css/')
      && text.includes('was preloaded using link preload but not used within a few seconds');
    if (!screenshotReadbackWarning && !nextDevUnusedStylePreload
      && (message.type() === 'error' || message.type() === 'warning')) {
      pageErrors.push(text);
    }
  });
  try {
    await page.goto(assetRoute, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await waitForImages(page);
    await prepareNativeCandidate(page, { hideAuthoredPlates: overlayMaskProof });
    const candidate = page.locator('[data-asset-candidate="true"]');
    const box = await candidate.boundingBox();
    assert(box, 'Asset candidate bounds are unavailable');
    assert.deepEqual(
      { height: Math.round(box.height), width: Math.round(box.width) },
      { height: 941, width: 1672 },
      'The primary interaction gate must exercise the native accepted stage size',
    );
    const canvas = page.locator('canvas[data-optical-asset-interaction-canvas="true"]');
    await canvas.waitFor({ timeout: 5_000 });
    await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
    if (overlayMaskProof) {
      assert.equal(
        await page.evaluate(() => window.__TASK19_OVERLAY_MASK_MUTATIONS__),
        1,
        'The overlay-mask proof must isolate one composite output while preserving production overlay alpha',
      );
    }
    if (overlaySkipDrawMutation) {
      const skipDrawState = await page.evaluate(() => window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__);
      assert.equal(skipDrawState.overlayShaders, 1, 'The skip-draw mutation must identify one overlay shader');
      assert.equal(skipDrawState.skippedDraws, 0, 'The idle renderer must not issue overlay draw calls');
    }
    if (fixedCenterMutation) {
      assert.equal(
        await page.evaluate(() => window.__TASK17_FIXED_CENTER_MUTATIONS__),
        1,
        'The controlled fixed-centre mutation must intercept exactly one flow shader',
      );
    }
    if (radialHaloMutation) {
      assert.equal(
        await page.evaluate(() => window.__TASK14_RADIAL_HALO_MUTATIONS__),
        1,
        'The controlled radial-halo mutation must intercept exactly one flow shader',
      );
    }
    if (overlayMaskProof) {
      const overlayPoints = [
        ['left', { x: .16, y: .48 }],
        ['centre', { x: .50, y: .48 }],
        ['right', { x: .84, y: .48 }],
        ['upper', { x: .50, y: .30 }],
        ['lower', { x: .50, y: .70 }],
      ];
      const overlayEvidence = {};
      for (const [name, point] of overlayPoints) {
        await page.waitForTimeout(720);
        const baseline = (await captureInteractionCanvas(page)).buffer;
        await dispatchGesture(candidate, point, 'mouse', 91);
        await page.waitForTimeout(120);
        const active = (await captureInteractionCanvas(
          page,
          path.join(outDir, `overlay-mask-${name}.png`),
        )).buffer;
        const response = await measureAlphaSpatialResponse(page, baseline, active, point, .22, 1);
        const centroidDistance = response.centroid
          ? Math.hypot(response.centroid.x - point.x, response.centroid.y - point.y)
          : Number.POSITIVE_INFINITY;
        assert(response.changed >= 20, `${name} overlay mask produced no visible pixels: ${JSON.stringify(response)}`);
        assert(
          centroidDistance <= overlayCentroidLimit && response.locality >= localityFloor,
          `${name} overlay mask must retain centroid <= ${overlayCentroidLimit} and locality >= ${localityFloor}: ${JSON.stringify({ centroidDistance, response })}`,
        );
        overlayEvidence[name] = { centroidDistance, response };
      }
      await writeFile(path.join(outDir, 'overlay-mask-proof.json'), `${JSON.stringify({
        localityFloor,
        overlayCentroidLimit,
        overlayEvidence,
      }, null, 2)}\n`);
      throw overlayMaskProofComplete;
    }
    const computedMask = await canvas.evaluate((node) => getComputedStyle(node).maskImage);
    assert.equal(computedMask, 'none', 'The interaction canvas must cover the full stage without the former seam mask');

    const acceptedBaseline = await readFile(acceptedBaselinePath);
    await canvas.evaluate((node) => { node.style.display = 'none'; });
    const staticFrame = await captureCandidate(page, box, path.join(outDir, 'static-plates.png'));
    if (process.env.OPTICAL_LAB_PROMOTE_ASSET_BASELINE === '1') {
      await mkdir(path.dirname(acceptedBaselinePath), { recursive: true });
      await writeFile(acceptedBaselinePath, staticFrame);
    }
    assert.equal(
      await countAllPixelDifferences(page, acceptedBaseline, staticFrame),
      0,
      'Disabling the interaction canvas must expose the accepted static plates pixel-for-pixel',
    );
    await canvas.evaluate((node) => { node.style.display = ''; });

    const idleSnapshot = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
    assert.equal(idleSnapshot?.follow, 0, 'Idle temporal proof must run before any pointer input');
    assert.equal(idleSnapshot?.patchFollowPx, 0, 'Idle temporal proof must contain no local follow');
    assert.deepEqual(idleSnapshot?.refractionPx, { x: 0, y: 0 }, 'Idle temporal proof must contain no local refraction');
    const ambientBefore = await captureCandidate(page, box, path.join(outDir, 'ambient-before.png'));
    await page.waitForTimeout(360);
    const ambientAfter = await captureCandidate(page, box, path.join(outDir, 'ambient-after.png'));
    const ambientMotion = await measureChangedPixels(page, ambientBefore, ambientAfter, 1);
    assert(ambientMotion.count > 0 && ambientMotion.quadrants.every((count) => count > 0),
      `No-input idle motion must change real pixels in all four quadrants: ${JSON.stringify(ambientMotion)}`);
    assert.equal(idleSnapshot?.ambientStrength, .05,
      `Idle temporal proof must exercise the exact ambient flow budget: ${JSON.stringify({ ambientMotion, idleSnapshot })}`);

    const ambientTemporalStartCapture = await captureInteractionCanvas(page);
    await page.waitForTimeout(40);
    const ambientTemporalEndCapture = await captureInteractionCanvas(page);
    assert(
      ambientTemporalStartCapture.nonZeroAlpha > 0 && ambientTemporalStartCapture.nonZeroRgb > 0
        && ambientTemporalEndCapture.nonZeroAlpha > 0 && ambientTemporalEndCapture.nonZeroRgb > 0,
      `Ambient overlay captures must contain real rendered pixels: ${JSON.stringify({
        start: ambientTemporalStartCapture, end: ambientTemporalEndCapture,
      }, (key, value) => key === 'buffer' ? undefined : value)}`,
    );
    const ambientTemporalStart = ambientTemporalStartCapture.buffer;
    const ambientTemporalEnd = ambientTemporalEndCapture.buffer;
    const ambientTemporalMotion = await measureLocalChange(
      page, ambientTemporalStart, ambientTemporalEnd, { x: .5, y: .5 }, .22, 3,
    );
    assert(ambientTemporalMotion.count > 0,
      `Ambient overlay capture path must observe temporal pixels: ${JSON.stringify(ambientTemporalMotion)}`);
    await waitForAmbientSamplePhase(page, .25);
    const ambientSpatialBaseline = await captureCandidate(page, box);
    await page.waitForTimeout(136);
    const ambientSpatialAfter = await captureCandidate(page, box);
    const ambientSpatialInterval = await measureChangedPixels(
      page, ambientSpatialBaseline, ambientSpatialAfter, 3,
    );
    const spatialSamples = [
      ['left', { x: .16, y: .48 }],
      ['centre', { x: .50, y: .48 }],
      ['right', { x: .84, y: .48 }],
      ['upper', { x: .50, y: .30 }],
      ['lower', { x: .50, y: .70 }],
    ];
    const spatialEvidence = {};
    const spatialFailures = [];
    const phasesToSample = fixedCenterMutation ? [.25] : spatialSamplePhases;
    let anchoredRecovery;
    let captureEvidence;
    let recoveryAmbientMotion;
    for (const [name, point] of spatialSamples) {
      spatialEvidence[name] = {};
      for (const samplePhase of phasesToSample) {
        const primaryPhase = samplePhase === .25;
        const phaseLabel = String(samplePhase).replace('.', '-');
        await page.waitForTimeout(920);
        await waitForAmbientSamplePhase(page, samplePhase);
        if (name === 'left' && primaryPhase) {
          const localAmbientStart = (await captureInteractionCanvas(page)).buffer;
          await page.waitForTimeout(40);
          const localAmbientEnd = (await captureInteractionCanvas(page)).buffer;
          recoveryAmbientMotion = await measureLocalChange(
            page, localAmbientStart, localAmbientEnd, point, .22, 3,
          );
          assert(
            recoveryAmbientMotion.count > 0 && recoveryAmbientMotion.maximum > 0,
            `The recovery comparison requires a live point-matched ambient window: ${JSON.stringify(recoveryAmbientMotion)}`,
          );
        }
        const pointerBaseline = await captureCandidate(
          page,
          box,
          path.join(outDir, primaryPhase
            ? `pointer-${name}-baseline.png`
            : `pointer-${name}-phase-${phaseLabel}-baseline.png`),
        );
        const injectedAt = await dispatchGesture(candidate, point, 'mouse', 41);
        const phaseAtInjection = (injectedAt % 8_000) / 8_000;
        await page.waitForFunction(({ x, y }) => {
          const snapshot = window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__;
          return Math.abs((snapshot?.pointerX ?? -1) - x) < .02
            && Math.abs((snapshot?.pointerY ?? -1) - y) < .02;
        }, point);
        await page.waitForTimeout(120);
        const activeFrame = await captureCandidate(
          page,
          box,
          path.join(outDir, primaryPhase
            ? `pointer-${name}.png`
            : `pointer-${name}-phase-${phaseLabel}.png`),
        );
        const phaseAtCapture = await page.evaluate(() => (performance.now() % 8_000) / 8_000);
        const activeOverlayCapture = name === 'left' && primaryPhase
          ? await captureInteractionCanvas(page)
          : null;
      if (activeOverlayCapture) {
        assert(activeOverlayCapture.nonZeroAlpha > 0 && activeOverlayCapture.nonZeroRgb > 0,
          `Active local overlay capture must contain rendered pixels: ${JSON.stringify({
            nonZeroAlpha: activeOverlayCapture.nonZeroAlpha,
            nonZeroRgb: activeOverlayCapture.nonZeroRgb,
          })}`);
      }
      let recovered;
      let recoveredCapture;
      let recoveredNext;
      let recoveryObservedAt;
      if (name === 'left' && primaryPhase) {
        const visualDeadline = injectedAt + 700;
        await page.waitForFunction((target) => performance.now() >= target, visualDeadline);
        recoveredCapture = await captureInteractionCanvas(
          page, path.join(outDir, 'pointer-left-recovered.png'),
        );
        recovered = recoveredCapture.buffer;
        recoveryObservedAt = recoveredCapture.completedAt;
        assert(recoveredCapture.nonZeroAlpha > 0 && recoveredCapture.nonZeroRgb > 0,
          `Recovered overlay evidence must remain a real ambient frame: ${JSON.stringify({
            nonZeroAlpha: recoveredCapture.nonZeroAlpha,
            nonZeroRgb: recoveredCapture.nonZeroRgb,
          })}`);
        await page.waitForFunction((target) => performance.now() >= target, injectedAt + 900);
        await page.waitForTimeout(40);
        recoveredNext = (await captureInteractionCanvas(page)).buffer;
      }
      const response = await measureSpatialResponse(page, pointerBaseline, activeFrame, point, .22, 3);
      assert(response.changed >= 20, `${name} pointer produced no perceptible local pixels: ${JSON.stringify(response)}`);
      spatialEvidence[name][samplePhase] = { ...response, phaseAtCapture, phaseAtInjection };
      const centroidDistance = response.centroid
        ? Math.hypot(response.centroid.x - point.x, response.centroid.y - point.y)
        : Number.POSITIVE_INFINITY;
      if (centroidDistance > visibleCentroidLimit || response.locality < localityFloor) {
        spatialFailures.push({
          centroidDistance, name, phaseAtCapture, phaseAtInjection, point, response, samplePhase,
        });
      }

      if (name === 'left' && primaryPhase) {
        const recoveredMotion = await measureLocalChange(page, recovered, recoveredNext, point, .22, 3);
        const recoveredSnapshot = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
        anchoredRecovery = { elapsedMs: recoveryObservedAt - injectedAt, recoveredMotion };
        captureEvidence = {
          active: {
            nonZeroAlpha: activeOverlayCapture.nonZeroAlpha,
            nonZeroRgb: activeOverlayCapture.nonZeroRgb,
          },
          ambient: {
            endNonZeroAlpha: ambientTemporalEndCapture.nonZeroAlpha,
            endNonZeroRgb: ambientTemporalEndCapture.nonZeroRgb,
            startNonZeroAlpha: ambientTemporalStartCapture.nonZeroAlpha,
            startNonZeroRgb: ambientTemporalStartCapture.nonZeroRgb,
            temporalChangedPixels: ambientTemporalMotion.count,
            pointMatchedRecoveryMotion: recoveryAmbientMotion,
          },
          recovered: {
            completedElapsedMs: anchoredRecovery.elapsedMs,
            nonZeroAlpha: recoveredCapture.nonZeroAlpha,
            nonZeroRgb: recoveredCapture.nonZeroRgb,
          },
        };
        assert(
          anchoredRecovery.elapsedMs >= 700 && anchoredRecovery.elapsedMs <= 900,
          `The 700ms local-zero capture and PNG encoding must complete by 900ms: ${JSON.stringify(anchoredRecovery)}`,
        );
        assert.equal(recoveredSnapshot?.follow, 0, 'Local strength must remain exact zero after the 700ms visual boundary');
        assert(
          recoveredMotion.count <= Math.max(300, recoveryAmbientMotion.count * 3 + 60),
          `Local pixels must be visually inactive after the anchored 700ms boundary: ${JSON.stringify({ recoveryAmbientMotion, anchoredRecovery })}`,
        );
        assert.equal(recoveredSnapshot?.activeRaf, true, 'Ambient RAF must continue at local recovery');
      }
      }
    }
    if (fixedCenterMutation) {
      const redirectedNames = ['left', 'right', 'upper', 'lower'];
      const redirectedFailures = redirectedNames.map(
        (name) => spatialFailures.find((failure) => failure.name === name),
      );
      assert(
        redirectedFailures.every((failure) => failure?.centroidDistance > visibleCentroidLimit),
        `The fixed-centre mutation must fail the visible response contract at every redirected sample: ${JSON.stringify(spatialFailures)}`,
      );
      await writeFile(path.join(outDir, 'fixed-center-mutation-proof.json'), `${JSON.stringify({
        localityFloor,
        redirectedFailures,
        visibleCentroidLimit,
      }, null, 2)}\n`);
      throw fixedCenterMutationComplete;
    }
    if (overlaySkipDrawMutation) {
      const skipDrawState = await page.evaluate(() => window.__TASK19_OVERLAY_SKIP_DRAW_MUTATION__);
      assert(
        skipDrawState.skippedDraws > 0,
        `The mutation must skip real local overlay draws after pointer input: ${JSON.stringify(skipDrawState)}`,
      );
      assert(
        spatialFailures.length > 0,
        `Skipping the final overlay draw must fail at least one phase/position sample: ${JSON.stringify(spatialEvidence)}`,
      );
      await writeFile(path.join(outDir, 'overlay-skip-draw-mutation-proof.json'), `${JSON.stringify({
        localityFloor,
        skipDrawState,
        spatialFailures,
        visibleCentroidLimit,
      }, null, 2)}\n`);
      throw overlaySkipDrawMutationComplete;
    }
    assert.deepEqual(
      spatialFailures,
      [],
      `Every pointer sample must retain centroid <= ${visibleCentroidLimit} and locality >= ${localityFloor}: ${JSON.stringify(spatialFailures)}`,
    );

    const layerPoints = {
      empty: { x: .10, y: .12 },
      typography: { x: .22, y: .50 },
      energy: { x: .58, y: .50 },
    };
    const layerEvidence = {};
    const widerFieldEvidence = {};
    for (const [name, point] of Object.entries(layerPoints)) {
      await page.waitForTimeout(920);
      const baseline = await captureCandidate(page, box);
      await dispatchGesture(candidate, point, 'mouse', 51);
      await page.waitForTimeout(120);
      const activeFrame = await captureCandidate(page, box, path.join(outDir, `pointer-layer-${name}.png`));
      layerEvidence[name] = await measureSpatialResponse(page, baseline, activeFrame, point, .04, 3);
      widerFieldEvidence[name] = await measureWiderFieldProbes(page, baseline, activeFrame, point, 3);
    }

    await page.waitForTimeout(920);
    const haloPoint = { x: .30, y: .37 };
    const haloBaseline = await captureCandidate(page, box);
    await dispatchGesture(candidate, haloPoint, 'mouse', 52);
    await page.waitForTimeout(120);
    const haloActive = await captureCandidate(
      page,
      box,
      path.join(outDir, 'pointer-halo-outer-band.png'),
    );
    const emptyHaloShape = await measureHaloShape(page, haloBaseline, haloActive, haloPoint, .20, 3);
    assert(
      emptyHaloShape.centerMaximum <= 24 && emptyHaloShape.edgeClearance > 0,
      `Outer-band halo probe must be dark and fully inset: ${JSON.stringify(emptyHaloShape)}`,
    );
    assert(
      emptyHaloShape.sectorCoverage <= .25,
      `Uniform-black response must not form a cursor-centred circular rim: ${JSON.stringify(emptyHaloShape)}`,
    );
    assert(
      widerFieldEvidence.typography.atRadius18.maximum >= widerFieldEvidence.typography.threshold
        && widerFieldEvidence.typography.atRadius18.responsive > 0
        && widerFieldEvidence.typography.outsideRadius22.maximum
          < widerFieldEvidence.typography.atRadius18.maximum,
      `The widened field must respond at .18 stage width while remaining subordinate outside .22: ${JSON.stringify(widerFieldEvidence)}`,
    );
    assert(
      layerEvidence.energy.meanLocalMagnitude > layerEvidence.typography.meanLocalMagnitude
        && layerEvidence.typography.meanLocalMagnitude >= layerEvidence.empty.meanLocalMagnitude * 1.25,
      `Literal layer response must order energy > typography > empty: ${JSON.stringify(layerEvidence)}`,
    );

    await page.waitForTimeout(920);
    const touchPoint = { x: .72, y: .35 };
    const touchBaseline = await captureCandidate(page, box);
    await dispatchGesture(candidate, touchPoint, 'touch', 61);
    await page.waitForTimeout(120);
    const touchActive = await captureCandidate(page, box, path.join(outDir, 'pointer-touch.png'));
    const touchResponse = await measureSpatialResponse(page, touchBaseline, touchActive, touchPoint, .22, 3);
    const touchSnapshot = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
    assert(Math.abs((touchSnapshot?.pointerX ?? -1) - touchPoint.x) < .02);
    assert(Math.abs((touchSnapshot?.pointerY ?? -1) - touchPoint.y) < .02);
    assert(touchResponse.changed >= 20 && touchResponse.locality >= localityFloor,
      `Touch must inject the same bounded full-surface field: ${JSON.stringify(touchResponse)}`);
    assert.equal(await candidate.evaluate((stage) => getComputedStyle(stage).touchAction), 'pan-y');

    const active = await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__);
    assert(active, 'Asset interaction diagnostics are unavailable');
    assert.equal(active.apertureX, .58);
    assert.equal(active.ambientStrength, .05);
    assert(Math.abs(active.patchFollowPx) <= 5, `Patch follow exceeded 5px: ${active.patchFollowPx}`);
    assert(Math.hypot(active.refractionPx.x, active.refractionPx.y) <= 10.00001,
      `Refraction exceeded 10px: ${JSON.stringify(active.refractionPx)}`);
    assert(active.causticGain <= .180001, `Caustic gain exceeded 18%: ${active.causticGain}`);
    await writeFile(path.join(outDir, 'spatial-metrics.json'), `${JSON.stringify({
      ambientMotion, ambientSpatialInterval, anchoredRecovery, captureEvidence, emptyHaloShape, layerEvidence,
      spatialEvidence, touchResponse, widerFieldEvidence,
    }, null, 2)}\n`);

    await candidate.dispatchEvent('pointerleave', { bubbles: false, pointerId: 1, pointerType: 'mouse' });
    const pointerBeforeReentry = await page.evaluate(
      () => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.pointerX,
    );
    await candidate.dispatchEvent('pointermove', {
      bubbles: true,
      clientX: box.x + box.width * .88,
      clientY: box.y + box.height * .72,
      pointerId: 1,
      pointerType: 'mouse',
    });
    await page.waitForTimeout(30);
    assert.equal(
      await page.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.pointerX),
      pointerBeforeReentry,
      'The first pointer sample after leave must reset velocity sampling without moving the field',
    );

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => !window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf);
    assert.equal(await canvas.count(), 0, 'A hidden document must release its ambient canvas');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await canvas.waitFor();
    await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);

    await candidate.evaluate((stage) => { stage.style.transform = 'translateY(1200px)'; });
    await page.waitForFunction(() => !window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf);
    assert.equal(await canvas.count(), 0, 'An offscreen candidate must release its ambient canvas');
    await candidate.evaluate((stage) => { stage.style.transform = ''; });
    await candidate.scrollIntoViewIfNeeded();
    await canvas.waitFor();
    await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);

    await canvas.dispatchEvent('webglcontextlost');
    await page.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.contextStatus === 'unavailable');
    assert.equal(await page.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(), 0);
    assert.deepEqual(await captureCandidate(page, box), staticFrame, 'Context loss must expose accepted static pixels');
  } finally {
    await page.close();
  }

  const runtimeFailure = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  try {
    await runtimeFailure.goto(`${baseUrl}/_visual/optical-lab?candidate=asset`, { waitUntil: 'networkidle' });
    const candidate = runtimeFailure.locator('[data-asset-candidate="true"]');
    await candidate.scrollIntoViewIfNeeded();
    const box = await candidate.boundingBox();
    assert(box, 'Runtime-failure candidate bounds are unavailable');
    await moveMouse(runtimeFailure, box, .3, .5);
    const canvas = runtimeFailure.locator('canvas[data-optical-asset-interaction-canvas="true"]');
    await canvas.waitFor();
    await runtimeFailure.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
    await canvas.evaluate((node) => {
      const gl = node.getContext('webgl2');
      Object.defineProperty(gl, 'getError', {
        configurable: true,
        value: () => gl.INVALID_OPERATION,
      });
    });
    await moveMouse(runtimeFailure, box, .68, .5);
    await runtimeFailure.waitForFunction(() => (
      window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.contextStatus === 'unavailable'
    ));
    assert.equal(await canvas.count(), 0, 'Runtime GL failure must remove its canvas');
    assert.deepEqual(
      await runtimeFailure.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.resourceCounts),
      {
        buffers: 0,
        framebuffers: 0,
        programs: 0,
        renderbuffers: 0,
        shaders: 0,
        textures: 0,
        vertexArrays: 0,
      },
      'Runtime GL failure must release every tracked resource',
    );
  } finally {
    await runtimeFailure.close();
  }

  const initializationFailure = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  try {
    await initializationFailure.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(contextId, ...options) {
        if (contextId === 'webgl2') return null;
        return original.call(this, contextId, ...options);
      };
    });
    await initializationFailure.goto(`${baseUrl}/_visual/optical-lab?candidate=asset`, { waitUntil: 'networkidle' });
    const candidate = initializationFailure.locator('[data-asset-candidate="true"]');
    await candidate.scrollIntoViewIfNeeded();
    const box = await candidate.boundingBox();
    assert(box, 'Initialization-failure candidate bounds are unavailable');
    await moveMouse(initializationFailure, box, .4, .5);
    await initializationFailure.waitForFunction(() => (
      window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.contextStatus === 'unavailable'
    ));
    assert.equal(
      await initializationFailure.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(),
      0,
      'Initialization failure must remove the attempted canvas',
    );
    const failedSnapshot = await initializationFailure.evaluate(
      () => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__,
    );
    assert.equal(failedSnapshot.activeRaf, false);
    assert(Object.values(failedSnapshot.resourceCounts).every((count) => count === 0));
  } finally {
    await initializationFailure.close();
  }

  const delayedInitialization = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  try {
    await delayedInitialization.addInitScript(() => {
      window.__assetDelayedInitialization = { releaseDecodes: [], webgl2Contexts: 0 };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function trackedGetContext(contextId, ...options) {
        if (contextId === 'webgl2' && this.dataset.opticalAssetInteractionCanvas === 'true') {
          window.__assetDelayedInitialization.webgl2Contexts += 1;
        }
        return original.call(this, contextId, ...options);
      };
      const originalDecode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function delayedTargetDecode() {
        if (this.src.includes('/optical-lab/target-reference.png')) {
          return new Promise((resolve) => {
            window.__assetDelayedInitialization.releaseDecodes.push(resolve);
          });
        }
        return originalDecode.call(this);
      };
    });
    await delayedInitialization.goto(`${baseUrl}/_visual/optical-lab?candidate=asset`, { waitUntil: 'networkidle' });
    await delayedInitialization.waitForSelector('canvas[data-optical-asset-interaction-canvas="true"]', { state: 'attached' });
    await delayedInitialization.waitForFunction(() => window.__assetDelayedInitialization.webgl2Contexts === 1);
    await delayedInitialization.waitForFunction(() => (
      window.__assetDelayedInitialization.releaseDecodes.length === 1
    ));
    await delayedInitialization.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await delayedInitialization.waitForTimeout(100);
    assert.equal(
      await delayedInitialization.evaluate(() => window.__assetDelayedInitialization.webgl2Contexts),
      1,
      'Hide/resume during delayed initialization must retain one pending WebGL owner',
    );
    const navigatedHome = delayedInitialization.waitForURL(`${baseUrl}/`, { waitUntil: 'commit' });
    await delayedInitialization.locator('[data-optical-lab-exit="true"]').evaluate((link) => link.click());
    await navigatedHome;
    await delayedInitialization.waitForSelector('[data-accepted-optical-surface="landing"]');
    await delayedInitialization.evaluate(() => window.__assetDelayedInitialization.releaseDecodes[0]());
    await delayedInitialization.waitForTimeout(300);
    assert.equal(
      await delayedInitialization.evaluate(() => '__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__' in window),
      true,
      'A late Lab initialization completion must preserve the Landing diagnostic owner',
    );
    assert.equal(
      await delayedInitialization.locator('#landing-optical-surface canvas[data-optical-asset-interaction-canvas="true"]').count(),
      1,
      'The Landing must retain exactly one fresh canvas owner after the Lab unmounts',
    );
  } finally {
    await delayedInitialization.evaluate(() => {
      for (const release of window.__assetDelayedInitialization?.releaseDecodes ?? []) release();
    }).catch(() => {});
    await delayedInitialization.close();
  }

  const unmount = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  try {
    await unmount.addInitScript(() => {
      window.__assetInteractionCleanup = {
        canvasRemove: 0,
        deletes: {
          buffers: 0, framebuffers: 0, programs: 0, renderbuffers: 0,
          shaders: 0, textures: 0, vertexArrays: 0,
        },
        listenersAdded: {},
        listenersRemoved: {},
      };
      const deletionMethods = {
        deleteBuffer: 'buffers',
        deleteFramebuffer: 'framebuffers',
        deleteProgram: 'programs',
        deleteRenderbuffer: 'renderbuffers',
        deleteShader: 'shaders',
        deleteTexture: 'textures',
        deleteVertexArray: 'vertexArrays',
      };
      for (const [method, key] of Object.entries(deletionMethods)) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function trackedDelete(...args) {
          window.__assetInteractionCleanup.deletes[key] += 1;
          return original.apply(this, args);
        };
      }
      const originalCanvasRemove = HTMLCanvasElement.prototype.remove;
      HTMLCanvasElement.prototype.remove = function trackedCanvasRemove() {
        if (this.dataset.opticalAssetInteractionCanvas === 'true') {
          window.__assetInteractionCleanup.canvasRemove += 1;
        }
        return originalCanvasRemove.call(this);
      };
      const originalAdd = EventTarget.prototype.addEventListener;
      const originalRemove = EventTarget.prototype.removeEventListener;
      const isOwnedTarget = (target) => target?.id === 'optical-lab-candidate'
        || (
          target?.dataset?.opticalAssetInteractionCanvas === 'true'
          && target.closest('#optical-lab-candidate') !== null
        );
      EventTarget.prototype.addEventListener = function trackedAdd(type, ...args) {
        if (isOwnedTarget(this)) {
          const counts = window.__assetInteractionCleanup.listenersAdded;
          counts[type] = (counts[type] ?? 0) + 1;
        }
        return originalAdd.call(this, type, ...args);
      };
      EventTarget.prototype.removeEventListener = function trackedRemove(type, ...args) {
        if (isOwnedTarget(this)) {
          const counts = window.__assetInteractionCleanup.listenersRemoved;
          counts[type] = (counts[type] ?? 0) + 1;
        }
        return originalRemove.call(this, type, ...args);
      };
    });
    await unmount.goto(`${baseUrl}/_visual/optical-lab?candidate=asset`, { waitUntil: 'networkidle' });
    const candidate = unmount.locator('[data-asset-candidate="true"]');
    const box = await candidate.boundingBox();
    assert(box, 'Unmount candidate bounds are unavailable');
    await moveMouse(unmount, box, .7, .5);
    await unmount.waitForFunction(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf === true);
    const ownedCounts = await unmount.evaluate(
      () => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__.resourceCounts,
    );
    await unmount.locator('[data-optical-lab-exit="true"]').click();
    await unmount.waitForURL(`${baseUrl}/`);
    await unmount.waitForTimeout(100);
    const cleanup = await unmount.evaluate(() => window.__assetInteractionCleanup);
    assert.equal(cleanup.canvasRemove, 1, 'React unmount must remove the owned canvas exactly once');
    assert.deepEqual(cleanup.deletes, ownedCounts, 'React unmount must delete each tracked OGL resource exactly once');
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'webglcontextlost']) {
      assert.equal(cleanup.listenersRemoved[type], cleanup.listenersAdded[type], `${type} listener must balance on unmount`);
    }
    assert.equal(
      await unmount.evaluate(() => '__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__' in window),
      true,
      'SPA promotion must transfer the diagnostic global to the Landing owner',
    );
    assert.equal(
      await unmount.locator('#landing-optical-surface canvas[data-optical-asset-interaction-canvas="true"]').count(),
      1,
      'SPA promotion must leave exactly one Landing canvas owner',
    );
  } finally {
    await unmount.close();
  }

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    await reduced.emulateMedia({ reducedMotion: 'reduce' });
    await reduced.goto(`${baseUrl}/_visual/optical-lab?candidate=asset`, { waitUntil: 'networkidle' });
    const candidate = reduced.locator('[data-asset-candidate="true"]');
    const box = await candidate.boundingBox();
    assert(box, 'Reduced-motion candidate bounds are unavailable');
    await moveMouse(reduced, box, .8, .5);
    await reduced.waitForTimeout(100);
    assert.equal(await reduced.locator('canvas[data-optical-asset-interaction-canvas="true"]').count(), 0);
    assert.equal(await reduced.evaluate(() => window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.activeRaf), false);
  } finally {
    await reduced.close();
  }
  assert.deepEqual(pageErrors, [], `Asset interaction emitted browser errors: ${pageErrors.join('\n')}`);
} catch (error) {
  if (
    error !== fixedCenterMutationComplete
    && error !== overlaySkipDrawMutationComplete
    && error !== overlayMaskProofComplete
  ) primaryError = error;
}

let cleanupError;
try {
  if (browser) await Promise.race([browser.close(), timeout('Asset interaction browser close')]);
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
