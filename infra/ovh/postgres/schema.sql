create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists client_workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text not null unique check (char_length(clerk_org_id) between 3 and 128),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'lead' check (status in ('lead', 'approved', 'active', 'paused', 'closed')),
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_admins (
  clerk_user_id text primary key check (char_length(clerk_user_id) between 3 and 128),
  display_name text not null check (char_length(display_name) between 2 and 100),
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  clerk_user_id text not null check (char_length(clerk_user_id) between 3 and 128),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, clerk_user_id)
);

create table if not exists website_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'onboarding' check (status in ('onboarding', 'design', 'review', 'live', 'paused')),
  plan_key text check (plan_key is null or plan_key in ('essential', 'studio', 'signature')),
  progress smallint not null default 0 check (progress between 0 and 100),
  next_step text,
  live_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references client_workspaces(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  plan_key text not null check (plan_key in ('essential', 'studio', 'signature')),
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists checkout_attempts (
  workspace_id uuid primary key references client_workspaces(id) on delete cascade,
  attempt_key uuid not null unique,
  plan_key text not null check (plan_key in ('essential', 'studio', 'signature')),
  stripe_session_id text unique,
  checkout_url text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_storage_usage (
  workspace_id uuid primary key references client_workspaces(id) on delete cascade,
  used_bytes bigint not null default 0,
  quota_bytes bigint not null default 4294967296,
  updated_at timestamptz not null default now(),
  check (used_bytes >= 0),
  check (quota_bytes >= 16777216),
  check (used_bytes <= quota_bytes)
);

create table if not exists workspace_uploads (
  storage_path text primary key,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now()
);

create table if not exists content_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  created_by_clerk_user_id text not null,
  subject text not null check (char_length(subject) between 5 and 120),
  details text not null check (char_length(details) between 20 and 2000),
  status text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) between 3 and 254),
  focus text not null check (char_length(focus) between 2 and 80),
  message text not null check (char_length(message) between 20 and 2000),
  ip_hash text not null check (char_length(ip_hash) = 64)
);

create table if not exists connected_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references client_workspaces(id) on delete cascade,
  stripe_account_id text not null unique,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'restricted', 'enabled', 'disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists connected_payment_account_history (
  stripe_account_id text primary key,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  retired_at timestamptz not null default now()
);

create table if not exists studio_settings (
  workspace_id uuid primary key references client_workspaces(id) on delete cascade,
  site_title text not null check (char_length(site_title) between 2 and 100),
  hero_title text not null check (char_length(hero_title) between 2 and 120),
  hero_subtitle text not null check (char_length(hero_subtitle) between 2 and 240),
  contact_email text,
  contact_phone text,
  paper_color text not null default '#f4f6f8' check (paper_color ~ '^#[0-9A-Fa-f]{6}$'),
  ink_color text not null default '#090d12' check (ink_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#ff3b30' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_preset text not null default 'editorial' check (font_preset in ('editorial', 'athletic', 'modern')),
  updated_at timestamptz not null default now()
);

create table if not exists studio_galleries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null,
  description text not null default '',
  cover_image_url text not null,
  cover_storage_path text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists studio_gallery_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  gallery_id uuid not null references studio_galleries(id) on delete cascade,
  image_url text not null,
  alt_text text not null check (char_length(alt_text) between 2 and 300),
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists studio_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 140),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '',
  body text not null default '',
  cover_image_url text,
  cover_storage_path text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists studio_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '',
  price_type text not null default 'custom' check (price_type in ('fixed', 'from', 'custom')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists studio_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  service_id uuid references studio_services(id) on delete set null,
  stripe_customer_id text,
  name text not null check (char_length(name) between 2 and 120),
  email text,
  phone text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table if not exists studio_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  client_id uuid not null references studio_clients(id) on delete restrict,
  stripe_invoice_id text unique,
  status text not null default 'draft' check (status in ('draft', 'sending', 'open', 'deposit_paid', 'paid', 'void', 'uncollectible', 'review')),
  description text not null,
  amount_due_cents integer not null check (amount_due_cents > 0),
  amount_paid_cents integer not null default 0,
  deposit_cents integer check (deposit_cents is null or deposit_cents >= 0),
  due_date date,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deposit_cents is null or deposit_cents <= amount_due_cents)
);

alter table studio_invoices
  add column if not exists amount_paid_cents integer not null default 0;
alter table studio_invoices
  drop constraint if exists studio_invoices_status_check;
alter table studio_invoices
  add constraint studio_invoices_status_check
  check (status in ('draft', 'sending', 'open', 'deposit_paid', 'paid', 'void', 'uncollectible', 'review'));
alter table studio_invoices
  drop constraint if exists studio_invoices_amount_paid_cents_check;
alter table studio_invoices
  add constraint studio_invoices_amount_paid_cents_check
  check (amount_paid_cents >= 0);

update studio_invoices
set status = 'deposit_paid', amount_paid_cents = deposit_cents
where status = 'paid'
  and amount_paid_cents = 0
  and deposit_cents > 0
  and deposit_cents < amount_due_cents;
update studio_invoices
set amount_paid_cents = amount_due_cents
where status = 'paid' and amount_paid_cents = 0;

