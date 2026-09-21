-- Additive migration. No existing customer tables or records are rewritten.
begin;
create table if not exists site_traffic_sessions (
  workspace_id uuid not null references client_workspaces(id) on delete cascade,
  session_hash text not null check(length(session_hash)=64),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  country text not null check(country ~ '^[A-Z]{2}$'),
  device text not null check(device in ('Mobile','Tablet','Desktop','Other')),
  source text not null check(source in ('Direct / unknown','Instagram','Google','Facebook','Bing','YouTube','TikTok','Other website')),
  primary key(workspace_id,session_hash)
);
create index if not exists site_traffic_sessions_date on site_traffic_sessions(workspace_id,started_at);
create index if not exists site_traffic_sessions_live on site_traffic_sessions(workspace_id,last_seen_at);
create table if not exists site_traffic_views (
  workspace_id uuid not null,
  view_hash text not null check(length(view_hash)=64),
  session_hash text not null,
  page text not null check(length(page)<=80 and page not like '%?%' and page not like '%#%'),
  created_at timestamptz not null default now(),
  primary key(workspace_id,view_hash),
  foreign key(workspace_id,session_hash) references site_traffic_sessions(workspace_id,session_hash) on delete cascade
);
create index if not exists site_traffic_views_date on site_traffic_views(workspace_id,created_at);
create index if not exists site_traffic_views_session on site_traffic_views(workspace_id,session_hash);
create or replace function record_site_traffic(w uuid,s text,v text,p text,c text,d text,r text,h boolean)
returns void language plpgsql set timezone='UTC' set search_path=public,pg_temp as $$
begin
  -- Serialize per workspace: caps and duplicate protection must survive concurrency.
  perform pg_advisory_xact_lock(hashtextextended(w::text,9020));
  if h then
    update site_traffic_sessions set last_seen_at=now() where workspace_id=w and session_hash=s and started_at>now()-interval '30 minutes' and last_seen_at<now()-interval '20 seconds';
    return;
  end if;
  if (select count(*) from site_traffic_views where workspace_id=w and created_at>=current_date)>=50000 then return; end if;
  if (select count(*) from site_traffic_views where workspace_id=w and session_hash=s)>=500 then return; end if;
  insert into site_traffic_sessions(workspace_id,session_hash,country,device,source) values(w,s,c,d,r)
    on conflict(workspace_id,session_hash) do update set last_seen_at=now();
  insert into site_traffic_views(workspace_id,view_hash,session_hash,page) values(w,v,s,p) on conflict do nothing;
end $$;
revoke all on function record_site_traffic(uuid,text,text,text,text,text,text,boolean) from public;
grant select,insert,update on site_traffic_sessions to leon_photographer_runtime;
grant select,insert on site_traffic_views to leon_photographer_runtime;
grant execute on function record_site_traffic(uuid,text,text,text,text,text,text,boolean) to leon_photographer_runtime;
commit;
-- Run retention.sql daily via the existing host scheduler before enabling collection.
