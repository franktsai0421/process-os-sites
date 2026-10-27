import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
import {readProcessSaveRecordMutation,encodeProcessSaveRecordMutation,type ProcessSaveRecordMutationHandle} from './state-records';

// Fixed server-side Save capability. Other actions and noncanonical command
// fields keep the full reader, including selected-history and delete gates.
const fields=new Set(['action','operationId','clientId','sequence','generation','expectedRevision','reason','source']);
const handles=new WeakMap<State,ProcessSaveRecordMutationHandle>();
export function processSaveCommand(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 return !!command&&command.action==='save'&&Object.keys(command).every(key=>fields.has(key))&&
  typeof command.operationId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&typeof command.clientId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&
  typeof command.generation==='string'&&!!command.generation&&Number.isSafeInteger(command.sequence)&&command.sequence>=1&&
  (command.expectedRevision===undefined||Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0)&&
  (command.reason===undefined||typeof command.reason==='string')&&(command.source===undefined||typeof command.source==='string');
}
export async function readProcessSaveMutationState(command:ModuleDraftCommand):Promise<State|null>{
 if(!processSaveCommand(command))return null;
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)return null;
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 // A selected-body fault is not proof that this command/state is eligible.
 // Let the original reader determine fault priority before any mutation.
 let selected:Awaited<ReturnType<typeof readProcessSaveRecordMutation>>;
 try{selected=await readProcessSaveRecordMutation(env.STATE_ARCHIVE,envelope,row.revision);}catch{return null;}
 if(!selected)return null;
 const model=selected.recordStorage.models.get('processAuthoringControl') as {workflow:{pendingId:string|null};versions:{status:string}[]};
 const open=model.versions.filter(version=>version&&['draft','pending','pending-test'].includes(version.status));
 if(model.workflow.pendingId!==null||open.length!==1||open[0].status!=='draft')return null;
 const state:State={revision:row.revision,values:selected.values,recordStorage:selected.recordStorage};handles.set(state,selected.handle);return state;
}
export async function encodeProcessSaveMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const handle=handles.get(state);
 if(!handle||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('processAuthoringControl'))throw Error('Invalid Process Save mutation state');
 handles.delete(state);
 return encodeProcessSaveRecordMutation(env.STATE_ARCHIVE,handle,state.revision,values,state.recordStorage,models.get('processAuthoringControl'));
}
