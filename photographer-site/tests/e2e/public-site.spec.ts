import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { demoPortfolio } from '../../src/lib/content/demo';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const journalDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const expectNoSeriousOrCriticalAccessibilityViolations = async (page: Page) => {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousOrCriticalViolations = accessibility.violations.filter(
    ({ impact }) => impact === 'serious' || impact === 'critical',
  );

  expect(seriousOrCriticalViolations).toEqual([]);
};

const representativePublicRoutes = [
  '/',
  '/work',
  '/work/artists-in-quiet-rooms',
  '/journal',
  '/journal/the-light-before-the-session',
  '/packages',
  '/contact',
  '/maintenance',
];

const representativeViewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'iPhone', width: 390, height: 844 },
] as const;

for (const viewport of representativeViewports) {
  test(`representative public routes have no overflow or serious accessibility violations at the ${viewport.name} viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of representativePublicRoutes) {
      await page.goto(path);

      const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      const context = `${viewport.name}: ${path}`;
      expect(width.content, context).toBeLessThanOrEqual(width.viewport);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(
        axe.violations.filter(
          (item) => item.impact === 'serious' || item.impact === 'critical',
        ),
        context,
      ).toEqual([]);
    }
  });
}

test('client-controlled query and cookie values cannot pause the public site', async ({ context, page }) => {
  await context.addCookies([
    {
      name: 'NORTHLINE_PREVIEW_STATUS',
      value: 'paused',
      url: 'http://127.0.0.1:4344',
    },
  ]);

  const response = await page.goto('/?NORTHLINE_PREVIEW_STATUS=paused&status=paused');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/?\?NORTHLINE_PREVIEW_STATUS=paused&status=paused$/);
  await expect(page.getByRole('heading', { name: 'Portraits with a pulse.' })).toBeVisible();
});

test('health exposes only the public service status and version', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual({
    ok: true,
    service: 'northline-public-site',
    version: packageMetadata.version,
  });
});

test('server-side preview pause redirects only public pages to maintenance', async ({ page, request }) => {
  const response = await page.goto('http://127.0.0.1:4345/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:4345/maintenance');
  await expect(page.getByRole('heading', { name: 'This site is taking a short pause.' })).toBeVisible();

  const health = await request.get('http://127.0.0.1:4345/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({
    ok: true,
    service: 'northline-public-site',
    version: packageMetadata.version,
  });

  const studio = await request.get('http://127.0.0.1:4345/studio', { maxRedirects: 0 });
  expect(studio.status()).toBe(404);
  expect(studio.headers().location).toBeUndefined();
});

test('paused mode exempts only explicit asset and reserved route boundaries', async ({ page, request }) => {
  const dottedPublicRoute = await page.goto('http://127.0.0.1:4345/invoice/foo.bar');

  expect(dottedPublicRoute?.status()).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:4345/maintenance');
  await expect(page.getByRole('heading', { name: 'This site is taking a short pause.' })).toBeVisible();

  const signIn = await request.get('http://127.0.0.1:4345/sign-in', { maxRedirects: 0 });
  expect(signIn.status()).toBe(404);
  expect(signIn.headers().location).toBeUndefined();
  expect(await signIn.text()).not.toContain('This site is taking a short pause.');

  const image = await request.get(
    'http://127.0.0.1:4345/images/northline/artist-profile.webp',
    { maxRedirects: 0 },
  );
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/webp');
  expect(image.headers().location).toBeUndefined();
});

test('home establishes the fictional studio and routes to real work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portraits with a pulse.' })).toBeVisible();
  await expect(page.getByText(/Fictional portfolio concept/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'View the work' })).toHaveAttribute('href', '/work');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '3 studies in presence.' })).toBeVisible();

  const editorialWordCount = await page.locator('main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement;
    copy.querySelector('.journal-feature-copy > div > p:last-child')?.remove();
    return copy.innerText.trim().split(/\s+/).length;
  });
  expect(editorialWordCount).toBeLessThanOrEqual(100);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.getByRole('heading', { name: 'Portraits with a pulse.' })).toBeVisible();

  const revealStates = await page.locator('[data-entrance]').evaluateAll((elements) =>
    elements.map((element) => {
      const style = window.getComputedStyle(element);
      return {
        opacity: style.opacity,
        visibility: style.visibility,
        transform: style.transform,
      };
    }),
  );

  expect(revealStates.length).toBeGreaterThan(0);
  expect(
    revealStates.every(
      ({ opacity, visibility, transform }) =>
        opacity === '1' && visibility === 'visible' && transform === 'none',
    ),
  ).toBe(true);
  await expect(page.locator('[data-contact-sheet-track]')).toHaveCSS('transform', 'none');
});

test('home fits an iPhone-width viewport without hiding its thesis or navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portraits with a pulse.' })).toBeVisible();
});

test('work lists every gallery without iPhone-width overflow and unknown work returns 404', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/work');
  expect(response?.status()).toBe(200);

  for (const gallery of demoPortfolio.galleries) {
    const card = page.locator('.work-card').filter({
      has: page.getByRole('heading', { name: gallery.title, level: 2 }),
    });
    await expect(card).toHaveCount(1);
    const link = card.getByRole('link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/work/${gallery.slug}`);

    const cover = card.locator('img');
    await expect(cover).toHaveCount(1);
    await expect(cover).toHaveAttribute('src', gallery.cover.src);
    await expect(cover).toHaveAttribute('alt', gallery.cover.alt);
    await expect(cover).toHaveAttribute('width', String(gallery.cover.width));
    await expect(cover).toHaveAttribute('height', String(gallery.cover.height));
    await expect(card.getByText(gallery.category, { exact: true })).toBeVisible();
    await expect(card.getByText(`${gallery.images.length} photographs`, { exact: true })).toBeVisible();
  }

  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  expect((await request.get('/work/not-a-gallery')).status()).toBe(404);
});

