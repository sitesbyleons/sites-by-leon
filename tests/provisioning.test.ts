import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDataClient,
  type ProvisionClientSiteInput,
} from '../platform-core/src/index';

const validInput = (overrides: Partial<ProvisionClientSiteInput> = {}): ProvisionClientSiteInput => ({
  idempotency_key: '7ed0f9c4-7262-4b44-a8c3-47f56b515f41',
  requested_by_clerk_user_id: 'user_leon_admin',
  owner_clerk_user_id: 'user_second_studio',
  contact_email: 'owner@second-studio.example',
  clerk_org_id: null,
  workspace_name: 'Second Studio',
  workspace_slug: 'second-studio',
  project_name: 'Second Studio Website',
  plan_key: 'studio',
  template_key: 'sports',
  primary_domain: 'Portfolio.Second-Studio.LeonSites.org.',
  admin_domain: 'Admin.Second-Studio.LeonSites.org.',
  site_key: 'second-studio-site',
  deployment_target: 'ovh:leon-platform-photographer',
  github_repository: 'sitesbyleons/second-studio',
  quota_bytes: 4_294_967_296,
  capacity_limit_bytes: 85_899_345_920,
  ...overrides,
});

describe('client site provisioning', () => {
  it('creates the whole database foundation through one atomic statement', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const client = createDataClient(async (text, values) => {
      calls.push({ text, values });
      return [{
        workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        project_id: 'ba0817fe-72e6-4688-b652-dc24a5826fd6',
        workspace_status: 'approved',
        project_status: 'onboarding',
        site_status: 'maintenance',
        template_key: 'sports',
        primary_domain: 'portfolio.second-studio.leonsites.org',
        admin_domain: 'admin.second-studio.leonsites.org',
        site_key: 'second-studio-site',
      }];
    });

    const result = await client.provisionClientSite(validInput());

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      workspace_status: 'approved',
      project_status: 'onboarding',
      site_status: 'maintenance',
      primary_domain: 'portfolio.second-studio.leonsites.org',
      admin_domain: 'admin.second-studio.leonsites.org',
    });
    expect(calls).toHaveLength(1);
    const [{ text, values }] = calls;
    expect(text).toContain('pg_advisory_xact_lock');
    for (const table of [
      'site_provisioning_runs',
      'client_workspaces',
      'workspace_members',
      'website_projects',
      'studio_settings',
      'workspace_storage_usage',
      'site_connections',
      'studio_services',
      'studio_galleries',
      'studio_gallery_images',
      'studio_posts',
    ]) {
      expect(text).toContain(`"${table}"`);
    }
    expect(values).toContain('portfolio.second-studio.leonsites.org');
    expect(values).toContain('admin.second-studio.leonsites.org');
    expect(values).toContain('owner@second-studio.example');
    expect(text).toContain('sum("quota_bytes")');
    expect(text).toContain('jsonb_to_recordset');
    expect(values.some((value) => JSON.stringify(value).includes('/images/sports/football-huddle.webp'))).toBe(true);
    expect(values).not.toContain('Portfolio.Second-Studio.LeonSites.org.');
  });

  it('returns a safe conflict when an idempotency key cannot produce a matching row', async () => {
    const client = createDataClient(async () => []);

    const result = await client.provisionClientSite(validInput());

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('This provisioning request conflicts with an earlier request.');
  });

  it('reports a platform storage reservation failure without creating partial rows', async () => {
    const client = createDataClient(async () => [{ provisioning_error: 'capacity_exceeded' }]);

    const result = await client.provisionClientSite(validInput({
      capacity_limit_bytes: 4_294_967_296,
    }));

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('The platform does not have enough reserved storage for this site.');
  });

  it('rejects an invalid hostname before querying PostgreSQL', async () => {
    let queryCount = 0;
    const client = createDataClient(async () => {
      queryCount += 1;
      return [];
    });

    const result = await client.provisionClientSite(validInput({ primary_domain: 'https://unsafe.example/path' }));

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid primary domain.');
    expect(queryCount).toBe(0);
  });

  it.each([
    ['editorial', '/images/cinematic/wedding-courthouse.webp'],
    ['commercial', '/images/cinematic/commercial-audio.webp'],
  ] as const)('seeds %s starter images from the matching review template', async (templateKey, expectedImage) => {
    let values: unknown[] = [];
    const client = createDataClient(async (_text, suppliedValues) => {
      values = suppliedValues;
      return [{
        workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        project_id: 'ba0817fe-72e6-4688-b652-dc24a5826fd6',
        workspace_status: 'approved',
        project_status: 'onboarding',
        site_status: 'maintenance',
        template_key: templateKey,
        primary_domain: 'portfolio.second-studio.leonsites.org',
        admin_domain: 'admin.second-studio.leonsites.org',
        site_key: 'second-studio-site',
      }];
    });

    const result = await client.provisionClientSite(validInput({ template_key: templateKey }));

    expect(result.error).toBeNull();
    expect(values.some((value) => JSON.stringify(value).includes(expectedImage))).toBe(true);
  });
});

