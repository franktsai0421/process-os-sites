import {ipqcCSaveCommand,readIpqcCSaveMutationState,encodeIpqcCSaveMutationState} from '@/lib/ipqc-c-save-record-mutation';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin, encodeValues, stateRevisionIsCurrent, parse, responseHeaders, type State } from '@/lib/process-state';
import { parseIpqcControl, activeIpqc, openIpqc, copyIpqc } from '@/lib/ipqc-c';
import { beginIpqcWorkflow, applyIpqcWorkflow, ipqcWorkflowContext, publicIpqcWorkflow, type IpqcWorkflowControl, type IpqcWorkflowCommand } from '@/lib/ipqc-c-workflow';
import { DraftConflict, type DraftPermission } from '@/lib/shared-draft';
import type { EquipmentVersion } from '@/lib/routine-equipment';
import {compactWorkflowPayload,expandWorkflowCommand,workflowCommandFingerprint,isWorkflowDigestFingerprint} from '@/lib/workflow-wire';
import {otherReviewerAvailable,workflowInterfaceMetadata} from '@/lib/versioned-shared-workflow';
import {recordJSONResponse} from '@/lib/state-records-response';

const KEY='ipqcCMasterControl';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
async function access(request:Request,state:State) {
  const data=await can(request,state,'view:data'),review=await can(request,state,'view:approval');
  const edit=data&&await can(request,state,'ipqc-c.edit');
  return {view:data||review,edit,
    save:data&&await can(request,state,'ipqc-c.save'),submit:data&&await can(request,state,'ipqc-c.submit'),
    withdraw:data||review&&await can(request,state,'approval.withdraw'),
    approve:review&&await can(request,state,'approval.approve'),return:review&&await can(request,state,'approval.reject'),
    history:(data||review)&&await can(request,state,'approval.compare'),delete:edit&&await can(request,state,'master.delete')};
}
function readControl(state:State):IpqcWorkflowControl {const prepared=state.recordStorage?.models.get(KEY);return prepared?parseIpqcControl(state.values[KEY],prepared):copyIpqc(parseIpqcControl(state.values[KEY]));}
function projection(control:IpqcWorkflowControl, actor:{id:string;name:string},at:string,closeRound=false) {
  const flow=control.workflow!;
  for(const version of control.versions) if(version.status==='draft') version.status='superseded';
  for(const reviewCase of flow.cases) {
    let version=control.versions.find(v=>v.id===reviewCase.id);
    if(!version) {
      version={id:reviewCase.id,number:Math.max(0,...control.versions.map(v=>v.number))+1,status:'pending',
        snapshot:copyIpqc(reviewCase.content),baseVersionId:reviewCase.baseId,revision:1,
        creatorId:reviewCase.actor.id,creatorName:reviewCase.actor.name,createdAt:reviewCase.at,updatedAt:reviewCase.at,
        submittedBy:reviewCase.actor.name,submittedAt:reviewCase.at,history:[{action:'submit',actorId:reviewCase.actor.id,actorName:reviewCase.actor.name,at:reviewCase.at,comment:reviewCase.reason}]};
      control.versions.push(version);
    }
    version.status=reviewCase.status;
    if(reviewCase.contentIssues)version.contentIssues={policy:'ipqc-completeness-v1',issues:copyIpqc(reviewCase.contentIssues.issues)};
    if(reviewCase.result&&!version.reviewedAt) {
      version.reviewedBy=reviewCase.result.actor.name;version.reviewedAt=reviewCase.result.at;version.reviewComment=reviewCase.result.reason;
      version.history.push({action:reviewCase.status,actorId:reviewCase.result.actor.id,actorName:reviewCase.result.actor.name,at:reviewCase.result.at,
        comment:reviewCase.result.reason+(reviewCase.result.selfReview?' [self-review]':'')});
    }
  }
  if(flow.active.id!==control.activeVersionId) {
    const old=activeIpqc(control);if(old)old.status='superseded';control.activeVersionId=flow.active.id;
  }
  if(!flow.pendingId&&!closeRound) {
    const id='shared-'+flow.generation;let draft=control.versions.find(v=>v.id===id);
    if(!draft) {draft={id,number:Math.max(0,...control.versions.map(v=>v.number))+1,status:'draft',snapshot:copyIpqc(flow.working),
      baseVersionId:flow.baseId,revision:flow.revision,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]};control.versions.push(draft);}
    draft.status='draft';draft.snapshot=copyIpqc(flow.working);draft.revision=flow.revision;draft.updatedAt=at;
  }
}
export async function GET(request:Request) {
  try {
    const query=new URL(request.url).searchParams;
    const state=await readState({...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),modelKey:KEY,deferDependencyHistory:true,deferHistory:true,caseId:query.get('caseId'),saveId:query.get('restoreSaveId'),versionId:query.get('versionId')||query.get('legacyVersionId')}),actor=await identity(request,state),permissions=await access(request,state);
    if(!actor||!permissions.view)return reply({error:'FORBIDDEN'},403);
    if(query.has('permissions'))return reply({permissions,revision:state.revision,otherReviewerAvailable:otherReviewerAvailable(state,actor.id)});
    const control=readControl(state),flow=control.workflow;
    if(query.has('uiHistory'))return permissions.history?reply(workflowInterfaceMetadata(control,query)):reply({error:'FORBIDDEN'},403);
    if(query.has('versionId')){if(!permissions.history)return reply({error:'FORBIDDEN'},403);const version=control.versions.find(v=>v.id===query.get('versionId'));return version?reply({version}):reply({error:'VERSION_NOT_FOUND'},404);}
    if(query.has('legacyHistory')||query.has('legacyVersionId')){
      if(!permissions.history)return reply({error:'FORBIDDEN'},403);
      const caseIds=new Set(flow?.cases.map(c=>c.id)||[]),rows=control.versions.filter(v=>!v.id.startsWith('shared-')&&!caseIds.has(v.id)).slice().reverse();
      if(query.has('legacyVersionId')){const version=rows.find(v=>v.id===query.get('legacyVersionId'));return version?reply({legacyVersion:version}):reply({error:'VERSION_NOT_FOUND'},404);}
      const before=query.get('before'),start=before?rows.findIndex(v=>v.id===before)+1:0;if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);
      return reply({versions:rows.slice(start,start+20).map(v=>({id:v.id,number:v.number,status:v.status,creatorId:v.creatorId,creatorName:v.creatorName,createdAt:v.createdAt,updatedAt:v.updatedAt})),next:rows.length>start+20?rows[start+19].id:null,total:rows.length});
    }
    if(query.has('restoreSaveId')){
      if(!permissions.history||!permissions.edit)return reply({error:'FORBIDDEN'},403);
      if(!flow||openIpqc(control)?.status!=='draft')return reply({error:flow?.pendingId?'PENDING_LOCKED':'BEGIN_REQUIRED'},409);
      const saved=flow.saves.find(s=>s.id===query.get('restoreSaveId'));if(!saved)return reply({error:'SAVE_NOT_FOUND'},404);
      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:new Date().toISOString(),id:()=>crypto.randomUUID(),allowed:p=>permissions[p]},[]);
      return reply({generation:flow.generation,expectedRevision:flow.revision,restoreSaveId:saved.id,before:flow.working,
        after:context.restoreContent!(copyIpqc(saved.content),flow.working),source:{actor:saved.actor,at:saved.at}});
    }
    if(query.get('history')==='cases') {
      if(!permissions.history)return reply({error:'FORBIDDEN'},403);
      const cases=[...(flow?.cases||[])].reverse(),before=query.get('before');
      const start=before?cases.findIndex(c=>c.id===before)+1:0;
      if(before&&!start)return reply({error:'HISTORY_CURSOR_INVALID'},409);
      const rows=cases.slice(start,start+20);
      return reply({cases:rows.map(c=>({id:c.id,savedId:c.savedId,baseId:c.baseId,actor:c.actor,at:c.at,reason:c.reason,status:c.status,result:c.result})),
        next:cases.length>start+20?rows.at(-1)?.id:null,total:cases.length});
    }
    if(query.has('caseId')) {
      if(!permissions.history)return reply({error:'FORBIDDEN'},403);
      const reviewCase=flow?.cases.find(c=>c.id===query.get('caseId'));
      return reviewCase?reply({reviewCase,currentDraftId:openIpqc(control)?.id||null}):reply({error:'CASE_NOT_FOUND'},404);
    }
    const operationId=query.get('operationId');
    if(operationId) {
      const receipt=flow?.receipts[operationId];
      if(!receipt)return reply({error:'OPERATION_NOT_FOUND'},404);
      const action=JSON.parse(receipt.fingerprint).action;
      const permission=action==='apply'||action==='restore'?'edit':action;
      if(receipt.actorId!==actor.id||!permissions[permission as DraftPermission])return reply({error:'FORBIDDEN'},403);
      return reply({receipt:receipt.result});
    }
    const since=new URL(request.url).searchParams.get('since');
    if(flow&&since===`${flow.generation}:${flow.revision}`)return reply({revision:state.revision,permissions,unchanged:true});
    return reply({revision:state.revision,permissions,workflow:flow ? {
      scope:flow.scope,generation:flow.generation,revision:flow.revision,working:flow.working,
      saved:flow.saved ? {id:flow.saved.id,revision:flow.saved.revision,actor:flow.saved.actor,at:flow.saved.at}:null,
      pendingId:flow.pendingId,activeId:flow.active.id,contributors:flow.contributors,
      editable:openIpqc(control)?.status==='draft',
    }:null});
  } catch(error) {return error instanceof DraftConflict?reply({error:error.code},error.status):reply({error:'WORKFLOW_LOAD_FAILED'},503);}
}
export async function POST(request:Request) {
  let streamRecords=false;const query=new URL(request.url).searchParams,reply=(body:unknown,status=200)=>{const payload=compactWorkflowPayload(body,query.get('compact')==='1');return streamRecords&&status===200&&query.get('caseMetadata')!=='1'?recordJSONResponse(payload,env.STATE_ARCHIVE,responseHeaders):Response.json(payload,{status,headers:responseHeaders});};
  if(!sameOrigin(request))return reply({error:'FORBIDDEN_ORIGIN'},403);
  const requestId=crypto.randomUUID();
  try {
    // Small commands only; no whole-site documents or inline photo bytes.
    const reader=request.body?.getReader();if(!reader)return reply({error:'BODY_REQUIRED'},422);
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>2_000_000){await reader.cancel();return reply({error:'COMMAND_TOO_LARGE'},413);}chunks.push(next.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const raw=new TextDecoder().decode(bytes);if(raw.includes('__immutableBody')||raw.includes('__liveContent'))return reply({error:'RESERVED_STORAGE_REFERENCE',requestId},422);
    const body=JSON.parse(raw) as {action?:'begin';command?:IpqcWorkflowCommand};
    if(body.command)body.command=expandWorkflowCommand(body.command) as IpqcWorkflowCommand;
    const caseMetadata=new URL(request.url).searchParams.get('caseMetadata')==='1';
    for(let attempt=0;attempt<4;attempt++) {
      const saveMutationState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&ipqcCSaveCommand(body.command)?await readIpqcCSaveMutationState(body.command):null;
      const state=saveMutationState||await readState({modelKey:KEY,deferDependencyHistory:true,deferHistory:true,allocationKey:['create-error','create-item'].includes(body.command?.moduleAction||'')?KEY:undefined,caseId:body.command?.caseId,saveId:body.command?.restoreSaveId}),actor=await identity(request,state);streamRecords=!!state.recordStorage;
      if(!actor)return reply({error:'LOGIN_REQUIRED'},401);
      if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
      const permissions=await access(request,state),control=readControl(state);
      const knownPhotos=new Set((control.workflow?.working||openIpqc(control)?.snapshot||activeIpqc(control)?.snapshot)?.items.flatMap(item=>item.mediaItems.map(photo=>photo.id))||[]);
      const master=parse(state.values.masterDataControl,{}) as {active?:{C?:{products?:{code:string;stages:string[]}[]}}};
      const at=new Date().toISOString();
      const context=ipqcWorkflowContext(control,{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at,id:()=>crypto.randomUUID(),
        allowed:permission=>permissions[permission]},master.active?.C?.products||[]);
      context.allocationIndex=state.recordStorage?.allocations.get(KEY);
      const existingReceipt=body.command&&control.workflow?.receipts[body.command.operationId];
      if(body.command&&(!existingReceipt||isWorkflowDigestFingerprint(existingReceipt.fingerprint)))context.commandFingerprint=await workflowCommandFingerprint(body.command);
      const originalStructure=context.structure;
      const equipment=parse(state.values.routineEquipmentControl,{}) as {activeVersionId?:string;versions?:EquipmentVersion[]};
      const effective=equipment.versions?.find(v=>v.id===equipment.activeVersionId&&v.status==='approved');
      const selected=new Map((effective?.equipment||[]).map(e=>[e.id,e]));
      context.structure=(content,previous)=>{
        try { originalStructure(content,previous); }
        catch { throw new DraftConflict('INVALID_STRUCTURE',422); }
        // Build once per validation call; preserve Array.find first-match semantics.
        const priorById=new Map<string,typeof previous.items[number]>();
        const stringIds=previous.items.every(item=>typeof item.id==='string')&&content.items.every(item=>typeof item.id==='string');
        if(stringIds)for(const item of previous.items)if(!priorById.has(item.id))priorById.set(item.id,item);
        for(const item of content.items) {
          const old=stringIds?priorById.get(item.id):previous.items.find(i=>i.id===item.id);
          if(!item.equipmentId){item.equipmentSnapshot=null;continue;}
          if(old?.equipmentId===item.equipmentId){item.equipmentSnapshot=old.equipmentSnapshot;continue;}
          const choice=selected.get(item.equipmentId);if(!choice||choice.enabled===false)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
          item.equipmentSnapshot={id:choice.id,assetCode:choice.assetCode||'',pieceMark:choice.pieceMark||'',name:choice.name||choice.nameVi||'',spec:typeof choice.spec==='string'?choice.spec:'',...(choice.photoId?{photoId:choice.photoId}:{})};
        }
      };
      const originalValidate=context.validate;
      context.validate=content=>[...originalValidate(content),...content.items.filter(i=>!i.deleted&&i.equipmentId&&(!selected.has(i.equipmentId)||selected.get(i.equipmentId)?.enabled===false))
        .map(i=>({kind:'error' as const,path:['items',{id:i.id},'equipmentId'],message:'EQUIPMENT_UNAVAILABLE'}))];
      const saveProjectionBase=request.headers.get('X-IPQC-C-Save-Projection')==='1'&&ipqcCSaveCommand(body.command)&&body.command.expectedRevision===control.workflow?.revision&&control.workflow?.pendingId===null&&new Set(control.versions.map(v=>v.id)).size===control.versions.length&&control.versions.filter(v=>v.status==='draft'||v.status==='pending').length===1&&openIpqc(control)?.id==='shared-'+control.workflow.generation&&openIpqc(control)?.status==='draft'
        ?{revision:state.revision,flowRevision:control.workflow.revision,generation:control.workflow.generation,activeVersionId:control.activeVersionId,draftId:openIpqc(control)!.id,others:control.versions.filter(v=>v.id!==openIpqc(control)!.id).map(v=>{const {snapshot,...metadata}=v;return{id:v.id,snapshot,metadata:JSON.stringify(metadata)};})}:null;
      let receipt;
      if(body.action==='begin') {
        if(!permissions.edit)return reply({error:'FORBIDDEN'},403);
        if(control.workflow&&openIpqc(control))return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),unchanged:true});
        if(!activeIpqc(control)&&!openIpqc(control))return reply({error:'INITIAL_BUILD_REQUIRED'},409);
        beginIpqcWorkflow(control,context);
      } else {
        if(!body.command)return reply({error:'COMMAND_REQUIRED'},422);
        if(!openIpqc(control)&&!control.workflow?.receipts[body.command.operationId])return reply({error:'BEGIN_REQUIRED'},409);
        if(body.command.moduleAction?.startsWith('delete')&&!await can(request,state,'master.delete'))return reply({error:'FORBIDDEN'},403);
        if(body.command.moduleAction==='create-error'&&!master.active?.C?.products?.some(p=>p.code===body.command!.input?.productCode&&p.stages.includes(body.command!.input?.stageCode||'')))
          return reply({error:'PRODUCT_STAGE_INVALID'},422);
        const alreadyAccepted=control.workflow?.receipts[body.command.operationId];
        receipt=applyIpqcWorkflow(control,body.command,context);
        if(alreadyAccepted)return reply({revision:state.revision,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),receipt,unchanged:true,requestId});
        for(const item of control.workflow!.working.items)for(const photo of item.mediaItems)
          if(!knownPhotos.has(photo.id)&&!await env.STATE_ARCHIVE.head(`ipqc-c/photos/${photo.id}`))return reply({error:'PHOTO_NOT_UPLOADED'},422);
      }
      projection(control,actor,at,body.command?.action==='approve');
      if(!await stateRevisionIsCurrent(state))continue;
      const prepared=state.recordStorage?new Map([[KEY,control]]):undefined;
      const values={...state.values,...(!prepared?{[KEY]:JSON.stringify(control)}:{})};
      const changed=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
        .bind(state.revision+1,await (saveMutationState?encodeIpqcCSaveMutationState(state,values,prepared):encodeValues(values,state,prepared)),at,state.revision).run();
      if(changed.meta.changes!==1)continue;
      const saved=control.workflow?.saved,draft=openIpqc(control),currentOthers=saveProjectionBase?control.versions.filter(v=>v.id!==saveProjectionBase.draftId):[];
      if(saveProjectionBase&&receipt&&saved&&draft?.status==='draft'&&draft.id===saveProjectionBase.draftId&&control.workflow?.generation===saveProjectionBase.generation&&control.activeVersionId===saveProjectionBase.activeVersionId&&control.workflow.pendingId===null&&control.versions.length===saveProjectionBase.others.length+1&&saveProjectionBase.others.every((old,index)=>{const current=currentOthers[index];if(!current||current.id!==old.id||current.snapshot!==old.snapshot)return false;const {snapshot:_snapshot,...metadata}=current;return JSON.stringify(metadata)===old.metadata;})){
        const {content:_savedContent,...savedMetadata}=saved,{snapshot:_draftSnapshot,...draftMetadata}=draft;
        return reply({revision:state.revision+1,receipt,requestId,permissions,cSaveProjection:{version:1,baseStateRevision:saveProjectionBase.revision,baseFlowRevision:saveProjectionBase.flowRevision,generation:saveProjectionBase.generation,activeVersionId:saveProjectionBase.activeVersionId,flowRevision:control.workflow.revision,saved:savedMetadata,contributors:control.workflow.contributors,draft:draftMetadata}});
      }
      return reply({revision:state.revision+1,control:publicIpqcWorkflow(control,permissions.history,caseMetadata),receipt,requestId});
    }
    return reply({error:'CONCURRENT_CHANGE_RETRY',requestId},409);
  } catch(error) {
    if(error instanceof SyntaxError)return reply({error:'INVALID_JSON',requestId},422);
    if(error instanceof DraftConflict)return reply({error:error.code,details:error.details,requestId},error.status);
    console.error('[ipqc-c-workflow]',requestId,error instanceof Error?error.name:'unknown');
    return reply({error:'WORKFLOW_WRITE_FAILED',requestId},500);
  }
}
