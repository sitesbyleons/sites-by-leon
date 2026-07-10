import { afterEach, describe, expect, it, vi } from 'vitest';

import { submitContact, validateContact } from '../src/lib/contact';

const valid = {
  name: 'Ari Lane',
  email: 'ari@example.com',
  focus: 'Weddings',
  message: 'I need a portfolio site that feels more editorial.',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateContact', () => {
  it('accepts a concise valid inquiry', () => {
    expect(validateContact(valid)).toMatchObject({ ok: true });
  });

  it('trims values and normalizes email', () => {
    const result = validateContact({ ...valid, name: '  Ari Lane  ', email: ' ARI@EXAMPLE.COM ' });
    expect(result).toMatchObject({ ok: true, payload: { name: 'Ari Lane', email: 'ari@example.com' } });
  });

  it('rejects malformed email and an empty message', () => {
    const result = validateContact({ ...valid, email: 'bad', message: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toMatchObject({ email: expect.any(String), message: expect.any(String) });
  });
});

describe('submitContact', () => {
  it('uses the honest configuration fallback when no endpoint exists', async () => {
    await expect(submitContact(valid)).resolves.toMatchObject({ ok: false, kind: 'configuration' });
  });

  it('reports success only after the server confirms it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(submitContact(valid, 'https://example.com/contact')).resolves.toEqual({ ok: true });
  });

  it('keeps a safe error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(submitContact(valid, 'https://example.com/contact')).resolves.toMatchObject({ ok: false, kind: 'network' });
  });
});
