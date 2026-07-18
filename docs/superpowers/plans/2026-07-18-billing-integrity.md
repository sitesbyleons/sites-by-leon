# Billing Integrity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspace billing, Stripe webhooks, Portal sessions, and post publication dates fail closed before live-payment cutover.

**Architecture:** Resolve a workspace together with its database-backed role, centralize checked Stripe-event finalization in platform core, and keep Stripe account configuration verifiable through a non-secret CLI. Production stays test-mode until all gates pass.

**Tech Stack:** TypeScript, Astro API routes, Vitest, PostgreSQL, Stripe Node SDK 22.

## Global Constraints

- Only workspace `owner` and `admin` roles may start Checkout or open Billing Portal.
- An active Clerk organization selects a workspace but never grants membership by itself.
- Multiple personal-account memberships fail as ambiguous.
- No webhook response may acknowledge success before the ledger update succeeds.
- No automated verification may submit a live payment.

---

### Task 1: Workspace Resolution And Billing Authorization

**Files:**
- Create: `dashboard/tests/workspaces.test.ts`
- Modify: `dashboard/src/lib/workspaces.ts`
- Modify: `dashboard/src/lib/load-dashboard.ts`
- Modify: `dashboard/src/pages/api/billing/checkout.ts`
- Modify: `dashboard/src/pages/api/billing/portal.ts`
- Modify: `dashboard/tests/billing.test.ts`

**Interfaces:**
- Produces: `WorkspaceResolution` with `workspace`, `role`, and `reason` (`null | 'not-found' | 'ambiguous' | 'forbidden' | 'database'`).
- Produces: `canManageBilling(role: string | null): boolean`.

- [ ] **Step 1: Write failing resolver and role tests**

```ts
expect(await resolveClientWorkspace(client, { userId: 'user', orgId: 'org' }))
  .toMatchObject({ workspace: { id: 'ws' }, role: 'admin', reason: null });
expect((await resolveClientWorkspace(multiMembershipClient, { userId: 'user', orgId: null })).reason)
  .toBe('ambiguous');
expect(canManageBilling('member')).toBe(false);
expect(canManageBilling('owner')).toBe(true);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir dashboard test -- tests/workspaces.test.ts tests/billing.test.ts`

Expected: FAIL because role-aware resolution and `canManageBilling` do not exist.

- [ ] **Step 3: Implement role-aware fail-closed resolution**

```ts
export type WorkspaceResolution = {
  workspace: ResolvedWorkspace | null;
  role: string | null;
  reason: null | 'not-found' | 'ambiguous' | 'forbidden' | 'database';
};

export const canManageBilling = (role: string | null) =>
  role === 'owner' || role === 'admin';
```

Use the organization mapping only to choose a workspace, then query `workspace_members` for that user/workspace pair. Without an organization, fetch at most two memberships and reject two rows as ambiguous. Map billing denials to `403`, ambiguity to `409`, and database failures to `503`.

- [ ] **Step 4: Run focused and dashboard tests**

Run: `pnpm --dir dashboard test`

Expected: all dashboard tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/workspaces.ts dashboard/src/lib/load-dashboard.ts dashboard/src/lib/billing.ts dashboard/src/pages/api/billing dashboard/tests
git commit -m "fix: enforce workspace billing roles"
```

### Task 2: Explicit Billing Portal Configuration

**Files:**
- Modify: `dashboard/src/pages/api/billing/portal.ts`
- Modify: `dashboard/.env.example`
- Modify: `infra/ovh/secrets/dashboard.env.example`
- Modify: `dashboard/tests/billing.test.ts`

**Interfaces:**
- Consumes: `STRIPE_BILLING_PORTAL_CONFIGURATION`.

- [ ] **Step 1: Add a failing Portal contract test**

```ts
expect(portalRoute).toContain('STRIPE_BILLING_PORTAL_CONFIGURATION');
expect(portalRoute).toContain('configuration: portalConfiguration');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir dashboard test -- tests/billing.test.ts`

Expected: FAIL because Portal uses the Stripe account default.

- [ ] **Step 3: Require and pass the explicit configuration**

```ts
const portalConfiguration = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION;
if (!database || !stripeKey || !portalConfiguration) {
  return Response.json({ message: 'Billing management is not configured yet.' }, { status: 503 });
}

await stripe.billingPortal.sessions.create({
  customer: workspace.data.stripe_customer_id,
  configuration: portalConfiguration,
  return_url: `${publicOrigin}/dashboard`,
});
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --dir dashboard test`

```bash
git add dashboard/src/pages/api/billing/portal.ts dashboard/.env.example infra/ovh/secrets/dashboard.env.example dashboard/tests/billing.test.ts
git commit -m "fix: require Stripe portal configuration"
```

### Task 3: Durable Stripe Event Finalization

**Files:**
- Create: `platform-core/src/stripe-events.ts`
- Modify: `platform-core/package.json`
- Create: `tests/stripe-events.test.ts`
- Modify: `dashboard/src/pages/api/webhooks/stripe.ts`
- Modify: `photographer-site/src/pages/api/webhooks/stripe-connect.ts`
- Modify: `photographer-site/src/pages/api/webhooks/stripe-connect-v2.ts`
- Modify: `dashboard/tests/billing.test.ts`
- Modify: `photographer-site/tests/stripe-connect.test.ts`

**Interfaces:**
- Produces: `markStripeEvent(client, eventId, state): Promise<void>`.

- [ ] **Step 1: Write failing helper tests**

```ts
await expect(markStripeEvent(errorClient, 'evt_1', { status: 'processed', lastError: null }))
  .rejects.toThrow('Stripe event state could not be saved.');
