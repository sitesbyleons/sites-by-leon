import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { useCspGuard } from '../../../tests/e2e/csp-guard';

useCspGuard(test);

test('landing page explains the client dashboard', async ({ page }) => {
  await page.goto('/?preview=true');
  await expect(page.getByRole('heading', { name: 'Manage your website.' })).toBeVisible();
  await expect(page.getByText('View progress, request changes, and manage billing.', { exact: true })).toBeVisible();
});

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

test('support and billing are real dashboard pages', async ({ page }) => {
  await page.goto('/dashboard/support?preview=true');
  await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
  await expect(page.getByText('Send a support request to Leon.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send ticket' })).toBeVisible();

  await page.goto('/dashboard/billing?preview=true');
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  await expect(page.getByText('View your plan and manage billing with Stripe.', { exact: true })).toBeVisible();
  await expect(page.getByText('Studio', { exact: true })).toBeVisible();
  await expect(page.locator('form[action="/api/billing/portal"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Manage subscription' })).toBeVisible();
  await page.goto('/dashboard/billing?preview=true&subscription=none');
  expect(await page.locator('form[action="/api/billing/checkout"] input[name="plan"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )).toEqual(['studio']);
  await expect(page.getByRole('button', { name: 'Pay $30/month' })).toBeEnabled();
  await expect(page.locator('[data-checkout-status]')).toHaveAttribute('aria-live', 'polite');

  await page.goto('/dashboard/billing?preview=true&subscription=canceled');
  await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
  await expect(page.locator('form[action="/api/billing/checkout"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pay $30/month' })).toBeEnabled();
});

test('dashboard writes accept the HTTPS browser origin behind the private HTTP proxy', async ({ request }) => {
  const response = await request.post('/api/content-requests', {
    headers: { origin: 'https://127.0.0.1:4332' },
    data: { subject: 'Proxy test', details: 'The request must pass origin validation before authentication.' },
  });

  expect(response.status()).not.toBe(403);

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

  await page.goto('/admin/tickets?preview=true');
  const tools = page.getByRole('form', { name: 'Sort and filter tickets' });
  await tools.locator('select[name="status"]').selectOption('completed');
  await tools.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/status=completed/);
  await expect(page.getByRole('heading', { name: 'completed' })).toBeVisible();
  await expect(page.getByText('Update the booking link')).toBeVisible();
  await expect(page.getByText('Update the contact button to use the new booking link.')).toBeVisible();
  await expect(page.getByText('Replace the featured gallery')).not.toBeVisible();

  await tools.locator('select[name="status"]').selectOption('open');
  await tools.locator('select[name="sort"]').selectOption('oldest');
  await tools.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/sort=oldest/);
  const status = page.getByLabel('Status for Add fall mini sessions');
  await expect(status).toHaveValue('planned');
  await status.selectOption('completed');
  await page.getByRole('button', { name: 'Save Add fall mini sessions' }).click();
  await expect(page.getByText('completed preview')).toBeVisible();

  await page.goto('/admin/subscriptions?preview=true');
  await expect(page.getByRole('table', { name: 'Client subscriptions' })).toBeVisible();

  await page.goto('/admin/sites?preview=true&sort=progress_high');
  await expect(page.getByRole('heading', { name: 'Website builds' })).toBeVisible();
  await page.getByRole('link', { name: 'Add client site' }).click();
  await expect(page.getByRole('heading', { name: 'Add client site' })).toBeVisible();
  await page.getByLabel('Owner account').selectOption('user_waiting');
  await page.getByLabel('Studio name').fill('Vow & Light');
  await expect(page.getByLabel('Short name')).toHaveValue('vow-light');
  await expect(page.getByLabel('Public domain')).toHaveValue('vow-light.leonsites.org');
  await page.getByRole('radio', { name: /Wedding editorial/ }).check();
  await page.getByRole('button', { name: 'Create customer site' }).click();
  await expect(page.getByText('Preview complete. Production creates the records together.')).toBeVisible();
});

test('keeps the admin overview inside an iPhone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/admin?preview=true', '/admin/users?preview=true', '/admin/tickets?preview=true', '/admin/subscriptions?preview=true', '/admin/sites?preview=true', '/admin/sites/ws_northline?preview=true', '/admin/sites/new?preview=true']) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, path).toBeLessThanOrEqual(dimensions.viewport);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Admin dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).first().click();
  }
  await page.goto('/admin/sites?preview=true');
  await expect(page.getByRole('link', { name: 'Manage Northline Portfolio' })).toBeVisible();
  await page.getByRole('link', { name: 'Manage Northline Portfolio' }).click();
  await expect(page.getByRole('button', { name: 'Add custom domain' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use subscription' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete site' })).toBeVisible();
});

test('has no serious or critical accessibility violations on the client surfaces', async ({ page }) => {
  for (const path of ['/?preview=true', '/dashboard?preview=true', '/admin?preview=true', '/admin/users?preview=true', '/admin/tickets?preview=true', '/admin/subscriptions?preview=true', '/admin/sites?preview=true', '/admin/sites/ws_northline?preview=true', '/admin/sites/new?preview=true']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const important = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(important, `${path}: ${important.map((item) => item.id).join(', ')}`).toEqual([]);
  }
});
