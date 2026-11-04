import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';
const browserOptions={headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})};
const launch=()=>chromium.launch(browserOptions);
const ready=(page,view)=>page.waitForFunction(view=>window.ProcessSync?.destination?.view===view&&document.documentElement.dataset.processNavigationStatus==='ready',view);
async function contextFor(browser,f,width,lang){const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);return context;}
for(const [width,lang]of [[390,'zh'],[1280,'vi']])void test(`compiled AB/C abandonment drops form and leaves shared edits untouched ${width} ${lang}`,async()=>{
 const f=await createABCFixture(),browser=await launch(),context=await contextFor(browser,f,width,lang);try{
  await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const page=await context.newPage(),posts=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});page.on('dialog',d=>void d.accept());
  await page.goto(f.url.origin+'/process/?system=process&view=data&dataTab=AB');await page.locator('#master-new-draft').click();await page.locator('[data-product-edit="A001"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Shared committed input');await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});
  await page.locator('[data-product-edit="A001"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Abandon this unsubmitted input');const before=posts.length,shared=await page.evaluate(()=>JSON.stringify(window.MasterDataWorkflow.shared.flow('AB')));
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','C'));const button=page.locator('[data-departure-choice="abandon"]');assert(await button.isEnabled());assert((await button.boundingBox()).height>=44);await button.click();await page.waitForFunction(()=>window.ProcessSync.destination.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');
  assert.equal(posts.length,before);await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','AB'));await page.locator('[data-product-edit="A001"]').waitFor();assert.equal(await page.evaluate(()=>JSON.stringify(window.MasterDataWorkflow.shared.flow('AB'))),shared);await page.locator('[data-product-edit="A001"]').click();assert.equal(await page.locator('#master-edit-dialog [name=name]').inputValue(),'Shared committed input');assert.equal(posts.length,before);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await f.close();}
});
for(const [width,lang]of [[390,'vi'],[1280,'zh']])void test(`compiled process abandonment never performs server inverse or saves ${width} ${lang}`,async()=>{
 const f=await createProcessPlatformRound5Fixture(),browser=await launch(),context=await contextFor(browser,f,width,lang);try{
  let prompts=0;const page=await context.newPage(),posts=[],errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{prompts++;void d.dismiss();});page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/process-authoring/workflow')posts.push(r.postData());});
  await page.goto(f.url.origin+'/login?view=dashboard');await page.locator('#id').fill(f.actors.editor);await page.locator('#password').fill(f.password);await page.locator('.site-entry-submit').click();await ready(page,'dashboard');
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('editor'));await ready(page,'editor');await page.locator('[data-av3="begin"]').click();await page.waitForFunction(()=>window.ProcessAuthoringV3.canMutate());
  const open=async()=>{await page.locator('.pe-card[data-node="photo-operation"] [data-pe="edit"]').click();await page.locator('#process-operation-dialog[open] [data-field="name"]').waitFor();};await open();await page.locator('[data-field="name"]').fill('Shared authoring survives');await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await page.waitForFunction(()=>!window.sharedDraftAccountState().queued);await page.locator('[data-av3="save"]').click();await page.waitForFunction(()=>!window.ProcessCanvasLocal.dirty()&&!window.ProcessCanvasLocal.pending());assert.equal((await f.readAuthoring()).workflow.working.workspaces.find(w=>w.line==='A').stages['A-CUT'].find(row=>row.id==='photo-operation').name,'Shared authoring survives');
  await open();await page.locator('[data-field="name"]').fill('Drop unsent authoring form');const before=await f.readAuthoring(),count=posts.length;
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await ready(page,'dashboard');assert.equal(await page.locator('[data-navigation-departure]').count(),0);assert.deepEqual(await f.readAuthoring(),before);assert.equal(posts.length,count);
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('editor'));await ready(page,'editor');await open();assert.equal(await page.locator('[data-field="name"]').inputValue(),'Shared authoring survives');assert.equal(posts.length,count);assert.deepEqual(errors,[]);assert.equal(prompts,0);
 }finally{await context.close();await browser.close();await f.close();}
});
void test('compiled user form abandonment sends no account mutation and stores no password copy',async()=>{
 const f=await createABCFixture(),browser=await launch(),context=await contextFor(browser,f,390,'zh');try{
  await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const page=await context.newPage(),posts=[];page.on('dialog',d=>void d.accept());page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(f.url.origin+'/process/?system=process&view=data&dataTab=users');await page.locator('#ua-new-user').click();await page.locator('.ua-dialog [name="name"]').fill('Drop this account input');await page.locator('.ua-dialog [name="password"]').fill('Synthetic-never-store-123');const before=posts.length;
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="abandon"]').click();await ready(page,'dashboard');assert.equal(await page.locator('.ua-dialog').count(),0);assert.equal(posts.length,before);assert.equal(await page.evaluate(()=>[...Object.values(sessionStorage),...Object.values(localStorage)].some(value=>value.includes('Synthetic-never-store-123'))),false);
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','users'));await page.locator('#ua-new-user').click();assert.equal(await page.locator('.ua-dialog [name="name"]').inputValue(),'');assert.equal(posts.length,before);
 }finally{await context.close();await browser.close();await f.close();}
});