create table if not exists studio_inquiries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  email text,
  phone text,
  desired_date date not null,
  message text not null check (char_length(message) between 10 and 3000),
  ip_hash text not null check (char_length(ip_hash) = 64),
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table if not exists site_connections (
  workspace_id uuid primary key references client_workspaces(id) on delete cascade,
  site_key text not null unique,
  primary_domain text not null,
  deployment_target text,
  github_repository text,
  status text not null default 'active' check (status in ('active', 'paused', 'maintenance', 'error')),
  current_version text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'site_connections'
      and column_name = 'vercel_project_id'
  ) then
    execute 'update site_connections set deployment_target = coalesce(deployment_target, ''ovh:leon-platform'') where vercel_project_id is not null';
    alter table site_connections drop column vercel_project_id;
  end if;
end $$;

create table if not exists stripe_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists workspace_members_user_idx on workspace_members (clerk_user_id, created_at);
create index if not exists workspace_uploads_workspace_idx on workspace_uploads (workspace_id, created_at);
create index if not exists connected_payment_account_history_workspace_idx on connected_payment_account_history (workspace_id, retired_at desc);
create index if not exists website_projects_workspace_updated_idx on website_projects (workspace_id, updated_at desc);
create index if not exists content_requests_workspace_created_idx on content_requests (workspace_id, created_at desc);
create index if not exists studio_galleries_workspace_sort_idx on studio_galleries (workspace_id, sort_order, created_at);
create unique index if not exists studio_galleries_workspace_cover_path_unique_idx on studio_galleries (workspace_id, cover_storage_path) where cover_storage_path is not null;
create index if not exists studio_gallery_images_gallery_sort_idx on studio_gallery_images (gallery_id, sort_order, created_at);
create index if not exists studio_gallery_images_workspace_idx on studio_gallery_images (workspace_id);
create unique index if not exists studio_gallery_images_workspace_storage_path_unique_idx on studio_gallery_images (workspace_id, storage_path) where storage_path is not null;
create index if not exists studio_posts_workspace_sort_idx on studio_posts (workspace_id, sort_order, created_at);
create unique index if not exists studio_posts_workspace_cover_path_unique_idx on studio_posts (workspace_id, cover_storage_path) where cover_storage_path is not null;
create index if not exists studio_services_workspace_sort_idx on studio_services (workspace_id, sort_order, created_at);
create index if not exists studio_clients_workspace_idx on studio_clients (workspace_id);
create index if not exists studio_clients_service_idx on studio_clients (service_id);
create index if not exists studio_invoices_workspace_idx on studio_invoices (workspace_id);
create index if not exists studio_invoices_client_idx on studio_invoices (client_id);
create index if not exists studio_inquiries_workspace_created_idx on studio_inquiries (workspace_id, created_at desc);

drop trigger if exists client_workspaces_updated on client_workspaces;
create trigger client_workspaces_updated before update on client_workspaces for each row execute function set_updated_at();
drop trigger if exists website_projects_updated on website_projects;
create trigger website_projects_updated before update on website_projects for each row execute function set_updated_at();
drop trigger if exists subscriptions_updated on subscriptions;
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();
drop trigger if exists checkout_attempts_updated on checkout_attempts;
create trigger checkout_attempts_updated before update on checkout_attempts for each row execute function set_updated_at();
drop trigger if exists workspace_storage_usage_updated on workspace_storage_usage;
create trigger workspace_storage_usage_updated before update on workspace_storage_usage for each row execute function set_updated_at();
drop trigger if exists content_requests_updated on content_requests;
create trigger content_requests_updated before update on content_requests for each row execute function set_updated_at();
drop trigger if exists connected_payment_accounts_updated on connected_payment_accounts;
create trigger connected_payment_accounts_updated before update on connected_payment_accounts for each row execute function set_updated_at();
drop trigger if exists studio_settings_updated on studio_settings;
create trigger studio_settings_updated before update on studio_settings for each row execute function set_updated_at();
drop trigger if exists studio_galleries_updated on studio_galleries;
create trigger studio_galleries_updated before update on studio_galleries for each row execute function set_updated_at();
drop trigger if exists studio_gallery_images_updated on studio_gallery_images;
create trigger studio_gallery_images_updated before update on studio_gallery_images for each row execute function set_updated_at();
drop trigger if exists studio_posts_updated on studio_posts;
create trigger studio_posts_updated before update on studio_posts for each row execute function set_updated_at();
drop trigger if exists studio_services_updated on studio_services;
create trigger studio_services_updated before update on studio_services for each row execute function set_updated_at();
drop trigger if exists studio_clients_updated on studio_clients;
create trigger studio_clients_updated before update on studio_clients for each row execute function set_updated_at();
drop trigger if exists studio_invoices_updated on studio_invoices;
create trigger studio_invoices_updated before update on studio_invoices for each row execute function set_updated_at();
drop trigger if exists studio_inquiries_updated on studio_inquiries;
create trigger studio_inquiries_updated before update on studio_inquiries for each row execute function set_updated_at();
drop trigger if exists site_connections_updated on site_connections;
create trigger site_connections_updated before update on site_connections for each row execute function set_updated_at();
