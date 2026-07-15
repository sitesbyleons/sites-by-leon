import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ locals }) => {
  const sitemap = new URL('/sitemap.xml', `${locals.siteContext.canonicalOrigin}/`);
  const body = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${sitemap.toString()}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=300',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
};
