import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';
const report={phase:process.env.MEASUREMENT_PHASE||'baseline',commit:process.env.PROCESS_PROGRAM_COMMIT,conditions:{network:'local loopback, no throttling',viewport:[1365,900]},samples:[],requests:[],errors:[]};
let f,browser,page;
const timed=async(name,fn)=>{const at=performance.now();try{await fn();report.samples.push({name,status:'PASS',ms:Math.round(performance.now()-at)});}catch(e){report.samples.push({name,status:'FAIL',ms:Math.round(performance.now()-at),error:e.message.slice(0,300)});if(report.phase!=='baseline')throw e;}};
try{
 f=await createProcessMasterFixture();report.conditions.data=f.counts;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
 const origin=f.url.origin;
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))report.requests.push({path:u.pathname,query:u.search,status:r.status()});});
 page.on('dialog',d=>d.accept(d.type()==='prompt'?'隔離驗收':undefined));
 await page.goto(origin+'/login?view=data&dataTab=process-master');
 await page.locator('#id').fill('frank');await page.locator('#password').fill(f.password);
 await timed('first-entry',async()=>{await page.locator('.site-entry-submit').click();await page.locator('#process-master-new-draft').waitFor({timeout:60000});});
 await page.screenshot({path:'.sites-runtime/process-master-'+report.phase+'.png',fullPage:true});
 await timed('tab-switch',async()=>{await page.locator('[data-tab=line-admin]').click();await page.waitForFunction(()=>document.querySelector('[data-tab=line-admin].active'));await page.locator('[data-tab=process-master]').click();await page.locator('#process-master-new-draft').waitFor();});
 for(let i=0;i<3;i++)await timed('warm-entry',async()=>{await page.reload({waitUntil:'domcontentloaded'});await page.locator('#process-master-new-draft').waitFor({timeout:60000});});
 await timed('begin',async()=>{await page.locator('#process-master-new-draft').click();await page.locator('#add-master-template').waitFor({timeout:15000});assert.equal(await page.locator('[data-master-name]').first().isEnabled(),true);});
 await timed('equipment-list',async()=>{await page.locator('[data-equipment-open]').click();await page.locator('#equipment-panel').waitFor();assert.equal(await page.locator('#equipment-panel tbody tr').count(),40);});
 await timed('search',async()=>{await page.locator('#equipment-search').fill('Máy thử nghiệm 19');await page.waitForFunction(()=>document.querySelectorAll('#equipment-panel tbody tr').length===2,null,{timeout:3000});});
 await timed('edit-equipment',async()=>{await page.locator('[data-equipment-edit]').first().click();await page.locator('#equipment-editor-dialog[open]').waitFor();});
 await page.locator('[data-equipment-field="name"]').fill('隔離修改設備');
 await timed('apply-equipment',async()=>{await page.locator('[data-equipment-save]').click();await page.locator('#equipment-editor-dialog').waitFor({state:'detached'});});
 await timed('save',async()=>{await page.locator('#save-master-data').click();await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content||{}).flat().some(t=>t.equipment?.some(e=>e.name==='隔離修改設備')));});
 await timed('reload-readback',async()=>{await page.reload();await page.waitForFunction(()=>Object.values(window.MasterDataWorkflow?.shared.flow('PROCESS')?.saved?.content||{}).flat().some(t=>t.equipment?.some(e=>e.name==='隔離修改設備')));});
