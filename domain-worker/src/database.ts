import postgres from 'postgres';

import type { AliasProviderState } from './domain-state.js';

export type DomainJobAction = 'create' | 'refresh' | 'delete';

export interface DomainJob {
  id: string;
  domainId: string;
  action: DomainJobAction;
  attemptCount: number;
}

export interface SiteDomainAlias {
  id: string;
  workspaceId: string;
  hostname: string;
  status: string;
  isCanonical: boolean;
  cloudflareCustomHostnameId: string | null;
}

export interface DomainReconciliation extends SiteDomainAlias {
  leaseStartedAt: Date;
}

export interface AliasProviderObservation {
  cloudflareCustomHostnameId: string;
  state: AliasProviderState;
}

export interface DomainReconciliationStore {
  completeAliasReconciliation(
    target: DomainReconciliation,
    cloudflareCustomHostnameId: string,
    state: AliasProviderState,
  ): Promise<boolean>;
  markAliasReconciliationMissing(target: DomainReconciliation, message: string): Promise<boolean>;
  recordAliasReconciliationFailure(
    target: DomainReconciliation,
    message: string,
    observation?: AliasProviderObservation,
  ): Promise<boolean>;
}

export interface DomainJobStore extends DomainReconciliationStore {
  claimNextJob(lockTimeoutMs: number): Promise<DomainJob | null>;
  claimNextReconciliation(reconcileIntervalMs: number, lockTimeoutMs: number): Promise<DomainReconciliation | null>;
  getAlias(domainId: string): Promise<SiteDomainAlias | null>;
  completeProviderJob(
    job: DomainJob,
    cloudflareCustomHostnameId: string,
    state: AliasProviderState,
  ): Promise<void>;
  completeDeleteJob(job: DomainJob): Promise<void>;
  retryJob(job: DomainJob, message: string, delayMs: number): Promise<void>;
  failJob(job: DomainJob, message: string): Promise<void>;
}

interface JobRow {
  id: string;
  domain_id: string;
  action: DomainJobAction;
  attempt_count: number;
}

interface AliasRow {
  id: string;
  workspace_id: string;
  hostname: string;
  status: string;
  is_canonical: boolean;
  cloudflare_custom_hostname_id: string | null;
}

interface ReconciliationRow extends AliasRow {
  lease_started_at: Date;
}

interface IdRow {
  id: string;
}

export type PostgresConnection = ReturnType<typeof postgres>;

function first<T>(rows: readonly T[]): T | null {
  return rows[0] ?? null;
}

function requireUpdated(rows: readonly IdRow[], description: string): void {
  if (rows.length === 0) throw new Error(`${description} was not updated.`);
}

export function connectPostgres(databaseUrl: string, poolMax: number): PostgresConnection {
  return postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: poolMax,
    prepare: true,
  });
}

export class PostgresDomainJobStore implements DomainJobStore {
  constructor(private readonly sql: PostgresConnection) {}

  async assertReady(): Promise<void> {
    await this.sql`select id from domain_jobs limit 1`;
    await this.sql`select id from site_domain_aliases limit 1`;
  }

