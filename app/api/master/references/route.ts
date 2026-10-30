import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {processMasterReferences,processMasterTargets} from '@/lib/process-master-references';
export async function GET(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
 try{
  const preflight=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']});
  if(!await identity(request,preflight)||!await can(request,preflight,'templates.view'))return reply({error:'FORBIDDEN'},403);
  const state=await readState({deferDependencyHistory:true,deferHistory:true});
  if(!await identity(request,state)||!await can(request,state,'templates.view'))return reply({error:'FORBIDDEN'},403);
  const q=new URL(request.url).searchParams,kind=q.get('kind'),id=q.get('id');
  if(!id||!['template','equipment'].includes(kind||'')||id.length>200)return reply({error:'INVALID_REFERENCE_TARGET'},422);
  const root=JSON.parse(state.values.masterDataControl||'{}');
  const snapshot=root.workflowScopes?.PROCESS?.working||root.active?.PROCESS||{};
  const targets=processMasterTargets(snapshot).filter(t=>t.kind===kind&&(t.id===id||kind==='template'&&Object.values(snapshot).flat().some((x)=>{const row=x as {id:string;catalogKey?:string;presetKey?:string};return row.id===t.id&&(row.catalogKey||row.presetKey||row.id)===id;})));
  if(!targets.length)return reply({error:'REFERENCE_TARGET_NOT_FOUND'},404);
  const result=processMasterReferences(state.values,targets),visible=await can(request,state,'editor.view');
  return reply({...result,revision:state.revision,references:visible?result.references:[],detailsRestricted:!visible&&result.total>0});
 }catch{return reply({error:'REFERENCE_CHECK_FAILED'},503);}
}