async function confirmDialog(reason){const d=page.locator('.vd-confirm[open]');await d.waitFor();await d.locator('textarea').fill(reason);const self=d.locator('input[type=checkbox]');if(await self.count())await self.check();await d.locator('button[type=submit]').click();}
 async function submit(){await page.locator('#process-master-submit').click();await confirmDialog('隔離送審');await page.waitForFunction(()=>!!window.MasterDataWorkflow?.shared.flow('PROCESS')?.pendingId);}
 await timed('name-input',async()=>{await page.locator('[data-master-name]').first().fill('隔離名稱確認');await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').working).flat().some(t=>t.name==='隔離名稱確認'));});
 const photo=(await import('./photo-fixtures.mjs')).pngFixture({width:320,height:160,alpha:true});
 await timed('photo-upload',async()=>{await page.locator('.master-template-upload input').first().setInputFiles([{name:'synthetic-a.png',mimeType:'image/png',buffer:photo},{name:'synthetic-b.png',mimeType:'image/png',buffer:photo}]);await page.waitForFunction(()=>document.querySelectorAll('.photo-template:first-child .master-template-media-grid img').length===2&&[...document.querySelectorAll('.photo-template:first-child .master-template-media-grid img')].every(i=>i.complete&&i.naturalWidth===320));});
 if(report.phase!=='baseline'){
 await page.locator('.process-template-preview').first().click();await page.locator('#media-lightbox[open]').waitFor({timeout:5000});await page.locator('.media-lightbox-close').click();
 }
 await timed('save-photos',async()=>{await page.locator('#save-master-data').click();await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content||{}).flat().some(t=>t.mediaItems?.length===2));});
 await timed('submit',submit);
 await timed('withdraw',async()=>{await page.locator('#process-master-withdraw').click();await confirmDialog('隔離撤回');await page.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);});
 await timed('resubmit-withdrawn',submit);
 await timed('review-entry',async()=>{await page.locator('#process-master-review').click();await page.locator('[data-review-action="return"]').waitFor();});
 await timed('return',async()=>{await page.locator('[data-review-action="return"]').click();await confirmDialog('隔離退回');await page.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);});
 await page.goto(origin+'/process/?view=data&dataTab=process-master');await page.locator('#process-master-submit').waitFor();
 await timed('resubmit-returned',submit);
 await page.locator('#process-master-review').click();await page.locator('[data-review-action="approve"]').waitFor();
 await timed('approve',async()=>{await page.locator('[data-review-action="approve"]').click();await confirmDialog('隔離核准');await page.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);});
 await timed('effective-readback',async()=>{await page.goto(origin+'/process/?view=data&dataTab=process-master');await page.locator('#process-master-new-draft').waitFor();assert.equal(await page.locator('[data-master-name]').first().inputValue(),'隔離名稱確認');assert.equal(await page.locator('.photo-template:first-child .master-template-media-grid img').count(),2);});
 if(process.env.EXTENDED_ACCEPTANCE==='1'){
  await page.locator('#process-master-new-draft').click();await page.locator('#add-master-template').waitFor();
  await timed('delete-referenced-ui',async()=>{await page.locator('[data-delete-template="fixture-custom-0"]').click();await page.locator('.process-reference-dialog[open]').waitFor();assert.match(await page.locator('.process-reference-dialog').innerText(),/A-01/);await page.locator('.process-reference-dialog button').click();assert.equal(await page.locator('[data-delete-template="fixture-custom-0"]').count(),1);});
  await timed('cancel-delete-ui',async()=>{page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());await page.locator('[data-delete-template="fixture-custom-2"]').click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-delete-template="fixture-custom-2"]').count(),1);page.on('dialog',d=>d.accept());});
  await timed('delete-unreferenced-ui',async()=>{await page.locator('[data-delete-template="fixture-custom-2"]').click();await page.locator('[data-delete-template="fixture-custom-2"]').waitFor({state:'detached'});});
  await timed('equipment-cancel-keeps-input',async()=>{await page.locator('[data-equipment-edit]').first().click();await page.locator('#equipment-editor-dialog[open]').waitFor();await page.locator('[data-equipment-field=name]').fill('尚未套用保留');page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());await page.locator('[data-equipment-close]').last().click();assert.equal(await page.locator('[data-equipment-field=name]').inputValue(),'尚未套用保留');page.once('dialog',d=>d.accept());await page.locator('[data-equipment-close]').last().click();page.on('dialog',d=>d.accept());});
  await timed('photo-replace-remove',async()=>{await page.locator('[data-replace-index="0"]').first().setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:photo});await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').working).flat().some(t=>t.mediaItems?.[0]?.name==='replacement.png'));await page.locator('.photo-template:first-child [data-remove-template-media="1"]').click();await page.waitForFunction(()=>document.querySelectorAll('.photo-template:first-child .master-template-media-grid img').length===1);});
  await timed('new-typed-template',async()=>{const count=await page.locator('.photo-template').count();await page.locator('#add-master-template').dblclick();await page.waitForFunction(n=>document.querySelectorAll('.photo-template').length===n+1,count);await page.locator('.photo-template').last().locator('[data-master-name]').fill('新檢查流程 CLOUD');await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').working).flat().some(t=>t.name==='新檢查流程 CLOUD'));await page.locator('.photo-template').last().locator('[data-master-type]').selectOption('inspection');await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').working).flat().filter(t=>t.name==='新檢查流程 CLOUD').every(t=>t.editorType==='inspection'));});
  await page.locator('#save-master-data').click();await page.waitForFunction(()=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content||{}).flat().some(t=>t.name==='新檢查流程 CLOUD'));
  await submit();await page.locator('#process-master-review').click();await page.locator('[data-review-action=approve]').click();await confirmDialog('驗收新增類型');await page.waitForFunction(()=>!MasterDataWorkflow.shared.flow('PROCESS').pendingId);
  await f.adoptAuthoring();
  await timed('approved-template-type-options',async()=>{
   await page.goto(origin+'/process/?view=editor');await page.locator('[data-pe=add]').waitFor();
   const begin=page.locator('[data-av3=begin]');if(await begin.count())await begin.click();
   await page.locator('[data-pe=add]').click();await page.locator('.pe-add [data-choice]').filter({hasText:'新檢查流程 CLOUD'}).click();await page.locator('#process-operation-dialog[open]').waitFor();
   assert.equal(await page.locator('[data-type]').inputValue(),'inspection');
   assert.ok((await page.locator('[data-template] option').allTextContents()).some(x=>x==='新檢查流程 CLOUD'));
   await page.locator('[data-type]').selectOption('manual');assert.ok(!(await page.locator('[data-template] option').allTextContents()).some(x=>x==='新檢查流程 CLOUD'));
   await page.locator('#process-operation-dialog [data-pe=cancel]').click();const discard=page.locator('.pe-close-confirm [data-pe=discard]');if(await discard.count())await discard.click();
  });
  await page.goto(origin+'/process/?view=data&dataTab=process-master');await page.locator('#process-master-new-draft').waitFor();
 }

 for(const width of [1365,390]){await page.setViewportSize({width,height:844});await page.waitForTimeout(350);await page.locator('.flow-photo-presets').scrollIntoViewIfNeeded();await page.screenshot({path:'.sites-runtime/process-master-'+report.phase+'-'+width+'.png',fullPage:false});report.samples.push({name:'viewport-'+width,status:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)?'PASS':'FAIL',ms:0});}

 report.status=report.samples.every(s=>s.status==='PASS')?'PASS':'FAIL';
}catch(e){report.status='FAIL';report.failure=e.message; if(page){report.screenText=(await page.locator('body').innerText().catch(()=>'' )).slice(0,7000);await page.screenshot({path:'.sites-runtime/process-master-'+report.phase+'-failure.png',fullPage:true}).catch(()=>{});}}
finally{await browser?.close();await f?.close();fs.writeFileSync('.sites-runtime/process-master-'+report.phase+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,samples:report.samples,errors:report.errors,failure:report.failure}));}
process.exitCode=report.status==='PASS'?0:1;
