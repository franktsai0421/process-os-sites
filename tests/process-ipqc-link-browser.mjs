// Native Chromium production editor/controllers + actual signed route port.
// Generated in-memory SQLite/R2 only. This is a module harness, not a hosted SPA/site.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('./process-ipqc-link-fixture.cjs'),{chromium}=require('playwright');
const out=process.env.IPQC_LINK_UI_OUT||'/tmp/process-ipqc-link-ui';fs.mkdirSync(out,{recursive:true});
const scripts=['shared-draft-client.js','local-draft-recovery.js','local-draft-recovery-session.js','master-shared-client.js','editor-graph.js','canvas-recovery-store.js','canvas-local.js','process-authoring-v3.js','process-editor.js','process-ipqc.js'];
const f=await fixture('records-v1');let browser;const report={kind:'ISOLATED_NATIVE_MODULE_UI',assertions:[],errors:[],sources:[]};
try{
 for(const source of ['AB','C']){const created=await f.create(source);await f.promote(created.url);report.sources.push({source,errorId:created.error.id,itemId:created.item.id});}
 await f.generatedMasterPages();report.masterSource='generated-page-v1-approved-owners (not an adoption/approval UI claim)';
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const {line,lang,width} of [{line:'A',lang:'zh',width:1440},{line:'C',lang:'vi',width:390}]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();let who='editor',hold=null,heldReady=null,loseSave=false,hideReceipt=false;const waits=[];
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.pathname.startsWith('/api/')){if(hideReceipt&&u.searchParams.has('operationId')){await route.fulfill({status:404,contentType:'application/json',body:'{"error":"OPERATION_NOT_FOUND"}'});return;}if(hold&&u.pathname==='/api/process-ipqc'){hold=null;await new Promise(resolve=>{waits.push(resolve);heldReady?.();});}const r=await f.request(u.pathname+u.search,route.request().method(),route.request().postDataJSON()||undefined,who);if(loseSave&&u.pathname==='/api/process-authoring/workflow'&&route.request().method()==='POST'){loseSave=false;hideReceipt=true;await route.abort('failed');return;}await route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)});return;}
   if(u.pathname.startsWith('/process/')&&/\.(mjs|js|css)$/.test(u.pathname)){await route.fulfill({contentType:u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync('public'+u.pathname,'utf8')});return;}
   await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/process-editor.css"><link rel="stylesheet" href="/process/process-ipqc.css"></head><body><main id="fixture"></main></body></html>`});
  });
  async function boot(){await page.goto('https://fixture.invalid/fixture');assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');await page.evaluate(async({line,master,who})=>{
   window.ProcessOwnedDraft=await import('/process/owned-draft-ledger.mjs');window.ProcessSync={identity:{id:'link-'+who},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>({})};
   window.state={view:'editor',category:'SYN',editorLine:line,editorByCategory:{},approvalTab:'master'};window.processMaster={};window.escapeHtml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');window.editorKey=()=>state.category+':'+state.editorLine;window.ensureCategoryEditor=()=>state.editorByCategory[editorKey()]||{};
   window.bindView=()=>{};window.renderInspector=()=>{};window.render=()=>{};window.toast=()=>{};window.editor=()=>'';window.currentUser={id:'link-'+who,role:'staff',lines:['A','C']};window.hasPermission=()=>true;window.operationWorkMediaItems=o=>o.mediaItems||[];window.operationProductMediaItems=()=>[];
   window.productsForCategory=()=>master.active[line==='C'?'C':'AB'].products;window.routeFor=code=>productsForCategory().find(p=>p.code===code);window.lineFor=()=>master.active[line==='C'?'C':'AB'].lines.find(l=>l.code===line);window.stageFor=code=>({code,name:code});window.categoryStageCodes=()=>[line==='C'?'TIEN':'A-CUT'];localStorage.setItem('processAuthoringControl','enabled');
  },{line,master:f.master,who});
   for(const file of scripts)await page.addScriptTag({url:'https://fixture.invalid/process/'+file});
   await page.evaluate(async()=>{await ProcessAuthoringV3.load();ProcessCanvasLocal.accept(ProcessAuthoringV3.flow());await ProcessCanvasLocal.recoveryReady();ProcessEditorV2.workspace();});
  }
  const open=async(id='one')=>{await page.evaluate(id=>{const stage=state.editorLine==='C'?'TIEN':'A-CUT';ProcessOpenOperation(ensureCategoryEditor()[stage].find(o=>o.id===id));},id);await page.locator('[data-tab="ipqc"]').click();await page.locator('[data-ipqc-choice]').first().waitFor({state:'attached'});await page.locator('.process-ipqc-group > summary').first().click();await page.locator('[data-ipqc-choice]').first().waitFor();};
  const cancel=async()=>{await page.locator('[data-pe="cancel"]').click();const discard=page.locator('.pe-close-confirm [data-pe="discard"]');if(await discard.count())await discard.click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});};
  const save=async()=>assert.equal(await page.evaluate(()=>ProcessAuthoringV3.save()),true);
  await boot();await open();assert.equal(await page.locator('[data-c-query]').count(),0);await page.locator('.process-ipqc-group').first().evaluate(el=>el.open=true);
  const c=page.locator('[data-ipqc-choice]').first();assert.equal(await c.isChecked(),false);await c.check();assert.match(await page.locator('.process-ipqc-choice').first().innerText(),lang==='zh'?/本方塊已選取/:/Đã chọn/);await page.locator('[data-tab="basic"]').click();await page.locator('[data-tab="ipqc"]').click();await page.locator('.process-ipqc-group > summary').first().click();assert(await c.isChecked());
  await page.screenshot({path:out+'/'+line+'-selected-'+width+'.png',fullPage:true});await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});
  const before=(await f.request('/api/process-authoring/workflow')).body.control.workflow;assert.equal(before.working.workspaces.find(w=>w.line===line).stages[line==='C'?'TIEN':'A-CUT'][0].ipqcAssignments.length,0,'completion is local');await save();await boot();await open();assert(await c.isChecked());assert.equal(await c.isDisabled(),false);await cancel();
  await open('two');assert(await c.isDisabled());assert.match(await page.locator('.process-ipqc-owner').innerText(),new RegExp(line+'-one'));await page.screenshot({path:out+'/'+line+'-occupied-'+width+'.png',fullPage:true});await cancel();
  await open();await page.locator('.process-ipqc-group').first().evaluate(el=>el.open=true);await c.uncheck();await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await open('two');assert(await c.isDisabled(),'local release remains occupied until Save');await cancel();await save();await open('two');assert.equal(await c.isDisabled(),false);await page.locator('.process-ipqc-group').first().evaluate(el=>el.open=true);await c.check();await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await save();
  await boot();await open('two');assert(await c.isChecked());await cancel();report.assertions.push(line+': real checkbox/tab retention/completion-local/atomic Save/reload/self/peer/saved-release transfer PASS');
  // A genuinely new login session (the fixture login route generated both signed sessions).
  who='peer';await boot();await open('two');assert(await c.isChecked());await cancel();report.assertions.push(line+': different signed actor/session sees persisted choice PASS');
  if(line==='C'){
   await open('two');await page.locator('.process-ipqc-group').first().evaluate(el=>el.open=true);await c.uncheck();await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});const posts=f.trace.filter(row=>row.url.startsWith('/api/process-authoring/workflow')&&row.method==='POST').length;loseSave=true;assert.equal(await page.evaluate(()=>ProcessAuthoringV3.save()),false);assert(await page.evaluate(()=>ProcessCanvasLocal.pending()));assert.equal(f.trace.filter(row=>row.url.startsWith('/api/process-authoring/workflow')&&row.method==='POST').length,posts+1);
   hideReceipt=false;await save();assert.equal(f.trace.filter(row=>row.url.startsWith('/api/process-authoring/workflow')&&row.method==='POST').length,posts+1,'explicit UNKNOWN recovery only reads the original receipt');assert.equal(await page.evaluate(()=>!!ProcessCanvasLocal.pending()),false);await boot();await open('two');assert.equal(await c.isChecked(),false);await page.locator('.process-ipqc-group').first().evaluate(el=>el.open=true);await c.check();await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await save();report.assertions.push('C: committed checkbox Save with lost ACK/receipt404 stays UNKNOWN, original receipt resolves with zero POST replay, reload preserves result PASS');
  }
  await page.evaluate(()=>{const stage=state.editorLine==='C'?'TIEN':'A-CUT';ProcessOpenOperation(ensureCategoryEditor()[stage][0]);});const held=new Promise(resolve=>heldReady=resolve);hold=true;await page.locator('[data-tab="ipqc"]').click();await held;await page.waitForFunction(()=>document.querySelector('.pe-ipqc')?.textContent.includes('…'));await page.locator('[data-tab="basic"]').click();for(const resolve of waits.splice(0))resolve();await page.waitForTimeout(50);assert.equal(await page.locator('[data-ipqc-choice]').count(),0);await cancel();report.assertions.push(line+': late source response after tab change cannot paint another tab PASS');
  // A new source item is created and approved through the actual signed routes.
  // The previously assigned stable item is unchanged but belongs to a newer whole-source version.
  const source=line==='C'?'C':'AB',extra=await f.create(source);await f.promote(extra.url);
  await boot();await open('two');assert(await c.isChecked());assert.equal(await c.locator('..').locator('..').getAttribute('data-status'),'retained');
  assert.equal(await page.locator('[data-ipqc-count="selected"]').innerText(),'0');assert.equal(await page.locator('[data-ipqc-count="retained"]').innerText(),'1');assert.equal(await page.locator('[data-ipqc-warning][data-ipqc-reasons="version"]').count(),1);
  assert.equal(await page.locator('.process-ipqc-group').first().getAttribute('data-complete'),'false');await page.screenshot({path:out+'/'+line+'-retained-'+width+'.png',fullPage:true});
  await c.uncheck();assert.equal(await page.locator('[data-ipqc-warning]').count(),0);await c.check();assert.equal(await page.locator('[data-ipqc-warning]').count(),0);assert.equal(await page.locator('[data-ipqc-count="retained"]').innerText(),'0');
  const badge=page.locator('.process-ipqc-badge.selected').first();await badge.focus();await page.screenshot({path:out+'/'+line+'-reselected-'+width+'.png',fullPage:true});
  const overflow=await page.locator('.pe-modal-body').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'source version text fits narrow/desktop modal');
  await page.locator('#apply-operation').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});await save();await boot();await open('two');assert(await c.isChecked());assert.equal(await page.locator('[data-ipqc-warning]').count(),0);assert.equal(await page.locator('[data-ipqc-count="selected"]').innerText(),'1');await cancel();
  report.assertions.push(line+': real newer source approval → retained historical pin → explicit reselect clears warning → atomic Save/reload current PASS');
  if(line==='C'){
   // Separate generated legacy edge case: a product moved category but retained its historical owner.
   const values=await f.values(),control=JSON.parse(values.processAuthoringControl),working=control.workflow.working,original=working.workspaces.find(w=>w.line==='C');
   const legacy=structuredClone(original);legacy.id=JSON.stringify(['LEGACY','C']);legacy.category='LEGACY';legacy.stages.TIEN[0].number='LEGACY-C-OWNER';legacy.stages.TIEN[0].name='Synthetic historical owner';legacy.stages.TIEN[0].ipqcAssignments=structuredClone(original.stages.TIEN[1].ipqcAssignments);legacy.stages.TIEN[1].ipqcAssignments=[];
   original.stages.TIEN.forEach(o=>o.ipqcAssignments=[]);working.workspaces.push(legacy);control.workflow.saved.content=structuredClone(working);control.versions.find(v=>v.status==='draft').snapshot=structuredClone(working);values.processAuthoringControl=JSON.stringify(control);
   const encoded=await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,values);
   // Use the fixture's own R2 adapter; the actual business routes still authorize all reads/writes.
   f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);
   await boot();await open();assert(await c.isDisabled());assert.match(await page.locator('.process-ipqc-owner').innerText(),/LEGACY-C-OWNER/);await page.screenshot({path:out+'/C-cross-workspace-owner-390.png',fullPage:true});await cancel();report.assertions.push('C: generated legacy cross-category owner with colliding operation ID remains visibly occupied PASS');
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure={name:error.name,message:error.message};throw error;}finally{await browser?.close();f.close();fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
