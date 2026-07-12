import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shows project progress in the simple website summary', async ({ page }) => {
  await page.goto('/dashboard?preview=true');
  await expect(page.getByRole('heading', { name: 'In review' })).toBeVisible();
  await expect(page.getByLabel('72% complete')).toBeVisible();
});

test('keeps the preview dashboard within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?preview=true');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole('heading', { name: 'Northline Portraits' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send ticket' })).toBeVisible();
});

test('shows Leon the studio-wide admin overview', async ({ page }) => {
  await page.goto('/admin?preview=true');

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Users 3/ })).toBeVisible();
  await expect(page.getByText('Replace the featured gallery')).toBeVisible();
});

test('splits admin records into sortable pages', async ({ page }) => {
  await page.goto('/admin/users?preview=true&sort=name');
  await expect(page.getByRole('table', { name: 'User accounts' })).toBeVisible();
  await expect(page.getByText('Maya Carter')).toBeVisible();

  await page.goto('/admin/tickets?preview=true&status=completed');
  await expect(page.getByRole('heading', { name: 'completed' })).toBeVisible();
  await expect(page.getByText('Update the booking link')).toBeVisible();
  await expect(page.getByText('Replace the featured gallery')).not.toBeVisible();

  await page.goto('/admin/subscriptions?preview=true');
  await expect(page.getByRole('table', { name: 'Client subscriptions' })).toBeVisible();

  await page.goto('/admin/sites?preview=true&sort=progress_high');
  await expect(page.getByRole('heading', { name: 'Website builds' })).toBeVisible();
});

test('keeps the admin overview inside an iPhone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/admin?preview=true', '/admin/users?preview=true', '/admin/tickets?preview=true', '/admin/subscriptions?preview=true', '/admin/sites?preview=true']) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, path).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('navigation', { name: 'Admin dashboard' })).toBeVisible();
  }
});

test('has no serious or critical accessibility violations on the client surfaces', async ({ page }) => {
  for (const path of ['/?preview=true', '/dashboard?preview=true', '/admin?preview=true', '/admin/users?preview=true', '/admin/tickets?preview=true', '/admin/subscriptions?preview=true', '/admin/sites?preview=true']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const important = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(important, `${path}: ${important.map((item) => item.id).join(', ')}`).toEqual([]);
  }
});
