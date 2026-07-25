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
  clerk_org_id text unique check (clerk_org_id is null or char_length(clerk_org_id) between 3 and 128),
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
  template_key text not null default 'blank' check (template_key in ('blank', 'sports', 'editorial', 'commercial')),
  progress smallint not null default 0 check (progress between 0 and 100),
  next_step text,
  live_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_workspaces alter column clerk_org_id drop not null;
alter table website_projects add column if not exists template_key text;
update website_projects set template_key = 'blank' where template_key is null;
alter table website_projects alter column template_key set default 'blank';
alter table website_projects alter column template_key set not null;
alter table website_projects drop constraint if exists website_projects_template_key_check;
alter table website_projects add constraint website_projects_template_key_check
  check (template_key in ('blank', 'sports', 'editorial', 'commercial'));

create table if not exists site_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  workspace_id uuid not null,
  requested_by_clerk_user_id text not null check (char_length(requested_by_clerk_user_id) between 3 and 128),
  owner_clerk_user_id text not null check (char_length(owner_clerk_user_id) between 3 and 128),
  status text not null default 'database_ready' check (status in ('database_ready', 'configuring', 'ready', 'failed')),
  last_error text,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_provisioning_runs_idempotency_key_key unique (idempotency_key),
  constraint site_provisioning_runs_workspace_id_key unique (workspace_id),
  constraint site_provisioning_runs_workspace_id_fkey foreign key (workspace_id)
    references client_workspaces(id) on delete restrict deferrable initially deferred
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_provisioning_runs_workspace_id_fkey'
      and conrelid = 'site_provisioning_runs'::regclass
  ) then
    alter table site_provisioning_runs
      add constraint site_provisioning_runs_workspace_id_fkey
      foreign key (workspace_id) references client_workspaces(id)
      on delete restrict deferrable initially deferred;
  end if;
end;
$$;

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
  quota_bytes bigint not null default 16106127360,
  updated_at timestamptz not null default now(),
  check (used_bytes >= 0),
  check (quota_bytes >= 16777216),
  check (used_bytes <= quota_bytes)
);

alter table workspace_storage_usage
  alter column quota_bytes set default 16106127360;

do $$
begin
  if exists (
    select 1
    from workspace_storage_usage
    where used_bytes > 16106127360
  ) then
    raise exception 'Cannot apply the 15 GiB workspace quota: a workspace currently exceeds it.';
  end if;
end
$$;

update workspace_storage_usage
set quota_bytes = 16106127360,
    updated_at = now()
where quota_bytes <> 16106127360;

create table if not exists workspace_uploads (
  storage_path text primary key,
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  original_filename text,
  media_kind text not null default 'library',
  is_retained boolean not null default false,
  created_at timestamptz not null default now()
);

alter table workspace_uploads add column if not exists original_filename text;
alter table workspace_uploads add column if not exists media_kind text not null default 'library';
alter table workspace_uploads add column if not exists is_retained boolean not null default false;

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
  layout_mode text not null default 'grid' check (layout_mode in ('grid', 'stack')),
  grid_columns smallint not null default 3 check (grid_columns between 1 and 4),
  image_aspect_ratio text not null default 'landscape' check (image_aspect_ratio in ('square', 'portrait', 'landscape', 'wide')),
  cover_aspect_ratio text not null default 'landscape' check (cover_aspect_ratio in ('square', 'portrait', 'landscape', 'wide')),
  cover_crop_x smallint not null default 50 check (cover_crop_x between 0 and 100),
  cover_crop_y smallint not null default 50 check (cover_crop_y between 0 and 100),
  cover_crop_zoom numeric(4, 2) not null default 1 check (cover_crop_zoom between 1 and 3),
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
  aspect_ratio text not null default 'inherit' check (aspect_ratio in ('inherit', 'square', 'portrait', 'landscape', 'wide')),
  crop_x smallint not null default 50 check (crop_x between 0 and 100),
  crop_y smallint not null default 50 check (crop_y between 0 and 100),
  crop_zoom numeric(4, 2) not null default 1 check (crop_zoom between 1 and 3),
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
  cover_aspect_ratio text not null default 'landscape' check (cover_aspect_ratio in ('square', 'portrait', 'landscape', 'wide')),
  cover_crop_x smallint not null default 50 check (cover_crop_x between 0 and 100),
  cover_crop_y smallint not null default 50 check (cover_crop_y between 0 and 100),
  cover_crop_zoom numeric(4, 2) not null default 1 check (cover_crop_zoom between 1 and 3),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

