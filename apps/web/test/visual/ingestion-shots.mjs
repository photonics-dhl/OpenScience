import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const visualDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(visualDir, '../..');
const repoDir = path.resolve(webDir, '../..');
const outDir = path.join(repoDir, '.playwright-mcp', 'ingestion-foundations');
const baseUrl = process.env.INGESTION_VISUAL_BASE_URL ?? 'http://127.0.0.1:3002';

const viewports = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 375, height: 812, name: 'mobile' },
];

const browser = await chromium.launch({ headless: true });
const screenshotPaths = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await page.goto(`${baseUrl}/_visual/ingestion-foundations`, { waitUntil: 'networkidle' });
    await page.locator('[data-ingestion-foundations-preview]').waitFor();
    const screenshotPath = path.join(
      outDir,
      `${viewport.name}-${viewport.width}x${viewport.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, animations: 'disabled' });
    screenshotPaths.push(screenshotPath);
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${screenshotPaths.join('\n')}\n`);
