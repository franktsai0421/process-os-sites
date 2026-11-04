// Native Chromium click-to-usable measurements through actual TS routes and
// ephemeral SQLite/R2. Transport interception is explicit: not live HTTPS or
// compiled workerd. No employee data, account or provider writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {requiredClick,browserReadyTime} from '../tests/draft-action-measurement.mjs';
const require=createRequire(import.meta.url),fixture=require('./fqc-apply-fixture.cjs');
const base='6247c00220bf366e41c92c5b684d9f9744076cad';
const read=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const styles=['styles.css','master-data.css','master-data-extra.css','master-data-validation.css','fqc-master.css','version-draft-ui.css'].map(read).join('\n');
const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','fqc-master.js'];
const sources=['lib/state-records.ts','lib/versioned-shared-workflow.ts','lib/iqc-write-timing.ts','scripts/fqc-apply-fixture.cjs','scripts/benchmark-fqc-browser-flow.mjs','tests/draft-action-measurement.mjs',...scripts.map(file=>'public/process/'+file)];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex')]));
const sourceHashes=hashes(),rows=[],smoke=process.argv.includes('--smoke'),pairs=smoke?1:5;
const profiles=smoke?[{name:'no-added-wait',get:0,sql:0,put:0}]:[{name:'no-added-wait',get:0,sql:0,put:0},{name:'sensitivity-200ms-r2-not-live',get:200,sql:5,put:5}];
const wait=ms=>ms?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
const count=(events,kind)=>events.filter(e=>e.kind===kind).length;
console.info=(...values)=>process.stderr.write(values.join(' ')+'\n');
const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
try{
 for(const profile of profiles)for(let pair=0;pair<pairs;pair++)for(const variant of pair%2?['candidate','main6247']:['main6247','candidate']){
  const f=await fixture(variant==='main6247'?{sourceRef:base}:{}),context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'}),page=await context.newPage(),errors=[],dialogs=[];
  let metrics=null;
  try{
   const values={...f.values},q=JSON.parse(values.qualityMasterControl),snapshot=q.libraries.fqc.versions[0].snapshot;
   snapshot.items=Array.from({length:256},(_,i)=>({...snapshot.items[0],id:i?'item'+i:'item',checkNo:'SYN-FQC-L1-'+String(i+1).padStart(3,'0'),description:'Synthetic '+i+' '+('z'.repeat(512)),productCodes:[],mediaItems:[]}));
   values.qualityMasterControl=JSON.stringify(q);values.processAccessControl=JSON.stringify({audit:[{before:{enabled:true},after:{enabled:true}}]});
   for(let i=0;i<6;i++)values['syntheticUnrelated'+i]=JSON.stringify({note:'Synthetic '+i+' '+('m'.repeat(16384)),versions:[{id:'old'+i,status:'approved',snapshot:{note:'Synthetic body '+i+' '+('b'.repeat(32768))}}]});
   f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await f.encode(values));
   f.hooks.get=()=>wait(metrics?profile.get:0);f.hooks.sql=()=>wait(metrics?profile.sql:0);f.hooks.run=()=>wait(metrics?profile.sql:0);f.hooks.put=()=>wait(metrics?profile.put:0);
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><main id="data-content" data-active-tab="quality-fqc"></main></html>`});
    if(!url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Unconfigured synthetic resource'});
    const active=metrics,started=performance.now(),offset=f.events.length;
    const response=await f.call(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{})});
    const body=await response.text();
    if(active){const events=f.events.slice(offset);active.http.push({method:req.method(),path:url.pathname,conditional:url.searchParams.has('since'),status:response.status,handlerMs:performance.now()-started,requestBytes:Buffer.byteLength(req.postData()||''),responseBytes:Buffer.byteLength(body),r2Get:count(events,'get'),r2Put:count(events,'put'),sql:count(events,'read')+count(events,'sql')});}
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
   });
   await page.goto('https://synthetic.invalid/process/');
   await page.evaluate(()=>{window.ProcessSync={identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:e=>e===1,platformHeaders:()=>({}),requiresReload:false};window.state={view:'data',dataTab:'quality-fqc'};window.hasPermission=()=>true;window.bindDataInner=()=>{};window.toast=()=>{};localStorage.setItem('processUILanguage','zh');});
   for(const file of scripts)await page.addScriptTag({content:read(file)});
   await page.evaluate(()=>window.FQCMasterUI.bind(document.querySelector('#data-content')));
   await page.locator('#fqc-begin').click();await page.locator('#fqc-save').waitFor();
   async function measure(action,selector,ready,verify){
    metrics={profile:profile.name,pair,variant,action,http:[]};f.events.length=0;
    await requiredClick(page,selector);await ready();metrics.ms=await browserReadyTime(page);
    const row=metrics;metrics=null;row.sql=count(f.events,'read')+count(f.events,'sql');row.r2Get=count(f.events,'get');row.r2Put=count(f.events,'put');
    assert.equal(row.http.filter(h=>h.method==='POST').length,1);assert.equal(row.http.filter(h=>h.method==='GET').length,1);assert(row.http.every(h=>h.status===200));
    assert.equal(await page.evaluate(()=>window.sharedDraftAccountState().unknown),false);
    await verify(await f.state());assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);rows.push(row);
   }
   const idle=()=>page.waitForFunction(()=>window.FQCMasterUI.navigation.canLeave()&&!document.querySelector('.fqc-modal-form')&&!window.sharedDraftAccountState().unknown);
   for(const [action,open,name] of [['existing-error','[data-edit-error="error"]','Browser measured edit'],['new-error','#fqc-add-error','Browser measured insert']]){
    await page.locator(open).click();await page.locator('.fqc-modal-form [name="name"]').fill(name);
    await measure(action,'.fqc-modal-form button[type="submit"]',idle,control=>{assert(control.workflow.working.errors.some(error=>error.name===name));assert.equal(control.workflow.saved,null);});
   }
   await page.locator('[data-matrix-item="item"][data-matrix-product="SYN-P"]').click();
   await measure('matrix-apply','#fqc-matrix-apply',idle,control=>{assert.deepEqual(control.workflow.working.items[0].productCodes,['SYN-P']);assert.equal(control.workflow.saved,null);});
   await measure('save','#fqc-save',idle,control=>assert.deepEqual(control.workflow.saved.content,control.workflow.working));
   process.stderr.write(JSON.stringify({profile:profile.name,pair,variant,completed:4})+'\n');
  }finally{metrics=null;await context.close();f.close();}
 }
 assert.deepEqual(hashes(),sourceHashes,'source changed during measurement');
 const summary=[];for(const profile of profiles)for(const action of ['existing-error','new-error','matrix-apply','save'])for(const variant of ['main6247','candidate']){
  const selected=rows.filter(r=>r.profile===profile.name&&r.action===action&&r.variant===variant);assert.equal(selected.length,pairs);
  const times=selected.map(r=>r.ms).sort((a,b)=>a-b),median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  summary.push({profile:profile.name,action,variant,n:pairs,minMs:times[0],medianMs:median([...times]),maxMs:times.at(-1),postMedianMs:median(selected.map(r=>r.http.find(h=>h.method==='POST').handlerMs)),getMedianMs:median(selected.map(r=>r.http.find(h=>h.method==='GET').handlerMs)),r2Get:selected[0].r2Get,sql:selected[0].sql});
 }
 for(const row of rows.filter(r=>r.variant==='candidate')){const before=rows.find(r=>r.variant==='main6247'&&r.pair===row.pair&&r.profile===row.profile&&r.action===row.action);for(const key of ['r2Get','r2Put','sql'])assert.equal(row[key],before[key],row.action+' '+key);}
 console.log(JSON.stringify({schema:'FQC_BROWSER_FLOW_PAIRED_V1',base,syntheticOnly:true,liveLatency:false,smoke,layer:'NATIVE_CHROMIUM_ACTUAL_TS_HANDLER_SYNTHETIC_STORAGE',boundary:'Real DOM click to usable UI plus two animation frames, through actual guarded routes, one POST and fresh GET. Text entry, boot/Begin and independent state oracle excluded. Playwright intercepted transport, no live HTTP/TLS or compiled workerd claim.',fixture:{items:256,itemPadding:512,authorityAuditBodies:1,unrelatedAggregates:6},runtimeHashes:sourceHashes,profiles,rows,summary},null,2));
}finally{await browser.close();}
