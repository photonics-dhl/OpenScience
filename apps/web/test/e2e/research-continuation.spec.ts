import { expect, test, type Page, type Request, type Route } from 'playwright/test';
import type { WorkspaceGuidePayload } from '../../lib/api';
import type { ReadingRecord } from '../../components/research/WorkbenchClaimReader';

const ro = { id: 'journey-ro', workspaceId: 'workspace-journey', publicId: 'OSR-JOURNEY', title: 'Research continuation', version: 1, status: 'draft', visibility: 'private' };
const core = { schemaVersion: '0.1.0', problem: 'Question', insight: 'Finding', method: 'Measurement', results: 'Result', limitations: 'Limits', reproducibility: 'Data' };
const confirmation = { commitId: 'confirmed-commit', versionId: 'confirmed-version', versionNo: 2, version: 7, evidenceStatus: 'needs_review', missingFields: ['results'] };
const task = { id: 'journey-task', researchObjectId: ro.id, researchTitle: ro.title, logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, artifactId: 'artifact-journey', agentTaskId: 'agent-journey' };

test.beforeEach(async ({ page }) => {
  await page.context().route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    throw new Error(`Unmocked API request: ${route.request().method()} ${url.pathname}${url.search}`);
  });
});

function readJson(route: Route, json: unknown) {
  return route.request().method() === 'GET' ? route.fulfill({ json }) : route.fallback();
}

async function fixtures(page: Page, tasks = [task]) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown;
    if (path === '/api/auth/me') body = { userId: 'user-journey', email: 'test@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' };
    else if (path === '/api/research-objects') body = { researchObjects: [ro] };
    else if (path === '/api/ingestion') body = { tasks };
    else if (path === `/api/research-objects/${ro.id}/ingestion`) body = { researchObjectId: ro.id, version: 1, tasks: tasks.map(item => ({ ...item, confirmation: null })), latestConfirmation: null };
    else if (path === `/api/research-objects/${ro.id}/hermes-runs` && url.searchParams.get('ingestionTaskId') === task.id && url.searchParams.size === 1) body = { run: null };
    else if (path === `/api/research-objects/${ro.id}/authors`) body = { authors: [] };
    else if (path === '/api/versions/confirmed-version') body = { version: { versionId: 'confirmed-version', snapshot: { core, artifacts: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }] } } };
    else if (path.startsWith(`/api/research-objects/${ro.id}/versions/`) && path.endsWith('/record')) body = { record: { objectId: ro.id, versionId: path.split('/').at(-2), recordState: 'recorded', sdf: core, manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }], claims: [], evidence: [] } };
    else if (path.startsWith(`/api/research-objects/${ro.id}/versions/`) && path.endsWith('/claims')) body = { claims: [] };
    else if (path.startsWith(`/api/research-objects/${ro.id}/versions/`) && path.endsWith('/evidence')) body = { evidence: [] };
    else if (path.startsWith(`/api/research-objects/${ro.id}/versions/`) && path.endsWith('/presentation-assets')) body = { assets: [] };
    else if (path === '/api/ingestion/tasks/journey-task') body = { researchObjectId: ro.id, batchId: 'batch', version: 1, task: { ...task, result: { core } } };
    else if (path === `/api/research-objects/${ro.id}`) body = { researchObject: { ...ro, sdf: { core, nodes: [] } } };
    else if (path === `/api/research-objects/${ro.id}/versions`) body = { versions: [] };
    else if (path === '/api/agent/tasks' && url.searchParams.get('actionable') === 'false') {
      const routeRo = new URL(page.url()).pathname.match(/^\/research-objects\/([^/]+)\//u)?.[1];
      const guide = url.searchParams.get('kind') === 'workspace.guide' && url.searchParams.size === 2;
      const literature = url.searchParams.get('kind') === 'source.retrieve' && url.searchParams.get('recovery') === 'true'
        && url.searchParams.get('targetKind') === (routeRo ? 'research_object' : 'personal')
        && url.searchParams.get('researchObjectId') === (routeRo ?? null) && url.searchParams.size === (routeRo ? 5 : 4);
      if (!guide && !literature) return route.fallback();
      body = { tasks: [] };
    }
    else if (path === '/api/workspaces') body = { workspaces: [{ id: ro.workspaceId, name: 'Research workspace', type: 'personal', role: 'owner', status: 'active' }] };
    else return route.fallback();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mockVersionGuide(page: Page) {
  const submissions: Array<{ key: string; payload: WorkspaceGuidePayload }> = [];
  await page.route('**/api/csrf-token', route => route.request().method() === 'GET' ? route.fulfill({ json: { csrfToken: 'test-csrf' } }) : route.fallback());
  await page.route('**/api/agent/sessions', route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    expect(route.request().postDataJSON()).toMatchObject({ kind: 'workspace.guide', researchObjectId: ro.id });
    return route.fulfill({ status: 201, json: { session: { id: 'version-guide-session' } } });
  });
  await page.route('**/api/agent/tasks', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    const key = route.request().headers()['idempotency-key'];
    expect(key).toBeTruthy();
    expect(input).toMatchObject({ sessionId: 'version-guide-session', kind: 'workspace.guide', payload: { route: 'research-object-edit', context: { editorDraft: { researchObjectId: ro.id, scope: 'sdf' } } } });
    submissions.push({ key, payload: input.payload });
    return route.fulfill({ status: 201, json: { task: {
      id: 'version-guide-task', sessionId: input.sessionId, researchObjectId: ro.id, kind: 'workspace.guide', status: 'succeeded', progress: 100,
      result: { summary: 'Review media in the saved private version.', nextSteps: [{ label: 'Review media', intent: 'review-media', targetId: ro.id }], needsMoreInformation: false },
      error: null, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
    } } });
  });
  return submissions;
}

