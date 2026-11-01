import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand,VersionedControl} from './versioned-shared-workflow';
import type {SharedDraft,DraftReceipt} from './shared-draft';
import {readFqcRequiredRecordMutation,encodeFqcRequiredRecordMutation,type FqcRequiredRecordMutationHandle} from './state-records';

const common=['action','operationId','clientId','sequence','generation','expectedRevision'];
const fields={apply:new Set([...common,'patches','guards','input']),save:new Set([...common,'reason','source'])};
type Binding={handle:FqcRequiredRecordMutationHandle;command:ModuleDraftCommand;raw:string;numbers:Map<string,unknown>;basis?:VersionedControl<unknown>;flow?:SharedDraft<unknown>;flowRaw?:string;receiptRaw?:string};
const bindings=new WeakMap<State,Binding>();
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
// This capability admits only the ordinary form's set/insert syntax. Malformed
// commands keep the original reader/authentication/error ordering, not a partly
// selected state. Semantic fields/values still belong to the original adapter.
const safePath=(path:unknown)=>Array.isArray(path)&&path.length>0&&path.length<=32&&path.every(step=>typeof step==='string'?!!step&&!['__proto__','prototype','constructor'].includes(step):object(step)&&typeof step.id==='string'&&!!step.id);
const formPatch=(patch:unknown)=>object(patch)&&safePath(patch.path)&&Array.isArray(patch.path)&&['errors','items'].includes(patch.path[0])&&(patch.op==='insert'?patch.path.length===1&&object(patch.value)&&typeof patch.value.id==='string'&&!!patch.value.id:patch.op==='set'&&patch.path.length===3&&object(patch.path[1])&&typeof patch.path[2]==='string'&&patch.value!==undefined);
export function fqcRequiredDependencyCommand(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 if(!command||!['apply','save'].includes(command.action)||!Object.keys(command).every(key=>fields[command.action as keyof typeof fields].has(key)))return false;
 return typeof command.operationId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)&&typeof command.clientId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)&&typeof command.generation==='string'&&!!command.generation&&Number.isSafeInteger(command.sequence)&&command.sequence>=1&&
  (command.expectedRevision===undefined||Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0)&&
  (command.action==='apply'?Array.isArray(command.patches)&&command.patches.length<=256&&command.patches.every(formPatch)&&(command.guards===undefined||Array.isArray(command.guards)&&command.guards.every(guard=>object(guard)&&safePath(guard.path)))&&(command.input===undefined||object(command.input)):(command.reason===undefined||typeof command.reason==='string')&&(command.source===undefined||typeof command.source==='string'));
}
export async function readFqcRequiredMutationState(command:ModuleDraftCommand,authorize:(state:State)=>Promise<string>):Promise<State|null>{
 if(!fqcRequiredDependencyCommand(command))return null;
 const raw=JSON.stringify(command),row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
 if(!row)throw Error('Current state is missing; explicit initialization is required');
 const envelope=JSON.parse(row.values) as Parameters<typeof readFqcRequiredRecordMutation>[1];if(!object(envelope)||!Object.hasOwn(envelope,'__processRecords'))return null;
 const selected=await readFqcRequiredRecordMutation(env.STATE_ARCHIVE,envelope,row.revision,{action:command.action as 'apply'|'save',allocate:command.action==='apply'&&!!command.patches?.some(patch=>patch.op==='insert')},async state=>{
  const actorId=await authorize(state);
  if(!fqcRequiredDependencyCommand(command)||JSON.stringify(command)!==raw)throw Error('FQC command changed');
  return{actorId,operationId:command.operationId,clientId:command.clientId,sequence:command.sequence};
 });
 if(!selected)return null;
 if(!fqcRequiredDependencyCommand(command)||JSON.stringify(command)!==raw)throw Error('FQC command changed');
 const model=selected.state.recordStorage.models.get('qualityMasterControl') as {libraries?:{fqc?:VersionedControl<unknown>}}|undefined;
 const numbers=new Map((Array.isArray(model?.libraries?.fqc?.versions)?model.libraries.fqc.versions:[]).map(version=>[version.id,version.number]));
 bindings.set(selected.state,{handle:selected.handle,command,raw,numbers});
 console.info('[record-read-scope]',JSON.stringify({policy:'fqc-apply-save-required-v1',revision:row.revision,required:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','qualityMasterControl','masterDataControl','routineEquipmentControl'],unverifiedAggregates:Object.keys(envelope.__processRecords.values).filter(key=>!Object.hasOwn(selected.state.values,key)).length}));
 return selected.state;
}
function bindingFor(state:State,command?:ModuleDraftCommand){
 const binding=bindings.get(state);
 if(!binding||command&&binding.command!==command||!fqcRequiredDependencyCommand(binding.command)||JSON.stringify(binding.command)!==binding.raw)throw Error('Invalid FQC required mutation binding');
 return binding;
}
export function captureFqcRequiredBasis<T>(state:State,command:ModuleDraftCommand,control:VersionedControl<T>){
 const binding=bindingFor(state,command);if(binding.basis)throw Error('FQC basis already captured');
 binding.basis=JSON.parse(JSON.stringify(control)) as VersionedControl<unknown>;
}
export function captureFqcRequiredResult<T>(state:State,command:ModuleDraftCommand,flow:SharedDraft<T>,receipt:DraftReceipt){
 const binding=bindingFor(state,command);if(!binding.basis||binding.flow||receipt.operationId!==command.operationId)throw Error('Invalid FQC adapter result');
 binding.flow=flow;binding.flowRaw=JSON.stringify(flow);binding.receiptRaw=JSON.stringify(receipt);
}
export async function encodeFqcRequiredMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined,project:(control:VersionedControl<unknown>)=>void){
 const binding=bindingFor(state),model=models?.get('qualityMasterControl') as {libraries?:{fqc?:VersionedControl<unknown>}}|undefined,control=model?.libraries?.fqc;
 if(state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!control||!binding.basis||!binding.flow||control.workflow!==binding.flow||JSON.stringify(binding.flow)!==binding.flowRaw||JSON.stringify(binding.flow.receipts[binding.command.operationId]?.result)!==binding.receiptRaw)throw Error('Invalid FQC sealed adapter result');
 // Re-run the existing pure version projection on the captured parser basis,
 // never on caller-provided history, then restore the adapter's legacy numbers.
 const expected=JSON.parse(JSON.stringify(binding.basis)) as VersionedControl<unknown>;
 expected.workflow=JSON.parse(binding.flowRaw!) as SharedDraft<unknown>;project(expected);
 const expectedStored={...expected,versions:expected.versions.map(version=>({...version,number:binding.numbers.get(version.id)??version.number}))};
 if(JSON.stringify(control)!==JSON.stringify(expectedStored))throw Error('FQC projection differs from its adapter result');
 bindings.delete(state);
 return encodeFqcRequiredRecordMutation(env.STATE_ARCHIVE,binding.handle,state.revision,values,state.recordStorage,model);
}
