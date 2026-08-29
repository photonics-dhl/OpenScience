import { expect, test, type Page } from 'playwright/test';
import { mkdir } from 'node:fs/promises';

const route = '/research/OSR-DEMO-000001/v/1';
const outDir = 'test/visual/out/claim-first-public-ro';

async function capture(page: Page, name: string) {
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true, animations: 'disabled' });
}

async function openPublishedRo(page: Page) {
  await page.route('**/api/reading-preferences', (request) => request.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SESSION_INVALID', message: 'Anonymous fixture' } }),
  }));
  await page.route('**/api/research/OSR-DEMO-000001/v/1/evidence/*/source', (request) => request.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      text: 'The fitted transfer time is 78 ± 9 fs.',
      page: 4,
      region: { x: 0.1, y: 0.2, width: 0.8, height: 0.08 },
      locator: { page: 4, boundingBox: { x: 60, y: 180, width: 480, height: 72 } },
      artifact: { logicalPath: 'manuscript.pdf', mediaType: 'application/pdf' },
    }),
  }));
  await page.route('**/api/research/OSR-DEMO-000001/v/1/presentation-assets/asset-transfer-map', (request) => request.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

function contrastRatio(foreground: string, background: string): number {
  const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const luminance = (value: string) => channels(value).reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear = normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('desktop keeps the 760/280 folio, complete claim graph and inspectable source', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await openPublishedRo(page);

  await expect(page.locator('[data-claim-id]')).toHaveCount(3);
  await expect(page.locator('[data-evidence-relation]')).toHaveCount(3);
  await expect(page.locator('[data-presentation-label="not-evidence"]')).toBeVisible();
  const geometry = await page.evaluate(() => ({
    column: document.querySelector<HTMLElement>('[data-public-reading-column="true"]')!.getBoundingClientRect().width,
    rail: document.querySelector<HTMLElement>('.pub-reading-sidecar')!.getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(geometry.column).toBeGreaterThanOrEqual(759);
  expect(geometry.column).toBeLessThanOrEqual(761);
  expect(geometry.rail).toBeGreaterThanOrEqual(279);
  expect(geometry.rail).toBeLessThanOrEqual(281);
  expect(geometry.overflow).toBe(0);

  const firstEvidence = page.locator('.pub-evidence-select').first();
  await firstEvidence.focus();
  await firstEvidence.press('Enter');
  await expect(page.locator('[data-evidence-rail="true"]')).toContainText('78 ± 9 fs');
  await expect(page.locator('[data-source-region="normalized"]')).toBeVisible();

  const accessibility = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>('[data-public-reading-column="true"]')!;
    const surface = document.querySelector<HTMLElement>('[data-public-reading-surface="true"]')!;
    const rail = document.querySelector<HTMLElement>('[data-evidence-rail="true"]')!;
    const unnamedButtons = Array.from(document.querySelectorAll('button')).filter((button) =>
      !(button.textContent?.trim() || button.getAttribute('aria-label') || button.getAttribute('title')),
    ).length;
    const hiddenEvidence = Array.from(document.querySelectorAll('[data-evidence-transcript="true"]')).filter((node) =>
      node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || getComputedStyle(node).display === 'none',
    ).length;
    return {
      columnBackground: getComputedStyle(surface).backgroundColor,
      columnColor: getComputedStyle(column).color,
      hiddenEvidence,
      railBackground: getComputedStyle(rail).backgroundColor,
      railColor: getComputedStyle(rail).color,
      unnamedButtons,
    };
  });
  expect(accessibility.unnamedButtons).toBe(0);
  expect(accessibility.hiddenEvidence).toBe(0);
  expect(contrastRatio(accessibility.columnColor, accessibility.columnBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(accessibility.railColor, accessibility.railBackground)).toBeGreaterThanOrEqual(4.5);
  await capture(page, 'desktop-1440x900');
  await context.close();
});

test('768px transition removes the side rail without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await context.newPage();
  await openPublishedRo(page);
  await expect(page.locator('[data-evidence-rail="true"]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await capture(page, 'tablet-768x900');
  await context.close();
});

test('375px sheet traps focus, returns it to Evidence and respects reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('openscience.evidence-default-collapsed', 'true'));
  const page = await context.newPage();
  await openPublishedRo(page);
  const firstTranscript = page.locator('[data-evidence-transcript="true"]').first();
  await expect(firstTranscript).toHaveCSS('max-height', '80px');
  await expect(firstTranscript).toHaveCSS('transition-duration', '0s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  const trigger = page.locator('.pub-evidence-select').first();
  await trigger.focus();
  await trigger.press('Enter');
  const sheet = page.getByRole('dialog', { name: /original evidence inspector|原始证据核验/i });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('78 ± 9 fs');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await capture(page, 'mobile-375x812');
  await context.close();
});

test('print expands every Evidence transcript while hiding deep navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('openscience.evidence-default-collapsed', 'true'));
  const page = await context.newPage();
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  await openPublishedRo(page);
  const printState = await page.evaluate(() => ({
    evidence: Array.from(document.querySelectorAll<HTMLElement>('[data-print-evidence="true"]')).map((node) => ({
      display: getComputedStyle(node).display,
      maxHeight: getComputedStyle(node).maxHeight,
      text: node.textContent,
    })),
    navigation: getComputedStyle(document.querySelector<HTMLElement>('[data-public-deep-navigation="true"]')!).display,
  }));
  expect(printState.evidence).toHaveLength(3);
  expect(printState.evidence.every((item) => item.display !== 'none' && item.maxHeight === 'none')).toBe(true);
  expect(printState.evidence.map((item) => item.text).join(' ')).toContain('Temperature-dependent controls');
  expect(printState.navigation).toBe('none');
  await capture(page, 'print-1200x900');
  await context.close();
});
