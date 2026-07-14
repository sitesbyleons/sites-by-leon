import { describe, expect, it } from 'vitest';

import {
  normalizeCustomDomainHostname,
  queueDomainRefresh,
  queueDomainRemoval,
  requestCustomDomain,
} from '../platform-core/src/site-domains';

const workspaceId = '31d3fa04-e7d5-4ce5-b560-775b93c09b0f';
const domainId = '1bf6b2ad-e3f9-4a68-a98e-2646c8cd03dc';
const idempotencyKey = 'f04d9cca-b0a1-4d32-8c26-378c2e57af19';

describe('custom site domains', () => {
  it('normalizes a hostname without accepting URLs, IPs, or Leon Sites hosts', () => {
    expect(normalizeCustomDomainHostname(' WWW.Example.COM. ')).toBe('www.example.com');
    expect(() => normalizeCustomDomainHostname('https://www.example.com/path')).toThrow('Invalid custom domain.');
    expect(() => normalizeCustomDomainHostname('127.0.0.1')).toThrow('Invalid custom domain.');
    expect(() => normalizeCustomDomainHostname('studio.leonsites.org')).toThrow('Leon Sites addresses cannot be custom domains.');
  });

  it('requests an alias and its create job through one locked statement', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await requestCustomDomain(async (text, values) => {
      calls.push({ text, values });
      return [{
        outcome: 'queued',
        domain_id: domainId,
        hostname: 'www.example.com',
        domain_status: 'requested',
        dns_target: 'customers.leonsites.org',
        job_id: '5a9700d6-d39f-43ac-870b-26e76f58bdc3',
        job_status: 'queued',
      }];
    }, {
      workspace_id: workspaceId,
      hostname: 'WWW.Example.COM.',
      actor: 'user_leon_admin',
      idempotency_key: idempotencyKey,
      dns_target: 'customers.leonsites.org',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      outcome: 'queued',
      domain_id: domainId,
      hostname: 'www.example.com',
      domain_status: 'requested',
      dns_target: 'customers.leonsites.org',
      job_id: '5a9700d6-d39f-43ac-870b-26e76f58bdc3',
      job_status: 'queued',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('pg_advisory_xact_lock');
    expect(calls[0].text).toContain('for update');
    expect(calls[0].text).toContain('insert into "site_domain_aliases"');
    expect(calls[0].text).toContain('insert into "domain_jobs"');
    expect(calls[0].text).toContain("'create'");
    expect(calls[0].text).toContain("locked_site.\"status\" <> 'archived'");
    expect(calls[0].text).toContain('alias.\"status\" <> \'removed\'');
    expect(calls[0].text).toContain('lower("hostname") <> $2');
    expect(calls[0].values).toEqual([
      workspaceId,
      'www.example.com',
      'customers.leonsites.org',
      idempotencyKey,
      'user_leon_admin',
    ]);
  });

  it('rejects malformed requests before querying PostgreSQL', async () => {
    let calls = 0;
    const result = await requestCustomDomain(async () => {
      calls += 1;
      return [];
    }, {
      workspace_id: workspaceId,
      hostname: 'not a domain',
      actor: 'user_leon_admin',
      idempotency_key: idempotencyKey,
      dns_target: 'customers.leonsites.org',
    });

    expect(calls).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid custom domain.');
  });

  it('queues a refresh only for the requested workspace and domain', async () => {
    let sql = '';
    const result = await queueDomainRefresh(async (text, values) => {
      sql = text;
      expect(values).toEqual([workspaceId, domainId, idempotencyKey]);
      return [{
        outcome: 'queued',
        domain_id: domainId,
        hostname: 'www.example.com',
        domain_status: 'dns_pending',
        dns_target: 'customers.leonsites.org',
        job_id: '5a9700d6-d39f-43ac-870b-26e76f58bdc3',
        job_status: 'queued',
      }];
    }, { workspace_id: workspaceId, domain_id: domainId, idempotency_key: idempotencyKey });

    expect(result.error).toBeNull();
    expect(result.data?.outcome).toBe('queued');
    expect(sql).toContain('for update');
    expect(sql).toContain("'refresh'");
    expect(sql).toContain('alias."workspace_id" = $1::uuid');
    expect(sql).toContain('alias."id" = $2::uuid');
  });

  it('makes removal non-routable before queueing Cloudflare deletion', async () => {
    let sql = '';
    const result = await queueDomainRemoval(async (text, values) => {
      sql = text;
      expect(values).toEqual([workspaceId, domainId, idempotencyKey]);
      return [{
        outcome: 'queued',
        domain_id: domainId,
        hostname: 'www.example.com',
        domain_status: 'removing',
        dns_target: 'customers.leonsites.org',
        job_id: '5a9700d6-d39f-43ac-870b-26e76f58bdc3',
        job_status: 'queued',
      }];
    }, { workspace_id: workspaceId, domain_id: domainId, idempotency_key: idempotencyKey });

    expect(result.error).toBeNull();
    expect(sql).toContain('update "site_domain_aliases"');
    expect(sql).toContain('"status" = \'removing\'');
    expect(sql).toContain('"is_canonical" = false');
    expect(sql).toContain('Superseded by domain removal.');
    expect(sql).toContain("job.\"status\" = 'queued'");
    expect(sql).toContain("locked_domain.\"status\" not in ('removing', 'removed')");
    expect(sql).toContain("then 'already_removing'");
    expect(sql).toContain("'delete'");
  });

  it.each([
    ['refresh', queueDomainRefresh],
    ['remove', queueDomainRemoval],
  ] as const)('validates %s identifiers before querying PostgreSQL', async (_name, operation) => {
    let calls = 0;
    const result = await operation(async () => {
      calls += 1;
      return [];
    }, { workspace_id: 'bad', domain_id: domainId, idempotency_key: idempotencyKey });

    expect(calls).toBe(0);
    expect(result.error?.message).toBe('Invalid workspace.');
  });
});
