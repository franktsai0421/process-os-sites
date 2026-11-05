import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/equipment-atomic-fixture.cjs');
const assetRoot=process.env.EQUIPMENT_BUILT_ASSETS||'public/process';
const asset=name=>{const bytes=fs.readFileSync(assetRoot+'/'+name);if(process.env.EQUIPMENT_BUILT_ASSETS)assert.deepEqual(bytes,fs.readFileSync('public/process/'+name),'build asset must match current candidate');return bytes.toString();};
async function setup(width,lang){
 const h=await fixture(),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push(dialog.type());void (dialog.type()==='beforeunload'?dialog.dismiss():dialog.accept());});
 await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());if(u.origin!=='https://equipment.invalid')return route.abort();
 if(u.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${['styles.css','routine-equipment.css','version-draft-ui.css'].map(asset).join('\n')}</style><main id="data-content" data-active-tab="quality-routine-equipment"></main></html>`});
 if(!u.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Synthetic resource unavailable'});
 const r=await h.call(u.pathname+u.search,{method:request.method(),headers:{'Content-Type':request.headers()['content-type']||'application/json'},...(request.postDataBuffer()?{body:request.postDataBuffer()}: {})});
 await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});
 });
 async function boot(){await page.evaluate(language=>{window.ProcessSync={identity:{id:'preview-editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>({'Content-Type':'application/json'}),requiresReload:false};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=()=>{};localStorage.setItem('processUILanguage',language);},lang);
 for(const name of ['shared-draft-client.js','version-draft-ui.js','routine-equipment.js'])await page.addScriptTag({content:asset(name)});
 await page.evaluate(()=>window.RoutineEquipmentUI.mount(document.querySelector('#data-content')));await page.locator('#routine-save').waitFor();}
 await page.goto('https://equipment.invalid/process/');await boot();const settled=()=>page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save')?.disabled);
 return {h,page,context,errors,dialogs,boot,settled,async close(){await context.close();await browser.close();h.close();}};
}
async function selectGroup(page){await page.locator('[data-node-select="category"]').first().click();await page.locator('[data-node-select="subcategory"]').first().click();if(await page.locator('[data-node-select="group"]').count())await page.locator('[data-node-select="group"]').first().click();}
async function edit(page){await page.locator('[data-equipment-edit="source"]').click();await page.locator('#routine-form-apply').waitFor();}
for(const [width,lang]of [[1280,'zh'],[390,'vi']])void test(`native equipment local hierarchy/photo/calibration Save once ${width}px ${lang}`,async t=>{
 const s=await setup(width,lang);try{
 s.page.setDefaultTimeout(10000);const posts=()=>s.h.requests.filter(r=>r.method==='POST'),count=posts().length;
 await selectGroup(s.page);await s.page.locator('[data-node-edit="group"]').first().click();await s.page.locator('#routine-dialog-name').fill('本機 Nhóm quy cách');await s.page.locator('#routine-dialog-confirm').click();assert.equal(posts().length,count);
 await edit(s.page);await s.page.locator('#routine-editor [data-field="notes"]').fill('校正備註 ghi chú');await s.page.locator('#routine-editor [data-select="calibrationMethod"]').selectOption('internal');
 await s.page.locator('#routine-editor [data-field="calibratedAt"]').fill('2026-11-01');await s.page.locator('#routine-editor [data-field="expiresAt"]').fill('2026-12-01');
 const png=require('./photo-fixtures.mjs').pngFixture({width:8,height:8});await s.page.locator('#routine-photo-input').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
 await s.page.locator('#routine-form-apply').click();await s.page.locator('#routine-form-apply').waitFor({state:'detached'});assert.equal(posts().length,count);assert.equal(s.h.requests.filter(r=>r.method==='PUT').length,0);
 await s.page.locator('#routine-search').fill('not found');await s.page.locator('#routine-search').fill('');await s.page.locator('#routine-save').click();await s.settled();assert.equal(posts().length,count+1);assert.equal(s.h.requests.filter(r=>r.method==='PUT').length,1);
 const c=await s.h.state(),row=c.workflow.saved.content.equipment.find(r=>r.id==='source');assert.equal(row.notes,'校正備註 ghi chú');assert.equal(row.calibratedAt,'2026-11-01');assert.equal(row.expiresAt,'2026-12-01');assert.equal(c.workflow.saved.content.groups[0].name,'本機 Nhóm quy cách');assert(row.photoId);assert.deepEqual(c.workflow.saved.content,c.workflow.working);
 await edit(s.page);const image=s.page.locator('#routine-editor img').first();await image.waitFor();assert.equal(await image.evaluate(img=>img.complete&&img.naturalWidth>0),true);
 await s.page.locator('#routine-form-cancel').click();assert.deepEqual(s.errors,[]);assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const screenshot=`/tmp/equipment-${width}-${lang}.png`;await s.page.screenshot({path:screenshot,fullPage:true});t.diagnostic(JSON.stringify({viewport:width,language:lang,editingWorkflowPOSTs:0,saveWorkflowPOSTs:1,photoPUTs:1,assets:assetRoot,screenshot}));
 }finally{await s.close();}
});
void test('native close cancels only current form; local changes reload without prompt, committed snapshot survives',async()=>{const s=await setup(1280,'zh');try{
 await selectGroup(s.page);await s.page.locator('[data-node-edit="group"]').first().click();await s.page.locator('#routine-dialog-name').fill('Keep completed local group');await s.page.locator('#routine-dialog-confirm').click();
 await edit(s.page);await s.page.locator('#routine-editor [data-field="notes"]').fill('Cancel this form only');await s.page.locator('#routine-form-cancel').click();await s.page.locator('#routine-save').click();await s.settled();let c=await s.h.state();assert.equal(c.workflow.saved.content.groups[0].name,'Keep completed local group');assert.notEqual(c.workflow.saved.content.equipment[0].notes,'Cancel this form only');
 await edit(s.page);await s.page.locator('#routine-editor [data-field="notes"]').fill('Abandon on reload');const count=s.h.requests.filter(r=>r.method==='POST').length;await s.page.reload();await s.boot();assert.equal(s.h.requests.filter(r=>r.method==='POST').length,count);assert(!s.dialogs.includes('beforeunload'));c=await s.h.state();assert.notEqual(c.workflow.working.equipment[0].notes,'Abandon on reload');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}});
void test('native unknown Save survives reload and original receipt lookup never repeats POST',async()=>{const s=await setup(390,'vi');try{
 await selectGroup(s.page);await edit(s.page);await s.page.locator('#routine-editor [data-field="notes"]').fill('Committed ACK lost');await s.page.locator('#routine-form-apply').click();let lost=false,down=true,attempts=0;
 await s.page.route('**/api/routine-equipment/workflow?*',async route=>{const req=route.request(),u=new URL(req.url());if(down&&u.searchParams.has('operationId'))return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});if(req.method()==='POST'&&JSON.parse(req.postData()).command?.action==='save'){attempts++;if(!lost){lost=true;await s.h.call(u.pathname+u.search,{method:'POST',body:req.postData()});return route.abort('failed');}}return route.fallback();});
 await s.page.locator('#routine-save').click();await s.page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);const markers=()=>s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),marker=await markers();
 await s.page.reload();await s.boot();assert.deepEqual(await markers(),marker);assert.equal(attempts,1);assert(!s.dialogs.includes('beforeunload'));await s.page.locator('#routine-begin-recheck').click();assert.deepEqual(await markers(),marker);down=false;await s.page.locator('#routine-begin-recheck').click();await s.page.waitForFunction(()=>!window.sharedDraftAccountState().unknown);assert.equal(attempts,1);assert.equal((await s.h.state()).workflow.saved.content.equipment[0].notes,'Committed ACK lost');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}});
void test('native new equipment stays local, server allocates once, rapid Save does not duplicate entity',async()=>{const s=await setup(390,'zh');try{
 await selectGroup(s.page);const count=s.h.requests.filter(r=>r.method==='POST').length;await s.page.locator('#routine-add').click();await s.page.locator('#routine-add-asset-code').fill('SYN-NATIVE-NEW');await s.page.locator('#routine-add-name').fill('新增合成設備');await s.page.locator('#routine-add-submit').click();await s.page.locator('#routine-add-submit').waitFor({state:'detached'});assert.equal(s.h.requests.filter(r=>r.method==='POST').length,count);assert(!(await s.h.state()).workflow.working.equipment.some(row=>row.assetCode==='SYN-NATIVE-NEW'));
 await s.page.evaluate(()=>{document.querySelector('#routine-save').click();document.querySelector('#routine-save').click();});await s.settled();const c=await s.h.state(),rows=c.workflow.saved.content.equipment.filter(row=>row.assetCode==='SYN-NATIVE-NEW');assert.equal(rows.length,1);assert.equal(rows[0].pieceMark,'01');assert.equal(s.h.requests.filter(r=>r.method==='POST').length,count+1);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}});
