import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

let fixture,browser;
try{
 fixture=await createFeedbackFixture({accessEvents:true});
 const business=await fixture.businessState();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:{}),args:['--disable-background-networking']});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const client=fs.readFileSync('dist/client/process/access-event-client.mjs');
 assert.deepEqual(client,fs.readFileSync('public/process/access-event-client.mjs'));
 await page.route('**/access-event-client.mjs*',async route=>{await gate;await route.fulfill({status:200,contentType:'application/javascript',body:client}).catch(()=>{});});
 const destination=fixture.origin+'/login?view=data&dataTab=web-feedback';
 await page.goto(destination);await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.locator('.wf-row').first().waitFor();
 const appURL=page.url(),endpoint='/api/bom/workflow?caseMetadata=1',key='shared-draft-v3-operation:frank:'+endpoint;
 let posts=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/bom/workflow'&&request.method()==='POST')posts++;});
 await context.setOffline(true);
 const outcome=await page.evaluate(async endpoint=>{const client=window.createSharedDraftClient({endpoint,actorId:'frank',headers:()=>({})});try{await client.command('synthetic-generation','apply',{patches:[{op:'set',path:['field'],value:'PRIVATE_BODY_NEVER_REPORTED'}]});return 'unexpected-success';}catch(error){return{message:error.message,unknown:client.hasUnknown()};}},endpoint);
 assert.match(outcome.message,/RESULT_UNKNOWN/);assert.equal(outcome.unknown,true);
 const stage=await page.evaluate(()=>localStorage.getItem('process-access-event-stage-v1:'+location.origin+':frank'));
 assert.equal(JSON.parse(stage).length,1);assert(!stage.includes('PRIVATE_BODY_NEVER_REPORTED'));
 const raw=await page.evaluate(key=>sessionStorage.getItem(key),key),operationId=JSON.parse(raw).operationId;
 assert.equal(JSON.parse(stage)[0].operationId,operationId);assert.equal(posts,1);
 // Reload before the lazy module promise resolves or IndexedDB has opened.
 await page.reload({waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});
 await context.setOffline(false);release();await page.goto(appURL);await page.locator('.wf-row').first().waitFor();
 await page.waitForFunction(()=>window.ProcessAccessEvents.status()==='received-unknown');
 const row=await fixture.db.prepare('SELECT actor_id,module,operation_id,outcome FROM access_events WHERE operation_id=?').bind(operationId).first();
 assert.deepEqual({actor:row.actor_id,module:row.module,id:row.operation_id,outcome:row.outcome},{actor:'frank',module:'bom',id:operationId,outcome:'unknown'});
 assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),raw);assert.equal(posts,1);assert.deepEqual(await fixture.businessState(),business);
 console.log('PASS immediate reload before lazy import; same-account reconnect reports only minimal unknown metadata and never resends business POST');
}finally{await browser?.close();await fixture?.close();}
