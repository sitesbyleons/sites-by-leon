\set ON_ERROR_STOP on
create role leon_photographer_runtime;
create table client_workspaces(id uuid primary key);
insert into client_workspaces values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
\i /tmp/statistics-migration.sql
set role leon_photographer_runtime;
select record_site_traffic('00000000-0000-0000-0000-000000000001',repeat('a',64),repeat('b',64),'/work','US','Desktop','Instagram',false);
select record_site_traffic('00000000-0000-0000-0000-000000000001',repeat('a',64),repeat('b',64),'/work','US','Desktop','Instagram',false);
select record_site_traffic('00000000-0000-0000-0000-000000000002',repeat('a',64),repeat('b',64),'/','GB','Mobile','Google',false);
select record_site_traffic('00000000-0000-0000-0000-000000000001',repeat('c',64),repeat('d',64),'/','US','Desktop','Instagram',true);
do $$ begin
 if (select count(*) from site_traffic_sessions)<>2 then raise exception 'session isolation or heartbeat failed';end if;
 if (select count(*) from site_traffic_views)<>2 then raise exception 'deduplication failed';end if;
end $$;
reset role;
update site_traffic_sessions set started_at=now()-interval '91 days' where workspace_id='00000000-0000-0000-0000-000000000001';
\i /tmp/statistics-retention.sql
do $$ begin
 if (select count(*) from site_traffic_sessions)<>1 then raise exception 'retention failed';end if;
 if (select count(*) from site_traffic_views)<>1 then raise exception 'retention cascade failed';end if;
 if (select count(*) from client_workspaces)<>2 then raise exception 'customer data modified';end if;
end $$;
select 'Statistics database checks passed' as result;
