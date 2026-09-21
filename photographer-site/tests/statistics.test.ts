import {afterEach,describe,it,expect,vi,beforeEach} from 'vitest';
import {publicPage,validateTraffic,trafficHash,protectedPreference,sourceFor,emptyTraffic,daysFor,statisticsEnabled,countryFor} from '../src/lib/statistics';
import {statisticsRepository} from '../../platform-core/src/statistics';
const mocks=vi.hoisted(()=>({record:vi.fn(),report:vi.fn(),live:vi.fn(),permission:vi.fn()}));
vi.mock('../src/lib/database',()=>({createStudioDatabase:()=>({statistics:{record:mocks.record,report:mocks.report,live:mocks.live}})}));
vi.mock('@leon/platform-core',()=>({userCanManageWorkspace:mocks.permission}));
import {POST} from '../src/pages/api/statistics/event';
import {GET} from '../src/pages/api/admin/statistics';
const site={workspaceId:'workspace-a',siteKey:'ishotyouu-demo',status:'active'};
const event={consent:'accepted',session:'a'.repeat(32),view:'b'.repeat(32),path:'/work',kind:'view'};
function context(body=event,headers:Record<string,string>={}){return {request:new Request('https://www.ishotyouu.net/api/statistics/event',{method:'POST',headers:{origin:'https://www.ishotyouu.net','content-type':'application/json','user-agent':'Mozilla/5.0','cf-connecting-ip':'192.0.2.1',...headers},body:JSON.stringify(body)}),url:new URL('https://www.ishotyouu.net/api/statistics/event'),locals:{siteContext:site}};}
beforeEach(()=>{vi.stubEnv('ANALYTICS_HASH_SECRET','test-only-secret'.repeat(4));vi.stubEnv('ANALYTICS_ENABLED_SITE_KEYS','ishotyouu-demo');vi.clearAllMocks();});
afterEach(()=>vi.unstubAllEnvs());
describe('privacy boundaries',()=>{
 it('excludes private, token and query paths and groups slugs',()=>{for(const p of ['/admin','/sign-in','/api/inquiries','/work?email=a','/work/%61','/work/a#secret'])expect(publicPage(p)).toBeNull();expect(publicPage('/work/client-name')).toBe('/work/detail');expect(publicPage('/i/about')).toBe('/about');});
 it('rejects non-consent and malformed events',()=>{expect(validateTraffic(event)).not.toBeNull();expect(validateTraffic({...event,consent:'declined'})).toBeNull();expect(validateTraffic({...event,kind:'other'})).toBeNull();expect(validateTraffic({...event,session:'x'})).toBeNull();});
 it('uses tenant-separated daily keyed identifiers',()=>{const now=new Date('2026-09-20');expect(trafficHash('a','id',now)).toHaveLength(64);expect(trafficHash('a','id',now)).not.toBe(trafficHash('b','id',now));expect(trafficHash('a','id',now)).not.toBe(trafficHash('a','id',new Date('2026-09-21')));});
 it('honors both privacy signals',()=>{expect(protectedPreference(new Headers({'sec-gpc':'1'}))).toBe(true);expect(protectedPreference(new Headers({dnt:'1'}))).toBe(true);});
 it('stores only coarse source categories',()=>{expect(sourceFor('https://www.instagram.com/person?private=1','site.test')).toBe('Instagram');expect(sourceFor('https://unknown.test/private','site.test')).toBe('Other website');expect(countryFor(null)).toBe('ZZ');});
 it('defaults off and isolates enabled tenants',()=>{expect(statisticsEnabled({...site,siteKey:'other'} as never)).toBe(false);vi.stubEnv('ANALYTICS_HASH_SECRET','');expect(statisticsEnabled(site as never)).toBe(false);});
 it('zero-fills UTC days and restricts periods',()=>{expect(emptyTraffic(7,new Date('2026-01-02')).daily[0].day).toBe('2025-12-27');expect(daysFor('9999')).toBe(30);});
});
describe('collection endpoint',()=>{
 it('does not persist declined, cross-origin, privacy-signal or bot requests',async()=>{for(const [body,headers,status] of [[{...event,consent:'declined'},{},400],[event,{origin:'https://evil.test'},403],[event,{'sec-gpc':'1'},204],[event,{'user-agent':'Googlebot'},204]] as const){expect((await POST(context(body,headers) as never)).status).toBe(status);}expect(mocks.record).not.toHaveBeenCalled();});
 it('persists only tenant-scoped minimized data',async()=>{expect((await POST(context() as never)).status).toBe(204);const row=mocks.record.mock.calls[0][0];expect(row.workspaceId).toBe('workspace-a');expect(row.session).toHaveLength(64);expect(row.page).toBe('/work');expect(JSON.stringify(row)).not.toContain('192.0.2.1');});
 it('rejects oversize payloads',async()=>{expect((await POST(context({...event,referrer:'a'.repeat(2100)} as typeof event) as never)).status).toBe(413);expect(mocks.record).not.toHaveBeenCalled();});
});
describe('private reports',()=>{
 const ctx=(userId:string|null)=>({locals:{auth:()=>({userId}),siteContext:site},url:new URL('https://ishotyouu.leonsites.org/api/admin/statistics?days=7')});
 it('rejects anonymous and other workspace members',async()=>{expect((await GET(ctx(null) as never)).status).toBe(401);mocks.permission.mockResolvedValue(false);expect((await GET(ctx('other') as never)).status).toBe(403);expect(mocks.report).not.toHaveBeenCalled();});
 it('scopes authorized reads and forbids caching',async()=>{mocks.permission.mockResolvedValue(true);mocks.report.mockResolvedValue(emptyTraffic(7));const res=await GET(ctx('owner') as never);expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');expect(mocks.report).toHaveBeenCalledWith('workspace-a',7);});
 it('parameterizes workspace and period',async()=>{const query=vi.fn().mockResolvedValue([{report:emptyTraffic(7)}]);await statisticsRepository(query).report('workspace-a',7);expect(query.mock.calls[0][1]).toEqual(['workspace-a',7]);await expect(statisticsRepository(query).report('workspace-a',999)).rejects.toThrow();});
 it('polls the tenant live count without rebuilding the historical report',async()=>{mocks.permission.mockResolvedValue(true);mocks.live.mockResolvedValue({live:2});const context=ctx('owner');context.url.searchParams.set('mode','live');const res=await GET(context as never);expect(await res.json()).toEqual({live:2});expect(res.headers.get('cache-control')).toBe('private, no-store');expect(mocks.live).toHaveBeenCalledWith('workspace-a');expect(mocks.report).not.toHaveBeenCalled();});
 it('rejects unauthorized live-count polling before querying',async()=>{mocks.permission.mockResolvedValue(false);for(const user of [null,'other']){const context=ctx(user);context.url.searchParams.set('mode','live');expect((await GET(context as never)).status).toBe(user?403:401);}expect(mocks.live).not.toHaveBeenCalled();});
});
