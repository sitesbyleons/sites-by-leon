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
    for (const path of ['/admin', '/admin/galleries', '/admin/hosting', '/sign-in', '/sign-up', '/api/admin/upload', '/api/admin/hosting', '/api/connect', '/api/invoices/send']) {
      expect(requiresStudioAuth(path)).toBe(true);
    }
  });
});

describe('studio authorization', () => {
  it('sends signed-out visitors to sign in without exposing admin content', () => {
    expect(decideStudioAdminAccess({ authenticated: false, authorized: false }, '/admin/services')).toEqual({
      kind: 'redirect',
      location: '/sign-in?redirect_url=%2Fadmin%2Fservices',
    });
  });

  it('sends signed-in non-owners to an explicit waiting page', () => {
    expect(decideStudioAdminAccess({ authenticated: true, authorized: false }, '/admin/services')).toEqual({
      kind: 'forbidden',
      location: '/admin/access-denied',
    });
    const denied = fs.readFileSync(new URL('../src/pages/admin/access-denied.astro', import.meta.url), 'utf8');
    expect(denied).toContain('Your account is ready.');
    expect(denied).toContain('link this login as the site owner');
  });

  it('allows an authorized owner to open the editor', () => {
    expect(decideStudioAdminAccess({ authenticated: true, authorized: true }, '/admin/services')).toEqual({ kind: 'admin' });
  });

  it('authorizes workspace editors and Leon platform administrators', () => {
    const studio = fs.readFileSync(new URL('../src/lib/studio.ts', import.meta.url), 'utf8');
    expect(studio).toContain("userCanManageWorkspace(client, clerkUserId, workspace.data.id, { allowPlatformAdmin: true })");
  });

  it('lets a client create a Clerk account without becoming the site owner automatically', () => {
    const signUp = fs.readFileSync(new URL('../src/pages/sign-up/[...signup].astro', import.meta.url), 'utf8');
    const signIn = fs.readFileSync(new URL('../src/pages/sign-in/[...signin].astro', import.meta.url), 'utf8');
    expect(signUp).toContain('ClerkUI kind="sign-up"');
    expect(signUp).not.toContain('Astro.redirect');
    expect(signUp).not.toContain('workspace_members');
    expect(signIn).toContain('/sign-up?redirect_url=');
    expect(signIn).not.toContain('isIshotyouuSite');
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
