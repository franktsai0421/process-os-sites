import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {stageReferenceRecord} from '@/lib/master-stage-references';

export async function GET(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
 try{
  const query=new URL(request.url).searchParams,scope=query.get('scope')||'';
  if(!['AB','C'].includes(scope))return reply({error:'SCOPE_INVALID'},422);
  const selector={stage:query.get('stage')||'',source:query.get('source')||'',recordId:query.get('recordId')||'',kind:query.get('kind')||''};
  if(Object.values(selector).some(value=>!value||value.length>2000)||!['product-route','group-route','operation'].includes(selector.kind))return reply({error:'REFERENCE_INVALID'},422);
  const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
  const preflight=await readState({keys:authKeys});
  if(!await identity(request,preflight)||!await can(request,preflight,scope.toLowerCase()+'.view'))return reply({error:'FORBIDDEN'},403);
  // Re-read authority with the records. No browser-supplied module or body is trusted.
  const state=await readState({deferHistory:true,deferDependencyHistory:true});
  if(!await identity(request,state)||!await can(request,state,scope.toLowerCase()+'.view'))return reply({error:'FORBIDDEN'},403);
  const found=stageReferenceRecord(state.values,selector);
  if(!found)return reply({error:'REFERENCE_NO_LONGER_AVAILABLE'},404);
  const sourceModule=found.reference.module==='current'?scope.toLowerCase():found.reference.module;
  if(!['ab','c','editor'].includes(sourceModule)||!await can(request,state,sourceModule+'.view'))return reply({error:'FORBIDDEN'},403);
  const {record,context,reference}=found;
  // A focused read-only view; no private media payloads or unrelated fields.
  return reply({revision:state.revision,reference,record:{id:reference.recordId,code:record.code,number:record.number,name:record.name,nameVi:record.nameVi,
   line:record.line||context.line,category:record.category||context.category,workspaceId:context.id,
   stages:record.stages||record.defaultStages,productCodes:record.productCodes},
   moduleURL:sourceModule==='editor'?'/process/?system=process&view=editor':'/process/?system=process&view=data&dataTab='+sourceModule.toUpperCase()});
 }catch{return reply({error:'REFERENCE_LOAD_FAILED'},503);}
}
