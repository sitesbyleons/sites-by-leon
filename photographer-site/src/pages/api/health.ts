import type { APIRoute } from 'astro';

import packageMetadata from '../../../package.json';

export const GET: APIRoute = () =>
  Response.json(
    {
      ok: true,
      service: 'northline-public-site',
      version: packageMetadata.version,
    },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
