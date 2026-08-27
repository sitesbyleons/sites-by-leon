select extname, extversion from pg_extension order by extname;

select 'client_workspaces' as table_name, count(*) as row_count from public.client_workspaces
union all select 'workspace_members', count(*) from public.workspace_members
union all select 'studio_galleries', count(*) from public.studio_galleries
union all select 'studio_gallery_images', count(*) from public.studio_gallery_images
union all select 'studio_posts', count(*) from public.studio_posts
union all select 'studio_work_stills', count(*) from public.studio_work_stills
union all select 'studio_services', count(*) from public.studio_services
union all select 'studio_clients', count(*) from public.studio_clients
union all select 'studio_invoices', count(*) from public.studio_invoices
union all select 'site_connections', count(*) from public.site_connections
order by table_name;

select 'stripe_events', count(*) from stripe_events;
