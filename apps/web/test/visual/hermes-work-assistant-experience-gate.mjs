/* global document, getComputedStyle, innerWidth, localStorage, process */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3198';
const output = resolve('test/visual/out/hermes-work-assistant');
const viewports = [
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
  { height: 844, width: 390 },
];
await mkdir(output, { recursive: true });

const overlaps = (first, second) => first.x < second.x + second.width
  && first.x + first.width > second.x
  && first.y < second.y + second.height
  && first.y + first.height > second.y;

const inside = (box, viewport) => box.x >= 0 && box.y >= 0
  && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;

async function mockProduct(page, state) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push(`${request.method()} ${url.pathname}`);
    const json = (body, status = 200) => route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
    if (url.pathname === '/api/auth/me') return json({
      displayName: 'Ada Researcher', email: 'ada@example.invalid', level: 'free', status: 'email_verified', userId: 'hermes-user',
    });
    if (url.pathname === '/api/csrf-token') return json({ csrfToken: 'hermes-first-person-token' });
    if (url.pathname === '/api/research-objects' && request.method() === 'GET') return json({ researchObjects: [{
      id: 'ro-hermes', publicId: 'OSR-2026-000042', status: 'draft', title: 'Coherent transport at the attosecond frontier', version: 2,
    }] });
    if (url.pathname === '/api/research-objects' && request.method() === 'POST') {
      state.createdTitles.push(request.postDataJSON().title);
      return json({ researchObject: { id: 'ro-experience', version: 1, workspaceId: 'workspace-user' } }, 201);
    }
    if (url.pathname === '/api/ingestion') return json({ tasks: state.taskState ? [{
      error: null,
      id: 'task-hermes',
      logicalPath: 'manuscript.pdf',
      researchObjectId: 'ro-hermes',
      researchTitle: 'Coherent transport at the attosecond frontier',
      retryCount: 0,
      state: state.taskState,
    }] : [] });
    if (url.pathname === '/api/workspaces') return json({ workspaces: [{ id: 'workspace-user', name: 'Optical Sciences', role: 'owner', type: 'personal' }] });
    if (url.pathname === '/api/agent/tasks' && request.method() === 'GET') return json({ tasks: [] });
    return json({});
  });
}

async function waitForRig(page) {
  await page.locator('[data-hermes-workspace-stage="true"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-hermes-rig="live2d-wanko"]')?.getAttribute('data-hermes-rig-status') === 'ready');
}

async function dragStage(page, stage, target) {
  const hull = stage.locator('[data-hermes-carrier-interaction-hull="true"]');
  const bounds = await hull.boundingBox();
  assert.ok(bounds, 'Hermes drag hull must have geometry');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-hermes-workspace-stage]')?.getAttribute('data-hermes-dragging') === 'false');
  await page.waitForTimeout(1200);
}

async function protectedBoxes(page) {
  return page.locator('[data-hermes-protected="true"]').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
  }).filter((box) => box.height > 0 && box.width > 0));
}

async function assertFootprintsSafe(page, viewport, label) {
  const stage = page.locator('[data-hermes-workspace-stage="true"]');
  const actor = await page.locator('[data-hermes-carrier-travel-hull="true"]').boundingBox();
  const stageState = await stage.evaluate((node) => ({
    action: node.getAttribute('data-hermes-action'),
    anchored: node.getAttribute('data-hermes-anchored'),
    box: node.getBoundingClientRect().toJSON(),
    docks: Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('openscience:hermes-dock:'))
      .map((key) => [key, localStorage.getItem(key)])),
    size: node.getAttribute('data-hermes-stage-size'),
  }));
  assert.ok(actor && inside(actor, viewport), `${label} actor must remain inside the visual viewport: ${JSON.stringify({ actor, stageState })}`);
  const protectedRegions = await protectedBoxes(page);
  assert.equal(protectedRegions.some((region) => overlaps(actor, region)), false, `${label} actor must not cover a protected surface`);
  const bubble = page.locator('.hermes-companion-bubble:visible');
  if (await bubble.count()) {
    const bubbleBox = await bubble.boundingBox();
    assert.ok(bubbleBox && inside(bubbleBox, viewport), `${label} bubble must remain inside the visual viewport: ${JSON.stringify(bubbleBox)}`);
    assert.equal(protectedRegions.some((region) => overlaps(bubbleBox, region)), false, `${label} bubble must not cover a protected surface`);
  }
  return { actor, protectedRegions };
}

