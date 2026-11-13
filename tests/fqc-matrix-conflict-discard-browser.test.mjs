// CI-only native module UI + signed actual TS routes over isolated SQLite/R2.
// No live Site, employee data, local socket or restricted-launch fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const read=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const styles=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','fqc-master.js'];
const posts=f=>f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command);
for(const width of [390,1280])for(const lang of ['zh','vi'])void test(`native grouped field conflict with matrix / Cancel / local Discard / Save ${width}px ${lang}`,async()=>{
  assert.equal(process.env.CI,'true','Native acceptance requires supported CI; no restricted local launch');
  const {chromium}=await import('playwright'),f=await fixture();let browser;const errors=[],contexts=[];
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    async function open(actor){
      const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});contexts.push(context);const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{errors.push('Unexpected '+dialog.type()+' dialog');void dialog.dismiss();});
      await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
        if(url.origin!=='https://synthetic.invalid')return route.abort();
        if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><main id="data-content" data-active-tab="quality-fqc"></main></html>`});
        if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Unconfigured synthetic resource'});
        const response=await f.call(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{})},actor);
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      });
      await page.goto('https://synthetic.invalid/process/');await page.evaluate(({actor,lang})=>{
        window.ProcessSync={identity:{id:actor,name:'Synthetic '+actor,role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:e=>e===1,platformHeaders:()=>({}),requiresReload:false};
        window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=message=>{window.__notices??=[];window.__notices.push(message);};localStorage.setItem('processUILanguage',lang);
      },{actor,lang});
      for(const file of scripts)await page.addScriptTag({content:read(file)});
      await page.evaluate(()=>window.FQCMasterUI.bind(document.querySelector('#data-content')));return page;
    }
    const a=await open('editor');await a.locator('#fqc-begin').click();await a.locator('#fqc-save').waitFor();
    const b=await open('other'),cell='[data-matrix-item="item"][data-matrix-product="SYN-P"]';
    async function edit(page,name){await page.locator('[data-edit-item="item"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name=name]').fill(name);await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});}
    await edit(a,'Local contested field');await a.locator(cell).click();await edit(b,'Peer saved field');await b.locator(cell).click();
    assert.equal(posts(f).length,0,'Local form and matrix editing send no content command');
    assert.equal(f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).action==='begin-v1').length,1,'Only Begin writes while both editors stage locally');
    await b.locator('#fqc-save').click();await b.waitForFunction(()=>!window.FQCMasterUI.navigation.hasLocalChanges()&&!window.sharedDraftAccountState().queued);
    const peer=(await f.state()).workflow;
    const before=posts(f).length;
    await a.locator('#fqc-save').click();await a.locator('[data-fqc-save-choice="cancel"]').click();
    await a.waitForFunction(()=>{const s=window.sharedDraftAccountState();return !document.querySelector('[data-fqc-save-choice]')&&!document.querySelector('#fqc-save')?.disabled&&s.queued===0&&!s.failed&&!s.unknown;});
    assert.equal(posts(f).length,before,'Cancel must precede every owner content POST');assert.deepEqual((await f.state()).workflow,peer,'cancelled grouped Save cannot alter peer data');
    assert.equal(await a.locator(cell).getAttribute('aria-pressed'),'true','Cancel retains the local matrix intent');
    assert.equal(await a.evaluate(()=>Object.values(localStorage).some(value=>value.includes('completeMatrix'))),false,'new selections remain in page memory');
    // Checked local discard only: this must never roll back the peer's saved state.
    await a.evaluate(async()=>{const lease=await window.FQCMasterUI.navigation.departure.discard();lease.release();});
    await a.waitForFunction(()=>{const s=window.sharedDraftAccountState();return !window.FQCMasterUI.navigation.hasLocalChanges()&&!s.failed&&!s.unknown&&s.queued===0;});
    assert.equal(posts(f).length,before);assert.deepEqual((await f.state()).workflow,peer);
    const savedResponse=a.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/fqc/workflow'&&r.request().postDataJSON().command?.action==='save');
    await a.locator('#fqc-save').click();assert.equal((await savedResponse).status(),200);await a.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('#fqc-save')?.disabled);
    assert.equal(posts(f).length,before+1);assert.equal(JSON.parse(posts(f).at(-1).body).command.action,'save');assert.equal(JSON.parse(posts(f).at(-1).body).command.moduleAction,'save-local-v1');
    assert.equal(new Set(posts(f).map(row=>JSON.parse(row.body).command.operationId)).size,posts(f).length,'Every accepted explicit Save has one unique operation; cancellation cannot create a replay');
    assert.deepEqual((await f.state()).workflow.saved.content,peer.working);assert.deepEqual(errors,[]);
  }finally{for(const context of contexts)await context.close();await browser?.close();f.close();}
});
