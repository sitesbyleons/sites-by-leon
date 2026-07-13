import { describe, expect, it } from 'vitest';

import { normalizeStudioReturnPath, requiresStudioAuth } from '../src/lib/studio-auth';
import { decideStudioAdminAccess } from '../src/lib/studio';
import fs from 'node:fs';

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

  it('sanitizes Clerk return paths instead of accepting external redirects', () => {
    const signIn = fs.readFileSync(new URL('../src/pages/sign-in/[...signin].astro', import.meta.url), 'utf8');
    const signUp = fs.readFileSync(new URL('../src/pages/sign-up/[...signup].astro', import.meta.url), 'utf8');
    expect(signIn).toContain('normalizeStudioReturnPath');
    expect(signUp).toContain('normalizeStudioReturnPath');
    expect(normalizeStudioReturnPath('/admin')).toBe('/admin');
    expect(normalizeStudioReturnPath('/admin/galleries?view=draft')).toBe('/admin/galleries?view=draft');
    expect(normalizeStudioReturnPath('/dashboard')).toBe('/admin');
    expect(normalizeStudioReturnPath('//evil.example')).toBe('/admin');
    expect(normalizeStudioReturnPath('/\\evil.example')).toBe('/admin');
    expect(normalizeStudioReturnPath('/admin\\evil.example')).toBe('/admin');
  });
});
