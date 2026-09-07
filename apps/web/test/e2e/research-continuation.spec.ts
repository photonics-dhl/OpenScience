import { expect, test, type Page } from 'playwright/test';

const ro = { id: 'journey-ro', workspaceId: 'workspace-journey', publicId: 'OSR-JOURNEY', title: 'Research continuation', version: 1, status: 'draft', visibility: 'private' };
const core = { schemaVersion: '0.1.0', problem: 'Question', insight: 'Finding', method: 'Measurement', results: 'Result', limitations: 'Limits', reproducibility: 'Data' };
const confirmation = { commitId: 'confirmed-commit', versionId: 'confirmed-version', versionNo: 2, version: 7, evidenceStatus: 'needs_review', missingFields: ['results'] };
const task = { id: 'journey-task', researchObjectId: ro.id, researchTitle: ro.title, logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, artifactId: 'artifact-journey', agentTaskId: null };

async function fixtures(page: Page, tasks = [task]) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/auth/me') body = { userId: 'user-journey', email: 'test@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' };
    else if (path === '/api/research-objects') body = { researchObjects: [ro] };
    else if (path === '/api/ingestion') body = { tasks };
    else if (path === `/api/research-objects/${ro.id}/ingestion`) body = { researchObjectId: ro.id, version: 1, tasks: tasks.map(item => ({ ...item, confirmation: null })), latestConfirmation: null };
    else if (path === '/api/versions/confirmed-version') body = { version: { versionId: 'confirmed-version', snapshot: { core, artifacts: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }] } } };
    else if (path.endsWith('/record')) body = { record: { objectId: ro.id, versionId: path.split('/').at(-2), recordState: 'recorded', sdf: core, manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }], claims: [], evidence: [] } };
    else if (path.endsWith('/claims')) body = { claims: [] };
    else if (path.endsWith('/evidence')) body = { evidence: [] };
    else if (path === '/api/ingestion/tasks/journey-task') body = { researchObjectId: ro.id, batchId: 'batch', version: 1, task: { ...task, result: { core } } };
    else if (path === `/api/research-objects/${ro.id}`) body = { researchObject: { ...ro, sdf: { core, nodes: [] } } };
    else if (path.endsWith('/versions')) body = { versions: [] };
    else if (path.includes('tasks')) body = { tasks: [] };
    else if (path === '/api/workspaces') body = { workspaces: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('dashboard primary continuation opens the actual pending review', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard');
  const continuation = page.locator('[data-continuation-priority="primary"]');
  await expect(continuation.getByRole('link')).toHaveAttribute('href', '/research-objects/journey-ro/hermes?task=journey-task');
  await continuation.getByRole('link').click();
  await expect(page).toHaveURL(/hermes\?task=journey-task$/);
  await expect(page.getByText('paper.pdf', { exact: true })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('Question');
});

test('direct Hermes entry offers current RO tasks rather than a missing parameter error', async ({ page }) => {
  await fixtures(page);
  await page.goto('/research-objects/journey-ro/hermes');
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
  await expect(page.locator('main a[href="/research-objects/journey-ro/edit"]').last()).toBeVisible();
  await expect(page.locator('main a[href="/research-objects/journey-ro/files"]').last()).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/hermes-empty-mobile.png', fullPage: true });
});

test('confirmation writes only on request and keeps a route back into the research', async ({ page }) => {
  await fixtures(page);
  let writes = 0;
  await page.route('**/api/csrf-token', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) }));
  await page.route('**/api/ingestion/journey-task/confirm', async route => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ version: 1, core: { ...core, problem: 'Revised question' } });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task: { ...task, state: 'confirmed' }, sdf: { core: { ...core, problem: 'Revised question' } }, confirmation }) });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await page.locator('textarea').first().fill('Revised question');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Confirm and create version', exact: true }).click();
  await expect(page).toHaveURL(/versions\?version=confirmed-version$/);
  expect(writes).toBe(1);
});

