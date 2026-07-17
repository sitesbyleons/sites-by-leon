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

const normalMotionScenes = 'editorial-entrance image-drift scroll-progress';

const expectMotionMetadata = async (page: Page, motion: string, scenes: string) => {
  await expect(page.locator('html')).toHaveAttribute('data-motion', motion);
  await expect(page.locator('html')).toHaveAttribute('data-motion-scenes', scenes);
};

const expectResolvedDriftTargets = async (
  page: Page,
  expectedKinds: Array<'element' | 'img' | 'layer'>,
  state: 'active' | 'clear',
) => {
  await expect.poll(() => page.locator('[data-image-drift]').evaluateAll((elements) =>
    elements.map((element) => {
      const layer = element.querySelector<HTMLElement>('[data-image-drift-layer]');
      const image = element.querySelector<HTMLElement>('img');
      const target = layer ?? image ?? element;
      const kind = layer ? 'layer' : image ? 'img' : 'element';
      const targetState = getComputedStyle(target).transform === 'none' ? 'clear' : 'active';

      return `${kind}:${targetState}`;
    }),
  )).toEqual(expectedKinds.map((kind) => `${kind}:${state}`));
};

const expectReducedSpatialState = async (page: Page) => {
  await expect(page.locator('[data-site-header]')).toHaveCSS('transform', 'none');

  const entrances = page.locator('[data-entrance]');
  await expect(entrances.first()).toBeAttached();
  await expect.poll(() => entrances.evaluateAll((elements) =>
    elements.every((element) => getComputedStyle(element).transform === 'none'),
  )).toBe(true);

  await expect.poll(() => page.locator('[data-scroll-progress]').evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const scaleX = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform).a;

    return {
      hasInlineTransform: (element as HTMLElement).style.transform.length > 0,
      scaleX: Number(scaleX.toFixed(3)),
    };
  })).toEqual({ hasInlineTransform: true, scaleX: 1 });
};

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

test('reduced motion keeps editorial content visible without drift', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-motion-scenes', 'editorial-fade');
  await expect(page.getByRole('button', { name: /motion/i })).toHaveCount(0);
  await expect(page.locator('.editorial-hero [data-image-drift="slow"] img')).toHaveCSS('transform', 'none');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('live motion preference clears and restores resolved drift targets', async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const galleryPage = await context.newPage();
  await galleryPage.emulateMedia({ reducedMotion: 'no-preference' });
  await galleryPage.goto('/work/friday-night');

  await expectMotionMetadata(page, 'gsap-always', normalMotionScenes);
  await expectMotionMetadata(galleryPage, 'gsap-always', normalMotionScenes);
  await expectResolvedDriftTargets(page, ['img', 'img'], 'active');
  await expectResolvedDriftTargets(galleryPage, ['layer', 'layer', 'layer'], 'active');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await galleryPage.emulateMedia({ reducedMotion: 'reduce' });

  await expectMotionMetadata(page, 'reduced', 'editorial-fade');
  await expectMotionMetadata(galleryPage, 'reduced', 'editorial-fade');
  await expectReducedSpatialState(page);
  await expectReducedSpatialState(galleryPage);
  await expectResolvedDriftTargets(page, ['img', 'img'], 'clear');
  await expectResolvedDriftTargets(galleryPage, ['layer', 'layer', 'layer'], 'clear');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await galleryPage.emulateMedia({ reducedMotion: 'no-preference' });

  await expectMotionMetadata(page, 'gsap-always', normalMotionScenes);
  await expectMotionMetadata(galleryPage, 'gsap-always', normalMotionScenes);
  await expectResolvedDriftTargets(page, ['img', 'img'], 'active');
  await expectResolvedDriftTargets(galleryPage, ['layer', 'layer', 'layer'], 'active');
});

test('reduced motion clears preexisting spatial transforms without a normal setup', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;

      const driftTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-image-drift]'))
        .map((element) => element.querySelector<HTMLElement>('[data-image-drift-layer]')
          ?? element.querySelector<HTMLElement>('img')
          ?? element);
      const spatialTargets = [
        document.querySelector<HTMLElement>('[data-site-header]'),
        ...document.querySelectorAll<HTMLElement>('[data-entrance]'),
        ...driftTargets,
      ].filter((element): element is HTMLElement => Boolean(element));

      spatialTargets.forEach((element) => {
        element.style.transform = 'translate3d(12px, 8px, 0)';
      });
    }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expectMotionMetadata(page, 'reduced', 'editorial-fade');
  await expectReducedSpatialState(page);
  await expectResolvedDriftTargets(page, ['img', 'img'], 'clear');
});

test('reduced motion avoids missing-target warnings without drift scenes', async ({ page }) => {
  const missingTargetWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && /GSAP target.*not found/i.test(message.text())) {
      missingTargetWarnings.push(message.text());
    }
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contact');

  await expectMotionMetadata(page, 'reduced', 'editorial-fade');
  await expect(page.locator('[data-image-drift]')).toHaveCount(0);
  await expectReducedSpatialState(page);
  expect(missingTargetWarnings).toEqual([]);
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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await navigate(page, '/');

  const firstProject = page.locator('[data-portfolio-item]').first();
  await expect(firstProject).toBeVisible();
  await firstProject.scrollIntoViewIfNeeded();
  const image = firstProject.locator('.work-project__image-drift').first();
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  await page.waitForTimeout(700);
  const before = await image.evaluate((element) => getComputedStyle(element).transform);
  await firstProject.evaluate((element) => {
    const box = element.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + box.top + box.height * 0.75);
  });
  await page.waitForTimeout(700);
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

test('published galleries honor grid columns, aspect ratio, and crop positioning', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, '/work/friday-night');
  const sequence = page.locator('[data-gallery-layout]');
  await expect(sequence).toHaveAttribute('data-gallery-layout', 'grid');
  await expect(sequence).toHaveAttribute('data-columns', '3');
  const frames = page.locator('.gallery-frame');
  await expect(frames).toHaveCount(3);
  expect(await frames.first().locator('figure').evaluate((element) => getComputedStyle(element).aspectRatio)).toBe('4 / 3');
  expect(await frames.first().locator('img').evaluate((element) => getComputedStyle(element).objectPosition)).toBe('50% 50%');

  await navigate(page, '/work/lane-eight');
  await expect(page.locator('[data-gallery-layout]')).toHaveAttribute('data-gallery-layout', 'stack');
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
    const frames = await page.locator('.gallery-frame').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
    expect(Math.max(...heights)).toBeLessThanOrEqual(260);
    for (const frame of frames) {
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
