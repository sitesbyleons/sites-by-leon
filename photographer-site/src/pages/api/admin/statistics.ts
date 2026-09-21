import type { APIRoute } from 'astro';
import { userCanManageWorkspace } from '@leon/platform-core';
import { createStudioDatabase } from '../../../lib/database';
import { daysFor } from '../../../lib/statistics';
export const GET: APIRoute = async ({locals,url}) => {
  const headers={'cache-control':'private, no-store','vary':'Cookie'};
  const database=createStudioDatabase();const auth=locals.auth();
  if(!auth.userId)return Response.json({error:'Sign in required'},{status:401,headers});
  if(!database)return Response.json({error:'Statistics unavailable'},{status:503,headers});
  if(!(await userCanManageWorkspace(database,auth.userId,locals.siteContext.workspaceId)))return Response.json({error:'Access denied'},{status:403,headers});
  try{return Response.json(url.searchParams.get('mode')==='live'?await database.statistics.live(locals.siteContext.workspaceId):await database.statistics.report(locals.siteContext.workspaceId,daysFor(url.searchParams.get('days'))),{headers});}
  catch{return Response.json({error:'Statistics unavailable'},{status:503,headers});}
};