alter table studio_galleries add column if not exists layout_mode text not null default 'grid';
alter table studio_galleries add column if not exists grid_columns smallint not null default 3;
alter table studio_galleries add column if not exists image_aspect_ratio text not null default 'landscape';
alter table studio_galleries add column if not exists cover_aspect_ratio text not null default 'landscape';
alter table studio_galleries add column if not exists cover_crop_x smallint not null default 50;
alter table studio_galleries add column if not exists cover_crop_y smallint not null default 50;
alter table studio_galleries add column if not exists cover_crop_zoom numeric(4, 2) not null default 1;
alter table studio_galleries drop constraint if exists studio_galleries_layout_mode_check;
alter table studio_galleries add constraint studio_galleries_layout_mode_check check (layout_mode in ('grid', 'stack'));
alter table studio_galleries drop constraint if exists studio_galleries_grid_columns_check;
alter table studio_galleries add constraint studio_galleries_grid_columns_check check (grid_columns between 1 and 4);
alter table studio_galleries drop constraint if exists studio_galleries_image_aspect_ratio_check;
alter table studio_galleries add constraint studio_galleries_image_aspect_ratio_check check (image_aspect_ratio in ('square', 'portrait', 'landscape', 'wide'));
alter table studio_galleries drop constraint if exists studio_galleries_cover_aspect_ratio_check;
alter table studio_galleries add constraint studio_galleries_cover_aspect_ratio_check check (cover_aspect_ratio in ('square', 'portrait', 'landscape', 'wide'));
alter table studio_galleries drop constraint if exists studio_galleries_cover_crop_x_check;
alter table studio_galleries add constraint studio_galleries_cover_crop_x_check check (cover_crop_x between 0 and 100);
alter table studio_galleries drop constraint if exists studio_galleries_cover_crop_y_check;
alter table studio_galleries add constraint studio_galleries_cover_crop_y_check check (cover_crop_y between 0 and 100);
alter table studio_galleries drop constraint if exists studio_galleries_cover_crop_zoom_check;
alter table studio_galleries add constraint studio_galleries_cover_crop_zoom_check check (cover_crop_zoom between 1 and 3);

alter table studio_gallery_images add column if not exists aspect_ratio text not null default 'inherit';
alter table studio_gallery_images add column if not exists crop_x smallint not null default 50;
alter table studio_gallery_images add column if not exists crop_y smallint not null default 50;
alter table studio_gallery_images add column if not exists crop_zoom numeric(4, 2) not null default 1;
alter table studio_gallery_images drop constraint if exists studio_gallery_images_aspect_ratio_check;
alter table studio_gallery_images add constraint studio_gallery_images_aspect_ratio_check check (aspect_ratio in ('inherit', 'square', 'portrait', 'landscape', 'wide'));
alter table studio_gallery_images drop constraint if exists studio_gallery_images_crop_x_check;
alter table studio_gallery_images add constraint studio_gallery_images_crop_x_check check (crop_x between 0 and 100);
alter table studio_gallery_images drop constraint if exists studio_gallery_images_crop_y_check;
alter table studio_gallery_images add constraint studio_gallery_images_crop_y_check check (crop_y between 0 and 100);
alter table studio_gallery_images drop constraint if exists studio_gallery_images_crop_zoom_check;
alter table studio_gallery_images add constraint studio_gallery_images_crop_zoom_check check (crop_zoom between 1 and 3);

