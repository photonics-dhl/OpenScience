#!/usr/bin/env node

/* global Headers */

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve, sep } from 'node:path';

const CANONICAL_ORIGIN = 'https://openscience.428312321.xyz';
const OPTIONAL_BLOCKED_ORIGINS = new Set(['https://static.cloudflareinsights.com']);
const OUTPUT_ROOT = '/opt/openscience-evals/hermes-user-journey';
const INIT_WORKSPACE_ID = '6b83001a-75c1-4337-ab76-629908615a39';
const EXPECTED_ACTOR_ID = 'a15edcab-7ec8-4e75-86d7-aa9c0498a829';
const INPUT_PDF = '/input/onchip-source.pdf';
const INPUT_SHA256 = 'd57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a';
const INIT_RO_KEY = 'hermes-user-journey:onchip-source:research-object:v1';
const INIT_INGESTION_KEY = 'hermes-user-journey:onchip-source:ingestion:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{40}$/u;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_ARGS = new Set([
  '--browser-executable', '--expected-release-sha', '--ingestion-task-id', '--mode',
  '--output-dir', '--release-root', '--release-url', '--research-object-id', '--run-id', '--workspace-id',
]);

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED_ARGS.has(key) || value === undefined || values.has(key)) {
      throw new Error('arguments must be unique supported --name value pairs');
    }
    values.set(key, value);
  }
  return values;
}

async function configFrom(values) {
  const mode = values.get('--mode');
  assert.ok(['init', 'inspect', 'inspect-source', 'start'].includes(mode),
    'mode must be init, inspect, inspect-source, or start');

  const requestedUrl = values.get('--release-url');
  assert.ok(requestedUrl, 'an explicit --release-url is required');
  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.origin, CANONICAL_ORIGIN, `release URL origin must be ${CANONICAL_ORIGIN}`);
  assert.equal(parsedUrl.pathname, '/', 'release URL must not contain a path');
  assert.equal(parsedUrl.search, '', 'release URL must not contain a query');
  assert.equal(parsedUrl.hash, '', 'release URL must not contain a fragment');

  const expectedReleaseSha = values.get('--expected-release-sha');
  assert.match(expectedReleaseSha ?? '', SHA, 'expected release SHA must be 40 lowercase hex characters');
  const releaseRootArg = values.get('--release-root');
  assert.ok(releaseRootArg, 'an explicit --release-root is required');
  const releaseRoot = realpathSync(releaseRootArg);
  const releaseMarker = join(releaseRoot, '.release-source');
  assert.ok(existsSync(releaseMarker), 'candidate release marker is missing');
  assert.equal(statSync(releaseMarker).mode & 0o222, 0, 'candidate release marker must be read-only');
  assert.equal(readFileSync(releaseMarker, 'utf8').trim(), expectedReleaseSha, 'candidate release marker does not match expected release');

  const researchObjectId = values.get('--research-object-id');
  const ingestionTaskId = values.get('--ingestion-task-id');
  const runId = values.get('--run-id');
  const workspaceId = values.get('--workspace-id');
  if (mode === 'init') {
    assert.equal(workspaceId, INIT_WORKSPACE_ID, 'init mode is restricted to the controlled ordinary-user workspace');
    assert.equal(researchObjectId, undefined, 'init mode creates its research object');
    assert.equal(ingestionTaskId, undefined, 'init mode creates its ingestion task');
    assert.equal(runId, undefined, 'init mode does not create a Hermes run');
    assert.ok(existsSync(INPUT_PDF) && statSync(INPUT_PDF).isFile(), 'the fixed read-only input PDF is missing');
    assert.equal(createHash('sha256').update(readFileSync(INPUT_PDF)).digest('hex'), INPUT_SHA256, 'input PDF hash changed');
  } else if (mode === 'start') {
    assert.match(researchObjectId ?? '', UUID, 'research object id must be a UUID');
    assert.match(ingestionTaskId ?? '', UUID, 'start mode requires an explicit ingestion task UUID');
    assert.equal(runId, undefined, 'start mode creates a run and does not accept --run-id');
    assert.equal(workspaceId, undefined, 'workspace id is only accepted in init mode');
  } else if (mode === 'inspect') {
    assert.match(researchObjectId ?? '', UUID, 'research object id must be a UUID');
    assert.match(runId ?? '', UUID, 'inspect mode requires an explicit run UUID');
    if (ingestionTaskId !== undefined) assert.match(ingestionTaskId, UUID, 'ingestion task id must be a UUID');
    assert.equal(workspaceId, undefined, 'workspace id is only accepted in init mode');
  } else {
    assert.match(researchObjectId ?? '', UUID, 'inspect-source mode requires a research object UUID');
    assert.match(ingestionTaskId ?? '', UUID, 'inspect-source mode requires an ingestion task UUID');
    assert.equal(runId, undefined, 'inspect-source mode does not accept a run id');
    assert.equal(workspaceId, undefined, 'workspace id is only accepted in init mode');
  }

  const browserArg = values.get('--browser-executable');
  assert.ok(browserArg?.startsWith('/'), 'browser executable must be an explicit absolute path');
  const browserExecutable = realpathSync(browserArg);
  assert.ok(statSync(browserExecutable).isFile(), 'browser executable is not a regular file');
  await access(browserExecutable, fsConstants.X_OK);

  const outputArg = values.get('--output-dir');
  assert.ok(outputArg?.startsWith('/'), 'output directory must be an explicit absolute path');
  const outputDir = resolve(outputArg);
  assert.ok(outputDir.startsWith(`${OUTPUT_ROOT}${sep}`), `output directory must be below ${OUTPUT_ROOT}`);
  await mkdir(outputDir, { recursive: true });
  assert.ok(realpathSync(outputDir).startsWith(`${realpathSync(OUTPUT_ROOT)}${sep}`), 'output directory escaped its bounded root');
  assert.deepEqual(await readdir(outputDir), [], 'output directory must be empty to preserve prior evidence');

  const candidateRequire = createRequire(join(releaseRoot, 'apps', 'web', 'package.json'));
  let chromium;
  try {
    chromium = createRequire('/opt/renderer/package.json')('playwright-core').chromium;
  } catch {
    chromium = candidateRequire('playwright').chromium;
  }
  assert.ok(chromium?.launch, 'candidate Playwright runtime is unavailable');
  return {
    browserExecutable, chromium, expectedReleaseSha, ingestionTaskId, mode, outputDir,
    releaseRoot, releaseUrl: `${CANONICAL_ORIGIN}/`, researchObjectId, runId, workspaceId,
  };
}

