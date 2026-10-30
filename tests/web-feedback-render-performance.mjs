// Paired browser measurements: identical synthetic storage and compiled backend.
// Reference core/CSS are served from Git; no hosted data or external networking.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const label=process.argv[2]||'current',reference=process.argv[3];
assert.match(label,/^[a-z0-9-]+$/);if(reference)assert.match(reference,/^[a-f0-9]{40}$/);
const fixture=await createFeedbackFixture(),samples=[],variants=reference?['reference','candidate']:['candidate'];let browser;
try{
 const business=await fixture.businessState();
 const initial=JSON.parse((await fixture.db.prepare('SELECT payload FROM web_feedback_store WHERE id=1').first()).payload);
 const target=initial.issues.find(i=>i.attachments.length&&i.description.length<300);
 const notes=Array.from({length:4},(_,n)=>({author:'frank',at:'2026-10-29T00:00:00Z',text:'私人備註 Ghi chú riêng '.repeat(8)+n}));
 initial.handoffs=Array.from({length:24},(_,n)=>({id:'H-synthetic-'+n,operationId:'history-'+n,owner:'frank',digest:'synthetic',generatedAt:'2026-10-29T00:00:00Z',status:'generated',issues:initial.issues.slice(0,20).map(i=>({...i,description:i.description.slice(0,150),notes})),sha256:'synthetic',size:0}));
 const payload=JSON.stringify(initial);assert(Buffer.byteLength(payload)<1500000);
 browser=await chromium.launch({headless:true,executablePath:process.env.FEEDBACK_BROWSER_PATH||chromium.executablePath()});
 const assets=new Map(reference?['web-feedback.js','web-feedback.css'].map(name=>['/process/'+name,execFileSync('git',['show',reference+':public/process/'+name])]):[]);
 const auth=await browser.newContext();const login=await auth.newPage();
 await auth.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 await login.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await login.locator('#id').fill('frank');await login.locator('#password').fill(fixture.password);await login.locator('.site-entry-submit').click();await login.waitForSelector('.wf-row');
 const storageState=await auth.storageState();await auth.close();
 for(let run=0;run<5;run++)for(const variant of (run%2?[...variants].reverse():variants)){
  await fixture.db.prepare('UPDATE web_feedback_store SET payload=?,revision=1 WHERE id=1').bind(payload).run();
  const context=await browser.newContext({storageState,viewport:{width:1365,height:900}});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==fixture.origin)return r.abort();if(variant==='reference'&&assets.has(u.pathname))return r.fulfill({body:assets.get(u.pathname),contentType:u.pathname.endsWith('.css')?'text/css':'text/javascript'});return r.continue();});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{
   window.__htmlMs=0;
   const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
   Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){const measured=this.matches('.wf-board-body,.wf-detail,.wf-note-history,.wf-history details'),start=performance.now();descriptor.set.call(this,value);if(measured)window.__htmlMs+=performance.now()-start;}});
  });
  await page.goto(fixture.origin+'/process/index.html?view=data&dataTab=web-feedback');await page.waitForSelector('.wf-row');
  await page.locator('[data-issue="'+target.id+'"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.wf-detail img')].every(i=>i.complete));
  async function measure(name,act){
   await page.evaluate(()=>{performance.clearResourceTimings();window.__htmlMs=0;window.__detailImage=document.querySelector('.wf-detail img');window.__started=performance.now();});
   await act();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   samples.push({run,variant,name,...await page.evaluate(()=>{const all=performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/web-feedback')),api=all.filter(e=>!e.name.includes('action=image')),images=all.filter(e=>e.name.includes('action=image'));return{elapsedMs:performance.now()-window.__started,htmlMs:window.__htmlMs,api:api.map(e=>({action:new URL(e.name).searchParams.get('action'),waitingMs:e.responseStart-e.requestStart,totalMs:e.duration})),afterApiMs:api.length?performance.now()-Math.max(...api.map(e=>e.responseEnd)):null,imageRequests:images.length,imageTotalMs:images.reduce((n,e)=>n+e.duration,0),imagePreserved:window.__detailImage===document.querySelector('.wf-detail img'),historyNodes:document.querySelectorAll('.wf-history *').length};})});
  }
  await page.locator('[data-note]').fill('保存速度 Kiểm tra lưu');
  await measure('note-save',async()=>{await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');});
  await measure('complete',async()=>{await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]')?.dataset.update==='done');});
  await measure('history',async()=>{await page.locator('[data-board-tab=history]').click();await page.waitForSelector('.wf-history');});
  assert.equal(await page.locator('.wf-history').count(),24);
  await context.close();
 }
 assert.deepEqual(await fixture.businessState(),business);
 const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
 const summary=variants.flatMap(variant=>['note-save','complete','history'].map(name=>{const group=samples.filter(s=>s.variant===variant&&s.name===name);return{variant,name,runs:group.length,...Object.fromEntries(['elapsedMs','htmlMs','afterApiMs','imageRequests','imageTotalMs','historyNodes'].map(k=>[k,median(group.map(s=>s[k]))])),apiWaitMs:median(group.map(s=>s.api.reduce((n,e)=>n+e.waitingMs,0))),imagePreserved:group.every(s=>s.imagePreserved)};}));
 fs.mkdirSync('.sites-runtime/feedback-render',{recursive:true});fs.writeFileSync('.sites-runtime/feedback-render/'+label+'.json',JSON.stringify({label,reference,browser:browser.version(),seedIssues:60,handoffs:24,issuesPerHandoff:20,samples,summary},null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();await fixture.close();}
