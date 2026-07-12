import type { DataClient } from '@leon/platform-core';

export type ResolvedWorkspace = {
  id: string;
  name: string;
  status: string;
};

export async function resolveClientWorkspace(
  database: DataClient | null,
  input: { userId: string; orgId: string | null },
): Promise<{ workspace: ResolvedWorkspace | null; error: boolean }> {
  if (!database) return { workspace: null, error: true };

  if (input.orgId) {
    const byOrganization = await database
      .from('client_workspaces')
      .select('id,name,status')
      .eq('clerk_org_id', input.orgId)
      .maybeSingle<ResolvedWorkspace>();

    if (byOrganization.error) return { workspace: null, error: true };
    if (byOrganization.data) return { workspace: byOrganization.data, error: false };
  }

  const membership = await database
    .from('workspace_members')
    .select('workspace_id')
    .eq('clerk_user_id', input.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ workspace_id: string }>();

  if (membership.error) return { workspace: null, error: true };
  if (!membership.data) return { workspace: null, error: false };

  const workspace = await database
    .from('client_workspaces')
    .select('id,name,status')
    .eq('id', membership.data.workspace_id)
    .maybeSingle<ResolvedWorkspace>();

  return { workspace: workspace.data, error: Boolean(workspace.error) };
}
