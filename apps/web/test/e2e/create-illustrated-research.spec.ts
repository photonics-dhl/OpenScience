import { expect, test, type Page } from 'playwright/test';

async function setup(page: Page, loseResponse = false) {
  const writes: Array<{ path: string; key?: string; body: any }> = [];
  let runCreated = false;
  const ro = { id: 'created-paper', workspaceId: 'workspace', title: 'paper', status: 'draft', visibility: 'private', version: 1 };
  const source = { id: 'source-pdf', researchObjectId: ro.id, logicalPath: 'paper.pdf', state: 'queued', retryCount: 0, artifactId: 'artifact', agentTaskId: 'analysis', error: null };
  const run = { id: 'paper-run', researchObjectId: ro.id, actorId: 'owner', profile: 'visual-narrative-v1', status: 'ingesting', version: 1, versionId: null, maxAgentTasks: 9, sourceClaimIds: [], error: null, steps: [{ id: 'step', stage: 'source_ingestion', ordinal: 0, status: 'waiting', ingestionTaskId: source.id, error: null }] };
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') writes.push({ path, key: request.headers()['idempotency-key'], body: path.endsWith('/ingest') ? null : request.postDataJSON() });
    if (path === '/api/auth/me') return route.fulfill({ json: { userId: 'owner', email: 'author@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' } });
    if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'fixture-token', token: 'fixture-token' } });
    if (path === '/api/workspaces') return route.fulfill({ json: { workspaces: [{ id: 'workspace', name: 'Personal research', role: 'owner' }] } });
    if (path === '/api/research-objects') return route.fulfill({ json: request.method() === 'POST' ? { researchObject: ro } : { researchObjects: [ro] } });
    if (path.endsWith('/ingest')) return route.fulfill({ json: { batchId: 'batch', tasks: [source] } });
    if (path === `/api/ingestion/tasks/${source.id}`) return route.fulfill({ json: { task: { ...source, result: null } } });
    if (path.endsWith('/hermes-runs')) {
      if (request.method() === 'POST') {
        runCreated = true;
        if (loseResponse) { loseResponse = false; return route.abort('failed'); }
      }
      return route.fulfill({ json: { run: runCreated ? run : null } });
    }
    if (path.endsWith('/hermes-runs/paper-run')) return route.fulfill({ json: { run } });
    if (path === `/api/research-objects/${ro.id}`) return route.fulfill({ json: { researchObject: { ...ro, sdf: { core: {}, nodes: [] } } } });
    if (path.endsWith('/ingestion')) return route.fulfill({ json: { tasks: [source] } });
    if (path.endsWith('/versions')) return route.fulfill({ json: { versions: [] } });
    if (path.endsWith('/assets') || path.endsWith('/presentation-assets')) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ json: { tasks: [], claims: [], evidence: [], user: null } });
  });
  await page.goto('/dashboard');
  const createEntry = page.getByRole('main').locator('a[data-action-priority="primary"]');
  await expect(createEntry).toHaveCount(1);
  await expect(createEntry).toBeVisible();
  await expect(createEntry).toHaveAccessibleName('创建研究');
  await expect(createEntry).toHaveAttribute('href', '/research-objects/new?mode=import');
  await createEntry.click();
  await expect(page).toHaveURL(/research-objects\/new\?mode=import$/);
  return { writes };
}

test('illustrated creation starts once from the visible entry and one PDF', async ({ page }) => {
  const { writes } = await setup(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 controlled fixture') });
  await expect(page.getByRole('checkbox', { name: '同时生成图文解读' })).toBeChecked();
  await page.getByRole('button', { name: '创建并生成图文', exact: true }).click();
  await expect(page).toHaveURL(/\/hermes\?run=paper-run$/);
  const submissions = writes.filter(item => item.path.endsWith('/hermes-runs'));
  expect(submissions).toHaveLength(1);
  expect(submissions[0].body).toMatchObject({ ingestionTaskIds: ['source-pdf'], generation: { profile: 'visual-narrative-v1', maxAgentTasks: 9, style: 'auto' } });
  expect(writes.filter(item => /guide|publish|approval/.test(item.path))).toHaveLength(0);
});

test('illustrated creation recovers a lost committed response without duplicate generation', async ({ page }) => {
  const { writes } = await setup(page, true);
  await page.locator('input[type=file]').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 controlled fixture') });
  await page.getByRole('button', { name: '创建并生成图文', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/hermes\?run=paper-run$/);
  expect(writes.filter(item => item.path.endsWith('/hermes-runs'))).toHaveLength(1);
  expect(writes.filter(item => item.path === '/api/research-objects')).toHaveLength(1);
  expect(writes.filter(item => item.path.endsWith('/ingest'))).toHaveLength(1);
});

test('illustrated creation remains optional and readable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { writes } = await setup(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 controlled fixture') });
  await page.getByRole('checkbox', { name: '同时生成图文解读' }).uncheck();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/edit\?ingestionTask=source-pdf$/);
  expect(writes.filter(item => item.path.endsWith('/hermes-runs'))).toHaveLength(0);
});

test('illustrated creation does not choose a paper silently from multiple files', async ({ page }) => {
  const { writes } = await setup(page);
  await page.locator('input[type=file]').setInputFiles(['first', 'second'].map(name => ({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 controlled fixture') })));
  await expect(page.getByRole('checkbox', { name: '同时生成图文解读' })).toHaveCount(0);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/edit\?ingestionTask=source-pdf$/);
  expect(writes.filter(item => item.path.endsWith('/hermes-runs'))).toHaveLength(0);
});
