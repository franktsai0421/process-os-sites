// Site-local one-use grant. Neither target nor identity is accepted from a request body.
import {startupBody} from './startup-assets.mjs';
import {env} from 'cloudflare:workers';
import {identity,can,readState,encodeValues,sameOrigin,stateRevisionIsCurrent,responseHeaders} from './process-state';
import {companyDate,parseRoutine,RF_KEY,routineSources,routineSourceTimeline,executeRoutine,docContent,type Job} from './routine-fqc';
import {isRoutineScheduleOwner} from './routine-schedule-owner';
import {checkPlanIntent,registerPlan,isPlanIntent} from './routine-plan-intent';
import {DraftConflict,stableDraftJSON} from './shared-draft';

type Target={oldId:string;jobId:string;sourceId:string;product:string;start:string;end:string;planStart:string;planEnd:string};
type Grant={project:string;release:string;dbTarget:string;transfer:string;actor:string;origin:string;from:number;until:number;newId:string;fqc:Target};
const auditKey='fqcPlanMaintenanceEvidence';
function requireState(value:unknown,code:string,status=409):asserts value {
  if(!value)throw new DraftConflict(code,status);
}
function exactJob(jobs:Job[],target:Target){
  const matches=jobs.filter(j=>j.itemId===target.sourceId&&j.calendar?.productCode===target.product&&
    j.start===target.start&&j.end===target.end&&!j.calendar.retestCaseId);
  requireState(matches.length===1&&matches[0].id===target.jobId,'TARGET_CHANGED');
  return matches[0];
}
function originalMatches(raw:string,t:Target){
  const c=JSON.parse(raw);
  return c.action==='create-plan'&&c.jobIds?.length===1&&c.jobIds[0]===t.jobId&&
    c.startDate===t.planStart&&c.endDate===t.planEnd;
}
export async function reconcileRoutinePlans(request:Request,project:string,build:string){
  const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:responseHeaders});
  const bindings=env as typeof env&{PROCESS_PROGRAM_COMMIT?:string;FQC_PLAN_ONE_TIME?:string};
  if(!bindings.FQC_PLAN_ONE_TIME)
    return reply({error:'UNAVAILABLE'},404);
  try{
    const g:Grant=JSON.parse(bindings.FQC_PLAN_ONE_TIME);
    requireState(g.origin.startsWith('https://')&&g.origin===new URL(g.origin).origin&&g.project===project&&g.release===build&&
      /^[a-f0-9]{40}$/.test(build)&&!/^0+$/.test(build)&&bindings.PROCESS_PROGRAM_COMMIT===build&&
      [g.dbTarget,g.transfer].every(s=>/^[a-f0-9]{64}$/.test(s)),'TARGET_UNVERIFIED',403);
    const scope=request.headers.get('X-Plan-Scope');
    requireState(scope==='fqc'&&request.headers.get('X-Original-Operation')===g.fqc.oldId&&
      request.headers.get('X-Process-Expected-Actor')===g.actor,'MARKER_MISMATCH',403);
    const dbPin="SELECT 1 AS ok FROM process_snapshot_target t JOIN process_snapshot_transfers x ON x.id=t.transfer_id AND x.target=t.target WHERE t.id=1 AND t.target=? AND x.id=? AND x.project_id=? AND x.owner_id=? AND x.phase='integrity-verified' AND x.chunk_count>0 AND x.verify_cursor=x.chunk_count";
    const pins=[g.dbTarget,g.transfer,project,g.actor];
    const databaseMatches=async()=>!!await env.DB.prepare(dbPin).bind(...pins).first();
    const validTime=()=>Number.isSafeInteger(g.from)&&Number.isSafeInteger(g.until)&&
      g.until-g.from<=3600000&&Date.now()>=g.from&&Date.now()<g.until;
    requireState(validTime()&&g.origin===new URL(request.url).origin&&isPlanIntent(g.newId)&&g.newId.startsWith('plan-fqc-'),'GRANT_INVALID',403);
    {const t=g.fqc;
      requireState(t&&Object.values(t).every(v=>typeof v==='string'&&v.length>0)&&
        /^[\w-]{8,100}$/.test(t.oldId)&&!isPlanIntent(t.oldId)&&
        [t.start,t.end,t.planStart,t.planEnd].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)),'GRANT_INVALID',403);
    }
    const write=request.method==='POST';
    requireState(!new URL(request.url).search&&(write||request.method==='GET'),'INVALID_REQUEST',422);
    requireState(request.headers.get('Sec-Fetch-Site')!=='cross-site','FORBIDDEN',403);
    if(write)requireState(request.headers.get('Origin')===g.origin&&sameOrigin(request)&&request.headers.get('X-Confirm-Plan-Reconciliation')==='RECONCILE FQC PLAN','INVALID_CONFIRMATION',403);
    if(write&&request.body){
      const readOptions={signal:request.signal,timeoutMs:5000};
      try{requireState((await startupBody(request.body,1,readOptions)).length===0,'INVALID_CONFIRMATION',403);}
      catch{throw new DraftConflict('INVALID_CONFIRMATION',403);}
    }
    const authority=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','routineFqcEnabled','maintenanceMode']});
    const actor=await identity(request,authority);
    requireState(actor&&isRoutineScheduleOwner(actor)&&actor.id===g.actor&&authority.values.routineFqcEnabled==='1'&&authority.values.maintenanceMode!=='1','FORBIDDEN',403);
    for(const p of ['routine.view','routine.edit','routine.create'])requireState(await can(request,authority,p),'FORBIDDEN',403);
    requireState(await databaseMatches(),'DATABASE_MISMATCH',403);
    const state=await readState({deferHistory:false});
    requireState(state.revision===authority.revision,'RECHECK_REQUIRED');
    const raw=JSON.parse(state.values[RF_KEY]);
    requireState(!('page' in raw)&&!('pageDraftLayout' in raw),'UNSUPPORTED_LAYOUT');
    const f=parseRoutine(state.values[RF_KEY]);
    const fj=exactJob(f.jobs,g.fqc);
    const now=new Date(),today=companyDate(now);
    requireState(f.calendarPolicy?.version===2,'UNSUPPORTED_LAYOUT');
    function inspect(){
      const target=g.fqc,job=fj,receipts=f.receipts,old=receipts[target.oldId];
      const matching=f.documents.filter(d=>d.kind==='plan'&&docContent(d).lines.some(l=>l.jobId===job.id))
        .map(d=>({id:d.id,ids:docContent(d).lines.map(l=>l.jobId),dates:[docContent(d).planStart,docContent(d).planEnd],cancelled:d.cancelled||d.caseId||d.correctionOf}));
      if(old)requireState(old.actorId===actor!.id&&originalMatches(old.fingerprint,target)&&
        (old.result as {documentId?:string})?.documentId===job.planId,'ORIGINAL_MISMATCH');
      if(!job.planId){requireState(!matching.length&&!old&&!job.completion&&!job.calendar?.requestId&&!job.calendar?.stopped,'AMBIGUOUS_HISTORY');return null;}
      requireState(matching.length===1&&matching[0].id===job.planId&&matching[0].ids.length===1&&matching[0].dates[0]===target.planStart&&matching[0].dates[1]===target.planEnd&&!matching[0].cancelled,'PLAN_MISMATCH');
      requireState(Object.values(receipts).some(r=>r.actorId===actor!.id&&
        (r.result as {documentId?:string})?.documentId===job.planId&&originalMatches(r.fingerprint,target)),'PLAN_PROVENANCE_MISSING');
      return job.planId;
    }
    let fId=inspect();
    const createFqc=!fId;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableDraftJSON(g)));
    const quote=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    const assessmentBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableDraftJSON([quote,state.revision,f.revision,fId])));
    const assessment=Array.from(new Uint8Array(assessmentBytes),n=>n.toString(16).padStart(2,'0')).join('');
    const prior=state.values[auditKey];
    const journal=await env.DB.prepare('SELECT grant_hash FROM fqc_plan_reconciliation_journal WHERE singleton=1').first<{grant_hash:string}>();
    requireState(prior?journal?.grant_hash===quote:!journal,'RESTORE_OR_GRANT_CHANGED');
    if(prior){
      const proof=JSON.parse(prior);
      requireState(fId&&proof.grant===quote&&proof.fId===fId,'READBACK_CHANGED');
    }else if(write){
      requireState(request.headers.get('X-FQC-Assessment')===assessment,'ASSESSMENT_CHANGED',409);
      if(!fId){
        requireState(fj.start<=today&&today<=fj.end,'PERIOD_NOT_ELIGIBLE');
        const before=structuredClone(f);
        const cmd={action:'create-plan' as const,expectedRevision:f.revision,jobIds:[fj.id],operationId:g.newId,startDate:g.fqc.planStart,endDate:g.fqc.planEnd};
        await registerPlan(f,'fqc',cmd,actor,state.values);
        await checkPlanIntent(f,'fqc',cmd,actor,state.values);
        executeRoutine(f,cmd,routineSources(state),{actor:{id:actor.id,name:actor.name,admin:actor.role==='admin'},at:now.toISOString(),today,
          sourceTimeline:routineSourceTimeline(state),allowed:p=>p==='view'||p==='edit',settings:false,revoke:false,revise:false});
        fId=inspect();requireState(fId,'CREATE_NOT_VERIFIED');
        const checked=structuredClone(f);
        checked.documents=checked.documents.filter(doc=>doc.id!==fId);
        const linked=checked.jobs.find(job=>job.id===fj.id);
        requireState(linked?.planId===fId&&checked.revision===before.revision+1,'CREATE_NOT_VERIFIED');
        linked.planId=null;
        const event=checked.events.pop();
        requireState(event?.action==='create-plan'&&event.actor.id===actor.id&&event.at===now.toISOString(),'CREATE_NOT_VERIFIED');
        checked.revision=before.revision;
        delete checked.receipts[g.newId];
        delete checked.receipts['~plan-intent~'+g.newId];
        requireState(stableDraftJSON(checked)===stableDraftJSON(before),'ADDITIONAL_SCHEDULE_CHANGE');
      }
      const values={...state.values,[RF_KEY]:createFqc?JSON.stringify(f):state.values[RF_KEY],[auditKey]:JSON.stringify({grant:quote,fId})};
      const encoded=await encodeValues(values,state);
      requireState(validTime()&&isRoutineScheduleOwner(await identity(request,state))&&await stateRevisionIsCurrent(state),'RECHECK_REQUIRED');
      const nonce=crypto.randomUUID();
      const writes=await env.DB.batch([
        env.DB.prepare('INSERT INTO fqc_plan_reconciliation_journal(singleton,grant_hash,nonce) SELECT 1,?,? WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=?) AND EXISTS('+dbPin+') AND unixepoch()*1000>=? AND (unixepoch()+1)*1000<=? ON CONFLICT(singleton) DO NOTHING').bind(quote,nonce,state.revision,...pins,g.from,g.until),
        env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM fqc_plan_reconciliation_journal WHERE singleton=1 AND nonce=?)')
          .bind(state.revision+1,encoded,now.toISOString(),state.revision,nonce)
      ]);
      requireState(writes.every(w=>w.success&&w.meta.changes===1),'REVISION_CONFLICT');
      return reply({status:'independent-readback-required'});
    }
    requireState(validTime()&&isRoutineScheduleOwner(await identity(request,state))&&await stateRevisionIsCurrent(state),'RECHECK_REQUIRED');
    requireState(await databaseMatches(),'DATABASE_MISMATCH',403);
    return reply({status:prior?'verified-current':'assessment',scope,actorId:actor.id,id:g.fqc.oldId,jobId:g[scope].jobId,revision:state.revision,planId:fId,planStart:g.fqc.planStart,planEnd:g.fqc.planEnd,sourceId:g.fqc.sourceId,product:g.fqc.product,start:fj.start,end:fj.end,assessment});
  }catch(e){return e instanceof DraftConflict?reply({error:e.code},e.status):reply({error:'RECONCILIATION_UNVERIFIED'},503);}
}
