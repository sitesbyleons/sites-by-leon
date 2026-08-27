import postgres from 'postgres';

import {
  provisionClientSite as runClientSiteProvisioning,
  setSiteOperationalStatus as runSiteOperationalStatusUpdate,
} from './provisioning';

export type {
  ProvisionClientSiteInput,
  ProvisionClientSiteResult,
  ProvisioningPlanKey,
  ProvisioningTemplateKey,
  SiteOperationalStatus,
  SiteOperationalStatusResult,
} from './provisioning';
import type {
  ProvisionClientSiteInput,
  SiteOperationalStatus,
} from './provisioning';

export type QueryExecutor = (text: string, values: unknown[]) => Promise<Record<string, unknown>[]>;

export type DataError = { message: string };
export type DataResult<T> = { data: T; error: DataError | null };

const schema = {
  app_admins: ['clerk_user_id', 'display_name', 'created_at'],
  client_workspaces: ['id', 'clerk_org_id', 'name', 'slug', 'status', 'stripe_customer_id', 'created_at', 'updated_at'],
  checkout_attempts: ['workspace_id', 'attempt_key', 'plan_key', 'monthly_cents', 'stripe_session_id', 'checkout_url', 'expires_at', 'created_at', 'updated_at'],
  connected_payment_account_history: ['stripe_account_id', 'workspace_id', 'retired_at'],
  connected_payment_accounts: ['id', 'workspace_id', 'stripe_account_id', 'onboarding_status', 'charges_enabled', 'payouts_enabled', 'details_submitted', 'created_at', 'updated_at'],
  contact_inquiries: ['id', 'created_at', 'name', 'email', 'focus', 'message', 'ip_hash'],
  content_requests: ['id', 'workspace_id', 'created_by_clerk_user_id', 'subject', 'details', 'status', 'created_at', 'updated_at'],
  site_connections: ['workspace_id', 'site_key', 'site_kind', 'primary_domain', 'admin_domain', 'deployment_target', 'github_repository', 'status', 'current_version', 'last_seen_at', 'hosting_subscription_id', 'billing_mode', 'desired_status', 'billing_state', 'billing_updated_at', 'archived_at', 'archived_by_clerk_user_id', 'archive_reason', 'pre_archive_status', 'updated_at'],
  site_domain_aliases: ['id', 'workspace_id', 'hostname', 'status', 'is_canonical', 'cloudflare_custom_hostname_id', 'cloudflare_hostname_status', 'cloudflare_ssl_status', 'dns_target', 'last_error', 'last_checked_at', 'created_at', 'updated_at'],
  domain_jobs: ['id', 'domain_id', 'action', 'status', 'idempotency_key', 'attempt_count', 'available_at', 'last_error', 'locked_at', 'created_at', 'updated_at'],
  site_provisioning_runs: ['id', 'idempotency_key', 'request_fingerprint', 'workspace_id', 'requested_by_clerk_user_id', 'owner_clerk_user_id', 'status', 'last_error', 'last_attempt_at', 'created_at', 'updated_at'],
  studio_clients: ['id', 'workspace_id', 'service_id', 'stripe_customer_id', 'name', 'email', 'phone', 'notes', 'created_at', 'updated_at'],
  studio_galleries: ['id', 'workspace_id', 'title', 'slug', 'category', 'description', 'cover_image_url', 'cover_storage_path', 'layout_mode', 'grid_columns', 'image_aspect_ratio', 'cover_aspect_ratio', 'cover_crop_x', 'cover_crop_y', 'cover_crop_zoom', 'status', 'sort_order', 'created_at', 'updated_at'],
  studio_gallery_images: ['id', 'workspace_id', 'gallery_id', 'image_url', 'alt_text', 'storage_path', 'aspect_ratio', 'crop_x', 'crop_y', 'crop_zoom', 'sort_order', 'created_at', 'updated_at'],
  studio_inquiries: ['id', 'workspace_id', 'name', 'email', 'phone', 'desired_date', 'message', 'ip_hash', 'status', 'created_at', 'updated_at'],
  studio_invoices: ['id', 'workspace_id', 'client_id', 'stripe_invoice_id', 'status', 'description', 'amount_due_cents', 'amount_paid_cents', 'deposit_cents', 'due_date', 'hosted_invoice_url', 'created_at', 'updated_at'],
  studio_posts: ['id', 'workspace_id', 'title', 'slug', 'excerpt', 'body', 'cover_image_url', 'cover_storage_path', 'cover_aspect_ratio', 'cover_crop_x', 'cover_crop_y', 'cover_crop_zoom', 'status', 'published_at', 'related_gallery_id', 'sort_order', 'created_at', 'updated_at'],
  studio_work_stills: ['id', 'workspace_id', 'image_url', 'storage_path', 'instagram_url', 'alt_text', 'sort_order', 'created_at', 'updated_at'],
  studio_services: ['id', 'workspace_id', 'name', 'description', 'price_type', 'price_cents', 'is_active', 'sort_order', 'created_at', 'updated_at'],
  studio_settings: ['workspace_id', 'site_title', 'hero_title', 'hero_subtitle', 'contact_email', 'contact_phone', 'paper_color', 'ink_color', 'accent_color', 'font_preset', 'updated_at'],
  stripe_events: ['event_id', 'event_type', 'status', 'attempt_count', 'last_error', 'created_at', 'last_attempt_at', 'processed_at'],
  subscriptions: ['id', 'workspace_id', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id', 'plan_key', 'status', 'current_period_end', 'cancel_at_period_end', 'created_at', 'updated_at'],
  website_projects: ['id', 'workspace_id', 'name', 'status', 'plan_key', 'template_key', 'progress', 'next_step', 'live_url', 'monthly_cents', 'domain_options', 'chosen_domain', 'created_at', 'updated_at'],
  workspace_storage_usage: ['workspace_id', 'used_bytes', 'quota_bytes', 'updated_at'],
  workspace_uploads: ['storage_path', 'workspace_id', 'size_bytes', 'original_filename', 'media_kind', 'is_retained', 'created_at'],
  workspace_members: ['id', 'workspace_id', 'clerk_user_id', 'role', 'created_at'],
} as const;

type Table = keyof typeof schema;
type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

const conflictColumns: Partial<Record<Table, string>> = {
  site_connections: 'workspace_id',
  studio_settings: 'workspace_id',
  subscriptions: 'workspace_id',
};

const orderedTables = new Set<Table>([
  'studio_galleries',
  'studio_gallery_images',
  'studio_posts',
  'studio_work_stills',
  'studio_services',
]);

const orderedInsertQuotas: Partial<Record<Table, number>> = {
  studio_galleries: 100,
  studio_gallery_images: 5_000,
  studio_work_stills: 200,
};

const quote = (identifier: string) => `"${identifier}"`;

function assertTable(table: string): asserts table is Table {
  if (!Object.hasOwn(schema, table)) throw new Error(`Unknown application table: ${table}`);
}

function assertColumn(table: Table, column: string) {
  if (!(schema[table] as readonly string[]).includes(column)) {
    throw new Error(`Unknown column ${column} on ${table}`);
  }
}

class DataQuery<Row extends Record<string, unknown> = Record<string, unknown>> implements PromiseLike<DataResult<Row[]>> {
  private operation: Operation = 'select';
  private selected: string[] = ['*'];
  private filters: Array<{ column: string; operator: '=' | '>=' | 'in'; value: unknown }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private rowOffset: number | null = null;
  private values: Record<string, unknown> = {};

  constructor(
    private readonly table: Table,
    private readonly executeQuery: QueryExecutor,
  ) {}

  select<Selected extends Record<string, unknown> = Row>(columns = '*'): DataQuery<Selected> {
    const selected = columns.split(',').map((column) => column.trim());
    if (!selected.length || selected.some((column) => !column)) throw new Error('Select requires columns.');
    for (const column of selected) if (column !== '*') assertColumn(this.table, column);
    this.selected = selected;
    return this as unknown as DataQuery<Selected>;
  }

  eq(column: string, value: unknown) {
    assertColumn(this.table, column);
    this.filters.push({ column, operator: '=', value });
    return this;
  }

  gte(column: string, value: unknown) {
    assertColumn(this.table, column);
    this.filters.push({ column, operator: '>=', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    assertColumn(this.table, column);
    if (!Array.isArray(values) || values.length < 1 || values.length > 1_000) throw new Error('Invalid filter values.');
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    assertColumn(this.table, column);
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value: number) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) throw new Error('Invalid query limit.');
    this.rowLimit = value;
    return this;
  }

  offset(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new Error('Invalid query offset.');
    this.rowOffset = value;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.operation = 'insert';
    this.setValues(values);
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = 'update';
    this.setValues(values);
    return this;
  }

  upsert(values: Record<string, unknown>) {
    this.operation = 'upsert';
    this.setValues(values);
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  async maybeSingle<T = Row>(): Promise<DataResult<T | null>> {
    const result = await this.run();
    if (result.error) return { data: null, error: result.error };
    if (result.data.length > 1) return { data: null, error: { message: 'Query returned multiple rows.' } };
    return { data: (result.data[0] as T | undefined) ?? null, error: null };
  }

  then<TResult1 = DataResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: DataResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private setValues(values: Record<string, unknown>) {
    const entries = Object.entries(values);
    if (!entries.length) throw new Error('Mutation requires values.');
    for (const [column] of entries) assertColumn(this.table, column);
    this.values = values;
  }

  private compile() {
    const parameters: unknown[] = [];
    const parameter = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    const table = quote(this.table);
    const entries = Object.entries(this.values);
    let text: string;

    if (this.operation === 'select') {
      const columns = this.selected[0] === '*' ? '*' : this.selected.map(quote).join(', ');
      text = `select ${columns} from ${table}`;
    } else if (this.operation === 'insert' || this.operation === 'upsert') {
      const columns = entries.map(([column]) => quote(column)).join(', ');
      const placeholders = entries.map(([, value]) => parameter(value)).join(', ');
      text = `insert into ${table} (${columns}) values (${placeholders})`;
      if (this.operation === 'upsert') {
        const conflict = conflictColumns[this.table];
        if (!conflict) throw new Error(`Upsert is not configured for ${this.table}.`);
        const updates = entries
          .filter(([column]) => column !== conflict)
          .map(([column]) => `${quote(column)} = excluded.${quote(column)}`)
          .join(', ');
        text += ` on conflict (${quote(conflict)}) do update set ${updates}`;
      }
      text += ' returning *';
    } else if (this.operation === 'update') {
      const assignments = entries.map(([column, value]) => `${quote(column)} = ${parameter(value)}`).join(', ');
      text = `update ${table} set ${assignments}`;
    } else {
      text = `delete from ${table}`;
    }

    if (this.filters.length) {
      const conditions = this.filters.map(({ column, operator, value }) => {
        if (operator === 'in') {
          const placeholders = (value as unknown[]).map(parameter).join(', ');
          return `${quote(column)} in (${placeholders})`;
        }
        return value === null && operator === '='
          ? `${quote(column)} is null`
          : `${quote(column)} ${operator} ${parameter(value)}`;
      });
      text += ` where ${conditions.join(' and ')}`;
    }
    if (this.operation === 'select' && this.orders.length) {
      text += ` order by ${this.orders.map(({ column, ascending }) => `${quote(column)} ${ascending ? 'asc' : 'desc'}`).join(', ')}`;
    }
    if (this.operation === 'select' && this.rowLimit !== null) text += ` limit ${parameter(this.rowLimit)}`;
    if (this.operation === 'select' && this.rowOffset !== null) text += ` offset ${parameter(this.rowOffset)}`;
    if (this.operation === 'update' || this.operation === 'delete') text += ' returning *';
    return { text, values: parameters };
  }

  private async run(): Promise<DataResult<Row[]>> {
    try {
      const query = this.compile();
      return { data: await this.executeQuery(query.text, query.values) as Row[], error: null };
    } catch (error) {
      return { data: [], error: { message: error instanceof Error ? error.message : 'Database query failed.' } };
    }
  }
}

export type DataClient = ReturnType<typeof createDataClient>;

export type SubscriptionSyncInput = {
  workspace_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_key: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type CheckoutAttemptInput = {
  workspace_id: string;
  attempt_key: string;
  plan_key: string;
  monthly_cents?: number | null;
  expires_at: string;
};

export type ConnectedAccountReplacementInput = {
  workspace_id: string;
  expected_account_id: string;
  stripe_account_id: string;
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export type StudioClientStripeCustomerBindingInput = {
  workspace_id: string;
  client_id: string;
  stripe_account_id: string;
  expected_customer_id: string | null;
  stripe_customer_id: string;
};

export type RateLimitedInquiryInput = {
  workspace_id: string;
  ip_hash: string;
  name: string;
  email: string | null;
  phone: string | null;
  desired_date: string;
  message: string;
};

export function createDataClient(executeQuery: QueryExecutor) {
  return {
    from(table: string) {
      assertTable(table);
      return new DataQuery(table, executeQuery);
    },
    provisionClientSite(input: ProvisionClientSiteInput) {
      return runClientSiteProvisioning(executeQuery, input);
    },
    setSiteOperationalStatus(workspaceId: string, status: SiteOperationalStatus) {
      return runSiteOperationalStatusUpdate(executeQuery, workspaceId, status);
    },
    async syncSubscription(input: SubscriptionSyncInput): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const columns = [
          'workspace_id', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
          'plan_key', 'status', 'current_period_end', 'cancel_at_period_end',
        ] as const;
        const values = columns.map((column) => input[column]);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const updates = columns
          .filter((column) => column !== 'workspace_id')
          .map((column) => `${quote(column)} = excluded.${quote(column)}`)
          .join(', ');
        const text = `insert into ${quote('subscriptions')} (${columns.map(quote).join(', ')}) values (${placeholders}) on conflict (${quote('workspace_id')}) do update set ${updates} where ${quote('subscriptions')}.${quote('stripe_subscription_id')} = excluded.${quote('stripe_subscription_id')} or ${quote('subscriptions')}.${quote('status')} in ('canceled', 'incomplete_expired') returning *`;
        return { data: await executeQuery(text, values), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Database query failed.' } };
      }
    },
    async claimCheckoutAttempt(input: CheckoutAttemptInput): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const columns = ['workspace_id', 'attempt_key', 'plan_key', 'expires_at', 'monthly_cents'] as const;
        const values = [input.workspace_id, input.attempt_key, input.plan_key, input.expires_at, input.monthly_cents ?? null];
        const text = `insert into ${quote('checkout_attempts')} (${columns.map(quote).join(', ')}) values ($1, $2, $3, $4, $5) on conflict (${quote('workspace_id')}) do update set ${quote('attempt_key')} = excluded.${quote('attempt_key')}, ${quote('plan_key')} = excluded.${quote('plan_key')}, ${quote('monthly_cents')} = excluded.${quote('monthly_cents')}, ${quote('stripe_session_id')} = null, ${quote('checkout_url')} = null, ${quote('expires_at')} = excluded.${quote('expires_at')} where ${quote('checkout_attempts')}.${quote('expires_at')} <= now() + interval '60 seconds' or (${quote('checkout_attempts')}.${quote('checkout_url')} is null and ${quote('checkout_attempts')}.${quote('updated_at')} <= now() - interval '2 minutes') returning *`;
        return { data: await executeQuery(text, values), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Database query failed.' } };
      }
    },
    async insertOrdered(tableName: string, workspaceId: string, suppliedValues: Record<string, unknown>): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        assertTable(tableName);
        if (!orderedTables.has(tableName)) throw new Error('Table does not support ordered inserts.');
        const entries = Object.entries(suppliedValues);
        if (!entries.length) throw new Error('Ordered insert requires values.');
        for (const [column] of entries) {
          assertColumn(tableName, column);
          if (['workspace_id', 'sort_order', 'created_at', 'updated_at'].includes(column)) throw new Error('Ordered insert controls system columns.');
        }
        const table = quote(tableName);
        const parameters: unknown[] = [`${workspaceId}:${tableName}`, workspaceId, ...entries.map(([, value]) => value)];
        const placeholders = entries.map((_, index) => `$${index + 3}`);
        const quota = orderedInsertQuotas[tableName];
        const quotaPlaceholder = quota === undefined ? null : `$${parameters.push(quota)}`;
        const galleryIndex = entries.findIndex(([column]) => column === 'gallery_id');
        if (tableName === 'studio_gallery_images' && galleryIndex < 0) throw new Error('Gallery images require a gallery.');
        const groupFilter = tableName === 'studio_gallery_images'
          ? ` and ${quote('gallery_id')} = $${galleryIndex + 3}`
          : '';
        const capacityCte = quotaPlaceholder
          ? `, capacity as (select count(*) < ${quotaPlaceholder} as available from ${table} cross join lock where ${quote('workspace_id')} = $2)`
          : '';
        const capacityJoin = quotaPlaceholder ? ' cross join capacity where capacity.available' : '';
        const text = `with lock as (select pg_advisory_xact_lock(hashtextextended($1, 0)))${capacityCte}, next_order as (select coalesce(max(${quote('sort_order')}), 0) + 1 as ${quote('sort_order')} from ${table} cross join lock where ${quote('workspace_id')} = $2${groupFilter}) insert into ${table} (${[quote('workspace_id'), ...entries.map(([column]) => quote(column)), quote('sort_order')].join(', ')}) select $2, ${placeholders.join(', ')}, next_order.${quote('sort_order')} from next_order${capacityJoin} returning *`;
        return { data: await executeQuery(text, parameters), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Ordered insert failed.' } };
      }
    },
    async moveOrderedItem(tableName: string, workspaceId: string, id: string, direction: 'up' | 'down'): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        assertTable(tableName);
        if (!orderedTables.has(tableName)) throw new Error('Table does not support ordered moves.');
        const table = quote(tableName);
        const comparison = direction === 'up'
          ? `(candidate.${quote('sort_order')} < current_item.${quote('sort_order')} or (candidate.${quote('sort_order')} = current_item.${quote('sort_order')} and (candidate.${quote('created_at')}, candidate.${quote('id')}) < (current_item.${quote('created_at')}, current_item.${quote('id')})))`
          : `(candidate.${quote('sort_order')} > current_item.${quote('sort_order')} or (candidate.${quote('sort_order')} = current_item.${quote('sort_order')} and (candidate.${quote('created_at')}, candidate.${quote('id')}) > (current_item.${quote('created_at')}, current_item.${quote('id')})))`;
        const ordering = direction === 'up' ? 'desc' : 'asc';
        const gallerySelection = tableName === 'studio_gallery_images' ? `, target.${quote('gallery_id')}` : '';
        const galleryFilter = tableName === 'studio_gallery_images'
          ? ` and candidate.${quote('gallery_id')} = current_item.${quote('gallery_id')}`
          : '';
        const text = `with lock as (select pg_advisory_xact_lock(hashtextextended($1, 0))), current_item as (select target.${quote('id')}, target.${quote('sort_order')}, target.${quote('created_at')}${gallerySelection} from ${table} as target cross join lock where target.${quote('workspace_id')} = $2 and target.${quote('id')} = $3 for update of target), neighbor as (select candidate.${quote('id')}, candidate.${quote('sort_order')} from ${table} as candidate cross join current_item where candidate.${quote('workspace_id')} = $2${galleryFilter} and ${comparison} order by candidate.${quote('sort_order')} ${ordering}, candidate.${quote('created_at')} ${ordering}, candidate.${quote('id')} ${ordering} limit 1 for update of candidate), moved as (update ${table} as target set ${quote('sort_order')} = case when target.${quote('id')} = current_item.${quote('id')} then neighbor.${quote('sort_order')} else current_item.${quote('sort_order')} end from current_item, neighbor where target.${quote('workspace_id')} = $2 and (target.${quote('id')} = current_item.${quote('id')} or target.${quote('id')} = neighbor.${quote('id')}) returning target.*) select * from moved`;
        return { data: await executeQuery(text, [`${workspaceId}:${tableName}`, workspaceId, id]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Ordered move failed.' } };
      }
    },
    async replaceConnectedAccount(input: ConnectedAccountReplacementInput): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const values = [
          input.workspace_id,
          input.expected_account_id,
          input.stripe_account_id,
          input.onboarding_status,
          input.charges_enabled,
          input.payouts_enabled,
          input.details_submitted,
        ];
        const text = `with replaced as (update ${quote('connected_payment_accounts')} set ${quote('stripe_account_id')} = $3, ${quote('onboarding_status')} = $4, ${quote('charges_enabled')} = $5, ${quote('payouts_enabled')} = $6, ${quote('details_submitted')} = $7 where ${quote('workspace_id')} = $1 and ${quote('stripe_account_id')} = $2 returning *), retired_account as (insert into ${quote('connected_payment_account_history')} (${quote('workspace_id')}, ${quote('stripe_account_id')}, ${quote('retired_at')}) select replaced.${quote('workspace_id')}, $2, now() from replaced on conflict (${quote('stripe_account_id')}) do update set ${quote('workspace_id')} = excluded.${quote('workspace_id')}, ${quote('retired_at')} = excluded.${quote('retired_at')} returning *), cleared_clients as (update ${quote('studio_clients')} set ${quote('stripe_customer_id')} = null from replaced where ${quote('studio_clients')}.${quote('workspace_id')} = replaced.${quote('workspace_id')} returning ${quote('studio_clients')}.${quote('id')}), protected_invoices as (update ${quote('studio_invoices')} set ${quote('stripe_invoice_id')} = case when ${quote('studio_invoices')}.${quote('status')} = 'deposit_paid' then null else ${quote('studio_invoices')}.${quote('stripe_invoice_id')} end, ${quote('hosted_invoice_url')} = case when ${quote('studio_invoices')}.${quote('status')} = 'deposit_paid' then null else ${quote('studio_invoices')}.${quote('hosted_invoice_url')} end, ${quote('status')} = case when ${quote('studio_invoices')}.${quote('status')} in ('sending', 'open') or (${quote('studio_invoices')}.${quote('status')} in ('draft', 'uncollectible') and ${quote('studio_invoices')}.${quote('stripe_invoice_id')} is not null) then 'review' else ${quote('studio_invoices')}.${quote('status')} end from replaced where ${quote('studio_invoices')}.${quote('workspace_id')} = replaced.${quote('workspace_id')} and ${quote('studio_invoices')}.${quote('status')} in ('draft', 'sending', 'open', 'deposit_paid', 'uncollectible') returning ${quote('studio_invoices')}.${quote('id')}) select * from replaced`;
        return { data: await executeQuery(text, values), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Connected account replacement failed.' } };
      }
    },
    async bindStudioClientStripeCustomer(input: StudioClientStripeCustomerBindingInput): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const values = [
          input.workspace_id,
          input.client_id,
          input.stripe_account_id,
          input.expected_customer_id,
          input.stripe_customer_id,
        ];
        const text = `with active_account as (select ${quote('workspace_id')} from ${quote('connected_payment_accounts')} where ${quote('workspace_id')} = $1 and ${quote('stripe_account_id')} = $3 for update) update ${quote('studio_clients')} as client set ${quote('stripe_customer_id')} = $5 from active_account where client.${quote('workspace_id')} = active_account.${quote('workspace_id')} and client.${quote('id')} = $2 and (client.${quote('stripe_customer_id')} is not distinct from $4 or client.${quote('stripe_customer_id')} = $5) returning client.*`;
        return { data: await executeQuery(text, values), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Stripe customer binding failed.' } };
      }
    },
    async resolveWorkspaceForStripeAccount(stripeAccountId: string): Promise<DataResult<{ workspace_id: string; is_current: boolean } | null>> {
      try {
        const text = `select account.${quote('workspace_id')}, account.${quote('is_current')} from (select current_account.${quote('workspace_id')}, true as ${quote('is_current')}, 0 as priority from ${quote('connected_payment_accounts')} as current_account where current_account.${quote('stripe_account_id')} = $1 union all select retired.${quote('workspace_id')}, false as ${quote('is_current')}, 1 as priority from ${quote('connected_payment_account_history')} as retired where retired.${quote('stripe_account_id')} = $1) as account order by account.priority asc limit 1`;
        const rows = await executeQuery(text, [stripeAccountId]);
        const first = rows[0];
        return {
          data: typeof first?.workspace_id === 'string'
            ? { workspace_id: first.workspace_id, is_current: first.is_current === true }
            : null,
          error: null,
        };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : 'Stripe account workspace lookup failed.' } };
      }
    },
    async claimStripeEvent(eventId: string, eventType: string): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const text = `insert into ${quote('stripe_events')} (${quote('event_id')}, ${quote('event_type')}, ${quote('status')}, ${quote('attempt_count')}, ${quote('last_attempt_at')}) values ($1, $2, 'processing', 1, now()) on conflict (${quote('event_id')}) do update set ${quote('event_type')} = excluded.${quote('event_type')}, ${quote('status')} = 'processing', ${quote('attempt_count')} = ${quote('stripe_events')}.${quote('attempt_count')} + 1, ${quote('last_attempt_at')} = now(), ${quote('last_error')} = null where ${quote('stripe_events')}.${quote('status')} = 'failed' or (${quote('stripe_events')}.${quote('status')} = 'processing' and ${quote('stripe_events')}.${quote('last_attempt_at')} <= now() - interval '5 minutes') returning *`;
        return { data: await executeQuery(text, [eventId, eventType]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Stripe event claim failed.' } };
      }
    },
    async claimWorkspaceUpload(workspaceId: string, storagePath: string, sizeBytes: number, quotaBytes: number): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 15 * 1024 * 1024) throw new Error('Invalid upload size.');
        if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 16 * 1024 * 1024 || quotaBytes > 1_099_511_627_776) throw new Error('Invalid workspace quota.');
        const text = `with claimed_usage as (insert into ${quote('workspace_storage_usage')} (${quote('workspace_id')}, ${quote('used_bytes')}, ${quote('quota_bytes')}) select $1, $3::bigint, $4::bigint where $3::bigint <= $4::bigint on conflict (${quote('workspace_id')}) do update set ${quote('used_bytes')} = ${quote('workspace_storage_usage')}.${quote('used_bytes')} + excluded.${quote('used_bytes')} where ${quote('workspace_storage_usage')}.${quote('used_bytes')} + excluded.${quote('used_bytes')} <= ${quote('workspace_storage_usage')}.${quote('quota_bytes')} returning ${quote('workspace_id')}), recorded as (insert into ${quote('workspace_uploads')} (${quote('storage_path')}, ${quote('workspace_id')}, ${quote('size_bytes')}) select $2, $1, $3::bigint from claimed_usage returning *) select * from recorded`;
        return { data: await executeQuery(text, [workspaceId, storagePath, sizeBytes, quotaBytes]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Upload quota claim failed.' } };
      }
    },
    async releaseWorkspaceUpload(workspaceId: string, storagePath: string): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const text = `with removed as (delete from ${quote('workspace_uploads')} where ${quote('workspace_id')} = $1 and ${quote('storage_path')} = $2 returning ${quote('size_bytes')}), adjusted as (update ${quote('workspace_storage_usage')} set ${quote('used_bytes')} = greatest(0, ${quote('used_bytes')} - coalesce((select ${quote('size_bytes')} from removed), 0)) where ${quote('workspace_id')} = $1 and exists (select 1 from removed) returning ${quote('workspace_id')}) select * from removed`;
        return { data: await executeQuery(text, [workspaceId, storagePath]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Upload quota release failed.' } };
      }
    },
    async isWorkspaceUploadReferenced(workspaceId: string, storagePath: string): Promise<DataResult<boolean>> {
      try {
        const text = `select (exists (select 1 from ${quote('studio_galleries')} where ${quote('workspace_id')} = $1 and ${quote('cover_storage_path')} = $2) or exists (select 1 from ${quote('studio_gallery_images')} where ${quote('workspace_id')} = $1 and ${quote('storage_path')} = $2) or exists (select 1 from ${quote('studio_posts')} where ${quote('workspace_id')} = $1 and ${quote('cover_storage_path')} = $2) or exists (select 1 from ${quote('studio_work_stills')} where ${quote('workspace_id')} = $1 and ${quote('storage_path')} = $2)) as ${quote('referenced')}`;
        const rows = await executeQuery(text, [workspaceId, storagePath]);
        return { data: rows[0]?.referenced === true, error: null };
      } catch (error) {
        return { data: false, error: { message: error instanceof Error ? error.message : 'Upload reference check failed.' } };
      }
    },
    async claimInvoiceSend(workspaceId: string, invoiceId: string): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const text = `update ${quote('studio_invoices')} set ${quote('status')} = 'sending' where ${quote('workspace_id')} = $1 and ${quote('id')} = $2 and (${quote('status')} in ('draft', 'deposit_paid', 'uncollectible') or (${quote('status')} = 'sending' and ${quote('updated_at')} <= now() - interval '5 minutes')) returning *`;
        return { data: await executeQuery(text, [workspaceId, invoiceId]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Invoice send claim failed.' } };
      }
    },
    async createRateLimitedInquiry(input: RateLimitedInquiryInput): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        const values = [input.workspace_id, input.ip_hash, input.name, input.email, input.phone, input.desired_date, input.message];
        const text = `with allowance as (insert into ${quote('inquiry_rate_limits')} (${quote('workspace_id')}, ${quote('ip_hash')}, ${quote('request_times')}, ${quote('updated_at')}) values ($1::uuid, $2, array[now()]::timestamptz[], now()) on conflict (${quote('workspace_id')}, ${quote('ip_hash')}) do update set ${quote('request_times')} = (select array_append(coalesce(array_agg(recent.${quote('request_time')} order by recent.${quote('request_time')}), array[]::timestamptz[]), now()) from unnest(${quote('inquiry_rate_limits')}.${quote('request_times')}) as recent(${quote('request_time')}) where recent.${quote('request_time')} > now() - interval '10 minutes'), ${quote('updated_at')} = now() where (select count(*) from unnest(${quote('inquiry_rate_limits')}.${quote('request_times')}) as recent(${quote('request_time')}) where recent.${quote('request_time')} > now() - interval '10 minutes') < 5 returning ${quote('workspace_id')}), created as (insert into ${quote('studio_inquiries')} (${quote('workspace_id')}, ${quote('ip_hash')}, ${quote('name')}, ${quote('email')}, ${quote('phone')}, ${quote('desired_date')}, ${quote('message')}) select $1::uuid, $2, $3, $4, $5, $6, $7 from allowance returning *) select * from created`;
        return { data: await executeQuery(text, values), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Inquiry creation failed.' } };
      }
    },
    async findOrphanedWorkspaceUploads(workspaceId: string, createdBefore: string, limit: number): Promise<DataResult<Record<string, unknown>[]>> {
      try {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new Error('Invalid orphan cleanup limit.');
        const text = `select pending.${quote('storage_path')} from ${quote('workspace_uploads')} as pending where pending.${quote('workspace_id')} = $1 and pending.${quote('is_retained')} = false and pending.${quote('created_at')} < $2 and not exists (select 1 from ${quote('studio_galleries')} where ${quote('workspace_id')} = $1 and ${quote('cover_storage_path')} = pending.${quote('storage_path')}) and not exists (select 1 from ${quote('studio_gallery_images')} where ${quote('workspace_id')} = $1 and ${quote('storage_path')} = pending.${quote('storage_path')}) and not exists (select 1 from ${quote('studio_posts')} where ${quote('workspace_id')} = $1 and ${quote('cover_storage_path')} = pending.${quote('storage_path')}) and not exists (select 1 from ${quote('studio_work_stills')} where ${quote('workspace_id')} = $1 and ${quote('storage_path')} = pending.${quote('storage_path')}) order by pending.${quote('created_at')} asc limit $3`;
        return { data: await executeQuery(text, [workspaceId, createdBefore, limit]), error: null };
      } catch (error) {
        return { data: [], error: { message: error instanceof Error ? error.message : 'Orphan upload scan failed.' } };
      }
    },
  };
}

