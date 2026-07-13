import { createDataClient } from '@leon/platform-core';
import { describe, expect, it } from 'vitest';

import { loadAdminData } from '../src/lib/admin';
import { updateAdminTicketStatus } from '../src/lib/admin-tickets';

describe('admin support tickets', () => {
  it('loads the details Leon needs to handle each ticket', async () => {
    const database = createDataClient(async (text) => {
      if (text.includes('from "content_requests"')) {
        if (!text.includes('"details"')) throw new Error('Ticket details were not selected.');
        return [{
          id: 'request_1',
          workspace_id: 'workspace_1',
          subject: 'Update the gallery',
          details: 'Replace the first image with the new championship photo.',
          status: 'new',
          created_at: '2026-07-12T12:00:00.000Z',
        }];
      }
      return [];
    });

    const data = await loadAdminData(database);

    expect(data.error).toBeNull();
    expect(data.requests[0]).toMatchObject({
      subject: 'Update the gallery',
      details: 'Replace the first image with the new championship photo.',
    });
  });

  it('updates one ticket status and distinguishes a missing ticket', async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const database = createDataClient(async (text, values) => {
      queries.push({ text, values });
      return values[1] === 'request_missing' ? [] : [{ id: values[1], status: values[0] }];
    });

    await expect(updateAdminTicketStatus(database, 'request_1', 'in_progress')).resolves.toBe('updated');
    await expect(updateAdminTicketStatus(database, 'request_missing', 'completed')).resolves.toBe('not_found');

    expect(queries[0]).toEqual({
      text: 'update "content_requests" set "status" = $1 where "id" = $2 returning *',
      values: ['in_progress', 'request_1'],
    });
  });
});
