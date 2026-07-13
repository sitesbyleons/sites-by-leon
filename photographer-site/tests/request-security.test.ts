import { describe, expect, it } from 'vitest';

import { isTrustedOrigin, resolveTrustedOrigin } from '@leon/platform-core/request-security';

describe('proxy-aware request origin checks', () => {
  it('allows the HTTPS demo origin through the private HTTP proxy hop', () => {
    expect(isTrustedOrigin('https://demo.leonsites.org', 'http://demo.leonsites.org')).toBe(true);
    expect(resolveTrustedOrigin('https://demo.leonsites.org', 'http://demo.leonsites.org')).toBe('https://demo.leonsites.org');
  });

  it('rejects missing, insecure downgrade, and cross-site origins', () => {
    expect(isTrustedOrigin(null, 'http://demo.leonsites.org')).toBe(false);
    expect(isTrustedOrigin('http://demo.leonsites.org', 'https://demo.leonsites.org')).toBe(false);
    expect(isTrustedOrigin('https://evil.example', 'http://demo.leonsites.org')).toBe(false);
  });
});
