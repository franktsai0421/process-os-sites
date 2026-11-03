// Actual FQC UI and TS routes; isolated SQLite/R2 and intercepted synthetic origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const read=name=>process.env.FQC_UI_REF?execFileSync('git',['show',process.env.FQC_UI_REF+':public/process/'+name],{encoding:'utf8'}):fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const styles=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','fqc-master.js'];
const posts=f=>f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command);
async function setup(width=1280,lang='zh'){
 const f=await fixture(),browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[];
 let lose=false,receiptDown=false,readDown=false,noCommit=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{errors.push('Unexpected dialog');void dialog.dismiss();});
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.origin!=='https://synthetic.invalid')return route.abort();
  if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><main id="data-content" data-active-tab="quality-fqc"></main></html>`});
  if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Synthetic resource unavailable'});
  if(receiptDown&&url.searchParams.has('operationId'))return route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}});
  if(readDown&&req.method()==='GET'&&url.pathname==='/api/fqc/workflow'&&!url.searchParams.has('operationId'))return route.fulfill({status:503,json:{error:'SYNTHETIC_READ_UNAVAILABLE'}});
  const lost=lose&&req.method()==='POST'&&JSON.parse(req.postData()||'{}').command?.action==='apply';
  if(lost&&noCommit){lose=false;return route.abort('failed');}
  const response=await f.call(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{})});
  if(lost){lose=false;return route.abort('failed');}
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 await page.goto('https://synthetic.invalid/process/');await page.evaluate(lang=>{window.ProcessSync={identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:e=>e===1,platformHeaders:()=>({}),requiresReload:false};window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=()=>{};localStorage.setItem('processUILanguage',lang);},lang);
 for(const file of scripts)await page.addScriptTag({content:read(file)});
 await page.evaluate(()=>window.FQCMasterUI.bind(document.querySelector('#data-content')));
 await page.locator('#fqc-begin').click();await page.locator('#fqc-save').waitFor();
 const settled=()=>page.waitForFunction(()=>!window.sharedDraftAccountState().queued&&!document.querySelector('.fqc-modal-overlay[aria-busy]'));
 async function recover(){const button=page.locator('[data-fqc-check-result]');if(await button.count())await button.click();else await page.evaluate(()=>document.querySelector('#fqc-check-result').click());await page.waitForFunction(()=>!window.sharedDraftAccountState().unknown);await page.waitForFunction(()=>!document.querySelector('#fqc-check-result'));}
 return{f,page,errors,settled,recover,lose({commit=true}={}){lose=true;receiptDown=true;noCommit=!commit;},receiptsUp(){receiptDown=false;},setReadDown(value){readDown=value;},async close(){await context.close();await browser.close();f.close();}};
}
for(const width of [390,1280])for(const lang of ['zh','vi'])for(const kind of ['error','item'])void test(`lost ACK retained ${kind} form ${width}px ${lang}`,async()=>{
 const s=await setup(width,lang),{f,page}=s;
 try{
  await page.locator(`[data-edit-${kind}="${kind}"]`).click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('First committed');s.lose();await form.locator('[type="submit"]').click();await s.settled();assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));
  const committed=(await f.state()).workflow,before=posts(f).length;assert.equal(committed.working[kind==='error'?'errors':'items'][0].name,'First committed');assert.equal(committed.saved,null);
  await form.locator('[name="name"]').fill('Second input retained');await form.locator('[type="submit"]').click();assert.equal(posts(f).length,before);
  if(process.env.FQC_RECOVERY_SCREENSHOTS&&kind==='error'){fs.mkdirSync(process.env.FQC_RECOVERY_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.FQC_RECOVERY_SCREENSHOTS+`/unknown-${width}-${lang}.png`});}
  if(!process.env.FQC_UI_REF){assert.match(await form.locator('.fqc-modal-alert').innerText(),lang==='vi'?/chưa được xác nhận/:/尚未確認/);await page.locator('[data-fqc-check-result]').click();await s.settled();assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(posts(f).length,before);}
  s.receiptsUp();await s.recover();assert.equal(await form.locator('[name="name"]').inputValue(),'Second input retained');assert.equal(posts(f).length,before,'recovery is GET-only');
  if(!process.env.FQC_UI_REF||kind==='error')assert.doesNotMatch(await page.locator('#fqc-shared-status').innerText(),/UNKNOWN|尚未確認|chưa được xác nhận/,'successful readback clears stale error');
  await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});assert.equal(posts(f).length,before+1,'retained form must produce a new Apply');assert.equal((await f.state()).workflow.working[kind==='error'?'errors':'items'][0].name,'Second input retained');
  assert.equal((await f.state()).workflow.saved,null);assert.deepEqual((await f.state()).workflow.active,committed.active);
  await page.locator('#fqc-save').click();await page.waitForFunction(()=>!document.querySelector('#fqc-save').disabled);assert.equal((await f.state()).workflow.saved.content[kind==='error'?'errors':'items'][0].name,'Second input retained');assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
for(const kind of ['error','item'])void test(`new ${kind} after recovery retains its ID without duplicate insert`,async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator(`#fqc-add-${kind}`).click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Created once');s.lose();await form.locator('[type="submit"]').click();await s.settled();const collection=kind==='error'?'errors':'items',rows=(await f.state()).workflow.working[collection];assert.equal(rows.length,2);const id=rows[1].id;s.receiptsUp();await s.recover();await form.locator('[name="name"]').fill('Updated recovered row');await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});const next=(await f.state()).workflow.working[collection];assert.equal(next.length,2);assert.equal(next[1].id,id);assert.equal(next[1].name,'Updated recovered row');assert.deepEqual(s.errors,[]);}finally{await s.close();}
});
for(const sameField of [false,true])void test(`recovery preserves collaborator ${sameField?'same field conflict':'different field update'}`,async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator('[data-edit-item="item"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('First committed');s.lose();await form.locator('[type="submit"]').click();await s.settled();
 const other=f.realm('other'),read=await other.client.read(),field=sameField?'name':'description',old=read.control.workflow.working.items[0][field];await other.client.command(read.control.workflow.generation,'apply',{patches:[{op:'set',path:['items',{id:'item'},field],value:'Other editor'}],guards:[{path:['items',{id:'item'},field],value:old}]});
 s.receiptsUp();await s.recover();await form.locator('[name="name"]').fill('My next input');await form.locator('[type="submit"]').click();await s.settled();const row=(await f.state()).workflow.working.items[0];assert.equal(row[field],'Other editor');
 if(sameField){assert.equal(await form.count(),1);assert.equal(await form.locator('[name="name"]').inputValue(),'My next input');assert.equal(posts(f).at(-1).result.error,'DEPENDENCY_CHANGED_RECONFIRM');}else{await form.waitFor({state:'detached'});assert.equal(row.name,'My next input');}assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
void test('missing receipt and failed terminal readback stay unknown with input intact',async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Retained');s.lose();await form.locator('[type="submit"]').click();await s.settled();const before=posts(f).length;s.receiptsUp();s.setReadDown(true);await page.locator('[data-fqc-check-result]').click();await page.waitForFunction(()=>!document.querySelector('[data-fqc-check-result]').disabled);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(posts(f).length,before);assert.equal(await form.locator('[name="name"]').inputValue(),'Retained');s.setReadDown(false);await s.recover();assert.equal(posts(f).length,before);assert.deepEqual(s.errors,[]);}finally{await s.close();}
});
void test('matrix lost ACK recovers the original receipt without another Apply',async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();s.lose();await page.locator('#fqc-matrix-apply').click();await page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);const before=posts(f).length;s.receiptsUp();await page.locator('#fqc-matrix-apply').click();await page.waitForFunction(()=>!window.sharedDraftAccountState().unknown&&!window.FQCMasterUI.navigation.hasLocalChanges());assert.equal(posts(f).length,before);assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,['SYN-P']);assert.equal((await f.state()).workflow.saved,null);assert.deepEqual(s.errors,[]);}finally{await s.close();}
});

