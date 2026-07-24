import { defineConfig, devices } from '@playwright/test';

const TEST_CLERK_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsudGVzdC5pbnZhbGlkJA';
const TEST_CLERK_SECRET_KEY = 'test-only-not-a-secret';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev --ignore-lock --host 127.0.0.1 --port 4332',
    url: 'http://127.0.0.1:4332/?preview=true',
    env: {
      ...process.env,
      ASTRO_DEV_BACKGROUND: '0',
      CLERK_SECRET_KEY: TEST_CLERK_SECRET_KEY,
      PLAYWRIGHT_TEST: '1',
      PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_CLERK_PUBLISHABLE_KEY,
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4332',
    ...devices['Desktop Chrome'],
  },
});
