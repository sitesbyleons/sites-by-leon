import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

const allowedStatuses = new Set(['active', 'maintenance', 'paused']);

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const database = createPlatformDatabase();
  const admin = await checkAppAdmin(database, auth.userId);
  if (!admin.isAdmin || !database) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!workspaceId || !allowedStatuses.has(status)) {
    return Response.json({ message: 'Choose a valid site status.' }, { status: 400 });
  }
  const result = await database.setSiteOperationalStatus(workspaceId, status as 'active' | 'maintenance' | 'paused');
  return result.error || !result.data
    ? Response.json({ message: 'Site status was not updated.' }, { status: 500 })
    : Response.json({ ok: true, status: result.data.site_status });
};
