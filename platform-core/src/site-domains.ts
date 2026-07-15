import { isIP } from 'node:net';

export type DomainQueryExecutor = (
  text: string,
  values: unknown[],
) => Promise<Record<string, unknown>[]>;

export type DomainOperation<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type DomainAliasStatus =
  | 'requested'
  | 'configuring'
  | 'dns_pending'
  | 'active'
  | 'error'
  | 'removing'
  | 'removed';

export type DomainJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type DomainActionResult = {
  outcome: 'queued' | 'replayed' | 'already_exists' | 'missing_site' | 'archived' | 'hostname_conflict' | 'missing_domain' | 'not_refreshable' | 'already_removing' | 'already_removed' | 'idempotency_conflict';
  domain_id: string | null;
  hostname: string | null;
  domain_status: DomainAliasStatus | null;
  dns_target: string | null;
  job_id: string | null;
  job_status: DomainJobStatus | null;
};

export type RequestCustomDomainInput = {
  workspace_id: string;
  hostname: string;
  actor: string;
  idempotency_key: string;
  dns_target?: string;
};

export type QueueDomainActionInput = {
  workspace_id: string;
  domain_id: string;
  idempotency_key: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_PATTERN = /^[A-Za-z0-9_:-]{3,128}$/;
const DEFAULT_DNS_TARGET = 'customers.leonsites.org';

function normalizeHostname(value: string, message: string) {
  const original = value.trim();
  const hostname = (original.endsWith('.') ? original.slice(0, -1) : original).toLowerCase();
  const labels = hostname.split('.');
  const valid = hostname.length >= 3
    && hostname.length <= 253
    && labels.length >= 2
    && !isIP(hostname)
    && labels.every((label) => label.length >= 1
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  if (!valid) throw new Error(message);
  return hostname;
}

export function normalizeCustomDomainHostname(value: string) {
  const hostname = normalizeHostname(value, 'Invalid custom domain.');
  if (hostname === 'leonsites.org' || hostname.endsWith('.leonsites.org')) {
    throw new Error('Leon Sites addresses cannot be custom domains.');
  }
  return hostname;
}

function normalizeDnsTarget(value?: string) {
  const target = normalizeHostname(value ?? DEFAULT_DNS_TARGET, 'Invalid DNS target.');
  if (target !== DEFAULT_DNS_TARGET) throw new Error('Invalid DNS target.');
  return target;
}

function validateUuid(value: string, message: string) {
  if (!UUID_PATTERN.test(value)) throw new Error(message);
}

function validateQueueInput(input: QueueDomainActionInput) {
  validateUuid(input.workspace_id, 'Invalid workspace.');
  validateUuid(input.domain_id, 'Invalid custom domain.');
  validateUuid(input.idempotency_key, 'Invalid domain request key.');
}

const requestDomainSql = `
with actor_context as materialized (
  select set_config('leon.request_actor', $5, true) as "actor"
),
host_lock as materialized (
  select pg_advisory_xact_lock(hashtextextended($2, 0))
  from actor_context
),
locked_site as materialized (
  select connection."workspace_id", connection."status"
  from "site_connections" as connection
  cross join host_lock
  where connection."workspace_id" = $1::uuid
  for update of connection
),
existing_job as materialized (
  select job."id", job."domain_id", job."action", job."status", alias."workspace_id", alias."hostname"
  from "domain_jobs" as job
  join "site_domain_aliases" as alias on alias."id" = job."domain_id"
  where job."idempotency_key" = $4::uuid
),
hostname_owner as materialized (
  select alias.*
  from "site_domain_aliases" as alias
  cross join host_lock
  where lower(alias."hostname") = $2
    and alias."status" <> 'removed'
  limit 1
),
connection_hostname_owner as materialized (
  select connection."workspace_id"
  from "site_connections" as connection
  cross join host_lock
  where lower(connection."primary_domain") = $2
     or lower(connection."admin_domain") = $2
  limit 1
),
created_alias as materialized (
  insert into "site_domain_aliases" (
    "workspace_id", "hostname", "status", "is_canonical", "dns_target"
  )
  select locked_site."workspace_id", $2, 'requested', false, $3
  from locked_site
  where locked_site."status" <> 'archived'
    and not exists (select 1 from existing_job)
    and not exists (select 1 from hostname_owner)
    and not exists (select 1 from connection_hostname_owner)
  on conflict do nothing
  returning *
),
domain_row as materialized (
  select * from created_alias
  union all
  select alias.*
  from "site_domain_aliases" as alias
  join existing_job on existing_job."domain_id" = alias."id"
  where not exists (select 1 from created_alias)
  union all
  select hostname_owner.*
  from hostname_owner
  where not exists (select 1 from created_alias)
    and not exists (select 1 from existing_job)
),
created_job as materialized (
  insert into "domain_jobs" ("domain_id", "action", "idempotency_key")
  select created_alias."id", 'create', $4::uuid
  from created_alias
  on conflict ("idempotency_key") do nothing
  returning *
),
job_row as materialized (
  select * from created_job
  union all
  select job.*
  from "domain_jobs" as job
  join existing_job on existing_job."id" = job."id"
  where not exists (select 1 from created_job)
)
select
  case
    when exists (
      select 1 from existing_job
      where "action" <> 'create'
         or "workspace_id" <> $1::uuid
         or lower("hostname") <> $2
    )
      then 'idempotency_conflict'
    when exists (select 1 from existing_job) then 'replayed'
    when not exists (select 1 from locked_site) then 'missing_site'
    when (select "status" = 'archived' from locked_site) then 'archived'
    when exists (select 1 from connection_hostname_owner) then 'hostname_conflict'
    when exists (select 1 from hostname_owner where "workspace_id" <> $1::uuid) then 'hostname_conflict'
    when exists (select 1 from hostname_owner) then 'already_exists'
    when exists (select 1 from created_job) then 'queued'
    else 'hostname_conflict'
  end as "outcome",
  (select "id"::text from domain_row limit 1) as "domain_id",
  (select "hostname" from domain_row limit 1) as "hostname",
  (select "status" from domain_row limit 1) as "domain_status",
  (select "dns_target" from domain_row limit 1) as "dns_target",
  (select "id"::text from job_row limit 1) as "job_id",
  (select "status" from job_row limit 1) as "job_status"
`;

const queueRefreshSql = `
with locked_domain as materialized (
  select alias.*
  from "site_domain_aliases" as alias
  where alias."workspace_id" = $1::uuid
    and alias."id" = $2::uuid
  for update
),
existing_job as materialized (
  select job.*
  from "domain_jobs" as job
  where job."idempotency_key" = $3::uuid
),
created_job as materialized (
  insert into "domain_jobs" ("domain_id", "action", "idempotency_key")
  select locked_domain."id", 'refresh', $3::uuid
  from locked_domain
  where locked_domain."status" not in ('removing', 'removed')
    and not exists (select 1 from existing_job)
  on conflict ("idempotency_key") do nothing
  returning *
),
job_row as materialized (
  select * from created_job
  union all
  select * from existing_job where not exists (select 1 from created_job)
)
select
  case
    when exists (
      select 1 from existing_job
      where "domain_id" <> $2::uuid or "action" <> 'refresh'
    ) then 'idempotency_conflict'
    when exists (select 1 from existing_job) then 'replayed'
    when not exists (select 1 from locked_domain) then 'missing_domain'
    when (select "status" in ('removing', 'removed') from locked_domain) then 'not_refreshable'
    else 'queued'
  end as "outcome",
  (select "id"::text from locked_domain limit 1) as "domain_id",
  (select "hostname" from locked_domain limit 1) as "hostname",
  (select "status" from locked_domain limit 1) as "domain_status",
  (select "dns_target" from locked_domain limit 1) as "dns_target",
  (select "id"::text from job_row limit 1) as "job_id",
  (select "status" from job_row limit 1) as "job_status"
`;

const queueRemovalSql = `
with locked_domain as materialized (
  select alias.*
  from "site_domain_aliases" as alias
  where alias."workspace_id" = $1::uuid
    and alias."id" = $2::uuid
  for update
),
existing_job as materialized (
  select job.*
  from "domain_jobs" as job
  where job."idempotency_key" = $3::uuid
),
marked_removing as materialized (
  update "site_domain_aliases" as alias
  set "status" = 'removing', "is_canonical" = false, "last_error" = null
  from locked_domain
  where alias."id" = locked_domain."id"
    and locked_domain."status" not in ('removing', 'removed')
    and not exists (select 1 from existing_job)
  returning alias.*
),
superseded_jobs as materialized (
  update "domain_jobs" as job
  set "status" = 'failed', "locked_at" = null, "last_error" = 'Superseded by domain removal.'
  from marked_removing
  where job."domain_id" = marked_removing."id"
    and job."status" = 'queued'
    and job."action" in ('create', 'refresh')
  returning job."id"
),
created_job as materialized (
  insert into "domain_jobs" ("domain_id", "action", "idempotency_key")
  select marked_removing."id", 'delete', $3::uuid
  from marked_removing
  on conflict ("idempotency_key") do nothing
  returning *
),
job_row as materialized (
  select * from created_job
  union all
  select * from existing_job where not exists (select 1 from created_job)
),
domain_row as materialized (
  select * from marked_removing
  union all
  select * from locked_domain where not exists (select 1 from marked_removing)
)
select
  case
    when exists (
      select 1 from existing_job
      where "domain_id" <> $2::uuid or "action" <> 'delete'
    ) then 'idempotency_conflict'
    when exists (select 1 from existing_job) then 'replayed'
    when not exists (select 1 from locked_domain) then 'missing_domain'
    when (select "status" = 'removed' from locked_domain) then 'already_removed'
    when (select "status" = 'removing' from locked_domain) then 'already_removing'
    else 'queued'
  end as "outcome",
  (select "id"::text from domain_row limit 1) as "domain_id",
  (select "hostname" from domain_row limit 1) as "hostname",
  (select "status" from domain_row limit 1) as "domain_status",
  (select "dns_target" from domain_row limit 1) as "dns_target",
  (select "id"::text from job_row limit 1) as "job_id",
  (select "status" from job_row limit 1) as "job_status"
`;

function domainResult(row: Record<string, unknown> | undefined): DomainActionResult | null {
  if (!row) return null;
  return {
    outcome: String(row.outcome) as DomainActionResult['outcome'],
    domain_id: typeof row.domain_id === 'string' ? row.domain_id : null,
    hostname: typeof row.hostname === 'string' ? row.hostname : null,
    domain_status: typeof row.domain_status === 'string' ? row.domain_status as DomainAliasStatus : null,
    dns_target: typeof row.dns_target === 'string' ? row.dns_target : null,
    job_id: typeof row.job_id === 'string' ? row.job_id : null,
    job_status: typeof row.job_status === 'string' ? row.job_status as DomainJobStatus : null,
  };
}

async function executeDomainAction(
  executeQuery: DomainQueryExecutor,
  text: string,
  values: unknown[],
): Promise<DomainOperation<DomainActionResult>> {
  try {
    const data = domainResult((await executeQuery(text, values))[0]);
    return data
      ? { data, error: null }
      : { data: null, error: { message: 'Domain operation state was not returned.' } };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Custom domain operation failed.' },
    };
  }
}

export async function requestCustomDomain(
  executeQuery: DomainQueryExecutor,
  input: RequestCustomDomainInput,
): Promise<DomainOperation<DomainActionResult>> {
  try {
    validateUuid(input.workspace_id, 'Invalid workspace.');
    validateUuid(input.idempotency_key, 'Invalid domain request key.');
    if (!ACTOR_PATTERN.test(input.actor)) throw new Error('Invalid domain actor.');
    const hostname = normalizeCustomDomainHostname(input.hostname);
    const dnsTarget = normalizeDnsTarget(input.dns_target);
    if (hostname === dnsTarget) throw new Error('Invalid custom domain.');
    return await executeDomainAction(executeQuery, requestDomainSql, [
      input.workspace_id,
      hostname,
      dnsTarget,
      input.idempotency_key,
      input.actor,
    ]);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Custom domain request failed.' },
    };
  }
}

export async function queueDomainRefresh(
  executeQuery: DomainQueryExecutor,
  input: QueueDomainActionInput,
): Promise<DomainOperation<DomainActionResult>> {
  try {
    validateQueueInput(input);
    return await executeDomainAction(executeQuery, queueRefreshSql, [
      input.workspace_id,
      input.domain_id,
      input.idempotency_key,
    ]);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Domain refresh request failed.' },
    };
  }
}

export async function queueDomainRemoval(
  executeQuery: DomainQueryExecutor,
  input: QueueDomainActionInput,
): Promise<DomainOperation<DomainActionResult>> {
  try {
    validateQueueInput(input);
    return await executeDomainAction(executeQuery, queueRemovalSql, [
      input.workspace_id,
      input.domain_id,
      input.idempotency_key,
    ]);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Domain removal request failed.' },
    };
  }
}
