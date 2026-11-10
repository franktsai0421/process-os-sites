import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setup,posts,read} from './fqc-unknown-browser-fixture.mjs';

async function editError(s,name){
 await s.page.locator('[data-edit-error="error"]').click();
 await s.page.locator('.fqc-modal-form [name="name"]').fill(name);
 await s.page.locator('.fqc-modal-form [type="submit"]').click();
 await s.page.waitForFunction(()=>!document.querySelector('.fqc-modal-form'));
}
async function save(s){
 await s.page.locator('#fqc-save').click();
 // Compare reads precede transport queueing; wait for the UI operation too.
 await s.page.waitForFunction(()=>document.querySelector('#fqc-save')&&document.querySelector('#fqc-save').textContent!=='儲存中…'&&document.querySelector('#fqc-save').textContent!=='Đang lưu…'&&!window.sharedDraftAccountState().queued);
}
for(const [width,lang] of [[390,'zh'],[1280,'vi']])void test(`FQC local form and filtered matrix save once ${width}px ${lang}`,async t=>{
 const s=await setup(width,lang);try{
  s.page.setDefaultTimeout(10000);
  const before=posts(s.f).length;
  await editError(s,'Local only');
  assert.equal(posts(s.f).length,before);
  assert.equal((await s.f.state()).workflow.working.errors[0].name,'Synthetic error');
  await s.page.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));
  await s.page.waitForFunction(()=>window.FQCMasterUI.control.libraries.fqc.versions.find(row=>row.status==='draft').snapshot.errors[0].name==='Local only');
  const cell='[data-matrix-item="item"][data-matrix-product="SYN-P"]';
  await s.page.locator(cell).click();
  await s.page.locator('#fqc-search').fill('no matching row');
  await s.page.locator('#fqc-search').fill('');
  assert.equal(await s.page.locator(cell).getAttribute('aria-pressed'),'true');
  assert.equal(posts(s.f).length,before);
  await save(s);
  const sent=posts(s.f).slice(before);assert.equal(sent.length,1);
  const command=JSON.parse(sent[0].body).command;
  assert.equal(command.action,'save');assert.equal(command.moduleAction,'save-local-v1');assert.equal(sent[0].status,200,JSON.stringify(sent[0].result));
  const flow=(await s.f.state()).workflow;
  assert.equal(flow.working.errors[0].name,'Local only');assert.deepEqual(flow.working.items[0].productCodes,['SYN-P']);assert.deepEqual(flow.saved.content,flow.working);
  assert.deepEqual(s.errors,[]);
  const screenshot=join(tmpdir(),`fqc-single-save-${width}-${lang}.png`);await s.page.screenshot({path:screenshot,fullPage:true});
  t.diagnostic(JSON.stringify({viewport:width,lang,editingPOSTs:0,savePOSTs:1,screenshot}));
 }finally{await s.close();}
});

