import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
import {stableDraftJSON} from './shared-draft';
import {readFqcRecordMutation,encodeFqcRecordMutation,type FqcRecordMutationHandle} from './state-records';

// Fixed server capability, never a request-provided read/write-set.
const fields:Record<string,Set<string>>={errors:new Set(['name']),items:new Set(['name','description','errorId','tool','equipmentId','equipmentSnapshot','mediaItems','isEnabled','rule','isMonthly','isQuarterly','isYearly','isCustomPeriod','customPeriodText','productCodes','productRefs','products','reason','note'])};
const handles=new WeakMap<State,FqcRecordMutationHandle>();
const containsReference=(v:unknown):boolean=>!!v&&typeof v==='object'&&(Object.hasOwn(v,'__immutableBody')||Object.values(v).some(containsReference));
export function fqcExistingSetCommand(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 try{
  if(!command||command.action!=='apply'||command.moduleAction!==undefined||command.caseId!==undefined||command.restoreSaveId!==undefined||!Array.isArray(command.patches)||!command.patches.length||command.patches.length>256||!Array.isArray(command.guards)||command.guards.some(g=>!g||!Array.isArray(g.path)))return false;
  return command.patches.every(p=>{
   if(!p||p.op!=='set'||!Array.isArray(p.path)||p.path.length!==3||containsReference(p.value))return false;
   const [collection,entity,field]=p.path;
   return (collection==='errors'||collection==='items')&&typeof field==='string'&&fields[collection].has(field)&&!!entity&&typeof entity==='object'&&!Array.isArray(entity)&&typeof entity.id==='string'&&command.guards!.some(g=>stableDraftJSON(g.path)===stableDraftJSON(p.path));
  });
 }catch{return false;}
}

export async function readFqcMutationState(command:ModuleDraftCommand):Promise<State|null>{
 if(!fqcExistingSetCommand(command))return null;
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)return null;
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 // A selected-body fault is not proof that this command/state is eligible.
 // Let the original reader determine fault priority before any mutation.
 let selected:Awaited<ReturnType<typeof readFqcRecordMutation>>;
 try{selected=await readFqcRecordMutation(env.STATE_ARCHIVE,envelope,row.revision);}catch{return null;}
 if(!selected)return null;
 const root=selected.recordStorage.models.get('qualityMasterControl') as {libraries:{fqc:{workflow:{pendingId:string|null;working:Record<string,{id:string;isDeleted?:boolean}[]>};versions:{status:string}[]}}},lib=root.libraries.fqc;
 if(lib.workflow.pendingId||!Array.isArray(lib.versions)||lib.versions.find(v=>v&&['draft','pending','pending-test'].includes(v.status))?.status!=='draft')return null;
 for(const patch of command.patches!){const rows=lib.workflow.working?.[patch.path[0] as string],entity=patch.path[1] as {id:string};if(!Array.isArray(rows)||rows.filter(r=>r&&r.id===entity.id&&!r.isDeleted).length!==1)return null;}
 const state:State={revision:row.revision,values:selected.values,recordStorage:selected.recordStorage};handles.set(state,selected.handle);return state;
}
export async function encodeFqcMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const handle=handles.get(state);
 if(!handle||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('qualityMasterControl'))throw Error('Invalid FQC mutation state');
 handles.delete(state);
 return encodeFqcRecordMutation(env.STATE_ARCHIVE,handle,state.revision,values,state.recordStorage,models.get('qualityMasterControl'));
}
