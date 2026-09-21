import fs from 'node:fs';

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
  plan_key: 'studio',
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
        billingEmail: null,
        studioName: 'Vow & Light',
        slug: 'vow-and-light',
        primaryDomain: 'vow.leonsites.org',
        adminDomain: 'vow.leonsites.org',
        templateKey: 'editorial',
        planKey: 'studio',
        quotaBytes: 15 * 1024 * 1024 * 1024,
        githubRepository: 'sitesbyleons/vow-and-light',
        idempotencyKey: '7ed0f9c4-7262-4b44-a8c3-47f56b515f41',
      },
    });
  });

  it('rejects custom admin domains and retired plan choices', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      admin_domain: 'admin.customer.example',
      template_key: 'unknown',
      plan_key: 'signature',
    });

    expect(result).toMatchObject({
      ok: false,
      errors: {
        admin_domain: expect.stringContaining('leonsites.org'),
        template_key: expect.any(String),
        plan_key: expect.any(String),
      },
    });
  });

  it('derives storage from the selected plan instead of trusting submitted quota data', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      plan_key: 'essential',
      quota_gb: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        planKey: 'essential',
        quotaBytes: 15 * 1024 * 1024 * 1024,
      },
    });
  });

  it('accepts public preview administration domains for isolated test provisioning', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      primary_domain: 'vow-and-light-test.leonsites.org',
      admin_domain: 'vow-and-light-test.leonsites.org',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        primaryDomain: 'vow-and-light-test.leonsites.org',
        adminDomain: 'vow-and-light-test.leonsites.org',
      },
    });
  });

  it('accepts a billing email without a Clerk owner so Leon can invoice first', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      owner_user_id: '',
      billing_email: 'hello@studio.example',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        ownerUserId: null,
        billingEmail: 'hello@studio.example',
      },
    });
  });

  it('rejects a client with neither a Clerk user nor a billing email', () => {
    const result = validateSiteProvisioningInput({
      ...valid,
      owner_user_id: '',
      billing_email: '',
    });

    expect(result).toMatchObject({
      ok: false,
      errors: {
        billing_email: expect.any(String),
        owner_user_id: expect.any(String),
      },
    });
  });

  it('renders the success summary without interpreting customer text as markup', () => {
    const page = fs.readFileSync(new URL('../src/pages/admin/sites/new.astro', import.meta.url), 'utf8');

    expect(page).not.toContain('result.innerHTML');
    expect(page).toContain('summary.textContent');
    expect(page).toContain("button.textContent = 'Site created'");
    expect(page).toContain("form.dataset.domainSuffix ?? 'leonsites.org'");
    expect(page).toContain("form.dataset.domainJoiner ?? '.'");
  });
});
