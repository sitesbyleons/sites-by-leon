import { clerkClient } from '@clerk/astro/server';
import type { APIRoute } from 'astro';
import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';

export const POST: APIRoute = async (context) => {
  const reply=(message:string,status:number)=>Response.json({message},{status,headers:{'cache-control':'private, no-store'}});
  if(!isTrustedOrigin(context.request.headers.get('origin'),context.url.origin))return reply('This request could not be verified.',403);
  const actor=context.locals.auth().userId;
  if(!actor)return reply('Sign in again.',401);
  const database=createPlatformDatabase();
  const admin=await checkAppAdmin(database,actor);
  if(!database||admin.error||!admin.isAdmin)return reply('Admin access required.',403);
  if(!context.request.headers.get('content-type')?.startsWith('application/json'))return reply('JSON required.',415);
  // Bound the streamed body even when content-length is absent or incorrect.
  const reader=context.request.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  if(!reader)return reply('Invalid request.',400);
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>2048){await reader.cancel();return reply('Request too large.',413);}chunks.push(chunk.value);}}catch{return reply('Invalid request.',400);}
  let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply('Invalid request.',400);}
  const target=body?.user_id;
  if(typeof target!=='string'||!/^user_[A-Za-z0-9_-]{4,128}$/.test(target)||body.confirmation!==`DELETE ${target}`)return reply('Deletion confirmation did not match.',400);
  if(target===actor)return reply('You cannot delete your own account.',409);
  try{
    const targetAdmin=await checkAppAdmin(database,target);
    if(targetAdmin.error)return reply('Account protection could not be checked. Nothing was deleted.',503);
    if(targetAdmin.isAdmin)return reply('Admin accounts cannot be deleted here.',409);
    const membership=await database.from('workspace_members').select('workspace_id').eq('clerk_user_id',target).limit(1);
    if(membership.error)return reply('Client connections could not be checked. Nothing was deleted.',503);
    if(membership.data?.length)return reply('This user has active site access. Remove their client connection before deleting the account.',409);
    // Retain history, but demo-only history does not grant access or protect a login.
    const history=await database.from('site_provisioning_runs').select('workspace_id').eq('owner_clerk_user_id',target).limit(101);
    if(history.error||!history.data||history.data.length>100)return reply('Provisioning history could not be fully checked. Nothing was deleted.',503);
    if(history.data.length){
      const ids=[...new Set(history.data.map(row=>String(row.workspace_id)))];
      const sites=await database.from('site_connections').select('workspace_id,site_kind,site_key').in('workspace_id',ids);
      if(sites.error||!sites.data)return reply('Site history could not be checked. Nothing was deleted.',503);
      const verifiedDemos=new Set(sites.data.filter(site=>site.site_kind==='demo'&&site.site_key!=='ishotyouu-demo').map(site=>String(site.workspace_id)));
      if(ids.some(id=>!verifiedDemos.has(id)))return reply('This account has real-client or unresolved provisioning history. Review that client connection before deletion.',409);
    }
    await clerkClient(context).users.deleteUser(target);
    return reply('User account permanently deleted.',200);
  }catch{return reply('Deletion could not be confirmed. Refresh the user list before trying again.',502);}
};
