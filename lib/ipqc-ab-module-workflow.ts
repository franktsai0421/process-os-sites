import {equipmentCatalog} from './equipment-catalog.mjs';
import {abApprovedMetadata,legacyAbVersion} from './ipqc-ab-approved-history';
import {approvedVersion} from './approved-history';
import {abLocalScopes,applyAbLocalScopes} from './ipqc-ab-local-save';
import {parseAbControl,activeAb,openAb,copyAb,catalogFromMaster,type AbCatalog,type AbControl,type AbSnapshot,type AbVersion} from './ipqc-ab';
import {abWorkflowAdapter,type AbSharedScope} from './ipqc-ab-workflow';
import {applyDraftCommand,DraftConflict,cloneDraft,stableDraftJSON} from './shared-draft';
import {projectSharedVersion,type WorkflowAdapter,type VersionedControl,type NumericVersion} from './versioned-shared-workflow';

// One immutable module save/case. Group versions remain compatible with process
// source IDs and retain their earlier independent history.
export type AbModuleSnapshot={scopes:Record<string,AbSnapshot>;bases:Record<string,string|null>};
export type AbModuleControl=VersionedControl<AbModuleSnapshot>;
export type AbModuleRoot=AbControl&{moduleDraft?:AbModuleControl};
export function abModulePending(root:AbControl){return (root as AbModuleRoot).moduleDraft?.workflow?.pendingId;}

// Identify rows by approved scope, error and item identities, including unselected
// peers whose pre-existing route issue the whole-module submission also contains.
function hiddenEquipmentReview(root:AbModuleRoot, proposed:AbModuleSnapshot, catalog:AbCatalog) {
 const rows=new Map<string,Set<string>>();
 let replacement=false;
 for(const [key,group] of Object.entries(root.scopes)){
  const active=activeAb(group),next=proposed.scopes[key];
  if(active?.status!=='approved' || !next) continue;
  const products=new Map(catalog.products.filter(p=>p.line===group.line && p.category===group.group).map(p=>[p.code,p]));
  const configured=catalog.groups.find(g=>g.line===group.line && g.name===group.group)?.defaultStages;
  const route=new Set(configured ?? [...products.values()].flatMap(p=>p.stages));
  const lineStages=new Set(catalog.stages.filter(s=>s.line===group.line).map(s=>s.code));
  const hidden=new Map(active.snapshot.errors.filter(e=>!e.deleted && e.line===group.line && e.group===group.group &&
    lineStages.has(e.stageCode) && !route.has(e.stageCode)).map(e=>[e.id,e.stageCode]));
  if(!hidden.size) continue;
  const proposedRows=new Map(next.items.map(i=>[i.id,i]));
  const changedProducts=new Map<string,Set<string>>();
  const routeIssues=new Map<string,{stage:string;products:string[]}>();
  for(const old of active.snapshot.items){
   const stage=hidden.get(old.errorId);
   if(!stage || old.deleted) continue;
   const row=proposedRows.get(old.id);
   const changed=old.inspectionMode==='equipment' && !!row && row.equipmentId!==old.equipmentId;
   if(changed) replacement=true;
   // Missing, reclassified and foreign-line products cannot inherit an exception.
   if(!old.productCodes.every(code=>products.has(code))) continue;
   const invalid=old.productCodes.filter(code=>!products.get(code)!.stages.includes(stage));
   if(!invalid.length) continue;
   routeIssues.set(old.id,{stage,products:invalid});
   if(changed){
    const codes=changedProducts.get(stage) ?? new Set<string>();
    for(const code of invalid) codes.add(code);
    changedProducts.set(stage,codes);
   }
  }
  // An unselected peer is retained only for the exact removed route links
  // implicated by a changed approved item in this scope and stage.
  const eligible=new Set<string>();
  for(const [id,issue] of routeIssues){
   if(issue.products.every(code=>changedProducts.get(issue.stage)?.has(code))) eligible.add(id);
  }
  if(eligible.size) rows.set(key,eligible);
 }
 return replacement ? rows : null;
}

