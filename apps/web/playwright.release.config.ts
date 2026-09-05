import { defineConfig } from 'playwright/test';

const apiOrigin = `http://127.0.0.1:${process.env.PRODUCT_RELEASE_API_PORT ?? '3001'}`;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['product-release.spec.ts', 'claim-first-public-ro.spec.ts', 'academic-identity-recovery.spec.ts', 'research-continuation.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'test/visual/out/product-release/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3010',
    headless: true,
    trace: 'retain-on-failure',
  },
  outputDir: 'test/visual/out/product-release/results',
  webServer: [
    {
      command: 'node test/e2e/start-release-api.mjs',
      cwd: '.',
      url: `${apiOrigin}/research/OSR-DEMO-000001/v/1`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/next/dist/bin/next start -p 3010',
      cwd: '.',
      env: { API_ORIGIN: apiOrigin },
      url: 'http://127.0.0.1:3010/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
