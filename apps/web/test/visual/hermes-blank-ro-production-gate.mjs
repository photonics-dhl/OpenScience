/* global Headers, MutationObserver, URL, console, document, fetch, getComputedStyle, performance, process, window */

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const canonicalOrigin = 'https://openscience.428312321.xyz';
const baseUrl = process.env.OPENSCIENCE_PRODUCTION_URL;
const sessionToken = process.env.OPENSCIENCE_E2E_SESSION_TOKEN;
const acceptanceWorkspaceId = process.env.OPENSCIENCE_ACCEPTANCE_WORKSPACE_ID;
const adminAuth = process.env.OPENSCIENCE_E2E_ADMIN_AUTH;
const sshRunner = process.env.OPENSCIENCE_E2E_SSH_RUNNER;
const bashExecutable = process.env.OPENSCIENCE_E2E_BASH ?? 'bash';
const expectedRelease = process.env.OPENSCIENCE_EXPECTED_RELEASE;
if (!baseUrl) throw new Error('OPENSCIENCE_PRODUCTION_URL is required');
if (!sessionToken) throw new Error('OPENSCIENCE_E2E_SESSION_TOKEN is required');
if (!acceptanceWorkspaceId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(acceptanceWorkspaceId)) throw new Error('OPENSCIENCE_ACCEPTANCE_WORKSPACE_ID must be a UUID');
if (!sshRunner && (!adminAuth || !/^Basic [A-Za-z0-9+/]+=*$/.test(adminAuth))) throw new Error('OPENSCIENCE_E2E_ADMIN_AUTH must be a Basic authorization header when no SSH audit runner is configured');
if (!expectedRelease || !/^[0-9a-f]{40}$/.test(expectedRelease)) throw new Error('OPENSCIENCE_EXPECTED_RELEASE must be a full Git SHA');
const requestedOrigin = new URL(baseUrl);
if (requestedOrigin.origin.toLowerCase() !== canonicalOrigin || requestedOrigin.pathname !== '/' || requestedOrigin.search || requestedOrigin.hash) {
  throw new Error(`OPENSCIENCE_PRODUCTION_URL must be exactly ${canonicalOrigin}/`);
}
const releaseResponse = await fetch(`${canonicalOrigin}/__release`, { cache: 'no-store' });
if (!releaseResponse.ok) throw new Error(`release identity ${releaseResponse.status}`);
const deployedRelease = (await releaseResponse.text()).trim();
assert.equal(deployedRelease, expectedRelease, 'public origin does not serve the expected release');

const outputDir = resolve('test/visual/out/hermes-blank-ro');
await mkdir(outputDir, { recursive: true });

const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
const controlledBrief = [
  'Problem: Current field-resolved optical measurements do not establish whether sub-cycle optical fields can be sampled on chip without assuming a measured outcome.',
  'Insight: The working hypothesis is that field-resolved sampling can connect optical waveforms to nanoscale transport.',
  'Method: The planned study uses a pump-probe design with calibrated delay, a nanostructured emitter, and preregistered analysis.',
  'Limitations: This is a proposed protocol; generalisation beyond the selected device and wavelength remains unverified.',
  'Reproducibility: The authors will publish timing calibration, device geometry, analysis code, and environment details.',
].join('\n');
const gold = {
  problem: 'Determine whether sub-cycle optical fields can be sampled on chip without claiming an unmeasured result.',
  results: '',
};
const label = `E2E — Hermes blank guidance — ${new Date().toISOString()}`;
const taskIds = [];
const motionSamples = [];
let agentTaskRequests = 0;
let networkInterceptions = 0;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: outputDir, size: { width: 1440, height: 1000 } },
});
await context.addCookies([{
  name: 'openscience_session',
  value: sessionToken,
  domain: new URL(baseUrl).hostname,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
}]);
const page = await context.newPage();
const basicPair = adminAuth ? Buffer.from(adminAuth.slice('Basic '.length), 'base64').toString('utf8') : '';
const basicSeparator = basicPair.indexOf(':');
if (!sshRunner && basicSeparator < 1) throw new Error('OPENSCIENCE_E2E_ADMIN_AUTH decoded to an invalid Basic credential');
const curlUser = basicPair.slice(0, basicSeparator);
const curlPassword = basicPair.slice(basicSeparator + 1);
const curlConfigValue = (value) => {
  if (/\r|\n/.test(value)) throw new Error('curl config credential contains a newline');
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
};
const originalRoute = page.route.bind(page);
page.route = async (...args) => {
  networkInterceptions += 1;
  return originalRoute(...args);
};
page.on('request', (request) => {
  if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/agent/tasks') agentTaskRequests += 1;
});
await page.exposeFunction('__recordHermesBlankRoMotion', (sample) => motionSamples.push(sample));
await page.addInitScript(() => {
  const sample = () => {
    const stage = document.querySelector('[data-hermes-workspace-stage]');
    if (!stage) return;
    void window.__recordHermesBlankRoMotion({
      at: performance.now(),
      guide: stage.getAttribute('data-hermes-guide-motion'),
      presentation: stage.getAttribute('data-hermes-presentation-state'),
    });
  };
  window.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(sample).observe(document.documentElement, { subtree: true, attributes: true, childList: true });
    window.setInterval(sample, 50);
    sample();
  }, { once: true });
});

