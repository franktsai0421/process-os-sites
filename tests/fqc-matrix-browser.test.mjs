// Native Chromium layout + actual module/client JS, with isolated in-memory HTTP.
// This is not the deployed app, real identities, real D1, native IME or a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const directory=new URL('../public/process/',import.meta.url),read=name=>fs.readFileSync(new URL(name,directory),'utf8');
const css=['styles.css','i18n.css','master-data.css','master-data-extra.css','master-data-validation.css','master-admin-ui.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const actor={id:'isolated-editor',name:'Synthetic Editor',role:'admin'},at='2026-10-30T00:00:00Z';
const permissions={view:true,edit:true,save:true,submit:true,withdraw:true,approve:true,return:true,delete:true,history:true,restore:true};
function fixtureData(){const products=Array.from({length:12},(_,i)=>({code:'P'+String(i).padStart(2,'0'),name:'合成產品 Sản phẩm '+i,specification:'Long specification for isolated matrix layout',line:'A',category:'SYN'}));const snapshot={errors:[{id:'error',code:'SYN-FQC-L01',name:'Synthetic defect',category:'SYN',line:'A',isDeleted:false}],items:Array.from({length:12},(_,i)=>({id:'item'+i,checkNo:'SYN-FQC-L1-'+String(i+1).padStart(2,'0'),name:'合成檢查 Kiểm tra '+i,description:'Synthetic instruction',category:'SYN',line:'A',errorId:'error',productCodes:[],productRefs:[],mediaItems:[],isEnabled:true,tool:'目視檢查',rule:{cadence:'none'}}))};return{products,control:{activeVersionId:null,versions:[{id:'draft',number:1,status:'draft',snapshot:structuredClone(snapshot),revision:1,createdAt:at,updatedAt:at,creatorId:actor.id,creatorName:actor.name,history:[]}],workflow:{scope:'fqc',generation:'fqc-browser-generation',revision:1,working:structuredClone(snapshot),saved:null,pendingId:null,cases:[],receipts:{}}}};}
const hook=`window.__browserFQC={render,ui,matrixDirty,applyMatrixChoices,recoveryReady:()=>matrixRecoveryReady,install(root,model,products){hostElement=root;control={schemaVersion:1,libraries:{fqc:model,iqc:{versions:[]},ipqc:{versions:[]},routineReports:{versions:[]}}};masterCatalogCache={products,categoryGroups:[{name:'SYN',line:'A'}],lines:[]};masterCatalogActor=identity().id;masterCatalogCurrent=()=>true;equipmentCache={equipment:[],issues:[]};equipmentCacheCurrent=()=>true;workspaceReady=()=>true;adopt({control:model});},transport};`;
const fqc=read('fqc-master.js').replace('})(window);',hook+'})(window);');
const output=process.env.FQC_MATRIX_SCREENSHOTS_DIR?path.resolve(process.env.FQC_MATRIX_SCREENSHOTS_DIR):path.join(os.tmpdir(),'process-os-fqc-browser');fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,1280])for(const lang of ['zh','vi'])void test(`FQC native isolated browser ${width}px ${lang}: batch/focus/sticky/overflow`,async()=>{
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),data=fixtureData(),requests=[],pageErrors=[],dialogs=[];
 let expectedDialog=null;
 let revision=1;
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('dialog',dialog=>{const observed={type:dialog.type(),message:dialog.message()};dialogs.push(observed);if(expectedDialog&&observed.type==='confirm'&&observed.message===expectedDialog){expectedDialog=null;void dialog.accept();}else void dialog.dismiss();});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());requests.push({url:url.pathname,method:request.method()});
  if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main id="data-content" data-active-tab="quality-fqc" style="padding:12px;min-width:0"></main></html>`});
  if(url.pathname==='/api/fqc/workflow'){
   if(request.method()==='POST'){
    const command=request.postDataJSON().command;assert.equal(command.action,'apply');
    assert.equal(command.moduleAction,'replace-matrix-v1');assert.equal(command.input.items.length,data.control.workflow.working.items.length);assert.equal(command.input.products.length,data.products.length);
    command.patches=command.input.items.map(row=>({path:['items',{id:row.id},'productCodes'],value:row.productCodes}));command.guards=[];
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
  await page.addScriptTag({content:read('local-draft-recovery.js')});await page.addScriptTag({content:read('local-draft-recovery-session.js')});await page.addScriptTag({content:read('shared-draft-client.js')});await page.addScriptTag({content:read('version-draft-ui.js')});await page.addScriptTag({content:fqc});await page.addScriptTag({content:read('i18n.js')});
  await page.evaluate(async data=>{window.__browserFQC.install(document.querySelector('#data-content'),data.control,data.products);await window.__browserFQC.transport().read();window.__browserFQC.render();},data);
  await page.waitForFunction(()=>window.__browserFQC.recoveryReady());
  };await mount();
  assert.equal(await page.locator('.fqc-matrix>summary').textContent(),(lang==='vi'?'Ma trận sản phẩm và hạng mục kiểm tra':'產品與檢查項目矩陣')+' · SYN');
  assert.equal(await page.locator('.fqc-matrix>summary').getAttribute('data-i18n-skip'),'true');
  assert.equal(await page.locator('.matrix-prod-name').first().textContent(),data.products[0].name,'global i18n retains product business text');
  assert.equal(await page.locator('.fqc-matrix-item-name').first().textContent(),data.control.workflow.working.items[0].name,'global i18n retains item business text');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('lang-vi')),lang==='vi','actual global locale renderer ran');
  const placement=await page.evaluate(()=>{const actions=document.querySelector('.fqc-matrix-actions'),matrix=document.querySelector('.fqc-matrix');return{applyCount:document.querySelectorAll('#fqc-matrix-apply').length,immediatelyBeforeMatrix:actions.nextElementSibling===matrix,outsideDisclosure:!matrix.contains(actions)};});
  assert.deepEqual(placement,{applyCount:1,immediatelyBeforeMatrix:true,outsideDisclosure:true},'single Apply belongs directly above the checkbox matrix, not the page header');
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
  assert(geometry.documentWidth<=width+1,`document overflow ${JSON.stringify(geometry)}`);assert(geometry.bar.y>=-1&&geometry.bar.bottom<=850,'sticky toolbar stays in viewport '+JSON.stringify(geometry));assert(geometry.apply.height>=44,'primary touch target');assert(geometry.apply.x>=0&&geometry.apply.right<=width+1,'Apply fits viewport');
  assert.match(await page.locator('#fqc-matrix-apply').innerText(),lang==='vi'?/Áp dụng/:/套用新矩陣設定/);
  // Capture the actual rendered module, without rearranging DOM/CSS for the image.
  await page.evaluate(()=>{const bar=document.querySelector('.fqc-matrix-actions'),matrix=document.querySelector('.fqc-matrix');window.scrollTo(0,matrix.getBoundingClientRect().top+window.scrollY-bar.offsetHeight-40);});
  const screenshotGeometry=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return{viewport:{width:innerWidth,height:innerHeight},toolbar:rect('.fqc-matrix-actions'),matrix:rect('.fqc-matrix'),grid:rect('.fqc-matrix-scroll')};});
  assert(screenshotGeometry.toolbar.y>=0&&screenshotGeometry.toolbar.bottom<=screenshotGeometry.matrix.y+1,'toolbar visually precedes the matrix');
  assert(screenshotGeometry.grid.y<850,'checkbox grid is visible beside its toolbar');
  await page.screenshot({path:path.join(output,`matrix-${width}-${lang}.png`)});
  fs.writeFileSync(path.join(output,`matrix-${width}-${lang}.json`),JSON.stringify({status:'PASS_NATIVE_CHROMIUM_RENDER',programCommit:process.env.PROCESS_PROGRAM_COMMIT||null,viewport:width,language:lang,placement,geometry:screenshotGeometry,sourceSHA256:createHash('sha256').update(read('fqc-master.js')).digest('hex'),globalI18n:true,i18nSHA256:createHash('sha256').update(read('i18n.js')).digest('hex'),stylesSHA256:createHash('sha256').update(css).digest('hex'),syntheticData:true,limits:'Actual FQC module and CSS, isolated memory transport. Not full application shell, employee data or deployed website.'},null,2)+'\n');
  await page.reload();await mount();assert.match(await page.locator('#fqc-matrix-count').innerText(),/0/);assert.equal(await page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]').getAttribute('aria-pressed'),'false');await page.locator('#fqc-matrix-more>summary').click();await page.locator('#fqc-matrix-recovery').click();await page.locator('.fqc-recovery-overlay [data-recovery-list] article>button').click();expectedDialog=lang==='vi'?'Xác nhận thao tác chỉ cho bản cục bộ đã xem? Không tự gửi.':'確認只處理預覽中的本機紀錄？不會自動共享。';await page.locator('.fqc-recovery-overlay button').filter({hasText:lang==='vi'?'Khôi phục cục bộ':'恢復至本機'}).click();await page.waitForFunction(()=>window.__browserFQC.matrixDirty());assert.match(await page.locator('#fqc-matrix-count').innerText(),/2/);assert.equal(await page.locator('[data-matrix-item="item0"][data-matrix-product="P00"]').getAttribute('aria-pressed'),'true');assert.equal(requests.filter(r=>r.method==='POST').length,0);
  await page.locator('#fqc-matrix-apply').click();await page.waitForFunction(()=>!window.__browserFQC.matrixDirty());assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(data.control.workflow.working.items[0].productCodes,['P00']);assert.deepEqual(data.control.workflow.working.items[1].productCodes,['P01']);assert.equal(data.control.workflow.saved,null);
  assert.deepEqual(pageErrors,[]);assert.equal(expectedDialog,null);assert.deepEqual(dialogs,[{type:'confirm',message:lang==='vi'?'Xác nhận thao tác chỉ cho bản cục bộ đã xem? Không tự gửi.':'確認只處理預覽中的本機紀錄？不會自動共享。'}],'only the exact local-preview confirmation is accepted');console.log(JSON.stringify({viewport:width,language:lang,postsForTwoChoices:0,reloadNeverAutoHydrates:true,explicitClaimedRestore:true,explicitApplyPosts:1,geometry,screenshot:path.join(output,`matrix-${width}-${lang}.png`),limits:'Native Chromium, isolated module and memory transport; not native IME, actual phone, full shell or deployed server.'}));
 }finally{await context.close();await browser.close();}
});
