import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { APIRoute } from 'astro';

import { resolveManagedStudio } from '../../../lib/studio';
import { validateStudioTicket } from '../../../lib/studio-support';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 8_000) {
    return Response.json({ message: 'Ticket is too large.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const { client, workspaceId } = await resolveManagedStudio(auth.userId, locals.siteContext.workspaceId);
  if (!client || !workspaceId) return Response.json({ message: 'Studio owner access required.' }, { status: 403 });

  const validation = validateStudioTicket(await request.json().catch(() => ({})));
  if (!validation.ok) return Response.json({ message: validation.message }, { status: 422 });

  const created = await client.from('content_requests').insert({
    workspace_id: workspaceId,
    created_by_clerk_user_id: auth.userId,
    subject: validation.value.subject,
    details: validation.value.details,
  });
  return created.error
    ? Response.json({ message: 'Ticket could not be sent. Email leon@leonsites.com.' }, { status: 503 })
    : Response.json({ ok: true }, { status: 201 });
};
