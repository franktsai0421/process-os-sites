// Actual compiled Worker + Chromium; synthetic accounts and nonpersistent D1/R2 only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';

const passed=[],errors=[],requests=[];let fixture,browser;
const out='.sites-runtime/feedback-queues';fs.mkdirSync(out,{recursive:true});
async function check(name,run){await run();passed.push(name);console.log('PASS '+name);}
try {
  fixture=await createFeedbackFixture();const original=await fixture.businessState();
  browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:{}),args:['--disable-background-networking']});
  async function login(id,viewport={width:1365,height:900}) {
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
    await context.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/api/'))requests.push({path:url.pathname,action:url.searchParams.get('action'),method:r.method()});});
    await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill(id);await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.locator('.wf-row').first().waitFor();await page.evaluate(()=>{document.documentElement.lang='zh';window.WebFeedback.routeChanged();});return {context,page};
  }
  const owner=await login('frank'),{page}=owner;
  const call=(context,action,data)=>data===undefined?context.request.get(fixture.origin+'/api/web-feedback?action='+action):context.request.post(fixture.origin+'/api/web-feedback?action='+action,{data,headers:{Origin:fixture.origin}});
  const guards={'shared-draft-unknown-synthetic':'{"operationId":"unchanged-original","unknown":true}', 'shared-draft-receipt-only-v1:synthetic':'receipt-only-v1','synthetic-operation-identity':'retain-original-generation'};
  await page.evaluate(values=>{for(const [key,value]of Object.entries(values))sessionStorage.setItem(key,value);},guards);
  const assertGuards=async()=>assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,sessionStorage.getItem(k)])),Object.keys(guards)),guards);
  await check('two source tabs, pending default, honest scope and separate disabled access controls',async()=>{
    assert.equal(await page.locator('[data-queue-tab]').count(),2);assert.equal(await page.locator('[data-filter=status]').inputValue(),'open');await page.locator('.wf-admin').screenshot({path:out+'/helper-1365-zh.png'});
    assert.match(await page.locator('.wf-source').textContent(),/不含各裝置/);await page.locator('[data-pick]').first().check();
    await page.locator('[data-queue-tab=access]').click();await page.getByText(/集中事件來源尚未接通/).waitFor();
    assert.equal(await page.locator('[data-issue],[data-pick],[data-note]').count(),0);assert.equal(await page.locator('.wf-access-controls button:disabled').count(),5);
    await page.locator('.wf-admin').screenshot({path:out+'/access-1365-zh.png'});assert.equal(await page.locator('[data-counts]').count(),0);assert.match(await page.locator('.wf-muted').textContent(),/尚無證據/);
    await page.locator('[data-queue-tab=helper]').click();assert.equal(await page.locator('[data-pick]:checked').count(),1);await assertGuards();
  });
  await check('note ownership, unsaved switch guard, HTML escaping, one double-click write, completion and restore',async()=>{
    const id=await page.locator('.wf-detail h3').textContent(),note='<img src=x onerror=alert(1)> 專屬備註';
    await page.locator('[data-note]').fill(note);await page.locator('[data-queue-tab=access]').click();assert.equal(await page.locator('[data-queue-tab=helper]').getAttribute('aria-selected'),'true');
    const before=requests.filter(r=>r.action==='update').length;await page.locator('[data-update]').first().evaluate(b=>{b.click();b.click();});await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');
    assert.equal(requests.filter(r=>r.action==='update').length,before+1);assert.equal(await page.locator('.wf-note-history img').count(),0);const rows=(await (await call(owner.context,'list')).json()).issues;assert(rows.filter(row=>row.id!==id).every(row=>!row.notes.some(entry=>entry.text===note)));
    await page.locator('[data-update=done]').click();await page.locator(`[data-issue="${id}"]`).waitFor({state:'detached'});
    await page.locator('[data-board-tab=completed]').click();await page.reload();await page.locator(`[data-issue="${id}"]`).click();assert.equal(await page.locator('[data-board-tab=completed]').getAttribute('aria-selected'),'true');assert.match(await page.locator('.wf-note-history').textContent(),/專屬備註/);
    await page.locator('[data-update=open]').click();await page.locator(`[data-issue="${id}"]`).waitFor({state:'detached'});
    await page.locator('[data-board-tab=list]').click();await page.locator(`[data-issue="${id}"]`).click();
    await page.reload();await page.locator(`[data-issue="${id}"]`).click();assert.match(await page.locator('.wf-note-history').textContent(),/專屬備註/);await assertGuards();
  });
  await check('export remains a review choice and makes no export/download request',async()=>{
    const before=requests.length;await page.locator('[data-export]').click();await page.getByText(/匯出格式尚待確認/).waitFor();
    assert(!requests.slice(before).some(r=>['export','download'].includes(r.action)));assert.equal(await page.locator('.wf-admin [download]').count(),0);
  });
  await check('offline, partial source, repeated click and late response do not claim synchronization',async()=>{
    await page.route('**/api/web-feedback?action=access-queue',r=>r.abort(),{times:1});await page.locator('[data-queue-tab=access]').click();await page.getByText(/離線或來源讀取失敗/).waitFor();
    await page.route('**/api/web-feedback?action=access-queue',r=>r.fulfill({json:{available:true,coverage:'partial',events:[{note:'must-not-render'}]}}),{times:1});await page.getByRole('button',{name:'重新核驗來源'}).click();await page.getByText(/離線或來源讀取失敗/).waitFor();assert.equal(await page.getByText('must-not-render').count(),0);
    let release;const gate=new Promise(r=>{release=r;});await page.route('**/api/web-feedback?action=access-queue',async r=>{await gate;await r.continue();},{times:1});
    await page.getByRole('button',{name:'重新核驗來源'}).evaluate(b=>{b.click();b.click();});await page.locator('[data-queue-tab=helper]').click();release();await page.locator('.wf-row').first().waitFor();assert.equal(await page.locator('.wf-access-controls').count(),0);await assertGuards();
  });
  await check('server rejects staff management, private notes, forged delete and unauthenticated source reads',async()=>{
    const issue=(await (await call(owner.context,'list')).json()).issues[0];
    for(const id of ['employee','other-admin']) {
      const actor=await login(id);assert.equal((await call(actor.context,'delete',{id:issue.id,version:issue.version,primary:true,role:'admin'})).status(),403);
      if(id==='employee') {
        assert.equal((await call(actor.context,'access-queue')).status(),403);assert.equal((await call(actor.context,'update',{id:issue.id,version:issue.version,status:'done',note:'forged'})).status(),403);
        const list=await (await call(actor.context,'list')).json();assert(!JSON.stringify(list).includes('專屬備註'));assert(!Object.hasOwn(list.issues[0],'notes'));assert.equal((await call(actor.context,'handoffs')).status(),403);
      }
      await actor.context.close();
    }
    const anonymous=await browser.newContext();assert.equal((await call(anonymous,'access-queue')).status(),401);await anonymous.close();
  });
  await check('empty result, 201 synthetic rows, bounded pagination, keyboard source tabs and narrow Vietnamese layout',async()=>{
    const response=await call(owner.context,'list'),data=await response.json();const many=Array.from({length:201},(_,n)=>({...data.issues[0],id:'FB-synthetic-'+n,description:'合成問題 '+n,notes:[],attachments:[]}));
    await page.route('**/api/web-feedback?action=list',r=>r.fulfill({json:{...data,issues:many}}));await page.reload();await page.locator('.wf-row').first().waitFor();assert.equal(await page.locator('.wf-row').count(),100);
    await page.locator('[data-list-page="1"]').click();assert.equal(await page.locator('.wf-row').count(),100);await page.locator('[data-list-page="1"]').click();assert.equal(await page.locator('.wf-row').count(),1);
    await page.locator('[data-filter=search]').fill('no-synthetic-match');assert.equal(await page.locator('.wf-row').count(),0);await page.locator('[data-filter=search]').fill('');assert.equal(await page.locator('.wf-row').count(),100);
    await page.locator('[data-queue-tab=helper]').focus();await page.keyboard.press('ArrowRight');await page.getByText(/集中事件來源尚未接通/).waitFor();await page.keyboard.press('ArrowLeft');await page.locator('.wf-row').first().waitFor();
    await page.setViewportSize({width:390,height:844});await page.locator('.top-actions .language-switch').click();
    assert.match(await page.locator('[data-queue-tab=access]').textContent(),/chờ xác minh/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.wf-admin').screenshot({path:out+'/helper-390-vi.png'});await page.locator('[data-queue-tab=access]').click();await page.getByText(/Nguồn tập trung chưa kết nối/).waitFor();await page.locator('.wf-admin').screenshot({path:out+'/access-390-vi.png'});
    await page.unroute('**/api/web-feedback?action=list');await assertGuards();
  });
  await check('helper Close/Cancel and browser Back/Forward/reload preserve raw operation guard bytes',async()=>{
    await page.setViewportSize({width:1365,height:900});await page.locator('[data-queue-tab=helper]').click();await page.locator('#wf-launcher').click();await page.locator('[data-close]').click();
    await page.locator('#wf-launcher').click();await page.locator('[data-select]').click();await page.keyboard.press('Escape');await page.locator('[data-close]').click();
    await page.evaluate(()=>history.pushState(history.state,'',location.href+'&synthetic=1'));await page.goBack();await page.goForward();await page.reload();await page.locator('.wf-row').first().waitFor();await assertGuards();
  });
  await check('no workflow mutation or business-state write, no browser script errors',async()=>{
    assert(!requests.some(r=>r.method==='POST'&&r.path!=='/api/web-feedback'&&r.path!=='/api/platform-login'));
    assert.deepEqual(await fixture.businessState(),original);assert.deepEqual(errors,[]);
  });
  fs.writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',programCommit:fixture.programCommit,buildEntrySha256:fixture.buildEntrySha256,browser:browser.version(),passed,notRun:['connected central event data/authorization/history (requires model decision)','native IME','physical device','cross-machine','hosted/live data']},null,2));
} finally {await browser?.close();await fixture?.close();}
