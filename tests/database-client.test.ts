import { describe, expect, it } from 'vitest';

import {
  createDataClient,
  createPostgresDataClient,
  userCanManageWorkspace,
  type QueryExecutor,
} from '../platform-core/src/index';

const recordingExecutor = (rows: Record<string, unknown>[] = []) => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const execute: QueryExecutor = async (text, values) => {
    calls.push({ text, values });
    return rows;
  };
  return { calls, execute };
};

describe('Leon PostgreSQL data client', () => {
  it('builds parameterized selects without putting values into SQL', async () => {
    const recorder = recordingExecutor([{ id: 'ws-1', name: 'Northline' }]);
    const client = createDataClient(recorder.execute);

    const result = await client
      .from('client_workspaces')
      .select('id,name')
      .eq('slug', "northline' OR true --")
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; name: string }>();

    expect(result).toEqual({ data: { id: 'ws-1', name: 'Northline' }, error: null });
    expect(recorder.calls).toEqual([
      {
        text: 'select "id", "name" from "client_workspaces" where "slug" = $1 order by "updated_at" desc limit $2',
        values: ["northline' OR true --", 1],
      },
    ]);
  });

  it('rejects tables and columns outside the application schema', async () => {
    const client = createDataClient(recordingExecutor().execute);

    expect(() => client.from('users; drop table users')).toThrow(/table/i);
    expect(() => client.from('client_workspaces').select('id, password')).toThrow(/column/i);
    expect(() => client.from('client_workspaces').eq('id OR 1=1', 'x')).toThrow(/column/i);
  });

  it('allows every managed gallery and post presentation field used by the live editor', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('studio_galleries')
      .select('layout_mode,grid_columns,image_aspect_ratio,cover_aspect_ratio,cover_crop_x,cover_crop_y,cover_crop_zoom')
      .eq('workspace_id', 'ws-1');
    await client.from('studio_gallery_images')
      .update({ aspect_ratio: 'portrait', crop_x: 32, crop_y: 61, crop_zoom: 1.4 })
      .eq('workspace_id', 'ws-1');
    await client.from('studio_posts')
      .update({ cover_aspect_ratio: 'wide', cover_crop_x: 44, cover_crop_y: 52, cover_crop_zoom: 1.2 })
      .eq('workspace_id', 'ws-1');

    expect(recorder.calls[0].text).toContain('"layout_mode", "grid_columns", "image_aspect_ratio"');
    expect(recorder.calls[1].text).toContain('"aspect_ratio" = $1');
    expect(recorder.calls[1].text).toContain('"crop_zoom" = $4');
    expect(recorder.calls[2].text).toContain('"cover_aspect_ratio" = $1');
    expect(recorder.calls[2].text).toContain('"cover_crop_zoom" = $4');
  });

  it('parameterizes updates and filters', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    const result = await client
      .from('site_connections')
      .update({ status: 'paused', current_version: null })
      .eq('workspace_id', 'ws-1');

    expect(result).toEqual({ data: [], error: null });
    expect(recorder.calls[0]).toEqual({
      text: 'update "site_connections" set "status" = $1, "current_version" = $2 where "workspace_id" = $3 returning *',
      values: ['paused', null, 'ws-1'],
    });
  });

  it('supports parameterized recent-record filters for rate limits', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('studio_inquiries').select('id').eq('ip_hash', 'hash').gte('created_at', '2026-07-12T00:00:00.000Z').limit(5);

    expect(recorder.calls[0]).toEqual({
      text: 'select "id" from "studio_inquiries" where "ip_hash" = $1 and "created_at" >= $2 limit $3',
      values: ['hash', '2026-07-12T00:00:00.000Z', 5],
    });
  });

  it('supports bounded server-side ticket filters and pagination', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('content_requests')
      .select('id,status,created_at')
      .in('status', ['new', 'planned', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(51)
      .offset(50);

    expect(recorder.calls[0]).toEqual({
      text: 'select "id", "status", "created_at" from "content_requests" where "status" in ($1, $2, $3) order by "created_at" desc limit $4 offset $5',
      values: ['new', 'planned', 'in_progress', 51, 50],
    });
  });

  it('upserts settings on the workspace primary key', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('studio_settings').upsert({ workspace_id: 'ws-1', site_title: 'Northline' });

    expect(recorder.calls[0]).toEqual({
      text: 'insert into "studio_settings" ("workspace_id", "site_title") values ($1, $2) on conflict ("workspace_id") do update set "site_title" = excluded."site_title" returning *',
      values: ['ws-1', 'Northline'],
    });
  });

  it('atomically rejects stale events from a replaced subscription', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.syncSubscription({
      workspace_id: 'ws-1',
      stripe_customer_id: 'cus-new',
      stripe_subscription_id: 'sub-new',
      stripe_price_id: 'price-studio',
      plan_key: 'studio',
      status: 'active',
      current_period_end: null,
      cancel_at_period_end: false,
    });

    expect(recorder.calls[0].text).toContain('on conflict ("workspace_id") do update set');
    expect(recorder.calls[0].text).toContain('where "subscriptions"."stripe_subscription_id" = excluded."stripe_subscription_id" or "subscriptions"."status" in (\'canceled\', \'incomplete_expired\')');
  });

  it('atomically allows only one open checkout attempt per workspace', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.claimCheckoutAttempt({
      workspace_id: 'ws-1',
      attempt_key: 'attempt-1',
      plan_key: 'studio',
      expires_at: '2026-07-13T01:00:00.000Z',
    });

    expect(recorder.calls[0].text).toContain('insert into "checkout_attempts"');
    expect(recorder.calls[0].text).toContain('on conflict ("workspace_id") do update set');
    expect(recorder.calls[0].text).toContain('where "checkout_attempts"."expires_at" <= now()');
    expect(recorder.calls[0].text).toContain('"checkout_attempts"."checkout_url" is null');
    expect(recorder.calls[0].text).toContain("interval '2 minutes'");
  });

  it('serializes ordered inserts and moves inside one PostgreSQL statement', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.insertOrdered('studio_posts', 'ws-1', { title: 'Game', slug: 'game' });
    await client.moveOrderedItem('studio_posts', 'ws-1', 'item-1', 'up');

    expect(recorder.calls[0].text).toContain('pg_advisory_xact_lock');
    expect(recorder.calls[0].text).toContain('max("sort_order")');
    expect(recorder.calls[1].text).toContain('pg_advisory_xact_lock');
    expect(recorder.calls[1].text).toContain('case when');
    expect(recorder.calls[1].text).toContain('for update');
  });

  it('enforces workspace gallery limits inside the serialized insert', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.insertOrdered('studio_galleries', 'ws-1', {
      title: 'Game',
      slug: 'game',
    });
    await client.insertOrdered('studio_gallery_images', 'ws-1', {
      gallery_id: 'gallery-1',
      image_url: '/image.webp',
      alt_text: 'A game',
    });

    expect(recorder.calls[0].text).toContain('capacity as (select count(*) < $5');
    expect(recorder.calls[0].text).toContain('cross join capacity where capacity.available');
    expect(recorder.calls[0].values.at(-1)).toBe(100);
    expect(recorder.calls[1].text).toContain('capacity as (select count(*) < $6');
    expect(recorder.calls[1].text).toContain('cross join capacity where capacity.available');
    expect(recorder.calls[1].values.at(-1)).toBe(5_000);
  });

  it('replaces a connected account and clears account-scoped customer IDs atomically', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.replaceConnectedAccount({
      workspace_id: 'ws-1',
      expected_account_id: 'acct_old',
      stripe_account_id: 'acct_new',
      onboarding_status: 'pending',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });

    expect(recorder.calls[0].text).toContain('update "connected_payment_accounts"');
    expect(recorder.calls[0].text).toContain('insert into "connected_payment_account_history"');
    expect(recorder.calls[0].text).toContain('update "studio_clients"');
    expect(recorder.calls[0].text).toContain('"stripe_customer_id" = null');
    expect(recorder.calls[0].text).toContain('update "studio_invoices"');
    expect(recorder.calls[0].text).toContain("then 'review'");
    expect(recorder.calls[0].text).toContain("in ('sending', 'open')");
    expect(recorder.calls[0].text).not.toContain("then case when \"studio_invoices\".\"amount_paid_cents\" > 0 then 'deposit_paid' else 'draft'");
  });

  it('resolves active and retired Connect accounts through one bounded lookup', async () => {
    const recorder = recordingExecutor([{ workspace_id: 'ws-1', is_current: false }]);
    const client = createDataClient(recorder.execute);

    const result = await client.resolveWorkspaceForStripeAccount('acct-retired');

    expect(result).toEqual({ data: { workspace_id: 'ws-1', is_current: false }, error: null });
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].text).toContain('from "connected_payment_accounts" as current_account');
    expect(recorder.calls[0].text).toContain('from "connected_payment_account_history" as retired');
    expect(recorder.calls[0].text).toContain('order by account.priority asc limit 1');
    expect(recorder.calls[0].values).toEqual(['acct-retired']);
  });

  it('CAS-binds a studio customer only while the expected Connect account is current', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.bindStudioClientStripeCustomer({
      workspace_id: 'ws-1',
      client_id: 'client-1',
      stripe_account_id: 'acct-current',
      expected_customer_id: 'cus-missing',
      stripe_customer_id: 'cus-recovered',
    });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].text).toContain('from "connected_payment_accounts"');
    expect(recorder.calls[0].text).toContain('"stripe_account_id" = $3');
    expect(recorder.calls[0].text).toContain('for update');
    expect(recorder.calls[0].text).toContain('update "studio_clients" as client');
    expect(recorder.calls[0].text).toContain('client."stripe_customer_id" is not distinct from $4');
    expect(recorder.calls[0].text).toContain('client."stripe_customer_id" = $5');
    expect(recorder.calls[0].values).toEqual([
      'ws-1', 'client-1', 'acct-current', 'cus-missing', 'cus-recovered',
    ]);
  });

  it('reclaims failed or abandoned Stripe event leases without replaying processed events', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.claimStripeEvent('evt_1', 'invoice.paid');

    expect(recorder.calls[0].text).toContain('on conflict ("event_id") do update set');
    expect(recorder.calls[0].text).toContain('"status" = \'failed\'');
    expect(recorder.calls[0].text).toContain("interval '5 minutes'");
    expect(recorder.calls[0].text).not.toContain('"status" = \'processed\' or');
  });

  it('claims and releases workspace upload bytes atomically', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.claimWorkspaceUpload('ws-1', 'ws-1/covers/a.webp', 1024, 4_294_967_296);
    await client.releaseWorkspaceUpload('ws-1', 'ws-1/covers/a.webp');

    expect(recorder.calls[0].text).toContain('"workspace_storage_usage"');
    expect(recorder.calls[0].text).toContain('"workspace_uploads"');
    expect(recorder.calls[0].text).toContain('$3::bigint');
    expect(recorder.calls[0].text).toContain('$4::bigint');
    expect(recorder.calls[0].text).toContain('"used_bytes" + excluded."used_bytes" <= "workspace_storage_usage"."quota_bytes"');
    expect(recorder.calls[1].text).toContain('greatest(0');
  });

  it('checks every studio upload reference in one parameterized query', async () => {
    const recorder = recordingExecutor([{ referenced: true }]);
    const client = createDataClient(recorder.execute);

    const result = await client.isWorkspaceUploadReferenced('ws-1', 'ws-1/covers/a.webp');

    expect(result).toEqual({ data: true, error: null });
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].text).toContain('exists (select 1 from "studio_galleries"');
    expect(recorder.calls[0].text).toContain('exists (select 1 from "studio_gallery_images"');
    expect(recorder.calls[0].text).toContain('exists (select 1 from "studio_posts"');
    expect(recorder.calls[0].text).toContain('"cover_storage_path" = $2');
    expect(recorder.calls[0].text).toContain('"storage_path" = $2');
    expect(recorder.calls[0].values).toEqual(['ws-1', 'ws-1/covers/a.webp']);
    expect(recorder.calls[0].text).not.toContain('ws-1/covers/a.webp');
  });

  it('leases an invoice send so concurrent retries cannot mutate one Stripe draft', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.claimInvoiceSend('ws-1', 'invoice-1');

    expect(recorder.calls[0].text).toContain('update "studio_invoices" set "status" = \'sending\'');
    expect(recorder.calls[0].text).toContain("interval '5 minutes'");
    expect(recorder.calls[0].text).toContain("'draft', 'deposit_paid', 'uncollectible'");
  });

  it('serializes inquiry rate checking and insertion per workspace and IP hash', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.createRateLimitedInquiry({
      workspace_id: 'ws-1', ip_hash: 'hash', name: 'Jordan', email: 'j@example.com', phone: null,
      desired_date: '2026-09-12', message: 'Game coverage',
    });

    expect(recorder.calls[0].text).toContain('insert into "inquiry_rate_limits"');
    expect(recorder.calls[0].text).toContain('on conflict ("workspace_id", "ip_hash") do update set');
    expect(recorder.calls[0].text).toContain('unnest("inquiry_rate_limits"."request_times")');
    expect(recorder.calls[0].text).toContain('array_append');
    expect(recorder.calls[0].text).toContain(') < 5');
    expect(recorder.calls[0].text).toContain('$1::uuid');
    expect(recorder.calls[0].text).toContain("interval '10 minutes'");
  });

  it('finds durable unreferenced upload records for eventual cleanup', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.findOrphanedWorkspaceUploads('ws-1', '2026-07-13T00:00:00.000Z', 100);

    expect(recorder.calls[0].text).toContain('from "workspace_uploads" as pending');
    expect(recorder.calls[0].text).toContain('not exists (select 1 from "studio_galleries"');
    expect(recorder.calls[0].text).toContain('not exists (select 1 from "studio_gallery_images"');
    expect(recorder.calls[0].text).toContain('not exists (select 1 from "studio_posts"');
  });

  it('returns an error when maybeSingle receives multiple rows', async () => {
    const client = createDataClient(recordingExecutor([{ id: 1 }, { id: 2 }]).execute);

    const result = await client.from('studio_posts').select('id').maybeSingle();

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/multiple rows/i);
  });

  it('does not create a database client without a connection string', () => {
    expect(createPostgresDataClient('')).toBeNull();
  });

  it('adapts a postgres connection into the restricted data client', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const client = createPostgresDataClient('postgresql://platform.test/leon', () => ({
      unsafe: async (text: string, values: unknown[]) => {
        calls.push({ text, values });
        return [{ id: 'ws-1' }];
      },
    }));

    const result = await client?.from('client_workspaces').select('id').eq('slug', 'northline').maybeSingle();

    expect(result?.data).toEqual({ id: 'ws-1' });
    expect(calls).toEqual([{ text: 'select "id" from "client_workspaces" where "slug" = $1', values: ['northline'] }]);
  });

  it('authorizes workspace members without relying on browser-controlled claims', async () => {
    const client = createDataClient(async (text, values) => {
      if (text.includes('"workspace_members"') && values[0] === 'ws-1' && values[1] === 'user-1') {
        return [{ role: 'owner' }];
      }
      return [];
    });

    await expect(userCanManageWorkspace(client, 'user-1', 'ws-1')).resolves.toBe(true);
  });

  it('authorizes Leon admins and rejects unrelated users', async () => {
    const client = createDataClient(async (text, values) => {
      if (text.includes('"app_admins"') && values[0] === 'admin-1') return [{ clerk_user_id: 'admin-1' }];
      return [];
    });

    await expect(userCanManageWorkspace(client, 'admin-1', 'ws-1')).resolves.toBe(true);
    await expect(userCanManageWorkspace(client, 'stranger', 'ws-1')).resolves.toBe(false);
  });

  it('can restrict authorization to workspace membership without querying platform admins', async () => {
    const queries: string[] = [];
    const client = createDataClient(async (text) => {
      queries.push(text);
      return [];
    });

    await expect(userCanManageWorkspace(client, 'admin-1', 'ws-1', { allowPlatformAdmin: false }))
      .resolves.toBe(false);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('"workspace_members"');
    expect(queries[0]).not.toContain('"app_admins"');
  });
});
