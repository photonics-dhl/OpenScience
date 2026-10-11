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
    const url = new URL(request.url()), path = url.pathname, method = request.method();
    const researchPath = `/api/research-objects/${ro.id}`;
    if (method === 'POST') {
      expect(['/api/research-objects', `${researchPath}/ingest`, `${researchPath}/hermes-runs`]).toContain(path);
      expect(request.headers()['x-csrf-token']).toBe('fixture-token');
      writes.push({ path, key: request.headers()['idempotency-key'], body: path === `${researchPath}/ingest` ? null : request.postDataJSON() });
      if (path === '/api/research-objects') return route.fulfill({ json: { researchObject: ro } });
      if (path === `${researchPath}/ingest`) return route.fulfill({ json: { batchId: 'batch', tasks: [source] } });
      if (path === `${researchPath}/hermes-runs`) {
        runCreated = true;
        if (loseResponse) { loseResponse = false; return route.abort('failed'); }
        return route.fulfill({ json: { run } });
      }
    }
    expect(method, `Unexpected write ${method} ${url.pathname}`).toBe('GET');
    const get = `${path}${url.search}`;
    if (get === '/api/auth/me') return route.fulfill({ json: { userId: 'owner', email: 'author@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' } });
    if (get === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'fixture-token' } });
    if (get === '/api/workspaces') return route.fulfill({ json: { workspaces: [{ id: 'workspace', name: 'Personal research', role: 'owner' }] } });
    if (get === '/api/research-objects?limit=20') return route.fulfill({ json: { researchObjects: [ro] } });
    if (get === '/api/ingestion?actionable=true' || get === `/api/ingestion?actionable=true&researchObjectId=${ro.id}`)
      return route.fulfill({ json: { tasks: [] } });
    if (get === '/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=personal'
      || get === `/api/agent/tasks?actionable=false&kind=source.retrieve&recovery=true&targetKind=research_object&researchObjectId=${ro.id}`
      || get === '/api/agent/tasks?actionable=false&kind=workspace.guide') return route.fulfill({ json: { tasks: [] } });
    if (get === `/api/ingestion/tasks/${source.id}`) return route.fulfill({ json: { task: { ...source, result: null }, batchId: 'batch', researchObjectId: ro.id, version: ro.version } });
    if (get === `${researchPath}/hermes-runs?ingestionTaskId=${source.id}`) return route.fulfill({ json: { run: runCreated ? run : null } });
    if (get === `${researchPath}/hermes-runs/paper-run`) return route.fulfill({ json: { run } });
    if (get === researchPath) return route.fulfill({ json: { researchObject: { ...ro, sdf: { core: {}, nodes: [] } } } });
    if (get === `${researchPath}/ingestion`) return route.fulfill({ json: { tasks: [source] } });
    if (get === `${researchPath}/versions`) return route.fulfill({ json: { versions: [] } });
    if (get === `${researchPath}/authors`) return route.fulfill({ json: { authors: [] } });
    if (get === `${researchPath}/assets` || get === `${researchPath}/presentation-assets`) return route.fulfill({ json: { assets: [] } });
    throw new Error(`Unexpected API read ${get}`);
  });
  await page.goto('/dashboard');
  const createEntry = page.getByRole('main').getByRole('link', { name: '创建研究', exact: true });
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
