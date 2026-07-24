import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canManageBilling, canManageSubscription, canStartCheckout, getPlan, plans } from '../src/lib/billing';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('billing plans', () => {
  it('keeps the approved monthly prices and Stripe price environment names together', () => {
    expect(plans).toEqual([
      { key: 'essential', name: 'Essential', monthlyUsd: 25, priceEnv: 'STRIPE_PRICE_ESSENTIAL' },
      { key: 'studio', name: 'Studio', monthlyUsd: 30, priceEnv: 'STRIPE_PRICE_STUDIO' },
      { key: 'signature', name: 'Signature', monthlyUsd: 40, priceEnv: 'STRIPE_PRICE_SIGNATURE' },
    ]);
  });

  it('returns no plan for an untrusted plan key', () => {
    expect(getPlan('made-up-plan')).toBeNull();
  });
});

describe('canStartCheckout', () => {
  it('requires an authenticated approved workspace with no active subscription', () => {
    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'approved',
        subscriptionStatus: null,
      }),
    ).toBe(true);

    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'lead',
        subscriptionStatus: null,
      }),
    ).toBe(false);

    expect(
      canStartCheckout({
        userId: 'user_123',
        workspaceStatus: 'approved',
        subscriptionStatus: 'active',
      }),
    ).toBe(false);
  });

  it('allows a canceled or expired subscription to be replaced', () => {
    for (const subscriptionStatus of ['canceled', 'incomplete_expired']) {
      expect(
        canStartCheckout({
          userId: 'user_123',
          workspaceStatus: 'approved',
          subscriptionStatus,
        }),
      ).toBe(true);
    }
  });
});

describe('canManageSubscription', () => {
  it('only opens the billing portal for a subscription that can still be managed', () => {
    expect(canManageSubscription('active')).toBe(true);
    expect(canManageSubscription('past_due')).toBe(true);
    expect(canManageSubscription('canceled')).toBe(false);
    expect(canManageSubscription('incomplete_expired')).toBe(false);
    expect(canManageSubscription(null)).toBe(false);
  });
});

describe('canManageBilling', () => {
  it('permits owners and admins but not ordinary members', () => {
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(true);
    expect(canManageBilling('member')).toBe(false);
    expect(canManageBilling(null)).toBe(false);
  });

  it('distinguishes a missing workspace from a forbidden workspace member', () => {
    for (const routePath of ['src/pages/api/billing/checkout.ts', 'src/pages/api/billing/portal.ts']) {
      const route = read(routePath);
      expect(route).toContain("resolved.reason === 'not-found'");
      expect(route.indexOf("resolved.reason === 'not-found'")).toBeLessThan(route.indexOf('!canManageBilling(resolved.role)'));
      expect(route).toContain("resolved.reason === 'forbidden'");
    }
  });
});

describe('billing portal configuration', () => {
  it('requires and passes an explicit Stripe Portal configuration', () => {
    const portal = read('src/pages/api/billing/portal.ts');
    const localEnv = read('.env.example');
    const productionEnv = read('../infra/ovh/secrets/dashboard.env.example');

    expect(portal).toContain('STRIPE_BILLING_PORTAL_CONFIGURATION');
    expect(portal).toContain('configuration: portalConfiguration');
    expect(localEnv).toMatch(/^STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_/m);
    expect(productionEnv).toMatch(/^STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_/m);
  });
});

describe('checkout reservation recovery', () => {
  it('does not reuse a nearly expired Stripe session deadline after a failed start', () => {
    const checkout = read('src/pages/api/billing/checkout.ts');
    expect(checkout).not.toContain('checkoutExpiresAt = new Date(existing.data.expires_at)');
    expect(checkout).toContain('Checkout is already starting. Try again shortly.');
    expect(checkout).toContain(".eq('attempt_key', attemptKey)");
    expect(checkout).toContain('!saved.data.length');
    expect(checkout).toContain('stripe.checkout.sessions.expire(session.id)');
    expect(checkout).toContain("consent_collection: { terms_of_service: 'required' }");
    expect(checkout).toContain('workspace.error || subscription.error');
    expect(checkout).toContain('project.data.plan_key !== plan.key');
    expect(checkout).toContain('This is not the hosting plan assigned to your website.');
    expect(checkout).toContain("request.headers.get('accept')?.includes('application/json')");
    expect(checkout).toContain('Response.json({ url: checkoutUrl })');
  });
});

describe('test checkout isolation', () => {
  it('uses test-only keys and prices without writing live subscription records', () => {
    const checkout = read('src/pages/api/billing/test-checkout.ts');
    expect(checkout).toContain("url.hostname !== 'test.leonsites.org'");
    expect(checkout).toContain('STRIPE_TEST_SECRET_KEY');
    expect(checkout).toContain('STRIPE_TEST_PRICE_ESSENTIAL');
    expect(checkout).toContain("environment: 'test'");
    expect(checkout).not.toContain("from('subscriptions').upsert");
    expect(checkout).not.toContain('stripe_customer_id:');
  });
});

describe('subscription webhook isolation', () => {
  it('acknowledges unrelated Stripe subscriptions and only cleans up known workspaces', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain('ignored: true');
    expect(webhook).toContain("from('client_workspaces')");
    expect(webhook.indexOf("from('client_workspaces')")).toBeLessThan(webhook.indexOf('applyHostingSubscriptionSnapshot(hostingExecutor'));
    expect(webhook).not.toContain('database.syncSubscription');
  });

  it('only clears the checkout reservation completed by the matching Stripe Session', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain("event.type === 'checkout.session.completed'");
    expect(webhook).toContain(".eq('stripe_session_id', completedSessionId)");
    expect(webhook).not.toContain("delete().eq('workspace_id', workspaceId);");
  });

  it('uses checked event finalization for processed and failed outcomes', () => {
    const webhook = read('src/pages/api/webhooks/stripe.ts');
    expect(webhook).toContain("from '@leon/platform-core/stripe-events'");
    expect(webhook).toContain('await markStripeEvent');
    expect(webhook).not.toContain("from('stripe_events').update");
  });
});
