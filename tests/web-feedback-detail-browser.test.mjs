// Incremental detail updates and on-demand history rendering through real UI/API.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const fixture=await createFeedbackFixture(),results=[],out='.sites-runtime/feedback-detail';let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FEEDBACK_BROWSER_PATH||chromium.executablePath()});
 const context=await browser.newContext({viewport:{width:1365,height:900}}),business=await fixture.businessState();
 await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/web-feedback')requests.push(u.searchParams.get('action'));});
 await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
 const cases=await (await context.request.get(fixture.origin+'/api/web-feedback?action=list')).json(),issue=cases.issues.find(i=>i.attachments.length&&i.description.length<300);
 await page.locator('[data-issue="'+issue.id+'"]').click();await page.locator('.wf-detail img').waitFor();
 const note='中文與越文 Ghi chú riêng <img src=x onerror=alert(1)> '+('長內容 Nội dung dài '.repeat(25));
 async function check(name,run){await run();assert.deepEqual(errors,[]);assert.deepEqual(await fixture.businessState(),business);results.push(name);console.log('PASS '+name);}
 await check('failed/retried and repeated writes preserve detail controls, image, text and single-update receipts',async()=>{
  await page.evaluate(()=>{window.__detailRefs={image:document.querySelector('.wf-detail img'),input:document.querySelector('[data-note]'),button:document.querySelector('[data-update]')};});
  await page.route('**/api/web-feedback?action=update',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SYNTHETIC_RETRY"}'}),{times:1});
  await page.locator('[data-note]').fill(note);await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]').textContent.includes('SYNTHETIC_RETRY'));assert.equal(await page.locator('[data-note]').inputValue(),note);
  const reads=requests.filter(x=>x==='list').length;
  await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]').value==='');
  assert((await page.locator('[data-note-history]').textContent()).includes(note));assert.equal(await page.locator('[data-note-history] img').count(),0);
  await page.locator('[data-note]').fill('第二筆 Ghi chú thứ hai');await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]').value==='');
  for(const status of ['done','open']){await page.locator('[data-update]').nth(1).click();await page.waitForFunction(status=>document.querySelector('[data-update]').dataset.update===status,status);}
  assert.equal(requests.filter(x=>x==='list').length,reads);
  assert(await page.evaluate(()=>Object.entries(window.__detailRefs).every(([key,node])=>node===document.querySelector(key==='image'?'.wf-detail img':key==='input'?'[data-note]':'[data-update]'))));
  const fresh=(await (await context.request.get(fixture.origin+'/api/web-feedback?action=list')).json()).issues.find(i=>i.id===issue.id);assert.equal(fresh.notes.length,2);assert.equal(fresh.status,'open');
  await page.reload();await page.waitForSelector('.wf-row');await page.locator('[data-issue="'+issue.id+'"]').click();assert((await page.locator('[data-note-history]').textContent()).includes(note));
 });
 await check('history expands complete immutable text on demand, without extra reads or duplicated contents',async()=>{
  await page.locator('[data-pick="'+issue.id+'"]').check();await page.locator('[data-export]').click();await page.locator('.wf-admin [role=status] a').waitFor();
  await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]').dataset.update==='done');
  await page.locator('[data-board-tab=history]').click();await page.locator('.wf-history').waitFor();
  assert.equal(await page.locator('[data-handoff-issue]').count(),0);const reads=requests.length;
  await page.locator('[data-handoff-cases]>summary').focus();await page.keyboard.press('Enter');await page.locator('[data-handoff-issue]').waitFor();
  assert.equal(await page.locator('.wf-history .wf-note-history').count(),0);
  const summary=page.locator('[data-handoff-issue]>summary');assert.match(await summary.textContent(),/未完成|Chưa xong/);assert.match(await summary.textContent(),/已完成|Hoàn tất/);
  await summary.click();await page.locator('.wf-history .wf-note-history').waitFor();assert((await page.locator('.wf-history .wf-note-history').textContent()).includes(note));assert.equal(await page.locator('.wf-history img').count(),0);
  const children=await page.locator('.wf-history .wf-note-history p').count();await summary.click();await summary.click();assert.equal(await page.locator('.wf-history .wf-note-history p').count(),children);assert.equal(requests.length,reads);
 });
 await check('Chinese/Vietnamese history and detail actions fit desktop and phone widths with visible focus',async()=>{
  fs.mkdirSync(out,{recursive:true});
  for(const width of [1365,768,390,320])for(const lang of ['zh','vi']){
   await page.setViewportSize({width,height:900});if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('.top-language-switch').click();
   await page.locator('.wf-history').waitFor();
   const group=page.locator('[data-handoff-cases]');if(!await group.evaluate(el=>el.open))await group.locator('summary').first().click();await page.locator('[data-handoff-issue]').waitFor();
   await page.locator('[data-handoff-issue]>summary').first().click();
   assert(await page.locator('.wf-admin').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.locator('[data-handoff-cases]>summary').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert(await page.locator('[data-handoff-cases]>summary').evaluate(el=>document.activeElement===el&&getComputedStyle(el).outlineStyle!=='none'));
   await page.screenshot({path:out+'/'+width+'-'+lang+'-history.png',fullPage:true});
  }
  await page.locator('[data-board-tab=list]').click();await page.waitForSelector('.wf-row');await page.locator('[data-issue="'+issue.id+'"]').click();
  assert(await page.locator('.wf-detail-actions').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:out+'/320-vi-detail.png',fullPage:true});
 });
 await context.close();
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();await fixture.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/results.json',JSON.stringify({passed:results,status:process.exitCode?'FAIL':'PASS'},null,2));}
