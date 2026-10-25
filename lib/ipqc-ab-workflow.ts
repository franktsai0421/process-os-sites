import {parseAbControl,catalogFromMaster,checkedAbSnapshot,abDraftIssues,nextAbCode,copyAb,openAb,activeAb,type AbScope,type AbSnapshot,type AbControl,type AbItem,type AbError} from './ipqc-ab';
import {parse} from './process-state';
import {applyDraftCommand,DraftConflict,stableDraftJSON,type SharedDraft,type DraftPatch} from './shared-draft';
import {type WorkflowAdapter,type VersionedControl} from './versioned-shared-workflow';

export type AbSharedScope=AbScope&{workflow?:SharedDraft<AbSnapshot>};
export function abWorkflowAdapter(key:string):WorkflowAdapter<AbSnapshot,AbSharedScope>{
  let root:AbControl&{moduleDraft?:VersionedControl<unknown>},allowedStages=new Set<string>();
  const separator=key.indexOf(':'),line=key.slice(0,separator),group=key.slice(separator+1);
  return{key:'ipqcABMasterControl',scope:'ipqc-ab:'+key,empty:()=>({errors:[],items:[]}),photoPrefix:'ipqc-ab/photos/',
    preparedModel:true,permissionOnlyRead:true,
    beforeBegin(){if(root.moduleDraft?.workflow?.pendingId)throw new DraftConflict('PENDING_LOCKED');},
    beforeCommand(_control,command){
      if(root.moduleDraft?.workflow?.pendingId)throw new DraftConflict('PENDING_LOCKED');
      if(['save','submit'].includes(command.action))throw new DraftConflict('WHOLE_MODULE_ACTION_REQUIRED');
      if(command.caseId&&root.moduleDraft?.workflow?.cases.some(c=>c.id===command.caseId))throw new DraftConflict('WHOLE_MODULE_ACTION_REQUIRED');
    },
    needsFullHistory:command=>['create-error','create-item'].includes(command?.moduleAction||''),
    photoIds:content=>content.items.flatMap(i=>[...i.standardPhotos,...i.methodPhotos].map(p=>p.id)),
    parse(raw,prepared){root=parseAbControl(raw,prepared);return root.scopes[key]||{line,group,activeVersionId:null,versions:[]};},
    serialize(control){root.scopes[key]=control;return JSON.stringify(root);},
    serializeModel(control){root.scopes[key]=control;return root;},
    context(control,state,base){
      const catalog=catalogFromMaster(state.values.masterDataControl);
      allowedStages=new Set(catalog.stages.filter(s=>s.line===line).map(s=>s.code));
      if(separator<1||!catalog.groups.some(g=>g.line===line&&g.name===group))throw new DraftConflict('SCOPE_INVALID',422);
      const equipment=parse(state.values.routineEquipmentControl,{}) as {activeVersionId?:string;versions?:{id:string;status:string;equipment:{id:string;enabled?:boolean;assetCode:string;pieceMark:string;name?:string;nameVi?:string;photoId?:string}[]}[]};
      const choices=new Map((equipment.versions?.find(v=>v.id===equipment.activeVersionId&&v.status==='approved')?.equipment||[]).map(e=>[e.id,e]));
      return{...base,activeId:control.activeVersionId,advisoryPolicy:'ipqc-completeness-v1',
        restoreContent(historical,current){for(const collection of ['errors','items'] as const)for(const row of current[collection])if(!historical[collection].some(old=>old.id===row.id))(historical[collection] as (AbError|AbItem)[]).push({...copyAb(row),deleted:true});return historical;},
        semantic:content=>({errors:content.errors.filter(e=>!e.deleted),items:content.items.filter(i=>!i.deleted)}),
        structure(content,previous){
          if(content.items.some(i=>i.inspectionMode==='visual'&&i.equipmentId))throw new DraftConflict('INVALID_EQUIPMENT_PAIR',422);
          const version=openAb(control)||activeAb(control)||{id:'initial',number:1,status:'draft' as const,revision:1,snapshot:previous,baseVersionId:null,creatorId:base.actor.id,creatorName:base.actor.name,createdAt:base.at,updatedAt:base.at,history:[]};
          try{const checked=checkedAbSnapshot({...version,snapshot:previous},content,catalog,line,group,true);content.errors=checked.errors;content.items=checked.items;}catch(e){throw new DraftConflict(e&&typeof e==='object'&&'message'in e&&typeof e.message==='string'?e.message:'INVALID_STRUCTURE',422);}
          for(const item of content.items){const old=previous.items.find(i=>i.id===item.id);
            if(item.inspectionMode==='visual'){item.equipmentId='';item.equipmentSnapshot=null;continue;}
            if(!item.equipmentId)throw new DraftConflict('EQUIPMENT_REQUIRED',422);
            if(old?.equipmentId===item.equipmentId){item.equipmentSnapshot=old.equipmentSnapshot;continue;}
            const e=choices.get(item.equipmentId);if(!e||e.enabled===false)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
            item.equipmentSnapshot={id:e.id,assetCode:e.assetCode,pieceMark:e.pieceMark,name:e.name||e.nameVi||'',...(e.photoId?{photoId:e.photoId}:{})};
          }
        },
        validate(content){return[...abDraftIssues(content,catalog,line,group),
          ...content.errors.filter(e=>!e.deleted&&!e.name.trim()).map(e=>({kind:'missing' as const,path:['errors',{id:e.id},'name'],message:'NAME_REQUIRED'})),
          ...content.items.filter(i=>!i.deleted&&i.equipmentId&&(!choices.has(i.equipmentId)||choices.get(i.equipmentId)?.enabled===false)).map(i=>({kind:'error' as const,path:['items',{id:i.id},'equipmentId'],message:'EQUIPMENT_UNAVAILABLE'}))];}
      };
    },
    apply(control,command,context){
      const flow=control.workflow!;if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
      if(command.moduleAction){
        if(command.action!=='apply'||!['create-error','create-item','delete-error','delete-item'].includes(command.moduleAction))throw new DraftConflict('INVALID_MODULE_ACTION',422);
        const input=command.input||{},patches:DraftPatch[]=[],previous=copyAb(flow.working),text=(v:unknown)=>typeof v==='string'?v:'';
        if(command.moduleAction==='create-error'){
          const stageCode=text(input.stageCode);if(!allowedStages.has(stageCode))throw new DraftConflict('STAGE_INVALID',422);
          const row:AbError={id:'error-'+command.operationId,code:nextAbCode(root,'error',`${line}-${group}-${stageCode.slice(2)}-L`,context.allocationIndex),line,group,stageCode,name:text(input.name),sourceRows:[],deleted:false};
          previous.errors.push(row);patches.push({op:'insert',path:['errors'],value:row});
        }else if(command.moduleAction==='create-item'){
          const parent=flow.working.errors.find(e=>e.id===input.errorId&&!e.deleted);if(!parent)throw new DraftConflict('ERROR_REMOVED');
          const row:AbItem={id:'item-'+command.operationId,code:nextAbCode(root,'item',parent.code+'-',context.allocationIndex),errorId:parent.id,standard:'',methodText:'',inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:true,rules:[],standardPhotos:[],methodPhotos:[],productCodes:[],sourceRows:[],sourceTool:'',sourceMethod:'',sourceFrequency:'',reason:'',deleted:false};
          previous.items.push(copyAb(row));
          const editable=input.item as Partial<AbItem>|undefined;
          if(editable)for(const field of ['standard','methodText','inspectionMode','equipmentId','isEnabled','rules','standardPhotos','methodPhotos','productCodes','reason'] as const)
            if(editable[field]!==undefined)Object.assign(row,{[field]:editable[field]});
          patches.push({op:'insert',path:['items'],value:row});
        }else{const kind=command.moduleAction==='delete-error'?'errors':'items',row=flow.working[kind].find(e=>e.id===input.id&&!e.deleted);
          if(!row)throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');if(kind==='errors'&&flow.working.items.some(i=>i.errorId===row.id&&!i.deleted))throw new DraftConflict('ERROR_IN_USE',422);
          patches.push({op:'set',path:[kind,{id:row.id},'deleted'],value:true});}
        return applyDraftCommand(flow,{...command,patches},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command),structure(content){context.structure(content,previous);}});
      }
      if(command.action==='apply')for(const p of command.patches||[]){
        const [collection,entity,field]=p.path,fields=collection==='errors'?['name']:['standard','methodText','inspectionMode','equipmentId','isEnabled','rules','standardPhotos','methodPhotos','productCodes','reason'];
        if(p.op!=='set'||p.path.length!==3||typeof collection!=='string'||!['errors','items'].includes(collection)||!entity||typeof entity==='string'||typeof field!=='string'||!fields.includes(field))throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
        if(!flow.working[collection as keyof AbSnapshot].some(r=>r.id===entity.id&&!r.deleted))throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
        if(!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(p.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
      }
      return applyDraftCommand(flow,command,context);
    }
  };
}
