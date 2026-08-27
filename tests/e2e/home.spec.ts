import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { useCspGuard } from './csp-guard';

useCspGuard(test);

test('hero states the offer and reaches contact', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Websites and hosting for photographers', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Websites for photographers. Hosting included.');
  const headingLines = page.locator('#hero-title span, #hero-title em');
  await expect(headingLines).toHaveCount(3);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const lines = await headingLines.evaluateAll((elements) => elements.map((element) => ({
      text: (element.textContent ?? '').trim(),
      whiteSpace: getComputedStyle(element).whiteSpace,
      display: getComputedStyle(element).display,
      rects: element.getClientRects().length,
    })));
    expect(lines.map((line) => line.text)).toEqual(['Websites for', 'photographers.', 'Hosting included.']);
    for (const line of lines) {
      expect(line.whiteSpace, `${viewport.width}px ${line.text}`).toBe('nowrap');
      expect(line.display, `${viewport.width}px ${line.text}`).toBe('block');
      expect(line.rects, `${viewport.width}px ${line.text}`).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }
  await page.locator('.site-header').getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page.locator('#contact')).toBeInViewport();
});

test('uses a varied cinematic image library inside complete website concepts', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.website-concept')).toHaveCount(2);
  await expect(page.locator('.website-concept img')).toHaveCount(6);
  const uniqueSources = await page.evaluate(
    () => new Set(Array.from(document.querySelectorAll<HTMLImageElement>('.website-concept img'), (image) => image.src)).size,
  );
  expect(uniqueSources).toBe(6);
  await expect(page.locator('.proof-strip')).toHaveCount(0);
  await expect(page.locator('.hero-browser')).toHaveCount(0);
  await expect(page.locator('.price-card')).toHaveCount(0);
});

test('website examples show distinct photography businesses', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 2, name: 'Check out our examples.' })).toBeVisible();
  await expect(page.locator('.concept-capabilities')).toHaveCount(0);
  await expect(page.getByText('Check availability', { exact: true })).toBeVisible();
  await expect(page.getByText('Book a session', { exact: true })).toBeVisible();
  await expect(page.getByText('Deposit received', { exact: true })).toHaveCount(0);
});

test('frames every concept as a website with its own example domain', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.concept-browser')).toHaveCount(2);
  await expect(page.locator('.concept-browser__address')).toHaveText([
    'vowandlight.photo',
    'northlineportraits.com',
  ]);
  await expect(page.locator('.website-concept--northline-portraits .portfolio-story__intro h3')).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(page.locator('.website-concept--fieldwork-commercial')).toHaveCount(0);
});

test('keeps the main page focused by removing secondary explainer sections', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.promise-strip')).toHaveCount(0);
  await expect(page.locator('.process')).toHaveCount(0);
  await expect(page.locator('.founder')).toHaveCount(0);
});

test('loads GSAP ScrollTrigger with visible 2D and 3D depth scenes', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('script[src*="cdn.jsdelivr.net/npm/gsap"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'gsap-scrolltrigger');
  await expect(page.locator('html')).toHaveAttribute('data-motion-scenes', 'hero-depth concept-3d pricing-stagger');
  await expect(page.locator('[data-motion-depth="concept"]')).toHaveCount(2);
  await expect(page.locator('.concept-browser__progress')).toHaveCount(2);

  const firstConcept = page.locator('[data-motion-depth="concept"]').first();
  const initialTransform = await firstConcept.evaluate((element) => getComputedStyle(element).transform);
  expect(initialTransform).toContain('matrix3d');
  await firstConcept.scrollIntoViewIfNeeded();
  await expect
    .poll(() => firstConcept.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);
});