test('dashboard keeps process records behind history and opens the actual review from there', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard');
  const continuation = page.locator('aside[aria-labelledby="hermes-task-title"]');
  await expect(continuation).not.toBeVisible();
  await page.getByText('Processing history', { exact: true }).first().click();
  await expect(continuation.getByRole('link')).toHaveAttribute('href', '/research-objects/journey-ro/edit?ingestionTask=journey-task');
  await continuation.getByRole('link').click();
  await expect(page).toHaveURL(/edit\?ingestionTask=journey-task$/);
  await expect(page.locator('select option[value="journey-task"]')).toContainText('paper.pdf');
  await expect(page.locator('[data-sdf-node="1"] [data-read-only="true"]')).toHaveText('Question');
});

test('direct Hermes entry offers current RO tasks rather than a missing parameter error', async ({ page }) => {
  await fixtures(page);
  await page.goto('/research-objects/journey-ro/hermes');
  await page.getByText('Existing analysis and manual workflows', { exact: true }).click();
  const row = page.locator('li').filter({ hasText: 'paper.pdf' });
  await expect(row.getByRole('link')).toHaveAttribute('href', '/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});

test('a foreign task never exposes a proposal and can return to the current RO', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: 'foreign-ro', version: 1, task: { ...task, result: { core } } }) }));
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('main').getByRole('status')).toHaveCount(0);
  await expect(page.locator('main a[href="/research-objects/journey-ro/hermes"]').last()).toBeVisible();
});

test('failed loading can retry and confirmed results continue into the RO', async ({ page }) => {
  await fixtures(page);
  let failed = true;
  await page.route('**/api/ingestion/tasks/journey-task', async route => {
    if (failed) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Temporarily unavailable' } }) });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: ro.id, version: 1, task: { ...task, state: 'confirmed', result: { core } } }) });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toHaveText('Temporarily unavailable');
  await expect(page.locator('main').getByRole('status')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('textarea[readonly]')).toHaveCount(6);
  await expect(page.getByText('This older import has no recorded confirmation snapshot. Review the saved versions before relying on its evidence.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue editing', exact: true })).toHaveAttribute('href', '/research-objects/journey-ro/edit');
  await expect(page.locator('main a[href="/research-objects/journey-ro/versions"]').last()).toBeVisible();
});

test('empty Hermes entry keeps editing and source material reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, []);
  await page.goto('/research-objects/journey-ro/hermes');
  await page.getByText('Existing analysis and manual workflows', { exact: true }).click();
  await expect(page.locator('main a[href="/research-objects/journey-ro/edit"]').last()).toBeVisible();
  await expect(page.locator('main a[href="/research-objects/journey-ro/files"]').last()).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/hermes-empty-mobile.png', fullPage: true });
});

