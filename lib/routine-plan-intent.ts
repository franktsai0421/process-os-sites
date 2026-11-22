import {DraftConflict,stableDraftJSON} from './shared-draft';

export type PlanScope='fqc'|'iqc';
type Receipt={actorId:string;fingerprint:string;result:unknown};
type Control={revision:number;receipts:Record<string,Receipt>};
export const isPlanIntent=(id:unknown):id is string=>typeof id==='string'&&/^plan-(fqc|iqc)-[0-9a-f-]{36}$/.test(id);
const slot=(id:string)=>'~plan-intent~'+id;
type Evidence={state:'registered'|'retired';revision:number;scope:PlanScope;id:string;sessionType:string;epoch:number};
type Principal={id:string;sessionType?:string};
function epoch(values:Record<string,string>,actor:Principal){
  const users=JSON.parse(values.platformUsers||'null');
  if(actor.sessionType!=='platform'&&actor.sessionType!=='demo')throw new DraftConflict('LOGIN_REQUIRED',401);
  const matches=Array.isArray(users)?users.filter(u=>typeof u.id==='string'&&u.id.trim().toLowerCase()===actor.id):[];
  const version=matches.length===1?(matches[0].authEpoch??0):null;
  if(!Number.isSafeInteger(version)||version<0)throw new DraftConflict('LOGIN_REQUIRED',401);
  return version as number;
}
export function planEvidence(control:Control,scope:PlanScope,id:string,actor:Principal,values:Record<string,string>){
  const entry=control.receipts[slot(id)],result=entry?.result as Evidence|undefined;
  if(!isPlanIntent(id)||!id.startsWith('plan-'+scope+'-')||entry?.actorId!==actor.id||result?.sessionType!==actor.sessionType||result?.epoch!==epoch(values,actor)||result?.id!==id||
     result.scope!==scope||!Number.isSafeInteger(result.revision)||!['registered','retired'].includes(result.state))
    throw new DraftConflict('PLAN_INTENT_NOT_FOUND',404);
  return {entry,result};
}
export async function planFingerprint(command:object){
  // The action and the complete ordered payload are bound to the generated ID.
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableDraftJSON(command)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function checkPlanIntent(control:Control,scope:PlanScope,command:{operationId:string;action:string},actor:Principal,values:Record<string,string>){
  if(!isPlanIntent(command.operationId))return;
  const actual=control.receipts[command.operationId];
  if(actual&&command.action==='create-plan'&&actual.actorId===actor.id&&actual.fingerprint===stableDraftJSON(command))return;
  const {entry,result}=planEvidence(control,scope,command.operationId,actor,values);
  if(command.action!=='create-plan'||entry.fingerprint!==await planFingerprint(command))throw new DraftConflict('PLAN_INTENT_MISMATCH',409);
  if(result.state==='retired')throw new DraftConflict('PLAN_INTENT_RETIRED',409);
}
export async function registerPlan(control:Control,scope:PlanScope,command:{operationId:string;action:string;expectedRevision:number},actor:Principal,values:Record<string,string>){
  const id=command.operationId;
  if(!isPlanIntent(id)||!id.startsWith('plan-'+scope+'-')||command.action!=='create-plan')throw new DraftConflict('INVALID_PLAN_INTENT',422);
  if(Object.hasOwn(control.receipts,id))throw new DraftConflict('CHECK_ORIGINAL_RECEIPT',409);
  if(Object.hasOwn(control.receipts,slot(id))){
    await checkPlanIntent(control,scope,command,actor,values);
    return false;
  }
  if(control.revision!==command.expectedRevision)throw new DraftConflict('REVISION_CONFLICT',409);
  control.receipts[slot(id)]={actorId:actor.id,fingerprint:await planFingerprint(command),result:{id,scope,sessionType:actor.sessionType,epoch:epoch(values,actor),revision:control.revision,state:'registered'}};
  return true;
}
