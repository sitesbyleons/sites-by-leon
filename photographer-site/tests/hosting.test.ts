import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hostingBillCopy, parseDomainOptions, domainChoiceCopy } from '../src/lib/hosting';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('studio hosting onboarding', () => {
  it('lets the photographer pick from Leon’s domain list and see the amount owed', () => {
    expect(parseDomainOptions('ishotyouu.com\nishotyouu.org')).toEqual(['ishotyouu.com', 'ishotyouu.org']);
    expect(hostingBillCopy({
      monthly_cents: 2000,
      domain_options: ['ishotyouu.com', 'ishotyouu.org'],
      chosen_domain: null,
      plan_key: null,
      subscription_status: null,
      current_period_end: null,
      checkout_url: null,
      checkout_expires_at: null,
    }).owe).toBe('$20.00 / month');
    expect(hostingBillCopy({
      monthly_cents: 2000,
      domain_options: ['ishotyouu.com'],
      chosen_domain: 'ishotyouu.com',
      plan_key: 'essential',
      subscription_status: 'active',
      current_period_end: '2026-09-27T00:00:00.000Z',
      checkout_url: null,
      checkout_expires_at: null,
    }).status).toBe('paid');

    const page = read('src/pages/admin/hosting.astro');
    expect(page).toContain('You owe');
    expect(page).toContain('Choose a domain');
    expect(page).toContain('studio-domain-card');
    expect(page).toContain('Use this domain');
    expect(page).toContain('/api/admin/hosting');
    expect(domainChoiceCopy('ishotyouu.com')).toEqual({
      host: 'ishotyouu.com',
      name: 'ishotyouu',
      tld: 'com',
      badge: '.com',
      hint: 'The usual web address',
    });
    const api = read('src/pages/api/admin/hosting.ts');
    expect(api).toContain("update({ chosen_domain: chosen })");
    expect(api).not.toContain('monthly_cents');
  });
});
