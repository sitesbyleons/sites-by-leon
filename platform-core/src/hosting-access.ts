import postgres from 'postgres';

export type HostingQueryExecutor = (
  text: string,
  values: unknown[],
) => Promise<Record<string, unknown>[]>;

export type HostingSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export type HostingBillingMode = 'manual' | 'automatic';
export type HostingDesiredStatus = 'active' | 'maintenance' | 'paused';
export type HostingBillingState = 'manual' | 'paid' | 'action_required' | 'suspended';
export type HostingPlanKey = 'essential' | 'studio' | 'signature';

export type ApplyHostingSubscriptionSnapshotInput = {
  workspace_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_key: HostingPlanKey;
  status: HostingSubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  observed_at?: string;
};

export type HostingSubscriptionApplyOutcome =
  | 'applied'
  | 'manual'
  | 'archived'
  | 'link_conflict'
  | 'subscription_conflict'
  | 'missing_site'
  | 'stale';

export type HostingSubscriptionApplyResult = {
  outcome: HostingSubscriptionApplyOutcome;
  subscription_applied: boolean;
  site_changed: boolean;
  subscription_record_id: string | null;
  site_status: string | null;
  billing_state: HostingBillingState | null;
};

export type SetSiteBillingModeInput = {
  workspace_id: string;
  mode: HostingBillingMode;
  desired_status?: HostingDesiredStatus;
};

export type SetDesiredSiteStatusInput = {
  workspace_id: string;
  desired_status: HostingDesiredStatus;
};

export type SiteBillingModeResult = {
  outcome: 'updated' | 'archived' | 'missing_site' | 'missing_subscription';
  billing_mode: HostingBillingMode | null;
  desired_status: HostingDesiredStatus | null;
  billing_state: HostingBillingState | null;
  site_status: string | null;
  hosting_subscription_id: string | null;
};

