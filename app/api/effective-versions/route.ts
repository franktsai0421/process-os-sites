import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {env} from 'cloudflare:workers';
import {decodeRecordValues} from '@/lib/state-records';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {versionControlKeys,effectiveVersionMetadata} from '@/lib/effective-version-metadata.mjs';
const keys=versionControlKeys;
// Read-only notification identifiers. No working body, receipt, personnel,
// media or private history is disclosed to a playback/status account.
export async function GET(request:Request){try{
 const state=await readState({keys:[...identityKeys]}),actor=await identity(request,state);
 if(!actor||!await can(request,state,'view:player')&&!await can(request,state,'view:productStatus')&&!await can(request,state,'view:editor')&&!await can(request,state,'view:data')&&!await can(request,state,'view:approval')&&!await can(request,state,'view:dispatch'))return Response.json({error:'FORBIDDEN'},{status:403,headers:responseHeaders});
 // Authorize before reading any control; authenticate and fence again after I/O.
 // Metadata is SHA-checked, while snapshots/history/media are never hydrated.
 const values=state.recordStorage?(await decodeRecordValues(env.STATE_ARCHIVE,state.recordStorage.envelope,{keys:[...keys],projectValue:effectiveVersionMetadata})).values:state.values;
 const effective=effectiveVersionIds(values),fresh=await readState({keys:[...identityKeys]}),after=await identity(request,fresh);
 if(!after||after.id!==actor.id||fresh.revision!==state.revision)return Response.json({error:'STATE_CHANGED'},{status:409,headers:responseHeaders});
 return Response.json({revision:state.revision,effective},{headers:responseHeaders});
 }catch{return Response.json({error:'EFFECTIVE_VERSION_LOAD_FAILED'},{status:503,headers:responseHeaders});}}
export function effectiveVersionIds(values:Record<string,string>){const ids:Record<string,string|null>={};
 for(const key of keys){if(!values[key])continue;const control=JSON.parse(values[key]);
  if(key==='masterDataControl')for(const scope of ['AB','C','PROCESS'])ids['master:'+scope]=control.versions?.find((v:{scope:string;status:string})=>v.scope===scope&&v.status==='approved')?.id||null;
  else if(key==='approvalVersions')for(const v of control.filter((v:{status:string})=>v.status==='approved'))ids['legacy:'+JSON.stringify([v.category,v.line])]=v.id;
  else if(key==='qualityMasterControl')for(const [scope,lib]of Object.entries(control.libraries||{}))ids['quality:'+scope]=(lib as {activeVersionId?:string}).activeVersionId||null;
  else if(key==='ipqcABMasterControl')for(const [scope,lib]of Object.entries(control.scopes||{}))ids['ipqc-ab:'+scope]=(lib as {activeVersionId?:string}).activeVersionId||null;
  else ids[key]=control.activeVersionId||null;
 }return ids;}
