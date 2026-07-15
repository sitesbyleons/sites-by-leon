import type { APIRoute } from 'astro';

import {
  createPostgresHostingQueryExecutor,
  setSiteBillingMode,
} from '@leon/platform-core/hosting-access';

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
  if (!admin.isAdmin) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const mode = action === 'automatic' ? 'automatic' : action === 'manual' ? 'manual' : null;
  if (!workspaceId || !mode) return Response.json({ message: 'Choose a valid billing mode.' }, { status: 400 });

  const executor = createPostgresHostingQueryExecutor(process.env.DATABASE_URL);
  if (!executor) return Response.json({ message: 'Billing control is not configured.' }, { status: 503 });
  const result = await setSiteBillingMode(executor, {
    workspace_id: workspaceId,
    mode,
  });
  if (result.error || !result.data) return Response.json({ message: result.error?.message ?? 'Billing control was not updated.' }, { status: 500 });
  if (result.data.outcome === 'missing_subscription') {
    return Response.json({ message: 'This client has not started a hosting subscription yet.' }, { status: 409 });
  }
  if (result.data.outcome === 'missing_site') return Response.json({ message: 'Site not found.' }, { status: 404 });
  if (result.data.outcome === 'archived') return Response.json({ message: 'Restore the site before changing billing control.' }, { status: 409 });
  return Response.json({
    ok: true,
    message: mode === 'automatic' ? 'The site now follows Stripe payments.' : 'The site is back under manual control.',
  });
};
