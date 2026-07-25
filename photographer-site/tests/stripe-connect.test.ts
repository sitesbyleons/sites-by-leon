import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  connectAccountCreateParams,
  connectAccountLinkParams,
  connectAccountStatus,
} from '../src/lib/stripe-connect';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const account = (overrides: Record<string, unknown> = {}) => ({
  id: 'acct_test',
  object: 'v2.core.account' as const,
  applied_configurations: ['merchant' as const],
  created: '2026-07-13T12:00:00.000Z',
  livemode: false,
  configuration: {
    merchant: {
      applied: true,
      capabilities: {
        card_payments: { status: 'pending' as const, status_details: [] },
        stripe_balance: { payouts: { status: 'pending' as const, status_details: [] } },
      },
    },
  },
  requirements: { summary: { minimum_deadline: { status: 'currently_due' as const } } },
  ...overrides,
});

describe('Accounts v2 Connect setup', () => {
  it('creates a full-dashboard merchant while Stripe owns fees and account risk', () => {
    const params = connectAccountCreateParams('workspace-1', 'Northline Sports', 'studio@example.com', 'us');

    expect(params.dashboard).toBe('full');
    expect(params.contact_email).toBe('studio@example.com');
    expect(params.identity).toEqual({ country: 'us' });
    expect(params.configuration?.merchant?.capabilities?.card_payments?.requested).toBe(true);
    expect(params.defaults?.responsibilities).toEqual({ fees_collector: 'stripe', losses_collector: 'stripe' });
    expect(params.metadata).toEqual({ workspace_id: 'workspace-1' });
    expect(params.include).toContain('requirements');
    expect(params.include).toContain('identity');
  });

  it('uses hosted onboarding and collects future requirements up front', () => {
    const params = connectAccountLinkParams('acct_test', 'https://demo.leonsites.org');
    const onboarding = params.use_case.account_onboarding;

    expect(onboarding?.configurations).toEqual(['merchant']);
    expect(onboarding?.collection_options).toEqual({ fields: 'eventually_due', future_requirements: 'include' });
    expect(onboarding?.return_url).toBe('https://demo.leonsites.org/admin/invoices?connect=complete');
  });

  it('maps Accounts v2 capabilities to the dashboard status', () => {
    expect(connectAccountStatus(account() as never)).toMatchObject({
      onboarding_status: 'pending', charges_enabled: false, payouts_enabled: false, details_submitted: false,
    });

    expect(connectAccountStatus(account({
      configuration: {
        merchant: {
          applied: true,
          capabilities: {
            card_payments: { status: 'active', status_details: [] },
            stripe_balance: { payouts: { status: 'active', status_details: [] } },
          },
        },
      },
      requirements: { summary: {} },
    }) as never)).toMatchObject({
      onboarding_status: 'enabled', charges_enabled: true, payouts_enabled: true, details_submitted: true,
    });
  });

  it('marks closed accounts disabled', () => {
    expect(connectAccountStatus(account({ closed: true }) as never).onboarding_status).toBe('disabled');
  });
});

describe('Connect webhook event ledger', () => {
  it('uses checked finalization for both webhook formats', () => {
    for (const routePath of [
      'src/pages/api/webhooks/stripe-connect.ts',
      'src/pages/api/webhooks/stripe-connect-v2.ts',
    ]) {
      const route = read(routePath);
      expect(route).toContain("from '@leon/platform-core/stripe-events'");
      expect(route).toContain('await markStripeEvent');
      expect(route).not.toContain("from('stripe_events').update");
    }
  });

  it('rejects a missing Stripe signature as a bad request in both formats', () => {
    for (const routePath of [
      'src/pages/api/webhooks/stripe-connect.ts',
      'src/pages/api/webhooks/stripe-connect-v2.ts',
    ]) {
      expect(read(routePath)).toContain(
        "if (!signature) return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 });",
      );
    }
  });
});