test('the confirmed paper is included in the next commit through the editor', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ versions: [{ versionId: 'previous-version', versionNo: 1, status: 'draft' }] }) }));
  await page.route('**/api/versions/previous-version', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: { versionId: 'previous-version', snapshot: { artifacts: [{ artifactId: 'prior-artifact', logicalPath: 'previous-paper.pdf', blobSha256: 'a'.repeat(64) }, { artifactId: task.artifactId, logicalPath: task.logicalPath }] } } }) }));
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: ro.id, version: 1, task: { ...task, state: 'confirmed', result: { core } } }) }));
  await page.route('**/api/csrf-token', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf' }) }));
  let submitted: unknown;
  await page.route('**/api/research-objects/journey-ro/commits', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ commit: { versionId: 'committed-version' } }) });
  });
  await page.goto('/research-objects/journey-ro/edit');
  await expect(page.getByText('paper.pdf', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Reviewed paper');
  await page.getByRole('button', { name: 'Create commit', exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({ artifacts: [{ artifactId: 'prior-artifact', logicalPath: 'previous-paper.pdf' }, { artifactId: 'artifact-journey', logicalPath: 'paper.pdf' }], sdfCore: core });
});

test('a foreign imported paper cannot be silently attached or committed', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/ingestion/tasks/journey-task', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ researchObjectId: 'foreign-ro', version: 1, task: { ...task, state: 'confirmed', result: { core } } }) }));
  await page.goto('/research-objects/journey-ro/edit?ingestionTask=journey-task');
  await expect(page.locator('main').getByRole('alert')).toContainText('This material has no confirmed version');
  await expect(page.getByRole('button', { name: 'Create commit', exact: true })).toBeDisabled();
  await expect(page.getByText('paper.pdf', { exact: true })).toHaveCount(0);
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
  let writes = 0;
  await page.route('**/api/ingestion/journey-task/confirm', async route => {
    writes++;
    expect(route.request().postDataJSON().core.results).toBe('');
    await route.fulfill({ json: { task: { ...task, state: 'confirmed' }, sdf: { core: { ...core, results: '' } }, confirmation } });
  });
  await page.goto('/research-objects/journey-ro/hermes?task=journey-task');
  await page.locator('textarea').nth(3).fill('');
  await expect(page.getByText('Not provided · pending', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Confirm and create version', exact: true }).click();
  await expect(page.locator('[data-selected-version="confirmed-version"]')).toBeVisible();
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
  await expect(page.locator('a[href="/api/artifacts/original/download"]')).toHaveText('paper.pdf');
  await page.reload();
  await expect(page.locator('a[href="/api/artifacts/original/download"]')).toBeVisible();
  await page.getByTestId('artifact-input').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('controlled fixture') });
  await page.getByRole('button', { name: 'Attach to new version', exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({ version: 1, artifacts: [original, { artifactId: 'added', logicalPath: 'paper.pdf.1' }] });
});

test('selected snapshot and original evidence remain scoped across version switches', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ versionId: 'newer', versionNo: 3, status: 'draft' }, { versionId: 'confirmed-version', versionNo: 2, status: 'draft' }] } }));
  await page.route('**/api/research-objects/journey-ro/versions/newer/record', route => route.fulfill({ json: { record: { objectId: ro.id, versionId: 'newer', recordState: 'recorded', sdf: { ...core, results: 'Newer result' }, manifest: [], claims: [], evidence: [] } } }));
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record', route => route.fulfill({ json: { record: { objectId: ro.id, versionId: 'confirmed-version', recordState: 'recorded', sdf: core, manifest: [{ artifactId: task.artifactId, logicalPath: task.logicalPath }], claims: [{ id: 'claim', statement: 'Claim needing verification', assessment: 'missing' }], evidence: [{ id: 'evidence', claimId: 'claim', artifactId: task.artifactId, kind: 'passage', relation: 'context', title: 'Original passage', locator: { page: 3 }, extractionConfidence: null, verified: false, extractionStatus: 'needs_review' }] } } }));
  await page.route('**/api/research-objects/journey-ro/versions/confirmed-version/record/evidence/evidence/source', route => route.fulfill({ json: { source: { text: 'Exact original quotation', page: 3, region: null } } }));
  await page.goto('/research-objects/journey-ro/versions?version=confirmed-version');
  await expect(page.getByRole('link', { name: 'Research API', exact: true })).toHaveAttribute('href', '/api/research-objects/journey-ro/versions/confirmed-version/record');
  await expect(page.getByRole('link', { name: 'Export fixed record', exact: true })).toHaveAttribute('href', '/api/research-objects/journey-ro/versions/confirmed-version/record/export');
  await expect(page.getByText('Draft revision 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open original passage: Original passage', exact: true }).click();
  await expect(page.getByText('Exact original quotation', { exact: true })).toBeVisible();
  await expect(page.getByText('Region highlighting is unavailable for this source.', { exact: true })).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: /^3$/ })).toBeVisible();
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-source-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Version 3', exact: true }).click();
  await expect(page.getByText('Newer result', { exact: true })).toBeVisible();
  await expect(page.getByText('Exact original quotation', { exact: true })).toHaveCount(0);
  await expect(page.getByText('No verified source location is available. Human review is needed.', { exact: true })).toBeVisible();
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
  await page.route('**/api/research-objects/journey-ro/versions', route => route.fulfill({ json: { versions: [{ ...confirmation, status: 'draft' }] } }));
  await page.goto('/research-objects/journey-ro/versions?version=confirmed-version');
  await expect(page.getByRole('heading', { name: '快照版本 2', exact: true })).toBeVisible();
  await expect(page.getByText('暂无可核查的原文定位，需要人工核查。', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test/visual/out/research-continuation/version-mobile-zh.png', fullPage: true });
  await page.goto('/research-objects/journey-ro/versions?version=foreign');
  await expect(page.locator('main').getByRole('alert')).toHaveText('当前研究中没有这个版本。');
  await expect(page.locator('[data-selected-version]')).toHaveCount(0);
});

test('missing upload form input is separate from Hermes task failure', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/workspaces', route => route.fulfill({ json: { workspaces: [{ id: 'workspace-journey', name: 'Research workspace', role: 'owner' }] } }));
  await page.goto('/research-objects/new?mode=import');
  await page.locator('input[name="title"]').fill('Incomplete intake');
  await page.getByRole('button', { name: 'Create research object', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Choose at least one source file to start an import.');
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
      await page.getByRole('button', { name: 'Attach to new version', exact: true }).click();
      await expect(page.locator('a[href="/api/artifacts/added-1/download"]')).toBeVisible();
    }
    await page.getByTestId('artifact-input').setInputFiles({ name: 'last.txt', mimeType: 'text/plain', buffer: Buffer.from('last') });
    await page.getByRole('button', { name: 'Attach to new version', exact: true }).click();
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
