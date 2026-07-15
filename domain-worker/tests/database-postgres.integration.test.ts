import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresDomainJobStore } from '../src/database.js';

const databaseUrl = process.env.PROVISIONING_DATABASE_URL;
const integrationSuite = databaseUrl ? describe : describe.skip;

function requireRow<T>(rows: readonly T[], description: string): T {
  const row = rows[0];
  if (!row) throw new Error(`${description} was not created.`);
  return row;
}

integrationSuite('PostgreSQL domain job crash recovery', () => {
  let sql: ReturnType<typeof postgres>;
  let workspaceId = '';
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    sql = postgres(databaseUrl!, { max: 1 });
    const workspace = requireRow(await sql<{ id: string }[]>`
      insert into client_workspaces (name, slug, status)
      values (${`Domain Worker ${suffix}`}, ${`domain-worker-${suffix}`}, 'active')
      returning id
    `, 'Workspace');
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await sql`delete from client_workspaces where id = ${workspaceId}`;
    await sql.end();
  });

  it('claims removal after a crashed create job passes its lock timeout', async () => {
    const alias = requireRow(await sql<{ id: string }[]>`
      insert into site_domain_aliases (workspace_id, hostname, status)
      values (${workspaceId}, ${`photos-${suffix}.example.test`}, 'configuring')
      returning id
    `, 'Domain alias');
    const createJob = requireRow(await sql<{ id: string }[]>`
      insert into domain_jobs (
        domain_id, action, status, idempotency_key, attempt_count, locked_at
      ) values (
        ${alias.id}, 'create', 'processing', ${randomUUID()}, 1, now() - interval '10 minutes'
      )
      returning id
    `, 'Create job');
    const deleteJob = requireRow(await sql<{ id: string }[]>`
      insert into domain_jobs (domain_id, action, status, idempotency_key)
      values (${alias.id}, 'delete', 'queued', ${randomUUID()})
      returning id
    `, 'Delete job');
    await sql`
      update site_domain_aliases
      set status = 'removing', is_canonical = false
      where id = ${alias.id}
    `;

    const store = new PostgresDomainJobStore(sql);
    const claimed = await store.claimNextJob(60_000);

    expect(claimed).toMatchObject({ id: deleteJob.id, domainId: alias.id, action: 'delete' });
    const crashed = requireRow(await sql<{ status: string; last_error: string | null }[]>`
      select status, last_error from domain_jobs where id = ${createJob.id}
    `, 'Crashed job');
    expect(crashed).toEqual({ status: 'failed', last_error: 'Superseded by domain removal.' });

    await store.completeDeleteJob(claimed!);
    const removed = requireRow(await sql<{ status: string }[]>`
      select status from site_domain_aliases where id = ${alias.id}
    `, 'Removed alias');
    expect(removed.status).toBe('removed');
  });

  it('waits for a live create and preserves its provider ID for deletion', async () => {
    const alias = requireRow(await sql<{ id: string }[]>`
      insert into site_domain_aliases (workspace_id, hostname, status)
      values (${workspaceId}, ${`live-${suffix}.example.test`}, 'configuring')
      returning id
    `, 'Domain alias');
    await sql`
      insert into domain_jobs (domain_id, action, status, idempotency_key)
      values (${alias.id}, 'create', 'queued', ${randomUUID()})
    `;

    const store = new PostgresDomainJobStore(sql);
    const createJob = await store.claimNextJob(60_000);
    expect(createJob).toMatchObject({ domainId: alias.id, action: 'create' });
    if (!createJob) throw new Error('Create job was not claimed.');

    const deleteJob = requireRow(await sql<{ id: string }[]>`
      insert into domain_jobs (domain_id, action, status, idempotency_key)
      values (${alias.id}, 'delete', 'queued', ${randomUUID()})
      returning id
    `, 'Delete job');
    await sql`
      update site_domain_aliases
      set status = 'removing', is_canonical = false
      where id = ${alias.id}
    `;

    expect(await store.claimNextJob(60_000)).toBeNull();
    await store.completeProviderJob(createJob, `cf_${suffix}`, {
      aliasStatus: 'active',
      cloudflareHostnameStatus: 'active',
      cloudflareSslStatus: 'active',
      lastError: null,
    });
    const removing = requireRow(await sql<{
      status: string;
      is_canonical: boolean;
      cloudflare_custom_hostname_id: string | null;
    }[]>`
      select status, is_canonical, cloudflare_custom_hostname_id
      from site_domain_aliases where id = ${alias.id}
    `, 'Removing alias');
    expect(removing).toEqual({
      status: 'removing',
      is_canonical: false,
      cloudflare_custom_hostname_id: `cf_${suffix}`,
    });

    const claimedDelete = await store.claimNextJob(60_000);
    expect(claimedDelete).toMatchObject({ id: deleteJob.id, action: 'delete' });
    if (!claimedDelete) throw new Error('Delete job was not claimed.');
    await store.completeDeleteJob(claimedDelete);
  });

  it('demotes an active canonical alias from an observed pending state when refresh fails', async () => {
    const alias = requireRow(await sql<{ id: string }[]>`
      insert into site_domain_aliases (
        workspace_id,
        hostname,
        status,
        is_canonical,
        cloudflare_custom_hostname_id,
        cloudflare_hostname_status,
        cloudflare_ssl_status,
        last_checked_at
      ) values (
        ${workspaceId},
        ${`degraded-${suffix}.example.test`},
        'active',
        true,
        ${`cf_degraded_${suffix}`},
        'active',
        'active',
        now() - interval '1 hour'
      )
      returning id
    `, 'Degraded alias');
    const store = new PostgresDomainJobStore(sql);
    const leased = await store.claimNextReconciliation(60_000, 60_000);
    expect(leased).toMatchObject({ id: alias.id, status: 'active', isCanonical: true });
    if (!leased) throw new Error('Reconciliation was not claimed.');

    await expect(store.recordAliasReconciliationFailure(
      leased,
      'Cloudflare request failed with status 429.',
      {
        cloudflareCustomHostnameId: `cf_degraded_${suffix}`,
        state: {
          aliasStatus: 'dns_pending',
          cloudflareHostnameStatus: 'pending',
          cloudflareSslStatus: 'pending_validation',
          lastError: null,
        },
      },
    )).resolves.toBe(true);

    const degraded = requireRow(await sql<{
      status: string;
      is_canonical: boolean;
      cloudflare_custom_hostname_id: string | null;
      cloudflare_hostname_status: string | null;
      cloudflare_ssl_status: string | null;
      last_error: string | null;
    }[]>`
      select
        status,
        is_canonical,
        cloudflare_custom_hostname_id,
        cloudflare_hostname_status,
        cloudflare_ssl_status,
        last_error
      from site_domain_aliases
      where id = ${alias.id}
    `, 'Degraded alias state');
    expect(degraded).toEqual({
      status: 'dns_pending',
      is_canonical: false,
      cloudflare_custom_hostname_id: `cf_degraded_${suffix}`,
      cloudflare_hostname_status: 'pending',
      cloudflare_ssl_status: 'pending_validation',
      last_error: 'Cloudflare request failed with status 429.',
    });
  });

  it('does not demote an alias when the reconciliation lease is superseded', async () => {
    const alias = requireRow(await sql<{ id: string }[]>`
      insert into site_domain_aliases (
        workspace_id,
        hostname,
        status,
        is_canonical,
        cloudflare_custom_hostname_id,
        cloudflare_hostname_status,
        cloudflare_ssl_status,
        last_checked_at
      ) values (
        ${workspaceId},
        ${`superseded-${suffix}.example.test`},
        'active',
        true,
        ${`cf_superseded_${suffix}`},
        'active',
        'active',
        now() - interval '1 hour'
      )
      returning id
    `, 'Superseded alias');
    const store = new PostgresDomainJobStore(sql);
    const leased = await store.claimNextReconciliation(60_000, 60_000);
    expect(leased).toMatchObject({ id: alias.id, status: 'active', isCanonical: true });
    if (!leased) throw new Error('Reconciliation was not claimed.');
    await sql`
      update site_domain_aliases
      set last_checked_at = ${new Date(leased.leaseStartedAt.getTime() + 1_000)}
      where id = ${alias.id}
    `;

    await expect(store.recordAliasReconciliationFailure(
      leased,
      'Cloudflare request failed with status 503.',
      {
        cloudflareCustomHostnameId: `cf_superseded_${suffix}`,
        state: {
          aliasStatus: 'dns_pending',
          cloudflareHostnameStatus: 'pending',
          cloudflareSslStatus: 'pending_validation',
          lastError: null,
        },
      },
    )).resolves.toBe(false);

    const preserved = requireRow(await sql<{
      status: string;
      is_canonical: boolean;
      cloudflare_hostname_status: string | null;
      cloudflare_ssl_status: string | null;
      last_error: string | null;
    }[]>`
      select status, is_canonical, cloudflare_hostname_status, cloudflare_ssl_status, last_error
      from site_domain_aliases
      where id = ${alias.id}
    `, 'Superseded alias state');
    expect(preserved).toEqual({
      status: 'active',
      is_canonical: true,
      cloudflare_hostname_status: 'active',
      cloudflare_ssl_status: 'active',
      last_error: null,
    });
  });
});
