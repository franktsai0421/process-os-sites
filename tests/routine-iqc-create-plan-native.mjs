// Compiled Worker with disposable Miniflare D1 and R2, entirely synthetic.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedRoutineCalendarFixture} from './routine-fqc-calendar-browser.mjs';

const secret=randomBytes(32).toString('hex');
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:secret}});
try {
  const {cookie,today}=await seedRoutineCalendarFixture(f,secret);
  const call=async(query='',body,actor='frank')=>{
    const res=await f.mf.dispatchFetch(new URL('/api/routine-iqc'+query,f.url).href,{
      method:body?'POST':'GET',headers:{origin:f.url.origin,cookie:'process_demo='+cookie(actor),'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:res.status,data:await res.json()};
  };
  const initial=await call();
  const configured=await call('',{action:'configure',operationId:'synthetic-configure',expectedRevision:initial.data.revision,
    expectedStateRevision:initial.data.stateRevision,scope:'routine-iqc-only',confirm:'START IQC',startAck:true,start:today,reason:'Synthetic plan test'});
  assert.equal(configured.status,200);
  const current=await call();assert.equal(current.data.jobs.length,1);
  const job=current.data.jobs[0],plan={action:'create-plan',operationId:'synthetic-plan-native',expectedRevision:current.data.revision,jobIds:[job.id],start:today,end:today};
  const row=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
  const before=await row(),manifest=JSON.parse(before.values),bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');
  // Only this disposable instance is affected. Leave a valid manifest pointing to an unavailable unrelated aggregate.
  const key=manifest.__processRecords.values.qualityMasterControl.key;
  assert(await bucket.head(key));await bucket.delete(key);assert.equal(await bucket.head(key),null);
  assert.equal((await call('',plan,'routine-reader')).status,403);
  assert.deepEqual(await row(),before);
  const saved=await call('',plan);assert.equal(saved.status,200);
  const receipt=await call('?operationId='+plan.operationId),readback=await call();
  assert.equal(receipt.status,200);assert.equal(receipt.data.result.documentId,saved.data.result.documentId);
  assert.equal(readback.data.documents.length,1);assert.equal(readback.data.documents[0].status,'draft');
  assert.equal(readback.data.jobs[0].planId,saved.data.result.documentId);
  const after=await row();assert.equal(after.revision,before.revision+1);
  const preserved=JSON.parse(after.values);
  delete preserved.__processRecords.values.routineIqcControl;delete manifest.__processRecords.values.routineIqcControl;
  assert.deepEqual(preserved,manifest);
  console.log('Compiled IQC plan: 1 eligible job, 1 linked draft, matching receipt and one shared revision advance.');
} finally {await f.close();}
