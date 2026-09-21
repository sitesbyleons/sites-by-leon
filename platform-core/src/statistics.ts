import type { QueryExecutor } from './index';

export type TrafficEvent = { workspaceId: string; session: string; view: string; page: string; country: string; device: string; source: string; heartbeat: boolean };
export function statisticsRepository(query: QueryExecutor) {
  return {
    async live(workspaceId: string) {
      const rows=await query("select count(*)::int as live from site_traffic_sessions where workspace_id=$1::uuid and last_seen_at > now()-interval '90 seconds'",[workspaceId]);
      return {live:Number(rows[0]?.live??0)};
    },
    async record(e: TrafficEvent) {
      await query('select record_site_traffic($1::uuid,$2,$3,$4,$5,$6,$7,$8)', [e.workspaceId,e.session,e.view,e.page,e.country,e.device,e.source,e.heartbeat]);
    },
    async report(workspaceId: string, days: number) {
      if (![7,30,90].includes(days)) throw new Error('Invalid period');
      const result = await query(`
        with bounds as (select (now() at time zone 'UTC')::date as today),
        sessions as (select * from site_traffic_sessions where workspace_id=$1::uuid and started_at >= ((select today from bounds)-($2::int-1))::timestamp at time zone 'UTC'),
        views as (select * from site_traffic_views where workspace_id=$1::uuid and created_at >= ((select today from bounds)-($2::int-1))::timestamp at time zone 'UTC')
        select jsonb_build_object(
          'visits',(select count(*) from sessions), 'views',(select count(*) from views),
          'live',(select count(*) from site_traffic_sessions where workspace_id=$1::uuid and last_seen_at > now()-interval '90 seconds'),
          'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',d::date,'visits',(select count(*) from sessions s where (s.started_at at time zone 'UTC')::date=d::date),'views',(select count(*) from views v where (v.created_at at time zone 'UTC')::date=d::date)) order by d),'[]'::jsonb) from generate_series(((select today from bounds)-($2::int-1))::timestamp,(select today from bounds)::timestamp,interval '1 day') d),
          'countries',(select coalesce(jsonb_agg(x order by x.visits desc),'[]'::jsonb) from (select country as name,count(*)::int visits from sessions group by country) x),
          'devices',(select coalesce(jsonb_agg(x order by x.visits desc),'[]'::jsonb) from (select device as name,count(*)::int visits from sessions group by device) x),
          'sources',(select coalesce(jsonb_agg(x order by x.visits desc),'[]'::jsonb) from (select source as name,count(*)::int visits from sessions group by source) x),
          'pages',(select coalesce(jsonb_agg(x order by x.visits desc),'[]'::jsonb) from (select page as name,count(*)::int visits from views group by page order by visits desc limit 20) x)
        ) as report`, [workspaceId,days]);
      return result[0]?.report;
    },
  };
}
