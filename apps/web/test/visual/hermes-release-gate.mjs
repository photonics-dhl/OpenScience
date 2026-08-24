/* global URL, fetch, process, setTimeout */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.HERMES_GATE_PORT ?? 3198);
const externalBaseUrl = process.env.WEB_BASE_URL;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const nextBin = new URL('../../node_modules/next/dist/bin/next', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const playwrightBin = fileURLToPath(new URL('../../node_modules/playwright/cli.js', import.meta.url));
const server = externalBaseUrl ? null : spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, API_ORIGIN: 'http://127.0.0.1:1', ENABLE_VISUAL_HARNESS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server?.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-20_000); });
server?.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-20_000); });

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/dashboard`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`Hermes release server did not start:\n${serverOutput}`);
};

const compatibleRuntimeTitles = [
  'Dashboard protects semantic navigation, continuation, import and Hermes task regions',
  'a custom dock flips an unsafe stationary bubble and suppresses it when every bubble variant is blocked',
  'stationary custom guidance observes Extract and proposal obstacles through the shared page-owned contract',
  'Hermes arrives beside the first RO field without covering it',
  'reduced motion retains the guide actions without positional travel or particles',
  'Hermes loading and error surfaces are explicit',
  'Hermes keeps the guide usable when WebGL2 is unavailable',
  'Hermes disposes and restores its mesh when the persistent motion control changes live',
  'Hermes replaces a lost canvas when approval ends live',
  'Hermes releases a fallback WebGL context when WebGL2 initialization fails',
  'Hermes applies offscreen suspension after delayed initialization',
  'Hermes aborts and releases a pending initialization on SPA unmount',
  'Hermes focus and open presence drive real mesh articulation',
  'Hermes remounts a fresh canvas after a live WebGL context loss',
  'Hermes retries with a fresh runtime after the required Cubism model fails',
  'Hermes keeps visible renderer-owned draw heartbeat gaps within 750ms',
  'Hermes resumes polling the same task after a transient failure',
  'route and breakpoint changes adopt the matching stored dock instead of a stale guide origin',
  'field guidance leaves the primary blank-RO create action directly operable',
];

const runPlaywright = (args, env, label) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    playwrightBin,
    ...args,
  ], {
    cwd: webRoot,
    env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}`));
  });
});

const runCompatibleRuntimeE2E = () => runPlaywright([
  'test',
  'test/e2e/hermes-dashboard.spec.ts',
  'test/e2e/hermes-field-guide.spec.ts',
  '--config',
  'playwright.config.ts',
  '--grep',
  compatibleRuntimeTitles.join('|'),
], { ...process.env, WEB_BASE_URL: baseUrl }, 'Hermes compatible runtime E2E');

const runProductE2E = () => {
  const productEnv = { ...process.env };
  delete productEnv.WEB_BASE_URL;
  return runPlaywright([
    'test',
    'test/e2e/product-release.spec.ts',
    '--config',
    'playwright.release.config.ts',
    '--grep',
    'Hermes action menu',
  ], productEnv, 'Hermes product E2E');
};

try {
  await waitForServer();
  process.env.WEB_BASE_URL = baseUrl;
  await import('./hermes-live2d-motion-gate.mjs');
  await import('./hermes-performance-gate.mjs');
  await import('./hermes-guidance-geometry-gate.mjs');
  await import('./hermes-companion-motion-gate.mjs');
  await runCompatibleRuntimeE2E();
  await runProductE2E();
  if (process.env.OPENSCIENCE_RUN_BLANK_RO_PRODUCTION === '1') {
    await import('./hermes-blank-ro-production-gate.mjs');
  }
} finally {
  server?.kill();
}
