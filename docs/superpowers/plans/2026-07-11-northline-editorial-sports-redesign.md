# Northline Editorial Sports Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Northline Sports as a calm, light, image-first editorial portfolio with collision-proof layouts, no visible prototype language, functional email contact, and restrained always-on GSAP motion.

**Architecture:** Keep the existing Astro routes, content repository, local sports images, semantic page structure, and Vercel deployment. Replace the broadcast-style component markup and CSS with a single light editorial system, simplify motion to entrance and image-parallax scenes, and encode the approved visible-copy and responsive-layout requirements in Playwright tests.

**Tech Stack:** Astro 6, TypeScript, native CSS, GSAP 3 with ScrollTrigger, Vitest, Playwright, axe-core, Vercel adapter, local Fontsource packages.

## Global Constraints

- Keep the public routes `/`, `/work`, `/work/[slug]`, `/packages`, `/contact`, `/journal`, `/journal/[slug]`, `/invoice/[token]`, `/maintenance`, and `/api/health` stable.
- Keep primary navigation labels Work, Services, and Contact.
- Use one light theme with Paper `#f7f7f3`, Ink `#171918`, Muted ink `#6f736f`, Rule `#d8dad5`, and Northline red `#b63a32`.
- Use Newsreader for editorial display type, Manrope for body and navigation, and IBM Plex Mono for utility metadata.
- Use square images and controls with no decorative rounding.
- Public body-copy paragraphs contain no more than 25 words.
- No visible page text may contain `demo`, `fictional`, `concept`, `sample`, or prototype labels.
- No public checkout is offered; service links start a conversation.
- Motion remains enabled without a user-facing toggle and may animate only transforms and opacity.
- The photographer `/studio` dashboard is not part of this plan.

---

### Task 1: Lock the redesign contract with failing browser tests

**Files:**
- Modify: `photographer-site/tests/e2e/public-site.spec.ts`
- Modify: `photographer-site/tests/content.test.ts`

**Interfaces:**
- Consumes: existing public routes and `demoPortfolio` fixture data.
- Produces: regression coverage for prototype-language removal, collision-free page heads, the editorial image grid, direct-email contact, service rows, mobile overflow, and simplified motion scenes.

- [ ] **Step 1: Replace the outdated homepage and motion assertions**

```ts
test('home is an image-first editorial sports portfolio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Northline Sports' })).toBeVisible();
  await expect(page.getByText('Sports photography for teams and athletes.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-portfolio-item]')).toHaveCount(3);
  await expect(page.locator('[data-portfolio-item] img')).toHaveCount(3);
  await expect(page.locator('.scorebug,.highlight-index,.work-card-number')).toHaveCount(0);
});

test('always-on motion uses editorial reveal and image drift scenes', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(700);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'gsap-always');
  await expect(page.locator('html')).toHaveAttribute(
    'data-motion-scenes',
    'editorial-entrance image-drift scroll-progress',
  );
  await expect(page.getByRole('button', { name: 'Motion' })).toHaveCount(0);
});
```

- [ ] **Step 2: Add a public-copy and direct-contact regression**

```ts
test('public pages contain no prototype language and contact uses email', async ({ page }) => {
  for (const path of ['/', '/work', '/work/friday-night', '/packages', '/contact', '/journal', '/invoice/example']) {
    await page.goto(path);
    await expect(page.locator('main, footer')).not.toContainText(/demo|fictional|concept|sample|prototype/i);
  }

  await page.goto('/contact');
  await expect(page.getByRole('link', { name: 'Send email' })).toHaveAttribute(
    'href',
    'mailto:hello@northlinesports.example',
  );
  await expect(page.locator('form')).toHaveCount(0);
});
```

- [ ] **Step 3: Add a geometric overlap regression for page headings**

```ts
test('gallery titles and descriptions never overlap', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/work/friday-night');
    const boxes = await page.evaluate(() => {
      const title = document.querySelector('.gallery-intro h1')!.getBoundingClientRect();
      const notes = document.querySelector('.gallery-intro-notes')!.getBoundingClientRect();
      return { title: { bottom: title.bottom }, notes: { top: notes.top } };
    });
    expect(boxes.title.bottom).toBeLessThanOrEqual(boxes.notes.top);
  }
});
```

