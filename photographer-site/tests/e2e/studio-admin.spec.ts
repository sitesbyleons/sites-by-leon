import { expect, test } from '@playwright/test';

const pages = [
  ['/admin', 'Overview'],
  ['/admin/content', 'Homepage'],
  ['/admin/media', 'Files'],
  ['/admin/galleries', 'Galleries'],
  ['/admin/posts', 'Posts'],
  ['/admin/services', 'Services'],
  ['/admin/clients', 'Clients'],
  ['/admin/invoices', 'Invoices'],
  ['/admin/inquiries', 'Inquiries'],
  ['/admin/support', 'Support'],
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

test('reorder arrows stay centered in gallery, image, post, and service rows', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/admin/galleries?preview=true', '/admin/posts?preview=true', '/admin/services?preview=true']) {
      await page.goto(path);
      const rows = page.locator('.studio-item').filter({ has: page.locator('.studio-reorder') });
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const centers = await rows.nth(index).evaluate((row) => {
          const card = row.getBoundingClientRect();
          const reorder = row.querySelector('.studio-reorder')!.getBoundingClientRect();
          return {
            card: card.left + card.width / 2,
            reorder: reorder.left + reorder.width / 2,
          };
        });
        expect(Math.abs(centers.card - centers.reorder), `${viewport.width}px ${path} row ${index + 1}`).toBeLessThan(1);
      }
    }
  }
});

test('gallery editor previews grid, column, shape, and per-photo crop controls', async ({ page }) => {
  await page.goto('/admin/galleries?preview=true');
  await page.locator('summary', { hasText: 'Edit' }).first().click();
  const form = page.locator('form[data-resource="galleries"]').filter({ has: page.locator('input[name="id"]') }).first();
  await expect(form.getByLabel('Display')).toHaveValue('grid');
  await form.getByLabel('Photos per row').selectOption('4');
  await form.getByLabel('Photo shape').selectOption('portrait');
  await expect(form.locator('[data-layout-preview]')).toHaveAttribute('data-columns', '4');
  await expect(form.locator('[data-layout-preview]')).toHaveAttribute('data-ratio', 'portrait');

  await form.locator('select[name="cover_aspect_ratio"]').selectOption('square');
  await form.locator('input[name="cover_crop_x"]').fill('24');
  await form.locator('input[name="cover_crop_y"]').fill('68');
  await form.locator('input[name="cover_crop_zoom"]').fill('1.6');
  await expect(form.locator('[data-crop-preview]')).toHaveAttribute('data-ratio', 'square');
  await expect(form.locator('[data-crop-preview-image]')).toHaveCSS('object-position', '24% 68%');
  await expect(form.locator('[data-crop-preview-image]')).toHaveCSS('transform', /matrix\(1\.6/);

  await form.getByRole('button', { name: 'Save gallery' }).click();
  await expect(form.locator('[data-form-status]')).toContainText('Preview saved locally');

  await form.getByRole('button', { name: 'Close' }).click();
  const imageEditor = page.locator('.studio-item').filter({ has: page.getByText('Football teams at the line of scrimmage', { exact: true }) });
  await imageEditor.locator('summary', { hasText: 'Edit' }).click();
  await expect(imageEditor.getByLabel('Shape')).toHaveValue('inherit');
  await imageEditor.getByLabel('Shape').selectOption('portrait');
  await expect(imageEditor.locator('[data-crop-preview]')).toHaveAttribute('data-ratio', 'portrait');
});

test('post editor gives cover images the same live aspect and crop controls', async ({ page }) => {
  await page.goto('/admin/posts?preview=true');
  await page.locator('summary', { hasText: 'Edit' }).first().click();
  const form = page.locator('form[data-resource="posts"]').filter({ has: page.locator('input[name="id"]') }).first();
  await form.getByLabel('Shape').selectOption('wide');
  await form.locator('input[name="cover_crop_zoom"]').fill('1.4');
  await expect(form.locator('[data-crop-preview]')).toHaveAttribute('data-ratio', 'wide');
  await expect(form.locator('[data-crop-preview-image]')).toHaveCSS('transform', /matrix\(1\.4/);
});

test('portfolio items use the shared file browser with focused edit, order, and delete controls', async ({ page }) => {
  await page.goto('/admin/galleries?preview=true');
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(page.locator('[data-media-picker]')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(6);
  await expect(page.locator('summary', { hasText: 'Edit' })).toHaveCount(6);
  await page.locator('summary', { hasText: 'Edit' }).first().click();
  await expect(page.getByRole('button', { name: 'Save gallery' })).toBeVisible();
  await page.locator('[data-media-picker]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-media-card]')).toHaveCount(3);

  await page.goto('/admin/services?preview=true');
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(3);
  await expect(page.getByLabel('Show on website')).toHaveCount(4);
});

test('files and support are complete studio tools', async ({ page }) => {
  await page.goto('/admin/media?preview=true');
  await expect(page.getByRole('heading', { name: '3 files' })).toBeVisible();
  await expect(page.locator('[data-media-manage-card]')).toHaveCount(3);

  await page.goto('/admin/support?preview=true');
  await page.getByLabel('Subject').fill('Homepage image issue');
  await page.getByLabel('Details').fill('The homepage image is cropped too tightly on my phone.');
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page.locator('[data-ticket-status]')).toContainText('Preview ticket ready');
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
