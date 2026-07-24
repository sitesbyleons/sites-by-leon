import { defineConfig, devices } from '@playwright/test';

const TEST_CLERK_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsudGVzdC5pbnZhbGlkJA';
const TEST_CLERK_SECRET_KEY = 'test-only-not-a-secret';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: [
    {
      command: 'pnpm dev --ignore-lock --host 127.0.0.1 --port 4344',
      url: 'http://127.0.0.1:4344',
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: '0',
        CLERK_SECRET_KEY: TEST_CLERK_SECRET_KEY,
        PLAYWRIGHT_TEST: '1',
        PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_CLERK_PUBLISHABLE_KEY,
        SITE_CONTENT_MODE: 'demo',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev --ignore-lock --host 127.0.0.1 --port 4345',
      url: 'http://127.0.0.1:4345',
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: '0',
        CLERK_SECRET_KEY: TEST_CLERK_SECRET_KEY,
        NORTHLINE_PREVIEW_STATUS: 'paused',
        PLAYWRIGHT_TEST: '1',
        PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_CLERK_PUBLISHABLE_KEY,
        SITE_CONTENT_MODE: 'demo',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev --ignore-lock --host 127.0.0.1 --port 4356',
      url: 'http://127.0.0.1:4356/api/health',
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: '0',
        CLERK_SECRET_KEY: TEST_CLERK_SECRET_KEY,
        PLAYWRIGHT_TEST: '1',
        PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_CLERK_PUBLISHABLE_KEY,
        SITE_CONTENT_MODE: 'managed',
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