test('uses restrained desktop depth and readable reveal ranges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const heroStart = await page.locator('.hero-gallery__image').evaluateAll((images) =>
    images.map((image) => {
      const transform = (image as HTMLElement).style.transform;
      return {
        yPercent: Number(transform.match(/translate(?:3d)?\([^,]+,\s*(-?[\d.]+)%/)?.[1]),
        rotation: Number(transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]),
      };
    }),
  );
  expect(heroStart.map(({ yPercent }) => yPercent)).toEqual([4, -4, 5]);
  expect(heroStart.map(({ rotation }) => rotation)).toEqual([-1, 1.2, -1.2]);

  const firstConceptStart = await page.locator('[data-motion-depth="concept"]').first().evaluate((element) => {
    const transform = (element as HTMLElement).style.transform;
    return {
      perspective: Number(transform.match(/perspective\(([\d.]+)px\)/)?.[1]),
      z: Number(transform.match(/translate3d\([^,]+,[^,]+,\s*(-?[\d.]+)px\)/)?.[1]),
      rotationX: Number(transform.match(/rotateX\((-?[\d.]+)deg\)/)?.[1]),
      rotationY: Number(transform.match(/rotateY\((-?[\d.]+)deg\)/)?.[1]),
      scale: Number(transform.match(/scale\(([\d.]+)/)?.[1]),
    };
  });
  expect(firstConceptStart).toEqual({
    perspective: 1600,
    z: -80,
    rotationX: 5,
    rotationY: -6,
    scale: 0.97,
  });

  const reveal = page.locator('.services [data-reveal]').first();
  const revealStartY = await reveal.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform).m42;
  });
  expect(revealStartY).toBeCloseTo(20, 1);
  await expect(reveal).toHaveCSS('transition-duration', '0s');

  const pricingCard = page.locator('.pricing-card').first();
  const pricingStart = await pricingCard.evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
    return {
      opacity: Number(style.opacity),
      transform: (element as HTMLElement).style.transform,
      y: matrix.m42,
    };
  });
  expect(pricingStart.opacity).toBeCloseTo(0.88, 2);
  expect(pricingStart.y).toBeCloseTo(24, 1);
  expect(pricingStart.transform).not.toContain('rotateY');
  await expect(pricingCard).toHaveCSS('will-change', 'auto');
  await expect(page.locator('.concept-browser').first()).toHaveCSS('will-change', 'auto');

  const heroHeight = await page.locator('.hero').evaluate((hero) => (hero as HTMLElement).offsetHeight);
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), heroHeight);
  for (const image of await page.locator('.hero-gallery__image').all()) {
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
          return Math.hypot(matrix.m11, matrix.m12);
        }),
      )
      .toBeCloseTo(1.015, 2);
  }
});

test('settles the mobile concept entrance once across re-entry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const concept = page.locator('[data-motion-depth="concept"]').first();
  const conceptStart = await concept.evaluate((element) => {
    const transform = (element as HTMLElement).style.transform;
    return {
      y: Number(transform.match(/translate(?:3d)?\([^,]+,\s*(-?[\d.]+)px/)?.[1]),
      rotation: Number(transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]),
      scale: Number(transform.match(/scale\(([\d.]+)/)?.[1]),
    };
  });
  expect(conceptStart).toEqual({ y: 24, rotation: -0.6, scale: 0.985 });

  const poseError = () =>
    concept.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
      const scale = Math.hypot(matrix.m11, matrix.m12);
      const rotation = (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI;
      return Math.max(Math.abs(matrix.m42), Math.abs(rotation), Math.abs(scale - 1));
    });

  await concept.scrollIntoViewIfNeeded();
  await expect.poll(poseError).toBeLessThan(0.01);
  await page.locator('.pricing').scrollIntoViewIfNeeded();
  const reentry = await concept.evaluate(async (element) => {
    const poseErrorAtFrame = () => {
      const transform = getComputedStyle(element).transform;
      const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
      const scale = Math.hypot(matrix.m11, matrix.m12);
      const rotation = (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI;
      return Math.max(Math.abs(matrix.m42), Math.abs(rotation), Math.abs(scale - 1));
    };
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'center' });
    root.style.scrollBehavior = previousScrollBehavior;

    const startedAt = performance.now();
    const samples = [poseErrorAtFrame()];
    while (performance.now() - startedAt < 600) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(poseErrorAtFrame());
    }
    return {
      duration: performance.now() - startedAt,
      maxError: Math.max(...samples),
      sampleCount: samples.length,
    };
  });
  expect(reentry.duration).toBeGreaterThanOrEqual(560);
  expect(reentry.sampleCount).toBeGreaterThan(20);
  expect(reentry.maxError).toBeLessThan(0.01);
});