- [ ] **Step 4: Update the content notice test to require no public notice**

```ts
it('does not expose prototype labeling as portfolio content', () => {
  expect(demoPortfolio.conceptNotice).toBe('');
});
```

- [ ] **Step 5: Run the focused tests and confirm they fail before implementation**

Run: `pnpm test && pnpm test:e2e -- --grep "editorial|prototype language|never overlap"`

Expected: unit failure because `conceptNotice` is not empty, and browser failures because the broadcast markup, disabled form, and old motion-scene contract still exist.

- [ ] **Step 6: Commit the failing contract**

```bash
git add photographer-site/tests
git commit -m "test: define Northline editorial redesign contract"
```

---

### Task 2: Build the editorial foundation, header, and footer

**Files:**
- Modify: `photographer-site/package.json`
- Modify: `photographer-site/pnpm-lock.yaml`
- Modify: `photographer-site/src/layouts/SiteLayout.astro`
- Modify: `photographer-site/src/components/SiteHeader.astro`
- Modify: `photographer-site/src/components/SiteFooter.astro`
- Modify: `photographer-site/src/lib/content/demo.ts`
- Modify: `photographer-site/src/styles/site.css`

**Interfaces:**
- Consumes: `Portfolio.studioName`, `Portfolio.email`, and `Portfolio.location`.
- Produces: a stable `SiteLayout` with a 72-pixel editorial header, typographic Northline wordmark, light page tokens, footer navigation, and empty `conceptNotice`.

- [ ] **Step 1: Install the two approved local font packages**

Run: `pnpm add @fontsource-variable/newsreader@5.2.8 @fontsource/ibm-plex-mono@5.2.8`

Expected: both dependencies appear in `package.json` and the lockfile resolves without peer errors.

- [ ] **Step 2: Replace the wordmark and header markup**

```astro
<header class="site-header" data-site-header>
  <a class="wordmark" href="/" aria-label={`${studioName}, home`}>Northline Sports</a>
  <nav class="primary-nav" aria-label="Primary">
    <a href="/work">Work</a>
    <a href="/packages">Services</a>
    <a href="/contact">Contact</a>
  </nav>
</header>
```

- [ ] **Step 3: Replace the footer with public navigation and email**

```astro
<footer class="site-footer page-gutter">
  <p class="footer-name">{studioName}</p>
  <nav aria-label="Footer">
    <a href="/work">Work</a>
    <a href="/packages">Services</a>
    <a href="/contact">Contact</a>
  </nav>
  <a href={`mailto:${email}`}>{email}</a>
  <p>&copy; {year}</p>
</footer>
```

- [ ] **Step 4: Set `conceptNotice` to an empty string and stop rendering it**

```ts
conceptNotice: '',
```

- [ ] **Step 5: Replace global typography, color, header, footer, and focus styles**

```css
@import '@fontsource-variable/newsreader/index.css';
@import '@fontsource-variable/manrope/index.css';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';

:root {
  --paper: #f7f7f3;
  --ink: #171918;
  --muted: #6f736f;
  --rule: #d8dad5;
  --accent: #b63a32;
  --font-display: 'Newsreader Variable', Georgia, serif;
  --font-body: 'Manrope Variable', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --gutter: clamp(1.25rem, 4vw, 5rem);
  --content: 100rem;
}

.site-header {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--gutter);
  border-bottom: 1px solid var(--rule);
  background: color-mix(in srgb, var(--paper) 94%, transparent);
}
```

- [ ] **Step 6: Run Astro and unit checks**

Run: `pnpm check && pnpm test`

Expected: zero Astro diagnostics and all unit tests pass.

- [ ] **Step 7: Commit the foundation**

```bash
git add photographer-site/package.json photographer-site/pnpm-lock.yaml photographer-site/src
git commit -m "feat: add Northline editorial foundation"
```

---

### Task 3: Recompose the homepage as an image-first portfolio

**Files:**
- Modify: `photographer-site/src/pages/index.astro`
- Modify: `photographer-site/src/components/ContactSheet.astro`
- Modify: `photographer-site/src/styles/site.css`

