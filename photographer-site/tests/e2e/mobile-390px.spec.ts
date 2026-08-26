import { test, expect } from '@playwright/test';

test.describe('Mobile 390px viewport', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('sign-in page has no horizontal overflow', async ({ page }) => {
    await page.goto('https://ishotyouu-test.leonsites.org/sign-in');
    
    // Wait for Clerk to load
    await page.waitForSelector('[data-clerk-ui="sign-in"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for Clerk mount
    
    // Check viewport dimensions
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.viewportSize();
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth?.width || 390);
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/sign-in-390px.png', fullPage: true });
  });

  test('admin dashboard has no horizontal overflow', async ({ page }) => {
    // This will redirect to sign-in, but we can check the layout loads
    await page.goto('https://ishotyouu-test.leonsites.org/admin');
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check viewport dimensions
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.viewportSize();
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth?.width || 390);
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/admin-390px.png', fullPage: true });
  });

  test('sign-up page has no horizontal overflow', async ({ page }) => {
    await page.goto('https://ishotyouu-test.leonsites.org/sign-up');
    
    // Wait for Clerk to load
    await page.waitForSelector('[data-clerk-ui="sign-up"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for Clerk mount
    
    // Check viewport dimensions
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.viewportSize();
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth?.width || 390);
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/sign-up-390px.png', fullPage: true });
  });
});
