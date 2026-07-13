import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDataClient } from '../platform-core/src';

const databaseUrl = process.env.PROVISIONING_DATABASE_URL;
const integrationSuite = databaseUrl ? describe : describe.skip;

integrationSuite('PostgreSQL client-site provisioning', () => {
  const workspaceSlug = `integration-${randomUUID().slice(0, 8)}`;
  const idempotencyKey = randomUUID();
  let workspaceId: string | null = null;
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(databaseUrl!, { max: 1 });
  });

  afterAll(async () => {
    if (workspaceId) {
      await sql`delete from site_provisioning_runs where workspace_id = ${workspaceId}`;
      await sql`delete from client_workspaces where id = ${workspaceId}`;
    }
    await sql.end();
  });

  it('atomically provisions, safely replays, and activates one complete site', async () => {
    const client = createDataClient(async (text, values) => {
      const rows = await sql.unsafe(text, values as never[]);
      return [...rows] as Record<string, unknown>[];
    });
    const input = {
      idempotency_key: idempotencyKey,
      requested_by_clerk_user_id: 'user_leon_integration',
      owner_clerk_user_id: 'user_owner_integration',
      contact_email: 'owner@example.com',
      workspace_name: 'Integration Studio',
      workspace_slug: workspaceSlug,
      project_name: 'Integration Portfolio',
      plan_key: 'signature' as const,
      template_key: 'editorial' as const,
      primary_domain: `${workspaceSlug}.example.test`,
      admin_domain: `admin.${workspaceSlug}.example.test`,
      site_key: `${workspaceSlug}-site`,
      quota_bytes: 16_777_216,
      capacity_limit_bytes: 67_108_864,
    };

    const first = await client.provisionClientSite(input);
    expect(first.error).toBeNull();
    expect(first.data?.site_status).toBe('maintenance');
    workspaceId = first.data!.workspace_id;

    const replay = await client.provisionClientSite(input);
    expect(replay.error).toBeNull();
    expect(replay.data?.workspace_id).toBe(workspaceId);

    const seeded = await sql<{
      members: number;
      services: number;
      galleries: number;
      images: number;
      posts: number;
    }[]>`
      select
        (select count(*)::int from workspace_members where workspace_id = ${workspaceId}) as members,
        (select count(*)::int from studio_services where workspace_id = ${workspaceId}) as services,
        (select count(*)::int from studio_galleries where workspace_id = ${workspaceId}) as galleries,
        (select count(*)::int from studio_gallery_images where workspace_id = ${workspaceId}) as images,
        (select count(*)::int from studio_posts where workspace_id = ${workspaceId}) as posts
    `;
    expect(seeded[0]).toEqual({ members: 1, services: 2, galleries: 1, images: 3, posts: 1 });

    const activated = await client.setSiteOperationalStatus(workspaceId, 'active');
    expect(activated.error).toBeNull();
    expect(activated.data).toMatchObject({
      site_status: 'active',
      workspace_status: 'active',
      project_status: 'live',
    });

    const [run] = await sql<{ status: string; last_error: string | null }[]>`
      select status, last_error from site_provisioning_runs where workspace_id = ${workspaceId}
    `;
    expect(run).toEqual({ status: 'ready', last_error: null });

    const [project] = await sql<{ progress: number; next_step: string | null }[]>`
      select progress, next_step from website_projects where workspace_id = ${workspaceId}
    `;
    expect(project).toEqual({ progress: 100, next_step: null });
  });
});
