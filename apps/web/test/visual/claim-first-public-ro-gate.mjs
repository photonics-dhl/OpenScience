import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync(
  process.execPath,
  ['node_modules/playwright/cli.js', 'test', 'claim-first-public-ro.spec.ts', '--config', 'playwright.release.config.ts'],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);

