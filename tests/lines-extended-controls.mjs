import assert from 'node:assert/strict';
export async function checkExtendedControls({page,reviewer,origin,root,flow,lines,apply,phase,report,measure,save,submit,reason,reviewOpen,reviewAct}){
 for(const scope of ['AB','C']){const line=scope==='AB'?'A':'C',code=line+'-ROUND2';await lines(scope);await page.locator('#master-new-draft').click();await page.locator('[data-line-edit="'+line+'"]').waitFor();const active=JSON.stringify((await root()).active[scope]);
  for(let i=0;i<5;i++){
   await measure(scope+':downstream-product-options',async()=>{await page.goto(origin+'/process/index.html?system=process&view=data&dataTab='+scope);await page.locator('[data-product-edit="'+line+'1"]').click();assert((await page.locator('[name=stage-choice] option[value="'+code+'"]').textContent()).includes('Returned'));});await page.keyboard.press('Escape');
   await measure(scope+':downstream-category-options',async()=>{await page.locator('[data-category-pick="G"][data-category-line="'+line+'"]').click();await page.locator('[data-group-route-edit="G"][data-route-line="'+line+'"]').click();assert.equal(await page.locator('[data-group-stage] option[value="'+code+'"]').count(),1);});await page.keyboard.press('Escape');
  }assert.equal(JSON.stringify((await root()).active[scope]),active);
 }
 await lines('AB');await page.locator('[data-line-edit="AEMPTY"]').waitFor();
 const focus=async selector=>{const focused=await page.locator(selector).evaluate(n=>document.activeElement===n);if(!focused){report.defects.push({name:'dialog-focus',evidence:selector});if(!phase.startsWith('before'))assert(focused,'Dialog must restore keyboard focus');}};
 await page.locator('[data-line-edit="AEMPTY"]').click();await page.locator('#master-edit-dialog [name=code]').fill('AEMPTY2');await apply();await focus('[data-line-edit="AEMPTY2"]');
 const renamed=(await flow('AB')).working.lines.find(l=>l.code==='AEMPTY2');assert(renamed);report.checks.push('line code update preserves existing line ID and empty relationship');
 // Return to the same starting name before taking five independent UI samples.
 await page.locator('[data-line-edit="AEMPTY2"]').click();await page.locator('#master-edit-dialog [name=code]').fill('AEMPTY');await apply();
 for(let i=0;i<5;i++){
  await measure('AB:line-code-apply',async()=>{await page.locator('[data-line-edit="AEMPTY"]').click();await page.locator('#master-edit-dialog [name=code]').fill('AEMPTY2');await apply();assert.equal((await flow('AB')).working.lines.find(l=>l.code==='AEMPTY2').id,renamed.id);});
  await page.locator('[data-line-edit="AEMPTY2"]').click();await page.locator('#master-edit-dialog [name=code]').fill('AEMPTY');await apply();
  await measure('AB:collapse-lines',async()=>{await page.locator('.master-line-editor>summary').click();assert.equal(await page.locator('.master-line-editor').getAttribute('open'),null);});
  await measure('AB:expand-lines',async()=>{await page.locator('.master-line-editor>summary').click();assert.notEqual(await page.locator('.master-line-editor').getAttribute('open'),null);});
  await page.locator('[data-stage-edit="A-CUT"]').click();await page.keyboard.press('Escape');await focus('[data-stage-edit="A-CUT"]');
 }
 // Delete an actually empty, unused line; repeat fixtures by restoring it via
 // the real draft API, since the product intentionally has no add-line button.
 let empty=(await flow('AB')).working.lines.find(l=>l.code==='AEMPTY');
 for(let i=0;i<5;i++){
  let cancel=true;const cancelDialog=async d=>{if(cancel){cancel=false;await d.dismiss();}};
  // The runner owns native dialogs; install a short-lived handler by replacing it.
  const handlers=page.listeners('dialog');page.removeAllListeners('dialog');page.on('dialog',cancelDialog);
  await measure('AB:delete-empty-line-cancel',async()=>{await page.locator('[data-line-delete="AEMPTY"]').click();assert((await flow('AB')).working.lines.some(l=>l.id===empty.id));});
  page.removeAllListeners('dialog');for(const handler of handlers)page.on('dialog',handler);
  await measure('AB:delete-empty-line',async()=>{await page.locator('[data-line-delete="AEMPTY"]').click();await page.locator('[data-line-edit="AEMPTY"]').waitFor({state:'detached'});assert(!(await flow('AB')).working.lines.some(l=>l.id===empty.id));});
  empty=await page.evaluate(async row=>{row.id=crypto.randomUUID();await MasterDataWorkflow.shared.patch('AB',[{op:'insert',path:['lines'],value:row}]);return row;},empty);await lines('AB');
 }
 await page.locator('[data-stage-edit="A-CUT"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Focus test');await apply();await focus('[data-stage-edit="A-CUT"]');
 // Populate enough changes, saved snapshots and cases to exercise real cursors.
 await page.evaluate(async()=>{const bridge=MasterDataWorkflow.shared,line=bridge.flow('AB').working.lines.find(l=>l.code==='A');await bridge.patch('AB',Array.from({length:60},(_,i)=>({op:'insert',path:['lines',{id:line.id},'stages'],value:{id:crypto.randomUUID(),code:'A-PAGING'+i,name:'Paging '+i}})));await bridge.execute('AB','save');},null);
 for(let i=0;i<22;i++)await page.evaluate(async n=>{const b=MasterDataWorkflow.shared,line=b.flow('AB').working.lines.find(l=>l.code==='A');await b.patch('AB',[{op:'set',path:['lines',{id:line.id},'name'],value:'Paging '+n}],[{path:['lines',{id:line.id},'name'],value:line.name}]);await b.execute('AB','save');await b.execute('AB','submit',{savedId:b.flow('AB').saved.id,reason:'Paging fixture'});await b.execute('AB','withdraw',{caseId:b.flow('AB').pendingId,reason:'Paging fixture'});},i);
 await lines('AB');await page.locator('.vd-history>summary').click();await page.waitForFunction(()=>document.querySelector('.vd-shell')?.dataset.historyLoaded==='true');
 for(let i=0;i<5;i++)for(const kind of ['versions','saves']){
  const section=page.locator('.vd-history-page').nth(kind==='versions'?0:1);
  await measure('AB:history-'+kind+'-next',async()=>{await section.locator('nav button').last().click();await section.locator('nav span').filter({hasText:'2 /'}).waitFor();});
  await measure('AB:history-'+kind+'-prev',async()=>{await section.locator('nav button').first().click();await section.locator('nav span').filter({hasText:'1 /'}).waitFor();});
 }
 for(let i=0;i<5;i++){
  await measure('AB:history-dialog-open',async()=>{await page.locator('#master-shared-history').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();});
  const first=await page.locator('.shared-restore-overlay [data-case]').first().getAttribute('data-case');
  await measure('AB:history-cases-more',async()=>{await page.locator('.shared-restore-overlay [data-more]').click();await page.waitForFunction(id=>document.querySelector('.shared-restore-overlay [data-case]')?.dataset.case!==id,first);});
  await page.locator('.shared-restore-overlay [data-close]').first().click();await page.locator('#master-shared-history').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();
  await measure('AB:history-case-open',async()=>{await page.locator('.shared-restore-overlay [data-case]').first().click();await page.locator('.shared-restore-overlay [data-next]:not([disabled])').waitFor();});
  await measure('AB:history-content-next',async()=>{await page.locator('.shared-restore-overlay [data-next]').click();assert(await page.locator('.shared-restore-overlay [data-prev]').isEnabled());});
  await measure('AB:history-content-prev',()=>page.locator('.shared-restore-overlay [data-prev]').click());
  await measure('AB:history-case-back',async()=>{await page.locator('.shared-restore-overlay [data-back]').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();});
  await measure('AB:history-dialog-close',()=>page.locator('.shared-restore-overlay [data-close]').first().click());
 }
 await submit();await reviewOpen('AB');await reviewer.locator('#master-case-diff').click();await reviewer.locator('.master-diff-scroll').waitFor();
 for(let i=0;i<5;i++){
  await measure('AB:review-compare-next',async()=>{await reviewer.locator('[data-review-page="1"]').click();assert(await reviewer.locator('[data-review-page="-1"]').isEnabled());});
  await measure('AB:review-compare-prev',()=>reviewer.locator('[data-review-page="-1"]').click());
  await measure('AB:review-audit-open',()=>reviewer.locator('.master-review-audit>summary').click());
  await measure('AB:review-audit-close',()=>reviewer.locator('.master-review-audit>summary').click());
 }
 await measure('AB:review-withdraw',()=>reviewAct('withdraw'));assert.equal((await flow('AB')).pendingId,null);
 // Self review must require the explicit checkbox and preserve the pending case
 // when the confirm dialog is cancelled.
 await lines('AB');await submit();await page.locator('#master-view-review').click();await page.locator('[data-review-action="approve"]').click();
 assert.equal(await page.locator('.vd-confirm input[type=checkbox]').count(),1);assert.equal(await page.locator('.vd-confirm input[type=checkbox]').isChecked(),false);await page.locator('.vd-confirm textarea').fill('Synthetic self review');await page.locator('.vd-confirm [type=submit]').click();assert((await flow('AB')).pendingId);assert.equal(await page.locator('.vd-confirm').count(),1);await reason(page);await page.waitForFunction(()=>!document.querySelector('[data-review-action]'));assert.equal((await flow('AB')).pendingId,null);
 // Restore a materially older saved case: exercise preview pagination and a
 // concurrent edit between preview and Apply, without changing stored history.
 await lines('AB');await page.locator('#master-new-draft').click();await page.locator('[data-stage-edit="A-CUT"]').waitFor();
 await page.evaluate(async()=>{const b=MasterDataWorkflow.shared;await b.patch('AB',Array.from({length:12},(_,i)=>({op:'insert',path:['lines'],value:{id:crypto.randomUUID(),code:'RESTORE'+i,name:'Restore fixture '+i,stages:[]}})));});
 const oldCase=(await flow('AB')).cases[0],historyBefore=JSON.stringify((await flow('AB')).cases);
 await page.locator('.vd-history>summary').click();await page.waitForFunction(()=>document.querySelector('.vd-shell')?.dataset.historyLoaded==='true');await page.locator('#master-shared-history').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();
 while(!await page.locator('.shared-restore-overlay [data-case="'+oldCase.id+'"]').count()){await page.locator('.shared-restore-overlay [data-more]').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();}
 await page.locator('.shared-restore-overlay [data-case="'+oldCase.id+'"]').click();await page.locator('.shared-restore-overlay [data-restore]').click();await page.locator('#shared-restore-title').waitFor();
 const preview=page.locator('.shared-restore-overlay').last();
 for(let i=0;i<5;i++){await measure('AB:restore-preview-next',()=>preview.locator('[data-next]').click());assert(await preview.locator('[data-prev]').isEnabled());await measure('AB:restore-preview-prev',()=>preview.locator('[data-prev]').click());}
 await page.evaluate(async()=>{const b=MasterDataWorkflow.shared,line=b.flow('AB').working.lines.find(l=>l.code==='A');await b.patch('AB',[{op:'set',path:['lines',{id:line.id},'name'],value:'Newer edit must survive'}],[{path:['lines',{id:line.id},'name'],value:line.name}]);});
 await preview.locator('[data-apply]').click();await preview.locator('#shared-restore-error').filter({hasText:/./}).waitFor();assert.equal((await flow('AB')).working.lines.find(l=>l.code==='A').name,'Newer edit must survive');assert.equal(JSON.stringify((await flow('AB')).cases),historyBefore);await preview.locator('[data-close]').first().click();await page.keyboard.press('Escape');
 await lines('AB');
 await save('AB');
 const approvedId=(await root()).versions.find(v=>v.scope==='AB'&&v.status==='approved').id;
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!!document.querySelector('#master-lines-scope')&&!document.querySelector('#master-lines-scope').disabled);
 if((await page.locator('html').getAttribute('lang')).startsWith('vi'))await page.locator('.top-actions .language-switch').click();
 for(let i=0;i<5;i++){
  await measure('AB:reload-existing-draft',async()=>{await page.reload();await ready();});
  await page.locator('[data-dual-view="dashboard"]').click();await page.waitForFunction(()=>state.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await measure('AB:sidebar-data-to-lines',async()=>{await page.locator('[data-dual-view="data"]').click();await page.waitForFunction(()=>state.view==='data'&&document.documentElement.dataset.processNavigationStatus==='ready');if(!await page.locator('#master-lines-scope').count())await page.locator('.master-tabs [data-tab="line-admin"]').click();await ready();});
  await page.locator('[data-master-scope="AB"]').click();await page.waitForFunction(()=>state.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await measure('AB:data-tab-to-lines',async()=>{await page.locator('.master-tabs [data-tab="line-admin"]').click();await ready();});
  for(const scope of ['C','AB'])await measure(scope+':scope-switch',async()=>{await page.locator('#master-lines-scope').selectOption(scope);await page.waitForFunction(s=>state.masterScope===s&&!document.querySelector('#master-lines-scope').disabled,scope);});
  await page.locator('.vd-history>summary').click();await page.waitForFunction(()=>document.querySelector('.vd-shell')?.dataset.historyLoaded==='true');
  await measure('AB:history-pick-version',async()=>{await page.locator('[data-history-pick="'+approvedId+'"]').click();assert.equal(await page.locator('[data-stage-edit]').count(),0);});await page.locator('#master-return-draft').click();await page.locator('[data-stage-edit="A-CUT"]').waitFor();
  for(const language of ['vi','zh'])await measure('AB:language-'+language,async()=>{await page.locator('.top-actions .language-switch').click();await page.locator('#master-lines-scope').waitFor();assert((await page.locator('html').getAttribute('lang')).startsWith(language));});
 }
 report.checks.push('restore preview paging and revision conflict preserve newer edit/history; reload/sidebar/tabs/scope/language controls');
 report.checks.push('empty-line rename/delete/cancel; keyboard focus; line collapse; both metadata cursors; case list/content paging; review comparison/audit paging; review withdraw; explicit self-review checkbox');
}
