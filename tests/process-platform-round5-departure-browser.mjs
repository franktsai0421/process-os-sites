// Functional acceptance only. Uses native UI/browser history and an isolated
// compiled Worker; explicit fault cases intercept only the named request.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessPlatformRound5Fixture} from './process-platform-round5-fixture.mjs';

const folder=process.env.PERF_FOLDER||'.sites-runtime/process-platform-round5/departure';fs.mkdirSync(folder,{recursive:true});
const dialog='#process-navigation-departure',choice=action=>`${dialog} [data-departure-choice="${action}"]`;
const report={status:'RUNNING',kind:'native functional acceptance, not performance measurement',scope:'Process authoring only; other module departure adapters not tested',buildDirectory:process.env.PROCESS_TEST_BUILD_DIR||'dist',cases:[],limitations:['Synthetic records and accounts; no existing hosted site or real business data.','403/409 response injection verifies UI recovery, not server authorization enforcement.','Offline checks are bounded observations, not proof of all timeout/retry schedules.','390px viewport with Vietnamese is browser emulation, not a physical iPhone/Safari test.','Browser refresh/close uses its native warning; this harness does not promise a custom three-option replacement.']};
const file=path.join(folder,'results.json'),persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
let fixture,browser,context,page,record;const companionContexts=[];
const op=content=>content.workspaces.find(w=>w.line==='A').stages['A-CUT'].find(row=>row.id==='photo-operation');
const actionOf=request=>{try{const body=request.postDataJSON();return(body?.command?.command||body?.command||body)?.action;}catch{return null;}};
const waitFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function idle(){await page.waitForFunction(()=>{const s=window.sharedDraftAccountState?.();return s&&s.queued===0&&!s.unknown&&!s.failed;});}
async function ready(view){await page.waitForFunction(view=>window.ProcessSync?.destination?.view===view&&document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationGeneration===document.documentElement.dataset.processDestinationReadyGeneration&&!document.querySelector('#process-boot'),view);await waitFrames();}
async function sidebar(selector){const button=page.locator(selector).first(),box=await button.boundingBox(),viewport=page.viewportSize();if(!await button.isVisible()||!box||box.x<0||box.x+box.width>(viewport?.width||Infinity))await page.locator('#menu-toggle').click();await button.click();}
async function nav(view){await sidebar(`[data-view="${view}"]`);await ready(view);}
async function openForm(){await page.locator('.pe-card[data-node="photo-operation"] [data-pe="edit"]').click();await page.locator('#process-operation-dialog[open] [data-field="name"]').waitFor();}
async function applyName(name){await openForm();await page.locator('[data-field="name"]').fill(name);await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await idle();assert.equal(op((await fixture.readAuthoring()).workflow.working).name,name);}
async function save(){const before=await page.evaluate(()=>ProcessAuthoringV3.flow().saved?.id);await page.locator('[data-av3="save"]').click();await page.waitForFunction(id=>!!ProcessAuthoringV3.flow().saved&&ProcessAuthoringV3.flow().saved.id!==id&&document.querySelector('[data-av3="save"]')?.disabled===false,before);await idle();}
async function prepare({lang='zh',mobile=false,historyPlayer=false}={}){
 await fixture.reset();context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},serviceWorkers:'block'});
 const origin=fixture.url.origin;await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);
 page=await context.newPage();page.setDefaultTimeout(20000);record.requests=[];record.pageErrors=[];
 page.on('pageerror',error=>record.pageErrors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/process-authoring/workflow'&&request.method()==='POST')record.requests.push({action:actionOf(request),at:Date.now()});});
 page.on('dialog',native=>{record.nativeDialogs||=[];record.nativeDialogs.push({type:native.type(),message:native.message(),dismissed:record.cancelNativeDeparture===true&&native.type()==='beforeunload'});if(record.cancelNativeDeparture&&native.type()==='beforeunload')void native.dismiss();else void native.accept(native.type()==='prompt'?'Synthetic departure acceptance':undefined);});
 await page.goto(origin+'/login?view=dashboard');await page.locator('#id').fill(fixture.actors.editor);await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await ready('dashboard');
 if(historyPlayer)await nav('player');await nav('editor');await page.locator('[data-av3="begin"]').click();await page.waitForFunction(()=>ProcessAuthoringV3.canMutate()&&document.querySelector('[data-av3="save"]')?.disabled===false);await idle();
 await applyName('Departure saved baseline');await save();
 assert.equal(await page.locator('html').getAttribute('lang'),lang==='vi'?'vi':'zh-Hant');
 return await fixture.readAuthoring();
}
async function decision(){await page.locator(dialog+'[open]').waitFor();assert.equal(await page.locator(dialog).count(),1);assert.equal(await page.locator(dialog+' [data-departure-choice]').count(),3);}
async function choose(action){await page.locator(choice(action)).click();}
async function back(){await page.goBack({waitUntil:'commit'});}
async function sourceStillHere(){assert.equal(await page.evaluate(()=>ProcessSync.destination.view),'editor');assert(await page.locator('.pe-editor').count());}
async function unchangedSaved(before){const now=await fixture.readAuthoring();assert.deepEqual(now.workflow.saved,before.workflow.saved);assert.deepEqual(now.workflow.saves,before.workflow.saves);assert.deepEqual(now.workflow.cases,before.workflow.cases);return now;}
async function move(){const header=page.locator('.pe-card[data-node="photo-operation"] header');await header.focus();await header.press('ArrowRight');await page.waitForFunction(()=>ProcessCanvasLocal.dirty());}
async function coworkerApplyC(name,beforeApply=async()=>{}){
 const companion=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});companionContexts.push(companion);const origin=fixture.url.origin;
 await companion.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const reviewer=await companion.newPage();reviewer.setDefaultTimeout(20000);reviewer.on('pageerror',error=>record.pageErrors.push('reviewer: '+error.message));
 await reviewer.goto(origin+'/login?view=editor');await reviewer.locator('#id').fill(fixture.actors.reviewer);await reviewer.locator('#password').fill(fixture.password);await reviewer.locator('.site-entry-submit').click();
 await reviewer.waitForFunction(()=>window.ProcessAuthoringV3?.canMutate()&&document.documentElement.dataset.processNavigationStatus==='ready');await reviewer.locator('#editor-line-select').selectOption('C');await reviewer.locator('.pe-card[data-node="round5-c-operation"] [data-pe="edit"]').click();await reviewer.locator('[data-field="name"]').fill(name);await beforeApply();await reviewer.locator('#apply-operation').click();await reviewer.locator('#process-operation-dialog').waitFor({state:'detached'});
 const current=await fixture.readAuthoring();assert.equal(current.workflow.working.workspaces.find(w=>w.line==='C').stages['C-CUT'][0].name,name);await companion.close();companionContexts.splice(companionContexts.indexOf(companion),1);
}
async function test(name,run){
 if(fs.existsSync(path.join(folder,'STOP_AFTER_CASE'))){report.stoppedAfterCase=report.cases.at(-1)?.name||'before first case';persist();return;}
 if(process.env.ROUND5_DEPARTURE_CASES&&!process.env.ROUND5_DEPARTURE_CASES.split(',').some(part=>name.includes(part)))return;
 record={name,status:'RUNNING'};report.cases.push(record);
 try{await run();assert.deepEqual(record.pageErrors,[]);record.status='PASS';}
 catch(error){record.status='FAIL';record.error=error.message;record.errorStack=error.stack;try{record.pageText=(await page.locator('body').innerText()).slice(-5000);}catch{}}
  finally{if(page&&!page.isClosed()){try{await page.screenshot({path:path.join(folder,name+'.png'),fullPage:false});record.screenshot=name+'.png';}catch{}}for(const companion of companionContexts.splice(0))await companion.close();await context?.close();context=null;page=null;persist();console.log(JSON.stringify({name,status:record.status,error:record.error}));}
}

