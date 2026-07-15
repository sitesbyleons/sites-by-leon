import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { demoPortfolio } from '../../src/lib/content/demo';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const expectNoSeriousOrCriticalAccessibilityViolations = async (page: Page) => {
  await page.waitForTimeout(800);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
  ).toEqual([]);
};

const navigate = (page: Page, url: string) =>
  page.goto(url, { waitUntil: 'domcontentloaded' });

const representativePublicRoutes = [
  '/',
  '/work',
  '/work/friday-night',
  '/journal',
  '/journal/working-the-sideline',
  '/packages',
  '/contact',
  '/maintenance',
];

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'iPhone', width: 390, height: 844 },
] as const) {
  test(`representative sports routes have no overflow or serious accessibility violations at the ${viewport.name} viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of representativePublicRoutes) {
      await navigate(page, path);
      await page.waitForTimeout(100);

      const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(width.content, `${viewport.name}: ${path}`).toBeLessThanOrEqual(width.viewport);
      await expectNoSeriousOrCriticalAccessibilityViolations(page);
    }
  });
}

test('client-controlled query and cookie values cannot pause the public site', async ({ context, page }) => {
  await context.addCookies([
    { name: 'NORTHLINE_PREVIEW_STATUS', value: 'paused', url: 'http://127.0.0.1:4344' },
  ]);

  const response = await navigate(page, '/?NORTHLINE_PREVIEW_STATUS=paused&status=paused');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Northline Sports' })).toBeVisible();
  await expect(page.locator('.wordmark')).toHaveText(demoPortfolio.studioName);
});

test('health exposes only the public service status and version', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    service: 'leon-photographer-runtime',
    version: packageMetadata.version,
    release: expect.any(String),
  });
});

test('server-side preview pause redirects public pages and leaves health available', async ({ page, request }) => {
  const response = await navigate(page, 'http://127.0.0.1:4345/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:4345/maintenance');
  await expect(page.getByRole('heading', { name: 'This site is taking a short pause.' })).toBeVisible();

  const health = await request.get('http://127.0.0.1:4345/api/health');
  expect(health.status()).toBe(200);
});

test('paused mode exempts only explicit asset and reserved route boundaries', async ({ page, request }) => {
  await navigate(page, 'http://127.0.0.1:4345/invoice/foo.bar');
  await expect(page).toHaveURL('http://127.0.0.1:4345/maintenance');

  const signIn = await request.get('http://127.0.0.1:4345/sign-in', { maxRedirects: 0 });
  expect(signIn.status()).toBe(200);

  const admin = await request.get('http://127.0.0.1:4345/admin?preview=true', { maxRedirects: 0 });
  expect(admin.status()).toBe(200);

  const image = await request.get(
    'http://127.0.0.1:4345/images/sports/football-huddle.webp',
    { maxRedirects: 0 },
  );
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/webp');
});

test('home is an image-first editorial sports portfolio', async ({ page }) => {
  await navigate(page, '/');

  await expect(page.getByRole('heading', { name: 'Northline Sports' })).toBeVisible();
  await expect(
    page.getByText('Sports photography for teams and athletes.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected work' })).toBeVisible();
  await expect(page.locator('.service-preview p')).toHaveText(
    'Game Coverage, Season Coverage, and Athlete Session.',
  );
  await expect(page.locator('[data-portfolio-item]')).toHaveCount(3);
  await expect(page.locator('[data-portfolio-item] img')).toHaveCount(9);
  await expect(page.getByRole('link', { name: /view .* gallery/i })).toHaveCount(3);
  await expect(page.locator('.scorebug,.highlight-index,.work-card-number')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveText([
    'Work',
    'Services',
    'Contact',
  ]);

  const mainWordCount = await page.locator('main').evaluate((main) =>
    (main as HTMLElement).innerText.trim().split(/\s+/).length,
  );
  expect(mainWordCount).toBeLessThanOrEqual(95);
  await expect(page.locator('.journal-feature,.studio-position,.featured-work,.package-teaser')).toHaveCount(0);
});

test('always-on motion uses editorial reveal and image drift scenes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigate(page, '/');
  await page.waitForTimeout(900);

  await expect(page.locator('html')).toHaveAttribute('data-motion', 'gsap-always');
  await expect(page.locator('html')).toHaveAttribute(
    'data-motion-scenes',
    'editorial-entrance image-drift scroll-progress',
  );
  await expect(page.getByRole('button', { name: /motion/i })).toHaveCount(0);

  const leadImage = page.locator('.editorial-hero [data-image-drift="slow"] img');
  const initialTransform = await leadImage.evaluate((element) => getComputedStyle(element).transform);
  await page.evaluate(() => scrollTo(0, 500));
  await page.waitForTimeout(350);
  const progressedTransform = await leadImage.evaluate((element) => getComputedStyle(element).transform);
  expect(progressedTransform).not.toBe(initialTransform);
  await expect(page.locator('[data-scroll-progress]')).not.toHaveCSS('transform', 'none');
});

test('mobile home keeps the editorial image rhythm without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, '/');
  await page.waitForTimeout(200);

  const pageMetrics = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageMetrics.height).toBeLessThanOrEqual(3800);
  expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth);

  const cards = await page.locator('[data-portfolio-item]').evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect()),
  );
  expect(cards).toHaveLength(3);
  expect(cards[1].top).toBeGreaterThan(cards[0].bottom);
  expect(cards[2].top).toBeGreaterThan(cards[1].bottom);
});

test('selected work has scroll-linked motion and remains usable before hydration', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, '/');

  const firstProject = page.locator('[data-portfolio-item]').first();
  await expect(firstProject).toBeVisible();
  await firstProject.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island')).toHaveAttribute('client-render-time', /\d/);
  await page.waitForTimeout(700);

  const image = firstProject.locator('img').first();
  const before = await image.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(450);
  const after = await image.evaluate((element) => getComputedStyle(element).transform);
  expect(after).not.toBe(before);

  await expect(firstProject.getByRole('link', { name: 'Open Football gallery' })).toBeVisible();
  await expect(firstProject.getByRole('link', { name: 'View Football gallery' })).toBeVisible();
});

test('public pages contain no prototype language and contact collects event details', async ({ page }) => {
  for (const path of [
    '/',
    '/work',
    '/work/friday-night',
    '/packages',
    '/contact',
    '/journal',
    '/invoice/example',
  ]) {
    await navigate(page, path);
    await expect(page.locator('body')).not.toContainText(
      /demo|fictional|concept|sample|prototype/i,
    );
  }

  await navigate(page, '/contact');
  await expect(page.locator('[data-inquiry-form]')).toHaveCount(1);
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Desired date')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Phone')).toBeVisible();
  await expect(page.getByLabel('Message')).toBeVisible();
});

test('gallery titles and descriptions never overlap', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await navigate(page, '/work/friday-night');
    const boxes = await page.evaluate(() => {
      const title = document.querySelector('.gallery-intro h1')!.getBoundingClientRect();
      const notes = document.querySelector('.gallery-intro-notes')!.getBoundingClientRect();
      return { titleBottom: title.bottom, notesTop: notes.top };
    });
    expect(boxes.titleBottom).toBeLessThanOrEqual(boxes.notesTop);
  }
});

test('desktop gallery frames stay centered with a restrained editorial stagger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, '/work/friday-night');
  const frames = await page.locator('.gallery-frame').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, right: box.right, center: box.left + box.width / 2 };
    }),
  );

  expect(frames).toHaveLength(3);
  expect(Math.abs(frames[0].center - 720)).toBeLessThan(40);
  expect(frames[1].center).toBeLessThan(720);
  expect(frames[2].center).toBeGreaterThan(720);
  expect(Math.abs(frames[1].center - 720)).toBeLessThan(100);
  expect(Math.abs(frames[2].center - 720)).toBeLessThan(100);

  for (const frame of frames) {
    expect(frame.left).toBeGreaterThan(80);
    expect(frame.right).toBeLessThan(1360);
  }
});

test('publishes a favicon and tenant-aware search-engine discovery files', async ({ page, request }) => {
  await navigate(page, '/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute('href', '/sitemap.xml');

  const favicon = await request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type']).toContain('image/svg+xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  const xml = await sitemap.text();
  expect(xml).toContain('<loc>http://127.0.0.1:4344/</loc>');
  expect(xml).toContain('<loc>http://127.0.0.1:4344/work/friday-night</loc>');
  expect(xml).toContain('<loc>http://127.0.0.1:4344/journal/working-the-sideline</loc>');
  expect(xml).not.toMatch(/\/admin|\/invoice/);

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toBe([
    'User-agent: *',
    'Allow: /',
    'Sitemap: http://127.0.0.1:4344/sitemap.xml',
    '',
  ].join('\n'));
});

test('work archive presents football, basketball, and track without filler', async ({ page }) => {
  await navigate(page, '/work');
  await expect(page.getByRole('heading', { name: 'Sports photography.' })).toBeVisible();
  await expect(page.locator('.work-card')).toHaveCount(3);

  for (const gallery of demoPortfolio.galleries) {
    await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible();
  }

  const missing = await navigate(page, '/work/not-on-the-schedule');
  expect(missing?.status()).toBe(404);
});

for (const gallery of demoPortfolio.galleries) {
  test(`${gallery.title} is a compact three-frame sports gallery on iPhone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate(page, `/work/${gallery.slug}`);

    await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible();
    const images = page.locator('.gallery-sequence img');
    await expect(images).toHaveCount(3);
    expect(await images.evaluateAll((items) => items.map((item) => item.getAttribute('src')))).toEqual(
      gallery.images.map(({ src }) => src),
    );

    const heights = await images.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    );
    const frames = await page.locator('.gallery-frame').evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { left: box.left, right: box.right, center: box.left + box.width / 2 };
      }),
    );
    expect(Math.max(...heights)).toBeLessThanOrEqual(260);
    for (const frame of frames) {
      expect(Math.abs(frame.center - 195)).toBeLessThan(1);
      expect(frame.left).toBeGreaterThanOrEqual(16);
      expect(frame.right).toBeLessThanOrEqual(374);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test('coverage services stay concise and inquiry-only', async ({ page }) => {
  await navigate(page, '/packages');
  await expect(page.getByRole('heading', { name: 'Photography services.' })).toBeVisible();
  await expect(page.locator('.service-row')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Ask about coverage' })).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText(/buy now|checkout/i);
});

test('contact requires either email or phone before an inquiry can be sent', async ({ page }) => {
  await navigate(page, '/contact?package=package-game');
  await expect(page.getByRole('heading', { name: 'Contact Northline' })).toBeVisible();
  await page.getByLabel('Name').fill('Jordan Miles');
  await page.getByLabel('Desired date').fill('2026-09-12');
  await page.getByLabel('Message').fill('Football coverage for our home game.');
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await expect(page.locator('[data-contact-method-error]')).toContainText(
    'Enter an email address or phone number',
  );

  await page.getByLabel('Phone').fill('765-555-0123');
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await expect(page.locator('[data-inquiry-status]')).toContainText(
    /not connected|sending/i,
  );
  await expectNoSeriousOrCriticalAccessibilityViolations(page);
});

test('public writes accept the HTTPS browser origin behind the private HTTP proxy', async ({ request }) => {
  const response = await request.post('/api/inquiry', {
    headers: { origin: 'https://127.0.0.1:4344' },
    data: {
      workspaceSlug: 'northline',
      name: 'Proxy Test',
      email: 'proxy@example.com',
      phone: '',
      desiredDate: '2026-09-12',
      message: 'Testing the trusted HTTPS origin through the internal HTTP service.',
    },
  });

  expect(response.status()).not.toBe(403);

});

test('managed mode returns an unavailable response instead of sample content when storage is unavailable', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4356/', { maxRedirects: 0 });
  const body = await response.text();

  expect(response.status()).toBe(503);
  expect(body).toContain('Site temporarily unavailable');
  expect(body).not.toContain('Northline Sports');
  expect(body).not.toContain('/images/sports/');
});

test('field notes use the sports fixtures and stay brief', async ({ page }) => {
  await navigate(page, '/journal');
  for (const post of demoPortfolio.posts) {
    await expect(page.getByRole('heading', { name: post.title })).toBeVisible();
  }

  await navigate(page, '/journal/working-the-sideline');
  await expect(page.locator('.journal-story-body p')).toHaveCount(1);
});

test('invoice placeholders neither echo nor distinguish token values', async ({ request }) => {
  const first = await request.get('/invoice/demo-token-one');
  const second = await request.get('/invoice/demo-token-two');
  expect(first.status()).toBe(second.status());
  expect(await first.text()).toBe(await second.text());
});
