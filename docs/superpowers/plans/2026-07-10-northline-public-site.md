# Northline Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy Northline Portraits as the first production-shaped, independently hosted photographer website and reusable client-site template.

**Architecture:** Add a new `photographer-site/` Astro server application to the existing pnpm workspace. The app owns the public portfolio routes and a narrow control-status boundary, while content starts from typed demo fixtures that later tasks can replace with Supabase without changing page components. It deploys as its own Vercel project under the Sites By Leon account.

**Tech Stack:** Astro 6.4.8, `@astrojs/vercel` 10.0.8, TypeScript 6, Vitest 4, Playwright 1.61, GSAP 3.15, local WebP assets, Vercel server output.

## Global Constraints

- Sites By Leon owns the private repository, Vercel project, deployment, and domain.
- The public demo brand is **Northline Portraits** and all names, testimonials, galleries, and journal entries are fictional.
- Packages are inquiry-only; the public site contains no direct package purchase button.
- Public routes are Home, Work, Gallery detail, Journal, Journal post, Packages, Contact, and token-shaped invoice placeholder.
- Public pause state must never block `/studio`, which is reserved for the later photographer-dashboard plan.
- No client site receives a Supabase service-role key, Stripe secret, Clerk secret, or Leon site secret in browser code.
- Motion remains on by default, but `prefers-reduced-motion` removes large spatial movement.
- Every route must avoid horizontal page overflow at 390 CSS pixels and pass serious/critical Axe checks.
- No additional framework, UI kit, CSS framework, or page builder is introduced.

## File Structure

### Workspace and runtime

- Modify `pnpm-workspace.yaml` — include `photographer-site` as a workspace package.
- Create `photographer-site/package.json` — isolated app dependencies and scripts.
- Create `photographer-site/astro.config.mjs` — Vercel server adapter and Northline test URL.
- Create `photographer-site/tsconfig.json` — strict Astro TypeScript configuration.
- Create `photographer-site/vitest.config.ts` — unit-test configuration.
- Create `photographer-site/playwright.config.ts` — local browser-test server and viewport defaults.
- Create `photographer-site/.env.example` — server-only site identity variable names without values.

### Content and control boundaries

- Create `photographer-site/src/lib/content/types.ts` — public-site content interfaces.
- Create `photographer-site/src/lib/content/demo.ts` — complete fictional Northline fixture.
- Create `photographer-site/src/lib/content/repository.ts` — `PortfolioRepository` interface and demo implementation.
- Create `photographer-site/src/lib/control/status.ts` — operating-status types and fail-open decision function.
- Create `photographer-site/src/middleware.ts` — apply maintenance state only to public pages.

### Presentation

- Create `photographer-site/src/layouts/SiteLayout.astro` — document shell, fonts, metadata, header, and footer.
- Create `photographer-site/src/components/SiteHeader.astro` — public navigation.
- Create `photographer-site/src/components/SiteFooter.astro` — contact and legal footer.
- Create `photographer-site/src/components/ContactSheet.astro` — horizontal story ribbon and visual signature.
- Create `photographer-site/src/components/GalleryGrid.astro` — responsive image sequence.
- Create `photographer-site/src/components/InquiryForm.astro` — inquiry-only form UI.
- Create `photographer-site/src/styles/site.css` — complete responsive token and component system.
- Create `photographer-site/src/scripts/motion.ts` — restrained page and gallery motion.

### Routes

- Create `photographer-site/src/pages/index.astro` — Home.
- Create `photographer-site/src/pages/work/index.astro` — Work listing.
- Create `photographer-site/src/pages/work/[slug].astro` — Gallery detail.
- Create `photographer-site/src/pages/journal/index.astro` — Journal listing.
- Create `photographer-site/src/pages/journal/[slug].astro` — Journal post.
- Create `photographer-site/src/pages/packages.astro` — inquiry-only fixed packages.
- Create `photographer-site/src/pages/contact.astro` — contact route.
- Create `photographer-site/src/pages/invoice/[token].astro` — safe not-yet-active payment placeholder.
- Create `photographer-site/src/pages/maintenance.astro` — controlled public pause notice.
- Create `photographer-site/src/pages/api/health.ts` — non-sensitive health response.

