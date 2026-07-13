import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { isAdminTicketStatus, updateAdminTicketStatus } from '../../../lib/admin-tickets';
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
  const ticketId = typeof body?.ticket_id === 'string' ? body.ticket_id.trim() : '';
  if (!ticketId || !isAdminTicketStatus(body?.status)) {
    return Response.json({ message: 'Choose a valid ticket status.' }, { status: 400 });
  }

  const result = await updateAdminTicketStatus(database, ticketId, body.status);
  if (result === 'error') return Response.json({ message: 'Ticket status was not updated.' }, { status: 500 });
  if (result === 'not_found') return Response.json({ message: 'Ticket not found.' }, { status: 404 });
  return Response.json({ ok: true });
};
