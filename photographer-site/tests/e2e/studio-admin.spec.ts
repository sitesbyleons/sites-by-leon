import { expect, test } from '@playwright/test';

const pages = [
  ['/admin', 'Overview'],
  ['/admin/content', 'Homepage'],
  ['/admin/galleries', 'Galleries'],
  ['/admin/posts', 'Posts'],
  ['/admin/services', 'Services'],
  ['/admin/clients', 'Clients'],
  ['/admin/invoices', 'Invoices'],
  ['/admin/inquiries', 'Inquiries'],
] as const;

for (const [path, title] of pages) {
  test(`${title} studio page is separate and usable`, async ({ page }) => {
    await page.goto(`${path}?preview=true`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Studio admin' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test('studio pages expose the requested management areas', async ({ page }) => {
  await page.goto('/admin/galleries?preview=true');
  await expect(page.getByRole('heading', { name: 'Gallery images' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create gallery' })).toBeVisible();

  await page.goto('/admin/clients?preview=true');
  await expect(page.getByRole('button', { name: 'Add client' })).toBeVisible();
  await expect(page.getByLabel('Service').last()).toBeVisible();

  await page.goto('/admin/invoices?preview=true');
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible();
  await expect(page.getByText('Stripe Connect', { exact: true })).toBeVisible();
});

test('studio forms provide save feedback in preview mode', async ({ page }) => {
  await page.goto('/admin/content?preview=true');
  await page.getByLabel('Homepage title').fill('Northline Athletics');
  await page.getByRole('button', { name: 'Save homepage' }).click();
  await expect(page.locator('[data-form-status]')).toContainText('Preview saved locally');
});

test('studio admin remains usable at iPhone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/galleries?preview=true');
  await expect(page.getByRole('heading', { name: 'Galleries', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('portfolio items expose focused edit, order, upload, and delete controls', async ({ page }) => {
  await page.goto('/admin/galleries?preview=true');
  await expect(page.locator('input[type="file"]')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(6);
  await expect(page.locator('summary', { hasText: 'Edit' })).toHaveCount(6);
  await page.locator('summary', { hasText: 'Edit' }).first().click();
  await expect(page.getByRole('button', { name: 'Save gallery' })).toBeVisible();

  await page.goto('/admin/services?preview=true');
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(3);
  await expect(page.getByLabel('Show on website')).toHaveCount(4);
});

test('homepage editor offers controlled colors and font presets', async ({ page }) => {
  await page.goto('/admin/content?preview=true');
  await expect(page.getByLabel('Page color')).toHaveValue('#f4f6f8');
  await expect(page.getByLabel('Accent color')).toHaveValue('#ff3b30');
  await expect(page.getByLabel('Font style')).toHaveValue('athletic');
});

test('legacy settings URL opens the single homepage and brand editor', async ({ page }) => {
  await page.goto('/admin/settings?preview=true');
  await expect(page).toHaveURL(/\/admin\/content\?preview=true$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Homepage' })).toBeVisible();
});

test('clients, inquiries, and draft invoices expose focused management controls', async ({ page }) => {
  await page.goto('/admin/clients?preview=true');
  await expect(page.locator('summary', { hasText: 'Edit' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);

  await page.goto('/admin/inquiries?preview=true');
  await expect(page.getByText('Football coverage for our home game.')).toBeVisible();
  await expect(page.getByLabel('Status')).toHaveValue('new');
  await expect(page.getByRole('button', { name: 'Save status' })).toBeVisible();

  await page.goto('/admin/invoices?preview=true');
  await expect(page.locator('summary', { hasText: 'Edit' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete draft' })).toHaveCount(1);
});
