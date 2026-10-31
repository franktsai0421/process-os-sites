// Native browser operations against the compiled isolated Worker. No API mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const commandOf=request=>{try{const body=request.postDataJSON();return body?.command?.command||body?.command||body||{};}catch{return {};}};
const twoFrames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const operation=(content,id='photo-operation')=>content.workspaces.flatMap(w=>Object.values(w.stages).flat()).find(op=>op.id===id);

export async function runProcessPlatformRound5({fixture,browser,round,variant,folder,smoke=false}){
 const report={round,variant,smoke,measurementUse:process.env.ROUND5_PURPOSE||'paired-performance',status:'RUNNING',buildEntrySha256:fixture.buildEntrySha256,fixtureHash:fixture.fixtureHash,counts:fixture.counts,
  boundaries:{main:'Native action, successful server ACK when writing, exact state/DOM assertion, command queue idle, then two animation frames. No image decode in this interval.',confirm:'Reason entry is outside confirm-to-ready; opening the confirmation is a separate row.',readback:'Independent persisted content verification after the stopwatch; separately timed, not included in UI ms.',images:'Visible image decode after explicit details expansion: incremental wait plus actionToImagesReadyMs from the related native action. Independent readback occurs afterward. Not a whole-page image claim.'},samples:[],api:[],checks:[],errors:[],dialogs:[]};
 const contexts=[],labels=new WeakMap(),requestLabels=new WeakMap(),responseTasks=[],measurementClocks=new Map();
 const file=path.join(folder,`${variant}-${round}.json`),origin=fixture.url.origin;
 const persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
 async function idle(page){await page.waitForFunction(()=>{const s=window.sharedDraftAccountState?.();return s&&s.queued===0&&!s.unknown&&!s.failed;});}
 async function measure(page,name,action,verify,{queue=true}={}){
  const start=performance.now(),row={name,status:'RUNNING'};labels.set(page,name);
  try{await action();if(verify)await verify();if(queue)await idle(page);await twoFrames(page);row.ms=+(performance.now()-start).toFixed(1);row.status='PASS';}
  catch(error){row.ms=+(performance.now()-start).toFixed(1);row.status='FAIL';row.error=error.message;throw error;}
  finally{measurementClocks.set(name,{start,end:performance.now()});labels.delete(page);report.samples.push(row);persist();console.log(JSON.stringify({round,variant,...row}));}
  return row;
 }
 async function persisted(name,verify){const start=performance.now(),control=await fixture.readAuthoring();verify(control);report.checks.push({name,status:'PASS',verificationMs:+(performance.now()-start).toFixed(1),revision:control.workflow.revision});persist();return control;}
 async function pageFor(actor,destination){
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});contexts.push(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push({actor,error:error.message}));
  page.on('dialog',dialog=>{report.dialogs.push({actor,type:dialog.type(),message:dialog.message()});void dialog.accept(dialog.type()==='prompt'?'Synthetic round5 verification':undefined);});
  page.on('request',request=>requestLabels.set(request,labels.get(page)||'background'));
  page.on('requestfinished',request=>{const url=new URL(request.url());if(!url.pathname.startsWith('/api/'))return;const timing=request.timing();responseTasks.push((async()=>{const response=await request.response();report.api.push({actor,operation:requestLabels.get(request),path:url.pathname,query:url.search,method:request.method(),action:commandOf(request).action||'',status:response?.status(),ms:+timing.responseEnd.toFixed(1)});})());});
  await page.goto(origin+'/login?'+new URLSearchParams(destination));await page.locator('#id').fill(actor);await page.locator('#password').fill(fixture.password);
  return page;
 }
 async function readyEditor(page,line='A'){
  await page.waitForFunction(line=>window.ProcessSync?.destination?.view==='editor'&&document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationGeneration===document.documentElement.dataset.processDestinationReadyGeneration&&!!window.ProcessAuthoringV3?.flow()&&document.querySelector('#editor-line-select')?.value===line&&!document.querySelector('#process-boot'),line);
  await page.locator(`.pe-card[data-node="${line==='A'?fixture.seed.aOperationId:fixture.seed.cOperationId}"]`).waitFor();
  assert.equal(await page.locator('#view-root [data-navigation-error]').count(),0);
 }
 async function readyReview(page){await page.waitForFunction(()=>window.ProcessSync?.destination?.view==='approval'&&!!window.ProcessAuthoringV3?.flow()&&typeof state!=='undefined'&&state.approvalTab==='process'&&document.documentElement.dataset.processNavigationStatus==='ready'&&!!document.querySelector('#authoring-v3-review [data-process-review="reload"]'));}
 async function ack(page,action,trigger,channel){
  const response=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/process-authoring/workflow'&&r.request().method()==='POST'&&commandOf(r.request()).action===action&&(!channel||u.searchParams.get('channel')===channel);});
  await trigger();const r=await response;assert.equal(r.status(),200,`${action} HTTP ${r.status()}`);await r.finished();
 }
 async function openOperation(page,id=fixture.seed.aOperationId){await page.locator(`.pe-card[data-node="${id}"] [data-pe="edit"]`).click();await page.locator('#process-operation-dialog[open] [data-field="name"]').waitFor();}
 async function closeOperation(page){await page.locator('#process-operation-dialog [data-pe="cancel"]').click();await page.locator('#process-operation-dialog').waitFor({state:'detached'});}
 async function applyName(page,name,label){await openOperation(page);await page.locator('[data-field="name"]').fill(name);await measure(page,label,()=>ack(page,'apply',()=>page.locator('#apply-operation').click()),async()=>{await page.locator('#process-operation-dialog').waitFor({state:'detached'});await page.waitForFunction(value=>ProcessAuthoringV3.flow().working.workspaces.flatMap(w=>Object.values(w.stages).flat()).some(op=>op.id==='photo-operation'&&op.name===value),name);await page.locator('.pe-card[data-node="photo-operation"] h3').filter({hasText:name}).waitFor();});await persisted(label,control=>assert.equal(operation(control.workflow.working).name,name));}
 async function images(page,name,selector,expected,sourceAction){
  const dimensions=[];
  const row=await measure(page,name,async()=>{const images=page.locator(selector);assert.equal(await images.count(),expected);for(const img of await images.all()){await img.scrollIntoViewIfNeeded();dimensions.push(await img.evaluate(async image=>{await image.decode();if(!image.complete||image.naturalWidth===0)throw Error('Image did not decode');return[image.naturalWidth,image.naturalHeight];}));}assert.deepEqual(dimensions,fixture.media.slice(0,expected).map(image=>[image.width,image.height]));},null,{queue:false});
  row.decodedDimensions=dimensions;row.imageScope='Only explicitly visible fixture images; ms is incremental decode/visibility wait, actionToImagesReadyMs starts at sourceAction';row.sourceAction=sourceAction;assert(measurementClocks.has(sourceAction));row.actionToImagesReadyMs=+(measurementClocks.get(name).end-measurementClocks.get(sourceAction).start).toFixed(1);persist();
 }
 async function fillConfirmation(page,reason){const dialog=page.locator('.vd-confirm[open]');await dialog.waitFor();await dialog.locator('textarea').fill(reason);if(await dialog.locator('input[type="checkbox"]').count())await dialog.locator('input[type="checkbox"]').check();}
 async function save(page,label){const previous=await page.evaluate(()=>ProcessAuthoringV3.flow().saved?.id);await measure(page,label,()=>ack(page,'save',()=>page.locator('[data-av3="save"]').click()),async()=>{await page.waitForFunction(id=>!!ProcessAuthoringV3.flow().saved&&ProcessAuthoringV3.flow().saved.id!==id&&ProcessAuthoringV3.canMutate()&&document.querySelector('[data-av3="save"]')?.disabled===false,previous);});return await persisted(label,c=>assert.deepEqual(c.workflow.saved.content,c.workflow.working));}
 async function submit(page,label,expectedSaved){
  await page.locator('[data-av3="submit"]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-av3="submit"]')?.disabled===false);
  await measure(page,label+':open-dialog',()=>page.locator('[data-av3="submit"]').click(),()=>page.locator('.vd-confirm[open]').waitFor());
  await fillConfirmation(page,'Synthetic '+label);
  await measure(page,label+':confirm',()=>ack(page,'submit',()=>page.locator('.vd-confirm[open] button[type="submit"]').click()),()=>page.waitForFunction(()=>!!ProcessAuthoringV3.flow().pendingId&&!ProcessAuthoringV3.canMutate()&&!!document.querySelector('[data-av3="withdraw"]')));
  const control=await persisted(label,c=>{const flow=c.workflow,review=flow.cases.find(row=>row.id===flow.pendingId);assert.equal(review.status,'pending');assert.equal(review.savedId,expectedSaved.id);assert.deepEqual(review.content,expectedSaved.content);});return control.workflow.pendingId;
 }
 async function toReview(page,label){await measure(page,label,async()=>{await page.locator('[data-view="approval"]').first().click();await page.locator('[data-review-tab="process"]').click();},()=>readyReview(page));}
 async function reviewDetails(page,label,name){await measure(page,label,()=>page.locator('[data-process-review="view"]').click(),async()=>{await page.locator('.shared-restore-dialog [data-history-review="approve"]').waitFor();await page.waitForFunction(value=>document.querySelector('.shared-restore-dialog main')?.textContent.includes(value),name);});}
 async function reviewAction(page,action,label,caseId){await measure(page,label+':open-dialog',()=>page.locator(`[data-history-review="${action}"]`).click(),()=>page.locator('.vd-confirm[open]').waitFor());await fillConfirmation(page,'Synthetic '+label);await measure(page,label+':confirm',()=>ack(page,action,()=>page.locator('.vd-confirm[open] button[type="submit"]').click()),async()=>{await page.locator('.shared-restore-dialog').waitFor({state:'detached'});await page.waitForFunction(({caseId,action})=>!ProcessAuthoringV3.flow().pendingId&&ProcessAuthoringV3.flow().cases.some(row=>row.id===caseId&&row.status===(action==='approve'?'approved':'returned')),{caseId,action});});}
 try{
  const editor=await pageFor(fixture.actors.editor,{view:'editor'});
  await measure(editor,'login-to-editor',()=>editor.locator('.site-entry-submit').click(),()=>readyEditor(editor));
  await images(editor,'initial-canvas-image','.pe-card[data-node="photo-operation"] img',1,'login-to-editor');
  await measure(editor,'begin',()=>ack(editor,'begin',()=>editor.locator('[data-av3="begin"]').click()),()=>editor.waitForFunction(()=>ProcessAuthoringV3.canMutate()&&ProcessAuthoringV3.canEditCanvas()&&document.querySelector('.pe-tools [data-pe="add"]')?.disabled===false&&document.querySelector('[data-av3="save"]')?.disabled===false));
  await persisted('begin creates editable draft',c=>assert(c.versions.some(v=>v.status==='draft')));
  await openOperation(editor);
  const abCount=fixture.counts.approvedAbItems;
  await measure(editor,'ipqc-ab:first-read',()=>editor.locator('.pe-modal-tabs [data-tab="ipqc"]').click(),async()=>{await editor.waitForFunction(n=>document.querySelectorAll('.pe-ipqc [data-ipqc-choice]').length===n&&!!document.querySelector('.pe-ipqc [data-ipqc-reload]'),abCount);assert.equal(await editor.locator('.pe-ipqc [role="alert"]').count(),0);});
  await measure(editor,'ipqc-ab:expand-standard',async()=>{await editor.locator('.process-ipqc-group > summary').first().click();await editor.locator('.process-ipqc-item-details > summary').first().click();},()=>editor.waitForFunction(()=>{const detail=document.querySelector('.process-ipqc-item-details');return detail?.open&&detail.querySelectorAll(':scope > p').length>=5&&detail.querySelectorAll('.process-ipqc-photos img').length===2;}));
  await images(editor,'ipqc-ab:visible-item-images','.process-ipqc-group:first-of-type article:first-of-type .process-ipqc-photos img',2,'ipqc-ab:expand-standard');
  await measure(editor,'ipqc-ab:reload',()=>editor.locator('[data-ipqc-reload]').click(),()=>editor.waitForFunction(n=>document.querySelectorAll('.pe-ipqc [data-ipqc-choice]').length===n&&!!document.querySelector('.pe-ipqc [data-ipqc-reload]'),abCount));
  await editor.locator('.process-ipqc-group > summary').first().click();
  await measure(editor,'ipqc-ab:select',()=>editor.locator('[data-ipqc-choice]').first().check(),()=>editor.waitForFunction(()=>document.querySelector('[data-ipqc-count="selected"]')?.textContent==='1'));
  await measure(editor,'block-apply-ipqc',()=>ack(editor,'apply',()=>editor.locator('#apply-operation').click()),async()=>{await editor.locator('#process-operation-dialog').waitFor({state:'detached'});await editor.waitForFunction(()=>ProcessAuthoringV3.flow().working.workspaces.flatMap(w=>Object.values(w.stages).flat()).find(op=>op.id==='photo-operation')?.ipqcAssignments?.length===1);});
  await persisted('AB selection persisted',c=>{const a=operation(c.workflow.working).ipqcAssignments;assert.equal(a.length,1);assert.equal(a[0].itemId,fixture.seed.abItemId);assert.equal(a[0].sourceVersionId,fixture.seed.abVersionId);});
  const header=editor.locator('.pe-card[data-node="photo-operation"] header');
  await measure(editor,'canvas-local-move',async()=>{await header.focus();await header.press('ArrowRight');},()=>editor.waitForFunction(()=>ProcessCanvasLocal.dirty()&&Number.parseFloat(document.querySelector('.pe-card[data-node="photo-operation"]').style.left)===100));
  await persisted('local move not yet written',c=>assert.equal(operation(c.workflow.working).x,80));
  await measure(editor,'canvas-sync',()=>ack(editor,'apply',()=>editor.locator('[data-pe="sync"]').click(),'canvas'),()=>editor.waitForFunction(()=>!ProcessCanvasLocal.dirty()&&!ProcessCanvasLocal.pending()&&document.querySelector('[data-pe="sync"]')?.disabled===false&&ProcessAuthoringV3.flow().working.workspaces.flatMap(w=>Object.values(w.stages).flat()).find(op=>op.id==='photo-operation')?.x===100));
  await persisted('canvas move persisted',c=>assert.equal(operation(c.workflow.working).x,100));
  await applyName(editor,'Round5 saved operation','block-apply-name');
  const firstSave=(await save(editor,'save')).workflow.saved;
  await measure(editor,'saved-reload',()=>editor.reload(),async()=>{await readyEditor(editor);await editor.waitForFunction(id=>ProcessAuthoringV3.flow().saved?.id===id,firstSave.id);});
  await images(editor,'saved-canvas-image','.pe-card[data-node="photo-operation"] img',1,'saved-reload');
  await persisted('reload saved snapshot intact',c=>assert.deepEqual(c.workflow.saved,firstSave));
  await measure(editor,'select-line-C',()=>editor.locator('#editor-line-select').selectOption('C'),()=>editor.locator('.pe-card[data-node="'+fixture.seed.cOperationId+'"]').waitFor());
  await openOperation(editor,fixture.seed.cOperationId);
  await measure(editor,'ipqc-c:first-read',()=>editor.locator('.pe-modal-tabs [data-tab="ipqc"]').click(),async()=>{await editor.waitForFunction(n=>document.querySelectorAll('.pe-c-ipqc-query .process-ipqc-choice').length===n&&!!document.querySelector('[data-c-query-reload]'),fixture.counts.approvedCItems);assert.equal(await editor.locator('.pe-c-ipqc-query [data-ipqc-choice]').count(),0);assert.equal(await editor.locator('.pe-c-ipqc-query [role="alert"]').count(),0);});
  await images(editor,'ipqc-c:visible-item-images','.pe-c-ipqc-query .process-ipqc-choice:first-of-type img',2,'ipqc-c:first-read');
  await measure(editor,'ipqc-c:reload',()=>editor.locator('[data-c-query-reload]').click(),()=>editor.waitForFunction(n=>document.querySelectorAll('.pe-c-ipqc-query .process-ipqc-choice').length===n,fixture.counts.approvedCItems));
  await closeOperation(editor);await editor.locator('#editor-line-select').selectOption('A');
  if(!smoke){
   // This deliberately changes shared working after Save: Submit must retain
   // the explicit saved cutoff rather than silently include this later Apply.
   await applyName(editor,'Round5 later unsaved working','block-apply-after-save');
   const firstCase=await submit(editor,'submit',firstSave);
   await toReview(editor,'review-platform-entry');await reviewDetails(editor,'review-case-detail','Round5 saved operation');
   assert(!(await editor.locator('.shared-restore-dialog main').innerText()).includes('Round5 later unsaved working'));
   await editor.locator('.shared-restore-dialog [data-close]').first().click();
   await measure(editor,'withdraw:open-dialog',()=>editor.locator('[data-process-review="withdraw"]').click(),()=>editor.locator('.vd-confirm[open]').waitFor());await fillConfirmation(editor,'Synthetic submitter withdrawal');
   await measure(editor,'withdraw:confirm',()=>ack(editor,'withdraw',()=>editor.locator('.vd-confirm[open] button[type="submit"]').click()),()=>editor.waitForFunction(id=>!ProcessAuthoringV3.flow().pendingId&&ProcessAuthoringV3.flow().cases.some(c=>c.id===id&&c.status==='withdrawn'),firstCase));
   await persisted('submitter withdrawal preserves snapshot',c=>{const review=c.workflow.cases.find(row=>row.id===firstCase);assert.equal(review.result.actor.id,fixture.actors.editor);assert.deepEqual(review.content,firstSave.content);});
   await editor.locator('[data-view="editor"]').first().click();await readyEditor(editor);
   await applyName(editor,'Round5 revised operation','block-apply-after-withdraw');const nextSave=(await save(editor,'save-after-withdraw')).workflow.saved;
   const secondCase=await submit(editor,'resubmit-withdrawn',nextSave);
   // Login's intentional allowlist retains view=approval, not approvalTab.
   // Select the real process tab after normal login rather than invent a deep link.
   const reviewer=await pageFor(fixture.actors.reviewer,{view:'approval'});await reviewer.locator('.site-entry-submit').click();await reviewer.locator('[data-review-tab="process"]').click();await readyReview(reviewer);
   await reviewDetails(reviewer,'return-case-detail','Round5 revised operation');await reviewAction(reviewer,'return','reviewer-return',secondCase);
   await persisted('reviewer return differs from withdrawal',c=>{const review=c.workflow.cases.find(row=>row.id===secondCase);assert.equal(review.result.actor.id,fixture.actors.reviewer);assert.deepEqual(review.content,nextSave.content);assert.equal(c.workflow.cases.find(row=>row.id===firstCase).status,'withdrawn');});
   await editor.reload();await readyEditor(editor);const thirdCase=await submit(editor,'resubmit-returned',nextSave);
   await reviewer.reload();await reviewer.locator('[data-review-tab="process"]').click();await readyReview(reviewer);await reviewDetails(reviewer,'approve-case-detail','Round5 revised operation');
   await reviewAction(reviewer,'approve','approve',thirdCase);
   const approved=await persisted('approval publishes exact saved content and retains all cases',c=>{assert.equal(c.activeVersionId,thirdCase);assert.deepEqual(c.workflow.active.content,nextSave.content);assert.equal(c.workflow.cases.find(row=>row.id===thirdCase).result.actor.id,fixture.actors.reviewer);assert.deepEqual(c.workflow.cases.map(row=>row.status),['withdrawn','returned','approved']);for(const review of c.workflow.cases){assert(review.result);assert.deepEqual(review.content,review.id===firstCase?firstSave.content:nextSave.content);}const old=c.versions.find(v=>v.id===fixture.seed.activeAuthoringId);assert.equal(old?.status,'superseded');assert.deepEqual(old.snapshot,fixture.seed.activeAuthoringSnapshot);});
   report.checks.push({name:'effective content hash',status:'PASS',sha256:hash(approved.workflow.active.content)});
   await measure(editor,'approved-reload',()=>editor.reload(),async()=>{await readyEditor(editor);await editor.waitForFunction(id=>ProcessAuthoringV3.flow().active.id===id&&!ProcessAuthoringV3.canMutate(),thirdCase);});
   await images(editor,'approved-canvas-image','.pe-card[data-node="photo-operation"] img',1,'approved-reload');
   await measure(reviewer,'review-history-list',()=>reviewer.locator('[data-process-review="history"]').click(),()=>reviewer.waitForFunction(()=>document.querySelectorAll('.shared-restore-dialog [data-case]').length===3));
   await measure(reviewer,'review-history-approved-detail',()=>reviewer.locator(`[data-case="${thirdCase}"]`).click(),()=>reviewer.waitForFunction(()=>document.querySelector('.shared-restore-dialog main')?.textContent.includes('Round5 revised operation')));
   await reviewer.locator('.shared-restore-dialog [data-close]').first().click();
  }
  await editor.screenshot({path:path.join(folder,`${variant}-${round}-editor.png`),fullPage:false});
  await Promise.all(responseTasks);
  const writes=report.api.filter(row=>row.path==='/api/process-authoring/workflow'&&row.method==='POST');
  const expectedWrites={begin:'begin','block-apply-ipqc':'apply','canvas-sync':'apply','block-apply-name':'apply',save:'save',...(!smoke?{'block-apply-after-save':'apply','submit:confirm':'submit','withdraw:confirm':'withdraw','block-apply-after-withdraw':'apply','save-after-withdraw':'save','resubmit-withdrawn:confirm':'submit','reviewer-return:confirm':'return','resubmit-returned:confirm':'submit','approve:confirm':'approve'}:{})};
  for(const [name,action]of Object.entries(expectedWrites)){const sent=writes.filter(row=>row.operation===name);assert.equal(sent.length,1,name+' must send exactly one command');assert.equal(sent[0].action,action);assert.equal(sent[0].status,200);}
  assert.equal(writes.length,Object.keys(expectedWrites).length,'No unmeasured/background authoring write');
  report.checks.push({name:'Exactly one acknowledged command for each requested write; no background or duplicate authoring command',status:'PASS',count:writes.length});
  assert.deepEqual(report.errors,[]);report.status='PASS';
 }catch(error){report.status='FAIL';report.error=error.message;report.errorStack=error.stack;for(const context of contexts){const page=context.pages()[0];if(page&&!page.isClosed()){try{report.failureText=(await page.locator('body').innerText()).slice(-5000);await page.screenshot({path:path.join(folder,`${variant}-${round}-failure.png`),fullPage:false});}catch{}break;}}}
 finally{for(const context of contexts)await context.close();await Promise.allSettled(responseTasks);persist();}
 return report;
}
