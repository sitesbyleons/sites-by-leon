import { describe, expect, it } from 'vitest';

import { renderImportSql } from '../infra/ovh/scripts/import-managed-json.mjs';

describe('managed database JSON import', () => {
  it('imports parent tables before their dependent records in one transaction', () => {
    const sql = renderImportSql({
      studio_galleries: [{ id: 'gallery-1', workspace_id: 'workspace-1', title: "Friday's game" }],
      client_workspaces: [{ id: 'workspace-1', name: 'Northline' }],
      app_admins: [],
    });

    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql.indexOf('insert into client_workspaces')).toBeLessThan(sql.indexOf('insert into studio_galleries'));
    expect(sql).toContain("Friday's game");
    expect(sql).toContain('jsonb_populate_recordset');
  });

  it('rejects unexpected table names and unsafe dollar-quote markers', () => {
    expect(() => renderImportSql({ users: [] })).toThrow(/table/i);
    expect(() => renderImportSql({ client_workspaces: [{ name: '$leon_json$' }] })).toThrow(/marker/i);
  });
});