void test('local save preserves another editor field and disjoint matrix cell',async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);
  await s.f.mutate(values=>{const master=JSON.parse(values.masterDataControl);master.active.AB.products.push({...master.active.AB.products[0],code:'SYN-Q',name:'Synthetic second product'});master.versions[0].snapshot=structuredClone(master.active.AB);values.masterDataControl=JSON.stringify(master);});
  await s.page.evaluate(async()=>{window.FQCMasterUI.navigation.reset();await window.FQCMasterUI.bind(document.querySelector('#data-content'));});
  await editError(s,'My local name');
  await s.page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();
  const other=s.f.realm('other');await other.client.read();
  const generation=(await s.f.state()).workflow.generation;
  await other.client.command(generation,'apply',{patches:[{op:'set',path:['items',{id:'item'},'description'],value:'Other editor description'}],guards:[{path:['items',{id:'item'},'description'],value:'Synthetic description'}]});
  await other.client.command(generation,'save',{moduleAction:'save-local-v1',patches:[],guards:[],input:{matrixCells:[{itemId:'item',productCode:'SYN-Q',base:false,value:true}]}});
  await save(s);
  const flow=(await s.f.state()).workflow;
  assert.equal(flow.working.items[0].description,'Other editor description');assert.equal(flow.working.errors[0].name,'My local name');assert.deepEqual([...flow.working.items[0].productCodes].sort((a,b)=>a.localeCompare(b)),['SYN-P','SYN-Q']);assert.deepEqual(flow.saved.content,flow.working);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('unknown Save retains original receipt identity and recovery never re-POSTs',async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);await router(s.page);await editError(s,'Committed but response lost');
  let lose=true,receiptsDown=true,attempts=0;
  await s.page.route('**/api/fqc/workflow?*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(receiptsDown&&url.searchParams.has('operationId'))return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});
   if(request.method()==='POST'&&JSON.parse(request.postData()||'{}').command?.action==='save'){
    attempts++;if(lose){lose=false;await s.f.call(url.pathname+url.search,{method:'POST',body:request.postData()});return route.abort('failed');}
   }
   return route.fallback();
  });
  await save(s);await s.page.waitForFunction(()=>window.sharedDraftAccountState().unknown);
  const marker=await s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft'))));assert(Object.keys(marker).length>0);
  await s.page.evaluate(()=>document.querySelector('#fqc-save').click());await s.settled();assert.equal(attempts,1);
  await s.page.locator('#fqc-check-result').click();await s.page.waitForFunction(()=>!document.querySelector('#fqc-check-result')?.disabled);assert.equal(await s.page.evaluate(()=>window.sharedDraftAccountState().unknown),true);assert.equal(attempts,1);
  assert.deepEqual(await s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),marker);
  await s.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await s.page.waitForFunction(()=>window.state.view==='dashboard');assert.equal(await s.page.locator('#process-navigation-departure').count(),0);
  assert.deepEqual(await s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),marker);assert.equal(attempts,1);
  await s.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await s.page.locator('#fqc-check-result').waitFor();
  await s.page.reload();await s.boot();await s.page.locator('#fqc-check-result').waitFor();assert.deepEqual(await s.page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),marker);assert.equal(attempts,1);
  receiptsDown=false;await s.page.waitForFunction(()=>!document.querySelector('#fqc-check-result')?.disabled);await s.recover();assert.equal(attempts,1);
  assert.equal((await s.f.state()).workflow.saved.content.errors[0].name,'Committed but response lost');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('image and newly selected equipment stay local, then Save, submit and withdraw preserve snapshot',async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);const before=posts(s.f).length;
  await s.f.mutate(values=>{const equipment=JSON.parse(values.routineEquipmentControl);equipment.versions[0].equipment.push({id:'new-equipment',assetCode:'SYN-EQ',pieceMark:'SYN-M2',name:'Synthetic gauge',enabled:true});values.routineEquipmentControl=JSON.stringify(equipment);});
  await s.page.route('**/photo-policy.mjs?*',route=>route.fulfill({contentType:'application/javascript',body:read('photo-policy.mjs')}));
  await s.page.locator('[data-edit-item="item"]').click();
  await s.page.locator('[name="toolType"][value="equipment"]').check();await s.page.locator('#fqc-pick-eq-trigger').click();await s.page.locator('[data-select-eq="new-equipment"]').click();
  await s.page.locator('#fqc-file-input').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(await s.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);return canvas.toDataURL().split(',')[1];}),'base64')});
  await s.page.locator('.fqc-photo-card').waitFor();
  await s.page.locator('.fqc-modal-form [type="submit"]').click();await s.page.waitForFunction(()=>!document.querySelector('.fqc-modal-form'));
  assert.equal(posts(s.f).length,before);assert.equal((await s.f.state()).workflow.working.items[0].mediaItems.length,0);
  await save(s);let flow=(await s.f.state()).workflow;assert.equal(flow.saved.content.items[0].mediaItems.length,1);assert.equal(flow.saved.content.items[0].equipmentId,'new-equipment');assert.equal(flow.saved.content.items[0].equipmentSnapshot.pieceMark,'SYN-M2');const savedId=flow.saved.id;
  s.page.removeAllListeners('dialog');s.page.on('dialog',dialog=>{assert.equal(dialog.type(),'alert');assert.equal(dialog.message(),'目前沒有其他已啟用的審核人，仍可送審。具審核權限者可經確認後自審。');void dialog.accept();});
  await s.page.locator('#fqc-submit').click();await s.page.locator('dialog.vd-confirm textarea').fill('Synthetic image review');await s.page.locator('dialog.vd-confirm [type="submit"]').click();await s.settled();
  flow=(await s.f.state()).workflow;assert(flow.pendingId);assert.equal(flow.saved.id,savedId);
  await s.page.locator('#fqc-withdraw').click();await s.page.locator('dialog.vd-confirm textarea').fill('Synthetic withdrawal');await s.page.locator('dialog.vd-confirm [type="submit"]').click();await s.settled();
  flow=(await s.f.state()).workflow;assert.equal(flow.pendingId,null);assert.equal(flow.saved.id,savedId);assert.equal(flow.saved.content.items[0].mediaItems.length,1);
  assert.deepEqual(posts(s.f).slice(before).map(row=>JSON.parse(row.body).command.action),['save','submit','withdraw']);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

