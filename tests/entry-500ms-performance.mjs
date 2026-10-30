import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
const out=process.env.PERF_OUTPUT||'.sites-runtime/perf-500ms/paired-entry.json';
const snapshot=process.env.PERF_BASELINE_ASSETS;
const baseline=fs.readFileSync(snapshot?snapshot+'/index.html':process.env.PERF_BASELINE_HTML||'.sites-runtime/perf-500ms/index-before.html','utf8');
let candidate=fs.readFileSync('dist/client/process/index.html','utf8');
if(process.env.PERF_NO_POLICY_PRELOAD==='1')candidate=candidate.replace(/<link rel="modulepreload" href="(?:access-policy|delivery-purpose)\.mjs[^"]*">/g,'');
const bootstrap={baseline:fs.readFileSync(snapshot?snapshot+'/bootstrap.js':'.sites-runtime/perf-500ms/bootstrap-before.js','utf8'),candidate:fs.readFileSync('dist/client/process/bootstrap.js','utf8')};
const hash=s=>createHash('sha256').update(s).digest('hex');
const views=['dashboard','player','dispatch','productStatus','editor','approval','quality-dashboard','quality-search','quality-reports','quality-inspections','quality-fpy'];
const tabs=['AB','C','bom','line-admin','process-master','users','web-feedback','quality-fqc','quality-iqc','quality-ipqc-ab','quality-ipqc-c','quality-mold-equipment','quality-routine-reports','quality-routine-equipment'];
const destinations=[...views.map(view=>({view})),...tabs.map(dataTab=>({view:'data',dataTab}))];
const report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,baselineHTML:hash(baseline),candidateHTML:hash(candidate),bootstrapHashes:Object.fromEntries(Object.entries(bootstrap).map(([k,v])=>[k,hash(v)])),conditions:{runtime:'compiled local Worker',data:'photo-entry synthetic fixture',cache:'HTTP cache disabled; OS cache retained',network:'loopback; no throttling; external blocked',viewport:'1365x900',staticTransport:snapshot?'both variants static process JS/CSS/HTML fulfilled without compression from exact snapshots; APIs use Worker':'original harness',variant:'both HTML documents served by identical route fulfillment; same compiled APIs/data; original baseline HTML/bootstrap and built candidate bundles'},rows:[],errors:[]};
let fixture,browser;
async function ready(page,target){
 await page.waitForFunction(t=>window.ProcessSync?.destination?.view===t.view&&(!t.dataTab||window.ProcessSync.destination.dataTab===t.dataTab)&&document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationGeneration===document.documentElement.dataset.processDestinationReadyGeneration&&!document.querySelector('#process-boot'),target,{timeout:20000});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert((await page.locator('#view-root').innerText()).trim());
 assert.equal(await page.locator('#view-root [role=alert]:not(:empty)').count(),0);
 if(target.view==='editor')await page.locator('.pe-card[data-node="photo-operation"]').waitFor();
 if(target.dataTab==='users')await page.locator('#ua-search').waitFor();
}
try{
 fixture=await createPhotoEntryFixture();report.buildEntrySha256=fixture.buildEntrySha256;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.browser=browser.version();
 const origin=fixture.url.origin;
 for(let round=1;round<=Number(process.env.PERF_ROUNDS||5);round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/process/index.html')return route.fulfill({status:200,contentType:'text/html',body:variant==='baseline'?baseline:candidate});if(snapshot&&u.pathname.startsWith('/process/')){const relative=u.pathname.slice('/process/'.length);if(relative&&!relative.includes('..')&&/\.(?:js|mjs|css|html)$/.test(relative)){const file=(variant==='baseline'?snapshot:'dist/client/process')+'/'+relative;if(fs.existsSync(file))return route.fulfill({status:200,contentType:relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':'text/javascript',body:fs.readFileSync(file)});}}if(u.pathname==='/process/bootstrap.js')return route.fulfill({status:200,contentType:'text/javascript',body:bootstrap[variant]});if(u.pathname==='/process/index.html')return route.fulfill({status:200,contentType:'text/html',body:variant==='baseline'?baseline:candidate});return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({round,variant,error:e.message}));
  async function measure(target,operation,action){const start=performance.now(),row={round,variant,module:target.dataTab?'data:'+target.dataTab:target.view,operation};try{await action();await ready(page,target);row.ms=Math.round(performance.now()-start);row.status='PASS';row.profile=await page.evaluate(()=>{const r=performance.getEntriesByType('resource');return {sharedReady:Number(document.documentElement.dataset.processSharedReadyMs),assetsReady:Number(document.documentElement.dataset.processAssetsReadyMs),contentReady:Number(document.documentElement.dataset.processReadyMs),styles:r.filter(e=>e.initiatorType==='link'&&new URL(e.name).pathname.endsWith('.css')).length,requests:r.length,bytes:r.reduce((n,e)=>n+e.transferSize,0),api:r.filter(e=>new URL(e.name).pathname.startsWith('/api/')).map(e=>({path:new URL(e.name).pathname,start:Math.round(e.startTime),ms:Math.round(e.duration)}))};});}catch(e){row.status='FAIL';row.error=e.message;}report.rows.push(row);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...row,profile:undefined}));if(row.status==='FAIL')throw Error('ENTRY_FAILED');}
  await page.goto(origin+'/login?view=dashboard');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);
  await measure({view:'dashboard'},'login-to-ready',()=>page.locator('.site-entry-submit').click());
  for(const target of destinations.filter(t=>!process.env.PERF_DESTINATIONS||process.env.PERF_DESTINATIONS.split(',').includes(t.dataTab||t.view))){await measure(target,'document-entry',()=>page.goto(origin+'/process/index.html?'+new URLSearchParams(target)));await measure(target,'reload',()=>page.reload());}
  await context.close();
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.writeFileSync(out,JSON.stringify(report,null,2));}