test('keeps mobile pricing horizontally scrollable with snap points', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const pricingGrid = page.locator('.pricing-grid');
  await expect(pricingGrid).toHaveCSS('scroll-snap-type', 'x mandatory');
  await expect(page.locator('.pricing-card').first()).toHaveCSS('scroll-snap-align', 'start');
  const dimensions = await pricingGrid.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

  await pricingGrid.scrollIntoViewIfNeeded();
  await pricingGrid.hover();
  await page.mouse.wheel(600, 0);
  await expect.poll(() => pricingGrid.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test('uses tokenized press feedback and fine-pointer image hover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const button = page.locator('.button').first();
  const buttonTransition = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      durations: style.transitionDuration.split(', ').map((value) => value.trim()),
      properties: style.transitionProperty.split(', ').map((value) => value.trim()),
      timingFunctions: style.transitionTimingFunction,
    };
  });
  expect(buttonTransition.properties).toEqual(['background-color', 'border-color', 'color', 'transform']);
  expect(new Set(buttonTransition.durations)).toEqual(new Set(['0.16s']));
  expect(buttonTransition.timingFunctions).toBe('ease, ease, ease, cubic-bezier(0.23, 1, 0.32, 1)');

  await button.hover();
  await page.mouse.down();
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
        return Math.hypot(matrix.m11, matrix.m12);
      }),
    )
    .toBeCloseTo(0.97, 2);
  await page.mouse.up();

  const image = page.locator('.hero-gallery__image img').first();
  await expect(image).toHaveCSS('transition-property', 'filter, transform');
  await expect(image).toHaveCSS('transition-duration', '0.24s, 0.24s');
  const hasGatedHoverRule = await page.evaluate(() =>
    Array.from(document.styleSheets).some((styleSheet) =>
      Array.from(styleSheet.cssRules).some(
        (rule) =>
          rule instanceof CSSMediaRule &&
          rule.conditionText === '(hover: hover) and (pointer: fine)' &&
          Array.from(rule.cssRules).some((nestedRule) =>
            nestedRule.cssText.includes('.hero-gallery__image:hover img'),
          ),
      ),
    ),
  );
  expect(hasGatedHoverRule).toBe(true);

  await image.hover();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
        return Math.hypot(matrix.m11, matrix.m12);
      }),
    )
    .toBeCloseTo(1.018, 2);
});

