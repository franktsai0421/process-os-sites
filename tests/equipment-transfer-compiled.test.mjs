// Full compiled Worker/SPA, private D1/R2 and synthetic producer approvals only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const keys=['masterDataControl','processMasterData','routineEquipmentControl','qualityMasterControl','iqcMasterControl','ipqcCMasterControl','ipqcABMasterControl'];
async function setup(width,language,ports={createTransferFixture,createABCFixture,chromium}){
 const seed=await ports.createTransferFixture();let values,objects;
 let seedFailed=false,seedFailure;
 try{values=(await seed.core.readState()).values;objects=new Map(seed.objects);}catch(error){seedFailed=true;seedFailure=error;}
 try{await Promise.resolve(seed.close());}catch(cleanup){if(seedFailed)throw new AggregateError([seedFailure,cleanup],'Transfer seed read failed and cleanup reported errors',{cause:seedFailure});throw cleanup;}
 if(seedFailed)throw seedFailure;
 let f,browser,context,closing;
 const close=()=>closing??=(async()=>{const failures=[];for(const resource of [context,browser,f])if(resource)try{await resource.close();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Compiled transfer fixture cleanup failed');})();
 try{
 f=await ports.createABCFixture({products:1,async decorate(target,_load,bucket){if(ports.independentReviewer){
   const users=JSON.parse(target.platformUsers);
   users.push({...users.find(user=>user.primary),id:'fixture-reviewer',name:'Synthetic reviewer',primary:false});
   if(ports.loginPassword){
     users.find(user=>user.primary).passwordHash=await _load('lib/passwords.ts').passwordHash(ports.loginPassword);
   }
   target.platformUsers=JSON.stringify(users);
 }for(const key of keys)target[key]=values[key];for(const [key,bytes]of objects)await bucket.put(key,bytes);}});
 browser=await ports.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});const posts=[],errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);await context.addInitScript(({language,origin})=>{if(location.origin===origin)localStorage.setItem('processUILanguage',language);},{language,origin:f.url.origin});
 context.on('page',page=>{page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());page.on('request',r=>{if(r.method()==='POST')posts.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});});
 async function page(tab){const p=await context.newPage();await p.goto(f.url.origin+'/process/?system=quality&view=data&dataTab='+tab);await p.waitForFunction(()=>window.ProcessSync?.identity&&document.documentElement.dataset.processNavigationStatus==='ready');return p;}
 // The first navigation in these compatibility tests represents an already open
 // V107 tab. Reload and every API call use the current build. Source-only
 // runners may supply the same pinned historical file without Git history.
 let v107Tab=!!ports.v107EquipmentTab;
 if(v107Tab){
  const old=process.env.V107_EQUIPMENT_TEST_CLIENT?readFileSync(process.env.V107_EQUIPMENT_TEST_CLIENT):
    execFileSync('git',['show','e55f6fea316d1c0fe173860d6c52abb2618564a9:public/process/routine-equipment.js'],{maxBuffer:4*1024*1024});
  assert.equal(createHash('sha256').update(old).digest('hex'),'f68e621aca2b92cf3e19dd85e443f86d031c08dca46cda1096b9d3c642776ce1');
  // The compiled Site groups classic scripts. Give the fixture's mixed shell
  // its own content address and point only this isolated old tab at that shell.
  const root=path.resolve(import.meta.dirname,'..'), assets=path.resolve(process.env.PROCESS_TEST_BUILD_DIR||path.join(root,'dist'),'client/process');
  const current=readFileSync(path.join(root,'public/process/routine-equipment.js'));
  const matches=readdirSync(assets).filter(n=>/^shell-scripts\.[0-9a-f]+\.js$/.test(n)).map(name=>({name,body:readFileSync(path.join(assets,name))})).filter(b=>b.body.includes(current));
  assert.equal(matches.length,1);const shell=matches[0],offset=shell.body.indexOf(current);
  assert.equal(shell.body.indexOf(current,offset+1),-1);
  const mixed=Buffer.concat([shell.body.subarray(0,offset),old,shell.body.subarray(offset+current.length)]);
  const legacyName='shell-scripts.'+createHash('sha256').update(mixed).digest('hex').slice(0,20)+'.js';
  await context.route(url=>url.origin===f.url.origin&&url.pathname==='/process/'+legacyName,r=>r.fulfill({body:mixed,contentType:'text/javascript'}));
  await context.route(url=>url.origin===f.url.origin&&url.pathname==='/process/',async r=>{
   if(!v107Tab)return r.continue();
   const res=await r.fetch(),html=await res.text();assert(html.includes(shell.name));
   return r.fulfill({response:res,body:html.replaceAll(shell.name,legacyName)});
  });
 }
 const source=await page('quality-routine-equipment');await source.locator('#routine-search').waitFor();
 async function controls(){const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();const decoded=await f.load('lib/state-records.ts').decodeRecordValues(await f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(row.values));return Object.fromEntries(keys.filter(key=>decoded.values[key]).map(key=>[key,JSON.parse(decoded.values[key])]));}
 return{f,context,page,source,posts,errors,controls,close,retireV107(){v107Tab=false;}};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Compiled transfer setup failed and cleanup reported errors',{cause:error});}throw error;}
}
async function openTargetDraft(page,moduleId){
 const queries=moduleId==='ipqc-ab'?['scope=A%3AG-A&caseMetadata=1','module=1&caseMetadata=1']:['caseMetadata=1'];
 for(const q of queries){
  const status=await page.evaluate(async({moduleId,q})=>(await fetch('/api/'+moduleId+'/workflow?'+q,{
   method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':ProcessSync.identity.id},body:JSON.stringify({action:'begin'})
  })).status,{moduleId,q});assert.equal(status,200);
 }
}
const flow=(controls,moduleId)=>moduleId==='fqc'?controls.qualityMasterControl.libraries.fqc.workflow:moduleId==='iqc'?controls.iqcMasterControl.workflow:moduleId==='ipqc-c'?controls.ipqcCMasterControl.workflow:controls.ipqcABMasterControl.scopes['A:G-A'].workflow;
for(const [width,language]of [[1280,'zh'],[390,'vi']])void test(`compiled four-module transfer preserves open local forms; all four save ${width} ${language}`,async t=>{
 const s=await setup(width,language);try{
 await s.source.locator('[data-node-select="category"]').first().click();await s.source.locator('[data-node-select="subcategory"]').first().click();if(await s.source.locator('[data-node-select="group"]').count())await s.source.locator('[data-node-select="group"]').first().click();
 // Establish the real shared drafts before opening another page's unsent form.
 for(const [moduleId,q] of [['fqc','caseMetadata=1'],['iqc','caseMetadata=1'],['ipqc-c','caseMetadata=1'],['ipqc-ab','scope=A%3AG-A&caseMetadata=1'],['ipqc-ab','module=1&caseMetadata=1']]){assert.equal(await s.source.evaluate(async({moduleId,q})=>(await fetch('/api/'+moduleId+'/workflow?'+q,{method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':ProcessSync.identity.id},body:JSON.stringify({action:'begin'})})).status,{moduleId,q}),200);}
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
  const applied=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/'+key+'/workflow'&&r.request().postDataJSON().command?.action==='save');
  await p.locator('#routine-confirm-transfer-'+key).click();assert.equal((await applied).status(),200);await p.waitForFunction(()=>!window.sharedDraftAccountState().queued);
 }
 const after=await s.controls();
 for(const moduleId of ['fqc','iqc','ipqc-c','ipqc-ab']){assert.equal(flow(after,moduleId).working.items[0].equipmentId,'target');const saved=reviewFlow(after,moduleId).saved;assert(saved?.id);assert.equal(rowsOf(saved).find(row=>row.id===flow(after,moduleId).working.items[0].id).equipmentId,'target');assert.deepEqual(flow(after,moduleId).active,flow(before,moduleId).active);assert.deepEqual(flow(after,moduleId).cases,flow(before,moduleId).cases);const retained=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['equipmentId','equipmentSnapshot','tool','inspectionMode'].includes(key)));assert.deepEqual(retained(flow(after,moduleId).working.items[0]),retained(flow(before,moduleId).working.items[0]));}
 assert.deepEqual(after.routineEquipmentControl,before.routineEquipmentControl);assert.equal(s.posts.slice(start).filter(row=>row.body.command?.action==='save').length,4);
 for(const target of targetPages){await target.p.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));assert.equal(await target.p.locator(target.selector).inputValue(),target.value);}
 assert.deepEqual(s.errors,[]);t.diagnostic(JSON.stringify({width,language,workflowActions:s.posts.slice(start).map(row=>({path:row.path,action:row.body.command?.action||row.body.action})),limits:['Synthetic data, same-machine pages; no physical phone or live system','Each module saves its own shared snapshot; target forms remain unsent and no Submit is authorized']}));
 }finally{await s.close();}
});

void test('compiled unknown FQC transfer Save leaves locally, returns/reloads, and checks the original receipt only',async()=>{
 const s=await setup(390,'zh');let releasePreview=()=>{};try{
 await openTargetDraft(s.source,'fqc');
 const p=s.source;await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();
 // Normal identified target Begin happens before the uncertain Save.
 let lost=false,down=true,posts=0;
 await p.route('**/api/fqc/workflow?*',async route=>{const request=route.request(),url=new URL(request.url());if(url.searchParams.has('operationId')&&down)return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});if(request.method()==='POST'&&request.postDataJSON().command?.action==='save'){posts++;if(!lost){lost=true;assert.equal((await route.fetch()).status(),200);return route.abort('failed');}}return route.continue();});
 await p.locator('[data-equipment-transfer="source"]').click();await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);
 const markers=()=>p.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('routine-equipment-fqc-transfer-v1:')||key.startsWith('shared-draft-')))),original=await markers();assert(Object.keys(original).some(key=>key.startsWith('routine-equipment-fqc-transfer-v1:')));assert.equal(posts,1);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await p.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');assert.deepEqual(await markers(),original);assert.equal(posts,1);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await p.locator('#routine-search').waitFor();await p.reload();await p.locator('#routine-search').waitFor();assert.deepEqual(await markers(),original);
 // Hold the new preview to prove recovery depends only on the original receipt.
 const previewGate=new Promise(resolve=>{releasePreview=resolve;});await p.route('**/api/quality-equipment-replacement?*',async route=>{await previewGate;await route.continue();});
 await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();const previewRequest=p.waitForRequest(r=>new URL(r.url()).pathname==='/api/quality-equipment-replacement');await p.locator('[data-equipment-transfer="source"]').click();await previewRequest;assert.match(await p.locator('#routine-transfer-backdrop').innerText(),/載入生效與草稿差異中/);assert.match(await p.locator('#routine-confirm-transfer-fqc').textContent(),/查詢原移轉/);down=false;await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>!window.sharedDraftAccountState().unknown);assert.equal(posts,1);assert.equal(Object.keys(await markers()).length,0);assert.equal(flow(await s.controls(),'fqc').saved.content.items[0].equipmentId,'target');releasePreview();assert.deepEqual(s.errors,[]);
 }finally{releasePreview();await s.close();}
});
void test('compiled idle FQC target issues no poll, retains its form and chooses fresh conflicts before Save',async()=>{
 const s=await setup(1280,'zh');try{
 const source=s.source;assert.equal(await source.evaluate(async()=>(await fetch('/api/fqc/workflow?caseMetadata=1',{method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':ProcessSync.identity.id},body:JSON.stringify({action:'begin'})})).status),200);
 const target=await s.page('quality-fqc');await target.clock.install();await target.reload();await target.locator('[data-edit-item]').first().click();await target.locator('.fqc-modal-form [name="description"]').fill('Still unsent local input');await target.locator('.fqc-modal-form [name="toolType"][value="visual"]').check();
 const idleReads=[];target.on('request',request=>{if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/fqc/workflow')idleReads.push(request.url());});
 await source.locator('[data-node-select="category"]').first().click();await source.locator('[data-node-select="subcategory"]').first().click();if(await source.locator('[data-node-select="group"]').count())await source.locator('[data-node-select="group"]').first().click();await source.locator('[data-equipment-transfer="source"]').click();await source.locator('#routine-target-eq-select').selectOption('target');const savedResponse=source.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');await source.locator('#routine-confirm-transfer-fqc').click();assert.equal((await savedResponse).status(),200);await source.waitForFunction(()=>!window.sharedDraftAccountState().queued);const committed=flow(await s.controls(),'fqc');assert.equal(committed.saved.content.items[0].equipmentId,'target');
 await target.bringToFront();await target.clock.fastForward(30001);assert.deepEqual(idleReads,[],'peer Save, focus and elapsed time issue no target workflow GET');
 assert.equal(await target.locator('.fqc-modal-form [name="description"]').inputValue(),'Still unsent local input');assert.equal(await target.locator('.fqc-modal-form [name="toolType"][value="visual"]').isChecked(),true);assert.equal(flow(await s.controls(),'fqc').saved.id,committed.saved.id);
 await target.locator('.fqc-modal-form button[type="submit"]').click();await target.locator('.fqc-modal-form').waitFor({state:'detached'});
 const beforePosts=s.posts.filter(row=>row.path==='/api/fqc/workflow').length;
 await target.locator('#fqc-save').click();await target.locator('[data-fqc-save-choice="cancel"]').click();
 assert.equal(s.posts.filter(row=>row.path==='/api/fqc/workflow').length,beforePosts,'cancelled fresh comparison sends no POST');
 assert.equal(flow(await s.controls(),'fqc').saved.id,committed.saved.id);
 const accepted=target.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');
 await target.locator('#fqc-save').click();await target.locator('[data-fqc-save-choice="theirs"]').click();assert.equal((await accepted).status(),200);
 const after=flow(await s.controls(),'fqc');assert.equal(after.working.items[0].equipmentId,'target');assert.equal(after.working.items[0].description,'Still unsent local input');assert.deepEqual(after.saved.content,after.working);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('compiled Begin handoff storage failure keeps the source identity through departure/reload and receipt-only recovery',async()=>{
 const s=await setup(390,'zh',{createTransferFixture,createABCFixture,chromium,v107EquipmentTab:true});try{
 const p=s.source;await p.evaluate(()=>{const original=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem').value;window.__fqcSourceWrites=0;Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key.startsWith('routine-equipment-fqc-transfer-v1:')&&++window.__fqcSourceWrites===2)throw Error('Synthetic source journal quota');return original.call(this,key,value);};});
 async function open(){await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();await p.locator('[data-equipment-transfer="source"]').click();}
 const marker=()=>p.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.startsWith('routine-equipment-fqc-transfer-v1:'))),posts=()=>s.posts.filter(r=>r.path==='/api/fqc/workflow');await open();await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>window.__fqcSourceWrites===2&&!window.sharedDraftAccountState().queued);const original=await marker(),record=JSON.parse(original[1]);assert.equal(record.phase,'begin');assert.match(record.operationId,/^[0-9a-f-]{36}$/);assert.deepEqual(posts().map(r=>r.body.action||r.body.command?.action),['begin-v1']);assert.equal(flow(await s.controls(),'fqc').saved,null);assert.equal(await p.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('shared-draft-begin-v1:'))),false);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await p.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');assert.deepEqual(await marker(),original);await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await p.locator('#routine-search').waitFor();s.retireV107();await p.reload();await p.locator('#routine-search').waitFor();assert.deepEqual(await marker(),original);
 await open();const receipt=p.waitForRequest(r=>new URL(r.url()).searchParams.get('operationId')===record.operationId);await p.locator('#routine-confirm-transfer-fqc').click();await receipt;await p.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith('routine-equipment-fqc-transfer-v1:')));assert.deepEqual(posts().map(r=>r.body.action||r.body.command?.action),['begin-v1']);assert.equal(flow(await s.controls(),'fqc').saved,null);assert.match(await p.locator('#routine-transfer-backdrop').innerText(),/尚未移轉或存取/);
 const saved=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-fqc').click();assert.equal((await saved).status(),200);await p.waitForFunction(()=>!window.sharedDraftAccountState().queued);assert.deepEqual(posts().map(r=>r.body.action||r.body.command?.action),['begin-v1','save']);assert.equal(flow(await s.controls(),'fqc').saved.content.items[0].equipmentId,'target');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('compiled pre-dispatch Begin GET503 removes only the proven unsent intent and a fresh explicit attempt succeeds',async()=>{
 const s=await setup(390,'zh',{createTransferFixture,createABCFixture,chromium,v107EquipmentTab:true});try{
 const p=s.source;let reads=0,receiptGETs=0,down=true;await p.evaluate(()=>{const set=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem').value;window.__beginIntents=[];Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key.startsWith('routine-equipment-fqc-transfer-v1:')){const record=JSON.parse(value);if(record.phase==='begin')window.__beginIntents.push(record.operationId);}return set.call(this,key,value);};});
 await p.route('**/api/fqc/workflow?*',route=>{const r=route.request(),u=new URL(r.url());if(r.method()==='GET'){if(u.searchParams.has('operationId'))receiptGETs++;else if(++reads===2&&down)return route.fulfill({status:503,json:{error:'SYNTHETIC_PREFLIGHT_UNAVAILABLE'}});}return route.continue();});const before=await s.controls();
 await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();await p.locator('[data-equipment-transfer="source"]').click();await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-fqc').click();await p.waitForFunction(()=>window.__beginIntents.length===1&&!window.sharedDraftAccountState().queued&&document.querySelector('#routine-transfer-backdrop')?.textContent.includes('SYNTHETIC_PREFLIGHT_UNAVAILABLE'));assert.equal(s.posts.filter(r=>r.path==='/api/fqc/workflow').length,0);assert.equal(await p.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('routine-equipment-fqc-transfer-v1:')||k.startsWith('shared-draft-begin-v1:'))),false);assert.equal(await p.evaluate(()=>window.sharedDraftAccountState().unknown),false);assert.deepEqual(await s.controls(),before);
 down=false;const saved=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');await p.locator('#routine-confirm-transfer-fqc').click();assert.equal((await saved).status(),200);await p.waitForFunction(()=>!window.sharedDraftAccountState().queued);const intents=await p.evaluate(()=>window.__beginIntents);assert.equal(intents.length,2);assert.notEqual(intents[0],intents[1]);assert.deepEqual(s.posts.filter(r=>r.path==='/api/fqc/workflow').map(r=>r.body.action||r.body.command?.action),['begin-v1','save']);assert.equal(receiptGETs,0);assert.equal(flow(await s.controls(),'fqc').saved.content.items[0].equipmentId,'target');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('batch3 equipment Save, FQC atomic transfer and IPQC AB guarded Save coexist in compiled UI',{timeout:90000},async()=>{
 const s=await setup(1280,'zh');try{
 const p=s.source;
 await p.locator('#routine-begin').click();await p.locator('#routine-save').waitFor();
 await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();
 await p.locator('[data-equipment-edit="source"]').click();await p.locator('#routine-editor [data-field="notes"]').fill('Batch3 equipment saved');await p.locator('#routine-form-apply').click();
 const equipmentSaved=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow'&&r.request().postDataJSON().command?.action==='save');await p.locator('#routine-save').click();assert.equal((await equipmentSaved).status(),200);await p.waitForFunction(()=>!window.sharedDraftAccountState().queued);
 assert.equal((await s.controls()).routineEquipmentControl.workflow.saved.content.equipment.find(row=>row.id==='source').notes,'Batch3 equipment saved');
 const ab=await s.page('quality-ipqc-ab');await ab.locator('#ipqcab-begin').click();await ab.locator('[data-ab-edit-item]').first().click();await ab.locator('#ab-standard').fill('Batch3 unsent AB standard');
 const start=s.posts.length;
 for(const moduleId of ['fqc','ipqc-ab']){
  await openTargetDraft(s.source,moduleId);
  const source=await s.page('quality-routine-equipment');await source.locator('[data-node-select="category"]').first().click();await source.locator('[data-node-select="subcategory"]').first().click();if(await source.locator('[data-node-select="group"]').count())await source.locator('[data-node-select="group"]').first().click();
  await source.locator('[data-equipment-transfer="source"]').click();await source.locator('#routine-target-eq-select').selectOption('target');
  const action='save',response=source.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/'+moduleId+'/workflow'&&r.request().postDataJSON().command?.action===action);
  await source.locator('#routine-confirm-transfer-'+moduleId).click();assert.equal((await response).status(),200);await source.waitForFunction(()=>!window.sharedDraftAccountState().queued);
 }
 const transferred=await s.controls();assert.equal(flow(transferred,'fqc').saved.content.items[0].equipmentId,'target');assert.equal(flow(transferred,'ipqc-ab').working.items[0].equipmentId,'target');assert.equal(transferred.ipqcABMasterControl.moduleDraft.workflow.saved.content.scopes['A:G-A'].items[0].equipmentId,'target');
 assert.equal(s.posts.slice(start).filter(r=>r.path==='/api/ipqc-ab/workflow'&&r.body.command?.action==='save').length,1);
 await ab.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));assert.equal(await ab.locator('#ab-standard').inputValue(),'Batch3 unsent AB standard');
 await ab.locator('#ab-apply').click();const saved=ab.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/ipqc-ab/workflow'&&r.request().postDataJSON().command?.action==='save');await ab.locator('#ipqcab-save').click();assert.equal((await saved).status(),200);await ab.waitForFunction(()=>!window.sharedDraftAccountState().queued);
 const final=await s.controls(),working=final.ipqcABMasterControl.moduleDraft.workflow;assert.equal(working.saved.content.scopes['A:G-A'].items[0].equipmentId,'target');assert.equal(working.saved.content.scopes['A:G-A'].items[0].standard,'Batch3 unsent AB standard');
 assert.equal(final.routineEquipmentControl.workflow.saved.content.equipment.find(row=>row.id==='source').notes,'Batch3 equipment saved');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('compiled IQC lost identified Begin leaves silently and settles only its original receipt without automatic Save',async()=>{
 const s=await setup(390,'zh',{createTransferFixture,createABCFixture,chromium,v107EquipmentTab:true});try{
 const p=s.source;let down=true,lost=false,posts=0;
 await p.route('**/api/iqc/workflow?*',async route=>{const r=route.request(),url=new URL(r.url());if(url.searchParams.has('operationId')&&down)return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});if(r.method()==='POST'){posts++;assert.equal(r.postDataJSON().action,'begin-v1');if(!lost){lost=true;assert.equal((await route.fetch()).status(),200);return route.abort('failed');}}return route.continue();});
 async function openTransfer(){await p.locator('[data-node-select="category"]').first().click();await p.locator('[data-node-select="subcategory"]').first().click();if(await p.locator('[data-node-select="group"]').count())await p.locator('[data-node-select="group"]').first().click();await p.locator('[data-equipment-transfer="source"]').click();}
 await openTransfer();await p.locator('#routine-target-eq-select').selectOption('target');await p.locator('#routine-confirm-transfer-iqc').click();await p.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);
 const markers=()=>p.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('routine-equipment-iqc-transfer-v1:')||key.startsWith('shared-draft-')))),original=await markers();assert(Object.keys(original).some(key=>key.startsWith('routine-equipment-iqc-transfer-v1:')));assert.equal(posts,1);assert.match(await p.locator('#routine-transfer-backdrop').innerText(),/待確認/);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await p.waitForFunction(()=>window.ProcessSync.destination.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');assert.deepEqual(await markers(),original);assert.equal(posts,1);
 await p.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await p.locator('#routine-search').waitFor();s.retireV107();await p.reload();await p.locator('#routine-search').waitFor();assert.deepEqual(await markers(),original);
 await openTransfer();down=false;await p.locator('#routine-confirm-transfer-iqc').click();await p.waitForFunction(()=>!window.sharedDraftAccountState().unknown);assert.equal(posts,1);assert.equal(Object.keys(await markers()).length,0);await p.waitForFunction(()=>document.querySelector('#routine-transfer-backdrop')?.textContent.includes('尚未移轉或存取'));assert.match(await p.locator('#routine-transfer-backdrop').innerText(),/尚未移轉或存取/);
 const current=flow(await s.controls(),'iqc');assert.equal(current.saved,null);assert.equal(current.working.items[0].equipmentId,'source');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

const transferModules = ['fqc','iqc','ipqc-ab','ipqc-c'];
const sectionKey = id => ({'ipqc-ab':'ipqcAB','ipqc-c':'ipqcC'}[id] || id);
const toolbarId = id => id.replace('-','');
const rowsOf = version => (version.content.scopes?.['A:G-A'] || version.content).items;
const reviewFlow = (controls,mod) => mod==='ipqc-ab' ? controls.ipqcABMasterControl.moduleDraft.workflow : flow(controls,mod);


async function assertStandardStage(page, goto, hidden, id, assetCode) {
  await goto('view=data&dataTab=quality-ipqc-ab');
  await page.locator('#ipqcab-line').selectOption('A');
  await page.locator('#ipqcab-group').selectOption('G-A');
  const stage=page.locator('#ipqcab-stage');
  const codes=()=>stage.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value).filter(Boolean));
  assert.deepEqual(await codes(),hidden?['A-PACK']:['A-CUT']);
  if(hidden) await page.locator('#ipqcab-route-extras').click();
  await stage.selectOption('A-CUT');
  await page.locator('[data-ab-error]').first().click();
  const item=page.locator('[data-ab-view-item="'+id+'"]');
  await item.waitFor();
  if(assetCode){
    const link=item.locator('xpath=ancestor::article[1]').locator('a.ipqcab-equipment-preview');
    assert.equal(new URL(await link.getAttribute('href'),page.url()).searchParams.get('equipmentId'),'target');
    assert((await link.innerText()).includes(assetCode));
  }
}

async function verifyCurrentScreens(session,mod,sourceId,expectedIds,locked){
  const page=await session.page('quality-routine-equipment');
  try{
    await page.locator('[data-node-select="category"]').first().click();
    await page.locator('[data-node-select="subcategory"]').first().click();
    if(await page.locator('[data-node-select="group"]').count())await page.locator('[data-node-select="group"]').first().click();
    await page.locator('[data-equipment-view="'+sourceId+'"]').click();
    const section=page.locator('[data-view-ref-kind="'+sectionKey(mod)+'"]');
    const common=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quality-equipment-replacement' && new URL(r.url()).searchParams.get('sourceId')===sourceId);
    const first=common();await section.locator('summary').first().click();
    const snap=await (await first).json();await section.locator('.routine-ref-subgroup').first().waitFor();
    const links=section.locator('.routine-ref-subgroup').first().locator('[data-view-exact]');
    assert.deepEqual(await links.evaluateAll(rows=>rows.map(b=>b.dataset.iid).sort((a,b)=>a.localeCompare(b))),[...expectedIds].sort((a,b)=>a.localeCompare(b)));
    await page.locator('#routine-view-dismiss').click();
    const second=common();await page.locator('[data-equipment-transfer="'+sourceId+'"]').click();
    const preview=await (await second).json();assert.equal(preview.revision,snap.revision);
    const current=preview.modules.find(m=>m.moduleId===mod).items.filter(r=>r.effectiveReference);
    assert.deepEqual(current.map(r=>r.itemId).sort((a,b)=>a.localeCompare(b)),[...expectedIds].sort((a,b)=>a.localeCompare(b)));
    const transfer=page.locator('[data-transfer-reference="'+sectionKey(mod)+'"]');
    assert.equal(await transfer.count(),expectedIds.length);
    if(locked)assert(current.every(r=>r.selectable===false && r.unavailableReason));
  }finally{await page.close();}
}

async function exerciseReturnedCases(session, {page,goto,ack,confirmDialog}, original, savedId) {
  const origin=session.f.url.origin;
  const login=id=>session.context.addCookies([{name:'process_demo',value:session.f.cookie(id),url:origin}]);
  for(const [action,actor] of [['withdraw','frank'],['return','fixture-reviewer']]){
    const pending=reviewFlow(await session.controls(),'ipqc-ab').pendingId;
    await login(actor);
    await goto('view=approval&approvalTab=quality');
    await page.locator('[data-review-jump="ipqc-ab"]').click();
    const accepted=ack('ipqc-ab',action);
    await page.locator('[data-ab-module-action="'+(action==='return'?'reject':'withdraw')+'"][data-case-id="'+pending+'"]').click();
    await confirmDialog();
    assert.equal((await accepted).status(),200);
    const reviewed=reviewFlow(await session.controls(),'ipqc-ab');
    assert.equal(reviewed.pendingId,null);
    assert.equal(reviewed.saved.id,savedId);
    assert.deepEqual(reviewed.active,original);
    await verifyCurrentScreens(session,'ipqc-ab','source',rowsOf(original).map(row=>row.id),false);
    const old=reviewed.cases.find(c=>c.id===pending);
    assert.equal(old.status,action==='return'?'returned':'withdrawn');
    assert.equal(old.result.actor.id,actor);
    await login('frank');
    await goto('view=data&dataTab=quality-ipqc-ab');
    const submit=ack('ipqc-ab','submit');
    await page.locator('#ipqcab-submit').click();
    await confirmDialog();
    assert.equal((await submit).status(),200);
  }
}

async function restoreApprovedTestRoute(session) {
  const origin=session.f.url.origin;
  let seq=0;
  const masterPath=origin+'/api/master/workflow?scope=AB&caseMetadata=1';
  const api=async(actor,body)=>{
    const res=await session.context.request.post(masterPath,{headers:{Origin:origin,'X-Process-Expected-Actor':actor},data:body});
    const reply=await res.json(); assert.equal(res.status(),200,JSON.stringify({action:body.action||body.command?.action,error:reply.error,details:reply.details})); return reply;
  };
  const identity=actor=>session.context.addCookies([{name:'process_demo',value:session.f.cookie(actor),url:origin}]);
  await api('frank',{action:'begin'});
  const command=async(actor,action,fields={})=>{
    const read=await session.context.request.get(masterPath);
    assert.equal(read.status(),200);
    const dto=await read.json(),flow=(await session.controls()).masterDataControl.workflowScopes.AB;
    return api(actor,{command:{action,operationId:crypto.randomUUID(),clientId:'route-roundtrip',sequence:++seq,generation:flow.generation,expectedRevision:flow.revision,input:{stateRevision:dto.revision},...fields}});
  };
  const paths=[['categoryGroups',{id:'group-G-A'},'defaultStages'],['products',{id:'product-A100'},'stages']];
  await command('frank','apply',{guards:paths.map(path=>({path,value:['A-PACK']})),patches:paths.map(path=>({op:'set',path,value:['A-CUT']}))});
  const masterSave=await command('frank','save');
  const masterSubmit=await command('frank','submit',{savedId:masterSave.receipt.savedId,reason:'Restore synthetic group route for held standards'});
  await identity('fixture-reviewer');
  await command('fixture-reviewer','approve',{caseId:masterSubmit.receipt.caseId});
}

async function verifyReferenceJourney(width, lang, options={}) {
  const all = options.selectAll === true;
  const loginPassword=all?randomBytes(24).toString('hex'):undefined;
  const session = await setup(width,lang,{
    createTransferFixture:()=>createTransferFixture({paired:!all,offRoute:options.offRoute}),
    createABCFixture, chromium, independentReviewer:true, loginPassword
  });
  try {
    const page=session.source, origin=session.f.url.origin;
    const goto=async query=>{
      await page.goto(origin+'/process/?system=quality&'+query);
      await page.waitForFunction(()=>window.ProcessSync?.identity && document.documentElement.dataset.processNavigationStatus==='ready');
    };
    const openEquipment=async()=>{
      await goto('view=data&dataTab=quality-routine-equipment');
      await page.locator('[data-node-select="category"]').first().click();
      await page.locator('[data-node-select="subcategory"]').first().click();
      if(await page.locator('[data-node-select="group"]').count()) await page.locator('[data-node-select="group"]').first().click();
    };
    const ack=(mod,action)=>page.waitForResponse(r=>r.request().method()==='POST' &&
      new URL(r.url()).pathname==='/api/'+mod+'/workflow' && r.request().postDataJSON()?.command?.action===action);
    const settled=()=>page.waitForFunction(()=>!window.sharedDraftAccountState?.().queued);
    const confirmDialog=async()=>{
      const dialog=page.locator('dialog[open]').last();
      await dialog.waitFor();
      const reason=dialog.locator('textarea:visible').first();
      if(await reason.count()) await reason.fill('Synthetic inspection change');
      for(const checkbox of await dialog.locator('input[type=checkbox]:visible:enabled').all()) await checkbox.check();
      await dialog.locator('[type=submit]').click();
    };
    const equipment=(await session.controls()).routineEquipmentControl;
    const approved=equipment.versions.find(v=>v.id===equipment.activeVersionId);
    const photoIds=Object.fromEntries(approved.equipment.map(r=>[r.id,r.photoId]));
    assert.notEqual(photoIds.source,photoIds.target);
    async function verifyPhotos() {
      const bucket=await session.f.mf.getR2Bucket('STATE_ARCHIVE');
      for(const id of [photoIds.source,photoIds.target]){
        const image=await bucket.get('routine-equipment/photos/'+id);
        assert(image);
        assert.equal(createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex'),id);
      }
    }
    const snapshots={},selected={},pending={},finalCases={};
    await verifyPhotos();
    await options.before?.(session);
    for (const mod of transferModules) {
      await openTargetDraft(page,mod);
      const initial=reviewFlow(await session.controls(),mod);
      snapshots[mod]=initial.active;
      const originals=rowsOf(initial.active);
      assert.equal(originals.length,all?1:2);
      assert(originals.every(row=>row.equipmentId==='source'));
      if(mod==='ipqc-ab' && options.offRoute) await assertStandardStage(page,goto,true,originals[0].id);
      await openEquipment();
      await page.locator('[data-equipment-transfer="source"]').click();
      const choices=page.locator('[data-transfer-check="'+sectionKey(mod)+'"]');
      await choices.first().waitFor();
      assert.equal(await choices.count(),originals.length);
      if(!all) await choices.last().uncheck();
      await choices.first().check();
      let chosen=await choices.first().inputValue();
      if(mod==='ipqc-ab') chosen=JSON.parse(chosen)[1];
      selected[mod]=chosen;
      await page.locator('#routine-target-eq-select').selectOption('target');
      const applied=ack(mod,'save');
      await page.locator('#routine-confirm-transfer-'+mod).click();
      assert.equal((await applied).status(),200);
      await settled();
      const draftControls=await session.controls();
      const dest=flow(draftControls,mod);
      assert.deepEqual(reviewFlow(draftControls,mod).active,initial.active);
      for(const row of originals) {
        const edited=dest.working.items.find(r=>r.id===row.id);
        if(row.id===chosen) assert.equal(edited.equipmentId,'target');
        else assert.deepEqual(edited,row);
      }
      await goto('view=data&dataTab=quality-'+mod);
      const stored=reviewFlow(draftControls,mod).saved;
      assert(stored?.id);assert.equal(rowsOf(stored).find(row=>row.id===chosen).equipmentId,'target');
      if(all){
        await page.reload();
        await page.locator('#'+toolbarId(mod)+'-submit').waitFor();
        const endpoint='/api/'+mod+'/workflow?'+(mod==='ipqc-ab'?'module=1&':'')+'caseMetadata=1';
        const fromPage=await page.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Saved draft reload failed');return r.json();},endpoint);
        assert.equal((fromPage.control?.workflow||fromPage.workflow).saved.id,stored.id);
        const reader=await session.context.browser().newContext({baseURL:origin,serviceWorkers:'block'});
        try{
          await reader.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
          const login=await reader.newPage();
          await login.goto('/login');
          await login.getByLabel('帳號 / Tài khoản',{exact:true}).fill('frank');
          await login.getByLabel('密碼 / Mật khẩu',{exact:true}).fill(loginPassword);
          const signedIn=login.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform-login' && r.request().method()==='POST');
          await login.getByRole('button',{name:'登入平台 / Đăng nhập'}).click();
          assert.equal((await signedIn).status(),200);
          await login.waitForURL(url=>url.pathname.startsWith('/process/'));
          const read=await reader.request.get(endpoint);assert.equal(read.status(),200);
          const authority=await read.json(),seen=authority.control?.workflow||authority.workflow;
          assert.equal(seen.saved.id,stored.id);assert.equal(seen.pendingId,null);
        }finally{await reader.close();}
      }
      const submitting=ack(mod,'submit');
      await page.locator('#'+toolbarId(mod)+'-submit').click();
      await confirmDialog();
      assert.equal((await submitting).status(),200);
      const submitted=reviewFlow(await session.controls(),mod);
      assert.deepEqual(submitted.active,initial.active);
      assert(submitted.pendingId);
      if(mod==='ipqc-ab' && options.offRoute){
        await exerciseReturnedCases(session,{page,goto,ack,confirmDialog},initial.active,submitted.saved.id);
        pending[mod]=reviewFlow(await session.controls(),mod).pendingId;
      } else pending[mod]=submitted.pendingId;
    }
    if(options.selectAll || options.offRoute){
      for(const mod of transferModules)await verifyCurrentScreens(session,mod,'source',rowsOf(snapshots[mod]).map(row=>row.id),true);
    }
    await session.context.addCookies([{name:'process_demo',value:session.f.cookie('fixture-reviewer'),url:origin}]);
    for(const mod of transferModules){
      await goto('view=approval&approvalTab=quality');
      assert.equal(await page.evaluate(()=>window.ProcessSync.identity.id),'fixture-reviewer');
      await page.locator('[data-review-jump="'+mod+'"]').click();
      const selector={fqc:'#quality-approve',iqc:'#iqc-review-approve','ipqc-ab':'[data-ab-module-action="approve"]','ipqc-c':'[data-ipqcc-review="approve"]'}[mod];
      const approving=ack(mod,'approve');
      await page.locator(selector).first().click();
      if(await Promise.race([approving.then(()=>false),page.locator('dialog[open]').first().waitFor().then(()=>true)])) await confirmDialog();
      assert.equal((await approving).status(),200);
      const final=reviewFlow(await session.controls(),mod);
      assert.equal(final.active.id,pending[mod]);
      assert.equal(final.pendingId,null);
      const approvedCase=final.cases.find(c=>c.id===pending[mod]);
      assert.equal(approvedCase.actor.id,'frank');
      assert.equal(approvedCase.result.actor.id,'fixture-reviewer');
      assert.deepEqual(final.cases.find(c=>c.id===snapshots[mod].id).content,snapshots[mod].content);
      for(const original of rowsOf(snapshots[mod])){
        const current=rowsOf(final.active).find(r=>r.id===original.id);
        if(original.id!==selected[mod]){assert.deepEqual(current,original); continue;}
        assert.equal(current.equipmentId,'target');
        const photo=row=>mod==='fqc' ? new URL(row.equipmentSnapshot.photoUrl,origin).searchParams.get('id') : row.equipmentSnapshot.photoId;
        assert.equal(photo(original),photoIds.source);
        assert.equal(photo(current),photoIds.target);
      }
      finalCases[mod]=final.active;
      await options.afterApproval?.(session,mod);
    }
    for(const id of ['source','target']){
      await openEquipment();
      await page.locator('[data-equipment-view="'+id+'"]').click();
      const observed={};
      for(const mod of transferModules){
        const section=page.locator('[data-view-ref-kind="'+sectionKey(mod)+'"]');
        await section.locator('summary').click();
        const revision=section.locator('.routine-ref-content small').first();
        await revision.waitFor();
        observed[mod]=Number((await revision.innerText()).match(/(?:資料修訂|Bản sửa dữ liệu)\s+(\d+)/)?.[1]);
        const active=section.locator('.routine-ref-subgroup').filter({has:page.locator('b',{hasText:/目前生效中|Đang hiệu lực/})});
        const expected=rowsOf(finalCases[mod]).filter(r=>r.equipmentId===id);
        assert.equal(await active.locator('.routine-ref-row').count(),expected.length);
        assert.equal(await section.locator('details[open]').count(),0);
        assert.match(await section.locator('summary').first().innerText(),new RegExp('(?:直接引用|Tham chiếu trực tiếp) '+expected.length));
        assert.equal(await section.locator('[data-view-exact]').count(),expected.length);
        for(const row of expected){
          const link=section.locator('[data-view-exact][data-iid="'+row.id+'"]');
          assert.equal(await link.getAttribute('data-vid'),mod==='ipqc-ab'?flow(await session.controls(),mod).active.id:finalCases[mod].id);
        }
        assert.equal(await section.getByText(/歷史版本 \(|Bản lịch sử \(/).count(),0);
        for(const row of expected) assert((await active.innerText()).includes(row.checkNo || row.code));
      }
      await page.locator('#routine-view-dismiss').click();
      const result=page.waitForResponse(r=>r.request().method()==='GET' && new URL(r.url()).pathname==='/api/quality-equipment-replacement');
      await page.locator('[data-equipment-transfer="'+id+'"]').click();
      const response=await result;
      assert.equal(response.status(),200);
      const preview=await response.json();
      for(const mod of transferModules){
        assert.equal(preview.revision,observed[mod]);
        const entry=preview.modules.find(m=>m.moduleId===mod);
        assert.equal(entry.connected,true);
        const expected=rowsOf(finalCases[mod]).filter(r=>r.equipmentId===id).map(r=>r.id).sort((a,b)=>a.localeCompare(b));
        assert.deepEqual(entry.items.filter(r=>r.activeEquipmentId===id).map(r=>r.itemId).sort((a,b)=>a.localeCompare(b)),expected);
        const current=entry.items.filter(r=>r.effectiveReference);
        assert.deepEqual(current.map(r=>r.itemId).sort((a,b)=>a.localeCompare(b)),expected);
        const selectors=page.locator('[data-transfer-reference="'+sectionKey(mod)+'"]');
        assert.equal(await selectors.count(),expected.length);
        if(current.length){
          const locator=page.waitForResponse(r=>new URL(r.url()).searchParams.get('referenceModule')===mod);
          await selectors.first().click();
          const answer=await locator;assert.equal(answer.status(),200);
          const detail=await answer.json();
          assert.equal(detail.revision,preview.revision);
          assert.equal(detail.version.id,current[0].effectiveReference.versionId);
          assert.equal(detail.version.snapshot.items[0].id,current[0].itemId);
        }
      }
    }
    if(all){
      await goto('view=data&dataTab=quality-routine-equipment&equipmentId=target');
      await page.reload();
      for(const mod of transferModules){
        const section=page.locator('[data-view-ref-kind="'+sectionKey(mod)+'"]');
        await section.locator('summary').first().click();
        await section.locator('[data-view-exact][data-iid="'+selected[mod]+'"]').waitFor();
        assert.equal(await section.locator('.routine-ref-subgroup').first().locator('[data-view-exact]').count(),1);
      }
    }
    await verifyPhotos();
    if(options.offRoute){
      const id=selected['ipqc-ab'], target=approved.equipment.find(row=>row.id==='target');
      await assertStandardStage(page,goto,true,id,target.assetCode);
      await session.context.addCookies([{name:'process_demo',value:session.f.cookie('frank'),url:origin}]);
      await restoreApprovedTestRoute(session);
      await assertStandardStage(page,goto,false,id,target.assetCode);
      assert.deepEqual(reviewFlow(await session.controls(),'ipqc-ab').active,finalCases['ipqc-ab']);
    }
    await options.after?.(session);
    assert.deepEqual(session.errors,[]);
  } finally { await session.close(); }
}

for(const [width,lang] of [[1280,'zh'],[390,'vi']]){
  void test('reference selection, saved draft, independent approval and bidirectional readback '+lang,async()=>{
    await verifyReferenceJourney(width,lang);
  });
}

for(const [width,lang] of [[1280,'zh'],[390,'vi']]){
  void test('hidden approved AB standard retains its new equipment through withdrawal, return, approval and route restoration '+lang,async()=>{
    await verifyReferenceJourney(width,lang,{offRoute:true});
  });
}

void test('history-only source stays empty after four approvals on mobile',()=>verifyReferenceJourney(390,'zh',{selectAll:true}));
