import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
// One Chromium process per file, fresh isolated context and Worker per case.
// Avoid repeated browser-process/network-service churn; never retry navigation.
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});});
after(async()=>{await browser?.close();});
for(const [width,lang,plainDenial]of [[390,'zh',false],[1280,'vi',false],[390,'zh',true],[1280,'vi',true]])void test(`compiled AB unknown abandons input, browses C and returns without POST ${width} ${lang} plainDenial=${plainDenial}`,async()=>{
 const f=await createABCFixture();let context;
 try{
  context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===f.url.origin?r.continue():r.abort());await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);
  const page=await context.newPage(),posts=[],errors=[],prompts=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{prompts.push(d.type());void d.dismiss();});page.on('request',r=>{if(r.method()==='POST')posts.push({url:r.url(),body:r.postDataJSON()});});
  const persisted=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
  await page.goto(f.url.origin+'/process/?system=process&view=data&dataTab=AB');await page.waitForFunction(()=>window.ProcessSync?.destination?.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready');await page.locator('#master-new-draft').click();await page.locator('[data-product-edit="A001"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Sent result unknown');
  const stored=await persisted(),afterBegin=posts.length;
  await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});
  assert.equal(posts.length,afterBegin,'form completion stays local');assert.deepEqual(await persisted(),stored);
  await page.route('**/api/master/workflow?**',r=>r.request().method()==='POST'?r.abort():r.continue());
  await page.locator('#master-save-draft').click();await page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued&&!MasterDataWorkflow.shared.busy());
  assert.equal(posts.length,afterBegin+1);assert.equal(posts.at(-1).body.command.action,'save');assert.equal(posts.at(-1).body.command.moduleAction,'save-local-v1');assert.deepEqual(await persisted(),stored);
  await page.locator('[data-product-edit="A001"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Discard private unsent text');
  const before=posts.length,markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft'))));
  assert(Object.values(markers).some(value=>value.includes('Sent result unknown')),'the original sent snapshot/guards stay durable');
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','C'));await page.waitForFunction(()=>window.ProcessSync.destination.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');
  assert.equal(await page.locator('[data-navigation-departure]').count(),0);assert.equal(await page.locator('#master-edit-dialog').count(),0);assert.equal(posts.length,before);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.deepEqual(await persisted(),stored);
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await page.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','AB'));await page.waitForFunction(()=>window.ProcessSync.destination.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready');
  assert.equal(posts.length,before);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);assert.equal(await page.locator('#master-edit-dialog').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(prompts,[]);assert.deepEqual(await persisted(),stored);
  const deniedPermissions=/\/api\/master\/workflow\?.*permissions=1/;
  await page.route(deniedPermissions,r=>r.fulfill(plainDenial?{status:403,contentType:'text/plain',body:'Forbidden'}:{status:403,json:{error:'FORBIDDEN'}}));
  const denied=await page.evaluate(async()=>{const client=window.MasterDataWorkflow.shared.client('AB');let status;try{await client.permissions();}catch(error){status=error.status||error.name;}client.invalidateReadState();return {status,blocked:window.sharedDraftDepartureBlocked(),unknown:client.hasUnknown()};});
  assert.deepEqual(denied,{status:plainDenial?'SyntaxError':403,blocked:true,unknown:true});
  await page.unroute(deniedPermissions);await page.evaluate(()=>window.MasterDataWorkflow.shared.client('AB').permissions());
  assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));assert.equal(posts.length,before);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);
  const rejected=await page.evaluate(async()=>{try{await MasterDataWorkflow.shared.execute('AB','save');return false;}catch{return true;}});assert.equal(rejected,true,'restored view permission does not permit retrying the unknown Save');
  assert.equal(posts.length,before);assert.deepEqual(await persisted(),stored);assert.deepEqual(prompts,[]);assert.deepEqual(errors,[]);
  assert(await page.evaluate(()=>MasterDataWorkflow.shared.client('AB').hasUnknown()));assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);
 }finally{try{await context?.close();}finally{await f.close();}}
});
