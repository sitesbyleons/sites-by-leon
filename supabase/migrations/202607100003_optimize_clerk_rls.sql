create or replace function public.current_clerk_org_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    ((select auth.jwt()) ->> 'org_id'),
    ((select auth.jwt()) -> 'o' ->> 'id')
  )
$$;

drop policy workspace_members_select_self_in_active_org on public.workspace_members;

create policy workspace_members_select_self_in_active_org
on public.workspace_members
for select
to authenticated
using (
  clerk_user_id = ((select auth.jwt()) ->> 'sub')
  and exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = workspace_members.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
);

drop policy content_requests_insert_active_org on public.content_requests;

create policy content_requests_insert_active_org
on public.content_requests
for insert
to authenticated
with check (
  created_by_clerk_user_id = ((select auth.jwt()) ->> 'sub')
  and exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = content_requests.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
);
