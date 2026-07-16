# Photographer Demo Animation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish public motion on `demo.leonsites.org` while preserving the current Northline Sports design and content.

**Architecture:** Keep GSAP for page entrances/image drift, Motion for scroll-linked reel transforms, and React Spring for fine-pointer tilt. Add an explicit reduced-motion branch, convert Motion shorthand positions to full compositor-safe transform strings, and tighten repeated hover/viewport behavior.

**Tech Stack:** Astro 6, React 19, GSAP 3.15, Motion 12, React Spring 10, CSS, Vitest, Playwright.

## Global Constraints

- Preserve layout, copy, imagery, crops, typography, colors, theme controls, component structure, and overall visual identity.
- Public pages only; do not touch `photographer-site/src/pages/admin`, admin components, or `studio-admin.css`.
- Add no dependencies.
- Use `--motion-fast: 160ms`, `--motion-medium: 240ms`, `--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, and `--motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.
- Reduced motion removes image drift, parallax, pointer tilt, and large position changes while retaining `200ms` opacity/color feedback.
- Do not animate the sticky navigation.

---

### Task 1: Establish The Demo Reduced-Motion Contract

**Files:**
- Modify: `photographer-site/src/styles/site.css:8-20`
- Modify: `photographer-site/src/scripts/motion.ts:10-85`
- Modify: `photographer-site/tests/e2e/public-site.spec.ts:135-155`

**Interfaces:**
- Produces `data-motion="gsap-always"` for normal motion and `data-motion="reduced"` for reduced motion.
- Keeps `data-motion-scenes="editorial-entrance image-drift scroll-progress"` in normal mode and sets `data-motion-scenes="editorial-fade"` in reduced mode.

- [ ] **Step 1: Change the failing reduced-motion acceptance test**

Replace the current test that requires always-on motion under reduced motion with:

```ts
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
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
pnpm --dir photographer-site exec playwright test tests/e2e/public-site.spec.ts --grep "reduced motion"
```

Expected: failure because the page reports `gsap-always` and the hero image still has the GSAP scale/drift transform.

- [ ] **Step 3: Add shared demo motion tokens**

Add inside `:root` in `photographer-site/src/styles/site.css`:

```css
--motion-fast: 160ms;
--motion-medium: 240ms;
--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--motion-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

- [ ] **Step 4: Branch GSAP setup with `gsap.matchMedia`**

Inside the existing `gsap.context`, use:

```ts
const motionMedia = gsap.matchMedia();

motionMedia.add('(prefers-reduced-motion: no-preference)', () => {
  document.documentElement.dataset.motion = 'gsap-always';
  document.documentElement.dataset.motionScenes = 'editorial-entrance image-drift scroll-progress';

  const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } });
  entrance
    .fromTo('[data-site-header]', { yPercent: -105 }, { yPercent: 0, duration: 0.48 })
    .fromTo(
      '[data-entrance]',
      { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 0.64, stagger: 0.055 },
      '-=0.18',
    );

  // Keep the existing image-drift and scroll-progress setup in this branch.
});

motionMedia.add('(prefers-reduced-motion: reduce)', () => {
  document.documentElement.dataset.motion = 'reduced';
  document.documentElement.dataset.motionScenes = 'editorial-fade';
  gsap.set('[data-site-header], [data-image-drift]', { clearProps: 'transform' });
  gsap.fromTo(
    '[data-entrance]',
    { autoAlpha: 0.88 },
    { autoAlpha: 1, duration: 0.2, stagger: 0.03, ease: 'power3.out' },
  );
  gsap.set('[data-scroll-progress]', { scaleX: 1, transformOrigin: 'left center' });
});
```

Return `() => motionMedia.revert()` from the context callback or call `motionMedia.revert()` in the existing cleanup so media-query changes are fully cleaned up.

- [ ] **Step 5: Add the CSS reduced-motion baseline**

Add:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

- [ ] **Step 6: Verify focused checks**

Run:

```bash
pnpm --dir photographer-site check
pnpm --dir photographer-site test
pnpm --dir photographer-site exec playwright test tests/e2e/public-site.spec.ts --grep "motion"
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add photographer-site/src/styles/site.css photographer-site/src/scripts/motion.ts photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: respect reduced motion on demo"
```

---

### Task 2: Make The Selected Work Reel Compositor-Safe And One-Time

**Files:**
- Modify: `photographer-site/src/components/SelectedWorkReel.tsx:47-91`
- Modify: `photographer-site/src/components/SelectedWorkReel.tsx:94-199`
- Modify: `photographer-site/src/components/SelectedWorkReel.tsx:202-249`
- Modify: `photographer-site/tests/selected-work-reel.test.tsx`

**Interfaces:**
- Keeps the current `SelectedWorkReel({ galleries, tone })` interface and DOM structure.
- Keeps React Spring tilt values and all existing image crop variables.

- [ ] **Step 1: Add a source-level regression test for Motion shorthand**

In `photographer-site/tests/selected-work-reel.test.tsx`, import `readFile` and add:

```ts
import { readFile } from 'node:fs/promises';