test('unknown journal entries return a real 404 response', async ({ request }) => {
  expect((await request.get('/journal/not-a-post')).status()).toBe(404);
});

test('packages begin a conversation instead of checkout', async ({ page }) => {
  await page.goto('/packages');
  await expect(page.getByRole('link', { name: 'Ask about this package' })).toHaveCount(3);
  await expect(page.getByText(/Buy now|Checkout|Add to cart/i)).toHaveCount(0);

  for (const displayPackage of demoPortfolio.packages) {
    const card = page.locator('.package-card').filter({
      has: page.getByRole('heading', { name: displayPackage.name, level: 2 }),
    });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('link', { name: displayPackage.ctaLabel })).toHaveAttribute(
      'href',
      `/contact?package=${encodeURIComponent(displayPackage.id)}`,
    );
  }
});

test('packages fit a tablet-width viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/packages');

  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
});

test('contact preselects a known package and keeps demo delivery visibly disabled', async ({ page }) => {
  const selectedPackage = demoPortfolio.packages[1];
  await page.goto(`/contact?package=${selectedPackage.id}`);

  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Session type')).toHaveValue(selectedPackage.id);
  await expect(page.getByLabel('Preferred date')).toBeVisible();
  await expect(page.getByLabel('Message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo only — email instead' })).toBeDisabled();
  await expect(
    page.getByLabel('Photography inquiry').getByRole('link', { name: demoPortfolio.email }),
  ).toHaveAttribute('href', `mailto:${demoPortfolio.email}`);
});

