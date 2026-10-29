import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {incidentFixture} from './incident-recovery-fixture.mjs';
import {setup,actor} from './hosted-import-fixtures.mjs';
import {createNativeIntentLedger} from '../lib/snapshot-native-intents.mjs';
import {createAttemptBudget} from '../lib/snapshot-attempt-budget.mjs';

// Count actual prepared statement executions, including statements in batches.
// This measures control cost, not remote latency or the provider's quota model.
function instrument(db,{afterRun=async()=>{},beforeRun=async()=>{}}={}){
 const prepare=db.prepare,batch=db.batch,counts={first:0,all:0,run:0,batches:0};
 db.prepare=sql=>{const statement=prepare(sql);function wrap(raw,args=[]){return{
  bind(...v){return wrap(statement.bind(...v),v);},
  first(...v){counts.first++;return raw.first(...v);},
  all(...v){counts.all++;return raw.all(...v);},
  async run(){counts.run++;await beforeRun(sql,args);const result=await raw.run();await afterRun(sql,args);return result;},
 };}return wrap(statement);};
 db.batch=items=>{counts.batches++;return batch(items);};return counts;
}
async function context(f){
 const handle=await f.runtime.authority.authenticate({capabilityId:f.config.grant.id,token:f.applicationToken});
 const ledger=createNativeIntentLedger({db:f.db,authority:f.runtime.authority,handle,pins:f.pins,nonce:'10000000-0000-4000-8000-000000000273',requestSha256:'d'.repeat(64),action:'verify',now:f.now});
 const budget=await createAttemptBudget({db:f.db,bucket:f.bucket,policy:f.policy,pins:f.pins,now:f.now});
 return{ledger,budget};
}
for(const mode of ['control','settlement-before-apply','settlement-ack-lost'])void test('joined controls: '+mode,async()=>{
 const f=await incidentFixture(),logs=[],savedLog=console.error;try{
  await f.advanceTo('resumed');let injected=false;
  const inject=async(sql,args)=>{if(!injected&&sql.startsWith('UPDATE process_import_native_operations SET state=?')&&args[0]==='succeeded'&&args[4]===3){injected=true;throw Error('SYNTHETIC_SETTLEMENT_UNAVAILABLE');}};
  const counts=instrument(f.db,mode==='control'?{}:mode==='settlement-before-apply'?{beforeRun:inject}:{afterRun:inject});
  const {ledger,budget}=await context(f);let gets=0;
  const raw={async get(){gets++;const bytes=new Uint8Array(gets===3?14234:128);bytes.fill(gets);return{size:bytes.length,body:new Blob([bytes]).stream()};}};
  console.error=(...v)=>logs.push(v.join(' '));
  const run=budget.run('verify',false,async s=>{const b=s.bucket(raw);for(const suffix of ['manifest.json','chunks/c272','chunks/c273']){const object=await b.get('process-import/v1/'+f.pins.transferId+'/'+suffix);await new Response(object.body).arrayBuffer();}},ledger);
  if(mode==='control')await run;else await assert.rejects(run,/PROVIDER_OR_UNCERTAIN/);
  const statements=counts.first+counts.all+counts.run;
  assert.ok(statements<=74,'same three-GET scope previously executed 128 statements');
  const r=f.sqlite.prepare('SELECT request_id,state FROM process_import_native_requests WHERE nonce=?').get('10000000-0000-4000-8000-000000000273');
  const ops=f.sqlite.prepare('SELECT ordinal,state FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal').all(r.request_id),b=f.sqlite.prepare('SELECT * FROM process_import_budget').get();
  assert.equal(gets,3);assert.equal(r.state,mode==='control'?'complete':'unknown');
  assert.deepEqual(ops.map(x=>x.state),['succeeded','succeeded',mode==='settlement-before-apply'?'unknown':'succeeded']);
  assert.equal(b.active_request===null,mode==='control');assert.equal(b.state,mode==='control'?'open':'stopped');
  assert.equal(f.sqlite.prepare('SELECT verify_cursor FROM process_snapshot_transfers').get().verify_cursor,272);
  assert.equal(b.write_bytes,276216440);assert.equal(b.write_calls,1402);
  if(mode!=='control'){assert.ok(injected);assert.ok(logs.some(s=>s.includes('d1-settlement')));assert.equal((await ledger.receipt()).automaticRetryAllowed,false);}
 }finally{console.error=savedLog;f.close();}
});

const changes={
 'missing maintenance':"DELETE FROM process_import_verify_maintenance",
 'missing budget':"DELETE FROM process_import_budget",
 'missing transfer':"DELETE FROM process_snapshot_transfers",
 'missing old request':"DELETE FROM process_import_native_requests WHERE state='blocked'",
 'missing old grant':"DELETE FROM process_import_capabilities",
 'wrong transfer pin':"UPDATE process_snapshot_transfers SET target='wrong'",
 'wrong cursor/version pair':"UPDATE process_snapshot_transfers SET verify_cursor=288",
 'changed active request':"UPDATE process_import_budget SET active_request='other-request'",
 'changed policy hash':"UPDATE process_import_budget SET policy_sha='changed'",
 'changed request generation':"UPDATE process_import_native_requests SET generation=2 WHERE state='running'",
 'revoked new grant':"UPDATE process_import_verify_capabilities SET revoked_at=1,generation=generation+1",
};
for(const [label,sql]of Object.entries(changes))void test('fresh joined fence after admission rejects '+label,async()=>{
 const f=await incidentFixture();try{
  await f.advanceTo('resumed');let changed=false,gets=0;
  instrument(f.db,{afterRun:async s=>{if(!changed&&s.startsWith("UPDATE process_import_native_operations SET state='pending'")){changed=true;f.sqlite.exec(sql);}}});
  const {ledger,budget}=await context(f);
  await assert.rejects(budget.run('verify',false,s=>s.bucket({async get(){gets++;throw Error('MUST_NOT_DISPATCH');}}).get('process-import/v1/'+f.pins.transferId+'/chunks/c273'),ledger),/IMPORT_/);
  assert.equal(changed,true);assert.equal(gets,0);
  const op=f.sqlite.prepare('SELECT state,evidence FROM process_import_native_operations WHERE ordinal=1 AND request_id IN (SELECT request_id FROM process_import_native_requests WHERE nonce=?)').get('10000000-0000-4000-8000-000000000273');
  assert.equal(op.state,'failed');assert.equal(op.evidence,'not-invoked-fence');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_snapshot_activations').get().n,0);
 }finally{f.close();}
});

void test('manifest and chunk each hash once in transfer layer and preserve descriptor checks',async()=>{
 const f=await setup({canonical:false});let digest;try{
  const {id}=await f.transfer.begin(actor,f.bytes);for(const c of f.pack.completed.chunks)await f.transfer.receive(actor,id,c.id,f.pack.chunks.get(c.id));
  digest=mock.method(crypto.subtle,'digest');
  const result=await f.transfer.verify(actor,id,{expectedVersion:1,limit:1});
  assert.equal(result.verifiedCursor,1);assert.equal(digest.mock.callCount(),2);
  digest.mock.restore();
  const descriptor=f.pack.completed.chunks[1],key='process-import/v1/'+id+'/chunks/'+descriptor.id;
  const bad=f.pack.chunks.get(descriptor.id).slice();bad[0]^=1;await f.bucket.put(key,bad,{});
  await assert.rejects(f.transfer.verify(actor,id,{expectedVersion:2,limit:1}),/IMPORT_CHUNK_INTEGRITY/);
  assert.equal((await f.transferStore.get(id)).verify_cursor,1);
 }finally{digest?.mock.restore();await f.close();}
});
