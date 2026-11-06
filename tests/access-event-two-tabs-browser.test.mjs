import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
import {readAccessEventOutbox} from './access-event-outbox-probe.mjs';

let fixture,browser;const pageErrors=[];const watch=page=>page.on('pageerror',error=>pageErrors.push({name:error.name,message:error.message}));
try{
 fixture=await createFeedbackFixture({accessEvents:true});const business=await fixture.businessState();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:{}),args:['--disable-background-networking']});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const client=fs.readFileSync('dist/client/process/access-event-client.mjs'),storage=fs.readFileSync('dist/client/process/access-event-storage.mjs'),protocol=fs.readFileSync('dist/client/process/access-event-protocol.mjs');
 for(const [name,bytes] of [['access-event-client.mjs',client],['access-event-storage.mjs',storage],['access-event-protocol.mjs',protocol]])assert.deepEqual(bytes,fs.readFileSync('public/process/'+name));
 await context.route('**/access-event-client.mjs*',async route=>{await gate;await route.fulfill({status:200,contentType:'application/javascript',body:client}).catch(()=>{});});
 await context.route('**/access-event-storage.mjs',route=>route.fulfill({status:200,contentType:'application/javascript',body:storage}));
 await context.route('**/access-event-protocol.mjs',route=>route.fulfill({status:200,contentType:'application/javascript',body:protocol}));
 const a=await context.newPage();watch(a);a.setDefaultTimeout(15000);await a.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await a.locator('#id').fill('frank');await a.locator('#password').fill(fixture.password);await a.locator('.site-entry-submit').click();await a.locator('.wf-row').first().waitFor();
 const b=await context.newPage();watch(b);b.setDefaultTimeout(15000);await b.goto(a.url());await b.locator('.wf-row').first().waitFor();
 let businessPosts=0;for(const page of [a,b])page.on('request',request=>{if(new URL(request.url()).pathname==='/api/bom/workflow'&&request.method()==='POST')businessPosts++;});
 await context.setOffline(true);
 const emit=(page,id)=>page.evaluate(id=>window.ProcessAccessEvents.observe({actorId:'frank',module:'bom',action:'save',operationId:id,occurredAt:123456,phase:'unknown'}),id);
 await emit(a,'two-tabs-operation-a');await emit(b,'two-tabs-operation-b');
 const stage=await a.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('process-access-event-stage-v2:'+location.origin+':frank:')).map(key=>JSON.parse(localStorage.getItem(key))));
 assert.deepEqual(stage.map(row=>row.operationId).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(stage.every(row=>Object.keys(row).length===5));
 release();await Promise.all([a.waitForFunction(()=>window.ProcessAccessEvents.status()==='offline'),b.waitForFunction(()=>window.ProcessAccessEvents.status()==='offline')]);
 const stored=await a.evaluate(readAccessEventOutbox,{mode:'all'});
 assert.deepEqual(stored.map(row=>row.event.operationId).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(stored.every(row=>row.acked===false));
 await context.setOffline(false);for(let attempt=0;attempt<10;attempt++){await Promise.all([a.evaluate(()=>window.ProcessAccessEvents.flush()),b.evaluate(()=>window.ProcessAccessEvents.flush())]);const sent=(await fixture.db.prepare('SELECT operation_id FROM access_events').all()).results.map(row=>row.operation_id);if(sent.includes('two-tabs-operation-a')&&sent.includes('two-tabs-operation-b'))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const rows=(await fixture.db.prepare('SELECT actor_id,module,operation_id,outcome FROM access_events').all()).results;
 assert.deepEqual(rows.map(row=>row.operation_id).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(rows.every(row=>row.actor_id==='frank'&&row.module==='bom'&&row.outcome==='unknown'));
 assert.equal(businessPosts,0);assert.deepEqual(await fixture.businessState(),business);
 console.log('PASS two same-account tabs stage separate keys and atomically retain both unknown events; reconnect sends metadata only');
 const second=await browser.newContext({serviceWorkers:'block'});await second.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
 let releaseSecond;const secondGate=new Promise(resolve=>{releaseSecond=resolve;});
 await second.route('**/access-event-client.mjs*',async route=>{await secondGate;await route.fulfill({status:200,contentType:'application/javascript',body:client}).catch(()=>{});});
 const survivor=await second.newPage();watch(survivor);survivor.setDefaultTimeout(15000);survivor.on('request',request=>{if(new URL(request.url()).pathname==='/api/bom/workflow'&&request.method()==='POST')businessPosts++;});
 await survivor.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await survivor.locator('#id').fill('frank');await survivor.locator('#password').fill(fixture.password);await survivor.locator('.site-entry-submit').click();await survivor.locator('.wf-row').first().waitFor();await survivor.evaluate(()=>window.ProcessAccessEvents.flush());
 // flush() schedules work but returns void. Hold authentic product bytes to
 // prove this reader cannot create the schema before actual initialization.
 const count=()=>survivor.evaluate(readAccessEventOutbox);
 await assert.rejects(count(),/OUTBOX_NOT_INITIALIZED/);
 assert.equal(await survivor.evaluate(async()=>!(await indexedDB.databases()).some(db=>db.name==='process-access-event-outbox-v1')),true);
 assert.notEqual(await survivor.evaluate(()=>window.ProcessAccessEvents.status()),'received');
 releaseSecond();await survivor.waitForFunction(()=>window.ProcessAccessEvents.status()==='received');
 assert.equal(await count(),0);
 const departing=await second.newPage();watch(departing);departing.setDefaultTimeout(15000);await departing.goto(survivor.url());await departing.locator('.wf-row').first().waitFor();await departing.waitForFunction(()=>window.ProcessAccessEvents.status()==='received');
 await second.setOffline(true);await emit(departing,'closed-tab-operation-0001');await departing.waitForFunction(()=>window.ProcessAccessEvents.status()==='offline');assert.equal(await count(),1);await departing.close();
 await second.setOffline(false);for(let attempt=0;attempt<10;attempt++){await survivor.evaluate(()=>window.ProcessAccessEvents.flush());const sent=await fixture.db.prepare('SELECT operation_id FROM access_events WHERE operation_id=?').bind('closed-tab-operation-0001').first();if(sent)break;await new Promise(resolve=>setTimeout(resolve,100));}
 await survivor.waitForFunction(()=>window.ProcessAccessEvents.status()==='received-unknown');
 assert.equal((await fixture.db.prepare('SELECT COUNT(*) AS count FROM access_events WHERE operation_id=?').bind('closed-tab-operation-0001').first()).count,1);assert.equal(businessPosts,0);assert.deepEqual(await fixture.businessState(),business);
 assert.deepEqual(pageErrors,[]);await second.close();console.log('PASS survivor that first read an empty outbox reports a closed tab\'s durable unknown after reconnect');
}finally{await browser?.close();await fixture?.close();}
