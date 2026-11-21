import {env} from 'cloudflare:workers';
import {can, encodeValues, identity, readState, responseHeaders, sameOrigin, stateRevisionIsCurrent} from '@/lib/process-state';
import {emptyRoutine, parseRoutine, RF_KEY} from '@/lib/routine-fqc';
import {parseRoutinePage, ROUTINE_PAGE_SCOPE, type RoutineWholePage} from '@/lib/routine-fqc-page';
import {createSharedDraft, stableDraftJSON} from '@/lib/shared-draft';
import {RI_KEY} from '@/lib/routine-iqc';
import {readRoutineIqc} from '@/lib/routine-iqc-workflow';
import {isRoutineScheduleOwner} from '@/lib/routine-schedule-owner';
import {boundedJson} from '@/lib/site-security.mjs';

const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:responseHeaders});

// This must be an actual server-provisioned database capability. Two bindings
// whose JS identities cannot be proven equal intentionally fail closed.
function dedicatedDatabase(){
  const dedicated=(env as typeof env & {ROUTINE_RESET_DEDICATED_TEST_DB?:D1Database}).ROUTINE_RESET_DEDICATED_TEST_DB;
  return dedicated && dedicated===env.DB ? dedicated : undefined;
}

async function sha256(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

function resetTarget(state:Awaited<ReturnType<typeof readState>>,scope:'fqc'|'iqc'){
  const value=state.values[scope==='fqc'?RF_KEY:RI_KEY];
  if(!value)return null;
  const raw=JSON.parse(value);
  if(Object.hasOwn(raw,'pageDraftLayout')||Object.hasOwn(raw,'page')){
    if(scope!=='fqc'||raw.pageDraftLayout!=='page-v1')return null;
    const current=parseRoutinePage(parseRoutine(value));
    return {revision:current.revision,pendingCount:current.page.workflow.pendingId?1:0,wholePage:true};
  }
  const current=scope==='fqc'?parseRoutine(value):readRoutineIqc(state);
  return {revision:current.revision,pendingCount:current.documents.filter(doc=>doc.flow.pendingId).length,wholePage:false};
}

async function emptyRoutinePage(){
  const content:RoutineWholePage={documents:[]};
  const id='routine-page-baseline:'+await sha256(stableDraftJSON(content));
  const root={...emptyRoutine(),pageDraftLayout:'page-v1',page:{
    baseline:{id,content},workflow:createSharedDraft(ROUTINE_PAGE_SCOPE,content,id,crypto.randomUUID()),
    documentState:{},caseDependencies:{}
  }};
  return parseRoutinePage(root);
}

async function ownerFor(request:Request,state:Awaited<ReturnType<typeof readState>>,scope:string){
  const actor=await identity(request,state);
  if(!actor || !isRoutineScheduleOwner(actor) || state.values.maintenanceMode==='1' ||
     state.values.routineFqcEnabled!=='1')return null;
  for(const permission of ['routine.view','routine.edit','routine.settings','routine.delete',...(scope==='iqc'?['iqc.view']:[])])
    if(!await can(request,state,permission))return null;
  return actor;
}

// Read-only lookup of the most recent reset. Missing evidence leaves the operation unresolved.
export async function GET(request:Request){
  const query=new URL(request.url).searchParams,scope=query.get('scope'),id=query.get('operationId');
  const capability=query.size===2 && query.get('capability')==='1';
  if(query.size!==2 || scope!=='fqc'&&scope!=='iqc' || !capability&&(!id||!/^[\w-]{8,100}$/.test(id)))
    return reply({error:'INVALID_SELECTOR'},422);
  if(!dedicatedDatabase())return capability?reply({available:false},200):reply({error:'RESET_UNAVAILABLE'},403);
  try{
    const key=scope==='fqc'?RF_KEY:RI_KEY;
    const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','routineFqcEnabled','maintenanceMode',key]});
    const actor=await ownerFor(request,state,scope);
    if(!actor)return reply({error:'FORBIDDEN'},403);
    const raw=JSON.parse(state.values[key]||'{}'),receipt=raw.resetReceipt;
    if(!await stateRevisionIsCurrent(state)||!isRoutineScheduleOwner(await identity(request,state)))
      return reply({error:'RECHECK_REQUIRED'},409);
    if(capability){
      const target=resetTarget(state,scope);
      if(!target)return reply({available:false},200);
      return reply({available:true,scope,actorId:actor.id,revision:state.revision,
        pendingCount:target.pendingCount},200);
    }
    return receipt?.id===id && receipt.actorId===actor.id ? reply({id,scope,revision:receipt.revision},200)
      : reply({error:'RECEIPT_NOT_FOUND'},404);
  }catch{return reply({error:'RECEIPT_UNAVAILABLE'},503);}
}

export async function POST(request:Request){
  const database=dedicatedDatabase();
  if(!database || !sameOrigin(request))return reply({error:'RESET_UNAVAILABLE'},403);
  const query=new URL(request.url).searchParams,scope=query.get('scope');
  if(query.size!==1 || scope!=='fqc'&&scope!=='iqc')return reply({error:'INVALID_SCOPE'},422);
  let body;
  try {body=await boundedJson(request,4096);}catch{return reply({error:'INVALID_CONFIRMATION'},422);}
  if(!body || typeof body!=='object' || Array.isArray(body) ||
     Object.keys(body).some(k=>!['id','scope','confirm','irreversibleAck','reason','pendingCount','revision'].includes(k)) ||
     body.scope!==scope || body.confirm!=='RESET '+scope.toUpperCase() || body.irreversibleAck!==true ||
     typeof body.reason!=='string' || !body.reason.trim() || typeof body.id!=='string' ||
     !/^[\w-]{8,100}$/.test(body.id) || !Number.isSafeInteger(body.revision) || body.revision<0 ||
     !Number.isSafeInteger(body.pendingCount) || body.pendingCount<0)return reply({error:'INVALID_CONFIRMATION'},422);
  try {
    const state=await readState(),actor=await ownerFor(request,state,scope);
    if(!actor)return reply({error:'FORBIDDEN'},403);
    const key=scope==='fqc'?RF_KEY:RI_KEY;
    const raw=JSON.parse(state.values[key]||'{}');
    const input=JSON.stringify([actor.id,scope,body.id,body.revision,body.pendingCount,body.reason]);
    const fingerprint=await sha256(input);
    if(raw.resetReceipt?.id===body.id){
      if(raw.resetReceipt.fingerprint!==fingerprint)return reply({error:'OPERATION_ID_REUSED'},409);
      return reply({revision:raw.resetReceipt.revision,replayed:true},200);
    }
    const control=resetTarget(state,scope);
    if(!control || state.revision!==body.revision || control.pendingCount!==body.pendingCount)
      return reply({error:'REVISION_CONFLICT'},409);
    if(!Number.isSafeInteger(control.revision)||control.revision<0||!Number.isSafeInteger(control.revision+1))
      return reply({error:'INVALID_CONTROL_REVISION'},409);
    const next=control.wholePage?await emptyRoutinePage():scope==='fqc'?emptyRoutine():readRoutineIqc({revision:0,values:{}});
    const revision=state.revision+1;
    const replacement={...next,revision:control.revision+1,resetReceipt:{id:body.id,actorId:actor.id,fingerprint,revision}};
    const encoded=await encodeValues({...state.values,[key]:JSON.stringify(replacement)},state);
    const currentActor=await identity(request,state);
    if(!isRoutineScheduleOwner(currentActor))return reply({error:'FORBIDDEN'},403);
    const result=await database.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
      .bind(revision,encoded,new Date().toISOString(),state.revision).run();
    return result.meta.changes===1?reply({revision,replayed:false},200):reply({error:'REVISION_CONFLICT'},409);
  }catch{return reply({error:'RESET_RESULT_UNCONFIRMED'},503);}
}