test('confirmation writes only on request and keeps a route back into the research', async ({ page }) => {
  await fixtures(page);
  const revisedCore = { ...core, problem: 'Revised question' };
  let writes = 0;
  await page.route('**/api/research-objects/journey-ro/versions', route => readJson(route, { versions: writes ? [{ ...confirmation, status: 'draft' }] : [] }));
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record', route => readJson(route, { record: { objectId: ro.id, versionId: confirmation.versionId, recordState: 'recorded', sdf: revisedCore, manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }], claims: [], evidence: [] } }));
  await page.route('**/api/csrf-token', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) }));
  await page.route('**/api/ingestion/journey-task/confirm', async route => {
    writes += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ version: 1, core: revisedCore, sourceAgentTaskId: task.agentTaskId });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...task, state: 'confirmed' }, sdf: { core: { ...core, problem: 'Revised question' } }, confirmation }) });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await page.locator('textarea').first().fill('Revised question');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Confirm and create version', exact: true }).click();
  await expect(page).toHaveURL(/versions\?version=confirmed-version$/);
  await expect(page.locator('[data-selected-version="confirmed-version"]')).toContainText(revisedCore.problem);
  await expect(page.getByRole('link', { name: 'paper.pdf', exact: true })).toHaveAttribute('href', '/api/artifacts/artifact-journey/download');
  await page.reload();
  await expect(page.locator('[data-selected-version="confirmed-version"]')).toContainText(revisedCore.problem);
  expect(writes).toBe(1);
});

test('the confirmed paper is included in the next commit through the editor', async ({ page }) => {
  await fixtures(page);
  const artifacts = [{ artifactId: 'prior-artifact', logicalPath: 'previous-paper.pdf' }, { artifactId: task.artifactId, logicalPath: task.logicalPath }];
  const editedCore = { ...core, problem: 'Reviewed question' };
  let committed = false;
  let saves = 0;
  let commits = 0;
  await page.route('**/api/research-objects/journey-ro/versions', route => readJson(route, { versions: [{ versionId: committed ? 'committed-version' : 'previous-version', versionNo: committed ? 2 : 1, commitMessage: committed ? 'Draft saved' : 'Source import confirmed', status: 'draft', createdAt: '2026-10-08T00:00:00.000Z' }] }));
  await page.route('**/api/versions/previous-version', route => readJson(route, { version: { versionId: 'previous-version', snapshot: { core, artifacts } } }));
  await page.route('**/api/research-objects/journey-ro/versions/committed-version/record', route => readJson(route, { record: { objectId: ro.id, versionId: 'committed-version', recordState: 'recorded', sdf: editedCore, manifest: artifacts, claims: [], evidence: [] } }));
  await page.route('**/api/research-objects/journey-ro/ingestion', route => readJson(route, { researchObjectId: ro.id, version: 1, tasks: [{ ...task, state: 'confirmed', confirmation: { ...confirmation, versionId: 'previous-version' } }], latestConfirmation: null }));
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: ro.id, version: 1, task: { ...task, state: 'confirmed', result: { core } } }) }));
  await page.route('**/api/sdf/journey-ro', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ version: 1, core: editedCore });
    saves += 1;
    return route.fulfill({ json: { sdf: { core: editedCore } } });
  });
  const guideSubmissions = await mockVersionGuide(page);
  let submitted: unknown;
  await page.route('**/api/research-objects/journey-ro/commits', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    commits += 1;
    submitted = route.request().postDataJSON();
    committed = true;
    await route.fulfill({ json: { commit: { versionId: 'committed-version', versionNo: 2, commitId: 'new-commit' } } });
  });
  await page.goto('/research-objects/journey-ro/edit?ingestionTask=journey-task');
  await page.locator('#sdf-field-problem').fill(editedCore.problem);
  await expect.poll(() => saves).toBe(1);
  expect(commits).toBe(0);
  const assistant = page.locator('.hermes-conversation-shell');
  await expect(assistant).toBeVisible();
  await assistant.getByLabel('Send an instruction to Hermes').fill('Review media for this saved research');
  await assistant.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => submitted).toEqual({ version: 2, message: 'Draft saved', artifacts, sdfCore: editedCore });
  expect(guideSubmissions).toHaveLength(1);
  expect(guideSubmissions[0].payload.context.editorDraft).toMatchObject({ researchObjectId: ro.id, version: 2, scope: 'sdf', core: {
    problem: editedCore.problem, insight: core.insight, method: core.method,
    results: core.results, limitations: core.limitations, reproducibility: core.reproducibility,
  } });
  await expect(assistant.locator('[data-hermes-media-review="true"]')).toBeVisible();
  await expect(assistant.getByText('This version has no media awaiting review.', { exact: true })).toBeVisible();
  expect(commits).toBe(1);
  await page.getByRole('button', { name: 'Close Hermes' }).click();
  await page.locator('summary').filter({ hasText: /^More$/ }).click();
  await page.getByRole('button', { name: 'Edit history', exact: true }).click();
  const history = page.getByRole('dialog');
  await history.getByRole('button', { name: /Draft saved/ }).click();
  await expect(history.locator('[data-selected-version="committed-version"]')).toContainText(editedCore.problem);
  for (const artifact of artifacts) await expect(history.getByRole('link', { name: artifact.logicalPath, exact: true })).toHaveAttribute('href', `/api/artifacts/${artifact.artifactId}/download`);
  expect(commits).toBe(1);
});

