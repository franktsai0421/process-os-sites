import {visibleStageReferences} from '@/lib/master-stage-reference-response';
import type {stageReferences} from '@/lib/master-stage-references';

import {restoreAllowed} from '@/lib/draft-restore-access';
import {masterWorkflowAdapter} from '@/lib/master-workflow';
import {versionedWorkflowRoute,workflowAccess} from '@/lib/versioned-shared-workflow';
import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {DraftConflict} from '@/lib/shared-draft';
import {masterCatalog,projectMasterCatalog,MasterCatalogLegacyFallback} from '@/lib/master-catalog';

const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
async function catalogPermissions(request:Request,state:Awaited<ReturnType<typeof readState>>){
 const permissions=await workflowAccess(request,state);
 return {...permissions,restore:permissions.edit&&await restoreAllowed(request,state),create:permissions.edit&&await can(request,state,'ab.create'),delete:permissions.edit&&await can(request,state,'ab.delete')};
}
function legacyCatalog(request:Request){
 // Preserve the established FQC generic read and its legacy failure coverage.
 // This fallback is not an optimized read or a new write/history capability.
 const url=new URL(request.url);url.searchParams.set('caseMetadata','1');
 return versionedWorkflowRoute(masterWorkflowAdapter('AB')).GET(new Request(url,request));
}
async function effectiveABCatalog(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
 try{
  if(new URL(request.url).searchParams.get('scope')!=='AB')throw new DraftConflict('SCOPE_INVALID',422);
  // Keep the generic master route's permission-only preflight, then fresh
  // selected-state authorization. The projection is not an authorization cache.
  const preflight=await readState({keys:authKeys}),actor=await identity(request,preflight),before=await catalogPermissions(request,preflight);
  if(!actor||!before.view)return reply({error:'FORBIDDEN'},403);
  if(!preflight.recordStorage)return legacyCatalog(request);
  const state=await readState({keys:[...authKeys,'masterDataControl'],
   projectValue:(key,raw)=>key==='masterDataControl'?projectMasterCatalog(key,raw):raw});
  const current=await identity(request,state),permissions=await catalogPermissions(request,state);
  if(!current||!permissions.view)return reply({error:'FORBIDDEN'},403);
  return reply({revision:state.revision,permissions,control:masterCatalog(state.values.masterDataControl)});
 }catch(error){if(error instanceof MasterCatalogLegacyFallback)return legacyCatalog(request);return reply({error:error instanceof DraftConflict?error.code:'WORKFLOW_LOAD_FAILED'},error instanceof DraftConflict?error.status:503);}
}
export const GET=(request:Request)=>new URL(request.url).searchParams.get('catalog')==='effective'
 ?effectiveABCatalog(request):versionedWorkflowRoute(masterWorkflowAdapter(new URL(request.url).searchParams.get('scope')||'')).GET(request);
export const POST=async(request:Request)=>{
 const scope=new URL(request.url).searchParams.get('scope')||'';
 const response=await versionedWorkflowRoute(masterWorkflowAdapter(scope)).POST(request);
 if(response.status!==409)return response;
 const body=await response.clone().json() as {error:string;details?:ReturnType<typeof stageReferences>;requestId?:string};
 if(body.error!=='STAGE_IN_USE')return response;
 const details=await visibleStageReferences(request,body.details,scope);
 return Response.json({...body,details},{status:response.status,headers:response.headers});
};