**Interfaces:**
- Consumes: the three entries in `featuredGalleries` and their local cover images.
- Produces: `[data-editorial-hero]`, `[data-portfolio-grid]`, and three `[data-portfolio-item]` elements used by motion and tests.

- [ ] **Step 1: Replace the broadcast hero with compact editorial copy and two lead images**

```astro
<section class="editorial-hero page-gutter" aria-labelledby="home-title" data-editorial-hero>
  <div class="editorial-hero-copy" data-entrance>
    <h1 id="home-title">Northline Sports</h1>
    <p>Sports photography for teams and athletes.</p>
  </div>
  <div class="editorial-hero-images">
    <figure data-image-drift="slow">
      <img src={featuredGalleries[0].cover.src} alt={featuredGalleries[0].cover.alt} />
    </figure>
    <figure data-image-drift="fast">
      <img src={featuredGalleries[1].cover.src} alt={featuredGalleries[1].cover.alt} />
    </figure>
  </div>
</section>
```

- [ ] **Step 2: Rewrite `ContactSheet` as the selected-work grid**

```astro
<section class="portfolio-section page-gutter" aria-labelledby="selected-work-title">
  <h2 id="selected-work-title">Selected work</h2>
  <ol class="portfolio-grid" data-portfolio-grid>
    {galleries.map((gallery) => (
      <li data-portfolio-item>
        <a href={`/work/${gallery.slug}`}>
          <img src={gallery.cover.src} alt={gallery.cover.alt} loading="lazy" />
          <span><strong>{gallery.title}</strong><small>{gallery.category}</small></span>
        </a>
      </li>
    ))}
  </ol>
</section>
```

- [ ] **Step 3: Replace the large coverage and contact blocks with a service preview and email close**

```astro
<section class="service-preview page-gutter" aria-labelledby="service-preview-title">
  <h2 id="service-preview-title">Photography services</h2>
  <p>Game coverage, season coverage, and athlete sessions.</p>
  <a class="text-link" href="/packages">Services</a>
</section>
<section class="home-contact page-gutter" aria-labelledby="home-contact-title">
  <h2 id="home-contact-title">Need a photographer?</h2>
  <a href={`mailto:${portfolio.email}`}>{portfolio.email}</a>
</section>
```

- [ ] **Step 4: Add desktop and mobile editorial-grid rules**

```css
.editorial-hero-images,
.portfolio-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: clamp(1rem, 2vw, 2rem);
}

.portfolio-grid > :nth-child(3n) {
  grid-column: 1 / -1;
  width: min(72%, 64rem);
  margin-inline: auto;
}

@media (max-width: 47.99rem) {
  .editorial-hero-images,
  .portfolio-grid { grid-template-columns: 1fr; }
  .portfolio-grid > :nth-child(3n) { grid-column: auto; width: 100%; }
}
```

- [ ] **Step 5: Run the homepage browser contract**

Run: `pnpm test:e2e -- --grep "image-first editorial|mobile home"`

Expected: both homepage tests pass at desktop and iPhone widths.

- [ ] **Step 6: Commit the homepage**

```bash
git add photographer-site/src/pages/index.astro photographer-site/src/components/ContactSheet.astro photographer-site/src/styles/site.css
git commit -m "feat: rebuild Northline editorial homepage"
```

---

### Task 4: Rebuild work archive and gallery layouts without collisions

**Files:**
- Modify: `photographer-site/src/components/GalleryGrid.astro`
- Modify: `photographer-site/src/pages/work/index.astro`
- Modify: `photographer-site/src/pages/work/[slug].astro`
- Modify: `photographer-site/src/styles/site.css`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `Gallery.title`, `Gallery.category`, `Gallery.description`, `Gallery.cover`, and `Gallery.images`.
- Produces: `.page-intro`, `.gallery-intro`, `.gallery-intro-notes`, `.work-grid`, and `.gallery-sequence` with vertically separated heading and description boxes.

- [ ] **Step 1: Replace numbered work cards with clean image captions**