test('a foreign imported paper cannot be silently attached or committed', async ({ page }) => {
  await fixtures(page);
  const foreignCore = { ...core, problem: 'Foreign proposal must stay hidden' };
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: 'foreign-ro', version: 1, task: { ...task, state: 'confirmed', result: { core: foreignCore } } }) }));
  let writes = 0;
  for (const path of ['/api/sdf/journey-ro', '/api/research-objects/journey-ro/commits', '/api/ingestion/journey-task/confirm']) {
    await page.route(`**${path}`, route => { writes += 1; return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN', message: 'Foreign source cannot be written' } } }); });
  }
  const guideSubmissions = await mockVersionGuide(page);
  await page.goto('/research-objects/journey-ro/edit?ingestionTask=journey-task');
  await expect(page.locator('[data-sdf-node] textarea')).toHaveCount(0);
  await expect(page.getByText(foreignCore.problem, { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/api/artifacts/artifact-journey/download"]')).toHaveCount(0);
  const assistant = page.locator('.hermes-conversation-shell');
  await expect(assistant).toBeVisible();
  await expect(page.locator('[data-sdf-node="1"] [data-read-only="true"]')).toHaveText(core.problem);
  await expect(assistant.getByText('This analysis does not belong to the current Research Object or material, so its content was not loaded.', { exact: true })).toBeVisible();
  await assistant.getByLabel('Send an instruction to Hermes').fill('Review media for this saved research');
  await assistant.getByRole('button', { name: 'Send' }).click();
  await expect(assistant.getByRole('alert')).toContainText('Ordinary save and commit are paused until it is resolved');
  expect(guideSubmissions).toHaveLength(1);
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Close Hermes' }).click();
  await expect(page.locator('[data-sdf-node] textarea')).toHaveCount(0);
  await expect(page.getByText(foreignCore.problem, { exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

test('the task hub opens the existing assistant in the same research context', async ({ page }) => {
  await fixtures(page, []);
  await page.goto('/research-objects/journey-ro/hermes');
  await page.getByRole('button', { name: 'Ask Hermes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('partial extraction can be confirmed with empty fields and navigates to the real snapshot', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/csrf-token', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }));
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ ...confirmation, status: 'draft' }] } }));
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record', route => readJson(route, { record: { objectId: ro.id, versionId: confirmation.versionId, recordState: 'recorded', sdf: { ...core, results: '' }, manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }], claims: [], evidence: [] } }));
  let writes = 0;
  await page.route('**/api/ingestion/journey-task/confirm', async route => {
    writes++;
    expect(route.request().postDataJSON().core.results).toBe('');
    expect(route.request().postDataJSON().sourceAgentTaskId).toBe(task.agentTaskId);
    await route.fulfill({ json: { task: { ...task, state: 'confirmed' }, sdf: { core: { ...core, results: '' } }, confirmation } });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await page.locator('textarea').nth(3).fill('');
  await expect(page.getByText('Not provided · pending', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Confirm and create version', exact: true }).click();
  await expect(page.locator('[data-selected-version="confirmed-version"]')).toBeVisible();
  await expect(page.locator('[data-selected-version="confirmed-version"]').getByText(core.results, { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/versions\?version=confirmed-version$/);
  expect(writes).toBe(1);
});

test('saved materials survive Files refresh and same-name attachments create a merged manifest', async ({ page }) => {
  await fixtures(page);
  const original = { artifactId: 'original', logicalPath: 'paper.pdf' };
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ versionId: 'confirmed-version', versionNo: 2, status: 'draft' }] } }));
  await page.route('**/api/versions/confirmed-version', route => route.fulfill({ json: { version: { versionId: 'confirmed-version', snapshot: { core, artifacts: [original] } } } }));
  await page.route('**/api/csrf-token', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }));
  await page.route('**/api/artifacts/upload', route => route.fulfill({ json: { artifact: { artifactId: 'added' } } }));
  let submitted: unknown;
  await page.route('**/api/research-objects/journey-ro/commits', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ json: { commit: { versionId: 'new' } } }); });
  await page.goto('/research-objects/journey-ro/files');
  await expect(page.locator('[data-artifact-row]').filter({ hasText: 'paper.pdf' }).getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/artifacts/original/download');
  await page.reload();
  await expect(page.locator('a[href="/api/artifacts/original/download"]')).toBeVisible();
  await page.getByTestId('artifact-input').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('controlled fixture') });
  await page.getByRole('button', { name: 'Save materials to draft', exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({ version: 1, artifacts: [original, { artifactId: 'added', logicalPath: 'paper.pdf.1' }] });
});

