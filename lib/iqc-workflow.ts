import { emptyIqcControl, emptyIqcSnapshot, checkedIqcSnapshot, iqcSubmitErrors, iqcSubmitBlockingErrors, nextIqcErrorCode, nextIqcCheckNo, type IqcControl, type IqcSnapshot } from './iqc';
import { parse } from './process-state';
import { DraftConflict, applyDraftCommand, stableDraftJSON, type SharedDraft, type DraftPatch } from './shared-draft';
import { effectiveVersion, type WorkflowAdapter } from './versioned-shared-workflow';
import {isImmutableRecordBody} from './state-records';

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
  photoPrefix:'iqc/photos/',photoIds:content=>[...content.parts.flatMap(p=>p.photos.map(p=>p.id)),...content.items.flatMap(i=>(i.mediaItems||[]).map(p=>p.id))],
  context(control,state,base){
    const equipment=parse(state.values.routineEquipmentControl,{}) as {activeVersionId?:string;versions?:{id:string;status:string;equipment:{id:string;enabled?:boolean;assetCode?:string;pieceMark?:string;name?:string;nameVi?:string;spec?:string;photoId?:string}[]}[]};
    const selected=new Map((equipment.versions?.find(v=>v.id===equipment.activeVersionId&&v.status==='approved')?.equipment||[]).map(e=>[e.id,e]));
    return {...base,activeId:effectiveVersion(control)?.id||null,
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
        for(const item of content.items){const old=previous.items.find(i=>i.id===item.id);
          if(!item.equipmentId){item.equipmentSnapshot=null;continue;}
          if(old?.equipmentId===item.equipmentId){item.equipmentSnapshot=old.equipmentSnapshot;continue;}
          const e=selected.get(item.equipmentId);if(!e||e.enabled===false)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
          item.equipmentSnapshot={id:e.id,assetCode:e.assetCode||'',pieceMark:e.pieceMark||'',name:e.name||e.nameVi||'',spec:e.spec||'',...(e.photoId?{photoId:e.photoId}:{})};
        }
        try{checkedIqcSnapshot(previous,content,true);}catch(error){throw new DraftConflict(error instanceof Error?error.message:'INVALID_STRUCTURE',422);}
      },
      validate(content){const blocked=new Set(iqcSubmitBlockingErrors(content));return [
        ...iqcSubmitErrors(content).map(message=>{
          const item=content.items.find(row=>message.startsWith(row.checkNo+' ')),part=item?undefined:content.parts.find(row=>message.startsWith(row.code+' '));
          return{kind:blocked.has(message)?'error' as const:'missing' as const,path:item?['items',{id:item.id},'rules']:part?['parts',{id:part.id},message.endsWith('零件名稱空白')?'nameVi':'categoryId']:[],message};
        }),
        ...(['categories','suppliers','errors','items'] as const).flatMap(collection=>content[collection].filter(row=>!('isDeleted' in row&&row.isDeleted)&&!row.nameVi?.trim()).map(row=>({kind:'missing' as const,path:[collection,{id:row.id},'nameVi'],message:'NAME_REQUIRED'}))),
        ...content.items.filter(i=>!i.isDeleted&&i.equipmentId&&(!selected.has(i.equipmentId)||selected.get(i.equipmentId)?.enabled===false)).map(i=>({kind:'error' as const,path:['items',{id:i.id},'equipmentId'],message:'EQUIPMENT_UNAVAILABLE'}))];}
    };
  },
  apply(control,command,context){
    const flow=control.workflow!;
    if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
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
        if(patch.path.length!==1||!['parts','categories','suppliers'].includes(collection))throw new DraftConflict('SERVER_NUMBER_REQUIRED',422);
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
