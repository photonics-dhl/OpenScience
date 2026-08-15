/* global Event, HTMLCanvasElement, URL, document, process, setTimeout, window */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const baseUrl = process.env.HERMES_BASE_URL ?? 'http://127.0.0.1:3180';
const outDir = new URL('./out/hermes-3d/', import.meta.url);
await mkdir(outDir, { recursive: true });

const taskByState = {
  idle: undefined,
  guiding: 'queued',
  scanning: 'parsing',
  suggesting: 'stored',
  awaiting_approval: 'needs_review',
  failed: 'failed_retryable',
};
const actionByState = {
  idle: 'Hermes_Idle',
  guiding: 'Hermes_Guiding',
  scanning: 'Hermes_Scanning',
  suggesting: 'Hermes_Suggesting',
  awaiting_approval: 'Hermes_AwaitingApproval',
  failed: 'Hermes_Failed',
};

const browser = await chromium.launch({ headless: true });
const evidence = [];

async function installContextLedger(page, failBrandedShader = false) {
  await page.addInitScript(({ failShader }) => {
    const counts = { acquired: 0, released: 0 };
    window.__HERMES_CONTEXT_COUNTS__ = counts;
    const countedContexts = new WeakSet();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
      const context = originalGetContext.call(this, type, ...args);
      if (type !== 'webgl2' || !context || !this.hasAttribute('data-hermes-3d-canvas') || countedContexts.has(context)) return context;
      countedContexts.add(context);
      counts.acquired += 1;
      const originalGetExtension = context.getExtension.bind(context);
      context.getExtension = (name) => {
        const extension = originalGetExtension(name);
        if (name !== 'WEBGL_lose_context' || !extension || extension.__hermesWrapped) return extension;
        extension.__hermesWrapped = true;
        const originalLoseContext = extension.loseContext.bind(extension);
        extension.loseContext = () => {
          counts.released += 1;
          return originalLoseContext();
        };
        return extension;
      };
      if (failShader) {
        const shaderSources = new WeakMap();
        const shaderPrograms = new WeakMap();
        const brandedPrograms = new WeakSet();
        const originalShaderSource = context.shaderSource.bind(context);
        const originalAttachShader = context.attachShader.bind(context);
        const originalGetProgramParameter = context.getProgramParameter.bind(context);
        const originalGetProgramInfoLog = context.getProgramInfoLog.bind(context);
        context.shaderSource = (shader, source) => {
          shaderSources.set(shader, source);
          if (source.includes('uMaterialRole')) shaderPrograms.get(shader)?.forEach((program) => brandedPrograms.add(program));
          return originalShaderSource(shader, source);
        };
        context.attachShader = (program, shader) => {
          const programs = shaderPrograms.get(shader) ?? [];
          programs.push(program);
          shaderPrograms.set(shader, programs);
          if (shaderSources.get(shader)?.includes('uMaterialRole')) brandedPrograms.add(program);
          return originalAttachShader(program, shader);
        };
        context.getProgramParameter = (program, parameter) => {
          if (parameter === context.LINK_STATUS && brandedPrograms.has(program)) return false;
          return originalGetProgramParameter(program, parameter);
        };
        context.getProgramInfoLog = (program) => brandedPrograms.has(program)
          ? 'Hermes branded shader failure injected by release gate'
          : originalGetProgramInfoLog(program);
      }
      return context;
    };
  }, { failShader: failBrandedShader });
}

async function mockDashboard(page, taskState) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
    userId: 'hermes-user', email: 'hermes@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free',
  } }));
  await page.route('**/api/research-objects?limit=20', (route) => route.fulfill({ json: { researchObjects: [{
    id: 'ro-hermes', publicId: 'OSR-2026-000042', title: 'Coherent transport at the attosecond frontier', version: 2, status: 'draft',
  }] } }));
  await page.route('**/api/ingestion?actionable=true', (route) => route.fulfill({ json: { tasks: taskState ? [{
    id: 'task-hermes', researchObjectId: 'ro-hermes', researchTitle: 'Coherent transport at the attosecond frontier',
    logicalPath: 'manuscript.pdf', state: taskState, retryCount: 0, error: taskState.startsWith('failed_') ? 'Parser interrupted' : null,
  }] : [] } }));
}

