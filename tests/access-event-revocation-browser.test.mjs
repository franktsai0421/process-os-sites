// Synthetic compiled browser transition: a stale bootstrap must not admit new
// reporting metadata after the service explicitly denies capabilities.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

let fixture,browser;
try{
 fixture=await createFeedbackFixture({accessEvents:true});const business=await fixture.businessState();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:{}),args:['--disable-background-networking']});
 for(const [denial,status] of [['401','permission-denied'],['403','permission-denied'],['off','not-enabled']]){
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.locator('.wf-row').first().waitFor();
  const prior='revoke-prior-'+denial+'-0001',later='revoke-later-'+denial+'-0001';
  await page.evaluate(id=>window.ProcessAccessEvents.observe({actorId:'frank',module:'bom',action:'save',operationId:id,occurredAt:123456,phase:'unknown'}),prior);
  await page.waitForFunction(()=>window.ProcessAccessEvents.status()==='received-unknown');
  assert.equal((await fixture.db.prepare('SELECT COUNT(*) AS count FROM access_events WHERE operation_id=?').bind(prior).first()).count,1);
  await page.route('**/api/access-events?action=capabilities',route=>denial==='off'?route.fulfill({status:200,json:{enabled:false,reason:'NOT_ENABLED',modules:[]}}):route.fulfill({status:Number(denial),json:{error:denial==='401'?'LOGIN_REQUIRED':'FORBIDDEN'}}));
  await page.evaluate(()=>window.ProcessAccessEvents.flush());await page.waitForFunction(expected=>window.ProcessAccessEvents.status()===expected,status);
  await page.evaluate(id=>window.ProcessAccessEvents.observe({actorId:'frank',module:'bom',action:'save',operationId:id,occurredAt:123457,phase:'unknown'}),later);
  assert.equal(await page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith('process-access-event-stage-v2:')&&key.includes(id)).length,later),0);
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('process-access-event-outbox-v1',2);request.onerror=()=>reject(Error('OPEN_FAILED'));request.onsuccess=()=>{const tx=request.result.transaction('events','readonly'),get=tx.objectStore('events').getAll(IDBKeyRange.bound(location.origin+'|frank|',location.origin+'|frank|\uffff'));get.onsuccess=()=>resolve(get.result.map(row=>row.event.operationId));get.onerror=()=>reject(Error('READ_FAILED'));};}));
  assert(!stored.includes(later));assert.equal((await fixture.db.prepare('SELECT COUNT(*) AS count FROM access_events WHERE operation_id=?').bind(later).first()).count,0);
  await context.close();console.log('PASS successful admission then explicit '+denial+' revokes new bridge/client collection without affecting old report');
 }
 assert.deepEqual(await fixture.businessState(),business);
}finally{await browser?.close();await fixture?.close();}
