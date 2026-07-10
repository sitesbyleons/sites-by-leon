import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4322',
    url: 'http://127.0.0.1:4322/?preview=true',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4322',
    ...devices['Desktop Chrome'],
  },
});
