// Full compiled Worker/SPA, private D1/R2 and synthetic producer approvals only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const keys=['masterDataControl','processMasterData','routineEquipmentControl','qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl'];
async function setup(width,language){
 const seed=await createTransferFixture();let values,objects;
 try{values=(await seed.core.readState()).values;objects=new Map(seed.objects);}finally{seed.close();}
 const f=await createABCFixture({products:1,async decorate(target,_load,bucket){for(const key of keys)target[key]=values[key];for(const [key,bytes]of objects)await bucket.put(key,bytes);}});
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),posts=[],errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);await context.addInitScript(({language,origin})=>{if(location.origin===origin)localStorage.setItem('processUILanguage',language);},{language,origin:f.url.origin});
 context.on('page',page=>{page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());page.on('request',r=>{if(r.method()==='POST')posts.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});});
 async function page(tab){const p=await context.newPage();await p.goto(f.url.origin+'/process/?system=quality&view=data&dataTab='+tab);await p.waitForFunction(()=>window.ProcessSync?.identity&&document.documentElement.dataset.processNavigationStatus==='ready');return p;}
 const source=await page('quality-routine-equipment');await source.locator('#routine-search').waitFor();
 async function controls(){const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();const decoded=await f.load('lib/state-records.ts').decodeRecordValues(await f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(row.values));return Object.fromEntries(keys.filter(key=>decoded.values[key]).map(key=>[key,JSON.parse(decoded.values[key])]));}
 return{f,context,page,source,posts,errors,controls,async close(){await context.close();await browser.close();await f.close();}};
}
const flow=(controls,moduleId)=>moduleId==='fqc'?controls.qualityMasterControl.libraries.fqc.workflow:moduleId==='iqc'?controls.iqcMasterControl.workflow:moduleId==='ipqc-c'?controls.ipqcCMasterControl.workflow:controls.ipqcABMasterControl.scopes['A:G-A'].workflow;
for(const [width,language]of [[1280,'zh'],[390,'vi']])void test(`compiled four-module transfer preserves open local forms; only FQC explicitly saves ${width} ${language}`,async t=>{
 const s=await setup(width,language);try{
 await s.source.locator('[data-node-select="category"]').first().click();await s.source.locator('[data-node-select="subcategory"]').first().click();if(await s.source.locator('[data-node-select="group"]').count())await s.source.locator('[data-node-select="group"]').first().click();
 // Establish the real shared drafts before opening another page's unsent form.
 for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']){const q=moduleId==='ipqc-ab'?'scope=A%3AG-A&caseMetadata=1':'caseMetadata=1';assert.equal(await s.source.evaluate(async({moduleId,q})=>(await fetch('/api/'+moduleId+'/workflow?'+q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'begin'})})).status,{moduleId,q}),200);}
 const targetPages=[];
 for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']){
  const p=await s.page('quality-'+moduleId);
  if(moduleId==='fqc'){await p.locator('[data-edit-item]').first().click();await p.locator('.fqc-modal-form [name="description"]').fill('Unsent FQC local form');targetPages.push({p,selector:'.fqc-modal-form [name="description"]',value:'Unsent FQC local form'});}
  if(moduleId==='iqc'){await p.locator('[data-select-part="PART1"]').click();await p.locator('[data-edit-item]').first().click();await p.locator('#iqc-item-form [name="nameVi"]').fill('Unsent IQC local form');targetPages.push({p,selector:'#iqc-item-form [name="nameVi"]',value:'Unsent IQC local form'});}
  if(moduleId==='ipqc-c'){await p.locator('[data-ipqcc-product="C100"]').click();await p.locator('[data-ipqcc-edit-item]').first().click();await p.locator('#ipqcc-editor [name="description"]').fill('Unsent C local form');targetPages.push({p,selector:'#ipqcc-editor [name="description"]',value:'Unsent C local form'});}
  if(moduleId==='ipqc-ab'){await p.locator('[data-ab-edit-item]').first().click();await p.locator('#ab-standard').fill('Unsent AB local form');targetPages.push({p,selector:'#ab-standard',value:'Unsent AB local form'});}
 }
 const before=await s.controls(),start=s.posts.length;
 for(const key of ['fqc','iqc','ipqc-c','ipqc-ab']){
  // Each explicit module action starts from a fresh source page. Its post-Apply
  // global refresh can rebuild that page; other pages retain their own forms.
  const p=await s.page('quality-routine-equipment');await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();
  await p.locator('[data-equipment-transfer="source"]').click();await p.locator('#routine-target-eq-select').selectOption('target');
  const applied=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/'+key+'/workflow'&&r.request().postDataJSON().command?.action===(key==='fqc'?'save':'apply'));
  await p.locator('#routine-confirm-transfer-'+key).click();assert.equal((await applied).status(),200);await p.waitForFunction(()=>!window.sharedDraftAccountState().queued);
 }
 const after=await s.controls();
 for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']){assert.equal(flow(after,moduleId).working.items[0].equipmentId,'target');if(moduleId==='fqc'){assert.notEqual(flow(after,moduleId).saved.id,flow(before,moduleId).saved?.id);assert.equal(flow(after,moduleId).saved.content.items[0].equipmentId,'target');assert.deepEqual(flow(after,moduleId).saved.content,flow(after,moduleId).working);}else assert.deepEqual(flow(after,moduleId).saved,flow(before,moduleId).saved);assert.deepEqual(flow(after,moduleId).active,flow(before,moduleId).active);assert.deepEqual(flow(after,moduleId).cases,flow(before,moduleId).cases);const retained=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['equipmentId','equipmentSnapshot','tool','inspectionMode'].includes(key)));assert.deepEqual(retained(flow(after,moduleId).working.items[0]),retained(flow(before,moduleId).working.items[0]));}
 assert.deepEqual(after.routineEquipmentControl,before.routineEquipmentControl);assert.equal(s.posts.slice(start).filter(row=>row.body.command?.action==='save').length,1);
 for(const target of targetPages){await target.p.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));assert.equal(await target.p.locator(target.selector).inputValue(),target.value);}
 assert.deepEqual(s.errors,[]);t.diagnostic(JSON.stringify({width,language,workflowActions:s.posts.slice(start).map(row=>({path:row.path,action:row.body.command?.action||row.body.action})),limits:['Synthetic data, same-machine pages; no physical phone or live system','FQC alone saves its shared working snapshot; target forms remain unsent and no Submit is authorized']}));
 }finally{await s.close();}
});

