/* global console, document, getComputedStyle, process */

import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3010';
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const routes = ['/', '/dashboard', '/settings', '/explore', '/research-objects/new?mode=blank', '/research-objects/new?mode=import', '/research-objects/ro-readable/edit', '/research-objects/ro-readable/collab', '/visual-public-reading'];

const researchObject = {
  id: 'ro-readable', workspaceId: 'workspace-readable', title: 'Evidence-bounded coherent transport',
  status: 'draft', visibility: 'private', version: 1,
  sdf: { core: { schemaVersion: '0.1.0', problem: 'Which mechanism bounds coherent transport?', insight: 'Phase-sensitive evidence constrains the candidate mechanism.', method: 'Compare time-resolved spectra with a constrained model.', results: '', limitations: 'No experimental result is available yet.', reproducibility: 'The protocol and environment will be recorded.' }, nodes: [] },
};

async function json(route, body) {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
}

async function installFixtures(page) {
  await page.route('**/api/auth/me', (route) => json(route, { userId: 'readable-user', email: 'reader@example.invalid', displayName: 'Ada Researcher', status: 'email_verified', level: 'free' }));
  await page.route('**/api/workspaces**', (route) => json(route, { workspaces: [{ id: 'workspace-readable', name: 'Coherent Systems Lab', role: 'admin' }] }));
  await page.route('**/api/research-objects?limit=20', (route) => json(route, { researchObjects: [researchObject] }));
  await page.route('**/api/research-objects/ro-readable/versions', (route) => json(route, { versions: [] }));
  await page.route('**/api/research-objects/ro-readable/author-change-info', (route) => json(route, {}));
  await page.route('**/api/research-objects/ro-readable/issues**', (route) => json(route, { issues: [] }));
  await page.route('**/api/research-objects/ro-readable', (route) => json(route, { researchObject }));
  await page.route('**/api/ingestion**', (route) => json(route, { tasks: [] }));
  await page.route('**/api/agent/tasks**', (route) => json(route, { tasks: [] }));
}

function auditPage() {
  const visible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.closest('.sr-only') && !node.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
  };
  const describe = (node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
  const controls = [...document.querySelectorAll('button, a, input, select, textarea, label')].filter(visible);
  const undersizedControls = controls.flatMap((node) => {
    const size = Number.parseFloat(getComputedStyle(node).fontSize);
    return size < 14 ? [`${describe(node)}=${size}px`] : [];
  });
  const unnamedControls = controls.flatMap((node) => {
    const labels = 'labels' in node && node.labels ? node.labels.length : 0;
    const name = node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.getAttribute('placeholder') ?? node.textContent ?? '';
    return labels === 0 && !name.trim() ? [describe(node)] : [];
  });
  const clippedControls = controls.flatMap((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1 ? [describe(node)] : []);
  const microtype = [...document.querySelectorAll('body *')].filter((node) => visible(node) && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim())).flatMap((node) => {
    const size = Number.parseFloat(getComputedStyle(node).fontSize);
    const caption = node.closest('[data-reading-role="caption"]');
    return size < 12 && !caption ? [`${describe(node)}=${size}px`] : [];
  });
  const semanticMinimums = [...document.querySelectorAll('[data-reading-role]')].filter(visible).flatMap((node) => {
    const role = node.getAttribute('data-reading-role');
    const minimum = role === 'reading' ? 17 : role === 'body' ? 15 : role === 'control' ? 14 : 12;
    const size = Number.parseFloat(getComputedStyle(node).fontSize);
    return size < minimum ? [`${role}:${describe(node)}=${size}px<${minimum}px`] : [];
  });
  return { clippedControls, microtype, semanticMinimums, undersizedControls, unnamedControls };
}

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await installFixtures(page);
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const audit = await page.evaluate(auditPage);
      const count = Object.values(audit).reduce((sum, values) => sum + values.length, 0);
      if (count > 0) failures.push({ route, viewport: viewport.width, ...audit });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) throw new Error(`Workspace readability gate failed:\n${JSON.stringify(failures, null, 2)}`);
console.log(`Workspace readability gate passed ${routes.length * viewports.length} route/view combinations.`);
