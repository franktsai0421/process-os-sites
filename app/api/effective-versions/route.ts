import {readState,identity,can,responseHeaders} from '@/lib/process-state';
const keys=['masterDataControl','processAuthoringControl','approvalVersions','qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl','bomMasterControl','toolingMasterControl'];
// Read-only notification identifiers. No working body, receipt, personnel,
// media or private history is disclosed to a playback/status account.
export async function GET(request:Request){try{
 const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides',...keys],deferHistory:true,deferDependencyHistory:true}),actor=await identity(request,state);
 if(!actor||!await can(request,state,'view:player')&&!await can(request,state,'view:productStatus')&&!await can(request,state,'view:editor')&&!await can(request,state,'view:data')&&!await can(request,state,'view:approval')&&!await can(request,state,'view:dispatch'))return Response.json({error:'FORBIDDEN'},{status:403,headers:responseHeaders});
 return Response.json({revision:state.revision,effective:effectiveVersionIds(state.values)},{headers:responseHeaders});
 }catch{return Response.json({error:'EFFECTIVE_VERSION_LOAD_FAILED'},{status:503,headers:responseHeaders});}}
export function effectiveVersionIds(values:Record<string,string>){const ids:Record<string,string|null>={};
 for(const key of keys){if(!values[key])continue;const control=JSON.parse(values[key]);
  if(key==='masterDataControl')for(const scope of ['AB','C','PROCESS'])ids['master:'+scope]=control.versions?.find((v:{scope:string;status:string})=>v.scope===scope&&v.status==='approved')?.id||null;
  else if(key==='approvalVersions')for(const v of control.filter((v:{status:string})=>v.status==='approved'))ids['legacy:'+JSON.stringify([v.category,v.line])]=v.id;
  else if(key==='qualityMasterControl')for(const [scope,lib]of Object.entries(control.libraries||{}))ids['quality:'+scope]=(lib as {activeVersionId?:string}).activeVersionId||null;
  else if(key==='ipqcABMasterControl')for(const [scope,lib]of Object.entries(control.scopes||{}))ids['ipqc-ab:'+scope]=(lib as {activeVersionId?:string}).activeVersionId||null;
  else ids[key]=control.activeVersionId||null;
 }return ids;}
