import {env} from 'cloudflare:workers';
import type {State} from './process-state';
import type {ModuleDraftCommand} from './versioned-shared-workflow';
import type {AuthoringControl} from './process-authoring-workflow';
import {stableDraftJSON} from './shared-draft';
import {readProcessFlowRecordMutation,encodeProcessFlowRecordMutation,type ProcessFlowRecordMutationHandle} from './state-records';

// Independent from Save: this capability retains all BOM/IPQC dependencies.
// Creation, deletion, Begin, restore and other actions keep the ordinary path.
const common=['action','operationId','clientId','sequence','generation','expectedRevision','reason','source'];
const commandFields={apply:new Set([...common,'patches','guards']),submit:new Set([...common,'savedId']),approve:new Set([...common,'caseId','selfReviewConfirmed','acknowledgedContentIssues'])};
const fields=new Set(['x','y','nextIds','number','name','editorType','mode','people','productCodes','bomSelections','bomProductCode','bomItems','machineIds','machineId','machineDetails','instructionSteps','instructions','productInstructionSteps','productInstructions','mediaItems','media','mediaName','mediaType','productMediaItems','ipqcAssignments','ipqcQueryEnabled']);
const handles=new WeakMap<State,ProcessFlowRecordMutationHandle>();
const safe=(key:unknown):key is string=>typeof key==='string'&&!!key&&!['__proto__','prototype','constructor'].includes(key);
const entity=(value:unknown):value is {id:string}=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&safe((value as {id?:unknown}).id);
const path=(value:unknown):value is (string|{id:string})[]=>Array.isArray(value)&&value.length>=5&&value.length<=32&&value[0]==='workspaces'&&entity(value[1])&&value[2]==='stages'&&safe(value[3])&&entity(value[4])&&value.slice(5).every(safe);
const containsReference=(v:unknown):boolean=>!!v&&typeof v==='object'&&(Object.hasOwn(v,'__immutableBody')||Object.hasOwn(v,'__liveContent')||Object.values(v).some(containsReference));
export function processFlowCommand(command:ModuleDraftCommand|undefined):command is ModuleDraftCommand{
 try{
  if(!command||!['apply','submit','approve'].includes(command.action))return false;
  const allowed=commandFields[command.action as keyof typeof commandFields];
  if(Object.keys(command).some(key=>!allowed.has(key))||typeof command.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId)||typeof command.clientId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId)||typeof command.generation!=='string'||!command.generation||!Number.isSafeInteger(command.sequence)||command.sequence<1||command.expectedRevision!==undefined&&(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0)||command.reason!==undefined&&typeof command.reason!=='string'||command.source!==undefined&&typeof command.source!=='string')return false;
  if(command.action==='submit')return typeof command.savedId==='string'&&!!command.savedId;
  if(command.action==='approve')return typeof command.caseId==='string'&&!!command.caseId&&(command.selfReviewConfirmed===undefined||typeof command.selfReviewConfirmed==='boolean')&&(command.acknowledgedContentIssues===undefined||Array.isArray(command.acknowledgedContentIssues))&&!containsReference(command.acknowledgedContentIssues);
  if(!Array.isArray(command.patches)||!command.patches.length||command.patches.length>256||!Array.isArray(command.guards)||command.guards.some(g=>!g||Object.keys(g).some(k=>!['path','value'].includes(k))||!path(g.path)||containsReference(g.value)))return false;
  return command.patches.every(p=>p&&Object.keys(p).every(k=>['op','path','value'].includes(k))&&p.op==='set'&&path(p.path)&&p.path.length>=6&&fields.has(p.path[5] as string)&&!p.path.slice(6).some(k=>['id','isDeleted','deleted'].includes(String(k)))&&p.value!==undefined&&!containsReference(p.value)&&command.guards!.some(g=>stableDraftJSON(g.path)===stableDraftJSON(p.path)));
 }catch{return false;}
}
export async function readProcessFlowMutationState(command:ModuleDraftCommand):Promise<State|null>{
 if(!processFlowCommand(command))return null;
 const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();if(!row)return null;
 const envelope=JSON.parse(row.values);if(!envelope?.__processRecords)return null;
 let selected:Awaited<ReturnType<typeof readProcessFlowRecordMutation>>;
 // Selected hydration cannot determine unsupported-state fault precedence.
 try{selected=await readProcessFlowRecordMutation(env.STATE_ARCHIVE,envelope,row.revision,command.action==='approve'?command.caseId:undefined);}catch{return null;}
 if(!selected)return null;
 const model=selected.recordStorage.models.get('processAuthoringControl') as AuthoringControl,flow=model.workflow!;
 const open=model.versions.filter(v=>v&&['draft','pending','pending-test'].includes(v.status));
 if(command.action==='approve'){
  if(flow.pendingId!==command.caseId||open.length!==1||open[0].status!=='pending'||open[0].id!==command.caseId||!Array.isArray(flow.cases)||flow.cases.filter(c=>c.id===command.caseId).length!==1||flow.cases.find(c=>c.id===command.caseId)?.status!=='pending')return null;
 }else if(flow.pendingId!==null||open.length!==1||open[0].status!=='draft')return null;
 if(command.action==='apply')for(const patch of command.patches!){
  const workspaces=flow.working?.workspaces?.filter(w=>w.id===(patch.path[1] as {id:string}).id);if(!workspaces||workspaces.length!==1)return null;
  const operations=workspaces[0].stages?.[patch.path[3] as string];if(!Array.isArray(operations)||operations.filter(o=>o&&o.id===(patch.path[4] as {id:string}).id).length!==1)return null;
 }
 const state:State={revision:row.revision,values:selected.values,recordStorage:selected.recordStorage};handles.set(state,selected.handle);return state;
}
export async function encodeProcessFlowMutationState(state:State,values:Record<string,string>,models:Map<string,unknown>|undefined){
 const handle=handles.get(state);
 if(!handle||state.deliveryOnly||!state.recordStorage||!models||models.size!==1||!models.has('processAuthoringControl'))throw Error('Invalid Process Flow mutation state');
 handles.delete(state);return encodeProcessFlowRecordMutation(env.STATE_ARCHIVE,handle,state.revision,values,state.recordStorage,models.get('processAuthoringControl'));
}
