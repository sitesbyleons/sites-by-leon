# Browser And CI Security Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove script inline wildcards from CSP and pin all CI actions while narrowing Clerk secret exposure.

**Architecture:** Let Astro generate exact per-page/per-response script hashes, keep non-resource transport controls in Caddy, and assert the workflow's supply-chain and secret-scope invariants in tests.

**Tech Stack:** Astro 7 and 6, Clerk Astro, Caddy, GitHub Actions, Vitest, Playwright.

## Global Constraints

- `script-src` must not contain `'unsafe-inline'` in production.
- Inline styles remain temporarily allowed for Clerk CSS and managed theme variables.
- Every `uses:` reference is a full 40-character SHA.
- Clerk secrets are absent from job-level environment scope.

---

### Task 1: Astro-Generated Strict Script CSP

**Files:**
- Modify: `astro.config.mjs`
- Modify: `dashboard/astro.config.mjs`
- Modify: `photographer-site/astro.config.mjs`
- Modify: `infra/ovh/Caddyfile`
- Create: `tests/content-security-policy.test.ts`
- Modify: `tests/infrastructure-reliability.test.ts`

**Interfaces:**
- Produces: Astro CSP meta policies with generated script hashes.
- Produces: Caddy header policy limited to embedding/navigation controls.

- [ ] **Step 1: Write failing policy tests**

```ts
for (const config of configs) {
  expect(config).toContain('csp:');
  expect(config).not.toMatch(/script[^\n]+unsafe-inline/);
}
expect(caddy).not.toMatch(/script-src[^;]+unsafe-inline/);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/content-security-policy.test.ts tests/infrastructure-reliability.test.ts`

- [ ] **Step 3: Configure CSP resources in each Astro application**

```js
security: {
  csp: {
    directives: ["default-src 'self'", "object-src 'none'", "base-uri 'self'"],
    scriptDirective: {
      resources: ["'self'", 'https://clerk.leonsites.org', 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      strictDynamic: true,
    },
    styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
  },
}
```

Include each app's exact image, connection, frame, font, and worker sources. Preserve `checkOrigin: false` for the two proxy-aware SSR applications.

- [ ] **Step 4: Build and inspect generated policies**

Run: `pnpm build && pnpm --dir dashboard build && pnpm --dir photographer-site build`

Expected: builds pass; static HTML and rendered SSR include script hashes and no script inline wildcard.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs dashboard/astro.config.mjs photographer-site/astro.config.mjs infra/ovh/Caddyfile tests
git commit -m "security: enforce hashed script CSP"
```

### Task 2: Immutable CI Actions And Narrow Secret Scope

**Files:**
- Modify: `.github/workflows/quality.yml`
- Create: `tests/ci-security.test.ts`

**Interfaces:**
- Uses official action commits resolved from tags: checkout v6, pnpm/action-setup v4, setup-node v6.

- [ ] **Step 1: Write failing workflow tests**

```ts
for (const ref of workflow.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)) {
  expect(ref[1]).toMatch(/^[0-9a-f]{40}$/);
}
expect(jobEnv).not.toMatch(/CLERK_(SECRET|PUBLISHABLE)|PUBLIC_CLERK/);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/ci-security.test.ts`

- [ ] **Step 3: Pin actions and scope secrets to Clerk-dependent steps**

Use:

```yaml
uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6
uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
```

Attach Clerk env only to dashboard/photographer builds and browser tests that require it. Keep ephemeral database URLs job-scoped.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- tests/ci-security.test.ts tests/infrastructure-reliability.test.ts
git add .github/workflows/quality.yml tests/ci-security.test.ts
git commit -m "ci: pin actions and scope Clerk secrets"
```

### Task 3: CSP Browser Regression Gate

**Files:**
- Modify: `tests/e2e/home.spec.ts`
- Modify: `dashboard/tests/e2e/dashboard.spec.ts`
- Modify: `photographer-site/tests/e2e/public-site.spec.ts`
- Modify: `photographer-site/tests/e2e/studio-admin.spec.ts`

**Interfaces:**
- Produces: a shared per-test collection of console CSP errors.

- [ ] **Step 1: Add console violation assertions**

```ts
const cspErrors: string[] = [];
page.on('console', (message) => {
  if (/content security policy|refused to (execute|load)/i.test(message.text())) cspErrors.push(message.text());
});
// Exercise the page.
expect(cspErrors).toEqual([]);
```

- [ ] **Step 2: Verify tests catch a deliberately invalid policy locally, then restore the strict policy**

Run each Playwright project once against the built preview server and confirm the assertion observes a blocked required script before restoring configuration.

- [ ] **Step 3: Run all browser suites**

Run: `pnpm test:e2e && pnpm --dir dashboard test:e2e && pnpm --dir photographer-site test:e2e`

Expected: all pass with empty CSP error collections.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e dashboard/tests/e2e photographer-site/tests/e2e
git commit -m "test: reject browser CSP violations"
```

### Task 4: Full Security Gate And Production Smoke

- [ ] **Step 1: Run type checks, tests, and builds**

Run: `pnpm check && pnpm test && pnpm build && pnpm --dir dashboard check && pnpm --dir dashboard test && pnpm --dir dashboard build && pnpm --dir photographer-site check && pnpm --dir photographer-site test && pnpm --dir photographer-site build && pnpm --dir domain-worker check && pnpm --dir domain-worker test && pnpm --dir domain-worker build`

- [ ] **Step 2: Run dependency audit**

Run: `pnpm audit --prod`

Expected: no known vulnerabilities.

- [ ] **Step 3: Deploy after backup and inspect production headers**

Check `leonsites.org`, `test.leonsites.org`, `demo.leonsites.org`, sign-in, dashboard, and studio admin. Confirm no browser CSP violations and no `script-src 'unsafe-inline'` header or meta policy.

