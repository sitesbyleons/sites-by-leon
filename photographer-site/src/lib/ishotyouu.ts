import type { SiteContext } from './site-context';

export const ISHOTYOUU_SITE_KEYS = new Set(['ishotyouu-demo']);
export const ISHOTYOUU_INSTAGRAM_URL = 'https://www.instagram.com/180pf.shotit/';
export const ISHOTYOUU_INSTAGRAM_HANDLE = '@180pf.shotit';
export const ISHOTYOUU_INTERNAL_PREFIX = '/i';

export const isIshotyouuSite = (context: Pick<SiteContext, 'siteKey' | 'hostname'>) =>
  ISHOTYOUU_SITE_KEYS.has(context.siteKey) || context.hostname.includes('ishotyouu');

export const isIshotyouuInternalPath = (pathname: string) =>
  pathname === ISHOTYOUU_INTERNAL_PREFIX || pathname.startsWith(`${ISHOTYOUU_INTERNAL_PREFIX}/`);

export const ishotyouuPublicPathname = (pathname: string) => {
  if (pathname === ISHOTYOUU_INTERNAL_PREFIX || pathname === `${ISHOTYOUU_INTERNAL_PREFIX}/`) return '/';
  return pathname.replace(/^\/i(?=\/|$)/, '') || '/';
};

export const isIshotyouuPublicPath = (pathname: string) =>
  pathname === '/'
  || pathname === '/work'
  || pathname === '/about' || pathname.startsWith('/about/')
  || pathname === '/inquire' || pathname.startsWith('/inquire/');

export const isIshotyouuWorkDetailPath = (pathname: string) => {
  const publicPath = ishotyouuPublicPathname(pathname);
  return publicPath.startsWith('/work/') && !/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(publicPath);
};

export const isIshotyouuHiddenPublicPath = (pathname: string) => {
  const publicPath = ishotyouuPublicPathname(pathname);
  return publicPath === '/journal' || publicPath.startsWith('/journal/')
    || publicPath === '/packages' || publicPath.startsWith('/packages/');
};

export const ishotyouuInternalPath = (pathname: string) =>
  pathname === '/' ? ISHOTYOUU_INTERNAL_PREFIX : `${ISHOTYOUU_INTERNAL_PREFIX}${pathname}`;

export const ishotyouuNavHref = (pathname: string, href: string) => {
  const publicPath = ishotyouuPublicPathname(pathname);
  if (href === '/') return publicPath === '/';
  return publicPath === href || publicPath.startsWith(`${href}/`);
};
