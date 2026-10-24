import {env} from 'cloudflare:workers';
import hosting from '../../../../.openai/hosting.json';
import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {createStartupAssets,startupCase} from '@/lib/startup-assets.mjs';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:responseHeaders});
async function handle(request:Request){
 const url=new URL(request.url),settings=env as {PROCESS_IMPORT_ORIGIN?:string;PROCESS_IMPORT_OWNER_ID?:string;PROCESS_OWNER_BOOTSTRAP_ENABLED?:string;PROCESS_VERIFY_RECOVERY_ENABLED?:string;PROCESS_V19_RECOVERY_ENABLED?:string;PROCESS_C273_OBSERVATION_ENABLED?:string};
 if(hosting.project_id!==startupCase.projectId||settings.PROCESS_IMPORT_ORIGIN!==startupCase.origin||settings.PROCESS_IMPORT_OWNER_ID!==startupCase.ownerId||url.origin!==startupCase.origin)return reply({error:'STARTUP_CONFIGURATION'},409);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return reply({error:'STARTUP_CROSS_ORIGIN'},403);
 try{
  if([settings.PROCESS_OWNER_BOOTSTRAP_ENABLED,settings.PROCESS_VERIFY_RECOVERY_ENABLED,settings.PROCESS_V19_RECOVERY_ENABLED,settings.PROCESS_C273_OBSERVATION_ENABLED].includes('1'))return reply({error:'STARTUP_MODE_CONFLICT'},409);
  const authorize=async()=>{const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);return !!(actor?.id===startupCase.ownerId&&actor.role==='admin'&&actor.sessionType==='platform'&&await can(request,state,'master.export'));};
  if(!await authorize())return reply({error:'LOGIN_OR_OWNER_REQUIRED'},403);
  const writer=createStartupAssets({db:env.DB,bucket:env.STATE_ARCHIVE,authorize,signal:request.signal});
  if(request.method==='GET'&&url.search==='')return reply(await writer.status());
  if(request.method==='PUT'&&[...url.searchParams.keys()].join()==='file')return reply(await writer.put(url.searchParams.get('file'),request));
  if(request.method==='POST'&&url.search==='?action=publish'&&!request.body)return reply(await writer.publish());
  return reply({error:'STARTUP_INPUT'},400);
 }catch(e){const code=e instanceof Error&&/^STARTUP_[A-Z_]+$/.test(e.message)?e.message:'STARTUP_PROVIDER_UNKNOWN';return reply({error:code},code==='STARTUP_OWNER_REQUIRED'?403:409);}
}
export const GET=handle;export const PUT=handle;export const POST=handle;