async function router(page){
  for(const name of ['navigation-lifecycle.mjs','delivery-purpose.mjs'])await page.route('**/'+name+'*',route=>route.fulfill({contentType:'text/javascript',body:read(name)}));
  await page.evaluate(async()=>{
    window.ProcessDeliveryPurpose=await import('/process/delivery-purpose.mjs');
    let generation=1;
    const sync=window.ProcessSync;Object.assign(sync,{deliveryProjection:true,destination:{system:'quality',view:'data',dataTab:'quality-fqc'},pendingState:()=>({}),captureDelivery:()=>generation,isCurrentDelivery:value=>value===generation,prepareDestination:async target=>{if(window.failDestination)throw Error('SYNTHETIC_DESTINATION_DENIED');return {destination:target};},validateDestination(){},commitDestination(handle){sync.destination=handle.destination;generation++;}});
    const root=document.createElement('div');root.id='view-root';document.querySelector('#data-content').before(root);root.append(document.querySelector('#data-content'));
    window.navigate=view=>{window.state.view=view;const area=document.querySelector('#view-root');if(view==='data'){area.innerHTML='<main id="data-content" data-active-tab="quality-fqc"></main>';window.mountFqc=window.FQCMasterUI.bind(area.firstChild);}else area.textContent='Synthetic destination';};window.render=()=>{};
    window.ProcessDataTabs={readyForDestination:()=>window.mountFqc};window.ProcessRuntimeProjection={canLeave:()=>true,install(){}};window.MasterDataWorkflow={canLeave:()=>true,resetProjection(){}};
  });
  await page.addScriptTag({content:read('delivery-navigation.js')});await page.evaluate(()=>window.ProcessDeliveryNavigation.initialized);
}

