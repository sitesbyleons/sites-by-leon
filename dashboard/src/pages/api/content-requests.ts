import type { APIRoute } from 'astro';

import { validateContentRequest } from '../../lib/content-request';
import { createPlatformDatabase } from '../../lib/database';
import { isTrustedOrigin } from '../../lib/request-security';
import { resolveClientWorkspace } from '../../lib/workspaces';

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }

  const auth = locals.auth();
  if (!auth.userId) {
    return Response.json({ message: 'Sign in to send an update request.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = validateContentRequest({
    subject: typeof body?.subject === 'string' ? body.subject : '',
    details: typeof body?.details === 'string' ? body.details : '',
  });

  if (!result.ok) {
    return Response.json({ message: Object.values(result.errors)[0] }, { status: 400 });
  }

  const database = createPlatformDatabase();
  if (!database) {
    return Response.json({ message: 'Online requests are not connected yet. Please email Leon.' }, { status: 503 });
  }

  const { workspace, reason: workspaceReason } = await resolveClientWorkspace(database, {
    userId: auth.userId,
    orgId: auth.orgId ?? null,
  });

  if (workspaceReason === 'database') {
    return Response.json({ message: 'Online requests are temporarily unavailable. Please email Leon.' }, { status: 503 });
  }

  if (!workspace) {
    return Response.json({ message: 'This client workspace is not ready yet. Please email Leon.' }, { status: 409 });
  }

  const { error } = await database.from('content_requests').insert({
    workspace_id: workspace.id,
    created_by_clerk_user_id: auth.userId,
    subject: result.value.subject,
    details: result.value.details,
  });

  return error
    ? Response.json({ message: 'That did not send. Please email Leon.' }, { status: 500 })
    : Response.json({ ok: true }, { status: 201 });
};
