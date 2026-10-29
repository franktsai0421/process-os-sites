import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const report={sourceCommit:process.env.PROCESS_PROGRAM_COMMIT,isolated:true,cases:[],errors:[],deniedReads:[]};
let fixture,browser,diagnosticPage;
try {
 fixture=await createProcessMasterFixture();
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const origin=fixture.url.origin,entry=origin+'/process/?view=data&dataTab=process-master';
 const login=async actor=>{
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();diagnosticPage=page;page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{if(response.status()===403)report.deniedReads.push(new URL(response.url()).pathname);});
  await page.goto(origin+'/login?view=data&dataTab=process-master');
  await page.locator('#id').fill(actor);await page.locator('#password').fill(fixture.password);
  await page.locator('.site-entry-submit').click();await page.locator('[data-master-name]').first().waitFor();
  return page;
 };
 const read=async(page,history=false)=>{const response=await page.request.get(origin+'/api/master/workflow?scope=PROCESS'+(history?'&history=1':''));assert.equal(response.status(),200);return response.json();};
 const flow=async page=>(await read(page)).control.workflow;
 const pass=(name)=>report.cases.push({name,status:'PASS'});
 const dialog=page=>page.locator('.vd-confirm[open]');
 const confirm=async(page,reason)=>{const d=dialog(page);await d.waitFor();await d.locator('textarea').fill(reason);if(await d.locator('input[type=checkbox]').count())await d.locator('input[type=checkbox]').check();await d.locator('button[type=submit]').click();await d.waitFor({state:'detached'});};
 const cancelUnchanged=async(page,selector)=>{
  const before=await read(page);let writes=0;
  const listener=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/master/workflow')writes++;};
  page.on('request',listener);
  try{await page.locator(selector).click();await dialog(page).locator('[data-cancel]').click();await dialog(page).waitFor({state:'detached'});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const after=await read(page);assert.equal(after.revision,before.revision);assert.deepEqual(after.control.workflow,before.control.workflow);assert.equal(writes,0);}finally{page.off('request',listener);}
 };
 const saveName=async(page,name)=>{
  await page.locator('[data-master-name]').first().fill(name);
  await page.locator('#save-master-data').click();
  await page.waitForFunction(value=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content||{}).flat().some(row=>row.name===value),name);
 };
 const submit=async page=>{await page.locator('#process-master-submit').click();await confirm(page,'隔離按鈕送審');await page.waitForFunction(()=>!!MasterDataWorkflow.shared.flow('PROCESS').pendingId);};
 const editor=await login('editor');await editor.locator('#process-master-new-draft').click();await editor.locator('#add-master-template').waitFor();
 await saveName(editor,'按鈕驗收送審名稱');
 const image=pngFixture({width:320,height:160,alpha:true});
 await editor.locator('.master-template-upload input').first().setInputFiles({name:'review-synthetic.png',mimeType:'image/png',buffer:image});
 await editor.waitForFunction(()=>document.querySelector('.photo-template:first-child .master-template-media-grid img')?.naturalWidth===320);
 await editor.locator('#save-master-data').click();await editor.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved.content).flat().some(row=>row.mediaItems?.length===1));
 await cancelUnchanged(editor,'#process-master-submit');pass('submit cancel sends no mutation and preserves saved content');
 await submit(editor);await cancelUnchanged(editor,'#process-master-withdraw');pass('withdraw cancel keeps the same pending case and lock');
 await editor.locator('#process-master-review').click();await editor.locator('[data-review-action=approve]').waitFor();
 assert.equal(await editor.locator('[data-review-action=approve]').isDisabled(),true);assert.equal(await editor.locator('[data-review-action=return]').isDisabled(),true);pass('submitter without review permissions cannot use approve or return buttons');
 const reviewer=await login('reviewer');await reviewer.locator('#process-master-review').click();await reviewer.locator('[data-review-action=return]').waitFor();
 await reviewer.locator('#master-case-diff').click();await reviewer.waitForFunction(()=>document.querySelector('.master-diff-scroll')?.textContent.includes('按鈕驗收送審名稱'));await reviewer.locator('#master-case-diff').click();assert.equal(await reviewer.locator('.master-diff-scroll').count(),0);await reviewer.locator('#master-review-refresh').click();await reviewer.waitForFunction(()=>!document.querySelector('#master-review-refresh')?.disabled);await reviewer.locator('[data-review-action=return]').waitFor();pass('review diff expand collapse and refresh keep the authorized pending case');
 const submitted=await flow(reviewer);const current=submitted.cases.find(row=>row.id===submitted.pendingId);
 assert.ok(Object.values(current.content).flat().some(row=>row.name==='按鈕驗收送審名稱'&&row.mediaItems?.length===1));
 await cancelUnchanged(reviewer,'[data-review-action=return]');pass('independent reviewer return cancel preserves pending content and revision');
 await reviewer.locator('[data-review-action=return]').click();await confirm(reviewer,'請修正名稱');await reviewer.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);
 await editor.goto(entry);await editor.locator('#save-master-data').waitFor();await saveName(editor,'退回後按鈕驗收修訂');await submit(editor);pass('independent reviewer returns; submitter can edit save and resubmit in browser');
 await reviewer.goto(entry);await reviewer.locator('#process-master-review').click();await reviewer.locator('[data-review-action=approve]').waitFor();
 await cancelUnchanged(reviewer,'[data-review-action=approve]');pass('independent reviewer approve cancel sends no mutation');
 await reviewer.locator('[data-review-action=approve]').click();assert.equal(await dialog(reviewer).locator('input[type=checkbox]').count(),0);await confirm(reviewer,'獨立審核通過');await reviewer.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);
 await editor.goto(entry);await editor.locator('#process-master-new-draft').waitFor();assert.equal(await editor.locator('[data-master-name]').first().inputValue(),'退回後按鈕驗收修訂');await editor.waitForFunction(()=>document.querySelector('.photo-template:first-child .master-template-media-grid img')?.naturalWidth===320);
 const approved=(await read(editor,true)).control.workflow;assert.ok(approved.cases.some(row=>row.status==='returned'));assert.ok(approved.cases.some(row=>row.status==='approved'));pass('independent reviewer approval updates name and photo after reload with returned history retained');
 await reviewer.locator('[data-review-mode=history]').click();await reviewer.waitForFunction(()=>document.querySelectorAll('[data-master-review]').length>=2);await reviewer.locator('[data-review-mode=pending]').click();assert.equal(await reviewer.locator('[data-master-review]').count(),0);pass('review history and pending tabs show completed cases in correct locations');
 const frank=await login('frank');await frank.locator('#process-master-new-draft').click();await saveName(frank,'自審取消驗收');await submit(frank);await frank.locator('#process-master-review').click();await frank.locator('[data-review-action=approve]').waitFor();
 const before=await read(frank);await frank.locator('[data-review-action=approve]').click();assert.equal(await dialog(frank).locator('input[type=checkbox]').count(),1);await dialog(frank).locator('[data-cancel]').click();assert.deepEqual(await read(frank),before);pass('self-review confirmation cancel leaves the same pending case and revision');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.deniedReads,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.message;report.stack=error.stack;if(diagnosticPage){report.screenText=(await diagnosticPage.locator('body').innerText()).slice(0,6000);await diagnosticPage.screenshot({path:'.sites-runtime/review-buttons-failure.png',fullPage:true});}}
finally{await browser?.close();await fixture?.close();fs.writeFileSync('.sites-runtime/process-master-review-buttons.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
process.exitCode=report.status==='PASS'?0:1;
