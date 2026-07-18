import { defineConfig, devices } from '@playwright/test';

const missingClerkCredentials = ['PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'].filter(
  (name) => !process.env[name]?.trim(),
);

if (missingClerkCredentials.length > 0) {
  throw new Error(
    `Production CSP tests require Clerk credentials. Missing: ${missingClerkCredentials.join(', ')}`,
  );
}

export default defineConfig({
  testDir: './tests/csp',
  use: {
    baseURL: 'http://127.0.0.1:4357',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm build && SITE_CONTENT_MODE=demo HOST=127.0.0.1 PORT=4357 pnpm start',
    url: 'http://127.0.0.1:4357/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