try {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installContextLedger(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const [state, taskState] of Object.entries(taskByState)) {
    await page.unrouteAll({ behavior: 'wait' });
    await mockDashboard(page, taskState);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('[data-hermes-3d-host]').waitFor({ state: 'visible' });
    await page.waitForFunction((expected) => (
      window.__OPENSCIENCE_HERMES_3D__?.contextStatus === 'ready'
      && window.__OPENSCIENCE_HERMES_3D__?.action === expected
    ), actionByState[state], { timeout: 15_000 });
    assert.equal(await page.locator('[data-hermes-3d-canvas]').count(), 1, `${state} must own one canvas`);
    assert.equal(await page.locator('[data-hermes-instance]').count(), 1, `${state} must keep one semantic visual`);
    assert.equal(await page.locator('[data-hermes-renderer="ogl-gltf"]').count(), 1, `${state} must hand off after a real frame`);
    const rendererBudget = await page.evaluate(() => ({
      dpr: window.__OPENSCIENCE_HERMES_3D__.dpr,
      drawCalls: window.__OPENSCIENCE_HERMES_3D__.drawCalls,
      firstFrameMs: window.__OPENSCIENCE_HERMES_3D__.firstFrameMs,
      materialPrograms: window.__OPENSCIENCE_HERMES_3D__.materialPrograms,
    }));
    assert.equal(rendererBudget.dpr, 1.5, 'desktop must cap DPR at 1.5');
    assert.equal(rendererBudget.drawCalls, 6, 'desktop must retain six branded draws');
    assert.equal(rendererBudget.materialPrograms, 6, 'every draw must use the branded material shader');
    assert.ok(rendererBudget.firstFrameMs > 0 && rendererBudget.firstFrameMs <= 3_000, `first frame must remain bounded: ${rendererBudget.firstFrameMs}`);
    assert.equal(
      await page.evaluate(() => typeof window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__),
      'function',
      'renderer must expose an on-demand same-frame subject probe',
    );
    const subject = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__());
    assert.ok(subject.heightRatio >= (state === 'idle' ? .82 : .68), `${state} must keep an upright, legible character: ${JSON.stringify(subject)}`);
    assert.ok(subject.heightRatio <= .97, `${state} must not clip the character: ${JSON.stringify(subject)}`);
    assert.ok(subject.widthRatio >= .28, `${state} silhouette must remain legible: ${JSON.stringify(subject)}`);

    const before = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
    await page.waitForTimeout(260);
    const after = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
    const laterSubject = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__());
    assert.equal(typeof subject.pixelHash, 'number', 'subject probe must carry a real pixel hash');
    let activeFrameDelta = 0;
    if (state === 'awaiting_approval') assert.equal(after, before, 'approval must remain exactly still');
    else {
      assert.ok(after > before, `${state} animation must advance`);
      assert.ok(after - before >= 4 && after - before <= 10, `${state} must render near the 30 Hz idle cadence: ${after - before}`);
    }
    if (state === 'awaiting_approval') assert.equal(laterSubject.pixelHash, subject.pixelHash, 'approval pixels must remain exactly still');
    else assert.notEqual(laterSubject.pixelHash, subject.pixelHash, `${state} action must change real rendered pixels`);
    if (state === 'failed') {
      await page.waitForTimeout(2_400);
      const settled = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__());
      await page.waitForTimeout(260);
      const stillSettled = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__());
      assert.equal(stillSettled.pixelHash, settled.pixelHash, 'failed must recoil once and settle instead of looping');
    }
    await page.locator('[data-hermes-renderer="ogl-gltf"]').screenshot({ path: new URL(`${state}-desktop.png`, outDir).pathname.slice(1) });

    if (state === 'idle') {
      const box = await page.locator('[data-hermes-renderer="ogl-gltf"]').boundingBox();
      assert.ok(box, 'Hermes visual bounds must exist');
      await page.mouse.move(box.x + box.width * .82, box.y + box.height * .25);
      const activeBefore = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
      await page.waitForTimeout(180);
      const activeAfter = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
      activeFrameDelta = activeAfter - activeBefore;
      assert.ok(activeFrameDelta >= 7, `pointer response must step up toward 60 Hz: ${activeFrameDelta}`);
      const pointer = await page.evaluate(() => ({
        x: window.__OPENSCIENCE_HERMES_3D__.pointerX,
        y: window.__OPENSCIENCE_HERMES_3D__.pointerY,
      }));
      assert.ok(pointer.x > .05 && pointer.y < -.02, `pointer gaze must follow the user: ${JSON.stringify(pointer)}`);
      await page.screenshot({ path: new URL('idle-desktop.png', outDir).pathname.slice(1), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 400 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForFunction(() => window.__OPENSCIENCE_HERMES_3D__?.visible === false);
      const suspendedFrame = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount), suspendedFrame, 'offscreen Hermes must pause');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.__OPENSCIENCE_HERMES_3D__?.visible === true);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenFrame = await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.frameCount), hiddenFrame, 'hidden Hermes must pause');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction((frame) => window.__OPENSCIENCE_HERMES_3D__?.frameCount > frame, hiddenFrame);
    }
    evidence.push({
      action: actionByState[state],
      activeFrameDelta,
      firstFrameMs: rendererBudget.firstFrameMs,
      heightRatio: subject.heightRatio,
      idleFrameDelta: after - before,
      nonTransparentPixels: subject.nonTransparentPixels,
      state,
      widthRatio: subject.widthRatio,
    });
  }
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  await page.locator('[data-hermes-3d-canvas]').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await page.waitForFunction(() => !('__OPENSCIENCE_HERMES_3D__' in window));
  assert.equal(await page.locator('[data-hermes-3d-canvas]').count(), 0, 'context loss must release its canvas');
  assert.equal(await page.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'context loss must restore the fallback');
  assert.deepEqual(
    await page.evaluate(() => window.__HERMES_CONTEXT_COUNTS__),
    { acquired: 1, released: 1 },
    'context loss must balance the one Hermes WebGL2 owner',
  );
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-hermes-3d-canvas]').count(), 0, 'route transfer must remove the canvas');
  assert.equal(await page.evaluate(() => '__OPENSCIENCE_HERMES_3D__' in window), false, 'route transfer must remove diagnostics ownership');
  await context.close();

  const mobileContext = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mockDashboard(mobilePage, 'stored');
  await mobilePage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await mobilePage.waitForFunction(() => window.__OPENSCIENCE_HERMES_3D__?.contextStatus === 'ready');
  assert.equal(await mobilePage.locator('[data-hermes-3d-canvas]').count(), 1, 'mobile must retain the same 3D capability');
  assert.equal(await mobilePage.evaluate(() => window.__OPENSCIENCE_HERMES_3D__.dpr), 1, 'mobile must cap DPR at 1');
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth), 390, 'mobile 3D must not overflow');
  await mobilePage.screenshot({ path: new URL('suggesting-mobile.png', outDir).pathname.slice(1), fullPage: true });
  await mobileContext.close();

  const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reducedContext.newPage();
  await mockDashboard(reducedPage, 'needs_review');
  await reducedPage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await reducedPage.waitForTimeout(900);
  assert.equal(await reducedPage.locator('[data-hermes-3d-canvas]').count(), 0, 'reduced motion must create no WebGL canvas');
  assert.equal(await reducedPage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'reduced motion must retain the original fallback');
  await reducedPage.screenshot({ path: new URL('approval-reduced-mobile.png', outDir).pathname.slice(1), fullPage: true });
  await reducedContext.close();

  const toggleContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const togglePage = await toggleContext.newPage();
  await installContextLedger(togglePage);
  await mockDashboard(togglePage, 'stored');
  await togglePage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await togglePage.waitForFunction(() => window.__OPENSCIENCE_HERMES_3D__?.contextStatus === 'ready');
  await togglePage.emulateMedia({ reducedMotion: 'reduce' });
  await togglePage.waitForFunction(() => document.querySelectorAll('[data-hermes-3d-canvas]').length === 0);
  assert.equal(await togglePage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'ready→reduced must restore fallback ownership');
  assert.deepEqual(await togglePage.evaluate(() => window.__HERMES_CONTEXT_COUNTS__), { acquired: 1, released: 1 }, 'ready→reduced must release its first context');
  await togglePage.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(await togglePage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'reduced→normal must keep fallback until a new real frame');
  await togglePage.waitForFunction(() => window.__OPENSCIENCE_HERMES_3D__?.contextStatus === 'ready');
  assert.equal(await togglePage.locator('[data-hermes-3d-canvas]').count(), 1, 'reduced→normal must create exactly one replacement canvas');
  assert.equal(await togglePage.locator('[data-hermes-renderer="ogl-gltf"]').count(), 1, 'replacement renderer must hand off only after its first frame');
  assert.deepEqual(await togglePage.evaluate(() => window.__HERMES_CONTEXT_COUNTS__), { acquired: 2, released: 1 }, 'replacement must acquire exactly one fresh context');
  await toggleContext.close();

  const delayedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const delayedPage = await delayedContext.newPage();
  await mockDashboard(delayedPage, 'guiding');
  await delayedPage.route('**/hermes/hermes-scholar.glb', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await delayedPage.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await delayedPage.locator('[data-hermes-3d-canvas]').waitFor({ state: 'attached' });
  await delayedPage.emulateMedia({ reducedMotion: 'reduce' });
  await delayedPage.waitForTimeout(800);
  assert.equal(await delayedPage.locator('[data-hermes-3d-canvas]').count(), 0, 'reduced motion during delayed load must cancel ownership');
  assert.equal(await delayedPage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'delayed cancellation must retain fallback');
  await delayedContext.close();

  const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const failurePage = await failureContext.newPage();
  await installContextLedger(failurePage);
  await mockDashboard(failurePage, 'parsing');
  await failurePage.route('**/hermes/hermes-scholar.glb', (route) => route.abort('failed'));
  await failurePage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await failurePage.waitForTimeout(1_000);
  assert.equal(await failurePage.locator('[data-hermes-3d-canvas]').count(), 0, 'failed load must clean its canvas');
  assert.equal(await failurePage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'failed load must restore the original fallback');
  assert.deepEqual(await failurePage.evaluate(() => window.__HERMES_CONTEXT_COUNTS__), { acquired: 1, released: 1 }, 'failed load must release its WebGL2 owner');
  await failureContext.close();

  const shaderFailureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const shaderFailurePage = await shaderFailureContext.newPage();
  await installContextLedger(shaderFailurePage, true);
  await mockDashboard(shaderFailurePage, 'parsing');
  await shaderFailurePage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await shaderFailurePage.waitForFunction(() => document.querySelectorAll('[data-hermes-3d-canvas]').length === 0);
  assert.equal(await shaderFailurePage.locator('[data-hermes-renderer="original-vector"]').count(), 1, 'branded shader failure must restore the original fallback');
  assert.deepEqual(await shaderFailurePage.evaluate(() => window.__HERMES_CONTEXT_COUNTS__), { acquired: 1, released: 1 }, 'shader failure must release its WebGL2 owner');
  await shaderFailureContext.close();
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify({ evidence }, null, 2)}\nHERMES_3D_GATE_OK\n`);
