import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readdirSync, closeSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';

const harnessUrl = 'http://127.0.0.1:3037';
let harness: ChildProcess | undefined;
let log: number | undefined;
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

test.beforeAll(async () => {
  const workspace = path.resolve(__dirname, '../../../..');
  const vitePackage = readdirSync(path.join(workspace, 'node_modules/.pnpm')).find((name) => name.startsWith('vite@'));
  if (!vitePackage) throw new Error('The existing Vite test runtime is unavailable.');
  const output = path.join(workspace, 'tmp/media-retention-check');
  mkdirSync(output, { recursive: true });
  log = openSync(path.join(output, 'harness.log'), 'a');
  harness = spawn(process.execPath, [path.join(workspace, 'node_modules/.pnpm', vitePackage, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3037', '--strictPort'], {
    cwd: path.resolve(__dirname, '../media-retention-harness'), stdio: ['ignore', log, log], windowsHide: true,
  });
  let stopped = false;
  harness.once('exit', () => { stopped = true; });
  await expect.poll(async () => {
    if (stopped) throw new Error('The media test page could not start; see tmp/media-retention-check/harness.log.');
    try { return (await fetch(harnessUrl, { signal: AbortSignal.timeout(1_000) })).ok; } catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
});

test.afterAll(() => { harness?.kill(); if (log !== undefined) closeSync(log); });

test('an owner keeps or deletes the selected published image with recoverable errors and a single pending submission', async ({ page }) => {
  const errors: string[] = [];
  const writes: unknown[] = [];
  let releaseDelete: (() => void) | undefined;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/csrf-token') return route.fulfill({ json: { csrfToken: 'local-fixture-token' } });
    if (pathname === '/api/trash') {
      writes.push(request.postDataJSON());
      expect(request.headers()['x-csrf-token']).toBe('local-fixture-token');
      if (writes.length === 1) return route.fulfill({ status: 409, json: { error: { code: 'CONFLICT', message: 'Refresh the image state and try again.' } } });
      await new Promise<void>((resolve) => { releaseDelete = resolve; });
      return route.fulfill({ status: 201, json: { entry: { id: 'trash-b' } } });
    }
    expect(request.method()).toBe('GET');
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#def"/></svg>' });
  });
  try {
    await page.goto(harnessUrl);
    await expect(page.locator('[data-media-asset-actions="image-a"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve for publication', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next image', exact: true }).click();
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Image B');
    await page.getByRole('button', { name: 'Keep image', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Refresh the image state and try again.');
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash', exact: true }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.getByRole('button', { name: 'Working…', exact: true })).toBeDisabled();
    await expect.poll(() => writes.length).toBe(2);
    releaseDelete?.();
    await expect(page.locator('[data-media-asset-actions="image-b"]')).toHaveCount(0);
    await expect(page.locator('[data-media-asset-actions="image-a"]')).toBeVisible();
    await expect(page.getByText('Moved “Image B” to Trash.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Trash to restore' })).toHaveAttribute('href', '/trash');
    expect(writes).toEqual([{ kind: 'asset', resourceId: 'image-b' }, { kind: 'asset', resourceId: 'image-b' }]);
    expect(errors).toEqual([]);
  } finally { releaseDelete?.(); }
});