```astro
<ol class="work-grid">
  {galleries.map((gallery) => (
    <li class="work-card">
      <a href={`/work/${gallery.slug}`}>
        <img src={gallery.cover.src} alt={gallery.cover.alt} />
        <span><strong>{gallery.title}</strong><small>{gallery.category}</small></span>
      </a>
    </li>
  ))}
</ol>
```

- [ ] **Step 2: Use one centered intro column on the archive**

```astro
<header class="page-intro page-gutter">
  <h1 id="work-title">Sports photography</h1>
  <p>Football, basketball, and track coverage.</p>
</header>
```

- [ ] **Step 3: Stack the gallery title and description in source order**

```astro
<header class="gallery-intro page-gutter">
  <p class="meta" data-entrance>{gallery.category}</p>
  <h1 data-entrance>{gallery.title}</h1>
  <div class="gallery-intro-notes" data-entrance>
    <p>{gallery.description}</p>
    <p>{gallery.images.length} photographs</p>
  </div>
</header>
```

- [ ] **Step 4: Create the editorial gallery rhythm**

```css
.gallery-intro {
  display: flex;
  min-height: 32rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding-block: 10rem 5rem;
  text-align: center;
}

.gallery-intro h1 { margin: 0; max-width: 12ch; font-size: clamp(4rem, 10vw, 9rem); }
.gallery-intro-notes { max-width: 34rem; }
.gallery-sequence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; }
.gallery-frame:nth-child(3n) { grid-column: 1 / -1; width: min(76%, 72rem); margin-inline: auto; }
```

- [ ] **Step 5: Run overlap, overflow, archive, and gallery tests**

Run: `pnpm test:e2e -- --grep "never overlap|work archive|compact three-frame|representative sports routes"`

Expected: title/description geometry does not overlap and every tested route fits desktop and iPhone widths.

- [ ] **Step 6: Commit work pages**

```bash
git add photographer-site/src/components/GalleryGrid.astro photographer-site/src/pages/work photographer-site/src/styles/site.css photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: rebuild Northline editorial galleries"
```

---

### Task 5: Simplify services, contact, journal, and invoice pages

**Files:**
- Modify: `photographer-site/src/pages/packages.astro`
- Modify: `photographer-site/src/pages/contact.astro`
- Delete: `photographer-site/src/components/InquiryForm.astro`
- Modify: `photographer-site/src/pages/journal/index.astro`
- Modify: `photographer-site/src/pages/journal/[slug].astro`
- Modify: `photographer-site/src/pages/invoice/[token].astro`
- Modify: `photographer-site/src/styles/site.css`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: package data, journal data, and `Portfolio.email`.
- Produces: `.service-list`, `.contact-page`, `.journal-list`, `.journal-story`, and a token-independent invoice-unavailable page.

- [ ] **Step 1: Replace package cards with editorial service rows**

```astro
<section class="service-list page-gutter" aria-label="Photography services">
  {portfolio.packages.map((item) => (
    <article class="service-row">
      <div><h2>{item.name}</h2><p>{item.description}</p></div>
      <p class="service-price">{item.startingPrice}</p>
      <a href={`/contact?package=${encodeURIComponent(item.id)}`}>Ask about coverage</a>
    </article>
  ))}
</section>
```

- [ ] **Step 2: Remove the disabled form and add one direct email action**

```astro
<main class="contact-page page-gutter">
  <h1>Contact Northline</h1>
  <p>Send the sport, date, and location.</p>
  <a class="email-link" href={`mailto:${portfolio.email}`}>Send email</a>
  <p>{portfolio.email}</p>
</main>
```

- [ ] **Step 3: Restyle journal cards and stories with the shared page intro and image rhythm**

```astro
<header class="page-intro page-gutter">
  <h1 id="journal-title">Photography notes</h1>
  <p>Football, basketball, and track.</p>
</header>
```

- [ ] **Step 4: Replace invoice prototype copy with an unavailable state and contact link**

```astro
<section class="invoice-placeholder page-gutter" aria-labelledby="invoice-placeholder-title">
  <h1 id="invoice-placeholder-title">This payment link is unavailable.</h1>
  <a href="/contact">Contact Northline</a>
</section>
```