  async claimNextJob(lockTimeoutMs: number): Promise<DomainJob | null> {
    const rows = await this.sql<JobRow[]>`
      with claimable_job as (
        select job.id
        from domain_jobs as job
        join site_domain_aliases as alias on alias.id = job.domain_id
        where (
          (job.status = 'queued' and job.available_at <= now())
          or (
            job.status = 'processing'
            and coalesce(job.locked_at, job.updated_at) <= now() - (${lockTimeoutMs} * interval '1 millisecond')
          )
        )
        and job.attempt_count < 20
        and (
          (job.action = 'delete' and alias.status <> 'removed')
          or (job.action <> 'delete' and alias.status not in ('removing', 'removed'))
        )
        and not exists (
          select 1 from domain_jobs as active_job
          where active_job.domain_id = job.domain_id
            and active_job.id <> job.id
            and active_job.status = 'processing'
            and coalesce(active_job.locked_at, active_job.updated_at) > now() - (${lockTimeoutMs} * interval '1 millisecond')
        )
        order by job.available_at asc, job.created_at asc, job.id asc
        for update of job, alias skip locked
        limit 1
      )
      , claimed_job as (
        update domain_jobs as job
        set
          status = 'processing',
          attempt_count = job.attempt_count + 1,
          locked_at = now(),
          last_error = null
        from claimable_job
        where job.id = claimable_job.id
        returning job.id, job.domain_id, job.action, job.attempt_count
      )
      , superseded_jobs as (
        update domain_jobs as sibling
        set
          status = 'failed',
          locked_at = null,
          last_error = 'Superseded by domain removal.'
        from claimed_job
        where claimed_job.action = 'delete'
          and sibling.domain_id = claimed_job.domain_id
          and sibling.id <> claimed_job.id
          and sibling.action in ('create', 'refresh')
          and (
            sibling.status = 'queued'
            or (
              sibling.status = 'processing'
              and coalesce(sibling.locked_at, sibling.updated_at) <= now() - (${lockTimeoutMs} * interval '1 millisecond')
            )
          )
        returning sibling.id
      )
      , started_alias as (
        update site_domain_aliases as alias
        set
          status = case
            when claimed_job.action = 'create' then 'configuring'
            when claimed_job.action = 'delete' then 'removing'
            when alias.status = 'error' then 'configuring'
            else alias.status
          end,
          last_error = null
        from claimed_job
        where alias.id = claimed_job.domain_id
        returning alias.id
      )
      select
        claimed_job.id,
        claimed_job.domain_id,
        claimed_job.action,
        claimed_job.attempt_count
      from claimed_job
      where exists (select 1 from started_alias)
    `;

    const row = first(rows);
    return row ? {
      id: row.id,
      domainId: row.domain_id,
      action: row.action,
      attemptCount: row.attempt_count,
    } : null;
  }

  async claimNextReconciliation(
    reconcileIntervalMs: number,
    lockTimeoutMs: number,
  ): Promise<DomainReconciliation | null> {
    const rows = await this.sql<ReconciliationRow[]>`
      with reconcilable_alias as (
        select alias.id
        from site_domain_aliases as alias
        where alias.status in ('dns_pending', 'active', 'error')
          and (
            alias.last_checked_at is null
            or alias.last_checked_at <= now() - (${reconcileIntervalMs} * interval '1 millisecond')
          )
          and not exists (
            select 1
            from domain_jobs as job
            where job.domain_id = alias.id
              and (
                job.status = 'queued'
                or (
                  job.status = 'processing'
                  and coalesce(job.locked_at, job.updated_at) > now() - (${lockTimeoutMs} * interval '1 millisecond')
                )
              )
          )
        order by alias.last_checked_at asc nulls first, alias.created_at asc, alias.id asc
        for update of alias skip locked
        limit 1
      )
      , leased_alias as (
        update site_domain_aliases as alias
        set last_checked_at = date_trunc('milliseconds', clock_timestamp())
        from reconcilable_alias
        where alias.id = reconcilable_alias.id
        returning
          alias.id,
          alias.workspace_id,
          alias.hostname,
          alias.status,
          alias.is_canonical,
          alias.cloudflare_custom_hostname_id,
          alias.last_checked_at as lease_started_at
      )
      select * from leased_alias
    `;

    const row = first(rows);
    return row ? {
      id: row.id,
      workspaceId: row.workspace_id,
      hostname: row.hostname,
      status: row.status,
      isCanonical: row.is_canonical,
      cloudflareCustomHostnameId: row.cloudflare_custom_hostname_id,
      leaseStartedAt: row.lease_started_at,
    } : null;
  }

  async getAlias(domainId: string): Promise<SiteDomainAlias | null> {
    const rows = await this.sql<AliasRow[]>`
      select
        alias.id,
        alias.workspace_id,
        alias.hostname,
        alias.status,
        alias.is_canonical,
        alias.cloudflare_custom_hostname_id
      from site_domain_aliases as alias
      where alias.id = ${domainId}
      limit 1
    `;
    const row = first(rows);
    return row ? {
      id: row.id,
      workspaceId: row.workspace_id,
      hostname: row.hostname,
      status: row.status,
      isCanonical: row.is_canonical,
      cloudflareCustomHostnameId: row.cloudflare_custom_hostname_id,
    } : null;
  }

