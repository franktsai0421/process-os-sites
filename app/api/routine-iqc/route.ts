import {env} from 'cloudflare:workers';
import { boundedJson } from '@/lib/site-security.mjs';
import { readState, identity, sameOrigin, encodeValues, stateRevisionIsCurrent, responseHeaders } from '@/lib/process-state';
import { companyDate } from '@/lib/routine-fqc';
import { RI_KEY, routineIqcCatalog, routineIqcTimeline } from '@/lib/routine-iqc';
import { routineIqcAccess, routineIqcAuthorityKeys } from '@/lib/routine-iqc-access';
import { readRoutineIqc, executeRoutineIqc, iqcContentPhotos, iqcDocStatus, iqcDocContent, iqcDraftIssues, iqcCanDispose, iqcExpired, iqcStartLocked, type Command } from '@/lib/routine-iqc-workflow';
import { DraftConflict } from '@/lib/shared-draft';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:responseHeaders});
const whenFailed=(error:unknown)=>error instanceof DraftConflict?reply({error:error.code,details:error.details},error.status):
  error instanceof SyntaxError?reply({error:'INVALID_JSON'},422):
  error instanceof Error&&error.message==='BODY_TOO_LARGE'?reply({error:'BODY_TOO_LARGE'},413):reply({error:'IQC_UNAVAILABLE'},503);

// Below the start date, the catalog needs only the effective approved
// snapshot and its original approval case. Keep the full timeline for
// started schedules and never substitute a working or historic snapshot.
function unstartedMaster(key:string,raw:string){
  if(key!=='iqcMasterControl')return raw;
  const master=JSON.parse(raw);
  if(!Array.isArray(master?.versions)||master.workflow&&!Array.isArray(master.workflow.cases))return raw;
  const activeVersionId=master.activeVersionId;
  return JSON.stringify({activeVersionId,
    versions:master.versions.filter((version:{id:string})=>version.id===activeVersionId),
    ...(master.workflow?{workflow:{cases:master.workflow.cases.filter((review:{id:string})=>review.id===activeVersionId)}}:{})});
}

export async function GET(request:Request){
  try{
    const q=new URL(request.url).searchParams,operationId=q.get('operationId'),pendingOnly=q.get('pending-count')==='1';
    const validSelector=q.size===0||q.size===1&&(pendingOnly||operationId!==null&&/^[\w-]{8,100}$/.test(operationId));
    if(!validSelector)throw new DraftConflict('IQC_SELECTOR_INVALID',422);
    const keys=[...routineIqcAuthorityKeys,RI_KEY,...(operationId?['iqcMasterControl']:[])];
    const state=await readState({keys,deferHistory:false});
    const {actor,permissions}=await routineIqcAccess(request,state),c=readRoutineIqc(state),today=companyDate();
    let body:unknown;
    if(pendingOnly){
      body={pendingCount:c.documents.filter(doc=>iqcDocStatus(doc)==='pending').length,revision:c.revision,identityId:actor.id};
    }else if(operationId){
      const receipt=c.receipts[operationId];
      if(!receipt||receipt.actorId!==actor.id)return reply({error:'RECEIPT_NOT_FOUND'},404);
      body={result:receipt.result,revision:c.revision};
    }else{
      const {calendar,documents,cases}=c;
      const dateStarted=!!calendar.startDate&&calendar.startDate<=today;
      const master=await readState({keys:['iqcMasterControl'],deferHistory:false,
        ...(!dateStarted?{projectValue:unstartedMaster}:{})});
      if(master.revision!==state.revision)return reply({error:'REVISION_CONFLICT'},409);
      const policy=calendar.calendarPolicy;
      const scheduleDue=dateStarted&&(c.lastScheduleDay!==today||routineIqcTimeline(master).some(v=>
        v.day<=today&&v.at>=(policy?.adoptedAt||'')&&!policy?.appliedVersions?.includes(v.id)));
      body={today,identity:{id:actor.id,role:actor.role,name:actor.name},permissions,revision:c.revision,
        startDate:calendar.startDate,scheduleDue,jobs:calendar.jobs,
        cases:cases.map(item=>({...item,disposalAvailable:iqcCanDispose(c,item)})),catalog:routineIqcCatalog(master),
        periodRules:Object.fromEntries(Object.entries(policy?.scopes||{}).map(([scope,rule])=>
          [scope,{from:rule.from,until:rule.until,frequency:rule.source.frequency}])),
        ...(actor.role==='admin'&&permissions.settings&&permissions.edit?{stateRevision:state.revision,startLocked:iqcStartLocked(c)}:{}),
        documents:documents.map(doc=>({...doc,status:iqcDocStatus(doc),expired:iqcExpired(c,doc,today),
          issues:iqcDocStatus(doc)==='draft'?iqcDraftIssues(doc,iqcDocContent(doc),today):[],
          savedIssues:doc.flow.saved?iqcDraftIssues(doc,doc.flow.saved.content,today):[],
          flow:{...doc.flow,receipts:{},sequences:{}}}))};
    }
    if((await identity(request,state))?.id!==actor.id)return reply({error:'LOGIN_REQUIRED'},401);
    if(!await stateRevisionIsCurrent(state))return reply({error:'REVISION_CONFLICT'},409);
    return reply(body);
  }catch(error){return whenFailed(error);}
}

