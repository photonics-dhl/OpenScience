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
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const parseColor = (value) => {
    if (!colorContext) return { r: 0, g: 0, b: 0, a: 1 };
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = value;
    colorContext.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: alpha / 255 };
  };
  const composite = (foreground, background) => {
    const alpha = foreground.a + background.a * (1 - foreground.a);
    if (alpha === 0) return { r: 255, g: 255, b: 255, a: 1 };
    return {
      r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
      g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
      b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
      a: alpha,
    };
  };
  const renderedBackground = (node) => {
    const chain = [];
    for (let current = node; current; current = current.parentElement) chain.unshift(current);
    return chain.reduce((background, current) => composite(parseColor(getComputedStyle(current).backgroundColor), background), { r: 255, g: 255, b: 255, a: 1 });
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    };
    return .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
  };
  const contrastRatio = (foreground, background) => {
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
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
  const verticallyClipped = [...controls, ...document.querySelectorAll('[data-reading-role]')]
    .filter(visible)
    .flatMap((node) => node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1 ? [describe(node)] : []);
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
  const contrastTargets = [...document.querySelectorAll('body *')]
    .filter((node) => visible(node)
      && !node.closest('[aria-hidden="true"], [data-accepted-optical-surface]') && (
      [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim())
      || ['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)
    ));
  const contrastFailures = contrastTargets.flatMap((node) => {
    const tag = node.tagName;
    const placeholder = (tag === 'INPUT' || tag === 'TEXTAREA') && !node.value && node.getAttribute('placeholder');
    const style = getComputedStyle(node, placeholder ? '::placeholder' : null);
    const background = renderedBackground(node);
    const foreground = composite(parseColor(style.color), background);
    const ratio = contrastRatio(foreground, background);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const minimum = node.matches(':disabled,[aria-disabled="true"]') ? 3 : large ? 3 : 4.5;
    return ratio + .01 < minimum ? [`${describe(node)}=${ratio.toFixed(2)}<${minimum}`] : [];
  });
  return { clippedControls, contrastFailures, microtype, semanticMinimums, undersizedControls, unnamedControls, verticallyClipped };
}

async function auditKeyboardFocus(page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const failures = [];
  const focusableCount = await page.locator('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').count();
  let firstFocused = null;
  for (let index = 0; index < focusableCount + 2; index += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node || node === document.body) return null;
      const candidates = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        key: `${candidates.indexOf(node)}:${node.tagName}:${node.id}`,
        visible: rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none',
        indicator: (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none',
      };
    });
    if (!focus) break;
    if (firstFocused === null) firstFocused = focus.key;
    else if (focus.key === firstFocused) break;
    if (focus.visible && !focus.indicator) failures.push(focus.key);
  }
  return failures;
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
      const focusFailures = await auditKeyboardFocus(page);
      const count = Object.values(audit).reduce((sum, values) => sum + values.length, 0) + focusFailures.length;
      if (count > 0) failures.push({ route, viewport: viewport.width, ...audit, focusFailures });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) throw new Error(`Workspace readability gate failed:\n${JSON.stringify(failures, null, 2)}`);
console.log(`Workspace readability gate passed ${routes.length * viewports.length} route/view combinations.`);
