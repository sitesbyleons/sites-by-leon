import { describe, expect, it } from 'vitest';

import {
  createDataClient,
  createPostgresDataClient,
  userCanManageWorkspace,
  type QueryExecutor,
} from '../platform-core/src/index';

const recordingExecutor = (rows: Record<string, unknown>[] = []) => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const execute: QueryExecutor = async (text, values) => {
    calls.push({ text, values });
    return rows;
  };
  return { calls, execute };
};

describe('Leon PostgreSQL data client', () => {
  it('builds parameterized selects without putting values into SQL', async () => {
    const recorder = recordingExecutor([{ id: 'ws-1', name: 'Northline' }]);
    const client = createDataClient(recorder.execute);

    const result = await client
      .from('client_workspaces')
      .select('id,name')
      .eq('slug', "northline' OR true --")
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; name: string }>();

    expect(result).toEqual({ data: { id: 'ws-1', name: 'Northline' }, error: null });
    expect(recorder.calls).toEqual([
      {
        text: 'select "id", "name" from "client_workspaces" where "slug" = $1 order by "updated_at" desc limit $2',
        values: ["northline' OR true --", 1],
      },
    ]);
  });

  it('rejects tables and columns outside the application schema', async () => {
    const client = createDataClient(recordingExecutor().execute);

    expect(() => client.from('users; drop table users')).toThrow(/table/i);
    expect(() => client.from('client_workspaces').select('id, password')).toThrow(/column/i);
    expect(() => client.from('client_workspaces').eq('id OR 1=1', 'x')).toThrow(/column/i);
  });

  it('parameterizes updates and filters', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    const result = await client
      .from('site_connections')
      .update({ status: 'paused', current_version: null })
      .eq('workspace_id', 'ws-1');

    expect(result).toEqual({ data: [], error: null });
    expect(recorder.calls[0]).toEqual({
      text: 'update "site_connections" set "status" = $1, "current_version" = $2 where "workspace_id" = $3 returning *',
      values: ['paused', null, 'ws-1'],
    });
  });

  it('supports parameterized recent-record filters for rate limits', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('studio_inquiries').select('id').eq('ip_hash', 'hash').gte('created_at', '2026-07-12T00:00:00.000Z').limit(5);

    expect(recorder.calls[0]).toEqual({
      text: 'select "id" from "studio_inquiries" where "ip_hash" = $1 and "created_at" >= $2 limit $3',
      values: ['hash', '2026-07-12T00:00:00.000Z', 5],
    });
  });

  it('upserts settings on the workspace primary key', async () => {
    const recorder = recordingExecutor([]);
    const client = createDataClient(recorder.execute);

    await client.from('studio_settings').upsert({ workspace_id: 'ws-1', site_title: 'Northline' });

    expect(recorder.calls[0]).toEqual({
      text: 'insert into "studio_settings" ("workspace_id", "site_title") values ($1, $2) on conflict ("workspace_id") do update set "site_title" = excluded."site_title" returning *',
      values: ['ws-1', 'Northline'],
    });
  });

  it('returns an error when maybeSingle receives multiple rows', async () => {
    const client = createDataClient(recordingExecutor([{ id: 1 }, { id: 2 }]).execute);

    const result = await client.from('studio_posts').select('id').maybeSingle();

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/multiple rows/i);
  });

  it('does not create a database client without a connection string', () => {
    expect(createPostgresDataClient('')).toBeNull();
  });

  it('adapts a postgres connection into the restricted data client', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const client = createPostgresDataClient('postgresql://platform.test/leon', () => ({
      unsafe: async (text: string, values: unknown[]) => {
        calls.push({ text, values });
        return [{ id: 'ws-1' }];
      },
    }));

    const result = await client?.from('client_workspaces').select('id').eq('slug', 'northline').maybeSingle();

    expect(result?.data).toEqual({ id: 'ws-1' });
    expect(calls).toEqual([{ text: 'select "id" from "client_workspaces" where "slug" = $1', values: ['northline'] }]);
  });

  it('authorizes workspace members without relying on browser-controlled claims', async () => {
    const client = createDataClient(async (text, values) => {
      if (text.includes('"workspace_members"') && values[0] === 'ws-1' && values[1] === 'user-1') {
        return [{ role: 'owner' }];
      }
      return [];
    });

    await expect(userCanManageWorkspace(client, 'user-1', 'ws-1')).resolves.toBe(true);
  });

  it('authorizes Leon admins and rejects unrelated users', async () => {
    const client = createDataClient(async (text, values) => {
      if (text.includes('"app_admins"') && values[0] === 'admin-1') return [{ clerk_user_id: 'admin-1' }];
      return [];
    });

    await expect(userCanManageWorkspace(client, 'admin-1', 'ws-1')).resolves.toBe(true);
    await expect(userCanManageWorkspace(client, 'stranger', 'ws-1')).resolves.toBe(false);
  });
});