async function versionEvidenceFixtures(page: Page) {
  await fixtures(page);
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ versionId: 'newer', versionNo: 3, publicationNo: 3, status: 'published' }, { versionId: 'confirmed-version', versionNo: 2, publicationNo: 2, status: 'published' }] } }));
  await page.route('**/api/research-objects/journey-ro/versions/newer/record', route => route.fulfill({ json: { record: { objectId: ro.id, versionId: 'newer', recordState: 'recorded', sdf: { ...core, results: 'Newer result' }, manifest: [], claims: [], evidence: [] } } }));
  const contentHash = 'a'.repeat(64);
  const record: ReadingRecord & { recordState: 'recorded' } = { objectId: ro.id, versionId: 'confirmed-version', recordState: 'recorded', sdf: core,
    manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath, blobSha256: contentHash, mimeType: 'application/pdf' }],
    claims: [{ id: 'claim', kind: 'core', statement: 'Claim needing verification', assessment: 'missing', conditions: [], limitations: [] }],
    evidence: [{ id: 'evidence', claimId: 'claim', artifactId: task.artifactId, contentHash, kind: 'passage', relation: 'context', title: 'Original passage', locator: { page: 3 }, extractionConfidence: null, verified: false }] };
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record', route => route.fulfill({ json: { record } }));
}

async function openVersionEvidence(page: Page, locale: 'en' | 'zh' = 'en') {
  const reader = page.locator('[data-version-claim-reader="confirmed-version"]');
  await expect(reader).toBeVisible();
  const narrative = reader.locator('[data-claim-narrative]');
  await expect(narrative).not.toHaveAttribute('open', '');
  await narrative.locator(':scope > summary').click();
  const claim = reader.locator('[data-claim-id="claim"]');
  await claim.locator(':scope > summary').click();
  await claim.locator('details > summary').filter({ hasText: locale === 'zh' ? /^证据（1）$/ : /^Evidence \(1\)$/ }).click();
  await claim.locator('[data-evidence-id="evidence"] > summary').click();
  await claim.getByRole('button', { name: locale === 'zh' ? '查看来源原文' : 'View original source', exact: true }).click();
}

