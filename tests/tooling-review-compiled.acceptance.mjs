import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const seedTooling=createRequire(import.meta.url)('../scripts/tooling-local-save-fixture.cjs');
const dataURL='/process/?system=quality&view=data&dataTab=quality-mold-equipment';
const approvalURL='/process/?system=quality&view=approval&approvalTab=master';
const workflow='/api/tooling/workflow';
const sample='Synthetic changed tool note';

for(const lang of ['zh','vi'])test('tooling case completes review across distinct accounts in '+lang,async()=>{
  const seed=await seedTooling();
  let control;
  try{
    control=await seed.read();
    const tools=control.versions[0].snapshot.tools;
    while(tools.length<368)tools.push(seed.tool('fixture-'+tools.length));
  }finally{seed.close();}
  const f=await createABCFixture({products:1,decorate(values){
    values.toolingMasterControl=JSON.stringify(control);
    const users=JSON.parse(values.platformUsers);
    const writer=users.find(u=>u.id==='writer');
    Object.assign(writer.accessOverrides,{'tooling.view':true,'tooling.edit':true,'tooling.submit':true,'tooling.withdraw':true,'approval.view':true});
    values.platformUsers=JSON.stringify(users);
  }});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  const errors=[],writes=[];
  async function account(actor,trackWrites=true){
    const ctx=await browser.newContext({viewport:{width:lang==='vi'?390:1280,height:920},serviceWorkers:'block'});
    await ctx.addCookies([{name:'process_demo',value:f.cookie(actor),url:f.url.origin}]);
    await ctx.addInitScript(value=>localStorage.setItem('processUILanguage',value),lang);
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===f.url.origin?route.continue():route.abort());
    const p=await ctx.newPage();
    p.setDefaultTimeout(25000);
    p.on('pageerror',e=>errors.push(e.message));
    p.on('dialog',d=>d.accept());
    p.on('request',r=>{if(trackWrites&&r.method()==='POST'&&new URL(r.url()).pathname===workflow)writes.push([actor,r.postDataJSON().command?.action]);});
    return p;
  }
  const read=p=>p.evaluate(async path=>{
    const response=await fetch(path+'?caseMetadata=1');
    if(!response.ok)throw Error(String(response.status));
    return (await response.json()).control;
  },workflow);
  const readyEditor=p=>p.waitForFunction(()=>document.querySelector('#tooling-save')?.disabled===false&&!window.sharedDraftAccountState().queued);
  async function caseAction(p,locator,action,reason){
    await locator.click();
    const dialog=p.locator('dialog.vd-confirm[open]');
    await dialog.locator('textarea').fill(reason);
    const reply=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===workflow&&r.request().postDataJSON().command?.action===action);
    await dialog.locator('button[type=submit]').click();
    const response=await reply;
    assert.equal(response.status(),200);
    const body=await response.json();
    assert.ok(body.receipt?.operationId);
    await p.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!window.sharedDraftAccountState().unknown);
    return body;
  }
  try{
    const editor=await account('writer'),reviewer=await account('frank');
    await editor.goto(f.url.origin+dataURL);await editor.locator('#tooling-begin').click();await readyEditor(editor);
    await editor.locator('[data-tool-edit="one"]').click();
    await editor.locator('dialog [name=notes]').fill(sample);
    await editor.locator('dialog button[type=submit]').click();
    await editor.locator('#tooling-save').click();await readyEditor(editor);
    const saved=(await read(editor)).workflow.saved;
    assert.equal(saved.content.tools.find(t=>t.id==='one').notes,sample);
    await editor.reload();await readyEditor(editor);assert.equal((await read(editor)).workflow.saved.id,saved.id);
    const submit=async()=>{
      const result=await caseAction(editor,editor.locator('#tooling-submit'),'submit','Synthetic review case');
      const id=result.receipt.caseId,flow=(await read(editor)).workflow;
      assert.equal(flow.pendingId,id);assert.equal(flow.cases.find(c=>c.id===id).savedId,saved.id);
      await editor.waitForFunction(()=>document.querySelector('#tooling-withdraw')?.disabled===false);
      return id;
    };
    const inspect=async(id)=>{
      await reviewer.goto(f.url.origin+approvalURL);
      await reviewer.waitForFunction(()=>document.querySelector('#approval-tab-quality .approval-tab-count')?.textContent==='1');
      await reviewer.locator('#approval-tab-quality').click();
      await reviewer.waitForFunction(()=>document.querySelector('[data-overview-count=tooling]')?.textContent==='1');
      await reviewer.locator('[data-review-jump=tooling]').click();
      const card=reviewer.locator('#review-tooling [data-case-id="'+id+'"]');
      assert.match(await card.innerText(),/Synthetic review case/);
      await card.locator('[data-tooling-compare]').click();
      await reviewer.locator('.shared-restore-overlay').getByText(sample,{exact:true}).first().waitFor({state:'attached'});
      await reviewer.locator('.shared-restore-overlay header [data-close]').click();
      return card;
    };
    const first=await submit();await inspect(first);
    const restricted=await editor.evaluate(async()=>{const r=await fetch('/api/quality-review-count');return [r.status,await r.json()];});
    assert.deepEqual(restricted,[200,{count:null}]);
    if(lang==='vi'){
      // This context loses an uncommitted withdrawal. An ordinary read can show
      // the current pending case without settling the original write.
      const uncertain=await account('writer',false);
      await uncertain.goto(f.url.origin+dataURL);
      let attempts=0;
      await uncertain.route('**/api/tooling/workflow?*',route=>{
        const req=route.request();
        if(req.method()==='POST'&&req.postDataJSON()?.command?.action==='withdraw'){attempts++;return route.abort();}
        return route.fallback();
      });
      await uncertain.locator('#tooling-withdraw').click();
      await uncertain.locator('dialog.vd-confirm textarea').fill('Synthetic lost request');
      await uncertain.locator('dialog.vd-confirm button[type=submit]').click();
      await uncertain.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);
      await uncertain.reload();
      await uncertain.locator('#tooling-withdraw').waitFor({state:'visible'});
      assert.equal(await uncertain.locator('#tooling-withdraw').isDisabled(),true);
      assert.equal(await uncertain.evaluate(()=>window.sharedDraftAccountState().unknown),true);
      assert.equal((await read(uncertain)).workflow.pendingId,first);
      await uncertain.goto(f.url.origin+'/process/?system=quality&view=approval&approvalTab=quality');
      await uncertain.locator('#review-tooling [data-case-id="'+first+'"]').waitFor({state:'attached'});
      await uncertain.waitForFunction(()=>document.querySelector('[data-overview-count=tooling]')?.textContent==='1');
      assert.equal(await uncertain.locator('#review-tooling [data-tooling-action=withdraw]').first().isDisabled(),true);
      assert.equal(attempts,1);
      await uncertain.context().close();
    }
    if(lang==='zh')await editor.route('**/api/tooling/workflow?*',async route=>{
      const req=route.request();
      if(req.method()!=='POST'||req.postDataJSON()?.command?.action!=='withdraw')return route.fallback();
      const response=await route.fetch();
      await new Promise(resolve=>setTimeout(resolve,15500));
      await route.fulfill({response});
    });
    await caseAction(editor,editor.locator('#tooling-withdraw'),'withdraw','Synthetic withdrawal');
    await readyEditor(editor);
    assert.equal((await read(editor)).workflow.cases.find(c=>c.id===first).status,'withdrawn');
    await reviewer.reload();
    await reviewer.waitForFunction(()=>document.querySelector('[data-overview-count=tooling]')?.textContent==='0');
    await editor.reload();await readyEditor(editor);
    const second=await submit();assert.notEqual(second,first);
    let card=await inspect(second);
    await caseAction(reviewer,card.locator('[data-tooling-action=return]'),'return','Synthetic correction');
    await editor.reload();await readyEditor(editor);
    assert.equal((await read(editor)).workflow.cases.find(c=>c.id===second).status,'returned');
    const third=await submit();
    card=await inspect(third);
    await caseAction(reviewer,card.locator('[data-tooling-action=approve]'),'approve','Synthetic approval');
    const final=await read(reviewer),approved=final.versions.find(v=>v.id===third);
    assert.equal(final.activeVersionId,third);assert.equal(final.workflow.pendingId,null);
    assert.equal(approved.snapshot.tools.find(t=>t.id==='one').notes,sample);
    const closed=final.workflow.cases.find(c=>c.id===third);
    assert.equal(closed.result.actor.id,'frank');assert.equal(closed.actor.id,'writer');
    assert.equal(closed.result.selfReview,false);assert.equal(closed.savedId,saved.id);
    assert.deepEqual(writes.filter(([,action])=>['withdraw','return','approve'].includes(action)),[['writer','withdraw'],['frank','return'],['frank','approve']]);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await f.close();}
});
