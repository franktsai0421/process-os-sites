import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

import {cases,seed} from './quality-item-code-compiled-fixture.mjs';

for (const language of ['zh','vi']) for (const c of cases) {
  test(`manual error codes through the data backend, ${c.module} ${c.line || ''} ${language}`, async t => {
    const fixture = await createABCFixture({products:1,decorate:seed});
    t.after(() => fixture.close());
    const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
    t.after(() => browser.close());
    const context = await browser.newContext({serviceWorkers:'block',viewport:(process.env.QUALITY_TEST_CROSSOVER==='1'?language==='zh':language==='vi')?{width:390,height:844}:{width:1365,height:900}});
    const origin = fixture.url.origin;
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem('processUILanguage',lang), language);
    await context.addCookies([{name:'process_demo',value:fixture.cookie('frank'),url:origin}]);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const path = '/process/?system=quality&view=data&dataTab=quality-'+c.module;
    const scope = c.line === 'B' ? 'B:GB' : 'A:G';
    const workflow = '/api/'+c.module+'/workflow'+(c.line ? '?scope='+encodeURIComponent(scope) : '');
    const form = page.locator(c.form);
    const code = form.locator('[name=code],#ab-error-code');
    const name = form.locator('[name=name],[name=nameVi],#ab-error-name');
    const apply = form.locator('[type=submit],#ab-apply');
    const raw = '  MiXeD Ω / 07 + [x]  ', minePrefix = 'Q 09 / 越', peerPrefix='Peer / Q 8';
    const renamed=language==='vi'?peerPrefix:minePrefix;
    async function enter() {
      await page.goto(origin+path);
      if (c.module === 'iqc') await page.locator('[data-select-part=P1]').click();
      if (c.line === 'B') await page.locator('#ipqcab-line').selectOption('B');
      await page.locator(c.add).waitFor();
    }
    async function persisted(whole=false) {
      const row = await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
      const values = await fixture.load('lib/process-state.ts').decodeValues(row.values);
      const control = JSON.parse(values[c.key]);
      if (c.line) return whole ? control.moduleDraft : control.scopes[scope];
      return c.module === 'fqc' ? control.libraries.fqc : control;
    }
    function response(action) {
      return page.waitForResponse(r => r.request().method()==='POST' && r.url().includes('/workflow') && r.request().postDataJSON()?.command?.action===action);
    }
    async function expectDuplicate() {
      await apply.click();
      assert.ok(await form.isVisible());
      const message = await form.evaluate(el => el.innerText+' '+Array.from(el.querySelectorAll('input'),item=>item.validationMessage).join(' '));
      assert.match(message,language==='vi'?/bản ghi khác/i:/另一筆/);
    }
    await enter();
    const original = await persisted(), before = original.workflow.working;
    const originalCode = before.errors.find(row => row.id === c.id).code;
    const active = original.versions.find(v => v.id === original.activeVersionId);
    const legacyField={fqc:'name',iqc:'nameVi','ipqc-ab':'standard','ipqc-c':'standard'}[c.module];
    const legacy=before.items.find(item=>item.id==='ambiguous'),legacyPath=['items',{id:legacy.id},legacyField];
    const legacyEdit=await page.request.post(origin+workflow,{headers:{Origin:origin,'X-Process-Expected-Actor':'frank'},data:{command:{
      action:'apply',operationId:randomUUID(),clientId:'edit-unmapped-item',sequence:1,generation:original.workflow.generation,
      patches:[{op:'set',path:legacyPath,value:'Synthetic manual edit'}],guards:[{path:legacyPath,value:legacy[legacyField]}]
    }}});
    assert.equal(legacyEdit.status(),200,await legacyEdit.text());
    const legacyNumber=c.module==='fqc'||c.module==='iqc'?'checkNo':'code';
    const edited=(await persisted()).workflow.working.items.find(row=>row.id===legacy.id);
    assert.equal(edited[legacyNumber],legacy[legacyNumber]);assert.equal(edited[legacyField],'Synthetic manual edit');
    const directPath=['items',{id:legacy.id},legacyNumber];
    const badRepair=await page.request.post(origin+workflow,{headers:{Origin:origin,'X-Process-Expected-Actor':'frank'},data:{command:{
      action:'apply',operationId:randomUUID(),clientId:'change-unmapped-number',sequence:1,generation:original.workflow.generation,
      patches:[{op:'set',path:directPath,value:originalCode+'-000'}],guards:[{path:directPath,value:legacy[legacyNumber]}]
    }}});
    assert.equal(badRepair.status(),422);assert.equal((await badRepair.json()).error,'ITEM_CODE_INVALID');
    await enter();
    const forms={
      fqc:['#fqc-add-item','[data-edit-item="row0"]','.fqc-item-form'],
      iqc:['[data-add-item="'+c.id+'"]','[data-edit-item="row0"]','#iqc-item-form'],
      'ipqc-ab':['#ipqcab-add-item','[data-ab-edit-item="row0"]','.ipqcab-dialog'],
      'ipqc-c':['[data-ipqcc-add="item"]','[data-ipqcc-edit-item="row0"]','#ipqcc-editor']
    };
    const [addItem,editItem,itemForm]=forms[c.module];
    const legacySelector=editItem.replace('row0','ambiguous');
    if(c.module==='ipqc-c'){
      const details=page.locator('details.ipqcc-item').filter({has:page.locator(legacySelector)}).first();
      if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
    }
    await page.locator(legacySelector).first().click();
    const legacyEditor=page.locator(itemForm),legacySuffix=legacyEditor.locator('[data-code-suffix]');
    assert.equal(await legacyEditor.locator('[data-legacy-code]').innerText(),legacy[legacyNumber]);
    assert.equal(await legacySuffix.inputValue(),'');assert.equal(await legacySuffix.getAttribute('required'),null);
    await legacyEditor.locator({fqc:'[name=name]',iqc:'[name=nameVi]','ipqc-c':'[name=standard]','ipqc-ab':'#ab-standard'}[c.module]).fill('Synthetic UI legacy edit');
    await legacyEditor.locator('[type=submit],#ab-apply').last().click();
    await legacyEditor.waitFor({state:'hidden'});
    const legacySave=response('save');await page.locator('#'+c.prefix+'-save').click();
    const legacySaved=await legacySave;assert.equal(legacySaved.status(),200,await legacySaved.text());
    await enter();
    const retained=(await persisted()).workflow.working.items.find(row=>row.id===legacy.id);
    assert.equal(retained[legacyNumber],legacy[legacyNumber]);assert.equal(retained[legacyField],'Synthetic UI legacy edit');
    async function editSuffix(selector,wanted,isNew=false) {
      if(c.module==='ipqc-c'&&!isNew){const details=page.locator('details.ipqcc-item').first();if(!await details.evaluate(el=>el.open))await details.locator('summary').click();}
      await page.locator(selector).first().click();
      const editor=page.locator(itemForm),suffix=editor.locator('[data-code-suffix]'),done=editor.locator('[type=submit],#ab-apply').last();
      assert.equal(await editor.locator('[data-code-prefix]').innerText(),originalCode+'-');
      if(isNew){
        for(const name of ['[name=name]','[name=nameVi]','[name=standard]','#ab-standard'])if(await editor.locator(name).count())await editor.locator(name).fill('Synthetic item');
        if(c.module==='ipqc-c')await editor.locator('[name=ruleCadence]').selectOption('none');
        for(const invalid of ['00','9','100','a7','０７','-7','01']){
          await suffix.fill(invalid);await done.click();assert.ok(await editor.isVisible());assert.equal(await suffix.evaluate(el=>el.validity.valid),false,invalid);
        }
      }
      await suffix.fill(wanted);
      assert.equal(await editor.locator('[data-code-result]').innerText(),originalCode+'-'+wanted);
      await done.click();await editor.waitFor({state:'hidden',timeout:3500}).catch(async err=>{throw Error(err.message+' · '+await editor.innerText());});
    }
    await editSuffix(addItem,'07',true);await editSuffix(editItem,'03');
    await page.locator(c.add).click();
    assert.equal(await code.inputValue(),'');
    await name.fill('Synthetic manually entered');
    await code.fill(originalCode.toLowerCase()); await expectDuplicate();
    await code.fill(raw); await apply.click(); await form.waitFor({state:'hidden'});
    await page.locator(c.edit).click(); assert.equal(await code.inputValue(),originalCode);
    await apply.click(); await form.waitFor({state:'hidden'});
    await page.locator(c.edit).click(); await code.fill(raw.trim().toUpperCase()); await expectDuplicate();
    await code.fill(minePrefix);
    const mappings=form.locator('[data-rename-preview]');
    for(const [id,wanted] of [['long','23'],['ambiguous','04']]){
      const field=mappings.locator('[data-rename-id="'+id+'"] input');assert.equal(await field.inputValue(),'');
      await apply.click();assert.ok(await form.isVisible());await field.fill(wanted);
    }
    await apply.click(); await form.waitFor({state:'hidden'});
    const peerContext=await browser.newContext({viewport:page.viewportSize(),serviceWorkers:'block'});
    await peerContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await peerContext.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);
    await peerContext.addCookies([{name:'process_demo',value:fixture.cookie('quality-reviewer'),url:origin}]);
    const peer=await peerContext.newPage();await peer.goto(origin+path);
    if(c.module==='iqc')await peer.locator('[data-select-part=P1]').click();
    if(c.line==='B')await peer.locator('#ipqcab-line').selectOption('B');
    await peer.locator(c.edit).click();const peerForm=peer.locator(c.form);
    await peerForm.locator('[name=code],#ab-error-code').fill(peerPrefix);
    await peerForm.locator('[name=name],[name=nameVi],#ab-error-name').fill('Independent peer edit');
    await peerForm.locator('[data-rename-id=long] input').fill('23');
    await peerForm.locator('[data-rename-id=ambiguous] input').fill('04');
    await peerForm.locator('[type=submit],#ab-apply').click();
    const peerSave=peer.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/workflow')&&r.request().postDataJSON()?.command?.action==='save');
    await peer.locator('#'+c.prefix+'-save').click();const peerSaved=await peerSave;assert.equal(peerSaved.status(),200,await peerSaved.text());
    await peerContext.close();
    const savedResponse = response('save'); await page.locator('#'+c.prefix+'-save').click();
    const choiceAttr={fqc:'data-fqc-save-choice',iqc:'data-iqc-save-choice','ipqc-ab':'data-ab-conflict-choice','ipqc-c':'data-save-choice'}[c.module];
    const take=language==='vi'?(c.line?'server':'theirs'):'mine';
    await page.locator('['+choiceAttr+'="'+take+'"]').click();
    const saveResult=await savedResponse;assert.equal(saveResult.status(),200,await saveResult.text());
    await enter();
    const stored = await persisted(), flow = stored.workflow;
    const parent=flow.working.errors.find(row=>row.id===c.id);
    assert.equal(parent.code,renamed);assert.equal(parent.nameVi??parent.name,'Independent peer edit');
    const added = flow.working.errors.filter(row=>row.code===raw);
    assert.equal(added.length,1);
    const field=c.module==='fqc'||c.module==='iqc'?'checkNo':'code';
    const expectedItems=flow.working.items;
    assert.equal(expectedItems.find(row=>row.id==='row0')[field],renamed+'-03');
    assert.equal(expectedItems.filter(row=>row[field]===renamed+'-07').length,1);
    assert.equal(expectedItems.find(row=>row.id==='long')[field],renamed+'-23');
    assert.equal(expectedItems.find(row=>row.id==='ambiguous')[field],renamed+'-04');
    assert.deepEqual(stored.versions.find(v=>v.id===stored.activeVersionId),active);
    for (const [invalid,reason] of [[originalCode,'ERROR_CODE_DUPLICATE'],['   ','ERROR_CODE_REQUIRED']]) {
      const codePath = ['errors',{id:added[0].id},'code'];
      const result = await page.request.post(origin+workflow,{headers:{Origin:origin,'X-Process-Expected-Actor':'frank'},data:{command:{
        action:'apply',operationId:randomUUID(),clientId:'manual-code-negative-test',sequence:1,generation:flow.generation,
        patches:[{op:'set',path:codePath,value:invalid}],guards:[{path:codePath,value:raw}]
      }}});
      assert.equal(result.status(),422);
      assert.equal((await result.json()).error,reason);
      assert.deepEqual(await persisted(),stored);
    }
    const codePath=['items',{id:'row0'},field];
    for(const [candidate,error] of [[renamed+'-07','ITEM_CODE_DUPLICATE'],[renamed+'-00','ITEM_CODE_INVALID'],[renamed+'-３１','ITEM_CODE_INVALID']]){
      const reply=await page.request.post(origin+workflow,{headers:{Origin:origin,'X-Process-Expected-Actor':'frank'},data:{command:{
        action:'apply',operationId:randomUUID(),clientId:'rejected-item-number',sequence:1,generation:flow.generation,
        patches:[{op:'set',path:codePath,value:candidate}],guards:[{path:codePath,value:renamed+'-03'}]
      }}});
      assert.equal(reply.status(),422);assert.equal((await reply.json()).error,error);assert.deepEqual(await persisted(),stored);
    }
    await page.locator('#'+c.prefix+'-submit').click();
    const confirm = page.locator('dialog.vd-confirm[open]');
    assert.ok((await confirm.locator('[data-quality-code-changes]').innerText()).includes(renamed+'-03'));
    await confirm.locator('textarea').fill('Synthetic review');
    const submittedResponse = response('submit'); await confirm.locator('button[type=submit],button.signal').last().click();
    assert.equal((await submittedResponse).status(),200);
    const pending = (await persisted(Boolean(c.line))).workflow;
    assert.ok(pending.pendingId);
    assert.equal(pending.cases.find(row=>row.id===pending.pendingId).savedId,pending.saved.id);
    const content = c.line ? pending.saved.content.scopes[scope] : pending.saved.content;
    assert.deepEqual(content.items,expectedItems);
    assert.equal(content.errors.find(row=>row.id===c.id).code,renamed);
    const pendingCase=pending.pendingId;
    assert.deepEqual((await persisted()).versions.find(v=>v.id===original.activeVersionId).snapshot,active.snapshot);
    const reviewer=await browser.newContext({viewport:page.viewportSize(),serviceWorkers:'block'});
    await reviewer.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const cookie=actor=>({name:'process_demo',value:fixture.cookie(actor),url:origin});
    await reviewer.addCookies([cookie('viewer')]);
    const approvalEndpoint=c.line?'/api/ipqc-ab/workflow?module=1':workflow;
    const blocked=await reviewer.request.post(origin+approvalEndpoint,{headers:{Origin:origin,'X-Process-Expected-Actor':'viewer'},data:{command:{
      action:'approve',operationId:randomUUID(),clientId:'quality-denied-review',sequence:1,generation:pending.generation,caseId:pendingCase
    }}});
    assert.equal(blocked.status(),403);
    assert.equal((await persisted(Boolean(c.line))).workflow.pendingId,pendingCase);
    await reviewer.addCookies([cookie('quality-reviewer')]);
    if(language==='zh'){
      // Simulate a competing occupied effective number between submission and
      // approval inside this test's in-memory D1/R2 fixture.
      const row=await fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
      const values=await fixture.load('lib/process-state.ts').decodeValues(row.values);
      const model=JSON.parse(values[c.key]),member=c.line?model.scopes[scope]:c.module==='fqc'?model.libraries.fqc:model;
      const includeOccupied=snapshot=>{const template=snapshot.items[0];snapshot.items.push({...template,id:'competing-item',[field]:renamed+'-03'});};
      includeOccupied(member.versions.find(v=>v.id===member.activeVersionId).snapshot);
      includeOccupied(member.workflow.active.content);
      values[c.key]=JSON.stringify(model);
      const records=fixture.load('lib/state-records.ts');
      const synthetic=await records.encodeRecordValues(await fixture.mf.getR2Bucket('STATE_ARCHIVE'),values);
      const swap=async(from,blob)=>{const result=await fixture.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1 AND revision=?').bind(blob,from).run();assert.equal(result.meta.changes,1);};
      await swap(row.revision,synthetic);
      const declined=await reviewer.request.post(origin+approvalEndpoint,{headers:{Origin:origin,'X-Process-Expected-Actor':'quality-reviewer'},data:{command:{
        action:'approve',operationId:randomUUID(),clientId:'occupied-after-submit',sequence:1,generation:pending.generation,caseId:pendingCase
      }}});
      const denial=await declined.json();assert.equal(declined.status(),422,JSON.stringify(denial));assert.equal(denial.error,'ITEM_CODE_DUPLICATE');
      assert.equal((await persisted(Boolean(c.line))).workflow.pendingId,pendingCase);
      assert.equal((await persisted()).activeVersionId,original.activeVersionId);
      await swap(row.revision+1,row.values);
    }
    await reviewer.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);
    const review=await reviewer.newPage();review.setDefaultTimeout(8000);
    await review.goto(origin+'/process/?system=quality&view=approval&approvalTab=quality');
    await review.locator('[data-review-jump="'+c.module+'"]').click();
    const panel=review.locator('#review-'+c.module);
    if(c.module==='fqc'||c.module==='iqc')await panel.locator('['+(c.module==='fqc'?'data-quality-review':'data-iqc-review')+'="'+pendingCase+'"]').click();
    else await panel.locator('details[data-case-id="'+pendingCase+'"] > summary').click();
    const view=panel.locator('[data-quality-code-changes]').filter({hasText:renamed+'-03'});
    if(c.module==='iqc'&&!await view.count()){await panel.locator('#iqc-review-content').click();await review.locator('.shared-restore-overlay [data-quality-code-changes]').filter({hasText:renamed+'-03'}).waitFor();await review.locator('.shared-restore-overlay header [data-close]').click();}
    else await view.first().waitFor();
    const approve={fqc:'#quality-approve',iqc:'#iqc-review-approve','ipqc-ab':'[data-ab-module-action=approve]','ipqc-c':'[data-ipqcc-review=approve]'};
    await panel.locator(approve[c.module]).first().click();
    const answer=review.locator('dialog.vd-confirm[open]');
    const accepted=review.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/workflow')&&r.request().postDataJSON()?.command?.action==='approve');
    await answer.locator('button[type=submit]').click();
    const result=await accepted;assert.equal(result.status(),200,await result.text());
    const effective=await persisted(),final=effective.versions.find(v=>v.id===effective.activeVersionId);
    assert.equal(final.snapshot.items.find(row=>row.id==='row0')[field],renamed+'-03');
    assert.deepEqual(effective.versions.find(v=>v.id===original.activeVersionId).snapshot,active.snapshot);
    await reviewer.close();
  });
}