alter table studio_posts add column if not exists cover_aspect_ratio text not null default 'landscape';
alter table studio_posts add column if not exists cover_crop_x smallint not null default 50;
alter table studio_posts add column if not exists cover_crop_y smallint not null default 50;
alter table studio_posts add column if not exists cover_crop_zoom numeric(4, 2) not null default 1;
alter table studio_posts drop constraint if exists studio_posts_cover_aspect_ratio_check;
alter table studio_posts add constraint studio_posts_cover_aspect_ratio_check check (cover_aspect_ratio in ('square', 'portrait', 'landscape', 'wide'));
alter table studio_posts drop constraint if exists studio_posts_cover_crop_x_check;
alter table studio_posts add constraint studio_posts_cover_crop_x_check check (cover_crop_x between 0 and 100);
alter table studio_posts drop constraint if exists studio_posts_cover_crop_y_check;
alter table studio_posts add constraint studio_posts_cover_crop_y_check check (cover_crop_y between 0 and 100);
alter table studio_posts drop constraint if exists studio_posts_cover_crop_zoom_check;
alter table studio_posts add constraint studio_posts_cover_crop_zoom_check check (cover_crop_zoom between 1 and 3);

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

create table if not exists inquiry_rate_limits (
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) = 64),
  request_times timestamptz[] not null default array[now()],
  updated_at timestamptz not null default now(),
  primary key (workspace_id, ip_hash),
  check (cardinality(request_times) between 1 and 5)
);

create table if not exists site_connections (
  workspace_id uuid primary key references client_workspaces(id) on delete cascade,
  site_key text not null unique,
  primary_domain text not null,
  admin_domain text not null,
  deployment_target text,
  github_repository text,
  status text not null default 'active' check (status in ('active', 'paused', 'maintenance', 'error')),
  current_version text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table site_connections add column if not exists admin_domain text;
update site_connections set admin_domain = primary_domain where admin_domain is null;
alter table site_connections alter column admin_domain set not null;
alter table site_connections add column if not exists site_kind text not null default 'client';
update site_connections
set site_kind = 'demo'
where primary_domain in ('demo.leonsites.org', 'vow-and-light.leonsites.org');
alter table site_connections drop constraint if exists site_connections_site_kind_check;
alter table site_connections add constraint site_connections_site_kind_check
  check (site_kind in ('client', 'demo'));
alter table site_connections add column if not exists hosting_subscription_id uuid;
alter table site_connections add column if not exists billing_mode text not null default 'manual';
alter table site_connections add column if not exists desired_status text;
update site_connections
set desired_status = case
  when status in ('active', 'maintenance', 'paused') then status
  else 'maintenance'
end
where desired_status is null;
alter table site_connections alter column desired_status set default 'active';
alter table site_connections alter column desired_status set not null;
alter table site_connections add column if not exists billing_state text not null default 'manual';
alter table site_connections add column if not exists billing_updated_at timestamptz;
alter table site_connections add column if not exists archived_at timestamptz;
alter table site_connections add column if not exists archived_by_clerk_user_id text;
alter table site_connections add column if not exists archive_reason text;
alter table site_connections add column if not exists pre_archive_status text;
alter table site_connections drop constraint if exists site_connections_status_check;
alter table site_connections add constraint site_connections_status_check
  check (status in ('active', 'paused', 'maintenance', 'error', 'archived'));
alter table site_connections drop constraint if exists site_connections_billing_mode_check;
alter table site_connections add constraint site_connections_billing_mode_check
  check (billing_mode in ('manual', 'automatic'));
alter table site_connections drop constraint if exists site_connections_desired_status_check;
alter table site_connections add constraint site_connections_desired_status_check
  check (desired_status in ('active', 'maintenance', 'paused'));
alter table site_connections drop constraint if exists site_connections_billing_state_check;
alter table site_connections add constraint site_connections_billing_state_check
  check (billing_state in ('manual', 'paid', 'action_required', 'suspended'));
alter table site_connections drop constraint if exists site_connections_pre_archive_status_check;
alter table site_connections add constraint site_connections_pre_archive_status_check
  check (pre_archive_status is null or pre_archive_status in ('active', 'maintenance', 'paused', 'error'));
alter table site_connections drop constraint if exists site_connections_hosting_subscription_id_fkey;
alter table site_connections add constraint site_connections_hosting_subscription_id_fkey
  foreign key (hosting_subscription_id) references subscriptions(id) on delete set null;
alter table site_connections drop constraint if exists site_connections_hosting_subscription_id_key;
alter table site_connections add constraint site_connections_hosting_subscription_id_key unique (hosting_subscription_id);
alter table site_connections drop constraint if exists site_connections_primary_domain_check;
alter table site_connections add constraint site_connections_primary_domain_check
  check (char_length(primary_domain) between 3 and 253 and primary_domain = lower(primary_domain));
alter table site_connections drop constraint if exists site_connections_admin_domain_check;
alter table site_connections add constraint site_connections_admin_domain_check
  check (char_length(admin_domain) between 3 and 253 and admin_domain = lower(admin_domain));

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

create table if not exists site_domain_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  hostname text not null,
  status text not null default 'requested'
    check (status in ('requested', 'configuring', 'dns_pending', 'active', 'error', 'removing', 'removed')),
  is_canonical boolean not null default false,
  cloudflare_custom_hostname_id text unique,
  cloudflare_hostname_status text,
  cloudflare_ssl_status text,
  dns_target text not null default 'customers.leonsites.org',
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(hostname) between 3 and 253 and hostname = lower(hostname)),
  check (char_length(dns_target) between 3 and 253 and dns_target = lower(dns_target))
);

