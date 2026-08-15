import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'signup-live.spec.ts',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3010', headless: true },
  webServer: [
    {
      command: 'node ../api/test/support/signup-smoke-server.mjs',
      cwd: '.',
      url: 'http://127.0.0.1:3101/auth/me',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node test/e2e/start-signup-web.mjs',
      cwd: '.',
      url: 'http://127.0.0.1:3010/auth/register',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
