// Real Chromium clipboard + Ctrl+V, not a synthetic ClipboardEvent.
// Captures only this fixture's synthetic page; never reads a user's clipboard.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const fixture=await createFeedbackFixture(),passed=[];let browser;
const out='.sites-runtime/feedback-clipboard';fs.mkdirSync(out,{recursive:true});
try{
 const original=await fixture.businessState(),bundled=chromium.executablePath();
 browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'})});
 const context=await browser.newContext({viewport:{width:1365,height:900},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
 const screenshot=await page.screenshot({clip:{x:280,y:300,width:640,height:280}});
 await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
 await page.locator('#wf-panel textarea').fill('Clipboard 截圖回報');
 await page.waitForFunction(()=>window.WebFeedbackHost.canSelectLocation());await page.locator('[data-select]').click();await page.locator('#wf-marking-shield').waitFor();
 const pasteImage=async()=>{
  await page.evaluate(async bytes=>{await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(bytes)],{type:'image/png'})})]);},Array.from(screenshot));
  await page.locator('#wf-panel textarea').click();await page.keyboard.press('Control+V');
 };
 await pasteImage();await page.locator('#wf-panel .wf-thumb').waitFor();assert.equal(await page.locator('#wf-panel .wf-thumb').count(),1);assert.equal(await page.locator('#wf-marking-shield').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#wf-marking-shield').count(),0);
 await page.locator('[data-image]').click();await page.waitForFunction(()=>document.querySelector('#wf-viewer img')?.naturalWidth===640);await page.keyboard.press('Escape');
 passed.push('real screenshot clipboard image pastes once during marking; thumbnail/viewer and Escape work');
 const text=' / 貼上中文 Tiếng Việt';await page.evaluate(value=>navigator.clipboard.writeText(value),text);
 await page.locator('#wf-panel textarea').click();await page.keyboard.press('Control+End');await page.keyboard.press('Control+V');
 assert.equal(await page.locator('#wf-panel textarea').inputValue(),'Clipboard 截圖回報'+text);
 passed.push('real Ctrl+V Chinese/Vietnamese text inserts once and remains editable');
 await page.locator('[data-add]').click();await page.locator('#wf-panel textarea').fill('Clipboard 第二標記');await pasteImage();await page.locator('#wf-panel .wf-thumb').waitFor();
 await page.locator('[data-remove]').click();assert.equal(await page.locator('#wf-panel .wf-thumb').count(),0);
 await page.locator('[data-marker="0"]').click();assert.equal(await page.locator('#wf-panel .wf-thumb').count(),1);assert.equal(await page.locator('#wf-panel textarea').inputValue(),'Clipboard 截圖回報'+text);
 await page.waitForFunction(()=>window.WebFeedback.canOpen());await page.reload();await page.waitForSelector('.wf-row');await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
 assert.equal(await page.locator('#wf-panel .wf-thumb').count(),1);assert.equal(await page.locator('#wf-panel textarea').inputValue(),'Clipboard 截圖回報'+text);
 await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));
 const list=await (await context.request.get(fixture.origin+'/api/web-feedback?action=list')).json(),created=list.issues.filter(i=>i.description.startsWith('Clipboard '));assert.equal(created.length,2);
 const imageIssue=created.find(i=>i.description.includes('截圖回報'));assert.equal(imageIssue.attachments.length,1);
 assert.equal(created.find(i=>i.description.includes('第二標記')).attachments.length,0);
 const image=await context.request.get(fixture.origin+'/api/web-feedback?action=image&id='+imageIssue.attachments[0].id);assert.equal(image.status(),200);
 assert.deepEqual(await sharp(await image.body()).raw().toBuffer(),await sharp(screenshot).raw().toBuffer());
 assert.deepEqual(await fixture.businessState(),original);
 passed.push('pasted image survives marker switching/reload, removal is scoped, submitted original pixels match');
 await page.screenshot({path:out+'/after-submit.png'});
 fs.writeFileSync(out+'/results.json',JSON.stringify({status:'PASS',browser:browser.version(),passed,unverified:['Physical OS screenshot tools, Google Chrome on the user device and hosted clipboard permissions']},null,2));
 console.log(JSON.stringify({status:'PASS',passed}));
}catch(error){fs.writeFileSync(out+'/results.json',JSON.stringify({status:'FAIL',passed,error:String(error.stack).slice(0,2500)},null,2));throw error;}
finally{await browser?.close();await fixture.close();}
