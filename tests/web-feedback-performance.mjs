// Same synthetic workload for baseline/candidate. Browser settling includes the
// automation wait and two animation frames; it is not a CPU-only render metric.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const label=process.argv[2]||'current';assert.match(label,/^[a-z0-9-]+$/);
const fixture=await createFeedbackFixture(),results=[];let browser;
try{
 const bundled=chromium.executablePath();browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1365,height:900}});await page.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
 async function measure(name,run){await page.evaluate(()=>performance.clearResourceTimings());const start=performance.now();await run();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const elapsedMs=performance.now()-start;const detail=await page.evaluate(()=>{const resources=performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/web-feedback')),api=resources.filter(e=>!e.name.includes('action=image')),images=resources.filter(e=>e.name.includes('action=image'));return{api:api.map(e=>({action:new URL(e.name).searchParams.get('action'),waitingMs:e.responseStart-e.requestStart,totalMs:e.duration,bytes:e.encodedBodySize})),images:images.map(e=>({totalMs:e.duration,bytes:e.encodedBodySize})),settledAfterApiMs:api.length?performance.now()-Math.max(...api.map(e=>e.responseEnd)):null};});results.push({name,elapsedMs,...detail});}
 await measure('first-open',async()=>{await page.reload();await page.waitForSelector('.wf-row');});
 await measure('detail',()=>page.locator('[data-issue]').nth(2).click());
 await page.locator('[data-note]').fill('私人備註 ghi chú riêng');
 await measure('note-save',async()=>{await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');});
 await measure('complete',async()=>{await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]')?.dataset.update==='done');});
 await measure('reopen',async()=>{await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]')?.dataset.update==='open');});
 await page.locator('[data-pick]').nth(0).check();await page.locator('[data-pick]').nth(1).check();
 await measure('prepare-zip',async()=>{await page.locator('[data-export]').click();await page.locator('.wf-admin [role=status] a').waitFor();});
 await measure('handoffs',async()=>{await page.locator('[data-board-tab=history]').click();await page.waitForSelector('.wf-history');});
 await measure('return-list',async()=>{await page.locator('[data-board-tab=list]').click();await page.waitForSelector('.wf-row');});
 await measure('helper-first',async()=>{await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();});
 await page.locator('[data-close]').click();
 await measure('helper-reopen',async()=>{await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();});
 await page.locator('#wf-panel textarea').fill('效能測試回報 Báo cáo đo hiệu suất');
 await measure('submit',async()=>{await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));});
 fs.mkdirSync('.sites-runtime/feedback-performance',{recursive:true});fs.writeFileSync('.sites-runtime/feedback-performance/'+label+'.json',JSON.stringify({label,browser:browser.version(),viewport:'1365x900',seedIssues:60,results},null,2));console.log(JSON.stringify({label,results}));
}finally{await browser?.close();await fixture.close();}
