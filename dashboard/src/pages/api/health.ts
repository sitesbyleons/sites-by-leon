import type { APIRoute } from 'astro';

import packageMetadata from '../../../package.json';

export const GET: APIRoute = () =>
  Response.json(
    {
      ok: true,
      service: 'sites-by-leon-dashboard',
      version: packageMetadata.version,
      release: process.env.RELEASE_SHA ?? 'development',
    },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
