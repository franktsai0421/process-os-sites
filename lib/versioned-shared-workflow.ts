import {parseBeginIdentity,replayBegin,assertBeginBasis,recordBegin} from './workflow-begin';
import {assertFqcLocalSaveCommand} from './fqc-local-save';
import {iqcWriteTiming} from './iqc-write-timing';
import {fqcWriteFailureReason} from './fqc-write-failure';
import {fqcRequiredDependencyCommand,readFqcRequiredMutationState,captureFqcRequiredBasis,captureFqcRequiredResult,encodeFqcRequiredMutationState} from './fqc-required-dependencies';
import {iqcEditingRequested,iqcEditingPayload} from './iqc-editing-projection';
import {restoreAllowed,assertRestoreAccess} from './draft-restore-access';
import {fqcLifecycle8Command,readFqcLifecycle8MutationState,encodeFqcLifecycle8MutationState} from './fqc-lifecycle8-record-mutation';
import {processFlowCommand,readProcessFlowMutationState,encodeProcessFlowMutationState} from './process-flow-record-mutation';
import { env } from 'cloudflare:workers';
import { readState, identity, can, createMasterABPermissionPhase, createFqcPermissionPhase, sameOrigin, encodeValues, stateRevisionIsCurrent, responseHeaders, type State } from './process-state';
import { createSharedDraft, applyDraftCommand, DraftConflict, cloneDraft, type SharedDraft, type DraftCommand, type DraftContext, type DraftPermission } from './shared-draft';
import {compactWorkflowPayload,expandWorkflowCommand,workflowCommandFingerprint,isWorkflowDigestFingerprint} from './workflow-wire';
import {effectiveAccess} from './user-access';
import {recordJSONResponse} from './state-records-response';
import {moduleForURL,accessKeys} from '../public/process/access-policy.mjs';
import {fqcExistingSetCommand,readFqcMutationState,encodeFqcMutationState} from './fqc-record-mutation';
import {processSaveCommand,readProcessSaveMutationState,encodeProcessSaveMutationState} from './process-save-record-mutation';

export type NumericVersion<T>={id:string;number:number;status:string;snapshot:T;revision:number;baseVersionId?:string|null;
  contentIssues?:SharedDraft<T>['cases'][number]['contentIssues'];
  creatorId:string;creatorName:string;createdAt:string;updatedAt:string;submittedBy?:string;submittedAt?:string;reviewedBy?:string;reviewedAt?:string;reviewComment?:string;
  history:{action:string;actorId:string;actorName:string;at:string;comment?:string}[]};
