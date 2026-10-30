// Real compiled browser paths with synthetic, nonpersistent D1/R2 only.
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createABCFixture} from './ab-c-native-fixture.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={commit:process.env.PROCESS_PROGRAM_COMMIT,environment:'Linux Node24 system Chromium local workerd; 40 synthetic products per scope; owner; AB cold and C warm context; not real-data performance',samples:[],checks:[],failures:[]};
fs.mkdirSync('.sites-runtime/ab-c-evidence',{recursive:true});
try{for(let run=0;run<5;run++){
 const f=await createABCFixture();report.buildEntrySha256=f.buildEntrySha256;
 try{const c=await browser.newContext({viewport:{width:1365,height:900}});await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);const p=await c.newPage();let accept=true,confirmCount=0;
 p.on('dialog',d=>{if(d.type()==='confirm')confirmCount++;return accept?d.accept():d.dismiss();});p.on('pageerror',e=>report.failures.push({run,error:e.message}));
 const ready=async scope=>p.waitForFunction(s=>typeof state!=='undefined'&&state.dataTab===s&&document.documentElement.dataset.processNavigationStatus==='ready'&&document.querySelector('#master-product-search')&&!MasterDataWorkflow.shared.busy(),scope);
 const measure=async(scope,operation,fn)=>{const start=performance.now();await fn();report.samples.push({scope,operation,run,ms:Math.round(performance.now()-start)});};
 const apply=async()=>{await p.locator('#master-edit-dialog [type=submit]').click();await p.waitForSelector('#master-edit-dialog',{state:'detached'});};
 for(const scope of ['AB','C']){
 const prefix=scope==='AB'?'A':'C',target=scope==='AB'?'C':'AB';
 await measure(scope,'first-entry',async()=>{await p.goto(f.url.origin+'/process/?system=process&view=data&dataTab='+scope);await ready(scope);});
 await measure(scope,'reload',async()=>{await p.reload();await ready(scope);});
 await measure(scope,'search',async()=>{await p.locator('#master-product-search').fill(prefix+'001');await p.waitForFunction(()=>document.querySelectorAll('.master-table tbody tr').length===1);});await p.locator('#master-product-search').fill('');
 await measure(scope,'begin',async()=>{await p.locator('#master-new-draft').click();await p.waitForSelector('[data-product-edit]');});
 const count=confirmCount;await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);assert.equal(confirmCount,count,'unchanged Begin must not require Save');await p.evaluate(s=>ProcessDeliveryNavigation.navigate('data',s),scope);await ready(scope);
 await measure(scope,'open-product',async()=>{await p.locator('[data-product-edit]').first().click();await p.waitForSelector('#master-edit-dialog [name=name]');});
 await p.locator('#master-edit-dialog [name=name]').fill('修復測試 Kiểm tra '+run);
 await measure(scope,'apply-product',apply);assert.equal(await p.evaluate(()=>ProcessDeliveryNavigation.pending()),true);
 accept=false;await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);assert.equal(await p.evaluate(()=>state.dataTab),scope);accept=true;
 await measure(scope,'save-and-leave',async()=>{await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);});
 await p.evaluate(s=>ProcessDeliveryNavigation.navigate('data',s),scope);await ready(scope);
 assert.equal(await p.evaluate(s=>MasterDataWorkflow.shared.flow(s).saved.content.products[0].name,scope),'修復測試 Kiểm tra '+run);
 await measure(scope,'save-unchanged',async()=>{await p.locator('#master-save-draft').click();await p.waitForFunction(()=>!MasterDataWorkflow.shared.busy());});
 await measure(scope,'category-filter',async()=>{await p.locator('#master-category-filter').selectOption('GROUP-1');await p.waitForSelector('[data-group-route-view]');});
 await measure(scope,'open-route',async()=>{await p.locator('[data-group-route-view]').click();await p.waitForSelector('#master-edit-dialog');});await p.locator('#master-edit-dialog [data-cancel]').first().click();
 await measure(scope,'reference-check',async()=>{const result=await p.evaluate(async code=>{const r=await fetch('/api/master/workflow?scope='+state.masterScope+'&references='+code,{headers:ProcessSync.platformHeaders()});return {status:r.status,body:await r.json()};},prefix+'001');assert.equal(result.status,200);assert.equal(result.body.total,0);});
 await measure(scope,'leave-after-save',async()=>{await p.evaluate(t=>ProcessDeliveryNavigation.navigate('data',t),target);await ready(target);});
 report.checks.push(scope+' round '+run+': unchanged departure, apply, cancel departure, saved departure, persisted content, route view');
 }
 if(run===0){
 await p.evaluate(()=>ProcessDeliveryNavigation.navigate('data','AB'));await ready('AB');
 // IME must keep the composing input and defer filtering until compositionend.
 const ime=await p.evaluate(()=>{const input=document.querySelector('#master-product-search'),before=document.querySelector('.master-table tbody').innerHTML;input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='隔離';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));const unchanged=before===document.querySelector('.master-table tbody').innerHTML;input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return unchanged&&input===document.querySelector('#master-product-search');});assert(ime);report.checks.push('IME preserves input and defers filter');
 await p.locator('#master-product-search').fill('');if(await p.locator('html').getAttribute('lang')==='vi'){await p.locator('.top-language-switch').click();await p.waitForFunction(()=>document.documentElement.lang!=='vi');}await p.screenshot({path:'.sites-runtime/ab-c-evidence/desktop-zh.png',fullPage:true});await p.screenshot({path:'.sites-runtime/ab-c-evidence/desktop-zh-viewport.png'});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.sites-runtime/ab-c-evidence/mobile-zh.png'});
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page must not overflow viewport');
 await p.locator('.top-language-switch').click();await p.waitForFunction(()=>document.documentElement.lang==='vi');
 await p.locator('[data-product-edit]').first().click();assert(await p.locator('#master-edit-dialog').isVisible());await p.screenshot({path:'.sites-runtime/ab-c-evidence/mobile-vi-dialog.png'});await p.keyboard.press('Escape');assert.equal(await p.locator('#master-edit-dialog').count(),0);report.checks.push('390px Vietnamese dialog and Escape cancellation');
 }
 await c.close();
 }finally{await f.close();}console.log('candidate round',run+1);
}
assert.deepEqual(report.failures,[]);
}finally{fs.writeFileSync('.sites-runtime/ab-c-candidate.json',JSON.stringify(report,null,2));await browser.close();}