function onlyApprovedEquipmentChanges(root:AbModuleRoot, proposed:AbModuleSnapshot, equipmentIds:Set<string>) {
 if(Object.keys(proposed.scopes).length!==Object.keys(root.scopes).length) return false;
 return Object.entries(root.scopes).every(([key,group])=>{
  const next=proposed.scopes[key],active=activeAb(group);
  if(!next || proposed.bases[key]!==group.activeVersionId) return false;
  if(!active) return !group.activeVersionId && !next.errors.length && !next.items.length;
  if(active.status!=='approved') return false;
  const prior=active.snapshot;
  if(stableDraftJSON(next.errors)!==stableDraftJSON(prior.errors) || next.items.length!==prior.items.length) return false;
  return next.items.every((row,index)=>{
   const old=prior.items[index];
   if(row.id!==old.id) return false;
   if(row.equipmentId===old.equipmentId) return stableDraftJSON(row)===stableDraftJSON(old);
   if(old.deleted || !old.isEnabled || old.inspectionMode!=='equipment' || !equipmentIds.has(old.equipmentId) ||
      (old.equipmentSnapshot && old.equipmentSnapshot.id!==old.equipmentId) || !row.equipmentId || row.equipmentSnapshot?.id!==row.equipmentId) return false;
   // The group adapter builds the target snapshot and rechecks availability.
   return stableDraftJSON({...row,equipmentId:old.equipmentId,equipmentSnapshot:old.equipmentSnapshot})===stableDraftJSON(old);
  });
 });
}
export function abModuleWorkflowAdapter():WorkflowAdapter<AbModuleSnapshot,AbModuleControl>{
 let root:AbModuleRoot,requestState:Parameters<WorkflowAdapter<AbModuleSnapshot,AbModuleControl>['context']>[1];
 const localSaveBasis=(control:AbModuleControl,command:Parameters<typeof abLocalScopes>[0],state:typeof requestState)=>{
  abLocalScopes(command);
  if(!Number.isSafeInteger(command.input?.stateRevision)||Number(command.input?.stateRevision)<1)throw new DraftConflict('INVALID_AB_LOCAL_SAVE',422);
  if(!Number.isSafeInteger(command.expectedRevision)||Number(command.expectedRevision)<0)throw new DraftConflict('DRAFT_REVISION_REQUIRED');
  if(command.expectedRevision!==control.workflow?.revision)throw new DraftConflict('DRAFT_REVISION_CHANGED_RECONFIRM');
  // Legacy group/replacement writers advance the shared-state CAS revision,
  // not module revision. Pin both to the authority read for this Save.
  if(command.input?.stateRevision!==state.revision)throw new DraftConflict('MODULE_CHANGED_RECONFIRM');
 };
 const snapshot=(working:boolean,copy=true):AbModuleSnapshot=>({
  scopes:Object.fromEntries(Object.entries(root.scopes).map(([key,s])=>{const content=working?(s as AbSharedScope).workflow?.working||openAb(s)?.snapshot||activeAb(s)?.snapshot||{errors:[],items:[]}:activeAb(s)?.snapshot||{errors:[],items:[]};return[key,copy?cloneDraft(content):content];})),
  bases:Object.fromEntries(Object.entries(root.scopes).map(([key,s])=>[key,s.activeVersionId]))
 });
 const conflict=()=>{const conflicts=Object.entries(root.scopes).filter(([,s])=>s.versions.some(v=>['pending','pending-test'].includes(v.status)&&!(v as AbVersion&{wholeModuleCaseId?:string}).wholeModuleCaseId));
  if(conflicts.length)throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW',409,{scopes:conflicts.map(([key])=>key)});
 };
 function project(control:AbModuleControl){
  root.moduleDraft=control;
  const flow=control.workflow;if(!flow)return root;
  for(const c of flow.cases){
   const projected=Object.values(root.scopes).flatMap(s=>s.versions.filter(v=>v.id===c.id));
   // A later group is not a member of an older fixed case. Completed projections
   // must not expand old archived case bodies merely because groups were added.
   if(projected.length&&projected.every(v=>c.result?!!v.reviewedAt:v.status===c.status))continue;
   for(const [key,content]of Object.entries(c.content.scopes)){
   const s=root.scopes[key] as AbSharedScope;if(!s)throw new DraftConflict('MODULE_MEMBERS_CHANGED_RECONFIRM');
   let v=s.versions.find(v=>v.id===c.id);
   if(!v){v={id:c.id,number:Math.max(0,...s.versions.map(v=>v.number))+1,status:'pending',snapshot:content,revision:1,baseVersionId:c.content.bases[key],creatorId:c.actor.id,creatorName:c.actor.name,createdAt:c.at,updatedAt:c.at,submittedBy:c.actor.name,submittedAt:c.at,history:[{action:'submit',actorId:c.actor.id,actorName:c.actor.name,at:c.at,comment:c.reason}]};Object.assign(v,{wholeModuleCaseId:c.id});s.versions.push(v);for(const old of s.versions)if(old.status==='draft')old.status='superseded';}
   v.status=c.status;
   if(c.result&&!v.reviewedAt){v.reviewedBy=c.result.actor.name;v.reviewedAt=c.result.at;v.reviewComment=c.result.reason;v.history.push({action:c.status,actorId:c.result.actor.id,actorName:c.result.actor.name,at:c.result.at,comment:c.result.reason+(c.result.selfReview?' [self-review]':'')});
    if(c.status==='approved'){const old=activeAb(s);if(old&&old.id!==v.id)old.status='superseded';s.activeVersionId=v.id;}
    if(s.workflow){const f=s.workflow;f.working=cloneDraft(content);f.generation=flow.generation+':'+key;f.revision++;f.saved=null;f.contributors={};f.baseId=s.activeVersionId;f.active={id:s.activeVersionId,content:cloneDraft(activeAb(s)?.snapshot||{errors:[],items:[]})};projectSharedVersion(s,c.result.actor,c.result.at,c.status==='approved');}
    else if(c.status!=='approved'){const draft:NumericVersion<AbSnapshot>={...copyAb(v),id:'shared-module-'+flow.generation+':'+key,number:Math.max(...s.versions.map(v=>v.number))+1,status:'draft',snapshot:cloneDraft(content),reviewedAt:undefined,reviewedBy:undefined,history:[]};s.versions.push(draft as AbVersion);}
   }
  }}
  return root;
 }
  return{key:'ipqcABMasterControl',scope:'ipqc-ab:module',preparedModel:true,permissionOnlyRead:true,
  approvedHistory:{metadata:()=>abApprovedMetadata(root,true),version:id=>id.startsWith('legacy-ab:')?legacyAbVersion(root,id,true):root.moduleDraft?approvedVersion(root.moduleDraft,id,true):null},
  needsFullHistory:command=>command?.moduleAction==='save-local-v1',
  requiresCreate:(_control,command)=>command.moduleAction==='save-local-v1'&&abLocalScopes(command as Parameters<typeof abLocalScopes>[0]).some(s=>s.changes.some(c=>c.moduleAction?.startsWith('create')||c.moduleAction==='restore-item-local-v1')),
  requiresDelete:(_control,command)=>command.moduleAction==='save-local-v1'&&abLocalScopes(command as Parameters<typeof abLocalScopes>[0]).some(s=>s.changes.some(c=>c.moduleAction?.startsWith('delete'))),
  requiresRestore:(_control,command)=>command.moduleAction==='save-local-v1'&&abLocalScopes(command as Parameters<typeof abLocalScopes>[0]).some(s=>s.changes.some(c=>c.moduleAction==='restore-item-local-v1')),
  empty:()=>snapshot(false),photoPrefix:'ipqc-ab/photos/',photoIds:c=>Object.values(c.scopes).flatMap(s=>s.items.flatMap(i=>[...i.standardPhotos,...i.methodPhotos].map(p=>p.id))),
  parse(raw,prepared){root=parseAbControl(raw,prepared) as AbModuleRoot;return root.moduleDraft||{activeVersionId:null,versions:[]};},
  serializeModel:project,serialize:c=>JSON.stringify(project(c)),beforeBegin:()=>conflict(),
  beforeCommand(control,command,state){if(control.workflow?.receipts[command.operationId])return;
   conflict();if(command.moduleAction==='save-local-v1'){localSaveBasis(control,command,state);return;}if(['save','submit'].includes(command.action)&&command.input?.stateRevision!==state.revision)throw new DraftConflict('MODULE_CHANGED_RECONFIRM');
   if(['apply','restore'].includes(command.action)||command.moduleAction)throw new DraftConflict('MODULE_ACTION_NOT_SUPPORTED',422);
   const content=command.action==='approve'?control.workflow?.cases.find(c=>c.id===command.caseId)?.content:null;
   if(content&&(stableDraftJSON(Object.keys(content.scopes).sort())!==stableDraftJSON(Object.keys(root.scopes).sort())||Object.entries(content.bases).some(([key,id])=>root.scopes[key]?.activeVersionId!==id)))throw new DraftConflict('MODULE_BASE_CHANGED_RECONFIRM');
  },
  context(control,state,base){requestState=state;const {restoreContent:_restore,checkApproval:_checkApproval,checkSave:_checkSave,...groupBase}=base;const groupContext=(key:string)=>{const adapter=abWorkflowAdapter(key),s=adapter.parse('{}',root);return adapter.context(s,state,groupBase);};
   return{...base,activeId:control.activeVersionId,semantic:c=>c.scopes,
    checkSave(proposed){for(const [key,scope] of Object.entries(proposed.scopes))groupContext(key).checkSave?.(scope);},
    checkApproval(before,proposed){
     for(const [key,scope] of Object.entries(proposed.scopes))
      groupContext(key).checkApproval?.(before.scopes[key] || {errors:[],items:[]},scope);
    },
    structure(content,previous){if(stableDraftJSON(Object.keys(content.scopes).sort())!==stableDraftJSON(Object.keys(root.scopes).sort()))throw new DraftConflict('MODULE_MEMBERS_CHANGED_RECONFIRM');for(const [key,c]of Object.entries(content.scopes))groupContext(key).structure(c,previous.scopes[key]||c);},
    validate(content){
     const issues=Object.entries(content.scopes).flatMap(([key,c])=>
      groupContext(key).validate(c).map(issue=>({...issue,path:['scopes',key,...issue.path]})));
     const allowed=hiddenEquipmentReview(root,content,catalogFromMaster(state.values.masterDataControl));
     if(!allowed) return issues;
     const catalog:{versions:{id:string;equipment?:{id:string}[]}[]}=equipmentCatalog(state.values.routineEquipmentControl);
     const equipmentIds=new Set<string>((catalog.versions[0]?.equipment ?? []).map(e=>e.id));
     if(!onlyApprovedEquipmentChanges(root,content,equipmentIds)) return [...issues,{kind:'error',code:'OFF_ROUTE_REPLACEMENT_MIXED_CHANGE',path:['scopes'],message:'OFF_ROUTE_REPLACEMENT_MIXED_CHANGE'}];
     return issues.filter(issue=>{
      const [,key,items,item,field]=issue.path;
      return !(issue.code==='PRODUCT_ROUTE_INVALID' && typeof key==='string' && items==='items' &&
        typeof item==='object' && item!==null && field==='productCodes' && allowed.get(key)?.has(item.id));
     });
    }
   };
  },
  apply(control,command,context){let flow=control.workflow!;
   if(command.moduleAction==='save-local-v1'&&!flow.receipts[command.operationId]){
    localSaveBasis(control,command,requestState);
    if(!context.allowed('view')||!context.allowed('edit'))throw new DraftConflict('FORBIDDEN',403);
    const prior=root;
    const {restoreContent:_restore,checkApproval:_checkApproval,checkSave:_checkSave,structure:_structure,validate:_validate,semantic:_semantic,...base}=context;
    // currentPermissions supplies explicit .restore; the kernel's narrower
    // DraftPermission union does not include this existing route capability.
    const candidate=applyAbLocalScopes(root,command,requestState,base,(context.allowed as (permission:string)=>boolean)('restore')===true&&(context.allowed as (permission:string)=>boolean)('create')===true);
    try{root=candidate;const next=snapshot(true);context.structure(next,next);
     const result=applyDraftCommand({...flow,working:next},command,{...context,allowed:p=>p==='save'?context.allowed('edit'):context.allowed(p)});
     return result;
    }catch(error){root=prior;throw error;}
   }
   if(command.action==='save'&&!flow.receipts[command.operationId]){const next=snapshot(true);context.structure(next,next);flow={...flow,working:next};}
   // Group Apply does not advance the module workflow. Submit must compare the
   // current group content, not the module's working copy from its last Save.
   // The kernel clones this request-local view; this never saves implicitly.
   if(command.action==='submit'&&!flow.receipts[command.operationId])flow={...flow,working:snapshot(true,false)};
   return applyDraftCommand(flow,command,context);
  }
 };
}
