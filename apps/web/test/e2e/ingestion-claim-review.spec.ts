import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';

const url = 'http://127.0.0.1:3012';
let harness: ChildProcess;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const workspace = path.resolve(__dirname, '../../../..');
  const vitePackage = readdirSync(path.join(workspace, 'node_modules/.pnpm')).find(name => name.startsWith('vite@'))!;
  const output = path.join(workspace, 'apps/web/test/visual/out/ingestion-claim-review'); mkdirSync(output, { recursive: true });
  const log = openSync(path.join(output, 'vite.log'), 'a');
  harness = spawn(process.execPath, [path.join(workspace, 'node_modules/.pnpm', vitePackage, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3012', '--strictPort'], { cwd: path.resolve(__dirname, '../literature-disclosure-harness'), stdio: ['ignore', log, log], windowsHide: true });
  await expect.poll(async () => {
    if (harness.exitCode !== null) throw new Error('Harness exited');
    try { return (await fetch(url)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
});
test.afterAll(async () => { if (harness && harness.exitCode === null) { const stopped = new Promise(resolve => harness.once('exit', resolve)); harness.kill(); await stopped; } });
test.beforeEach(async ({ page }) => { await page.route('**/api/csrf-token', route => route.fulfill({ json: { csrfToken: 'test-only-csrf' } })); });

const preview = (ro = 'ro-a') => ({ taskId: 'task-a', researchObjectId: ro, versionId: 'version-a', commitId: 'commit-a', artifact: { id: 'artifact-a', logicalPath: 'paper.pdf', contentHash: 'a'.repeat(64) }, snapshotToken: 'snapshot-a', suggestions: [{ sourceField: 'insight', originalStatement: 'The sampled optical field', reviewedStatement: 'The sampled optical field', rewritten: false, defaultQuoteAssociation: true, source: { quote: 'Unchanged exact quotation', locator: { page: 2, blockId: 'block-a' } } }] });

test('edits require renewed quote association; an ambiguous submission retries the identical batch', async ({ page }) => {
  const requests: Array<{ key: string | undefined; body: unknown }> = [];
  await page.route('**/api/research-objects/**/ingestion-claim-evidence**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { candidates: [preview()] } });
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    if (requests.length === 1) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'retry' } } });
    return route.fulfill({ status: 201, json: { claims: [{ id: 'claim-a', researchObjectId: 'ro-a', versionId: 'version-a' }], evidence: [] } });
  });
  await page.goto(`${url}/?case=claim-review`);
  await page.getByRole('button', { name: 'Preview confirmed paper analysis', exact: true }).click();
  await page.getByRole('checkbox', { name: /Insight/ }).check();
  const association = page.getByRole('checkbox', { name: /Attach this quotation/ });
  await expect(association).toBeChecked();
  await page.getByLabel('Claim statement', { exact: true }).fill('A revised interpretation');
  await expect(association).not.toBeChecked();
  await expect(page.getByText('Unchanged exact quotation', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm selected claims and candidate evidence', exact: true }).click();
  await expect(page.getByLabel('Claim statement', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry the same batch', exact: true }).click();
  await expect(page.getByTestId('bridge-saved')).toHaveText('claim-a');
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].body).toMatchObject({ selections: [{ statement: 'A revised interpretation', attachSourceQuote: false }] });
  await expect(page.getByTestId('bridge-busy')).toHaveText('false');
});

test('a late preview cannot populate another research object', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const intercepted = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/research-objects/ro-a/**', async route => { started(); await pending; await route.fulfill({ json: { candidates: [preview()] } }).catch(() => undefined); });
  await page.route('**/api/research-objects/ro-b/**', route => route.fulfill({ json: { candidates: [] } }));
  await page.goto(`${url}/?case=claim-review`);
  await page.getByRole('button', { name: 'Preview confirmed paper analysis', exact: true }).click();
  await intercepted;
  await page.getByRole('button', { name: 'switch-target', exact: true }).click();
  release();
  await page.getByRole('button', { name: 'Preview confirmed paper analysis', exact: true }).click();
  await expect(page.getByText(/No confirmed paper analysis matches/)).toBeVisible();
  await expect(page.getByText('Unchanged exact quotation', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Claim statement', { exact: true })).toHaveCount(0);
});

test('stale confirmation requires a new preview and works at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/research-objects/**/ingestion-claim-evidence**', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { candidates: [preview()] } })
    : route.fulfill({ status: 409, json: { error: { code: 'CONCURRENT_UPDATE', message: 'stale' } } }));
  await page.goto(`${url}/?case=claim-review`);
  await page.getByRole('button', { name: 'Preview confirmed paper analysis', exact: true }).click();
  await page.getByRole('checkbox', { name: /Insight/ }).check();
  await page.getByRole('button', { name: 'Confirm selected claims and candidate evidence', exact: true }).click();
  await expect(page.getByText('The saved version or source changed. Reload the preview before confirming.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload preview', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Confirm selected claims and candidate evidence', exact: true })).toBeDisabled();
  await expect(page.getByTestId('bridge-saved')).toBeEmpty();
});

test('multiple source blocks retain separate text and page labels through confirmation', async ({ page }) => {
  const single = preview();
  const first = single.suggestions[0];
  const candidate = { ...single, suggestions: [{ ...first, source: undefined, sources: [first.source, { quote: 'Only within the weak-field limit.', locator: { page: 3, blockId: 'block-b' } }] }] };
  let submitted: unknown;
  await page.route('**/api/research-objects/**/ingestion-claim-evidence**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { candidates: [candidate] } });
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { claims: [{ id: 'claim-a', researchObjectId: 'ro-a', versionId: 'version-a' }], evidence: [] } });
  });
  await page.goto(`${url}/?case=claim-review`);
  await page.getByRole('button', { name: 'Preview confirmed paper analysis', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Source page 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Source page 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Only within the weak-field limit.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /Insight/ }).check();
  await page.getByRole('button', { name: 'Confirm selected claims and candidate evidence', exact: true }).click();
  await expect(page.getByTestId('bridge-saved')).toHaveText('claim-a');
  expect(submitted).toMatchObject({ selections: [{ attachSourceQuote: true }] });
  expect(JSON.stringify(submitted)).not.toContain('block-b');
});
