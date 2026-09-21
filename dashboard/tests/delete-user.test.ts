import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:vi.fn(),deleteUser:vi.fn(),result:{data:[] as unknown[],error:null as unknown},db:{from:vi.fn()}}));
vi.mock('@clerk/astro/server',()=>({clerkClient:()=>({users:{deleteUser:m.deleteUser}})}));
vi.mock('../src/lib/admin',()=>({checkAppAdmin:m.admin}));
vi.mock('../src/lib/database',()=>({createPlatformDatabase:()=>m.db}));
import {POST} from '../src/pages/api/admin/delete-user';
function ctx(user='user_owner',target='user_unused',origin='https://leonsites.org',confirmation=`DELETE ${target}`){return {url:new URL('https://leonsites.org/api/admin/delete-user'),locals:{auth:()=>({userId:user})},request:new Request('https://leonsites.org/api/admin/delete-user',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({user_id:target,confirmation})})} }
beforeEach(()=>{vi.clearAllMocks();m.result={data:[],error:null};m.admin.mockImplementation(async(_db,user)=>({isAdmin:user==='user_owner',error:null}));m.db.from.mockImplementation(()=>({select:()=>({eq:()=>({limit:async()=>m.result})})}));});
describe('permanent account deletion',()=>{
 it('deletes only the confirmed unlinked Clerk account',async()=>{expect((await POST(ctx() as never)).status).toBe(200);expect(m.deleteUser).toHaveBeenCalledExactlyOnceWith('user_unused');expect(m.db.from.mock.calls.map(x=>x[0])).toEqual(['workspace_members','site_provisioning_runs']);});
 it.each([['',401],['user_client',403]])('rejects unauthorized actor %s',async(actor,status)=>{expect((await POST(ctx(actor) as never)).status).toBe(status);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('rejects cross-origin requests',async()=>{expect((await POST(ctx('user_owner','user_unused','https://evil.test') as never)).status).toBe(403);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('requires exact target confirmation',async()=>{expect((await POST(ctx('user_owner','user_unused','https://leonsites.org','DELETE user_wrong') as never)).status).toBe(400);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('protects the current account',async()=>{expect((await POST(ctx('user_owner','user_owner') as never)).status).toBe(409);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('protects other admins',async()=>{m.admin.mockResolvedValue({isAdmin:true,error:null});expect((await POST(ctx() as never)).status).toBe(409);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('protects linked users',async()=>{m.result.data=[{clerk_user_id:'user_unused'}];expect((await POST(ctx() as never)).status).toBe(409);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('fails closed on a connection lookup error',async()=>{m.result.error={message:'unavailable'};expect((await POST(ctx() as never)).status).toBe(503);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('fails closed on an admin lookup error',async()=>{m.admin.mockResolvedValueOnce({isAdmin:true,error:null}).mockResolvedValueOnce({isAdmin:false,error:'unavailable'});expect((await POST(ctx() as never)).status).toBe(503);expect(m.deleteUser).not.toHaveBeenCalled();});
 it('does not claim success when Clerk fails',async()=>{m.deleteUser.mockRejectedValueOnce(new Error('provider error'));expect((await POST(ctx() as never)).status).toBe(502);});
 it.each([
   ['demo','vow-and-light-site',200],
   ['client','client-site',409],
   ['demo','ishotyouu-demo',409],
   ['missing','missing',409],
   ['error','error',503],
 ])('checks provisioning history classification %s/%s',async(kind,key,status)=>{
   m.db.from.mockImplementation(table=>({select:()=>({eq:()=>({limit:async()=>({data:table==='workspace_members'?[]:[{workspace_id:'ws_history'}],error:null})}),in:async()=>({data:kind==='missing'?[]:[{workspace_id:'ws_history',site_kind:kind,site_key:key}],error:kind==='error'?'unavailable':null})})}));
   expect((await POST(ctx() as never)).status).toBe(status);
   if(status===200)expect(m.deleteUser).toHaveBeenCalledExactlyOnceWith('user_unused');else expect(m.deleteUser).not.toHaveBeenCalled();
 });
 it('blocks mixed demo and unresolved client history',async()=>{
   m.db.from.mockImplementation(table=>({select:()=>({eq:()=>({limit:async()=>({data:table==='workspace_members'?[]:[{workspace_id:'demo'},{workspace_id:'client'}],error:null})}),in:async()=>({data:[{workspace_id:'demo',site_kind:'demo',site_key:'northline-demo'}],error:null})})}));
   expect((await POST(ctx() as never)).status).toBe(409);expect(m.deleteUser).not.toHaveBeenCalled();
 });
});