async function waitForSpeech(page) {
  const observed = new Set();
  for (let elapsed = 0; elapsed < 300_000; elapsed += 250) {
    await page.clock.fastForward(250);
    await page.waitForTimeout(5);
    const sample = await page.evaluate(() => {
      const stage = document.querySelector('[data-hermes-workspace-stage="true"]');
      const bubble = document.querySelector('[data-hermes-performance-bubble="true"]');
      return {
        action: stage?.getAttribute('data-hermes-action'),
        bubbleSafe: stage?.getAttribute('data-hermes-bubble-safe'),
        bubbleVisible: bubble?.getAttribute('data-hermes-speech-visible'),
        speechVisible: stage?.getAttribute('data-hermes-speech-visible'),
      };
    });
    observed.add([sample.action, sample.speechVisible, sample.bubbleSafe, sample.bubbleVisible].join(':'));
    if (sample.speechVisible === 'true') return sample;
  }
  assert.fail(`Hermes must emit one bounded autonomous cue: ${Array.from(observed).join(', ')}`);
}

async function exerciseCreateImport(page, label, state) {
  await page.locator('a[href="/research-objects/new?mode=import"]').last().click();
  await page.waitForURL('**/research-objects/new?mode=import');
  assert.equal(new URL(page.url()).searchParams.get('mode'), 'import', `${label} must reach material import`);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'domcontentloaded' });
  await waitForRig(page);
  await page.locator('a[href="/research-objects/new?mode=blank"]').click();
  await page.waitForURL('**/research-objects/new?mode=blank');
  const title = `First-person ${label} optical draft`;
  await page.waitForFunction(() => document.querySelector('select')?.value === 'workspace-user');
  await page.locator('input[name="title"]').fill(title);
  const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/research-objects'
    && response.request().method() === 'POST', { timeout: 10_000 });
  const createResults = await Promise.allSettled([
    created,
    page.getByRole('button', { name: /Create Research Object|创建 Research Object/u }).click({ timeout: 10_000 }),
  ]);
  if (createResults.some((result) => result.status === 'rejected')) {
    const diagnostics = await page.evaluate(() => ({
      buttonDisabled: document.querySelector('button[type="submit"]')?.hasAttribute('disabled'),
      error: document.querySelector('[role="alert"]')?.textContent,
      mode: new URL(document.location.href).searchParams.get('mode'),
      title: document.querySelector('input[name="title"]')?.value,
      workspace: document.querySelector('select')?.value,
    }));
    assert.fail(`${label} must issue the RO create request: ${JSON.stringify({ createResults: createResults.map((result) => result.status === 'rejected' ? String(result.reason) : 'fulfilled'), diagnostics, requests: state.requests })}`);
  }
  assert.ok(state.createdTitles.includes(title), `${label} must submit the typed RO title`);
  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'domcontentloaded' });
  await waitForRig(page);
}

const browser = await chromium.launch({ headless: true });
const metrics = {};
let visibleCueCount = 0;

