import { defineMiddleware } from 'astro:middleware';

import { decidePublicStatus, type PublicStatus } from './lib/control/status';

const EXEMPT_PATH_PREFIXES = ['/maintenance', '/studio', '/sign-in'];
const ASSET_PATH_PREFIXES = ['/_astro', '/images'];
const PUBLIC_ASSET_PATHS = new Set(['/favicon.svg', '/robots.txt']);

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isExemptPath = (pathname: string) =>
  pathname === '/api/health' ||
  PUBLIC_ASSET_PATHS.has(pathname) ||
  EXEMPT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix)) ||
  ASSET_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));

const getPreviewStatus = (): PublicStatus | null => {
  const permitsServerPreview = import.meta.env.DEV || process.env.NODE_ENV === 'test';

  return permitsServerPreview && process.env.NORTHLINE_PREVIEW_STATUS === 'paused' ? 'paused' : null;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method;

  if ((method !== 'GET' && method !== 'HEAD') || isExemptPath(pathname)) {
    return next();
  }

  const previewStatus = getPreviewStatus();
  const publicStatus = decidePublicStatus({
    configured: previewStatus !== null,
    remoteStatus: previewStatus,
    lastKnownStatus: null,
  });

  if (publicStatus !== 'active') {
    return context.redirect('/maintenance', 302);
  }

  return next();
});
