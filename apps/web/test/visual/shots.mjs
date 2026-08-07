import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('test/visual/out');
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
  await page.goto(`http://127.0.0.1:3002/?symbol=${testCase.symbol}`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(outDir, `${testCase.symbol}-${testCase.width}x${testCase.height}${testCase.reducedMotion === 'reduce' ? '-reduced' : ''}.png`),
  });
  await page.close();
}

await browser.close();
