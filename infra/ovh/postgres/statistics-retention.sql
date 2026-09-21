-- Run daily with the database maintenance role; only analytics records are affected.
begin;
delete from site_traffic_sessions where started_at < now()-interval '90 days';
commit;
