import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { isTrustedOrigin } from '../../../lib/request-security';
import { createClerkSupabaseClient } from '../../../lib/supabase';

const allowedStatuses = new Set(['active', 'maintenance', 'paused']);

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const supabase = createClerkSupabaseClient(async () => (await auth.getToken()) ?? null);
  const admin = await checkAppAdmin(supabase, auth.userId);
  if (!admin.isAdmin || !supabase) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!workspaceId || !allowedStatuses.has(status)) {
    return Response.json({ message: 'Choose a valid site status.' }, { status: 400 });
  }
  const { error } = await supabase.from('site_connections').update({ status }).eq('workspace_id', workspaceId);
  return error
    ? Response.json({ message: 'Site status was not updated.' }, { status: 500 })
    : Response.json({ ok: true });
};