async function readCredential() {
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (text.length > 8_192) throw new Error('stdin credential envelope is too large');
  }
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('stdin must contain a JSON credential envelope'); }
  assert.ok(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'stdin credential envelope must be an object');
  assert.deepEqual(Object.keys(envelope).sort(), ['actorId', 'platformRole', 'sessionCookie'],
    'stdin credential envelope only accepts actorId, platformRole, and sessionCookie');
  assert.equal(envelope.actorId, EXPECTED_ACTOR_ID, 'stdin actor does not match the controlled ordinary test fixture');
  assert.equal(envelope.platformRole, 'user', 'stdin server DB role evidence must be platformRole=user');
  const sessionCookie = envelope.sessionCookie;
  assert.ok(typeof sessionCookie === 'string' && sessionCookie.length >= 32 && sessionCookie.length <= 512,
    'session cookie has an invalid length');
  assert.doesNotMatch(sessionCookie, /[\s\x00-\x1f\x7f]/u, 'session cookie contains forbidden characters');
  return { actorId: envelope.actorId, platformRole: envelope.platformRole, sessionCookie };
}

function scopedPaths(config, runId, ingestionTaskId) {
  const ro = encodeURIComponent(config.researchObjectId);
  const run = encodeURIComponent(runId);
  const task = encodeURIComponent(ingestionTaskId);
  return {
    createApi: `/api/research-objects/${ro}/hermes-runs`,
    runApi: `/api/research-objects/${ro}/hermes-runs/${run}`,
    runPage: `/research-objects/${ro}/hermes?run=${run}`,
    reviewPage: `/research-objects/${ro}/hermes?run=${run}&task=${task}`,
    roApi: `/api/research-objects/${ro}`,
    ingestionApi: `/api/ingestion/tasks/${task}`,
  };
}