type PostgresConnection = {
  unsafe(text: string, values: unknown[]): Promise<readonly Record<string, unknown>[]>;
};

type PostgresOptions = {
  connect_timeout: number;
  idle_timeout: number;
  max: number;
  prepare: boolean;
};

type PostgresFactory = (connectionString: string, options: PostgresOptions) => PostgresConnection;

const DEFAULT_POSTGRES_POOL_MAX = 4;
const MAX_POSTGRES_POOL_MAX = 20;

function postgresOptions(poolMaxValue = process.env.DATABASE_POOL_MAX): PostgresOptions {
  const normalizedPoolMax = poolMaxValue?.trim() ?? '';
  const parsedPoolMax = /^\d+$/.test(normalizedPoolMax) ? Number(normalizedPoolMax) : Number.NaN;
  const max = Number.isInteger(parsedPoolMax) && parsedPoolMax >= 1 && parsedPoolMax <= MAX_POSTGRES_POOL_MAX
    ? parsedPoolMax
    : DEFAULT_POSTGRES_POOL_MAX;

  return {
    connect_timeout: 10,
    idle_timeout: 20,
    max,
    prepare: true,
  };
}

const defaultPostgresFactory: PostgresFactory = (connectionString, options) => postgres(
  connectionString,
  options,
) as unknown as PostgresConnection;

export function createPostgresDataClient(
  connectionString: string | undefined,
  factory: PostgresFactory = defaultPostgresFactory,
) {
  if (!connectionString) return null;
  const sql = factory(connectionString, postgresOptions());
  return createDataClient(async (text, values) => [...await sql.unsafe(text, values)]);
}

export async function userCanManageWorkspace(
  client: DataClient,
  clerkUserId: string,
  workspaceId: string,
  options: { allowPlatformAdmin?: boolean } = {},
) {
  if (!clerkUserId || !workspaceId) return false;
  const membership = await client
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ role: string }>();
  if (membership.data && ['owner', 'admin'].includes(membership.data.role)) return true;
  if (options.allowPlatformAdmin === false) return false;

  const admin = await client
    .from('app_admins')
    .select('clerk_user_id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ clerk_user_id: string }>();
  return Boolean(admin.data?.clerk_user_id);
}