async function browserJson(path, init = {}) {
  return page.evaluate(async ({ path, init }) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers ?? {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
      if (!csrfResponse.ok) throw new Error(`CSRF ${csrfResponse.status}`);
      const { csrfToken } = await csrfResponse.json();
      headers.set('x-csrf-token', csrfToken);
    }
    const response = await fetch(path, { ...init, headers, credentials: 'include' });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${path} ${response.status} ${body?.error?.code ?? 'UNKNOWN'}`);
    return body;
  }, { path, init });
}

async function adminJson(path) {
  const url = new URL(path, canonicalOrigin);
  assert.equal(url.origin, canonicalOrigin, 'admin request escaped the canonical production origin');
  url.searchParams.set('_acceptance', randomUUID());
  if (sshRunner) {
    const internalPath = `${url.pathname.replace(/^\/api\/admin/, '/admin')}${url.search}`;
    assert.match(internalPath, /^\/admin\/[A-Za-z0-9_/?=&.:%-]+$/, 'admin request contains unsafe shell path characters');
    assert.match(sessionToken, /^[A-Za-z0-9_-]+$/, 'session token contains unsafe shell characters');
    const remoteScript = [
      'set -euo pipefail',
      `curl --silent --show-error --fail-with-body --max-time 20 -H 'Cookie: openscience_session=${sessionToken}' 'http://127.0.0.1:3001${internalPath}'`,
      '',
    ].join('\n');
    const body = await new Promise((resolveBody, rejectBody) => {
      const child = spawn(bashExecutable, [sshRunner, 'base64 -d | bash'], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      const stdout = [];
      const stderr = [];
      let bytes = 0;
      child.stdout.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) child.kill();
        else stdout.push(chunk);
      });
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      child.on('error', rejectBody);
      child.on('close', (code) => {
        if (bytes > 2 * 1024 * 1024) return rejectBody(new Error(`${path} SSH response exceeded 2 MiB`));
        if (code !== 0) return rejectBody(new Error(`${path} SSH audit exit ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        resolveBody(Buffer.concat(stdout).toString('utf8'));
      });
      child.stdin.end(Buffer.from(remoteScript).toString('base64'));
    });
    return JSON.parse(body);
  }
  const body = await new Promise((resolveBody, rejectBody) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--silent', '--show-error', '--fail-with-body', '--config', '-', url.href,
    ], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) child.kill();
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', rejectBody);
    child.on('close', (code) => {
      if (bytes > 2 * 1024 * 1024) return rejectBody(new Error(`${path} response exceeded 2 MiB`));
      if (code !== 0) return rejectBody(new Error(`${path} curl exit ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      resolveBody(Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end([
      `user = "${curlConfigValue(`${curlUser}:${curlPassword}`)}"`,
      `header = "Cookie: openscience_session=${curlConfigValue(sessionToken)}"`,
      'header = "Cache-Control: no-cache"',
      '',
    ].join('\n'));
  });
  return JSON.parse(body);
}

const readCore = (response) => response?.researchObject?.sdf?.core ?? {};
const assertFieldsEmpty = (core, message) => {
  for (const field of fields) assert.equal(String(core[field] ?? '').trim(), '', `${message}: ${field}`);
};
const proposalFor = (value) => page.locator('[data-before-after-proposal]').filter({
  has: page.getByText(value, { exact: true }),
}).first();
const hashText = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');
const aiCredit = (usage) => usage.user?.find((item) => item.resource === 'ai_credit')?.used;
const rectsOverlap = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const assertHermesClear = async (protectedLocator, message) => {
  const footprintParts = page.locator('[data-hermes-companion-actor="true"], [data-hermes-companion-bubble]');
  const boxes = await footprintParts.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }).filter(Boolean));
  const footprint = boxes.length === 0 ? null : {
    x: Math.min(...boxes.map((box) => box.x)),
    y: Math.min(...boxes.map((box) => box.y)),
    width: Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x)),
    height: Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y)),
  };
  assert.ok(footprint, 'Hermes footprint disappeared during guidance acceptance');
  const protectedBoxes = await protectedLocator.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  assert.equal(protectedBoxes.some((box) => rectsOverlap(footprint, box)), false, message);
};

try {
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=full`, { waitUntil: 'networkidle' });
  const me = await browserJson('/api/auth/me');
  assert.ok(me?.userId, 'authenticated production session was not accepted');
  const usageBefore = await browserJson('/api/usage');

  const workspaceOption = page.locator(`select option[value="${acceptanceWorkspaceId}"]`);
  assert.equal(await workspaceOption.count(), 1, 'configured acceptance workspace was not rendered');
  await page.locator('select').selectOption(acceptanceWorkspaceId);
  await page.locator('input[name="title"]').fill(label);
  await page.getByRole('button', { name: /Create research object|创建(?:研究对象| Research Object)/i }).click();
  await page.waitForURL(/\/research-objects\/[^/]+\/edit/);
  const researchObjectId = new URL(page.url()).pathname.match(/\/research-objects\/([^/]+)\/edit/)?.[1];
  assert.ok(researchObjectId, 'blank create flow did not expose a Research Object id');

  const created = await browserJson(`/api/research-objects/${researchObjectId}`);
  assert.equal(created.researchObject.workspaceId, acceptanceWorkspaceId, 'blank RO was created outside the dedicated acceptance workspace');
  assert.equal(created.researchObject.visibility, 'private');
  assertFieldsEmpty(readCore(created), 'new blank RO was not empty');
  const createAudit = await adminJson(`/api/admin/audit-logs?workspaceId=${acceptanceWorkspaceId}&action=research_object.create&limit=20`);
  assert.ok(createAudit.items?.some((item) => item.targetId === researchObjectId), 'research_object.create audit fact was not observable');

  const stage = page.locator('[data-hermes-workspace-stage]');
  await stage.waitFor({ state: 'visible' });
  const idleFrameA = await stage.screenshot();
  await page.waitForTimeout(900);
  const idleFrameB = await stage.screenshot();
  assert.notEqual(hashText(idleFrameA), hashText(idleFrameB), 'Hermes idle pixels did not change before interaction');
  await page.getByRole('textbox', { name: /Problem|问题/ }).fill(controlledBrief);

  const taskResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/agent/tasks'
  ), { timeout: 30_000 });
  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  const taskResponse = await taskResponsePromise;
  assert.ok(taskResponse.ok(), `sdf.extract submit failed: ${taskResponse.status()}`);
  const submitted = await taskResponse.json();
  assert.ok(submitted?.task?.id, 'sdf.extract response omitted task id');
  taskIds.push(submitted.task.id);
  const sessionAudit = await adminJson(`/api/admin/audit-logs?action=agent.session.create&actorId=${me.userId}&limit=20`);
  assert.ok(sessionAudit.items?.some((item) => item.targetId === submitted.task.sessionId), 'agent.session.create audit fact was not observable');

  const deadline = Date.now() + 300_000;
  let taskDetail;
  while (Date.now() < deadline) {
    taskDetail = await browserJson(`/api/agent/tasks/${submitted.task.id}`);
    if (taskDetail.task.status === 'succeeded') break;
    if (taskDetail.task.status === 'failed') throw new Error(`sdf.extract failed: ${taskDetail.task.error ?? 'unknown'}`);
    await page.waitForTimeout(1_500);
  }
  assert.equal(taskDetail?.task?.status, 'succeeded', 'sdf.extract did not complete within 300 seconds');
  const usageAfter = await browserJson('/api/usage');
  assert.equal(aiCredit(usageAfter), aiCredit(usageBefore) - 1, 'sdf.extract did not reserve exactly one AI credit');
  const taskAudit = await adminJson(`/api/admin/audit-logs?workspaceId=${acceptanceWorkspaceId}&action=agent.task.submit&limit=20`);
  assert.ok(taskAudit.items?.some((item) => item.targetId === submitted.task.id), 'agent.task.submit audit fact was not observable');

  const result = taskDetail.task.result ?? {};
  const proposedCore = result.core ?? {};
  const evidence = result.evidence ?? {};
  const missingEvidence = Array.isArray(result.needsMoreInformation) ? [...result.needsMoreInformation].sort() : [];
  assert.deepEqual(missingEvidence, ['results']);
  const unsupportedClaims = fields.filter((field) => {
    const value = String(proposedCore[field] ?? '').trim();
    const quote = String(evidence[field]?.quote ?? '').trim();
    const locator = String(evidence[field]?.locator ?? '');
    if (field === 'results') return value !== '' || quote !== '' || locator !== '';
    return !value || !quote || !controlledBrief.includes(quote) || !/^chars:\d+-\d+$/.test(locator);
  });
  assert.equal(unsupportedClaims.length, 0, `unsupported proposal fields: ${unsupportedClaims.join(', ')}`);

  for (const field of fields.filter((candidate) => candidate !== 'results')) {
    const value = String(proposedCore[field] ?? '').trim();
    if (!value) continue;
    const evidenceBlock = proposalFor(value).locator('[data-proposal-evidence]');
    await evidenceBlock.waitFor({ state: 'visible' });
    assert.equal(await evidenceBlock.getByText(evidence[field].quote, { exact: true }).count(), 1, `${field} evidence quote is not visible in its proposal`);
    assert.equal(await evidenceBlock.getByText(evidence[field].locator, { exact: true }).count(), 1, `${field} evidence locator is not visible in its proposal`);
  }

  await page.locator('[data-before-after-proposal]').first().waitFor({ state: 'visible', timeout: 30_000 });
  await stage.evaluate((node) => {
    if (node.getAttribute('data-hermes-presentation-state') !== 'awaiting_approval') {
      throw new Error('Hermes did not enter review presentation');
    }
    const actor = node.querySelector('[data-hermes-companion-actor="true"]');
    if (actor && getComputedStyle(actor).animationName !== 'none') throw new Error('Hermes review posture is not still');
  });
  const activeProposal = page.locator('[data-before-after-proposal]').first();
  await assertHermesClear(page.locator('[data-before-after-proposal], main textarea, header button, header input'), 'Hermes footprint overlaps protected review controls');
  const firstReviewButton = activeProposal.getByRole('button').first();
  await firstReviewButton.focus();
  const focusVisible = await firstReviewButton.evaluate((node) => {
    const style = getComputedStyle(node);
    return Number.parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none';
  });
  assert.equal(focusVisible, true, 'keyboard review action has no visible focus indicator');
  const beforeReview = await browserJson(`/api/research-objects/${researchObjectId}`);
  assertFieldsEmpty(readCore(beforeReview), 'Hermes wrote before explicit field review');

  const supported = fields.filter((field) => field !== 'results' && String(proposedCore[field] ?? '').trim());
  assert.ok(supported.includes('problem'), 'controlled brief did not produce a problem proposal');
  const directField = ['insight', 'method', 'limitations'].find((field) => supported.includes(field));
  const rejectedField = ['method', 'limitations', 'insight', 'reproducibility'].find((field) => supported.includes(field) && field !== directField);
  assert.ok(directField && rejectedField, 'controlled brief did not produce three independently reviewable proposals');

  const problemProposalMatch = proposalFor(proposedCore.problem);
  const problemProposalIndex = await problemProposalMatch.evaluate((node) => (
    [...document.querySelectorAll('[data-before-after-proposal]')].indexOf(node)
  ));
  assert.ok(problemProposalIndex >= 0, 'problem proposal was not present before editing');
  const problemProposal = page.locator('[data-before-after-proposal]').nth(problemProposalIndex);
  await problemProposal.getByRole('button', { name: /Edit suggestion|编辑建议/ }).click();
  await problemProposal.getByRole('textbox').fill(gold.problem);
  await problemProposal.getByRole('button', { name: /Apply edited change|应用已编辑内容/ }).click();
  await assertHermesClear(page.locator('[data-before-after-proposal], main textarea, header button, header input'), 'Hermes overlaps after edit-accept');

  const directProposal = proposalFor(proposedCore[directField]);
  await directProposal.getByRole('button', { name: /Review changes|审阅变更/ }).click();
  await assertHermesClear(page.locator('[data-before-after-proposal], main textarea, header button, header input'), 'Hermes overlaps after direct accept');

  const rejectedProposal = proposalFor(proposedCore[rejectedField]);
  await rejectedProposal.getByRole('button', { name: /Dismiss|忽略建议/ }).click();
  await assertHermesClear(page.locator('[data-before-after-proposal], main textarea, header button, header input'), 'Hermes overlaps after rejection');

  const missingResults = page.locator('[data-missing-evidence="results"]');
  await missingResults.waitFor({ state: 'visible' });
  await page.locator('main [data-sdf-node="4"] > button').click();
  await page.locator('main').getByRole('textbox', { name: /^(?:Results|结果)$/ }).evaluate((node) => {
    if (node.value !== '') throw new Error('missing Results was not kept empty');
  });
  await missingResults.getByRole('button', { name: /Acknowledge and continue|知悉并继续/ }).click();
  await page.screenshot({ path: resolve(outputDir, 'reviewed-field-diffs.png'), fullPage: true });

  const saveResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/sdf/${researchObjectId}`
  ), { timeout: 30_000 });
  await page.getByRole('button', { name: /Save to SDF|保存到 SDF/ }).click();
  const saveResponse = await saveResponsePromise;
  assert.ok(saveResponse.ok(), `SDF save failed: ${saveResponse.status()}`);
  const sdfAudit = await adminJson(`/api/admin/audit-logs?workspaceId=${acceptanceWorkspaceId}&action=sdf.update&limit=20`);
  assert.ok(sdfAudit.items?.some((item) => item.targetId === researchObjectId), 'sdf.update audit fact was not observable');

  const accepted = { problem: gold.problem, [directField]: proposedCore[directField], results: '' };
  const afterSave = await browserJson(`/api/research-objects/${researchObjectId}`);
  assert.equal(readCore(afterSave).problem, gold.problem);
  assert.equal(readCore(afterSave)[directField], proposedCore[directField]);
  assert.equal(readCore(afterSave)[rejectedField], '');
  assert.equal(readCore(afterSave).results, '');

  await page.reload({ waitUntil: 'networkidle' });
  const persistedAfterReload = readCore(await browserJson(`/api/research-objects/${researchObjectId}`));
  assert.equal(persistedAfterReload.problem, gold.problem);
  assert.equal(persistedAfterReload[directField], proposedCore[directField]);
  assert.equal(persistedAfterReload[rejectedField], '');
  assert.equal(persistedAfterReload.results, '');

  const commitResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/research-objects/${researchObjectId}/commits`
  ), { timeout: 30_000 });
  await page.getByRole('textbox', { name: /Commit message|提交说明/ }).fill('E2E Hermes blank RO reviewed fields');
  await page.getByRole('button', { name: /Create commit|创建提交/ }).click();
  const commitResponse = await commitResponsePromise;
  assert.ok(commitResponse.ok(), `commit failed: ${commitResponse.status()}`);
  const committed = await commitResponse.json();
  assert.ok(committed?.commit?.versionId, 'commit response omitted version id');
  const committedDetail = await browserJson(`/api/versions/${committed.commit.versionId}`);
  assert.equal(committedDetail.version.snapshot.core.problem, gold.problem);
  assert.equal(committedDetail.version.snapshot.core[directField], proposedCore[directField]);
  assert.equal(committedDetail.version.snapshot.core[rejectedField], '');
  assert.equal(committedDetail.version.snapshot.core.results, '');
  const commitAudit = await adminJson(`/api/admin/audit-logs?workspaceId=${acceptanceWorkspaceId}&action=commit.create&limit=20`);
  assert.ok(commitAudit.items?.some((item) => item.targetId === committed.commit.commitId), 'commit.create audit fact was not observable');

  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'zh', domain: new URL(baseUrl).hostname, path: '/' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/research-objects/${researchObjectId}/edit?hermes-motion=reduced`, { waitUntil: 'networkidle' });
  const mobileStage = page.locator('[data-hermes-workspace-stage]');
  await mobileStage.waitFor({ state: 'visible' });
  assert.equal(await mobileStage.getAttribute('data-hermes-motion-preference'), 'reduced');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'mobile editor overflows horizontally');
  assert.equal(await mobileStage.locator('[data-hermes-companion-actor="true"]').evaluate((node) => getComputedStyle(node).animationName), 'none');
  await assertHermesClear(page.locator('main textarea, header button, header input'), 'reduced mobile Hermes overlaps protected controls');
  assert.equal(await page.getByRole('button', { name: /保存到 SDF/ }).count(), 1, 'Chinese editor controls were not rendered');
  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', domain: new URL(baseUrl).hostname, path: '/' }]);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('button', { name: /Save to SDF/ }).count(), 1, 'English editor controls were not rendered');

  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const motionStates = new Set();
  for (const sample of motionSamples) {
    if (sample.guide === 'travel') motionStates.add('travel');
    if (sample.presentation === 'idle') motionStates.add('idle');
    if (sample.presentation === 'scanning') motionStates.add('working');
    if (sample.presentation === 'awaiting_approval') motionStates.add('review');
  }
  assert.ok(['idle', 'travel', 'working', 'review'].every((state) => motionStates.has(state)), `incomplete Hermes motion states: ${[...motionStates].join(', ')}`);
  assert.equal(networkInterceptions, 0);
  assert.equal(agentTaskRequests, 1, `expected one sdf.extract submission, observed ${agentTaskRequests}`);
  assert.equal(taskIds.length, new Set(taskIds).size);
  assert.equal(accepted.problem, gold.problem);
  assert.equal(accepted.results, '');
  assert.equal(persistedAfterReload.results, '');

  const fieldHashes = Object.fromEntries(fields.map((field) => [field, hashText(persistedAfterReload[field])]));
  const report = {
    ok: true,
    origin: canonicalOrigin,
    deployedRelease,
    researchObjectId,
    taskIds,
    missingEvidence,
    unsupportedClaims,
    fieldHashes,
    evidenceLocators: Object.fromEntries(fields.filter((field) => evidence[field]?.locator).map((field) => [field, evidence[field].locator])),
    acceptedFields: Object.keys(accepted),
    rejectedField,
    committedVersionId: committed.commit.versionId,
    committedVersionNo: committed.commit.versionNo,
    motionStates: [...motionStates].sort(),
    agentTaskRequests,
    networkInterceptions,
  };
  await writeFile(resolve(outputDir, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    researchObjectId,
    taskIds,
    missingEvidence,
    acceptedFields: Object.keys(accepted),
    rejectedField,
    committedVersionNo: report.committedVersionNo,
    motionStates: report.motionStates,
  }));
} finally {
  await context.close();
  await browser.close();
}
