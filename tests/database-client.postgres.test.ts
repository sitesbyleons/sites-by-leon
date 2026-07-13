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
      applicationSql = postgres(connectionString, { ...options, max: 8 });
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
      create table studio_inquiries (
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null references client_workspaces(id) on delete cascade,
        name text not null,
        email text,
        phone text,
        desired_date date not null,
        message text not null,
        ip_hash text not null,
        status text not null default 'new',
        created_at timestamptz not null default now()
      );
      create table inquiry_rate_limits (
        workspace_id uuid not null references client_workspaces(id) on delete cascade,
        ip_hash text not null,
        window_started_at timestamptz not null default now(),
        request_count smallint not null default 1,
        request_times timestamptz[] not null default array[now()],
        updated_at timestamptz not null default now(),
        primary key (workspace_id, ip_hash)
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

  it('creates a rate-limited inquiry through postgres.js on PostgreSQL 17', async () => {
    const workspaceId = randomUUID();
    await applicationSql!.unsafe('insert into client_workspaces (id) values ($1)', [workspaceId]);

    const created = await client!.createRateLimitedInquiry({
      workspace_id: workspaceId,
      ip_hash: 'a'.repeat(64),
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      phone: null,
      desired_date: '2026-12-30',
      message: 'Please photograph our home game.',
    });

    expect(created.error).toBeNull();
    expect(created.data).toHaveLength(1);
    expect(created.data[0]).toMatchObject({ workspace_id: workspaceId, name: 'Jordan Lee' });
  });

  it('admits at most five concurrent inquiries for one workspace and IP', async () => {
    const workspaceId = randomUUID();
    const ipHash = 'b'.repeat(64);
    await applicationSql!.unsafe('insert into client_workspaces (id) values ($1)', [workspaceId]);
    await controlSql!.unsafe(
      "select pg_advisory_lock(hashtextextended($1::uuid::text || ':' || $2, 0))",
      [workspaceId, ipHash],
    );

    const pending = Array.from({ length: 6 }, (_, index) => client!.createRateLimitedInquiry({
      workspace_id: workspaceId,
      ip_hash: ipHash,
      name: `Client ${index}`,
      email: `client-${index}@example.com`,
      phone: null,
      desired_date: '2026-12-30',
      message: 'Please photograph our home game.',
    }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    await controlSql!.unsafe(
      "select pg_advisory_unlock(hashtextextended($1::uuid::text || ':' || $2, 0))",
      [workspaceId, ipHash],
    );
    const results = await Promise.all(pending);

    expect(results.every((result) => result.error === null)).toBe(true);
    expect(results.filter((result) => result.data.length === 1)).toHaveLength(5);
    expect(results.filter((result) => result.data.length === 0)).toHaveLength(1);
  });

  it('keeps the five-in-ten-minute limit across a window boundary', async () => {
    const workspaceId = randomUUID();
    const ipHash = 'c'.repeat(64);
    await applicationSql!.unsafe('insert into client_workspaces (id) values ($1)', [workspaceId]);
    await applicationSql!.unsafe(`
      insert into inquiry_rate_limits (
        workspace_id, ip_hash, window_started_at, request_count, request_times
      ) values (
        $1, $2, now() - interval '10 minutes 1 second', 5,
        array[
          now() - interval '10 minutes 1 second',
          now() - interval '1 second', now() - interval '1 second',
          now() - interval '1 second', now() - interval '1 second'
        ]
      )
    `, [workspaceId, ipHash]);
    const input = {
      workspace_id: workspaceId,
      ip_hash: ipHash,
      name: 'Boundary Client',
      email: 'boundary@example.com',
      phone: null,
      desired_date: '2026-12-30',
      message: 'Please photograph our home game.',
    };

    const fifthRecent = await client!.createRateLimitedInquiry(input);
    const sixthRecent = await client!.createRateLimitedInquiry({
      ...input,
      name: 'Blocked Boundary Client',
      email: 'blocked-boundary@example.com',
    });

    expect(fifthRecent.data).toHaveLength(1);
    expect(sixthRecent.data).toHaveLength(0);
  });
});
