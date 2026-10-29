// Regression for pointer input before the newly inserted shield paints.
// This diagnostic deliberately does not wait for the visible ready state.
// Keep the immediate click and return nonzero on any remote-frame activation.
// Do not add a ready-state or paint delay before that click.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const fixture=await createFeedbackFixture(),samples=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FEEDBACK_BROWSER_PATH||chromium.executablePath()});
 for(let run=0;run<3;run++){
  const context=await browser.newContext({viewport:{width:1365,height:900}});
  try{
   await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
   await context.route('https://frame.synthetic.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<button style="width:100%;height:150px">Frame action</button><script>for(const type of ["pointerdown","mousedown","click"])document.addEventListener(type,()=>parent.postMessage(type,"*"),true)</script>'}));
   const page=await context.newPage();await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');
   await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
   await page.evaluate(()=>{
    window.__frameHits=[];window.addEventListener('message',e=>{if(e.origin==='https://frame.synthetic.invalid')window.__frameHits.push(e.data);});
    const frame=document.createElement('iframe');frame.id='frameprobe';frame.src='https://frame.synthetic.invalid/';frame.style.cssText='position:fixed;left:30px;top:150px;width:340px;height:180px;z-index:100';document.body.append(frame);
   });
   await page.frameLocator('#frameprobe').locator('button').waitFor();await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
   await page.locator('[data-select]').click();await page.locator('#wf-marking-shield').waitFor();await page.mouse.click(100,200);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   samples.push({run,...await page.evaluate(()=>({events:window.__frameHits,selectionStillActive:!!document.querySelector('#wf-marking-shield')}))});
  }finally{await context.close();}
 }
 console.log(JSON.stringify(samples));assert(samples.every(sample=>sample.events.length===0),'CROSS_ORIGIN_FRAME_PREPAINT_PENETRATION');
}finally{
 await browser?.close();await fixture.close();fs.mkdirSync('.sites-runtime/feedback-iframe-transition',{recursive:true});
 fs.writeFileSync('.sites-runtime/feedback-iframe-transition/results.json',JSON.stringify({status:samples.length===3&&samples.every(sample=>sample.events.length===0)?'PASS':'FAIL',samples},null,2));
}
