import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fixture}=require('../scripts/equipment-atomic-fixture.cjs');

void test('saving and submitting an equipment draft preserve unrelated bodies and unresolved source issues',async t=>{
  const h=await fixture();
  try {
    const issues=Array.from({length:37},(_,i)=>({id:'source-issue-'+i,sourceRow:100+i,type:'synthetic',status:'pending',resolution:''}));
    await h.mutate(values=>{
      const control=JSON.parse(values.routineEquipmentControl);
      control.issues=issues;
      for(const version of control.versions)version.issues=issues;
      control.workflow.working.issues=issues;
      // An unrelated active snapshot is enough to exercise the old unbounded read.
      values.processAuthoringControl=JSON.stringify({workflow:{working:{notes:'x'.repeat(4*1024*1024)}}});
      values.routineEquipmentControl=JSON.stringify(control);
    });
    const manifest=()=>JSON.parse(h.db.prepare('SELECT "values" FROM shared_state').get().values).__processRecords;
    const before=manifest(),ref=before.values.processAuthoringControl;
    const body=JSON.parse(h.objects.get(ref.key)).workflow.working.__immutableBody;
    const read=h.env.STATE_ARCHIVE.get.bind(h.env.STATE_ARCHIVE);
    let bytes=0;
    h.env.STATE_ARCHIVE.get=async key=>{
      if(key===body.key)bytes+=h.objects.get(key).length;
      return read(key);
    };
    const path=['equipment',{id:'source'},'notes'];
    const original=(await h.state()).workflow.working.equipment.find(r=>r.id==='source');
    const saved=await h.command('routine-equipment','save',{
      moduleAction:'save-local-v1',patches:[{op:'set',path,value:'isolated note'}],guards:[{path,value:original.notes}]
    });
    const persisted=await h.state();
    assert.equal(persisted.workflow.saved.id,saved.receipt.savedId);
    const submitted=await h.command('routine-equipment','submit',{savedId:saved.receipt.savedId,reason:'Synthetic review'});
    const pending=(await h.state()).workflow;
    assert.equal(pending.pendingId,submitted.receipt.caseId);
    assert.equal(pending.cases.find(c=>c.id===pending.pendingId).savedId,saved.receipt.savedId);
    const review=await h.read('routine-equipment','reviewer','&caseId='+pending.pendingId);
    assert.equal(review.reviewCase.content.equipment.find(r=>r.id==='source').notes,'isolated note');
    assert.deepEqual(review.reviewCase.content.issues,issues);
    const after=manifest();
    assert.deepEqual(after.legacySources,before.legacySources);
    for(const key of Object.keys(before.values).filter(k=>k!=='routineEquipmentControl'))assert.deepEqual(after.values[key],before.values[key]);
    t.diagnostic('Unrelated active body bytes read by equipment workflow: '+bytes);
    assert.equal(bytes,0);
  } finally {h.close();}
});
