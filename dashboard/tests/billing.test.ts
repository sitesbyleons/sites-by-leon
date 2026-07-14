import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canManageSubscription, canStartCheckout, getPlan, plans } from '../src/lib/billing';

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

describe('checkout reservation recovery', () => {
  it('does not reuse a nearly expired Stripe session deadline after a failed start', () => {
    const checkout = read('src/pages/api/billing/checkout.ts');
    expect(checkout).not.toContain('checkoutExpiresAt = new Date(existing.data.expires_at)');
    expect(checkout).toContain('Checkout is already starting. Try again shortly.');
    expect(checkout).toContain(".eq('attempt_key', attemptKey)");
    expect(checkout).toContain('!saved.data.length');
    expect(checkout).toContain('stripe.checkout.sessions.expire(session.id)');
    expect(checkout).toContain('workspace.error || subscription.error');
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
});