### Assets and tests

- Create `photographer-site/public/images/northline/*.webp` — twelve fictional cinematic portrait images.
- Create `photographer-site/tests/content.test.ts` — fixture and repository tests.
- Create `photographer-site/tests/control-status.test.ts` — pause/fail-open decisions.
- Create `photographer-site/tests/e2e/public-site.spec.ts` — route, mobile, interaction, and accessibility coverage.

---

### Task 1: Scaffold the Independent Photographer Site Application

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `photographer-site/package.json`
- Create: `photographer-site/astro.config.mjs`
- Create: `photographer-site/tsconfig.json`
- Create: `photographer-site/vitest.config.ts`
- Create: `photographer-site/playwright.config.ts`
- Create: `photographer-site/.env.example`
- Create: `photographer-site/src/pages/index.astro`
- Test: `photographer-site/tests/scaffold.test.ts`

**Interfaces:**
- Consumes: the repository's pinned Astro 6 and Vercel adapter versions from `dashboard/package.json`.
- Produces: workspace package `northline-photographer-site` with `dev`, `check`, `test`, `test:e2e`, and `build` scripts.

- [ ] **Step 1: Add the workspace package and failing scaffold test**

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - dashboard
  - photographer-site
```

Create `photographer-site/tests/scaffold.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('photographer site package', () => {
  it('exposes the required verification scripts', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts).toMatchObject({
      check: 'astro check',
      test: 'vitest run',
      'test:e2e': 'playwright test',
      build: 'astro build',
    });
  });
});
```

- [ ] **Step 2: Run the smoke test and verify it fails**

Run:

```powershell
pnpm --dir photographer-site test
```

Expected: failure because the package does not exist.

- [ ] **Step 3: Create the package and runtime configuration**

Create `photographer-site/package.json`:

```json
{
  "name": "northline-photographer-site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.7.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "check": "astro check",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@astrojs/vercel": "10.0.8",
    "@fontsource-variable/manrope": "5.2.8",
    "@fontsource-variable/newsreader": "5.2.10",
    "astro": "6.4.8",
    "gsap": "3.15.0"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.9",
    "@axe-core/playwright": "4.12.1",
    "@playwright/test": "1.61.1",
    "@types/node": "24.10.1",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

Create `photographer-site/astro.config.mjs`:

```js
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: vercel(),
  output: 'server',
  site: 'https://northline.test.leonsites.org',
});
```

Create `photographer-site/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

Create `photographer-site/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
```

Create `photographer-site/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4344',
    url: 'http://127.0.0.1:4344',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4344',
    ...devices['Desktop Chrome'],
  },
});
```

Create `.env.example` containing only:

```dotenv
LEON_SITE_ID=
LEON_SITE_SECRET=
LEON_CONTROL_URL=https://sites-by-leon-dashboard.vercel.app
```

- [ ] **Step 4: Install the workspace and verify the blank route**

Run:

```powershell
pnpm install
pnpm --dir photographer-site check
pnpm --dir photographer-site test
```

Expected: install succeeds, Astro reports zero errors, and the scaffold test passes.

- [ ] **Step 5: Commit the scaffold**

```powershell
git add pnpm-workspace.yaml pnpm-lock.yaml photographer-site
git commit -m "feat: scaffold independent photographer site"
```

---

### Task 2: Define the Public Content Contract and Northline Fixture

**Files:**
- Create: `photographer-site/src/lib/content/types.ts`
- Create: `photographer-site/src/lib/content/demo.ts`
- Create: `photographer-site/src/lib/content/repository.ts`
- Create: `photographer-site/tests/content.test.ts`

**Interfaces:**
- Produces: `Portfolio`, `Gallery`, `GalleryImage`, `JournalPost`, `DisplayPackage`, `HomeContent`, and `PortfolioRepository`.
- Produces: `demoRepository.getPortfolio()`, `getGallery(slug)`, `getPost(slug)`, `listGalleries()`, and `listPosts()`.
- Consumes: no database; this boundary is intentionally replaceable by Supabase in the content-studio plan.

- [ ] **Step 1: Expand the failing content tests**

```ts
import { describe, expect, it } from 'vitest';

