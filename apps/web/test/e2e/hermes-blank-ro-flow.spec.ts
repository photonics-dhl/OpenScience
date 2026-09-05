import { expect, test, type Page, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const emptyCore = {
  schemaVersion: '0.1.0',
  problem: '',
  insight: '',
  method: '',
  results: '',
  limitations: '',
  reproducibility: '',
};

async function installBlankRoApi(page: Page, options: { failAfterRetry?: boolean; failFirstTaskPoll?: boolean; failTerminalOnce?: boolean; failRetryResponse?: boolean } = {}) {
  let serverCore = { ...emptyCore };
  let sessionPosts = 0;
  let taskPosts = 0;
  let savePosts = 0;
  let commitPosts = 0;
  let serverVersion = 1;
  let committedBody: Record<string, unknown> | null = null;
  let taskPolls = 0;
  let retryPosts = 0;

  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'blank-user', email: 'blank@example.invalid', displayName: 'Ada', status: 'email_verified', level: 'free',
  }));
  await page.route('**/api/workspaces', (route) => json(route, { workspaces: [{ id: 'workspace-blank', name: 'Ada lab' }] }));
  await page.route('**/api/ingestion?actionable=true*', (route) => json(route, { tasks: [] }));
  await page.route('**/api/agent/tasks?actionable=false&kind=workspace.guide', (route) => json(route, { tasks: [] }));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'blank-csrf' }));
  await page.route('**/api/research-objects', (route) => {
    if (route.request().method() !== 'POST') return json(route, { researchObjects: [] });
    return json(route, { researchObject: { id: 'ro-blank', workspaceId: 'workspace-blank', version: 1 } }, 201);
  });
  await page.route('**/api/research-objects/ro-blank/versions', (route) => json(route, {
    versions: commitPosts > 0 ? [{ versionId: 'version-blank-1', versionNo: 1, message: 'Blank RO guided review' }] : [],
  }));
  await page.route('**/api/research-objects/ro-blank/commits', async (route) => {
    commitPosts += 1;
    committedBody = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { commit: { commitId: 'commit-blank', versionId: 'version-blank-1', versionNo: 1 } }, 201);
  });
  await page.route('**/api/research-objects/ro-blank', (route) => json(route, { researchObject: {
    id: 'ro-blank', workspaceId: 'workspace-blank', title: 'Attosecond optical sampling', visibility: 'private', version: serverVersion,
    sdf: { core: serverCore, nodes: [] },
  } }));
  await page.route('**/api/sdf/ro-blank', (route) => {
    savePosts += 1;
    const body = route.request().postDataJSON() as { core: typeof emptyCore; version: number };
    expect(body.version).toBe(serverVersion);
    serverCore = { ...body.core };
    serverVersion += 1;
    return json(route, { sdf: { core: serverCore } });
  });
  await page.route('**/api/agent/sessions', (route) => {
    sessionPosts += 1;
    return json(route, { session: { id: 'session-blank' } }, 201);
  });
  await page.route('**/api/agent/tasks', (route) => {
    taskPosts += 1;
    return json(route, { task: { id: 'task-blank', sessionId: 'session-blank', kind: 'sdf.extract', status: 'pending', progress: 0, retryCount: 0, result: null, error: null } }, 201);
  });
  await page.route('**/api/agent/tasks/task-blank/retry', (route) => {
    retryPosts += 1;
    if (options.failRetryResponse) return json(route, { error: { code: 'QUEUE_UNAVAILABLE' } }, 503);
    return json(route, { task: { id: 'task-blank', status: 'pending', retryCount: 1 } });
  });
  await page.route('**/api/agent/tasks/task-blank', (route) => {
    taskPolls += 1;
    if (options.failFirstTaskPoll && taskPolls === 1) return json(route, { error: { code: 'TEMPORARY' } }, 503);
    if (options.failTerminalOnce && taskPolls === 1) return json(route, { task: {
      id: 'task-blank', sessionId: 'session-blank', kind: 'sdf.extract', status: 'failed', progress: 100, retryCount: 0, result: null, error: 'provider timeout',
    } });
    if (options.failAfterRetry && retryPosts > 0) return json(route, { task: {
      id: 'task-blank', sessionId: 'session-blank', kind: 'sdf.extract', status: 'failed', progress: 100, retryCount: 1, result: null, error: 'provider timeout after retry',
    } });
    const pending = taskPolls === 1;
    return json(route, { task: {
    id: 'task-blank', sessionId: 'session-blank', kind: 'sdf.extract', status: 'succeeded', progress: 100, retryCount: retryPosts > 0 ? 1 : 0, error: null,
    ...(pending ? { status: 'running', progress: 45, result: null } : { result: {
      core: {
        ...emptyCore,
        problem: 'Determine whether attosecond optical fields can be sampled on chip.',
        insight: 'Field-resolved sampling can connect optical waveforms to nanoscale transport.',
        method: 'Use a researcher-specified pump-probe design with calibrated timing.',
      },
      evidence: {
        problem: { quote: 'Determine whether', locator: 'chars:0-17' },
        insight: { quote: 'Field-resolved sampling', locator: 'chars:18-41' },
        method: { quote: 'researcher-specified pump-probe', locator: 'chars:42-74' },
      },
      needsMoreInformation: ['results'],
    } }),
  } });
  });

  return {
    counts: () => ({ commitPosts, retryPosts, savePosts, sessionPosts, taskPolls, taskPosts }),
    committed: () => committedBody,
    core: () => serverCore,
  };
}

