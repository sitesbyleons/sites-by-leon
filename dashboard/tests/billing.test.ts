import { describe, expect, it } from 'vitest';

import { canStartCheckout, getPlan, plans } from '../src/lib/billing';

describe('billing plans', () => {
  it('keeps the approved monthly prices and Stripe price environment names together', () => {
    expect(plans).toEqual([
      { key: 'essential', name: 'Essential', monthlyUsd: 30, priceEnv: 'STRIPE_PRICE_ESSENTIAL' },
      { key: 'studio', name: 'Studio', monthlyUsd: 65, priceEnv: 'STRIPE_PRICE_STUDIO' },
      { key: 'signature', name: 'Signature', monthlyUsd: 100, priceEnv: 'STRIPE_PRICE_SIGNATURE' },
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
        orgId: 'org_456',
        workspaceStatus: 'approved',
        subscriptionStatus: null,
      }),
    ).toBe(true);

    expect(
      canStartCheckout({
        userId: 'user_123',
        orgId: 'org_456',
        workspaceStatus: 'lead',
        subscriptionStatus: null,
      }),
    ).toBe(false);

    expect(
      canStartCheckout({
        userId: 'user_123',
        orgId: 'org_456',
        workspaceStatus: 'approved',
        subscriptionStatus: 'active',
      }),
    ).toBe(false);
  });
});
