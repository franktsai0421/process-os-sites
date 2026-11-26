import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/equipment-atomic-fixture.cjs');
async function setup(width,lang,{actor='frank',decorate}={}){
 const data=await fixture();let control;try{control=await data.persisted();}finally{data.close();}
 const f=await createABCFixture({products:1,decorate(values){values.routineEquipmentControl=JSON.stringify(control);decorate?.(values);}}),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);await context.addCookies([{name:'process_demo',value:f.cookie(actor),url:f.url.origin}]);
 const page=await context.newPage(),posts=[],errors=[],dialogs=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow')posts.push(r.postData());});page.on('dialog',d=>{dialogs.push(d.type());void d.accept();});
 await page.goto(f.url.origin+'/process/?system=quality&view=data&dataTab=quality-routine-equipment');await ready(page,'data');await page.locator('#routine-save').waitFor();
 return {f,page,context,posts,errors,dialogs,async state(){return page.evaluate(async()=>{const response=await fetch('/api/routine-equipment/workflow?caseMetadata=1');if(!response.ok)throw Error('READ_'+response.status);return (await response.json()).control.workflow;});},async close(){await context.close();await browser.close();await f.close();}};
}
const ready=(page,view)=>page.waitForFunction(view=>window.ProcessSync?.destination?.view===view&&document.documentElement.dataset.processNavigationStatus==='ready',view);
async function edit(page,text){await page.locator('[data-node-select="category"]').first().click();await page.locator('[data-node-select="subcategory"]').first().click();if(await page.locator('[data-node-select="group"]').count())await page.locator('[data-node-select="group"]').first().click();await page.locator('[data-equipment-edit="source"]').click();await page.locator('#routine-editor [data-field="notes"]').fill(text);}
for(const [width,lang]of [[390,'vi'],[1280,'zh']])void test(`compiled Worker full SPA saves once and abandons local input without prompt ${width} ${lang}`,async()=>{const s=await setup(width,lang);try{
 await edit(s.page,'Compiled saved note');await s.page.locator('#routine-form-apply').click();await s.page.locator('#routine-form-apply').waitFor({state:'detached'});assert.equal(s.posts.length,0);await s.page.locator('#routine-save').click();await s.page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save').disabled);assert.equal(s.posts.length,1);assert.equal((await s.state()).saved.content.equipment[0].notes,'Compiled saved note');
 await edit(s.page,'Abandon unsent compiled note');await s.page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await ready(s.page,'dashboard');assert.equal(await s.page.locator('#process-navigation-departure').count(),0);assert.equal(s.posts.length,1);assert.equal(s.dialogs.length,0);
 await s.page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await s.page.locator('#routine-save').waitFor();assert.equal((await s.state()).working.equipment[0].notes,'Compiled saved note');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}});
void test('compiled Worker unknown Save navigates away, returns/reloads and queries original receipt only',async()=>{const s=await setup(390,'zh');try{
 await edit(s.page,'Compiled committed ACK lost');await s.page.locator('#routine-form-apply').click();let lost=false,down=true,attempts=0;
 await s.page.route('**/api/routine-equipment/workflow?*',async route=>{const request=route.request(),url=new URL(request.url());if(down&&url.searchParams.has('operationId'))return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});if(request.method()==='POST'&&JSON.parse(request.postData()).command?.action==='save'){attempts++;if(!lost){lost=true;assert.equal((await route.fetch()).status(),200);return route.abort('failed');}}return route.continue();});
 await s.page.locator('#routine-save').click();await s.page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);const markers=()=>s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),marker=await markers();
 await s.page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await ready(s.page,'dashboard');assert.equal(await s.page.locator('#process-navigation-departure').count(),0);assert.deepEqual(await markers(),marker);await s.page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-routine-equipment'));await s.page.locator('#routine-begin-recheck').waitFor();await s.page.reload();await s.page.locator('#routine-begin-recheck').waitFor();assert.deepEqual(await markers(),marker);assert.equal(attempts,1);down=false;await s.page.locator('#routine-begin-recheck').click();await s.page.waitForFunction(()=>!window.sharedDraftAccountState().unknown);assert.equal(attempts,1);assert.equal((await s.state()).saved.content.equipment[0].notes,'Compiled committed ACK lost');
 await edit(s.page,'Independent saved note');await s.page.locator('#routine-form-apply').click();await s.page.locator('#routine-save').click();
 await s.page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save').disabled);
 assert.equal(attempts,2);assert.equal((await s.state()).saved.content.equipment[0].notes,'Independent saved note');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}});

