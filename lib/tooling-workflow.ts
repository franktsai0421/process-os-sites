import {parse} from './process-state';
import {applyDraftCommand,cloneDraft,DraftConflict,stableDraftJSON,type DraftPatch} from './shared-draft';
import {effectiveVersion,type VersionedControl,type WorkflowAdapter} from './versioned-shared-workflow';
import {emptyTooling,checkTooling,toolingIssues,toolingLocation,same,type ToolingSnapshot} from './tooling';
export type ToolingControl=VersionedControl<ToolingSnapshot>&{schemaVersion:1;reservedCodes:Record<string,string[]>;importSource?:string;transferApprovals?:Record<string,{caseId:string;approvedAt:string;approvedBy:string;versionNumber:number}>};
export function parseTooling(raw?:string,prepared?:unknown):ToolingControl{const c=(prepared||(raw?JSON.parse(raw):{schemaVersion:1,activeVersionId:null,versions:[],reservedCodes:{}})) as ToolingControl;if(c.schemaVersion!==1||!Array.isArray(c.versions)||!c.reservedCodes)throw new DraftConflict('TOOLING_EXISTING_DATA_INVALID',422);return c;}
const fields:Record<keyof ToolingSnapshot,string[]>={tools:['nameVi','nameZh','categoryId','assetCode','specification','quantity','unit','manufacturerId','location','inboundDate','inboundDateLost','enabled','inactiveReason','archived','archiveReason','notes','frequencyMonths','inspectionFrequency','photos','iqcIds'],categories:['nameVi','nameZh'],custodians:['nameVi','nameZh'],suppliers:['nameVi','nameZh','erp','addresses','phones','contacts'],manufacturers:['nameVi','nameZh','erp','addresses','phones','contacts'],transfers:['from','to','reason','correctionOf']};
function serialized(control:ToolingControl){
 for(const c of control.workflow?.cases||[])if(c.status==='approved'&&c.result&&Array.isArray(c.content.transfers))for(const tr of c.content.transfers){control.transferApprovals||={};control.transferApprovals[tr.id]||={caseId:c.id,approvedAt:c.result.at,approvedBy:c.result.actor.name,versionNumber:control.versions.find(v=>v.id===c.id)!.number};}
 return control;
}
export const toolingWorkflowAdapter:WorkflowAdapter<ToolingSnapshot,ToolingControl>={
 key:'toolingMasterControl',scope:'tooling',parse:parseTooling,empty:emptyTooling,preparedModel:true,photoPrefix:'tooling/photos/',photoIds:s=>s.tools.flatMap(t=>t.photos.map(p=>p.id)),
 serializeModel:serialized,serialize:control=>JSON.stringify(serialized(control)),
 async access(_request,_state,permissions){return {...permissions,history:permissions.view};},
 context(control,state,base){
  const active=effectiveVersion(control)?.snapshot||emptyTooling();
  const iqc=parse(state.values.iqcMasterControl,{activeVersionId:null,versions:[]}) as {activeVersionId:string|null;versions:{id:string;status:string;snapshot:{parts:{id:string;isDeleted?:boolean;isEnabled?:boolean}[]}}[]};
  const iqcParts=iqc.versions.find(v=>v.id===iqc.activeVersionId&&v.status==='approved')?.snapshot.parts||[],iqcIds=new Set(iqcParts.filter(p=>!p.isDeleted&&p.isEnabled!==false).map(p=>p.id));
  return {...base,activeId:control.activeVersionId,advisoryPolicy:'tooling-completeness-v1',semantic:s=>s,validate:s=>[...toolingIssues(s),...s.tools.flatMap(t=>t.iqcIds.filter(id=>!iqcIds.has(id)).map(id=>({kind:'missing' as const,code:'TOOLING_IQC_SOURCE_UNAVAILABLE',path:['tools',{id:t.id},'iqcIds'],message:(iqcParts.some(p=>p.id===id&&!p.isDeleted)?'IQC đã ngưng / IQC 已停用':'IQC đã bị gỡ; cần đối chiếu lại / IQC 來源已移除／待重新對應')+' · '+id})))],
   structure(content,previous){checkTooling(content);
    for(const key of Object.keys(fields) as (keyof ToolingSnapshot)[])for(const old of previous[key]){const next=content[key].find(r=>r.id===old.id);if(!next){if(active[key].some(r=>r.id===old.id)||key==='tools'&&previous.transfers.some(t=>t.toolId===old.id))throw new DraftConflict('TOOLING_HISTORY_DELETE_FORBIDDEN',422);continue;}
     if('code'in old&&!same(old.code,'code'in next?next.code:undefined))throw new DraftConflict('TOOLING_CODE_IMMUTABLE',422);
     if('source'in old&&!same(old.source,'source'in next?next.source:undefined))throw new DraftConflict('TOOLING_SOURCE_IMMUTABLE',422);
    }
    for(const t of content.tools){const old=previous.tools.find(x=>x.id===t.id),formal=active.tools.find(x=>x.id===t.id);if(formal&&!same(t.location,formal.location))throw new DraftConflict('TOOLING_USE_TRANSFER',422);
     if(t.iqcIds.some(id=>!old?.iqcIds.includes(id)&&!iqcIds.has(id)))throw new DraftConflict('TOOLING_IQC_REFERENCE_NOT_APPROVED',422);
    }
    for(const group of ['categories','custodians','suppliers','manufacturers'] as const)for(const old of previous[group])if(!content[group].some(c=>c.id===old.id)&&content.tools.some(t=>t.categoryId===old.id||t.manufacturerId===old.id||t.location.holderId===old.id||content.transfers.some(x=>x.from.holderId===old.id||x.to.holderId===old.id)))throw new DraftConflict('TOOLING_CATALOG_REFERENCED',422);
   for(const [index,tr] of content.transfers.entries()){const old=previous.transfers.find(x=>x.id===tr.id),formal=active.transfers.find(x=>x.id===tr.id);if(formal&&!same(tr,formal))throw new DraftConflict('TOOLING_TRANSFER_IMMUTABLE',422);
     if(!formal){const owner=content.tools.find(x=>x.id===tr.toolId)!;const holder=(l:typeof tr.to)=>(l.kind==='internal'?content.custodians:content.suppliers).some(c=>c.id===l.holderId);if(tr.from.holderId&&!holder(tr.from)||tr.to.holderId&&!holder(tr.to))throw new DraftConflict('TOOLING_TRANSFER_HOLDER_INVALID',422);
      if(tr.correctionOf){if(!active.transfers.some(t=>t.id===tr.correctionOf&&t.toolId===tr.toolId))throw new DraftConflict('TOOLING_CORRECTION_NOT_APPROVED',422);}
      else if(!same(tr.from,toolingLocation({...content,transfers:content.transfers.slice(0,index)},tr.toolId)))throw new DraftConflict('TOOLING_TRANSFER_SOURCE_CHANGED',409);
      if(!old){tr.createdAt=base.at;tr.createdBy=base.actor.name;tr.createdById=base.actor.id;if(!owner)throw new DraftConflict('TOOLING_TRANSFER_INVALID',422);}
      else for(const key of ['createdAt','createdBy','createdById'] as const)tr[key]=old[key];
      tr.quantity=old?.quantity??owner.quantity;tr.unit=old?.unit??owner.unit;
      if(!old||!same(tr,old)){tr.updatedAt=base.at;tr.updatedBy=base.actor.name;tr.updatedById=base.actor.id;}
     }
    }
   },
   restoreContent(historical){for(const key of Object.keys(fields) as (keyof ToolingSnapshot)[])for(const row of active[key])if(!historical[key].some(r=>r.id===row.id))(historical[key] as {id:string}[]).push(cloneDraft(row));return historical;}
  };
 },
 apply(control,command,context){const flow=control.workflow!;if(flow.receipts[command.operationId])return applyDraftCommand(flow,command,context);
  // Tooling retains its explicitly confirmed no-change restriction.
  if(command.action==='submit'&&flow.saved&&flow.active.id&&same(flow.saved.content,flow.active.content))throw new DraftConflict('NO_SUBSTANTIVE_CHANGE',422);
  if(command.action!=='apply')return applyDraftCommand(flow,command,context);
  let patches:DraftPatch[]=cloneDraft(command.patches||[]);
  if(command.moduleAction==='import-20261006'){
   if(!context.actor.admin)throw new DraftConflict('FORBIDDEN',403);
   if(control.activeVersionId||control.importSource||Object.values(flow.working).some(rows=>rows.length))throw new DraftConflict('TOOLING_IMPORT_EXISTING_DATA_CONFLICT');
   const payload=command.input?.snapshot as ToolingSnapshot;checkTooling(payload);
   const sha='2233ceda38df530749749a2370be7c4513b155b42afd5de3627ecb8158f9b981';
   if(payload.tools.length!==366||payload.transfers.length||payload.tools.some(t=>(t.source as {sha256?:string})?.sha256!==sha))throw new DraftConflict('TOOLING_IMPORT_SOURCE_INVALID',422);
   patches=Object.entries(payload).map(([key,value])=>({op:'set',path:[key],value}));control.importSource=sha;
   for(const key of ['categories','suppliers','manufacturers','tools'] as const)control.reservedCodes[key]=payload[key].map(r=>r.code!);
  }else{
   if(command.moduleAction)throw new DraftConflict('TOOLING_ACTION_INVALID',422);
   for(const p of patches){const [key,entity,field]=p.path;if(typeof key!=='string'||!Object.hasOwn(fields,key))throw new DraftConflict('TOOLING_INVALID_COLLECTION',422);const collection=key as keyof ToolingSnapshot;
    if(p.op==='insert'){
     if(p.path.length!==1)throw new DraftConflict('TOOLING_INVALID_INSERT',422);
     const allowed=new Set(['id',...fields[collection],...(collection==='transfers'?['toolId']:[])]);if(Object.keys(p.value).some(k=>!allowed.has(k)))throw new DraftConflict('TOOLING_SOURCE_IMMUTABLE',422);
     if(['tools','categories','suppliers','manufacturers'].includes(key)){
      const category=collection==='tools'?flow.working.categories.find(c=>c.id===p.value.categoryId):null;if(collection==='tools'&&p.value.categoryId&&!category)throw new DraftConflict('TOOLING_CATEGORY_INVALID',422);
      const prefix=collection==='tools'?(category?.code||'DC00')+'-':({categories:'DC',suppliers:'SUP',manufacturers:'MFR'} as Record<string,string>)[collection];
      const reserved=new Set([...(control.reservedCodes[key]||[]),...flow.working[collection].map(r=>'code'in r?String(r.code):'')]);const max=Math.max(0,...[...reserved].filter(c=>c.startsWith(prefix)).map(c=>Number(c.slice(prefix.length))||0));const code=prefix+String(max+1).padStart(collection==='tools'?4:collection==='categories'?2:3,'0');p.value.code=code;control.reservedCodes[key]=[...reserved,code];
     }
    }else{if(!entity||typeof entity==='string'||!flow.working[collection].some(r=>r.id===entity.id))throw new DraftConflict('ENTITY_REMOVED_OR_AMBIGUOUS');
     if(p.op==='remove'){if(p.path.length!==2)throw new DraftConflict('TOOLING_INVALID_PATCH',422);}
     else if(p.op!=='set'||p.path.length!==3||typeof field!=='string'||!fields[collection].includes(field))throw new DraftConflict('TOOLING_INVALID_PATCH',422);
     if(!(command.guards||[]).some(g=>same(g.path,p.path)))throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED',422);
    }
   }
  }
  return applyDraftCommand(flow,{...command,patches},{...context,commandFingerprint:context.commandFingerprint||stableDraftJSON(command)});
 }
};
