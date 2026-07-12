import { describe, expect, it } from 'vitest';

import {
  checkoutAllowed,
  normalizeSubscription,
  readClerkIdentity,
  resolvePlan,
  subscriptionIdForEvent,
} from '../platform-core/src/billing-core';

const token = (payload: object) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
};

describe('readClerkIdentity', () => {
  it('reads both classic and compact Clerk organization claims', () => {
    expect(readClerkIdentity(token({ sub: 'user_a', org_id: 'org_a' }))).toEqual({
      userId: 'user_a',
      orgId: 'org_a',
    });
    expect(readClerkIdentity(token({ sub: 'user_b', o: { id: 'org_b' } }))).toEqual({
      userId: 'user_b',
      orgId: 'org_b',
    });
  });

  it('accepts a user without an organization', () => {
    expect(readClerkIdentity(token({ sub: 'user_a' }))).toEqual({ userId: 'user_a', orgId: null });
  });

  it('rejects a malformed token', () => {
    expect(readClerkIdentity('not-a-jwt')).toBeNull();
  });
});

describe('subscriptionIdForEvent', () => {
  it('extracts a subscription ID from supported events and ignores unrelated events', () => {
    expect(subscriptionIdForEvent('customer.subscription.updated', { id: 'sub_updated' })).toBe('sub_updated');
    expect(subscriptionIdForEvent('checkout.session.completed', { subscription: 'sub_checkout' })).toBe('sub_checkout');
    expect(subscriptionIdForEvent('payment_intent.succeeded', { id: 'pi_123' })).toBeNull();
  });
});

describe('resolvePlan', () => {
  it('maps only the approved plan keys to configured Stripe prices', () => {
    const prices = {
      STRIPE_PRICE_ESSENTIAL: 'price_essential',
      STRIPE_PRICE_STUDIO: 'price_studio',
      STRIPE_PRICE_SIGNATURE: 'price_signature',
    };

    expect(resolvePlan('studio', (key) => prices[key as keyof typeof prices])).toEqual({
      key: 'studio',
      priceId: 'price_studio',
    });
    expect(resolvePlan('enterprise', () => 'price_wrong')).toBeNull();
  });
});

describe('checkoutAllowed', () => {
  it('allows only approved or active workspaces without a live subscription state', () => {
    expect(checkoutAllowed('approved', null)).toBe(true);
    expect(checkoutAllowed('active', 'canceled')).toBe(true);
    expect(checkoutAllowed('lead', null)).toBe(false);
    expect(checkoutAllowed('approved', 'active')).toBe(false);
    expect(checkoutAllowed('approved', 'past_due')).toBe(false);
  });
});

describe('normalizeSubscription', () => {
  it('normalizes Stripe subscription state and the item-level billing period', () => {
    expect(
      normalizeSubscription({
        id: 'sub_12345678',
        customer: 'cus_12345678',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { workspace_id: 'workspace_1', plan_key: 'signature' },
        items: { data: [{ price: { id: 'price_signature' }, current_period_end: 1_800_000_000 }] },
      }),
    ).toEqual({
      workspace_id: 'workspace_1',
      stripe_customer_id: 'cus_12345678',
      stripe_subscription_id: 'sub_12345678',
      stripe_price_id: 'price_signature',
      plan_key: 'signature',
      status: 'active',
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });

  it('rejects metadata that cannot be tied to an approved workspace and plan', () => {
    expect(
      normalizeSubscription({
        id: 'sub_12345678',
        customer: 'cus_12345678',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [] },
      }),
    ).toBeNull();
  });
});