create table if not exists domain_jobs (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references site_domain_aliases(id) on delete cascade,
  action text not null check (action in ('create', 'refresh', 'delete')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  idempotency_key uuid not null unique,
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function ensure_customer_hostname_available()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(lower(new.hostname), 0));
  if exists (
    select 1 from site_connections
    where lower(primary_domain) = lower(new.hostname)
       or lower(admin_domain) = lower(new.hostname)
  ) then
    raise exception 'Customer hostname is already assigned to a site.' using errcode = '23505';
  end if;
  return new;
end;
$$;

create or replace function ensure_connection_hostnames_available()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(lower(new.primary_domain), 0));
  perform pg_advisory_xact_lock(hashtextextended(lower(new.admin_domain), 0));
  if exists (
    select 1 from site_domain_aliases
    where lower(hostname) in (lower(new.primary_domain), lower(new.admin_domain))
      and status <> 'removed'
  ) then
    raise exception 'Site hostname is already assigned as a customer domain.' using errcode = '23505';
  end if;
  return new;
end;
$$;

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

-- Files already attached to published content predate the reusable media library.
-- Keep them visible and protected from orphan cleanup after this migration runs.
update workspace_uploads as upload
set
  is_retained = true,
  original_filename = coalesce(nullif(upload.original_filename, ''), regexp_replace(upload.storage_path, '^.*/', '')),
  media_kind = case
    when upload.media_kind = 'library' and split_part(upload.storage_path, '/', 2) in ('galleries', 'images', 'posts')
      then split_part(upload.storage_path, '/', 2)
    else upload.media_kind
  end
where
  exists (
    select 1 from studio_galleries
    where studio_galleries.workspace_id = upload.workspace_id
      and studio_galleries.cover_storage_path = upload.storage_path
  )
  or exists (
    select 1 from studio_gallery_images
    where studio_gallery_images.workspace_id = upload.workspace_id
      and studio_gallery_images.storage_path = upload.storage_path
  )
  or exists (
    select 1 from studio_posts
    where studio_posts.workspace_id = upload.workspace_id
      and studio_posts.cover_storage_path = upload.storage_path
  );

