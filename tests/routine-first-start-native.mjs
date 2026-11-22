// Exercise the production build on the repository's disposable Worker, D1 and R2.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedRoutineCalendarFixture} from './routine-fqc-calendar-browser.mjs';

const secret=randomBytes(32).toString('hex');
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
try{
 const {cookie,today}=await seedRoutineCalendarFixture(f,secret);
 const request=async(path,body,actor='frank')=>{
  const r=await f.mf.dispatchFetch(new URL(path,f.url).href,{method:body?'POST':'GET',
   headers:{origin:f.url.origin,cookie:'process_demo='+cookie(actor),'content-type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 for(const scope of ['fqc','iqc']){
  const id=scope==='iqc'?null:'synthetic-fqc-original',route='/api/routine-'+scope;
  const recovery='/api/routine-start-retirement';
  const assessment=recovery+'?scope='+scope+'&assessment=1'+(id?'&operationId='+id:'');
  assert.equal((await request(assessment,undefined,'routine-reader')).status,403);
  const before=await request(route);
  assert.equal(before.status,200);assert.equal(scope==='fqc'?before.data.control.startDate:before.data.startDate,null);
  const checked=await request(assessment);assert.equal(checked.status,200);assert.equal(checked.data.status,'eligible');assert.equal(checked.data.id,id);
  const evidence=await request(recovery,{scope,operationId:id,action:'retire-first-start',expectedRevision:0,confirm:'RETIRE '+scope.toUpperCase()+' START'});
  assert.equal(evidence.status,200);assert.deepEqual((await request(assessment)).data,evidence.data);
  const readback=await request(route);assert.equal(scope==='iqc'?readback.data.revision:readback.data.control.revision,1);
  const configure=scope==='iqc'?{scope:'routine-iqc-only',confirm:'START IQC',startAck:true,start:today,reason:'Synthetic',expectedStateRevision:readback.data.stateRevision}:
   {calendarVersion:2,startDate:today};
  const cmd={...configure,action:'configure',expectedRevision:1,operationId:'synthetic-fresh-'+scope};
  assert.equal((await request(route,{...cmd,expectedRevision:0,operationId:'synthetic-stale-'+scope})).status,409);
  assert.equal((await request(route,cmd)).status,200);
  assert.equal((await request(route+'?operationId='+cmd.operationId)).status,200);
  if(scope==='fqc')assert.equal((await request(route,{action:'generate',expectedRevision:2,operationId:'synthetic-fqc-generate'})).status,200);
  const after=await request(route),jobs=scope==='fqc'?after.data.control.jobs:after.data.jobs;
  assert.equal(jobs.length,scope==='fqc'?3:1);assert(jobs.every(j=>j.itemId===(scope==='fqc'?'time':JSON.stringify(['iqc-item','iqc-month']))));
  assert.equal(new Set(jobs.map(j=>j.id)).size,jobs.length);
  console.log(scope+' compiled readback passed: '+jobs.length+' eligible jobs');
 }
}finally{await f.close();}
