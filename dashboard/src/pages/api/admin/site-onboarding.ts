import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { parseDomainOptions, parseMonthlyCents, serializeDomainOptions } from '../../../lib/billing';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

const MAX_BODY_BYTES = 8 * 1024;

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ message: 'The request is too large.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const database = createPlatformDatabase();
  const admin = await checkAppAdmin(database, auth.userId);
  if (!admin.isAdmin || !database) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id : '';
  const monthlyCents = parseMonthlyCents(body?.monthly_usd);
  const options = parseDomainOptions(typeof body?.domain_options === 'string' ? body.domain_options : '');
  if (!workspaceId) return Response.json({ message: 'Site not found.' }, { status: 400 });
  if (!monthlyCents) return Response.json({ message: 'Enter a monthly amount between $1 and $10,000.' }, { status: 400 });
  if (!options.length) return Response.json({ message: 'Add at least one domain the client can choose, such as studio.com.' }, { status: 400 });

  const workspace = await database.from('client_workspaces').select('id').eq('id', workspaceId).maybeSingle();
  if (!workspace.data) return Response.json({ message: 'Site not found.' }, { status: 404 });

  const saved = await database
    .from('website_projects')
    .update({
      monthly_cents: monthlyCents,
      domain_options: serializeDomainOptions(options),
    })
    .eq('workspace_id', workspaceId);
  if (saved.error || !saved.data.length) {
    return Response.json({ message: 'Hosting setup could not be saved.' }, { status: 500 });
  }
  return Response.json({ ok: true, message: 'Hosting amount and domain list saved.' });
};