test('blank RO guidance writes only reviewed fields and preserves missing results through commit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installBlankRoApi(page);
  await page.goto(`${baseUrl}/research-objects/new?mode=blank&hermes-motion=full`, { waitUntil: 'networkidle' });

  await page.getByRole('combobox', { name: /Workspace|工作空间/ }).selectOption('workspace-blank');
  await page.locator('input[name="title"]').fill('Attosecond optical sampling');
  await page.getByRole('button', { name: /Create research object|创建研究对象/ }).click();
  await expect(page).toHaveURL(/\/research-objects\/ro-blank\/edit/);

  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-problem');
  expect(api.counts()).toEqual({ commitPosts: 0, retryPosts: 0, savePosts: 0, sessionPosts: 0, taskPolls: 0, taskPosts: 0 });

  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  await expect(stage).toHaveAttribute('data-hermes-presentation-state', 'scanning');
  await expect.poll(() => api.counts().taskPolls).toBe(1);
  await page.reload({ waitUntil: 'networkidle' });
  expect(api.counts().taskPosts).toBe(1);
  await expect(page.locator('[data-before-after-proposal]')).toHaveCount(3, { timeout: 5_000 });
  await expect(stage).toHaveAttribute('data-hermes-presentation-state', 'awaiting_approval');
  await expect(page.getByText('Determine whether', { exact: true })).toBeVisible();
  await expect(page.getByText('chars:0-17', { exact: true })).toBeVisible();
  expect(api.counts()).toEqual({ commitPosts: 0, retryPosts: 0, savePosts: 0, sessionPosts: 1, taskPolls: 2, taskPosts: 1 });
  const outline = page.getByRole('navigation', { name: /Outline|大纲/ });
  for (const [index, field] of ['Problem', 'Insight', 'Method', 'Results', 'Limitations', 'Reproducibility'].entries()) {
    await outline.getByRole('button', { name: new RegExp(`0${index + 1} ${field}|0${index + 1}`) }).click();
    await expect(page.getByRole('textbox', { name: new RegExp(field, 'i') })).toHaveValue('');
  }
  await outline.getByRole('button', { name: /01 Problem|01 问题/ }).click();

  const problemProposal = page.locator('[data-before-after-proposal]').filter({ hasText: 'Determine whether' });
  await problemProposal.getByRole('button', { name: /Review changes|审阅变更/ }).click();
  await outline.getByRole('button', { name: /01 Problem|01 问题/ }).click();
  await expect(page.getByRole('textbox', { name: /Problem|问题/ })).toHaveValue('Determine whether attosecond optical fields can be sampled on chip.');
  await page.reload({ waitUntil: 'networkidle' });
  const restoredOutline = page.getByRole('navigation', { name: /Outline|大纲/ });
  await restoredOutline.getByRole('button', { name: /01 Problem|01 问题/ }).click();
  await expect(page.getByRole('textbox', { name: /Problem|问题/ })).toHaveValue('Determine whether attosecond optical fields can be sampled on chip.');
  expect(api.counts().taskPosts).toBe(1);
  await expect(page.locator('[data-before-after-proposal]')).toHaveCount(2);
  await restoredOutline.getByRole('button', { name: /02 Insight|02 洞见/ }).click();

  const insightProposal = page.locator('[data-before-after-proposal]').filter({ hasText: 'Field-resolved sampling' });
  await insightProposal.getByRole('button', { name: /Edit suggestion|编辑建议/ }).click();
  await insightProposal.getByRole('textbox').fill('Researcher-edited insight bounded by the proposed experiment.');
  await page.getByRole('button', { name: /Apply edited change|应用已编辑内容/ }).click();
  await outline.getByRole('button', { name: /02 Insight|02 洞见/ }).click();
  await expect(page.getByRole('textbox', { name: /Insight|洞见/ })).toHaveValue('Researcher-edited insight bounded by the proposed experiment.');

  const methodProposal = page.locator('[data-before-after-proposal]').filter({ hasText: 'researcher-specified pump-probe' });
  await methodProposal.getByRole('button', { name: /Dismiss|忽略建议/ }).click();
  await outline.getByRole('button', { name: /03 Method|03 方法/ }).click();
  await expect(page.getByRole('textbox', { name: /Method|方法/ })).toHaveValue('');

  await outline.getByRole('button', { name: /04 Results|04 结果/ }).click();
  const missingResults = page.locator('[data-missing-evidence="results"]');
  await expect(missingResults).toContainText(/no result evidence|没有结果证据/i);
  await expect(page.getByRole('textbox', { name: /Results|结果/ })).toHaveValue('');
  await missingResults.getByRole('button', { name: /Acknowledge and continue|知悉并继续/ }).click();

  await page.getByRole('button', { name: /Save to SDF|保存到 SDF/ }).click();
  await expect.poll(() => api.counts().savePosts).toBe(1);
  expect(api.core()).toMatchObject({
    problem: 'Determine whether attosecond optical fields can be sampled on chip.',
    insight: 'Researcher-edited insight bounded by the proposed experiment.',
    method: '',
    results: '',
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: /Problem|问题/ })).toHaveValue(api.core().problem);
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /02 Insight|02 洞见/ }).click();
  await expect(page.getByRole('textbox', { name: /Insight|洞见/ })).toHaveValue(api.core().insight);
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /04 Results|04 结果/ }).click();
  await expect(page.getByRole('textbox', { name: /Results|结果/ })).toHaveValue('');

  await page.getByRole('textbox', { name: /Commit message|提交说明/ }).fill('Blank RO guided review');
  await page.getByRole('button', { name: /Create commit|创建提交/ }).click();
  await expect.poll(() => api.counts().commitPosts).toBe(1);
  expect(api.committed()).toMatchObject({ message: 'Blank RO guided review', sdfCore: api.core(), version: 2 });
  expect(api.counts().taskPosts).toBe(1);
});