for(const [width,lang] of [[390,'vi'],[1280,'zh']])for(const linking of [false,true])void test(`failed destination after process abandonment shows the remaining shared canvas without restoring input ${width} ${lang} linking=${linking}`,async()=>{
 const f=await createProcessPlatformRound5Fixture(),browser=await launch(),context=await contextFor(browser,f,width,lang);try{
  let prompts=0;const page=await context.newPage(),posts=[];page.on('dialog',d=>{prompts++;void d.dismiss();});page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto(f.url.origin+'/login?view=dashboard');await page.locator('#id').fill(f.actors.editor);await page.locator('#password').fill(f.password);await page.locator('.site-entry-submit').click();await ready(page,'dashboard');
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('editor'));await ready(page,'editor');await page.locator('[data-av3="begin"]').click();await page.waitForFunction(()=>window.ProcessAuthoringV3.canMutate());
  const card=page.locator('.pe-card[data-node="photo-operation"]'),original=await card.locator('h3').textContent();
  await card.locator('[data-pe="edit"]').click();await page.locator('#process-operation-dialog [data-field="name"]').fill('Discarded canvas name');await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await page.waitForFunction(()=>window.ProcessCanvasLocal.dirty());assert.equal(await card.locator('h3').textContent(),'Discarded canvas name');
  const before=await f.readAuthoring(),count=posts.length;
  if(linking){await card.locator('[data-pe="output"]').click();assert.equal(await page.evaluate(()=>window.ProcessEditorV2.interacting()),true);}
  await page.evaluate(()=>{window.ProcessSync.prepareDestination=async()=>{window.failedAbandonResult=true;throw Error('SYNTHETIC_DESTINATION_FAILURE');};window.ProcessDeliveryNavigation.navigate('dashboard');});
  await page.waitForFunction(()=>window.failedAbandonResult===true&&!document.querySelector('[data-navigation-departure]'));
  assert.equal(await page.evaluate(()=>window.ProcessCanvasLocal.dirty()),false);assert.deepEqual(await f.readAuthoring(),before);assert.equal(posts.length,count);
  assert.equal(await page.evaluate(()=>window.ProcessEditorV2.interacting()),false);assert.equal(await page.locator('.pe-port-selected,.pe-link-preview').count(),0);
  assert.equal(await card.locator('h3').textContent(),original,'visible canvas must agree with the discarded local journal');
  await card.locator('[data-pe="edit"]').click();assert.equal(await page.locator('#process-operation-dialog [data-field="name"]').inputValue(),original,'reopening must not recover input captured by the old card handler');assert.equal(posts.length,count);assert.equal(prompts,0);
 }finally{await context.close();await browser.close();await f.close();}
});
