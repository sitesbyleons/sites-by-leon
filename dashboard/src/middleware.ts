import { defineMiddleware } from 'astro:middleware';
import { clerkMiddleware } from '@clerk/astro/server';

import { shouldBypassClerkForPreview } from './lib/request-security';

const withClerk = clerkMiddleware();

export const onRequest = defineMiddleware((context, next) => {
  if (
    shouldBypassClerkForPreview(
      import.meta.env.DEV,
      context.url.pathname,
      context.url.searchParams.get('preview'),
    )
  ) {
    return next();
  }

  return withClerk(context, next);
});
