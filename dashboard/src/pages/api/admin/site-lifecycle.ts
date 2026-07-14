import type { APIRoute } from 'astro';

import { createPostgresHostingQueryExecutor } from '@leon/platform-core/hosting-access';
import { archiveSite, restoreSite } from '@leon/platform-core/site-lifecycle';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

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
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!workspaceId || !['archive', 'restore'].includes(action)) {
    return Response.json({ message: 'Choose a valid site action.' }, { status: 400 });
  }

  const workspace = await database.from('client_workspaces').select('name').eq('id', workspaceId).maybeSingle<{ name: string }>();
  if (workspace.error) return Response.json({ message: 'The site could not be checked.' }, { status: 503 });
  if (!workspace.data) return Response.json({ message: 'Site not found.' }, { status: 404 });
  if (action === 'archive' && body?.confirmation !== workspace.data.name) {
    return Response.json({ message: `Type “${workspace.data.name}” exactly to confirm.` }, { status: 400 });
  }

  const executor = createPostgresHostingQueryExecutor(process.env.DATABASE_URL);
  if (!executor) return Response.json({ message: 'Site lifecycle control is not configured.' }, { status: 503 });
  const result = action === 'archive'
    ? await archiveSite(executor, {
      workspace_id: workspaceId,
      actor: auth.userId,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    })
    : await restoreSite(executor, { workspace_id: workspaceId, actor: auth.userId });

  if (result.error || !result.data) {
    return Response.json({ message: result.error?.message ?? 'The site was not updated.' }, { status: 500 });
  }
  if (result.data.outcome === 'missing_site') return Response.json({ message: 'Site not found.' }, { status: 404 });
  return Response.json({
    ok: true,
    message: action === 'archive' ? 'Site deleted safely. A restore copy is preserved.' : 'Site restored in maintenance mode.',
  });
};
