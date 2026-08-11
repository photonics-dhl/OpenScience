/* global document, fetch, process, setTimeout */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.OPTICAL_LAB_PORT ?? 3062);
const serverMode = process.env.OPTICAL_LAB_SERVER_MODE === 'start' ? 'start' : 'dev';
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn(process.execPath, [nextCli, serverMode, '-p', String(port)], {
  cwd: webRoot,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk.toString(); });
server.stderr.on('data', (chunk) => { logs += chunk.toString(); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Optical Lab browser server did not start.\n${logs.slice(-4_000)}`);
  const currentCapture = path.join(webRoot, 'public', 'optical-lab', 'current-production.png');
  if (!existsSync(currentCapture)) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.screenshot({ path: currentCapture });
    await browser.close();
  }
  process.env.VISUAL_BASE_URL = baseUrl;
  await import('./optical-lab-shots.mjs');
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
}
