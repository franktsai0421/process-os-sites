import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';

const output=process.env.PERF_OUTPUT||'.sites-runtime/perf-final/entry-paired.json';
const builds={baseline:process.env.PERF_BASELINE_BUILD,candidate:path.resolve(process.env.PERF_CANDIDATE_BUILD||'dist')};
assert(builds.baseline,'PERF_BASELINE_BUILD must identify a preserved compiled build');
fs.mkdirSync(path.dirname(output),{recursive:true});
const views=['dashboard','player','dispatch','productStatus','editor','approval','quality-dashboard','quality-search','quality-reports','quality-inspections','quality-fpy'];
const tabs=['AB','C','bom','line-admin','process-master','users','web-feedback','quality-fqc','quality-iqc','quality-ipqc-ab','quality-ipqc-c','quality-mold-equipment','quality-routine-reports','quality-routine-equipment'];
const targets=[...views.map(view=>({view})),...tabs.map(dataTab=>({view:'data',dataTab}))];
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,conditions:{runtime:'compiled isolated Worker; both server and client from each exact build',data:'same photo-entry synthetic fixture; independent D1/R2 per variant/round',network:'loopback without throttling; external requests blocked',cache:'new browser context; HTTP cache disabled via routing; OS cache retained',viewport:[1365,900],staticTransport:'both variants use their own compiled Worker assets; no static fulfillment',boundary:'destination generation ready, nonempty content, no load alert, two frames; editor canvas and users search present'},builds:Object.fromEntries(Object.entries(builds).map(([variant,directory])=>[variant,{directory,entry:sha(path.join(directory,'server/index.js')),html:sha(path.join(directory,'client/process/index.html')),bootstrap:sha(path.join(directory,'client/process/bootstrap.js'))}])),rows:[],errors:[]};
let fixture,browser;
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
async function ready(page,target){
 await page.waitForFunction(t=>window.ProcessSync?.destination?.view===t.view&&(!t.dataTab||window.ProcessSync.destination.dataTab===t.dataTab)&&document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationGeneration===document.documentElement.dataset.processDestinationReadyGeneration&&!document.querySelector('#process-boot'),target,{timeout:20000});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert((await page.locator('#view-root').innerText()).trim());
 assert.equal(await page.locator('#view-root [role=alert]:not(:empty)').count(),0);
 if(target.view==='editor')await page.locator('.pe-card[data-node="photo-operation"]').waitFor();
 if(target.dataTab==='users')await page.locator('#ua-search').waitFor();
}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.browser=browser.version();
 for(let round=1;round<=Number(process.env.PERF_ROUNDS||5);round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
  process.env.PROCESS_TEST_BUILD_DIR=builds[variant];
  fixture=await createPhotoEntryFixture();assert.equal(fixture.buildEntrySha256,report.builds[variant].entry);
  const origin=fixture.url.origin,context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({round,variant,error:e.message}));
  async function measure(target,operation,action){
   const start=performance.now(),row={round,variant,module:target.dataTab?'data:'+target.dataTab:target.view,operation};
   try{await action();await ready(page,target);row.ms=Math.round(performance.now()-start);row.status='PASS';row.profile=await page.evaluate(()=>{const r=performance.getEntriesByType('resource');return{sharedReady:Number(document.documentElement.dataset.processSharedReadyMs),assetsReady:Number(document.documentElement.dataset.processAssetsReadyMs),contentReady:Number(document.documentElement.dataset.processReadyMs),requests:r.length,transferBytes:r.reduce((n,e)=>n+e.transferSize,0),api:r.filter(e=>new URL(e.name).pathname.startsWith('/api/')).map(e=>({path:new URL(e.name).pathname,start:Math.round(e.startTime),ms:Math.round(e.duration)}))};});}
   catch(e){row.status='FAIL';row.error=e.message;}
   report.rows.push(row);persist();console.log(JSON.stringify({...row,profile:undefined}));assert.equal(row.status,'PASS',row.error);
  }
  await page.goto(origin+'/login?view=dashboard');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);
  await measure({view:'dashboard'},'login-to-ready',()=>page.locator('.site-entry-submit').click());
  for(const target of targets.filter(t=>!process.env.PERF_DESTINATIONS||process.env.PERF_DESTINATIONS.split(',').includes(t.dataTab||t.view))){await measure(target,'document-entry',()=>page.goto(origin+'/process/index.html?'+new URLSearchParams(target)));await measure(target,'reload',()=>page.reload());}
  await context.close();await fixture.close();fixture=null;
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();persist();}
