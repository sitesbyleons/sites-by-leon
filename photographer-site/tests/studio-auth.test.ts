import { describe, expect, it } from 'vitest';

import { requiresStudioAuth } from '../src/lib/studio-auth';
import { decideStudioAdminAccess } from '../src/lib/studio';

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

describe('studio owner authorization', () => {
  it('sends signed-out visitors to sign in without exposing admin content', () => {
    expect(decideStudioAdminAccess({ authenticated: false, authorized: false }, '/admin/services')).toEqual({
      kind: 'redirect',
      location: '/sign-in?redirect_url=%2Fadmin%2Fservices',
    });
  });

  it('sends signed-in non-owners to an explicit access denied page', () => {
    expect(decideStudioAdminAccess({ authenticated: true, authorized: false }, '/admin/services')).toEqual({
      kind: 'forbidden',
      location: '/admin/access-denied',
    });
  });

  it('allows an authorized owner to open the editor', () => {
    expect(decideStudioAdminAccess({ authenticated: true, authorized: true }, '/admin/services')).toEqual({ kind: 'admin' });
  });
});
