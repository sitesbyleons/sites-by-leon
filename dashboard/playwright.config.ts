import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4332',
    url: 'http://127.0.0.1:4332/?preview=true',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4332',
    ...devices['Desktop Chrome'],
  },
});
