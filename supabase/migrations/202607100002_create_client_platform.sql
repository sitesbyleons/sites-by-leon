create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create or replace function public.current_clerk_org_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() ->> 'org_id'),
    (select auth.jwt() -> 'o' ->> 'id')
  )
$$;

revoke all on function public.current_clerk_org_id() from public, anon;
grant execute on function public.current_clerk_org_id() to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

create table public.client_workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text not null unique check (char_length(clerk_org_id) between 3 and 128),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'lead' check (status in ('lead', 'approved', 'active', 'paused', 'closed')),
  stripe_customer_id text unique check (stripe_customer_id is null or char_length(stripe_customer_id) between 8 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_workspaces is
  'Client businesses keyed to Clerk Organizations. Browser access is organization-scoped by RLS.';

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  clerk_user_id text not null check (char_length(clerk_user_id) between 3 and 128),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, clerk_user_id)
);

comment on table public.workspace_members is
  'Server-synchronized Clerk membership references; Clerk remains the identity authority.';

create table public.website_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'onboarding' check (status in ('onboarding', 'design', 'review', 'live', 'paused')),
  plan_key text check (plan_key is null or plan_key in ('essential', 'studio', 'signature')),
  progress smallint not null default 0 check (progress between 0 and 100),
  next_step text check (next_step is null or char_length(next_step) <= 500),
  live_url text check (live_url is null or char_length(live_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.website_projects is
  'Photography website projects and client-safe delivery status.';

create index website_projects_workspace_updated_idx
  on public.website_projects (workspace_id, updated_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.client_workspaces(id) on delete cascade,
  stripe_customer_id text not null check (char_length(stripe_customer_id) between 8 and 255),
  stripe_subscription_id text not null unique check (char_length(stripe_subscription_id) between 8 and 255),
  stripe_price_id text not null check (char_length(stripe_price_id) between 8 and 255),
  plan_key text not null check (plan_key in ('essential', 'studio', 'signature')),
  status text not null check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Normalized Stripe Billing state updated only after verified server-side events.';

create index subscriptions_status_idx on public.subscriptions (status);

create table public.content_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  created_by_clerk_user_id text not null check (char_length(created_by_clerk_user_id) between 3 and 128),
  subject text not null check (char_length(subject) between 5 and 120),
  details text not null check (char_length(details) between 20 and 2000),
  status text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_requests is
  'Client-authored website update requests, isolated by active Clerk Organization.';

create index content_requests_workspace_created_idx
  on public.content_requests (workspace_id, created_at desc);

create table app_private.stripe_events (
  event_id text primary key check (char_length(event_id) between 8 and 255),
  event_type text not null check (char_length(event_type) between 3 and 255),
  processed_at timestamptz not null default now()
);

comment on table app_private.stripe_events is
  'Private idempotency ledger for verified Stripe webhook event IDs.';

revoke all on table app_private.stripe_events from public, anon, authenticated;
grant select, insert on table app_private.stripe_events to service_role;

create trigger client_workspaces_set_updated_at
before update on public.client_workspaces
for each row execute function public.set_updated_at();

create trigger website_projects_set_updated_at
before update on public.website_projects
for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create trigger content_requests_set_updated_at
before update on public.content_requests
for each row execute function public.set_updated_at();

alter table public.client_workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.website_projects enable row level security;
alter table public.subscriptions enable row level security;
alter table public.content_requests enable row level security;

revoke all on table public.client_workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;
revoke all on table public.website_projects from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.content_requests from anon, authenticated;

grant select on table public.client_workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select on table public.website_projects to authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert on table public.content_requests to authenticated;

create policy client_workspaces_select_active_org
on public.client_workspaces
for select
to authenticated
using (clerk_org_id = (select public.current_clerk_org_id()));

create policy workspace_members_select_self_in_active_org
on public.workspace_members
for select
to authenticated
using (
  clerk_user_id = (select auth.jwt() ->> 'sub')
  and exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = workspace_members.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
);

create policy website_projects_select_active_org
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
);

create policy subscriptions_select_active_org
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
);

create policy content_requests_select_active_org
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
);

create policy content_requests_insert_active_org
on public.content_requests
for insert
to authenticated
with check (
  created_by_clerk_user_id = (select auth.jwt() ->> 'sub')
  and exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = content_requests.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
);
