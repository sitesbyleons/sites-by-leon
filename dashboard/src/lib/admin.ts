import type { SupabaseClient } from '@supabase/supabase-js';

import { createClerkSupabaseClient } from './supabase';

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

export type ClerkUserClient = {
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

export function getPreviewAdminData(): AdminData {
  return {
    workspaces: [
      { id: 'ws_northline', name: 'Northline Portraits', slug: 'northline', status: 'active', updated_at: '2026-07-10T17:00:00.000Z' },
      { id: 'ws_vow', name: 'Vow & Light', slug: 'vow-and-light', status: 'approved', updated_at: '2026-07-09T15:00:00.000Z' },
      { id: 'ws_fieldwork', name: 'Fieldwork Commercial', slug: 'fieldwork', status: 'lead', updated_at: '2026-07-08T13:00:00.000Z' },
    ],
    projects: [
      { id: 'prj_1', workspace_id: 'ws_northline', name: 'Northline Portfolio', status: 'review', progress: 72, live_url: null, updated_at: '2026-07-10T17:00:00.000Z' },
      { id: 'prj_2', workspace_id: 'ws_vow', name: 'Wedding Editorial', status: 'design', progress: 45, live_url: null, updated_at: '2026-07-09T15:00:00.000Z' },
    ],
    subscriptions: [
      { workspace_id: 'ws_northline', plan_key: 'studio', status: 'active', current_period_end: '2026-08-10T00:00:00.000Z' },
    ],
    requests: [
      { id: 'req_1', workspace_id: 'ws_northline', subject: 'Replace the featured gallery', status: 'new', created_at: '2026-07-10T16:00:00.000Z' },
      { id: 'req_2', workspace_id: 'ws_vow', subject: 'Add fall mini sessions', status: 'planned', created_at: '2026-07-09T14:00:00.000Z' },
      { id: 'req_3', workspace_id: 'ws_northline', subject: 'Update the booking link', status: 'completed', created_at: '2026-07-06T11:00:00.000Z' },
    ],
    members: [
      { workspace_id: 'ws_northline', clerk_user_id: 'user_northline', role: 'owner' },
      { workspace_id: 'ws_vow', clerk_user_id: 'user_vow', role: 'owner' },
    ],
    error: null,
  };
}

export function getPreviewAdminUsers(): AdminUser[] {
  return [
    { id: 'user_northline', name: 'Maya Carter', email: 'maya@northline.test', createdAt: Date.parse('2026-07-08') },
    { id: 'user_vow', name: 'Elliot Lane', email: 'elliot@vowandlight.test', createdAt: Date.parse('2026-07-09') },
    { id: 'user_waiting', name: 'New client', email: 'hello@newstudio.test', createdAt: Date.parse('2026-07-10') },
  ];
}

type LoadAdminSessionInput = {
  isPreview: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  includeUsers?: boolean;
  userClient?: ClerkUserClient;
};

export async function loadAdminSession(input: LoadAdminSessionInput) {
  if (input.isPreview) {
    return {
      isAdmin: true,
      data: getPreviewAdminData(),
      users: input.includeUsers ? getPreviewAdminUsers() : [],
      error: null,
    };
  }

  if (!input.userId) {
    return {
      isAdmin: false,
      data: null,
      users: [] as AdminUser[],
      error: null,
    };
  }

  const supabase = createClerkSupabaseClient(input.getToken);
  const adminCheck = await checkAppAdmin(supabase, input.userId);
  if (!adminCheck.isAdmin) {
    return {
      isAdmin: false,
      data: null,
      users: [] as AdminUser[],
      error: adminCheck.error,
    };
  }

  const data = await loadAdminData(supabase);
  let users: AdminUser[] = [];
  let error = adminCheck.error ?? data.error;

  if (input.includeUsers && input.userClient) {
    try {
      users = await loadAdminUsers(input.userClient);
    } catch {
      error = error ?? 'User accounts could not be loaded.';
    }
  }

  return { isAdmin: true, data, users, error };
}

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
      .limit(100),
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

