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
    const segments = result.evidenceSegments?.[field];
    if (segments !== undefined) {
      if (!Array.isArray(segments) || segments.length > 32 || segments.reduce((sum, segment) => sum + String(segment.quote ?? '').length, 0) > 8000) throw new Error(`invalid segment bound: ${field}`);
      const blocks = new Set();
      for (const segment of segments) {
        const locator = segment.sourceLocator;
        if (typeof segment.quote !== 'string' || !segment.quote.trim() || !locator
          || locator.artifactId !== detail.task.artifactId || locator.contentHash !== paperSha256
          || !locator.blockId || blocks.has(locator.blockId) || locator.charRange?.end - locator.charRange?.start !== segment.quote.length) throw new Error(`invalid canonical segment: ${field}`);
        blocks.add(locator.blockId);
      }
      if ((!missing.includes(field) && !segments.length) || evidence[field]?.quote !== segments.map(segment => segment.quote).join('\n')) throw new Error(`incomplete segment projection: ${field}`);
      if (segments.length > 1 && (result.evidenceLocation?.[field]?.status !== 'cross_block' || result.evidenceLocation[field].sourceLocator)) throw new Error(`fabricated multiblock locator: ${field}`);
    } else if (!missing.includes(field) && (!evidence[field]?.quote || !String(evidence[field]?.locator).startsWith('chars:'))) {
      throw new Error(`supported field ${field} lacks exact evidence`);
    }
  }

  const semanticText = `${core.problem} ${core.insight} ${core.method} ${core.results}`.toLowerCase();
  const semanticChecks = {
    opticalFieldProblem: /(optical field|electric field|visible|near-infrared|near infrared|光场|电场|近红外)/.test(semanticText),
    onChipMethod: /(on-chip|on chip|nanoantenna|photoemission|attosecond|片上|纳米天线|光电子发射|阿秒)/.test(semanticText),
    quantitativeResult: /(5\s?fj|50\s?pj|femtojoule|picojoule|5\s*飞焦|50\s*皮焦)/.test(semanticText),
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
  if (result.evidenceSegments) {
    const original = page.locator('[data-hermes-source-evidence="method"]');
    await original.locator('summary').click();
    for (const segment of result.evidenceSegments.method) await original.getByText(segment.quote, { exact: true }).waitFor({ state: 'visible' });
  }
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

  await writeFile(resolve(outputDir, 'confirmed-version.json'), JSON.stringify({ researchObjectId, taskId, versionId: commit.commit.versionId, core: finalCore }));
  if (!core.insight.trim() || missing.includes('insight')) throw new Error('A substantive reviewed insight is required for the Claim bridge');
  await page.goto(`${baseUrl}/research-objects/${researchObjectId}/hermes?version=${commit.commit.versionId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^(向 Hermes 提问|Ask Hermes)$/ }).click();
  await page.getByRole('button', { name: /^(分镜与配图|Storyboards and scene images)$/ }).click();
  const claimReview = page.getByRole('region', { name: /^(从论文分析整理主张|Review claims from your paper)$/ });
  await claimReview.getByRole('button', { name: /^(预览已确认的论文分析|Preview confirmed paper analysis)$/ }).click();
  const selectedFields = ['insight', 'method', 'results', 'limitations', 'reproducibility'].filter(field => !missing.includes(field));
  const fieldLabels = { insight: '核心见解|Insight', method: '方法|Method', results: '结果|Results', limitations: '局限|Limitations', reproducibility: '可复现性|Reproducibility' };
  for (const field of selectedFields) {
    const checkbox = claimReview.getByRole('checkbox', { name: new RegExp(`^(${fieldLabels[field]}) ·`) });
    await checkbox.check();
    const row = checkbox.locator('..').locator('..');
    if (field !== 'insight') {
      const parent = row.getByRole('combobox').last();
      const parentKey = await parent.locator('option:not([value=""])').first().getAttribute('value');
      if (!parentKey) throw new Error(`No reviewed parent for ${field}`);
      await parent.selectOption(parentKey);
    }
    if (result.evidenceSegments?.[field]?.length) {
      const actualQuotes = await row.locator('blockquote').allTextContents();
      if (JSON.stringify(actualQuotes) !== JSON.stringify(result.evidenceSegments[field].map(segment => segment.quote))) throw new Error(`Claim review lost segment text: ${field}`);
    }
  }
  await page.screenshot({ path: resolve(outputDir, 'claim-review-before-confirm.png'), fullPage: true });
  const claimResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/ingestion-claim-evidence/${taskId}`));
  await claimReview.getByRole('button', { name: /^(确认所选主张及候选证据|Confirm selected claims and candidate evidence)$/ }).click();
  const createdResponse = await claimResponse;
  if (createdResponse.status() !== 201) throw new Error(`Claim bridge failed: ${createdResponse.status()}`);
  const bridge = await createdResponse.json();
  if (bridge.claims?.length !== selectedFields.length || bridge.claims.some(claim => claim.researchObjectId !== researchObjectId || claim.versionId !== commit.commit.versionId || claim.assessment !== 'missing')) throw new Error('Claim bridge changed scope or assessment');
  const expectedEvidence = selectedFields.reduce((sum, field) => sum + (result.evidenceSegments?.[field]?.length ?? 1), 0);
  if (bridge.evidence?.length !== expectedEvidence || bridge.evidence.some(item => item.researchObjectId !== researchObjectId || item.versionId !== commit.commit.versionId || item.extractionStatus !== 'needs_review' || item.verifiedByUserId)) throw new Error('Claim bridge changed source evidence or verification status');
  if (JSON.stringify(bridge).includes('"sourceMapRef"')) throw new Error('Private SourceMap reference leaked in Claim bridge');
  await writeFile(resolve(outputDir, 'claim-bridge.json'), JSON.stringify({ researchObjectId, versionId: commit.commit.versionId, selectedFields, ...bridge }, null, 2));

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
    evidenceSegments: result.evidenceSegments,
    evidenceLocation: result.evidenceLocation,
    committedVersionId: commit.commit.versionId,
    reviewedClaimCount: bridge.claims.length,
    candidateEvidenceCount: bridge.evidence.length,
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
