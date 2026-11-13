import { emptyIqcControl, emptyIqcSnapshot, checkedIqcSnapshot, iqcContentIssues, nextIqcErrorCode, nextIqcCheckNo, type IqcControl, type IqcSnapshot } from './iqc';
import { parse } from './process-state';
import { DraftConflict, applyDraftCommand, stableDraftJSON, type SharedDraft, type DraftPatch } from './shared-draft';
import { effectiveVersion, type WorkflowAdapter } from './versioned-shared-workflow';
import {isImmutableRecordBody} from './state-records';
import {iqcRevivedWorking,assertIqcRevivalResult,assertIqcRevivalCommand} from './iqc-local-save';

export type IqcWorkflowControl=IqcControl & {workflow?:SharedDraft<IqcSnapshot>};
export function parseIqcWorkflow(raw:string|undefined,prepared?:unknown):IqcWorkflowControl{
  if(raw===undefined)return emptyIqcControl();
  const control=(prepared||JSON.parse(raw)) as IqcWorkflowControl;
  if(control.schemaVersion!==1||!Array.isArray(control.versions)||!Array.isArray(control.issues)||!Array.isArray(control.reservedErrorCodes)||!Array.isArray(control.reservedCheckNos)||
    !control.versions.every(v=>prepared&&isImmutableRecordBody(v.snapshot)||v.snapshot&&['categories','suppliers','parts','errors','items'].every(k=>Array.isArray(v.snapshot[k as keyof IqcSnapshot]))))
    throw new DraftConflict('IQC_EXISTING_DATA_INVALID',422);
  return control;
}
const editableFields:Record<keyof IqcSnapshot,string[]>={categories:['nameVi'],suppliers:['nameVi'],
  parts:['nameVi','specificationVi','categoryId','supplierIds','photos','isEnabled','isDeleted'],errors:['nameVi','isDeleted'],
  items:['nameVi','toolVi','methodVi','rules','isEnabled','inspectionSpecVi','inspectionMode','equipmentId','mediaItems','isDeleted']};
