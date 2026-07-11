import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolvedWorkspace = {
  id: string;
  name: string;
  status: string;
};

export async function resolveClientWorkspace(
  supabase: SupabaseClient | null,
  input: { userId: string; orgId: string | null },
): Promise<{ workspace: ResolvedWorkspace | null; error: boolean }> {
  if (!supabase) return { workspace: null, error: true };

  if (input.orgId) {
    const byOrganization = await supabase
      .from('client_workspaces')
      .select('id,name,status')
      .eq('clerk_org_id', input.orgId)
      .maybeSingle<ResolvedWorkspace>();

    if (byOrganization.error) return { workspace: null, error: true };
    if (byOrganization.data) return { workspace: byOrganization.data, error: false };
  }

  const membership = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('clerk_user_id', input.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ workspace_id: string }>();

  if (membership.error) return { workspace: null, error: true };
  if (!membership.data) return { workspace: null, error: false };

  const workspace = await supabase
    .from('client_workspaces')
    .select('id,name,status')
    .eq('id', membership.data.workspace_id)
    .maybeSingle<ResolvedWorkspace>();

  return { workspace: workspace.data, error: Boolean(workspace.error) };
}

