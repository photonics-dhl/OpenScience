import { expect, test, type Page } from 'playwright/test';

async function setup(page: Page, authenticated = false) {
  const writes: Array<{ path: string; body: { title?: string; sdf?: { core: Record<string, string> } } | null }> = [];
  const core = { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
  const ro = { id: 'researcher-draft', workspaceId: 'workspace', title: 'New research', status: 'draft', visibility: 'private', version: 1, sdf: { core, nodes: [] } };
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://127.0.0.1:3010' }]);
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') writes.push({ path, body: path.endsWith('/ingest') ? null : request.postDataJSON() });
    if (path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated
      ? { userId: 'owner', email: 'author@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' }
      : { error: { code: 'UNAUTHORIZED', message: 'Login required' } } });
    if (path === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'csrf-fixture' } });
    if (path === '/api/workspaces') return route.fulfill({ json: { workspaces: [{ id: 'workspace', name: 'Personal', role: 'owner' }] } });
    if (path === '/api/research-objects') return route.fulfill({ json: request.method() === 'POST' ? { researchObject: ro } : { researchObjects: [] } });
    if (path === '/api/research-objects/researcher-draft') return route.fulfill({ json: { researchObject: ro } });
    if (path.endsWith('/ingest')) return route.fulfill({ json: { batchId: 'batch', tasks: [{ id: 'source', logicalPath: 'paper.pdf', state: 'queued', retryCount: 0 }] } });
    return route.fulfill({ json: { tasks: [], versions: [], assets: [], claims: [], evidence: [], authors: [], notifications: [], researchObjects: [] } });
  });
  return writes;
}

test('public Researchers entry, equal actions and keyboard-accessible service menu', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/who-we-serve/researchers');
  await expect(page.getByRole('heading', { name: 'Researchers', exact: true })).toBeVisible();
  const actions = page.locator('main article a');
  await expect(actions).toHaveCount(4);
  for (const action of await actions.all()) await expect(action).toBeInViewport();
  await page.getByRole('button', { name: '服务对象', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: '科研人员 Researchers', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: '期刊 Journals', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/who-we-serve\/journals$/, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: '浏览期刊目录', exact: true })).toHaveAttribute('href', '/journals');
});

test('mobile cards stay available and anonymous creation preserves its selected mode', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/who-we-serve/researchers');
  await expect(page.locator('main article')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '开始使用：创建预出版成果', exact: true }).click();
  await expect(page).toHaveURL(/auth\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/research-objects/new?type=preprint');
});

for (const query of ['mode=blank', 'type=unknown&mode=blank']) {
  test(`untyped creation keeps the normal intake for ${query}`, async ({ page }) => {
    const writes = await setup(page, true);
    await page.goto(`/research-objects/new?${query}`);
    await expect(page.locator('[data-evidence-dropzone="true"]')).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('textarea')).toBeVisible();
    expect(writes).toHaveLength(0);
  });
}

test('manual preprint creation sends a private six-field draft without any upload or publish request', async ({ page }) => {
  const writes = await setup(page, true);
  await page.goto('/who-we-serve/researchers');
  await page.getByRole('link', { name: '开始使用：创建预出版成果', exact: true }).click();
  await page.getByRole('link', { name: /直接填写六字段/ }).click();
  await expect(page).toHaveURL(/type=preprint&mode=blank$/);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByRole('textbox', { name: '论文标题', exact: true }).fill('New preprint');
  await page.getByRole('button', { name: '建立私有草稿', exact: true }).click();
  await expect(page).toHaveURL(/research-objects\/researcher-draft\/edit$/, { timeout: 20_000 });
  expect(writes.filter(item => item.path === '/api/research-objects')).toHaveLength(1);
  expect(writes[0]?.body).toMatchObject({ title: 'New preprint', sdf: { core: { researchType: 'preprint', problem: '', reproducibility: '' } } });
  expect(writes.some(item => /ingest|publish|hermes-runs/.test(item.path))).toBe(false);
});

test('published entry retains publication details and hands PDF to existing ingestion', async ({ page }) => {
  const writes = await setup(page, true);
  await page.goto('/who-we-serve/researchers');
  await page.getByRole('link', { name: '开始使用：解析已发表论文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '添加已发表论文' })).toBeVisible();
  await page.getByRole('textbox', { name: '论文标题', exact: true }).fill('Published paper');
  await page.getByRole('textbox', { name: '原论文作者', exact: true }).fill('A. Researcher');
  await page.getByRole('textbox', { name: '发表期刊', exact: true }).fill('A Journal');
  await page.getByRole('textbox', { name: '原论文 DOI（可选）', exact: true }).fill('10.1234/paper');
  await page.locator('input[type=file]').setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 controlled UI fixture') });
  await page.getByRole('button', { name: '上传并建立私有草稿', exact: true }).click();
  await expect(page).toHaveURL(/researcher-draft\/edit/, { timeout: 20_000 });
  expect(writes.find(item => item.path === '/api/research-objects')?.body?.sdf?.core).toMatchObject({ researchType: 'published', originalAuthors: 'A. Researcher', originalJournal: 'A Journal', originalDoi: '10.1234/paper' });
  expect(writes.filter(item => item.path.endsWith('/ingest'))).toHaveLength(1);
  expect(writes.some(item => /publish|hermes-runs/.test(item.path))).toBe(false);
});

test('PDF validation explains the error and mode changes stay locked during a write', async ({ page }) => {
  await setup(page, true);
  await page.goto('/research-objects/new?type=preprint');
  await page.getByRole('textbox', { name: '论文标题', exact: true }).fill('Draft');
  await page.locator('input[type=file]').setInputFiles({ name: 'paper.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('wrong format') });
  await expect(page.getByRole('alert').filter({ hasText: '此入口请只选择一份 PDF。' })).toBeVisible();
  await page.getByRole('link', { name: /直接填写六字段/ }).click();
  await expect(page).toHaveURL(/type=preprint&mode=blank$/);
  await expect(page.getByRole('link', { name: /直接填写六字段/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('textbox', { name: '论文标题', exact: true }).fill('Blank draft');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let submissions = 0;
  let submittedCsrfToken: string | undefined;
  await page.route('**/api/research-objects', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    submissions += 1;
    submittedCsrfToken = route.request().headers()['x-csrf-token'];
    await pending;
    await route.fulfill({ json: { researchObject: { id: 'researcher-draft', workspaceId: 'workspace', version: 1 } } });
  });
  try {
    await page.getByRole('button', { name: '建立私有草稿', exact: true }).click();
    const switchMode = page.getByRole('link', { name: /上传 PDF 从论文原文开始/ });
    await expect(switchMode).toHaveAttribute('aria-disabled', 'true');
    // The form locks before CSRF preparation completes; witness the actual POST handler.
    await expect.poll(() => submissions, { timeout: 10_000 }).toBe(1);
    expect(submittedCsrfToken).toBe('csrf-fixture');
    // Keyboard activation must also remain inert while the create request is pending.
    await switchMode.focus();
    await expect(switchMode).toBeFocused();
    await page.keyboard.press('Enter');
    expect(new URL(page.url()).searchParams.get('mode')).toBe('blank');
    expect(submissions).toBe(1);
    release();
    await expect(page).toHaveURL(/\/research-objects\/researcher-draft\/edit$/, { timeout: 20_000 });
    expect(submissions).toBe(1);
  } finally {
    release();
  }
});
