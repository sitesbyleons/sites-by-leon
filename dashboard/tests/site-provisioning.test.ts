import { describe, expect, it } from 'vitest';

import {
  normalizeSiteDomain,
  normalizeSiteSlug,
  validateSiteProvisioningInput,
} from '../src/lib/site-provisioning';

const valid = {
  owner_user_id: 'user_customer_123',
  studio_name: 'Vow & Light',
  slug: 'vow-and-light',
  primary_domain: 'vow.leonsites.org',
  admin_domain: 'vow.leonsites.org',
  template_key: 'editorial',
  plan_key: 'signature',
  quota_gb: 20,
  github_repository: 'sitesbyleons/vow-and-light',
  idempotency_key: '7ed0f9c4-7262-4b44-a8c3-47f56b515f41',
};

describe('site provisioning validation', () => {
  it('normalizes a studio slug and pasted HTTPS domain', () => {
    expect(normalizeSiteSlug(' Vow & Light ')).toBe('vow-light');
    expect(normalizeSiteDomain('HTTPS://VOW.LEONSITES.ORG/')).toBe('vow.leonsites.org');
  });

  it('returns a bounded production input', () => {
    expect(validateSiteProvisioningInput(valid)).toEqual({
      ok: true,
      value: {
        ownerUserId: 'user_customer_123',
        studioName: 'Vow & Light',
        slug: 'vow-and-light',
        primaryDomain: 'vow.leonsites.org',
        adminDomain: 'vow.leonsites.org',
        templateKey: 'editorial',
        planKey: 'signature',
        quotaBytes: 20 * 1024 * 1024 * 1024,
        githubRepository: 'sitesbyleons/vow-and-light',
        idempotencyKey: '7ed0f9c4-7262-4b44-a8c3-47f56b515f41',
      },
    });
  });

  it('rejects custom admin domains, invalid choices, and unreasonable quotas', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      admin_domain: 'admin.customer.example',
      template_key: 'unknown',
      quota_gb: 10_000,
    });

    expect(result).toMatchObject({
      ok: false,
      errors: {
        admin_domain: expect.stringContaining('leonsites.org'),
        template_key: expect.any(String),
        quota_gb: expect.any(String),
      },
    });
  });
});
