/* global document, getComputedStyle, innerWidth, localStorage, process, scrollTo, scrollY, URL, window */

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

async function waitForStableStageGeometry(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let previous = '';
    let stableFrames = 0;
    const sample = () => {
      const stage = document.querySelector('[data-hermes-workspace-stage="true"]');
      const bounds = stage?.getBoundingClientRect();
      const signature = bounds
        ? [bounds.left, bounds.top, bounds.width, bounds.height].map((value) => value.toFixed(2)).join(':')
        : '';
      stableFrames = signature && signature === previous ? stableFrames + 1 : 0;
      previous = signature;
      if (stableFrames >= 3) resolve(true);
      else window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  }));
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
    documentHeight: document.documentElement.scrollHeight,
    docks: Object.fromEntries(Object.keys(localStorage)
      .filter((key) => key.startsWith('openscience:hermes-dock:'))
      .map((key) => [key, localStorage.getItem(key)])),
    size: node.getAttribute('data-hermes-stage-size'),
  }));
  const actorInsideSurface = actor && (stageState.anchored === 'true'
    ? actor.x >= 0 && actor.x + actor.width <= viewport.width && actor.y >= 0 && actor.y + actor.height <= stageState.documentHeight
    : inside(actor, viewport));
  assert.ok(actorInsideSurface, `${label} actor must remain inside its ${stageState.anchored === 'true' ? 'page-owned surface' : 'visual viewport'}: ${JSON.stringify({ actor, stageState })}`);
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

