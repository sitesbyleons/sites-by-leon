alter table app_private.stripe_events
  alter column processed_at drop not null,
  alter column processed_at drop default,
  add column status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  add column created_at timestamptz not null default now(),
  add column attempt_count integer not null default 1 check (attempt_count > 0),
  add column last_error text check (last_error is null or char_length(last_error) <= 1000);

create table public.connected_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.client_workspaces(id) on delete cascade,
  stripe_account_id text not null unique check (char_length(stripe_account_id) between 8 and 255),
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'restricted', 'enabled', 'disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connected_payment_accounts is
  'Server-managed Stripe Connect status for the later photographer-payments launch gate; no card data is stored.';

create trigger connected_payment_accounts_set_updated_at
before update on public.connected_payment_accounts
for each row execute function public.set_updated_at();

alter table public.connected_payment_accounts enable row level security;

revoke all on table public.connected_payment_accounts from anon, authenticated;
grant select on table public.connected_payment_accounts to authenticated;

create policy connected_payment_accounts_select_active_org
on public.connected_payment_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.client_workspaces workspace
    where workspace.id = connected_payment_accounts.workspace_id
      and workspace.clerk_org_id = (select public.current_clerk_org_id())
  )
);