test('composes concept image hover without changing figure or caption geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const browser = page.locator('.website-concept--northline-portraits [data-motion-depth="concept"]');
  const figure = browser.locator('.concept-canvas figure').first();
  const image = figure.locator('img');
  const readImageMotion = () =>
    image.evaluate((element) => {
      const style = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      return {
        scale: Math.hypot(matrix.m11, matrix.m12),
        scaleLonghand: style.scale,
        transform: style.transform,
        y: matrix.m42,
      };
    });
  const readGeometry = () =>
    figure.evaluate((element) => {
      const figureBounds = element.getBoundingClientRect();
      return {
        figureHeight: figureBounds.height,
        figureTransform: getComputedStyle(element).transform,
        figureWidth: figureBounds.width,
      };
    });

  await expect(image).toHaveCSS('transition-property', 'filter, scale');
  await expect(image).toHaveCSS('transition-duration', '0.24s, 0.24s');
  const imageStart = await readImageMotion();
  const geometryStart = await readGeometry();
  expect(imageStart.transform).not.toBe('none');
  expect(imageStart.scale).toBeCloseTo(1.025, 2);
  expect(Math.abs(imageStart.y)).toBeGreaterThan(0);
  expect(imageStart.scaleLonghand).toBe('none');
  expect(geometryStart.figureTransform).toBe('none');

  await browser.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + bounds.top + (bounds.height - window.innerHeight) / 2);
  });
  await expect.poll(async () => Math.abs((await readImageMotion()).y)).toBeLessThan(0.75);
  const geometryBeforeHover = await readGeometry();
  expect(geometryBeforeHover.figureTransform).toBe('none');

  await image.hover();
  await expect
    .poll(async () => Number.parseFloat((await readImageMotion()).scaleLonghand))
    .toBeCloseTo(1.018, 3);
  const imageDuringHover = await readImageMotion();
  const geometryDuringHover = await readGeometry();
  expect(imageDuringHover.transform).not.toBe('none');
  expect(imageDuringHover.scale).toBeCloseTo(1.025, 2);
  expect(geometryDuringHover.figureTransform).toBe('none');
  expect(Math.abs(geometryDuringHover.figureWidth - geometryBeforeHover.figureWidth)).toBeLessThanOrEqual(0.25);
  expect(Math.abs(geometryDuringHover.figureHeight - geometryBeforeHover.figureHeight)).toBeLessThanOrEqual(0.25);
});

test('keeps interface language focused on what clients need', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('body')).not.toContainText(
    /digital proof|not for publication|the working agreement|independent studio|drag your eye/i,
  );
});

test('keeps both website examples visual and concise', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.portfolio-story__intro > p')).toHaveCount(2);
  await expect(page.locator('#work img')).toHaveCount(6);
  await expect(page.locator('#work article')).toHaveCount(2);
});

test('shows the two approved monthly plans and included features', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cards = page.locator('.pricing-card');
  const essentialCard = cards.filter({ has: page.getByRole('heading', { name: 'Essential', exact: true }) });
  const studioCard = cards.filter({ has: page.getByRole('heading', { name: 'Studio', exact: true }) });
  await expect(cards).toHaveCount(2);
  await expect(essentialCard).toContainText('$25');
  await expect(studioCard).toContainText('$35');
  await expect(cards.getByText('Custom domain', { exact: true })).toHaveCount(1);
  await expect(cards.getByText('Secure client payments', { exact: true })).toHaveCount(1);
  await expect(cards.getByText('15 GB photo storage', { exact: true })).toHaveCount(2);
  await expect(cards.getByText('Social media post gallery', { exact: true })).toHaveCount(1);
  await expect(page.locator('.pricing-card__index')).toHaveCount(0);
  const cardPositions = await cards.evaluateAll((items) =>
    items.map((item) => ({ x: (item as HTMLElement).offsetLeft, y: (item as HTMLElement).offsetTop })),
  );
  expect(new Set(cardPositions.map((position) => position.y)).size).toBe(1);
  expect(cardPositions[0].x).toBeLessThan(cardPositions[1].x);
  await expect(page.getByText(/i am a photographer/i)).toHaveCount(0);
});

test('keeps contact direct and email-only', async ({ page }) => {
  await page.goto('/#contact');
  await expect(page.locator('[data-contact-form]')).toHaveCount(0);
  await expect(page.locator('#contact').getByRole('link', { name: 'Email Leon' })).toHaveAttribute(
    'href',
    'mailto:sites.by.leon@gmail.com',
  );
});

test('keeps marketing section labels concise', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#services .section-kicker')).toHaveCount(0);
  await expect(page.locator('#contact .section-kicker')).toHaveCount(0);
  await expect(page.locator('#work .section-kicker')).toHaveCount(0);
  await expect(page.locator('#pricing .section-kicker')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Check out our examples.', exact: true })).toBeVisible();
});

