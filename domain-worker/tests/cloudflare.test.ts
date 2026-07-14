import { describe, expect, it, vi } from 'vitest';

import { CloudflareApiError, CloudflareClient, type CloudflareCustomHostname } from '../src/cloudflare.js';

function apiResponse<T>(result: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiError(status: number, code: number, message: string): Response {
  return new Response(JSON.stringify({
    success: false,
    result: null,
    errors: [{ code, message }],
    messages: [],
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(fetchMock: ReturnType<typeof vi.fn>): CloudflareClient {
  return new CloudflareClient({
    apiToken: 'secret-token',
    zoneId: 'zone/id',
    fetch: fetchMock as typeof fetch,
    baseUrl: 'https://api.cloudflare.test/client/v4',
  });
}

const existingHostname: CloudflareCustomHostname = {
  id: 'custom-host-1',
  hostname: 'www.example.com',
  status: 'pending',
  ssl: { status: 'pending_validation' },
};

describe('CloudflareClient', () => {
  it('returns an existing exact hostname without creating a duplicate', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(apiResponse([existingHostname]));
    const client = clientWith(fetchMock);

    await expect(client.ensureCustomHostname('WWW.Example.com')).resolves.toEqual(existingHostname);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const url = new URL(input);
    expect(url.pathname).toBe('/client/v4/zones/zone%2Fid/custom_hostnames');
    expect(url.searchParams.get('hostname[exact]')).toBe('www.example.com');
    expect(url.searchParams.get('per_page')).toBe('50');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('creates a missing hostname with HTTP domain validation', async () => {
    const created = { ...existingHostname, id: 'custom-host-2' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse([]))
      .mockResolvedValueOnce(apiResponse(created));
    const client = clientWith(fetchMock);

    await expect(client.ensureCustomHostname('www.example.com')).resolves.toEqual(created);

    const [input, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(new URL(input).pathname).toBe('/client/v4/zones/zone%2Fid/custom_hostnames');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      hostname: 'www.example.com',
      ssl: { method: 'http', type: 'dv' },
    });
  });

  it('recovers when a concurrent create wins the list-to-create race', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse([]))
      .mockResolvedValueOnce(apiError(409, 1409, 'custom hostname already exists'))
      .mockResolvedValueOnce(apiResponse([existingHostname]));
    const client = clientWith(fetchMock);

    await expect(client.ensureCustomHostname('www.example.com')).resolves.toEqual(existingHostname);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses the documented detail and delete endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse(existingHostname))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: existingHostname.id }), { status: 200 }));
    const client = clientWith(fetchMock);

    await expect(client.getCustomHostname(existingHostname.id)).resolves.toEqual(existingHostname);
    await expect(client.deleteCustomHostname(existingHostname.id)).resolves.toBe(true);

    const [getInput, getInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [deleteInput, deleteInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(new URL(getInput).pathname.endsWith(`/custom_hostnames/${existingHostname.id}`)).toBe(true);
    expect(getInit.method).toBeUndefined();
    expect(new URL(deleteInput).pathname.endsWith(`/custom_hostnames/${existingHostname.id}`)).toBe(true);
    expect(deleteInit.method).toBe('DELETE');
  });

  it('re-submits HTTP DCV configuration when refresh is not fully active', async () => {
    const activated = {
      ...existingHostname,
      status: 'active',
      ssl: { status: 'active' },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse(existingHostname))
      .mockResolvedValueOnce(apiResponse(activated));
    const client = clientWith(fetchMock);

    await expect(client.refreshCustomHostname(existingHostname.id)).resolves.toEqual(activated);

    const [patchInput, patchInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(new URL(patchInput).pathname.endsWith(`/custom_hostnames/${existingHostname.id}`)).toBe(true);
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(String(patchInit.body))).toEqual({
      ssl: { method: 'http', type: 'dv' },
    });
  });

  it('does not PATCH a refresh that is already fully active', async () => {
    const active = { ...existingHostname, status: 'active', ssl: { status: 'active' } };
    const fetchMock = vi.fn().mockResolvedValueOnce(apiResponse(active));
    const client = clientWith(fetchMock);

    await expect(client.refreshCustomHostname(existingHostname.id)).resolves.toEqual(active);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats deleting an absent hostname as idempotent success', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(apiError(404, 7003, 'not found'));
    const client = clientWith(fetchMock);
    await expect(client.deleteCustomHostname('missing-host')).resolves.toBe(false);
  });

  it('preserves API error details and retry classification', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(apiError(429, 1015, 'rate limited'));
    const client = clientWith(fetchMock);

    const error = await client.getCustomHostname('custom-host-1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CloudflareApiError);
    expect(error).toMatchObject({ status: 429, retryable: true });
    expect((error as Error).message).toContain('1015: rate limited');
  });
});