export async function POST(request:Request){
  if(!sameOrigin(request))return reply({error:'ORIGIN_FORBIDDEN'},403);
  try{
    const command=await boundedJson(request,2_000_000) as Command;
    if(/__immutableBody|__liveContent|__proto__/.test(JSON.stringify(command)))return reply({error:'IQC_ACTION_INVALID'},422);
    const fields=command?.action==='configure'
        ? ['action','operationId','expectedRevision','expectedStateRevision','scope','confirm','reason','startAck','start']
        : ['action','operationId','expectedRevision','documentId','caseId','jobIds','start','end','draft','fields'];
    if(!command||typeof command!=='object'||Object.keys(command).some(key=>!fields.includes(key)))return reply({error:'IQC_ACTION_INVALID'},422);
    for(let attempt=0;attempt<3;attempt++){
      const state=await readState({deferHistory:false});
      const {actor,permissions}=await routineIqcAccess(request,state);
      if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
      if(command.action==='configure'&&!permissions.settings)return reply({error:'FORBIDDEN'},403);
      const control=readRoutineIqc(state);
      const at=new Date().toISOString(),today=companyDate(new Date(at));
      const response=executeRoutineIqc(control,command,state,{at,today,
        actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},permissions,id:()=>crypto.randomUUID()});
      if(response.replayed)return reply({...response,revision:control.revision});
      const doc=control.documents.find(doc=>doc.id===command.documentId);
      if(doc&&command.action==='draft'){
        const photos=[...new Set(iqcContentPhotos(iqcDocContent(doc)))];
        for(let index=0;index<photos.length;index+=8){
          const existing=await Promise.all(photos.slice(index,index+8).map(id=>env.STATE_ARCHIVE.head('routine-iqc/photos/'+id)));
          if(existing.some(item=>!item))return reply({error:'PHOTO_NOT_UPLOADED'},422);
        }
      }
      const values={...state.values,[RI_KEY]:JSON.stringify(control)};
      const encoded=await encodeValues(values,state);
      if((await identity(request,state))?.id!==actor.id)return reply({error:'LOGIN_REQUIRED'},401);
      if(!await stateRevisionIsCurrent(state))continue;
      const write=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
        .bind(state.revision+1,encoded,at,state.revision).run();
      if(write.meta.changes===1)return reply({...response,revision:control.revision});
    }
    return reply({error:'REVISION_CONFLICT'},409);
  }catch(error){return whenFailed(error);}
}
