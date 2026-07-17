# Plain-Language Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace promotional, vague, or generated-sounding wording with clear and direct copy across every user-facing Sites By Leon surface, then publish the verified release to OVH.

**Architecture:** Keep copy in its existing owners: marketing content stays in `src/content/site.ts` and marketing components, dashboard text stays in dashboard pages, and photographer copy stays in the demo content and photographer pages. Add one source-level copy contract test for rejected phrases, update browser assertions to the new literal headlines, and leave layouts, styles, animations, APIs, and data models unchanged.

**Tech Stack:** Astro 6/7, React 19, TypeScript 6, Vitest 4, Playwright 1.61, Docker Compose, OVH VPS, Cloudflare Tunnel

## Global Constraints

- Say what the page, service, or action does.
- Prefer short sentences and common words.
- Remove slogans, rhetorical questions, filler, and exaggerated claims.
- Preserve prices, plan differences, legal meaning, functional labels, and status details.
- Do not change layout, styling, animation, or application behavior.
- Cover `leonsites.org`, `test.leonsites.org`, `demo.leonsites.org`, the client dashboard, and the photographer studio.

---

### Task 1: Add the Copy Contract

**Files:**
- Create: `tests/plain-language-copy.test.ts`

**Interfaces:**
- Consumes: user-facing Astro, TS, and TSX files under `src`, `dashboard/src`, and `photographer-site/src`
- Produces: a Vitest contract that rejects the exact phrases removed by this pass

- [ ] **Step 1: Write the failing source contract**

Create a test that reads the user-facing source trees and rejects these case-insensitive phrases:

```ts
const rejectedPhrases = [
  'without the guesswork',
  'one calm place',
  'show off your',
  'start showing off',
  'your site. handled',
  'handled properly',
  'impossible to miss',
  'impossible to scroll past',
  'launch without the headache',
  'take a short pause',
];
```

Scan only `.astro`, `.ts`, and `.tsx` files, excluding `styles`, `scripts`, generated output, tests, and comments in the plan itself.

- [ ] **Step 2: Run the contract and confirm it fails**

Run: `pnpm vitest run tests/plain-language-copy.test.ts`

Expected: FAIL listing current source files that contain rejected phrases.

- [ ] **Step 3: Commit the failing contract with the first implementation task**

Do not create a red-only commit. Include this file in Task 2's commit after the marketing source passes it.

---

### Task 2: Simplify Sites By Leon Marketing Copy

**Files:**
- Modify: `src/content/site.ts`
- Modify: `src/components/Hero.astro`
- Modify: `src/components/ConceptShowcase.astro`
- Modify: `src/components/WebsiteConcept.astro`
- Modify: `src/components/Pricing.astro`
- Modify: `src/components/Services.astro`
- Modify: `src/components/Contact.astro`
- Modify: `src/components/Founder.astro`
- Modify: `src/components/Process.astro`
- Modify: `src/components/PromiseStrip.astro`
- Modify: `src/components/BrowserMockup.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/privacy.astro`
- Modify: `src/pages/terms.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `tests/e2e/home.spec.ts`
- Test: `tests/plain-language-copy.test.ts`

**Interfaces:**
- Consumes: the existing `Concept`, `Plan`, `Service`, and `ProcessStep` structures
- Produces: the same components and content objects with direct wording and unchanged data shapes

- [ ] **Step 1: Update browser assertions before source copy**

Change the expected marketing hero to `Websites for photographers. Hosting included.` and the examples heading to `Website examples for photographers.`. Change metadata expectations to:

```text
Sites By Leon - Websites and hosting for photographers
Websites and hosting for photographers, with portfolio pages, inquiries, payments, updates, and direct support.
```

Keep the existing coming-soon assertion unchanged.

- [ ] **Step 2: Run the focused browser test and confirm it fails**

Run: `pnpm exec playwright test tests/e2e/home.spec.ts --grep "homepage|metadata|website examples"`

Expected: FAIL on the old hero, examples heading, or metadata.

- [ ] **Step 3: Replace the marketing copy**

Use these visible headings and actions:

```text
Hero eyebrow: Websites and hosting for photographers
Hero: Websites for photographers. Hosting included.
Hero summary: Portfolio pages, inquiries, payments, updates, and support.
Primary action: Email Leon
Secondary action: View examples
Examples kicker: Website examples
Examples heading: Website examples for photographers.
Pricing heading: Choose a monthly plan.
Services heading: Design, hosting, and support.
Payment note: Need online payments? / Ask Leon
Contact heading: Tell Leon about your website.
```

Use these content descriptions:

```text
Vow & Light: Wedding galleries and inquiry details.
Northline Portraits focus: Portrait studio
Northline Portraits: Portrait galleries and session booking.
Fieldwork Commercial: Project pages, briefs, and client payments.
Essential: A one-page site for a new photography business.
Studio: A multi-page site with galleries and inquiries.
Signature: A custom site based on your photography and brand.
```

Use literal feature labels such as `One-page template`, `Multi-page template`, `Domain setup`, `Payment setup`, `Hosting and updates`, and `Direct support`.

Replace the service titles with `Website design`, `Hosting and updates`, and `Direct support`. Replace process titles with `Tell Leon what you need`, `Choose the pages and photos`, `Review the site`, and `Publish the site`.

Inside concept previews, use restrained studio copy:

```text
Wedding: Wedding photography in Indianapolis. / Check availability / Tell us your date and location. / Send an inquiry
Portrait: Portraits for individuals and teams. / 90-minute studio session.
Commercial: Product and campaign photography.
```

Update the founder text to describe Leon's design, build, hosting, update, and support work directly. Keep the legal pages accurate and replace headings with `Privacy notice.` and `Website and service terms.`. Update subscription wording to reflect that billing is handled through Stripe and confirmed before service begins.

- [ ] **Step 4: Run marketing checks**

Run:

```bash
pnpm vitest run tests/plain-language-copy.test.ts
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0; Astro check may retain the existing TypeScript import hint only.