export const iqcWorkflowAdapter:WorkflowAdapter<IqcSnapshot,IqcWorkflowControl>={
  key:'iqcMasterControl',scope:'iqc',parse:parseIqcWorkflow,empty:emptyIqcSnapshot,
  preparedModel:true,permissionOnlyRead:true,
  beforeCommand:(_control,command)=>assertIqcRevivalCommand(command),
  requiresCreate:(_control,command)=>command.action==='save'&&command.moduleAction==='save-local-revive-v1'&&Array.isArray(command.input?.reviveRows)&&command.input.reviveRows.length>0,
  draftMissing:content=>iqcContentIssues(content).filter(issue=>issue.kind==='missing'),
  photoPrefix:'iqc/photos/',photoIds:content=>[...content.parts.flatMap(p=>p.photos.map(p=>p.id)),...content.items.flatMap(i=>(i.mediaItems||[]).map(p=>p.id))],
  context(control,state,base){
    const equipment=parse(state.values.routineEquipmentControl,{}) as {activeVersionId?:string;versions?:{id:string;status:string;equipment:{id:string;enabled?:boolean;assetCode?:string;pieceMark?:string;name?:string;nameVi?:string;spec?:string;photoId?:string}[]}[]};
    const selected=new Map((equipment.versions?.find(v=>v.id===equipment.activeVersionId&&v.status==='approved')?.equipment||[]).map(e=>[e.id,e]));
    return {...base,validateRevivedEquipment:(content:IqcSnapshot,ids:Set<string>)=>{for(const item of content.items)if(ids.has(item.id)&&item.equipmentId&&(!selected.has(item.equipmentId)||selected.get(item.equipmentId)?.enabled===false))throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);},activeId:effectiveVersion(control)?.id||null,
      restoreContent(historical,current){
        for(const kind of ['parts','errors','items'] as const)for(const row of current[kind])
          if(!historical[kind].some(old=>old.id===row.id)) (historical[kind] as typeof current[typeof kind]).push({...JSON.parse(JSON.stringify(row)),isDeleted:true});
        // Tombstoned source rows still retain their category/supplier provenance.
        for(const kind of ['categories','suppliers'] as const)for(const row of current[kind])
          if(!historical[kind].some(old=>old.id===row.id)&&historical.parts.some(p=>kind==='categories'?p.categoryId===row.id:p.supplierIds.includes(row.id)))historical[kind].push({...row});
        return historical;
      },
      semantic:content=>({...content,parts:content.parts.filter(p=>!p.isDeleted),errors:content.errors.filter(e=>!e.isDeleted),items:content.items.filter(i=>!i.isDeleted)}),
      structure(content,previous){
        // Request-local only; retain original strict equality for unusual IDs.
        const indexed=previous.items.every(item=>typeof item.id==='string')&&content.items.every(item=>typeof item.id==='string');
        const previousById=new Map<string,typeof previous.items[number]>();
        if(indexed)for(const item of previous.items)if(!previousById.has(item.id))previousById.set(item.id,item);
        for(const item of content.items){const old=indexed?previousById.get(item.id):previous.items.find(i=>i.id===item.id);
          if(!item.equipmentId){item.equipmentSnapshot=null;continue;}
          if(old?.equipmentId===item.equipmentId){item.equipmentSnapshot=old.equipmentSnapshot;continue;}
          const e=selected.get(item.equipmentId);if(!e||e.enabled===false)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
          item.equipmentSnapshot={id:e.id,assetCode:e.assetCode||'',pieceMark:e.pieceMark||'',name:e.name||e.nameVi||'',spec:e.spec||'',...(e.photoId?{photoId:e.photoId}:{})};
        }
        try{checkedIqcSnapshot(previous,content,true);}catch(error){throw new DraftConflict(error instanceof Error?error.message:'INVALID_STRUCTURE',422);}
      },
      validate(content){return [...iqcContentIssues(content),
        ...content.items.filter(i=>!i.isDeleted&&i.equipmentId&&(!selected.has(i.equipmentId)||selected.get(i.equipmentId)?.enabled===false)).map(i=>({kind:'error' as const,path:['items',{id:i.id},'equipmentId'],message:'EQUIPMENT_UNAVAILABLE'}))];}
    };
  },
  apply(control,command,context){
    const flow=control.workflow!;
    if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
    if(command.action==='save'&&['save-local-v1','save-local-revive-v1'].includes(command.moduleAction||'')){
      if(!context.allowed('view')||!context.allowed('edit'))throw new DraftConflict('FORBIDDEN',403);
      // Apply only in request memory. The route persists the final saved state once.
      const staged=structuredClone(control),patches=structuredClone(command.patches||[]),revived=iqcRevivedWorking(control,command);
      if(revived)staged.workflow!.working=revived;
      for(const patch of patches){
        if(patch.op!=='insert')continue;
        const row=patch.value as Record<string,unknown>;
        if(patch.path.length!==1||!row||typeof row.id!=='string')throw new DraftConflict('INVALID_PATCH',422);
        if(patch.path[0]==='errors'){
          const part=staged.workflow!.working.parts.find(p=>p.code===row.partCode&&!p.isDeleted)||patches.filter(p=>p.op==='insert').find(p=>p.path[0]==='parts'&&(p.value as Record<string,unknown>)?.code===row.partCode)?.value as Record<string,unknown>|undefined;
          if(!part)throw new DraftConflict('PART_REMOVED');
          row.code=nextIqcErrorCode(staged,String(row.partCode));staged.reservedErrorCodes.push(String(row.code));
        }
      }
      for(const patch of patches){
        if(patch.op!=='insert'||patch.path[0]!=='items')continue;
        const row=patch.value as Record<string,unknown>;
        const error=staged.workflow!.working.errors.find(e=>e.id===row.errorId&&!e.isDeleted)||patches.filter(p=>p.op==='insert').find(p=>p.path[0]==='errors'&&(p.value as Record<string,unknown>)?.id===row.errorId)?.value as Record<string,unknown>|undefined;
        if(!error)throw new DraftConflict('ERROR_REMOVED');
        row.partCode=error.partCode;row.checkNo=nextIqcCheckNo(staged,String(error.code));staged.reservedCheckNos.push(String(row.checkNo));
      }
      const fingerprint=context.commandFingerprint||stableDraftJSON(command);
      const applied=iqcWorkflowAdapter.apply(staged,{...command,action:'apply',moduleAction:undefined,patches},{...context,commandFingerprint:fingerprint,iqcLocalNumbered:true} as typeof context & {iqcLocalNumbered:boolean});
      if(applied instanceof Promise)throw new DraftConflict('INVALID_ADAPTER');
      applied.state.receipts=flow.receipts;applied.state.sequences=flow.sequences;
      const result=applyDraftCommand(applied.state,{...command,expectedRevision:undefined},{...context,commandFingerprint:fingerprint});
      if(revived){const check=(context as typeof context & {validateRevivedEquipment?:(content:IqcSnapshot,ids:Set<string>)=>void}).validateRevivedEquipment;if(!check)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);check(result.state.working,new Set(([...(command.input!.reviveRows as {collection:string;id:string}[]),...(command.input!.reviveRoots as {collection:string;id:string}[])]).filter(value=>value.collection==='items').map(value=>value.id)));}
      assertIqcRevivalResult(command,result.state.working);
      control.reservedErrorCodes=staged.reservedErrorCodes;control.reservedCheckNos=staged.reservedCheckNos;
      return result;
    }
    if(command.moduleAction){
      if(command.action!=='apply'||!['createError','createItem'].includes(command.moduleAction))throw new DraftConflict('INVALID_MODULE_ACTION',422);
      const input=command.input||{},text=(v:unknown)=>typeof v==='string'?v:'';
      let patch:DraftPatch;
      if(command.moduleAction==='createError'){
        const part=flow.working.parts.find(p=>p.code===input.partCode&&!p.isDeleted);if(!part)throw new DraftConflict('PART_REMOVED');
        const code=nextIqcErrorCode(control,part.code);control.reservedErrorCodes.push(code);
        patch={op:'insert',path:['errors'],value:{id:'error-'+command.operationId,partCode:part.code,code,nameVi:text(input.nameVi)}};
      }else{
        const error=flow.working.errors.find(e=>e.id===input.errorId&&!e.isDeleted);if(!error)throw new DraftConflict('ERROR_REMOVED');
        const checkNo=nextIqcCheckNo(control,error.code);control.reservedCheckNos.push(checkNo);
        patch={op:'insert',path:['items'],value:{id:'item-'+command.operationId,partCode:error.partCode,errorId:error.id,checkNo,nameVi:text(input.nameVi),toolVi:text(input.toolVi),methodVi:text(input.methodVi),frequencyRaw:'',rules:input.rules||[],isEnabled:input.isEnabled!==false,
          inspectionSpecVi:text(input.inspectionSpecVi),inspectionMode:input.inspectionMode==='equipment'?'equipment':'visual',equipmentId:text(input.equipmentId),equipmentSnapshot:null,mediaItems:input.mediaItems||[]}};
      }
      return applyDraftCommand(flow,{...command,patches:[patch]},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)});
    }
    if(command.action==='apply')for(const patch of command.patches||[]){
      const [collection,entity,field]=patch.path;
      if(typeof collection!=='string'||!Object.hasOwn(editableFields,collection))throw new DraftConflict('INVALID_COLLECTION',422);
      const rows=flow.working[collection as keyof IqcSnapshot];
      if(patch.op==='insert'){
        if(patch.path.length!==1||!['parts','categories','suppliers',...((context as typeof context & {iqcLocalNumbered?:boolean}).iqcLocalNumbered?['errors','items']:[])].includes(collection))throw new DraftConflict('SERVER_NUMBER_REQUIRED',422);
      }else if(patch.op==='remove'){
        if(patch.path.length!==2||!['categories','suppliers'].includes(collection))throw new DraftConflict('SOFT_DELETE_REQUIRED',422);
        if(!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(patch.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
      }else if(patch.op==='set'){
        if(patch.path.length!==3||!entity||typeof entity==='string'||typeof field!=='string'||!editableFields[collection as keyof IqcSnapshot].includes(field))throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
        const old=rows.find(row=>row.id===entity.id);if(!old||'isDeleted' in old&&old.isDeleted)throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
        if(!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(patch.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
      }else throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
    }
    return applyDraftCommand(flow,command,context);
  }
};