test('a retry dispatch response failure resumes polling the same durable task', async ({ page }) => {
  const api = await installBlankRoApi(page, { failTerminalOnce: true, failRetryResponse: true });
  await page.goto(`${baseUrl}/research-objects/ro-blank/edit?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage]');
  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  await expect(page.getByText('provider timeout')).toBeVisible();
  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  await expect(page.locator('[data-before-after-proposal]')).toHaveCount(3, { timeout: 5_000 });
  expect(api.counts().retryPosts).toBe(1);
  expect(api.counts().sessionPosts).toBe(1);
  expect(api.counts().taskPosts).toBe(1);
});

test('an exhausted extractor retry never creates or dispatches another paid task', async ({ page }) => {
  const api = await installBlankRoApi(page, { failTerminalOnce: true, failAfterRetry: true });
  await page.goto(`${baseUrl}/research-objects/ro-blank/edit?hermes-motion=full`, { waitUntil: 'networkidle' });
  const draft = page.locator('[data-hermes-workspace-stage]').getByRole('button', { name: /Draft|草拟/ });
  await draft.click();
  await expect(page.getByText('provider timeout')).toBeVisible();
  await draft.click();
  await expect(page.getByText('provider timeout after retry')).toBeVisible();
  await draft.click();
  await expect.poll(() => api.counts().taskPolls).toBeGreaterThanOrEqual(3);
  expect(api.counts().retryPosts).toBe(1);
  expect(api.counts().sessionPosts).toBe(1);
  expect(api.counts().taskPosts).toBe(1);
});

test('storage denial and an ambiguous poll failure resume the same paid extractor task', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('openscience:extract-review:')) throw new DOMException('blocked', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const api = await installBlankRoApi(page, { failFirstTaskPoll: true });
  await page.goto(`${baseUrl}/research-objects/ro-blank/edit?hermes-motion=full`, { waitUntil: 'networkidle' });
  const stage = page.locator('[data-hermes-workspace-stage]');
  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  await expect.poll(() => api.counts().taskPolls).toBe(1);
  await expect(page.getByText(/TEMPORARY|503/)).toBeVisible();
  await stage.getByRole('button', { name: /Draft|草拟/ }).click();
  await expect(page.locator('[data-before-after-proposal]')).toHaveCount(3, { timeout: 5_000 });
  expect(api.counts().sessionPosts).toBe(1);
  expect(api.counts().taskPosts).toBe(1);
});
