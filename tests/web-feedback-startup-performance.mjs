// Cold browser cache, normal login, isolated compiled Worker/D1/R2.
// Optional fixed response delay models latency, not a real hosted connection.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

const label=process.argv[2]||'current';
assert.match(label,/^[a-z0-9-]+$/);
const fixture=await createFeedbackFixture();
let browser;
const samples=[],out='.sites-runtime/feedback-startup';
try {
 const bundled=chromium.executablePath();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'})});
 const login=await browser.newContext();
 const page=await login.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');
 await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);
 await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
 const auth=await login.storageState();await login.close();
 for(const delayMs of [0,120])for(let run=0;run<5;run++) {
  const context=await browser.newContext({storageState:auth,viewport:{width:1365,height:1000},serviceWorkers:'block'});
  await context.route('**/*',async r=>{
   const url=new URL(r.request().url());
   if(url.origin!==fixture.origin)return r.abort();
   if(delayMs&&(url.pathname.includes('/web-feedback')||url.pathname==='/api/web-feedback'))await new Promise(resolve=>setTimeout(resolve,delayMs));
   return r.continue();
  });
  const p=await context.newPage();
  // Record rendering at the first animation frame containing actual rows.
  // No polling delay from Playwright's locator is included in readyMs.
  await p.addInitScript(()=>{
   const paint=()=>{
    if(document.querySelector('.wf-row'))window.__feedbackFirstRows=performance.now();
    else requestAnimationFrame(paint);
   };
   requestAnimationFrame(paint);
  });
  await p.goto(fixture.origin+'/process/index.html?view=data&dataTab=web-feedback');
  await p.waitForFunction(()=>window.__feedbackFirstRows>0).catch(async error=>{
   console.error({url:p.url(),body:(await p.locator('body').innerText()).slice(0,700)});throw error;
  });
  await p.waitForFunction(()=>[...document.querySelectorAll('.wf-detail img')].every(i=>i.complete));
  const result=await p.evaluate(()=>({
   readyMs:window.__feedbackFirstRows,
   resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('web-feedback')).map(e=>({path:new URL(e.name).pathname,action:new URL(e.name).searchParams.get('action'),startMs:e.startTime,endMs:e.responseEnd,waitMs:e.responseStart-e.requestStart,totalMs:e.duration,bytes:e.encodedBodySize})),
   rows:document.querySelectorAll('.wf-row').length
  }));
  assert.equal(result.rows,60);
  assert.equal(result.resources.filter(e=>e.action==='list').length,1,'one authorized list request per cold entry');
  samples.push({delayMs,run,...result});
  fs.mkdirSync(out,{recursive:true});
  if(delayMs===0&&run===0){
   await p.locator('[data-issue]').nth(1).click();
   if(await p.locator('html').getAttribute('lang')!=='zh')await p.locator('.top-language-switch').click();
   await p.waitForFunction(()=>document.querySelector('.wf-admin h2')?.textContent==='網頁問題回報');
   await p.screenshot({path:out+'/'+label+'-desktop-zh.png',fullPage:true});
  }
  await context.close();
 }
 const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
 const summary=[0,120].map(delayMs=>{
  const group=samples.filter(s=>s.delayMs===delayMs);
  return {delayMs,runs:group.length,medianReadyMs:median(group.map(s=>s.readyMs)),medianListWaitMs:median(group.map(s=>s.resources.find(r=>r.action==='list').waitMs)),medianRenderAfterListMs:median(group.map(s=>s.readyMs-s.resources.find(r=>r.action==='list').endMs))};
 });
 fs.writeFileSync(out+'/'+label+'.json',JSON.stringify({label,browser:browser.version(),seedIssues:60,summary,samples},null,2));
 console.log(JSON.stringify({label,summary}));
}finally{await browser?.close();await fixture.close();}
