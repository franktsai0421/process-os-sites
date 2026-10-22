import {emptyEquipmentControl,hierarchy,checkedSnapshot,submitProblems,reserveMarks,nextPieceMark,type EquipmentControl,type EquipmentVersion,type Equipment,type EquipmentGroup,type EquipmentCategory,type EquipmentSubcategory,type EquipmentIssue} from './routine-equipment';
import {parse} from './process-state';
import {applyDraftCommand,DraftConflict,cloneDraft,stableDraftJSON,type SharedDraft,type DraftPatch} from './shared-draft';
import {openedVersion,effectiveVersion,type NumericVersion,type WorkflowAdapter} from './versioned-shared-workflow';
import {isImmutableRecordBody} from './state-records';
export type EquipmentSnapshot={equipment:Equipment[];groups:EquipmentGroup[];categories:EquipmentCategory[];subcategories:EquipmentSubcategory[];issues:(EquipmentIssue&{id:string})[]};
export type EquipmentSharedControl=Omit<EquipmentControl,'versions'>&{versions:(EquipmentVersion&NumericVersion<EquipmentSnapshot>)[];workflow?:SharedDraft<EquipmentSnapshot>;reservedCategoryCodes?:string[]};
const empty=():EquipmentSnapshot=>({equipment:[],groups:[],categories:[],subcategories:[],issues:[]});
export function parseEquipmentWorkflow(raw?:string,prepared?:unknown):EquipmentSharedControl{
 const control=(prepared||(raw===undefined?emptyEquipmentControl():JSON.parse(raw))) as EquipmentSharedControl;
 if(control.schemaVersion!==1||!Array.isArray(control.versions)||!Array.isArray(control.issues)||!control.reservedMarks)throw new DraftConflict('EQUIPMENT_EXISTING_DATA_INVALID',422);
 for(const v of control.versions){
   if(prepared&&isImmutableRecordBody(v.equipment)&&isImmutableRecordBody(v.groups)){
     const issues=v.issues||control.issues;
     v.snapshot={equipment:v.equipment,groups:v.groups,categories:v.categories||[],subcategories:v.subcategories||[],issues:Array.isArray(issues)?issues.map((issue,index)=>({...issue,id:typeof issue.id==='string'?issue.id:'source-issue-'+index})):issues};continue;
   }
   if(!Array.isArray(v.equipment)||!Array.isArray(v.groups))throw new DraftConflict('EQUIPMENT_EXISTING_DATA_INVALID',422);
   v.snapshot={equipment:cloneDraft(v.equipment),...hierarchy(v),issues:cloneDraft(v.issues||control.issues).map((issue,index)=>({...issue,id:typeof issue.id==='string'?issue.id:'source-issue-'+index}))};}
 return control;
}
const fields:Record<keyof EquipmentSnapshot,string[]>={equipment:['name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','intakeDate','confirmed','photoId','photoHidden','groupId'],groups:['name','nameZh','nameVi','photoId','spec','notes','categoryId','subcategoryId'],categories:['name','photoId'],subcategories:['name','categoryId','photoId'],issues:['status','resolution']};
export const equipmentWorkflowAdapter:WorkflowAdapter<EquipmentSnapshot,EquipmentSharedControl>={
 key:'routineEquipmentControl',scope:'routine-equipment',parse:parseEquipmentWorkflow,empty,photoPrefix:'routine-equipment/photos/',
 preparedModel:true,
 needsFullHistory:command=>!!command?.patches?.some(p=>p.op==='insert'),
 photoIds:content=>[...content.equipment,...content.groups,...content.categories,...content.subcategories].flatMap(row=>row.photoId?[row.photoId]:[]),
 serialize(control){
   const ids=new Set(control.workflow?.cases.map(c=>c.id)||[]);for(const v of control.versions)if(v.id.startsWith('shared-')||ids.has(v.id))Object.assign(v,cloneDraft(v.snapshot));
   return JSON.stringify({...control,versions:control.versions.map(({snapshot:_snapshot,...v})=>v)});
 },
 serializeModel(control){
   const ids=new Set(control.workflow?.cases.map(c=>c.id)||[]);
   for(const v of control.versions)if(v.id.startsWith('shared-')||ids.has(v.id))Object.assign(v,v.snapshot);
   return {...control,versions:control.versions.map(({snapshot:_snapshot,...v})=>v)};
 },
 context(control,state,base){
   const active=control.versions.find(v=>v.id===control.activeVersionId),version=openedVersion(control)||active;
   const quality=parse(state.values.qualityMasterControl,{}) as {libraries?:Record<string,{activeVersionId?:string;versions?:{id:string;snapshot?:{items?:{equipmentId?:string;deleted?:boolean;isDeleted?:boolean}[]}}[]}>};
   const libraries=[...Object.values(quality.libraries||{}),...['iqcMasterControl','ipqcCMasterControl'].map(key=>parse(state.values[key],{})),...Object.values(parse(state.values.ipqcABMasterControl,{scopes:{}}).scopes||{})] as {activeVersionId?:string;versions?:{id:string;snapshot?:{items?:{equipmentId?:string;deleted?:boolean;isDeleted?:boolean}[]}}[]}[];
   const referenced=new Set(libraries.flatMap(lib=>lib.versions?.find(v=>v.id===lib.activeVersionId)?.snapshot?.items?.filter(i=>!i.deleted&&!i.isDeleted&&i.equipmentId).map(i=>i.equipmentId)||[]));
   const asVersion=(content:EquipmentSnapshot):EquipmentVersion=>({...version,id:version?.id||'initial',number:version?.number||1,status:'draft',revision:version?.revision||0,creatorId:base.actor.id,creatorName:base.actor.name,createdAt:base.at,updatedAt:base.at,history:version?.history||[],...content});
   return{...base,activeId:control.activeVersionId,
     restoreContent(historical,current){
       // Numbered hierarchy and effective/source equipment are protected provenance.
       // Show these retained rows in the preview instead of silently deleting them.
       const retain=<R extends {id:string}>(before:R[],now:R[])=>{for(const row of now)if(!before.some(old=>old.id===row.id))before.push(cloneDraft(row));};
       retain(historical.categories,current.categories);retain(historical.subcategories,current.subcategories);retain(historical.groups,current.groups);
       for(const row of current.equipment)if(!historical.equipment.some(old=>old.id===row.id)&&
         (row.sourceRow||row.effectiveAt||active?.equipment.some(e=>e.id===row.id)))historical.equipment.push(cloneDraft(row));
       return historical;
     },
     semantic:content=>({...content,issues:content.issues.map(({resolvedAt:_at,resolvedBy:_by,resolvedById:_id,...issue})=>issue)}),
     structure(content,previous){
       try{Object.assign(content,checkedSnapshot(asVersion(previous),content));}catch(e){throw new DraftConflict(e instanceof Error?e.message:'INVALID_STRUCTURE',422);}
       for(const issue of content.issues){const prior=previous.issues.find(i=>i.id===issue.id);if(prior&&(issue.status!==prior.status||issue.resolution!==prior.resolution)){issue.resolvedBy=base.actor.name;issue.resolvedById=base.actor.id;issue.resolvedAt=base.at;}}
     },
     validate(content){const available=new Map(content.equipment.map(e=>[e.id,e]));return[
       ...submitProblems(asVersion(content),active).map(p=>({kind:p.blocking?'error' as const:'missing' as const,path:['equipment',{id:p.id},p.field],message:p.message})),
       ...[...referenced].filter(id=>!available.has(id!)||available.get(id!)?.enabled===false).map(id=>({kind:'error' as const,path:['equipment',{id:id!}],message:'EQUIPMENT_STILL_REFERENCED'}))];}
   };
 },
 apply(control,command,context){
   const flow=control.workflow!;if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
   if(command.action!=='apply')return applyDraftCommand(flow,command,context);
   const patches:DraftPatch[]=cloneDraft(command.patches||[]);
   for(const p of patches){const [collection,entity,field]=p.path;if(typeof collection!=='string'||!Object.hasOwn(fields,collection))throw new DraftConflict('INVALID_COLLECTION',422);
     const rows=flow.working[collection as keyof EquipmentSnapshot];
     if(p.op==='insert'){
       if(p.path.length!==1||collection==='issues')throw new DraftConflict('INVALID_INSERT',422);
       if(collection==='equipment'){
         const row=p.value as Equipment;const code=String(row.assetCode||'').trim().toUpperCase();reserveMarks(control,context.allocationIndex?.equipment||control.versions.flatMap(v=>v.equipment));reserveMarks(control,flow.working.equipment);
         if(row.sourceRow||row.effectiveAt||row.photoSource)throw new DraftConflict('SOURCE_PROVENANCE_PROTECTED',422);
         row.pieceMark=nextPieceMark(control,code);row.assetCode=code;reserveMarks(control,[row]);
       }
       if(collection==='categories'){
         const reserved=new Set([...(control.reservedCategoryCodes||[]),...(context.allocationIndex?context.allocationIndex.categories.map(c=>c.code):control.versions.flatMap(v=>(v.categories||[]).map(c=>c.code))),...flow.working.categories.map(c=>c.code)]);
         const maximum=Math.max(0,...[...reserved].map(c=>Number(c.match(/^C(\d+)$/)?.[1])||0));p.value.code='C'+String(maximum+1).padStart(2,'0');control.reservedCategoryCodes=[...reserved,String(p.value.code)];
       }
     }else{
       if(!entity||typeof entity==='string'||!rows.some(r=>r.id===entity.id))throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
       if(p.op==='remove'){
         if(collection==='issues'||p.path.length!==2)throw new DraftConflict('SOURCE_PROVENANCE_PROTECTED',422);
         if(collection==='equipment'&&effectiveVersion(control)?.snapshot.equipment.some(e=>e.id===entity.id))throw new DraftConflict('EFFECTIVE_EQUIPMENT_DELETE_FORBIDDEN',422);
       }else if(p.op!=='set'||p.path.length!==3||typeof field!=='string'||!fields[collection as keyof EquipmentSnapshot].includes(field))throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
       if(!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(p.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
     }
   }
   return applyDraftCommand(flow,{...command,patches},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)});
 }
};