void test('quality data entry creates, edits and removes a draft tree and sends its saved version for review',async()=>{
 const s=await setup(1280,'zh'),page=s.page;
 const kinds=['category','subcategory','group'];
 const collections=['categories','subcategories','groups'];
 const node=(kind,action,id)=>page.locator('[data-node-'+action+'="'+kind+'"]'+(id?'[data-id="'+id+'"]':''));
 async function nameNode(button,name){
   await button.click();
   await page.locator('#routine-dialog-name').fill(name);
   await page.locator('#routine-dialog-confirm').click();
   await page.locator('#routine-dialog-confirm').waitFor({state:'detached'});
 }
 async function save(){
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow');
   await page.locator('#routine-save').click();
   const r=await response;
   assert.equal(r.status(),200,JSON.stringify(await r.json()).slice(0,140));
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save')?.disabled);
   return (await s.state()).saved;
 }
 try{
   for(const kind of kinds)await nameNode(node(kind,'add'),'Synthetic '+kind);
   await page.locator('#routine-add').click();
   await page.locator('#routine-add-asset-code').fill('SYN-CRUD');
   await page.locator('#routine-add-name').fill('Synthetic gauge');
   await page.locator('#routine-add-submit').click();
   await page.locator('#routine-add-submit').waitFor({state:'detached'});
   const first=await save();
   const ids=kinds.map((kind,i)=>first.content[collections[i]].find(r=>r.name==='Synthetic '+kind).id);
   const eq=first.content.equipment.find(r=>r.assetCode==='SYN-CRUD').id;
   await page.reload();await ready(page,'data');await page.locator('#routine-save').waitFor();
   assert.equal((await s.state()).saved.id,first.id);
   for(const [i,kind] of kinds.entries()){
     await node(kind,'select',ids[i]).click();
     await nameNode(node(kind,'edit',ids[i]),'Edited '+kind);
   }
   await page.locator('[data-equipment-edit="'+eq+'"]').click();
   await page.locator('#routine-editor [data-field="notes"]').fill('edited gauge');
   await page.locator('#routine-form-apply').click();
   const edited=await save();
   for(const [i,kind] of kinds.entries())assert.equal(edited.content[collections[i]].find(r=>r.id===ids[i]).name,'Edited '+kind);
   assert.equal(edited.content.equipment.find(r=>r.id===eq).notes,'edited gauge');
   for(const [i,kind] of kinds.entries()){
     await node(kind,'delete',ids[i]).click();
     assert.match(await page.locator('.routine-page').innerText(),/下階已有資料/);
   }
   await page.locator('[data-equipment-delete="'+eq+'"]').click();
   await page.locator('[data-equipment-delete="'+eq+'"]').waitFor({state:'detached'});
   for(const i of [2,1,0])await node(kinds[i],'delete',ids[i]).click();
   await nameNode(node('category','add'),'For review');
   const final=await save();
   for(const [i,key] of collections.entries())assert(!final.content[key].some(r=>r.id===ids[i]));
   assert(!final.content.equipment.some(r=>r.id===eq));
   await page.locator('#routine-submit').click();
   await page.locator('dialog.vd-confirm textarea').fill('Review edited catalog');
   const post=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow');
   await page.locator('dialog.vd-confirm button[type=submit]').click();
   assert.equal((await post).status(),200);
   const pending=await s.state(),review=pending.cases.find(c=>c.id===pending.pendingId);
   assert.equal(review.savedId,final.id);
   await page.goto(s.f.url.origin+'/process/?system=quality&view=approval&approvalTab=quality');
   await ready(page,'approval');
   const panel=page.locator('#review-equipment');
   await panel.locator('[data-routine-review][data-version="'+pending.pendingId+'"]').first().waitFor({state:'attached'});
   assert.match(await panel.textContent(),/For review/);
   assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('Vietnamese equipment editor sees create, delete and submit restrictions and can save allowed edits',async()=>{
 const s=await setup(390,'vi',{actor:'writer',decorate(values){
   const users=JSON.parse(values.platformUsers),writer=users.find(user=>user.id==='writer');
   writer.accessOverrides['equipment.view']=true;
   writer.accessOverrides['equipment.edit']=true;
   values.platformUsers=JSON.stringify(users);
 }});try{
   const {page}=s;
   assert.match(await page.locator('.routine-permission-note').innerText(),/Thêm.*Xóa.*Gửi duyệt/);
   assert(await page.locator('[data-node-add="category"]').isDisabled());
   assert(await page.locator('[data-node-delete="category"]').first().isDisabled());
   assert.equal(await page.locator('#routine-submit').count(),0);
   await edit(page,'ghi chú mới');await page.locator('#routine-form-apply').click();await page.locator('#routine-save').click();
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save').disabled);
   assert.equal((await s.state()).saved.content.equipment[0].notes,'ghi chú mới');
 }finally{await s.close();}
});

void test('source issue disposition can be saved and reopened on a synthetic issue without deleting its source',async()=>{
 const s=await setup(1280,'zh',{decorate(values){
   const c=JSON.parse(values.routineEquipmentControl);
   const issues=[{id:'source-issue-0',sourceRow:500,type:'synthetic',assetCode:'SYN',status:'pending',detail:'synthetic source',resolution:''}];
   c.issues=issues;c.workflow.working.issues=issues;
   for(const v of c.versions)v.issues=issues;
   values.routineEquipmentControl=JSON.stringify(c);
 }});
 try{
   const page=s.page;
   await page.locator('.routine-issues-card > summary').click();
   await page.locator('[data-issue-result="0"]').fill('Synthetic inspection complete');
   await page.locator('[data-issue-resolve="0"]').click();
   await page.locator('#routine-save').click();
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save')?.disabled);
   let issue=(await s.state()).saved.content.issues[0];
   assert.equal(issue.status,'resolved');assert.equal(issue.resolution,'Synthetic inspection complete');
   await page.reload();await ready(page,'data');await page.locator('#routine-save').waitFor();
   await page.locator('.routine-issues-card > summary').click();
   await page.locator('[data-issue-resolve="0"]').click();await page.locator('#routine-save').click();
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save')?.disabled);
   issue=(await s.state()).saved.content.issues[0];
   assert.equal(issue.status,'pending');assert.equal(issue.detail,'synthetic source');
 }finally{await s.close();}
});
