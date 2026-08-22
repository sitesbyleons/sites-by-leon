import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { useCspGuard } from '../../tests/e2e/csp-guard';

useCspGuard(test);

const packageMetadata = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

test.describe('demo availability controls', () => {
  test('shows maintenance page when site status is maintenance', async ({ page }) => {
    process.env.NORTHLINE_PREVIEW_STATUS = 'maintenance';

    await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });

    const heading = page.locator('h1');
    await expect(heading).toContainText('temporarily unavailable');
    await expect(page.locator('.eyebrow')).toContainText('Site unavailable');

    // Should still be able to access admin routes
    await page.goto('http://localhost:4321/admin?preview=true', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('h1')).toContainText('Studio Dashboard');

    delete process.env.NORTHLINE_PREVIEW_STATUS;
  });

  test('shows paused page when site status is paused', async ({ page }) => {
    process.env.NORTHLINE_PREVIEW_STATUS = 'paused';

    await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });

    const heading = page.locator('h1');
    await expect(heading).toContainText('currently paused');
    await expect(page.locator('.eyebrow')).toContainText('Site paused');

    // Should still be able to access admin routes
    await page.goto('http://localhost:4321/admin?preview=true', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('h1')).toContainText('Studio Dashboard');

    delete process.env.NORTHLINE_PREVIEW_STATUS;
  });

  test('shows active site when status is active', async ({ page }) => {
    delete process.env.NORTHLINE_PREVIEW_STATUS;

    await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });

    // Should show the normal home page
    const heading = page.locator('h1').first();
    await expect(heading).not.toContainText('unavailable');
    await expect(heading).not.toContainText('paused');
  });

  test('maintenance and paused pages are excluded from public access control', async ({ page }) => {
    // These pages should be accessible even if the site is active
    // (they're shown when the middleware redirects to them)
    await page.goto('http://localhost:4321/maintenance', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('temporarily unavailable');

    await page.goto('http://localhost:4321/paused', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('currently paused');
  });

  test('maintenance page has appropriate metadata', async ({ page }) => {
    await page.goto('http://localhost:4321/maintenance', { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    expect(title).toBe('Temporarily unavailable');

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('temporarily unavailable');

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBe('noindex');
  });

  test('paused page has appropriate metadata', async ({ page }) => {
    await page.goto('http://localhost:4321/paused', { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    expect(title).toBe('Site paused');

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('paused');

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBe('noindex');
  });

  test('redirects public routes when paused but allows admin access', async ({ page }) => {
    process.env.NORTHLINE_PREVIEW_STATUS = 'paused';

    // Public routes should redirect to paused page
    await page.goto('http://localhost:4321/work', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/paused');

    await page.goto('http://localhost:4321/journal', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/paused');

    await page.goto('http://localhost:4321/packages', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/paused');

    // Admin routes should still work
    await page.goto('http://localhost:4321/admin?preview=true', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('h1')).toContainText('Studio Dashboard');

    delete process.env.NORTHLINE_PREVIEW_STATUS;
  });

  test('redirects public routes when in maintenance but allows admin access', async ({ page }) => {
    process.env.NORTHLINE_PREVIEW_STATUS = 'maintenance';

    // Public routes should redirect to maintenance page
    await page.goto('http://localhost:4321/work', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/maintenance');

    await page.goto('http://localhost:4321/contact', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/maintenance');

    // Admin routes should still work
    await page.goto('http://localhost:4321/admin?preview=true', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('h1')).toContainText('Studio Dashboard');

    delete process.env.NORTHLINE_PREVIEW_STATUS;
  });
});
