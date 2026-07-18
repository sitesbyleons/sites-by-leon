import type { DataClient } from '@leon/platform-core';

export type ResolvedWorkspace = {
  id: string;
  name: string;
  status: string;
};

export type WorkspaceResolution = {
  workspace: ResolvedWorkspace | null;
  role: string | null;
  reason: null | 'not-found' | 'ambiguous' | 'forbidden' | 'database';
};

export async function resolveClientWorkspace(
  database: DataClient | null,
  input: { userId: string; orgId: string | null },
): Promise<WorkspaceResolution> {
  if (!database) return { workspace: null, role: null, reason: 'database' };

  if (input.orgId) {
    const byOrganization = await database
      .from('client_workspaces')
      .select('id,name,status')
      .eq('clerk_org_id', input.orgId)
      .maybeSingle<ResolvedWorkspace>();

    if (byOrganization.error) return { workspace: null, role: null, reason: 'database' };
    if (!byOrganization.data) return { workspace: null, role: null, reason: 'not-found' };

    const membership = await database
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', byOrganization.data.id)
      .eq('clerk_user_id', input.userId)
      .maybeSingle<{ role: string }>();

    if (membership.error) return { workspace: null, role: null, reason: 'database' };
    if (!membership.data) return { workspace: null, role: null, reason: 'forbidden' };
    return { workspace: byOrganization.data, role: membership.data.role, reason: null };
  }

  const memberships = await database
    .from('workspace_members')
    .select('workspace_id,role')
    .eq('clerk_user_id', input.userId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (memberships.error) return { workspace: null, role: null, reason: 'database' };
  if (!memberships.data.length) return { workspace: null, role: null, reason: 'not-found' };
  if (memberships.data.length > 1) return { workspace: null, role: null, reason: 'ambiguous' };
  const membership = memberships.data[0] as { workspace_id: string; role: string };

  const workspace = await database
    .from('client_workspaces')
    .select('id,name,status')
    .eq('id', membership.workspace_id)
    .maybeSingle<ResolvedWorkspace>();

  if (workspace.error) return { workspace: null, role: null, reason: 'database' };
  if (!workspace.data) return { workspace: null, role: null, reason: 'not-found' };
  return { workspace: workspace.data, role: membership.role, reason: null };
}
