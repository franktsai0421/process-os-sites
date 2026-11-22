import {env} from 'cloudflare:workers';
import {can,identity,responseHeaders,sameOrigin,stateRevisionIsCurrent} from '@/lib/process-state';
import {prepareFirstStartRetirement} from '@/lib/state-records';
import {readRoutineIqc} from '@/lib/routine-iqc-workflow';
import {parseRoutine,RF_KEY} from '@/lib/routine-fqc';
import {RI_KEY} from '@/lib/routine-iqc';
import {boundedJson} from '@/lib/site-security.mjs';
import {DraftConflict} from '@/lib/shared-draft';
import {isPlanIntent,planEvidence,planFingerprint,registerPlan} from '@/lib/routine-plan-intent';

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:responseHeaders});
async function handle(request:Request){
  try{
    const url=new URL(request.url),scope=url.searchParams.get('scope'),id=url.searchParams.get('id');
    if(url.searchParams.size!==2||(scope!=='iqc'&&scope!=='fqc')||!isPlanIntent(id)||!id.startsWith('plan-'+scope+'-'))return reply({error:'INVALID_SELECTOR'},422);
    if(request.method==='POST'&&!sameOrigin(request))return reply({error:'ORIGIN_FORBIDDEN'},403);
    const body=request.method==='POST'?await boundedJson(request,2000000):undefined;
    if(request.method==='POST'&&(!body||!['register','retire'].includes(body.action)))return reply({error:'INVALID_ACTION'},422);
    const row=await env.DB.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first<{revision:number;values:string}>();
    const selected=row&&await prepareFirstStartRetirement(env.STATE_ARCHIVE,row.values,scope);
    if(!row||!selected)return reply({error:'RECOVERY_UNAVAILABLE'},503);
    const state={revision:row.revision,values:selected.values},actor=await identity(request,state);
    if(!actor||request.headers.get('X-Process-Expected-Actor')!==actor.id||state.values.routineFqcEnabled!=='1'||state.values.maintenanceMode==='1')return reply({error:'FORBIDDEN'},403);
    for(const perm of ['routine.view','routine.edit','routine.create',...(scope==='iqc'?['iqc.view']:[])])
      if(!await can(request,state,perm))return reply({error:'FORBIDDEN'},403);
    const key=scope==='iqc'?RI_KEY:RF_KEY;
    const raw=JSON.parse(state.values[key]||'null');
    if(!raw||'page' in raw||'pageDraftLayout' in raw)return reply({error:'UNSUPPORTED_LAYOUT'},409);
    const control=scope==='fqc'?parseRoutine(state.values[key]):readRoutineIqc(state);
    const original=control.receipts[id];
    let changed=false;
    if(body?.action==='register'){
      const cmd=body.command,dates=scope==='fqc'?['startDate','endDate']:['start','end'];
      if(Object.keys(body).length!==2||!cmd||cmd.operationId!==id||cmd.action!=='create-plan'||
        Object.keys(cmd).sort().join()!==['action','operationId','expectedRevision','jobIds',...dates].sort().join()||
        !dates.every(k=>typeof cmd[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cmd[k]))||
        !Array.isArray(cmd.jobIds)||!cmd.jobIds.length||!cmd.jobIds.every((j:unknown)=>typeof j==='string'&&j.length>0)||
        !Number.isSafeInteger(cmd.expectedRevision))return reply({error:'INVALID_PLAN_INTENT'},422);
      changed=await registerPlan(control,scope,cmd,actor,state.values);
    }
    const {entry,result}=planEvidence(control,scope,id,actor,state.values);
    if(original&&(original.actorId!==actor.id||await planFingerprint(JSON.parse(original.fingerprint))!==entry.fingerprint))return reply({error:'PLAN_INTENT_MISMATCH'},409);
    if(body?.action==='retire'){
      if(Object.keys(body).length!==3||body.confirm!=='RETIRE '+scope.toUpperCase()+' PLAN'||body.expectedRevision!==result.revision)return reply({error:'INVALID_CONFIRMATION'},422);
      if(!original&&result.state==='registered'){result.state='retired';changed=true;}
    }
    const encoded=changed?await selected.encode(JSON.stringify(control)):null;
    const current=await identity(request,state);
    if(current?.id!==actor.id||current.sessionType!==actor.sessionType)return reply({error:'FORBIDDEN'},403);
    if(!await stateRevisionIsCurrent(state))return reply({error:'REVISION_CONFLICT'},409);
    if(encoded){
      const write=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?')
        .bind(row.revision+1,encoded,new Date().toISOString(),row.revision).run();
      if(write.meta.changes!==1)return reply({error:'REVISION_CONFLICT'},409);
    }
    return reply({scope,id,actorId:actor.id,expectedRevision:result.revision,status:original?'committed':result.state});
  }catch(error){return error instanceof DraftConflict?reply({error:error.code},error.status):reply({error:'PLAN_INTENT_UNCONFIRMED'},503);}
}
export const GET=handle;
export const POST=handle;