export type VersionedControl<T>={activeVersionId:string|null;versions:NumericVersion<T>[];workflow?:SharedDraft<T>};
// Read-only, bounded presentation metadata. Never touch snapshot/content getters.
export function workflowInterfaceMetadata<T>(control:VersionedControl<T>,query:URLSearchParams){
  const page=<R extends {id:string}>(rows:R[],cursor:string|null)=>{const start=cursor?rows.findIndex(row=>row.id===cursor)+1:0;if(cursor&&!start)throw new DraftConflict('HISTORY_CURSOR_INVALID',409);return{rows:rows.slice(start,start+20),next:rows.length>start+20?rows[start+19].id:null,total:rows.length};};
    const saveMeta=(save:SharedDraft<T>['saves'][number])=>({id:save.id,actor:{id:save.actor.id,name:save.actor.name},at:save.at,revision:save.revision,reason:save.reason,source:save.source});
  const versions=page([...control.versions].reverse(),query.get('versionBefore')),saves=page([...(control.workflow?.saves||[])].reverse(),query.get('saveBefore'));
  const selectedId=query.get('uiVersionId'),selected=control.versions.find(v=>v.id===selectedId),review=control.workflow?.cases.find(c=>c.id===selectedId);
  const selectedSave=selected?.status==='draft'?control.workflow?.saved:control.workflow?.saves.find(s=>s.id===review?.savedId);
  return{versions:{...versions,rows:versions.rows.map(v=>({id:v.id,number:v.number,status:v.status,creatorName:v.creatorName,createdAt:v.createdAt,caseId:control.workflow?.cases.some(c=>c.id===v.id)?v.id:null}))},saves:{...saves,rows:saves.rows.map(saveMeta)},selectedSave:selectedSave?saveMeta(selectedSave):null};
}
export type ModuleDraftCommand=DraftCommand & {moduleAction?:string;input?:Record<string,unknown>};
// Read scheduling only: this never grants a partial writer or selects fewer keys.
// Unknown fields and mixed outer envelopes retain their original fault observations.
const fqcMatrixReadAheadFields=new Set(['action','operationId','clientId','sequence','generation','moduleAction','input']);
function fqcAggregateReadAheadCommand(command:ModuleDraftCommand|undefined){
 const input=command?.input;
 if(command?.action==='apply'&&command.moduleAction==='replace-matrix-v1'&&input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>key==='items'||key==='products')&&Array.isArray(input.items)&&Array.isArray(input.products)&&Object.keys(command).every(key=>fqcMatrixReadAheadFields.has(key))){
  return fqcRequiredDependencyCommand({action:'apply',operationId:command.operationId,clientId:command.clientId,sequence:command.sequence,generation:command.generation,patches:[],input:command.input});
 }
 return fqcRequiredDependencyCommand(command);
}
export type WorkflowAdapter<T,C extends VersionedControl<T>>={
  key:string;scope:string;parse:(raw:string|undefined,prepared?:unknown)=>C;empty:()=>T;preparedModel?:boolean;
  // Opt in only when access reads identity/role state, never domain content.
  permissionOnlyRead?:boolean;
  // Server-only opt-in; the mutation helper further checks storage and command.
  recordMutation?:'fqc-existing-set'|'process-save';
  processFlowMutation?:boolean;
  fqcLifecycle8Mutation?:true;
  needsFullHistory?:(command:ModuleDraftCommand|undefined)=>boolean;
  // Destructive catalog commands must inspect retained cross-module history.
  needsReferenceHistory?:(command:ModuleDraftCommand|undefined)=>boolean;
  context:(control:C,state:State,base:Omit<DraftContext<T>,'structure'|'validate'|'semantic'|'activeId'>)=>DraftContext<T>;
  apply:(control:C,command:ModuleDraftCommand,context:DraftContext<T>)=>ReturnType<typeof applyDraftCommand<T>>|Promise<ReturnType<typeof applyDraftCommand<T>>>;
  photoIds:(content:T)=>string[];photoPrefix:string;
  // Read-only content advisories, using the module's submission checks.
  draftMissing?:(content:T)=>ReturnType<DraftContext<T>['validate']>;
  serialize?:(control:C)=>string;
  serializeModel?:(control:C)=>unknown;
  // Additional projections participate in the same shared-state CAS, never a second write.
  projectValues?:(control:C)=>Record<string,string>;
  requiresDelete?:(control:C,command:Pick<ModuleDraftCommand,'action'|'patches'|'moduleAction'|'input'>)=>boolean;
  // Authoring historically permits operation removal with editor/submit access;
  // catalog adapters retain the separate master-delete permission.
  deletePermission?:'master.delete'|'approval.submit';
  access?:(request:Request,state:State,permissions:Record<DraftPermission,boolean>)=>Promise<Record<DraftPermission,boolean>>;
  beforeBegin?:(control:C,state:State)=>void;
  beforeCommand?:(control:C,command:ModuleDraftCommand,state:State)=>void;
};
export const openedVersion=<T>(control:VersionedControl<T>)=>control.versions.find(v=>['draft','pending','pending-test'].includes(v.status));
export const effectiveVersion=<T>(control:VersionedControl<T>)=>control.versions.find(v=>v.id===control.activeVersionId);
export function sharedCaseMetadata<T>(review:SharedDraft<T>['cases'][number]){
 // Immutable-record bodies may be lazy getters: omit their keys before reading
 // values, rather than destructuring and hydrating bodies that are discarded.
 const source=review as typeof review&{linkedProcess?:{scope:string;baseVersionId:string;added:string[];removed:string[];before:unknown;content:unknown}};
 const metadata=Object.fromEntries(Object.keys(source).filter(key=>key!=='content'&&key!=='before').map(key=>[key,(source as unknown as Record<string,unknown>)[key]]));
 if(source.linkedProcess){const linked=source.linkedProcess;metadata.linkedProcess=Object.fromEntries(Object.keys(linked).filter(key=>key!=='content'&&key!=='before').map(key=>[key,(linked as unknown as Record<string,unknown>)[key]]));}
 return metadata;
}
export function workflowReviewMetadata<T>(control:VersionedControl<T>,history:boolean){
 const flow=control.workflow,open=openedVersion(control);
 return{activeVersionId:control.activeVersionId,versions:control.versions.filter(v=>history||v.id===control.activeVersionId||v.id===open?.id).map(v=>({id:v.id,number:v.number,status:v.status})),
  workflow:flow?{generation:flow.generation,revision:flow.revision,pendingId:flow.pendingId}:null,
  cases:(flow?(history?flow.cases:flow.cases.filter(c=>c.id===flow.pendingId)):[]).map(sharedCaseMetadata)};
}
export function projectSharedVersion<T>(control:VersionedControl<T>,actor:{id:string;name:string},at:string,closed=false){
  const flow=control.workflow!;
  for(const v of control.versions)if(v.status==='draft')v.status='superseded';
  for(const c of flow.cases){
    let version=control.versions.find(v=>v.id===c.id);
    if(!version){version={id:c.id,number:Math.max(0,...control.versions.map(v=>v.number))+1,status:c.status,snapshot:cloneDraft(c.content),revision:1,
      baseVersionId:c.baseId,creatorId:c.actor.id,creatorName:c.actor.name,createdAt:c.at,updatedAt:c.at,submittedBy:c.actor.name,submittedAt:c.at,
      history:[{action:'submit',actorId:c.actor.id,actorName:c.actor.name,at:c.at,comment:c.reason}]};control.versions.push(version);}
    version.status=c.status==='approved'&&c.id!==flow.active.id?'superseded':c.status;
    if(c.contentIssues)version.contentIssues=cloneDraft(c.contentIssues);
    if(c.result&&!version.reviewedAt){version.reviewedAt=c.result.at;version.reviewedBy=c.result.actor.name;version.reviewComment=c.result.reason;
      version.history.push({action:c.status,actorId:c.result.actor.id,actorName:c.result.actor.name,at:c.result.at,comment:c.result.reason+(c.result.contentIssuesConfirmed?' [content issues acknowledged]':'')+(c.result.selfReview?' [self-review]':'')});}
  }
  if(flow.active.id!==control.activeVersionId){const old=effectiveVersion(control);if(old)old.status='superseded';control.activeVersionId=flow.active.id;}
  if(!flow.pendingId&&!closed){const id='shared-'+flow.generation;let draft=control.versions.find(v=>v.id===id);
    if(!draft){draft={id,number:Math.max(0,...control.versions.map(v=>v.number))+1,status:'draft',snapshot:flow.working,revision:flow.revision,baseVersionId:flow.baseId,
      creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]};control.versions.push(draft);}
    // The kernel copy-on-writes the next working aggregate. The current draft
    // projection can share this request-local object without another deep copy.
    draft.status='draft';draft.snapshot=flow.working;draft.revision=flow.revision;draft.updatedAt=at;
  }
}
export function visibleSharedControl<T,C extends VersionedControl<T>>(control:C,history:boolean,caseMetadata=false,draftMissing?:WorkflowAdapter<T,C>['draftMissing']){
  if(!control.workflow)return control;
  const open=openedVersion(control),flow=control.workflow;
  return {...control,...(draftMissing&&open?.status==='draft'?{draftContentIssues:{source:'working',generation:flow.generation,revision:flow.revision,issues:draftMissing(flow.working)}}:{}),versions:history&&!caseMetadata?control.versions:control.versions.filter(v=>v.id===control.activeVersionId||v.id===open?.id),
    workflow:{...flow,saves:[],receipts:{},sequences:{},cases:(history?flow.cases:flow.cases.filter(c=>c.id===flow.pendingId)).map(c=>caseMetadata?sharedCaseMetadata(c):c)}};
}
export async function workflowAccess(request:Request,state:State,check=(key:string):boolean|Promise<boolean>=>can(request,state,key)){
  const workflowModule=moduleForURL(request.url);
  if(workflowModule&&accessKeys.includes(workflowModule+'.edit')){
    const allowed=async(op:string)=>await check(workflowModule+'.'+op);
    const view=await allowed('view');return {view,edit:view&&await allowed('edit'),save:view&&await allowed('save'),submit:view&&await allowed('submit'),withdraw:view&&await allowed('withdraw'),approve:view&&await allowed('approve'),return:view&&await allowed('return'),history:view};
  }
  const data=await check('view:data'),review=await check('view:approval'),edit=data;
  return {view:data||review,edit,save:edit,submit:edit,withdraw:data||review&&await check('approval.withdraw'),
    approve:review&&await check('approval.approve'),return:review&&await check('approval.reject'),history:(data||review)&&await check('approval.compare')};
}
// Advisory only. Submission never requires another enabled reviewer; admin may
// self-review with the existing confirmation/audit gates.
export function otherReviewerAvailable(state:State,actorId:string){
 const users=JSON.parse(state.values.platformUsers||'[]') as Parameters<typeof effectiveAccess>[0][];
 return users.some(user=>{if(user.id===actorId)return false;const access=effectiveAccess(user,state.values);return access.enabled&&access.views.includes('approval')&&(access.permissions.includes('approval.approve')||access.permissions.includes('approval.reject'));});
}
async function commandBody(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new DraftConflict('BODY_REQUIRED',422);
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>2_000_000){await reader.cancel();throw new DraftConflict('COMMAND_TOO_LARGE',413);}chunks.push(chunk.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=new TextDecoder().decode(bytes);
  if(raw.includes('__immutableBody')||raw.includes('__liveContent'))throw new DraftConflict('RESERVED_STORAGE_REFERENCE',422);
  const body=JSON.parse(raw) as {action?:'begin'|'begin-v1';begin?:unknown;command?:ModuleDraftCommand};
  parseBeginIdentity(body);
  if(body.command)body.command=expandWorkflowCommand(body.command) as ModuleDraftCommand;
  return body;
}
export function versionedWorkflowRoute<T,C extends VersionedControl<T>>(adapter:WorkflowAdapter<T,C>){
  const phaseFor=(request:Request,state:State)=>adapter.key==='masterDataControl'&&adapter.scope==='master:AB'&&new URL(request.url).pathname==='/api/master/workflow'&&new URL(request.url).searchParams.get('scope')==='AB'?createMasterABPermissionPhase(request,state):adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!new URL(request.url).searchParams.has('scope')?createFqcPermissionPhase(request,state):null;
  async function currentPermissions(request:Request,state:State,phase?:Awaited<ReturnType<typeof createMasterABPermissionPhase>>|null){
    const check=phase?phase.allowed:(key:string)=>can(request,state,key);
    const defaults=await workflowAccess(request,state,check),permissions=adapter.access?await adapter.access(request,state,defaults):defaults;
    if(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'||adapter.key==='bomMasterControl'&&adapter.scope==='bom'){defaults.save=defaults.save||defaults.edit;permissions.save=permissions.save||permissions.edit;}
    // Expose the same adapter-specific delete gate used by POST. This is UI
    // metadata, not a new command or permission; authoring still uses submit.
    const workflowModule=moduleForURL(request.url),limited=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,value&&permissions[key as DraftPermission]])) as typeof defaults;
    if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc')limited.save=limited.save||limited.edit;
    return {...permissions,...limited,restore:limited.edit&&await restoreAllowed(request,state,check),create:limited.edit&&!!workflowModule&&await check(workflowModule+'.create'),delete:limited.edit&&await check(workflowModule&&accessKeys.includes(workflowModule+'.delete')?workflowModule+'.delete':adapter.deletePermission||'master.delete')};
  }
  return {
    async GET(request:Request){const reply=(body:unknown,status=200)=>Response.json(iqcEditingPayload(compactWorkflowPayload(body,new URL(request.url).searchParams.get('compact')==='1'),iqcEditingRequested(request,adapter.key,adapter.scope)),{status,headers:responseHeaders});try{
      const selectors=new URL(request.url).searchParams;
      const fqcReadAhead=adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!selectors.has('scope');
      let preflight:State|undefined;
      if(adapter.permissionOnlyRead){
        preflight=await readState({aggregateReadAhead:fqcReadAhead,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']});
        const phase=await phaseFor(request,preflight),actor=phase?phase.actor:await identity(request,preflight),permissions=await currentPermissions(request,preflight,phase);
        if(!actor||!permissions.view||phase&&!await phase.current())return reply({error:'FORBIDDEN'},403);
        if(selectors.has('permissions'))return reply({permissions,revision:preflight.revision,otherReviewerAvailable:otherReviewerAvailable(preflight,actor.id)});
        if(selectors.get('since')===`state:${preflight.revision}`)return reply({revision:preflight.revision,permissions,unchanged:true});
      }
      // Changed revisions and history reads retain the original domain
      // hydration and validation. Restore previews keep full dependencies.
      // Recheck identity on the newly selected snapshot.
      // Legacy formats already read the entire snapshot; avoid reading it twice.
      const selectedKeys=adapter.permissionOnlyRead&&!selectors.has('restoreSaveId')?['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode',adapter.key]:undefined;
      const state=preflight&&!preflight.recordStorage?preflight:await readState({aggregateReadAhead:fqcReadAhead,keys:selectedKeys,deferDependencyHistory:true,modelKey:adapter.preparedModel?adapter.key:undefined,deferHistory:true,caseId:selectors.get('caseId'),saveId:selectors.get('restoreSaveId'),versionId:selectors.get('versionId')||selectors.get('legacyVersionId')}),phase=await phaseFor(request,state),actor=phase?phase.actor:await identity(request,state),permissions=await currentPermissions(request,state,phase);
      if(!actor||!permissions.view||phase&&!await phase.current())return reply({error:'FORBIDDEN'},403);
      const query=new URL(request.url).searchParams;
      if(query.has('permissions'))return reply({permissions,revision:state.revision,otherReviewerAvailable:otherReviewerAvailable(state,actor.id)});
      // A catalog without an adopted draft has no generation token yet. Still
      // recheck identity/permissions before skipping an unchanged full projection.
      if(query.get('since')===`state:${state.revision}`)return reply({revision:state.revision,permissions,unchanged:true});
      const control=adapter.parse(state.values[adapter.key],state.recordStorage?.models.get(adapter.key)),flow=control.workflow;
      if(query.has('reviewMetadata'))return reply({revision:state.revision,permissions,review:workflowReviewMetadata(control,permissions.history)});
      if(query.has('uiHistory'))return permissions.history?reply(workflowInterfaceMetadata(control,query)):reply({error:'FORBIDDEN'},403);
      if(query.has('legacyHistory')||query.has('legacyVersionId')){
        if(!permissions.history)return reply({error:'FORBIDDEN'},403);
        const caseIds=new Set(flow?.cases.map(c=>c.id)||[]),rows=control.versions.filter(v=>!v.id.startsWith('shared-')&&!caseIds.has(v.id)).slice().reverse();
        if(query.has('legacyVersionId')){const version=rows.find(v=>v.id===query.get('legacyVersionId'));return version?reply({legacyVersion:version}):reply({error:'VERSION_NOT_FOUND'},404);}
        const before=query.get('before'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);
        return reply({versions:rows.slice(start,start+20).map(v=>({id:v.id,number:v.number,status:v.status,creatorId:v.creatorId,creatorName:v.creatorName,createdAt:v.createdAt,updatedAt:v.updatedAt})),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});
      }
      if(query.has('versionId')){const activeView=iqcEditingRequested(request,adapter.key,adapter.scope)&&query.get('versionId')===control.activeVersionId;if(!permissions.history&&!activeView)return reply({error:'FORBIDDEN'},403);const version=control.versions.find(v=>v.id===query.get('versionId'));return version?reply(activeView?{version,revision:state.revision,permissions,activeVersionId:control.activeVersionId,generation:flow?.generation||null}:{version}):reply({error:'VERSION_NOT_FOUND'},404);}
      if(query.has('restoreSaveId')){
        if(!permissions.history||!permissions.restore)return reply({error:'FORBIDDEN'},403);
        if(adapter.requiresDelete?.(control,{action:'restore'})&&!await can(request,state,'master.delete'))return reply({error:'FORBIDDEN'},403);
        if(!flow||openedVersion(control)?.status!=='draft')return reply({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);
        const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return reply({error:'SAVE_NOT_FOUND'},404);
        const context=adapter.context(control,state,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]});
        const after=context.restoreContent?context.restoreContent(cloneDraft(saved.content),flow.working):saved.content;
        await assertRestoreAccess(request,state,flow.working,after);
        return reply({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,after,source:{actor:saved.actor,at:saved.at}});
      }
      if(query.has('operationId')){const receipt=flow?.receipts[query.get('operationId')!];if(!receipt)return reply({error:'OPERATION_NOT_FOUND'},404);
        const action=JSON.parse(receipt.fingerprint).action,permission=action==='apply'||action==='restore'||action==='begin-v1'?'edit':action;
        if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission]||action==='restore'&&!permissions.restore)return reply({error:'FORBIDDEN'},403);return reply({receipt:receipt.result,...(action==='begin-v1'?{operationKind:'begin-v1'}:{})});}
      if(query.has('history')){if(!permissions.history)return reply({error:'FORBIDDEN'},403);const rows=[...(flow?.cases||[])].reverse(),before=query.get('before'),start=before?rows.findIndex(c=>c.id===before)+1:0;
        if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);return reply({cases:rows.slice(start,start+20).map(sharedCaseMetadata),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});}
      if(query.has('caseId')){if(!permissions.history)return reply({error:'FORBIDDEN'},403);const reviewCase=flow?.cases.find(c=>c.id===query.get('caseId'));return reviewCase?reply({reviewCase}):reply({error:'CASE_NOT_FOUND'},404);}
      if(flow&&query.get('since')===`${flow.generation}:${flow.revision}`)return reply({revision:state.revision,permissions,unchanged:true});
      const body={revision:state.revision,permissions,control:visibleSharedControl(control,permissions.history,query.get('caseMetadata')==='1',adapter.draftMissing),workflow:flow?{generation:flow.generation,revision:flow.revision,pendingId:flow.pendingId}:null};
      return state.recordStorage&&query.get('caseMetadata')!=='1'?recordJSONResponse(compactWorkflowPayload(body,query.get('compact')==='1'),env.STATE_ARCHIVE,responseHeaders):reply(body);
    }catch(error){return reply({error:error instanceof DraftConflict?error.code:'WORKFLOW_LOAD_FAILED'},error instanceof DraftConflict?error.status:503);}},
    async POST(request:Request){let streamRecords=false,applyAck=false,responseStatus=500;const query=new URL(request.url).searchParams,reply=(body:unknown,status=200)=>{const complete=iqcEditingPayload(compactWorkflowPayload(body,query.get('compact')==='1'),iqcEditingRequested(request,adapter.key,adapter.scope));
      // Build the unchanged complete projection first, preserving its failures.
      // Only wire serialization/transfer and the duplicate client expansion go.
      const source=complete as {revision?:number;receipt?:unknown;requestId?:string;unchanged?:boolean};
      const payload=applyAck&&status===200&&source.receipt?{revision:source.revision,receipt:source.receipt,...(source.requestId===undefined?{}:{requestId:source.requestId}),...(source.unchanged===undefined?{}:{unchanged:source.unchanged}),projection:'fqc-apply-ack-v1'}:complete;
      const response=streamRecords&&status===200&&query.get('caseMetadata')!=='1'?recordJSONResponse(payload,env.STATE_ARCHIVE,responseHeaders):Response.json(payload,{status,headers:responseHeaders});responseStatus=status;return response;};
      // Only this request's private admission sentinel retains original direct
      // denial DTOs. Caller objects/error flags cannot select this response.
      let admissionReply:Response|null=null;const refuseAdmission:(error:string,status:number)=>never=(error,status)=>{admissionReply=reply({error},status);throw admissionReply;};
      if(!sameOrigin(request))return reply({error:'FORBIDDEN_ORIGIN'},403);const requestId=crypto.randomUUID(),timing=iqcWriteTiming(adapter.key==='iqcMasterControl'&&adapter.scope==='iqc'&&new URL(request.url).pathname==='/api/iqc/workflow',requestId);let failureStage='command-decode';const stage=(name:string)=>{failureStage=name;timing.mark(name);};try{
      const body=await commandBody(request),caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
      if(adapter.key==='qualityMasterControl'&&adapter.scope==='fqc')assertFqcLocalSaveCommand(body.command);
      // Exact versioned opt-in: bounded FQC Apply still requires its separate
      // fresh terminal GET. Avoid returning live bodies twice, never skip reads,
      // validation, response projection or authorization/fault checks. Legacy clients
      // and every other action/route retain the original complete response.
      applyAck=adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!query.has('scope')&&body.action===undefined&&body.command?.action==='apply'&&query.getAll('projection').length===1&&query.get('projection')==='fqc-apply-ack-v1'&&query.getAll('caseMetadata').length===1&&caseMetadata&&query.getAll('compact').length===1&&query.get('compact')==='1';
      for(let attempt=0;attempt<4;attempt++){
        stage('required-state-read');
        let requiredPhase:Awaited<ReturnType<typeof createFqcPermissionPhase>>|null=null;
        const requiredFqc=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!query.has('scope')&&fqcRequiredDependencyCommand(body.command);
        const requiredState=requiredFqc?await readFqcRequiredMutationState(body.command!,async selected=>{
          stage('required-authorization');
          const phase=await phaseFor(request,selected),actor=phase?.actor;if(!phase||!actor)refuseAdmission('LOGIN_REQUIRED',401);
          if(selected.values.maintenanceMode==='1')refuseAdmission('MAINTENANCE',503);
          const permissions=await currentPermissions(request,selected,phase),command=body.command!;
          if(!await phase.current())refuseAdmission('LOGIN_REQUIRED',401);
          if(command.patches?.some(p=>p.op==='set'&&(p.path.at(-1)==='isDeleted'||p.path.at(-1)==='deleted')&&p.value===true)&&!permissions.delete)refuseAdmission('FORBIDDEN',403);
          // Match the original raw create check, not UI create=edit&&create.
          // Its independent post-body can() check remains below unchanged.
          if(command.patches?.some(p=>p.op==='insert')&&!phase.allowed('fqc.create'))refuseAdmission('FORBIDDEN',403);
          if(!permissions.view||!permissions[command.action==='apply'?'edit':'save'])throw new DraftConflict('FORBIDDEN',403);
          requiredPhase=phase;stage('required-business-read');return actor.id;
        }):null;
        stage('state-read');
        const mutationState=!requiredFqc&&body.action===undefined&&adapter.recordMutation==='fqc-existing-set'&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&fqcExistingSetCommand(body.command)?await readFqcMutationState(body.command):null;
        const processSaveState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&adapter.recordMutation==='process-save'&&adapter.key==='processAuthoringControl'&&adapter.scope==='process:platform'&&processSaveCommand(body.command)?await readProcessSaveMutationState(body.command):null;
        const processFlowState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&adapter.processFlowMutation===true&&adapter.key==='processAuthoringControl'&&adapter.scope==='process:platform'&&processFlowCommand(body.command)?await readProcessFlowMutationState(body.command):null;
        const fqcLifecycle8State=!requiredFqc&&body.action===undefined&&Object.keys(body).every(key=>key==='command')&&adapter.fqcLifecycle8Mutation===true&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&fqcLifecycle8Command(body.command)?await readFqcLifecycle8MutationState(body.command):null;
        if(adapter.scope==='fqc'&&body.command?.moduleAction==='save-local-v1')stage('business-read');
        const state=requiredState||mutationState||processSaveState||processFlowState||fqcLifecycle8State||await readState({aggregateReadAhead:body.action===undefined&&Object.keys(body).every(key=>key==='command')&&fqcAggregateReadAheadCommand(body.command)&&adapter.key==='qualityMasterControl'&&adapter.scope==='fqc'&&new URL(request.url).pathname==='/api/fqc/workflow'&&!query.has('scope'),deferDependencyHistory:!adapter.needsReferenceHistory?.(body.command),modelKey:adapter.preparedModel?adapter.key:undefined,deferHistory:!adapter.needsReferenceHistory?.(body.command),allocationKey:adapter.needsFullHistory?.(body.command)?adapter.key:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),phase=requiredPhase||await phaseFor(request,state),actor=phase?phase.actor:await identity(request,state);streamRecords=!!state.recordStorage;if(!actor)return reply({error:'LOGIN_REQUIRED'},401);
        if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
        stage('authorization');
        const permissions=await currentPermissions(request,state,phase);
        if(phase&&!await phase.current())return reply({error:'LOGIN_REQUIRED'},401);
        stage('adapter-context');
        const control=adapter.parse(state.values[adapter.key],state.recordStorage?.models.get(adapter.key)),at=new Date().toISOString();
        if(requiredState)captureFqcRequiredBasis(state,body.command!,control);
        const context=adapter.context(control,state,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at,id:()=>crypto.randomUUID(),allowed:p=>permissions[p]});
        // Existing raw fingerprints remain replay-compatible. New receipts keep
        // a canonical digest rather than embedding complete command media.
        const existingReceipt=body.command&&control.workflow?.receipts[body.command.operationId];
        if(body.command&&(!existingReceipt||isWorkflowDigestFingerprint(existingReceipt.fingerprint)))context.commandFingerprint=await workflowCommandFingerprint(body.command);
        context.allocationIndex=state.recordStorage?.allocations.get(adapter.key);
        const previous=control.workflow?.working||openedVersion(control)?.snapshot||effectiveVersion(control)?.snapshot||adapter.empty();
        const knownPhotos=new Set(adapter.photoIds(previous));let receipt;const begin=parseBeginIdentity(body);let beginAlreadyOpen=false;
        if(body.action==='begin'||begin){
          if(!permissions.edit)return reply({error:'FORBIDDEN'},403);
          if(begin){if(!['fqc','iqc','bom','process:platform'].includes(adapter.scope))throw new DraftConflict('INVALID_BEGIN_IDENTITY',422);const replay=replayBegin(control,begin,actor.id);if(replay)return reply({revision:state.revision,receipt:replay,operationKind:'begin-v1',unchanged:true});assertBeginBasis(control,begin);}
          adapter.beforeBegin?.(control,state);
          const open=openedVersion(control);
          if(!begin&&control.workflow&&open)return reply({revision:state.revision,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),unchanged:true});
          beginAlreadyOpen=!!control.workflow&&!!open;
          if(!beginAlreadyOpen&&open&&open.status!=='draft')throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW');
          if(!control.workflow){const active=effectiveVersion(control);control.workflow=createSharedDraft(adapter.scope,active?.snapshot||adapter.empty(),active?.id||null,context.id());if(open)control.workflow.working=cloneDraft(open.snapshot);}
        }else{
          const command=body.command;if(!command)throw new DraftConflict('COMMAND_REQUIRED',422);
          adapter.beforeCommand?.(control,command,state);
          if(!control.workflow||!openedVersion(control)&&!control.workflow.receipts[command.operationId])throw new DraftConflict('BEGIN_REQUIRED');
          const deletes=adapter.requiresDelete?.(control,command)||command.moduleAction?.startsWith('delete')||command.patches?.some(p=>p.op==='remove'||p.op==='set'&&(p.path.at(-1)==='isDeleted'||p.path.at(-1)==='deleted')&&p.value===true);
          if(deletes&&!permissions.delete)return reply({error:'FORBIDDEN'},403);
          const workflowModule=moduleForURL(request.url),creates=command.moduleAction?.startsWith('create')||command.moduleAction?.startsWith('add')||command.patches?.some(p=>p.op==='insert');
          if(creates&&workflowModule&&accessKeys.includes(workflowModule+'.create')&&!await can(request,state,workflowModule+'.create'))return reply({error:'FORBIDDEN'},403);
          if(command.action==='restore'&&!permissions.restore)return reply({error:'RESTORE_PERMISSION_REQUIRED'},403);
          stage('adapter-apply');
          const already=control.workflow.receipts[command.operationId],beforeRestore=command.action==='restore'?cloneDraft(control.workflow.working):null;const result=await adapter.apply(control,command,context);
          if(command.action==='restore'&&!already)await assertRestoreAccess(request,state,beforeRestore,result.state.working);
          control.workflow=result.state;receipt=result.receipt;
          if(requiredState&&!already)captureFqcRequiredResult(state,command,result.state,result.receipt);
          if(already){if(phase&&!await phase.current())return reply({error:'LOGIN_REQUIRED'},401);return reply({revision:state.revision,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),receipt,unchanged:true});}
          timing.mark('photo-validation');
          for(const photo of adapter.photoIds(control.workflow.working))if(!knownPhotos.has(photo)&&!await env.STATE_ARCHIVE.head(adapter.photoPrefix+photo))throw new DraftConflict('PHOTO_NOT_UPLOADED',422);
        }
        stage('version-projection');
        if(!beginAlreadyOpen)projectSharedVersion(control,actor,at,body.command?.action==='approve');
        if(begin)receipt=recordBegin(control,begin,actor.id,beginAlreadyOpen);
        if(!await stateRevisionIsCurrent(state))continue;
        if(phase&&!await phase.current())return reply({error:'LOGIN_REQUIRED'},401);
        const prepared=state.recordStorage&&(!adapter.serialize||adapter.serializeModel)?new Map([[adapter.key,adapter.serializeModel?adapter.serializeModel(control):control]]):undefined;
        // A newly adopted module has no existing key to iterate in record storage.
        // Register its key while keeping the trusted prepared model as the body.
        const values={...state.values,...(!prepared?{[adapter.key]:adapter.serialize?adapter.serialize(control):JSON.stringify(control)}:{[adapter.key]:state.values[adapter.key]??'null'}),...adapter.projectValues?.(control)};
        stage('record-encode');
        const encoded=await (requiredState?encodeFqcRequiredMutationState(state,values,prepared,candidate=>projectSharedVersion(candidate,actor,at)):mutationState?encodeFqcMutationState(state,values,prepared):processSaveState?encodeProcessSaveMutationState(state,values,prepared):processFlowState?encodeProcessFlowMutationState(state,values,prepared):fqcLifecycle8State?encodeFqcLifecycle8MutationState(state,values,prepared):encodeValues(values,state,prepared));
        // Immutable objects already written remain unreferenced on denial, as on
        // a lost CAS. Never delete shared/deduplicated objects to simulate rollback.
        if(phase&&!await phase.current())return reply({error:'LOGIN_REQUIRED'},401);
        if(begin&&!await identity(request,state))return reply({error:'LOGIN_REQUIRED'},401);
        stage('state-cas');
        const changed=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?').bind(state.revision+1,encoded,at,state.revision).run();
        if(changed.meta.changes!==1)continue;
        stage('response');
        return reply({revision:state.revision+1,control:visibleSharedControl(control,permissions.history,caseMetadata,adapter.draftMissing),receipt,requestId,...(begin?{operationKind:'begin-v1'}:{})});
      }return reply({error:'CONCURRENT_CHANGE_RETRY',requestId},409);
    }catch(error){if(admissionReply&&error===admissionReply)return admissionReply;if(error instanceof DraftConflict)return reply({error:error.code,details:error.details,requestId},error.status);if(error instanceof SyntaxError)return reply({error:'INVALID_JSON',requestId},422);
      if(adapter.scope==='fqc')console.error('[shared-workflow]',adapter.scope,requestId,error instanceof Error?error.name:'unknown',JSON.stringify({stage:failureStage,reason:fqcWriteFailureReason(error)}));
      else console.error('[shared-workflow]',adapter.scope,requestId,error instanceof Error?error.name:'unknown');return reply({error:'WORKFLOW_WRITE_FAILED',requestId},500);}finally{timing.finish(responseStatus);}}
  };
}