  async completeProviderJob(
    job: DomainJob,
    cloudflareCustomHostnameId: string,
    state: AliasProviderState,
  ): Promise<void> {
    await this.sql.begin(async (sql) => {
      if (state.aliasStatus === 'active') {
        await sql`
          select pg_advisory_xact_lock(hashtextextended(alias.workspace_id::text, 0))
          from site_domain_aliases as alias
          where alias.id = ${job.domainId}
        `;
      }

      const aliases = await sql<IdRow[]>`
        update site_domain_aliases as alias
        set
          status = case
            when alias.status = 'removing' then 'removing'
            else ${state.aliasStatus}
          end,
          is_canonical = case
            when alias.status = 'removing' then false
            when ${state.aliasStatus} <> 'active' then false
            when alias.is_canonical then true
            when not exists (
              select 1
              from site_domain_aliases as canonical
              where canonical.workspace_id = alias.workspace_id
                and canonical.id <> alias.id
                and canonical.is_canonical = true
                and canonical.status = 'active'
            ) then true
            else false
          end,
          cloudflare_custom_hostname_id = ${cloudflareCustomHostnameId},
          cloudflare_hostname_status = ${state.cloudflareHostnameStatus},
          cloudflare_ssl_status = ${state.cloudflareSslStatus},
          last_error = ${state.lastError},
          last_checked_at = now()
        where alias.id = ${job.domainId}
          and alias.status <> 'removed'
        returning alias.id
      `;

      const jobs = await sql<IdRow[]>`
        update domain_jobs
        set status = 'completed', locked_at = null, last_error = null
        where id = ${job.id}
          and status = 'processing'
          and attempt_count = ${job.attemptCount}
        returning id
      `;
      requireUpdated(jobs, 'Domain job');

      if (aliases.length === 0) return;
    });
  }

  async completeAliasReconciliation(
    target: DomainReconciliation,
    cloudflareCustomHostnameId: string,
    state: AliasProviderState,
  ): Promise<boolean> {
    return this.sql.begin(async (sql) => {
      if (state.aliasStatus === 'active') {
        await sql`
          select pg_advisory_xact_lock(hashtextextended(alias.workspace_id::text, 0))
          from site_domain_aliases as alias
          where alias.id = ${target.id}
        `;
      }

      const aliases = await sql<IdRow[]>`
        update site_domain_aliases as alias
        set
          status = ${state.aliasStatus},
          is_canonical = case
            when ${state.aliasStatus} <> 'active' then false
            when alias.is_canonical then true
            when not exists (
              select 1
              from site_domain_aliases as canonical
              where canonical.workspace_id = alias.workspace_id
                and canonical.id <> alias.id
                and canonical.is_canonical = true
                and canonical.status = 'active'
            ) then true
            else false
          end,
          cloudflare_custom_hostname_id = ${cloudflareCustomHostnameId},
          cloudflare_hostname_status = ${state.cloudflareHostnameStatus},
          cloudflare_ssl_status = ${state.cloudflareSslStatus},
          last_error = ${state.lastError},
          last_checked_at = now()
        where alias.id = ${target.id}
          and alias.last_checked_at = ${target.leaseStartedAt}
          and alias.status not in ('removing', 'removed')
          and not exists (
            select 1 from domain_jobs as job
            where job.domain_id = alias.id
              and (
                job.status = 'queued'
                or (
                  job.status = 'processing'
                  and coalesce(job.locked_at, job.updated_at) >= ${target.leaseStartedAt}
                )
              )
          )
        returning alias.id
      `;
      return aliases.length > 0;
    });
  }

  async markAliasReconciliationMissing(
    target: DomainReconciliation,
    message: string,
  ): Promise<boolean> {
    const aliases = await this.sql<IdRow[]>`
      update site_domain_aliases as alias
      set
        status = 'error',
        is_canonical = false,
        cloudflare_custom_hostname_id = null,
        cloudflare_hostname_status = 'missing',
        cloudflare_ssl_status = 'missing',
        last_error = ${message},
        last_checked_at = now()
      where alias.id = ${target.id}
        and alias.last_checked_at = ${target.leaseStartedAt}
        and alias.status not in ('removing', 'removed')
        and not exists (
          select 1 from domain_jobs as job
          where job.domain_id = alias.id
            and (
              job.status = 'queued'
              or (
                job.status = 'processing'
                and coalesce(job.locked_at, job.updated_at) >= ${target.leaseStartedAt}
              )
            )
        )
      returning alias.id
    `;
    return aliases.length > 0;
  }

