import assert from 'node:assert/strict';

// Separate from the workflow benchmark: five repeated UI cycles per build.
export async function measureLinesNavigation({page,control,lines}){
 const timings=[];const measure=async(label,fn)=>{const start=performance.now();await fn();timings.push({label,ms:performance.now()-start});};
 await page.setViewportSize({width:1366,height:900});await lines(page,'AB');
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!!document.querySelector('#master-lines-scope')&&!document.querySelector('#master-lines-scope').disabled&&!document.querySelector('#process-boot'));
 const working=async(scope)=>(await control()).workflowScopes[scope].working;
 for(let sample=0;sample<5;sample++){
  await measure('reload-existing-draft',async()=>{await page.reload();await ready();await page.locator('[data-stage-edit="A-NATIVE"]').waitFor();});
  await page.locator('[data-dual-view="dashboard"]').click();await page.waitForFunction(()=>state.view==='dashboard'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await measure('sidebar-data-to-lines',async()=>{await page.locator('[data-dual-view="data"]').click();await page.waitForFunction(()=>state.view==='data'&&document.documentElement.dataset.processNavigationStatus==='ready');if(!await page.locator('#master-lines-scope').count())await page.locator('.master-tabs [data-tab="line-admin"]').click();await ready();});
  await page.locator('[data-master-scope="AB"]').click();await page.waitForFunction(()=>state.dataTab==='AB'&&document.documentElement.dataset.processNavigationStatus==='ready');
  await measure('data-tab-to-lines',async()=>{await page.locator('.master-tabs [data-tab="line-admin"]').click();await ready();});
  for(const scope of ['C','AB'])await measure('scope-to-'+scope,async()=>{await page.locator('#master-lines-scope').selectOption(scope);await page.waitForFunction(s=>state.masterScope===s&&!document.querySelector('#master-lines-scope').disabled,scope);await page.locator('[data-stage-edit="'+(scope==='C'?'C':'A')+'-NATIVE"]').waitFor();});
  await measure('open-filled-stage',async()=>{await page.locator('[data-stage-edit="A-NATIVE"]').click();assert.equal(await page.locator('#master-edit-dialog [name=code]').inputValue(),'A-NATIVE');assert(await page.locator('#master-edit-dialog [name=name]').isEditable());});await page.keyboard.press('Escape');
  for(const scope of ['AB','C']){
   const line=scope==='AB'?'A':'C';if(scope==='C'){await page.locator('#master-lines-scope').selectOption(scope);await page.waitForFunction(()=>state.masterScope==='C'&&!document.querySelector('#master-lines-scope').disabled);}
   const stage=line+'-BENCH';
   await measure(scope+':new-stage-apply',async()=>{await page.locator('[data-stage-add="'+line+'"]').click();await page.locator('#master-edit-dialog [name=code]').fill(stage);await page.locator('#master-edit-dialog [name=name]').fill('Synthetic repeated stage');await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});assert.equal((await working(scope)).lines.find(l=>l.code===line).stages.filter(s=>s.code===stage).length,1);});
   const id=(await working(scope)).lines.find(l=>l.code===line).stages.find(s=>s.code===stage).id;
   await measure(scope+':rename-apply',async()=>{await page.locator('[data-stage-edit="'+stage+'"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Renamed Công đoạn');await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});const current=(await working(scope)).lines.find(l=>l.code===line).stages.find(s=>s.code===stage);assert.equal(current.id,id);assert.equal(current.name,'Renamed Công đoạn');});
   await measure(scope+':unused-stage-delete-with-check',async()=>{await page.locator('[data-stage-delete="'+stage+'"]').click();await page.locator('[data-stage-edit="'+stage+'"]').waitFor({state:'detached'});assert(!(await working(scope)).lines.find(l=>l.code===line).stages.some(s=>s.code===stage));});
  }
  await page.locator('#master-lines-scope').selectOption('AB');await page.waitForFunction(()=>state.masterScope==='AB'&&!document.querySelector('#master-lines-scope').disabled);
 }
 return timings;
}
