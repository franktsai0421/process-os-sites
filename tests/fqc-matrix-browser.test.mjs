// Native Chromium layout + actual module/client JS, with isolated in-memory HTTP.
// This is not the deployed app, real identities, real D1, native IME or a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
const directory=new URL('../public/process/',import.meta.url),read=name=>fs.readFileSync(new URL(name,directory),'utf8');
const css=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const actor={id:'isolated-editor',name:'Synthetic Editor',role:'admin'},at='2026-10-30T00:00:00Z';
const permissions={view:true,edit:true,save:true,submit:true,withdraw:true,approve:true,return:true,delete:true,history:true,restore:true};
function fixtureData(){const products=Array.from({length:12},(_,i)=>({code:'P'+String(i).padStart(2,'0'),name:'合成產品 Sản phẩm '+i,specification:'Long specification for isolated matrix layout',line:'A',category:'SYN'}));const snapshot={errors:[{id:'error',code:'SYN-FQC-L01',name:'Synthetic defect',category:'SYN',line:'A',isDeleted:false}],items:Array.from({length:12},(_,i)=>({id:'item'+i,checkNo:'SYN-FQC-L1-'+String(i+1).padStart(2,'0'),name:'合成檢查 Kiểm tra '+i,description:'Synthetic instruction',category:'SYN',line:'A',errorId:'error',productCodes:[],productRefs:[],mediaItems:[],isEnabled:true,tool:'目視檢查',rule:{cadence:'none'}}))};return{products,control:{activeVersionId:null,versions:[{id:'draft',number:1,status:'draft',snapshot:structuredClone(snapshot),revision:1,createdAt:at,updatedAt:at,creatorId:actor.id,creatorName:actor.name,history:[]}],workflow:{scope:'fqc',generation:'fqc-browser-generation',revision:1,working:structuredClone(snapshot),saved:null,pendingId:null,cases:[],receipts:{}}}};}
const hook=`window.__browserFQC={render,ui,matrixDirty,applyMatrixChoices,recoveryReady:()=>matrixRecoveryReady,install(root,model,products){hostElement=root;control={schemaVersion:1,libraries:{fqc:model,iqc:{versions:[]},ipqc:{versions:[]},routineReports:{versions:[]}}};masterCatalogCache={products,categoryGroups:[{name:'SYN',line:'A'}],lines:[]};masterCatalogActor=identity().id;masterCatalogCurrent=()=>true;equipmentCache={equipment:[],issues:[]};equipmentCacheCurrent=()=>true;workspaceReady=()=>true;adopt({control:model});},transport};`;
const fqc=read('fqc-master.js').replace('})(window);',hook+'})(window);');
const output=path.join(os.tmpdir(),'process-os-fqc-browser');fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,1280])for(const lang of ['zh','vi'])void test(`FQC native isolated browser ${width}px ${lang}: batch/focus/sticky/overflow`,async()=>{
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),data=fixtureData(),requests=[],pageErrors=[];
 let revision=1;
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());requests.push({url:url.pathname,method:request.method()});
  if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main id="data-content" data-active-tab="quality-fqc" style="padding:12px;min-width:0"></main></html>`});
  if(url.pathname==='/api/fqc/workflow'){
   if(request.method()==='POST'){
    const command=request.postDataJSON().command;assert.equal(command.action,'apply');
    for(const guard of command.guards){const row=data.control.workflow.working.items.find(item=>item.id===guard.path[1].id);if(JSON.stringify(row?.[guard.path[2]])!==JSON.stringify(guard.value))return route.fulfill({status:409,json:{error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'fbd95cef-43d9-4229-a623-c8e0ab785db1',details:{path:guard.path}}});}
    for(const patch of command.patches){const row=data.control.workflow.working.items.find(item=>item.id===patch.path[1].id);row[patch.path[2]]=structuredClone(patch.value);}
    data.control.workflow.revision++;data.control.versions[0].snapshot=structuredClone(data.control.workflow.working);revision++;
    return route.fulfill({json:{revision,control:data.control,permissions,receipt:{operationId:command.operationId,generation:command.generation,revision:data.control.workflow.revision,savedId:null,caseId:null,unchanged:false}}});
   }
   return route.fulfill({json:{revision,control:data.control,permissions}});
  }
  return route.fulfill({status:404,body:'Isolated fixture: unconfigured resource'});
 });
 try{
  await page.goto('https://fqc.fixture.invalid/process/');
  const mount=async()=>{
  await page.evaluate(({actor,lang})=>{window.ProcessSync={identity:actor,identityGeneration:()=>1,captureDelivery:()=>({epoch:1}),isCurrentDelivery:o=>o.epoch===1,platformHeaders:()=>({}),requiresReload:false};window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.toast=message=>{window.__notices??=[];window.__notices.push(message);};window.bindDataInner=()=>{};localStorage.setItem('processUILanguage',lang);},{actor,lang});
  await page.addScriptTag({content:read('local-draft-recovery.js')});await page.addScriptTag({content:read('local-draft-recovery-session.js')});await page.addScriptTag({content:read('shared-draft-client.js')});await page.addScriptTag({content:read('version-draft-ui.js')});await page.addScriptTag({content:fqc});
  await page.evaluate(async data=>{window.__browserFQC.install(document.querySelector('#data-content'),data.control,data.products);await window.__browserFQC.transport().read();window.__browserFQC.render();},data);
  await page.waitForFunction(()=>window.__browserFQC.recoveryReady());
  };await mount();
  const cell=page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]');
  await cell.scrollIntoViewIfNeeded();await cell.focus();await page.evaluate(()=>{window.__firstCell=document.activeElement;});await cell.press('Space');
  assert.equal(await cell.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>document.activeElement===window.__firstCell),true,'same focused node after local choice');
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.locator('#fqc-matrix-count').scrollIntoViewIfNeeded();assert.match(await page.locator('#fqc-matrix-count').innerText(),/1/);
  const search=page.locator('#fqc-search');await search.fill('P01');assert.equal(await search.inputValue(),'P01');assert.equal(await page.evaluate(()=>document.activeElement.id),'fqc-search');assert.match(await page.locator('#fqc-matrix-count').innerText(),/1/);await search.fill('');
  assert.equal(await page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]').getAttribute('aria-pressed'),'true');
  await page.locator('.fqc-matrix').evaluate(el=>{el.open=false;});assert.equal(await page.locator('#fqc-matrix-apply').isVisible(),true,'batch Apply exists outside collapsed matrix');
  await page.locator('.fqc-matrix').evaluate(el=>{el.open=true;});await page.locator('[data-matrix-item="item1"][data-matrix-product="P01"]').scrollIntoViewIfNeeded();
  await page.locator('[data-matrix-item="item1"][data-matrix-product="P01"]').click();
  await page.evaluate(()=>window.scrollBy(0,300));
  const geometry=await page.evaluate(()=>{const bar=document.querySelector('.fqc-matrix-actions').getBoundingClientRect(),apply=document.querySelector('#fqc-matrix-apply').getBoundingClientRect(),discard=document.querySelector('#fqc-matrix-discard').getBoundingClientRect();return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,bar:{x:bar.x,y:bar.y,right:bar.right,bottom:bar.bottom},apply:{x:apply.x,y:apply.y,right:apply.right,bottom:apply.bottom,height:apply.height},discard:{x:discard.x,y:discard.y,right:discard.right,bottom:discard.bottom,height:discard.height}};});
  assert(geometry.documentWidth<=width+1,`document overflow ${JSON.stringify(geometry)}`);assert(geometry.bar.y>=-1&&geometry.bar.bottom<=850,'sticky toolbar stays in viewport '+JSON.stringify(geometry));assert(geometry.apply.height>=44&&geometry.discard.height>=44,'touch targets');assert(geometry.apply.x>=0&&geometry.apply.right<=width+1,'Apply fits viewport');
  assert.match(await page.locator('#fqc-matrix-apply').innerText(),lang==='vi'?/Áp dụng/:/套用勾選/);
  await page.screenshot({path:path.join(output,`matrix-${width}-${lang}.png`)});
  await page.reload();await mount();assert.match(await page.locator('#fqc-matrix-count').innerText(),/0/);assert.equal(await page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]').getAttribute('aria-pressed'),'false');await page.locator('#fqc-matrix-recovery').click();page.once('dialog',dialog=>dialog.accept());await page.locator('.fqc-recovery-overlay button').filter({hasText:lang==='vi'?'Khôi phục cục bộ':'恢復至本機'}).click();await page.waitForFunction(()=>window.__browserFQC.matrixDirty());assert.match(await page.locator('#fqc-matrix-count').innerText(),/2/);assert.equal(await page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]').getAttribute('aria-pressed'),'true');assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.locator('#fqc-matrix-apply').click();await page.waitForFunction(()=>!window.__browserFQC.matrixDirty());assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(data.control.workflow.working.items[0].productCodes,['P00']);assert.deepEqual(data.control.workflow.working.items[1].productCodes,['P01']);assert.equal(data.control.workflow.saved,null);
  assert.deepEqual(pageErrors,[]);console.log(JSON.stringify({viewport:width,language:lang,postsForTwoChoices:0,reloadNeverAutoHydrates:true,explicitClaimedRestore:true,explicitApplyPosts:1,geometry,screenshot:path.join(output,`matrix-${width}-${lang}.png`),limits:'Native Chromium, isolated module and memory transport; not native IME, actual phone, full shell or deployed server.'}));
 }finally{await context.close();await browser.close();}
});
