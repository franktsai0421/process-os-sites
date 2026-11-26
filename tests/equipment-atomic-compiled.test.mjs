import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/equipment-atomic-fixture.cjs');
async function setup(width,lang,{actor='frank',decorate,prepare,mobile=false}={}){
 const data=await fixture();let control;try{await prepare?.(data);control=await data.persisted();}finally{data.close();}
 const f=await createABCFixture({products:1,decorate(values){values.routineEquipmentControl=JSON.stringify(control);decorate?.(values);}}),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:mobile?(width===320?568:844):900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
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
   await page.locator('#routine-add-asset-code').fill('SYN-CRUD');await page.locator('#routine-add-piece-mark-input').fill('01');
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

async function prepareHierarchy(data) {
 const entries = [
   ['categories',{id:'cat2',name:'Second category'}],
   ['subcategories',{id:'sub2',categoryId:'cat',name:'Second subcategory'}],
   ['subcategories',{id:'sub3',categoryId:'cat2',name:'Third subcategory'}],
   ...[['group2','cat','sub'],['group3','cat','sub2'],['group4','cat2','sub3']].map(([id,categoryId,subcategoryId])=>
     ['groups',{id,categoryId,subcategoryId,name:['group2','group4'].includes(id)?'Identical group':id}]),
 ];
 await data.command('routine-equipment','apply',{patches:entries.map(([key,value])=>({op:'insert',path:[key],value}))});
}

for(const [width,lang] of [[390,'zh'],[320,'vi']])void test('manual Add preserves a typed piece and rejects occupied pairs '+lang,async()=>{
 const s=await setup(width,lang,{mobile:true}),{page}=s;
 try {
   const current=await s.state(), original=current.working.equipment.find(row=>row.id==='source');
   for(const [kind,id] of [['category','cat'],['subcategory','sub'],['group','group']])
     await page.locator('[data-node-select="'+kind+'"][data-id="'+id+'"]').click();
   const asset=page.locator('#routine-add-asset-code'),mark=page.locator('#routine-add-piece-mark-input'),name=page.locator('#routine-add-name');
   await page.locator('#routine-add').click();
   assert(await mark.isEditable());assert.equal(await mark.inputValue(),'');
   await mark.fill('01');await asset.fill(original.assetCode);assert.equal(await mark.inputValue(),'01');
   await name.fill('Synthetic manual piece');
   await page.locator('#routine-add-submit').click();
   assert(await mark.isEditable());assert.equal(await name.inputValue(),'Synthetic manual piece');
   assert.match(await page.locator('#routine-add-modal').innerText(),lang==='zh'?/相同分件號/:/cùng ký hiệu/);
   assert.deepEqual(s.posts,[]);assert.deepEqual((await s.state()).working,current.working);
   async function saveNew(assetValue,piece){
     await mark.fill(piece);await asset.fill(assetValue);assert.equal(await mark.inputValue(),piece);
     await name.fill('Synthetic manual piece');await page.locator('#routine-add-submit').click();
     await page.locator('#routine-add-modal').waitFor({state:'detached'});
     const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/routine-equipment/workflow'));
     await page.locator('#routine-save').click();assert.equal((await response).status(),200);
     await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save')?.disabled);
   }
   await saveNew(original.assetCode,' 07 ');
   await page.locator('#routine-add').click();await saveNew('SYN-OTHER','01');
   await page.reload();await ready(page,'data');await page.locator('#routine-save').waitFor();
   const flow=await s.state(),rows=flow.saved.content.equipment;
   const added=rows.find(row=>row.assetCode===original.assetCode&&row.pieceMark==='07');
   assert(added&&added.id!==original.id);assert.deepEqual(rows.find(row=>row.id===original.id),original);
   assert(rows.some(row=>row.assetCode==='SYN-OTHER'&&row.pieceMark==='01'));
   const code=await page.evaluate(async({generation,revision,assetCode})=>{
     const row={id:crypto.randomUUID(),assetCode,pieceMark:' 01 ',groupId:'group',name:'Synthetic conflicting client',unit:'支',enabled:true,confirmed:true,calibrationMethod:'none'};
     const res=await fetch('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':'frank'},
       body:JSON.stringify({command:{action:'apply',generation,expectedRevision:revision,operationId:crypto.randomUUID(),clientId:'synthetic-duplicate',sequence:1,patches:[{op:'insert',path:['equipment'],value:row}]}})});
     return [res.status,(await res.json()).error];
   },{generation:flow.generation,revision:flow.revision,assetCode:original.assetCode});
   assert.deepEqual(code,[422,'EQUIPMENT_PAIR_DUPLICATE']);assert.deepEqual((await s.state()).working,flow.working);
 }finally{await s.close();}
});