async function openBrowser(config, credential) {
  const browser = await config.chromium.launch({ headless: true, executablePath: config.browserExecutable });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  const violations = [];
  const blockedOptionalRequests = [];
  let allowedCreateCount = 0;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (OPTIONAL_BLOCKED_ORIGINS.has(url.origin)) {
      blockedOptionalRequests.push(url.origin);
      return route.abort('blockedbyclient');
    }
    if (url.origin !== CANONICAL_ORIGIN) {
      violations.push(`origin:${url.origin}`);
      return route.abort('blockedbyclient');
    }
    if (!SAFE_METHODS.has(request.method())) {
      const expectedCreate = `/api/research-objects/${encodeURIComponent(config.researchObjectId)}/hermes-runs`;
      const initResearchObject = config.mode === 'init' && request.method() === 'POST'
        && url.pathname === '/api/research-objects' && allowedCreateCount === 0;
      const initIngestion = config.mode === 'init' && request.method() === 'POST'
        && /^\/api\/research-objects\/[0-9a-f-]{36}\/ingest$/iu.test(url.pathname) && allowedCreateCount === 1;
      const startRun = config.mode === 'start' && url.pathname === expectedCreate
        && request.method() === 'POST' && allowedCreateCount === 0;
      if (!initResearchObject && !initIngestion && !startRun) {
        violations.push(`mutation:${request.method()}:${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      allowedCreateCount += 1;
      const headers = { ...request.headers() };
      if (initResearchObject) headers['idempotency-key'] = INIT_RO_KEY;
      if (initIngestion) headers['idempotency-key'] = INIT_INGESTION_KEY;
      return route.continue({ headers });
    }
    return route.continue();
  });
  context.on('websocket', (socket) => {
    if (new URL(socket.url()).origin !== CANONICAL_ORIGIN) violations.push('cross-origin-websocket');
  });
  await context.addCookies([{
    name: 'openscience_session', value: credential.sessionCookie, domain: new URL(config.releaseUrl).hostname,
    path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
  return { allowedCreateCount: () => allowedCreateCount, blockedOptionalRequests, browser, context, violations };
}

async function pageResponse(page, path, init = {}) {
  assert.ok(path.startsWith('/'), 'browser API path must be same-origin');
  return page.evaluate(async ({ path: requestPath, init: requestInit }) => {
    const method = String(requestInit.method ?? 'GET').toUpperCase();
    const headers = new Headers(requestInit.headers ?? {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = await fetch('/api/csrf-token', { credentials: 'include', cache: 'no-store' });
      if (!csrf.ok) return { status: csrf.status, body: { error: { code: 'CSRF_TOKEN_FAILED' } } };
      headers.set('x-csrf-token', (await csrf.json()).csrfToken);
    }
    const response = await fetch(requestPath, { ...requestInit, cache: 'no-store', credentials: 'include', headers });
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text();
    return { status: response.status, body };
  }, { path, init });
}

function assertOrdinaryActor(meResponse, credential) {
  assert.equal(meResponse.status, 200, 'ordinary actor session was not accepted by /api/auth/me');
  const me = meResponse.body;
  assert.ok(me && typeof me === 'object' && typeof me.userId === 'string', '/api/auth/me response is incomplete');
  assert.equal(me.userId, credential.actorId, 'browser session does not belong to the server-verified ordinary actor');
  return me.userId;
}

function assertRunScope(response, config, expectedRunId) {
  assert.equal(response.status, 200, 'Hermes run GET failed');
  const run = response.body?.run;
  assert.ok(run && typeof run === 'object', 'Hermes run response is incomplete');
  assert.equal(run.id, expectedRunId, 'Hermes run response changed run scope');
  assert.equal(run.researchObjectId, config.researchObjectId, 'Hermes run response changed research object scope');
  assert.ok(Array.isArray(run.steps), 'Hermes run steps are missing');
  return run;
}

async function inspectUi(page, config, paths, run, label) {
  await page.goto(new URL(paths.runPage, config.releaseUrl).href, { waitUntil: 'domcontentloaded' });
  const runPanel = page.locator('[data-hermes-research-run]').first();
  await runPanel.waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[data-hermes-research-run="${run.status}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
  const runScreenshot = join(config.outputDir, `run-${label}.png`);
  await page.screenshot({ path: runScreenshot, fullPage: true });

  await page.goto(new URL(paths.reviewPage, config.releaseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator('#hermes-run-title').first().waitFor({ state: 'visible', timeout: 30_000 });
  const reviewScreenshot = join(config.outputDir, `review-${label}.png`);
  await page.screenshot({ path: reviewScreenshot, fullPage: true });
  return {
    alerts: await page.locator('[role="alert"]').count(),
    reviewFields: await page.locator('[data-hermes-review-field]').count(),
    runPanelStatus: await runPanel.getAttribute('data-hermes-research-run').catch(() => null),
    screenshots: [basename(runScreenshot), basename(reviewScreenshot)],
  };
}

async function bootstrap(page, config, credential, path = '/dashboard') {
  await page.goto(new URL(path, config.releaseUrl).href,
    { waitUntil: 'domcontentloaded' });
  const release = await pageResponse(page, '/__release');
  assert.equal(release.status, 200, 'public release identity endpoint failed');
  assert.equal(String(release.body).trim(), config.expectedReleaseSha, 'public origin does not serve the expected release');
  return assertOrdinaryActor(await pageResponse(page, '/api/auth/me'), credential);
}

async function verifyResearchObjectScope(page, config) {
  const ro = await pageResponse(page, `/api/research-objects/${encodeURIComponent(config.researchObjectId)}`);
  assert.equal(ro.status, 200, 'ordinary actor cannot read the requested research object');
  assert.equal(ro.body?.researchObject?.id, config.researchObjectId, 'research object response changed scope');
}

async function initializeSource(config, credential) {
  const opened = await openBrowser(config, credential);
  let createdIds;
  try {
    const page = await opened.context.newPage();
    const actorUserId = await bootstrap(page, config, credential, '/research-objects/new?mode=import');
    const workspaces = await pageResponse(page, '/api/workspaces');
    assert.equal(workspaces.status, 200, 'controlled workspace list failed');
    assert.ok(workspaces.body?.workspaces?.some((row) => row.id === INIT_WORKSPACE_ID && row.role === 'owner'),
      'controlled personal workspace is unavailable to the ordinary actor');
    await page.locator('select').selectOption(INIT_WORKSPACE_ID);
    await page.locator('input[name="title"]').fill('Attosecond on-chip optical field sampling');
    await page.locator('input[type="file"]').setInputFiles(INPUT_PDF);
    const roResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/research-objects', { timeout: 30_000 });
    const ingestionResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
      && /\/api\/research-objects\/[0-9a-f-]{36}\/ingest$/iu.test(new URL(response.url()).pathname), { timeout: 300_000 });
    await page.locator('form button[type="submit"]').click();
    const roResponse = await roResponsePromise;
    assert.equal(roResponse.status(), 201, 'product research object creation failed');
    const roBody = await roResponse.json();
    assert.match(roBody?.researchObject?.id ?? '', UUID, 'product research object response is incomplete');
    assert.equal(roBody.researchObject.workspaceId, INIT_WORKSPACE_ID, 'product created the research object outside the controlled workspace');
    const ingestionResponse = await ingestionResponsePromise;
    assert.equal(ingestionResponse.status(), 202, 'product source upload failed');
    const ingestionBody = await ingestionResponse.json();
    assert.equal(ingestionBody.researchObjectId ?? roBody.researchObject.id, roBody.researchObject.id,
      'ingestion response changed research object scope');
    assert.equal(ingestionBody.tasks?.length, 1, 'init mode must create exactly one ingestion task');
    assert.match(ingestionBody.tasks[0]?.id ?? '', UUID, 'ingestion response omitted its task id');
    createdIds = { researchObjectId: roBody.researchObject.id, ingestionTaskId: ingestionBody.tasks[0].id };
    assert.equal(opened.allowedCreateCount(), 2, 'init mode must issue exactly one RO create and one upload mutation');
    assert.deepEqual(opened.violations, [], 'init browser attempted a forbidden origin or mutation');
    const screenshot = join(config.outputDir, 'init-upload.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    return {
      schemaVersion: 1, ok: true, mode: 'init', origin: CANONICAL_ORIGIN,
      expectedReleaseSha: config.expectedReleaseSha, workspaceId: INIT_WORKSPACE_ID,
      researchObjectId: roBody.researchObject.id, ingestionTaskId: ingestionBody.tasks[0].id,
      ingestionState: ingestionBody.tasks[0].state, actor: { userId: actorUserId, platformRole: credential.platformRole,
        identityEvidenceSource: 'api/auth/me', roleEvidenceSource: 'stdin_server_db_query', sessionSource: 'stdin' },
      input: { filename: basename(INPUT_PDF), sha256: INPUT_SHA256 }, screenshots: [basename(screenshot)],
      blockedOptionalRequests: [...new Set(opened.blockedOptionalRequests)],
      mutations: ['create_research_object', 'upload_source'], approvalsPerformed: false, generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (createdIds && error && typeof error === 'object') error.journeyIds = createdIds;
    throw error;
  } finally {
    await opened.browser.close();
  }
}

async function inspectExistingSource(config, credential) {
  const opened = await openBrowser(config, credential);
  try {
    const page = await opened.context.newPage();
    const actorUserId = await bootstrap(page, config, credential,
      `/research-objects/${encodeURIComponent(config.researchObjectId)}/hermes?task=${encodeURIComponent(config.ingestionTaskId)}`);
    await verifyResearchObjectScope(page, config);
    const paths = scopedPaths(config, randomUUID(), config.ingestionTaskId);
    const ingestion = await pageResponse(page, paths.ingestionApi);
    assert.equal(ingestion.status, 200, 'ordinary actor cannot read the existing ingestion task');
    assert.equal(ingestion.body?.task?.id, config.ingestionTaskId, 'ingestion response changed task scope');
    assert.equal(ingestion.body?.researchObjectId, config.researchObjectId, 'ingestion task belongs to another research object');
    await page.locator('[data-hermes-review-field]').first().waitFor({ state: 'visible', timeout: 30_000 });
    const screenshot = join(config.outputDir, 'source-existing.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    assert.equal(opened.allowedCreateCount(), 0, 'inspect-source mode must remain read-only');
    assert.deepEqual(opened.violations, [], 'inspect-source browser attempted a forbidden origin or mutation');
    return {
      schemaVersion: 1, ok: true, mode: 'inspect-source', origin: CANONICAL_ORIGIN,
      expectedReleaseSha: config.expectedReleaseSha, researchObjectId: config.researchObjectId,
      ingestionTaskId: config.ingestionTaskId, ingestionState: ingestion.body.task.state,
      actor: { userId: actorUserId, platformRole: credential.platformRole,
        identityEvidenceSource: 'api/auth/me', roleEvidenceSource: 'stdin_server_db_query', sessionSource: 'stdin' },
      screenshots: [basename(screenshot)], blockedOptionalRequests: [...new Set(opened.blockedOptionalRequests)],
      mutations: [], approvalsPerformed: false, generatedAt: new Date().toISOString(),
    };
  } finally {
    await opened.browser.close();
  }
}

async function execute(config, credential) {
  if (config.mode === 'init') return initializeSource(config, credential);
  if (config.mode === 'inspect-source') return inspectExistingSource(config, credential);
  let runId = config.runId;
  let ingestionTaskId = config.ingestionTaskId;
  let firstRun;
  let firstUi;
  let actorUserId;

  const first = await openBrowser(config, credential);
  try {
    const page = await first.context.newPage();
    actorUserId = await bootstrap(page, config, credential, `/research-objects/${encodeURIComponent(config.researchObjectId)}/hermes`);
    await verifyResearchObjectScope(page, config);
    if (config.mode === 'start') {
      const preliminary = scopedPaths(config, randomUUID(), ingestionTaskId);
      const ingestion = await pageResponse(page, preliminary.ingestionApi);
      assert.equal(ingestion.status, 200, 'ordinary actor cannot read the requested ingestion task');
      assert.equal(ingestion.body?.task?.id, ingestionTaskId, 'ingestion response changed task scope');
      assert.equal(ingestion.body?.researchObjectId, config.researchObjectId, 'ingestion task belongs to another research object');
      const created = await pageResponse(page, preliminary.createApi, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ ingestionTaskIds: [ingestionTaskId] }),
      });
      assert.equal(created.status, 202, 'Hermes run create failed');
      assert.equal(created.body?.run?.researchObjectId, config.researchObjectId, 'created run changed research object scope');
      assert.match(created.body?.run?.id ?? '', UUID, 'created run id is invalid');
      runId = created.body.run.id;
      assert.equal(first.allowedCreateCount(), 1, 'start mode must issue exactly one mutation');
    } else {
      assert.equal(first.allowedCreateCount(), 0, 'inspect mode must remain read-only');
    }
    const initialPaths = scopedPaths(config, runId, ingestionTaskId ?? randomUUID());
    const initial = await pageResponse(page, initialPaths.runApi);
    firstRun = assertRunScope(initial, config, runId);
    const sourceTaskId = firstRun.steps.find((step) => step.stage === 'source_ingestion')?.ingestionTaskId;
    assert.match(sourceTaskId ?? '', UUID, 'run does not retain a source ingestion task');
    if (ingestionTaskId !== undefined) assert.equal(sourceTaskId, ingestionTaskId, 'run source differs from the requested ingestion task');
    ingestionTaskId = sourceTaskId;
    firstUi = await inspectUi(page, config, scopedPaths(config, runId, ingestionTaskId), firstRun, 'first');
    assert.deepEqual(first.violations, [], 'browser attempted a forbidden origin or mutation');
  } finally {
    await first.browser.close();
  }

  const reopened = await openBrowser({ ...config, mode: 'inspect' }, credential);
  let finalRun;
  let reopenedUi;
  try {
    const page = await reopened.context.newPage();
    const reopenedActor = await bootstrap(page, config, credential, `/research-objects/${encodeURIComponent(config.researchObjectId)}/hermes`);
    await verifyResearchObjectScope(page, config);
    assert.equal(reopenedActor, actorUserId, 'reopened browser resolved a different actor');
    const paths = scopedPaths(config, runId, ingestionTaskId);
    finalRun = assertRunScope(await pageResponse(page, paths.runApi), config, runId);
    reopenedUi = await inspectUi(page, config, paths, finalRun, 'reopened');
    assert.equal(reopened.allowedCreateCount(), 0, 'reopened browser must remain read-only');
    assert.deepEqual(reopened.violations, [], 'reopened browser attempted a forbidden origin or mutation');
  } finally {
    await reopened.browser.close();
  }

  return {
    schemaVersion: 1,
    ok: true,
    mode: config.mode,
    origin: CANONICAL_ORIGIN,
    expectedReleaseSha: config.expectedReleaseSha,
    researchObjectId: config.researchObjectId,
    ingestionTaskId,
    runId,
    actor: { userId: actorUserId, platformRole: credential.platformRole,
      identityEvidenceSource: 'api/auth/me', roleEvidenceSource: 'stdin_server_db_query', sessionSource: 'stdin' },
    first: { status: firstRun.status, version: firstRun.version, ui: firstUi },
    reopened: { status: finalRun.status, version: finalRun.version, ui: reopenedUi },
    blockedOptionalRequests: [...new Set([...first.blockedOptionalRequests, ...reopened.blockedOptionalRequests])],
    mutations: config.mode === 'start' ? ['create_hermes_run'] : [],
    approvalsPerformed: false,
    generatedAt: new Date().toISOString(),
  };
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/openscience_session=[^\s;]+/giu, 'openscience_session=[redacted]').slice(0, 500);
}

async function main() {
  const config = await configFrom(parseArgs(process.argv.slice(2)));
  const credential = await readCredential();
  let report;
  try {
    report = await execute(config, credential);
  } catch (error) {
    const journeyIds = error && typeof error === 'object' ? error.journeyIds : undefined;
    report = {
      schemaVersion: 1, ok: false, mode: config.mode, origin: CANONICAL_ORIGIN,
      expectedReleaseSha: config.expectedReleaseSha,
      workspaceId: config.workspaceId ?? null,
      researchObjectId: journeyIds?.researchObjectId ?? config.researchObjectId ?? null,
      ingestionTaskId: journeyIds?.ingestionTaskId ?? config.ingestionTaskId ?? null, runId: config.runId ?? null,
      error: safeError(error), approvalsPerformed: false, generatedAt: new Date().toISOString(),
    };
  }
  const reportPath = join(config.outputDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  if (!report.ok) throw new Error(report.error);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: report.mode, researchObjectId: report.researchObjectId,
    ingestionTaskId: report.ingestionTaskId, runId: report.runId ?? null,
    status: report.reopened?.status ?? report.ingestionState, report: reportPath })}\n`);
}

main().catch((error) => {
  process.stderr.write(`HERMES_USER_JOURNEY_FAIL ${safeError(error)}\n`);
  process.exitCode = 1;
});