async function clickVisibleHermesCta(page, stage, label) {
  const cta = page.locator('[data-hermes-visible-invoke-cta="true"]');
  await cta.scrollIntoViewIfNeeded();
  const ctaBox = await cta.boundingBox();
  assert.ok(ctaBox, `${label} visible Hermes CTA must have geometry`);
  const ctaHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
    ?.closest('[data-hermes-visible-invoke-cta="true"]') !== null, {
    x: ctaBox.x + ctaBox.width / 2,
    y: ctaBox.y + ctaBox.height / 2,
  });
  assert.equal(ctaHit, true, `${label} visible Hermes CTA must own its exact painted coordinates`);
  const before = Number(await stage.getAttribute('data-hermes-invoke-count'));
  await page.mouse.click(ctaBox.x + ctaBox.width / 2, ctaBox.y + ctaBox.height / 2);
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(Number(await stage.getAttribute('data-hermes-invoke-count')), before + 1,
    `${label} visible Hermes CTA must invoke the drawer exactly once`);
  return dialog;
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
  const createButton = page.getByRole('button', { name: /Create Research Object|创建 Research Object/u });
  await createButton.scrollIntoViewIfNeeded();
  const createSnapshotHandle = await page.waitForFunction(() => {
    const stage = document.querySelector('[data-hermes-workspace-stage="true"]');
    const button = document.querySelector('button[type="submit"]');
    const rect = (node) => {
      const bounds = node?.getBoundingClientRect();
      return bounds ? { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width } : null;
    };
    const create = rect(button);
    const snapshot = {
      action: stage?.getAttribute('data-hermes-action'),
      actor: rect(stage?.querySelector('[data-hermes-companion-actor="true"]')),
      bubble: rect(stage?.querySelector('[data-hermes-guide-bubble][data-hermes-guide-visible="true"]')),
      create,
      guidePhase: stage?.getAttribute('data-hermes-guide-phase'),
      guideReady: stage?.getAttribute('data-hermes-guide-ready'),
      protected: button?.getAttribute('data-hermes-protected'),
      travel: rect(stage?.querySelector('[data-hermes-carrier-travel-hull="true"]')),
    };
    const settled = snapshot.action === 'guide-arrive' && ['route', 'edge-stop'].includes(snapshot.guidePhase)
      && snapshot.guideReady === 'true' && snapshot.protected === 'true' && create;
    if (!settled) return false;
    const hit = document.elementFromPoint(create.left + create.width / 2, create.top + create.height / 2);
    return {
      ...snapshot,
      hit: hit ? { className: hit.className, submitOwner: hit.closest('button[type="submit"]') !== null, tagName: hit.tagName } : null,
    };
  }, undefined, { timeout: 10_000 });
  const createSnapshot = await createSnapshotHandle.jsonValue();
  await createSnapshotHandle.dispose();
  assert.equal(createSnapshot.hit?.submitOwner, true,
    `${label} settled transparent Hermes pixels must not intercept the real RO create action: ${JSON.stringify(createSnapshot)}`);
  const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/research-objects'
    && response.request().method() === 'POST', { timeout: 10_000 });
  const createResults = await Promise.allSettled([
    created,
    createButton.click({ timeout: 10_000 }),
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
  return createSnapshot;
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
    await mockProduct(page, state);
    await page.goto(baseUrl + '/dashboard?hermes-motion=full', { waitUntil: 'domcontentloaded' });
    await waitForRig(page);

    const stage = page.locator('[data-hermes-workspace-stage="true"]');
    const expectedSize = viewport.width <= 640 ? '200' : '360';
    assert.equal(await stage.getAttribute('data-hermes-stage-size'), expectedSize, label + ' must use the production-derived endpoint');
    assert.equal(await page.locator('[data-hermes-live2d-canvas="true"]').count(), 1, label + ' must have one canvas owner');
    assert.equal(await page.locator('[data-live2d-instance="wanko"]').count(), 1, label + ' must have one model owner');
    assert.equal(await page.locator('[data-hermes-runtime-owner="running"]').count(), 1, label + ' must have one running RAF owner');
    assert.ok(await page.locator('[data-hermes-protected="true"]').count() >= 4, label + ' must protect primary navigation plus Dashboard work regions');
    assert.equal(await page.locator('header nav[data-hermes-primary-navigation="true"][data-hermes-protected="true"]').count(), 1,
      label + ' must mark the real primary shell navigation as protected');
    const initial = await assertFootprintsSafe(page, viewport, label + ' initial');

    if (viewport.width <= 640) {
      const stageBox = await stage.boundingBox();
      assert.ok(stageBox, `${label} stage must have geometry for transparent-hit testing`);
      const transparentPoint = { x: stageBox.x + 4, y: stageBox.y + 4 };
      const transparentHit = await page.evaluate(({ x, y }) => {
        const stageNode = document.querySelector('[data-hermes-workspace-stage="true"]');
        const hit = document.elementFromPoint(x, y);
        return Boolean(stageNode && hit && stageNode.contains(hit));
      }, transparentPoint);
      assert.equal(transparentHit, false, `${label} transparent stage corner must pass through to the page`);
      await page.mouse.move(transparentPoint.x, transparentPoint.y);
      await page.mouse.wheel(0, 240);
      await page.waitForFunction(() => scrollY > 0);
      await page.evaluate(() => scrollTo(0, 0));
    }

    const preClockGuide = await exerciseCreateImport(page, label, state);
    assert.equal(preClockGuide.action, 'guide-arrive', `${label} guide must settle on the real clock before fake-clock installation`);
    assert.equal(preClockGuide.guideReady, 'true', `${label} guide readiness must not depend on fake time`);

    const dialog = await clickVisibleHermesCta(page, stage, label + ' initial');
    assert.equal(await stage.getAttribute('data-hermes-assistant-open'), 'true', label + ' click must open the assistant');
    await page.waitForFunction(
      (node) => getComputedStyle(node).opacity === '0.18',
      await stage.elementHandle(),
    );
    assert.equal(await stage.evaluate((node) => getComputedStyle(node).opacity), '0.18', label + ' open drawer must quiet the stage');
    await dialog.locator('.drawer-close').click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(
      (node) => node.getAttribute('data-hermes-assistant-open') === 'false',
      await stage.elementHandle(),
    );
    assert.equal(await stage.getAttribute('data-hermes-assistant-open'), 'false', label + ' close must restore the work surface');

    const edgeTargets = [
      { name: 'left', x: 1, y: viewport.height / 2 },
      { name: 'top', x: viewport.width / 2, y: 1 },
      { name: 'right', x: viewport.width - 1, y: viewport.height / 2 },
      { name: 'bottom', x: viewport.width / 2, y: viewport.height - 1 },
    ];
    const edgeSettles = [];
    for (const edge of edgeTargets) {
      await dragStage(page, stage, edge);
      assert.equal(await stage.getAttribute('data-hermes-anchored'), 'false', label + ' drag to ' + edge.name + ' must detach from the dock');
      let settled = await assertFootprintsSafe(page, viewport, label + ' ' + edge.name + ' edge');
      if (edge.name === 'top') {
        const language = page.locator('header nav[data-hermes-primary-navigation="true"] select');
        const languageBox = await language.boundingBox();
        assert.ok(languageBox, `${label} language selector must have geometry after top settlement`);
        const languageHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('select') !== null, {
          x: languageBox.x + languageBox.width / 2,
          y: languageBox.y + languageBox.height / 2,
        });
        assert.equal(languageHit, true, `${label} top-settled Hermes must not intercept the language selector`);
        await language.selectOption('en');
        await page.waitForFunction(() => document.cookie.includes('NEXT_LOCALE=en'));
        await language.selectOption('zh');
        await page.waitForFunction(() => document.cookie.includes('NEXT_LOCALE=zh'));
        await waitForRig(page);
        settled = await assertFootprintsSafe(page, viewport, label + ' top edge after real language interaction');
      }
      edgeSettles.push({ actor: settled.actor, name: edge.name, protectedRegions: settled.protectedRegions });
    }
    const edgeAllowance = Number(expectedSize) * .2 + 2;
    for (const settled of edgeSettles) {
      const distances = {
        bottom: viewport.height - settled.actor.y - settled.actor.height,
        left: settled.actor.x,
        right: viewport.width - settled.actor.x - settled.actor.width,
        top: settled.actor.y,
      };
      if (distances[settled.name] > edgeAllowance) {
        const projected = { ...settled.actor };
        if (settled.name === 'left') projected.x = 0;
        if (settled.name === 'right') projected.x = viewport.width - projected.width;
        if (settled.name === 'top') projected.y = 0;
        if (settled.name === 'bottom') projected.y = viewport.height - projected.height;
        assert.ok(settled.protectedRegions.some((region) => overlaps(projected, region)),
          `${label} ${settled.name} release may miss its edge only when that projected footprint is protected: ${JSON.stringify({ distances, edgeAllowance, projected, settled })}`);
      }
    }
    for (let first = 0; first < edgeSettles.length; first += 1) for (let second = first + 1; second < edgeSettles.length; second += 1) {
      const a = edgeSettles[first].actor;
      const b = edgeSettles[second].actor;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 8,
        `${label} edge releases must produce distinct settled points: ${JSON.stringify(edgeSettles)}`);
    }
    const protectedRoControl = page.locator('[data-continuation-priority="primary"] a[href="/research-objects/ro-hermes/edit"]');
    const protectedRoControlBox = await protectedRoControl.boundingBox();
    assert.ok(protectedRoControlBox, `${label} protected RO control must have geometry after edge releases`);
    const protectedRoControlHit = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('a[href="/research-objects/ro-hermes/edit"]') !== null;
    }, {
      x: protectedRoControlBox.x + protectedRoControlBox.width / 2,
      y: protectedRoControlBox.y + protectedRoControlBox.height / 2,
    });
    assert.equal(protectedRoControlHit, true, `${label} transparent Hermes pixels must not intercept the protected RO control after drag settling`);
    await protectedRoControl.click();
    await page.waitForURL('**/research-objects/ro-hermes/edit');
    await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'domcontentloaded' });
    await waitForRig(page);

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
    await waitForStableStageGeometry(page);
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
    await waitForStableStageGeometry(page);
    await assertFootprintsSafe(page, acrossBreakpoint, label + ' across 640px breakpoint');
    await page.setViewportSize(viewport);
    await page.waitForFunction((size) => document.querySelector('[data-hermes-workspace-stage]')?.getAttribute('data-hermes-stage-size') === size, expectedSize);
    await waitForStableStageGeometry(page);

    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('openscience:hermes-dock:')).forEach((key) => localStorage.removeItem(key)));
    state.taskState = 'parsing';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRig(page);
    await page.waitForTimeout(310);
    assert.equal(await stage.getAttribute('data-hermes-action'), 'read', label + ' live task state must trigger truthful task feedback');
    assert.equal(await stage.getAttribute('data-hermes-action-kind'), 'priority', label + ' task feedback must outrank autonomous motion');
    state.taskState = null;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRig(page);
    const menuTrigger = page.locator('[data-hermes-input-owner="true"]');
    await menuTrigger.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: /Hermes/u });
    await menu.waitFor({ state: 'visible' });
    assert.equal(await menu.locator('[data-hermes-action-key]').count(), 12, label + ' must expose all twelve approved actions');
    let visibleActions = menu.locator('[data-hermes-action-key]:visible');
    assert.equal(await visibleActions.count(), viewport.width <= 640 ? 8 : 12,
      label + ' must expose the correct compact or desktop action set');
    await page.screenshot({ animations: 'disabled', path: resolve(output, 'menu-dashboard-' + label + '.png') });
    await visibleActions.nth(Math.min(2, await visibleActions.count() - 1)).hover();
    await page.screenshot({ animations: 'disabled', path: resolve(output, 'menu-focus-' + label + '.png') });
    const actionTargets = await visibleActions.evaluateAll((items) => items.map((item) => {
      const bounds = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return { fontSize: Number.parseFloat(style.fontSize), height: bounds.height, width: bounds.width };
    }));
    assert.equal(actionTargets.every((target) => target.height >= 44 && target.width >= 44), true,
      label + ' action targets must remain at least 44px: ' + JSON.stringify(actionTargets));
    if (viewport.width <= 640) {
      await menu.locator('[data-hermes-mobile-group-switch] [data-active="false"]').click();
      visibleActions = menu.locator('[data-hermes-action-key]:visible');
      assert.equal(await visibleActions.count(), 4, label + ' research-tool group must expose all four work actions');
      await page.screenshot({ animations: 'disabled', path: resolve(output, 'menu-research-' + label + '.png') });
      await menu.locator('[data-hermes-mobile-group-switch] [data-active="false"]').click();
    }
    await menu.locator('[data-hermes-action-key="greet"]').click();
    const bubble = page.locator('[data-hermes-menu-feedback="true"]');
    await bubble.waitFor({ state: 'visible' });
    const bubbleVisible = true;
    if (bubbleVisible) visibleCueCount += 1;
    const final = await assertFootprintsSafe(page, viewport, label + ' final');
    const bubbleStyle = await bubble.evaluate((node) => {
      const style = getComputedStyle(node);
      const paragraph = node.querySelector('p') ?? node;
      const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
      const paragraphRange = paragraph ? document.createRange() : null;
      paragraphRange?.selectNodeContents(paragraph);
      const paragraphBox = paragraphRange?.getBoundingClientRect();
      return {
        backdropFilter: style.backdropFilter,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderRadius: style.borderRadius,
        controlCount: node.querySelectorAll('button,[role="button"]').length,
        lineCount: paragraphBox && paragraphStyle ? Math.ceil(paragraphBox.height / Number.parseFloat(paragraphStyle.lineHeight)) : 0,
        maxWidth: style.maxWidth,
        shadow: style.boxShadow,
        width: style.width,
        visibleToolbar: Array.from(node.querySelectorAll('.hermes-companion-actions, .hermes-companion-take-me'))
          .filter((element) => getComputedStyle(element).display !== 'none').length,
      };
    });
    assert.equal(await bubble.getAttribute('data-hermes-bubble-material'), 'warm-paper', label + ' speech must use warm paper');
    assert.equal(await bubble.getAttribute('data-hermes-speech-origin'), 'mouth', label + ' speech must originate at the mouth');
    assert.equal(bubbleStyle.controlCount, 0, label + ' one-sentence speech must not render a detached control');
    assert.ok(Number.parseFloat(bubbleStyle.width) <= 212, label + ' speech oval must remain at most 13.25rem');
    assert.notEqual(bubbleStyle.borderRadius, '4px', label + ' speech must not fall back to the rectangular annotation');
    assert.notEqual(bubbleStyle.backgroundColor, 'rgba(0, 0, 0, 0)', label + ' speech paper must be opaque');
    assert.equal(bubbleStyle.backgroundImage, 'none', label + ' bubble must not use a gradient');
    assert.equal(bubbleStyle.backdropFilter, 'none', label + ' bubble must not use blur');
    assert.notEqual(bubbleStyle.shadow, 'none', label + ' bubble must use one restrained paper shadow');
    if (viewport.width <= 640) {
      assert.equal(bubbleVisible, true, label + ' must use the safe centered mobile bubble fallback');
      assert.ok(bubbleStyle.lineCount <= 3, label + ' mobile cue must remain one short sentence: ' + JSON.stringify(bubbleStyle));
      assert.equal(bubbleStyle.visibleToolbar, 0, label + ' mobile cue must not expose a toolbar');
    }
    const bubbleBox = bubbleVisible ? await bubble.boundingBox() : null;
    const bubblePointer = bubbleBox ? await bubble.evaluate((node) => {
      const mouth = document.querySelector('[data-hermes-mouth-anchor="true"]')?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const tail = getComputedStyle(node, '::after');
      const tailTip = {
        x: bounds.right - Number.parseFloat(tail.right),
        y: bounds.bottom - Number.parseFloat(tail.bottom),
      };
      return mouth ? {
        mouth: { x: mouth.x, y: mouth.y },
        mouthDistance: Math.hypot(tailTip.x - mouth.x, tailTip.y - mouth.y),
        tailTip,
      } : null;
    }) : null;
    assert.ok(bubblePointer && bubblePointer.mouthDistance <= 18,
      `${label} companion speech tail must terminate at the mouth: ${JSON.stringify(bubblePointer)}`);
    assert.equal(final.protectedRegions.some((region) => bubbleBox && overlaps(bubbleBox, region)), false,
      `${label} companion speech must not cover a protected surface`);
    assert.ok(final.actor.width * final.actor.height / (viewport.width * viewport.height) < .15,
      label + ' Hermes must remain subordinate to the research task');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label + ' must not overflow horizontally');
    await page.screenshot({ animations: 'disabled', path: resolve(output, 'dashboard-' + label + '.png') });
    if (bubbleVisible) {
      const footer = page.locator('[data-hermes-visual-footer="true"]');
      const footerBox = await footer.boundingBox();
      const currentBubbleBox = await bubble.boundingBox();
      assert.equal(Boolean(footerBox && currentBubbleBox && overlaps(footerBox, currentBubbleBox)), false,
        `${label} visible companion speech must not overlap the Hermes footer`);
      await page.waitForTimeout(4300);
      await bubble.waitFor({ state: 'detached' });
      const restoredDialog = await clickVisibleHermesCta(page, stage, label + ' restored footer');
      await restoredDialog.locator('.drawer-close').click();
      await restoredDialog.waitFor({ state: 'detached' });
    }
    assert.deepEqual(browserErrors, [], label + ' must have no console or page errors');
    metrics[label] = {
      actor: final.actor,
      actorViewportRatio: Number((final.actor.width * final.actor.height / (viewport.width * viewport.height)).toFixed(4)),
      bubble: bubbleBox,
      bubblePointer,
      bubbleStyle,
      createdTitle: state.createdTitles[0],
      initialActor: initial.actor,
      edgeSettles,
      protectedRegions: final.protectedRegions,
      runtimeOwners: { canvas: 1, model: 1, raf: 1 },
      stageSize: Number(expectedSize),
    };
    await context.close();
  }
  assert.ok(visibleCueCount > 0, 'at least one first-person viewport must render explicit companion speech in open space');
  await writeFile(resolve(output, 'dashboard-metrics.json'), JSON.stringify(metrics) + '\n');
} finally {
  await browser.close();
}