void test('uncommitted request with no receipt remains blocked and never retries POST',async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('Keep unsent input');s.lose({commit:false});await form.locator('[type="submit"]').click();await s.settled();const bytes=await page.evaluate(()=>JSON.stringify(sessionStorage));s.receiptsUp();for(let i=0;i<2;i++){await page.locator('[data-fqc-check-result]').click();await page.waitForFunction(()=>!document.querySelector('[data-fqc-check-result]').disabled);assert(await page.evaluate(()=>window.sharedDraftAccountState().unknown));assert.equal(await page.evaluate(()=>JSON.stringify(sessionStorage)),bytes);}await form.locator('[type="submit"]').click();assert.equal(posts(f).length,0);assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');assert.equal(await form.locator('[name="name"]').inputValue(),'Keep unsent input');assert.deepEqual(s.errors,[]);}finally{await s.close();}
});

void test('error form opened during matrix unknown can query safely without losing its input',async()=>{
 const s=await setup(),{f,page}=s;try{await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();s.lose();await page.locator('#fqc-matrix-apply').click();await page.waitForFunction(()=>window.sharedDraftAccountState().unknown&&!window.sharedDraftAccountState().queued);await page.locator('[data-edit-error="error"]').click();const form=page.locator('.fqc-modal-form');await form.locator('[name="name"]').fill('After matrix recovery');await form.locator('[type="submit"]').click();const before=posts(f).length;s.receiptsUp();await page.locator('[data-fqc-check-result]').click();await page.waitForFunction(()=>!window.sharedDraftAccountState().unknown&&!window.FQCMasterUI.navigation.hasLocalChanges());assert.equal(posts(f).length,before);assert.equal(await form.locator('[name="name"]').inputValue(),'After matrix recovery');await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});assert.equal(posts(f).length,before+1);assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,['SYN-P']);assert.equal((await f.state()).workflow.working.errors[0].name,'After matrix recovery');assert.deepEqual(s.errors,[]);}finally{await s.close();}
});
