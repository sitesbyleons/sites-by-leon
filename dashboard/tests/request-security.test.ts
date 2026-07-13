import { describe, expect, it } from 'vitest';

import { isTrustedOrigin, normalizeReturnPath, resolveTrustedOrigin, shouldBypassClerkForPreview } from '../src/lib/request-security';

describe('isTrustedOrigin', () => {
  it('accepts only the request origin used by the dashboard', () => {
    expect(isTrustedOrigin('https://app.sites.by.leon', 'https://app.sites.by.leon')).toBe(true);
    expect(isTrustedOrigin('https://evil.example', 'https://app.sites.by.leon')).toBe(false);
    expect(isTrustedOrigin(null, 'https://app.sites.by.leon')).toBe(false);
  });

  it('accepts the public HTTPS origin when a private reverse proxy uses HTTP', () => {
    expect(isTrustedOrigin('https://leonsites.org', 'http://leonsites.org')).toBe(true);
    expect(resolveTrustedOrigin('https://leonsites.org', 'http://leonsites.org')).toBe('https://leonsites.org');
    expect(isTrustedOrigin('http://leonsites.org', 'https://leonsites.org')).toBe(false);
    expect(isTrustedOrigin('https://evil.example', 'http://leonsites.org')).toBe(false);
  });
});

describe('normalizeReturnPath', () => {
  it('keeps only dashboard and admin paths', () => {
    expect(normalizeReturnPath('/dashboard?checkout=cancelled')).toBe('/dashboard?checkout=cancelled');
    expect(normalizeReturnPath('/dashboard/billing')).toBe('/dashboard/billing');
    expect(normalizeReturnPath('/admin')).toBe('/admin');
    expect(normalizeReturnPath('/admin/tickets#open')).toBe('/admin/tickets#open');
    expect(normalizeReturnPath('/unrelated')).toBe('/dashboard');
  });

  it('rejects external, backslash, and control-character redirects', () => {
    expect(normalizeReturnPath('https://evil.example/steal')).toBe('/dashboard');
    expect(normalizeReturnPath('//evil.example/steal')).toBe('/dashboard');
    expect(normalizeReturnPath('/\\evil.example/steal')).toBe('/dashboard');
    expect(normalizeReturnPath('/admin\\evil.example')).toBe('/dashboard');
    expect(normalizeReturnPath('/admin\nLocation: https://evil.example')).toBe('/dashboard');
  });
});

describe('shouldBypassClerkForPreview', () => {
  it('allows an explicit visual preview only in local development and never for API routes', () => {
    expect(shouldBypassClerkForPreview(true, '/dashboard', 'true')).toBe(true);
    expect(shouldBypassClerkForPreview(false, '/dashboard', 'true')).toBe(false);
    expect(shouldBypassClerkForPreview(true, '/api/billing/portal', 'true')).toBe(false);
    expect(shouldBypassClerkForPreview(true, '/dashboard', null)).toBe(false);
  });
});