import { demoPortfolio } from '../src/lib/content/demo';

describe('Northline demo portfolio', () => {
  it('identifies itself as fictional concept content', () => {
    expect(demoPortfolio.conceptNotice).toContain('Fictional');
  });

it('contains enough image-led material for a real portfolio', () => {
  expect(demoPortfolio.galleries).toHaveLength(3);
  expect(demoPortfolio.galleries.flatMap((gallery) => gallery.images).length).toBeGreaterThanOrEqual(12);
  expect(demoPortfolio.posts).toHaveLength(3);
});

it('keeps packages inquiry-only', () => {
  expect(demoPortfolio.packages.every((item) => item.ctaLabel === 'Ask about this package')).toBe(true);
});
});
```

- [ ] **Step 2: Run the tests and verify missing exports fail**

Run `pnpm --dir photographer-site test`.

Expected: failure naming `demoPortfolio` and content module exports.

- [ ] **Step 3: Define focused content types**

Create `types.ts` with these exact public shapes:

```ts
export type GalleryImage = {
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
};

export type Gallery = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  cover: GalleryImage;
  images: GalleryImage[];
  publishedAt: string;
};

export type JournalPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  cover: GalleryImage;
  relatedGallerySlug: string | null;
  publishedAt: string;
};

export type DisplayPackage = {
  id: string;
  name: string;
  startingPrice: string;
  description: string;
  features: string[];
  ctaLabel: 'Ask about this package';
};

export type HomeContent = {
  eyebrow: string;
  headline: string;
  introduction: string;
  biography: string;
  announcement: string;
  contactLabel: string;
  featuredGallerySlugs: string[];
};

export type Portfolio = {
  studioName: string;
  location: string;
  email: string;
  conceptNotice: string;
  home: HomeContent;
  galleries: Gallery[];
  posts: JournalPost[];
  packages: DisplayPackage[];
};
```

- [ ] **Step 4: Create the complete fictional fixture and repository**

Use these galleries: `Artists in Quiet Rooms`, `After Dark`, and `Makers at Work`. Use these posts: `The Light Before the Session`, `Building a Portrait Wardrobe`, and `Why We Print Photographs`. Every image requires unique alt text. The repository returns only published fixture content and returns `null` for unknown slugs.

Create `repository.ts` with the exact boundary used by every route:

```ts
import { demoPortfolio } from './demo';
import type { Gallery, JournalPost, Portfolio } from './types';

export interface PortfolioRepository {
  getPortfolio(): Promise<Portfolio>;
  listGalleries(): Promise<Gallery[]>;
  getGallery(slug: string): Promise<Gallery | null>;
  listPosts(): Promise<JournalPost[]>;
  getPost(slug: string): Promise<JournalPost | null>;
}

