// Compiled application; ephemeral D1/R2, normal synthetic owner login only.
// The real pinned object is never opened. Wrong synthetic bytes must be refused.
import assert from 'node:assert/strict';import {scryptSync} from 'node:crypto';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {seedObservationCase} from './c273-observation-fixture.mjs';
import {c273Case as C} from '../lib/snapshot-c273-observation.mjs';
const report={cases:[],realData:false,realCredentials:false,remoteBindings:false,realCasePositiveHashNotTested:true};let f,stage='startup';
async function test(name,run){stage=name;await run();report.cases.push(name);}
try{
 const issuedAt=Date.now(),programCommit=process.env.PROCESS_PROGRAM_COMMIT;
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_C273_OBSERVATION_ENABLED:'1',PROCESS_C273_OBSERVATION_JSON:JSON.stringify({format:'PROCESS_OS_C273_OBSERVATION_V1',programCommit,issuedAt,expiresAt:issuedAt+600000}),PROCESS_VERIFY_RECOVERY_ENABLED:'0',PROCESS_IMPORT_ORIGIN:C.origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:C.targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:C.manifestSha256,PROCESS_SESSION_SECRET:'s'.repeat(64)}});
 const password='synthetic-observation-password',salt='12'.repeat(24),verifier='scrypt$32768$8$3$'+salt+'$'+scryptSync(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 await seedObservationCase(f.db,{platformUsers:JSON.stringify([{id:'frank',role:'admin',enabled:true,authEpoch:0,passwordHash:verifier}]),maintenanceMode:'1'});
 const endpoint=C.origin+'/api/snapshots/import?action=c273-observation';let cookie;
 const request=(method='GET',headers={})=>f.mf.dispatchFetch(endpoint,{method,headers:{...(method==='POST'?{Origin:C.origin}:{}),...headers},redirect:'manual'});
 const before=await f.db.prepare('SELECT * FROM process_import_budget').first();
 await test('compiled observer requires normal owner login and same-origin; no slot claimed',async()=>{
  assert.equal((await request()).status,401);assert.equal((await request('POST',{Origin:'https://other.invalid'})).status,403);
  assert.equal((await request('POST',{Authorization:'Bearer synthetic-rejected'})).status,404);
  const login=await f.mf.dispatchFetch(C.origin+'/api/platform-login',{method:'POST',headers:{Origin:C.origin,'Content-Type':'application/json'},body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];assert.ok(cookie);
  assert.equal((await request('POST',{Cookie:cookie,Origin:'https://other.invalid'})).status,403);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_c273_observation').first()).n,0);
 });
 await test('compiled owner metadata read is ready and no-store without mutating original incident',async()=>{
  const r=await request('GET',{Cookie:cookie}),value=await r.json();assert.equal(r.status,200);assert.equal(value.status,'ready');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(Object.keys(value).sort(),['elapsedMs','sha256','size','stage','status']);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_c273_observation').first()).n,0);assert.deepEqual(await f.db.prepare('SELECT * FROM process_import_budget').first(),before);
 });
 await test('compiled fixed R2 read refuses wrong hash and reveals no body, metadata or verifier',async()=>{
  const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE'),bytes=new Uint8Array(C.bytes).fill(7);await bucket.put('process-import/v1/'+C.transferId+'/chunks/c273',bytes,{customMetadata:{syntheticSecret:'DO_NOT_DISCLOSE'}});
  const r=await request('POST',{Cookie:cookie}),text=await r.text(),value=JSON.parse(text);assert.equal(r.status,409);assert.equal(value.status,'mismatch');assert.equal(value.stage,'body-hash');assert.equal(value.size,C.bytes);assert.notEqual(value.sha256,C.sha256);assert.ok(!text.includes(password)&&!text.includes(verifier)&&!text.includes('DO_NOT_DISCLOSE'));
  assert.equal((await f.db.prepare('SELECT state FROM process_import_c273_observation').first()).state,'finished');report.receipt=value;
 });
 await test('compiled repeat POST only returns existing receipt; original locks, counters and cursor remain',async()=>{
  const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');await bucket.put('process-import/v1/'+C.transferId+'/chunks/c273','DIFFERENT_SYNTHETIC_BYTES');
  const repeat=await request('POST',{Cookie:cookie});assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),report.receipt);assert.deepEqual(await(await request('GET',{Cookie:cookie})).json(),report.receipt);
  assert.deepEqual(await f.db.prepare('SELECT * FROM process_import_budget').first(),before);assert.equal((await f.db.prepare('SELECT version,verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);assert.equal((await f.db.prepare('SELECT state FROM process_import_native_requests').first()).state,'unknown');assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_snapshot_activations').first()).n,0);
 });
 report.buildEntrySha256=f.buildEntrySha256;report.status='PASS_COMPILED_SYNTHETIC_C273_OBSERVATION';
}catch(e){report.status='FAIL_COMPILED_SYNTHETIC_C273_OBSERVATION';report.failedStage=stage;report.errorType=e.constructor.name;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();report.disposed=true;report.caseCount=report.cases.length;report.finishedAt=new Date().toISOString();}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
