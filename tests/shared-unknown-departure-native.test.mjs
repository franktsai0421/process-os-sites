import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
for(const [width,lang]of [[390,'zh'],[1280,'vi']])void test(`compiled AB unknown abandons input, browses C and returns without POST ${width} ${lang}`,async()=>{
 const f=await createABCFixture(),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
 try{
  await context.route('**/*',r=>new URL(r.request().url()).origin===f.url.origin?r.continue():r.abort());await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);
  const page=await context.newPage(),posts=[],errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(f.url.origin+'/process/?system=process&view=data&dataTab=AB');await page.locator('#master-new-draft').click();await page.locator('[data-product-edit="A001"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Sent result unknown');
  await page.route('**/api/master/workflow?**',r=>r.request().method()==='POST'?r.abort():r.continue());
  await page.locator('#master-edit-dialog [type=submit]').click();await page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);await page.locator('#master-edit-dialog [name=name]').fill('Discard private unsent text');
  const before=posts.length,markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft'))));
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','C'));const button=page.locator('[data-departure-choice="abandon"]');await button.waitFor();assert(await button.isEnabled());await button.click();await page.waitForFunction(()=>window.ProcessSync.destination.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');
  assert.equal(await page.locator('#master-edit-dialog').count(),0);assert.equal(posts.length,before);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await page.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','AB'));await page.waitForFunction(()=>window.ProcessSync.destination.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready');
  assert.equal(posts.length,before);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);assert.equal(await page.locator('#master-edit-dialog').count(),0);assert.deepEqual(errors,[]);
  const deniedPermissions=/\/api\/master\/workflow\?.*permissions=1/;
  await page.route(deniedPermissions,r=>r.fulfill({status:403,json:{error:'FORBIDDEN'}}));
  const denied=await page.evaluate(async()=>{const client=window.MasterDataWorkflow.shared.client('AB');let status;try{await client.permissions();}catch(error){status=error.status;}client.invalidateReadState();return {status,blocked:window.sharedDraftDepartureBlocked(),unknown:client.hasUnknown()};});
  assert.deepEqual(denied,{status:403,blocked:true,unknown:true});
  await page.unroute(deniedPermissions);await page.evaluate(()=>window.MasterDataWorkflow.shared.client('AB').permissions());
  assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));assert.equal(posts.length,before);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);
 }finally{await context.close();await browser.close();await f.close();}
});
