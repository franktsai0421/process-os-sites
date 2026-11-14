// Native Chromium + production controller, dialogs and transport. Signed real
// handlers use generated, memory-only SQLite/R2 fixtures; no deployed Site.
import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setup} from './canvas-approved-history-fixture.mjs';
const out='.sites-runtime/process-review-recovery';fs.mkdirSync(out,{recursive:true});
const report={commit:process.env.PROCESS_PROGRAM_COMMIT,scope:'native isolated module UI and signed handlers',cases:[],limits:['Not compiled full SPA or test-Site acceptance.','Viewport simulation is not a physical phone.']};
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PROCESS_REVIEW_CHROMIUM?{executablePath:process.env.PROCESS_REVIEW_CHROMIUM}:{})});
 for(const config of [{width:1440,height:1000,lang:'zh'},{width:390,height:844,lang:'vi'}]){
  const f=await setup({pending:true,user:{id:'qa-native-'+crypto.randomUUID(),name:'Generated nonprimary admin'}}),context=await browser.newContext({viewport:{width:config.width,height:config.height}}),page=await context.newPage(),requests=[];let fault=false,inquiry=false;
  try{
   page.on('dialog',dialog=>dialog.accept());
   const route=f.f.load('app/api/process-authoring/workflow/route.ts');
   await page.route('**/*',async r=>{const request=r.request(),url=new URL(request.url());
    if(url.pathname.startsWith('/api/')){const method=request.method(),body=request.postData(),cmd=body&&JSON.parse(body).command;requests.push({method,url:url.pathname+url.search,command:cmd});
     if(inquiry&&url.searchParams.has('operationId')){await r.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});return;}
     const response=await route[method](new Request(url,{method,headers:f.f.headers,...(body?{body}:{})}));
     if(fault&&cmd?.action==='withdraw'){assert.equal(response.status,200);await r.abort('failed');return;}
     await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});return;
    }
    await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="'+config.lang+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fs.readFileSync('public/process/styles.css','utf8')+fs.readFileSync('public/process/version-draft-ui.css','utf8')+'body{font:16px system-ui;margin:16px}.button{padding:12px;margin:4px}.toolbar{display:flex;flex-wrap:wrap}code{overflow-wrap:anywhere}dialog{max-width:calc(100vw - 48px);box-sizing:border-box}textarea{max-width:100%;box-sizing:border-box}</style><main id="view-root"><section class="approval-page"><section id="approval-panel-process"></section></section></main></html>'});
   });
   await page.goto('https://fixture.invalid/process/');
   await page.evaluate(user=>{localStorage.setItem('processAuthoringControl','{}');window.state={view:'approval',approvalTab:'process',category:'G',editorLine:'A',editorByCategory:{}};window.ProcessSync={identity:user,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:d=>d===1,platformHeaders:()=>({})};window.ProcessCanvasLocal={accept(){},dirty:()=>false,resetClean(){},update(){}};window.ProcessEditorV2={interacting:()=>false};window.createMasterSharedBridge=()=>({diff:()=>({patches:[],guards:[]})});window.editorKey=()=> 'G:A';window.ensureCategoryEditor=()=>state.editorByCategory['G:A']||{};window.bindView=()=>{};window.renderInspector=()=>{};window.toast=()=>{};window.escapeHtml=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');window.render=()=>{document.querySelector('#view-root').innerHTML=state.view==='approval'?'<section class="approval-page"><section id="approval-panel-process"></section></section>':'<p>DESTINATION</p>';bindView();};},f.f.user);
   for(const file of ['shared-draft-client','version-draft-ui','process-authoring-v3'])await page.addScriptTag({content:fs.readFileSync('public/process/'+file+'.js','utf8')});
   await page.locator('[data-process-review=withdraw]').waitFor();
   const dialog=()=>page.locator('dialog[open]');const writes=()=>requests.filter(r=>r.method==='POST').length;
   const count=writes();await page.locator('[data-process-review=withdraw]').click();await dialog().locator('[data-cancel]').click();assert.equal(writes(),count);assert.equal(await page.evaluate(()=>ProcessAuthoringV3.flow().pendingId),'pending-case');
   // Real View -> real review overlay -> real confirmation dialog -> signed API.
   await page.locator('[data-process-review=view]').click();await page.locator('[data-history-review=approve]').click();await dialog().locator('textarea').fill('Generated native approval');await dialog().locator('button[type=submit]').click();
   await page.waitForFunction(()=>ProcessAuthoringV3.flow()?.pendingId===null);assert.equal(writes(),count+1);assert.equal(await page.evaluate(()=>ProcessAuthoringV3.flow().active.id),'pending-case');
   await page.screenshot({path:out+'/approved-'+config.width+'.png',fullPage:true});
   // Reset only this generated fixture to a fresh pending case, then prove the
   // exact UI recovery entry survives a committed write and missing response.
   const initial=f.f.values.processAuthoringControl;await f.f.mutateValues(v=>v.processAuthoringControl=initial);await page.reload();
   await page.evaluate(user=>{localStorage.setItem('processAuthoringControl','{}');window.__qaUser=user;},f.f.user);
   // Use the original bootstrap and current assets in a fresh native JS realm.
   const scripts=await page.content();assert(scripts.includes('approval-panel-process')); // root exists before boot
   // Reuse the explicitly captured bootstrap in this test, without shared runtime.
   await page.evaluate(user=>{window.state={view:'approval',approvalTab:'process',category:'G',editorLine:'A',editorByCategory:{}};window.ProcessSync={identity:user,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:d=>d===1,platformHeaders:()=>({})};window.ProcessCanvasLocal={accept(){},dirty:()=>false,resetClean(){},update(){}};window.createMasterSharedBridge=()=>({diff:()=>({patches:[],guards:[]})});window.editorKey=()=> 'G:A';window.ensureCategoryEditor=()=>({});window.bindView=()=>{};window.renderInspector=()=>{};window.toast=()=>{};window.escapeHtml=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;');window.render=()=>{document.querySelector('#view-root').innerHTML='<section class="approval-page"><section id="approval-panel-process"></section></section>';bindView();};},f.f.user);
   for(const file of ['shared-draft-client','version-draft-ui','process-authoring-v3'])await page.addScriptTag({content:fs.readFileSync('public/process/'+file+'.js','utf8')});
   await page.locator('[data-process-review=withdraw]').waitFor();fault=true;inquiry=true;const before=writes();await page.locator('[data-process-review=withdraw]').click();await dialog().locator('textarea').fill('Generated native withdrawal');await dialog().locator('button[type=submit]').click();await page.locator('[data-process-review=receipt]').waitFor();assert.equal(writes(),before+1);
   const sent=requests.filter(r=>r.command?.action==='withdraw').at(-1).command.operationId;assert((await page.locator('#authoring-v3-review').innerText()).includes(sent));await page.locator('[data-process-review=receipt]').click();await page.waitForFunction(()=>!document.querySelector('[data-process-review=receipt]').disabled);assert.equal(writes(),before+1);assert.equal(await page.evaluate(()=>sharedDraftAccountState().unknown),true);
   await page.screenshot({path:out+'/unknown-'+config.width+'.png',fullPage:true});inquiry=false;await page.locator('[data-process-review=receipt]').click();await page.waitForFunction(()=>!sharedDraftAccountState().unknown);assert.equal(writes(),before+1);assert.equal(await page.evaluate(()=>ProcessAuthoringV3.flow().pendingId),null);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.cases.push({viewport:config,approval:'PASS',withdrawCancel:'PASS',unknown404:'PASS',originalReceipt:'PASS',zeroReplay:'PASS',operationId:sent});
  }catch(error){report.screenText=(await page.locator('body').innerText()).slice(0,10000);await page.screenshot({path:out+'/failure-'+config.width+'.png',fullPage:true});throw error;}finally{await context.close();f.close();}
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