describe('site operational status', () => {
  it('updates connection, workspace, and project state through one statement', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const client = createDataClient(async (text, values) => {
      calls.push({ text, values });
      return [{
        workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        site_status: 'paused',
        workspace_status: 'paused',
        project_status: 'paused',
      }];
    });

    const result = await client.setSiteOperationalStatus(
      '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      'paused',
    );

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      site_status: 'paused',
      workspace_status: 'paused',
      project_status: 'paused',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('update "site_connections"');
    expect(calls[0].text).toContain('update "client_workspaces"');
    expect(calls[0].text).toContain('update "website_projects"');
    expect(calls[0].values).toEqual([
      '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      'paused',
    ]);
  });

  it('rejects unsupported statuses before querying PostgreSQL', async () => {
    let queryCount = 0;
    const client = createDataClient(async () => {
      queryCount += 1;
      return [];
    });

    const result = await client.setSiteOperationalStatus(
      '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      'deleted' as never,
    );

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid site status.');
    expect(queryCount).toBe(0);
  });

  it('marks provisioning ready and clears its error when a site becomes active', async () => {
    let sql = '';
    const client = createDataClient(async (text) => {
      sql = text;
      return [{
        workspace_id: '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
        site_status: 'active',
        workspace_status: 'active',
        project_status: 'live',
      }];
    });

    const result = await client.setSiteOperationalStatus(
      '31d3fa04-e7d5-4ce5-b560-775b93c09b0f',
      'active',
    );

    expect(result.error).toBeNull();
    expect(sql).toContain('update "site_provisioning_runs"');
    expect(sql).toContain('set "status" = \'ready\'');
    expect(sql).toContain('"last_error" = null');
    expect(sql).toContain("and $2 = 'active'");
    expect(sql).toContain('"progress" = case when $2 = \'active\' then 100');
    expect(sql).toContain('"next_step" = case when $2 = \'active\' then null');
  });
});

describe('provisioning schema', () => {
  it('is migration-safe and enforces one case-insensitive site identity per workspace', () => {
    const schema = fs.readFileSync(
      new URL('../infra/ovh/postgres/schema.sql', import.meta.url),
      'utf8',
    );

    expect(schema).toContain('create table if not exists site_provisioning_runs');
    expect(schema).toContain('add column if not exists template_key');
    expect(schema).toContain('add column if not exists admin_domain');
    expect(schema).toContain('website_projects_workspace_unique_idx');
    expect(schema).toContain('site_connections_primary_domain_lower_unique_idx');
    expect(schema).toContain('site_connections_admin_domain_lower_unique_idx');
    expect(schema).toContain('site_provisioning_runs_idempotency_key_key');
    expect(schema).toContain('site_provisioning_runs_workspace_id_fkey');
    expect(schema).toContain('deferrable initially deferred');
    expect(schema).toContain('create role leon_runtime nologin');
    expect(schema).toContain('grant select, insert, update, delete on all tables in schema public to leon_runtime');
  });
});