try {
  for (const viewport of viewports) {
    const label = viewport.width + 'x' + viewport.height;
    const state = { createdTitles: [], requests: [], taskState: null };
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location();
        browserErrors.push(message.text() + ' @ ' + location.url + ':' + location.lineNumber + ':' + location.columnNumber);
      }
    });
    await page.clock.install({ time: new Date('2026-08-23T00:00:00Z') });
    await mockProduct(page, state);
    await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'domcontentloaded' });
    await waitForRig(page);

    const stage = page.locator('[data-hermes-workspace-stage="true"]');
    const expectedSize = viewport.width <= 640 ? '200' : '360';
    assert.equal(await stage.getAttribute('data-hermes-stage-size'), expectedSize, label + ' must use the production-derived endpoint');
    assert.equal(await page.locator('[data-hermes-live2d-canvas="true"]').count(), 1, label + ' must have one canvas owner');
    assert.equal(await page.locator('[data-live2d-instance="wanko"]').count(), 1, label + ' must have one model owner');
    assert.equal(await page.locator('[data-hermes-runtime-owner="running"]').count(), 1, label + ' must have one running RAF owner');
    assert.equal(await page.locator('[data-hermes-protected="true"]').count(), 3, label + ' must expose all protected Dashboard regions');
    const initial = await assertFootprintsSafe(page, viewport, label + ' initial');

    await exerciseCreateImport(page, label, state);

    const invoke = page.locator('[data-hermes-input-owner="true"]');
    await invoke.click();
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await stage.getAttribute('data-hermes-assistant-open'), 'true', label + ' click must open the assistant');
    assert.equal(await stage.evaluate((node) => getComputedStyle(node).opacity), '0.18', label + ' open drawer must quiet the stage');
    await dialog.locator('.drawer-close').click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await stage.getAttribute('data-hermes-assistant-open'), 'false', label + ' close must restore the work surface');

    const edgeTargets = [
      { name: 'left', x: 1, y: viewport.height / 2 },
      { name: 'top', x: viewport.width / 2, y: 1 },
      { name: 'right', x: viewport.width - 1, y: viewport.height / 2 },
      { name: 'bottom', x: viewport.width / 2, y: viewport.height - 1 },
    ];
    for (const edge of edgeTargets) {
      await dragStage(page, stage, edge);
      assert.equal(await stage.getAttribute('data-hermes-anchored'), 'false', label + ' drag to ' + edge.name + ' must detach from the dock');
      await assertFootprintsSafe(page, viewport, label + ' ' + edge.name + ' edge');
    }
    await dragStage(page, stage, edgeTargets[1]);
    const persistedSafety = await assertFootprintsSafe(page, viewport, label + ' persisted detached point');
    const persisted = await stage.boundingBox();
    const persistedDock = await page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith('openscience:hermes-dock:'))
        .map((key) => [key, localStorage.getItem(key)]),
    ));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRig(page);
    await page.waitForTimeout(1200);
    const restored = await stage.boundingBox();
    const restoredDock = await page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith('openscience:hermes-dock:'))
        .map((key) => [key, localStorage.getItem(key)]),
    ));
    assert.ok(persisted && restored && Math.abs(restored.x - persisted.x) <= 2 && Math.abs(restored.y - persisted.y) <= 2,
      label + ' reload must preserve the detached point: ' + JSON.stringify({ persisted, persistedDock, persistedSafety, restored, restoredDock }));

    const acrossBreakpoint = viewport.width <= 640 ? { height: 900, width: 800 } : { height: 844, width: 639 };
    await page.setViewportSize(acrossBreakpoint);
    await page.waitForFunction((size) => document.querySelector('[data-hermes-workspace-stage]')?.getAttribute('data-hermes-stage-size') === size,
      acrossBreakpoint.width <= 640 ? '200' : '360');
    await page.clock.runFor(2_000);
    await page.waitForTimeout(10);
    await page.waitForTimeout(1200);
    await assertFootprintsSafe(page, acrossBreakpoint, label + ' across 640px breakpoint');
    await page.setViewportSize(viewport);
    await page.waitForFunction((size) => document.querySelector('[data-hermes-workspace-stage]')?.getAttribute('data-hermes-stage-size') === size, expectedSize);
    await page.clock.runFor(2_000);
    await page.waitForTimeout(10);
    await page.waitForTimeout(1200);

    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('openscience:hermes-dock:')).forEach((key) => localStorage.removeItem(key)));
    state.taskState = 'parsing';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRig(page);
    await page.clock.fastForward(300);
    await page.waitForTimeout(10);
    assert.equal(await stage.getAttribute('data-hermes-action'), 'read', label + ' live task state must trigger truthful task feedback');
    assert.equal(await stage.getAttribute('data-hermes-action-kind'), 'priority', label + ' task feedback must outrank autonomous motion');
    state.taskState = null;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRig(page);
    const speech = await waitForSpeech(page);
    const bubble = page.locator('[data-hermes-performance-bubble="true"]');
    await bubble.waitFor({ state: 'attached' });
    const bubbleVisible = speech.bubbleVisible === 'true';
    assert.equal(speech.bubbleSafe === 'true', bubbleVisible, label + ' autonomous speech must render only with a measured safe placement');
    if (bubbleVisible) visibleCueCount += 1;
    const final = await assertFootprintsSafe(page, viewport, label + ' final');
    const bubbleStyle = await bubble.evaluate((node) => {
      const style = getComputedStyle(node);
      const dismiss = node.querySelector('.hermes-companion-dismiss')?.getBoundingClientRect();
      const paragraph = node.querySelector('p');
      const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
      const paragraphBox = paragraph?.getBoundingClientRect();
      return {
        backdropFilter: style.backdropFilter,
        backgroundImage: style.backgroundImage,
        borderRadius: style.borderRadius,
        dismiss: { height: dismiss?.height ?? 0, width: dismiss?.width ?? 0 },
        lineCount: paragraphBox && paragraphStyle ? Math.ceil(paragraphBox.height / Number.parseFloat(paragraphStyle.lineHeight)) : 0,
        maxWidth: style.maxWidth,
        shadow: style.boxShadow,
        visibleToolbar: Array.from(node.querySelectorAll('.hermes-companion-actions, .hermes-companion-take-me'))
          .filter((element) => getComputedStyle(element).display !== 'none').length,
      };
    });
    assert.deepEqual(bubbleStyle.dismiss, { height: 40, width: 40 }, label + ' dismiss target must be 40x40');
    assert.equal(bubbleStyle.maxWidth, '248px', label + ' bubble must remain at most 15.5rem');
    assert.equal(bubbleStyle.borderRadius, '4px', label + ' bubble must use the fixed radius');
    assert.equal(bubbleStyle.backgroundImage, 'none', label + ' bubble must not use a gradient');
    assert.equal(bubbleStyle.backdropFilter, 'none', label + ' bubble must not use blur');
    assert.equal(bubbleStyle.shadow, 'rgba(0, 0, 0, 0.18) 0px 8px 20px 0px', label + ' bubble must use one restrained shadow');
    if (viewport.width <= 640) {
      assert.ok(bubbleStyle.lineCount <= 2, label + ' mobile cue must remain one short sentence: ' + JSON.stringify(bubbleStyle));
      assert.equal(bubbleStyle.visibleToolbar, 0, label + ' mobile cue must not expose a toolbar');
    }
    assert.ok(final.actor.width * final.actor.height / (viewport.width * viewport.height) < .15,
      label + ' Hermes must remain subordinate to the research task');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label + ' must not overflow horizontally');
    assert.deepEqual(browserErrors, [], label + ' must have no console or page errors');
    await page.screenshot({ animations: 'disabled', path: resolve(output, 'dashboard-' + label + '.png') });
    metrics[label] = {
      actor: final.actor,
      actorViewportRatio: Number((final.actor.width * final.actor.height / (viewport.width * viewport.height)).toFixed(4)),
      bubble: bubbleVisible ? await bubble.boundingBox() : null,
      bubbleStyle,
      createdTitle: state.createdTitles[0],
      initialActor: initial.actor,
      protectedRegions: final.protectedRegions,
      runtimeOwners: { canvas: 1, model: 1, raf: 1 },
      stageSize: Number(expectedSize),
    };
    await context.close();
  }
  assert.ok(visibleCueCount > 0, 'at least one first-person viewport must render the autonomous cue in open space');
  await writeFile(resolve(output, 'dashboard-metrics.json'), JSON.stringify(metrics) + '\n');
} finally {
  await browser.close();
}
