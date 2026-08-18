/* global Image, WebGL2RenderingContext, document, process */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'out/hermes-articulated');
const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3194';

async function comparePng(page, first, second, regions) {
  return page.evaluate(async ({ firstBase64, secondBase64, regionsToMeasure }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, height: canvas.height, width: canvas.width };
    };
    const a = await decode(firstBase64);
    const b = await decode(secondBase64);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Hermes captures differ in size');
    const result = {};
    for (const [name, box] of Object.entries(regionsToMeasure)) {
      let changed = 0;
      let magnitude = 0;
      const left = Math.floor(box[0] * a.width);
      const top = Math.floor(box[1] * a.height);
      const right = Math.ceil(box[2] * a.width);
      const bottom = Math.ceil(box[3] * a.height);
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * a.width + x) * 4;
          const delta = Math.max(
            Math.abs(a.data[index] - b.data[index]),
            Math.abs(a.data[index + 1] - b.data[index + 1]),
            Math.abs(a.data[index + 2] - b.data[index + 2]),
            Math.abs(a.data[index + 3] - b.data[index + 3]),
          );
          if (delta >= 8) changed += 1;
          magnitude += delta;
        }
      }
      result[name] = { changed, magnitude };
    }
    return result;
  }, {
    firstBase64: first.toString('base64'),
    secondBase64: second.toString('base64'),
    regionsToMeasure: regions,
  });
}

async function analyzeArticulation(page, first, second, regions) {
  return page.evaluate(async ({ firstBase64, secondBase64, regionsToMeasure }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, height: canvas.height, width: canvas.width };
    };
    const a = await decode(firstBase64);
    const b = await decode(secondBase64);
    const background = [a.data[0], a.data[1], a.data[2]];
    const foreground = (data, x, y) => {
      if (x < 0 || y < 0 || x >= a.width || y >= a.height) return false;
      const index = (y * a.width + x) * 4;
      return Math.max(
        Math.abs(data[index] - background[0]),
        Math.abs(data[index + 1] - background[1]),
        Math.abs(data[index + 2] - background[2]),
      ) >= 12;
    };
    const result = {};
    for (const [name, box] of Object.entries(regionsToMeasure)) {
      const left = Math.floor(box[0] * a.width);
      const top = Math.floor(box[1] * a.height);
      const right = Math.ceil(box[2] * a.width);
      const bottom = Math.ceil(box[3] * a.height);
      let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };
      for (let dy = -14; dy <= 14; dy += 1) {
        for (let dx = -14; dx <= 14; dx += 1) {
          let error = 0;
          let samples = 0;
          for (let y = top; y < bottom; y += 2) {
            for (let x = left; x < right; x += 2) {
              const bx = x + dx;
              const by = y + dy;
              if (bx < left || bx >= right || by < top || by >= bottom) continue;
              if (!foreground(a.data, x, y) && !foreground(b.data, bx, by)) continue;
              const ai = (y * a.width + x) * 4;
              const bi = (by * b.width + bx) * 4;
              error += Math.abs(a.data[ai] - b.data[bi])
                + Math.abs(a.data[ai + 1] - b.data[bi + 1])
                + Math.abs(a.data[ai + 2] - b.data[bi + 2]);
              samples += 1;
            }
          }
          const score = samples > 0 ? error / samples : Number.POSITIVE_INFINITY;
          if (score < best.score) best = { dx, dy, score };
        }
      }
      let cracks = 0;
      let interior = 0;
      for (let y = top + 1; y < bottom - 1; y += 1) {
        for (let x = left + 1; x < right - 1; x += 1) {
          if (!foreground(a.data, x, y)
            || !foreground(a.data, x - 1, y)
            || !foreground(a.data, x + 1, y)
            || !foreground(a.data, x, y - 1)
            || !foreground(a.data, x, y + 1)) continue;
          const bx = x + best.dx;
          const by = y + best.dy;
          if (bx < left || bx >= right || by < top || by >= bottom) continue;
          interior += 1;
          if (!foreground(b.data, bx, by)) cracks += 1;
        }
      }
      result[name] = { ...best, crackRatio: interior > 0 ? cracks / interior : 1, interior };
    }
    const componentCount = (data) => {
      const visited = new Uint8Array(a.width * a.height);
      let count = 0;
      for (let y = 0; y < a.height; y += 1) {
        for (let x = 0; x < a.width; x += 1) {
          const start = y * a.width + x;
          if (visited[start] || !foreground(data, x, y)) continue;
          const queue = [start];
          visited[start] = 1;
          let area = 0;
          while (queue.length) {
            const index = queue.pop();
            area += 1;
            const px = index % a.width;
            const py = Math.floor(index / a.width);
            for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
              if (nx < 0 || ny < 0 || nx >= a.width || ny >= a.height) continue;
              const next = ny * a.width + nx;
              if (!visited[next] && foreground(data, nx, ny)) {
                visited[next] = 1;
                queue.push(next);
              }
            }
          }
          if (area >= 18) count += 1;
        }
      }
      return count;
    };
    return { components: { before: componentCount(a.data), after: componentCount(b.data) }, regions: result };
  }, {
    firstBase64: first.toString('base64'),
    secondBase64: second.toString('base64'),
    regionsToMeasure: regions,
  });
}

