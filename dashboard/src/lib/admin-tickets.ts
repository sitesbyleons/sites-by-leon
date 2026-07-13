import type { DataClient } from '@leon/platform-core';

export const adminTicketStatuses = ['new', 'planned', 'in_progress', 'completed', 'declined'] as const;

export type AdminTicketStatus = (typeof adminTicketStatuses)[number];

export function isAdminTicketStatus(value: unknown): value is AdminTicketStatus {
  return typeof value === 'string' && adminTicketStatuses.some((status) => status === value);
}

export async function updateAdminTicketStatus(
  database: DataClient,
  ticketId: string,
  status: AdminTicketStatus,
) {
  const updated = await database.from('content_requests').update({ status }).eq('id', ticketId);
  if (updated.error) return 'error' as const;
  return updated.data.length ? 'updated' as const : 'not_found' as const;
}
