import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
const output=process.env.TIMING_OUTPUT||'.sites-runtime/site-timing-20261030.json',rows=[],api=[],errors=[];
const report={programCommit:process.env.PROCESS_PROGRAM_COMMIT,conditions:{runtime:'isolated compiled Worker; synthetic photo-entry fixture',browser:'',viewport:'1365x900',cache:'HTTP cache disabled via routing; OS cache retained',network:'loopback, no throttling',realData:false},rows,api,errors};
let fixture,browser,current=null;
const tabs=['AB','C','bom','line-admin','process-master','users','web-feedback','quality-fqc','quality-iqc','quality-ipqc-ab','quality-ipqc-c','quality-mold-equipment','quality-routine-reports','quality-routine-equipment'];
const views=['dashboard','player','dispatch','productStatus','editor','approval','quality-dashboard','quality-search','quality-reports','quality-inspections','quality-fpy'];
async function ready(page){await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationGeneration===document.documentElement.dataset.processDestinationReadyGeneration&&!document.querySelector('#process-boot'),null,{timeout:20000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert((await page.locator('#view-root').innerText()).trim());assert.equal(await page.locator('#view-root [role=alert]:not(:empty)').count(),0);}
async function measure(page,module,operation,round,fn){const row={module,operation,round,status:'RUNNING'},at=performance.now();current=row;try{await fn();row.status='PASS';row.ms=Math.round(performance.now()-at);}catch(e){row.status='FAIL';row.error=e.message.slice(0,350);}finally{rows.push(row);console.log(JSON.stringify(row));fs.writeFileSync(output,JSON.stringify(report,null,2));current=null;}return row.status==='PASS';}
try{
 fixture=await createPhotoEntryFixture();report.buildEntrySha256=fixture.buildEntrySha256;
 report.assetHashes=Object.fromEntries(['index.html','bootstrap.js','delivery-navigation.js','navigation-lifecycle.mjs'].map(n=>[n,createHash('sha256').update(fs.readFileSync('dist/client/process/'+n)).digest('hex')]));
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking']});report.conditions.browser=browser.version();
 const base=fixture.url.origin;
 for(let round=1;round<=5;round++){
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push({round,error:e.message}));
  page.on('requestfinished',request=>{const u=new URL(request.url()),timing=request.timing();if(u.pathname.startsWith('/api/')&&timing.responseEnd>=0)api.push({module:current?.module,operation:current?.operation,round,path:u.pathname,method:request.method(),ms:Math.round(timing.responseEnd)});});
  await page.goto(base+'/login?view=dashboard');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);
  await measure(page,'dashboard','login-to-ready',round,async()=>{await page.locator('.site-entry-submit').click();await ready(page);assert.equal(await page.evaluate(()=>state.view),'dashboard');});
  if(process.env.TIMING_SECTION==='clicks'){
   const destination=async(view,tab)=>{await page.waitForFunction(({view,tab})=>window.ProcessSync?.destination?.view===view&&(!tab||window.ProcessSync.destination.dataTab===tab)&&document.documentElement.dataset.processNavigationStatus==='ready',{view,tab});await ready(page);};
   for(const pass of ['first-click','revisit-click']){
    if(await page.evaluate(()=>window.ProcessDualSystem.activeSystem!=='process')){await page.locator('.system-switcher').click();await destination('dashboard');}
    for(const view of ['player','dashboard','dispatch','productStatus','editor','approval','data'])await measure(page,view,'sidebar-'+pass,round,async()=>{await page.locator('.sidebar [data-view="'+view+'"]').click();await destination(view);});
    await page.locator('[data-master-scope="C"]').click();await destination('data','C');
    for(const tab of tabs){const selector=['AB','C'].includes(tab)?'[data-master-scope="'+tab+'"]':tab.startsWith('quality-')?'[data-quality-tab="'+tab+'"]':'.master-tabs [data-tab="'+tab+'"]';await measure(page,'data:'+tab,'tab-'+pass,round,async()=>{await page.locator(selector).click();await destination('data',tab);});}
    if(await page.evaluate(()=>window.ProcessDualSystem.activeSystem!=='quality')){await page.locator('.system-switcher').click();await destination('quality-dashboard');}
    await page.locator('.sidebar [data-view="quality-search"]').click();await destination('quality-search');
    for(const view of views.filter(v=>v.startsWith('quality-')))await measure(page,view,'sidebar-'+pass,round,async()=>{await page.locator('.sidebar [data-view="'+view+'"]').click();await destination(view);});
   }
   await context.close();continue;
  }
  for(const [module,url] of (process.env.TIMING_SECTION==='navigation'?[]:[...views.map(view=>[view,'?view='+view]),...tabs.map(tab=>['data:'+tab,'?view=data&dataTab='+tab])])){
   const ok=await measure(page,module,'document-entry',round,async()=>{await page.goto(base+'/process/index.html'+url);await ready(page);});
   if(ok)await measure(page,module,'reload',round,async()=>{await page.reload();await ready(page);});
  }
  await page.goto(base+'/process/index.html?view=approval');await ready(page);
  for(const tab of ['master','process','quality','routine'])await measure(page,'approval:'+tab,'tab-ready',round,async()=>{await page.locator('[data-review-tab="'+tab+'"]').click();await page.waitForFunction(tab=>state.approvalTab===tab&&document.documentElement.dataset.processNavigationStatus==='ready',tab);await ready(page);assert.equal(await page.locator('#approval-panel-'+tab).isVisible(),true);});
  await page.goto(base+'/process/index.html?view=dashboard');await ready(page);
  for(const system of ['quality','process'])await measure(page,'system:'+system,'switch-ready',round,async()=>{await page.locator('.system-switcher').click();await page.waitForFunction(system=>window.ProcessDualSystem.activeSystem===system&&window.ProcessSync.destination.view===(system==='quality'?'quality-dashboard':'dashboard')&&document.documentElement.dataset.processNavigationStatus==='ready',system);await ready(page);assert.equal(await page.evaluate(()=>window.ProcessDualSystem.activeSystem),system);});
  if(process.env.TIMING_SECTION==='navigation'){
   await page.goto(base+'/process/index.html?view=editor');await ready(page);
   await measure(page,'editor','product-filter-canvas',round,async()=>{await page.locator('[data-pe-product]').selectOption('P1');await page.locator('.pe-card[data-node="photo-operation"]').waitFor();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.locator('[data-pe-product]').inputValue(),'P1');});
   await measure(page,'editor','line-C-stage-ready',round,async()=>{await page.locator('#editor-line-select').selectOption('C');await page.waitForFunction(()=>document.querySelector('.pe-editor')?.dataset.stageKey==='C-CUT');await page.locator('.pe-viewport').waitFor();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));});
   await measure(page,'editor','line-A-canvas-ready',round,async()=>{await page.locator('#editor-line-select').selectOption('A');await page.waitForFunction(()=>document.querySelector('.pe-editor')?.dataset.stageKey==='A-CUT');await page.locator('.pe-card[data-node="photo-operation"]').waitFor();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));});
   await measure(page,'editor','search-canvas',round,async()=>{await page.locator('[data-pe-search]').fill('Photo operation');await page.locator('.pe-card.pe-match').waitFor();});
  }
  // Capture the available editor selectors; no guessed product/canvas readiness.
  if(round===1){await page.goto(base+'/process/index.html?view=editor');await ready(page);report.editorControls=await page.locator('#view-root select').evaluateAll(nodes=>nodes.map(n=>({id:n.id,options:[...n.options].map(o=>({value:o.value,text:o.textContent}))})));}
  await context.close();
 }
 report.status=rows.some(r=>r.status==='FAIL')||errors.length?'COMPLETED_WITH_FAILURES':'PASS';
}catch(e){report.status='HARNESS_FAILED';report.error=e.message;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.writeFileSync(output,JSON.stringify(report,null,2));}
