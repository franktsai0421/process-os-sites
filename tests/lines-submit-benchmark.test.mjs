// Native click-to-DOM timestamps separate real Submit readiness from test polling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createLinesFixture} from './lines-native-fixture.mjs';
let fixture,browser;const report={status:'RUNNING',condition:'600 products / 60 stages; AB and C each start with 15 withdrawn cases; five C resubmissions/withdrawals',samples:[],errors:[]};
try{
 const seed=await createLinesFixture({productsPerLine:200,stagesPerLine:20});fixture=seed.fixture;const origin=fixture.url.origin;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());assert.equal((await context.request.post(origin+'/api/platform-login',{headers:{Origin:origin},data:{id:'frank',password:seed.password}})).status(),200);
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="A-S1"]').waitFor();
 for(const scope of ['AB','C']){
  if(scope==='C'){await page.locator('#master-lines-scope').selectOption('C');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="C-S1"]').waitFor();}
  for(let n=0;n<15;n++)await page.evaluate(async({scope,n})=>{const b=MasterDataWorkflow.shared,line=b.flow(scope).working.lines[0],stage=line.stages[1],path=['lines',{id:line.id},'stages',{id:stage.id},'name'];await b.patch(scope,[{op:'set',path,value:'Fixed history '+n}],[{path,value:stage.name}]);await b.execute(scope,'save');await b.execute(scope,'submit',{savedId:b.flow(scope).saved.id,reason:'History fixture'});await b.execute(scope,'withdraw',{caseId:b.flow(scope).pendingId,reason:'History fixture'});},{scope,n});
 }
 // Reload the real UI after fixture preparation, so the timed button is live.
 await page.reload();await page.locator('#master-lines-scope').selectOption('C');await page.waitForFunction(()=>state.masterScope==='C'&&!!MasterDataWorkflow.shared.flow('C')?.saved&&!document.querySelector('#master-lines-scope').disabled);await page.locator('#master-submit').waitFor();
 const savedId=await page.evaluate(()=>MasterDataWorkflow.shared.flow('C').saved.id);
 for(let n=0;n<5;n++){
  await page.locator('#master-submit').click();await page.locator('.vd-confirm textarea').fill('Native Submit timing');
  await page.evaluate(()=>{window.__submitMs=null;document.querySelector('.vd-confirm [type=submit]').addEventListener('click',()=>{const start=performance.now(),observer=new MutationObserver(()=>{const b=document.querySelector('#master-view-review');if(b&&!b.disabled){window.__submitMs=performance.now()-start;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true,attributes:true});},{once:true});});
  const request=page.waitForEvent('requestfinished',{predicate:r=>r.method()==='POST'&&r.url().includes('/api/master/workflow')&&r.postDataJSON()?.command?.action==='submit'}),start=performance.now();
  await page.locator('.vd-confirm [type=submit]').click();await page.locator('#master-view-review').waitFor();await page.waitForFunction(()=>window.__submitMs!==null);const done=await request;
  report.samples.push({nativeMs:await page.evaluate(()=>window.__submitMs),automatedMs:performance.now()-start,httpMs:done.timing().responseEnd});
  const response=await context.request.get(origin+'/api/master/workflow?scope=C');assert.equal(response.status(),200);const flow=(await response.json()).control.workflow;assert.equal(flow.saved.id,savedId);assert.equal(flow.cases.find(c=>c.id===flow.pendingId).savedId,savedId);assert.equal(flow.active.content.lines[0].stages[1].name,'切割 · Cắt 1');
  await page.locator('#master-withdraw').click();await page.locator('.vd-confirm textarea').fill('Timing next sample');await page.locator('.vd-confirm [type=submit]').click();await page.locator('#master-submit').waitFor();
 }
 const stored=JSON.parse((await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first()).values);report.storageAfter=stored.__processRecords?'records-v1':stored.__processR2?'legacy-r2':'inline';assert.deepEqual(report.errors,[]);report.status='PASS';report.buildEntrySha256=fixture.buildEntrySha256;
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}finally{await browser?.close();await fixture?.close();fs.writeFileSync('/tmp/lines-submit-'+(process.env.LINES_PHASE||'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
