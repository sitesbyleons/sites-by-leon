import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveClientWorkspace } from './workspaces';

export type WorkspaceRow = {
  id: string;
  name: string;
  status: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  status: string;
  progress: number;
  next_step: string | null;
  live_url: string | null;
  updated_at: string;
};

export type SubscriptionRow = {
  plan_key: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type DashboardData = {
  workspace: WorkspaceRow | null;
  project: ProjectRow | null;
  subscription: SubscriptionRow | null;
  error: string | null;
};

export async function loadDashboardData(
  supabase: SupabaseClient | null,
  identity: { userId: string; orgId: string | null },
): Promise<DashboardData> {
  if (!supabase) {
    return {
      workspace: null,
      project: null,
      subscription: null,
      error: 'Dashboard data will appear after the secure database connection is configured.',
    };
  }

  const { workspace, error: workspaceError } = await resolveClientWorkspace(supabase, identity);

  if (workspaceError) {
    return {
      workspace: null,
      project: null,
      subscription: null,
      error: 'Your workspace could not be loaded. Leon has been notified to check the connection.',
    };
  }

  if (!workspace) {
    return { workspace: null, project: null, subscription: null, error: null };
  }

  const [projectResult, subscriptionResult] = await Promise.all([
    supabase
      .from('website_projects')
      .select('id,name,status,progress,next_step,live_url,updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<ProjectRow>(),
    supabase
      .from('subscriptions')
      .select('plan_key,status,current_period_end,cancel_at_period_end')
      .eq('workspace_id', workspace.id)
      .maybeSingle<SubscriptionRow>(),
  ]);

  return {
    workspace,
    project: projectResult.data,
    subscription: subscriptionResult.data,
    error:
      projectResult.error || subscriptionResult.error
        ? 'Some dashboard details are temporarily unavailable. Your website is not affected.'
        : null,
  };
}

