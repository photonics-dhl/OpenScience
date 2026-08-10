/* global document, process */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('test/visual/out');
const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const cases = [
  { symbol: 'a', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 1440, height: 900, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 1920, height: 1080, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 1920, height: 1080, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 390, height: 844, reducedMotion: 'no-preference' },
  { symbol: 'b', width: 390, height: 844, reducedMotion: 'no-preference' },
  { symbol: 'a', width: 1440, height: 900, reducedMotion: 'reduce' },
  { symbol: 'b', width: 1440, height: 900, reducedMotion: 'reduce' },
];

for (const testCase of cases) {
  const page = await browser.newPage({
    viewport: { width: testCase.width, height: testCase.height },
    deviceScaleFactor: 2,
    reducedMotion: testCase.reducedMotion,
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  if (testCase.reducedMotion === 'no-preference') {
    const x = testCase.symbol === 'a' ? testCase.width * 0.36 : testCase.width * 0.68;
    const y = testCase.height * 0.48;
    await page.mouse.move(x, y);
    await page.waitForTimeout(160);
  }
  await page.screenshot({
    path: path.join(outDir, `${testCase.symbol}-${testCase.width}x${testCase.height}${testCase.reducedMotion === 'reduce' ? '-reduced' : ''}.png`),
  });
  await page.close();
}

await browser.close();
