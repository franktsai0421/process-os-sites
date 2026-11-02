import {env} from 'cloudflare:workers';
import {readState,identity,responseHeaders} from '@/lib/process-state';
import {timingEnabled} from '@/lib/navigation-timing';
// Read-only configuration gate. No diagnostic history/credentials/data endpoint.
export async function GET(request:Request){
 try{
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);
  if(!actor||actor.sessionType==='demo'||actor.role!=='admin')return Response.json({error:'FORBIDDEN'},{status:403,headers:responseHeaders});
  const settings=env as typeof env & {PROCESS_NAVIGATION_TIMING?:string;PROCESS_NAVIGATION_TIMING_UNTIL?:string};
  return Response.json({enabled:timingEnabled(settings),until:timingEnabled(settings)?Date.parse(settings.PROCESS_NAVIGATION_TIMING_UNTIL!):null},{headers:responseHeaders});
 }catch{return Response.json({error:'UNAVAILABLE'},{status:503,headers:responseHeaders});}
}
