import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
  },
});

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405);
  const siteKey = new URL(request.url).searchParams.get('siteKey')?.trim() ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteKey)) return json({ status: 'active' });
  const supabase = createSupabaseAdmin();
  if (!supabase) return json({ status: 'active' });
  const { data } = await supabase
    .from('site_connections')
    .select('status,current_version')
    .eq('site_key', siteKey)
    .maybeSingle<{ status: string; current_version: string | null }>();
  const status = data?.status === 'paused' || data?.status === 'maintenance' ? data.status : 'active';
  return json({ status, version: data?.current_version ?? null });
});