void test('mobile Apply stays above the scrollable equipment form and performs no server write',async()=>{
 for (const [width,lang] of [[320,'vi'],[390,'zh']]) {
   const s=await setup(width,lang,{mobile:true}),{page}=s;
   try {
     await edit(page,'synthetic mobile edit');
     const apply=page.locator('#routine-form-apply');
     assert.equal(await apply.innerText(),lang==='zh'?'套用':'Áp dụng');
     await page.setViewportSize({width,height:width===320?328:604});
     await page.waitForFunction(()=>{
       const viewport=window.visualViewport,button=document.querySelector('#routine-form-apply'),rect=button.getBoundingClientRect();
       const scroll=document.querySelector('.routine-editor-scroll').getBoundingClientRect();
       return rect.height>=44 && rect.bottom<=viewport.offsetTop+viewport.height+1 &&
         scroll.height>=88 && scroll.bottom<=rect.top && button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
     });
     await apply.tap();
     await apply.waitFor({state:'detached'});
     assert.deepEqual(s.posts,[]);
   }finally{await s.close();}
 }
});

async function chooseDestination(page,id) {
 const [cat,sub]={group2:['cat','sub'],group3:['cat','sub2'],group4:['cat2','sub3']}[id];
 const category=page.locator('#routine-edit-category'),subcategory=page.locator('#routine-edit-subcategory'),group=page.locator('#routine-edit-group');
 if(await category.inputValue()!==cat){
   await category.selectOption(cat);
   assert.equal(await subcategory.inputValue(),'');assert.equal(await group.inputValue(),'');
   assert(await page.locator('#routine-form-apply').isDisabled());
 }
 if(await subcategory.inputValue()!==sub){
   await subcategory.selectOption(sub);
   assert.equal(await group.inputValue(),'');assert(await page.locator('#routine-form-apply').isDisabled());
 }
 await group.selectOption(id);
 assert(await page.locator('#routine-form-apply').isEnabled());
}

