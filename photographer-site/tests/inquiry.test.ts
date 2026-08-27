import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { canAcceptInquiry, validateInquiry } from '../src/lib/inquiry';

describe('portfolio inquiry validation', () => {
  it('accepts a normal inquiry with either email or phone', () => {
    const result = validateInquiry({
      name: 'Jordan Lee',
      email: 'JORDAN@example.com',
      desiredDate: '2026-09-12',
      message: 'Please photograph our home football game.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.email).toBe('jordan@example.com');
  });

  it('rejects honeypots, missing contact details, and invalid dates', () => {
    expect(validateInquiry({ name: 'Jordan', desiredDate: 'bad', message: 'A useful message', company: 'bot' }).ok).toBe(false);
    expect(validateInquiry({ name: 'Jordan', desiredDate: 'bad', message: 'A useful message' }).ok).toBe(false);
  });
});

describe('inquiry tenant isolation', () => {
  it('uses the request-resolved workspace rather than browser JSON or process configuration', () => {
    const route = fs.readFileSync(new URL('../src/pages/api/inquiry.ts', import.meta.url), 'utf8');
    expect(route).toContain('locals.siteContext.workspaceId');
    expect(route).not.toContain('SITE_WORKSPACE_SLUG');
    expect(route).not.toContain('validation.payload.workspaceSlug');
    expect(route).toContain('createRateLimitedInquiry');
  });

  it('accepts a lead workspace on an active site so first-customer inquiries can land', () => {
    expect(canAcceptInquiry('lead', 'active')).toBe(true);
    expect(canAcceptInquiry('active', 'active')).toBe(true);
    expect(canAcceptInquiry('approved', 'maintenance')).toBe(false);
    expect(canAcceptInquiry('active', 'maintenance')).toBe(false);
    expect(canAcceptInquiry('paused', 'paused')).toBe(false);
  });

  it('accepts ISHOTYOUU inquire payloads without a desired date', () => {
    const result = validateInquiry({
      instagram: '@180pf.shotit',
      email: 'client@example.com',
      message: 'Need coverage for a Friday night game.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.name).toBe('180pf.shotit');
      expect(result.payload.message).toContain('Instagram: @180pf.shotit');
      expect(result.payload.desiredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
