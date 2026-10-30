// Actual compiled application, native D1/R2, synthetic actors and data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createLinesFixture} from './lines-native-fixture.mjs';
const report={status:'PENDING',realData:false,checks:[],timings:[],pageErrors:[]};
let fixture,browser,page,stage='setup';
let password;
async function measure(label,fn){stage=label;const start=performance.now();await fn();report.timings.push({label,ms:performance.now()-start});}
try{
 ({fixture,password}=await createLinesFixture());
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
 const origin=fixture.url.origin;
 async function actor(id){const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const response=await context.request.post(origin+'/api/platform-login',{data:{id,password},headers:{Origin:origin}});assert.equal(response.status(),200);const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>report.pageErrors.push({id,message:e.message}));p.on('dialog',d=>d.accept(d.type()==='prompt'?'Synthetic review reason':undefined));return {context,page:p};}
 const owner=await actor('frank'),reviewer=await actor('reviewer');page=owner.page;
 await measure('first-entry',async()=>{await page.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await page.locator('#master-lines-scope').waitFor();await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.querySelector('#master-new-draft')?.disabled&&!document.querySelector('#process-boot'));});
 async function lines(p,scope){await p.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await p.locator('#master-lines-scope').waitFor();if(await p.locator('#master-lines-scope').inputValue()!==scope){await p.locator('#master-lines-scope').selectOption(scope);await p.waitForFunction(s=>state.masterScope===s&&!document.querySelector('#master-lines-scope').disabled,scope);}}
 async function submit(p){await p.locator('#master-submit').click();await p.locator('.vd-confirm textarea').fill('Synthetic isolated stage review');await p.locator('.vd-confirm [type=submit]').click();await p.locator('#master-view-review').waitFor();}
 async function review(p,scope,action){await p.goto(origin+'/process/index.html?system=process&view=approval&approvalTab=master');await p.locator('[data-master-review]').filter({hasText:scope}).first().click();await measure(scope+':'+action,async()=>{await p.locator('[data-review-action='+action+']').click();await confirmReview(p);await p.waitForFunction(()=>!document.querySelector('[data-review-action]'));});}
 async function confirmReview(p){await p.locator('.vd-confirm textarea').fill('Synthetic review decision');await p.locator('.vd-confirm [type=submit]').click();await p.locator('.vd-confirm').waitFor({state:'detached'});}
 async function control(){const row=await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();return JSON.parse(JSON.parse(row.values).masterDataControl);}
 for(const scope of ['AB','C']){
  const line=scope==='AB'?'A':'C';await lines(page,scope);
  await measure(scope+':begin',async()=>{await page.locator('#master-new-draft').click();await page.locator('[data-stage-add='+line+']').waitFor();});
  await measure(scope+':add-apply',async()=>{await page.locator('[data-stage-add='+line+']').click();await page.locator('#master-edit-dialog [name=code]').fill(line+'-NATIVE');await page.locator('#master-edit-dialog [name=name]').fill('隔離工段 Công đoạn thử nghiệm');await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});assert((await control()).workflowScopes[scope].working.lines.find(l=>l.code===line).stages.some(s=>s.code===line+'-NATIVE'));});
  await measure(scope+':save',async()=>{await page.locator('#master-save-draft').click();await page.waitForFunction(s=>!!MasterDataWorkflow.shared.flow(s).saved,scope);});
  await measure(scope+':submit',()=>submit(page));assert(!(await control()).active[scope].lines.find(l=>l.code===line).stages.some(s=>s.code===line+'-NATIVE'));
  await review(reviewer.page,scope,'return');
  await lines(page,scope);await measure(scope+':resubmit',()=>submit(page));
  await measure(scope+':withdraw',async()=>{await page.locator('#master-withdraw').click();await confirmReview(page);await page.locator('#master-submit').waitFor();});
  await measure(scope+':submit-final',()=>submit(page));
  await review(reviewer.page,scope,'approve');
  const root=await control();assert(root.active[scope].lines.find(l=>l.code===line).stages.some(s=>s.code===line+'-NATIVE'));assert(root.active.PROCESS[line+'-NATIVE']);
  report.checks.push(scope+': actual draft/apply/save/submit/review-return/resubmit/withdraw/resubmit/review-approve and D1 effective readback');
 }
 for(const scope of ['AB','C'])assert.equal((await owner.context.request.post(origin+'/api/master/workflow?scope='+scope,{headers:{Origin:origin},data:{action:'begin'}})).status(),200);
 report.permissions=[];
 for(const id of ['reader','staff']){
  const subject=await actor(id);
  for(const scope of ['AB','C']){
   const endpoint=origin+'/api/master/workflow?scope='+scope;
   const response=await subject.context.request.get(endpoint+'&permissions=1'),body=await response.json();assert.equal(response.status(),200);
   assert.equal(body.permissions.view,true);assert.equal(body.permissions.edit,id==='staff');assert.equal(body.permissions.approve,false);assert.equal(body.permissions.return,false);
   for(const action of id==='reader'?['apply','save','submit','withdraw','approve','return']:['approve','return']){
    const root=await control(),flow=root.workflowScopes[scope];
    const request=await subject.context.request.post(endpoint,{headers:{Origin:origin},data:{command:{action,operationId:randomUUID(),clientId:'permission-'+id,sequence:1,generation:flow.generation,caseId:'synthetic-forbidden',savedId:flow.saved?.id,reason:'Denied fixture',patches:[]}}});
    assert.equal(request.status(),403,id+':'+scope+':'+action);report.permissions.push({id,scope,action,status:403});
   }
   if(id==='reader'){await lines(subject.page,scope);assert.equal(await subject.page.locator('[data-stage-add]').count(),0);assert.equal(await subject.page.locator('#master-save-draft').count(),0);}
  }
  if(id==='staff'&&process.env.LINES_RECOVERY==='1'){
   await lines(subject.page,'C');await subject.page.locator('[data-stage-edit="C-NATIVE"]').click();
   await subject.page.locator('#master-edit-dialog [name=name]').fill('隔離工段 Staff allowed edit');await subject.page.locator('#master-edit-dialog [type=submit]').click();await subject.page.locator('#master-edit-dialog').waitFor({state:'detached'});
   await subject.page.locator('#master-save-draft').click();await subject.page.waitForFunction(()=>MasterDataWorkflow.canLeave());await submit(subject.page);
   await subject.page.locator('#master-withdraw').click();await confirmReview(subject.page);await subject.page.locator('#master-submit').waitFor();
   report.checks.push('staff explicit C permissions: edit/apply/save/submit/own withdrawal accepted; review denied');
  }
  await subject.context.close();
 }
 await lines(page,'AB');report.ui=[];
 for(const width of [1366,390]){await page.setViewportSize({width,height:844});for(let language=0;language<2;language++){
  await page.locator('.top-actions .language-switch').click();await page.locator('[data-stage-edit="A-NATIVE"]').click();
  await page.locator('#master-edit-dialog [name=name]').fill('Công đoạn dài có dấu tiếng Việt 中文長名稱 '.repeat(5));
  assert(await page.locator('#master-edit-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(process.env.LINES_RECOVERY==='1')await page.screenshot({path:'.sites-runtime/lines-ui-'+width+'-'+language+'.png',fullPage:true});
  await page.keyboard.press('Escape');report.ui.push({width,lang:await page.locator('html').getAttribute('lang'),cancel:true,overflow:false});
 }}
 if(process.env.LINES_EXTRA_TIMING==='1'){stage='extra timing';const {measureLinesNavigation}=await import('./lines-native-timing.mjs');report.extraTimings=await measureLinesNavigation({page,origin,control,lines});}
 if(process.env.LINES_RECOVERY==='1'){stage='native recovery';const {checkLinesRecovery}=await import('./lines-native-recovery.mjs');report.recovery=await checkLinesRecovery({page,origin,control,lines,confirmReview});}
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';report.buildEntrySha256=fixture.buildEntrySha256;report.programCommit=fixture.programCommit;
}catch(error){report.status='FAIL';report.failedStage=stage;report.error=error.message;if(page)report.screen=await page.locator('body').innerText().catch(()=>null);process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/lines-native-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
