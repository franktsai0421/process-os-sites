import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {IpqcWorkflowCommand} from './ipqc-c-workflow';
import {readIpqcCCreateRecordMutation,encodeIpqcCCreateRecordMutation,type IpqcCCreateRecordMutationHandle} from './state-records';

// Only canonical create-item Apply uses this capability. Legacy manifests,
// other commands and extra command fields retain the original full reader.
const fields=new Set(['action','moduleAction','input','operationId','clientId','sequence','generation','expectedRevision']);
const handles=new WeakMap<State,IpqcCCreateRecordMutationHandle>();
export function ipqcCCreateCommand(command:IpqcWorkflowCommand|undefined):command is IpqcWorkflowCommand{
 return !!command&&command.action==='apply'&&command.moduleAction==='create-item'&&Object.keys(command).every(key=>fields.has(key))&&
  typeof command.operationId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&typeof command.clientId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&
  typeof command.generation==='string'&&!!command.generation&&Number.isSafeInteger(command.sequence)&&command.sequence>=1&&
  (command.expectedRevision===undefined||Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0)&&
  !!command.input&&typeof command.input==='object'&&!Array.isArray(command.input)&&Object.keys(command.input).every(key=>['errorId','item','stateRevision'].includes(key))&&typeof command.input.errorId==='string'&&!!command.input.errorId;
}
export async function readIpqcCCreateMutationState(command:IpqcWorkflowCommand):Promise<State|null>{
 if(!ipqcCCreateCommand(command))return null;
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)return null;
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 // A selected-body fault is not proof that this command/state is eligible.
 // Let the original reader determine fault priority before any mutation.
 let selected:Awaited<ReturnType<typeof readIpqcCCreateRecordMutation>>;
 try{selected=await readIpqcCCreateRecordMutation(env.STATE_ARCHIVE,envelope,row.revision);}catch{return null;}
 if(!selected)return null;
 const model=selected.recordStorage.models.get('ipqcCMasterControl') as {workflow:{pendingId:string|null};versions:{status:string}[]};
 const open=model.versions.filter(version=>version&&['draft','pending','pending-test'].includes(version.status));
 if(model.workflow.pendingId!==null||open.length!==1||open[0].status!=='draft')return null;
 const state:State={revision:row.revision,values:selected.values,recordStorage:selected.recordStorage};handles.set(state,selected.handle);return state;
}
export async function encodeIpqcCCreateMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const handle=handles.get(state);
 if(!handle||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('ipqcCMasterControl'))throw Error('Invalid IPQC-C Create mutation state');
 handles.delete(state);
 return encodeIpqcCCreateRecordMutation(env.STATE_ARCHIVE,handle,state.revision,values,state.recordStorage,models.get('ipqcCMasterControl'));
}