- [ ] **Step 5: Delete the unused form component and scan visible source strings**

Run: `rg -n -i "demo|fictional|concept|sample|prototype" photographer-site/src`

Expected: matches may remain only in internal import identifiers and content filenames; no string literal rendered by an Astro template contains a banned word.

- [ ] **Step 6: Run service, contact, journal, invoice, and public-copy tests**

Run: `pnpm test:e2e -- --grep "prototype language|coverage packages|contact|field notes|invoice"`

Expected: all selected tests pass.

- [ ] **Step 7: Commit the supporting pages**

```bash
git add photographer-site/src photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: simplify Northline supporting pages"
```

---

### Task 6: Replace broadcast motion with editorial motion and verify production

**Files:**
- Modify: `photographer-site/src/scripts/motion.ts`
- Modify: `photographer-site/src/styles/site.css`
- Modify: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `[data-site-header]`, `[data-entrance]`, `[data-image-drift]`, and `[data-scroll-progress]` markup.
- Produces: `data-motion="gsap-always"`, `data-motion-scenes="editorial-entrance image-drift scroll-progress"`, cleaned GSAP contexts, and transform-only scroll scenes.

- [ ] **Step 1: Remove horizontal reel and alternating section translation scenes**

Delete ScrollTriggers targeting `[data-highlight-reel]`, `[data-highlight-track]`, `[data-highlight-panel]`, and `[data-motion-section]`.

- [ ] **Step 2: Implement entrance, image drift, and progress scenes**

```ts
document.documentElement.dataset.motion = 'gsap-always';
document.documentElement.dataset.motionScenes = 'editorial-entrance image-drift scroll-progress';

const context = gsap.context(() => {
  gsap.fromTo('[data-entrance]', { autoAlpha: 0, y: 24 }, {
    autoAlpha: 1, y: 0, duration: 0.72, stagger: 0.08, ease: 'power3.out',
  });

  gsap.utils.toArray<HTMLElement>('[data-image-drift]').forEach((image, index) => {
    gsap.fromTo(image, { yPercent: index % 2 === 0 ? -2 : 2 }, {
      yPercent: index % 2 === 0 ? 4 : -4,
      ease: 'none',
      scrollTrigger: { trigger: image, start: 'top bottom', end: 'bottom top', scrub: 0.5 },
    });
  });
});
```

- [ ] **Step 3: Add cleanup for Astro navigation and page lifecycle**

```ts
const cleanup = () => {
  context.revert();
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  window.__northlineMotionInitialized = false;
};
document.addEventListener('astro:before-swap', cleanup, { once: true });
```

- [ ] **Step 4: Run the full fresh verification suite**

Run: `pnpm check && pnpm test && pnpm build && pnpm test:e2e`

Expected:

- Astro check: zero errors, warnings, and hints.
- Vitest: all tests pass.
- Astro build: exits 0 and writes the Vercel server output.
- Playwright: all desktop and iPhone tests pass with no serious or critical axe violations.

- [ ] **Step 5: Run the final design pre-flight scan**

Run: `rg -n "—|–|scorebug|highlight-index|work-card-number|Demo only|Fictional portfolio|This demo" photographer-site/src`

Expected: no visible-design matches.

- [ ] **Step 6: Capture and inspect desktop and iPhone screenshots**

Open `/`, `/work/friday-night`, `/packages`, and `/contact` at 1440 by 1000 and 390 by 844. Confirm centered titles, no collision, balanced image rhythm, one light theme, working navigation, and no horizontal overflow.

- [ ] **Step 7: Commit verified motion and final polish**

```bash
git add photographer-site
git commit -m "feat: finish Northline editorial sports redesign"
```

- [ ] **Step 8: Publish the private GitHub repository and verify Vercel**

Update `sitesbyleons/northline-portraits-demo` `main` with the verified source. Confirm the Vercel production deployment is READY and its GitHub metadata points to the new commit.

- [ ] **Step 9: Verify the live production site**

Check `https://northline-portraits-demo.vercel.app/`, `/work/friday-night`, `/packages`, and `/contact`. Confirm the live text, images, motion attributes, and responsive widths match the local verified build.
