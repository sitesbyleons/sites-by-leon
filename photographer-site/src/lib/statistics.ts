import { createHmac, randomBytes } from 'node:crypto';
import type { SiteContext } from './site-context';

export const statisticsEnabled = (site: SiteContext) => Boolean(process.env.ANALYTICS_HASH_SECRET?.length && process.env.ANALYTICS_HASH_SECRET.length >= 32 && (process.env.ANALYTICS_ENABLED_SITE_KEYS ?? '').split(',').map(s=>s.trim()).includes(site.siteKey) && site.status === 'active');
export const daysFor = (value: string | null) => value === '7' ? 7 : value === '90' ? 90 : 30;
export function publicPage(path: string): string | null {
  if (/[?#%\\\u0000-\u001f]/.test(path)) return null;
  const value=path.replace(/^\/i(?=\/|$)/,'').replace(/\/$/,'') || '/';
  if (['/','/work','/about','/inquire','/contact','/packages','/journal'].includes(value)) return value;
  // Group detail pages: do not persist slugs, tokens, names or customer identifiers.
  if (/^\/work\/[a-z0-9-]+$/.test(value)) return '/work/detail';
  if (/^\/journal\/[a-z0-9-]+$/.test(value)) return '/journal/article';
  return null;
}
export function sourceFor(value: unknown, currentHost: string): string {
  if (typeof value !== 'string' || value.length > 255) return 'Direct / unknown';
  try {
    const host=new URL(value).hostname.toLowerCase();
    if (host === currentHost) return 'Direct / unknown';
    for (const [domain,name] of [['instagram.com','Instagram'],['google.com','Google'],['facebook.com','Facebook'],['bing.com','Bing'],['youtube.com','YouTube'],['tiktok.com','TikTok']]) if(host===domain||host.endsWith('.'+domain))return name!;
    return 'Other website';
  } catch { return 'Direct / unknown'; }
}
export const deviceFor = (ua: string) => /bot|crawler|spider|headless|preview/i.test(ua) ? null : /ipad|tablet/i.test(ua) ? 'Tablet' : /mobi|iphone|android/i.test(ua) ? 'Mobile' : ua ? 'Desktop' : 'Other';
export const countryFor = (value: string | null) => value && /^[A-Z]{2}$/.test(value) && !['T1','XX'].includes(value) ? value : 'ZZ';
export const protectedPreference = (headers: Headers) => headers.get('sec-gpc') === '1' || headers.get('dnt') === '1';
export function trafficHash(workspace: string,value: string,date=new Date()) {
  const secret=process.env.ANALYTICS_HASH_SECRET;
  if(!secret || secret.length<32)throw new Error('Analytics disabled');
  return createHmac('sha256',secret).update(`${workspace}:${date.toISOString().slice(0,10)}:${value}`).digest('hex');
}
export function validateTraffic(input: unknown) {
  if(!input || typeof input!=='object')return null;
  const data=input as Record<string,unknown>;
  if(data.kind!=='view' && data.kind!=='heartbeat')return null;
  if(data.consent!=='accepted' || typeof data.session!=='string' || typeof data.view!=='string' || !/^[a-f0-9]{32}$/.test(data.session) || !/^[a-f0-9]{32}$/.test(data.view) || typeof data.path!=='string')return null;
  const page=publicPage(data.path);
  return page ? {session:data.session,view:data.view,page,heartbeat:data.kind==='heartbeat',referrer:data.referrer} : null;
}
// Ephemeral abuse limiter: IP is never persisted or included in analytics. Per-process, bounded.
const limits=new Map<string,{count:number;until:number}>();
const rateSalt=randomBytes(32);
export function allowTraffic(workspace: string,ip: string,now=Date.now()) {
  const key=createHmac('sha256',rateSalt).update(workspace+':'+ip).digest('hex');
  const existing=limits.get(key);
  if(existing && existing.until>now)return ++existing.count<=180;
  if(limits.size>=10000){ for(const [k,v] of limits)if(v.until<=now)limits.delete(k);if(limits.size>=10000)return false; }
  limits.set(key,{count:1,until:now+60000});return true;
}
export type TrafficReport = {visits:number;views:number;live:number;daily:{day:string;visits:number;views:number}[];countries:{name:string;visits:number}[];devices:{name:string;visits:number}[];sources:{name:string;visits:number}[];pages:{name:string;visits:number}[]};
export function emptyTraffic(days: number, now=new Date()): TrafficReport {
  return {visits:0,views:0,live:0,daily:Array.from({length:days},(_,i)=>({day:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+i+1)).toISOString().slice(0,10),visits:0,views:0})),countries:[],devices:[],sources:[],pages:[]};
}
