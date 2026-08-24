import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setDesiredSiteStatus } from '../platform-core/src/hosting-access';

const databaseUrl = process.env.PROVISIONING_DATABASE_URL;
const integrationSuite = databaseUrl ? describe : describe.skip;

integrationSuite('Demo availability button integration', () => {
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
      values (${`Demo Availability ${suffix}`}, ${`demo-avail-${suffix}`}, 'active')
      returning id
    `;
    workspaceId = workspace.id;
    const [project] = await sql<{ id: string }[]>`
      insert into website_projects (workspace_id, name, status, template_key)
      values (${workspaceId}, ${`Demo Project ${suffix}`}, 'live', 'editorial')
      returning id
    `;
    await sql`
      insert into site_connections (
        workspace_id, site_key, site_kind, primary_domain, admin_domain,
        deployment_target, status, billing_mode, desired_status, billing_state
      ) values (
        ${workspaceId}, ${`demo-${suffix}`}, 'demo',
        ${`demo-${suffix}.leonsites.org`}, ${`demo-${suffix}.leonsites.org`},
        'ovh:ishotyouu-demo', 'active', 'manual', 'active', 'manual'
      )
    `;
  });

  afterAll(async () => {
    if (workspaceId) await sql`delete from client_workspaces where id = ${workspaceId}`;
    await sql.end();
  });

  it('Keep live button sets site to active status', async () => {
    const result = await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'active',
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'active',
      desired_status: 'active',
    });

    const [site] = await sql<{ status: string; desired_status: string }[]>`
      select status, desired_status
      from site_connections
      where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('active');
    expect(site.desired_status).toBe('active');
  });

  it('Maintenance page button sets site to maintenance status', async () => {
    const result = await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'maintenance',
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'maintenance',
      desired_status: 'maintenance',
    });

    const [site] = await sql<{ status: string; desired_status: string }[]>`
      select status, desired_status
      from site_connections
      where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('maintenance');
    expect(site.desired_status).toBe('maintenance');
  });

  it('Pause site button sets site to paused status', async () => {
    const result = await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'paused',
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'paused',
      desired_status: 'paused',
    });

    const [site] = await sql<{ status: string; desired_status: string }[]>`
      select status, desired_status
      from site_connections
      where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('paused');
    expect(site.desired_status).toBe('paused');
  });

  it('status changes work regardless of deployment_target', async () => {
    // Test that ovh:ishotyouu-demo deployment_target doesn't prevent status changes
    const [connection] = await sql<{ deployment_target: string | null }[]>`
      select deployment_target
      from site_connections
      where workspace_id = ${workspaceId}
    `;
    expect(connection.deployment_target).toBe('ovh:ishotyouu-demo');

    // Cycle through all three statuses
    for (const status of ['active', 'maintenance', 'paused'] as const) {
      const result = await setDesiredSiteStatus(execute, {
        workspace_id: workspaceId,
        desired_status: status,
      });

      expect(result.data?.site_status).toBe(status);

      const [site] = await sql<{ status: string }[]>`
        select status from site_connections where workspace_id = ${workspaceId}
      `;
      expect(site.status).toBe(status);
    }
  });

  it('returns to active from maintenance', async () => {
    await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'maintenance',
    });

    let [site] = await sql<{ status: string }[]>`
      select status from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('maintenance');

    await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'active',
    });

    [site] = await sql<{ status: string }[]>`
      select status from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('active');
  });

  it('returns to active from paused', async () => {
    await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'paused',
    });

    let [site] = await sql<{ status: string }[]>`
      select status from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('paused');

    await setDesiredSiteStatus(execute, {
      workspace_id: workspaceId,
      desired_status: 'active',
    });

    [site] = await sql<{ status: string }[]>`
      select status from site_connections where workspace_id = ${workspaceId}
    `;
    expect(site.status).toBe('active');
  });
});
