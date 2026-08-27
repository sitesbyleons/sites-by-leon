import type { SiteContext } from './site-context';

export const ISHOTYOUU_SITE_KEYS = new Set(['ishotyouu-demo']);
export const ISHOTYOUU_INSTAGRAM_URL = 'https://www.instagram.com/180pf.shotit/';
export const ISHOTYOUU_INSTAGRAM_HANDLE = '@180pf.shotit';

export const isIshotyouuSite = (context: Pick<SiteContext, 'siteKey' | 'hostname'>) =>
  ISHOTYOUU_SITE_KEYS.has(context.siteKey) || context.hostname.includes('ishotyouu');

export const ishotyouuNavHref = (pathname: string, href: string) => {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
};
