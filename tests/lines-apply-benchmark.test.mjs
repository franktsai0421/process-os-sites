// Follow-up for an observed slow row: fixed history size and browser-native
// click-to-dialog-removal timestamps, independent of Playwright polling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createLinesFixture} from './lines-native-fixture.mjs';
let fixture,browser;const report={status:'RUNNING',condition:'600 products / 60 stages / 15 fixed withdrawn review cases in AB; five edits, no growing review history',samples:[]};
try{
 const seed=await createLinesFixture({productsPerLine:200,stagesPerLine:20});fixture=seed.fixture;const origin=fixture.url.origin;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 assert.equal((await context.request.post(origin+'/api/platform-login',{headers:{Origin:origin},data:{id:'frank',password:seed.password}})).status(),200);
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="A-S1"]').waitFor();
 for(let i=0;i<15;i++)await page.evaluate(async n=>{const b=MasterDataWorkflow.shared,line=b.flow('AB').working.lines.find(l=>l.code==='A'),stage=line.stages.find(s=>s.code==='A-S1'),path=['lines',{id:line.id},'stages',{id:stage.id},'name'];await b.patch('AB',[{op:'set',path,value:'History '+n}],[{path,value:stage.name}]);await b.execute('AB','save');await b.execute('AB','submit',{savedId:b.flow('AB').saved.id,reason:'Fixed-history fixture'});await b.execute('AB','withdraw',{caseId:b.flow('AB').pendingId,reason:'Fixed-history fixture'});},i);
 await page.reload();await page.locator('[data-stage-edit="A-S1"]').waitFor();
 for(let i=0;i<5;i++){
  await page.locator('[data-stage-edit="A-S1"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Fixed history '+i);
  await page.evaluate(()=>{const dialog=document.querySelector('#master-edit-dialog'),button=dialog.querySelector('[type=submit]');window.__applyTiming=null;button.addEventListener('click',()=>{const start=performance.now(),observer=new MutationObserver(()=>{if(!dialog.isConnected){window.__applyTiming=performance.now()-start;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});},{once:true});});
  const finished=page.waitForEvent('requestfinished',{predicate:r=>r.method()==='POST'&&r.url().includes('/api/master/workflow')&&r.postDataJSON()?.command?.action==='apply'});
  await page.locator('#master-edit-dialog [type=submit]').click();await page.waitForFunction(()=>window.__applyTiming!==null);const request=await finished;
  report.samples.push({browserMs:await page.evaluate(()=>window.__applyTiming),httpMs:request.timing().responseEnd});
  const response=await context.request.get(origin+'/api/master/workflow?scope=AB');assert.equal(response.status(),200);const data=await response.json();assert.equal(data.control.workflow.working.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-S1').name,'Fixed history '+i);
 }
 assert.deepEqual(errors,[]);report.status='PASS';report.buildEntrySha256=fixture.buildEntrySha256;
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}finally{await browser?.close();await fixture?.close();fs.writeFileSync('/tmp/lines-apply-'+(process.env.LINES_PHASE||'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
