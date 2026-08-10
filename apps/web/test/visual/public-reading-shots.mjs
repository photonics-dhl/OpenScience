/* global document, process, window */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('test/visual/out');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3010';
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  await page.goto(`${baseUrl}/visual-public-reading`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow || errors.length) throw new Error(`Public reading browser gate failed: overflow=${overflow}; errors=${errors.join(' | ')}`);
  await page.screenshot({ path: path.join(outDir, `public-reading-${viewport.width}x${viewport.height}.png`), fullPage: true });
  await page.close();
}

const printPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await printPage.emulateMedia({ media: 'print' });
await printPage.goto(`${baseUrl}/visual-public-reading`, { waitUntil: 'networkidle' });
const printState = await printPage.evaluate(() => ({
  navigation: window.getComputedStyle(document.querySelector('[data-public-deep-navigation="true"]')).display,
  citation: window.getComputedStyle(document.querySelector('[data-print-landmark="citation"]')).display,
  provenance: window.getComputedStyle(document.querySelector('[data-print-landmark="provenance"]')).display,
}));
if (printState.navigation !== 'none' || printState.citation === 'none' || printState.provenance === 'none') throw new Error(`Print gate failed: ${JSON.stringify(printState)}`);
await printPage.screenshot({ path: path.join(outDir, 'public-reading-print.png'), fullPage: true });
await browser.close();
