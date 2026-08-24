import { describe, expect, it } from 'vitest';

import { getPreviewAdminData } from '../src/lib/admin';

describe('admin site kinds', () => {
  it('keeps demos separate from client builds', () => {
    const data = getPreviewAdminData();
    const kindByWorkspace = new Map(data.connections.map((connection) => [connection.workspace_id, connection.site_kind]));
    const demoProjects = data.projects.filter((project) => kindByWorkspace.get(project.workspace_id) === 'demo');
    const clientProjects = data.projects.filter((project) => kindByWorkspace.get(project.workspace_id) !== 'demo');

    expect(demoProjects.map((project) => project.workspace_id)).toEqual(['ws_northline', 'ws_vow', 'ws_ishotyouu']);
    expect(clientProjects.map((project) => project.workspace_id)).toEqual(['ws_fieldwork']);
  });

  it('shows all demos on Sites page (same as Demos page)', () => {
    const data = getPreviewAdminData();
    const connections = new Map(data.connections.map((connection) => [connection.workspace_id, connection]));
    
    const sitesPageProjects = data.projects.filter((project) => {
      const connection = connections.get(project.workspace_id);
      if (connection?.status === 'archived') return false;
      return true;
    });

    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_ishotyouu');
    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_northline');
    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_vow');
    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_fieldwork');
  });

  it('shows all demos on Demos page', () => {
    const data = getPreviewAdminData();
    const demos = data.connections.filter((connection) => connection.site_kind === 'demo');

    expect(demos.map((d) => d.workspace_id)).toEqual(['ws_northline', 'ws_vow', 'ws_ishotyouu']);
  });
});
