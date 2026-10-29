import test from 'node:test';import assert from 'node:assert/strict';
import {incidentFixture} from './incident-recovery-fixture.mjs';import {createAttemptBudget} from '../lib/snapshot-attempt-budget.mjs';
async function fixture(){const f=await incidentFixture();await f.advanceTo('resumed');const budget=await createAttemptBudget({db:f.db,bucket:f.bucket,policy:f.policy,pins:f.pins,now:f.now});return{...f,budget};}
void test('normal owner budget preserves native grant/history and meters its own metadata request',async()=>{
 const f=await fixture();try{const before=f.sqlite.prepare('SELECT * FROM process_import_verify_capabilities ORDER BY id').all(),requests=f.sqlite.prepare('SELECT * FROM process_import_native_requests').all(),old=await f.budget.status();
  await f.budget.run('verify',false,async s=>{const t=await s.db.prepare('SELECT version FROM process_snapshot_transfers WHERE id=?').bind(f.pins.transferId).first();await s.db.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=288 WHERE id=? AND version=? AND phase='receiving'").bind(f.pins.transferId,t.version).run();return{phase:'receiving'};});
  const after=await f.budget.status();assert.equal(after.state,'open');assert.equal(after.inFlight,false);assert.equal(after.used.requests,old.used.requests+1);assert.equal(after.used.dbStatements,old.used.dbStatements+1);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM process_import_verify_capabilities ORDER BY id').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM process_import_native_requests').all(),requests);
 }finally{f.close();}
});
void test('another owner request cannot enter active native-era campaign lock or poison current request',async()=>{
 const f=await fixture();try{let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);const first=f.budget.run('verify',false,async()=>{entered();await gate;return{};});await ready;
  await assert.rejects(f.budget.run('verify',false,async()=>assert.fail('second writer')),/IMPORT_ATTEMPT_IN_FLIGHT/);assert.equal((await f.budget.status()).inFlight,true);release();await first;assert.equal((await f.budget.status()).state,'open');assert.equal((await f.budget.status()).inFlight,false);
 }finally{f.close();}
});
void test('stopped budget is rejected and never unlocked by owner continuation',async()=>{
 const f=await fixture();try{f.sqlite.prepare("UPDATE process_import_budget SET state='stopped',reason='synthetic-unknown'").run();const before=f.sqlite.prepare('SELECT * FROM process_import_budget').get();await assert.rejects(f.budget.run('verify',false,async()=>assert.fail('must not execute')),/IMPORT_ATTEMPT_STOPPED/);assert.deepEqual(f.sqlite.prepare('SELECT * FROM process_import_budget').get(),before);}finally{f.close();}
});
