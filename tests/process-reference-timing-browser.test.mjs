import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';

// Current-build measurements only. The older one-sample observation used a
// different readiness boundary and is not a paired performance baseline.
const output=process.env.PERF_OUTPUT||'.sites-runtime/perf500-round3/reference-browser.json';
const rounds=Number(process.env.PERF_ROUNDS||5);
assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=10);
const equipmentId='A-CUT-EQ-19';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={
  phase:'current-only',programCommit:process.env.PROCESS_PROGRAM_COMMIT,
  conditions:{runtime:'compiled local Worker',network:'loopback; no throttling; external blocked',viewport:[1365,900],cache:'HTTP cache disabled by Playwright routing; OS cache retained; each sample is the first dialog open after a document load',actor:'synthetic frank/admin',equipmentId,realData:false,measuredAt:new Date().toISOString()},
  historicalObservation:{file:'.sites-runtime/process-master-baseline.json',samples:1,equipmentOpenMs:786,referenceHTTPMs:749,comparison:'Not comparable: historical n=1; dialog-open boundary did not assert hydrated editable form or reference completion',improvementPercent:null},
  sourceHashes:Object.fromEntries(['public/process/process-equipment.js','app/api/master/references/route.ts','dist/client/process/index.html'].map(file=>[file,hash(file)])),
  rows:[],errors:[],status:'RUNNING',
};
fs.mkdirSync(path.dirname(output),{recursive:true});
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
let fixture,browser;
try{
  fixture=await createProcessMasterFixture();
  report.buildEntrySha256=fixture.buildEntrySha256;
  report.conditions.data=fixture.counts;
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-background-networking']});
  report.conditions.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  const origin=fixture.url.origin;
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function entryReady(){
    await page.waitForFunction(()=>
      document.documentElement.dataset.processNavigationStatus==='ready'&&
      !document.querySelector('#process-boot')&&
      document.querySelectorAll('[data-master-name]').length===15&&
      [...document.querySelectorAll('[data-master-name]')].some(input=>input.value==='隔離流程 9')&&
      document.querySelectorAll('#equipment-panel tbody tr').length===40,
    null,{timeout:30000});
    await paint();
  }
  await page.goto(origin+'/login?view=data&dataTab=process-master');
  await page.locator('#id').fill('frank');
  await page.locator('#password').fill(fixture.password);
  await page.locator('.site-entry-submit').click();
  await entryReady();
  await page.locator('#process-master-new-draft').click();
  await page.locator('#add-master-template').waitFor();
  assert(await page.locator('[data-master-name]').first().isEnabled());

  // Begin belongs to setup. Reload every time, including round 1, so all five
  // measured opens start from the same already-existing shared draft state.
  for(let round=1;round<=rounds;round++){
    const row={round,operation:'equipment-edit-and-references',status:'RUNNING'};
    report.rows.push(row);
    try{
      await page.reload({waitUntil:'domcontentloaded'});
      await entryReady();
      assert(await page.locator('[data-master-name]').first().isEnabled());
      await page.locator('[data-equipment-open]').click();
      await page.locator('#equipment-search').fill('Máy thử nghiệm 19');
      await page.waitForFunction(()=>document.querySelectorAll('#equipment-panel tbody tr').length===2);
      assert.equal(await page.locator('#equipment-editor-dialog[open]').count(),0);
      const isReferenceRequest=request=>{
        const url=new URL(request.url());
        return request.method()==='GET'&&url.pathname==='/api/master/references'&&url.searchParams.get('scope')==='PROCESS'&&url.searchParams.get('kind')==='equipment'&&url.searchParams.get('id')===equipmentId;
      };
      const finished=page.waitForEvent('requestfinished',{predicate:isReferenceRequest});
      const response=page.waitForResponse(result=>isReferenceRequest(result.request()));
      const started=performance.now();
      const formReady=(async()=>{
        await page.waitForFunction(()=>{
          const dialog=document.querySelector('#equipment-editor-dialog[open]');
          if(!dialog)return false;
          const expected={number:'EQ-19',name:'隔離機器 19',nameVi:'Máy thử nghiệm 19',machineType:'fixture',purpose:'test',note:''};
          return Object.entries(expected).every(([key,value])=>{
            const field=dialog.querySelector('[data-equipment-field="'+key+'"]');
            return field&&field.value===value&&!field.disabled&&!field.readOnly;
          })&&dialog.querySelector('[data-equipment-stage]')?.value==='A-CUT'&&
            dialog.querySelector('[data-equipment-stage]')?.disabled===false&&
            dialog.querySelector('[data-equipment-save]')?.disabled===false;
        });
        await paint();
        return Math.round(performance.now()-started);
      })();
      const referencesReady=(async()=>{
        await page.waitForFunction(()=>{
          const box=document.querySelector('#equipment-editor-dialog[open] .equipment-approved-usage');
          return box?.querySelector('b')&&/目前沒有使用中的引用|Không có tham chiếu đang dùng/.test(box.textContent);
        });
        await paint();
        return Math.round(performance.now()-started);
      })();
      // Register all waiters before the actual UI action; Promise.all observes
      // any timeout promptly and all waiters have a bounded timeout.
      const results=await Promise.all([
        page.locator('#equipment-panel tr[data-equipment-id="'+equipmentId+'"] [data-equipment-edit]').first().click(),
        formReady,referencesReady,response,finished,
      ]);
      row.formEditableMs=results[1];
      row.referencesReadyMs=results[2];
      const referenceResponse=results[3],request=results[4];
      assert.equal(referenceResponse.status(),200);
      const body=await referenceResponse.json();
      assert.equal(body.total,0);
      assert.deepEqual(body.references,[]);
      assert.equal(body.detailsRestricted,false);
      assert(Number.isInteger(body.revision));
      const timing=request.timing();
      assert(timing.responseEnd>=0);
      row.http={path:'/api/master/references',query:new URL(request.url()).search,method:'GET',status:200,responseEndMs:Math.round(timing.responseEnd),responseStartMs:Math.round(timing.responseStart),requestStartMs:Math.round(timing.requestStart),boundary:'Playwright request timing: request start to complete response body; includes transport and scheduling, not server CPU only'};
      row.references={total:body.total,visible:body.references.length,detailsRestricted:body.detailsRestricted,revision:body.revision};
      assert(await page.locator('[data-equipment-field="name"]').isEditable());
      assert(await page.locator('[data-equipment-save]').isEnabled());
      row.status='PASS';
      await page.locator('#equipment-editor-dialog[open] [data-equipment-close]').first().click();
      await page.locator('#equipment-editor-dialog[open]').waitFor({state:'detached'});
    }catch(error){row.status='FAIL';row.error=error.message.slice(0,400);throw error;}
    finally{persist();}
  }
  assert.equal(report.errors.length,0);
  const summary=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return{n,medianMs:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,maxMs:sorted[n-1],samples:values};};
  report.summary={formEditable:summary(report.rows.map(row=>row.formEditableMs)),referencesReady:summary(report.rows.map(row=>row.referencesReadyMs)),referenceHTTP:summary(report.rows.map(row=>row.http.responseEndMs))};
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message.slice(0,400);process.exitCode=1;}
finally{await browser?.close();await fixture?.close();persist();}
console.log(JSON.stringify({status:report.status,output,summary:report.summary,error:report.error}));
