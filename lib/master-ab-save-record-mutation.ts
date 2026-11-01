import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
import {readMasterABSaveRecordMutation,encodeMasterABSaveRecordMutation,type MasterABSaveRecordMutationHandle} from './state-records';

const fields=new Set(['action','operationId','clientId','sequence','generation','expectedRevision','reason','source']);
const handles=new WeakMap<State,{handle:MasterABSaveRecordMutationHandle;command:ModuleDraftCommand;commandRaw:string}>();
export function masterABSaveCommand(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 return !!command&&command.action==='save'&&Object.keys(command).every(key=>fields.has(key))&&
  typeof command.operationId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&typeof command.clientId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&
  typeof command.generation==='string'&&!!command.generation&&Number.isSafeInteger(command.sequence)&&command.sequence>=1&&
  (command.expectedRevision===undefined||Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0)&&
  (command.reason===undefined||typeof command.reason==='string')&&(command.source===undefined||typeof command.source==='string');
}
export async function readMasterABSaveMutationState(command:ModuleDraftCommand,authorize:(state:State)=>Promise<string|void>):Promise<State|null>{
 if(!masterABSaveCommand(command))return null;
 const commandRaw=JSON.stringify(command);
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)throw Error('Current state is missing; explicit initialization is required');
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 const selected=await readMasterABSaveRecordMutation(env.STATE_ARCHIVE,envelope,row.revision,async state=>{
  const actorId=await authorize(state);
  if(!masterABSaveCommand(command)||JSON.stringify(command)!==commandRaw)throw Error('Master Save command changed');
  if(typeof actorId==='string')return {actorId,operationId:command.operationId,clientId:command.clientId,sequence:command.sequence};
 });
 if(!selected)return null;
 if(!masterABSaveCommand(command)||JSON.stringify(command)!==commandRaw)throw Error('Master Save command changed');
 handles.set(selected.state,{handle:selected.handle,command,commandRaw});
 // This is scope metadata, not a claim that unread objects are intact. Preserve
 // the original revision/refs for an explicit existing full-integrity check.
 console.info('[record-read-scope]',JSON.stringify({policy:'master-ab-save-v1',revision:row.revision,required:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','masterDataControl'],unverifiedAggregates:Object.keys(envelope.__processRecords.values).filter(key=>!Object.hasOwn(selected.state.values,key)).length}));
 return selected.state;
}
export async function encodeMasterABSaveMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const binding=handles.get(state);
 if(!binding||!masterABSaveCommand(binding.command)||JSON.stringify(binding.command)!==binding.commandRaw||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('masterDataControl'))throw Error('Invalid master AB Save mutation state');
 handles.delete(state);
 return encodeMasterABSaveRecordMutation(env.STATE_ARCHIVE,binding.handle,state.revision,values,state.recordStorage,models.get('masterDataControl'));
}
