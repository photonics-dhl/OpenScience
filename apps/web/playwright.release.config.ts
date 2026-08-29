import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['product-release.spec.ts', 'claim-first-public-ro.spec.ts'],
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
      url: 'http://127.0.0.1:3102/research/OSR-DEMO-000001/v/1',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/next/dist/bin/next start -p 3010',
      cwd: '.',
      env: { API_ORIGIN: 'http://127.0.0.1:3102' },
      url: 'http://127.0.0.1:3010/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