export const demoRepository: PortfolioRepository = {
  async getPortfolio() {
    return demoPortfolio;
  },
  async listGalleries() {
    return demoPortfolio.galleries;
  },
  async getGallery(slug) {
    return demoPortfolio.galleries.find((gallery) => gallery.slug === slug) ?? null;
  },
  async listPosts() {
    return demoPortfolio.posts;
  },
  async getPost(slug) {
    return demoPortfolio.posts.find((post) => post.slug === slug) ?? null;
  },
};
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
pnpm --dir photographer-site test
pnpm --dir photographer-site check
```

Expected: all content tests pass and Astro reports zero errors.

Commit:

```powershell
git add photographer-site/src/lib photographer-site/tests/content.test.ts
git commit -m "feat: add Northline portfolio content model"
```

---

### Task 3: Create the Cinematic Image Set

**Files:**
- Create: `photographer-site/public/images/northline/artist-window.webp`
- Create: `photographer-site/public/images/northline/artist-red-room.webp`
- Create: `photographer-site/public/images/northline/artist-profile.webp`
- Create: `photographer-site/public/images/northline/night-neon.webp`
- Create: `photographer-site/public/images/northline/night-car.webp`
- Create: `photographer-site/public/images/northline/night-theater.webp`
- Create: `photographer-site/public/images/northline/maker-ceramics.webp`
- Create: `photographer-site/public/images/northline/maker-tailor.webp`
- Create: `photographer-site/public/images/northline/maker-florist.webp`
- Create: `photographer-site/public/images/northline/studio-hands.webp`
- Create: `photographer-site/public/images/northline/studio-contact-sheet.webp`
- Create: `photographer-site/public/images/northline/studio-print.webp`

**Interfaces:**
- Consumes: image paths and dimensions declared by `demoPortfolio`.
- Produces: twelve original fictional images with no logos, readable text, recognizable public figures, or copied photographer styles.

- [ ] **Step 1: Generate the twelve images in three coherent stories**

Use an editorial cinematic portrait direction with natural skin texture, controlled grain, hard window light, deep cobalt shadows, and restrained auburn highlights. Keep each subject fictional and vary age, presentation, framing, and environment.

- [ ] **Step 2: Verify every fixture path exists**

Add this content test:

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

it('references image files that exist', () => {
  for (const image of demoPortfolio.galleries.flatMap((gallery) => gallery.images)) {
    const path = fileURLToPath(new URL(`../public${image.src}`, import.meta.url));
    expect(existsSync(path), image.src).toBe(true);
  }
});
```

- [ ] **Step 3: Run tests and inspect contact sheets**

Run `pnpm --dir photographer-site test` and create a local contact-sheet screenshot for visual inspection. Reject duplicate-looking compositions, malformed hands, visible brand names, and inconsistent color grading.

- [ ] **Step 4: Commit assets**

```powershell
git add photographer-site/public/images photographer-site/tests/content.test.ts
git commit -m "feat: add Northline cinematic portrait collection"
```

---

### Task 4: Build the Shared Site Shell and Home Page

**Files:**
- Create: `photographer-site/src/layouts/SiteLayout.astro`
- Create: `photographer-site/src/components/SiteHeader.astro`
- Create: `photographer-site/src/components/SiteFooter.astro`
- Create: `photographer-site/src/components/ContactSheet.astro`
- Create: `photographer-site/src/styles/site.css`
- Create: `photographer-site/src/scripts/motion.ts`
- Modify: `photographer-site/src/pages/index.astro`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `PortfolioRepository` and `demoRepository`.
- Produces: shared page metadata props `{ title, description, image?, canonicalPath? }` and global navigation.
- Produces: `ContactSheet` props `{ galleries: Gallery[] }`.

- [ ] **Step 1: Write failing home-page browser assertions**

