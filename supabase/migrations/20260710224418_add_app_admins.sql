create table public.app_admins (
  clerk_user_id text primary key check (char_length(clerk_user_id) between 3 and 128),
  display_name text not null check (char_length(display_name) between 2 and 100),
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Sites By Leon staff identities. Authorization uses the immutable Clerk user ID, never editable user metadata.';

alter table public.app_admins enable row level security;

revoke all on table public.app_admins from anon, authenticated;
grant select on table public.app_admins to authenticated;

create policy app_admins_select_self
on public.app_admins
for select
to authenticated
using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));

drop policy client_workspaces_select_active_org on public.client_workspaces;

create policy client_workspaces_select_member_or_admin
on public.client_workspaces
for select
to authenticated
using (
  clerk_org_id = (select public.current_clerk_org_id())
  or exists (
    select 1
    from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy workspace_members_select_self_in_active_org on public.workspace_members;

create policy workspace_members_select_member_or_admin
on public.workspace_members
for select
to authenticated
using (
  (
    clerk_user_id = ((select auth.jwt()) ->> 'sub')
    and exists (
      select 1
      from public.client_workspaces workspace
      where workspace.id = workspace_members.workspace_id
        and workspace.clerk_org_id = (select public.current_clerk_org_id())
    )
  )
  or exists (
    select 1
    from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy website_projects_select_active_org on public.website_projects;

create policy website_projects_select_member_or_admin
on public.website_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = website_projects.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
  or exists (
    select 1
    from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy subscriptions_select_active_org on public.subscriptions;

create policy subscriptions_select_member_or_admin
on public.subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = subscriptions.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
  or exists (
    select 1
    from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy content_requests_select_active_org on public.content_requests;

create policy content_requests_select_member_or_admin
on public.content_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = content_requests.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
  or exists (
    select 1
    from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

insert into public.app_admins (clerk_user_id, display_name)
values ('user_3GKcpSaN6ZKib8BXaFiokO87g12', 'Leon')
on conflict (clerk_user_id) do update
set display_name = excluded.display_name;