try{
 fixture=await createProcessPlatformRound5Fixture();report.buildEntrySha256=fixture.buildEntrySha256;report.fixtureHash=fixture.fixtureHash;report.counts=fixture.counts;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.browser=browser.version();

 await test('form-save-leave-native-back',async()=>{
  const before=await prepare();await openForm();await page.locator('[data-field="name"]').fill('Latest unapplied input');const count=record.requests.length;
  await back();await decision();await choose('save');await ready('dashboard');assert.equal(await page.locator(dialog).count(),0);
  const saved=await fixture.readAuthoring();assert.notEqual(saved.workflow.saved.id,before.workflow.saved.id);assert.equal(op(saved.workflow.saved.content).name,'Latest unapplied input');assert.deepEqual(record.requests.slice(count).map(row=>row.action),['apply','save']);
  await nav('editor');await openForm();assert.equal(await page.locator('[data-field="name"]').inputValue(),'Latest unapplied input');record.result='Latest form input applied and saved once before the original browser-back destination; re-entry reads saved input.';
 });

 await test('form-discard-keeps-saved-native-back',async()=>{
  const before=await prepare();await openForm();await page.locator('[data-field="name"]').fill('Discard this unapplied input');const count=record.requests.length;
  await back();await decision();await choose('discard');await ready('dashboard');const after=await unchangedSaved(before);assert.deepEqual(after.workflow.working,before.workflow.working);assert.equal(record.requests.length,count);
  await nav('editor');await openForm();assert.equal(await page.locator('[data-field="name"]').inputValue(),'Departure saved baseline');record.result='Only the unapplied form was discarded; no write, saved draft/history preserved, discarded input absent on return.';
 });

 for(const applied of [false,true])await test('native-reload-cancel-'+(applied?'applied-unsaved':'unapplied-form'),async()=>{
  const before=await prepare(),name=applied?'Applied retained on reload cancel':'Unapplied retained on reload cancel';
  if(applied)await applyName(name);else{await openForm();await page.locator('[data-field="name"]').fill(name);}
  const count=record.requests.length;record.cancelNativeDeparture=true;
  const reload=await page.reload({waitUntil:'commit'}).then(()=>({navigated:true}),error=>({navigated:false,error:error.message}));
  assert.equal(reload.navigated,false,'Dismissing native beforeunload must cancel reload');assert(record.nativeDialogs?.some(row=>row.type==='beforeunload'&&row.dismissed));await sourceStillHere();assert.equal(await page.locator(dialog).count(),0);await unchangedSaved(before);assert.equal(record.requests.length,count);
  if(applied)assert.equal(op((await fixture.readAuthoring()).workflow.working).name,name);else assert.equal(await page.locator('[data-field="name"]').inputValue(),name);
  record.result='Native browser beforeunload was dismissed; reload cancelled, latest '+(applied?'applied working content':'unapplied form input')+' and prior Save preserved. This is the browser prompt, not the custom three-option dialog.';
 });

 for(const variant of [{lang:'zh',mobile:false},{lang:'vi',mobile:true}])await test('stay-focus-selection-'+variant.lang,async()=>{
  await prepare(variant);await openForm();const input=page.locator('[data-field="name"]');await input.fill('Keep this unsaved selection');await input.press('Home');for(let i=0;i<4;i++)await input.press('Shift+ArrowRight');
  const state=await input.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,scroll:el.closest('dialog').querySelector('.pe-modal-body').scrollTop,windowY:scrollY}));record.selectionBefore=state;
  await back();await decision();const expected=variant.lang==='zh'?['儲存草稿並離開','放棄未儲存變更並離開','留在本頁']:['Lưu bản nháp và rời đi','Bỏ thay đổi chưa lưu và rời đi','Ở lại trang này'];
  assert.deepEqual(await page.locator(dialog+' [data-departure-choice]').allTextContents(),expected);
  const layout=await page.locator(dialog).evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,viewport:innerWidth,buttons:[...el.querySelectorAll('button')].map(button=>({height:button.getBoundingClientRect().height,font:parseFloat(getComputedStyle(button).fontSize)}))}));record.layout=layout;assert(layout.left>=0&&layout.right<=layout.viewport+1);assert(layout.buttons.every(button=>button.height>=36&&button.font>=14));record.openDialogScreenshot=record.name+'-decision-open.png';await page.screenshot({path:path.join(folder,record.openDialogScreenshot),fullPage:false});
  await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await page.waitForFunction(()=>new URL(location.href).searchParams.get('view')==='editor');await waitFrames();await sourceStillHere();assert.equal(await input.inputValue(),'Keep this unsaved selection');
  const after=await input.evaluate(el=>({focused:document.activeElement===el,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,scroll:el.closest('dialog').querySelector('.pe-modal-body').scrollTop,windowY:scrollY}));record.selectionAfter=after;assert.equal(after.focused,true);assert.equal(after.start,state.start);assert.equal(after.end,state.end);assert.equal(after.direction,state.direction);assert(Math.abs(after.scroll-state.scroll)<=2);assert(Math.abs(after.windowY-state.windowY)<=2);
  await page.waitForTimeout(600);await sourceStillHere();assert.equal(new URL(page.url()).searchParams.get('view'),'editor');record.result='Stay restores focus, selection and observed scroll, preserves input and cancels old back intent.';
 });

 await test('applied-own-discard-sidebar',async()=>{
  const before=await prepare();await applyName('Own applied but unsaved');const count=record.requests.length;
  await sidebar('[data-view="dashboard"]');await decision();await choose('discard');await ready('dashboard');const after=await unchangedSaved(before);assert.deepEqual(after.workflow.working,before.workflow.working);assert.deepEqual(record.requests.slice(count).map(row=>row.action),['apply']);
  await nav('editor');assert.equal(op((await fixture.readAuthoring()).workflow.working).name,'Departure saved baseline');assert((await page.locator('.pe-card[data-node="photo-operation"] h3').innerText()).includes('Departure saved baseline'));record.result='Only the proven own Apply was reversed via one normal guarded Apply; saved draft and history remain.';
 });

 await test('own-discard-preserves-earlier-coworker-working',async()=>{
  const before=await prepare();await coworkerApplyC('Coworker C shared unsaved content');await page.reload();await ready('editor');await applyName('Own A applied after coworker');
  await sidebar('[data-view="dashboard"]');await decision();await choose('discard');await ready('dashboard');const after=await unchangedSaved(before);assert.equal(op(after.workflow.working).name,'Departure saved baseline');assert.equal(after.workflow.working.workspaces.find(w=>w.line==='C').stages['C-CUT'][0].name,'Coworker C shared unsaved content');
  await nav('editor');await openForm();assert.equal(await page.locator('[data-field="name"]').inputValue(),'Departure saved baseline');record.result='Discard reverses this editing session only; earlier coworker shared content, manual Save, and history remain.';
 });

 await test('later-coworker-write-refuses-unsafe-discard',async()=>{
  const before=await prepare();await coworkerApplyC('Later coworker C write',()=>applyName('Own A before foreign write'));
  await page.waitForFunction(()=>ProcessAuthoringV3.flow().working.workspaces.find(w=>w.line==='C').stages['C-CUT'][0].name==='Later coworker C write');const count=record.requests.length;
  await sidebar('[data-view="dashboard"]');await decision();assert.equal(await page.locator(choice('discard')).isDisabled(),true);await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await sourceStillHere();const after=await unchangedSaved(before);assert.equal(op(after.workflow.working).name,'Own A before foreign write');assert.equal(after.workflow.working.workspaces.find(w=>w.line==='C').stages['C-CUT'][0].name,'Later coworker C write');assert.equal(record.requests.length,count);record.result='A later foreign write breaks the proof chain; unsafe discard is disabled and both users\' work remains.';
 });

 await test('canvas-save-internal-line-selection',async()=>{
  const before=await prepare();await move();assert.equal(op((await fixture.readAuthoring()).workflow.working).x,80);
  await page.locator('#editor-line-select').selectOption('C');await decision();assert.equal(await page.locator('#editor-line-select').inputValue(),'A');await choose('stay');await page.locator(dialog).waitFor({state:'detached'});assert.equal(await page.locator('#editor-line-select').inputValue(),'A');assert.equal(await page.evaluate(()=>ProcessCanvasLocal.dirty()),true);
  await page.locator('#editor-line-select').selectOption('C');await decision();const count=record.requests.length;await choose('save');await page.waitForFunction(()=>document.querySelector('#editor-line-select')?.value==='C'&&!!document.querySelector('.pe-card[data-node="round5-c-operation"]'));
  const after=await fixture.readAuthoring();assert.equal(op(after.workflow.saved.content).x,100);assert.notEqual(after.workflow.saved.id,before.workflow.saved.id);assert.deepEqual(record.requests.slice(count).map(row=>row.action),['apply','save']);assert.equal(await page.evaluate(()=>ProcessCanvasLocal.dirty()),false);record.result='Internal line change is held by the same decision; latest canvas movement is synchronized and saved before switching.';
 });

 await test('canvas-discard-system-switch',async()=>{
  const before=await prepare();await move();const count=record.requests.length;await sidebar('.system-switcher');await decision();await choose('discard');await ready('quality-dashboard');const after=await unchangedSaved(before);assert.deepEqual(after.workflow.working,before.workflow.working);assert.equal(record.requests.length,count);
  await nav('editor');assert.equal(await page.evaluate(()=>ProcessCanvasLocal.dirty()),false);assert.equal(op((await fixture.readAuthoring()).workflow.working).x,80);record.result='Unsynchronized canvas movement discarded without writing; system switch succeeds and no old move reappears.';
 });

 await test('rapid-browser-history-single-decision',async()=>{
  await prepare({historyPlayer:true});await move();await back();await decision();await back();await decision();await page.goForward({waitUntil:'commit'});await decision();assert.equal(await page.locator(dialog).count(),1);
  await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await page.waitForTimeout(600);await sourceStillHere();assert.equal(new URL(page.url()).searchParams.get('view'),'editor');
  await back();await decision();await choose('discard');await ready('player');await page.goForward({waitUntil:'commit'});await ready('editor');assert.equal(await page.locator(dialog).count(),0);record.result='Back/back/forward keeps one decision; Stay restores editor history position, next back and forward work without stale intent.';
 });

 for(const status of [403,409])await test('save-'+status+'-retains-latest-input',async()=>{
  const before=await prepare();await openForm();await page.locator('[data-field="name"]').fill('Input retained after '+status);let rejected=0;
  await page.route('**/api/process-authoring/workflow*',route=>{if(route.request().method()==='POST'&&actionOf(route.request())==='save'){rejected++;return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:status===403?'FORBIDDEN':'DRAFT_REVISION_CHANGED_RECONFIRM'})});}return route.continue();});
  await back();await decision();await choose('save');await page.waitForFunction(()=>!!document.querySelector('[data-departure-error]')?.textContent.trim());await sourceStillHere();await unchangedSaved(before);assert.equal(await page.locator('[data-field="name"]').inputValue(),'Input retained after '+status);assert.equal(rejected,1);
  await page.waitForTimeout(700);assert.equal(rejected,1);await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await sourceStillHere();record.result='Injected Save '+status+' leaves source and latest input intact, preserves saved snapshot, and does not retry automatically.';
 });

 await test('save-offline-unknown-no-automatic-retry',async()=>{
  const before=await prepare();await applyName('Applied before offline Save');await sidebar('[data-view="dashboard"]');await decision();const count=record.requests.length;await context.setOffline(true);await choose('save');
  await page.waitForFunction(()=>!!document.querySelector('[data-departure-error]')?.textContent.trim());await sourceStillHere();await unchangedSaved(before);assert.equal(op((await fixture.readAuthoring()).workflow.working).name,'Applied before offline Save');await context.setOffline(false);await page.waitForTimeout(700);
  assert(record.requests.slice(count).filter(row=>row.action==='save').length<=1);assert.equal(await page.locator(choice('discard')).isDisabled(),true);await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await sourceStillHere();record.result='Offline result is not treated as saved; acknowledged working input and prior Save persist, no automatic replay after reconnect.';
 });

 for(const missingReceipt of [false,true])await test('inverse-unknown-reload-readonly-'+(missingReceipt?'receipt-404':'receipt-found'),async()=>{
  const before=await prepare();await applyName('Own change to reverse with lost reply');let inverseLost=false,receiptReads=0,recoveryLookup=false;
  await page.route('**/api/process-authoring/workflow*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!inverseLost&&request.method()==='POST'&&actionOf(request)==='apply'){
    inverseLost=true;const actual=await route.fetch();assert.equal(actual.status(),200);await actual.body();return route.abort('failed');
   }
   if(request.method()==='GET'&&url.searchParams.has('operationId')){
    receiptReads++;if(!recoveryLookup)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"INJECTED_RECEIPT_LOOKUP_UNAVAILABLE"}'});if(missingReceipt)return route.fulfill({status:404,contentType:'application/json',body:'{"error":"OPERATION_NOT_FOUND"}'});
   }
   return route.continue();
  });
  await sidebar('[data-view="dashboard"]');await decision();await choose('discard');await page.waitForFunction(()=>!!document.querySelector('[data-departure-error]')?.textContent.trim());assert(inverseLost);await sourceStillHere();
  const persisted=await unchangedSaved(before);assert.deepEqual(persisted.workflow.working,before.workflow.working);await choose('stay');await page.locator(dialog).waitFor({state:'detached'});await page.waitForFunction(()=>new URL(location.href).searchParams.get('view')==='editor');
  const writes=record.requests.length;recoveryLookup=true;await page.reload();await ready('editor');const retry=page.locator('[data-av3="retry"]');await retry.filter({hasText:'核對放棄結果'}).waitFor();const beforeNative=record.nativeDialogs?.length||0;
  const receipt=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/process-authoring/workflow'&&url.searchParams.has('operationId');});await retry.click();const response=await receipt;assert.equal(response.status(),missingReceipt?404:200);await response.finished();await page.waitForTimeout(700);
  assert(receiptReads>=1);assert.equal(record.requests.length,writes,'Reload and receipt verification must not resend inverse or Save');assert(!(record.nativeDialogs||[]).slice(beforeNative).some(row=>row.type==='confirm'),'Inverse recovery must not offer generic write retry');await unchangedSaved(before);assert.deepEqual((await fixture.readAuthoring()).workflow.working,before.workflow.working);await sourceStillHere();
  record.recoveryState=await page.evaluate(()=>ProcessAuthoringV3.navigation.departure.inspect());assert.notEqual(record.recoveryState.state,'clean');if(missingReceipt){assert.equal(await page.locator('[data-av3="retry"]').filter({hasText:'核對放棄結果'}).count(),1);assert.equal(await page.evaluate(()=>ProcessAuthoringV3.ownedLedger.hasRevertRecovery()),true);assert.equal(record.recoveryState.canSave,false);}else{assert.equal(await page.evaluate(()=>ProcessAuthoringV3.ownedLedger.hasRevertRecovery()),false);assert.equal(record.recoveryState.canSave,true);assert.equal(record.recoveryState.canDiscard,false);assert(record.recoveryState.reason.includes('重新載入'));}
  record.result='A real inverse Apply reached the isolated Worker, its browser reply was lost and the initial automatic receipt lookup was unavailable (injected 503), then native reload was accepted. Original receipt '+(missingReceipt?'404 stays unresolved':'was read')+'; no inverse POST, Save or generic retry confirmation followed reload/recovery.';
 });

 await test('already-saving-navigation-recovers-after-ack',async()=>{
  await prepare();await applyName('Save already in flight');let release,seen;const held=new Promise(resolve=>seen=resolve),gate=new Promise(resolve=>release=resolve);let count=0;
  await page.route('**/api/process-authoring/workflow*',async route=>{if(route.request().method()==='POST'&&actionOf(route.request())==='save'){count++;seen();await gate;}await route.continue();});
  try{await page.locator('[data-av3="save"]').click();await held;await sidebar('[data-view="dashboard"]');await decision();assert.equal(await page.locator(choice('save')).isDisabled(),true);release();await page.waitForFunction(()=>document.querySelector('[data-departure-choice="save"]')?.disabled===false);await choose('save');await ready('dashboard');assert.equal(count,1);assert.equal(op((await fixture.readAuthoring()).workflow.saved.content).name,'Save already in flight');record.result='A decision opened while Save was busy becomes actionable after ACK; continue reaches the destination without a second Save or stranded disabled dialog.';}finally{release();}
 });

 await test('readonly-album-native-back-needs-no-decision',async()=>{
  const before=await prepare();await page.locator('.pe-card[data-node="photo-operation"] [data-pe="album"]').click();await page.locator('dialog.pe-album[open]').waitFor();const count=record.requests.length;
  await back();await ready('dashboard');assert.equal(await page.locator(dialog).count(),0);assert.equal(await page.locator('dialog.pe-album[open]').count(),0);await unchangedSaved(before);assert.equal(record.requests.length,count);record.result='A clean readonly album closes only after successful destination commit; no dirty confirmation or write.';
 });

 await test('readonly-album-kept-on-target-403',async()=>{
  await prepare();await page.locator('.pe-card[data-node="photo-operation"] [data-pe="album"]').click();await page.locator('dialog.pe-album[open]').waitFor();
  await page.route('**/api/process-bootstrap*',route=>new URL(route.request().url()).searchParams.get('view')==='dashboard'?route.fulfill({status:403,contentType:'application/json',body:'{"error":"FORBIDDEN"}'}):route.continue());
  const rejected=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/process-bootstrap'&&response.status()===403);await back();await rejected;await page.waitForFunction(()=>new URL(location.href).searchParams.get('view')==='editor');await sourceStillHere();assert.equal(await page.locator('dialog.pe-album[open]').count(),1);assert.equal(await page.locator(dialog).count(),0);record.result='Failed target preparation preserves the source readonly viewer and restores its history position.';
 });

 report.status=report.stoppedAfterCase?'STOPPED_AT_CASE_BOUNDARY':report.cases.length&&report.cases.every(row=>row.status==='PASS')?'PASS':'FAIL';if(report.status!=='PASS')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{for(const companion of companionContexts.splice(0))await companion.close();await context?.close();await browser?.close();await fixture?.close();persist();}