```ts
test('home establishes the fictional studio and routes to real work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portraits with a pulse.' })).toBeVisible();
  await expect(page.getByText(/Fictional portfolio concept/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'View the work' })).toHaveAttribute('href', '/work');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify the blank route fails**

Run `pnpm --dir photographer-site test:e2e -- --grep "home establishes"`.

Expected: failure because the shell and content do not exist.

- [ ] **Step 3: Implement tokens and the shared shell**

Use this token contract in `site.css`:

```css
:root {
  --ink: #111215;
  --paper: #f7f7f4;
  --silver: #b9bcc2;
  --blue: #4969d8;
  --auburn: #9b543b;
  --line-dark: rgba(255,255,255,.17);
  --line-light: #d9dade;
  --font-display: 'Newsreader Variable', Georgia, serif;
  --font-body: 'Manrope Variable', Arial, sans-serif;
}
```

The header contains Work, Journal, Packages, and Contact. The footer contains the fictional notice, studio email, location, and no unavailable social links.

- [ ] **Step 4: Implement the home thesis and contact-sheet signature**

The home page order is: cinematic hero, contact-sheet gallery ribbon, short studio position, featured galleries, latest journal story, package teaser, and contact close. Keep decorative copy under 110 words outside journal excerpts.

- [ ] **Step 5: Add restrained GSAP motion**

`motion.ts` must guard initialization and use one entrance sequence plus contact-sheet horizontal easing. It must not add a motion toggle. Under `prefers-reduced-motion`, set final states immediately.

- [ ] **Step 6: Run browser, type, and accessibility checks**

Run:

```powershell
pnpm --dir photographer-site check
pnpm --dir photographer-site test:e2e -- --grep "home establishes"
```

Expected: both pass.

- [ ] **Step 7: Commit the shell**

```powershell
git add photographer-site/src photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: build Northline site shell and home"
```

---

### Task 5: Build Work and Gallery Routes

**Files:**
- Create: `photographer-site/src/components/GalleryGrid.astro`
- Create: `photographer-site/src/pages/work/index.astro`
- Create: `photographer-site/src/pages/work/[slug].astro`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `demoRepository.listGalleries()` and `demoRepository.getGallery(slug)`.
- Produces: static-looking SSR routes with 404 responses for unknown slugs.

- [ ] **Step 1: Write failing gallery route tests**

```ts
test('work opens a complete gallery and unknown work returns 404', async ({ page, request }) => {
  await page.goto('/work');
  await page.getByRole('link', { name: /Artists in Quiet Rooms/ }).click();
  await expect(page.getByRole('heading', { name: 'Artists in Quiet Rooms' })).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(4);
  expect((await request.get('/work/not-a-gallery')).status()).toBe(404);
});
```

- [ ] **Step 2: Run the test and verify route failure**

Run `pnpm --dir photographer-site test:e2e -- --grep "complete gallery"`.

- [ ] **Step 3: Implement list, detail, and 404 behavior**

The Work page shows one strong cover per gallery with category and image count. The detail page uses the gallery's image dimensions to alternate wide and portrait placements without CSS masonry. Every image includes its fixture alt text and optional visible caption.

- [ ] **Step 4: Verify mobile image ordering and commit**

Run the gallery test at desktop and an iPhone 13 viewport. Confirm DOM order matches visual order and no lazy image creates layout shift through missing width/height attributes.

Commit with `git commit -m "feat: add Northline work galleries"`.

---

### Task 6: Build Journal Routes

**Files:**
- Create: `photographer-site/src/pages/journal/index.astro`
- Create: `photographer-site/src/pages/journal/[slug].astro`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `demoRepository.listPosts()` and `demoRepository.getPost(slug)`.
- Produces: readable journal index and detail routes; related gallery link when configured.

- [ ] **Step 1: Write failing journal tests**

```ts
test('journal stories are readable and link back to related work', async ({ page }) => {
  await page.goto('/journal/the-light-before-the-session');
  await expect(page.getByRole('heading', { name: 'The Light Before the Session' })).toBeVisible();
  await expect(page.locator('article p')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'See the related gallery' })).toHaveAttribute('href', '/work/artists-in-quiet-rooms');
});
```

- [ ] **Step 2: Verify failure, implement routes, and rerun**

Unknown posts return 404. Dates render through `Intl.DateTimeFormat`; bodies render only paragraph arrays and never `set:html`.

Run `pnpm --dir photographer-site test:e2e -- --grep "journal stories"`.

- [ ] **Step 3: Commit**

```powershell
git add photographer-site/src/pages/journal photographer-site/tests/e2e/public-site.spec.ts
git commit -m "feat: add Northline journal"
```

---

### Task 7: Build Packages, Contact, and Safe Invoice Placeholder

**Files:**
- Create: `photographer-site/src/components/InquiryForm.astro`
- Create: `photographer-site/src/pages/packages.astro`
- Create: `photographer-site/src/pages/contact.astro`
- Create: `photographer-site/src/pages/invoice/[token].astro`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: `demoPortfolio.packages` and optional `package` query parameter.
- Produces: inquiry URL `/contact?package=<package-id>`; no payment action.
- Produces: invoice placeholder that exposes no invoice existence before the payments plan is implemented.

- [ ] **Step 1: Write failing package-safety tests**

```ts
test('packages begin a conversation instead of checkout', async ({ page }) => {
  await page.goto('/packages');
  await expect(page.getByRole('link', { name: 'Ask about this package' })).toHaveCount(3);
  await expect(page.getByText(/Buy now|Checkout|Add to cart/i)).toHaveCount(0);
  await page.getByRole('link', { name: 'Ask about this package' }).first().click();
  await expect(page).toHaveURL(/\/contact\?package=/);
});
```

- [ ] **Step 2: Verify failure and implement inquiry-only routes**

The Contact page preselects a package label from a known ID only. Unknown package query values are ignored. The form asks for name, email, session type, preferred date, and message; form delivery remains visibly disabled with a direct fictional email in the demo rather than pretending to send.

The invoice placeholder always returns the same neutral message: `This payment link is not active.` It must not echo the token or distinguish malformed from unknown tokens.

- [ ] **Step 3: Run tests and commit**

Run `pnpm --dir photographer-site test:e2e -- --grep "packages begin"`.

Commit with `git commit -m "feat: add inquiry-only packages and contact"`.

---

### Task 8: Add Control Status, Maintenance Mode, and Health Endpoint

**Files:**
- Create: `photographer-site/src/lib/control/status.ts`
- Create: `photographer-site/src/middleware.ts`
- Create: `photographer-site/src/pages/maintenance.astro`
- Create: `photographer-site/src/pages/api/health.ts`
- Test: `photographer-site/tests/control-status.test.ts`
- Test: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Produces: `decidePublicStatus(input: { configured: boolean; remoteStatus: 'active' | 'paused' | 'maintenance' | null; lastKnownStatus: 'active' | 'paused' | 'maintenance' | null }): 'active' | 'paused' | 'maintenance'`.
- Produces: `GET /api/health` JSON `{ ok: true, service: 'northline-public-site', version: string }` with no environment or account identifiers.
- Reserves: `/studio` and `/api/health` from public maintenance redirects.

- [ ] **Step 1: Write fail-open and pause tests**

```ts
expect(decidePublicStatus({ configured: false, remoteStatus: null, lastKnownStatus: null })).toBe('active');
expect(decidePublicStatus({ configured: true, remoteStatus: 'paused', lastKnownStatus: 'active' })).toBe('paused');
expect(decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: 'active' })).toBe('active');
expect(decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: 'paused' })).toBe('paused');
```

- [ ] **Step 2: Run tests and implement the pure decision function**

Run `pnpm --dir photographer-site test` before and after implementation.

- [ ] **Step 3: Add middleware with a demo override**

In development and browser tests, accept `NORTHLINE_PREVIEW_STATUS=paused` from the server environment. Never accept a query parameter or cookie to pause a production site. Redirect public HTML routes to `/maintenance`; exempt assets, `/api/health`, `/maintenance`, `/studio`, and `/sign-in`.

- [ ] **Step 4: Test maintenance and health behavior**

Start a second Playwright web server with `NORTHLINE_PREVIEW_STATUS=paused` on port `4345`. Assert `/` renders the maintenance page, `/api/health` remains 200, and `/studio` is not redirected to maintenance.

- [ ] **Step 5: Commit**

```powershell
git add photographer-site/src/lib/control photographer-site/src/middleware.ts photographer-site/src/pages/maintenance.astro photographer-site/src/pages/api photographer-site/tests
git commit -m "feat: add photographer site operating status"
```

---

### Task 9: Complete Responsive, Accessibility, and Browser Verification

**Files:**
- Modify: `photographer-site/tests/e2e/public-site.spec.ts`
- Modify: `photographer-site/src/styles/site.css`
- Modify: presentation files only when a failing browser test identifies a defect.

**Interfaces:**
- Consumes: all public routes and components.
- Produces: verified desktop and iPhone public experience.

- [ ] **Step 1: Add route-wide accessibility and overflow tests**

```ts
for (const path of ['/', '/work', '/work/artists-in-quiet-rooms', '/journal', '/journal/the-light-before-the-session', '/packages', '/contact']) {
  await page.goto(path);
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(width.content, path).toBeLessThanOrEqual(width.viewport);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), path).toEqual([]);
}
```

- [ ] **Step 2: Run the full suite and fix only observed failures**

Run:

```powershell
pnpm --dir photographer-site check
pnpm --dir photographer-site test
pnpm --dir photographer-site test:e2e
```

Expected: zero type errors, all unit tests pass, all browser tests pass.

- [ ] **Step 3: Inspect screenshots with Browser and Computer Use**

Inspect Home, Work, one gallery, Journal, Packages, Contact, and Maintenance at 1440×1000 and 390×844. Verify image crops, navigation, focus, motion, captions, and form controls. Record and fix concrete issues before deployment.

- [ ] **Step 4: Run the production build**

Run `pnpm --dir photographer-site build` on an environment that supports the Vercel adapter's symlink packaging. On Windows, rely on the Vercel Linux build if local packaging ends with the known `EPERM` symlink restriction after Astro has completed compilation.

- [ ] **Step 5: Commit verification fixes**

```powershell
git add photographer-site
git commit -m "test: verify Northline public site"
```

---

### Task 10: Publish as a Separate Private Vercel Project

**Files:**
- No application source changes unless the production build identifies a real defect.
- Update: `docs/architecture/northline-demo.md` with identifiers that are safe to store.

**Interfaces:**
- Consumes: passing Task 9 commit.
- Produces: independent private GitHub-backed Vercel project and live demo URL.

- [ ] **Step 1: Publish the `photographer-site/` application source**

Push the verified commit to the private `sitesbyleons/sites-by-leon` repository. Keep the template inside the monorepo for the first demo; do not create a separate client repository until the template passes production verification.

- [ ] **Step 2: Create the Vercel project**

Create `northline-portraits-demo` under the Sites By Leon Vercel account with:

```text
Root Directory: photographer-site
Framework: Astro
Production Branch: main
Build Command: pnpm build
Install Command: pnpm install
```

- [ ] **Step 3: Configure only safe first-slice environment variables**

Set `LEON_SITE_ID` to the demo site's generated UUID. Leave `LEON_SITE_SECRET` and `LEON_CONTROL_URL` disconnected until the control-plane plan creates the hosted-site record and secret. The app must remain active through its fail-open rule.

- [ ] **Step 4: Verify the production deployment**

Confirm the Vercel deployment is `READY`, then fetch Home, Work, Journal, Packages, Contact, Invoice placeholder, and `/api/health`. Run Browser and Computer Use against the production URL at desktop and iPhone sizes.

- [ ] **Step 5: Document and commit the demo deployment**

Create `docs/architecture/northline-demo.md` containing the Vercel project name, project ID, production URL, root directory, and the fact that DNS and control secrets remain disconnected until their dedicated plans. Do not store environment values or tokens.

Commit:

```powershell
git add docs/architecture/northline-demo.md
git commit -m "docs: record Northline demo deployment"
```

## Completion Gate

Do not start the photographer content-studio plan until:

- Northline is independently deployed from `photographer-site/`.
- Every public route passes type, unit, browser, accessibility, and mobile overflow checks.
- The live site clearly labels itself fictional.
- Packages have no purchase path.
- The invoice route exposes no invoice data.
- Maintenance mode preserves `/studio` and `/api/health` access.
- No secret appears in the repository, browser HTML, client JavaScript, or public health output.