for(const lang of ['zh','vi'])void test('equipment hierarchy round trip '+lang,async()=>{
 const s=await setup(lang==='zh'?320:390,lang,{prepare:prepareHierarchy}),{page}=s;
 const source=content=>content.equipment.find(e=>e.id==='source');
 const sibling=content=>content.equipment.find(e=>e.id==='target');
 const begin=(id,kind)=>page.locator('[data-node-select="'+kind+'"][data-id="'+id+'"]').click();
 const editItem=async item=>{
   await begin(item.categoryId,'category');await begin(item.subcategoryId,'subcategory');await begin(item.groupId,'group');
   await page.locator('[data-equipment-edit="source"]').click();
 };
 try{
   const initial=(await s.state()).working;
   for(const [cat,sub,group] of [['cat','sub','group2'],['cat','sub2','group3'],['cat2','sub3','group4']]){
     const before=source((await s.state()).working);
     await editItem(before);
     assert(await page.locator('[data-field="assetCode"]').isEnabled());
     assert(await page.locator('[data-field="pieceMark"]').isEnabled());
     await chooseDestination(page,group);
     assert.match(await page.locator('#routine-destination-preview').innerText(),new RegExp(group));
     assert.deepEqual(source((await s.state()).working),before);
     await page.locator('#routine-form-apply').click();
     await page.locator('#routine-editor').waitFor({state:'detached'});
     assert(await page.locator('.routine-equipment-card.active [data-equipment-edit="source"]').isVisible());
     assert.equal(await page.locator('[data-node-select="group"][aria-pressed="true"]').getAttribute('data-id'),group);
     const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow');
     await page.locator('#routine-save').click();
     assert.equal((await response).status(),200);
     await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save').disabled);
     await page.reload();await ready(page,'data');await page.locator('#routine-save').waitFor();
     const saved=(await s.state()).saved.content,item=source(saved);
     assert.deepEqual([item.categoryId,item.subcategoryId,item.groupId],[cat,sub,group]);
     assert.deepEqual([item.assetCode,item.pieceMark,item.enabled,item.confirmed],[before.assetCode,before.pieceMark,before.enabled,before.confirmed]);
     assert.deepEqual(sibling(saved),sibling(initial));
   }
   const savedId=(await s.state()).saved.id;
   await page.locator('#routine-submit').click();
   await page.locator('dialog.vd-confirm textarea').fill('Review synthetic hierarchy');
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow');
   await page.locator('dialog.vd-confirm button[type=submit]').click();assert.equal((await response).status(),200);
   const flow=await s.state();assert.equal(flow.cases.find(c=>c.id===flow.pendingId).savedId,savedId);
   assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('cancel cascaded changes without discarding other input during selection',async()=>{
 for(const [lang,width] of [['zh',320],['vi',390]]){
   const s=await setup(width,lang,{prepare:prepareHierarchy}),{page}=s;
   try{
     const initial=(await s.state()).working;
     await edit(page,'keep my local input');
     await chooseDestination(page,'group4');
     assert.match(await page.locator('#routine-destination-preview').innerText(),/Second category › Third subcategory › Identical group/);
     await page.locator('#routine-edit-category').dispatchEvent('change');
     assert.equal(await page.locator('#routine-edit-group').inputValue(),'group4');
     assert.equal(await page.locator('#routine-editor [data-field="notes"]').inputValue(),'keep my local input');
     assert.deepEqual((await s.state()).working,initial);
     await page.locator('#routine-form-cancel').click();
     await page.locator('#routine-editor').waitFor({state:'detached'});
     await page.locator('[data-equipment-edit="source"]').click();
     assert(await page.locator('#routine-destination-preview').isHidden());
     assert.equal(await page.locator('#routine-editor [data-field="notes"]').inputValue(),initial.equipment.find(e=>e.id==='source').notes||'');
     assert.deepEqual(s.posts,[]);
   }finally{await s.close();}
 }
});

void test('inline selectors distinguish identical group names and exclude reconstructed destinations',async()=>{
 for(const [lang,width] of [['zh',1280],['vi',320]]){
   const s=await setup(width,lang,{prepare:prepareHierarchy,decorate(values){
     values.routineEquipmentControl=JSON.stringify(JSON.parse(values.routineEquipmentControl,(key,value)=>{
       if(key!=='groups'||!Array.isArray(value))return value;
       const group=value.find(row=>row.id==='group4');
       if(!group)return value;
       return [...value,{...group,id:'SYN-TG029',name:'Identical group'},
         {...group,id:'SYN-TEXT',categoryId:'missing',subcategoryId:'missing',categoryCode:'C02',category:'Second category',subcategory:'Third subcategory'},
         {...group,id:'SYN-ORPHAN',categoryId:'cat',subcategoryId:'sub3'}];
     }));
   }}),{page}=s;
   try{
     await edit(page,'keep after direct selection');
     const picker=page.locator('#routine-editor #routine-classification-choices');
     assert.equal(await picker.locator('input,details,dialog').count(),0);
     assert.equal(await picker.locator('select').count(),3);
     await page.selectOption('#routine-edit-category','cat2');
     await page.selectOption('#routine-edit-subcategory','sub3');
     const options=page.locator('#routine-edit-group option');
     assert.deepEqual(await options.evaluateAll(rows=>rows.map(row=>row.value)),['','group4','SYN-TG029']);
     assert.deepEqual((await options.allTextContents()).slice(1),['group4 · Identical group','SYN-TG029 · Identical group']);
     await page.selectOption('#routine-edit-group','SYN-TG029');
     assert.match(await page.locator('#routine-destination-preview').innerText(),/SYN-TG029/);
     assert.equal(await page.locator('#routine-editor [data-field="notes"]').inputValue(),'keep after direct selection');
     assert.deepEqual(s.posts,[]);
   }finally{await s.close();}
 }
});

void test('removed destination and concurrent identity edits never overwrite the current equipment',async()=>{
 const s=await setup(320,'zh',{prepare:prepareHierarchy}),{page}=s;
 try{
   await edit(page,'keep note when destination is removed');
   await chooseDestination(page,'group2');
   const initial=await s.state();
   const send=(command)=>page.evaluate(async command=>{
     const res=await fetch('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',
       headers:{'Content-Type':'application/json','X-Process-Expected-Actor':'frank'},body:JSON.stringify({command})});
     const body=await res.json();return [res.status,body.error];
   },command);
   const base={action:'apply',generation:initial.generation,expectedRevision:initial.revision,
     operationId:crypto.randomUUID(),clientId:'synthetic-other-tab',sequence:1};
   const groupPath=['groups',{id:'group2'}];
   const markPath=['equipment',{id:'source'},'pieceMark'];
   const assetPath=['equipment',{id:'source'},'assetCode'];
   const source=initial.working.equipment.find(row=>row.id==='source');
   const oldGroup=initial.working.groups.find(row=>row.id==='group2');
   assert.equal((await send({...base,patches:[{op:'remove',path:groupPath},{op:'set',path:markPath,value:'PEER'}],
     guards:[{path:groupPath,value:oldGroup},{path:markPath,value:source.pieceMark},{path:assetPath,value:source.assetCode}]}))[0],200);
   await page.locator('#routine-form-apply').click();await page.locator('#routine-editor').waitFor({state:'detached'});
   await page.locator('#routine-save').click();
   await page.waitForFunction(()=>document.querySelector('[data-equipment-save-choice]')||
     !document.querySelector('#routine-save')?.disabled);
   const cancel=page.locator('[data-equipment-save-choice="cancel"]');
   if(await cancel.count())await cancel.click();
   const fresh=await s.state(), row=fresh.working.equipment.find(r=>r.id==='source');
   assert.equal(row.groupId,source.groupId);assert.equal(row.pieceMark,'PEER');
   assert.deepEqual(fresh.saved,initial.saved);
   const stale=await send({...base,action:'save',moduleAction:'save-local-v1',expectedRevision:fresh.revision,
     clientId:'stale-identity',operationId:crypto.randomUUID(),patches:[{op:'set',path:assetPath,value:'SYN-NEW'}],
     guards:[{path:markPath,value:source.pieceMark},{path:assetPath,value:source.assetCode}]});
   assert.equal(stale[0],409);
   assert.equal((await s.state()).working.equipment.find(r=>r.id==='source').assetCode,source.assetCode);
 }finally{await s.close();}
});

function linkedPieces(values){
 const issues=[
   {id:'source-issue-0',sourceRow:12,assetCode:'SYN-SHARED',pieceMark:'02',status:'pending',type:'MARK',detail:'Synthetic source'},
   {id:'source-issue-1',assetCode:'SYN-SHARED',pieceMark:'02',status:'pending',type:'MARK',detail:'No source row'},
 ];
 values.routineEquipmentControl=JSON.stringify(JSON.parse(values.routineEquipmentControl,(key,value)=>{
   if(key==='issues'&&Array.isArray(value))return issues;
   if(key==='equipment'&&Array.isArray(value))return value.map(row=>({...row,assetCode:'SYN-SHARED',pieceMark:row.id==='target'?'01':'02',sourceRow:row.id==='target'?11:12}));
   return value;
 }));
 const fixture=require('../scripts/v3-quality-growth-fixture.cjs')('fqc',[{id:'synthetic',bytes:1}],0,1);
 values.qualityMasterControl=JSON.stringify(JSON.parse(fixture.values.qualityMasterControl,(key,value)=>
   key==='items'&&Array.isArray(value)?value.map(row=>({...row,equipmentId:'source',tool:'02',equipmentSnapshot:{id:'source',assetCode:'SYN-SHARED',pieceMark:'02',name:'Original synthetic name',spec:'',enabled:true}})):value));
}

for(const lang of ['zh','vi'])void test('linked equipment renumber and regroup '+lang,async()=>{
 const s=await setup(lang==='vi'?390:1280,lang,{prepare:prepareHierarchy,decorate:linkedPieces}),{page}=s;
 const mark=page.locator('#routine-editor [data-field="pieceMark"]'),asset=page.locator('#routine-editor [data-field="assetCode"]');
 const stored=async()=>{
   const row=await s.f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
   const value=await s.f.load('lib/state-records.ts').decodeRecordValues(await s.f.mf.getR2Bucket('STATE_ARCHIVE'),JSON.parse(row.values));
   return value.values;
 };
 const choices=()=>page.evaluate(async()=>(await (await fetch('/api/ipqc-ab?catalog=equipment')).json()).equipment);
 const tick=()=>page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/routine-equipment/workflow');
 try{
   const initial=await stored(),initialFlow=await s.state(),sibling=initialFlow.working.equipment.find(e=>e.id==='target');
   await edit(page,'preserve this piece');
   await mark.fill('01');await page.locator('#routine-form-apply').click();
   assert.match(await page.locator('#routine-identity-error').innerText(),lang==='zh'?/相同分件號/:/cùng ký hiệu/);
   assert.equal(s.posts.length,0);
   const rejected=await page.evaluate(async({generation,revision})=>{
     const path=key=>['equipment',{id:'source'},key];
     const response=await fetch('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',headers:{'Content-Type':'application/json','X-Process-Expected-Actor':'frank'},body:JSON.stringify({command:{action:'save',moduleAction:'save-local-v1',generation,expectedRevision:revision,operationId:crypto.randomUUID(),clientId:'synthetic-collision',sequence:1,patches:[{op:'set',path:path('pieceMark'),value:'01'}],guards:[{path:path('pieceMark'),value:'02'},{path:path('assetCode'),value:'SYN-SHARED'}]}})});
     return [response.status,(await response.json()).error];
   },{generation:initialFlow.generation,revision:initialFlow.revision});
   assert.deepEqual(rejected,[422,'EQUIPMENT_PAIR_DUPLICATE']);
   assert.deepEqual((await s.state()).working,initialFlow.working);
   await mark.fill('');await page.locator('#routine-form-apply').click();
   assert.match(await page.locator('#routine-identity-error').innerText(),lang==='zh'?/請填寫分件號/:/nhập ký hiệu/);
   await mark.fill('07');await asset.fill('SYN-RENAMED');
   await chooseDestination(page,'group2');
   await page.locator('#routine-form-apply').click();await page.locator('#routine-editor').waitFor({state:'detached'});
   let response=tick();await page.locator('#routine-save').click();assert.equal((await response).status(),200);
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#routine-save').disabled);
   await page.reload();await ready(page,'data');await page.locator('#routine-save').waitFor();
   const saved=(await s.state()).saved,item=saved.content.equipment.find(x=>x.id==='source');
   assert.equal(item.notes,'preserve this piece');
   assert.deepEqual([item.assetCode,item.pieceMark,item.groupId,item.sourceRow],['SYN-RENAMED','07','group2',12]);
   assert.deepEqual(saved.content.issues,initialFlow.working.issues);
   assert.deepEqual(saved.content.equipment.find(x=>x.id==='target'),sibling);
   await page.locator('.routine-issues-card > summary').click();
   await page.locator('[data-jump-issue="0"]').click();await page.locator('#routine-editor').waitFor();
   assert.match(await page.locator('#routine-editor .routine-source').first().innerText(),/ID：source/);
   assert.equal(await asset.inputValue(),'SYN-RENAMED');assert.equal(await mark.inputValue(),'07');
   await page.locator('#routine-form-cancel').click();
   await page.locator('.routine-issues-card > summary').click();
   const alert=page.waitForEvent('dialog');await page.locator('[data-jump-issue="1"]').click();
   assert.match((await alert).message(),lang==='zh'?/無法.*唯一辨識/:/Không thể xác định duy nhất/);
   assert.equal(await page.locator('#routine-editor').count(),0);
   assert.equal((await choices()).find(x=>x.id==='source').pieceMark,'02');
   await page.locator('#routine-submit').click();await page.locator('dialog.vd-confirm textarea').fill('Verify synthetic relabel');
   response=tick();await page.locator('dialog.vd-confirm button[type=submit]').click();assert.equal((await response).status(),200);
   const pending=await s.state();assert.equal(pending.cases.find(c=>c.id===pending.pendingId).savedId,saved.id);
   await page.goto(s.f.url.origin+'/process/?system=quality&view=approval&approvalTab=quality');
   await ready(page,'approval');
   const panel=page.locator('#review-equipment');
   await panel.locator('[data-routine-review="approve"]').waitFor({state:'attached'});
   const summary=panel.locator('xpath=ancestor::details[not(@open)]/summary');
   if(await summary.count())await summary.first().click();
   await panel.locator('[data-routine-review="approve"]').click();
   const confirm=page.locator('dialog.vd-confirm');
   if(await confirm.locator('input[type=checkbox]').count())await confirm.locator('input[type=checkbox]').check();
   response=tick();await confirm.locator('button[type=submit]').click();assert.equal((await response).status(),200);
   const latest=await choices(),current=latest.find(x=>x.id==='source');
   assert.deepEqual([current.assetCode,current.pieceMark,current.groupId],['SYN-RENAMED','07','group2']);
   assert.equal(latest.find(x=>x.id==='target').pieceMark,'01');
   const final=await stored();
   assert.equal(final.qualityMasterControl,initial.qualityMasterControl);
   const old=JSON.parse(initial.routineEquipmentControl),after=JSON.parse(final.routineEquipmentControl);
   assert.deepEqual(after.versions.find(v=>v.id===old.activeVersionId).equipment,old.versions.find(v=>v.id===old.activeVersionId).equipment);
   assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('equipment identities preserve legacy duplicates and missing marks on unrelated edits',async()=>{
 const data=await fixture();
 try{
   await prepareHierarchy(data);
   const c=await data.persisted(),v=c.versions.find(x=>x.status==='draft');
   const {checkedSnapshot}=data.load('lib/routine-equipment.ts');
   const original=structuredClone(c.workflow.working);
   const [first,second]=original.equipment;
   second.assetCode=first.assetCode;second.pieceMark=first.pieceMark;
   original.equipment.push({...first,id:'legacy-unmarked',pieceMark:'',sourceRow:7});
   const check=next=>checkedSnapshot({...v,...original},next,true,true);
   let next=structuredClone(original);
   next.equipment[0].notes='Edited legacy note';
   assert.equal(check(next).equipment[0].notes,'Edited legacy note');
   next.equipment[1].pieceMark='other';
   assert.equal(check(next).equipment[1].pieceMark,'other');
   const missing=next.equipment[2];
   missing.pieceMark=' OTHER ';
   assert.throws(()=>check(next),/EQUIPMENT_PAIR_DUPLICATE/);
   missing.pieceMark='03';
   assert.equal(check(next).equipment[2].pieceMark,'03');
   next=structuredClone(original);
   const group=next.groups.find(g=>g.id==='group');
   group.categoryId='cat2';group.subcategoryId='sub3';
   const moved=check(next);
   assert(moved.equipment.every(e=>e.categoryId==='cat2'&&e.subcategoryId==='sub3'&&e.groupId==='group'));
   assert.deepEqual(structuredClone(moved.equipment.map(e=>[e.id,e.assetCode,e.pieceMark])),original.equipment.map(e=>[e.id,e.assetCode,e.pieceMark]));
   group.subcategoryId='sub2';assert.throws(()=>check(next),/所屬分類無效/);
 }finally{data.close();}
});