it('uses full transform strings for scroll-linked motion', async () => {
  const source = await readFile(
    new URL('../src/components/SelectedWorkReel.tsx', import.meta.url),
    'utf8',
  );

  expect(source).not.toContain('style={{ y }}');
  expect(source).not.toContain('style={{ x: headingX }}');
  expect(source).toContain('translate3d');
  expect(source).toContain('once: true');
});
```

- [ ] **Step 2: Run the unit test and verify failure**

Run:

```bash
pnpm --dir photographer-site test -- selected-work-reel.test.tsx
```

Expected: failure because both shorthand styles and `once: false` are present.

- [ ] **Step 3: Convert frame drift to a full transform string**

After the existing `y` transform in `ReelFrame`, add:

```ts
const imageTransform = useTransform(y, (value) => `translate3d(0, ${value}px, 0)`);
```

Then change:

```tsx
<motion.div className="work-project__image-drift" style={{ transform: imageTransform }}>
```

- [ ] **Step 4: Convert project entrance and heading movement**

Change the non-reduced project entrance to:

```ts
{ opacity: [0.78, 1], transform: ['translate3d(0, 36px, 0)', 'translate3d(0, 0, 0)'] }
```

Change both frame and project viewport settings to `once: true`.

After `headingX`, add:

```ts
const headingTransform = useTransform(
  headingX,
  (value) => `translate3d(${value}, 0, 0)`,
);
```

Then render:

```tsx
<motion.h2 id="selected-work-title" style={{ transform: headingTransform }}>
```

Do not change the React Spring `animated.a` transform; it already emits one full perspective/rotate/scale transform string.

- [ ] **Step 5: Run unit and public browser tests**

Run:

```bash
pnpm --dir photographer-site test
pnpm --dir photographer-site exec playwright test tests/e2e/public-site.spec.ts --grep "selected work|always-on motion"
```

Expected: all matching tests pass and the reel remains visible before hydration.

- [ ] **Step 6: Commit**

```bash
git add photographer-site/src/components/SelectedWorkReel.tsx photographer-site/tests/selected-work-reel.test.tsx
git commit -m "perf: composite selected work motion"
```

---

### Task 3: Tighten Demo Hover And Press Feedback

**Files:**
- Modify: `photographer-site/src/components/selected-work-reel.css:221-307`
- Modify: `photographer-site/src/styles/site.css:163-197`
- Modify: `photographer-site/src/styles/site.css:643-656`
- Modify: `photographer-site/src/styles/site.css:729-743`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes the demo motion tokens from Task 1.
- Keeps all existing classes and focus-visible behavior.

- [ ] **Step 1: Add press-feedback assertions**

Add a Playwright test that checks the transition property and active target without relying on screenshot timing:

```ts
test('public calls to action expose restrained physical feedback', async ({ page }) => {
  await page.goto('/');
  const galleryLink = page.locator('.skiper-link').first();
  await expect(galleryLink).toHaveCSS('transition-duration', '0.16s');

  await page.goto('/contact');
  await expect(page.locator('.inquiry-actions button')).toHaveCSS('transition-duration', '0.16s');
});
```

- [ ] **Step 2: Use short tokenized reel transitions**

Change reel styles to:

```css
.work-project__frame img {
  transition: filter var(--motion-medium) ease;
}

.work-project__light {
  transition: opacity var(--motion-medium) ease;
}

.skiper-link {
  transition: transform var(--motion-fast) var(--motion-ease-out);
}

.skiper-link:active { transform: scale(0.97); }

.skiper-link::after {
  transition: transform var(--motion-medium) var(--motion-ease-out);
}

.skiper-link svg {
  transition:
    opacity var(--motion-medium) ease,
    transform var(--motion-medium) var(--motion-ease-out);
}
```

- [ ] **Step 3: Gate pointer hover while preserving keyboard focus**

Keep `:focus-visible` rules outside media queries. Move only `:hover` movement/filter rules into:

```css
@media (hover: hover) and (pointer: fine) {
  .work-project__media:hover .work-project__light { opacity: 1; }
  .work-project__media:hover .work-project__frame img { filter: saturate(1.06) contrast(1.025); }
  .skiper-link:hover::after { transform: scaleX(1); transform-origin: left center; }
  .skiper-link:hover svg { opacity: 1; transform: translate(0, 0); }
}
```

- [ ] **Step 4: Add press feedback to explicit public CTAs**

Add transform transitions and active states to `.email-action` and `.inquiry-actions button` in `site.css`:

```css
.email-action,
.inquiry-actions button {
  transition:
    background-color var(--motion-fast) ease,
    color var(--motion-fast) ease,
    transform var(--motion-fast) var(--motion-ease-out);
}

.email-action:active,
.inquiry-actions button:active {
  transform: scale(0.97);
}
```

Do not apply press scaling to the sticky primary navigation.

- [ ] **Step 5: Run full photographer verification**

Run:

```bash
pnpm --dir photographer-site check
pnpm --dir photographer-site test
pnpm --dir photographer-site build
pnpm --dir photographer-site exec playwright test
```

Expected: every command passes, including mobile overflow, accessibility, pre-hydration reel, and public inquiry tests.

- [ ] **Step 6: Commit**

```bash
git add photographer-site/src/components/selected-work-reel.css photographer-site/src/styles/site.css photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: refine demo interaction feedback"
```

## Feel Check

- At `1440x900`, reload the demo: the editorial entrance plays once, the reel remains cinematic, and project/frame entrances do not replay when scrolling back.
- Move a fine-pointer cursor over project media: tilt and light remain subtle, responsive, and easy to interrupt.
- At `390x844`, confirm no tilt/light hover effect initializes and all reel frames retain the current responsive grid.
- With reduced motion enabled, confirm header/content fade briefly, images do not drift, the reel does not translate, and all content remains visible.
- In slow motion, links and form buttons compress to `0.97` without shifting adjacent layout.

## Boundaries

- Do not edit demo content, gallery data, theme data, crop values, or image markup.
- Do not change reel layout, spacing, colors, type, or responsive breakpoints.
- Do not touch admin or studio styles.
- Do not deploy or push.
