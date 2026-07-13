import { describe, expect, it } from 'vitest';

import { validateStudioTicket } from '../src/lib/studio-support';

describe('studio support tickets', () => {
  it('accepts useful tickets and trims their text', () => {
    expect(validateStudioTicket({
      subject: '  Homepage image issue  ',
      details: '  The homepage image is cropped too tightly on my phone.  ',
    })).toEqual({
      ok: true,
      value: { subject: 'Homepage image issue', details: 'The homepage image is cropped too tightly on my phone.' },
    });
  });

  it('rejects vague or oversized tickets', () => {
    expect(validateStudioTicket({ subject: 'Help', details: 'Too short' }).ok).toBe(false);
    expect(validateStudioTicket({ subject: 'Valid subject', details: 'x'.repeat(2001) }).ok).toBe(false);
  });
});
