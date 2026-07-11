-- Content, CRM, inquiry, and invoice records for independently deployed
-- photographer sites. Clerk remains the identity provider and Stripe remains
-- the payment processor; no card or bank details are stored here.

create or replace function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.clerk_user_id = ((select auth.jwt()) ->> 'sub')
        and member.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.app_admins admin
      where admin.clerk_user_id = ((select auth.jwt()) ->> 'sub')
    )
$$;

revoke all on function public.can_manage_workspace(uuid) from public, anon;
grant execute on function public.can_manage_workspace(uuid) to authenticated, service_role;

create table public.studio_settings (
  workspace_id uuid primary key references public.client_workspaces(id) on delete cascade,
  site_title text not null check (char_length(site_title) between 2 and 100),
  hero_title text not null check (char_length(hero_title) between 2 and 120),
  hero_subtitle text not null check (char_length(hero_subtitle) between 2 and 240),
  contact_email text check (contact_email is null or char_length(contact_email) between 5 and 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) between 7 and 32),
  updated_at timestamptz not null default now()
);

create table public.studio_galleries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null check (char_length(category) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  cover_image_url text not null check (char_length(cover_image_url) between 1 and 2048),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index studio_galleries_workspace_sort_idx
  on public.studio_galleries (workspace_id, sort_order, created_at);

create table public.studio_gallery_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  gallery_id uuid not null references public.studio_galleries(id) on delete cascade,
  image_url text not null check (char_length(image_url) between 1 and 2048),
  alt_text text not null check (char_length(alt_text) between 2 and 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_gallery_images_gallery_sort_idx
  on public.studio_gallery_images (gallery_id, sort_order, created_at);

create table public.studio_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 140),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  body text not null default '' check (char_length(body) <= 20000),
  cover_image_url text check (cover_image_url is null or char_length(cover_image_url) <= 2048),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index studio_posts_workspace_published_idx
  on public.studio_posts (workspace_id, published_at desc nulls last, created_at desc);

create table public.studio_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  price_type text not null default 'custom' check (price_type in ('fixed', 'from', 'custom')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_services_workspace_sort_idx
  on public.studio_services (workspace_id, sort_order, created_at);

create table public.studio_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  service_id uuid references public.studio_services(id) on delete set null,
  stripe_customer_id text check (stripe_customer_id is null or char_length(stripe_customer_id) between 8 and 255),
  name text not null check (char_length(name) between 2 and 120),
  email text check (email is null or char_length(email) between 5 and 254),
  phone text check (phone is null or char_length(phone) between 7 and 32),
  notes text not null default '' check (char_length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create unique index studio_clients_workspace_stripe_customer_idx
  on public.studio_clients (workspace_id, stripe_customer_id)
  where stripe_customer_id is not null;

create index studio_clients_workspace_name_idx
  on public.studio_clients (workspace_id, name);

create table public.studio_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  client_id uuid not null references public.studio_clients(id) on delete restrict,
  stripe_invoice_id text unique check (stripe_invoice_id is null or char_length(stripe_invoice_id) between 8 and 255),
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  description text not null check (char_length(description) between 2 and 1000),
  amount_due_cents integer not null check (amount_due_cents > 0),
  deposit_cents integer check (deposit_cents is null or deposit_cents >= 0),
  due_date date,
  hosted_invoice_url text check (hosted_invoice_url is null or char_length(hosted_invoice_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deposit_cents is null or deposit_cents <= amount_due_cents)
);

create index studio_invoices_workspace_created_idx
  on public.studio_invoices (workspace_id, created_at desc);

create table public.studio_inquiries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.client_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  email text check (email is null or char_length(email) between 5 and 254),
  phone text check (phone is null or char_length(phone) between 7 and 32),
  desired_date date not null,
  message text not null check (char_length(message) between 10 and 3000),
  ip_hash text not null check (char_length(ip_hash) = 64),
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create index studio_inquiries_workspace_created_idx
  on public.studio_inquiries (workspace_id, created_at desc);

create table public.site_connections (
  workspace_id uuid primary key references public.client_workspaces(id) on delete cascade,
  site_key text not null unique check (site_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  primary_domain text not null check (char_length(primary_domain) between 3 and 253),
  vercel_project_id text check (vercel_project_id is null or char_length(vercel_project_id) between 8 and 255),
  github_repository text check (github_repository is null or char_length(github_repository) between 3 and 255),
  status text not null default 'active' check (status in ('active', 'paused', 'maintenance', 'error')),
  current_version text check (current_version is null or char_length(current_version) <= 100),
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.site_connections is
  'Leon-visible deployment registry. Site control secrets stay in server environment variables and are never stored here.';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'studio_settings', 'studio_galleries', 'studio_gallery_images', 'studio_posts',
    'studio_services', 'studio_clients', 'studio_invoices', 'studio_inquiries', 'site_connections'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end
$$;

-- Published portfolio content is intentionally public. Column-level access on
-- client_workspaces exposes only the fields needed to resolve a public site.
grant select (id, name, slug, status) on public.client_workspaces to anon;
create policy client_workspaces_select_public_active
on public.client_workspaces
for select
to anon
using (status in ('approved', 'active'));

grant select on public.studio_settings to anon;
grant select on public.studio_galleries to anon;
grant select on public.studio_gallery_images to anon;
grant select on public.studio_posts to anon;
grant select on public.studio_services to anon;

create policy studio_settings_select_public
on public.studio_settings for select to anon
using (exists (select 1 from public.client_workspaces workspace where workspace.id = studio_settings.workspace_id and workspace.status in ('approved', 'active')));

create policy studio_galleries_select_public
on public.studio_galleries for select to anon
using (status = 'published' and exists (select 1 from public.client_workspaces workspace where workspace.id = studio_galleries.workspace_id and workspace.status in ('approved', 'active')));

create policy studio_gallery_images_select_public
on public.studio_gallery_images for select to anon
using (exists (select 1 from public.studio_galleries gallery where gallery.id = studio_gallery_images.gallery_id and gallery.status = 'published'));

create policy studio_posts_select_public
on public.studio_posts for select to anon
using (status = 'published' and exists (select 1 from public.client_workspaces workspace where workspace.id = studio_posts.workspace_id and workspace.status in ('approved', 'active')));

create policy studio_services_select_public
on public.studio_services for select to anon
using (is_active and exists (select 1 from public.client_workspaces workspace where workspace.id = studio_services.workspace_id and workspace.status in ('approved', 'active')));

-- Authenticated owners/admins and Leon can manage only their workspace rows.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'studio_settings', 'studio_galleries', 'studio_gallery_images', 'studio_posts',
    'studio_services', 'studio_clients', 'studio_invoices', 'studio_inquiries', 'site_connections'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.can_manage_workspace(workspace_id)))',
      table_name || '_select_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.can_manage_workspace(workspace_id)))',
      table_name || '_insert_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.can_manage_workspace(workspace_id))) with check ((select public.can_manage_workspace(workspace_id)))',
      table_name || '_update_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.can_manage_workspace(workspace_id)))',
      table_name || '_delete_manager', table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'studio_settings', 'studio_galleries', 'studio_gallery_images', 'studio_posts',
    'studio_services', 'studio_clients', 'studio_invoices', 'studio_inquiries', 'site_connections'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end
$$;

-- Production-shaped Northline demo workspace. Leon remains the platform admin
-- and is also attached as the initial owner so the client view can be tested.
insert into public.client_workspaces (clerk_org_id, name, slug, status)
values ('personal:demo-northline', 'Northline Sports', 'northline', 'active')
on conflict (slug) do update set name = excluded.name, status = excluded.status;

insert into public.workspace_members (workspace_id, clerk_user_id, role)
select workspace.id, admin.clerk_user_id, 'owner'
from public.client_workspaces workspace
cross join public.app_admins admin
where workspace.slug = 'northline'
on conflict (workspace_id, clerk_user_id) do update set role = excluded.role;

insert into public.website_projects (workspace_id, name, status, progress, next_step, live_url)
select id, 'Northline Sports', 'live', 100, 'Your website is live.', 'https://demo.leonsites.org'
from public.client_workspaces workspace
where workspace.slug = 'northline'
  and not exists (select 1 from public.website_projects project where project.workspace_id = workspace.id);

insert into public.studio_settings (workspace_id, site_title, hero_title, hero_subtitle, contact_email)
select id, 'Northline Sports', 'Northline Sports', 'Sports photography for teams and athletes.', 'hello@northlinesports.example'
from public.client_workspaces where slug = 'northline'
on conflict (workspace_id) do nothing;

insert into public.studio_galleries (workspace_id, title, slug, category, description, cover_image_url, status, sort_order)
select workspace.id, seed.title, seed.slug, seed.category, seed.description, seed.cover, 'published', seed.sort_order
from public.client_workspaces workspace
cross join (values
  ('Football', 'friday-night', 'Game coverage', 'High school and club football coverage.', '/images/sports/football-huddle.webp', 1),
  ('Basketball', 'above-the-rim', 'Game coverage', 'Basketball games, tournaments, and practices.', '/images/sports/basketball-action.webp', 2),
  ('Track & Field', 'lane-eight', 'Meet coverage', 'Track meets, relays, and athlete coverage.', '/images/sports/track-runner.webp', 3)
) as seed(title, slug, category, description, cover, sort_order)
where workspace.slug = 'northline'
on conflict (workspace_id, slug) do nothing;

insert into public.studio_gallery_images (workspace_id, gallery_id, image_url, alt_text, sort_order)
select workspace.id, gallery.id, seed.url, seed.alt, seed.sort_order
from public.client_workspaces workspace
cross join (values
  ('friday-night', '/images/sports/football-huddle.webp', 'Two football teams set at the line of scrimmage under stadium lights', 1),
  ('friday-night', '/images/sports/football-player.webp', 'Quarterback preparing to pass during a late-afternoon football game', 2),
  ('friday-night', '/images/sports/football-field.webp', 'Football player carrying the ball while a defender closes in', 3),
  ('above-the-rim', '/images/sports/basketball-action.webp', 'Basketball players driving down the court with motion blur', 1),
  ('above-the-rim', '/images/sports/basketball-grayscale.webp', 'Basketball player moving through defenders in black and white', 2),
  ('above-the-rim', '/images/sports/basketball-court.webp', 'Basketball players practicing beneath arena lights on an orange court', 3),
  ('lane-eight', '/images/sports/track-runner.webp', 'Sprinter launching from the starting blocks on a red track', 1),
  ('lane-eight', '/images/sports/track-start.webp', 'Track athletes preparing at the starting line', 2),
  ('lane-eight', '/images/sports/track-night.webp', 'Runner competing under stadium lights at night', 3)
) as seed(gallery_slug, url, alt, sort_order)
join public.studio_galleries gallery on gallery.workspace_id = workspace.id and gallery.slug = seed.gallery_slug
where workspace.slug = 'northline'
  and not exists (
    select 1 from public.studio_gallery_images existing
    where existing.gallery_id = gallery.id and existing.image_url = seed.url
  );

insert into public.studio_posts (workspace_id, title, slug, excerpt, body, cover_image_url, status, published_at)
select workspace.id, seed.title, seed.slug, seed.excerpt, seed.body, seed.cover, 'published', seed.published_at
from public.client_workspaces workspace
cross join (values
  ('Working the Sideline', 'working-the-sideline', 'Football coverage from the sideline.', 'A short look at positioning, timing, and the final image set from a football game.', '/images/sports/football-field.webp', '2026-07-08T12:00:00Z'::timestamptz),
  ('Basketball in Motion', 'basketball-in-motion', 'Photographing a fast game.', 'A short set from a basketball game focused on movement and the space around each play.', '/images/sports/basketball-action.webp', '2026-07-06T12:00:00Z'::timestamptz),
  ('Photographing Track', 'through-the-finish', 'Coverage from the first heat to the final race.', 'A short set from a track meet with attention to starts, finishes, and athlete reactions.', '/images/sports/track-night.webp', '2026-07-04T12:00:00Z'::timestamptz)
) as seed(title, slug, excerpt, body, cover, published_at)
where workspace.slug = 'northline'
on conflict (workspace_id, slug) do nothing;

insert into public.studio_services (workspace_id, name, description, price_type, price_cents, sort_order)
select workspace.id, seed.name, seed.description, seed.price_type, seed.price_cents, seed.sort_order
from public.client_workspaces workspace
cross join (values
  ('Game Coverage', 'Photography coverage for one game.', 'from', 45000, 1),
  ('Season Coverage', 'Photography coverage for multiple games during a season.', 'custom', null, 2),
  ('Athlete Session', 'Action photography and athlete portraits.', 'from', 60000, 3)
) as seed(name, description, price_type, price_cents, sort_order)
where workspace.slug = 'northline'
  and not exists (select 1 from public.studio_services service where service.workspace_id = workspace.id);

insert into public.site_connections (
  workspace_id, site_key, primary_domain, vercel_project_id, github_repository, status, current_version
)
select id, 'northline-demo', 'demo.leonsites.org', 'prj_AWIrVXuJKzndtFWgy60ok5iQwMqI',
  'sitesbyleons/northline-portraits-demo', 'active', 'editorial-sports-v1'
from public.client_workspaces where slug = 'northline'
on conflict (workspace_id) do update set
  primary_domain = excluded.primary_domain,
  vercel_project_id = excluded.vercel_project_id,
  github_repository = excluded.github_repository,
  status = excluded.status,
  current_version = excluded.current_version;
