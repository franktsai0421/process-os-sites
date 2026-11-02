import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
// Existing isolated compiled fixture, no live URL and no benchmark rerun.
const f=await createPhotoEntryFixture({diagnostics:true,revocation:true}),origin=f.url.origin,report={build:f.programCommit,checks:[],scope:'compiled Chromium diagnostic controls only; synthetic data'};let browser;
try{
 const before=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
 const login=await fetch(origin+'/api/platform-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({id:'frank',password:f.password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 browser=await chromium.launch({headless:true,...(process.env.PROCESS_BROWSER_EXECUTABLE?{executablePath:process.env.PROCESS_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext();await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();let downloads=0,navigations=0;const writes=[];page.on('download',()=>downloads++);page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method());});
 const labels={start:'開始 10 分鐘 / Bắt đầu',refresh:'更新摘要 / Cập nhật',export:'匯出 JSON / Xuất JSON',stop:'停止 / Dừng',clear:'停止並清除 / Dừng và xóa'};
 for(const operation of ['start','refresh','export'])for(const control of ['stop','clear']){
  await page.goto(origin+'/navigation-timing');await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:labels.start,exact:true}).click()]);await page.waitForFunction(()=>!!sessionStorage.getItem('process-navigation-timing-v1'));await page.getByRole('button',{name:labels.start,exact:true}).waitFor();
  let reached,failed,release,done;const captured=new Promise((resolve,reject)=>{reached=resolve;failed=reject;}),held=new Promise(resolve=>{release=resolve;}),finished=new Promise(resolve=>{done=resolve;});
  const handler=async route=>{try{const response=await route.fetch();assert.equal(response.status(),200);reached();await held;await route.fulfill({response}).catch(()=>{});}catch(error){failed(error);}finally{done();}};
  await page.route('**/api/navigation-diagnostics',handler);const priorNavigations=navigations;
  await page.getByRole('button',{name:labels[operation],exact:true}).click();await captured;
  assert(await page.getByRole('button',{name:labels.stop,exact:true}).isEnabled());assert(await page.getByRole('button',{name:labels.clear,exact:true}).isEnabled());
  await page.getByRole('button',{name:labels[control],exact:true}).click();assert.equal(await page.evaluate(()=>sessionStorage.getItem('process-navigation-timing-v1')),null);
  if(control==='clear')assert.equal(await page.evaluate(()=>window.ProcessNavigationTiming.snapshot().rows.length),0);
  release();await finished;await page.unroute('**/api/navigation-diagnostics',handler);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(downloads,0);assert.equal(navigations,priorNavigations);assert(await page.getByRole('button',{name:labels.refresh,exact:true}).isEnabled());report.checks.push(operation+' pending → '+control+' immediate; late response cannot reload/export');
 }
 assert.deepEqual(writes,[]);assert.deepEqual(await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first(),before);report.checks.push('no browser POST and business shared state unchanged');report.status='PASS';
}finally{await browser?.close();await f.close();fs.writeFileSync(process.env.PROCESS_TIMING_CONTROLS_RESULT||'.sites-runtime/navigation-diagnostics/control-race-native.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
