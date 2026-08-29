import { expect, test, type Route } from 'playwright/test';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3010';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const originalCore = {
  schemaVersion: '0.1.0',
  problem: 'Original research problem',
  insight: 'Original insight',
  method: 'Original method',
  results: '',
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
      result: {
        core: { ...originalCore, problem: 'Hermes proposed problem', insight: 'Hermes proposed insight' },
        needsMoreInformation: ['results', 'limitations'],
      },
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

  const problemProposal = page.locator('[data-before-after-proposal]').filter({ hasText: 'Hermes proposed problem' });
  await problemProposal.getByRole('button', { name: /Edit suggestion|编辑建议/ }).click();
  await problemProposal.getByRole('textbox').fill('Researcher-edited problem');
  await page.getByRole('button', { name: /Apply edited change|应用已编辑内容/ }).click();
  const stage = page.locator('[data-hermes-workspace-stage]');
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-insight');
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /01 Problem|01 问题/, exact: true }).click();
  await expect(problem).toHaveValue('Researcher-edited problem');
  await page.locator('[data-before-after-proposal]').filter({ hasText: 'Hermes proposed insight' }).getByRole('button', { name: /Dismiss|忽略建议/ }).click();
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-results');
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /02 Insight|02 洞见/, exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Insight|洞见/ })).toHaveValue(originalCore.insight);
  await page.getByRole('navigation', { name: /Outline|大纲/ }).getByRole('button', { name: /04 Results|04 结果/, exact: true }).click();
  const results = page.getByRole('textbox', { name: /Results|结果/ });
  const resultsNotice = page.locator('[data-missing-evidence="results"]');
  await expect(resultsNotice).toContainText(/no result evidence|没有结果证据/i);
  await expect(results).toHaveValue(originalCore.results);
  await resultsNotice.getByRole('button', { name: /Acknowledge and continue|知悉并继续/ }).click();
  await expect(stage).toHaveAttribute('data-hermes-guide-target', 'sdf-limitations');
});
