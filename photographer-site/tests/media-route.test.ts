import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readMock } = vi.hoisted(() => ({ readMock: vi.fn() }));

vi.mock('../src/lib/media-storage', () => ({
  mediaStorage: () => ({ read: readMock }),
}));

import { GET, HEAD } from '../src/pages/api/media/[...path]';

const managedPath = 'workspace-1/galleries/photo.webp';

const context = (method = 'GET', path = managedPath, headers: HeadersInit = {}) => ({
  params: { path },
  request: new Request(`https://api.leonsites.org/media/${path}`, { method, headers }),
});

beforeEach(() => {
  readMock.mockReset();
});

describe('public managed media route', () => {
  it('rejects malformed and traversal paths without consulting storage', async () => {
    const response = await GET(context('GET', 'workspace-1/galleries/../private.webp') as never);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(readMock).not.toHaveBeenCalled();
  });

  it('streams images with bounded caching and cross-origin image access', async () => {
    readMock.mockResolvedValue({
      body: new TextEncoder().encode('image'),
      contentLength: 5,
      contentType: 'image/webp',
      etag: '"media-etag"',
      lastModified: new Date('2026-07-24T12:00:00Z'),
    });

    const response = await GET(context() as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('image');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('etag')).toBe('"media-etag"');
  });

  it('supports HEAD and conditional revalidation without returning a body', async () => {
    readMock.mockResolvedValue({
      body: new TextEncoder().encode('image'),
      contentLength: 5,
      contentType: 'image/webp',
      etag: '"media-etag"',
      lastModified: null,
    });

    const head = await HEAD(context('HEAD') as never);
    const notModified = await GET(context('GET', managedPath, { 'if-none-match': '"media-etag"' }) as never);

    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).toBe('5');
    expect(notModified.status).toBe(304);
    expect(notModified.headers.has('content-length')).toBe(false);
  });

  it('handles HTTP-date precision and multiple ETag validators', async () => {
    readMock.mockResolvedValueOnce({
      body: new TextEncoder().encode('image'),
      contentLength: 5,
      contentType: 'image/webp',
      etag: null,
      lastModified: new Date('2026-07-24T12:00:00.900Z'),
    }).mockResolvedValueOnce({
      body: new TextEncoder().encode('image'),
      contentLength: 5,
      contentType: 'image/webp',
      etag: '"media-etag"',
      lastModified: null,
    });

    const dateMatch = await GET(context('GET', managedPath, {
      'if-modified-since': 'Fri, 24 Jul 2026 12:00:00 GMT',
    }) as never);
    const etagMatch = await GET(context('GET', managedPath, {
      'if-none-match': '"other", \"media-etag\"',
    }) as never);

    expect(dateMatch.status).toBe(304);
    expect(etagMatch.status).toBe(304);
  });

  it('returns generic no-store responses for missing or unavailable media', async () => {
    readMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('provider secret detail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const missing = await GET(context() as never);
    const unavailable = await GET(context() as never);

    expect(missing.status).toBe(404);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain('provider secret detail');
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
    expect(errorSpy).toHaveBeenCalled();
  });
});
