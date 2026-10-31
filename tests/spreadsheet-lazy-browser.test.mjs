import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
const report={realData:false,physicalPhone:false,cases:[],timings:[],errors:[]};
let fixture,browser;
async function ready(page,view='data'){await page.waitForFunction(view=>window.ProcessSync?.destination?.view===view&&document.documentElement.dataset.processNavigationStatus==='ready'&&!document.querySelector('#process-boot'),view);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
try{
 fixture=await createPhotoEntryFixture();browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.url.origin?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));let vendorRequests=0,downloadCount=0;
 page.on('request',r=>{if(new URL(r.url()).pathname==='/process/vendor/xlsx.full.min.js')vendorRequests++;});page.on('download',()=>downloadCount++);
 await page.goto(fixture.url.origin+'/login?view=dashboard');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await ready(page,'dashboard');
 assert.equal(vendorRequests,0);assert.equal(await page.evaluate(()=>typeof window.XLSX),'undefined');report.cases.push({name:'dashboard-no-xlsx-request',status:'PASS'});
 for(const [tab,selector] of [['AB','#master-export'],['line-admin','#master-line-export'],['process-master','#export-process-master'],['quality-fqc','#fqc-export']]){
  await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab='+tab);await ready(page);assert.equal(vendorRequests,0);assert.equal(await page.evaluate(()=>typeof window.XLSX),'undefined');
  const button=page.locator(selector);report.cases.push({name:tab+'-entry-no-xlsx',status:'PASS',exportControl:await button.count()?(await button.isVisible()&&await button.isEnabled()?'available':'unavailable'):'absent'});
 }
 await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab=bom');await ready(page);const exportAll=page.locator('[data-bw=export-all]');assert.equal(await exportAll.isEnabled(),true);
 let exported;
 for(const operation of ['first-export','repeat-export']){
  const at=performance.now(),download=page.waitForEvent('download');await exportAll.click();exported=await download;const path=await exported.path();assert(path);const bytes=fs.readFileSync(path);assert.equal(bytes.subarray(0,2).toString(),'PK');await page.waitForFunction(()=>!document.querySelector('.bw-workspace')?.getAttribute('aria-busy'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  report.timings.push({operation,module:'BOM',n:1,ms:Math.round(performance.now()-at),completion:'XLSX download readable and workspace not busy; two frames',bytes:bytes.length});
 }
 assert.equal(vendorRequests,1);report.cases.push({name:'bom-real-first-repeat-download-single-vendor',status:'PASS'});
 // Use the real downloaded workbook's format with two isolated fixture rows.
 // The photo fixture starts with an empty BOM, whose header-only export cannot
 // be imported under the existing BOM_NO_ERP_ROWS rule.
 const importWorkbook=Buffer.from(await page.evaluate(bytes=>{
  const book=window.XLSX.read(new Uint8Array(bytes),{type:'array'});
  window.XLSX.utils.sheet_add_aoa(book.Sheets[book.SheetNames[0]],[
   ['BOM-LAZY-QA','0','','','Synthetic lazy import root','','PCS','1','1','0'],
   ['BOM-LAZY-QA','.1','0010','BOM-LAZY-PART','Synthetic lazy import part','QA only','PCS','2','1','0'],
  ],{origin:-1});
  return [...new Uint8Array(window.XLSX.write(book,{bookType:'xlsx',type:'array'}))];
 },[...fs.readFileSync(await exported.path())]));
 // The current rule disables non-BOM exchange in shared-draft pages. Do not
 // fabricate buttons or invoke disabled actions to claim UI acceptance.
 for(const row of report.cases.filter(r=>r.exportControl))if(row.exportControl!=='available')row.exportAcceptance='NOT_APPLICABLE_CURRENT_UI';
 // Fresh document: hold the real library request while dispatching both clicks.
 await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab=bom');await ready(page);
 let release,requested;const gate=new Promise(r=>release=r),started=new Promise(r=>requested=r);
 await page.route('**/vendor/xlsx.full.min.js*',async r=>{requested();await gate;await r.continue();});
 const before=downloadCount,requestsBefore=vendorRequests,download=page.waitForEvent('download');
 await page.locator('[data-bw=export-all]').dispatchEvent('click');await started;await page.locator('[data-bw=export-all]').dispatchEvent('click');assert.equal(vendorRequests,requestsBefore+1);release();await download;await ready(page);assert.equal(downloadCount,before+1);await page.unroute('**/vendor/xlsx.full.min.js*');report.cases.push({name:'delayed-double-click-single-export',status:'PASS'});
 // A failed code request has not run the export handler. Retry is GET-only and
 // produces exactly one download after the existing permission check.
 await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab=bom');await ready(page);let first=true;
 await page.route('**/vendor/xlsx.full.min.js*',r=>{if(first){first=false;return r.abort('failed');}return r.continue();});
 const prior=downloadCount;await page.locator('[data-bw=export-all]').click();const retry=page.locator('[role=alert] button').filter({hasText:/Excel/});await retry.waitFor();assert.equal(downloadCount,prior);const retried=page.waitForEvent('download');await retry.click();await retried;await ready(page);assert.equal(downloadCount,prior+1);await page.unroute('**/vendor/xlsx.full.min.js*');report.cases.push({name:'failed-library-visible-retry-no-duplicate-download',status:'PASS'});
 // Navigation invalidates the old callback even when the code later loads.
 await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab=bom');await ready(page);let unblock,signal;const lateGate=new Promise(r=>unblock=r),lateStarted=new Promise(r=>signal=r);
 await page.route('**/vendor/xlsx.full.min.js*',async r=>{signal();await lateGate;await r.continue();});
 const count=downloadCount;await page.locator('[data-bw=export-all]').click();await lateStarted;await page.locator('.sidebar [data-view=dashboard]').click();await ready(page,'dashboard');unblock();await page.waitForFunction(()=>!!window.XLSX);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(downloadCount,count);report.cases.push({name:'late-library-does-not-run-old-page-export',status:'PASS'});
 await page.unroute('**/vendor/xlsx.full.min.js*');
 // Fresh document and the real Begin path: file selection must survive a
 // delayed/failed code request. Parsing creates comparison only, never Apply.
 await page.goto(fixture.url.origin+'/process/index.html?view=data&dataTab=bom');await ready(page);assert.equal(await page.evaluate(()=>typeof window.XLSX),'undefined');
 const bomWrites=[],recordBomWrite=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/bom/workflow'){const body=request.postDataJSON();bomWrites.push(body.command?.action||body.action);}};page.on('request',recordBomWrite);
 await page.locator('[data-bw=begin]').click();await page.waitForFunction(()=>{const b=document.querySelector('[data-bw=import]');return b&&!b.disabled&&!document.querySelector('.bw-workspace')?.hasAttribute('aria-busy');});assert.deepEqual(bomWrites,['begin']);
 const readBom=()=>page.evaluate(async()=>{const response=await fetch('/api/bom/workflow?caseMetadata=1');if(!response.ok)throw Error('BOM readback failed');return (await response.json()).control;});
 const beforeImport=await readBom();let failImportLoad,importRequested,firstImportRequest=true;const importGate=new Promise(r=>failImportLoad=r),importStarted=new Promise(r=>importRequested=r);
 await page.route('**/vendor/xlsx.full.min.js*',async route=>{if(firstImportRequest){firstImportRequest=false;importRequested();await importGate;return route.abort('failed');}return route.continue();});
 const filename='BOM_LAZY_ISOLATED.xlsx',chooser=page.waitForEvent('filechooser');await page.locator('[data-bw=import]').click();await (await chooser).setFiles({name:filename,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:importWorkbook});await importStarted;
 assert.equal(await page.locator('#bw-file').evaluate(input=>input.files[0]?.name),filename);assert.equal(await page.locator('[data-bw=apply-import]').count(),0);assert.deepEqual(bomWrites,['begin']);
 failImportLoad();const importRetry=page.locator('[role=alert] button').filter({hasText:/Excel/});await importRetry.waitFor();assert.equal(await page.locator('#bw-file').evaluate(input=>input.files[0]?.name),filename);assert.deepEqual(bomWrites,['begin']);
 await importRetry.click();await page.locator('[data-bw=apply-import]').waitFor();await page.waitForFunction(()=>!document.querySelector('.bw-workspace')?.hasAttribute('aria-busy'));
 const comparison=await page.locator('.bw-compare').innerText();assert(comparison.includes(filename));assert(comparison.includes('BOM-LAZY-QA'));assert(comparison.includes('Synthetic lazy import part'));assert.equal(await page.locator('.bw-change').count(),1);assert.equal(await page.locator('.bw-results [data-code]').count(),0);
 assert.deepEqual(bomWrites,['begin']);assert.deepEqual(await readBom(),beforeImport);assert.equal(await page.locator('#bw-file').evaluate(input=>input.files.length),0);
 await page.locator('[data-bw=cancel-import]').click();await page.locator('[data-bw=apply-import]').waitFor({state:'detached'});assert.deepEqual(bomWrites,['begin']);page.off('request',recordBomWrite);await page.unroute('**/vendor/xlsx.full.min.js*');
 report.cases.push({name:'bom-native-first-import-delayed-failure-retry-comparison-no-write',status:'PASS',source:'actual exported workbook headers plus two isolated synthetic rows',filePreservedUntilHandler:true,comparisonChanges:1,serverWrites:['begin'],savedControlUnchanged:true});
 assert.equal(report.errors.length,0);report.status='PASS';await context.close();
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.mkdirSync('.sites-runtime/perf-500ms-round3',{recursive:true});fs.writeFileSync('.sites-runtime/perf-500ms-round3/spreadsheet-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