test('selected snapshot and original evidence remain scoped across version switches', async ({ page }) => {
  await versionEvidenceFixtures(page);
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record/evidence/evidence/source', route => route.fulfill({ json: { source: { text: 'Exact original quotation', page: 3, region: null } } }));
  await page.goto('/research-objects/journey-ro/versions?version=confirmed-version');
  await expect(page.getByRole('link', { name: 'Research API', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Export fixed record', exact: true })).toHaveAttribute('href', '/api/research-objects/journey-ro/versions/confirmed-version/record/export');
  await expect(page.locator('[data-selected-version="confirmed-version"]').getByText(core.results, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-reading-desktop.png' });
  await openVersionEvidence(page);
  await expect(page.getByText('Exact original quotation', { exact: true })).toBeVisible();
  await expect(page.getByText('Exact original quotation', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-source-region]')).toHaveCount(0);
  await expect(page.locator('dd').filter({ hasText: /^3$/ })).toBeVisible();
  await expect(page.locator('[data-evidence-sheet]').getByText(task.logicalPath, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-source-desktop.png' });
  await page.keyboard.press('Escape');
  await page.locator('a[href="/research-objects/journey-ro/versions?version=newer"]').click();
  await expect(page.getByText('Newer result', { exact: true })).toBeVisible();
  await expect(page.getByText('Exact original quotation', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-evidence-sheet]')).toHaveCount(0);
  await page.locator('[data-version-claim-reader="newer"] [data-claim-narrative] > summary').click();
  await expect(page.getByText('This version has no published structured claims yet.', { exact: true })).toBeVisible();
});

test('original evidence is completely visible on a narrow Chinese surface', async ({ page }) => {
  await versionEvidenceFixtures(page);
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  const quotation = '选定版本的论文原文。';
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record/evidence/evidence/source', route => route.fulfill({ json: { source: { text: quotation, page: 3, region: null } } }));
  await page.goto('/research-objects/journey-ro/versions?version=confirmed-version');
  await openVersionEvidence(page, 'zh');
  const sheet = page.locator('[data-evidence-sheet]');
  await expect(sheet).toBeInViewport({ ratio: 1 });
  await expect(sheet.getByText(quotation, { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(sheet.getByText(task.logicalPath, { exact: true })).toBeVisible();
  await expect(sheet.locator('dd').filter({ hasText: /^3$/ })).toBeVisible();
  await expect(sheet.locator('[data-source-region]')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: '关闭', exact: true })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-source-mobile-zh.png' });
});

test('late original evidence response cannot reopen the previous version after browser Back', async ({ page }) => {
  await versionEvidenceFixtures(page);
  let releaseSource!: () => void;
  let sourceRequested!: () => void;
  let sourceFinished!: () => void;
  let handlerStarted = false;
  const sourceGate = new Promise<void>(resolve => { releaseSource = resolve; });
  const requested = new Promise<void>(resolve => { sourceRequested = resolve; });
  const finished = new Promise<void>(resolve => { sourceFinished = resolve; });
  const sourcePath = '/api/research-objects/journey-ro/versions/confirmed-version/record/evidence/evidence/source';
  type Termination = { kind: 'finished' | 'failed'; request: Request };
  let reportTermination!: (outcome: Termination) => void;
  const terminated = new Promise<Termination>(resolve => { reportTermination = resolve; });
  const matchesSource = (request: Request) => request.method() === 'GET' && new URL(request.url()).pathname === sourcePath;
  const onFinished = (request: Request) => { if (matchesSource(request)) reportTermination({ kind: 'finished', request }); };
  const onFailed = (request: Request) => { if (matchesSource(request)) reportTermination({ kind: 'failed', request }); };
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFailed);
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record/evidence/evidence/source', async route => {
    handlerStarted = true;
    sourceRequested();
    try {
      await sourceGate;
      await route.fulfill({ json: { source: { text: 'Late old-version quotation', page: 3, region: null } } });
    } finally { sourceFinished(); }
  });
  try {
    await page.goto('/research-objects/journey-ro/versions?version=newer');
    await expect(page.getByText('Newer result', { exact: true })).toBeVisible();
    await page.locator('a[href="/research-objects/journey-ro/versions?version=confirmed-version"]').click();
    await openVersionEvidence(page);
    await requested;
    await expect(page.locator('[data-evidence-sheet]')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/versions\?version=newer$/);
    await expect(page.getByText('Newer result', { exact: true })).toBeVisible();
    releaseSource();
    const outcome = await terminated;
    expect(outcome.kind).toBe('failed');
    expect(outcome.request.failure()?.errorText).toMatch(/aborted/i);
    await expect(page.getByText('Late old-version quotation', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-evidence-sheet]')).toHaveCount(0);
    await expect(page.locator('[data-version-claim-reader]')).toHaveAttribute('data-version-claim-reader', 'newer');
  } finally {
    releaseSource();
    page.off('requestfinished', onFinished);
    page.off('requestfailed', onFailed);
    if (handlerStarted) await finished;
  }
});

test('confirmed review restores the saved user revision and exposes its exact version after refresh', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/research-objects/journey-ro/ingestion', route => route.fulfill({ json: { researchObjectId: ro.id, version: 9, tasks: [{ ...task, state: 'confirmed', confirmation }], latestConfirmation: confirmation } }));
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ json: { researchObjectId: ro.id, version: 9, task: { ...task, state: 'confirmed', result: { core } } } }));
  await page.route('**/api/versions/confirmed-version', route => route.fulfill({ json: { version: { versionId: 'confirmed-version', snapshot: { core: { ...core, problem: 'Saved human revision', results: '' }, artifacts: [] } } } }));
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('textarea').first()).toHaveValue('Saved human revision');
  await page.reload();
  await expect(page.locator('textarea[readonly]').first()).toHaveValue('Saved human revision');
  await expect(page.getByRole('link', { name: 'View versions', exact: true })).toHaveAttribute('href', '/research-objects/journey-ro/versions?version=confirmed-version');
});

test('selected version is readable on a narrow Chinese surface and unknown versions do not fall back', async ({ page }) => {
  await fixtures(page);
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ ...confirmation, status: 'draft', createdAt: '2026-10-08T00:00:00.000Z', commitMessage: '文献来源快照' }] } }));
  await page.goto('/research-objects/journey-ro/versions?version=confirmed-version');
  await expect(page.locator('[data-selected-version="confirmed-version"]').getByRole('heading', { name: /文献来源快照$/ })).toBeVisible();
  const narrative = page.locator('[data-version-claim-reader="confirmed-version"] [data-claim-narrative]');
  await expect(narrative).toBeVisible();
  await expect(narrative).not.toHaveAttribute('open', '');
  await narrative.locator(':scope > summary').click();
  await expect(page.getByText('该版本尚未发布结构化主张。', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-mobile-zh.png', fullPage: true });
  await page.goto('/research-objects/journey-ro/versions?version=foreign');
  await expect(page.getByText('当前研究中没有这个版本。', { exact: true })).toBeVisible();
  await expect(page.locator('[data-selected-version]')).toHaveCount(0);
});

