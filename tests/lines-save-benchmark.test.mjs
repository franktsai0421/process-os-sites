// Follow up a slower complete-flow Save row with matched, fixed history.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createLinesFixture} from './lines-native-fixture.mjs';
let fixture,browser;const report={status:'RUNNING',condition:'600 products / 60 stages; 15 withdrawn cases in each AB/C scope, five C saves without additional cases',samples:[]};
try{
 const seed=await createLinesFixture({productsPerLine:200,stagesPerLine:20});fixture=seed.fixture;const origin=fixture.url.origin;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 assert.equal((await context.request.post(origin+'/api/platform-login',{headers:{Origin:origin},data:{id:'frank',password:seed.password}})).status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="A-S1"]').waitFor();
 for(const scope of ['AB','C']){
  if(scope==='C'){await page.locator('#master-lines-scope').selectOption('C');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="C-S1"]').waitFor();}
  for(let n=0;n<15;n++)await page.evaluate(async({scope,n})=>{const b=MasterDataWorkflow.shared,line=b.flow(scope).working.lines[0],stage=line.stages[1],path=['lines',{id:line.id},'stages',{id:stage.id},'name'];await b.patch(scope,[{op:'set',path,value:'Fixed case '+n}],[{path,value:stage.name}]);await b.execute(scope,'save');await b.execute(scope,'submit',{savedId:b.flow(scope).saved.id,reason:'Fixed-history fixture'});await b.execute(scope,'withdraw',{caseId:b.flow(scope).pendingId,reason:'Fixed-history fixture'});},{scope,n});
 }
 for(let n=0;n<5;n++){
  await page.evaluate(async n=>{const b=MasterDataWorkflow.shared,line=b.flow('C').working.lines[0],stage=line.stages[1],path=['lines',{id:line.id},'stages',{id:stage.id},'name'];await b.patch('C',[{op:'set',path,value:'Save probe '+n}],[{path,value:stage.name}]);},n);
  const finished=page.waitForEvent('requestfinished',{predicate:r=>r.method()==='POST'&&r.url().includes('/api/master/workflow')&&r.postDataJSON()?.command?.action==='save'});
  const browserMs=await page.evaluate(async()=>{const t=performance.now();await MasterDataWorkflow.shared.execute('C','save');return performance.now()-t;});const request=await finished;report.samples.push({browserMs,httpMs:request.timing().responseEnd});
  const response=await context.request.get(origin+'/api/master/workflow?scope=C'),data=await response.json();assert.equal(response.status(),200);assert.equal(data.control.workflow.saved.content.lines[0].stages[1].name,'Save probe '+n);assert.equal(data.control.workflow.cases.length,15);
 }
 assert.deepEqual(errors,[]);report.status='PASS';report.buildEntrySha256=fixture.buildEntrySha256;
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}finally{await browser?.close();await fixture?.close();fs.writeFileSync('/tmp/lines-save-'+(process.env.LINES_PHASE||'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
