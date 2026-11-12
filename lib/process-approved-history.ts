import {env} from 'cloudflare:workers';
import {approvedHistoryQuery} from './approved-history-query';
import {approvedVersion,approvedVersionEvidence,approvedVersions,legacyProcessEvidence,legacyProcessProjection,type LegacyProcessVersion} from './approved-history';
import {processAuthoringAdapter} from './process-authoring-workflow';
import {workflowAccess} from './versioned-shared-workflow';
import {readState,identity,can,responseHeaders,stateRevisionIsCurrent} from './process-state';
import {recordJSONResponse} from './state-records-response';
import {DraftConflict} from './shared-draft';
// Read-only union. Projection IDs are never written back as V3 versions/cases.
export async function processApprovedGET(request:Request){
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:responseHeaders});
 try{
  approvedHistoryQuery(request,'processAuthoringControl','process:platform');
  const q=new URL(request.url).searchParams,id=q.get('versionId'),authorityKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
  const preflight=await readState({keys:authorityKeys}),actor=await identity(request,preflight),access=await workflowAccess(request,preflight);
  const expected=request.headers.get('X-Process-Expected-Actor');if(!actor||!access.view||!access.history||expected&&expected!==actor.id)return reply({error:'FORBIDDEN'},403);
  const state=await readState({keys:[...authorityKeys,'processAuthoringControl','approvalVersions'],modelKey:'processAuthoringControl',deferHistory:true,deferDependencyHistory:true,versionId:id&&!id.startsWith('legacy-process:')?id:null}),owner=await identity(request,state),permissions=await workflowAccess(request,state);
  if(!owner||owner.id!==actor.id||owner.sessionType!==actor.sessionType||!permissions.view||!permissions.history)return reply({error:'FORBIDDEN'},403);
  const control=processAuthoringAdapter().parse(state.values.processAuthoringControl,state.recordStorage?.models.get('processAuthoringControl'));
  const legacy:LegacyProcessVersion[]=JSON.parse(state.values.approvalVersions||'[]');if(!Array.isArray(legacy))throw new DraftConflict('LEGACY_ARCHIVE_INVALID',503);
  const counts=new Map<string,number>();for(const row of legacy)if(row&&typeof row.id==='string')counts.set(row.id,(counts.get(row.id)||0)+1);
  const unique=legacy.filter(v=>v&&counts.get(v.id)===1&&legacyProcessEvidence(v,true));
  const modern=approvedVersions(control,true).filter(v=>approvedVersionEvidence(control,v,true)?.kind!=='formal-baseline').map(v=>({id:v.id,number:v.number,status:v.id===control.activeVersionId?'approved':'superseded',creatorName:v.creatorName,createdAt:v.createdAt,approvalEvidence:approvedVersionEvidence(control,v,true)}));
  const rows=[...modern,...unique.filter(v=>!control.versions.some(row=>row.id===v.id||row.id==='legacy-process:'+v.id)).map(v=>({id:'legacy-process:'+v.id,sourceVersionId:v.id,number:v.number,status:'superseded',creatorName:v.creatorName||'',createdAt:v.createdAt||'',category:v.category,line:v.line,approvalEvidence:legacyProcessEvidence(v,true)}))].reverse();
  let payload:unknown;
  if(q.has('uiHistory')){const before=q.get('versionBefore'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);payload={versions:{rows:rows.slice(start,start+20),next:rows.length>start+20?rows[start+19].id:null,total:rows.length}};}
  else{const row=rows.find(v=>v.id===id);if(!row)return reply({error:'VERSION_NOT_FOUND'},404);const version='sourceVersionId' in row?legacyProcessProjection(unique.find(v=>'legacy-process:'+v.id===id)!,true):approvedVersion(control,id!,true);if(!version)return reply({error:'VERSION_NOT_FOUND'},404);payload={version};}
  const body={approvedOnly:true,revision:state.revision,permissions:{...permissions,delete:permissions.edit&&await can(request,state,'editor.delete')},activeVersionId:control.activeVersionId,...payload as object};
  // Legacy stages are inline in their one retained aggregate. Modern case bodies
  // stay deferred; buffer only the selected immutable response before the fence.
  const rendered=state.recordStorage?recordJSONResponse(body,env.STATE_ARCHIVE,responseHeaders):reply(body),text=await rendered.text();
  const fresh=await readState({keys:authorityKeys}),freshActor=await identity(request,fresh),freshAccess=await workflowAccess(request,fresh);
  if(!freshActor||freshActor.id!==actor.id||freshActor.sessionType!==actor.sessionType||!freshAccess.view||!freshAccess.history)return reply({error:'FORBIDDEN'},403);
  if(fresh.revision!==state.revision||!await stateRevisionIsCurrent(fresh))return reply({error:'APPROVED_HISTORY_SUPERSEDED'},409);
  const finalActor=await identity(request,fresh);if(!finalActor||finalActor.id!==actor.id||finalActor.sessionType!==actor.sessionType)return reply({error:'FORBIDDEN'},403);
  return new Response(text,{headers:responseHeaders});
 }catch(error){return reply({error:error instanceof DraftConflict?error.code:'APPROVED_HISTORY_LOAD_FAILED'},error instanceof DraftConflict?error.status:503);}
}
