import { clerkMiddleware } from '@clerk/astro/server';
import { defineMiddleware, sequence } from 'astro:middleware';

import { decidePublicStatus, type PublicStatus } from './lib/control/status';
import { ManagedContentUnavailableError } from './lib/content/repository';
import { createStudioDatabase } from './lib/database';
import { requiresStudioAuth } from './lib/studio-auth';

const withClerk = clerkMiddleware();
const EXEMPT_PATH_PREFIXES = ['/maintenance', '/admin', '/sign-in', '/sign-up', '/api'];
const ASSET_PATH_PREFIXES = ['/_astro', '/images'];
const PUBLIC_ASSET_PATHS = new Set(['/favicon.svg', '/robots.txt']);
let cachedStatus: { value: PublicStatus; expiresAt: number } | null = null;

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isExemptPath = (pathname: string) =>
  PUBLIC_ASSET_PATHS.has(pathname) ||
  EXEMPT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix)) ||
  ASSET_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));

const getPreviewStatus = (): PublicStatus | null => {
  const permitsServerPreview = import.meta.env.DEV || process.env.NODE_ENV === 'test';
  return permitsServerPreview && process.env.NORTHLINE_PREVIEW_STATUS === 'paused' ? 'paused' : null;
};

async function getDatabaseStatus(): Promise<PublicStatus | null> {
  const siteKey = process.env.SITE_KEY;
  const database = createStudioDatabase();
  if (!database || !siteKey) return null;
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;
  const result = await database
    .from('site_connections')
    .select<{ status: string }>('status')
    .eq('site_key', siteKey)
    .maybeSingle();
  const status = ['active', 'paused', 'maintenance'].includes(result.data?.status ?? '')
    ? result.data?.status as PublicStatus
    : null;
  if (status) cachedStatus = { value: status, expiresAt: Date.now() + 30_000 };
  return status;
}

const publicControl = defineMiddleware(async (context, next) => {
  try {
    const { pathname } = context.url;
    const method = context.request.method;
    if ((method === 'GET' || method === 'HEAD') && !isExemptPath(pathname)) {
      const previewStatus = getPreviewStatus();
      const remoteStatus = previewStatus ?? await getDatabaseStatus();
      const publicStatus = decidePublicStatus({
        configured: previewStatus !== null || Boolean(process.env.DATABASE_URL),
        remoteStatus,
        lastKnownStatus: cachedStatus?.value ?? null,
      });
      if (publicStatus !== 'active') return context.redirect('/maintenance', 302);
    }
    return await next();
  } catch (error) {
    if (error instanceof ManagedContentUnavailableError) {
      return new Response('Site temporarily unavailable. Please try again soon.', {
        status: error.status,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    }
    throw error;
  }
});

const authentication = defineMiddleware((context, next) => {
  const isAdminPreview = import.meta.env.DEV && context.url.pathname.startsWith('/admin') && context.url.searchParams.get('preview') === 'true';
  if (isAdminPreview || !requiresStudioAuth(context.url.pathname)) return next();
  return withClerk(context, next);
});

export const onRequest = sequence(publicControl, authentication);
