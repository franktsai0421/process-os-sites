import assert from 'node:assert/strict';

export async function checkLinesRecovery({page,origin,control,lines,confirmReview}){
 const results=[];
 await page.setViewportSize({width:1366,height:900});
 for(const scope of ['AB','C']){
  const line=scope==='AB'?'A':'C',before=await control();
  await page.goto(origin+'/process/index.html?system=process&view=data&dataTab='+scope);
  await page.locator('[data-product-edit="'+line+'1"]').click();
  assert((await page.locator('[name=stage-choice] option[value="'+line+'-NATIVE"]').textContent()).includes('隔離工段'));
  await page.keyboard.press('Escape');
  await page.locator('[data-category-pick="G"][data-category-line="'+line+'"]').click();
  await page.locator('[data-group-route-edit="G"][data-route-line="'+line+'"]').click();
  assert.equal(await page.locator('[data-group-stage] option[value="'+line+'-NATIVE"]').count(),1);
  await page.keyboard.press('Escape');assert.deepEqual((await control()).active[scope],before.active[scope]);
  results.push(scope+': approved stage appears in product and category selectors; cancellation leaves effective routes unchanged');
 }
 await lines(page,'AB');
 const stageName=root=>root.workflowScopes.AB.working.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-NATIVE').name;
 await page.locator('[data-stage-edit="A-NATIVE"]').click();
 await page.locator('#master-edit-dialog [name=name]').fill('Recovery edit Công đoạn');
 const source=page.url();
 await page.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C','process'));
 assert.equal(page.url(),source);assert.equal(await page.locator('#master-edit-dialog [name=name]').inputValue(),'Recovery edit Công đoạn');
 await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});
 assert.equal(stageName(await control()),'Recovery edit Công đoạn');results.push('unapplied input blocks navigation and remains editable');
 // Definitive Save rejection: no server write, no local draft loss, then retry.
 let rejectSave=true,savePosts=0;
 const pattern=origin+'/api/master/workflow*';
 await page.route(pattern,async route=>{const req=route.request();if(req.method()==='POST'&&req.postDataJSON()?.command?.action==='save'){savePosts++;if(rejectSave){rejectSave=false;return route.fulfill({status:422,contentType:'application/json',body:'{"error":"SYNTHETIC_SAVE_REJECTED"}'});}}return route.continue();});
 const before=(await control()).workflowScopes.AB.saved?.id;
 const failed=page.waitForResponse(r=>r.url().includes('/api/master/workflow')&&r.status()===422);
 await page.locator('#master-save-draft').click();await failed;await page.waitForFunction(()=>MasterDataWorkflow.canLeave());
 assert.equal((await control()).workflowScopes.AB.saved?.id,before);assert.equal(stageName(await control()),'Recovery edit Công đoạn');
 await page.locator('#master-save-draft').click();await page.waitForFunction(()=>MasterDataWorkflow.shared.flow('AB').saved?.content.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-NATIVE').name==='Recovery edit Công đoạn');
 assert.equal(savePosts,2);await page.unroute(pattern);results.push('Save 422 retains working data; explicit retry persists once');
 for(const action of ['save','submit']){
  // Change the existing stable stage so each operation has meaningful content.
  await page.locator('[data-stage-edit="A-NATIVE"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Lost '+action+' ACK');await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog').waitFor({state:'detached'});
  if(action==='submit'){await page.locator('#master-save-draft').click();await page.waitForFunction(()=>MasterDataWorkflow.shared.flow('AB').saved?.content.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-NATIVE').name==='Lost submit ACK');}
  let release,seen,operationId,posts=0,receipts=0;
  const held=new Promise(resolve=>release=resolve),committed=new Promise(resolve=>seen=resolve);
  const count=req=>{const url=new URL(req.url());if(req.method()==='GET'&&url.searchParams.get('operationId')===operationId)receipts++;};page.on('request',count);
  await page.route(pattern,async route=>{const req=route.request();if(req.method()==='POST'&&req.postDataJSON()?.command?.action===action){posts++;const response=await route.fetch();assert.equal(response.status(),200);operationId=(await response.json()).receipt.operationId;seen();await held;return route.abort('failed');}return route.continue();});
  try{
   if(action==='save')await page.locator('#master-save-draft').click();else{await page.locator('#master-submit').click();await page.locator('.vd-confirm textarea').fill('Synthetic lost submit response');await page.locator('.vd-confirm [type=submit]').click();}
   await committed;const url=page.url();await page.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C','process'));assert.equal(page.url(),url);assert.equal(await page.locator('#master-lines-scope').inputValue(),'AB');
   release();await page.waitForFunction(()=>window.sharedDraftAccountState?.().unknown>0);
   await page.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C','process'));assert.equal(page.url(),url);
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('#master-lines-scope').waitFor();
   const recover=page.locator('#master-shared-recover');
   if(await page.evaluate(()=>window.sharedDraftAccountState?.().unknown>0)){
    for(const detail of await recover.locator('xpath=ancestor::details').all())if(await detail.getAttribute('open')===null)await detail.locator(':scope > summary').click();
    await recover.click();
   }
   await page.waitForFunction(()=>!window.sharedDraftAccountState?.().unknown);
   assert.equal(posts,1);assert(receipts>=1);const root=await control();assert.equal(stageName(root),'Lost '+action+' ACK');
   if(action==='save')assert.equal(root.workflowScopes.AB.saved.content.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-NATIVE').name,'Lost save ACK');
   else{const flow=root.workflowScopes.AB;assert(flow.pendingId);assert.equal(flow.cases.find(c=>c.id===flow.pendingId).content.lines.find(l=>l.code==='A').stages.find(s=>s.code==='A-NATIVE').name,'Lost submit ACK');await page.locator('#master-withdraw').click();await confirmReview(page);await page.locator('#master-submit').waitFor();}
   results.push({action,inFlightNavigationBlocked:true,unknownNavigationBlocked:true,posts,receipts,reloaded:true,readback:true});
  }finally{release();page.off('request',count);await page.unroute(pattern);}
 }
 await page.locator('#master-save-draft').click();await page.waitForFunction(()=>MasterDataWorkflow.canLeave());
 await page.locator('[data-master-scope="C"]').click();await page.waitForFunction(()=>state.dataTab==='C'&&document.documentElement.dataset.processNavigationStatus==='ready');
 results.push('successful Save permits actual navigation to C');
 return results;
}
