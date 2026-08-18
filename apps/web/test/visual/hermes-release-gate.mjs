/* global URL, fetch, process, setTimeout */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = Number(process.env.HERMES_GATE_PORT ?? 3198);
const externalBaseUrl = process.env.WEB_BASE_URL;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const nextBin = new URL('../../node_modules/next/dist/bin/next', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
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

try {
  await waitForServer();
  process.env.WEB_BASE_URL = baseUrl;
  await import('./hermes-articulation-gate.mjs');
  await import('./hermes-performance-gate.mjs');
  await import('./hermes-guidance-geometry-gate.mjs');
  await import('./hermes-companion-motion-gate.mjs');
  if (process.env.OPENSCIENCE_RUN_BLANK_RO_PRODUCTION === '1') {
    await import('./hermes-blank-ro-production-gate.mjs');
  }
} finally {
  server?.kill();
}