test('empty research intake stays inactive without putting Hermes into a failed state', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/workspaces', route => route.fulfill({ json: { workspaces: [{ id: 'workspace-journey', name: 'Research workspace', role: 'owner' }] } }));
  await page.goto('/research-objects/new?mode=import');
  await expect(page.getByRole('heading', { name: 'New research', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start research', exact: true })).toBeDisabled();
  await page.getByText('Workspace and title', { exact: true }).click();
  await page.locator('input[name="title"]').fill('Private title-only study');
  await expect(page.getByRole('button', { name: 'Start research', exact: true })).toBeEnabled();
  await expect(page.locator('[data-hermes-state="failed"]')).toHaveCount(0);
  await expect(page.locator('[data-hermes-workspace-stage]')).toBeVisible();
});

for (const recoveryPhase of ['initial', 'after-save'] as const) {
  test(`Files ${recoveryPhase} recovery cannot commit an old manifest with a newer revision`, async ({ page }) => {
    await fixtures(page);
    let serverRevision = 1;
    let acceptedWrites = 0;
    let raceStarted = false;
    const requests: Array<{ version: number; artifacts: Array<{ artifactId: string; logicalPath: string }> }> = [];
    const original = { artifactId: 'original', logicalPath: 'paper.pdf' };
    const intervening = { artifactId: 'intervening', logicalPath: 'other-tab.pdf' };
    let serverArtifacts = [original];
    const snapshots = new Map<string, typeof serverArtifacts>();
    await page.route('**/api/research-objects/journey-ro', async route => {
      // With the former Promise.all, the manifest read advances the server revision
      // before this delayed response samples it, producing a dangerously valid CAS.
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({ json: { researchObject: { ...ro, version: serverRevision, sdf: { core } } } });
    });
    await page.route('**/api/research-objects/journey-ro/versions', async route => {
      const id = `race-v${serverRevision}`;
      snapshots.set(id, [...serverArtifacts]);
      if (!raceStarted && (recoveryPhase === 'initial' || acceptedWrites === 1)) {
        raceStarted = true;
        serverRevision++;
        serverArtifacts = [...serverArtifacts, intervening];
      }
      await route.fulfill({ json: { versions: [{ versionId: id, versionNo: 1, status: 'draft' }] } });
    });
    await page.route('**/api/versions/race-*', route => route.fulfill({ json: { version: { versionId: new URL(route.request().url()).pathname.split('/').pop(), snapshot: { core, artifacts: snapshots.get(new URL(route.request().url()).pathname.split('/').pop()!) } } } }));
    await page.route('**/api/csrf-token', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }));
    let uploadNumber = 0;
    await page.route('**/api/artifacts/upload', route => route.fulfill({ json: { artifact: { artifactId: `added-${++uploadNumber}` } } }));
    await page.route('**/api/research-objects/journey-ro/commits', async route => {
      const input = route.request().postDataJSON();
      requests.push(input);
      if (input.version !== serverRevision) return route.fulfill({ status: 409, json: { error: { code: 'CONCURRENT_UPDATE', message: 'Research changed. Reload before attaching.' } } });
      acceptedWrites++;
      serverRevision++;
      serverArtifacts = input.artifacts;
      await route.fulfill({ json: { commit: { versionId: 'accepted' } } });
    });
    await page.goto('/research-objects/journey-ro/files');
    await expect(page.locator('a[href="/api/artifacts/original/download"]')).toBeVisible();
    if (recoveryPhase === 'after-save') {
      await page.getByTestId('artifact-input').setInputFiles({ name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('first') });
      await page.getByRole('button', { name: 'Save materials to draft', exact: true }).click();
      await expect(page.locator('a[href="/api/artifacts/added-1/download"]')).toBeVisible();
    }
    await page.getByTestId('artifact-input').setInputFiles({ name: 'last.txt', mimeType: 'text/plain', buffer: Buffer.from('last') });
    await page.getByRole('button', { name: 'Save materials to draft', exact: true }).click();
    await expect.poll(() => requests.length).toBe(recoveryPhase === 'initial' ? 1 : 2);
    expect(serverArtifacts).toContainEqual(intervening);
    expect(requests.at(-1)?.version).toBe(serverRevision - 1);
    expect(acceptedWrites).toBe(recoveryPhase === 'initial' ? 0 : 1);
    await expect(page.locator('main').getByRole('alert')).toHaveText('Research changed. Reload before attaching.');
  });
}

test('failed confirmed snapshot shows a retryable load error without empty saved fields', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/research-objects/journey-ro/ingestion', route => route.fulfill({ json: { researchObjectId: ro.id, version: 9, tasks: [{ ...task, state: 'confirmed', confirmation }], latestConfirmation: confirmation } }));
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ json: { researchObjectId: ro.id, version: 9, task: { ...task, state: 'confirmed', result: { core } } } }));
  let fails = true;
  await page.route('**/api/versions/confirmed-version', route => fails
    ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Storage unavailable' } } })
    : route.fulfill({ json: { version: { versionId: 'confirmed-version', snapshot: { core: { ...core, problem: 'Actual saved contents' }, artifacts: [] } } } }));
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('main').getByRole('alert')).toHaveText('The saved confirmation snapshot could not be loaded. Retry to view its contents.');
  await expect(page.getByText('Confirmed and recorded in a new version.', { exact: true })).toHaveCount(0);
  fails = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('textarea[readonly]').first()).toHaveValue('Actual saved contents');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});
