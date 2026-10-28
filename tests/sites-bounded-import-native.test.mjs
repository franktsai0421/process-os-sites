// Compiled Worker, normal synthetic login and nonpersistent D1/R2 only.
import assert from 'node:assert/strict';import {scryptSync} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {createRootEntryFixture,nativeFailureDiagnostics} from './root-entry-native-fixture.mjs';
import {setup} from './hosted-import-fixtures.mjs';
import {createNormalizationPlan,openNormalizationView} from '../lib/snapshot-normalize.mjs';
import {createRecipeUploader} from '../lib/snapshot-recipe-uploader.mjs';
import {boundedAttemptSite,attemptCeilings} from '../lib/snapshot-attempt-policy.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const tests=[],report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,realData:false,realCredentials:false,remoteBindings:false,capacityKnown:false};let f,original,view,stage='startup',substage='startup';
async function test(name,run){stage=name;substage='case-start';await run();tests.push(name);}
// Release synthetic response bodies only after their original status assertion.
// Rejections retain the body substage and fail the original case; never retry.
async function consumeSyntheticResponse(response,bodySubstage){const prior=substage;substage=bodySubstage;await response.arrayBuffer();substage=prior;}
// Client-side observation only: bodySent is not proof that workerd read the body.
// Never inspect/log request fields, headers, body contents, sockets or error messages.
function observeFirstCaseTransport(){
 if(process.platform!=='win32')return null;
 const slots=['anonymous_configuration','anonymous_batch','forged_configuration','forged_batch','cross_origin_batch'];
 const names=['undici:request:create','undici:client:sendHeaders','undici:request:bodyChunkSent','undici:request:bodySent','undici:request:headers','undici:request:trailers','undici:request:error'];
 const codes=['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_SOCKET','UND_ERR_ABORTED','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_CONNECT_TIMEOUT'];
 const context=new AsyncLocalStorage(),requests=new WeakMap(),rows=[],subscriptions=[];let closed=false,observerFault=false;
 const own=(value,key)=>{if(value===null||typeof value!=='object')return undefined;const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;};
 const increment=(row,key)=>{row[key]=Math.min(2,row[key]+1);};
 function receive(kind,message){
  if(closed)return;
  try{
   const request=own(message,'request');
   if(!request||typeof request!=='object'){if(context.getStore())observerFault=true;return;}
   let row=requests.get(request);
   if(kind===0){
    const active=context.getStore();if(!active)return;
    if(row){row.ambiguous=true;active.ambiguous=true;}
    row=active;increment(row,'created');if(row.created>1)row.ambiguous=true;requests.set(request,row);return;
   }
   if(!row){const active=context.getStore();if(active)active.ambiguous=true;return;}
   if(kind===1){increment(row,'headerWrites');if(row.headerWrites>1)row.ambiguous=true;}
   if(kind===2){
    const chunk=own(message,'chunk');if(!ArrayBuffer.isView(chunk)){row.invalid=true;return;}
    const bytes=chunk.byteLength;if(!Number.isSafeInteger(bytes)||bytes<0){row.invalid=true;return;}
    increment(row,'sentChunks');row.sentBytes=Math.min(2,row.sentBytes+bytes);if(row.sentBytes>row.expectedBodyBytes)row.invalid=true;
   }
   if(kind===3){increment(row,'bodySent');if(row.bodySent>1)row.ambiguous=true;}
   if(kind===4){
    const status=own(own(message,'response'),'statusCode');
    if(!Number.isSafeInteger(status)||status<100||status>599){row.invalid=true;return;}
    increment(row,'responseHeaders');if(row.responseHeaders>1)row.ambiguous=true;row.status=status;
   }
   if(kind===5){increment(row,'responseComplete');if(row.responseComplete>1)row.ambiguous=true;}
   if(kind===6){increment(row,'errors');const code=own(own(message,'error'),'code'),safe=codes.includes(code)?code:'OTHER';if(!row.errorCodes.includes(safe)&&row.errorCodes.length<2)row.errorCodes.push(safe);}
  }catch{observerFault=true;}
 }
 for(let kind=0;kind<names.length;kind++){
  try{const name=names[kind],listener=message=>receive(kind,message);subscribe(name,listener);subscriptions.push({name,listener});}
  catch{observerFault=true;break;}
 }
 return{
  async run(operation){
   if(closed||rows.length>=slots.length){observerFault=true;return operation();}
   const index=rows.length,row={slot:slots[index],expectedBodyBytes:index===0||index===2?0:1,created:0,headerWrites:0,sentChunks:0,sentBytes:0,bodySent:0,responseHeaders:0,status:null,responseComplete:0,errors:0,errorCodes:[],fetch:'pending',ambiguous:false,invalid:false};rows.push(row);
   try{const response=await context.run(row,operation);row.fetch='resolved';return response;}
   catch(error){row.fetch='rejected';throw error;}
  },
  finish(){
   closed=true;let unsubscribed=true;
   for(const {name,listener}of subscriptions)try{if(!unsubscribe(name,listener))unsubscribed=false;}catch{unsubscribed=false;}
   try{context.disable();}catch{observerFault=true;}
   if(!unsubscribed)observerFault=true;
   return{scope:'WINDOWS_FIRST_CASE_CLIENT_ONLY',observerFault,unsubscribed,rows:rows.map(row=>({...row,evidence:observerFault||row.ambiguous||row.invalid||row.created!==1||row.fetch==='resolved'&&row.responseHeaders===0||row.fetch==='rejected'&&row.errors===0||row.bodySent>0&&row.sentBytes!==row.expectedBodyBytes?'inconclusive':'observed_client_events'}))};
  },
 };
}
try{
 original=await setup({canonical:false,ownerId:'frank'});const plan=await createNormalizationPlan(original.pack,{programCommit:'e'.repeat(40)});view=await openNormalizationView(original.pack,plan);
 const manifestSha256=await sha256(new TextEncoder().encode(JSON.stringify(plan.manifest))),origin='https://bounded-native.synthetic.invalid',targetFingerprint='c'.repeat(64),pins={projectId:boundedAttemptSite,origin,ownerId:'frank',targetFingerprint,manifestSha256};
 const policy={mode:'bounded-attempt',capacityKnown:false,approvalId:'synthetic-native-attempt',...pins,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString(),...attemptCeilings};
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ORIGIN:origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:manifestSha256,PROCESS_IMPORT_ATTEMPT_JSON:JSON.stringify(policy),PROCESS_SESSION_SECRET:'s'.repeat(64)}});
 const salt='34'.repeat(24),password='synthetic-bounded-'+'password',verifier='scrypt$32768$8$3$'+salt+'$'+scryptSync(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 const seed={platformUsers:JSON.stringify([{id:'frank',role:'admin',enabled:true,authEpoch:0,passwordHash:verifier}]),maintenanceMode:'1'};
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,0,?,?)').bind(JSON.stringify(seed),'synthetic').run();let cookie;
 const request=(path,options={})=>f.mf.dispatchFetch(origin+path,{...options,headers:{...(options.method&&options.method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...options.headers}});
 await test('anonymous and forged Site headers cannot view configuration or submit batches; cross-origin remains refused',async()=>{const observation=observeFirstCaseTransport();const firstRequest=(path,options)=>observation?observation.run(()=>request(path,options)):request(path,options);try{for(const headers of [{},{'X-OpenAI-User-Id':'frank','X-OpenAI-User-Role':'owner'}]){substage='configuration-dispatch';const r=await firstRequest('/api/snapshots/import?action=configuration',{headers});substage='configuration-status-assert';assert.equal(r.status,401);await consumeSyntheticResponse(r,'configuration-response-body');substage='batch-dispatch';const batch=await firstRequest('/api/snapshots/import?action=batch',{method:'POST',headers:{...headers,'Content-Type':'application/x-process-chunk-batch'},body:new Uint8Array([1])});substage='batch-status-assert';assert.equal(batch.status,401);await consumeSyntheticResponse(batch,'batch-response-body');}substage='cross-origin-dispatch';const cross=await firstRequest('/api/snapshots/import?action=batch',{method:'POST',headers:{Origin:'https://other.synthetic.invalid','Content-Type':'application/x-process-chunk-batch'},body:new Uint8Array([1])});substage='cross-origin-status-assert';assert.equal(cross.status,403);await consumeSyntheticResponse(cross,'cross-origin-response-body');substage='budget-count-read-and-assert';assert.equal((await f.db.prepare('SELECT count(*) n FROM process_import_budget').first()).n,0);substage='first-case-complete';}finally{if(observation)report.firstCaseTransport=observation.finish();}});
 await test('staff application session cannot begin a bounded campaign',async()=>{substage='staff-seed-write';await f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').bind(JSON.stringify({...seed,platformUsers:JSON.stringify([...JSON.parse(seed.platformUsers),{id:'synthetic-staff',role:'staff',enabled:true,authEpoch:0,passwordHash:verifier}])})).run();substage='staff-login-dispatch';const login=await request('/api/platform-login',{method:'POST',body:JSON.stringify({id:'synthetic-staff',password})});substage='staff-login-status-assert';assert.equal(login.status,200);await consumeSyntheticResponse(login,'staff-login-response-body');substage='staff-session-and-begin-dispatch';const staff=(login.headers.get('Set-Cookie')||'').split(';')[0],r=await request('/api/snapshots/import?action=begin',{method:'POST',headers:{Cookie:staff},body:JSON.stringify(plan.manifest)});substage='staff-begin-status-assert';assert.equal(r.status,403);await consumeSyntheticResponse(r,'staff-begin-response-body');substage='staff-budget-read-and-assert';assert.equal((await f.db.prepare('SELECT count(*) n FROM process_import_budget').first()).n,0);substage='staff-seed-restore';await f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').bind(JSON.stringify(seed)).run();substage='staff-case-complete';});
 await test('normal owner configuration says capacity unknown and provides no fake remaining quota',async()=>{const login=await request('/api/platform-login',{method:'POST',body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);await consumeSyntheticResponse(login,'owner-login-response-body');cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];assert.ok(cookie);const r=await request('/api/snapshots/import?action=configuration',{headers:{Cookie:cookie}});assert.equal(r.status,200);const text=await r.text(),value=JSON.parse(text);assert.equal(value.capacity,null);assert.equal(value.attempt.capacityKnown,false);assert.equal(value.budget.state,'not-started');assert.ok(!text.includes(verifier)&&!text.includes(password));});
 const client=await createRecipeUploader({source:view,pins,batch:true,request:(url,o)=>f.mf.dispatchFetch(url,{...o,headers:{...o.headers,Cookie:cookie}})}),options={allowDataWrite:true,attempt:policy};
 await test('compiled route meters every received chunk with durable server counters',async()=>{const result=await client.upload(options);assert.equal(result.phase,'integrity-verified');const r=await request('/api/snapshots/import?action=budget-status',{headers:{Cookie:cookie}}),b=await r.json();assert.equal(b.capacityKnown,false);assert.equal(b.state,'open');assert.equal(b.inFlight,false);assert.equal(b.used.writeCalls,plan.manifest.chunks.length+1);assert.ok(b.used.writeBytes>0&&b.used.writeBytes<=policy.writeBytes);});
 await test('compiled restore stays inactive and keeps the target verifier',async()=>{assert.equal((await client.restore(options)).phase,'data-ready');const shared=await request('/api/shared-state',{headers:{Cookie:cookie}});assert.equal(shared.status,503);await consumeSyntheticResponse(shared,'restore-shared-state-response-body');const row=await f.db.prepare('SELECT "values" v FROM shared_state WHERE id=1').first();assert.equal(JSON.parse(JSON.parse(row.v).platformUsers)[0].passwordHash,verifier);});
 await test('explicit complete activation permits normal login with the same target password',async()=>{assert.equal((await client.restore({...options,allowActivation:true})).phase,'active');const login=await request('/api/platform-login',{method:'POST',body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);await consumeSyntheticResponse(login,'activation-login-response-body');const next=(login.headers.get('Set-Cookie')||'').split(';')[0];const shared=await request('/api/shared-state',{headers:{Cookie:next}});assert.equal(shared.status,200);await consumeSyntheticResponse(shared,'activation-shared-state-response-body');const row=await f.db.prepare('SELECT "values" v FROM shared_state WHERE id=1').first();assert.equal(JSON.parse(JSON.parse(row.v).platformUsers)[0].passwordHash,verifier);});
 await test('compiled activation status reports the same closed or open state as the business gate',async()=>{const login=await request('/api/platform-login',{method:'POST',body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);await consumeSyntheticResponse(login,'activation-status-login-response-body');const currentCookie=(login.headers.get('Set-Cookie')||'').split(';')[0];for(const [state,active,enabled]of [['open',null,false],['complete','synthetic-pending',false],['stopped',null,false],['complete',null,true]]){await f.db.prepare('UPDATE process_import_budget SET state=?,active_request=? WHERE id=1').bind(state,active).run();const status=await request('/api/snapshots/import?action=activation-status&id='+client.transferId,{headers:{Cookie:currentCookie}});assert.equal(status.status,200);assert.equal((await status.json()).businessTrafficEnabled,enabled);const shared=await request('/api/shared-state',{headers:{Cookie:currentCookie}});assert.equal(shared.status,enabled?200:503);await consumeSyntheticResponse(shared,'activation-status-shared-state-response-body');}});
 await f.close();f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ORIGIN:origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:manifestSha256,PROCESS_IMPORT_ATTEMPT_JSON:JSON.stringify(policy),PROCESS_SESSION_SECRET:'s'.repeat(64)}});
 await f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,0,?,?)').bind(JSON.stringify(seed),'synthetic').run();
 await test('server-side exhaustion rejects manual chunk calls before storage and freezes the campaign',async()=>{const login=await request('/api/platform-login',{method:'POST',body:JSON.stringify({id:'frank',password})});assert.equal(login.status,200);await consumeSyntheticResponse(login,'exhaustion-login-response-body');cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];const begin=await request('/api/snapshots/import?action=begin',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify(plan.manifest)});assert.equal(begin.status,200);const {id}=await begin.json();await f.db.prepare('UPDATE process_import_budget SET write_bytes=? WHERE id=1').bind(policy.writeBytes).run();const c=plan.manifest.chunks[0],bytes=await view.readChunk(c.id),r=await request('/api/snapshots/import?id='+id+'&chunk='+c.id,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/octet-stream'},body:bytes});assert.equal(r.status,409);assert.equal((await r.json()).error,'IMPORT_ATTEMPT_BUDGET_EXHAUSTED');assert.equal((await f.db.prepare('SELECT count(*) n FROM process_snapshot_chunks').first()).n,0);assert.equal((await f.db.prepare('SELECT state FROM process_import_budget').first()).state,'stopped');const shared=await request('/api/shared-state',{headers:{Cookie:cookie}});assert.equal(shared.status,503);await consumeSyntheticResponse(shared,'exhaustion-shared-state-response-body');const row=await f.db.prepare('SELECT "values" v FROM shared_state').first();assert.equal(JSON.parse(JSON.parse(row.v).platformUsers)[0].passwordHash,verifier);});
 report.status='PASS_COMPILED_SYNTHETIC_BOUNDED_IMPORT';
}catch(e){report.status='FAIL_COMPILED_SYNTHETIC_BOUNDED_IMPORT';report.failedStage=stage;report.failedSubstage=substage;report.failureDiagnostics=nativeFailureDiagnostics(e);report.failureLocation=report.failureDiagnostics.location;report.errorType=e.constructor.name;if(/^[A-Z_]+$/.test(e.message))report.code=e.message;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();if(view)await view.close();if(original)await original.close();report.disposed=true;report.tests=tests;report.cases=tests.length;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
