import { describe, expect, it } from 'vitest';

import { decideAdminAccess, decideDashboardAccess } from '../src/lib/access';

describe('decideDashboardAccess', () => {
  it('redirects signed-out visitors to sign in', () => {
    expect(decideDashboardAccess({ userId: null, orgId: null })).toEqual({
      kind: 'redirect',
      location: '/sign-in?redirect_url=%2Fdashboard',
    });
  });

  it('allows a signed-in personal account without a Clerk organization', () => {
    expect(decideDashboardAccess({ userId: 'user_123', orgId: null })).toEqual({
      kind: 'account',
      userId: 'user_123',
      orgId: null,
    });
  });

  it('allows a signed-in organization member into their workspace', () => {
    expect(decideDashboardAccess({ userId: 'user_123', orgId: 'org_456' })).toEqual({
      kind: 'account',
      userId: 'user_123',
      orgId: 'org_456',
    });
  });
});

describe('decideAdminAccess', () => {
  it('sends signed-out visitors to the admin-aware sign-in return path', () => {
    expect(decideAdminAccess({ userId: null, isAdmin: false })).toEqual({
      kind: 'redirect',
      location: '/sign-in?redirect_url=%2Fadmin',
    });
  });

  it('keeps normal clients out of the studio admin area', () => {
    expect(decideAdminAccess({ userId: 'user_client', isAdmin: false })).toEqual({
      kind: 'forbidden',
      location: '/dashboard',
    });
  });

  it('allows Leon into the studio admin area', () => {
    expect(decideAdminAccess({ userId: 'user_leon', isAdmin: true })).toEqual({
      kind: 'admin',
      userId: 'user_leon',
    });
  });
});

