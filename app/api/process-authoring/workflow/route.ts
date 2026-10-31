import {processAuthoringAdapter} from '@/lib/process-authoring-workflow';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {workflowAccess} from '@/lib/versioned-shared-workflow';
import {readState,identity,responseHeaders} from '@/lib/process-state';
import {DraftConflict} from '@/lib/shared-draft';
export async function GET(request:Request){
 const query=new URL(request.url).searchParams;
 if(query.has('contentIssues')){
  try{
   const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','processAuthoringControl','masterDataControl','bomOverrides','ipqcABMasterControl','ipqcCMasterControl'],modelKey:'processAuthoringControl',deferDependencyHistory:true,deferHistory:true,caseId:query.get('contentCaseId')}),actor=await identity(request,state),adapter=processAuthoringAdapter(),permissions=await adapter.access!(request,state,await workflowAccess(request,state));
   if(!actor||!permissions.view||query.has('contentCaseId')&&!permissions.history)return Response.json({error:'FORBIDDEN'},{status:403,headers:responseHeaders});
   const control=adapter.parse(state.values.processAuthoringControl,state.recordStorage?.models.get('processAuthoringControl')),flow=control.workflow!;
   const context=adapter.context(control,state,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]});
   // One decoded immutable body may back working, saved and an unfixed case.
   // Reuse only that request-local object's pure validation, never identity/ACL.
   const validated=new WeakMap<typeof flow.working,ReturnType<typeof context.validate>>();
   const inspect=(content:typeof flow.working|null,id:string|null)=>{if(!content)return{checked:false,id,issues:[]};const issues=validated.get(content)??context.validate(content);validated.set(content,issues);const unknown=issues.filter(i=>i.kind!=='warning'&&!context.advisoryCodes?.includes(i.message.split(':')[0]));if(unknown.length)throw new DraftConflict('VALIDATION_FAILED',422,{issues:unknown});return{checked:true,id,issues:issues.map(i=>({...i,kind:'missing'}))};};
   const review=flow.cases.find(c=>c.id===(query.get('contentCaseId')||flow.pendingId));
   return Response.json({generation:flow.generation,revision:flow.revision,working:inspect(flow.working,null),saved:inspect(flow.saved?.content||null,flow.saved?.id||null),review:review?(review.contentIssues?{checked:true,id:review.id,issues:review.contentIssues.issues,fixed:true}:inspect(review.content,review.id)):null,active:control.versions.find(v=>v.id===control.activeVersionId)?.contentIssues||null},{headers:responseHeaders});
  }catch(error){return Response.json({error:error instanceof DraftConflict?error.code:'CONTENT_ISSUES_LOAD_FAILED'},{status:error instanceof DraftConflict?error.status:503,headers:responseHeaders});}
 }
 if(!query.has('legacyHistory')&&!query.has('legacyVersionId'))return versionedWorkflowRoute(processAuthoringAdapter()).GET(request);
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:responseHeaders});
 try{
  const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAuthoringControl','approvalVersions'],deferHistory:true});
  const actor=await identity(request,state),adapter=processAuthoringAdapter(),permissions=await adapter.access!(request,state,await workflowAccess(request,state));
  if(!actor||!permissions.view||!permissions.history)return reply({error:'FORBIDDEN'},403);
  if(!state.values.processAuthoringControl)return reply({error:'AUTHORING_CONVERSION_REQUIRED'},409);
  // These exact legacy records are fenced after adoption, never reclassified as
  // successful V3 saves or new review cases. Do not expose the recovery envelope.
  const versions=JSON.parse(state.values.approvalVersions||'[]');if(!Array.isArray(versions))return reply({error:'LEGACY_ARCHIVE_INVALID'},503);
  if(query.has('legacyVersionId')){const version=versions.find(v=>v.id===query.get('legacyVersionId'));return version?reply({legacyVersion:version}):reply({error:'VERSION_NOT_FOUND'},404);}
  const rows=[...versions].reverse(),before=query.get('before'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);
  return reply({versions:rows.slice(start,start+20).map(v=>({id:v.id,number:v.number,status:v.status,category:v.category,line:v.line,creatorId:v.creatorId,creatorName:v.creatorName,createdAt:v.createdAt,updatedAt:v.updatedAt})),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});
 }catch{return reply({error:'LEGACY_ARCHIVE_LOAD_FAILED'},503);}
}
export const POST=(request:Request)=>versionedWorkflowRoute(processAuthoringAdapter(new URL(request.url).searchParams.get('channel')==='canvas-v2')).POST(request);
