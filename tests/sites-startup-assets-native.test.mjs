// Actual compiled HTTP and ephemeral D1/R2, synthetic tiny payloads only.
import assert from 'node:assert/strict';import {createHmac,createHash} from 'node:crypto';import fs from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {createRootEntryFixture,nativeFailureDiagnostics} from './root-entry-native-fixture.mjs';import {startupFixture} from './startup-assets.test.mjs';
import {createStartupAssets,startupCase} from '../lib/startup-assets.mjs';import {accessKeys} from '../public/process/access-policy.mjs';
const report={tests:[],realData:false,realCredentials:false,remoteBindings:false};let f,s,observation,stage='start',substage='start';const hash=b=>createHash('sha256').update(b).digest('hex');async function test(name,fn){stage=name;substage='case-start';await fn();report.tests.push(name);}
// Release synthetic replies after original assertions; keep body failures visible and never retry.
async function consumeSyntheticResponse(response,bodySubstage){const previous=substage;substage=bodySubstage;await readSyntheticBody(response,'array_buffer');substage=previous;}
// Windows client evidence only: bodySent never proves server consumption.
// Fixed fixture slots; no request/header/body contents or socket properties are inspected.
function observeStartupTransport(){
 if(process.platform!=='win32')return null;
 const slots=['session_missing','session_nonowner','session_expired','session_wrong_epoch','session_forged','cross_origin_put','owner_wrong_index','owner_fourth_file','owner_page','publish_undefined','publish_empty','publish_nonempty','publish_cross_origin',...Array.from({length:3},(_,i)=>['owner','anonymous','dashboard','ab','c','lines','denied','iqc','other_owner'].map(role=>`seed_${i+1}_${role}`)).flat(),'retained_iqc','retained_anonymous','retained_dashboard'];
 const names=['undici:request:create','undici:client:sendHeaders','undici:request:bodyChunkSent','undici:request:bodySent','undici:request:headers','undici:request:trailers','undici:request:error'];
 const events=['create','send_headers','body_chunk_sent','body_sent','response_headers','response_complete','request_error'];
 const codes=['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_SOCKET','UND_ERR_ABORTED','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_CONNECT_TIMEOUT'];
 const context=new AsyncLocalStorage(),requests=new WeakMap(),responses=new WeakMap(),sockets=new WeakMap(),rows=[],subscriptions=[];let closed=false,observerFault=false,sequence=0,socketCount=0;
 const own=(value,key)=>{if(value===null||typeof value!=='object')return undefined;const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;};
 const increment=(row,key)=>{row[key]=Math.min(16,row[key]+1);if(row[key]===16)row.invalid=true;};
 function receive(kind,message){
  if(closed)return;
  try{
   const request=own(message,'request');
   if(!request||typeof request!=='object'){if(context.getStore())observerFault=true;return;}
   let row=requests.get(request);
   if(kind===0){
    const active=context.getStore();if(!active)return;
    if(row){row.ambiguous=true;active.ambiguous=true;}
    row=active;increment(row,'created');if(row.created>1)row.ambiguous=true;requests.set(request,row);
   }
   if(!row){const active=context.getStore();if(active)active.ambiguous=true;return;}
   if(sequence<512&&row.events.length<16)row.events.push({order:++sequence,event:events[kind]});else row.invalid=true;
   if(kind===1){
    increment(row,'headerWrites');if(row.headerWrites>1)row.ambiguous=true;
    const socket=own(message,'socket');
    if(!socket||typeof socket!=='object'){row.invalid=true;return;}
    let id=sockets.get(socket);if(!id){if(socketCount>=43){row.invalid=true;return;}id=++socketCount;sockets.set(socket,id);}
    if(row.socketId!==null&&row.socketId!==id)row.ambiguous=true;row.socketId=id;
   }
   if(kind===2){
    const chunk=own(message,'chunk');if(!ArrayBuffer.isView(chunk)){row.invalid=true;return;}
    const bytes=chunk.byteLength;if(!Number.isSafeInteger(bytes)||bytes<0){row.invalid=true;return;}
    increment(row,'sentChunks');row.sentBytes=Math.min(10,row.sentBytes+bytes);if(row.sentBytes>row.expectedBodyBytes)row.invalid=true;
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
   const index=rows.length,row={slot:slots[index],expectedBodyBytes:index===5||index===7?9:index===11?1:0,phase:'dispatch',fetch:'pending',body:'not_started',created:0,headerWrites:0,socketId:null,sentChunks:0,sentBytes:0,bodySent:0,responseHeaders:0,status:null,responseComplete:0,errors:0,errorCodes:[],events:[],ambiguous:false,invalid:false};rows.push(row);
   try{const response=await context.run(row,operation);row.fetch='resolved';row.phase='status';if(response&&typeof response==='object')responses.set(response,row);else row.invalid=true;return response;}
   catch(error){row.fetch='rejected';throw error;}
  },
  async body(response,operation){
   const row=responses.get(response);if(!row){observerFault=true;return operation();}
   if(row.body!=='not_started')row.ambiguous=true;row.phase='body';row.body='pending';
   try{const value=await operation();row.body='resolved';row.phase='body_complete';return value;}
   catch(error){row.body='rejected';throw error;}
  },
  finish(){
   closed=true;let unsubscribed=true;
   for(const {name,listener}of subscriptions)try{if(!unsubscribe(name,listener))unsubscribed=false;}catch{unsubscribed=false;}
   try{context.disable();}catch{observerFault=true;}
   if(!unsubscribed)observerFault=true;
   return{scope:'WINDOWS_STARTUP_FIXTURE_CLIENT_ONLY',runtimeExit:'not_observable_via_public_sdk',observerFault,unsubscribed,rows:rows.map(row=>({...row,evidence:observerFault||row.ambiguous||row.invalid||row.created!==1||row.fetch==='resolved'&&(row.headerWrites!==1||row.responseHeaders!==1)||row.body==='resolved'&&(row.bodySent!==1||row.responseComplete!==1)||row.fetch==='rejected'&&row.errors===0||row.bodySent>0&&row.sentBytes!==row.expectedBodyBytes?'inconclusive':'observed_client_events'}))};
  },
 };
}
function readSyntheticBody(response,kind){const read=()=>kind==='json'?response.json():response.arrayBuffer();return observation?observation.body(response,read):read();}
try{
 fs.mkdirSync(new URL('../.sites-runtime/',import.meta.url),{recursive:true});
 s=startupFixture();const origin=startupCase.origin,secret='synthetic-startup-session-only',owner={id:'frank',role:'admin',enabled:true,authEpoch:4};
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ORIGIN:origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_SESSION_SECRET:secret}});const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');report.buildEntrySha256=f.buildEntrySha256;
 const only=(id,view)=>({...owner,id,role:'staff',accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,k===view]))});
 const restricted=[only('dashboard-only','dashboard.view'),only('ab-only','ab.view'),only('c-only','c.view'),only('lines-only','lines.view'),only('denied',null)];
 const seed=users=>f.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,496,?,?) ON CONFLICT(id) DO UPDATE SET "values"=excluded."values"').bind(JSON.stringify({platformUsers:JSON.stringify(users)}),'synthetic').run();await seed([owner,{...owner,id:'other-owner'},...restricted,only('iqc-only','iqc.view')]);
 const retainedBytes=new Uint8Array([1]),retainedSha=hash(retainedBytes);Object.assign(s.base.assets[0],{key:'company-assets/objects/'+retainedSha,sha256:retainedSha});s.baseBytes=new TextEncoder().encode(JSON.stringify(s.base));s.plan.indexSha=hash(s.baseBytes);await bucket.put(s.base.assets[0].key,retainedBytes,{httpMetadata:{contentType:'image/png'},customMetadata:{sha256:retainedSha}});
 await f.db.prepare("INSERT INTO process_snapshot_transfers(id,project_id,target,manifest_sha,manifest_key,owner_id,phase,version,verify_cursor,chunk_count,total_bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,'integrity-verified',91,1401,1401,275566702,?,?)").bind(startupCase.transferId,startupCase.projectId,startupCase.target,startupCase.manifestSha,'synthetic/manifest','frank',Date.now(),Date.now()+86400000).run();
 await f.db.prepare('INSERT INTO process_snapshot_target(id,target,transfer_id) VALUES(1,?,?)').bind(startupCase.target,startupCase.transferId).run();await f.db.prepare("INSERT INTO process_snapshot_activations VALUES(?,'active',2519,1256,1253,1,?)").bind(startupCase.transferId,'0'.repeat(64)).run();await f.db.prepare("INSERT INTO process_import_budget(id,policy_sha,policy,state,requests) VALUES(1,?,?,'complete',867)").bind('a'.repeat(64),'{}').run();await bucket.put('company-assets/index.json',s.baseBytes,{httpMetadata:{contentType:'application/json'}});
 const signed=(id='frank',epoch=4,expires=Date.now()+3600000)=>{const p=Buffer.from(JSON.stringify({version:2,id,sessionType:'platform',authEpoch:epoch,expires,nonce:'synthetic-startup'})).toString('base64');return'process_demo='+p+'.'+createHmac('sha256',secret).update(p).digest('hex');};
 observation=observeStartupTransport();
 const request=(route,{method='GET',cookie=signed(),headers={},body}={})=>{const dispatch=()=>f.mf.dispatchFetch(origin+route,{method,headers:{Connection:'close',...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin}:{}),...headers},body});return observation?observation.run(dispatch):dispatch();};
 const before={budget:(await f.db.prepare('SELECT * FROM process_import_budget').all()).results,activation:(await f.db.prepare('SELECT * FROM process_snapshot_activations').all()).results,owner:(await f.db.prepare('SELECT * FROM shared_state').all()).results};
 await test('compiled fixed endpoint rejects missing forged nonowner expired wrong-epoch and cross-origin sessions without any admission',async()=>{substage='session-rejections-dispatch-and-assert';for(const cookie of ['',signed('other-owner'),signed('frank',4,Date.now()-1),signed('frank',9),'process_demo=forged']){const denied=await request('/api/setup/startup-assets',{cookie});assert.equal(denied.status,403);await consumeSyntheticResponse(denied,'session-rejection-response-body');}substage='cross-origin-put-dispatch-and-assert';const crossPut=await request('/api/setup/startup-assets?file=imported-data.js',{method:'PUT',headers:{Origin:'https://cross.synthetic.invalid','Sec-Fetch-Site':'cross-site'},body:'synthetic'});assert.equal(crossPut.status,403);await consumeSyntheticResponse(crossPut,'cross-origin-put-response-body');substage='admission-count-read-and-assert';assert.equal((await f.db.prepare("SELECT count(*) n FROM process_import_attempts WHERE action='startup-asset'").first()).n,0);});
 await test('compiled owner route is reachable but refuses synthetic wrong index and caller-selected fourth file',async()=>{substage='owner-wrong-index-dispatch-and-status';const r=await request('/api/setup/startup-assets');assert.equal(r.status,409);substage='owner-wrong-index-response-json';assert.equal((await readSyntheticBody(r,'json')).error,'STARTUP_INDEX_CONFLICT');substage='owner-fourth-file-dispatch-and-status';const bad=await request('/api/setup/startup-assets?file=process-equipment-source.json',{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:'synthetic'});assert.equal(bad.status,409);substage='owner-fourth-file-response-json';assert.equal((await readSyntheticBody(bad,'json')).error,'STARTUP_FILE_NOT_ALLOWED');substage='owner-startup-page-dispatch-and-status';const page=await request('/setup/startup-assets');assert.equal(page.status,200);await consumeSyntheticResponse(page,'startup-page-response-body');});
 await test('compiled empty HTTP publish body reaches pinned writer, nonempty body and cross-site request never admit',async()=>{for(const body of [undefined,new Uint8Array(0)]){const r=await request('/api/setup/startup-assets?action=publish',{method:'POST',body});assert.equal(r.status,409);assert.equal((await readSyntheticBody(r,'json')).error,'STARTUP_INDEX_CONFLICT');}const bad=await request('/api/setup/startup-assets?action=publish',{method:'POST',body:new Uint8Array([1])});assert.equal(bad.status,400);assert.equal((await readSyntheticBody(bad,'json')).error,'STARTUP_INPUT');const cross=await request('/api/setup/startup-assets?action=publish',{method:'POST',headers:{Origin:'https://cross.synthetic.invalid','Sec-Fetch-Site':'cross-site'}});assert.equal(cross.status,403);await consumeSyntheticResponse(cross,'cross-origin-publish-response-body');assert.equal((await f.db.prepare("SELECT count(*) n FROM process_import_attempts WHERE action='startup-asset'").first()).n,0);assert.equal(hash(new Uint8Array(await(await bucket.get('company-assets/index.json')).arrayBuffer())),s.plan.indexSha);});
 const core=()=>createStartupAssets({db:f.db,bucket,authorize:async()=>true,plan:s.plan});
 await test('actual D1 one-use admission and R2 readbacks complete fixed synthetic three-file supplement preserving all main rows',async()=>{for(let i=0;i<3;i++)assert.equal((await core().put(s.plan.files[i].name,s.request(i))).state,'complete');const done=await core().publish();assert.equal(done.originalEntriesPreserved,1);assert.equal(done.entries,4);assert.equal((await core().status()).state,'complete');assert.deepEqual((await f.db.prepare('SELECT * FROM process_import_budget').all()).results,before.budget);assert.deepEqual((await f.db.prepare('SELECT * FROM process_snapshot_activations').all()).results,before.activation);assert.deepEqual((await f.db.prepare('SELECT * FROM shared_state').all()).results,before.owner);assert.equal((await f.db.prepare("SELECT count(*) n FROM process_import_attempts WHERE action='startup-asset' AND state='complete'").first()).n,4);await assert.rejects(core().put(s.plan.files[0].name,s.request(0)),/ALREADY_ATTEMPTED/);});
 await test('actual R2 stale ETag cannot replace the published index',async()=>{const r=await bucket.put('company-assets/index.json','must never replace',{onlyIf:{etagMatches:'stale-etag'}});assert.equal(r,null);assert.equal((await core().status()).state,'complete');});
 await test('compiled three seed routes serve verified globals only to fixed Frank owner, denying each single module and another admin',async()=>{for(const spec of s.plan.files){const route='/process/data/'+spec.name,r=await request(route);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/javascript');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(hash(new Uint8Array(await readSyntheticBody(r,'array_buffer'))),spec.sha256);const anonymous=await request(route,{cookie:''});assert.equal(anonymous.status,401);await consumeSyntheticResponse(anonymous,'seed-anonymous-response-body');for(const id of [...restricted.map(u=>u.id),'iqc-only','other-owner']){const denied=await request(route,{cookie:signed(id)});assert.equal(denied.status,403,id+' must not receive '+spec.name);await consumeSyntheticResponse(denied,'seed-restricted-response-body');}}});
 await test('compiled retained original asset keeps its existing module ACL and all account/control rows remain unchanged',async()=>{const route=s.base.assets[0].path,r=await request(route,{cookie:signed('iqc-only')});assert.equal(r.status,200);assert.equal(hash(new Uint8Array(await readSyntheticBody(r,'array_buffer'))),retainedSha);const anonymous=await request(route,{cookie:''});assert.equal(anonymous.status,401);await consumeSyntheticResponse(anonymous,'retained-anonymous-response-body');const denied=await request(route,{cookie:signed('dashboard-only')});assert.equal(denied.status,403);await consumeSyntheticResponse(denied,'retained-restricted-response-body');const index=JSON.parse(await(await bucket.get('company-assets/index.json')).text());assert.deepEqual(index.assets.filter(a=>!a.path.startsWith('/process/data/')),s.base.assets);for(const asset of index.assets.filter(a=>a.path.startsWith('/process/data/')))assert.deepEqual(asset.permissions,['users.view']);assert.deepEqual((await f.db.prepare('SELECT * FROM process_import_budget').all()).results,before.budget);assert.deepEqual((await f.db.prepare('SELECT * FROM process_snapshot_activations').all()).results,before.activation);assert.deepEqual((await f.db.prepare('SELECT * FROM shared_state').all()).results,before.owner);});
 report.status='PASS_COMPILED_STARTUP_SUPPLEMENT';
}catch(e){report.status='FAIL_COMPILED_STARTUP_SUPPLEMENT';report.stage=stage;report.failedSubstage=substage;report.failureDiagnostics=nativeFailureDiagnostics(e);report.errorType=e.constructor.name;if(/^[A-Z0-9_]+$/.test(e.message||''))report.code=e.message;report.storageError=String(e.message||'').match(/(?:no such (?:table|column): [A-Za-z0-9_]+|near "[^"]{1,80}": syntax error|NOT NULL constraint failed: [A-Za-z0-9_.]+|CHECK constraint failed: [A-Za-z0-9_]+)/)?.[0]||null;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;report.frames=[...String(e.stack||'').matchAll(/([A-Za-z0-9_.-]+\.mjs:\d+:\d+)/g)].map(m=>m[1]);}
finally{if(observation)report.transport=observation.finish();if(f)await f.close();s?.close();report.disposed=true;report.cases=report.tests.length;}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
