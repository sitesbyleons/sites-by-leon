import { randomUUID } from 'node:crypto';

import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.PROVISIONING_DATABASE_URL;
const integrationSuite = databaseUrl ? describe : describe.skip;

integrationSuite('PostgreSQL photographer runtime grants', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const roleName = `leon_photo_test_${suffix}`;
  const rolePassword = `photo_${randomUUID().replaceAll('-', '')}`;
  const workspaceId = randomUUID();
  let control: Sql;
  let photographer: Sql;
  let roleCreated = false;

  beforeAll(async () => {
    const parsedUrl = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
    if (!databaseName.toLowerCase().endsWith('_test')) {
      throw new Error('PROVISIONING_DATABASE_URL must target a dedicated database whose name ends with _test.');
    }

    control = postgres(databaseUrl!, { max: 1 });
    const [roleStatement] = await control<{ statement: string }[]>`
      select format('create role %I login password %L', ${roleName}, ${rolePassword}) as statement
    `;
    await control.unsafe(roleStatement.statement);
    roleCreated = true;
    await control.unsafe(`grant leon_photographer_runtime to "${roleName}"`);
    await control`
      insert into client_workspaces (id, name, slug, status)
      values (${workspaceId}, 'Runtime Role Test', ${`runtime-role-${suffix}`}, 'active')
    `;
    await control`
      insert into workspace_members (workspace_id, clerk_user_id, role)
      values (${workspaceId}, 'user_runtime_role_test', 'owner')
    `;

    parsedUrl.username = roleName;
    parsedUrl.password = rolePassword;
    photographer = postgres(parsedUrl.toString(), { max: 1 });
  });

  afterAll(async () => {
    await photographer?.end({ timeout: 5 });
    if (control) {
      await control`delete from client_workspaces where id = ${workspaceId}`;
      if (roleCreated) {
        await control.unsafe(`revoke leon_photographer_runtime from "${roleName}"`);
        await control.unsafe(`drop role "${roleName}"`);
      }
      await control.end({ timeout: 5 });
    }
  });

  it('can read workspace routing and membership records', async () => {
    await expect(photographer`select id from client_workspaces where id = ${workspaceId}`)
      .resolves.toHaveLength(1);
    await expect(photographer`select role from workspace_members where workspace_id = ${workspaceId}`)
      .resolves.toEqual([expect.objectContaining({ role: 'owner' })]);
    await expect(photographer`select workspace_id from site_connections limit 1`).resolves.toBeDefined();
    await expect(photographer`select workspace_id from site_domain_aliases limit 1`).resolves.toBeDefined();
  });

  it('can create, update, and delete managed studio records', async () => {
    const postId = randomUUID();
    const slug = `runtime-post-${suffix}`;

    await expect(photographer`
      insert into studio_posts (id, workspace_id, title, slug, excerpt, body)
      values (${postId}, ${workspaceId}, 'Runtime post', ${slug}, 'Initial excerpt', 'Initial body')
    `).resolves.toBeDefined();
    await expect(photographer`
      update studio_posts set title = 'Updated runtime post' where id = ${postId}
    `).resolves.toBeDefined();
    await expect(photographer`delete from studio_posts where id = ${postId}`).resolves.toBeDefined();
  });

  it.each([
    'app_admins',
    'subscriptions',
    'checkout_attempts',
    'website_projects',
    'site_provisioning_runs',
    'domain_jobs',
  ])('cannot read the protected %s table', async (table) => {
    await expect(photographer.unsafe(`select * from "${table}" limit 1`))
      .rejects.toThrow(/permission denied/i);
  });

  it('cannot mutate platform administrators', async () => {
    await expect(photographer`delete from app_admins`).rejects.toThrow(/permission denied/i);
  });
});
