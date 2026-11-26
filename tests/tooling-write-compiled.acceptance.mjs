import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const require=createRequire(import.meta.url);
const toolingFixture=require('../scripts/tooling-local-save-fixture.cjs');
for(const lang of ['zh','vi'])test('tooling backend saves, recovers the original receipt and submits the saved version in '+lang,async()=>{
 const seed=await toolingFixture();
 let control;
 try{
   control=await seed.read();
   const rows=control.versions[0].snapshot.tools;
   for(let i=rows.length;i<368;i++)rows.push(seed.tool('synthetic-'+i));
 }finally{seed.close();}
 const f=await createABCFixture({products:1,decorate(values){values.toolingMasterControl=JSON.stringify(control);}});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:lang==='zh'?1280:390,height:920},serviceWorkers:'block'});
 try{
   await ctx.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);
   await ctx.addCookies([{name:'process_demo',value:f.cookie('frank'),url:f.url.origin}]);
   const page=await ctx.newPage(),posts=[],receiptIds=[],errors=[];
   page.setDefaultTimeout(55000);
   page.on('pageerror',e=>errors.push(e.message));
   let lose=false,hideReceipt=false;
   await page.route('**/*',async route=>{
     const req=route.request(),url=new URL(req.url());
     if(url.origin!==f.url.origin)return route.abort();
     if(url.pathname!=='/api/tooling/workflow')return route.continue();
     const id=url.searchParams.get('operationId');
     if(id){receiptIds.push(id);if(hideReceipt)return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});}
     if(req.method()!=='POST')return route.continue();
     const cmd=req.postDataJSON()?.command;
     if(!cmd)return route.continue();
     posts.push(cmd);
     if(lose&&cmd.action==='save'){
       lose=false;const committed=await route.fetch();assert.equal(committed.status(),200);
       return route.abort('failed');
     }
     if(lang==='zh'&&(cmd.action==='submit'||cmd.action==='save'&&!cmd.moduleAction)){
       const response=await route.fetch();await new Promise(done=>setTimeout(done,15500));
       return route.fulfill({response});
     }
     return route.continue();
   });
   const state=()=>page.evaluate(async()=>{const r=await fetch('/api/tooling/workflow?caseMetadata=1');if(!r.ok)throw Error('GET '+r.status);return (await r.json()).control.workflow;});
   const ready=()=>page.waitForFunction(()=>{const save=document.querySelector('#tooling-save');return save&&!save.disabled&&!window.sharedDraftAccountState().queued;});
   const edit=async note=>{
     await page.locator('[data-tool-edit="one"]').click();
     await page.locator('dialog [name=notes]').fill(note);
     await page.locator('dialog button[type=submit]').click();
     await page.locator('dialog.tooling-dialog').waitFor({state:'detached'});
   };
   const ok=action=>page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/tooling/workflow'&&r.request().postDataJSON().command?.action===action);
   await page.goto(f.url.origin+'/process/?system=quality&view=data&dataTab=quality-mold-equipment');
   await page.locator('#tooling-begin').click();await ready();
   await edit('ack lost');lose=true;hideReceipt=true;
   await page.locator('#tooling-save').click();
   await page.locator('#tooling-retry').waitFor({state:'attached'});
   const original=posts.at(-1).operationId;
   const first=(await state()).saved;
   assert.equal(first.content.tools.find(r=>r.id==='one').notes,'ack lost');
   assert.equal(posts.filter(c=>c.action==='save').length,1);
   hideReceipt=false;
   const retry=page.locator('#tooling-retry');
   const closed=retry.locator('xpath=ancestor::details[not(@open)]/summary');
   while(await closed.count())await closed.first().click();
   await retry.click();await ready();
   assert(!await page.evaluate(()=>window.sharedDraftAccountState().unknown));
   assert(receiptIds.includes(original));
   assert.equal(posts.filter(c=>c.action==='save').length,1);
   await page.reload();await ready();assert.equal((await state()).saved.id,first.id);
   let response=ok('save');await page.locator('#tooling-save').click();assert.equal((await response).status(),200);await ready();
   assert(!posts.at(-1).moduleAction);
   await edit('independent fresh operation');
   response=ok('save');await page.locator('#tooling-save').click();assert.equal((await response).status(),200);await ready();
   assert.equal(posts.at(-1).moduleAction,'save-local-v1');
   assert.notEqual(posts.at(-1).operationId,original);
   const saved=(await state()).saved;
   assert.equal(saved.content.tools.length,368);assert.notEqual(saved.id,first.id);
   await page.locator('#tooling-submit').click();
   await page.locator('dialog.vd-confirm textarea').fill('Synthetic review');
   response=ok('submit');await page.locator('dialog.vd-confirm button[type=submit]').click();assert.equal((await response).status(),200);
   const pending=await state();
   assert.equal(pending.cases.find(c=>c.id===pending.pendingId).savedId,saved.id);
   assert.equal(posts.filter(c=>c.action==='submit').length,1);
   assert.deepEqual(errors,[]);
 }finally{await ctx.close();await browser.close();await f.close();}
});