void test('completed local edits and matrix leave silently without writing or restoration',async()=>{
 const s=await setup(390,'zh');try{
  s.page.setDefaultTimeout(10000);await router(s.page);const before=posts(s.f).length;
  await editError(s,'Drop on leave');await s.page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();
  await s.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await s.page.waitForFunction(()=>window.state.view==='dashboard');
  assert.equal(await s.page.locator('#process-navigation-departure').count(),0);assert.equal(posts(s.f).length,before);
  await s.page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await s.page.locator('#fqc-save').waitFor();
  await s.page.locator('[data-edit-error="error"]').click();assert.equal(await s.page.locator('.fqc-modal-form [name="name"]').inputValue(),'Synthetic error');assert.equal(posts(s.f).length,before);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

for(const choice of ['mine','theirs'])void test(`true field conflict cancels without writes then ${choice} continues the same Save with unrelated edits`,async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);await editError(s,'My desired name');
  const other=s.f.realm('other');await other.client.read();const generation=(await s.f.state()).workflow.generation;
  await other.client.command(generation,'apply',{patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Other name'},{op:'set',path:['items',{id:'item'},'description'],value:'Other description'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'},{path:['items',{id:'item'},'description'],value:'Synthetic description'}]});
  const before=posts(s.f).length;
  await s.page.locator('#fqc-save').click();await s.page.locator('[data-fqc-save-choice="cancel"]').waitFor();
  assert.equal(await s.page.evaluate(()=>window.sharedDraftAccountState().unknown),false);assert.equal(posts(s.f).length,before);
  await s.page.locator('[data-fqc-save-choice="cancel"]').click();
  await s.page.waitForFunction(()=>document.querySelector('#fqc-save')&&document.querySelector('#fqc-save').textContent!=='儲存中…'&&document.querySelector('#fqc-save').textContent!=='Đang lưu…');
  assert.equal((await s.f.state()).workflow.working.errors[0].name,'Other name');assert.equal(posts(s.f).length,before);
  assert.equal(await s.page.evaluate(()=>window.FQCMasterUI.control.libraries.fqc.versions.find(row=>row.status==='draft').snapshot.errors[0].name),'My desired name');
  await s.page.locator('#fqc-save').click();await s.page.locator(`[data-fqc-save-choice="${choice}"]`).click();
  await s.page.waitForFunction(()=>document.querySelector('#fqc-save')&&document.querySelector('#fqc-save').textContent!=='儲存中…'&&document.querySelector('#fqc-save').textContent!=='Đang lưu…'&&!window.sharedDraftAccountState().queued);
  const flow=(await s.f.state()).workflow;assert.equal(flow.saved.content.errors[0].name,choice==='mine'?'My desired name':'Other name');assert.equal(flow.saved.content.items[0].description,'Other description');assert.equal(posts(s.f).length,before+1);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('failed navigation destination does not send or mutate shared content',async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);await router(s.page);await editError(s,'Unsent local name');const before=posts(s.f).length;
  await s.page.evaluate(()=>{window.failDestination=true;window.navigationAttempt=window.ProcessDeliveryNavigation.navigate('dashboard');});
  await s.page.waitForFunction(()=>!document.querySelector('#process-navigation-departure'));
  assert.equal(await s.page.evaluate(()=>window.state.view),'data');assert.equal(posts(s.f).length,before);assert.equal((await s.f.state()).workflow.working.errors[0].name,'Synthetic error');
  await s.page.evaluate(()=>{window.failDestination=false;window.ProcessDeliveryNavigation.navigate('dashboard');});await s.page.waitForFunction(()=>window.state.view==='dashboard');assert.equal(posts(s.f).length,before);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('deleting a locally selected matrix item saves deletion without obsolete cells',async()=>{
 const s=await setup();try{
  s.page.setDefaultTimeout(10000);const before=posts(s.f).length;
  await s.page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();
  s.page.removeAllListeners('dialog');s.page.on('dialog',dialog=>{assert.equal(dialog.type(),'confirm');void dialog.accept();});
  await s.page.locator('[data-delete-item="item"]').click();await s.page.waitForFunction(()=>!document.querySelector('[data-delete-item="item"]'));
  assert.equal(posts(s.f).length,before);await save(s);const sent=posts(s.f).slice(before);assert.equal(sent.length,1);assert.equal(sent[0].status,200,JSON.stringify(sent[0].result));assert.deepEqual(JSON.parse(sent[0].body).command.input.matrixCells,[]);assert.equal((await s.f.state()).workflow.saved.content.items[0].isDeleted,true);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('refresh started before local form completion cannot replace the completed edit',async()=>{
 const s=await setup();let release;try{
  s.page.setDefaultTimeout(10000);let markRead;const readStarted=new Promise(resolve=>markRead=resolve),hold=new Promise(resolve=>release=resolve);let intercept=true;
  await s.page.route('**/api/fqc/workflow?*',async route=>{
   const request=route.request(),url=new URL(request.url());if(!intercept||request.method()!=='GET'||url.searchParams.has('operationId'))return route.fallback();
   intercept=false;const response=await s.f.call(url.pathname+url.search);markRead();await hold;await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  await s.page.evaluate(()=>window.dispatchEvent(new Event('process-shared-state-updated')));await readStarted;
  await editError(s,'Local wins over old refresh');release();await s.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await s.page.evaluate(()=>window.FQCMasterUI.control.libraries.fqc.versions.find(row=>row.status==='draft').snapshot.errors[0].name),'Local wins over old refresh');
  await save(s);assert.equal((await s.f.state()).workflow.saved.content.errors[0].name,'Local wins over old refresh');assert.deepEqual(s.errors,[]);
 }finally{release?.();await s.close();}
});
