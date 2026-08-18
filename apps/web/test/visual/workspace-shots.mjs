/* global document, process */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3016';
const outDir = path.resolve('test/visual/out');
await mkdir(outDir, { recursive: true });

const researchObject = {
  id: 'ro-optical-editorial-test',
  workspaceId: 'workspace-test',
  title: 'Ultrafast carrier dynamics in layered semiconductors',
  status: 'draft',
  visibility: 'private',
  version: 4,
  createdAt: '2026-08-10T00:00:00.000Z',
  sdf: {
    core: {
      schemaVersion: '0.1.0',
      problem: 'How does interlayer coupling change sub-100 fs carrier relaxation?',
      insight: 'The relaxation channel changes when coherent coupling exceeds phonon scattering.',
      method: 'Time-resolved photoemission measurements were compared with a constrained kinetic model.',
      results: 'A 43 fs transfer component appears only in the strongly coupled specimen.',
      limitations: 'The present model does not resolve lateral disorder below the probe diameter.',
      reproducibility: 'Raw spectra, fitting notebooks, and environment manifests are linked as artifacts.',
    },
    nodes: [],
  },
};

const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/research-objects/ro-optical-editorial-test/versions', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ versions: [
      { versionId: 'version-4', versionNo: 4, status: 'draft' },
      { versionId: 'version-3', versionNo: 3, status: 'published' },
    ] }),
  }));
  await page.route('**/api/research-objects/ro-optical-editorial-test', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ researchObject }),
  }));
  await page.route('**/api/csrf-token', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ csrfToken: 'visual-fixture-token' }),
  }));
  await page.route('**/api/agent/sessions', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ session: { id: 'session-visual' } }),
  }));
  await page.route('**/api/agent/tasks', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ task: { id: 'task-visual', status: 'pending', progress: 0 } }),
  }));
  await page.route('**/api/agent/tasks/task-visual', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      task: {
        id: 'task-visual',
        status: 'succeeded',
        progress: 100,
        error: null,
        result: {
          core: {
            ...researchObject.sdf.core,
            results: 'The fitted transfer lifetime is 43 ± 6 fs in the strongly coupled specimen.',
            limitations: 'The model does not yet separate lateral disorder from probe-volume averaging.',
          },
        },
      },
    }),
  }));
  await page.goto(`${baseUrl}/research-objects/ro-optical-editorial-test/edit`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  if (viewport.width < 1024) {
    await page.locator('[data-mobile-workspace-navigation="true"] button').nth(2).click();
  }
  await page.locator('[data-extract-sdf="true"]').click();
  await page.locator('[data-before-after-proposal]').first().waitFor({ timeout: 5_000 });
  if (viewport.width < 1024) {
    const mobileTabs = page.locator('[data-mobile-workspace-navigation="true"] button');
    if (await mobileTabs.count() !== 3) throw new Error(`Expected three mobile workspace views at ${viewport.width}`);
    await mobileTabs.nth(0).click();
    if (!await page.getByRole('navigation', { name: /大纲|Outline/ }).count()) throw new Error('Outline view is not reachable');
    await page.locator('#versions').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outDir, `workspace-${viewport.width}x${viewport.height}-outline.png`) });
    await mobileTabs.nth(1).click();
    if (!await page.locator('[data-sdf-node]').count()) throw new Error('SDF view is not reachable');
    await page.locator('#artifacts').waitFor({ state: 'visible' });
    const problem = page.getByRole('textbox', { name: /问题|Problem/ });
    const originalProblem = await problem.inputValue();
    await problem.fill(`${originalProblem} [mobile-state-check]`);
    await mobileTabs.nth(2).click();
    if (!await page.locator('[data-before-after-proposal]').count()) throw new Error('Evidence view is not reachable');
    await page.screenshot({ path: path.join(outDir, `workspace-${viewport.width}x${viewport.height}-evidence.png`) });
    await mobileTabs.nth(1).click();
    if (!((await problem.inputValue()).endsWith('[mobile-state-check]'))) throw new Error('Editor state was lost across mobile work planes');
    await mobileTabs.nth(2).click();
  }
  const highRiskTrigger = page.locator('[data-risk="high"]').getByRole('button', { name: /审阅变更|Review changes/ }).first();
  await highRiskTrigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.keyboard.press('Shift+Tab');
  if (!await dialog.evaluate((node) => node.contains(document.activeElement))) throw new Error('High-risk review focus escaped the dialog');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  const highRiskTriggerHandle = await highRiskTrigger.elementHandle();
  await page.waitForFunction((node) => document.activeElement === node, highRiskTriggerHandle, { timeout: 2_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow !== 0 || errors.length > 0) {
    throw new Error(`Workspace browser gate failed at ${viewport.width}: overflow=${overflow}; errors=${errors.join(' | ')}`);
  }
  await page.screenshot({ path: path.join(outDir, `workspace-${viewport.width}x${viewport.height}.png`) });
  await page.close();
}

await browser.close();
