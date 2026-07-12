import { describe, expect, it } from 'vitest';

import { requiresStudioAuth } from '../src/lib/studio-auth';

describe('studio authentication boundaries', () => {
  it('leaves the public portfolio and public APIs independent from Clerk secrets', () => {
    for (const path of ['/', '/work', '/about', '/contact', '/api/health', '/api/inquiry', '/api/site-status', '/api/webhooks/stripe-connect']) {
      expect(requiresStudioAuth(path)).toBe(false);
    }
  });

  it('applies Clerk only to the studio owner routes', () => {
    for (const path of ['/admin', '/admin/galleries', '/sign-in', '/sign-up', '/api/admin/upload', '/api/connect', '/api/invoices/send']) {
      expect(requiresStudioAuth(path)).toBe(true);
    }
  });
});
