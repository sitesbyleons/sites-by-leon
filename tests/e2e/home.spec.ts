import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { useCspGuard } from './csp-guard';

useCspGuard(test);

test('introduces the photography offer and reaches contact', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#spatial-title')).toContainText('Your work.');
  await expect(page.locator('#spatial-title')).toContainText('Your site.');
  await expect(page.getByText('Independent websites for photographers', { exact: true })).toBeVisible();
  await page.locator('.spatial-cta').click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.locator('main h1')).toBeVisible();
});

test('links distinct working demos with loaded preview images', async ({ page }) => {
  await page.goto('/');
  const projects = page.locator('.lh-project');
  await expect(projects).toHaveCount(2);
  await expect(projects.locator('h3')).toHaveText(['Northline Sports', 'Vow & Light']);
  expect(await projects.locator('.lh-project-preview').evaluateAll(elements => elements.map(element => element.getAttribute('href')))).toEqual(['https://demo.leonsites.org', 'https://vow-and-light.leonsites.org']);
  for (const image of await projects.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveAttribute('alt', /\S/);
  }
});

test('offers both plans with expandable features and correct inquiry links', async ({ page }) => {
  await page.goto('/');
  const plans = page.locator('.plan-row');
  await expect(plans).toHaveCount(2);
  for (const [index, name, price, slug] of [[0, 'Essential', '$25', 'essential'], [1, 'Studio', '$35', 'studio']] as const) {
    const plan = plans.nth(index);
    await expect(plan.locator('h3')).toHaveText(name);
    await expect(plan).toContainText(price);
    await expect(plan.locator('a')).toHaveAttribute('href', `/contact?plan=${slug}`);
    await plan.locator('summary').click();
    await expect(plan.locator('details')).toHaveAttribute('open', '');
    await expect(plan.locator('li').first()).toBeVisible();
    await plan.locator('summary').click();
    await expect(plan.locator('details')).not.toHaveAttribute('open');
  }
});

test('preserves direct contact and focused content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.contact-email')).toHaveAttribute('href', 'mailto:sites.by.leon@gmail.com');
  await expect(page.locator('.contact-big')).toHaveAttribute('href', '/contact');
  await expect(page.locator('.promise-strip,.process,.founder,[data-contact-form]')).toHaveCount(0);
});

test('mobile menu supports opening, Escape, focus return and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.locator('.lh-menu');
  const navigation = page.locator('#lh-mobile-nav');
  await expect(navigation).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await navigation.getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\/?$/);
});

test('desktop spatial motion responds to scrolling using bundled scripts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-home-motion', 'spatial');
  await expect(page.locator('script[src*="cdn.jsdelivr.net/npm/gsap"]')).toHaveCount(0);
  await expect(page.locator('.pin-spacer')).toHaveCount(1);
  const print = page.locator('.spatial-main');
  const initial = await print.evaluate(element => getComputedStyle(element).transform);
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => print.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
});

test('reduced motion leaves content readable and unpinned', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-home-motion', 'reduced');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await expect(page.locator('#spatial-title')).toBeVisible();
  await expect(page.locator('.spatial-cta')).toBeVisible();
  await page.locator('#pricing').scrollIntoViewIfNeeded();
  await expect(page.locator('.plan-row').first()).toBeVisible();
});

for (const width of [320, 390, 760, 768, 1440, 2560]) {
  test(`homepage fits the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 760) {
      await expect(page.locator('.pin-spacer')).toHaveCount(0);
      const bounds = await page.evaluate(() => ({ heading: document.querySelector('.spatial-heading')!.getBoundingClientRect().bottom, image: document.querySelector('.spatial-world')!.getBoundingClientRect().top }));
      expect(bounds.heading).toBeLessThanOrEqual(bounds.image);
    }
  });
}

test('publishes correct homepage metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Sites By Leon');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Websites and hosting for photographers, with portfolio pages, inquiries, payments, updates, and direct support.');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://leonsites.org/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Sites By Leon');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://leonsites.org/');
});

for (const width of [390, 1440]) {
  test(`legacy launch URL leads to the open site at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/coming-soon');
    await expect(page.getByText('You found the old launch link.')).toBeVisible();
    await expect(page.locator('main h1')).toContainText('OPEN.');
    await expect(page.getByRole('timer')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('link', { name: /Go to the homepage/ }).click();
    await expect(page.locator('#spatial-title')).toBeVisible();
  });
}

test('preserves legal content and footer navigation', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 2, name: 'Information collected' })).toBeVisible();
  await expect(page.getByText(/uploaded images/)).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute('href', '/pricing');
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 2, name: 'Customer responsibilities' })).toBeVisible();
  await expect(page.getByText(/connected Stripe account/)).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('href', '/contact');
});

for (const width of [390, 1440]) {
  test(`has no serious or critical accessibility violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
  });
}
