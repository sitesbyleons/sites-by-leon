import type { APIRoute } from 'astro';
import { isTrustedOrigin } from '@leon/platform-core/request-security';
import { createStudioDatabase } from '../../../lib/database';
import { allowTraffic,countryFor,deviceFor,protectedPreference,statisticsEnabled,trafficHash,validateTraffic } from '../../../lib/statistics';
export const prerender=false;
const reply=(status=204)=>new Response(null,{status,headers:{'cache-control':'no-store'}});
export const POST: APIRoute = async ({request,url,locals}) => {
  if(!isTrustedOrigin(request.headers.get('origin'),url.origin) || request.headers.get('sec-fetch-site')==='cross-site')return reply(403);
  if(!statisticsEnabled(locals.siteContext) || protectedPreference(request.headers))return reply();
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415);
  if(Number(request.headers.get('content-length')??0)>2048)return reply(413);
  const reader=request.body?.getReader();if(!reader)return reply(400);
  let bytes=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2048){await reader.cancel();return reply(413);}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();let input;try{input=validateTraffic(JSON.parse(text));}catch{return reply(400);}
  if(!input)return reply(400);
  const device=deviceFor(request.headers.get('user-agent')??'');if(!device)return reply();
  const workspace=locals.siteContext.workspaceId;
  if(!allowTraffic(workspace,request.headers.get('cf-connecting-ip')??'unknown'))return reply(429);
  const database=createStudioDatabase();if(!database)return reply(503);
  try {
    await database.statistics.record({workspaceId:workspace,session:trafficHash(workspace,input.session),view:trafficHash(workspace,input.view),page:input.page,country:countryFor(request.headers.get('cf-ipcountry')),device,source:sourceForSafe(input.referrer,url.hostname),heartbeat:input.heartbeat});
    return reply();
  }catch{return reply(503);}
};
import { sourceFor as sourceForSafe } from '../../../lib/statistics';
