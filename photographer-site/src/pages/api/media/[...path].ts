import { isManagedUploadPath } from '@leon/platform-core/image-storage';
import type { APIRoute } from 'astro';

import { mediaStorage } from '../../../lib/media-storage';

export const prerender = false;

type MediaResult = Awaited<ReturnType<ReturnType<typeof mediaStorage>['read']>>;

const responseHeaders = (media: NonNullable<MediaResult>) => {
  const headers = new Headers({
    'cache-control': 'public, max-age=300, must-revalidate',
    'content-type': media.contentType,
    'cross-origin-resource-policy': 'cross-origin',
    'x-content-type-options': 'nosniff',
  });
  if (media.contentLength !== null) headers.set('content-length', String(media.contentLength));
  if (media.etag) headers.set('etag', media.etag);
  if (media.lastModified) headers.set('last-modified', media.lastModified.toUTCString());
  return headers;
};

const route: APIRoute = async ({ params, request }) => {
  const managedPath = params.path ?? '';
  const workspaceId = managedPath.split('/')[0] ?? '';
  if (!isManagedUploadPath(workspaceId, managedPath)) {
    return new Response('Not found.', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  try {
    const media = await mediaStorage().read(workspaceId, managedPath);
    if (!media) {
      return new Response('Not found.', {
        status: 404,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const headers = responseHeaders(media);
    const ifNoneMatch = request.headers.get('if-none-match');
    const ifModifiedSince = request.headers.get('if-modified-since');
    const etagMatches = Boolean(media.etag && ifNoneMatch
      && (ifNoneMatch === '*' || ifNoneMatch.split(',').some((value) => value.trim() === media.etag)));
    const modifiedSince = ifModifiedSince ? Date.parse(ifModifiedSince) : Number.NaN;
    const dateMatches = !media.etag && media.lastModified && Number.isFinite(modifiedSince)
      && Math.floor(modifiedSince / 1000) >= Math.floor(media.lastModified.getTime() / 1000);
    if (etagMatches
      || (!media.etag && media.lastModified && ifModifiedSince
        && dateMatches)) {
      headers.delete('content-length');
      return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === 'HEAD' ? null : media.body, { status: 200, headers });
  } catch (error) {
    console.error('Managed media read failed.', {
      workspaceId,
      storagePath: managedPath,
      error: error instanceof Error ? error.message : 'Unknown storage error.',
    });
    return new Response('Media temporarily unavailable.', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};

export const GET = route;
export const HEAD = route;
