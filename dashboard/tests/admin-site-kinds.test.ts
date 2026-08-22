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
});
