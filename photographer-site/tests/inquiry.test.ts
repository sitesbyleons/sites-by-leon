import { describe, expect, it } from 'vitest';

import { validateInquiry } from '../src/lib/inquiry';

describe('portfolio inquiry validation', () => {
  it('accepts a normal inquiry with either email or phone', () => {
    const result = validateInquiry({
      workspaceSlug: 'northline',
      name: 'Jordan Lee',
      email: 'JORDAN@example.com',
      desiredDate: '2026-09-12',
      message: 'Please photograph our home football game.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.email).toBe('jordan@example.com');
  });

  it('rejects honeypots, missing contact details, and invalid dates', () => {
    expect(validateInquiry({ workspaceSlug: 'northline', name: 'Jordan', desiredDate: 'bad', message: 'A useful message', company: 'bot' }).ok).toBe(false);
    expect(validateInquiry({ workspaceSlug: 'northline', name: 'Jordan', desiredDate: 'bad', message: 'A useful message' }).ok).toBe(false);
  });
});
