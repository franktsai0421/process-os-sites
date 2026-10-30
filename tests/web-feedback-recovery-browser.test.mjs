// Recovery under concurrent edits, invalid selections and lost responses.
// Compiled app, normal logins, isolated synthetic D1/R2 only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const fixture=await createFeedbackFixture(),out='.sites-runtime/feedback-recovery';
const results=[];let browser;
try{
 const bundled=chromium.executablePath();browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'})});
 const originalState=await fixture.businessState();
 async function login(actor='frank'){
  const context=await browser.newContext({viewport:{width:1365,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(5000);
  await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill(actor);await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');return{context,page};
 }
 const call=(context,action,data)=>data?context.request.post(fixture.origin+'/api/web-feedback?action='+action,{data,headers:{Origin:fixture.origin}}):context.request.get(fixture.origin+'/api/web-feedback?action='+action);
 async function check(name,run){const session=await login();try{await run(session);results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:String(error.message).slice(0,1200)});console.log('FAIL '+name);process.exitCode=1;}finally{await session.context.close();}}
 await check('over-20 selection is refused locally without locking selection or navigation',async({page})=>{
  let exports=0;page.on('request',r=>{if(r.url().includes('action=export'))exports++;});
  for(let i=0;i<21;i++)await page.locator('[data-pick]').nth(i).check();
  await page.locator('[data-export]').click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]')?.textContent.match(/20/));
  assert.equal(exports,0);assert(await page.locator('[data-pick]').nth(20).isEnabled());
  await page.locator('[data-pick]').nth(20).uncheck();await page.locator('[data-export]').click();await page.locator('.wf-admin [role=status] a').waitFor();assert.equal(exports,1);
  await page.locator('[data-board-tab=history]').click();assert(await page.locator('[data-board-tab=history]').getAttribute('aria-selected')==='true');
 });
 await check('concurrent note version conflict recovers latest state without losing input or overwriting status',async({page,context})=>{
  await page.locator('[data-filter=status]').selectOption('open');
  const id=await page.locator('.wf-detail h3').textContent(),issue=(await (await call(context,'list')).json()).issues.find(i=>i.id===id);
  const other=await login('other-admin');try{assert.equal((await call(other.context,'update',{id,version:issue.version,status:'done',note:'Concurrent admin 私人備註'})).status(),200);}finally{await other.context.close();}
  const note='保留我的備註 Giữ ghi chú';await page.locator('[data-note]').fill(note);await page.locator('[data-update]').first().click();
  await page.locator('[data-reload-note]').waitFor();assert.equal(await page.locator('[data-note]').inputValue(),note);
  await page.locator('[data-board-tab=history]').click();assert(await page.locator('[data-reload-note]').isVisible());assert.equal(await page.locator('[data-board-tab=list]').getAttribute('aria-selected'),'true');
  await page.route('**/api/web-feedback?action=list',r=>r.abort(),{times:1});await page.locator('[data-reload-note]').click();await page.waitForFunction(()=>!document.querySelector('[data-reload-note]')?.disabled);assert.equal(await page.locator('[data-note]').inputValue(),note);
  await page.locator('[data-reload-note]').click();await page.waitForFunction(()=>!document.querySelector('[data-reload-note]'));
  assert.equal(await page.locator('.wf-detail h3').textContent(),id);assert.equal(await page.locator('[data-note]').inputValue(),note);assert.equal(await page.locator('[data-update]').first().getAttribute('data-update'),'done');
  await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');
  const latest=(await (await call(context,'list')).json()).issues.find(i=>i.id===id);assert.equal(latest.status,'done');assert.equal(latest.notes.filter(n=>n.text===note).length,1);
 });
 await check('slow note save protects pending input and unlocks controls after acknowledgement',async({page,context})=>{
  let release,started=false;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/web-feedback?action=update',async r=>{started=true;await gate;await r.continue();});
  const id=await page.locator('.wf-detail h3').textContent(),note='Pending 保存中';await page.locator('[data-note]').fill(note);await page.locator('[data-update]').first().click();
  try{
   assert(started);const protectedInput=await page.locator('[data-note]').evaluate(el=>el.readOnly||el.disabled);
   if(!protectedInput)await page.locator('[data-note]').fill(note+' + 後續輸入');
   release();await page.waitForFunction(()=>!document.querySelector('[data-update]')?.disabled);
   if(!protectedInput)assert((await page.locator('[data-note]').inputValue()).includes('後續輸入'),'new input was erased by an earlier successful save');
   assert.equal(await page.locator('[data-note]').evaluate(el=>el.readOnly||el.disabled),false);
   const latest=(await (await call(context,'list')).json()).issues.find(i=>i.id===id);assert(latest.notes.some(n=>n.text===note));
  }finally{release();}
 });
 await check('lost export acknowledgement retries same batch once and unlocks handoff controls',async({page,context})=>{
  const before=(await (await call(context,'handoffs')).json()).handoffs.length,bodies=[];let lost=false;
  await page.route('**/api/web-feedback?action=export',async r=>{bodies.push(r.request().postData());if(!lost){lost=true;const response=await r.fetch();assert.equal(response.status(),201);return r.abort();}return r.continue();});
  await page.locator('[data-pick]').first().check();await page.locator('[data-export]').click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]')?.textContent.match(/尚未確認|Chưa xác nhận/));
  assert.equal(await page.locator('[data-pick]').first().isEnabled(),false);
  await page.locator('[data-export]').click();await page.locator('.wf-admin [role=status] a').waitFor();assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert(await page.locator('[data-pick]').first().isEnabled());
  assert.equal((await (await call(context,'handoffs')).json()).handoffs.length,before+1);
  await page.locator('[data-board-tab=history]').click();await page.locator('.wf-history').first().waitFor();
 });
 await check('failed handoff history offers retry and list navigation remains usable',async({page})=>{
  await page.route('**/api/web-feedback?action=handoffs',r=>r.abort(),{times:1});await page.locator('[data-board-tab=history]').click();
  await page.locator('.wf-board-body button').click();await page.locator('.wf-history').first().waitFor();
  await page.locator('[data-board-tab=list]').click();await page.waitForSelector('.wf-row');
 });
 await check('attachment viewer loads and Escape restores focus; empty search and filters recover',async({page,context})=>{
  const issue=(await (await call(context,'list')).json()).issues.find(i=>i.attachments.length);
  await page.locator(`[data-issue="${issue.id}"]`).click();await page.locator('.wf-detail [data-show-image]').first().click();
  await page.waitForFunction(()=>{const image=document.querySelector('#wf-viewer img');return image?.complete&&image.naturalWidth>0;});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#wf-viewer').count(),0);assert(await page.locator('.wf-detail [data-show-image]').first().evaluate(el=>el===document.activeElement));
  await page.locator('[data-filter=search]').fill('no-such-synthetic-case-123');assert.equal(await page.locator('.wf-row').count(),0);
  await page.locator('[data-filter=search]').fill('');assert.equal(await page.locator('.wf-row').count(),60);
  await page.locator('[data-filter=status]').selectOption('done');assert(await page.locator('.wf-row').count()>0);
  await page.locator('[data-filter=status]').selectOption('');assert.equal(await page.locator('.wf-row').count(),60);
 });
 assert.deepEqual(await fixture.businessState(),originalState);
}finally{await browser?.close();await fixture.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/results.json',JSON.stringify({results,status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS'},null,2));}
