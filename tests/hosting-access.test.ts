import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  applyHostingSubscriptionSnapshot,
  setDesiredSiteStatus,
  setSiteBillingMode,
  type ApplyHostingSubscriptionSnapshotInput,
} from '../platform-core/src/hosting-access';

const validSnapshot = (
  overrides: Partial<ApplyHostingSubscriptionSnapshotInput> = {},
): ApplyHostingSubscriptionSnapshotInput => ({
  workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
  stripe_customer_id: 'cus_customer123',
  stripe_subscription_id: 'sub_subscription123',
  stripe_price_id: 'price_signature123',
  plan_key: 'signature',
  status: 'active',
  current_period_end: '2026-08-13T00:00:00.000Z',
  cancel_at_period_end: false,
  observed_at: '2026-07-13T20:00:00.000Z',
  ...overrides,
});

describe('hosting subscription access', () => {
  it('applies the subscription and site decision through one locked statement', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await applyHostingSubscriptionSnapshot(async (text, values) => {
      calls.push({ text, values });
      return [{
        outcome: 'applied',
        subscription_applied: true,
        site_changed: true,
        subscription_record_id: 'b037978c-88a4-4240-bbe1-ddf8e3274bba',
        site_status: 'active',
        billing_state: 'paid',
      }];
    }, validSnapshot());

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      outcome: 'applied',
      subscription_applied: true,
      site_changed: true,
      subscription_record_id: 'b037978c-88a4-4240-bbe1-ddf8e3274bba',
      site_status: 'active',
      billing_state: 'paid',
    });
    expect(calls).toHaveLength(1);
    const [{ text, values }] = calls;
    expect(text).toContain('for update');
    expect(text).toContain('insert into "subscriptions"');
    expect(text).toContain('update "site_connections"');
    expect(text).toContain('"billing_mode" = \'automatic\'');
    expect(text).toContain('"hosting_subscription_id" is null');
    expect(text).toContain('"subscriptions"."stripe_subscription_id" = excluded."stripe_subscription_id"');
    expect(text).toContain('"subscriptions"."status" in (\'canceled\', \'incomplete_expired\')');
    expect(text).toContain("$9::timestamptz >= coalesce(locked_site.\"billing_updated_at\", '-infinity'::timestamptz)");
    expect(text).toContain("existing_subscription where \"stripe_subscription_id\" = $3");
    expect(text).toContain("then 'subscription_conflict'");
    expect(text).toContain('update "client_workspaces"');
    expect(text).toContain('update "website_projects"');
    expect(values).toEqual([
      '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      'cus_customer123',
      'sub_subscription123',
      'price_signature123',
      'signature',
      'active',
      '2026-08-13T00:00:00.000Z',
      false,
      '2026-07-13T20:00:00.000Z',
    ]);
  });

  it('keeps manual and unlinked sites out of automatic status updates', async () => {
    let sql = '';
    const result = await applyHostingSubscriptionSnapshot(async (text) => {
      sql = text;
      return [{
        outcome: 'manual',
        subscription_applied: true,
        site_changed: false,
        subscription_record_id: 'b037978c-88a4-4240-bbe1-ddf8e3274bba',
        site_status: 'active',
        billing_state: 'manual',
      }];
    }, validSnapshot({ status: 'unpaid' }));

    expect(result.data?.outcome).toBe('manual');
    expect(result.data?.site_changed).toBe(false);
    expect(sql).toContain('connection."billing_mode" = \'automatic\'');
    expect(sql).toContain("when (select \"billing_mode\" = 'manual' from locked_site) then 'manual'");
  });

  it('reports an out-of-order provider observation as stale without changing the site', async () => {
    const result = await applyHostingSubscriptionSnapshot(async (text) => {
      expect(text).toContain('connection."billing_updated_at"');
      expect(text).toContain('$9::timestamptz < coalesce');
      expect(text).toContain("then 'stale'");
      return [{
        outcome: 'stale',
        subscription_applied: false,
        site_changed: false,
        subscription_record_id: null,
        site_status: 'maintenance',
        billing_state: null,
      }];
    }, validSnapshot({ status: 'active', observed_at: '2026-07-13T19:59:00.000Z' }));

    expect(result.data).toMatchObject({ outcome: 'stale', subscription_applied: false, site_changed: false });
  });

  it('maps payment states and desired status in SQL without letting payment override maintenance', async () => {
    let sql = '';
    await applyHostingSubscriptionSnapshot(async (text) => {
      sql = text;
      return [{
        outcome: 'applied', subscription_applied: true, site_changed: true,
        subscription_record_id: 'b037978c-88a4-4240-bbe1-ddf8e3274bba', site_status: 'maintenance', billing_state: 'action_required',
      }];
    }, validSnapshot({ status: 'past_due' }));

    expect(sql).toContain("in ('active', 'trialing') then 'paid'");
    expect(sql).toContain("in ('incomplete', 'past_due') then 'action_required'");
    expect(sql).toContain("when connection.\"desired_status\" = 'maintenance' then 'maintenance'");
    expect(sql).toContain("when connection.\"desired_status\" = 'paused' then 'paused'");
    expect(sql).toContain("in ('active', 'trialing') then 'active'");
    expect(sql).toContain("in ('incomplete', 'past_due') then 'maintenance'");
    expect(sql).toContain("else 'paused'");
  });

  it('rejects malformed snapshots before PostgreSQL is called', async () => {
    let calls = 0;
    const result = await applyHostingSubscriptionSnapshot(async () => {
      calls += 1;
      return [];
    }, validSnapshot({ stripe_subscription_id: 'not-a-subscription' }));

    expect(calls).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid Stripe subscription identity.');
  });

  it('requires a subscription before automatic mode can link a site', async () => {
    let sql = '';
    const result = await setSiteBillingMode(async (text, values) => {
      sql = text;
      expect(values).toEqual([
        '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        'automatic',
        'active',
      ]);
      return [{
        outcome: 'missing_subscription',
        billing_mode: null,
        desired_status: null,
        billing_state: null,
        site_status: 'active',
        hosting_subscription_id: null,
      }];
    }, {
      workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      mode: 'automatic',
      desired_status: 'active',
    });

    expect(result.data?.outcome).toBe('missing_subscription');
    expect(sql).toContain("and ($2 = 'manual' or current_subscription.\"id\" is not null)");
    expect(sql).toContain("when $2 = 'manual' then connection.\"status\"");
    expect(sql).toContain('"hosting_subscription_id" = case');
    expect(sql).toContain('coalesce($3, connection."desired_status")');
  });

  it('accepts the minimal mode interface and preserves manual desired/effective state', async () => {
    const result = await setSiteBillingMode(async (_text, values) => {
      expect(values[0]).toBe('31d3fa04-e7d5-4ce5-b560-775b93c09b0f');
      expect(values[1]).toBe('manual');
      expect(values[2]).toBeNull();
      return [{
        outcome: 'updated', billing_mode: 'manual', desired_status: 'maintenance',
        billing_state: 'manual', site_status: 'maintenance', hosting_subscription_id: null,
      }];
    }, {
      workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      mode: 'manual',
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      billing_mode: 'manual',
      desired_status: 'maintenance',
      site_status: 'maintenance',
    });
  });

  it('updates desired status atomically and lets manual mode apply it directly', async () => {
    let sql = '';
    const result = await setDesiredSiteStatus(async (text, values) => {
      sql = text;
      expect(values).toEqual([
        '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        'maintenance',
      ]);
      return [{
        outcome: 'updated', billing_mode: 'manual', desired_status: 'maintenance',
        billing_state: 'manual', site_status: 'maintenance', hosting_subscription_id: null,
      }];
    }, {
      workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      desired_status: 'maintenance',
    });

    expect(result.data).toMatchObject({ outcome: 'updated', site_status: 'maintenance' });
    expect(sql).toContain("when connection.\"billing_mode\" = 'manual' then $2");
    expect(sql).toContain("when linked_subscription.\"status\" in ('active', 'trialing') then 'active'");
  });
});

