import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyHostingSubscriptionSnapshot,
  setDesiredSiteStatus,
  setSiteBillingMode,
} from '../platform-core/src/hosting-access';

const databaseUrl = process.env.PROVISIONING_DATABASE_URL;
const integrationSuite = databaseUrl ? describe : describe.skip;

integrationSuite('PostgreSQL hosting access control', () => {
  let sql: ReturnType<typeof postgres>;
  let workspaceId: string;
  const suffix = randomUUID().slice(0, 8);
  const execute = async (text: string, values: unknown[]) => [
    ...await sql.unsafe(text, values as never[]),
  ] as Record<string, unknown>[];

  beforeAll(async () => {
    sql = postgres(databaseUrl!, { max: 1 });
    const [workspace] = await sql<{ id: string }[]>`
      insert into client_workspaces (name, slug, status)
      values (${`Hosting Access ${suffix}`}, ${`hosting-access-${suffix}`}, 'active')
      returning id
    `;
    workspaceId = workspace.id;
    await sql`
      insert into site_connections (
        workspace_id, site_key, primary_domain, admin_domain, status,
        billing_mode, desired_status, billing_state
      ) values (
        ${workspaceId}, ${`hosting-access-${suffix}`},
        ${`hosting-access-${suffix}.example.test`},
        ${`admin-hosting-access-${suffix}.example.test`},
        'active', 'manual', 'active', 'manual'
      )
    `;
  });

  afterAll(async () => {
    if (workspaceId) await sql`delete from client_workspaces where id = ${workspaceId}`;
    await sql.end();
  });

  it('keeps legacy manual sites stable, links explicitly, and follows payment recovery', async () => {
    const base = {
      workspace_id: workspaceId,
      stripe_customer_id: `cus_${suffix}`,
      stripe_subscription_id: `sub_${suffix}`,
      stripe_price_id: `price_${suffix}`,
      plan_key: 'signature' as const,
      current_period_end: '2026-08-13T00:00:00.000Z',
      cancel_at_period_end: false,
    };

    const manual = await applyHostingSubscriptionSnapshot(execute, { ...base, status: 'unpaid' });
    expect(manual.data?.outcome).toBe('manual');
    let [site] = await sql<{ status: string; billing_mode: string; billing_state: string; hosting_subscription_id: string | null }[]>`
      select status, billing_mode, billing_state, hosting_subscription_id
      from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site).toEqual({ status: 'active', billing_mode: 'manual', billing_state: 'manual', hosting_subscription_id: null });

    const linked = await setSiteBillingMode(execute, {
      workspace_id: workspaceId,
      mode: 'automatic',
      desired_status: 'active',
    });
    expect(linked.data).toMatchObject({ outcome: 'updated', site_status: 'paused', billing_state: 'suspended' });

    const paid = await applyHostingSubscriptionSnapshot(execute, { ...base, status: 'active' });
    expect(paid.data).toMatchObject({ outcome: 'applied', site_status: 'active', billing_state: 'paid' });

    const action = await applyHostingSubscriptionSnapshot(execute, { ...base, status: 'past_due' });
    expect(action.data).toMatchObject({ outcome: 'applied', site_status: 'maintenance', billing_state: 'action_required' });

    await setSiteBillingMode(execute, {
      workspace_id: workspaceId,
      mode: 'automatic',
      desired_status: 'paused',
    });
    await applyHostingSubscriptionSnapshot(execute, { ...base, status: 'active' });
    [site] = await sql`
      select status, billing_mode, billing_state, hosting_subscription_id
      from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('paused');
    expect(site.billing_state).toBe('paid');

    await setSiteBillingMode(execute, {
      workspace_id: workspaceId,
      mode: 'automatic',
      desired_status: 'active',
    });
    [site] = await sql`
      select status, billing_mode, billing_state, hosting_subscription_id
      from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('active');
    expect(site.hosting_subscription_id).not.toBeNull();
  });

  it('identifies a conflicting subscription after a terminal subscription has been replaced', async () => {
    const common = {
      workspace_id: workspaceId,
      stripe_customer_id: `cus_${suffix}`,
      stripe_price_id: `price_${suffix}`,
      plan_key: 'signature' as const,
      current_period_end: '2026-08-13T00:00:00.000Z',
      cancel_at_period_end: false,
    };
    await applyHostingSubscriptionSnapshot(execute, {
      ...common,
      stripe_subscription_id: `sub_${suffix}`,
      status: 'canceled',
    });
    await applyHostingSubscriptionSnapshot(execute, {
      ...common,
      stripe_subscription_id: `sub_replacement_${suffix}`,
      status: 'active',
    });
    const conflict = await applyHostingSubscriptionSnapshot(execute, {
      ...common,
      stripe_subscription_id: `sub_${suffix}`,
      status: 'active',
    });
    expect(conflict.data).toMatchObject({ outcome: 'subscription_conflict', subscription_applied: false, site_changed: false });
  });

  it('rejects an older payment event after a newer failure event', async () => {
    const [before] = await sql<{ billing_updated_at: Date | null }[]>`
      select billing_updated_at from site_connections where workspace_id = ${workspaceId}
    `;
    const baseline = before.billing_updated_at?.getTime() ?? Date.now();
    const olderObservedAt = new Date(baseline + 60_000).toISOString();
    const newerObservedAt = new Date(baseline + 120_000).toISOString();
    const snapshot = {
      workspace_id: workspaceId,
      stripe_customer_id: `cus_${suffix}`,
      stripe_subscription_id: `sub_replacement_${suffix}`,
      stripe_price_id: `price_${suffix}`,
      plan_key: 'signature' as const,
      current_period_end: '2026-08-13T00:00:00.000Z',
      cancel_at_period_end: false,
    };
    const failure = await applyHostingSubscriptionSnapshot(execute, {
      ...snapshot,
      status: 'past_due',
      observed_at: newerObservedAt,
    });
    expect(failure.data?.site_status).toBe('maintenance');

    const olderSuccess = await applyHostingSubscriptionSnapshot(execute, {
      ...snapshot,
      status: 'active',
      observed_at: olderObservedAt,
    });
    expect(olderSuccess.data).toMatchObject({ outcome: 'stale', subscription_applied: false, site_changed: false });
    const [site] = await sql<{ status: string; billing_state: string }[]>`
      select status, billing_state from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site).toEqual({ status: 'maintenance', billing_state: 'action_required' });
  });

  it('still applies a delayed payment failure after an admin Keep live action', async () => {
    const [before] = await sql<{ billing_updated_at: Date }[]>`
      select billing_updated_at from site_connections where workspace_id = ${workspaceId}
    `;
    const paidObservedAt = new Date(before.billing_updated_at.getTime() + 60_000);
    const failedObservedAt = new Date(before.billing_updated_at.getTime() + 120_000);
    const snapshot = {
      workspace_id: workspaceId,
      stripe_customer_id: `cus_${suffix}`,
      stripe_subscription_id: `sub_replacement_${suffix}`,
      stripe_price_id: `price_${suffix}`,
      plan_key: 'signature' as const,
      current_period_end: '2026-08-13T00:00:00.000Z',
      cancel_at_period_end: false,
    };
    await applyHostingSubscriptionSnapshot(execute, {
      ...snapshot,
      status: 'active',
      observed_at: paidObservedAt.toISOString(),
    });
    await setDesiredSiteStatus(execute, { workspace_id: workspaceId, desired_status: 'active' });
    const [afterAdmin] = await sql<{ billing_updated_at: Date; status: string }[]>`
      select billing_updated_at, status from site_connections where workspace_id = ${workspaceId}
    `;
    expect(afterAdmin.billing_updated_at.toISOString()).toBe(paidObservedAt.toISOString());
    expect(afterAdmin.status).toBe('active');

    const failed = await applyHostingSubscriptionSnapshot(execute, {
      ...snapshot,
      status: 'past_due',
      observed_at: failedObservedAt.toISOString(),
    });
    expect(failed.data).toMatchObject({ outcome: 'applied', site_status: 'maintenance', billing_state: 'action_required' });
  });

  it('does not cancel a first subscription whose webhook predates an admin observation', async () => {
    await sql`delete from subscriptions where workspace_id = ${workspaceId}`;
    const newerAdminObservation = new Date(Date.now() + 120_000);
    await sql`
      update site_connections
      set billing_mode = 'manual', hosting_subscription_id = null, billing_updated_at = ${newerAdminObservation}
      where workspace_id = ${workspaceId}
    `;
    const result = await applyHostingSubscriptionSnapshot(execute, {
      workspace_id: workspaceId,
      stripe_customer_id: `cus_first_${suffix}`,
      stripe_subscription_id: `sub_first_${suffix}`,
      stripe_price_id: `price_${suffix}`,
      plan_key: 'signature',
      status: 'active',
      current_period_end: '2026-08-13T00:00:00.000Z',
      cancel_at_period_end: false,
      observed_at: new Date(newerAdminObservation.getTime() - 60_000).toISOString(),
    });
    expect(result.data).toMatchObject({ outcome: 'stale', subscription_applied: false, site_changed: false });
    const [count] = await sql<{ count: number }[]>`
      select count(*)::int as count from subscriptions where workspace_id = ${workspaceId}
    `;
    expect(count.count).toBe(0);
  });
});
