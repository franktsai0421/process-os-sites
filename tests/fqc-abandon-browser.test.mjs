import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setup,posts} from './fqc-unknown-browser-fixture.mjs';
import {nameEdit} from './fqc-required-dependencies-fixture.mjs';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
async function router(page){
  for(const name of ['navigation-lifecycle.mjs','delivery-purpose.mjs'])await page.route('**/'+name+'*',route=>route.fulfill({contentType:'text/javascript',body:source(name)}));
  await page.evaluate(async()=>{
    window.ProcessDeliveryPurpose=await import('/process/delivery-purpose.mjs');
    let generation=1;
    const sync=window.ProcessSync;Object.assign(sync,{deliveryProjection:true,destination:{system:'quality',view:'data',dataTab:'quality-fqc'},pendingState:()=>({}),captureDelivery:()=>generation,isCurrentDelivery:value=>value===generation,prepareDestination:async target=>{if(window.failDestination)throw Error('SYNTHETIC_DESTINATION_DENIED');return {destination:target};},validateDestination(){},commitDestination(handle){sync.destination=handle.destination;generation++;}});
    const root=document.createElement('div');root.id='view-root';document.querySelector('#data-content').before(root);root.append(document.querySelector('#data-content'));
    window.navigate=view=>{window.state.view=view;const area=document.querySelector('#view-root');if(view==='data'){area.innerHTML='<main id="data-content" data-active-tab="quality-fqc"></main>';window.mountFqc=window.FQCMasterUI.bind(area.firstChild);}else area.textContent='Synthetic destination';};window.render=()=>{};
    window.ProcessDataTabs={readyForDestination:()=>window.mountFqc};window.ProcessRuntimeProjection={canLeave:()=>true,install(){}};window.MasterDataWorkflow={canLeave:()=>true,resetProjection(){}};
  });
  await page.addScriptTag({content:source('delivery-navigation.js')});await page.evaluate(()=>window.ProcessDeliveryNavigation.initialized);
}
async function unknown(s,kind='error',commit=false){
  await s.page.locator(`[data-edit-${kind}="${kind}"]`).click();const form=s.page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Attempted input');s.lose({commit});await form.locator('[type="submit"]').click();await s.settled();await form.locator('[name="name"]').fill('Later 未送出 input');return form;
}
for(const width of [390,1280])for(const lang of ['zh','vi'])void test(`abandon unknown inputs, browse and return without restoring ${width}px ${lang}`,async()=>{
 const s=await setup(width,lang),{page,f}=s;try{
  page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(6000);await router(page);await unknown(s);const before=posts(f).length;
  const markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft'))));
  await page.evaluate(()=>{const set=Reflect.get(Storage.prototype,'setItem');Storage.prototype.setItem=function(key,value){if(key.startsWith('fqc-input'))throw Error('No input archives allowed');return set.call(this,key,value);};window.ProcessDeliveryNavigation.navigate('dashboard');});
  const button=page.locator('[data-departure-choice="abandon"]');await button.waitFor();assert(await button.isEnabled());assert((await button.boundingBox()).height>=44);
  assert(await page.locator('#process-navigation-departure').evaluate(node=>node.getBoundingClientRect().right<=innerWidth));
  await button.click();await page.waitForFunction(()=>window.state.view==='dashboard');
  assert.equal(await page.locator('.fqc-modal-form').count(),0);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),false);
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('quality-dashboard'));await page.waitForFunction(()=>window.state.view==='quality-dashboard');
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('#fqc-check-result').waitFor();
  assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(await page.locator('[data-fqc-checkpoint],.fqc-modal-form').count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('fqc-input')).length),0);
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('shared-draft')))),markers);
  assert.equal(posts(f).length,before);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('404 plus delayed commit, abandonment and later collaborator edit never replay or roll back',async()=>{
 const s=await setup(),{page,f}=s;let release;try{
  await router(page);const held=new Promise(resolve=>release=resolve);f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state'))await held;};
  await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Original late commit');s.lose({delayed:true});await form.locator('[type="submit"]').click();await s.settled();
  s.receiptsUp();await page.locator('[data-fqc-check-result]').click();await page.waitForFunction(()=>!document.querySelector('[data-fqc-check-result]').disabled);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));
  await form.locator('[name="name"]').fill('Discard this input');await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');
  release();assert.equal((await s.lateCommit()).status,200);f.hooks.run=null;
  const latest=await f.state();assert.equal(latest.workflow.working.errors[0].name,'Original late commit');const before=posts(f).length;
  const other=f.realm('other');await other.client.read();await other.client.command(latest.workflow.generation,'apply',nameEdit('Other actor latest','Original late commit'));
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('#fqc-check-result').waitFor();await s.recover();
  assert.equal((await f.state()).workflow.working.errors[0].name,'Other actor latest');assert.equal(posts(f).length,before+1);assert.equal(await page.locator('.fqc-modal-form,[data-fqc-checkpoint]').count(),0);assert.deepEqual(s.errors,[]);
 }finally{release?.();await s.close();}
});
void test('failed target preparation keeps input; explicit retry drops it only on commit',async()=>{
 const s=await setup(),{page,f}=s;try{await router(page);await unknown(s);const before=posts(f).length;
  await page.evaluate(()=>{window.failDestination=true;window.ProcessDeliveryNavigation.navigate('dashboard');});await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>!document.querySelector('#process-navigation-departure'));
  assert.equal(await page.evaluate(()=>window.state.view),'data');assert.equal(await page.locator('.fqc-modal-form [name="name"]').inputValue(),'Later 未送出 input');assert.equal(await page.locator('.fqc-modal-overlay').evaluate(node=>node.inert),false);assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));
  await page.evaluate(()=>{window.failDestination=false;window.ProcessDeliveryNavigation.navigate('dashboard');});await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');assert.equal(posts(f).length,before);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('abandoned unknown survives real reload without inputs or navigation capability',async()=>{
 const s=await setup(),{page,f}=s;try{await router(page);await unknown(s);const before=posts(f).length;
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');
  page.removeAllListeners('dialog');page.on('dialog',dialog=>void dialog.accept());await page.reload();await s.boot();
  assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));assert.equal(await page.locator('.fqc-modal-form,[data-fqc-checkpoint]').count(),0);assert.equal(posts(f).length,before);
 }finally{await s.close();}
});
for(const fault of ['foreign','actor','marker'])void test(`departure evidence ${fault} cannot release a different unknown`,async()=>{
 const s=await setup(),{page}=s;try{await router(page);await unknown(s);
  if(fault==='foreign'){await page.route('**/workflow?foreign=1',route=>route.abort());await page.evaluate(async()=>{const client=window.createSharedDraftClient({actorId:'editor',endpoint:'/api/fqc/workflow?foreign=1'});try{await client.command(window.FQCMasterUI.control.libraries.fqc.workflow.generation,'apply',{changes:[]});}catch{}});await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));assert(await page.locator('[data-departure-choice="abandon"]').isDisabled()||await page.locator('[data-departure-choice="abandon"]').isHidden());}
  else{await page.evaluate(async()=>{window.departureLease=await window.FQCMasterUI.navigation.departure.abandon();});assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),false);await page.evaluate(fault=>{if(fault==='actor')window.ProcessSync.identity={id:'editor'};else{const key=Object.keys(sessionStorage).find(key=>key.startsWith('shared-draft'));sessionStorage.setItem(key,sessionStorage.getItem(key)+' ');}},fault);assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));await page.evaluate(()=>window.departureLease.release());}
  assert.equal(await page.locator('.fqc-modal-form').count(),1);
 }finally{await s.close();}
});
void test('unknown matrix departure preserves receipt-only recovery and never restores inputs',async()=>{
 const s=await setup(),{page,f}=s;try{await router(page);await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();s.lose({commit:false});await page.locator('#fqc-matrix-apply').click();await s.settled();const before=posts(f).length;
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');
  await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('#fqc-check-result').waitFor();assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(posts(f).length,before);assert.equal(await page.locator('.matrix-local-change').count(),0);assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

void test('form unknown abandonment deletes only its other unsent matrix payload, never receipt evidence',async()=>{
const s=await setup(),{page}=s;
try {
  page.setDefaultTimeout(6000);
  await router(page);
  await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();
  await page.waitForFunction(()=>Object.values(localStorage).some(v=>v.includes('completeMatrix')));
  const original=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k,v])=>v.includes('completeMatrix'))));
  assert.equal(Object.keys(original).length,1);
  assert.equal(JSON.parse(Object.values(original)[0]).kind,'local');
  await page.locator('[data-edit-error="error"]').click();
  await page.locator('.fqc-modal-form [name="name"]').fill('Unknown form change');
  s.lose({commit:true});
  await page.locator('.fqc-modal-form [type="submit"]').click();
  await s.settled();
  const markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft'))));
  const count=posts(s.f).length;
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));
  await page.locator('[data-departure-choice="abandon"]').click();
  await page.waitForFunction(()=>window.state.view==='dashboard');
  const retained=await page.evaluate(keys=>Object.fromEntries(keys.filter(k=>localStorage.getItem(k)!==null).map(k=>[k,localStorage.getItem(k)])),Object.keys(original));
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);
  assert.equal(await page.evaluate(()=>window.sharedDraftAccountState().unknown),true);
  assert.equal(posts(s.f).length,count);
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));
  await page.locator('#fqc-check-result').waitFor();
  s.receiptsUp();
  await s.recover();
  assert.equal(posts(s.f).length,count);
  assert.deepEqual(s.errors,[]);
  assert.deepEqual(retained,{},'Abandon must remove only this runtime\'s unsent local matrix payload; preserve the separate unknown form receipt');
} finally { await s.close(); }

});
void test('unsent matrix storage deletion failure refuses departure and keeps form/unknown evidence',async()=>{
 const s=await setup(),{page}=s;try{
  await router(page);await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();await page.waitForFunction(()=>Object.values(localStorage).some(v=>v.includes('completeMatrix')));
  const original=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([,v])=>v.includes('completeMatrix'))));await unknown(s);
  const markers=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),count=posts(s.f).length;
  await page.evaluate(keys=>{const remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(this===localStorage&&keys.includes(key))throw Error('SYNTHETIC_REMOVE_FAILED');return remove.call(this,key);};},Object.keys(original));
  await page.evaluate(()=>void window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="abandon"]').click();await page.waitForFunction(()=>!!document.querySelector('[data-departure-error]')?.textContent);
  assert.equal(await page.evaluate(()=>window.state.view),'data');assert.equal(await page.locator('.fqc-modal-form [name=name]').inputValue(),'Later 未送出 input');assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(original)),original);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('shared-draft')))),markers);assert.equal(posts(s.f).length,count);assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),true);
 }finally{await s.close();}
});
