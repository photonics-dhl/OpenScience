/* global Buffer, Headers, URL, console, fetch, process */

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.OPENSCIENCE_PRODUCTION_URL ?? 'https://openscience.428312321.xyz';
const sessionToken = process.env.OPENSCIENCE_E2E_SESSION_TOKEN;
if (!sessionToken) throw new Error('OPENSCIENCE_E2E_SESSION_TOKEN is required');

const outputDir = resolve('test/visual/out/hermes-real-ro');
await mkdir(outputDir, { recursive: true });

const paperRevision = '2009.06045v1';
const expectedPaperSha256 = 'd57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a';
const missingDisclosure = 'Source paper does not state this information explicitly; author review is required before publication.';
const paperResponse = await fetch(`https://arxiv.org/pdf/${paperRevision}`);
if (!paperResponse.ok) throw new Error(`arXiv PDF download failed: ${paperResponse.status}`);
const paper = Buffer.from(await paperResponse.arrayBuffer());
if (paper.length < 100_000) throw new Error(`arXiv PDF unexpectedly small: ${paper.length}`);
const paperSha256 = createHash('sha256').update(paper).digest('hex');
if (paperSha256 !== expectedPaperSha256) throw new Error(`arXiv revision hash changed: ${paperSha256}`);

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

try {
  await page.goto(`${baseUrl}/research-objects/new`, { waitUntil: 'networkidle' });
  const me = await browserJson('/api/auth/me');
  if (!me?.userId) throw new Error('authenticated production session was not accepted');

  const workspace = await page.locator('select').locator('option:not([value=""])').first().getAttribute('value');
  if (!workspace) throw new Error('personal workspace was not rendered');
  await page.locator('select').selectOption(workspace);
  await page.locator('input[name="title"]').fill('E2E — Attosecond on-chip optical field sampling');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'arxiv-2009.06045.pdf',
    mimeType: 'application/pdf',
    buffer: paper,
  });

  const ingestionResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
      && /\/api\/research-objects\/[^/]+\/ingest$/.test(new URL(response.url()).pathname)
  ), { timeout: 300_000 });
  await page.locator('form button[type="submit"]').click();
  const ingestionResponse = await ingestionResponsePromise;
  if (ingestionResponse.status() !== 202) throw new Error(`ingestion submit failed: ${ingestionResponse.status()}`);
  const responsePath = new URL(ingestionResponse.url()).pathname;
  const researchObjectId = responsePath.match(/\/api\/research-objects\/([^/]+)\/ingest$/)?.[1];
  if (!researchObjectId) throw new Error('ingestion response URL omitted the RO id');
  let taskId;
  for (let attempt = 0; attempt < 20 && !taskId; attempt += 1) {
    const actionable = await browserJson('/api/ingestion?actionable=true');
    taskId = actionable.tasks?.find((task) => task.researchObjectId === researchObjectId)?.id;
    if (!taskId) await page.waitForTimeout(500);
  }
  if (!taskId || !researchObjectId) throw new Error('ingestion response omitted task or RO id');

  const deadline = Date.now() + 300_000;
  let detail;
  while (Date.now() < deadline) {
    detail = await browserJson(`/api/ingestion/tasks/${taskId}`);
    if (detail.task.state === 'needs_review') break;
    if (String(detail.task.state).startsWith('failed')) {
      throw new Error(`ingestion ${detail.task.state}: ${detail.task.error ?? 'unknown'}`);
    }
    await page.waitForTimeout(2_000);
  }
  if (detail?.task?.state !== 'needs_review') throw new Error('ingestion did not reach needs_review');

  const result = detail.task.result ?? {};
  const core = result.core ?? {};
  const evidence = result.evidence ?? {};
  const missing = Array.isArray(result.needsMoreInformation) ? result.needsMoreInformation : [];
  const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
  for (const field of fields) {
    if (typeof core[field] !== 'string') throw new Error(`missing core field ${field}`);
    if (!missing.includes(field) && (!evidence[field]?.quote || !String(evidence[field]?.locator).startsWith('chars:'))) {
      throw new Error(`supported field ${field} lacks exact evidence`);
    }
  }

  const semanticText = `${core.problem} ${core.insight} ${core.method} ${core.results}`.toLowerCase();
  const semanticChecks = {
    opticalFieldProblem: /(optical field|electric field|visible|near-infrared|near infrared)/.test(semanticText),
    onChipMethod: /(on-chip|on chip|nanoantenna|photoemission|attosecond)/.test(semanticText),
    quantitativeResult: /(5\s?fj|50\s?pj|femtojoule|picojoule)/.test(semanticText),
  };
  if (!Object.values(semanticChecks).every(Boolean)) {
    throw new Error(`semantic rubric failed: ${JSON.stringify(semanticChecks)}`);
  }

  const roBeforeReview = await browserJson(`/api/research-objects/${researchObjectId}`);
  const preConfirmCore = roBeforeReview.researchObject.sdf.core;
  for (const field of fields) {
    if (String(preConfirmCore[field] ?? '').trim()) {
      throw new Error(`Hermes wrote ${field} before explicit user confirmation`);
    }
  }

  await page.goto(`${baseUrl}/research-objects/${researchObjectId}/hermes?task=${taskId}`, { waitUntil: 'networkidle' });
  const textareas = page.locator('textarea');
  await textareas.first().waitFor({ state: 'visible' });
  for (let index = 0; index < fields.length; index += 1) {
    if (!(await textareas.nth(index).inputValue()).trim()) {
      await textareas.nth(index).fill(missingDisclosure);
    }
  }
  await page.screenshot({ path: resolve(outputDir, 'hermes-review-before-confirm.png'), fullPage: true });
  await page.getByRole('button', { name: /确认并创建版本|Confirm/i }).click();
  await page.getByText(/已确认并写入新版本|confirmed/i).waitFor({ timeout: 30_000 });

  const roAfterConfirm = await browserJson(`/api/research-objects/${researchObjectId}`);
  if (roAfterConfirm.researchObject.version !== 2) {
    throw new Error(`expected RO version 2 after confirmation, got ${roAfterConfirm.researchObject.version}`);
  }
  const finalCore = roAfterConfirm.researchObject.sdf.core;
  for (const field of fields) {
    const expected = missing.includes(field) ? missingDisclosure : core[field];
    if (finalCore[field] !== expected) {
      throw new Error(`confirmed ${field} differs from the reviewed proposal/disclosure`);
    }
  }
  const commit = await browserJson(`/api/research-objects/${researchObjectId}/commits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `hermes-e2e:${taskId}:commit` },
    body: JSON.stringify({
      message: 'Confirm MiniMax evidence extraction for arXiv:2009.06045',
      version: roAfterConfirm.researchObject.version,
      sdfCore: finalCore,
      artifacts: [{ artifactId: detail.task.artifactId, logicalPath: detail.task.logicalPath }],
    }),
  });
  if (!commit.commit?.versionId || commit.commit.versionNo < 1) throw new Error('commit response is incomplete');

  await page.goto(`${baseUrl}/dashboard?hermes-motion=full`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: resolve(outputDir, 'dashboard-after-real-ro.png'), fullPage: true });
  const hermes = await page.locator('[data-hermes-state]').first().evaluate((node) => ({
    state: node.getAttribute('data-hermes-state'),
    inputReady: node.getAttribute('data-hermes-input-ready'),
    canvas: node.querySelectorAll('[data-hermes-articulated-canvas="true"]').length,
    rigStatus: node.querySelector('[data-hermes-rig-status]')?.getAttribute('data-hermes-rig-status') ?? null,
  }));
  const approvalContract = hermes.state === 'awaiting_approval'
    ? hermes.inputReady === 'false' && hermes.rigStatus === 'fallback'
    : hermes.inputReady === 'true' && hermes.rigStatus === 'ready';
  if (hermes.canvas !== 1 || !approvalContract) {
    throw new Error(`Hermes runtime unavailable: ${JSON.stringify(hermes)}`);
  }

  const report = {
    baseUrl,
    paperRevision,
    paperBytes: paper.length,
    paperSha256,
    researchObjectId,
    taskId,
    missing,
    semanticChecks,
    core,
    finalCore,
    missingDisclosure,
    evidence,
    versionAfterConfirm: roAfterConfirm.researchObject.version,
    committedVersionNo: commit.commit.versionNo,
    hermes,
  };
  await writeFile(resolve(outputDir, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    paperBytes: paper.length,
    missing,
    semanticChecks,
    versionAfterConfirm: report.versionAfterConfirm,
    committedVersionNo: report.committedVersionNo,
    hermes,
  }));
} finally {
  await browser.close();
}