describe('platform Stripe webhook source', () => {
  const source = fs.readFileSync(
    new URL('../dashboard/src/pages/api/webhooks/stripe.ts', import.meta.url),
    'utf8',
  );

  it('retrieves current subscriptions for both subscription and invoice events', () => {
    expect(source).toContain("'invoice.paid'");
    expect(source).toContain("'invoice.payment_failed'");
    expect(source).toContain('invoice.parent?.subscription_details?.subscription');
    expect(source).toContain('stripe.subscriptions.retrieve(subscriptionId)');
    expect(source).toContain('if (event.account)');
  });

  it('uses the atomic hosting-access module while retaining webhook replay and duplicate protection', () => {
    expect(source).toContain('applyHostingSubscriptionSnapshot(hostingExecutor');
    expect(source).not.toContain('database.syncSubscription');
    expect(source.indexOf('claimStripeEvent')).toBeLessThan(source.indexOf('stripe.subscriptions.retrieve'));
    expect(source).toContain("synchronized.data.outcome === 'stale'");
    expect(source).toContain("synchronized.data.outcome === 'subscription_conflict'");
    expect(source.indexOf("synchronized.data.outcome === 'stale'")).toBeLessThan(source.indexOf('duplicate-subscription-refund:'));
    expect(source).toContain('duplicate-subscription-refund:');
    expect(source).toContain('stripe.subscriptions.cancel(subscription.id');
    expect(source).toContain("status: 'processed'");
    expect(source).toContain("status: 'failed'");
  });
});
