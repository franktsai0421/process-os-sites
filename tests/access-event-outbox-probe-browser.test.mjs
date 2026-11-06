import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
import {readAccessEventOutbox,waitForAccessEventOutboxEntries} from './access-event-outbox-probe.mjs';

let fixture,browser;const contexts=[],pageErrors=[],checks=[];let businessPosts=0;
try{
 fixture=await createFeedbackFixture({accessEvents:true});const business=await fixture.businessState();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:{}),args:['--disable-background-networking']});
 const page=async()=>{const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());const p=await context.newPage();p.on('pageerror',error=>pageErrors.push({name:error.name,message:error.message}));p.on('request',request=>{if(new URL(request.url()).pathname==='/api/bom/workflow'&&request.method()==='POST')businessPosts++;});await p.goto(fixture.origin+'/login');await p.locator('#id').waitFor();return p;};
 const schema=(p,{version,stores,hold=false})=>p.evaluate(({version,stores,hold})=>new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1',version);request.onupgradeneeded=()=>{for(const name of stores)request.result.createObjectStore(name);};request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(hold)window.__heldOutbox=request.result;else request.result.close();resolve();};}),{version,stores,hold});
 const inspect=p=>p.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,result={version:db.version,stores:[...db.objectStoreNames]};db.close();resolve(result);};}));
 for(const mode of ['count','all']){const p=await page();await assert.rejects(p.evaluate(readAccessEventOutbox,{mode}),/OUTBOX_NOT_INITIALIZED/);assert.equal(await p.evaluate(async()=>!(await indexedDB.databases()).some(db=>db.name==='process-access-event-outbox-v1')),true);checks.push('missing '+mode+' rejects without creating a DB');}
 const broken=await page();await schema(broken,{version:2,stores:['events']});await assert.rejects(broken.evaluate(readAccessEventOutbox),/OUTBOX_SCHEMA_MISSING/);assert.deepEqual(await inspect(broken),{version:2,stores:['events']});
 await broken.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('process-access-event-outbox-v1');request.onblocked=()=>reject(Error('PROBE_CONNECTION_LEAK'));request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve();}));checks.push('empty/broken schema cannot count as initialized; connection closed');
 const blocked=await page();await schema(blocked,{version:1,stores:['queues'],hold:true});await assert.rejects(blocked.evaluate(readAccessEventOutbox),/OUTBOX_OPEN_BLOCKED/);await blocked.evaluate(()=>window.__heldOutbox.close());assert.deepEqual(await inspect(blocked),{version:1,stores:['queues']});checks.push('blocked upgrade rejects, later abort preserves version1');
 const newer=await page();await schema(newer,{version:3,stores:['events','queues']});await assert.rejects(newer.evaluate(readAccessEventOutbox),/OUTBOX_OPEN_FAILED/);assert.equal((await inspect(newer)).version,3);checks.push('newer schema rejects without downgrade');
 const actual=await page();await actual.evaluate(async()=>{const {createAccessEventStorage}=await import('/process/access-event-storage.mjs');window.__productStorage=createAccessEventStorage({indexedDB,origin:location.origin,actorId:'frank',current:()=>true});await window.__productStorage('read');});assert.equal(await actual.evaluate(readAccessEventOutbox),0);
 await actual.evaluate(async()=>{await window.__productStorage('upsert',{event:{module:'bom',action:'save',operationId:'probe-control-0001',occurredAt:123456,phase:'unknown'},acked:false});});assert.equal(await actual.evaluate(readAccessEventOutbox),1);const stored=await actual.evaluate(readAccessEventOutbox,{mode:'all'});assert.equal(stored[0].event.operationId,'probe-control-0001');assert.equal(stored[0].acked,false);checks.push('actual product storage initializes and probe reads exact scoped record');
 await actual.evaluate(()=>{const proto=IDBObjectStore.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,'count');Object.defineProperty(proto,'count',{...descriptor,value:function(...args){const request=Reflect.apply(descriptor.value,this,args);request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;}});window.__restoreCount=()=>Object.defineProperty(proto,'count',descriptor);});
 await assert.rejects(actual.evaluate(readAccessEventOutbox),/OUTBOX_PROBE_ABORTED/);await actual.evaluate(()=>window.__restoreCount());assert.equal(await actual.evaluate(readAccessEventOutbox),1);checks.push('success result followed by transaction abort never resolves a count');
 const stalled=await page();await stalled.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(IDBFactory.prototype,'open');Object.defineProperty(IDBFactory.prototype,'open',{...descriptor,value:()=>({})});window.__restoreOpen=()=>Object.defineProperty(IDBFactory.prototype,'open',descriptor);});await assert.rejects(stalled.evaluate(readAccessEventOutbox,{timeoutMs:50}),/OUTBOX_PROBE_TIMEOUT/);await stalled.evaluate(()=>window.__restoreOpen());assert.equal(await stalled.evaluate(async()=>!(await indexedDB.databases()).some(db=>db.name==='process-access-event-outbox-v1')),true);checks.push('no-event open rejects within the explicit probe bound');
 await assert.rejects(stalled.evaluate(readAccessEventOutbox,{mode:'write'}),/OUTBOX_PROBE_OPTIONS/);checks.push('unsupported probe mode rejects');
 // Actual reporter + real storage: pause before B's upsert. A emits offline
 // after its own durable transaction, while the second record is still absent.
 const durable=await page(),ids=['durability-operation-a','durability-operation-b'];
 await durable.evaluate(async ids=>{
  const {createAccessEventReporter,createAccessEventStorage}=await import('/process/access-event-client.mjs');
  const store=createAccessEventStorage({indexedDB,origin:location.origin,actorId:'frank',current:()=>true});
  const gate=new Promise(resolve=>{window.__releaseDurableB=resolve;});window.__durableStatuses=[];
  const reporter=createAccessEventReporter({current:()=>true,atomicStorage:true,bootstrapAdmitted:true,onStatus:status=>window.__durableStatuses.push(status),request:async()=>{throw Error('Synthetic offline capability');},storage:async(mode,value)=>{if(mode==='upsert'&&value.event.operationId===ids[1]){window.__durableBHeld=true;await gate;}return store(mode,value);}});
  const event=id=>({module:'bom',action:'save',operationId:id,occurredAt:123456,phase:'unknown'}),first=reporter.observe(event(ids[0])),second=reporter.observe(event(ids[1]));window.__durableTasks=Promise.all([first,second]);await first;
 },ids);
 try{
  await durable.waitForFunction(()=>window.__durableBHeld);assert.equal(await durable.evaluate(()=>window.__durableStatuses.at(-1)),'offline');
  assert.deepEqual((await durable.evaluate(readAccessEventOutbox,{mode:'all'})).map(row=>row.event.operationId),[ids[0]]);
  let samples=0;const controlled={evaluate:async(...args)=>{const rows=await durable.evaluate(...args);if(++samples===2){assert.deepEqual(rows.map(row=>row.event.operationId),[ids[0]]);await durable.evaluate(()=>window.__releaseDurableB());}return rows;},waitForTimeout:ms=>durable.waitForTimeout(ms)};
  const rows=await waitForAccessEventOutboxEntries(controlled,ids,{timeoutMs:2000});assert(samples>=3);assert.deepEqual(rows.map(row=>row.event.operationId).sort((a,b)=>a.localeCompare(b)),ids);assert(rows.every(row=>row.acked===false));
 }finally{await durable.evaluate(async()=>{window.__releaseDurableB();await window.__durableTasks;});}
 checks.push('offline before the second upsert is not durability; exact readonly barrier waits');
 const readonly=rows=>({evaluate:async()=>rows,waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,ms))});
 await assert.rejects(waitForAccessEventOutboxEntries(readonly([{event:{operationId:ids[0]}}]),ids,{timeoutMs:50}),/OUTBOX_DURABILITY_TIMEOUT/);
 for(const rows of [[{event:{operationId:'unexpected-operation'}}],[{event:{operationId:ids[0]}},{event:{operationId:ids[0]}}]])await assert.rejects(waitForAccessEventOutboxEntries(readonly(rows),ids),/OUTBOX_UNEXPECTED_OPERATION/);
 await assert.rejects(waitForAccessEventOutboxEntries({evaluate:async()=>{throw Error('OUTBOX_SCHEMA_MISSING');}},ids),/OUTBOX_SCHEMA_MISSING/);
 checks.push('missing IDs time out; unexpected/duplicate IDs and schema errors reject');
 assert.deepEqual(pageErrors,[]);assert.equal(businessPosts,0);assert.deepEqual(await fixture.businessState(),business);console.log(JSON.stringify({status:'PASS_ACCESS_EVENT_READ_PROBE_CONTROLS',checks,businessPosts,pageErrors,productSourceUnchanged:true}));
}finally{for(const context of contexts)await context.close();await browser?.close();await fixture?.close();}