- [ ] **Step 5: Commit marketing copy**

```bash
git add src tests/plain-language-copy.test.ts tests/e2e/home.spec.ts
git commit -m "copy: simplify marketing language"
```

---

### Task 3: Simplify Client and Admin Dashboard Copy

**Files:**
- Modify: `dashboard/src/layouts/DashboardLayout.astro`
- Modify: `dashboard/src/pages/index.astro`
- Modify: `dashboard/src/pages/sign-in/[...signin].astro`
- Modify: `dashboard/src/pages/sign-up/[...signup].astro`
- Modify: `dashboard/src/pages/dashboard/index.astro`
- Modify: `dashboard/src/pages/dashboard/support.astro`
- Modify: `dashboard/src/pages/dashboard/billing.astro`
- Modify: `dashboard/src/pages/admin/index.astro`
- Modify: `dashboard/src/pages/admin/sites.astro`
- Modify: `dashboard/src/pages/admin/tickets.astro`
- Modify: `dashboard/tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: existing dashboard routes, forms, and preview mode
- Produces: identical dashboard behavior with task-based headings and helper text

- [ ] **Step 1: Add browser assertions for literal dashboard copy**

Assert the preview landing page contains:

```text
Manage your website.
View progress, request changes, and manage billing.
```

Assert support contains `Send a support request to Leon.` and billing contains `View your plan and manage billing with Stripe.`.

- [ ] **Step 2: Run the dashboard browser test and confirm it fails**

Run: `pnpm --dir dashboard exec playwright test tests/e2e/dashboard.spec.ts --grep "landing|support and billing"`

Expected: FAIL on at least one old heading or description.

- [ ] **Step 3: Replace dashboard wording**

Use the landing headline and summary from Step 1. Change the help link to `Need access? Email Leon.` and footer labels to `Website progress`, `Support requests`, and `Hosting and billing`.

Use `Sites By Leon` and `Leon will add your website after setup.` for an account without a workspace. Use `No website connected`, `Contact Leon to get started.`, and `Leon will create the project and add it to your account.` in onboarding.

Change `Ask for an update.` to `Request a change`. Change support helper text to `Send a support request to Leon.` and billing helper text to `View your plan and manage billing with Stripe.`. Keep all field labels and status messages operational.

Use direct admin descriptions:

```text
Overview: Accounts, support, billing, and sites.
Sites: View photographer sites and their status.
Tickets: View open and closed support tickets.
```

- [ ] **Step 4: Run dashboard verification**

Run:

```bash
pnpm --dir dashboard check
pnpm --dir dashboard test
pnpm --dir dashboard build
pnpm --dir dashboard test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit dashboard copy**

```bash
git add dashboard
git commit -m "copy: simplify dashboard language"
```

---

### Task 4: Simplify Northline and Photographer Studio Copy