test('unknown package queries are ignored on an accessible mobile contact page', async ({ page }) => {
  const unknownPackage = 'not-a-package-sentinel';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/contact?package=${unknownPackage}`);

  await expect(page.getByLabel('Session type')).toHaveValue('');
  await expect(page.locator('main')).not.toContainText(unknownPackage);
  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  await expectNoSeriousOrCriticalAccessibilityViolations(page);
});

test('packages remain accessible without overflow at an iPhone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/packages');

  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  await expectNoSeriousOrCriticalAccessibilityViolations(page);
});

test('invoice placeholders neither echo nor distinguish token values', async ({ request }) => {
  const ordinary = await request.get('/invoice/inv_demo_123');
  const malformed = await request.get('/invoice/%3Cscript%3Ealert(1)%3C%2Fscript%3E');

  expect(ordinary.status()).toBe(200);
  expect(malformed.status()).toBe(200);

  const ordinaryBody = await ordinary.text();
  const malformedBody = await malformed.text();
  expect(ordinaryBody).toBe(malformedBody);
  expect(ordinaryBody).toContain('This payment link is not active.');
  expect(ordinaryBody).not.toContain('inv_demo_123');
  expect(ordinaryBody).not.toContain('alert(1)');
});

test('journal index lists every story without iPhone-width overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto('/journal');
  expect(response?.status()).toBe(200);

  for (const post of demoPortfolio.posts) {
    const card = page.locator('.journal-card').filter({
      has: page.getByRole('heading', { name: post.title, level: 2 }),
    });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(post.excerpt, { exact: true })).toBeVisible();
    await expect(card.getByRole('link')).toHaveAttribute('href', `/journal/${post.slug}`);
  }

  const pageWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  await expectNoSeriousOrCriticalAccessibilityViolations(page);
});

for (const post of demoPortfolio.posts) {
  test(`${post.title} renders its exact journal fixture accessibly at an iPhone-width viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto(`/journal/${post.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: post.title, level: 1 })).toBeVisible();

    const publishedAt = page.locator('.journal-story-intro time');
    await expect(publishedAt).toBeVisible();
    await expect(publishedAt).toHaveAttribute('datetime', post.publishedAt);
    expect(await publishedAt.textContent()).toBe(journalDateFormatter.format(new Date(post.publishedAt)));

    const paragraphs = page.locator('.journal-story-body > p');
    await expect(paragraphs).toHaveCount(post.body.length);
    expect(await paragraphs.allTextContents()).toEqual(post.body);

    const relatedGalleryLink = page.getByRole('link', { name: 'See the related gallery' });
    if (post.relatedGallerySlug === null) {
      await expect(relatedGalleryLink).toHaveCount(0);
    } else {
      await expect(relatedGalleryLink).toHaveAttribute('href', `/work/${post.relatedGallerySlug}`);
    }

    const pageWidths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
    await expectNoSeriousOrCriticalAccessibilityViolations(page);
  });
}

for (const gallery of demoPortfolio.galleries) {
  test(`${gallery.title} renders its exact fixture sequence at an iPhone-width viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`/work/${gallery.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: gallery.title, level: 1 })).toBeVisible();

    const images = page.locator('main img');
    await expect(images).toHaveCount(4);
    const imageMetadata = await images.evaluateAll((galleryImages) =>
      galleryImages.map((image) => ({
        src: image.getAttribute('src'),
        alt: image.getAttribute('alt'),
        width: image.getAttribute('width'),
        height: image.getAttribute('height'),
      })),
    );
    expect(imageMetadata).toEqual(
      gallery.images.map(({ src, alt, width, height }) => ({
        src,
        alt,
        width: String(width),
        height: String(height),
      })),
    );

    const frames = page.locator('.gallery-sequence > .gallery-frame');
    await expect(frames).toHaveCount(gallery.images.length);
    await expect(frames).toHaveClass(
      gallery.images.map(
        ({ width, height }, index) =>
          `gallery-frame gallery-frame--${width > height ? 'wide' : 'portrait'} gallery-frame--${
            index % 2 === 0 ? 'start' : 'end'
          }`,
      ),
    );

    for (const [index, image] of gallery.images.entries()) {
      const caption = frames.nth(index).locator('figcaption');
      if (image.caption === null) {
        await expect(caption).toHaveCount(0);
      } else {
        await expect(caption).toHaveCount(1);
        await expect(caption).toBeVisible();
        await expect(caption).toHaveText(image.caption);
      }
    }

    const visualTops = await page.locator('main figure').evaluateAll((figures) =>
      figures.map((figure) => figure.getBoundingClientRect().top),
    );
    expect(visualTops).toEqual([...visualTops].sort((a, b) => a - b));

    const pageWidths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth);
  });
}
