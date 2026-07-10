import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('hero explains the product and reaches contact', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Web design + hosting for photographers', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your work. Beautifully online.');
  await page.locator('.site-header').getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page.locator('#contact')).toBeInViewport();
});

test('uses a varied cinematic image library inside complete website concepts', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.website-concept')).toHaveCount(3);
  await expect(page.locator('.website-concept img')).toHaveCount(9);
  const uniqueSources = await page.evaluate(
    () => new Set(Array.from(document.querySelectorAll<HTMLImageElement>('.website-concept img'), (image) => image.src)).size,
  );
  expect(uniqueSources).toBe(9);
  await expect(page.locator('.proof-strip')).toHaveCount(0);
  await expect(page.locator('.hero-browser')).toHaveCount(0);
  await expect(page.locator('.price-card')).toHaveCount(0);
});

test('website concepts demonstrate the photographer client journey', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Portfolio', { exact: true })).toBeVisible();
  await expect(page.getByText('Client inquiries', { exact: true })).toBeVisible();
  await expect(page.getByText('Booking & deposits', { exact: true })).toBeVisible();
  await expect(page.getByText('Client portal & payments', { exact: true })).toBeVisible();
  await expect(page.getByText('Check your date', { exact: true })).toBeVisible();
  await expect(page.getByText('Book a session', { exact: true })).toBeVisible();
  await expect(page.getByText('Deposit received', { exact: true })).toBeVisible();
});

test('frames every concept as a website with its own example domain', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.concept-browser')).toHaveCount(3);
  await expect(page.locator('.concept-browser__address')).toHaveText([
    'vowandlight.photo',
    'northlineportraits.com',
    'fieldwork.studio',
  ]);
  await expect(page.locator('.website-concept--northline-portraits .portfolio-story__intro h3')).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(page.locator('.website-concept--fieldwork-commercial .concept-title__line')).toHaveCount(2);
});

test('keeps the four-step process concise and fully boxed', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.process-list li')).toHaveCount(4);
  await expect(page.locator('.process-list p')).toHaveCount(0);
  await expect(page.locator('.process-list')).toHaveCSS('border-bottom-width', '1px');
});

test('loads GSAP ScrollTrigger for restrained scroll choreography', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('script[src*="cdn.jsdelivr.net/npm/gsap"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'gsap-scrolltrigger');
  await expect(page.locator('.concept-browser__progress')).toHaveCount(3);
});

test('keeps interface language focused on what clients need', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('body')).not.toContainText(
    /digital proof|not for publication|the working agreement|independent studio|drag your eye/i,
  );
});

test('labels all three examples as concept projects', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Concept Project', { exact: true })).toHaveCount(3);
  await expect(page.locator('#work img')).toHaveCount(9);
  await expect(page.locator('#work article')).toHaveCount(3);
});

test('shows all monthly options and no build fee', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.pricing-ledger__row').filter({ hasText: 'Essential' })).toContainText('$30');
  await expect(page.locator('.pricing-ledger__row').filter({ hasText: 'Studio' })).toContainText('$65');
  await expect(page.locator('.pricing-ledger__row').filter({ hasText: 'Signature' })).toContainText('$100');
  await expect(page.getByText(/no separate build fee/i)).toBeVisible();
  await expect(page.getByText(/i am a photographer/i)).toHaveCount(0);
});

test('keeps direct email available when online sending is not configured', async ({ page }) => {
  await page.goto('/#contact');
  const form = page.locator('[data-contact-form]');

  await form.getByLabel('Name').fill('Ari Lane');
  await form.getByLabel('Email').fill('ari@example.com');
  await form.getByLabel('What do you photograph?').fill('Weddings');
  await form.getByLabel('What are you looking for?').fill('I need a cinematic portfolio that is easier to manage.');
  await form.getByRole('button', { name: 'Send inquiry' }).click();

  await expect(page.getByText(/online sending is not connected yet/i)).toBeVisible();
  await expect(page.locator('.contact__intro').getByRole('link', { name: 'sites.by.leon@gmail.com' })).toBeVisible();
  await expect(form.getByLabel('Name')).toHaveValue('Ari Lane');
});

test('publishes the privacy and terms pages', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('privacy notice');
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('service terms');
});

test('has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(severe).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`does not overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

test('shows content without motion when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const firstConcept = page.locator('#work article').first();
  await expect(firstConcept).toBeVisible();
  await expect(firstConcept).toHaveCSS('transform', 'none');
});
