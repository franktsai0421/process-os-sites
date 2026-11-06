import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

let fixture,browser;
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
 const a=await context.newPage();a.setDefaultTimeout(15000);await a.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await a.locator('#id').fill('frank');await a.locator('#password').fill(fixture.password);await a.locator('.site-entry-submit').click();await a.locator('.wf-row').first().waitFor();
 const b=await context.newPage();b.setDefaultTimeout(15000);await b.goto(a.url());await b.locator('.wf-row').first().waitFor();
 let businessPosts=0;for(const page of [a,b])page.on('request',request=>{if(new URL(request.url()).pathname==='/api/bom/workflow'&&request.method()==='POST')businessPosts++;});
 await context.setOffline(true);
 const emit=(page,id)=>page.evaluate(id=>window.ProcessAccessEvents.observe({actorId:'frank',module:'bom',action:'save',operationId:id,occurredAt:123456,phase:'unknown'}),id);
 await emit(a,'two-tabs-operation-a');await emit(b,'two-tabs-operation-b');
 const stage=await a.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('process-access-event-stage-v2:'+location.origin+':frank:')).map(key=>JSON.parse(localStorage.getItem(key))));
 assert.deepEqual(stage.map(row=>row.operationId).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(stage.every(row=>Object.keys(row).length===5));
 release();await Promise.all([a.waitForFunction(()=>window.ProcessAccessEvents.status()==='offline'),b.waitForFunction(()=>window.ProcessAccessEvents.status()==='offline')]);
 const stored=await a.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1',2);request.onerror=()=>reject(Error('OPEN_FAILED'));request.onsuccess=()=>{const tx=request.result.transaction('events','readonly'),get=tx.objectStore('events').getAll(IDBKeyRange.bound(location.origin+'|frank|',location.origin+'|frank|\uffff'));get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(Error('READ_FAILED'));};}));
 assert.deepEqual(stored.map(row=>row.event.operationId).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(stored.every(row=>row.acked===false));
 await context.setOffline(false);for(let attempt=0;attempt<10;attempt++){await Promise.all([a.evaluate(()=>window.ProcessAccessEvents.flush()),b.evaluate(()=>window.ProcessAccessEvents.flush())]);const sent=(await fixture.db.prepare('SELECT operation_id FROM access_events').all()).results.map(row=>row.operation_id);if(sent.includes('two-tabs-operation-a')&&sent.includes('two-tabs-operation-b'))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const rows=(await fixture.db.prepare('SELECT actor_id,module,operation_id,outcome FROM access_events').all()).results;
 assert.deepEqual(rows.map(row=>row.operation_id).sort((a,b)=>a.localeCompare(b)),['two-tabs-operation-a','two-tabs-operation-b']);assert(rows.every(row=>row.actor_id==='frank'&&row.module==='bom'&&row.outcome==='unknown'));
 assert.equal(businessPosts,0);assert.deepEqual(await fixture.businessState(),business);
 console.log('PASS two same-account tabs stage separate keys and atomically retain both unknown events; reconnect sends metadata only');
}finally{await browser?.close();await fixture?.close();}
