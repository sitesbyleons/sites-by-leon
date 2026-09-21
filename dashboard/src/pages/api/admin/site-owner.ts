import { clerkClient } from '@clerk/astro/server';
import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

const MAX_BODY_BYTES = 8 * 1024;

export const POST: APIRoute = async (context) => {
  const { request, locals, url } = context;
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
  const ownerUserId = typeof body?.owner_user_id === 'string' ? body.owner_user_id.trim() : '';
  if (!workspaceId || !/^user_[a-zA-Z0-9_-]{4,}$/.test(ownerUserId)) {
    return Response.json({ message: 'Choose a valid Clerk user.' }, { status: 400 });
  }

  try {
    await clerkClient(context).users.getUser(ownerUserId);
  } catch {
    return Response.json({ message: 'That Clerk user no longer exists.' }, { status: 400 });
  }

  const workspace = await database.from('client_workspaces').select('id').eq('id', workspaceId).maybeSingle();
  if (!workspace.data) return Response.json({ message: 'Site not found.' }, { status: 404 });

  const existing = await database
    .from('workspace_members')
    .select('workspace_id,role')
    .eq('clerk_user_id', ownerUserId);
  if (existing.error) return Response.json({ message: 'Existing access could not be checked.' }, { status: 503 });
  const otherSite = (existing.data ?? []).find((member) => member.workspace_id !== workspaceId);
  if (otherSite) return Response.json({ message: 'That user is already linked to another site.' }, { status: 409 });

  const saved = await database.from('workspace_members').insert({
    workspace_id: workspaceId,
    clerk_user_id: ownerUserId,
    role: 'owner',
  });
  if (saved.error) {
    const alreadyLinked = await database
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('clerk_user_id', ownerUserId)
      .maybeSingle();
    if (alreadyLinked.data) return Response.json({ ok: true, message: 'That user is already linked to this site.' });
    return Response.json({ message: 'The user could not be linked.' }, { status: 500 });
  }
  return Response.json({ ok: true, message: 'Clerk user linked to this site.' });
};
