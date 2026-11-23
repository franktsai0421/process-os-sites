// Compiled Worker, synthetic grants and disposable D1/R2 only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedRoutineCalendarFixture} from './routine-fqc-calendar-browser.mjs';
import {PRIMARY_ADMIN_ID as actor} from '../public/process/access-policy.mjs';
const origin='https://synthetic.invalid', secret=randomBytes(32).toString('hex');
const project=JSON.parse(readFileSync(new URL('../.openai/hosting.json',import.meta.url))).project_id;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const month=today.slice(0,8)+'01';
const dateBefore=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const monthEnd=dateBefore(new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),1)).toISOString().slice(0,10));

function target(line,product,sourceId,start,end,planStart){
  const jobId='calendar:'+encodeURIComponent(JSON.stringify([line,product,sourceId]))+'@monthly:'+start;
  return {product,sourceId,start,end,planStart,planEnd:planStart,jobId,oldId:randomUUID()};
}
const grant={actor,origin,project,release:process.env.PROCESS_PROGRAM_COMMIT,dbTarget:randomBytes(32).toString('hex'),transfer:randomBytes(32).toString('hex'),
  from:Date.now()-60000,until:Date.now()+900000,newId:'plan-fqc-'+randomUUID(),fqc:target('A','SYN-P1','time',month,monthEnd,today)};
const fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_SESSION_SECRET:secret,PROCESS_IMPORT_ENABLED:'0',FQC_PLAN_ONE_TIME:JSON.stringify(grant)}});
try{
  const {cookie}=await seedRoutineCalendarFixture(fixture,secret);
  let quote='';
  async function req(path,method='GET',body,scope='fqc',status=200,who=actor,expectedActor=who){
    const r=await fixture.mf.dispatchFetch(origin+path,{method,headers:{origin,cookie:'process_demo='+cookie(who),
      'X-Process-Expected-Actor':expectedActor,'X-Original-Operation':grant[scope].oldId,'X-Plan-Scope':scope,
      'X-Confirm-Plan-Reconciliation':'RECONCILE FQC PLAN','X-FQC-Assessment':quote,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const value=await r.json();assert.equal(r.status,status,String(value.error));return value;
  }
  const path='/api/routine-plan-maintenance';
  await req(path,'GET',null,'fqc',403);
  const db=fixture.db;
  await db.prepare('INSERT INTO process_snapshot_target VALUES(1,?,?)').bind(grant.dbTarget,grant.transfer).run();
  await db.prepare('INSERT INTO process_snapshot_transfers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(grant.transfer,project,grant.dbTarget,'synthetic','synthetic',actor,'integrity-verified',1,1,1,1,1,2).run();
  const route='/api/routine-fqc',start=await req(route);
  await req(route,'POST',{action:'configure',operationId:randomUUID(),expectedRevision:start.control.revision,calendarVersion:2,startDate:month});
  await req(route,'POST',{action:'generate',operationId:randomUUID(),expectedRevision:(await req(route)).control.revision});
  await req(path,'POST',null,'fqc',403,'routine-reviewer');
  const assessed=await req(path);assert.equal(assessed.status,'assessment');
  quote=assessed.assessment;
  const rejected=await req(path,'POST',null,'fqc',403,'routine-reviewer',actor);
  assert.equal(rejected.error,'FORBIDDEN');
  const rev=await db.prepare('SELECT revision FROM shared_state WHERE id=1').first('revision');
  assert.equal(rev,assessed.revision);
  await db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1 AND revision=?').bind(rev).run();
  const stale=await req(path,'POST',null,'fqc',409);
  assert.equal(stale.error,'ASSESSMENT_CHANGED');
  assert.equal(await db.prepare('SELECT count(*) AS n FROM fqc_plan_reconciliation_journal').first('n'),0);
  assert.equal((await req(route)).control.documents.length,0);
  quote=(await req(path)).assessment;
  assert.equal((await req(path,'POST')).status,'independent-readback-required');
  const proof=await req(path),view=(await req(route)).control;
  assert.equal(proof.status,'verified-current');assert.equal(proof.id,grant.fqc.oldId);
  assert.equal(view.jobs.find(j=>j.id===proof.jobId).planId,proof.planId);
  assert.equal(view.documents.length,1);assert.equal(proof.planStart,today);
  await req(route+'?operationId='+grant.fqc.oldId,'GET',null,'fqc',404);
  assert.equal((await req(path,'POST')).status,'verified-current');
  console.log('PASS compiled assessment, owner confirmation, original FQC readback and duplicate prevention');
}finally{await fixture.close();}
