// Every interactive line/stage and review control, real compiled app and D1/R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createLinesFixture} from './lines-native-fixture.mjs';
const phase=process.env.LINES_PHASE||'candidate',samples=Number(process.env.LINES_SAMPLES||5);
const report={phase,status:'RUNNING',fixture:{productsPerLine:Number(process.env.LINES_PRODUCTS||1),stagesPerLine:Number(process.env.LINES_STAGES||1),emptyLines:true,historyVersions:process.env.LINES_EXTRA==='1'?22:0},timings:[],requests:[],checks:[],inventory:[],pageErrors:[],defects:[]};
let fixture,browser,page,step='setup',dismissNext=false,verificationMs=0;const pending=[];
const measure=async(label,fn)=>{step=label;const start=performance.now(),proofBefore=verificationMs;await fn();report.timings.push({label,ms:performance.now()-start-(verificationMs-proofBefore),verificationMs:verificationMs-proofBefore});};
try{
 const seeded=await createLinesFixture(report.fixture);fixture=seeded.fixture;const origin=fixture.url.origin;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 const actor=async id=>{const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());assert.equal((await context.request.post(origin+'/api/platform-login',{headers:{Origin:origin},data:{id,password:seeded.password}})).status(),200);const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('dialog',async d=>{if(dismissNext){dismissNext=false;await d.dismiss();}else await d.accept(d.type()==='prompt'?'Synthetic':undefined);});
 const labels=new WeakMap();p.on('request',r=>labels.set(r,step));p.on('requestfinished',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))pending.push((async()=>{const response=await r.response();report.requests.push({label:labels.get(r),path:new URL(r.url()).pathname,query:new URL(r.url()).search.replace(/operationId=[^&]+/,'operationId=fixture'),method:r.method(),action:r.method()==='POST'?r.postDataJSON()?.command?.action:null,status:response.status(),ms:r.timing().responseEnd,bytes:(await r.sizes()).responseBodySize});})());});return p;};
 page=await actor('frank');const reviewer=await actor('reviewer');
 const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({DB:fixture.db,STATE_ARCHIVE:await fixture.mf.getR2Bucket('STATE_ARCHIVE')});const core=load('lib/process-state.ts');
 const root=async()=>{const start=performance.now();try{return JSON.parse((await core.readState()).values.masterDataControl);}finally{verificationMs+=performance.now()-start;}};
 const flow=async scope=>(await root()).workflowScopes[scope];
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.querySelector('#process-boot')&&!!document.querySelector('#master-lines-scope')&&!document.querySelector('#master-lines-scope').disabled);
 const lines=async scope=>{await page.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await ready();if(await page.locator('#master-lines-scope').inputValue()!==scope){await page.locator('#master-lines-scope').selectOption(scope);await page.waitForFunction(s=>state.masterScope===s&&!document.querySelector('#master-lines-scope').disabled,scope);}};
 const inventory=async(state,p=page)=>report.inventory.push({state,controls:await p.locator('#data-content button,#data-content select,#data-content summary,#master-unified-review button').evaluateAll(nodes=>nodes.map(n=>({id:n.id,data:{...n.dataset},text:n.textContent.trim().slice(0,70),disabled:n.disabled===true,visible:!!n.getClientRects().length})))});
 const apply=async()=>{await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});};
 const reason=async p=>{await p.locator('.vd-confirm textarea').fill('Synthetic complete acceptance');if(await p.locator('.vd-confirm input[type=checkbox]').count())await p.locator('.vd-confirm input[type=checkbox]').check();await p.locator('.vd-confirm [type=submit]').click();await p.locator('.vd-confirm').waitFor({state:'detached'});};
 const save=async scope=>{const old=(await flow(scope)).saved?.id;await page.locator('#master-save-draft').click();await page.waitForFunction(({scope,old})=>MasterDataWorkflow.shared.flow(scope).saved?.id!==old&&MasterDataWorkflow.canLeave(),{scope,old});};
 const submit=async()=>{await page.locator('#master-submit').click();await reason(page);await page.locator('#master-view-review').waitFor();};
 const reviewOpen=async(scope)=>{await reviewer.goto(origin+'/process/index.html?system=process&view=approval&approvalTab=master');await reviewer.locator('[data-master-review]').filter({hasText:scope}).first().click();await reviewer.locator('#master-case-diff').waitFor();};
 const reviewAct=async(action)=>{await reviewer.locator('[data-review-action="'+action+'"]').click();await reason(reviewer);await reviewer.waitForFunction(()=>!document.querySelector('[data-review-action]'));};
 for(let round=0;round<samples;round++)for(const scope of ['AB','C']){
  const line=scope==='AB'?'A':'C',code=line+'-ROUND2',temp=line+'-TEMP';
  await measure(scope+':entry',()=>lines(scope));
  if(round===0)await inventory(scope+':active');
  await measure(scope+':begin',async()=>{await page.locator('#master-new-draft').click();await page.locator('[data-line-edit="'+line+'"]').waitFor();});
  if(round===0)await inventory(scope+':draft');
  await measure(scope+':line-open',async()=>{await page.locator('[data-line-edit="'+line+'"]').click();assert.equal(await page.locator('#master-edit-dialog [name=code]').inputValue(),line);});
  await page.locator('#master-edit-dialog [name=name]').fill('Line '+scope+' '+round);
  await measure(scope+':line-apply',async()=>{await apply();assert.equal((await flow(scope)).working.lines.find(l=>l.code===line).name,'Line '+scope+' '+round);});
  for(const cancel of ['header','footer','escape']){
   await page.locator('[data-stage-add="'+line+'"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Discarded');
   await measure(scope+':cancel-'+cancel,async()=>{if(cancel==='escape')await page.keyboard.press('Escape');else await page.locator('#master-edit-dialog '+cancel+' [data-cancel]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});});
  }
  await measure(scope+':stage-add-open',async()=>{await page.locator('[data-stage-add="'+line+'"]').click();assert(await page.locator('#master-edit-dialog [name=name]').isEditable());});
  await page.locator('#master-edit-dialog [name=code]').fill(temp);await page.locator('#master-edit-dialog [name=name]').fill('Temporary');
  await measure(scope+':stage-add-apply',async()=>{await apply();assert((await flow(scope)).working.lines.find(l=>l.code===line).stages.some(s=>s.code===temp));});
  dismissNext=true;await measure(scope+':delete-cancel',async()=>{await page.locator('[data-stage-delete="'+temp+'"]').click();assert((await flow(scope)).working.lines.find(l=>l.code===line).stages.some(s=>s.code===temp));});
  await measure(scope+':delete-unused',async()=>{await page.locator('[data-stage-delete="'+temp+'"]').click();await page.locator('[data-stage-edit="'+temp+'"]').waitFor({state:'detached'});assert(!(await flow(scope)).working.lines.find(l=>l.code===line).stages.some(s=>s.code===temp));});
  await measure(scope+':delete-child-line-blocked',async()=>{await page.locator('[data-line-delete="'+line+'"]').click();assert((await flow(scope)).working.lines.some(l=>l.code===line));});
  await measure(scope+':delete-referenced-stage-blocked',async()=>{await page.locator('[data-stage-delete="'+line+'-CUT"]').click();assert((await flow(scope)).working.lines.find(l=>l.code===line).stages.some(s=>s.code===line+'-CUT'));});
  if(round===0){await page.locator('[data-stage-add="'+line+'"]').click();await page.locator('#master-edit-dialog [name=code]').fill(code);await page.locator('#master-edit-dialog [name=name]').fill('Round '+round);await apply();}
  await measure(scope+':stage-edit-open',async()=>{await page.locator('[data-stage-edit="'+code+'"]').click();assert.equal(await page.locator('#master-edit-dialog [name=code]').inputValue(),code);});
  await page.locator('#master-edit-dialog [name=name]').fill('Round '+round+' edited');await measure(scope+':stage-edit-apply',apply);
  const effective=JSON.stringify((await root()).active[scope]);
  await measure(scope+':save',()=>save(scope));assert.equal(JSON.stringify((await root()).active[scope]),effective);
  await measure(scope+':leave-after-save',async()=>{await page.locator('[data-master-scope="'+scope+'"]').click();await page.waitForFunction(s=>state.dataTab===s&&document.documentElement.dataset.processNavigationStatus==='ready',scope);});await lines(scope);
  const active=(await root()).versions.find(v=>v.scope===scope&&v.status==='approved').id;
  await measure(scope+':version-select',async()=>{await page.locator('#master-version-choice').selectOption(active);assert.equal(await page.locator('[data-stage-edit]').count(),0);});
  await measure(scope+':return-draft',async()=>{await page.locator('#master-return-draft').click();await page.locator('[data-stage-edit="'+code+'"]').waitFor();});
  await measure(scope+':history-open',async()=>{await page.locator('.vd-history > summary').click();await page.waitForFunction(()=>document.querySelector('.vd-shell')?.dataset.historyLoaded==='true');});
  await measure(scope+':history-close',()=>page.locator('.vd-history > summary').click());
  await page.locator('.vd-history > summary').click();await measure(scope+':query-operation',async()=>{const read=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/master/workflow'));await page.locator('#master-shared-recover').click();await read;await page.waitForFunction(()=>MasterDataWorkflow.canLeave());});
  await page.locator('#master-submit').click();await measure(scope+':submit-cancel',async()=>{await page.locator('.vd-confirm [data-cancel]').click();assert.equal((await flow(scope)).pendingId,null);});
  await measure(scope+':submit',submit);assert.equal(JSON.stringify((await root()).active[scope]),effective);
  if(round===0)await inventory(scope+':pending');
  await measure(scope+':view-submitted',async()=>{await page.locator('#master-view-review').click();await page.locator('#master-unified-review').waitFor();await page.waitForFunction(()=>state.view==='approval'&&document.documentElement.dataset.processNavigationStatus==='ready');});
  await reviewOpen(scope);if(round===0)await inventory(scope+':review',reviewer);
  await measure(scope+':compare-open',async()=>{await reviewer.locator('#master-case-diff').click();await reviewer.locator('.master-diff-scroll').waitFor();});
  await measure(scope+':compare-close',()=>reviewer.locator('#master-case-diff').click());
  await measure(scope+':review-refresh',async()=>{await reviewer.locator('#master-review-refresh').click();await reviewer.waitForFunction(()=>!document.querySelector('#master-review-refresh').disabled);});
  await reviewer.locator('[data-review-action="return"]').click();await measure(scope+':return-cancel',()=>reviewer.locator('.vd-confirm [data-cancel]').click());assert((await flow(scope)).pendingId);
  await measure(scope+':return',()=>reviewAct('return'));
  await lines(scope);await page.locator('[data-stage-edit="'+code+'"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Returned '+round);await apply();await save(scope);
  await measure(scope+':resubmit',submit);
  await page.locator('#master-withdraw').click();await measure(scope+':withdraw-cancel',()=>page.locator('.vd-confirm [data-cancel]').click());assert((await flow(scope)).pendingId);
  await measure(scope+':withdraw',async()=>{await page.locator('#master-withdraw').click();await reason(page);await page.locator('#master-submit').waitFor();});
  await measure(scope+':submit-final',submit);await reviewOpen(scope);
  await reviewer.locator('[data-review-action="approve"]').click();await measure(scope+':approve-cancel',()=>reviewer.locator('.vd-confirm [data-cancel]').click());assert((await flow(scope)).pendingId);
  await measure(scope+':approve',()=>reviewAct('approve'));assert.equal((await root()).active[scope].lines.find(l=>l.code===line).stages.find(s=>s.code===code).name,'Returned '+round);
  await measure(scope+':review-history-mode',()=>reviewer.locator('[data-review-mode="history"]').click());await reviewer.locator('[data-master-review]').filter({hasText:scope}).first().waitFor();
  await measure(scope+':review-pending-mode',()=>reviewer.locator('[data-review-mode="pending"]').click());
  report.checks.push(scope+':round'+round+':line/stage CRUD, three cancel controls, deletion protections, versions, history, review comparison/cancels/return/edit/withdraw/approve');
 }
 if(process.env.LINES_EDGE==='1'){step='edge checks';const {checkRound2Edges}=await import('./lines-round2-edges.mjs');await checkRound2Edges({page,reviewer,fixture,origin,root,flow,lines,apply,actor,phase,report,measure});}
 if(process.env.LINES_EXTRA==='1'){step='extended controls';const {checkExtendedControls}=await import('./lines-extended-controls.mjs');await checkExtendedControls({page,reviewer,fixture,origin,root,flow,lines,apply,actor,phase,report,measure,save,submit,reason,reviewOpen,reviewAct});}
 if(process.env.LINES_SOAK==='1'){step='bounded soak';const {checkLinesSoak}=await import('./lines-soak.mjs');await checkLinesSoak({page,lines,report});}
 report.status=report.defects.length?'BASELINE_WITH_DEFECTS':'PASS';report.programCommit=fixture.programCommit;report.buildEntrySha256=fixture.buildEntrySha256;assert.deepEqual(report.pageErrors,[]);
}catch(error){report.status='FAIL';report.failedStep=step;report.error=error.message;if(page)report.screen=await page.locator('body').innerText().catch(()=>null);process.exitCode=1;}
finally{await Promise.allSettled(pending);await browser?.close();await fixture?.close();fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/lines-complete-'+phase+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
