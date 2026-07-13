import { randomUUID } from 'node:crypto';

import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDataClient, type DataClient } from '../platform-core/src/index';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const postgresDescribe = testDatabaseUrl ? describe : describe.skip;

postgresDescribe('PostgreSQL upload quota integration', () => {
  const schemaName = `upload_claim_${randomUUID().replaceAll('-', '')}`;
  const schemaIdentifier = `"${schemaName}"`;
  let controlSql: Sql | undefined;
  let applicationSql: Sql | undefined;
  let client: DataClient | null = null;
  let schemaCreated = false;

  beforeAll(async () => {
    const parsedUrl = new URL(testDatabaseUrl!);
    const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
    if (!databaseName.toLowerCase().endsWith('_test')) {
      throw new Error('TEST_DATABASE_URL must target a dedicated database whose name ends with _test.');
    }

    controlSql = postgres(testDatabaseUrl!, { max: 1 });
    await controlSql.unsafe(`create schema ${schemaIdentifier}`);
    schemaCreated = true;

    parsedUrl.searchParams.set('search_path', schemaName);
    const scopedDatabaseUrl = parsedUrl.toString();
    client = createPostgresDataClient(scopedDatabaseUrl, (connectionString, options) => {
      applicationSql = postgres(connectionString, options);
      return {
        unsafe: async (text, values) => [...await applicationSql!.unsafe(text, values as never[])],
      };
    });

    await applicationSql!.unsafe(`
      create table client_workspaces (
        id uuid primary key
      );
      create table workspace_storage_usage (
        workspace_id uuid primary key references client_workspaces(id) on delete cascade,
        used_bytes bigint not null default 0,
        quota_bytes bigint not null default 4294967296,
        check (used_bytes >= 0),
        check (quota_bytes >= 16777216),
        check (used_bytes <= quota_bytes)
      );
      create table workspace_uploads (
        storage_path text primary key,
        workspace_id uuid not null references client_workspaces(id) on delete cascade,
        size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
        created_at timestamptz not null default now()
      );
    `);
  });

  afterAll(async () => {
    await applicationSql?.end({ timeout: 5 });
    if (controlSql && schemaCreated) {
      await controlSql.unsafe(`drop schema if exists ${schemaIdentifier} cascade`);
    }
    await controlSql?.end({ timeout: 5 });
  });

  it('claims and releases upload bytes through postgres.js on PostgreSQL 17', async () => {
    const versionRows = await applicationSql!.unsafe(
      "select current_setting('server_version_num')::integer as version_num",
    );
    expect(Math.trunc(Number(versionRows[0]?.version_num) / 10_000)).toBe(17);

    const workspaceId = randomUUID();
    const storagePath = `${workspaceId}/galleries/${randomUUID()}.png`;
    await applicationSql!.unsafe('insert into client_workspaces (id) values ($1)', [workspaceId]);

    const claimed = await client!.claimWorkspaceUpload(
      workspaceId,
      storagePath,
      1_024,
      4_294_967_296,
    );

    expect(claimed.error).toBeNull();
    expect(claimed.data).toHaveLength(1);
    expect(claimed.data[0]).toMatchObject({ workspace_id: workspaceId, storage_path: storagePath });
    const usageAfterClaim = await applicationSql!.unsafe(
      'select used_bytes::text, quota_bytes::text from workspace_storage_usage where workspace_id = $1',
      [workspaceId],
    );
    expect(usageAfterClaim[0]).toMatchObject({ used_bytes: '1024', quota_bytes: '4294967296' });

    const released = await client!.releaseWorkspaceUpload(workspaceId, storagePath);

    expect(released.error).toBeNull();
    expect(released.data).toHaveLength(1);
    const usageAfterRelease = await applicationSql!.unsafe(
      'select used_bytes::text from workspace_storage_usage where workspace_id = $1',
      [workspaceId],
    );
    const uploadsAfterRelease = await applicationSql!.unsafe(
      'select count(*)::integer as count from workspace_uploads where workspace_id = $1',
      [workspaceId],
    );
    expect(usageAfterRelease[0]?.used_bytes).toBe('0');
    expect(uploadsAfterRelease[0]?.count).toBe(0);
  });
});