  async recordAliasReconciliationFailure(
    target: DomainReconciliation,
    message: string,
    observation?: AliasProviderObservation,
  ): Promise<boolean> {
    const hasObservation = Boolean(observation);
    const observedState = observation?.state;
    const aliases = await this.sql<IdRow[]>`
      update site_domain_aliases as alias
      set
        status = case
          when ${hasObservation} then ${observedState?.aliasStatus ?? target.status}
          else alias.status
        end,
        is_canonical = case
          when ${hasObservation} and ${observedState?.aliasStatus ?? target.status} <> 'active' then false
          else alias.is_canonical
        end,
        cloudflare_custom_hostname_id = case
          when ${hasObservation} then ${observation?.cloudflareCustomHostnameId ?? null}
          else alias.cloudflare_custom_hostname_id
        end,
        cloudflare_hostname_status = case
          when ${hasObservation} then ${observedState?.cloudflareHostnameStatus ?? null}
          else alias.cloudflare_hostname_status
        end,
        cloudflare_ssl_status = case
          when ${hasObservation} then ${observedState?.cloudflareSslStatus ?? null}
          else alias.cloudflare_ssl_status
        end,
        last_error = ${message},
        last_checked_at = now()
      where alias.id = ${target.id}
        and alias.last_checked_at = ${target.leaseStartedAt}
        and alias.status not in ('removing', 'removed')
        and not exists (
          select 1 from domain_jobs as job
          where job.domain_id = alias.id
            and (
              job.status = 'queued'
              or (
                job.status = 'processing'
                and coalesce(job.locked_at, job.updated_at) >= ${target.leaseStartedAt}
              )
            )
        )
      returning alias.id
    `;
    return aliases.length > 0;
  }

  async completeDeleteJob(job: DomainJob): Promise<void> {
    await this.sql.begin(async (sql) => {
      const aliases = await sql<IdRow[]>`
        update site_domain_aliases
        set
          status = 'removed',
          is_canonical = false,
          cloudflare_custom_hostname_id = null,
          cloudflare_hostname_status = 'deleted',
          cloudflare_ssl_status = 'deleted',
          last_error = null,
          last_checked_at = now()
        where id = ${job.domainId}
        returning id
      `;
      requireUpdated(aliases, 'Site domain alias');

      await sql`
        update domain_jobs
        set status = 'failed', locked_at = null, last_error = 'Superseded by completed domain removal.'
        where domain_id = ${job.domainId}
          and id <> ${job.id}
          and (
            (action = 'delete' and status = 'queued')
            or (action in ('create', 'refresh') and status in ('queued', 'processing'))
          )
      `;

      const jobs = await sql<IdRow[]>`
        update domain_jobs
        set status = 'completed', locked_at = null, last_error = null
        where id = ${job.id}
          and status = 'processing'
          and attempt_count = ${job.attemptCount}
        returning id
      `;
      requireUpdated(jobs, 'Domain job');
    });
  }

  async retryJob(job: DomainJob, message: string, delayMs: number): Promise<void> {
    await this.sql.begin(async (sql) => {
      await sql`
        update site_domain_aliases
        set last_error = ${message}, last_checked_at = now()
        where id = ${job.domainId}
          and (${job.action} = 'delete' or status not in ('removing', 'removed'))
      `;

      const jobs = await sql<IdRow[]>`
        update domain_jobs
        set
          status = case
            when ${job.action} in ('create', 'refresh') and exists (
              select 1 from site_domain_aliases as alias
              where alias.id = ${job.domainId}
                and alias.status in ('removing', 'removed')
            ) then 'failed'
            else 'queued'
          end,
          available_at = now() + (${delayMs} * interval '1 millisecond'),
          locked_at = null,
          last_error = case
            when ${job.action} in ('create', 'refresh') and exists (
              select 1 from site_domain_aliases as alias
              where alias.id = ${job.domainId}
                and alias.status in ('removing', 'removed')
            ) then 'Superseded by domain removal.'
            else ${message}
          end
        where id = ${job.id}
          and status = 'processing'
          and attempt_count = ${job.attemptCount}
        returning id
      `;
      requireUpdated(jobs, 'Domain job');
    });
  }

  async failJob(job: DomainJob, message: string): Promise<void> {
    await this.sql.begin(async (sql) => {
      await sql`
        update site_domain_aliases
        set status = 'error', is_canonical = false, last_error = ${message}, last_checked_at = now()
        where id = ${job.domainId}
          and (${job.action} = 'delete' or status not in ('removing', 'removed'))
      `;

      const jobs = await sql<IdRow[]>`
        update domain_jobs
        set status = 'failed', locked_at = null, last_error = ${message}
        where id = ${job.id}
          and status = 'processing'
          and attempt_count = ${job.attemptCount}
        returning id
      `;
      requireUpdated(jobs, 'Domain job');
    });
  }
}