await expect(markStripeEvent(emptyClient, 'evt_1', { status: 'failed', lastError: 'retry' }))
  .rejects.toThrow('Stripe event ledger row was not found.');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/stripe-events.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the checked helper**

```ts
export async function markStripeEvent(client: DataClient, eventId: string, state: StripeEventState) {
  const result = await client.from('stripe_events').update({
    status: state.status,
    processed_at: state.status === 'processed' ? new Date().toISOString() : null,
    last_attempt_at: new Date().toISOString(),
    last_error: state.lastError,
  }).eq('event_id', eventId);
  if (result.error) throw new Error('Stripe event state could not be saved.');
  if (result.data.length !== 1) throw new Error('Stripe event ledger row was not found.');
}
```

Replace every unchecked final ledger update, including duplicate-subscription cleanup. Catch paths attempt a checked failed-state write and always return `500`.

- [ ] **Step 4: Run all webhook tests**

Run: `pnpm test -- tests/stripe-events.test.ts && pnpm --dir dashboard test && pnpm --dir photographer-site test -- tests/stripe-connect.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add platform-core/src/stripe-events.ts platform-core/package.json tests/stripe-events.test.ts dashboard/src/pages/api/webhooks photographer-site/src/pages/api/webhooks dashboard/tests photographer-site/tests
git commit -m "fix: verify Stripe webhook ledger writes"
```

### Task 4: Preserve Post Publication Time

**Files:**
- Create: `photographer-site/src/lib/post-publication.ts`
- Create: `photographer-site/tests/post-publication.test.ts`
- Modify: `photographer-site/src/pages/api/admin/[resource].ts`

**Interfaces:**
- Produces: `resolvePublishedAt(current, nextStatus, now): string | null`.

- [ ] **Step 1: Write transition tests**

```ts
expect(resolvePublishedAt('2026-01-01T00:00:00.000Z', 'published', now)).toBe('2026-01-01T00:00:00.000Z');
expect(resolvePublishedAt(null, 'published', now)).toBe(now);
expect(resolvePublishedAt('2026-01-01T00:00:00.000Z', 'draft', now)).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir photographer-site test -- tests/post-publication.test.ts`

- [ ] **Step 3: Implement and wire the transition**

Load `cover_storage_path,status,published_at` for edits, preserve the old timestamp when the next status remains published, and use the helper for both create and update values.

- [ ] **Step 4: Run photographer tests and commit**

Run: `pnpm --dir photographer-site test`

```bash
git add photographer-site/src/lib/post-publication.ts photographer-site/src/pages/api/admin/'[resource].ts' photographer-site/tests
git commit -m "fix: preserve post publication dates"
```

### Task 5: Stripe Configuration Verifier And Account Setup

**Files:**
- Create: `infra/ovh/scripts/verify-stripe-config.mjs`
- Modify: `infra/ovh/README.md`
- Modify: `infra/ovh/secrets/dashboard.env.example`
- Modify: `infra/ovh/secrets/northline.env.example`
- Modify: `tests/self-hosted-stack.test.ts`

**Interfaces:**
- Consumes: the existing Stripe keys, price IDs, webhook secrets, Portal configuration ID, and expected endpoint URLs.
- Produces: one redacted JSON summary containing mode, object IDs, active flags, event origin, and enabled event types.

- [ ] **Step 1: Add a failing configuration contract test**

Assert the verifier checks `livemode`, active prices, Portal features, `@accounts`, and the required invoice/capability event sets without logging key values.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/self-hosted-stack.test.ts`

- [ ] **Step 3: Implement the verifier with the Stripe SDK**

Use `stripe.prices.retrieve`, `stripe.billingPortal.configurations.retrieve`, and Workbench/Event Destination APIs. Exit nonzero on any mismatch and print only object IDs and booleans.

- [ ] **Step 4: Create missing test/live Portal configurations and repair destinations**

Run the setup through Stripe API credentials without echoing secrets. Set the live Connect snapshot destination to `@accounts`, align its event list, and add missing Accounts v2 capability events. Store returned Portal IDs in owner-only env files.

- [ ] **Step 5: Verify both modes and commit**

Run: `node infra/ovh/scripts/verify-stripe-config.mjs`

```bash
git add infra/ovh/scripts/verify-stripe-config.mjs infra/ovh/README.md infra/ovh/secrets/*.example tests/self-hosted-stack.test.ts
git commit -m "ops: verify Stripe account configuration"
```

