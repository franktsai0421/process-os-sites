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
 await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());await context.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);await context.addInitScript(language=>localStorage.setItem('processUILanguage',language),language);
 context.on('page',page=>{page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());page.on('request',r=>{if(r.method()==='POST')posts.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});});
 async function page(tab){const p=await context.newPage();await p.goto(f.url.origin+'/process/?system=quality&view=data&dataTab='+tab);await p.waitForFunction(()=>window.ProcessSync?.identity&&document.documentElement.dataset.processNavigationStatus==='ready');return p;}
 const source=await page('quality-routine-equipment');await source.locator('[data-equipment-transfer="source"]').waitFor();
 async function controls(){const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();const decoded=await f.load('lib/state-records.ts').decodeRecordValues(await f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(row.values));return Object.fromEntries(keys.filter(key=>decoded[key]).map(key=>[key,JSON.parse(decoded[key])]));}
 return{f,context,page,source,posts,errors,controls,async close(){await context.close();await browser.close();await f.close();}};
}
const flow=(controls,module)=>module==='fqc'?controls.qualityMasterControl.libraries.fqc.workflow:module==='iqc'?controls.iqcMasterControl.workflow:module==='ipqc-c'?controls.ipqcCMasterControl.workflow:controls.ipqcABMasterControl.scopes['A:G-A'].workflow;
for(const [width,language]of [[1280,'zh'],[390,'vi']])void test(`compiled four-module transfer preserves open local forms and never saves ${width} ${language}`,async t=>{
 const s=await setup(width,language);try{
 // Establish the real shared drafts before opening another page's unsent form.
 for(const module of ['fqc','iqc','ipqc-c','ipqc-ab']){const q=module==='ipqc-ab'?'scope=A%3AG-A&caseMetadata=1':'caseMetadata=1';assert.equal(await s.source.evaluate(async({module,q})=>(await fetch('/api/'+module+'/workflow?'+q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'begin'})})).status,{module,q}),200);}
 const targetPages=[];
 for(const module of ['fqc','iqc','ipqc-c','ipqc-ab']){
  const p=await s.page('quality-'+module);
  if(module==='fqc'){await p.locator('[data-edit-item]').first().click();await p.locator('.fqc-modal-form [name="description"]').fill('Unsent FQC local form');targetPages.push({p,selector:'.fqc-modal-form [name="description"]',value:'Unsent FQC local form'});}
  if(module==='iqc'){await p.locator('[data-select-part="PART1"]').click();await p.locator('[data-edit-item]').first().click();await p.locator('#iqc-item-form [name="nameVi"]').fill('Unsent IQC local form');targetPages.push({p,selector:'#iqc-item-form [name="nameVi"]',value:'Unsent IQC local form'});}
  if(module==='ipqc-c'){await p.locator('[data-ipqcc-product="C100"]').click();await p.locator('[data-ipqcc-edit-item]').first().click();await p.locator('#ipqcc-editor [name="description"]').fill('Unsent C local form');targetPages.push({p,selector:'#ipqcc-editor [name="description"]',value:'Unsent C local form'});}
  if(module==='ipqc-ab'){await p.locator('[data-ab-edit-item]').first().click();await p.locator('#ab-standard').fill('Unsent AB local form');targetPages.push({p,selector:'#ab-standard',value:'Unsent AB local form'});}
 }
 const before=await s.controls(),start=s.posts.length;
 await s.source.locator('[data-equipment-transfer="source"]').click();await s.source.locator('#routine-target-eq-select').waitFor().catch(async()=>{assert.fail('target selector unavailable: '+await s.source.locator('#routine-transfer-backdrop').innerText());});
 await s.source.locator('#routine-target-eq-select').selectOption('target');
 for(const key of ['fqc','iqc','ipqc-c','ipqc-ab']){await s.source.locator('#routine-confirm-transfer-'+key).click();await s.source.waitForFunction(()=>!document.querySelector('#routine-transfer-backdrop')?.textContent.includes('儲存中')&&!document.querySelector('#routine-transfer-backdrop')?.textContent.includes('Đang lưu'));}
 const after=await s.controls();
 for(const module of ['fqc','iqc','ipqc-c','ipqc-ab']){assert.equal(flow(after,module).working.items[0].equipmentId,'target');assert.deepEqual(flow(after,module).saved,flow(before,module).saved);assert.deepEqual(flow(after,module).active,flow(before,module).active);assert.deepEqual(flow(after,module).cases,flow(before,module).cases);const retained=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['equipmentId','equipmentSnapshot','tool','inspectionMode'].includes(key)));assert.deepEqual(retained(flow(after,module).working.items[0]),retained(flow(before,module).working.items[0]));}
 assert.deepEqual(after.routineEquipmentControl,before.routineEquipmentControl);assert.equal(s.posts.slice(start).filter(row=>row.body.command?.action==='save').length,0);
 for(const target of targetPages){await target.p.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));assert.equal(await target.p.locator(target.selector).inputValue(),target.value);}
 assert.deepEqual(s.errors,[]);t.diagnostic(JSON.stringify({width,language,workflowActions:s.posts.slice(start).map(row=>({path:row.path,action:row.body.command?.action||row.body.action})),limits:['Synthetic data, same-machine pages; no physical phone or live system','Target forms remain unsent; no target Save/Submit is authorized by transfer']}));
 }finally{await s.close();}
});
