/* global Headers, MutationObserver, URL, console, document, fetch, performance, process, window */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.OPENSCIENCE_PRODUCTION_URL;
const sessionToken = process.env.OPENSCIENCE_E2E_SESSION_TOKEN;
if (!baseUrl) throw new Error('OPENSCIENCE_PRODUCTION_URL is required');
if (!sessionToken) throw new Error('OPENSCIENCE_E2E_SESSION_TOKEN is required');

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
const networkInterceptions = 0;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

const readCore = (response) => response?.researchObject?.sdf?.core ?? {};
const assertFieldsEmpty = (core, message) => {
  for (const field of fields) assert.equal(String(core[field] ?? '').trim(), '', `${message}: ${field}`);
};
const proposalFor = (value) => page.locator('[data-before-after-proposal]').filter({
  has: page.getByText(value, { exact: true }),
}).first();

try {
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=full`, { waitUntil: 'networkidle' });
  const me = await browserJson('/api/auth/me');
  assert.ok(me?.userId, 'authenticated production session was not accepted');

  const workspace = await page.locator('select option:not([value=""])').first().getAttribute('value');
  assert.ok(workspace, 'personal workspace was not rendered');
  await page.locator('select').selectOption(workspace);
  await page.locator('input[name="title"]').fill(label);
  await page.getByRole('button', { name: /Create research object|创建研究对象/ }).click();
  await page.waitForURL(/\/research-objects\/[^/]+\/edit/);
  const researchObjectId = new URL(page.url()).pathname.match(/\/research-objects\/([^/]+)\/edit/)?.[1];
  assert.ok(researchObjectId, 'blank create flow did not expose a Research Object id');

  const created = await browserJson(`/api/research-objects/${researchObjectId}`);
  assert.equal(created.researchObject.visibility, 'private');
  assertFieldsEmpty(readCore(created), 'new blank RO was not empty');

  const stage = page.locator('[data-hermes-workspace-stage]');
  await stage.waitFor({ state: 'visible' });
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

  const deadline = Date.now() + 300_000;
  let taskDetail;
  while (Date.now() < deadline) {
    taskDetail = await browserJson(`/api/agent/tasks/${submitted.task.id}`);
    if (taskDetail.task.status === 'succeeded') break;
    if (taskDetail.task.status === 'failed') throw new Error(`sdf.extract failed: ${taskDetail.task.error ?? 'unknown'}`);
    await page.waitForTimeout(1_500);
  }
  assert.equal(taskDetail?.task?.status, 'succeeded', 'sdf.extract did not complete within 300 seconds');

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

  await page.locator('[data-before-after-proposal]').first().waitFor({ state: 'visible', timeout: 30_000 });
  await stage.evaluate((node) => {
    if (node.getAttribute('data-hermes-presentation-state') !== 'suggesting') {
      throw new Error('Hermes did not enter review presentation');
    }
  });
  const beforeReview = await browserJson(`/api/research-objects/${researchObjectId}`);
  assertFieldsEmpty(readCore(beforeReview), 'Hermes wrote before explicit field review');

  const supported = fields.filter((field) => field !== 'results' && String(proposedCore[field] ?? '').trim());
  assert.ok(supported.includes('problem'), 'controlled brief did not produce a problem proposal');
  const directField = ['insight', 'method', 'limitations'].find((field) => supported.includes(field));
  const rejectedField = ['method', 'limitations', 'insight', 'reproducibility'].find((field) => supported.includes(field) && field !== directField);
  assert.ok(directField && rejectedField, 'controlled brief did not produce three independently reviewable proposals');

  const problemProposal = proposalFor(proposedCore.problem);
  await problemProposal.getByRole('button', { name: /Edit suggestion|编辑建议/ }).click();
  await problemProposal.getByRole('textbox').fill(gold.problem);
  await problemProposal.getByRole('button', { name: /Apply edited change|应用已编辑内容/ }).click();

  const directProposal = proposalFor(proposedCore[directField]);
  await directProposal.getByRole('button', { name: /Review changes|审阅变更/ }).click();

  const rejectedProposal = proposalFor(proposedCore[rejectedField]);
  await rejectedProposal.getByRole('button', { name: /Dismiss|忽略建议/ }).click();

  const missingResults = page.locator('[data-missing-evidence="results"]');
  await missingResults.waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: /Results|结果/ }).evaluate((node) => {
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

  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  const motionStates = new Set();
  for (const sample of motionSamples) {
    if (sample.guide === 'travel') motionStates.add('travel');
    if (sample.presentation === 'idle') motionStates.add('idle');
    if (sample.presentation === 'scanning') motionStates.add('working');
    if (sample.presentation === 'suggesting') motionStates.add('review');
  }
  assert.ok(['idle', 'travel', 'working', 'review'].every((state) => motionStates.has(state)), `incomplete Hermes motion states: ${[...motionStates].join(', ')}`);
  assert.equal(networkInterceptions, 0);
  assert.equal(agentTaskRequests, 1, `expected one sdf.extract submission, observed ${agentTaskRequests}`);
  assert.equal(taskIds.length, new Set(taskIds).size);
  assert.equal(accepted.problem, gold.problem);
  assert.equal(accepted.results, '');
  assert.equal(persistedAfterReload.results, '');

  const report = {
    ok: true,
    baseUrl,
    label,
    researchObjectId,
    taskIds,
    missingEvidence,
    unsupportedClaims,
    accepted,
    rejected: { [rejectedField]: proposedCore[rejectedField] },
    persistedAfterReload,
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
  await browser.close();
}
