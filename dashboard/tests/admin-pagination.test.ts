import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadAdminUsers, type ClerkUserClient } from '../src/lib/admin';

const user = (index: number) => ({
  id: `user_${index}`,
  firstName: 'Client',
  lastName: String(index),
  username: null,
  primaryEmailAddressId: `email_${index}`,
  emailAddresses: [{ id: `email_${index}`, emailAddress: `client${index}@example.com` }],
  createdAt: index,
});

describe('scalable admin lists', () => {
  it('paginates through Clerk instead of silently stopping at 100 users', async () => {
    const all = Array.from({ length: 205 }, (_, index) => user(index));
    const offsets: number[] = [];
    const client: ClerkUserClient = {
      users: {
        async getUserList({ limit, offset }) {
          offsets.push(offset);
          return { data: all.slice(offset, offset + limit), totalCount: all.length };
        },
      },
    };

    await expect(loadAdminUsers(client)).resolves.toHaveLength(205);
    expect(offsets).toEqual([0, 100, 200]);
  });

  it('loads unresolved tickets directly for the overview', () => {
    const source = fs.readFileSync(new URL('../src/lib/admin.ts', import.meta.url), 'utf8');
    expect(source).toContain(".in('status', ['new', 'planned', 'in_progress'])");
  });
});
