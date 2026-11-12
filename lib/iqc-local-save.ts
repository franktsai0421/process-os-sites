import {DraftConflict,stableDraftJSON,cloneDraft} from './shared-draft';
import type {IqcSnapshot} from './iqc';
import type {IqcWorkflowControl} from './iqc-workflow';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
type Kind='parts'|'errors'|'items';
type Row=Record<string,unknown>;
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const kinds:Kind[]=['parts','errors','items'];
const key=(kind:Kind,id:string)=>JSON.stringify([kind,id]);
const path=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.length<=32&&value.every(step=>typeof step==='string'?!!step&&!['__proto__','constructor','prototype'].includes(step):object(step)&&typeof step.id==='string'&&!!step.id&&Object.keys(step).length===1);
export function assertIqcRevivalCommand(command:ModuleDraftCommand):void{
 if(command.moduleAction!=='save-local-revive-v1')return;
 if(command.action!=='save'||!Array.isArray(command.patches)||command.patches.length>4096||!command.patches.every(patch=>object(patch)&&path(patch.path)&&(patch.op==='set'?Object.hasOwn(patch,'value'):patch.op==='insert'?object(patch.value):patch.op==='remove'))||!Array.isArray(command.guards)||!command.guards.every(guard=>object(guard)&&path(guard.path)))throw new DraftConflict('INVALID_IQC_LOCAL_REVIVAL',422);
}
/** Explicit current-draft revival only; never imports an historical snapshot. */
export function iqcRevivedWorking(control:IqcWorkflowControl,command:ModuleDraftCommand):IqcSnapshot|null{
 assertIqcRevivalCommand(command);
 const input=command.input;
 if(command.moduleAction==='save-local-v1'){if(input?.reviveRows!==undefined||input?.reviveRoots!==undefined||input?.draftVersionId!==undefined)throw new DraftConflict('INVALID_IQC_LOCAL_REVIVAL',422);return null;}
 const fail=()=>{throw new DraftConflict('IQC_REVIVE_CHANGED_RECONFIRM');};
 if(command.action!=='save'||command.moduleAction!=='save-local-revive-v1'||!object(input)||Object.keys(input).some(field=>!['reviveRows','reviveRoots','draftVersionId'].includes(field))||!Array.isArray(input.reviveRows)||!input.reviveRows.length||input.reviveRows.length>256||!Array.isArray(input.reviveRoots)||!input.reviveRoots.length||input.reviveRoots.length>256||typeof input.draftVersionId!=='string'||!Number.isSafeInteger(command.expectedRevision))throw new DraftConflict('INVALID_IQC_LOCAL_REVIVAL',422);
 const flow=control.workflow!;
 if(command.expectedRevision!==flow.revision||command.generation!==flow.generation||flow.pendingId||control.versions.filter(value=>value.status==='draft').length!==1||!control.versions.some(value=>value.status==='draft'&&value.id===input.draftVersionId))fail();
 const working=cloneDraft(flow.working),required=new Map<string,{collection:Kind;id:string;row:Row}>(),roots=new Set<string>();
 const unique=(kind:Kind,predicate:(row:Row)=>boolean):Row=>{const matches=(working[kind] as unknown as Row[]).filter(predicate);if(matches.length!==1)fail();return matches[0];};
 const collect=(kind:Kind,row:Row)=>{
  if(typeof row.id!=='string'||!row.id)fail();
  if(row.isDeleted===true)required.set(key(kind,String(row.id)),{collection:kind,id:String(row.id),row});
  if(kind==='items'){
   const error=unique('errors',value=>value.id===row.errorId);if(error.partCode!==row.partCode)fail();collect('errors',error);
  }else if(kind==='errors')collect('parts',unique('parts',value=>value.code===row.partCode));
 };
 for(const value of input.reviveRoots){
  if(!object(value)||Object.keys(value).sort().join(',')!=='collection,id,row'||!kinds.includes(value.collection as Kind)||typeof value.id!=='string'||!object(value.row)||value.row.id!==value.id)throw new DraftConflict('INVALID_IQC_LOCAL_REVIVAL',422);
  const kind=value.collection as Kind,id=value.id,rootKey=key(kind,id);if(roots.has(rootKey))fail();roots.add(rootKey);
  const row=unique(kind,candidate=>candidate.id===id);if(stableDraftJSON(row)!==stableDraftJSON(value.row))fail();collect(kind,row);
 }
 const supplied=new Set<string>();
 for(const value of input.reviveRows){
  if(!object(value)||Object.keys(value).sort().join(',')!=='collection,id,tombstone'||!kinds.includes(value.collection as Kind)||typeof value.id!=='string'||!object(value.tombstone)||value.tombstone.id!==value.id||value.tombstone.isDeleted!==true)throw new DraftConflict('INVALID_IQC_LOCAL_REVIVAL',422);
  const id=key(value.collection as Kind,value.id),entry=required.get(id);if(supplied.has(id)||!entry||stableDraftJSON(entry.row)!==stableDraftJSON(value.tombstone))fail();supplied.add(id);
 }
 if(supplied.size!==required.size)fail();
 for(const {row}of required.values())row.isDeleted=false;
 return working;
}
export function assertIqcRevivalResult(command:ModuleDraftCommand,content:IqcSnapshot):void{
 if(!Array.isArray(command.input?.reviveRoots))return;
 const fail=()=>{throw new DraftConflict('IQC_REVIVE_CHANGED_RECONFIRM');};
 const row=(kind:Kind,id:unknown)=>{const found=(content[kind] as unknown as Row[]).filter(value=>value.id===id);if(found.length!==1||found[0].isDeleted===true)fail();return found[0];};
 for(const root of command.input.reviveRoots as {collection:Kind;id:string}[]){
  const current=row(root.collection,root.id);
  if(root.collection==='items'){const error=row('errors',current.errorId);if(error.partCode!==current.partCode)fail();}
  if(root.collection!=='parts'){const parts=content.parts.filter(part=>part.code===current.partCode);if(parts.length!==1||parts[0].isDeleted===true)fail();}
 }
}
