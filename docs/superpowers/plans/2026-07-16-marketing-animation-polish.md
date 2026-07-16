# Marketing Animation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish motion on `leonsites.org` and `test.leonsites.org` without changing their established visual design.

**Architecture:** Keep GSAP ScrollTrigger for scroll-driven marketing explanation and plain CSS for the standalone coming-soon entrance. Centralize motion values in `global.css`, branch early for reduced motion in `site.ts`, and preserve server-rendered visibility when JavaScript fails.

**Tech Stack:** Astro 7, TypeScript, GSAP 3.15 ScrollTrigger, CSS, Playwright.

## Global Constraints

- Preserve layout, copy, imagery, typography, colors, component structure, and overall visual identity.
- Do not touch `dashboard/`, `photographer-site/`, billing, infrastructure, or deployment.
- Add no dependencies.
- Animate `transform` and `opacity`; do not animate layout dimensions or positioning offsets.
- Use `--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1)` and `--motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.
- Press feedback is `transform: scale(0.97)` for `160ms` with `--motion-ease-out`.
- Reduced motion removes parallax, 3D rotation, and large position changes while retaining `200ms` opacity/color feedback.

---

### Task 1: Add Marketing Motion Tokens And Acceptance Tests

**Files:**
- Modify: `src/styles/global.css:1-18`
- Modify: `tests/e2e/home.spec.ts:64-80`
- Modify: `tests/e2e/home.spec.ts:151-193`
- Modify: `tests/e2e/home.spec.ts:220-227`

**Interfaces:**
- Produces CSS variables `--motion-fast`, `--motion-medium`, `--motion-slow`, `--motion-ease-out`, and `--motion-ease-in-out` for later tasks.
- Produces the expected `data-motion="reduced"` contract for `site.ts`.

- [ ] **Step 1: Write failing reduced-motion and coming-soon hook assertions**

Update the reduced-motion test to require a non-spatial branch:

```ts
test('keeps content visible without spatial motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('[data-motion-depth="concept"]').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

Extend the existing coming-soon test with stable motion hooks:

```ts
await expect(page.locator('.coming-soon')).toHaveAttribute('data-motion-surface', 'coming-soon');
await expect(page.locator('[data-coming-image]')).toHaveCount(3);
await expect(page.locator('[data-coming-content]')).toHaveCount(2);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --grep "reduced motion|coming-soon"
```

Expected: failure because the page still reports `gsap-scrolltrigger`, the first concept retains a 3D transform, and the coming-soon hooks do not exist.

- [ ] **Step 3: Add the shared token definitions**

Add inside `:root` in `src/styles/global.css`:

```css
--motion-fast: 160ms;
--motion-medium: 240ms;
--motion-slow: 560ms;
--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

- [ ] **Step 4: Run the non-browser checks**

Run:

```bash
pnpm check
pnpm test
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css tests/e2e/home.spec.ts
git commit -m "test: define marketing motion contracts"
```

---

### Task 2: Orchestrate The Coming-Soon Entrance

**Files:**
- Modify: `src/components/ComingSoon.astro:8-25`
- Modify: `src/styles/global.css:325-418`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes the motion tokens from Task 1.
- Produces `data-motion-surface="coming-soon"`, three `data-coming-image` elements, and two `data-coming-content` elements.
- Uses the existing `.brand-mark` as the third content animation target without changing `BrandMark`.

- [ ] **Step 1: Add semantic animation hooks without changing content or layout**

Keep all existing elements and add only attributes and the stagger variable:

```astro
<main class="coming-soon" id="main" data-motion-surface="coming-soon">
  <div class="coming-soon__gallery" aria-hidden="true">
    {images.map((image, index) => (
      <figure
        class={`coming-soon__image coming-soon__image--${index + 1}`}
        data-coming-image
        style={`--coming-index: ${index}`}
      >
        <img src={image.src} alt="" width="1536" height="1024" loading={index === 0 ? 'eager' : 'lazy'} />
      </figure>
    ))}
  </div>

  <div class="coming-soon__veil"></div>

  <div class="coming-soon__content">
    <BrandMark />
    <div class="coming-soon__message" data-coming-content>
      <h1>Coming soon.</h1>
    </div>
    <a data-coming-content href={`mailto:${contactEmail}`}>{contactEmail} <span aria-hidden="true">↗</span></a>
  </div>
</main>
```

Do not wrap or reposition the existing brand mark.

- [ ] **Step 2: Add a one-time CSS entrance using transform and opacity only**

Add to `src/styles/global.css` near the coming-soon styles:

```css
@keyframes coming-image-enter {
  from { opacity: 0; transform: scale(1.025); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes coming-veil-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes coming-content-enter {
  from { opacity: 0; transform: translate3d(var(--coming-content-x, 0%), 1rem, 0); }
  to { opacity: 1; transform: translate3d(var(--coming-content-x, 0%), 0, 0); }
}

.coming-soon [data-coming-image] {
  animation: coming-image-enter 700ms var(--motion-ease-out) both;
  animation-delay: calc(var(--coming-index) * 70ms);
}

.coming-soon__veil {
  animation: coming-veil-enter 700ms var(--motion-ease-out) both;
}

.coming-soon__content .brand-mark,
.coming-soon [data-coming-content] {
  animation: coming-content-enter var(--motion-slow) var(--motion-ease-out) both;
}

.coming-soon__content .brand-mark { animation-delay: 220ms; }
.coming-soon .coming-soon__message { animation-delay: 300ms; }
.coming-soon .coming-soon__content > a { animation-delay: 380ms; }
.coming-soon__content > a { --coming-content-x: -50%; }
```

- [ ] **Step 3: Add the reduced-motion fallback**

Add near the end of `global.css`:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }

  .coming-soon [data-coming-image],
  .coming-soon__veil,
  .coming-soon__content .brand-mark,
  .coming-soon .coming-soon__content > [data-coming-content] {
    animation-duration: 200ms;
    animation-delay: 0ms;
    animation-name: coming-fade-only;
  }
}

@keyframes coming-fade-only {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --grep "coming-soon|centers coming soon"
```

Expected: all matching tests pass. The veil uses its opacity-only entrance, all seven reduced-motion targets use a zero-delay `200ms` fade, and the settled email stays horizontally centered at `390x844` and `1440x900` with no overflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/ComingSoon.astro src/styles/global.css tests/e2e/home.spec.ts
git commit -m "feat: orchestrate coming-soon entrance"
```

---

### Task 3: Refine Test-Site Scroll Motion And Physical Feedback

**Files:**
- Modify: `src/scripts/site.ts:12-229`
- Modify: `src/styles/global.css:196-236`
- Modify: `src/styles/global.css:537-581`
- Modify: `src/styles/global.css:692-702`
- Modify: `src/styles/global.css:1221-1232`
- Modify: `src/styles/global.css:1786-1793`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes the motion tokens from Task 1.
- Preserves `data-motion="gsap-scrolltrigger"` for normal motion.
- Produces `data-motion="reduced"` for reduced motion.

- [ ] **Step 1: Add the reduced-motion branch before any spatial GSAP setup**

At the start of `initializeScrollMotion`, add:

```ts
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reducedMotion) {
  document.documentElement.dataset.motion = 'reduced';
  document.documentElement.dataset.motionScenes = 'opacity-feedback';
  gsap.set(revealItems, { autoAlpha: 1, clearProps: 'transform' });
  return;
}
```

Keep contact-form initialization outside this function so form behavior is unchanged.

- [ ] **Step 2: Tighten existing reveal and depth values**

Use these exact target values in `site.ts`:

```ts
gsap.set(batchedRevealItems, { y: 20 });
// onEnter target
{ y: 0, duration: 0.56, stagger: 0.055, ease: 'power3.out', overwrite: true }

// hero image start values
const startY = [4, -4, 5][index] ?? 3;
const startRotation = [-1, 1.2, -1.2][index] ?? 0;
// hero target scale
scale: 1.015

// concept browser start
{
  transformPerspective: 1600,
  rotationX: 5,
  rotationY: direction * 6,
  z: -80,
  scale: 0.97,
  transformOrigin: '50% 45%',
}

// mobile concept entrance
{ y: 24, rotation: index % 2 === 0 ? -0.6 : 0.6, scale: 0.985 }
// mobile target
{ y: 0, rotation: 0, scale: 1, duration: 0.56, ease: 'power3.out' }
```

- [ ] **Step 3: Replace pricing 3D rotation with a readable stagger**

Replace the desktop pricing `fromTo` values with:

```ts
gsap.fromTo(
  pricingCards,
  { y: 24, autoAlpha: 0.88 },
  {
    y: 0,
    autoAlpha: 1,
    duration: 0.42,
    stagger: 0.055,
    ease: 'power3.out',
    scrollTrigger: { trigger: pricingGrid, start: 'clamp(top 82%)', once: true },
  },
);
```

Do not change pricing card markup, dimensions, mobile overflow, or scroll snapping.

- [ ] **Step 4: Remove competing CSS reveal transforms and permanent layer hints**

Delete the `.js [data-reveal]` and `.js [data-reveal].is-visible` rules because GSAP owns those transforms. Remove permanent `will-change: transform` from `.concept-browser` and `.pricing-card`; do not replace it globally.

- [ ] **Step 5: Add press feedback and pointer-gated hover movement**

Update `.button` transitions and add the active state:

```css
.button {
  transition:
    background-color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    color var(--motion-fast) ease,
    transform var(--motion-fast) var(--motion-ease-out);
}

.button:active { transform: scale(0.97); }
```

Wrap image hover movement in:

```css
@media (hover: hover) and (pointer: fine) {
  .hero-gallery__image:hover img,
  .concept-canvas figure:hover img {
    filter: saturate(1.06) contrast(1.02);
    transform: scale(1.018);
  }
}
```

Change the image transition to `filter var(--motion-medium) ease, transform var(--motion-medium) var(--motion-ease-out)`.

- [ ] **Step 6: Run checks and browser tests**

Run:

```bash
pnpm check
pnpm test
pnpm build
pnpm exec playwright test tests/e2e/home.spec.ts
```

Expected: every command passes. The normal-motion concept transform still changes with scroll, reduced motion uses `transform: none`, and all width/centering checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/site.ts src/styles/global.css tests/e2e/home.spec.ts
git commit -m "feat: polish marketing motion"
```

## Feel Check

- At `1440x900`, reload `/coming-soon`: image tiles settle first, then logo, headline, and email; nothing changes position after settling.
- At `390x844`, reload `/coming-soon`: no horizontal overflow and the headline remains centered.
- At `1440x900`, scroll `/`: hero depth is subtle, concept frames settle toward the viewer, pricing remains readable throughout its short entrance, and buttons compress slightly on press.
- In browser slow-motion playback, no section entrance restarts from a hidden state after it has completed.
- With reduced motion enabled, reload both routes: all content is immediately legible, movement is absent, and only brief opacity/color feedback remains.

## Boundaries

- Do not edit `src/content/site.ts` or any component copy.
- Do not change HTML hierarchy except the minimal coming-soon animation hooks described above.
- Do not add navigation, carousel controls, custom cursors, continuous loops, or new visual decoration.
- Do not deploy or push.