test('publishes correct metadata for the full marketing preview', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Sites By Leon');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Websites and hosting for photographers, with portfolio pages, inquiries, payments, updates, and direct support.',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://leonsites.org/',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Sites By Leon',
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    'https://leonsites.org/',
  );
});

test('shows a minimal standalone coming-soon page for production', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-31T15:00:00.000Z') });
  await page.goto('/coming-soon');

  await expect(page.getByRole('heading', { level: 1, name: 'July 31' })).toBeVisible();
  await expect(page.getByText('We go public July 31 at noon Eastern time.')).toBeVisible();
  await expect(page.locator('.coming-soon')).toHaveAttribute('data-motion-surface', 'coming-soon');
  await expect(page.locator('.coming-soon')).toHaveAttribute('data-launch-at', '2026-07-31T12:00:00-04:00');
  await expect(page.locator('[data-coming-image]')).toHaveCount(3);
  await expect(page.locator('[data-coming-content]')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /sites\.by\.leon@gmail\.com/ })).toHaveAttribute(
    'href',
    'mailto:sites.by.leon@gmail.com',
  );
  await expect(page.getByRole('link', { name: /Instagram/ })).toHaveAttribute(
    'href',
    'https://www.instagram.com/sites.by.leon/',
  );
  await expect(page.getByText('Photography websites from')).toContainText('$25/month');
  await expect(page.locator('.coming-soon')).not.toContainText('Websites for photographers');
  await expect(page.locator('.host-preview,.hero,.website-concept,.pricing,.services')).toHaveCount(0);
  await expect(page.locator('.coming-soon__gallery img')).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText('Show off your photography');
  await expect(page.locator('.coming-soon .brand-mark img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://leonsites.org/');
});

test('orchestrates the coming-soon entrance', async ({ page }) => {
  await page.goto('/coming-soon');

  const images = page.locator('[data-coming-image]');
  const veil = page.locator('.coming-soon__veil');
  await expect(images.nth(0)).toHaveCSS('animation-name', 'coming-image-enter');
  await expect(images.nth(0)).toHaveCSS('animation-delay', '0s');
  await expect(images.nth(1)).toHaveCSS('animation-delay', '0.07s');
  await expect(images.nth(2)).toHaveCSS('animation-delay', '0.14s');
  await expect(veil).toHaveCSS('animation-name', 'coming-veil-enter');
  await expect(veil).toHaveCSS('animation-duration', '0.7s');
  await expect(veil).toHaveCSS('animation-delay', '0s');
  await expect(veil).toHaveCSS('transform', 'none');
  await expect(page.locator('.coming-soon__content .brand-mark')).toHaveCSS('animation-delay', '0.22s');
  await expect(page.locator('.coming-soon__message')).toHaveCSS('animation-delay', '0.3s');
  await expect(page.locator('.coming-soon__links')).toHaveCSS('animation-delay', '0.38s');
});

test('uses a fade-only coming-soon entrance for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/coming-soon');

  const images = page.locator('[data-coming-image]');
  const content = page.locator('[data-coming-content]');
  const message = page.locator('.coming-soon__message[data-coming-content]');
  const links = page.locator('.coming-soon__links[data-coming-content]');
  await expect(images).toHaveCount(3);
  await expect(content).toHaveCount(2);

  for (const element of [
    links,
    images.nth(0),
    images.nth(1),
    images.nth(2),
    page.locator('.coming-soon__veil'),
    page.locator('.coming-soon__content .brand-mark'),
    message,
  ]) {
    await expect(element).toHaveCSS('animation-name', 'coming-fade-only');
    await expect(element).toHaveCSS('animation-duration', '0.2s');
    await expect(element).toHaveCSS('animation-delay', '0s');
  }
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('counts down to noon Eastern on July 31', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-30T15:59:54.000Z') });
  await page.clock.pauseAt(new Date('2026-07-30T15:59:55.000Z'));
  await page.goto('/coming-soon');

  await expect(page.locator('[data-countdown-value="days"]')).toHaveText('01');
  await expect(page.locator('[data-countdown-value="hours"]')).toHaveText('00');
  await expect(page.locator('[data-countdown-value="minutes"]')).toHaveText('00');
  await expect(page.locator('[data-countdown-value="seconds"]')).toHaveText('05');
  await expect(page.getByRole('timer')).toHaveAttribute(
    'aria-label',
    '1 day, 0 hours, 0 minutes, and 5 seconds until launch',
  );

  await page.clock.runFor(1_000);
  await expect(page.locator('[data-countdown-value="seconds"]')).toHaveText('04');
});

