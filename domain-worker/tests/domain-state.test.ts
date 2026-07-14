import { describe, expect, it } from 'vitest';

import { deriveAliasProviderState, isCloudflareHostnameActive } from '../src/domain-state.js';

describe('Cloudflare activation state', () => {
  it('is active only when both hostname and SSL statuses are active', () => {
    expect(isCloudflareHostnameActive({
      id: 'host-1',
      hostname: 'www.example.com',
      status: 'active',
      ssl: { status: 'active' },
    })).toBe(true);

    expect(isCloudflareHostnameActive({
      id: 'host-1',
      hostname: 'www.example.com',
      status: 'active',
      ssl: { status: 'pending_validation' },
    })).toBe(false);

    expect(isCloudflareHostnameActive({
      id: 'host-1',
      hostname: 'www.example.com',
      status: 'pending',
      ssl: { status: 'active' },
    })).toBe(false);
  });

  it('projects pending status and provider validation errors', () => {
    expect(deriveAliasProviderState({
      id: 'host-1',
      hostname: 'www.example.com',
      status: 'pending',
      verification_errors: ['CNAME does not point to the fallback origin'],
      ssl: {
        status: 'pending_validation',
        validation_errors: [{ message: 'CAA lookup failed' }],
      },
    })).toEqual({
      aliasStatus: 'dns_pending',
      cloudflareHostnameStatus: 'pending',
      cloudflareSslStatus: 'pending_validation',
      lastError: 'CNAME does not point to the fallback origin; CAA lookup failed',
    });
  });
});