create index if not exists connected_payment_account_history_workspace_idx on connected_payment_account_history (workspace_id, retired_at desc);
create index if not exists website_projects_workspace_updated_idx on website_projects (workspace_id, updated_at desc);
create unique index if not exists website_projects_workspace_unique_idx on website_projects (workspace_id);
create unique index if not exists site_connections_primary_domain_lower_unique_idx on site_connections (lower(primary_domain));
create unique index if not exists site_connections_admin_domain_lower_unique_idx on site_connections (lower(admin_domain));
create unique index if not exists site_domain_aliases_hostname_lower_unique_idx
  on site_domain_aliases (lower(hostname)) where status <> 'removed';
create unique index if not exists site_domain_aliases_workspace_canonical_unique_idx
  on site_domain_aliases (workspace_id) where is_canonical and status = 'active';
create index if not exists site_domain_aliases_workspace_status_idx on site_domain_aliases (workspace_id, status, created_at);
create index if not exists domain_jobs_ready_idx on domain_jobs (status, available_at, created_at);
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
create index if not exists inquiry_rate_limits_updated_idx on inquiry_rate_limits (updated_at);

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
drop trigger if exists site_connections_hostname_available on site_connections;
create trigger site_connections_hostname_available before insert or update of primary_domain, admin_domain
  on site_connections for each row execute function ensure_connection_hostnames_available();
drop trigger if exists site_domain_aliases_hostname_available on site_domain_aliases;
create trigger site_domain_aliases_hostname_available before insert or update of hostname
  on site_domain_aliases for each row execute function ensure_customer_hostname_available();
drop trigger if exists site_domain_aliases_updated on site_domain_aliases;
create trigger site_domain_aliases_updated before update on site_domain_aliases for each row execute function set_updated_at();
drop trigger if exists domain_jobs_updated on domain_jobs;
create trigger domain_jobs_updated before update on domain_jobs for each row execute function set_updated_at();
drop trigger if exists site_provisioning_runs_updated on site_provisioning_runs;
create trigger site_provisioning_runs_updated before update on site_provisioning_runs for each row execute function set_updated_at();

-- Applications can use a separate login role granted to this NOLOGIN group.
-- The login and its password are created out-of-band in a root-readable secret file.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'leon_runtime') then
    create role leon_runtime nologin nosuperuser nocreatedb nocreaterole noreplication;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'leon_photographer_runtime') then
    create role leon_photographer_runtime nologin nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end $$;

revoke create on schema public from public;
grant usage on schema public to leon_runtime;
grant select, insert, update, delete on all tables in schema public to leon_runtime;
grant usage, select on all sequences in schema public to leon_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to leon_runtime;
alter default privileges in schema public grant usage, select on sequences to leon_runtime;

revoke leon_runtime from leon_photographer_runtime;
revoke all privileges on all tables in schema public from leon_photographer_runtime;
revoke all privileges on all sequences in schema public from leon_photographer_runtime;
alter default privileges in schema public revoke all on tables from leon_photographer_runtime;
alter default privileges in schema public revoke all on sequences from leon_photographer_runtime;
grant usage on schema public to leon_photographer_runtime;
grant select on table app_admins, client_workspaces, workspace_members, site_connections, site_domain_aliases to leon_photographer_runtime;
grant select, insert, update, delete on table
  workspace_storage_usage,
  workspace_uploads,
  content_requests,
  connected_payment_accounts,
  connected_payment_account_history,
  studio_settings,
  studio_galleries,
  studio_gallery_images,
  studio_posts,
  studio_services,
  studio_clients,
  studio_invoices,
  studio_inquiries,
  inquiry_rate_limits,
  stripe_events
to leon_photographer_runtime;
revoke all privileges on table subscriptions, checkout_attempts, website_projects, site_provisioning_runs, domain_jobs from leon_photographer_runtime;
revoke insert, update, delete, truncate, references, trigger on table app_admins from leon_photographer_runtime;
