import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HERMES_TEST_EMAIL,
  HERMES_TEST_WORKSPACE,
  isAuthorizedHermesIdentity,
  isHermesIdentityRouteEnabled,
} from '../src/lib/hermes-identity';

const authorizedIdentity = {
  deploymentEnvironment: 'staging',
  hostname: 'test.leonsites.org',
  email: HERMES_TEST_EMAIL,
  workspaceName: HERMES_TEST_WORKSPACE,
  role: 'owner',
};

describe('Hermes visible identity verification', () => {
  it('is enabled only on the isolated staging hostname', () => {
    expect(isHermesIdentityRouteEnabled(authorizedIdentity)).toBe(true);
    expect(isHermesIdentityRouteEnabled({ ...authorizedIdentity, deploymentEnvironment: 'production' })).toBe(false);
    expect(isHermesIdentityRouteEnabled({ ...authorizedIdentity, hostname: 'leonsites.org' })).toBe(false);
  });

  it('requires the exact synthetic account, tenant, and owner role', () => {
    expect(isAuthorizedHermesIdentity(authorizedIdentity)).toBe(true);
    expect(isAuthorizedHermesIdentity({ ...authorizedIdentity, email: 'someone@example.com' })).toBe(false);
    expect(isAuthorizedHermesIdentity({ ...authorizedIdentity, workspaceName: 'Another tenant' })).toBe(false);
    expect(isAuthorizedHermesIdentity({ ...authorizedIdentity, role: 'member' })).toBe(false);
  });

  it('keeps the endpoint authenticated, private, and fail-closed', () => {
    const route = fs.readFileSync(
      path.resolve(import.meta.dirname, '../src/pages/api/testing/identity.ts'),
      'utf8',
    );
    expect(route).toContain('context.locals.auth()');
    expect(route).toContain("'Cache-Control': 'no-store, private'");
    expect(route).toContain("status: 404");
    expect(route).toContain("status: 403");
    expect(route).not.toContain('cookies');
  });
});
