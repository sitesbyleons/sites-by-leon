import { clerkMiddleware } from '@clerk/astro/server';
import { defineMiddleware, sequence } from 'astro:middleware';

import { ManagedContentUnavailableError } from './lib/content/repository';
import { createStudioDatabase } from './lib/database';
import {
  resolveSiteContext,
  SiteContextCache,
  siteRedirectTarget,
  type SiteStatus,
} from './lib/site-context';
import { requiresStudioAuth } from './lib/studio-auth';

const withClerk = clerkMiddleware();
const EXEMPT_PATH_PREFIXES = ['/maintenance', '/paused', '/admin', '/sign-in', '/sign-up', '/api'];
const ASSET_PATH_PREFIXES = ['/_astro', '/images'];
const PUBLIC_ASSET_PATHS = new Set(['/favicon.svg', '/robots.txt']);
const siteContextCache = new SiteContextCache();

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isExemptPath = (pathname: string) =>
  PUBLIC_ASSET_PATHS.has(pathname) ||
  EXEMPT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix)) ||
  ASSET_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));

const getPreviewStatus = (): SiteStatus | null => {
  const permitsServerPreview = import.meta.env.DEV || process.env.NODE_ENV === 'test';
  return permitsServerPreview && process.env.NORTHLINE_PREVIEW_STATUS === 'paused' ? 'paused' : null;
};

const unavailableResponse = (message: string, status: number) => new Response(message, {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  },
});

const tenantResolution = defineMiddleware(async (context, next) => {
  if (matchesPathPrefix(context.url.pathname, '/api/media')) return next();
  const hostname = context.url.hostname.toLowerCase();
  const cached = siteContextCache.get(hostname);
  const resolution = cached
    ? { context: cached, error: null } as const
    : await resolveSiteContext(createStudioDatabase(), {
        hostname,
        requestOrigin: context.url.origin,
        nodeEnv: process.env.NODE_ENV,
        fallbackSiteKey: process.env.SITE_KEY,
        fallbackWorkspaceSlug: process.env.SITE_WORKSPACE_SLUG,
      });

  if (!resolution.context) {
    return resolution.error === 'unknown-host'
      ? unavailableResponse('Site not found.', 404)
      : unavailableResponse('Site temporarily unavailable. Please try again soon.', 503);
  }

  if (!cached) siteContextCache.set(hostname, resolution.context);
  context.locals.siteContext = resolution.context;
  const redirect = siteRedirectTarget(resolution.context, context.url.pathname, context.url.search);
  if (redirect) return context.redirect(redirect, 308);
  return next();
});

const publicControl = defineMiddleware(async (context, next) => {
  try {
    const { pathname } = context.url;
    const method = context.request.method;
    if ((method === 'GET' || method === 'HEAD') && !isExemptPath(pathname)) {
      const publicStatus = getPreviewStatus() ?? context.locals.siteContext.status;
      if (publicStatus === 'paused') return context.redirect('/paused', 302);
      if (publicStatus === 'maintenance') return context.redirect('/maintenance', 302);
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

export const onRequest = sequence(tenantResolution, publicControl, authentication);