export type HostingAccessOperation<T> = {
  data: T | null;
  error: { message: string } | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ID_PATTERN = /^(?:cus|sub|price)_[A-Za-z0-9_]+$/;
const PLAN_KEYS = new Set(['essential', 'studio', 'signature']);
const SUBSCRIPTION_STATUSES = new Set<HostingSubscriptionStatus>([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);
const BILLING_MODES = new Set<HostingBillingMode>(['manual', 'automatic']);
const DESIRED_STATUSES = new Set<HostingDesiredStatus>(['active', 'maintenance', 'paused']);

const billingStateSql = (statusExpression: string) => `case
  when ${statusExpression} in ('active', 'trialing') then 'paid'
  when ${statusExpression} in ('incomplete', 'past_due') then 'action_required'
  else 'suspended'
end`;

const effectiveStatusSql = (desiredExpression: string, subscriptionStatusExpression: string) => `case
  when ${desiredExpression} = 'maintenance' then 'maintenance'
  when ${desiredExpression} = 'paused' then 'paused'
  when ${subscriptionStatusExpression} in ('active', 'trialing') then 'active'
  when ${subscriptionStatusExpression} in ('incomplete', 'past_due') then 'maintenance'
  else 'paused'
end`;

const applySnapshotSql = `
with locked_site as materialized (
  select
    connection."workspace_id",
    connection."status",
    connection."billing_mode",
    connection."desired_status",
    connection."hosting_subscription_id",
    connection."billing_updated_at",
    connection."archived_at"
  from "site_connections" as connection
  where connection."workspace_id" = $1::uuid
  for update
),
existing_subscription as materialized (
  select subscription."id", subscription."stripe_subscription_id", subscription."status"
  from "subscriptions" as subscription
  join locked_site on locked_site."workspace_id" = subscription."workspace_id"
  limit 1
),
accepted_subscription as materialized (
  insert into "subscriptions" (
    "workspace_id",
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_price_id",
    "plan_key",
    "status",
    "current_period_end",
    "cancel_at_period_end"
  )
  select
    locked_site."workspace_id",
    $2,
    $3,
    $4,
    $5,
    $6,
    $7::timestamptz,
    $8
  from locked_site
  where $9::timestamptz >= coalesce(locked_site."billing_updated_at", '-infinity'::timestamptz)
  on conflict ("workspace_id") do update set
    "stripe_customer_id" = excluded."stripe_customer_id",
    "stripe_subscription_id" = excluded."stripe_subscription_id",
    "stripe_price_id" = excluded."stripe_price_id",
    "plan_key" = excluded."plan_key",
    "status" = excluded."status",
    "current_period_end" = excluded."current_period_end",
    "cancel_at_period_end" = excluded."cancel_at_period_end"
  where "subscriptions"."stripe_subscription_id" = excluded."stripe_subscription_id"
    or "subscriptions"."status" in ('canceled', 'incomplete_expired')
  returning "id", "workspace_id", "status"
),
updated_site as materialized (
  update "site_connections" as connection
  set
    "hosting_subscription_id" = case
      when connection."billing_mode" = 'automatic' then coalesce(connection."hosting_subscription_id", accepted_subscription."id")
      else connection."hosting_subscription_id"
    end,
    "billing_state" = case
      when connection."billing_mode" = 'automatic' then ${billingStateSql('accepted_subscription."status"')}
      else 'manual'
    end,
    "status" = case
      when connection."billing_mode" = 'automatic' then ${effectiveStatusSql('connection."desired_status"', 'accepted_subscription."status"')}
      else connection."status"
    end,
    "billing_updated_at" = $9::timestamptz
  from accepted_subscription
  where connection."workspace_id" = accepted_subscription."workspace_id"
    and connection."archived_at" is null
    and connection."status" <> 'archived'
    and (
      connection."hosting_subscription_id" is null
      or connection."hosting_subscription_id" = accepted_subscription."id"
    )
  returning
    connection."workspace_id",
    connection."billing_mode",
    connection."status",
    connection."billing_state",
    connection."hosting_subscription_id"
),
workspace_update as materialized (
  update "client_workspaces" as workspace
  set "status" = case when updated_site."status" = 'active' then 'active' else 'paused' end
  from updated_site
  where workspace."id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning workspace."id"
),
project_update as materialized (
  update "website_projects" as project
  set
    "status" = case when updated_site."status" = 'active' then 'live' else 'paused' end,
    "progress" = case when updated_site."status" = 'active' then 100 else project."progress" end,
    "next_step" = case when updated_site."status" = 'active' then null else project."next_step" end
  from updated_site
  where project."workspace_id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning project."workspace_id"
)
select
  case
    when not exists (select 1 from locked_site) then 'missing_site'
    when $9::timestamptz < coalesce(
      (select "billing_updated_at" from locked_site),
      '-infinity'::timestamptz
    ) then 'stale'
    when not exists (select 1 from accepted_subscription)
      and exists (select 1 from existing_subscription where "stripe_subscription_id" = $3)
      then 'stale'
    when not exists (select 1 from accepted_subscription) then 'subscription_conflict'
    when (select "archived_at" is not null or "status" = 'archived' from locked_site) then 'archived'
    when (select "billing_mode" = 'manual' from locked_site) then 'manual'
    when (
      select locked_site."hosting_subscription_id" is not null
        and locked_site."hosting_subscription_id" <> accepted_subscription."id"
      from locked_site cross join accepted_subscription
    ) then 'link_conflict'
    else 'applied'
  end as "outcome",
  exists (select 1 from accepted_subscription) as "subscription_applied",
  exists (select 1 from updated_site where "billing_mode" = 'automatic') as "site_changed",
  (select "id"::text from accepted_subscription limit 1) as "subscription_record_id",
  coalesce(
    (select "status" from updated_site limit 1),
    (select "status" from locked_site limit 1)
  ) as "site_status",
  case
    when exists (select 1 from updated_site)
      then (select "billing_state" from updated_site limit 1)
    when (select "billing_mode" = 'manual' from locked_site)
      then 'manual'
    else null
  end as "billing_state"
`;

const setBillingModeSql = `
with locked_site as materialized (
  select
    connection."workspace_id",
    connection."status",
    connection."billing_mode",
    connection."desired_status",
    connection."hosting_subscription_id",
    connection."archived_at"
  from "site_connections" as connection
  where connection."workspace_id" = $1::uuid
  for update
),
current_subscription as materialized (
  select subscription."id", subscription."status"
  from "subscriptions" as subscription
  join locked_site on locked_site."workspace_id" = subscription."workspace_id"
  limit 1
),
updated_site as materialized (
  update "site_connections" as connection
  set
    "billing_mode" = $2,
    "desired_status" = case
      when $2 = 'manual' then connection."desired_status"
      else coalesce($3, connection."desired_status")
    end,
    "hosting_subscription_id" = case
      when $2 = 'manual' then null
      else current_subscription."id"
    end,
    "billing_state" = case
      when $2 = 'manual' then 'manual'
      else ${billingStateSql('current_subscription."status"')}
    end,
    "status" = case
      when $2 = 'manual' then connection."status"
      else ${effectiveStatusSql('coalesce($3, connection."desired_status")', 'current_subscription."status"')}
    end
  from locked_site
  left join current_subscription on true
  where connection."workspace_id" = locked_site."workspace_id"
    and connection."archived_at" is null
    and connection."status" <> 'archived'
    and ($2 = 'manual' or current_subscription."id" is not null)
  returning
    connection."workspace_id",
    connection."billing_mode",
    connection."desired_status",
    connection."billing_state",
    connection."status",
    connection."hosting_subscription_id"
),
workspace_update as materialized (
  update "client_workspaces" as workspace
  set "status" = case when updated_site."status" = 'active' then 'active' else 'paused' end
  from updated_site
  where workspace."id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning workspace."id"
),
project_update as materialized (
  update "website_projects" as project
  set
    "status" = case when updated_site."status" = 'active' then 'live' else 'paused' end,
    "progress" = case when updated_site."status" = 'active' then 100 else project."progress" end,
    "next_step" = case when updated_site."status" = 'active' then null else project."next_step" end
  from updated_site
  where project."workspace_id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning project."workspace_id"
)
select
  case
    when not exists (select 1 from locked_site) then 'missing_site'
    when (select "archived_at" is not null or "status" = 'archived' from locked_site) then 'archived'
    when $2 = 'automatic' and not exists (select 1 from current_subscription) then 'missing_subscription'
    else 'updated'
  end as "outcome",
  (select "billing_mode" from updated_site limit 1) as "billing_mode",
  (select "desired_status" from updated_site limit 1) as "desired_status",
  (select "billing_state" from updated_site limit 1) as "billing_state",
  coalesce(
    (select "status" from updated_site limit 1),
    (select "status" from locked_site limit 1)
  ) as "site_status",
  (select "hosting_subscription_id"::text from updated_site limit 1) as "hosting_subscription_id"
`;

const setDesiredStatusSql = `
with locked_site as materialized (
  select
    connection."workspace_id",
    connection."status",
    connection."billing_mode",
    connection."hosting_subscription_id",
    connection."archived_at"
  from "site_connections" as connection
  where connection."workspace_id" = $1::uuid
  for update
),
linked_subscription as materialized (
  select subscription."id", subscription."status"
  from "subscriptions" as subscription
  join locked_site
    on locked_site."hosting_subscription_id" = subscription."id"
  limit 1
),
updated_site as materialized (
  update "site_connections" as connection
  set
    "desired_status" = $2,
    "status" = case
      when connection."billing_mode" = 'manual' then $2
      when $2 = 'maintenance' then 'maintenance'
      when $2 = 'paused' then 'paused'
      when linked_subscription."status" in ('active', 'trialing') then 'active'
      when linked_subscription."status" in ('incomplete', 'past_due') then 'maintenance'
      else 'paused'
    end
  from locked_site
  left join linked_subscription on true
  where connection."workspace_id" = locked_site."workspace_id"
    and connection."archived_at" is null
    and connection."status" <> 'archived'
  returning
    connection."workspace_id",
    connection."billing_mode",
    connection."desired_status",
    connection."billing_state",
    connection."status",
    connection."hosting_subscription_id"
),
workspace_update as materialized (
  update "client_workspaces" as workspace
  set "status" = case when updated_site."status" = 'active' then 'active' else 'paused' end
  from updated_site
  where workspace."id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning workspace."id"
),
project_update as materialized (
  update "website_projects" as project
  set
    "status" = case when updated_site."status" = 'active' then 'live' else 'paused' end,
    "progress" = case when updated_site."status" = 'active' then 100 else project."progress" end,
    "next_step" = case when updated_site."status" = 'active' then null else project."next_step" end
  from updated_site
  where project."workspace_id" = updated_site."workspace_id"
    and updated_site."status" in ('active', 'paused')
  returning project."workspace_id"
)
select
  case
    when not exists (select 1 from locked_site) then 'missing_site'
    when (select "archived_at" is not null or "status" = 'archived' from locked_site) then 'archived'
    else 'updated'
  end as "outcome",
  (select "billing_mode" from updated_site limit 1) as "billing_mode",
  (select "desired_status" from updated_site limit 1) as "desired_status",
  (select "billing_state" from updated_site limit 1) as "billing_state",
  coalesce(
    (select "status" from updated_site limit 1),
    (select "status" from locked_site limit 1)
  ) as "site_status",
  (select "hosting_subscription_id"::text from updated_site limit 1) as "hosting_subscription_id"
`;

const isDateOrNull = (value: string | null) => value === null || Number.isFinite(Date.parse(value));

const observedAt = (value?: string) => {
  const normalized = value ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(normalized))) throw new Error('Invalid billing observation time.');
  return normalized;
};

