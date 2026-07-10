import { describe, expect, it } from 'vitest';

import { decideDashboardAccess } from '../src/lib/access';

describe('decideDashboardAccess', () => {
  it('redirects signed-out visitors to sign in', () => {
    expect(decideDashboardAccess({ userId: null, orgId: null })).toEqual({
      kind: 'redirect',
      location: '/sign-in?redirect_url=%2Fdashboard',
    });
  });

  it('asks signed-in visitors to select a client workspace', () => {
    expect(decideDashboardAccess({ userId: 'user_123', orgId: null })).toEqual({
      kind: 'select-organization',
      userId: 'user_123',
    });
  });

  it('allows a signed-in organization member into their workspace', () => {
    expect(decideDashboardAccess({ userId: 'user_123', orgId: 'org_456' })).toEqual({
      kind: 'workspace',
      userId: 'user_123',
      orgId: 'org_456',
    });
  });
});
