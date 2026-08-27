import type { APIRoute } from 'astro';

import { siteRepository } from '../lib/content/repository';

type SitemapEntry = {
  path: string;
  lastModified?: string;
};

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const lastModifiedTag = (value?: string) => {
  if (!value) return '';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '' : `<lastmod>${new Date(timestamp).toISOString()}</lastmod>`;
};

export const GET: APIRoute = async ({ locals }) => {
  const { workspaceId, canonicalOrigin, siteKey } = locals.siteContext;
  const portfolio = await siteRepository.getPortfolio(workspaceId);
  const isIshotyouu = siteKey === 'ishotyouu-demo';
  const entries: SitemapEntry[] = [
    { path: '/' },
    { path: '/work' },
    ...portfolio.galleries.map((gallery) => ({
      path: `/work/${encodeURIComponent(gallery.slug)}`,
      lastModified: gallery.publishedAt,
    })),
    ...(isIshotyouu ? [] : [
      ...(portfolio.posts.length > 0 ? [{ path: '/journal' }] : []),
      ...portfolio.posts.map((post) => ({
        path: `/journal/${encodeURIComponent(post.slug)}`,
        lastModified: post.publishedAt,
      })),
      { path: '/packages' },
    ]),
    { path: isIshotyouu ? '/inquire' : '/contact' },
    ...(isIshotyouu ? [{ path: '/about' }] : []),
  ];
  const urls = entries.map((entry) => {
    const location = new URL(entry.path, `${canonicalOrigin}/`).toString();
    return `<url><loc>${escapeXml(location)}</loc>${lastModifiedTag(entry.lastModified)}</url>`;
  }).join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=300',
        'content-type': 'application/xml; charset=utf-8',
      },
    },
  );
};
