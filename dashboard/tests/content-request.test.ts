import { describe, expect, it } from 'vitest';

import { validateContentRequest } from '../src/lib/content-request';

describe('validateContentRequest', () => {
  it('trims a valid request', () => {
    expect(
      validateContentRequest({
        subject: '  Update wedding gallery  ',
        details: '  Replace the first six images with the new selections.  ',
      }),
    ).toEqual({
      ok: true,
      value: {
        subject: 'Update wedding gallery',
        details: 'Replace the first six images with the new selections.',
      },
    });
  });

  it('rejects requests that are too vague', () => {
    expect(validateContentRequest({ subject: 'Help', details: 'Change it' })).toEqual({
      ok: false,
      errors: {
        subject: 'Use at least 5 characters.',
        details: 'Add at least 20 characters so Leon knows what to change.',
      },
    });
  });
});
