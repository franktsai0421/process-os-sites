// Feedback-only browsing preferences, report guidance and sticky controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const fixture=await createFeedbackFixture(),out='.sites-runtime/feedback-workspace',results=[];
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.FEEDBACK_BROWSER_PATH||chromium.executablePath()});
 const original=await fixture.businessState();
 async function check(name,run){
  const context=await browser.newContext({viewport:{width:1365,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
   await run({page,context});assert.deepEqual(errors,[]);results.push({name,status:'PASS'});console.log('PASS '+name);
  }catch(error){results.push({name,status:'FAIL',error:String(error.stack).slice(0,1800)});process.exitCode=1;console.error('FAIL '+name+' '+error.message);fs.mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/failure-'+results.length+'.png'});}
  finally{await context.close();}
 }
 await check('filters, picks, active issue and list position survive history, reload and real navigation',async({page})=>{
  await page.locator('[data-filter=search]').fill('中文問題');assert.equal(await page.locator('.wf-row').count(),30);
  await page.locator('[data-pick]').nth(8).check();const picked=await page.locator('[data-pick]:checked').getAttribute('data-pick');
  await page.locator('[data-issue]').nth(10).click();const active=await page.locator('.wf-detail h3').textContent();
  await page.locator('.wf-list').evaluate(el=>{el.scrollTop=420;el.dispatchEvent(new Event('scroll'));});
  const position=await page.locator('.wf-list').evaluate(el=>el.scrollTop);assert(position>0);
  async function verify(){assert.equal(await page.locator('[data-filter=search]').inputValue(),'中文問題');assert.equal(await page.locator('.wf-row').count(),30);assert.equal(await page.locator('[data-pick]:checked').getAttribute('data-pick'),picked);assert.equal(await page.locator('.wf-detail h3').textContent(),active);assert(Math.abs(await page.locator('.wf-list').evaluate(el=>el.scrollTop)-position)<2);}
  await page.locator('[data-board-tab=history]').click();await page.locator('[data-board-tab=list]').click();await verify();
  await page.reload();await page.waitForSelector('.wf-row');await verify();
  await page.locator('.nav-item[data-view=dashboard]').click();await page.waitForURL(url=>url.searchParams.get('view')==='dashboard');await page.goBack();await page.waitForSelector('.wf-row');await verify();
  await page.evaluate(()=>window.scrollTo(0,450));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const box=await page.locator('.wf-tools').boundingBox(),bar=await page.locator('.topbar').boundingBox();assert(box.y>=bar.y+bar.height-1);assert(box.y<bar.y+bar.height+30);
 });
 await check('preferences exclude missing IDs and stay scoped to the verified account',async({page,context})=>{
  await context.addInitScript(()=>{const key=location.origin+'|feedback-v1|frank|board';sessionStorage.setItem(key,JSON.stringify({filters:{search:'中文問題',from:'"><img data-preference-injection src=x>'},selected:['missing-case'],selectedIssue:'missing-case',listScroll:0}));sessionStorage.setItem(location.origin+'|feedback-v1|employee|board',JSON.stringify({filters:{search:'staff-only-filter'}}));});
  await page.reload();await page.waitForSelector('.wf-row');assert.equal(await page.locator('[data-filter=search]').inputValue(),'中文問題');assert.equal(await page.locator('[data-pick]:checked').count(),0);assert.equal(await page.locator('[data-preference-injection]').count(),0);assert.equal(await page.locator('[data-filter=from]').inputValue(),'');assert.notEqual(await page.locator('.wf-detail h3').textContent(),'missing-case');
  await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('employee');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('[data-filter=search]');assert.equal(await page.locator('[data-filter=search]').inputValue(),'staff-only-filter');assert.equal(await page.locator('[data-pick]').count(),0);
 });
 await check('marking readiness, text focus and attachment/delivery guidance remain truthful in both languages',async({page})=>{
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();
  await page.locator('#wf-panel textarea').fill('原文保留 Nội dung nguyên bản');
  await page.locator('#wf-panel input[type=file]').setInputFiles({name:'中文_ảnh.png',mimeType:'image/png',buffer:pngFixture({width:24,height:24})});await page.waitForSelector('#wf-panel .wf-thumb');
  await page.locator('[data-select]').click();await page.locator('#wf-marking-shield[data-ready=true]').waitFor();await page.mouse.click(700,320);await page.locator('#wf-marking-shield').waitFor({state:'detached'});
  assert(await page.locator('#wf-panel textarea').evaluate(el=>document.activeElement===el));assert.equal(await page.locator('#wf-panel textarea').inputValue(),'原文保留 Nội dung nguyên bản');
  for(const lang of ['zh','vi']){if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('.top-language-switch').click();const text=await page.locator('[data-report-progress]').textContent();assert.match(text,lang==='zh'?/已標記位置.*附件 1 張.*尚未送出/:/Đã chọn vị trí.*1 ảnh.*chưa được gửi/);}
  await page.route('**/api/web-feedback?action=submit',r=>r.abort(),{times:1});await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('[data-submit]')?.textContent.match(/重試|Thử/));assert.match(await page.locator('[data-report-progress]').textContent(),/尚未確認成功|Chưa xác nhận thành công/);
  await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));
 });
 assert.deepEqual(await fixture.businessState(),original);
}finally{await browser?.close();await fixture.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/results.json',JSON.stringify({results,status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS'},null,2));}
