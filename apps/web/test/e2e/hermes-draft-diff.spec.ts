import { expect, test, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const originalCore = {
  schemaVersion: '0.1.0',
  problem: 'Original research problem',
  insight: 'Original insight',
  method: 'Original method',
  results: 'Original results',
  limitations: 'Original limitations',
  reproducibility: 'Original reproducibility note',
};

test('Hermes draft is single-flight and writes only an explicitly accepted diff', async ({ page }) => {
  let sessionPosts = 0;
  let taskPosts = 0;
  await page.route('**/api/research-objects/ro-diff/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-diff', (route) => json(route, {
    researchObject: {
      id: 'ro-diff', workspaceId: 'workspace-diff', title: 'Diff safety', status: 'draft', visibility: 'private', version: 1,
      createdAt: '2026-08-17T00:00:00.000Z', sdf: { core: originalCore, nodes: [] },
    },
  }));
  await page.route('**/api/csrf-token', (route) => json(route, { csrfToken: 'diff-token' }));
  await page.route('**/api/agent/sessions', (route) => {
    sessionPosts += 1;
    return json(route, { session: { id: 'session-diff' } }, 201);
  });
  await page.route('**/api/agent/tasks', (route) => {
    taskPosts += 1;
    return json(route, { task: { id: 'task-diff', status: 'pending', progress: 0 } }, 201);
  });
  await page.route('**/api/agent/tasks/task-diff', (route) => json(route, {
    task: {
      id: 'task-diff', status: 'succeeded', progress: 100, error: null,
      result: { core: { ...originalCore, problem: 'Hermes proposed problem', results: 'Hermes proposed results' } },
    },
  }));

  await page.goto(`${baseUrl}/research-objects/ro-diff/edit`, { waitUntil: 'networkidle' });
  const problem = page.getByRole('textbox', { name: /Problem|问题/ });
  const before = await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value));

  const draft = page.getByRole('button', { name: /Draft|草拟/ });
  await expect(draft).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hermes:guide-action', { detail: { action: 'draft', target: 'sdf-problem' } }));
    window.dispatchEvent(new CustomEvent('hermes:guide-action', { detail: { action: 'draft', target: 'sdf-problem' } }));
  });
  await expect(page.locator('[data-before-after-proposal]')).toHaveCount(2, { timeout: 5_000 });

  expect(sessionPosts).toBe(1);
  expect(taskPosts).toBe(1);
  expect(await page.locator('textarea').evaluateAll((nodes) => nodes.map((node) => (node as HTMLTextAreaElement).value))).toEqual(before);

  await page.locator('[data-before-after-proposal]').filter({ hasText: 'Hermes proposed problem' }).getByRole('button', { name: /Review changes|审阅变更/ }).click();
  await expect(problem).toHaveValue('Hermes proposed problem');
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /04 Results|04 结果/, exact: true }).click();
  const results = page.getByRole('textbox', { name: /Results|结果/ });
  await expect(results).toHaveValue(originalCore.results);
});
