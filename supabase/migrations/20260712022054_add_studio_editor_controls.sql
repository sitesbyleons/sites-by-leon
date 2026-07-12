
-- A focused content editor for photographer sites. Images live in Supabase
-- Storage; the database stores only public URLs and the object paths needed for
-- safe replacement/deletion through the Storage API.

alter table public.studio_settings
  add column paper_color text not null default '#f4f6f8',
  add column ink_color text not null default '#090d12',
  add column accent_color text not null default '#ff3b30',
  add column font_preset text not null default 'editorial',
  add constraint studio_settings_paper_color_check check (paper_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint studio_settings_ink_color_check check (ink_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint studio_settings_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint studio_settings_font_preset_check check (font_preset in ('editorial', 'athletic', 'modern'));

alter table public.studio_galleries add column cover_storage_path text;
alter table public.studio_gallery_images add column storage_path text;
alter table public.studio_posts
  add column cover_storage_path text,
  add column sort_order integer not null default 0;

update public.studio_settings settings
set paper_color = '#f4f6f8', ink_color = '#090d12', accent_color = '#ff3b30', font_preset = 'athletic'
from public.client_workspaces workspace
where workspace.id = settings.workspace_id and workspace.slug = 'northline';

with ranked as (
  select id, row_number() over (partition by workspace_id order by published_at desc nulls last, created_at desc) as position
  from public.studio_posts
)
update public.studio_posts post
set sort_order = ranked.position
from ranked
where post.id = ranked.id;

create index studio_posts_workspace_sort_idx
  on public.studio_posts (workspace_id, sort_order, created_at);

create index studio_gallery_images_workspace_idx on public.studio_gallery_images (workspace_id);
create index studio_clients_service_idx on public.studio_clients (service_id);
create index studio_invoices_client_idx on public.studio_invoices (client_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-images',
  'portfolio-images',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy portfolio_images_insert_manager
on storage.objects for insert to authenticated
with check (
  bucket_id = 'portfolio-images'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
    else false
  end
);

create policy portfolio_images_select_manager
on storage.objects for select to authenticated
using (
  bucket_id = 'portfolio-images'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
    else false
  end
);

create policy portfolio_images_update_manager
on storage.objects for update to authenticated
using (
  bucket_id = 'portfolio-images'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
    else false
  end
)
with check (
  bucket_id = 'portfolio-images'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
    else false
  end
);

create policy portfolio_images_delete_manager
on storage.objects for delete to authenticated
using (
  bucket_id = 'portfolio-images'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
    else false
  end
);
