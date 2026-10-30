import type {stageReferences} from './master-stage-references';
import {readState,identity,can} from './process-state';
const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
export async function visibleStageReferences(request:Request,impact:ReturnType<typeof stageReferences>|undefined,scope=''){
 // The mutation checks ALL references. Only presentation is permission-filtered,
 // using fresh authority so a revoked session cannot receive reference details.
 const references=[];
 try{
  const state=await readState({keys:authKeys});
  if(await identity(request,state)){
   const allowed=new Map<string,boolean>();
   for(const row of impact?.references||[]){
    const referenceModule=row.module==='current'?scope.toLowerCase():row.module;
    if(!['ab','c','editor'].includes(referenceModule))continue;
    if(!allowed.has(referenceModule))allowed.set(referenceModule,await can(request,state,referenceModule+'.view'));
    if(allowed.get(referenceModule))references.push({...row,resolveUrl:referenceModule==='editor'?'/process/?system=process&view=editor':'/process/?system=process&view=data&dataTab='+referenceModule.toUpperCase()});
   }
  }
 }catch{/* Keep the deletion denied; unavailable authorization hides all details. */}
 const details={total:impact?.total||0,references,truncated:impact?.truncated===true,hidden:(impact?.total||0)>references.length};
 return details;
}
