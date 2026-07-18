import { expect, test, type Response } from '@playwright/test';

import { useCspGuard } from '../../../tests/e2e/csp-guard';

useCspGuard(test);

const expectHasStrictScriptPolicy = (response: Response | null) => {
  expect(response?.status()).toBe(200);
  const policy = response?.headers()['content-security-policy'] ?? '';
  const scriptSources = policy.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1];

  expect(scriptSources).toBeDefined();
  expect(scriptSources).not.toContain("'unsafe-inline'");
};

for (const path of ['/sign-in', '/sign-up']) {
  test(`${path} enforces the production script policy`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

    expectHasStrictScriptPolicy(response);
    await expect(page.locator('[data-clerk-ui]')).toHaveCount(1);
    await page.waitForTimeout(500);
  });
}
