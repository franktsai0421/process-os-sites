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
for(const width of [390,1280])for(const lang of ['zh','vi'])void test(`native matrix scope refusal / Discard / Save ${width}px ${lang}`,async()=>{
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
    for(const page of [a,b]){await page.locator(cell).click();await page.waitForFunction(()=>window.FQCMasterUI.navigation.hasLocalChanges());}
    await b.locator('#fqc-matrix-apply').click();await b.waitForFunction(()=>!window.FQCMasterUI.navigation.hasLocalChanges()&&window.sharedDraftAccountState().queued===0);
    await f.mutate(values=>{const m=JSON.parse(values.masterDataControl);m.active.AB.products.push({...m.active.AB.products[0],code:'SYN-NEW'});m.versions[0].snapshot=structuredClone(m.active.AB);values.masterDataControl=JSON.stringify(m);});
    await a.locator('#fqc-matrix-apply').click();await a.waitForFunction(()=>{const s=window.sharedDraftAccountState();return s.failed&&!s.unknown&&s.queued===0;});
    const failed=posts(f).at(-1);assert.equal(failed.actor,'editor');assert.equal(failed.status,409);assert.equal(failed.result.error,'FQC_MATRIX_SCOPE_CHANGED');assert.match(failed.result.requestId,/^[0-9a-f-]{36}$/i);
    const operationId=JSON.parse(failed.body).command.operationId,latest=(await f.state()).workflow,before=posts(f).length,getBefore=f.requests.filter(r=>r.method==='GET').length;
    await a.locator('#fqc-matrix-discard').click();await a.waitForFunction(()=>{const s=window.sharedDraftAccountState();return !window.FQCMasterUI.navigation.hasLocalChanges()&&!s.failed&&!s.unknown&&s.queued===0;});
    assert.equal(posts(f).length,before);assert(f.requests.filter(r=>r.method==='GET').length>getBefore);assert.deepEqual((await f.state()).workflow,latest);
    assert.equal(await a.locator(cell).getAttribute('aria-pressed'),'true');
    await a.locator('#fqc-save').click();await a.waitForFunction(()=>!!window.FQCMasterUI.control.libraries.fqc.workflow.saved&&!window.sharedDraftAccountState().queued&&!document.querySelector('#fqc-save')?.disabled);
    assert.equal(posts(f).length,before+1);assert.equal(JSON.parse(posts(f).at(-1).body).command.action,'save');
    assert.equal(posts(f).filter(row=>JSON.parse(row.body).command.operationId===operationId).length,1,'Original rejected Apply must never replay');
    assert.deepEqual((await f.state()).workflow.saved.content,latest.working);assert.deepEqual(errors,[]);
  }finally{for(const context of contexts)await context.close();await browser?.close();f.close();}
});
