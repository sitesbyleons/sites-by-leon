# sites.by.leon Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, design, verify, and publish the cinematic `sites.by.leon` marketing portfolio with three honest concept projects, monthly packages, and a reliable contact path.

**Architecture:** Astro generates a static, accessible marketing site whose source and history live in GitHub. Cloudflare Pages builds the repository for production because GitHub's published Pages policy prohibits using Pages to run an online business; Supabase is isolated behind a configurable contact adapter so the static site remains usable by direct email before the project is connected. Clerk is reserved for the separate server-rendered Phase 2 dashboard and protected owner/admin areas, so Phase 1 does not ship a nonfunctional login. Penpot holds the responsive design system and approved desktop/mobile screens, while Canva supplies the signature-mark exploration and promotional brand asset.

**Tech Stack:** Astro 7.0.7, TypeScript 6.0.3, pnpm 11.7.0, Vitest 4.1.10, Playwright 1.61.1, Axe Playwright 4.12.1, Fontsource Variable 5.2.8, Penpot, Canva, GitHub, Cloudflare Pages, Supabase Edge Functions.

## Global Constraints

- The primary call to action is **Contact**, and the direct address is `sites.by.leon@gmail.com`.
- The business sells website design, hosting, maintenance, and support to photographers; the copy must never imply Leon is a photographer.
- The initial monthly packages are Essential at $30, Studio at $65, and Signature at $100, with no separate build fee.
- `Vow & Light`, `Northline Portraits`, and `Fieldwork Commercial` must each display **Concept Project** visibly.
- The design uses graphite, warm ivory, muted silver, and a controlled electric-blue accent.
- The interface must meet WCAG AA contrast, visible-focus, keyboard, and reduced-motion requirements.
- No Clerk secret key, Supabase service-role key, Stripe secret, or other secret may enter browser code or the Git repository.
- GitHub is the source repository; Cloudflare Pages is the production web host.
- Clerk login/organizations, subscriptions, and Stripe Connect are separate Phase 2 and Phase 3 launch gates and must not be advertised as active functionality in Phase 1.

---

## File Map

- `package.json` — pinned dependencies and quality/build scripts.
- `astro.config.mjs` — static-site URL and build configuration.
- `tsconfig.json` — strict Astro TypeScript settings.
- `vitest.config.ts` — unit-test discovery and coverage boundary.
- `playwright.config.ts` — local production-preview browser tests.
- `src/content/site.ts` — typed source of truth for navigation, concepts, packages, services, and process steps.
- `src/lib/contact.ts` — contact payload validation and endpoint adapter.
- `src/layouts/BaseLayout.astro` — document metadata, fonts, skip link, and global shell.
- `src/pages/index.astro` — homepage composition only.
- `src/pages/privacy.astro` — concise privacy disclosure for contact inquiries.
- `src/pages/terms.astro` — service-site terms and accuracy notice.
- `src/components/BrandMark.astro` — reusable signature plus wordmark.
- `src/components/SiteHeader.astro` — responsive navigation and Contact action.
- `src/components/Hero.astro` — primary message and lead browser composition.
- `src/components/BrowserMockup.astro` — accessible reusable concept-site browser frame.
- `src/components/ConceptShowcase.astro` — three labeled concept presentations.
- `src/components/PromiseStrip.astro` — three core positioning points.
- `src/components/Process.astro` — four-step engagement flow.
- `src/components/Pricing.astro` — three monthly package cards.
- `src/components/Services.astro` — managed-service details.
- `src/components/Founder.astro` — accurate personal introduction.
- `src/components/Contact.astro` — progressive-enhancement contact form and email fallback.
- `src/components/SiteFooter.astro` — final navigation and legal links.
- `src/styles/global.css` — tokens, layout primitives, motion, responsive behavior, and accessibility states.
- `src/scripts/site.ts` — header state, reveal behavior, and contact submission enhancement.
- `public/images/concepts/*.webp` — optimized concept imagery with no private metadata.
- `public/favicon.svg` — compact `s.l` brand favicon.
- `supabase/functions/contact/index.ts` — validated, rate-limited contact submission handler.
- `supabase/functions/contact/deno.json` — pinned Edge Function imports.
- `tests/content.test.ts` — positioning, pricing, and honest-label unit tests.
- `tests/contact.test.ts` — payload validation and endpoint behavior unit tests.
- `tests/e2e/home.spec.ts` — responsive, navigation, reduced-motion, form, and accessibility tests.
- `.github/workflows/quality.yml` — install, lint-equivalent checks, tests, and build on pushes and pull requests.
- `.env.example` — public contact-function URL and publishable-key names only.
- `README.md` — local development, environment, deployment, and service-boundary instructions.
- `docs/design/penpot.md` — Penpot file link, board names, token inventory, and screenshot review record.
- `docs/design/canva.md` — Canva design link, chosen signature direction, and exported-asset record.

