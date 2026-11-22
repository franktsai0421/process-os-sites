import {env} from 'cloudflare:workers';
import {can, identity, readState, responseHeaders, sameOrigin, stateRevisionIsCurrent} from '@/lib/process-state';
import {parseRoutine, RF_KEY} from '@/lib/routine-fqc';
import {prepareFirstStartRetirement} from '@/lib/state-records';
import {RI_KEY} from '@/lib/routine-iqc';
import {readRoutineIqc} from '@/lib/routine-iqc-workflow';
import {isRoutineScheduleOwner} from '@/lib/routine-schedule-owner';
import {boundedJson} from '@/lib/site-security.mjs';

const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:responseHeaders});
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(id);
type Scope='fqc'|'iqc';

// A retirement is evidence about the old command's ability to commit. It is
// kept separately from its business receipt and never simulates a successful start.
async function handle(request:Request,scope:Scope,id:string|null,retire:boolean,assess=false){
  const key=scope==='fqc'?RF_KEY:RI_KEY;
  const row=retire?await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>():null;
  const selected=row?await prepareFirstStartRetirement(env.STATE_ARCHIVE,row.values,scope):null;
  if(retire&&!selected)return reply({error:'RECOVERY_UNAVAILABLE'},503);
  const state=selected&&row?{revision:row.revision,values:selected.values}:
    await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled',key],deferHistory:true,deferDependencyHistory:true});
  const actor=await identity(request,state);
  if(!actor||!isRoutineScheduleOwner(actor)||actor.role!=='admin'||state.values.maintenanceMode==='1'||state.values.routineFqcEnabled!=='1')
    return reply({error:'FORBIDDEN'},403);
  for(const permission of ['routine.view','routine.edit','routine.settings',...(scope==='iqc'?['iqc.view']:[])])
    if(!await can(request,state,permission))return reply({error:'FORBIDDEN'},403);
  const raw=JSON.parse(state.values[key]||'{}');
  const finish=async(body:unknown,status:number)=>{
    if(!await stateRevisionIsCurrent(state))return reply({error:'REVISION_CONFLICT'},409);
    const current=await identity(request,state);
    if(current?.id!==actor.id||!isRoutineScheduleOwner(current))return reply({error:'FORBIDDEN'},403);
    return reply(body,status);
  };
  if(!raw||typeof raw!=='object'||'page' in raw||'pageDraftLayout' in raw)return finish({error:'UNSUPPORTED_LAYOUT'},409);
  const control=scope==='fqc'?parseRoutine(state.values[key]):readRoutineIqc(state);
  const schedule='calendar' in control?control.calendar:control;
  // Never override an original result or assign a successful outcome to it.
  if(id!==null&&Object.hasOwn(control.receipts,id))return finish({error:'CHECK_ORIGINAL_RECEIPT'},409);
  const record=raw.firstStartRetirement;
  if(record&&record.id===id&&record.actorId===actor.id&&record.scope===scope&&record.expectedRevision===0&&record.fencedRevision===1)
    return finish({status:'retired',actorId:actor.id,scope,id,expectedRevision:0,fencedRevision:1},200);
  if(!retire&&!assess)return finish({error:'RETIREMENT_NOT_FOUND'},404);
  // Only the first, untouched routine generation is eligible. Refuse legacy
  // calendars, reset generations, populated or previously modified controls.
  if(record||control.revision!==0||schedule.startDate||schedule.calendarPolicy||schedule.jobs.length||
    control.documents.length||control.cases.length||Object.keys(control.receipts).length||
    schedule.events?.length||raw.resetReceipt||raw.lastStart)return finish({error:'FIRST_START_STATE_CHANGED'},409);
  if(assess)return finish({status:'eligible',actorId:actor.id,scope,id,expectedRevision:0},200);
  const evidence={id,actorId:actor.id,scope,expectedRevision:0,fencedRevision:1};
  const encoded=await selected!.encode(JSON.stringify({...control,firstStartRetirement:evidence,revision:1}));
  const current=await identity(request,state);
  if(current?.id!==actor.id||!isRoutineScheduleOwner(current))return reply({error:'FORBIDDEN'},403);
  const outcome=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
    .bind(state.revision+1,encoded,new Date().toISOString(),state.revision).run();
  return outcome.meta.changes===1?reply({status:'retired',actorId:actor.id,scope,id,expectedRevision:0,fencedRevision:1},200):reply({error:'REVISION_CONFLICT'},409);
}
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,scope=q.get('scope'),id=q.get('operationId');
  const assess=q.get('assessment')==='1';
  if((scope!=='fqc'&&scope!=='iqc')||scope==='fqc'&&id===null||id!==null&&!validId(id)||
    (assess?q.size!==(id===null?2:3):q.size!==2||id===null))return reply({error:'INVALID_SELECTOR'},422);
  try{return await handle(request,scope,id,false,assess);}catch{return reply({error:'RECOVERY_UNAVAILABLE'},503);}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return reply({error:'ORIGIN_FORBIDDEN'},403);
  try{
    const body=await boundedJson(request,1024);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==5||
      (body.scope!=='fqc'&&body.scope!=='iqc')||!(validId(body.operationId)||body.scope==='iqc'&&body.operationId===null)||body.expectedRevision!==0||
      body.action!=='retire-first-start'||body.confirm!=='RETIRE '+body.scope.toUpperCase()+' START')
      return reply({error:'INVALID_CONFIRMATION'},422);
    return await handle(request,body.scope,body.operationId,true);
  }catch{return reply({error:'RETIREMENT_UNCONFIRMED'},503);}
}
