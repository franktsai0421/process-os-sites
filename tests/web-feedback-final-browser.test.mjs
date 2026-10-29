// Remaining acceptance gaps: stale history, helper navigation, cross-origin frames.
// Actual compiled Worker and normal authentication, synthetic D1/R2 only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

const fixture=await createFeedbackFixture(),results=[],out='.sites-runtime/feedback-final';
let browser;
try {
 const bundled=chromium.executablePath();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'})});
 const original=await fixture.businessState();
 async function check(name,run) {
  const context=await browser.newContext({viewport:{width:1365,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  try {
   await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');
   await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);
   await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
   await run({page,context});assert.deepEqual(pageErrors,[]);results.push({name,status:'PASS'});console.log('PASS '+name);
  } catch(error) {
   const diagnostic=await page.evaluate(()=>({url:location.href,events:window.__frameProbeEvents,actions:window.__frameActions,hit:document.elementsFromPoint(100,200).map(el=>el.id||el.tagName),shield:document.querySelector('#wf-marking-shield')?.getBoundingClientRect().toJSON()}));
   results.push({name,status:'FAIL',error:String(error.stack).slice(0,2000),pageErrors,diagnostic});process.exitCode=1;
   fs.mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/failure-'+results.length+'.png'});
   console.error('FAIL '+name+' '+error.message);
  } finally {await context.close();}
 }
 await check('late history cannot replace the list or the last rapidly selected issue',async({page})=>{
  let release,started;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
  await page.route('**/api/web-feedback?action=handoffs',async route=>{
   const response=await route.fetch();started();await gate;await route.fulfill({response});
  });
  try {
   await page.locator('[data-board-tab=history]').click();await requested;
   await page.locator('[data-board-tab=list]').click();await page.waitForSelector('.wf-row');
   const id=await page.locator('[data-issue]').nth(19).getAttribute('data-issue');
   await page.locator('[data-issue]').evaluateAll(nodes=>{for(let i=0;i<20;i++)nodes[i].click();});
   assert.equal(await page.locator('.wf-detail h3').textContent(),id);
   const response=page.waitForResponse(r=>r.url().includes('action=handoffs'));release();await response;
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.locator('.wf-row').count(),60);
   assert.equal(await page.locator('.wf-detail h3').textContent(),id);
   assert.equal(await page.locator('[data-board-tab=list]').getAttribute('aria-selected'),'true');
  } finally {release();}
 });
 await check('deleted draft marker stays deleted across page navigation; helper listeners do not accumulate',async({page,context})=>{
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
  await page.locator('#wf-panel textarea').fill('保留的標記 Giữ nội dung');
  await page.locator('[data-add]').click();await page.locator('#wf-panel textarea').fill('刪除的標記 Xóa');
  await page.locator('#wf-panel [data-delete]').click();
  assert.equal(await page.locator('[data-marker]').count(),1);
  assert.equal(await page.locator('#wf-panel textarea').inputValue(),'保留的標記 Giữ nội dung');
  await page.locator('[data-close]').click();
  const cdp=await context.newCDPSession(page);
  const listenerCount=async()=>{
   let count=0;
   for(const expression of ['window','document']){
    const value=await cdp.send('Runtime.evaluate',{expression});
    count+=(await cdp.send('DOMDebugger.getEventListeners',{objectId:value.result.objectId})).listeners.length;
   }
   return count;
  };
  const before=await listenerCount();
  for(let i=0;i<3;i++){
   await page.locator('.nav-item[data-view=dashboard]').click();
   await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
   assert.equal(await page.locator('#wf-panel textarea').inputValue(),'保留的標記 Giữ nội dung');
   await page.locator('[data-close]').click();
   await page.goBack();await page.waitForSelector('.wf-row');
  }
  assert.equal(await listenerCount(),before);await cdp.detach();
  await page.reload();await page.waitForSelector('.wf-row');
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
  assert.equal(await page.locator('[data-marker]').count(),1);
  assert.equal(await page.locator('#wf-panel textarea').inputValue(),'保留的標記 Giữ nội dung');
 });
 await check('painted marking shield protects a cross-origin iframe and saves its outer-frame location',async({page,context})=>{
  // Fulfilled locally: no request reaches this synthetic external origin.
  await context.route('https://feedback-frame.synthetic.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<button style="width:100%;height:140px">Frame action</button><script>for(const type of ["pointerdown","mousedown","touchstart","click"]){document.addEventListener(type,()=>parent.postMessage({probe:"feedback-frame",type},"*"),true)}</script>'}));
  await page.evaluate(()=>{
   window.__frameActions=[];window.__frameProbeEvents=[];
   for(const type of ['pointerdown','pointerup','click','pointercancel'])window.addEventListener(type,e=>window.__frameProbeEvents.push({type,target:e.target.id,x:e.clientX,y:e.clientY}),true);
   window.addEventListener('message',e=>{if(e.origin==='https://feedback-frame.synthetic.invalid'&&e.data?.probe==='feedback-frame')window.__frameActions.push(e.data.type);});
   const frame=document.createElement('iframe');frame.id='feedback-frame-probe';frame.title='外部內容';frame.src='https://feedback-frame.synthetic.invalid/';
   frame.style.cssText='position:fixed;left:30px;top:150px;width:340px;height:180px;z-index:100';document.body.append(frame);
  });
  await page.frameLocator('#feedback-frame-probe').locator('button').waitFor();
  assert.equal(await page.locator('#feedback-frame-probe').evaluate(el=>el.contentDocument),null);
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
  await page.locator('#wf-panel textarea').fill('跨來源外框備援 Khung bên ngoài');
  await page.locator('[data-select]').click();await page.locator('#wf-marking-shield').waitFor();
  // The regular acceptance starts after the shield is painted. The opt-in
  // diagnostic retains the known pre-paint compositor race, without masking it.
  if(process.env.FEEDBACK_PREPAINT_PROBE!=='1')await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.mouse.click(100,200);await page.locator('#wf-marking-shield').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>window.__frameActions),[]);
  await page.locator('[data-submit]').click();
  await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));
  const response=await context.request.get(fixture.origin+'/api/web-feedback?action=list');assert.equal(response.status(),200);
  const issue=(await response.json()).issues.find(i=>i.description==='跨來源外框備援 Khung bên ngoài');
  assert(issue);assert.equal(issue.location.locator.id,'feedback-frame-probe');assert.equal(issue.location.locator.tag,'iframe');
  assert.equal(issue.location.position.x,100);assert.equal(issue.location.position.y,200);
  await page.frameLocator('#feedback-frame-probe').locator('button').click();
  await page.waitForFunction(()=>window.__frameActions.includes('click'));
 });
 assert.deepEqual(await fixture.businessState(),original);
} finally {
 await browser?.close();await fixture.close();fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(out+'/results.json',JSON.stringify({results,status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS'},null,2));
}
