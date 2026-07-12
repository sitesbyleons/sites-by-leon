import type { APIRoute } from 'astro';

import { createStudioDatabase } from '../../lib/database';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const siteKey = url.searchParams.get('siteKey') ?? import.meta.env.SITE_KEY ?? '';
  const database = createStudioDatabase();
  if (!database || !siteKey) return Response.json({ status: 'maintenance' }, { status: 503 });
  const result = await database
    .from('site_connections')
    .select<{ status: string }>('status')
    .eq('site_key', siteKey)
    .maybeSingle();
  if (!result.data || result.error) return Response.json({ status: 'maintenance' }, { status: 404 });
  return Response.json({ status: result.data.status });
};