test('settles into a launched state after the deadline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-31T16:00:01.000Z') });
  await page.goto('/coming-soon');

  await expect(page.locator('.coming-soon')).toHaveAttribute('data-launched', 'true');
  await expect(page.getByText('Sites By Leon is now public.')).toBeVisible();
  await expect(page.locator('[data-countdown-value]')).toHaveText(['00', '00', '00', '00']);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`centers coming soon without overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/coming-soon');

    const layout = await page.locator('.coming-soon').evaluate(async (root) => {
      await Promise.all(root.getAnimations({ subtree: true }).map((animation) => animation.finished));
      const heading = root.querySelector('h1')!.getBoundingClientRect();
      const logo = root.querySelector('.brand-mark')!.getBoundingClientRect();
      const message = root.querySelector<HTMLElement>('.coming-soon__message')!.getBoundingClientRect();
      const links = root.querySelector<HTMLElement>('.coming-soon__links')!.getBoundingClientRect();
      return {
        headingCenterX: heading.left + heading.width / 2,
        logoLeft: logo.left,
        logoTop: logo.top,
        messageTop: message.top,
        messageBottom: message.bottom,
        linksLeft: links.left,
        linksRight: links.right,
        linksBottom: links.bottom,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    expect(Math.abs(layout.headingCenterX - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(layout.logoLeft).toBeLessThan(viewport.width / 10);
    expect(layout.logoTop).toBeLessThan(viewport.height / 10);
    expect(layout.messageTop).toBeGreaterThanOrEqual(0);
    expect(layout.messageBottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.linksLeft).toBeGreaterThanOrEqual(0);
    expect(layout.linksRight).toBeLessThanOrEqual(viewport.width);
    expect(layout.linksBottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.overflow).toBe(false);
  });
}

test('publishes the privacy and terms pages', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice.');
  await expect(page.locator('main .section-kicker')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Information collected' })).toBeVisible();
  await expect(page.getByText(/uploaded images/)).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing');
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Website and service terms.');
  await expect(page.locator('main .section-kicker')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Customer responsibilities' })).toBeVisible();
  await expect(page.getByText(/connected Stripe account/)).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/#contact');
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

test('keeps content visible without spatial motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-motion-scenes', 'opacity-feedback');
  await expect(page.locator('[data-motion-depth="concept"]').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('[data-motion-depth="pricing"]').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.services [data-reveal]').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('keeps reduced-motion press and image hover feedback spatially still', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const settledMotion = (selector: string) =>
    page.locator(selector).first().evaluate(async (element) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
      const style = getComputedStyle(element);
      return { scale: style.scale, transform: style.transform };
    });

  const button = page.locator('.button').first();
  await button.hover();
  await button.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  await page.mouse.down();
  expect((await settledMotion('.button')).transform).toBe('none');
  await page.mouse.up();

  const heroImage = page.locator('.hero-gallery__image img').first();
  await heroImage.hover();
  expect((await settledMotion('.hero-gallery__image img')).transform).toBe('none');

  const conceptImage = page.locator('.website-concept--northline-portraits .concept-canvas figure img').first();
  await conceptImage.hover();
  const conceptMotion = await settledMotion(
    '.website-concept--northline-portraits .concept-canvas figure img',
  );
  expect(conceptMotion.transform).toBe('none');
  expect(conceptMotion.scale).toBe('none');
});
