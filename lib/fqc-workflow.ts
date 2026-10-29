import {parse} from './process-state';
import {applyDraftCommand,DraftConflict,cloneDraft,stableDraftJSON,type SharedDraft,type DraftPatch,type DraftIssue} from './shared-draft';
import {type WorkflowAdapter,type NumericVersion} from './versioned-shared-workflow';
import {isImmutableRecordBody} from './state-records';
type Row=Record<string,unknown>&{id:string;category:string;line:string;name:string;isDeleted?:boolean};
type Item=Row&{checkNo:string;errorId:string;equipmentId?:string|null;equipmentSnapshot?:unknown;productCodes:string[];mediaItems:{id?:string;src:string;name?:string}[];isEnabled:boolean;rule?:Record<string,unknown>};
export type FqcSnapshot={errors:(Row&{code:string})[];items:Item[]};
type FqcLibrary={activeVersionId:string|null;versions:NumericVersion<FqcSnapshot>[];workflow?:SharedDraft<FqcSnapshot>};
const fields={errors:['name','isDeleted'],items:['name','description','errorId','tool','equipmentId','equipmentSnapshot','mediaItems','isEnabled','rule','isMonthly','isQuarterly','isYearly','isCustomPeriod','customPeriodText','productCodes','productRefs','products','reason','note','isDeleted']};
const text=(value:unknown)=>typeof value==='string'?value:typeof value==='number'?String(value):'';
export function fqcWorkflowAdapter():WorkflowAdapter<FqcSnapshot,FqcLibrary>{
 let root:{schemaVersion:number;libraries:Record<string,FqcLibrary>},numbers:Map<string,number|string>,abGuard:{versionId:string;codes:string[]}|null=null;
 return{key:'qualityMasterControl',scope:'fqc',empty:()=>({errors:[],items:[]}),photoPrefix:'fqc/photos/',photoIds:()=>[],
   preparedModel:true,permissionOnlyRead:true,recordMutation:'fqc-existing-set',
  needsFullHistory:command=>!!command?.patches?.some(p=>p.op==='insert'),
  parse(raw,prepared){root=(prepared|| (raw===undefined?{schemaVersion:1,libraries:{}}:JSON.parse(raw))) as typeof root;if(root.schemaVersion!==1||!root.libraries)throw new DraftConflict('FQC_EXISTING_DATA_INVALID',422);
   const lib=root.libraries.fqc||{activeVersionId:null,versions:[]};if(!Array.isArray(lib.versions))throw new DraftConflict('FQC_EXISTING_DATA_INVALID',422);
   numbers=new Map(lib.versions.map(v=>[v.id,v.number]));for(const v of lib.versions){if(!(prepared&&isImmutableRecordBody(v.snapshot))&&(!Array.isArray(v.snapshot?.errors)||!Array.isArray(v.snapshot?.items)))throw new DraftConflict('FQC_EXISTING_DATA_INVALID',422);v.number=Number(String(v.number).replace(/^V/,''));if(!Number.isInteger(v.number))throw new DraftConflict('FQC_VERSION_INVALID',422);}return lib;},
  serialize(control){root.libraries.fqc=control;return JSON.stringify({...root,libraries:{...root.libraries,fqc:{...control,versions:control.versions.map(v=>({...v,number:numbers.get(v.id)??v.number}))}}});},
  serializeModel(control){root.libraries.fqc=control;return {...root,libraries:{...root.libraries,fqc:{...control,versions:control.versions.map(v=>({...v,number:numbers.get(v.id)??v.number}))}}};},
  context(control,state,base){
   const master=parse(state.values.masterDataControl,null),effective=master?.versions?.find((v:{scope:string;status:string})=>v.scope==='AB'&&v.status==='approved');
   abGuard=effective&&stableDraftJSON(effective.snapshot)===stableDraftJSON(master.active?.AB)?{versionId:effective.id,codes:master.active.AB.products.map((p:{code:string})=>p.code).sort()}:null;
   const eq=parse(state.values.routineEquipmentControl,{}) as {activeVersionId?:string;versions?:{id:string;status:string;equipment:{id:string;enabled?:boolean;assetCode:string;pieceMark:string;name?:string;nameVi?:string;spec?:string;photoId?:string}[]}[]};
   const choices=new Map((eq.versions?.find(v=>v.id===eq.activeVersionId&&v.status==='approved')?.equipment||[]).map(e=>[e.id,e]));
   return{...base,activeId:control.activeVersionId,
    semantic:content=>({errors:content.errors.filter(e=>!e.isDeleted),items:content.items.filter(i=>!i.isDeleted)}),
    restoreContent(historical,current){for(const collection of ['errors','items'] as const)for(const row of current[collection])if(!historical[collection].some(old=>old.id===row.id))(historical[collection] as Row[]).push({...cloneDraft(row),isDeleted:true});return historical;},
    structure(content,previous){
     // Per-structure, lazy first-match indexes; malformed prior rows retain find's failure/order semantics.
     const previousIndexes=new Map<'errors'|'items',Map<string,Row>|null>();
     const previousRow=(key:'errors'|'items',id:string):Row|undefined=>{
      let index=previousIndexes.get(key);
      if(index===undefined){
       const rows=previous[key];if(!Array.isArray(rows))return (rows as Row[]).find(row=>row.id===id);
       index=new Map<string,Row>();
       for(const row of rows){if(!row||typeof row.id!=='string'){index=null;break;}if(!index.has(row.id))index.set(row.id,row);}
       previousIndexes.set(key,index);
      }
      return index?index.get(id):previous[key].find(row=>row.id===id);
     };
     for(const key of ['errors','items'] as const){const ids=new Set<string>(),codes=new Set<string>();
      if(!Array.isArray(content[key]))throw new DraftConflict('INVALID_COLLECTION',422);
      for(const row of content[key]){const code=key==='errors'?row.code:row.checkNo,old=previousRow(key,row.id);
       if(typeof row.id!=='string'||!row.id||typeof code!=='string'||!code||ids.has(row.id)||codes.has(code)||typeof row.name!=='string'||typeof row.category!=='string'||typeof row.line!=='string'||row.isDeleted!==undefined&&typeof row.isDeleted!=='boolean')throw new DraftConflict('INVALID_FQC_IDENTITY',422);
       ids.add(row.id);codes.add(code);if(old&&(old.category!==row.category||old.line!==row.line||(key==='errors'?old.code:old.checkNo)!==code))throw new DraftConflict('FQC_IDENTITY_PROTECTED',422);
      }
     }
     // Identity checks above have succeeded. Keep first-match parent lookup local
     // to this structure call, without rescanning every error for every item.
     const parentErrors=new Map<string,FqcSnapshot['errors'][number]>();
     if(content.items.length)for(const error of content.errors)if(!parentErrors.has(error.id))parentErrors.set(error.id,error);
     for(const row of content.items){const old=previousRow('items',row.id),parent=parentErrors.get(row.errorId);
      if(!row.isDeleted&&(!parent||parent.isDeleted||parent.category!==row.category))throw new DraftConflict('ERROR_PARENT_INVALID',422);
      if(!Array.isArray(row.productCodes)||row.productCodes.some(c=>typeof c!=='string')||new Set(row.productCodes).size!==row.productCodes.length||!Array.isArray(row.mediaItems)||row.mediaItems.some(p=>!p||typeof p.src!=='string'||!(/^(data:image\/(png|jpeg|webp|gif);base64,|\/)/.test(p.src)))||typeof row.isEnabled!=='boolean')throw new DraftConflict('INVALID_FQC_ITEM',422);
      if(row.equipmentId!=null&&typeof row.equipmentId!=='string')throw new DraftConflict('INVALID_EQUIPMENT',422);
      if(row.equipmentId&&/^(目視檢查|Kiểm tra bằng mắt)$/i.test(text(row.tool)))throw new DraftConflict('INVALID_EQUIPMENT_PAIR',422);
      if(row.equipmentId){if(old?.equipmentId===row.equipmentId){row.equipmentSnapshot=old.equipmentSnapshot;continue;}
       const e=choices.get(row.equipmentId);if(!e||e.enabled===false)throw new DraftConflict('EQUIPMENT_UNAVAILABLE',422);
       row.equipmentSnapshot={id:e.id,assetCode:e.assetCode,pieceMark:e.pieceMark,name:e.name||e.nameVi||'',spec:e.spec||'',photoUrl:e.photoId?'/api/routine-equipment/photo?id='+e.photoId:'',enabled:true};
       row.tool=e.pieceMark||e.assetCode;
      }else if(old&&!old.equipmentId){if(Object.hasOwn(old,'equipmentSnapshot'))row.equipmentSnapshot=old.equipmentSnapshot;else delete row.equipmentSnapshot;}else row.equipmentSnapshot=null;
     }
    },
    validate(content){const issues:DraftIssue[]=[];
     for(const row of content.errors)if(!row.isDeleted&&!row.name.trim())issues.push({kind:'missing',path:['errors',{id:row.id},'name'],message:'NAME_REQUIRED'});
     for(const i of content.items.filter(i=>!i.isDeleted)){
      if(!i.name.trim())issues.push({kind:'missing',path:['items',{id:i.id},'name'],message:'NAME_REQUIRED'});
      if(i.equipmentId&&(!choices.has(i.equipmentId)||choices.get(i.equipmentId)?.enabled===false))issues.push({kind:'error',path:['items',{id:i.id},'equipmentId'],message:'EQUIPMENT_UNAVAILABLE'});
      const r=i.rule;if(i.isEnabled&&i.productCodes.length&&(r?.cadence==='pending_confirmation'||r?.cadence==='batch'&&!(r.batchKind==='aql'?text(r.aqlValue).trim():r.batchKind==='fixed_count'?Number.isInteger(r.fixedCount)&&Number(r.fixedCount)>0:r.batchKind==='batch_quantity'?Number(r.batchQuantity)>0:r.batchKind==='custom'&&text(r.customBatchText).trim())||r?.cadence==='time'&&r.timeFrequency==='custom'&&!text(r.customTimeText).trim()))issues.push({kind:'missing',path:['items',{id:i.id},'rule'],message:'FREQUENCY_REQUIRED'});
     }return issues;}
   };
  },
  apply(control,command,context){const flow=control.workflow!;if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
   if(command.input?.expectedAB&&(!abGuard||stableDraftJSON(command.input.expectedAB)!==stableDraftJSON(abGuard)))throw new DraftConflict('AB_EFFECTIVE_CHANGED_RECONFIRM');
   if(command.action!=='apply')return applyDraftCommand(flow,command,context);
   const patches:DraftPatch[]=cloneDraft(command.patches||[]),allocate=patches.some(p=>p.op==='insert');
   const allErrors=(allocate?(context.allocationIndex?.errors as (Row&{code:string})[]|undefined)||control.versions.flatMap(v=>v.snapshot.errors):[]).concat(flow.working.errors),allItems=(allocate?(context.allocationIndex?.items as Item[]|undefined)||control.versions.flatMap(v=>v.snapshot.items):[]).concat(flow.working.items);
   for(const p of patches){const [collection,entity,field]=p.path;
    if(collection!=='errors'&&collection!=='items')throw new DraftConflict('INVALID_COLLECTION',422);
    if(p.op==='insert'&&p.path.length===1){
     if(collection==='errors'){const row=p.value as Row&{code:string};if(typeof row.category!=='string'||typeof row.line!=='string')throw new DraftConflict('CATEGORY_REQUIRED',422);const same=allErrors.filter(e=>e.category===row.category),sample=same.find(e=>/-FQC-L\d+$/i.test(e.code)),prefix=sample?sample.code.replace(/\d+$/,''):row.category.replace(/[-/()]/g,'')+'-FQC-L';row.code=prefix+String(Math.max(0,...same.map(e=>Number(e.code.match(/(\d+)$/)?.[1])||0))+1).padStart(2,'0');allErrors.push(row);}
     else{const row=p.value as Item,parent=flow.working.errors.find(e=>e.id===row.errorId&&!e.isDeleted)||patches.filter(q=>q.op==='insert'&&q.path[0]==='errors').map(q=>(q as Extract<DraftPatch,{op:'insert'}>).value as Row&{code:string}).find(e=>e.id===row.errorId&&!e.isDeleted);if(!parent)throw new DraftConflict('ERROR_PARENT_INVALID',422);const match=parent.code.match(/^(.*-FQC-L)0?(\d+)$/i),prefix=match?match[1]+Number(match[2])+'-':parent.code+'-';row.category=parent.category;row.line=parent.line;row.checkNo=prefix+String(Math.max(0,...allItems.filter(i=>i.errorId===row.errorId).map(i=>Number(i.checkNo.match(/-(\d+)$/)?.[1])||0))+1).padStart(2,'0');allItems.push(row);}
    }else{if(p.op!=='set'||p.path.length!==3||!entity||typeof entity==='string'||typeof field!=='string'||!fields[collection].includes(field))throw new DraftConflict('UNSUPPORTED_ITEM_PATCH',422);
     if(!flow.working[collection].some(r=>r.id===entity.id&&!r.isDeleted))throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
     if(!(command.guards||[]).some(g=>stableDraftJSON(g.path)===stableDraftJSON(p.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
    }
   }return applyDraftCommand(flow,{...command,patches},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)});
  }
 };
}
