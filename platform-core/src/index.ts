import postgres from 'postgres';

export type QueryExecutor = (text: string, values: unknown[]) => Promise<Record<string, unknown>[]>;

export type DataError = { message: string };
export type DataResult<T> = { data: T; error: DataError | null };

const schema = {
  app_admins: ['clerk_user_id', 'display_name', 'created_at'],
  client_workspaces: ['id', 'clerk_org_id', 'name', 'slug', 'status', 'stripe_customer_id', 'created_at', 'updated_at'],
  connected_payment_accounts: ['id', 'workspace_id', 'stripe_account_id', 'onboarding_status', 'charges_enabled', 'payouts_enabled', 'details_submitted', 'created_at', 'updated_at'],
  contact_inquiries: ['id', 'created_at', 'name', 'email', 'focus', 'message', 'ip_hash'],
  content_requests: ['id', 'workspace_id', 'created_by_clerk_user_id', 'subject', 'details', 'status', 'created_at', 'updated_at'],
  site_connections: ['workspace_id', 'site_key', 'primary_domain', 'deployment_target', 'github_repository', 'status', 'current_version', 'last_seen_at', 'updated_at'],
  studio_clients: ['id', 'workspace_id', 'service_id', 'stripe_customer_id', 'name', 'email', 'phone', 'notes', 'created_at', 'updated_at'],
  studio_galleries: ['id', 'workspace_id', 'title', 'slug', 'category', 'description', 'cover_image_url', 'cover_storage_path', 'status', 'sort_order', 'created_at', 'updated_at'],
  studio_gallery_images: ['id', 'workspace_id', 'gallery_id', 'image_url', 'alt_text', 'storage_path', 'sort_order', 'created_at', 'updated_at'],
  studio_inquiries: ['id', 'workspace_id', 'name', 'email', 'phone', 'desired_date', 'message', 'ip_hash', 'status', 'created_at', 'updated_at'],
  studio_invoices: ['id', 'workspace_id', 'client_id', 'stripe_invoice_id', 'status', 'description', 'amount_due_cents', 'deposit_cents', 'due_date', 'hosted_invoice_url', 'created_at', 'updated_at'],
  studio_posts: ['id', 'workspace_id', 'title', 'slug', 'excerpt', 'body', 'cover_image_url', 'cover_storage_path', 'status', 'published_at', 'sort_order', 'created_at', 'updated_at'],
  studio_services: ['id', 'workspace_id', 'name', 'description', 'price_type', 'price_cents', 'is_active', 'sort_order', 'created_at', 'updated_at'],
  studio_settings: ['workspace_id', 'site_title', 'hero_title', 'hero_subtitle', 'contact_email', 'contact_phone', 'paper_color', 'ink_color', 'accent_color', 'font_preset', 'updated_at'],
  stripe_events: ['event_id', 'event_type', 'status', 'attempt_count', 'last_error', 'created_at', 'last_attempt_at', 'processed_at'],
  subscriptions: ['id', 'workspace_id', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id', 'plan_key', 'status', 'current_period_end', 'cancel_at_period_end', 'created_at', 'updated_at'],
  website_projects: ['id', 'workspace_id', 'name', 'status', 'plan_key', 'progress', 'next_step', 'live_url', 'created_at', 'updated_at'],
  workspace_members: ['id', 'workspace_id', 'clerk_user_id', 'role', 'created_at'],
} as const;

type Table = keyof typeof schema;
type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

const conflictColumns: Partial<Record<Table, string>> = {
  site_connections: 'workspace_id',
  studio_settings: 'workspace_id',
  subscriptions: 'workspace_id',
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
  private filters: Array<{ column: string; operator: '=' | '>='; value: unknown }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
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
      const conditions = this.filters.map(({ column, operator, value }) => value === null && operator === '='
        ? `${quote(column)} is null`
        : `${quote(column)} ${operator} ${parameter(value)}`);
      text += ` where ${conditions.join(' and ')}`;
    }
    if (this.operation === 'select' && this.orders.length) {
      text += ` order by ${this.orders.map(({ column, ascending }) => `${quote(column)} ${ascending ? 'asc' : 'desc'}`).join(', ')}`;
    }
    if (this.operation === 'select' && this.rowLimit !== null) text += ` limit ${parameter(this.rowLimit)}`;
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

export function createDataClient(executeQuery: QueryExecutor) {
  return {
    from(table: string) {
      assertTable(table);
      return new DataQuery(table, executeQuery);
    },
  };
}

type PostgresConnection = {
  unsafe(text: string, values: unknown[]): Promise<readonly Record<string, unknown>[]>;
};

type PostgresFactory = (connectionString: string) => PostgresConnection;

const defaultPostgresFactory: PostgresFactory = (connectionString) => postgres(connectionString, {
  connect_timeout: 10,
  idle_timeout: 20,
  max: 10,
  prepare: true,
}) as unknown as PostgresConnection;

export function createPostgresDataClient(
  connectionString: string | undefined,
  factory: PostgresFactory = defaultPostgresFactory,
) {
  if (!connectionString) return null;
  const sql = factory(connectionString);
  return createDataClient(async (text, values) => [...await sql.unsafe(text, values)]);
}

export async function userCanManageWorkspace(client: DataClient, clerkUserId: string, workspaceId: string) {
  if (!clerkUserId || !workspaceId) return false;
  const membership = await client
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ role: string }>();
  if (membership.data && ['owner', 'admin'].includes(membership.data.role)) return true;

  const admin = await client
    .from('app_admins')
    .select('clerk_user_id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ clerk_user_id: string }>();
  return Boolean(admin.data?.clerk_user_id);
}
