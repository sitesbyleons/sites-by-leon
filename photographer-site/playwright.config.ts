import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: [
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4344',
      url: 'http://127.0.0.1:4344',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4345',
      url: 'http://127.0.0.1:4345',
      env: {
        ...process.env,
        NORTHLINE_PREVIEW_STATUS: 'paused',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4344',
    ...devices['Desktop Chrome'],
  },
});
