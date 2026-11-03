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
for(const width of [390,1280])for(const lang of ['zh','vi'])void test(`actual navigation parks and restores unknown input ${width}px ${lang}`,async()=>{
  const s=await setup(width,lang),{page,f}=s;try{
    await router(page);await unknown(s);const before=posts(f).length;
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));
    const dialog=page.locator('#process-navigation-departure'),park=dialog.locator('[data-departure-choice="park"]');await park.waitFor({state:'visible'});assert(await park.isEnabled());assert((await park.boundingBox()).height>=44);assert(await dialog.evaluate(node=>node.getBoundingClientRect().right<=innerWidth));assert(await dialog.locator('[data-departure-choice="discard"]').isDisabled());
    await park.click();await page.waitForFunction(()=>window.state.view==='dashboard');
    assert.equal(await page.locator('.fqc-modal-form').count(),0);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),false);
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('[data-fqc-checkpoint]').waitFor();assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));
    await page.locator('[data-fqc-checkpoint]').click();assert.equal(await page.locator('[data-checkpoint-field="name"]').inputValue(),'Later 未送出 input');assert(await page.locator('[data-checkpoint-field="name"]').getAttribute('readonly')!==null);
    assert.equal(posts(f).length,before);assert.deepEqual(s.errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.FQC_CHECKPOINT_SCREENSHOTS){fs.mkdirSync(process.env.FQC_CHECKPOINT_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.FQC_CHECKPOINT_SCREENSHOTS+`/restored-${width}-${lang}.png`});}
  }finally{await s.close();}
});
void test('real reload retains text, inactive rules, photo bytes/order/notes and unknown; no POST',async()=>{
  const s=await setup(),{page,f}=s;try{
    await page.route('**/photo-policy.mjs*',route=>route.fulfill({contentType:'text/javascript',body:source('photo-policy.mjs')}));
    await f.mutate(values=>{const equipment=JSON.parse(values.routineEquipmentControl);equipment.versions[0].equipment.push({id:'synthetic-equipment',assetCode:'SYN-EQ',pieceMark:'SYN-M',name:'Synthetic checkpoint equipment',enabled:true});values.routineEquipmentControl=JSON.stringify(equipment);});
    const form=await unknown(s,'item');await form.locator('[name="description"]').fill('Unsubmitted\n詳細');await form.locator('[name="note"]').fill('Private note');
    await form.locator('[name="toolType"][value="equipment"]').check();await form.locator('#fqc-pick-eq-trigger').click();await page.locator('[data-select-eq]').first().click();
    const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await form.locator('#fqc-file-input').setInputFiles([{name:'first.png',mimeType:'image/png',buffer:png},{name:'second.png',mimeType:'image/png',buffer:png}]);await page.waitForFunction(()=>!document.querySelector('#fqc-file-input').value);
    await form.locator('[data-photo-note="0"]').fill('First photo note');await form.locator('[data-photo-note="1"]').fill('Second photo note');await form.locator('[data-photo-up="1"]').click();
    await form.locator('[name="customBatchText"]').evaluate(node=>{node.value='unfinished hidden batch';});
    const before=posts(f).length;const saved=await page.evaluate(async()=>{const adapter=window.FQCMasterUI.navigation.departure,lease=await adapter.park();window.checkpointLease=lease;return window.FQCInputCheckpoint.list('editor')[0].payload;});
    assert.equal(saved.forms[0].state.details.currentMedia.length,2);assert.equal(saved.forms[0].state.details.currentMedia[0].name,'second.png');assert.equal(saved.forms[0].state.details.currentMedia[0].note,'Second photo note');assert.match(saved.forms[0].state.details.currentMedia[0].src,/^data:image\/png;base64,/);assert(saved.forms[0].state.details.selectedEqId);assert.equal(saved.forms[0].state.details.toolType,'equipment');
    let unloadWarnings=0;page.removeAllListeners('dialog');page.on('dialog',dialog=>{assert.equal(dialog.type(),'beforeunload');unloadWarnings++;void dialog.accept();});await page.reload();await s.boot();assert.equal(unloadWarnings,1);
    assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));await page.locator('[data-fqc-checkpoint]').click();assert.equal(await page.locator('[data-checkpoint-field="description"]').inputValue(),'Unsubmitted\n詳細');assert.equal(await page.locator('[data-checkpoint-field="note"]').inputValue(),'Private note');
    assert.deepEqual(await page.evaluate(()=>window.FQCInputCheckpoint.list('editor')[0].payload),saved);assert.equal(posts(f).length,before);assert.deepEqual(s.errors,[]);
  }finally{await s.close();}
});
for(const fault of ['quota','readback','composing','changed','foreign-dialog','account'])void test(`checkpoint ${fault} cannot release unknown or lose inputs`,async()=>{
  const s=await setup(),{page,f}=s;try{
    await router(page);await unknown(s);const before=posts(f).length;
    await page.evaluate(fault=>{
      if(fault==='quota'||fault==='readback'||fault==='changed'||fault==='account'){
        const set=Reflect.get(Storage.prototype,'setItem');Storage.prototype.setItem=function(key,value){if(key.startsWith('fqc-input-checkpoint-v1:')){if(fault==='quota')throw new DOMException('Full','QuotaExceededError');if(fault==='readback')return;if(fault==='changed')document.querySelector('[name="name"]').value='New input during save';if(fault==='account')window.ProcessSync.identity={id:'other'};}return set.call(this,key,value);};
      }
      if(fault==='composing')window.ProcessNavigationForms={composing:()=>true};
      if(fault==='foreign-dialog'){const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();}
    },fault);
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));const park=page.locator('[data-departure-choice="park"]');
    if(['composing','foreign-dialog'].includes(fault))assert(await park.isHidden()||await park.isDisabled());else{await park.click();await page.waitForFunction(()=>!document.querySelector('#process-navigation-departure')||!document.querySelector('[data-departure-choice="stay"]').disabled);}
    assert.equal(await page.evaluate(()=>window.state.view),'data');assert.equal(await page.locator('.fqc-modal-form').count(),1);assert.equal(posts(f).length,before);
    assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('shared-draft')).length),1);
  }finally{await s.close();}
});
void test('target failure releases checkpoint lease and keeps latest editable input',async()=>{
  const s=await setup(),{page}=s;try{await router(page);await unknown(s);await page.evaluate(()=>{window.failDestination=true;window.ProcessDeliveryNavigation.navigate('dashboard');});await page.locator('[data-departure-choice="park"]').click();await page.waitForFunction(()=>!document.querySelector('#process-navigation-departure'));assert.equal(await page.evaluate(()=>window.state.view),'data');assert.equal(await page.locator('.fqc-modal-form').evaluate(node=>node.closest('.fqc-modal-overlay').inert),false);assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));await page.locator('.fqc-modal-form [name="name"]').fill('Retained after destination failure');assert.deepEqual(s.errors,[]);}finally{await s.close();}
});
void test('original POST commits after 404 and parking; fresh receipt keeps later private input and collaborator change',async()=>{
  const s=await setup(),{page,f}=s;let release;try{
    await router(page);const held=new Promise(resolve=>release=resolve);f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state'))await held;};
    await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Original late commit');s.lose({delayed:true});await form.locator('[type="submit"]').click();await s.settled();
    s.receiptsUp();await page.locator('[data-fqc-check-result]').click();await page.waitForFunction(()=>!document.querySelector('[data-fqc-check-result]').disabled);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));
    await form.locator('[name="name"]').fill('Later private choice');await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="park"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');
    release();assert.equal((await s.lateCommit()).status,200);f.hooks.run=null;
    const latest=await f.state();assert.equal(latest.workflow.working.errors[0].name,'Original late commit');const before=posts(f).length;
    const other=f.realm('other');await other.client.read();await other.client.command(latest.workflow.generation,'apply',nameEdit('Other actor latest','Original late commit'));
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('[data-fqc-checkpoint]').waitFor();await s.recover();
    assert.equal((await f.state()).workflow.working.errors[0].name,'Other actor latest');assert.equal(posts(f).length,before+1);const operationId=await page.evaluate(()=>window.FQCInputCheckpoint.list('editor')[0].payload.operation.operationId);assert.equal(posts(f).filter(row=>JSON.parse(row.body).command.operationId===operationId).length,1);
    await page.locator('[data-fqc-checkpoint]').click();assert.equal(await page.locator('[data-checkpoint-field="name"]').inputValue(),'Later private choice');assert.deepEqual(s.errors,[]);
  }finally{release?.();await s.close();}
});
void test('unknown matrix and a separate unsent form are completely retained together',async()=>{
  const s=await setup(),{page,f}=s;try{
    await router(page);await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();s.lose({commit:false});await page.locator('#fqc-matrix-apply').click();await s.settled();
    await page.locator('[data-edit-error="error"]').click();await page.locator('.fqc-modal-form [name="name"]').fill('Separate unsent input');const before=posts(f).length;
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));await page.locator('[data-departure-choice="park"]').click();await page.waitForFunction(()=>window.state.view==='dashboard');
    const payload=await page.evaluate(()=>window.FQCInputCheckpoint.list('editor')[0].payload);assert(payload.matrix.pending.operationId);assert(payload.matrix.snapshot.rows.some(row=>row.codes.includes('SYN-P')));assert.equal(payload.forms[0].state.details.kind,'error');
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('data','quality-fqc'));await page.locator('[data-fqc-checkpoint]').click();assert.equal(await page.locator('[data-checkpoint-field="name"]').inputValue(),'Separate unsent input');assert.equal(posts(f).length,before);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.deepEqual(s.errors,[]);
  }finally{await s.close();}
});
void test('another transport unknown cannot borrow FQC departure coverage',async()=>{
  const s=await setup(),{page}=s;try{
    await router(page);await unknown(s);await page.route('**/workflow?foreign=1',route=>route.abort());
    await page.evaluate(async()=>{const client=window.createSharedDraftClient({actorId:'editor',endpoint:'/api/fqc/workflow?foreign=1'});try{await client.command(window.FQCMasterUI.control.libraries.fqc.workflow.generation,'apply',{changes:[]});}catch{}});
    await page.evaluate(()=>window.ProcessDeliveryNavigation.navigate('dashboard'));const park=page.locator('[data-departure-choice="park"]');assert(await park.isHidden()||await park.isDisabled());assert.equal(await page.evaluate(()=>window.state.view),'data');
  }finally{await s.close();}
});
void test('a modified stored checkpoint invalidates coverage; snapshots never authorize writes or expose another account',async()=>{
  const s=await setup(),{page,f}=s;try{
    await unknown(s);await page.evaluate(async()=>{window.heldCheckpoint=await window.FQCMasterUI.navigation.departure.park();});
    assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),false);
    await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(key=>key.startsWith('fqc-input-checkpoint-v1:'));sessionStorage.setItem(key,sessionStorage.getItem(key)+' ');});assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));assert.equal(await page.evaluate(()=>window.FQCMasterUI.navigation.departure.inspect().state),'unknown');
    assert.deepEqual(await page.evaluate(()=>window.FQCInputCheckpoint.list('other')),[]);await page.evaluate(()=>window.heldCheckpoint.release());const before=posts(f).length;await page.locator('.fqc-modal-form [type="submit"]').click();await s.settled();assert.equal(posts(f).length,before);
  }finally{await s.close();}
});
void test('unfinished file, unrepresentable number and oversized input fail closed without replacing the buffer',async()=>{
  const s=await setup(),{page}=s;try{
    const form=await unknown(s,'item');
    const result=await page.evaluate(async()=>{
      const adapter=window.FQCMasterUI.navigation.departure,attempt=async()=>{try{await adapter.park();return false;}catch{return true;}},file=document.querySelector('#fqc-file-input'),files=new DataTransfer();files.items.add(new File(['pending'],'pending.png',{type:'image/png'}));file.files=files.files;
      const pending=await attempt();file.value='';const name=document.querySelector('.fqc-modal-form [name="name"]'),old=name.value;name.value='x'.repeat(2_000_001);const oversized=await attempt();name.value=old;
      return {pending,oversized,unknown:window.sharedDraftAccountState().unknown,records:window.FQCInputCheckpoint.list('editor').length};
    });assert.deepEqual(result,{pending:true,oversized:true,unknown:true,records:0});assert.equal(await form.locator('[name="name"]').inputValue(),'Later 未送出 input');
    await form.locator('[name="ruleCadence"]').selectOption('batch');await form.locator('[name="batchKind"]').selectOption('fixed_count');const number=form.locator('[name="fixedCount"]');await number.fill('');await number.pressSequentially('e');
    assert(await number.evaluate(node=>node.validity.badInput));assert(await page.evaluate(async()=>{try{await window.FQCMasterUI.navigation.departure.park();return false;}catch{return true;}}));assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));
  }finally{await s.close();}
});
void test('restored storage is inert data, and unreadable/too many archives cannot grant a new departure',async()=>{
  const s=await setup(),{page}=s;try{
    await unknown(s);const result=await page.evaluate(async()=>{
      const helper=window.FQCInputCheckpoint;let refused=false;try{helper.render({tag:'script',children:[{text:'window.checkpointExecuted=true'}]});}catch{refused=true;}
      for(let i=0;i<16;i++)helper.save('editor',{actorId:'editor',forms:[],operation:{operationId:String(i)}});
      const before=helper.list('editor').length;let blocked=false;try{await window.FQCMasterUI.navigation.departure.park();}catch{blocked=true;}
      return{refused,executed:window.checkpointExecuted===true,before,after:helper.list('editor').length,blocked,unknown:window.sharedDraftAccountState().unknown};
    });assert.deepEqual(result,{refused:true,executed:false,before:16,after:16,blocked:true,unknown:true});
  }finally{await s.close();}
});
void test('a duplicated tab inherits a read-only copy but no navigation capability or write admission',async()=>{
  const s=await setup(),{page,f}=s;let duplicate;try{
    await unknown(s);await page.evaluate(async()=>{window.checkpointLease=await window.FQCMasterUI.navigation.departure.park();});
    const before=posts(f).length,popup=page.context().waitForEvent('page');await page.evaluate(()=>window.open('/process/?duplicate=1','_blank'));duplicate=await popup;await duplicate.waitForLoadState();await s.boot(duplicate);
    assert(await duplicate.evaluate(()=>window.sharedDraftAccountState().unknown));assert(await duplicate.evaluate(()=>window.sharedDraftDepartureBlocked()));assert.equal(await duplicate.evaluate(()=>window.FQCInputCheckpoint.list('editor').length),1);
    await duplicate.locator('[data-fqc-checkpoint]').click();assert.equal(await duplicate.locator('[data-checkpoint-field="name"]').inputValue(),'Later 未送出 input');
    await duplicate.evaluate(()=>{const key=Object.keys(sessionStorage).find(key=>key.startsWith('fqc-input-checkpoint-v1:'));sessionStorage.setItem(key,'corrupt synthetic archive');});
    assert.equal(await page.evaluate(()=>window.sharedDraftDepartureBlocked()),false,'copied tab has an isolated storage namespace');assert.equal(posts(f).length,before);
  }finally{await duplicate?.close();await s.close();}
});
void test('fresh FQC read failure never renders private checkpoint contents',async()=>{
  const s=await setup(),{page}=s;try{
    await unknown(s);await page.evaluate(async()=>{window.checkpointLease=await window.FQCMasterUI.navigation.departure.park();});s.setReadDown(true);
    page.removeAllListeners('dialog');page.on('dialog',dialog=>void dialog.accept());await page.reload();await s.boot();
    assert.equal(await page.locator('[data-fqc-checkpoint]').count(),0);assert.equal(await page.locator('[data-fqc-checkpoint-restored]').count(),0);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));
  }finally{await s.close();}
});
void test('a failed photo read stays blocking after the native file input resets; explicit successful reselection recovers',async()=>{
  const s=await setup(),{page}=s;try{
    await page.route('**/photo-policy.mjs*',route=>route.fulfill({contentType:'text/javascript',body:source('photo-policy.mjs')}));const form=await unknown(s,'item');
    await form.locator('#fqc-file-input').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken synthetic image')});await page.waitForFunction(()=>!document.querySelector('#fqc-file-input').value);
    assert(await page.evaluate(async()=>{try{await window.FQCMasterUI.navigation.departure.park();return false;}catch(error){return error.message==='FQC_CHECKPOINT_PHOTO_INCOMPLETE';}}));assert.equal(await page.evaluate(()=>window.FQCInputCheckpoint.list('editor').length),0);assert(await page.evaluate(()=>window.sharedDraftDepartureBlocked()));
    const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await form.locator('#fqc-file-input').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>!document.querySelector('#fqc-file-input').value);
    assert(await page.evaluate(async()=>{const lease=await window.FQCMasterUI.navigation.departure.park();const saved=window.FQCInputCheckpoint.list('editor')[0];lease.release();return saved.payload.forms[0].state.details.currentMedia[0].name==='replacement.png'&&window.sharedDraftAccountState().unknown;}));
  }finally{await s.close();}
});