**Files:**
- Modify: `photographer-site/src/lib/content/demo.ts`
- Modify: `photographer-site/src/pages/index.astro`
- Modify: `photographer-site/src/pages/maintenance.astro`
- Modify: `photographer-site/src/pages/admin/content.astro`
- Modify: `photographer-site/src/pages/admin/services.astro`
- Modify: `photographer-site/src/pages/admin/support.astro`
- Modify: `photographer-site/tests/e2e/public-site.spec.ts`

**Interfaces:**
- Consumes: the existing `Portfolio` content contract and studio routes
- Produces: unchanged portfolio data shapes and studio behavior with simpler labels

- [ ] **Step 1: Update browser assertions**

Change the maintenance heading expectation to `This site is temporarily unavailable.`. Add an assertion that the home contact heading is `Book photography coverage.`.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `pnpm --dir photographer-site exec playwright test tests/e2e/public-site.spec.ts --grep "pause|image-first editorial"`

Expected: FAIL on the old maintenance or home contact heading.

- [ ] **Step 3: Replace public and studio wording**

Change the home contact heading from a question to `Book photography coverage.`. Change maintenance copy to `Site unavailable`, `This site is temporarily unavailable.`, and `Please check back later.`.

In demo package features, replace `Recruiting-ready selects` with `Edited action and portrait images`.

In studio content, replace `Change the essentials without rebuilding the page.` with `Edit the homepage text, colors, and fonts.`. Replace `Keep only the packages clients should ask about.` with `List the packages clients can ask about.`. Replace the support heading `Ask Leon` with `New ticket`.

- [ ] **Step 4: Run photographer verification**

Run:

```bash
pnpm --dir photographer-site check
pnpm --dir photographer-site test
pnpm --dir photographer-site build
pnpm --dir photographer-site test:e2e
```

Expected: all commands exit 0; Astro check may retain the existing TypeScript import hint only.

- [ ] **Step 5: Commit photographer copy**

```bash
git add photographer-site
git commit -m "copy: simplify photographer site language"
```

---

### Task 5: Review Rendered Copy and Complete the Release

**Files:**
- Modify only if verification exposes a copy or wrapping defect

**Interfaces:**
- Consumes: committed builds from Tasks 2 through 4
- Produces: a healthy OVH production release serving the new copy

- [ ] **Step 1: Run the final source audit**

Run:

```bash
pnpm vitest run tests/plain-language-copy.test.ts
rg -n -i "without the guesswork|one calm place|show off your|start showing off|your site\. handled|handled properly|impossible to miss|impossible to scroll past|launch without the headache|taking a short pause" src dashboard/src photographer-site/src -g '*.{astro,ts,tsx}'
git diff --check
git status --short
```

Expected: the test passes, `rg` returns no matches, `git diff --check` is clean, and the working tree is clean.

- [ ] **Step 2: Inspect representative pages at desktop and mobile sizes**

Check:

```text
test.leonsites.org equivalent: homepage hero, examples, pricing, services, contact
leonsites.org equivalent: coming soon, dashboard landing, dashboard support, dashboard billing
demo.leonsites.org equivalent: home, services, contact, maintenance, studio homepage editor, studio support
```

At 1440x900 and 390x844, verify no horizontal overflow, clipped text, overlap, or broken animation timing.

- [ ] **Step 3: Push the verified branch**

Run:

```bash
git push origin main
```

Expected: GitHub accepts the new commits and reports `main -> main`.

- [ ] **Step 4: Update and deploy the OVH release**

Use the pinned host key and `/home/lemonlimez/.ssh/leonsites_ovh`. Inspect `/opt/leon-platform/current` first. Fast-forward its Git checkout to `origin/main`, then run:

```bash
SOURCE_ROOT=/opt/leon-platform/current /opt/leon-platform/current/infra/ovh/scripts/deploy.sh
```

Do not replace secret files, database volumes, upload storage, or Cloudflare configuration.

- [ ] **Step 5: Verify production**

Run the VPS health check and fetch the deployed copy from:

```text
https://leonsites.org
https://test.leonsites.org
https://demo.leonsites.org
```

Expected: health checks pass, all domains return HTTP 200, the marketing site contains `Websites for photographers. Hosting included.`, and the removed phrases are absent from production HTML.

- [ ] **Step 6: Record the release commit**

Report the deployed commit SHA, production health result, and any remaining non-blocking test hints.
