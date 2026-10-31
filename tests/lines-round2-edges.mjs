import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function checkRound2Edges({page,reviewer,fixture,origin,root,flow,lines,apply,actor,phase,report,measure}){
 const found=(name,evidence)=>report.defects.push({name,evidence,phase});
 await lines('AB');if(await page.locator('#master-new-draft').count())await page.locator('#master-new-draft').click();await page.locator('[data-line-edit="A"]').waitFor();
 // The same rejected-object regression must also be checked for the line editor.
 await page.locator('[data-line-edit="A"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Line retry recovered');
 await page.route(origin+'/api/master/workflow*',route=>route.request().method()==='POST'&&route.request().postDataJSON()?.command?.action==='apply'?route.fulfill({status:422,contentType:'application/json',body:'{"error":"SYNTHETIC_REJECTED"}'}):route.continue(),{times:1});
 await page.locator('#master-edit-dialog [type=submit]').click();await page.locator('#master-edit-dialog .master-dialog-error').filter({hasText:/./}).waitFor();
 await page.locator('#master-edit-dialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#master-edit-dialog')||!document.querySelector('#master-edit-dialog [type=submit]').disabled);
 const retryName=(await flow('AB')).working.lines.find(l=>l.code==='A').name;
 if(retryName!=='Line retry recovered'){found('line-edit-retry',await page.locator('#master-edit-dialog .master-dialog-error').textContent());if(!phase.startsWith('before'))assert.equal(retryName,'Line retry recovered');await page.keyboard.press('Escape');}else report.checks.push('line editor 422 retains input and same-ID retry persists');
 // A user can open an AB editor while a C read is still in flight.
 let release,seen;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>seen=resolve);
 await page.route(origin+'/api/master/workflow?scope=C*',async route=>{seen();await gate;await route.continue();},{times:1});
 await page.locator('#master-lines-scope').selectOption('C');await started;await page.locator('[data-stage-edit="A-CUT"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Keep current AB input');release();
 await page.waitForFunction(()=>!document.querySelector('#master-lines-scope').disabled);
 const stayed=await page.evaluate(()=>state.masterScope==='AB');
 if(!stayed){found('scope-response-during-edit','C response switches scope while AB editor remains open');if(!phase.startsWith('before'))assert.fail('Scope changed under an open AB editor');}else report.checks.push('late C read preserves newly opened AB editor, scope and input');
 assert.equal(await page.locator('#master-edit-dialog [name=name]').inputValue(),'Keep current AB input');await page.keyboard.press('Escape');await lines('AB');
 // Delete is also an Apply operation: a committed response loss must recover
 // its receipt and never issue a second removal.
 await page.locator('[data-stage-add="A"]').click();await page.locator('#master-edit-dialog [name=code]').fill('A-DELETE-ACK');await page.locator('#master-edit-dialog [name=name]').fill('Synthetic lost delete ACK');await apply();
 let deletePosts=0,deleteReceipts=0;const watch=req=>{if(!req.url().includes('/api/master/workflow'))return;if(req.method()==='POST'&&req.postDataJSON()?.command?.action==='apply')deletePosts++;if(req.url().includes('operationId='))deleteReceipts++;};page.on('request',watch);
 await page.route(origin+'/api/master/workflow*',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.command?.action==='apply'){await route.fetch();await route.abort('failed');}else await route.continue();},{times:1});
 await page.locator('[data-stage-delete="A-DELETE-ACK"]').click();await page.locator('[data-stage-edit="A-DELETE-ACK"]').waitFor({state:'detached'});page.off('request',watch);assert.equal(deletePosts,1);assert(deleteReceipts>=1);assert(!(await flow('AB')).working.lines.find(l=>l.code==='A').stages.some(s=>s.code==='A-DELETE-ACK'));report.checks.push('committed Delete response loss recovers receipt; one POST and authoritative removal');
 // Invalid values must keep the form open and not change D1.
 for(const value of ['', 'A-CUT', 'bad code !']){
  const before=JSON.stringify((await flow('AB')).working);await page.locator('[data-stage-add="A"]').click();await page.locator('#master-edit-dialog [name=code]').fill(value);await page.locator('#master-edit-dialog [name=name]').fill('Invalid');await page.locator('#master-edit-dialog [type=submit]').click();await page.waitForFunction(()=>MasterDataWorkflow.canLeave()&&(!document.querySelector('#master-edit-dialog')||!document.querySelector('#master-edit-dialog [type=submit]').disabled));
  if(JSON.stringify((await flow('AB')).working)!==before){found('invalid-stage-code-accepted',value);if(!phase.startsWith('before'))assert.fail('Invalid stage code changed D1');await page.locator('[data-stage-delete="'+value.toUpperCase()+'"]').click();await page.locator('[data-stage-edit="'+value.toUpperCase()+'"]').waitFor({state:'detached'});}else{assert.equal(await page.locator('#master-edit-dialog').count(),1);await page.keyboard.press('Escape');}
 }
 if(!report.defects.some(d=>d.name==='invalid-stage-code-accepted'))report.checks.push('required / duplicate / invalid stage code preserve input and D1');
 // Composition stays local; cancelling all supported ways must not write.
 await page.locator('[data-stage-edit="A-CUT"]').click();const beforeIME=JSON.stringify(await flow('AB'));
 await page.locator('#master-edit-dialog [name=name]').evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'}));input.value='中文 Công đoạn';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'中文'}));input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));});
 const oldURL=page.url();await page.evaluate(()=>ProcessDeliveryNavigation.navigate('data','C','process'));assert.equal(page.url(),oldURL);assert.equal(await page.locator('#master-edit-dialog [name=name]').inputValue(),'中文 Công đoạn');await page.keyboard.press('Escape');assert.equal(JSON.stringify(await flow('AB')),beforeIME);report.checks.push('synthetic composition + blocked departure + Esc retains original data (not physical IME)');
 // First scope switch must subscribe to the existing foreground poll.
 if(process.env.LINES_POLL_CHECK==='1'){
  await lines('AB');await page.locator('#master-lines-scope').selectOption('C');await page.waitForFunction(()=>state.masterScope==='C'&&!document.querySelector('#master-lines-scope').disabled);await page.locator('h1').click();await page.bringToFront();
  const endpoint=origin+'/api/master/workflow?scope=C';assert.equal((await reviewer.context().request.post(endpoint,{headers:{Origin:origin},data:{action:'begin'}})).status(),200);
  const current=await flow('C'),line=current.working.lines.find(l=>l.code==='C'),stage=line.stages[0],path=['lines',{id:line.id},'stages',{id:stage.id},'name'];
  assert.equal((await reviewer.context().request.post(endpoint,{headers:{Origin:origin},data:{command:{action:'apply',generation:current.generation,operationId:randomUUID(),clientId:'poll-peer',sequence:1,patches:[{op:'set',path,value:'Peer polling update'}],guards:[{path,value:stage.name}]}}})).status(),200);
  let updated=true;try{await page.waitForFunction(()=>MasterDataWorkflow.shared.flow('C')?.working.lines.find(l=>l.code==='C').stages[0].name==='Peer polling update',null,{timeout:36000});}catch{updated=false;}
  if(!updated){found('switched-scope-not-polled','C stays stale for a full 30-second foreground polling interval');if(!phase.startsWith('before'))assert.fail('C scope did not receive peer update');}else report.checks.push('C first scope switch receives other-user edit through real foreground polling');
 }
 // Scoped server permissions must drive controls on the shared line page.
 const row=await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first(),values=JSON.parse(row.values),users=JSON.parse(values.platformUsers),staff=users.find(u=>u.id==='staff');staff.accessOverrides['ab.create']=false;staff.accessOverrides['ab.delete']=false;staff.accessOverrides['lines.create']=true;staff.accessOverrides['lines.delete']=true;
 values.platformUsers=JSON.stringify(users);await fixture.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').bind(JSON.stringify(values)).run();
 const p=await actor('staff');await p.goto(origin+'/process/index.html?system=process&view=data&dataTab=line-admin');await p.locator('#master-lines-scope').waitFor();await p.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');
 const controls=await p.locator('[data-stage-add],[data-line-delete],[data-stage-delete]').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>({...n.dataset})));
 if(controls.length){found('scoped-create-delete-ui',controls);if(!phase.startsWith('before'))assert.deepEqual(controls,[]);}else report.checks.push('AB create/delete denial hides actionable line-page controls despite lines grant');
 await p.context().close();
 // Legacy and current history are readable; viewing/closing cannot rewrite them.
 await lines('AB');await page.locator('[data-line-edit="A"]').click();await page.locator('#master-edit-dialog [name=name]').fill('Before restore preview');await apply();const historyBefore=JSON.stringify(await root());await page.locator('.vd-history > summary').click();await page.waitForFunction(()=>document.querySelector('.vd-shell')?.dataset.historyLoaded==='true');
 await page.locator('#master-shared-history').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();
 await page.locator('.shared-restore-overlay [data-case]').first().click();await page.locator('.shared-restore-overlay [data-back]').waitFor();assert.equal(await page.locator('.shared-restore-overlay [data-restore]').count(),1);
 await measure('AB:restore-preview-open',async()=>{await page.locator('.shared-restore-overlay [data-restore]').click();await page.locator('#shared-restore-title').waitFor();});await measure('AB:restore-preview-cancel',()=>page.locator('.shared-restore-overlay').last().locator('[data-close]').last().click());assert.equal(await page.locator('.shared-restore-overlay').count(),1);
 await page.locator('.shared-restore-overlay [data-back]').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();
 await measure('AB:history-legacy-switch',async()=>{await page.locator('.shared-restore-overlay [data-archive]').click();await page.locator('.shared-restore-overlay [data-case]').first().waitFor();});await measure('AB:history-legacy-case-open',async()=>{await page.locator('.shared-restore-overlay [data-case]').first().click();await page.locator('.shared-restore-overlay [data-back]').waitFor();});assert.equal(await page.locator('.shared-restore-overlay [data-restore]').count(),0);
 await measure('AB:history-dialog-escape',async()=>{await page.keyboard.press('Escape');assert.equal(await page.locator('.shared-restore-overlay').count(),0);});assert.equal(JSON.stringify(await root()),historyBefore);report.checks.push('history case/back/archive/legacy/Esc and restore-preview cancel do not mutate any stored history');
 const beforeRestore=await flow('AB'),source=beforeRestore.cases.at(-1);assert(source.savedId);
 await page.locator('#master-shared-history').click();await page.locator('.shared-restore-overlay [data-case="'+source.id+'"]').click();await page.locator('.shared-restore-overlay [data-restore]').click();await page.locator('#shared-restore-title').waitFor();
 await measure('AB:restore-apply',async()=>{await page.locator('.shared-restore-overlay').last().locator('[data-apply]').click();await page.waitForFunction(()=>!document.querySelector('.shared-restore-overlay'));});
 const afterRestore=await flow('AB');assert.deepEqual(afterRestore.working,source.content);assert.deepEqual(afterRestore.saved,beforeRestore.saved);assert.deepEqual(afterRestore.cases,beforeRestore.cases);assert.deepEqual(afterRestore.active,beforeRestore.active);report.checks.push('history restore Apply changes working only; saved/effective/history preserved');
 // A server-side reference race must leave no rejected delete queued after its
 // optimistic snapshot has been fully rolled back.
 await page.locator('[data-stage-add="A"]').click();await page.locator('#master-edit-dialog [name=code]').fill('A-REFERENCE-RACE');await page.locator('#master-edit-dialog [name=name]').fill('Referenced synthetic stage');await apply();
 const record=await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first(),referenced=JSON.parse(record.values);referenced.processAuthoringControl=JSON.stringify({workflow:{working:{workspaces:[{id:'hidden-workspace',stages:{'A-REFERENCE-RACE':[{id:'hidden-operation'}]}}]}}});await fixture.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').bind(JSON.stringify(referenced)).run();
 await measure('AB:reference-details-open',async()=>{await page.locator('[data-stage-delete="A-REFERENCE-RACE"]').click();await page.locator('#master-stage-references').waitFor();});assert((await page.locator('#master-stage-references').innerText()).includes('hidden-operation'));assert.equal(await page.locator('#master-stage-references a').first().getAttribute('rel'),'noopener');await measure('AB:reference-details-close',async()=>{await page.locator('#master-stage-references button').click();await page.locator('#master-stage-references').waitFor({state:'detached'});});await page.locator('[data-stage-delete="A-REFERENCE-RACE"]').click();await page.locator('#master-stage-references').waitFor();await measure('AB:reference-details-escape',async()=>{await page.keyboard.press('Escape');await page.locator('#master-stage-references').waitFor({state:'detached'});});
 const rejected=await page.evaluate(()=>sharedDraftAccountState().failed);
 if(rejected){found('rejected-delete-still-queued',rejected);if(!phase.startsWith('before'))assert.equal(rejected,false,'Rolled-back delete must not block subsequent Save');}else{await page.locator('#master-save-draft').click();await page.waitForFunction(()=>MasterDataWorkflow.canLeave());assert((await flow('AB')).saved.content.lines.find(l=>l.code==='A').stages.some(s=>s.code==='A-REFERENCE-RACE'));report.checks.push('real reference dialog close preserves referenced stage and permits unrelated Save');}

}
