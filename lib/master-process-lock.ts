import {DraftConflict,stableDraftJSON} from './shared-draft';
import {masterStageCodes} from './master-stage-references';

type Root={active?:Record<string,Record<string,unknown>>;versions?:{scope?:string;status:string;id:string}[];workflowScopes?:Record<string,{pendingId:string|null;cases:{id:string;status:string;linkedProcess?:unknown}[];working?:unknown;saved?:unknown;active?:{content?:unknown}}>};
// Inspect the pre-mutation root, never a client-supplied replacement. A stage
// name/product edit is unrelated; only additions/removals touching templates lock.
export function assertStageTemplateAvailable(root:Root,before:unknown,after:unknown,exceptCaseId?:string){
 const old=new Set(masterStageCodes(before)),next=new Set(masterStageCodes(after));
 const added=[...next].filter(code=>!old.has(code)&&!root.active?.PROCESS?.[code]);
 const removed=[...old].filter(code=>!next.has(code)&&Object.prototype.hasOwnProperty.call(root.active?.PROCESS||{},code));
 if(!added.length&&!removed.length)return;
 const versions=(root.versions||[]).filter(v=>v.scope==='PROCESS'&&['draft','pending','pending-test'].includes(v.status));
 const flow=root.workflowScopes?.PROCESS;
 const pending=flow?.cases?.filter(c=>c.status==='pending'&&c.id===flow.pendingId)||[];
 const workingDraft=!!flow&&(!!flow.saved||flow.working!==undefined&&stableDraftJSON(flow.working)!==stableDraftJSON(flow.active?.content??root.active?.PROCESS));
 if(versions.length||pending.length||flow?.pendingId||workingDraft)throw new DraftConflict('PROCESS_TEMPLATE_SCOPE_BUSY',409,{
  added,removed,versions:versions.map(v=>({id:v.id,status:v.status})),pendingId:flow?.pendingId||null,
  resolveUrl:'/process/?system=process&view=data&dataTab=process-master'
 });
 const linked=Object.entries(root.workflowScopes||{}).flatMap(([scope,f])=>f.cases.filter(c=>c.status==='pending'&&c.id===f.pendingId&&c.linkedProcess&&c.id!==exceptCaseId).map(c=>({scope,id:c.id})));
 if(linked.length)throw new DraftConflict('LINKED_PROCESS_CASE_PENDING',409,{cases:linked,resolveUrl:'/process/?system=process&view=approval'});
}
