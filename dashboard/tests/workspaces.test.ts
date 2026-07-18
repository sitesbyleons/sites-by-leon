import { createDataClient, type QueryExecutor } from '@leon/platform-core';
import { describe, expect, it } from 'vitest';

import { resolveClientWorkspace } from '../src/lib/workspaces';

const createQueuedClient = (...responses: Array<Record<string, unknown>[]>) => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const execute: QueryExecutor = async (text, values) => {
    queries.push({ text, values });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected database query.');
    return response;
  };
  return { client: createDataClient(execute), queries };
};

describe('resolveClientWorkspace', () => {
  it('requires database membership for an organization-selected workspace', async () => {
    const { client, queries } = createQueuedClient(
      [{ id: 'ws-1', name: 'Northline', status: 'active' }],
      [{ role: 'admin' }],
    );

    await expect(resolveClientWorkspace(client, { userId: 'user-1', orgId: 'org-1' })).resolves.toEqual({
      workspace: { id: 'ws-1', name: 'Northline', status: 'active' },
      role: 'admin',
      reason: null,
    });
    expect(queries[1]?.text).toContain('"workspace_members"');
    expect(queries[1]?.values).toEqual(['ws-1', 'user-1']);
  });

  it('rejects an organization claim without a matching membership', async () => {
    const { client } = createQueuedClient(
      [{ id: 'ws-1', name: 'Northline', status: 'active' }],
      [],
    );

    await expect(resolveClientWorkspace(client, { userId: 'user-1', orgId: 'org-1' })).resolves.toEqual({
      workspace: null,
      role: null,
      reason: 'forbidden',
    });
  });

  it('resolves the only personal-account membership and its role', async () => {
    const { client, queries } = createQueuedClient(
      [{ workspace_id: 'ws-1', role: 'owner' }],
      [{ id: 'ws-1', name: 'Northline', status: 'approved' }],
    );

    await expect(resolveClientWorkspace(client, { userId: 'user-1', orgId: null })).resolves.toEqual({
      workspace: { id: 'ws-1', name: 'Northline', status: 'approved' },
      role: 'owner',
      reason: null,
    });
    expect(queries[0]?.text).toContain('limit $2');
    expect(queries[0]?.values).toEqual(['user-1', 2]);
  });

  it('fails closed when a personal account belongs to multiple workspaces', async () => {
    const { client, queries } = createQueuedClient([
      { workspace_id: 'ws-1', role: 'owner' },
      { workspace_id: 'ws-2', role: 'member' },
    ]);

    await expect(resolveClientWorkspace(client, { userId: 'user-1', orgId: null })).resolves.toEqual({
      workspace: null,
      role: null,
      reason: 'ambiguous',
    });
    expect(queries).toHaveLength(1);
  });

  it('distinguishes missing workspaces from database failures', async () => {
    const missing = createQueuedClient([]).client;
    await expect(resolveClientWorkspace(missing, { userId: 'user-1', orgId: null })).resolves.toEqual({
      workspace: null,
      role: null,
      reason: 'not-found',
    });

    const broken = createDataClient(async () => {
      throw new Error('connection failed');
    });
    await expect(resolveClientWorkspace(broken, { userId: 'user-1', orgId: null })).resolves.toEqual({
      workspace: null,
      role: null,
      reason: 'database',
    });
    await expect(resolveClientWorkspace(null, { userId: 'user-1', orgId: null })).resolves.toEqual({
      workspace: null,
      role: null,
      reason: 'database',
    });
  });
});
