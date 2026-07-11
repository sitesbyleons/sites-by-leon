-- Client access is keyed to the signed-in Clerk user. Clerk Organizations remain
-- supported, but are no longer required for a photographer to use the dashboard.

drop policy client_workspaces_select_member_or_admin on public.client_workspaces;

create policy client_workspaces_select_member_or_admin
on public.client_workspaces
for select
to authenticated
using (
  clerk_org_id = (select public.current_clerk_org_id())
  or exists (
    select 1 from public.workspace_members member
    where member.workspace_id = client_workspaces.id
      and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy workspace_members_select_member_or_admin on public.workspace_members;

create policy workspace_members_select_member_or_admin
on public.workspace_members
for select
to authenticated
using (
  clerk_user_id = ((select auth.jwt()) ->> 'sub')
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy website_projects_select_member_or_admin on public.website_projects;

create policy website_projects_select_member_or_admin
on public.website_projects
for select
to authenticated
using (
  exists (
    select 1 from public.client_workspaces workspace
    where workspace.id = website_projects.workspace_id
      and (
        workspace.clerk_org_id = (select public.current_clerk_org_id())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = workspace.id
            and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
      )
  )
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy subscriptions_select_member_or_admin on public.subscriptions;

create policy subscriptions_select_member_or_admin
on public.subscriptions
for select
to authenticated
using (
  exists (
    select 1 from public.client_workspaces workspace
    where workspace.id = subscriptions.workspace_id
      and (
        workspace.clerk_org_id = (select public.current_clerk_org_id())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = workspace.id
            and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
      )
  )
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

drop policy content_requests_select_member_or_admin on public.content_requests;
drop policy content_requests_insert_active_org on public.content_requests;

create policy content_requests_select_member_or_admin
on public.content_requests
for select
to authenticated
using (
  exists (
    select 1 from public.client_workspaces workspace
    where workspace.id = content_requests.workspace_id
      and (
        workspace.clerk_org_id = (select public.current_clerk_org_id())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = workspace.id
            and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
      )
  )
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);

create policy content_requests_insert_member
on public.content_requests
for insert
to authenticated
with check (
  created_by_clerk_user_id = ((select auth.jwt()) ->> 'sub')
  and exists (
    select 1 from public.client_workspaces workspace
    where workspace.id = content_requests.workspace_id
      and (
        workspace.clerk_org_id = (select public.current_clerk_org_id())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = workspace.id
            and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
      )
  )
);

drop policy connected_payment_accounts_select_active_org on public.connected_payment_accounts;

create policy connected_payment_accounts_select_member_or_admin
on public.connected_payment_accounts
for select
to authenticated
using (
  exists (
    select 1 from public.client_workspaces workspace
    where workspace.id = connected_payment_accounts.workspace_id
      and (
        workspace.clerk_org_id = (select public.current_clerk_org_id())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = workspace.id
            and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        )
      )
  )
  or exists (
    select 1 from public.app_admins admin
    where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  )
);
