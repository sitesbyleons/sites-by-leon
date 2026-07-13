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
  it('keeps local dashboard paths and rejects external redirects', () => {
    expect(normalizeReturnPath('/dashboard?checkout=cancelled')).toBe('/dashboard?checkout=cancelled');
    expect(normalizeReturnPath('https://evil.example/steal')).toBe('/dashboard');
    expect(normalizeReturnPath('//evil.example/steal')).toBe('/dashboard');
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