---

### Task 1: Establish the Tested Static Application Foundation

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/content/site.ts`
- Create: `tests/content.test.ts`

**Interfaces:**
- Produces: `Concept`, `Plan`, `Service`, and `ProcessStep` types; `concepts`, `plans`, `services`, `processSteps`, and `navigation` constants.
- Consumes: Approved names, pricing, contact address, and positioning from the design specification.

- [ ] **Step 1: Write the content contract test**

```ts
import { describe, expect, it } from 'vitest';
import { concepts, contactEmail, plans } from '../src/content/site';

describe('launch content', () => {
  it('keeps every portfolio example honest', () => {
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.label === 'Concept Project')).toBe(true);
  });

  it('publishes the approved monthly range without a build fee', () => {
    expect(plans.map((plan) => plan.monthlyPrice)).toEqual([30, 65, 100]);
    expect(plans.every((plan) => plan.buildFee === 0)).toBe(true);
  });

  it('uses the approved contact address', () => {
    expect(contactEmail).toBe('sites.by.leon@gmail.com');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: bundled `pnpm exec vitest run tests/content.test.ts`

Expected: FAIL because `src/content/site.ts` does not exist.

- [ ] **Step 3: Add pinned project configuration and typed content**

Create `package.json` with `astro@7.0.7`, `typescript@7.0.2`, `vitest@4.1.10`, `@playwright/test@1.61.1`, `@axe-core/playwright@4.12.1`, `@fontsource-variable/manrope@5.2.8`, and `@fontsource-variable/cormorant@5.2.8`. Define `dev`, `build`, `preview`, `check`, `test`, and `test:e2e` scripts. Implement the exported content contract with the exact approved names and prices.

```ts
export const contactEmail = 'sites.by.leon@gmail.com';
export const concepts = [
  { slug: 'vow-and-light', name: 'Vow & Light', focus: 'Editorial wedding photography', label: 'Concept Project' },
  { slug: 'northline-portraits', name: 'Northline Portraits', focus: 'Bold portrait studio', label: 'Concept Project' },
  { slug: 'fieldwork-commercial', name: 'Fieldwork Commercial', focus: 'Minimal commercial photography', label: 'Concept Project' },
] as const;
export const plans = [
  { name: 'Essential', monthlyPrice: 30, buildFee: 0 },
  { name: 'Studio', monthlyPrice: 65, buildFee: 0 },
  { name: 'Signature', monthlyPrice: 100, buildFee: 0 },
] as const;
```

- [ ] **Step 4: Install dependencies and verify the contract**

Run: bundled `pnpm install --save-exact`, then bundled `pnpm test -- tests/content.test.ts`.

Expected: lockfile created and all three content tests PASS.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml astro.config.mjs tsconfig.json vitest.config.ts .gitignore src/content/site.ts tests/content.test.ts
git commit -m "chore: establish tested Astro foundation"
```

### Task 2: Create the Brand Assets and Responsive Penpot System

**Files:**
- Create: `docs/design/penpot.md`
- Create: `docs/design/canva.md`
- Create: `public/favicon.svg`

**Interfaces:**
- Produces: Canva signature-design URL, Penpot file URL, desktop board `Homepage / Desktop / 1440`, mobile board `Homepage / Mobile / 390`, and the token names used in CSS.
- Consumes: Approved visual direction and homepage structure.

- [x] **Step 1: Generate Canva signature-mark directions**

Generate logo directions in near-black, warm ivory, and electric blue without cameras, apertures, or photography-business claims. The approved direction is a centered, enlarged, stacked `Sites / By / Leon` signature mark stored in Canva.

- [ ] **Step 2: Create the Penpot file and token foundation**

Create `sites.by.leon — Website System` in the user's Penpot workspace. Add design tokens with these exact names and values:

```text
color/graphite/950 = #090A0C
color/graphite/900 = #101217
color/ivory/100 = #F3EFE6
color/silver/500 = #9A9DA6
color/blue/500 = #4C7DFF
space/2 = 8
space/3 = 12
space/4 = 16
space/6 = 24
space/8 = 32
space/12 = 48
space/20 = 80
radius/sm = 10
radius/md = 18
radius/pill = 999
```

Create reusable Brand Mark, Button, Browser Mockup, Concept Label, and Pricing Card components. Use Cormorant Variable for display text and Manrope Variable for interface text.

- [ ] **Step 3: Build the desktop design section by section**

Build the eleven approved homepage sections inside `Homepage / Desktop / 1440` using auto layout. Validate each section with a screenshot before moving on. The concept labels, package prices, Contact CTA, and direct email must match the content contract exactly.

- [ ] **Step 4: Build and validate the mobile design**

Create `Homepage / Mobile / 390` from the same tokens and component instances. Validate that concept layouts stack cleanly, text is not clipped, controls remain at least 44 pixels tall, and Contact remains reachable.

- [ ] **Step 5: Record artifact links and commit**

Write the Canva and Penpot URLs, chosen direction, board names, tokens, and screenshot review result to the two design records. Create an original `s.l` SVG favicon using the approved palette.

```bash
git add docs/design/penpot.md docs/design/canva.md public/favicon.svg
git commit -m "design: establish cinematic brand system"
```

### Task 3: Build the Accessible Page Shell, Navigation, and Hero

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/BrandMark.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/Hero.astro`
- Create: `src/components/PromiseStrip.astro`
- Create: `src/styles/global.css`
- Create: `src/pages/index.astro`
- Create: `tests/e2e/home.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces: semantic page landmarks, `#main`, `#work`, `#services`, `#pricing`, and `#contact` anchors.
- Consumes: `navigation` and positioning copy from `src/content/site.ts`.

- [ ] **Step 1: Write the failing browser test**

```ts
import { expect, test } from '@playwright/test';

test('hero explains the product and reaches contact', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Websites for photographers');
  await page.getByRole('link', { name: 'Contact', exact: true }).first().click();
  await expect(page.locator('#contact')).toBeInViewport();
});
```

- [ ] **Step 2: Run the production browser test and verify failure**

Run: bundled `pnpm build`, start bundled `pnpm preview`, then bundled `pnpm test:e2e -- tests/e2e/home.spec.ts`.

Expected: FAIL because the homepage shell and hero are absent.

- [ ] **Step 3: Implement the semantic shell and approved hero**

Import the local fonts through Fontsource. Add the skip link, metadata, visible focus ring, responsive header, signature wordmark, hero copy, Contact link, and promise strip. Use CSS custom properties matching the Penpot token names.

- [ ] **Step 4: Verify the page shell**

Run: bundled `pnpm check`, bundled `pnpm build`, and bundled `pnpm test:e2e -- tests/e2e/home.spec.ts`.

Expected: type check and build succeed; hero/contact navigation test PASS.

- [ ] **Step 5: Commit the shell**

```bash
git add src/layouts src/components/BrandMark.astro src/components/SiteHeader.astro src/components/Hero.astro src/components/PromiseStrip.astro src/styles/global.css src/pages/index.astro tests/e2e/home.spec.ts playwright.config.ts
git commit -m "feat: build cinematic homepage shell"
```

### Task 4: Build the Honest Concept Portfolio

**Files:**
- Create: `src/components/BrowserMockup.astro`
- Create: `src/components/ConceptShowcase.astro`
- Create: `public/images/concepts/vow-and-light.webp`
- Create: `public/images/concepts/northline-portraits.webp`
- Create: `public/images/concepts/fieldwork-commercial.webp`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**
- Produces: `BrowserMockup` props `{ name, focus, label, imageSrc, imageAlt, tone }`.
- Consumes: `concepts` from `src/content/site.ts`.

- [ ] **Step 1: Add the failing honesty and image tests**

```ts
test('labels all three examples as concept projects', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Concept Project', { exact: true })).toHaveCount(3);
  await expect(page.locator('#work img')).toHaveCount(3);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: bundled `pnpm test:e2e -- tests/e2e/home.spec.ts -g "concept projects"`.

Expected: FAIL because `#work` and its concept cards do not exist.

- [ ] **Step 3: Add optimized original concept imagery**

Create three visually distinct, licensed-for-use images without visible brands or identifiable private individuals. Remove metadata, convert to WebP, limit each long edge to 1800 pixels, and keep each file below 350 KB. Use descriptive alt text tied to the concept, not generic phrases like `photo`.

- [ ] **Step 4: Implement the reusable browser composition**

Build semantic `article` elements with visible labels, browser chrome, responsive image treatment, focus copy, and desktop/mobile companion framing. Do not make swipe gestures the only way to reach content.

- [ ] **Step 5: Verify and commit the showcase**

Run: bundled `pnpm check`, bundled `pnpm build`, and the full browser test file.

```bash
git add src/components/BrowserMockup.astro src/components/ConceptShowcase.astro src/pages/index.astro public/images/concepts tests/e2e/home.spec.ts
git commit -m "feat: add labeled concept portfolio"
```

### Task 5: Complete Services, Process, Pricing, Founder, and Legal Content

**Files:**
- Create: `src/components/Process.astro`
- Create: `src/components/Pricing.astro`
- Create: `src/components/Services.astro`
- Create: `src/components/Founder.astro`
- Create: `src/components/SiteFooter.astro`
- Create: `src/pages/privacy.astro`
- Create: `src/pages/terms.astro`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `plans`, `services`, `processSteps`, and `contactEmail` from `src/content/site.ts`.
- Produces: `#services`, `#pricing`, founder, footer, privacy, and terms sections/pages.

- [ ] **Step 1: Add failing pricing and claim tests**

```ts
test('shows all monthly options and no build fee', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('$30')).toBeVisible();
  await expect(page.getByText('$65')).toBeVisible();
  await expect(page.getByText('$100')).toBeVisible();
  await expect(page.getByText(/no separate build fee/i)).toBeVisible();
  await expect(page.getByText(/i am a photographer/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: bundled `pnpm test:e2e -- tests/e2e/home.spec.ts -g "monthly options"`.

Expected: FAIL because pricing is not rendered.

- [ ] **Step 3: Implement the approved supporting sections**

Render the four-step process, three pricing cards, managed-service list, accurate founder introduction, legal pages, and footer. Phrase optional photographer payments as an available consultation topic, not active Stripe Connect functionality.

- [ ] **Step 4: Verify and commit the content sections**

Run: bundled `pnpm check`, bundled `pnpm build`, unit tests, and the full browser test file.

```bash
git add src/components/Process.astro src/components/Pricing.astro src/components/Services.astro src/components/Founder.astro src/components/SiteFooter.astro src/pages/index.astro src/pages/privacy.astro src/pages/terms.astro tests/e2e/home.spec.ts
git commit -m "feat: complete service and pricing journey"
```

### Task 6: Implement the Resilient Contact Path

**Files:**
- Create: `src/lib/contact.ts`
- Create: `src/components/Contact.astro`
- Create: `src/scripts/site.ts`
- Create: `tests/contact.test.ts`
- Create: `.env.example`
- Create: `supabase/functions/contact/index.ts`
- Create: `supabase/functions/contact/deno.json`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**
- Produces: `validateContact(input: unknown): ContactResult`, `submitContact(payload: ContactPayload, endpoint?: string): Promise<SubmitResult>`.
- Consumes: public `PUBLIC_CONTACT_FUNCTION_URL`; direct email fallback remains available when it is absent.

- [ ] **Step 1: Write validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateContact } from '../src/lib/contact';

describe('validateContact', () => {
  it('accepts a concise valid inquiry', () => {
    expect(validateContact({ name: 'Ari', email: 'ari@example.com', focus: 'Weddings', message: 'I need a portfolio site.' }).ok).toBe(true);
  });

  it('rejects malformed email and empty message', () => {
    const result = validateContact({ name: 'Ari', email: 'bad', focus: 'Weddings', message: '' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify missing implementation failure**

Run: bundled `pnpm test -- tests/contact.test.ts`.

Expected: FAIL because `src/lib/contact.ts` is absent.

- [ ] **Step 3: Implement shared validation and progressive enhancement**

Validate trimmed name length 2–80, RFC-style practical email length at most 254, focus length 2–80, and message length 20–2000. Preserve values on failure. When the endpoint is not configured, show a friendly explanation and the `mailto:sites.by.leon@gmail.com` link rather than pretending the message was stored.

- [ ] **Step 4: Implement the Edge Function source**

Accept POST only, validate JSON again on the server, require an `Origin` matching the configured site, reject a honeypot value, and insert into a server-owned `contact_inquiries` table. Return only `{ ok: true }` or a safe structured validation error. Keep database credentials in Supabase-managed function secrets.

- [ ] **Step 5: Verify success, failure, and fallback behavior**

Mock the endpoint in Playwright for 200 and 422 responses; confirm success appears only after 200, failed values remain present, and the direct email fallback is always visible.

- [ ] **Step 6: Commit the contact path**

```bash
git add src/lib/contact.ts src/components/Contact.astro src/scripts/site.ts src/pages/index.astro tests/contact.test.ts tests/e2e/home.spec.ts .env.example supabase/functions/contact
git commit -m "feat: add resilient contact workflow"
```

### Task 7: Finish Motion, Responsive, and Accessibility Verification

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/scripts/site.ts`
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: all homepage landmarks and CSS tokens.
- Produces: reduced-motion-safe reveal behavior and verified 390, 768, and 1440 pixel layouts.

- [ ] **Step 1: Add failing accessibility and viewport tests**

```ts
import AxeBuilder from '@axe-core/playwright';

test('has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});

test('does not overflow at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
```

- [ ] **Step 2: Run the new tests and record concrete failures**

Run: bundled `pnpm test:e2e -- tests/e2e/home.spec.ts`.

Expected: tests identify any current contrast, naming, or overflow issues before fixes.

- [ ] **Step 3: Implement restrained motion and responsive corrections**

Use IntersectionObserver only to add non-essential reveal classes. Under `prefers-reduced-motion: reduce`, remove smooth scrolling, transforms, transition delays, parallax, and light sweeps. Ensure interactive targets are at least 44 by 44 CSS pixels and focus rings are not clipped.

- [ ] **Step 4: Verify all supported modes**

Run: bundled `pnpm check`, bundled `pnpm test`, bundled `pnpm build`, and bundled `pnpm test:e2e` at Chromium desktop and mobile sizes.

Expected: all commands PASS, no serious or critical Axe violations, and no horizontal overflow.

- [ ] **Step 5: Commit accessibility completion**

```bash
git add src/styles/global.css src/scripts/site.ts tests/e2e/home.spec.ts
git commit -m "fix: complete responsive accessibility polish"
```

### Task 8: Add CI, Documentation, GitHub Repository, and Production Deployment

**Files:**
- Create: `.github/workflows/quality.yml`
- Create: `README.md`
- Modify: `astro.config.mjs`
- Modify: `docs/superpowers/specs/2026-07-09-sites-by-leon-platform-design.md`

**Interfaces:**
- Produces: GitHub repository `LimonLimez/sites-by-leon`, protected quality workflow, Cloudflare Pages build contract `pnpm build` → `dist`.
- Consumes: complete tested Phase 1 application.

- [ ] **Step 1: Create the quality workflow**

Use `actions/checkout@v6`, `pnpm/action-setup@v4` pinned to pnpm 11.7.0, and `actions/setup-node@v6` pinned to Node 24. Cache pnpm, install with `--frozen-lockfile`, install Playwright Chromium, and run check, unit tests, build, and browser tests.

- [ ] **Step 2: Document setup and service boundaries**

Document bundled/local Node usage, package commands, environment variables, the GitHub-to-Cloudflare deployment path, contact fallback behavior, and the reason production does not use GitHub Pages. Include no secret values.

- [ ] **Step 3: Run the clean-install verification**

Run: remove only generated `node_modules` and `dist` after verifying their resolved paths are inside the repository, then bundled `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`.

Expected: all commands PASS from a clean dependency install.

- [ ] **Step 4: Commit and publish the GitHub repository**

Rename the branch to `main`, create the public GitHub repository `LimonLimez/sites-by-leon`, set it as `origin`, and push `main`. Confirm the remote default branch and latest commit match the local repository.

- [ ] **Step 5: Connect and verify Cloudflare Pages**

Create the `sites-by-leon` Pages project from the GitHub repository with build command `pnpm build`, output directory `dist`, Node 24, and pnpm 11.7.0. Confirm the deployment URL returns HTTP 200 and manually check hero, concepts, pricing, legal pages, and contact fallback.

- [ ] **Step 6: Record the deployment and commit**

Add the final production URL and deployment verification date to the README and design record.

```bash
git add .github/workflows/quality.yml README.md astro.config.mjs docs
git commit -m "ci: publish verified marketing site"
git push origin main
```

---

## Phase 1 Completion Evidence

Phase 1 is complete only when all of the following are true:

- The Canva and Penpot artifact URLs open and the two Penpot boards match the approved section order.
- All three concepts are visibly labeled and use optimized assets.
- Unit, type, build, browser, responsive, reduced-motion, and accessibility checks pass.
- The contact flow handles server success, validation failure, network failure, and direct-email fallback.
- The GitHub remote contains the complete history and its quality workflow passes.
- The Cloudflare Pages production URL returns the verified site.
- The site does not present Phase 2 login/subscription or Phase 3 Stripe Connect behavior as active.

After this evidence is recorded, create and execute separate implementation plans for Phase 2 client accounts/subscriptions and Phase 3 Stripe Connect payments without weakening this Phase 1 launch.