function validateSnapshot(input: ApplyHostingSubscriptionSnapshotInput) {
  if (!UUID_PATTERN.test(input.workspace_id)) throw new Error('Invalid workspace.');
  for (const id of [input.stripe_customer_id, input.stripe_subscription_id, input.stripe_price_id]) {
    if (!STRIPE_ID_PATTERN.test(id)) throw new Error('Invalid Stripe subscription identity.');
  }
  if (!PLAN_KEYS.has(input.plan_key)) throw new Error('Invalid hosting plan.');
  if (!SUBSCRIPTION_STATUSES.has(input.status)) throw new Error('Invalid subscription status.');
  if (!isDateOrNull(input.current_period_end)) throw new Error('Invalid subscription period end.');
}

export async function applyHostingSubscriptionSnapshot(
  executeQuery: HostingQueryExecutor,
  input: ApplyHostingSubscriptionSnapshotInput,
): Promise<HostingAccessOperation<HostingSubscriptionApplyResult>> {
  try {
    validateSnapshot(input);
    const rows = await executeQuery(applySnapshotSql, [
      input.workspace_id,
      input.stripe_customer_id,
      input.stripe_subscription_id,
      input.stripe_price_id,
      input.plan_key,
      input.status,
      input.current_period_end,
      input.cancel_at_period_end,
      observedAt(input.observed_at),
    ]);
    const row = rows[0];
    if (!row) return { data: null, error: { message: 'Hosting subscription state was not returned.' } };
    return {
      data: {
        outcome: String(row.outcome) as HostingSubscriptionApplyOutcome,
        subscription_applied: row.subscription_applied === true,
        site_changed: row.site_changed === true,
        subscription_record_id: typeof row.subscription_record_id === 'string' ? row.subscription_record_id : null,
        site_status: typeof row.site_status === 'string' ? row.site_status : null,
        billing_state: typeof row.billing_state === 'string' ? row.billing_state as HostingBillingState : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Hosting subscription synchronization failed.' },
    };
  }
}

export async function setSiteBillingMode(
  executeQuery: HostingQueryExecutor,
  input: SetSiteBillingModeInput,
): Promise<HostingAccessOperation<SiteBillingModeResult>> {
  try {
    if (!UUID_PATTERN.test(input.workspace_id)) throw new Error('Invalid workspace.');
    if (!BILLING_MODES.has(input.mode)) throw new Error('Invalid billing mode.');
    const desiredStatus = input.desired_status ?? null;
    if (desiredStatus !== null && !DESIRED_STATUSES.has(desiredStatus)) throw new Error('Invalid desired site status.');
    const rows = await executeQuery(setBillingModeSql, [
      input.workspace_id,
      input.mode,
      desiredStatus,
    ]);
    const row = rows[0];
    if (!row) return { data: null, error: { message: 'Site billing mode was not returned.' } };
    return {
      data: {
        outcome: String(row.outcome) as SiteBillingModeResult['outcome'],
        billing_mode: typeof row.billing_mode === 'string' ? row.billing_mode as HostingBillingMode : null,
        desired_status: typeof row.desired_status === 'string' ? row.desired_status as HostingDesiredStatus : null,
        billing_state: typeof row.billing_state === 'string' ? row.billing_state as HostingBillingState : null,
        site_status: typeof row.site_status === 'string' ? row.site_status : null,
        hosting_subscription_id: typeof row.hosting_subscription_id === 'string' ? row.hosting_subscription_id : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site billing mode update failed.' },
    };
  }
}

export async function setDesiredSiteStatus(
  executeQuery: HostingQueryExecutor,
  input: SetDesiredSiteStatusInput,
): Promise<HostingAccessOperation<SiteBillingModeResult>> {
  try {
    if (!UUID_PATTERN.test(input.workspace_id)) throw new Error('Invalid workspace.');
    if (!DESIRED_STATUSES.has(input.desired_status)) throw new Error('Invalid desired site status.');
    const rows = await executeQuery(setDesiredStatusSql, [
      input.workspace_id,
      input.desired_status,
    ]);
    const row = rows[0];
    if (!row) return { data: null, error: { message: 'Desired site status was not returned.' } };
    return {
      data: {
        outcome: String(row.outcome) as SiteBillingModeResult['outcome'],
        billing_mode: typeof row.billing_mode === 'string' ? row.billing_mode as HostingBillingMode : null,
        desired_status: typeof row.desired_status === 'string' ? row.desired_status as HostingDesiredStatus : null,
        billing_state: typeof row.billing_state === 'string' ? row.billing_state as HostingBillingState : null,
        site_status: typeof row.site_status === 'string' ? row.site_status : null,
        hosting_subscription_id: typeof row.hosting_subscription_id === 'string' ? row.hosting_subscription_id : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Desired site status update failed.' },
    };
  }
}

type PostgresConnection = {
  unsafe(text: string, values: unknown[]): Promise<readonly Record<string, unknown>[]>;
};

const postgresExecutors = new Map<string, HostingQueryExecutor>();

export function createPostgresHostingQueryExecutor(
  connectionString: string | undefined,
): HostingQueryExecutor | null {
  if (!connectionString) return null;
  const cached = postgresExecutors.get(connectionString);
  if (cached) return cached;
  const sql = postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: true,
  }) as unknown as PostgresConnection;
  const executor: HostingQueryExecutor = async (text, values) => [...await sql.unsafe(text, values)];
  postgresExecutors.set(connectionString, executor);
  return executor;
}
