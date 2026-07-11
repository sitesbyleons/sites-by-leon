import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updated_at: string;
};

export type AdminProject = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  progress: number;
  live_url: string | null;
  updated_at: string;
};

export type AdminSubscription = {
  workspace_id: string;
  plan_key: string;
  status: string;
  current_period_end: string | null;
};

export type AdminRequest = {
  id: string;
  workspace_id: string;
  subject: string;
  status: string;
  created_at: string;
};

export type AdminMember = {
  workspace_id: string;
  clerk_user_id: string;
  role: string;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
};

export type AdminData = {
  workspaces: AdminWorkspace[];
  projects: AdminProject[];
  subscriptions: AdminSubscription[];
  requests: AdminRequest[];
  members: AdminMember[];
  error: string | null;
};

type ClerkUserClient = {
  users: {
    getUserList(input: { limit: number; orderBy: '-created_at' }): Promise<{
      data: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        username: string | null;
        primaryEmailAddressId: string | null;
        emailAddresses: Array<{ id: string; emailAddress: string }>;
        createdAt: number;
      }>;
    }>;
  };
};

export async function loadAdminUsers(client: ClerkUserClient): Promise<AdminUser[]> {
  const result = await client.users.getUserList({ limit: 100, orderBy: '-created_at' });
  return result.data.map((user) => {
    const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return {
      id: user.id,
      name: fullName || user.username || 'New user',
      email: primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? 'No email',
      createdAt: user.createdAt,
    };
  });
}

export async function checkAppAdmin(supabase: SupabaseClient | null, clerkUserId: string) {
  if (!supabase) return { isAdmin: false, error: 'The secure database connection is not configured.' };

  const { data, error } = await supabase
    .from('app_admins')
    .select('clerk_user_id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ clerk_user_id: string }>();

  return {
    isAdmin: Boolean(data?.clerk_user_id),
    error: error ? 'Admin access could not be verified.' : null,
  };
}

export async function loadAdminData(supabase: SupabaseClient | null): Promise<AdminData> {
  const empty = { workspaces: [], projects: [], subscriptions: [], requests: [], members: [] };
  if (!supabase) return { ...empty, error: 'The secure database connection is not configured.' };

  const [workspaces, projects, subscriptions, requests, members] = await Promise.all([
    supabase.from('client_workspaces').select('id,name,slug,status,updated_at').order('updated_at', { ascending: false }),
    supabase
      .from('website_projects')
      .select('id,workspace_id,name,status,progress,live_url,updated_at')
      .order('updated_at', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('workspace_id,plan_key,status,current_period_end')
      .order('updated_at', { ascending: false }),
    supabase
      .from('content_requests')
      .select('id,workspace_id,subject,status,created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('workspace_members').select('workspace_id,clerk_user_id,role'),
  ]);

  const hasError = workspaces.error || projects.error || subscriptions.error || requests.error || members.error;

  return {
    workspaces: (workspaces.data ?? []) as AdminWorkspace[],
    projects: (projects.data ?? []) as AdminProject[],
    subscriptions: (subscriptions.data ?? []) as AdminSubscription[],
    requests: (requests.data ?? []) as AdminRequest[],
    members: (members.data ?? []) as AdminMember[],
    error: hasError ? 'Some studio data is temporarily unavailable.' : null,
  };
}

