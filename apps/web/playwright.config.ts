import { defineConfig } from 'playwright/test';

const externalBaseUrl = process.env.WEB_BASE_URL;

export default defineConfig({
  testDir: './test/e2e',
  testIgnore: 'signup-live.spec.ts',
  timeout: 60_000,
  use: { baseURL: externalBaseUrl ?? 'http://127.0.0.1:3010', headless: true },
  webServer: externalBaseUrl ? undefined : {
    command: 'node test/e2e/start-signup-web.mjs',
    cwd: '.',
    url: 'http://127.0.0.1:3010/auth/register',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
