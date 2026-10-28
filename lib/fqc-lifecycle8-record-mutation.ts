import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
import {readFqcLifecycle8RecordMutation,encodeFqcLifecycle8RecordMutation,type FqcLifecycle8RecordMutationHandle,type FqcLifecycle8Selection} from './state-records';

// A distinct server capability; neither existing-set nor generic partial reads
// acquire lifecycle write authority. Unusual fields keep the original reader.
const common=['action','operationId','clientId','sequence','generation','expectedRevision'];
const fields:Record<string,ReadonlySet<string>>={
 save:new Set([...common,'reason','source']),submit:new Set([...common,'savedId','reason']),
 withdraw:new Set([...common,'caseId','reason','selfReviewConfirmed']),
 return:new Set([...common,'caseId','reason','selfReviewConfirmed']),
 approve:new Set([...common,'caseId','reason','selfReviewConfirmed'])
};
const handles=new WeakMap<State,{handle:FqcLifecycle8RecordMutationHandle;selection:FqcLifecycle8Selection}>();
export function fqcLifecycle8Command(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 if(!command||typeof command!=='object'||Array.isArray(command)||typeof command.action!=='string'||!Object.hasOwn(fields,command.action)||!Object.keys(command).every(key=>fields[command.action].has(key)))return false;
 return typeof command.operationId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&typeof command.clientId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&
  typeof command.generation==='string'&&!!command.generation&&Number.isSafeInteger(command.sequence)&&command.sequence>=1&&
  (command.expectedRevision===undefined||Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0)&&
  (command.reason===undefined||typeof command.reason==='string')&&(command.source===undefined||typeof command.source==='string')&&
  (command.selfReviewConfirmed===undefined||typeof command.selfReviewConfirmed==='boolean')&&
  (command.action!=='submit'||typeof command.savedId==='string'&&!!command.savedId)&&
  (!['withdraw','return','approve'].includes(command.action)||typeof command.caseId==='string'&&!!command.caseId);
}
export async function readFqcLifecycle8MutationState(command:ModuleDraftCommand):Promise<State|null>{
 if(!fqcLifecycle8Command(command))return null;
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)return null;
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 const selection:FqcLifecycle8Selection={action:command.action as FqcLifecycle8Selection['action'],...(['withdraw','return','approve'].includes(command.action)?{caseId:command.caseId}:{})};
 // Preserve the original full-reader failure order until eligibility is known.
 let selected:Awaited<ReturnType<typeof readFqcLifecycle8RecordMutation>>;
 try{selected=await readFqcLifecycle8RecordMutation(env.STATE_ARCHIVE,envelope,row.revision,selection);}catch{return null;}
 if(!selected)return null;
 const root=selected.recordStorage.models.get('qualityMasterControl') as {libraries:{fqc:{workflow:{pendingId:string|null;cases:{id:string;status:string}[]};versions:{id:string;status:string}[]}}},lib=root.libraries.fqc;
 if(!Array.isArray(lib.versions)||!Array.isArray(lib.workflow.cases))return null;
 const open=lib.versions.filter(v=>v&&['draft','pending','pending-test'].includes(v.status));
 if(selection.action==='save'||selection.action==='submit'){
  if(lib.workflow.pendingId!==null||open.length!==1||open[0].status!=='draft')return null;
 }else{
  const cases=lib.workflow.cases.filter(c=>c&&c.id===selection.caseId);
  if(lib.workflow.pendingId!==selection.caseId||open.length!==1||open[0].status!=='pending'||open[0].id!==selection.caseId||cases.length!==1||cases[0].status!=='pending')return null;
 }
 const state:State={revision:row.revision,values:selected.values,recordStorage:selected.recordStorage};handles.set(state,{handle:selected.handle,selection});return state;
}
export async function encodeFqcLifecycle8MutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const binding=handles.get(state);
 if(!binding||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('qualityMasterControl'))throw Error('Invalid FQC lifecycle mutation state');
 handles.delete(state);
 return encodeFqcLifecycle8RecordMutation(env.STATE_ARCHIVE,binding.handle,state.revision,values,state.recordStorage,models.get('qualityMasterControl'),binding.selection);
}