async function capture(stage, name) {
  const buffer = await stage.screenshot({ animations: 'allow' });
  await writeFile(resolve(output, `${name}.png`), buffer);
  return buffer;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const video = page.video();
try {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/auth/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free' }) }));
  await page.route('**/api/research-objects?limit=20', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjects: [] }) }));
  await page.route('**/api/ingestion?actionable=true', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tasks: [] }) }));
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.hermes-guide-nudge')?.getAttribute('data-visible') === 'true');
  await page.screenshot({ path: resolve(output, 'dashboard-with-prompt.png'), fullPage: true, animations: 'allow' });
  await page.addStyleTag({ content: '.hermes-guide-nudge{display:none!important}' });
  await page.goto(`${baseUrl}/_visual/hermes-articulation`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-rig="mesh-2d"]');
  const canvas = page.locator('[data-hermes-articulated-canvas="true"]');
  await stage.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="mesh-2d"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  const regions = {
    full: [0, 0, 1, 1],
    head: [.06, .02, .52, .43],
    torso: [.12, .30, .78, .78],
    tail: [.48, .52, .98, .98],
  };

  await page.getByRole('button', { name: 'Freeze rest' }).click();
  await page.waitForFunction(() => document.querySelector('[data-hermes-articulated-canvas]')?.getAttribute('data-hermes-gesture') === 'rest');
  const restA = await capture(stage, 'rest-a');
  await page.waitForTimeout(520);
  const restB = await capture(stage, 'rest-b');
  const breathing = await comparePng(page, restA, restB, regions);

  await page.getByRole('button', { name: 'Observe action' }).click();
  await page.waitForFunction(() => document.querySelector('[data-hermes-articulated-canvas]')?.getAttribute('data-hermes-gesture') === 'observe');
  const observeA = await capture(stage, 'observe-a');
  await page.waitForTimeout(520);
  const observeB = await capture(stage, 'observe-b');
  const observe = await comparePng(page, observeA, observeB, regions);

  await page.getByRole('button', { name: 'Citation action' }).click();
  await page.waitForFunction(() => document.querySelector('[data-hermes-articulated-canvas]')?.getAttribute('data-hermes-gesture') === 'citation-swish');
  const citationA = await capture(stage, 'citation-a');
  await page.waitForTimeout(420);
  const citationB = await capture(stage, 'citation-b');
  const citation = await comparePng(page, citationA, citationB, regions);

  const box = await stage.boundingBox();
  assert.ok(box, 'Hermes mesh stage must have geometry');
  const pointerBefore = await capture(stage, 'pointer-before');
  await page.getByRole('button', { name: 'Fixed pointer' }).click();
  await page.waitForTimeout(220);
  const pointerAfter = await capture(stage, 'pointer-after');
  const pointer = await comparePng(page, pointerBefore, pointerAfter, regions);
  assert.equal(await canvas.getAttribute('data-hermes-gesture'), 'focus');

  await page.addStyleTag({ content: '[data-hermes-articulation-harness]{height:288px!important;width:288px!important}' });
  const capturePerceptualAction = async (buttonName, artifactName, peakMs) => {
    await page.getByRole('button', { name: 'Freeze rest' }).click();
    await page.waitForTimeout(700);
    const rest = await capture(stage, `${artifactName}-rest-288`);
    await page.getByRole('button', { name: buttonName }).click();
    await page.waitForTimeout(peakMs);
    const active = await capture(stage, `${artifactName}-active-288`);
    return comparePng(page, rest, active, regions);
  };
  const perceptual = {
    doze: await capturePerceptualAction('Doze action', 'doze', 900),
    patrol: await capturePerceptualAction('Patrol action', 'patrol', 1_470),
    returning: await capturePerceptualAction('Return action', 'return', 1_260),
    stretch: await capturePerceptualAction('Stretch action', 'stretch', 725),
    surprise: await capturePerceptualAction('Surprise action', 'surprise', 325),
    wake: await capturePerceptualAction('Wake action', 'wake', 380),
  };

  const probe = await context.newPage();
  await probe.goto(`${baseUrl}/_visual/hermes-articulation`, { waitUntil: 'networkidle' });
  const probeStage = probe.locator('[data-hermes-rig="mesh-2d"]');
  await probe.waitForFunction(() => document.querySelector('[data-hermes-rig="mesh-2d"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  await probe.getByRole('button', { name: 'Freeze rest' }).click();
  await probe.waitForTimeout(1_200);
  const fixedControlA = await capture(probeStage, 'fixed-control-a');
  await probe.waitForTimeout(300);
  const fixedBefore = await capture(probeStage, 'fixed-pointer-before');
  const fixedControl = await comparePng(probe, fixedControlA, fixedBefore, { full: [0, 0, 1, 1] });
  await probe.getByRole('button', { name: 'Fixed pointer' }).click();
  await probe.waitForTimeout(900);
  const fixedAfter = await capture(probeStage, 'fixed-pointer-after');
  const articulation = await analyzeArticulation(probe, fixedBefore, fixedAfter, {
    head: [.24, .10, .52, .40],
    torso: [.28, .40, .58, .59],
    tail: [.54, .59, .82, .84],
  });
  await probe.close();

  const affineProbe = await context.newPage();
  await affineProbe.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
      let next = source;
      if (source.includes('uniform vec3 uHead;') && source.includes('float torsoWeight')) {
        next = source.replace(/void main\(\) \{[\s\S]*?\n {2}\}/, `void main() {
    vec2 point = uv + uHead.xy / max(uViewport, vec2(1.0));
    vUv = uv;
    gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
  }`);
      }
      return original.call(this, shader, next);
    };
  });
  await affineProbe.goto(`${baseUrl}/_visual/hermes-articulation`, { waitUntil: 'networkidle' });
  const affineStage = affineProbe.locator('[data-hermes-rig="mesh-2d"]');
  await affineProbe.waitForFunction(() => document.querySelector('[data-hermes-rig="mesh-2d"]')?.getAttribute('data-hermes-rig-status') === 'ready');
  await affineProbe.getByRole('button', { name: 'Freeze rest' }).click();
  await affineProbe.waitForTimeout(1_200);
  const affineBefore = await capture(affineStage, 'affine-mutation-before');
  await affineProbe.getByRole('button', { name: 'Fixed pointer' }).click();
  await affineProbe.waitForTimeout(900);
  const affineAfter = await capture(affineStage, 'affine-mutation-after');
  const affineMutation = await analyzeArticulation(affineProbe, affineBefore, affineAfter, {
    head: [.24, .10, .52, .40],
    torso: [.28, .40, .58, .59],
    tail: [.54, .59, .82, .84],
  });
  await affineProbe.close();

  assert.ok(breathing.torso.changed >= 120, `breathing must move torso pixels, got ${breathing.torso.changed}`);
  assert.ok(observe.head.changed >= 240, `observe must move head pixels, got ${observe.head.changed}`);
  assert.ok(citation.tail.changed >= 260, `citation must move tail pixels, got ${citation.tail.changed}`);
  assert.ok(pointer.head.changed >= 320, `pointer must move head pixels, got ${pointer.head.changed}`);
  assert.ok(pointer.tail.changed >= 160, `pointer must counter-move tail pixels, got ${pointer.tail.changed}`);
  assert.ok(perceptual.doze.head.changed >= 360, `288px doze must visibly change the face, got ${perceptual.doze.head.changed}`);
  assert.ok(perceptual.stretch.torso.changed >= 220, `288px stretch must visibly reshape the torso, got ${perceptual.stretch.torso.changed}`);
  assert.ok(perceptual.wake.head.changed >= 260, `288px wake must visibly lift the head, got ${perceptual.wake.head.changed}`);
  assert.ok(perceptual.surprise.full.changed >= 720, `288px surprise must visibly change the silhouette, got ${perceptual.surprise.full.changed}`);
  assert.ok(perceptual.patrol.torso.changed >= 220, `288px patrol must move more than the tail, got torso ${perceptual.patrol.torso.changed}`);
  assert.ok(perceptual.returning.torso.changed >= 180, `288px return must visibly land the body, got torso ${perceptual.returning.torso.changed}`);
  assert.ok(fixedControl.full.changed <= 12, `fixed-time pointer control must freeze autonomous pixels, got ${fixedControl.full.changed}`);
  const vectorDistance = (a, b) => Math.hypot(a.dx - b.dx, a.dy - b.dy);
  const maximumVectorSpread = (measurement) => Math.max(
    vectorDistance(measurement.regions.head, measurement.regions.torso),
    vectorDistance(measurement.regions.head, measurement.regions.tail),
    vectorDistance(measurement.regions.torso, measurement.regions.tail),
  );
  assert.ok(Math.hypot(articulation.regions.head.dx, articulation.regions.head.dy) >= 3, `head pixel shift must be readable, got ${JSON.stringify(articulation.regions.head)}`);
  assert.ok(vectorDistance(articulation.regions.head, articulation.regions.torso) >= 2, `head and torso must not share one affine vector: ${JSON.stringify(articulation.regions)}`);
  assert.ok(vectorDistance(articulation.regions.head, articulation.regions.tail) >= 3, `tail must counter the head rather than translate with it: ${JSON.stringify(articulation.regions)}`);
  assert.ok(Object.values(articulation.regions).every((region) => region.interior >= 80 && region.crackRatio <= .08), `articulation must not open interior seams: ${JSON.stringify(articulation.regions)}`);
  assert.ok(articulation.components.after <= articulation.components.before, `articulation must not split the silhouette: ${JSON.stringify(articulation.components)}`);
  assert.ok(maximumVectorSpread(affineMutation) < 2, `controlled whole-image affine mutation must produce one shared vector: ${JSON.stringify(affineMutation.regions)}`);
  assert.ok(maximumVectorSpread(articulation) >= 3, `production articulation must reject the affine mutation: ${JSON.stringify(articulation.regions)}`);
  assert.deepEqual(errors, []);
  process.stdout.write(`${JSON.stringify({ affineMutation, articulation, breathing, citation, fixedControl, observe, perceptual, pointer }, null, 2)}\n`);
} finally {
  await page.close();
  if (video) await video.saveAs(resolve(output, 'hermes-articulation-preview.webm'));
  await context.close();
  await browser.close();
}