void test('compiled unknown FQC transfer Save leaves locally, returns/reloads, and checks the original receipt only',async()=>{
 const s=await setup(390,'zh');try{
 const p=s.source;await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();
 // Normal identified target Begin happens before the uncertain Save.
 let lost=false,down=true,posts=0;
 await p.route('**/api/fqc/workflow?*',async route=>{const request=route.request(),url=new URL(request.url());if(url.searchParams.has('operationId')&&down)return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});if(request.method()==='POST'&&request.postDataJSON().command?.action==='save'){posts++;if(!lost){lost=true;assert.equal((await route.fetch()).status(),200);return route.abort('failed');}}return route.continue();});
 await p.locator('[data-equipment-transfer="source"]').click();await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);
 const markers=()=>p.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('routine-equipment-fqc-transfer-v1:')||key.startsWith('shared-draft-')))),original=await markers();assert(Object.keys(original).some(key=>key.startsWith('routine-equipment-fqc-transfer-v1:')));assert.equal(posts,1);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await p.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');assert.deepEqual(await markers(),original);assert.equal(posts,1);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await p.locator('#routine-search').waitFor();await p.reload();await p.locator('#routine-search').waitFor();assert.deepEqual(await markers(),original);
 await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();await p.locator('[data-equipment-transfer="source"]').click();assert.match(await p.locator('#routine-confirm-transfer-fqc').textContent(),/查詢原移轉/);down=false;await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>!window.sharedDraftAccountState().unknown);assert.equal(posts,1);assert.equal(Object.keys(await markers()).length,0);assert.equal(flow(await s.controls(),'fqc').saved.content.items[0].equipmentId,'target');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('compiled FQC target poll retains an unsent conflicting form and rejects its later stale Save',async()=>{
 const s=await setup(1280,'zh');try{
 const source=s.source;assert.equal(await source.evaluate(async()=>(await fetch('/api/fqc/workflow?caseMetadata=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'begin'})})).status),200);
 const target=await s.page('quality-fqc');await target.clock.install();await target.reload();await target.locator('[data-edit-item]').first().click();await target.locator('.fqc-modal-form [name="description"]').fill('Still unsent local input');await target.locator('.fqc-modal-form [name="toolType"][value="visual"]').check();
 await source.locator('[data-node-select="category"]').first().click();await source.locator('[data-node-select="subcategory"]').first().click();if(await source.locator('[data-node-select="group"]').count())await source.locator('[data-node-select="group"]').first().click();await source.locator('[data-equipment-transfer="source"]').click();await source.locator('#routine-target-eq-select').selectOption('target');await source.locator('#routine-confirm-transfer-fqc').click();await source.waitForFunction(()=>!window.sharedDraftAccountState().queued);const committed=flow(await s.controls(),'fqc');assert.equal(committed.saved.content.items[0].equipmentId,'target');
 await target.bringToFront();const polled=target.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&!new URL(r.url()).searchParams.has('permissions'));await target.clock.fastForward(30001);await polled;
 assert.equal(await target.locator('.fqc-modal-form [name="description"]').inputValue(),'Still unsent local input');assert.equal(await target.locator('.fqc-modal-form [name="toolType"][value="visual"]').isChecked(),true);assert.equal(flow(await s.controls(),'fqc').saved.id,committed.saved.id);
 await target.locator('.fqc-modal-form button[type="submit"]').click();await target.locator('.fqc-modal-form').waitFor({state:'detached'});const rejected=target.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');await target.locator('#fqc-save').click();assert.equal((await rejected).status(),409);const after=flow(await s.controls(),'fqc');assert.equal(after.saved.id,committed.saved.id);assert.equal(after.working.items[0].equipmentId,'target');assert.equal(after.working.items[0].description,committed.working.items[0].description);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
