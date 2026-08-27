import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

const MAX_BODY_BYTES = 8 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const contactEmail = typeof body?.contact_email === 'string' ? body.contact_email.trim().toLowerCase() : '';
  if (!workspaceId || !emailPattern.test(contactEmail) || contactEmail.length > 254) {
    return Response.json({ message: 'Enter a valid billing email.' }, { status: 400 });
  }

  const workspace = await database.from('client_workspaces').select('id').eq('id', workspaceId).maybeSingle();
  if (!workspace.data) return Response.json({ message: 'Site not found.' }, { status: 404 });

  const saved = await database
    .from('studio_settings')
    .update({ contact_email: contactEmail })
    .eq('workspace_id', workspaceId);
  if (saved.error) return Response.json({ message: 'The billing email could not be saved.' }, { status: 500 });
  if (!saved.data.length) {
    const created = await database.from('studio_settings').insert({
      workspace_id: workspaceId,
      site_title: 'Studio',
      hero_title: 'Studio',
      hero_subtitle: 'Photography portfolio and booking information.',
      contact_email: contactEmail,
    });
    if (created.error) return Response.json({ message: 'The billing email could not be saved.' }, { status: 500 });
  }
  return Response.json({ ok: true, message: 'Billing email saved.' });
};
