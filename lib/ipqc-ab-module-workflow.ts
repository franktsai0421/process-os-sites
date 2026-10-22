import {parseAbControl,activeAb,openAb,copyAb,type AbControl,type AbSnapshot,type AbVersion} from './ipqc-ab';
import {abWorkflowAdapter,type AbSharedScope} from './ipqc-ab-workflow';
import {applyDraftCommand,DraftConflict,cloneDraft,stableDraftJSON} from './shared-draft';
import {projectSharedVersion,type WorkflowAdapter,type VersionedControl,type NumericVersion} from './versioned-shared-workflow';

// One immutable module save/case. Group versions remain compatible with process
// source IDs and retain their earlier independent history.
export type AbModuleSnapshot={scopes:Record<string,AbSnapshot>;bases:Record<string,string|null>};
export type AbModuleControl=VersionedControl<AbModuleSnapshot>;
export type AbModuleRoot=AbControl&{moduleDraft?:AbModuleControl};
export function abModulePending(root:AbControl){return (root as AbModuleRoot).moduleDraft?.workflow?.pendingId;}
export function abModuleWorkflowAdapter():WorkflowAdapter<AbModuleSnapshot,AbModuleControl>{
 let root:AbModuleRoot;
 const snapshot=(working:boolean):AbModuleSnapshot=>({
  scopes:Object.fromEntries(Object.entries(root.scopes).map(([key,s])=>[key,cloneDraft(working?(s as AbSharedScope).workflow?.working||openAb(s)?.snapshot||activeAb(s)?.snapshot||{errors:[],items:[]}:activeAb(s)?.snapshot||{errors:[],items:[]})])),
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
 return{key:'ipqcABMasterControl',scope:'ipqc-ab:module',preparedModel:true,
  empty:()=>snapshot(false),photoPrefix:'ipqc-ab/photos/',photoIds:c=>Object.values(c.scopes).flatMap(s=>s.items.flatMap(i=>[...i.standardPhotos,...i.methodPhotos].map(p=>p.id))),
  parse(raw,prepared){root=parseAbControl(raw,prepared) as AbModuleRoot;return root.moduleDraft||{activeVersionId:null,versions:[]};},
  serializeModel:project,serialize:c=>JSON.stringify(project(c)),beforeBegin:()=>conflict(),
  beforeCommand(control,command,state){if(control.workflow?.receipts[command.operationId])return;
   conflict();if(['save','submit'].includes(command.action)&&command.input?.stateRevision!==state.revision)throw new DraftConflict('MODULE_CHANGED_RECONFIRM');
   if(['apply','restore'].includes(command.action)||command.moduleAction)throw new DraftConflict('MODULE_ACTION_NOT_SUPPORTED',422);
   const content=command.action==='approve'?control.workflow?.cases.find(c=>c.id===command.caseId)?.content:null;
   if(content&&(stableDraftJSON(Object.keys(content.scopes).sort())!==stableDraftJSON(Object.keys(root.scopes).sort())||Object.entries(content.bases).some(([key,id])=>root.scopes[key]?.activeVersionId!==id)))throw new DraftConflict('MODULE_BASE_CHANGED_RECONFIRM');
  },
  context(control,state,base){const {restoreContent:_restore,...groupBase}=base;const contexts=new Map(Object.keys(root.scopes).map(key=>{const adapter=abWorkflowAdapter(key),s=adapter.parse(state.values.ipqcABMasterControl,state.recordStorage?.models.get('ipqcABMasterControl'));return[key,adapter.context(s,state,groupBase)] as const;}));
   return{...base,activeId:control.activeVersionId,semantic:c=>c.scopes,
    structure(content,previous){if(stableDraftJSON(Object.keys(content.scopes).sort())!==stableDraftJSON(Object.keys(root.scopes).sort()))throw new DraftConflict('MODULE_MEMBERS_CHANGED_RECONFIRM');for(const [key,c]of Object.entries(content.scopes))contexts.get(key)!.structure(c,previous.scopes[key]||c);},
    validate(content){return Object.entries(content.scopes).flatMap(([key,c])=>{const context=contexts.get(key);if(!context)throw new DraftConflict('MODULE_MEMBERS_CHANGED_RECONFIRM');return context.validate(c).map(issue=>({...issue,path:['scopes',key,...issue.path]}));});}
   };
  },
  apply(control,command,context){let flow=control.workflow!;
   if(command.action==='save'&&!flow.receipts[command.operationId]){const next=snapshot(true);context.structure(next,next);flow={...flow,working:next};}
   return applyDraftCommand(flow,command,context);
  }
 };
}
