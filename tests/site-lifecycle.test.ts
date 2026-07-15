import { describe, expect, it } from 'vitest';

import { archiveSite, restoreSite } from '../platform-core/src/site-lifecycle';

const workspaceId = '31d3fa04-e7d5-4ce5-b560-775b93c09b0f';

describe('recoverable site lifecycle', () => {
  it('archives connection, workspace, and project atomically without deleting content', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await archiveSite(async (text, values) => {
      calls.push({ text, values });
      return [{ outcome: 'archived', workspace_id: workspaceId, site_status: 'archived' }];
    }, {
      workspace_id: workspaceId,
      actor: 'user_leon_admin',
      reason: 'Client canceled service',
    });

    expect(result).toEqual({
      data: { outcome: 'archived', workspace_id: workspaceId, site_status: 'archived' },
      error: null,
    });
    expect(calls).toHaveLength(1);
    const [{ text, values }] = calls;
    expect(text).toContain('for update');
    expect(text).toContain("set_config('leon.request_actor', $2, true)");
    expect(text).toContain('update "site_connections"');
    expect(text).toContain('update "client_workspaces"');
    expect(text).toContain('update "website_projects"');
    expect(text).toContain('"status" = \'archived\'');
    expect(text).toContain('"pre_archive_status"');
    expect(text).not.toMatch(/delete\s+from/i);
    expect(values).toEqual([workspaceId, 'user_leon_admin', 'Client canceled service']);
  });

  it('restores an archive to maintenance for review', async () => {
    let sql = '';
    const result = await restoreSite(async (text, values) => {
      sql = text;
      expect(values).toEqual([workspaceId, 'user_leon_admin']);
      return [{ outcome: 'restored', workspace_id: workspaceId, site_status: 'maintenance' }];
    }, { workspace_id: workspaceId, actor: 'user_leon_admin' });

    expect(result.error).toBeNull();
    expect(result.data?.site_status).toBe('maintenance');
    expect(sql).toContain('"status" = \'maintenance\'');
    expect(sql).toContain('"desired_status" = \'maintenance\'');
    expect(sql).toContain('"archived_at" = null');
    expect(sql).toContain('"status" = \'approved\'');
    expect(sql).toContain('"status" = \'review\'');
    expect(sql).not.toMatch(/delete\s+from/i);
  });

  it('validates archive input before querying PostgreSQL', async () => {
    let calls = 0;
    const result = await archiveSite(async () => {
      calls += 1;
      return [];
    }, { workspace_id: workspaceId, actor: 'x', reason: 'a'.repeat(241) });

    expect(calls).toBe(0);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid lifecycle actor.');
  });

  it('validates restore input before querying PostgreSQL', async () => {
    let calls = 0;
    const result = await restoreSite(async () => {
      calls += 1;
      return [];
    }, { workspace_id: 'bad', actor: 'user_leon_admin' });

    expect(calls).toBe(0);
    expect(result.error?.message).toBe('Invalid workspace.');
  });
});
