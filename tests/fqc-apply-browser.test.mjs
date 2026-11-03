// Native Chromium forms + actual TS handlers on ephemeral SQLite/R2. No live site.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {addAuthorityAudit} from './fqc-required-dependencies-fixture.mjs';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const read=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const styles=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','fqc-master.js'];
for(const width of [390,1280])for(const lang of ['zh','vi'])void test(`FQC actual Begin/new/edit/Save/reload ${width}px ${lang}`,async()=>{
 const f=await fixture();const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
 const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});void dialog.dismiss();});
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><main id="data-content" data-active-tab="quality-fqc"></main></html>`});
  if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Unconfigured synthetic resource'});
  const response=await f.call(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{})});return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 async function boot(){await page.goto('https://synthetic.invalid/process/');await page.evaluate(lang=>{window.ProcessSync={identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:e=>e===1,platformHeaders:()=>({}),requiresReload:false};window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=message=>{window.__notices??=[];window.__notices.push(message);};localStorage.setItem('processUILanguage',lang);},lang);for(const file of scripts)await page.addScriptTag({content:read(file)});await page.evaluate(()=>window.FQCMasterUI.bind(document.querySelector('#data-content')));}
 async function apply(selector,name){await page.locator(selector).click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill(name);await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});}
 try{await addAuthorityAudit(f);await boot();await page.locator('#fqc-begin').click();await page.locator('#fqc-save').waitFor();
 await apply('[data-edit-error="error"]','Native edited error');await apply('#fqc-add-error','Native new error');
 await apply('[data-edit-item="item"]','Native edited item');await apply('#fqc-add-item','Native new item');
 const before=(await f.state()).workflow;assert.equal(before.saved,null);assert.equal(before.working.errors.length,2);assert.equal(before.working.items.length,2);
 await page.locator('#fqc-save').click();await page.waitForFunction(()=>!document.querySelector('#fqc-save').disabled);assert.deepEqual((await f.state()).workflow.saved.content,before.working);
 await boot();assert.equal(await page.locator('.fqc-modal-form').count(),0);assert(await page.locator('[data-edit-item="item"]').count());
 await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');assert.equal(await form.locator('[name="name"]').inputValue(),'Native edited error');await form.locator('[name="name"]').fill('Unapplied retained');const posts=f.requests.filter(r=>r.method==='POST').length;await page.evaluate(()=>document.querySelector('#fqc-save').click());assert.equal(await form.locator('[name="name"]').inputValue(),'Unapplied retained');assert.equal(f.requests.filter(r=>r.method==='POST').length,posts);await form.locator('[data-close]').first().click();assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[],'unexpected native dialogs must not be auto-accepted');
 }finally{await context.close();await browser.close();f.close();}
});
