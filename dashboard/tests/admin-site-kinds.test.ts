import { describe, expect, it } from 'vitest';

import { getPreviewAdminData, isPortfolioDemo } from '../src/lib/admin';

describe('admin site kinds', () => {
  it('keeps demos separate from client builds', () => {
    const data = getPreviewAdminData();
    const kindByWorkspace = new Map(data.connections.map((connection) => [connection.workspace_id, connection.site_kind]));
    const demoProjects = data.projects.filter((project) => kindByWorkspace.get(project.workspace_id) === 'demo');
    const clientProjects = data.projects.filter((project) => kindByWorkspace.get(project.workspace_id) !== 'demo');

    expect(demoProjects.map((project) => project.workspace_id)).toEqual(['ws_northline', 'ws_vow', 'ws_ishotyouu']);
    expect(clientProjects.map((project) => project.workspace_id)).toEqual(['ws_fieldwork']);
  });

  it('shows lead demos on Sites page but not active/approved demos', () => {
    const data = getPreviewAdminData();
    const connections = new Map(data.connections.map((connection) => [connection.workspace_id, connection]));
    
    const sitesPageProjects = data.projects.filter((project) => {
      const connection = connections.get(project.workspace_id);
      const workspace = data.workspaces.find((w) => w.id === project.workspace_id);
      if (connection?.site_kind === 'demo' && workspace?.status !== 'lead') return false;
      if (connection?.status === 'archived') return false;
      return true;
    });

    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_ishotyouu');
    expect(sitesPageProjects.map((p) => p.workspace_id)).not.toContain('ws_northline');
    expect(sitesPageProjects.map((p) => p.workspace_id)).not.toContain('ws_vow');
    expect(sitesPageProjects.map((p) => p.workspace_id)).toContain('ws_fieldwork');
  });

  it('never labels ISHOTYOUU as a portfolio demo', () => {
    const data = getPreviewAdminData();
    const ishotyouu = data.workspaces.find((workspace) => workspace.id === 'ws_ishotyouu');
    const ishotyouuConnection = data.connections.find((connection) => connection.workspace_id === 'ws_ishotyouu');

    expect(isPortfolioDemo(ishotyouuConnection, ishotyouu)).toBe(false);
    expect(isPortfolioDemo({ site_kind: 'demo', site_key: 'ishotyouu-demo' }, { status: 'active', slug: 'ishotyouu' })).toBe(false);
    expect(isPortfolioDemo({ site_kind: 'demo', site_key: 'northline-demo' }, { status: 'active', slug: 'northline' })).toBe(true);
  });

  it('keeps lead client sites off the Demos page', () => {
    const data = getPreviewAdminData();
    const demos = data.connections.filter((connection) => {
      const workspace = data.workspaces.find((item) => item.id === connection.workspace_id);
      return isPortfolioDemo(connection, workspace);
    });

    expect(demos.map((d) => d.workspace_id)).toEqual(['ws_northline', 'ws_vow']);
    expect(demos.map((d) => d.workspace_id)).not.toContain('ws_ishotyouu');
  });
});
