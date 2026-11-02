import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';

// Single existing compiled fixture, no new Site and no live URL accepted.
const f=await createPhotoEntryFixture({diagnostics:true,revocation:true}),origin=f.url.origin;
const report={scope:'isolated synthetic compiled Worker; not real-site latency',checks:[],pairs:[],build:f.programCommit};
let browser;
try{
 const before=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
 const denied=await fetch(origin+'/api/navigation-diagnostics');assert.equal(denied.status,403);assert.equal(denied.headers.get('server-timing'),null);report.checks.push('anonymous UI configuration denied');
 const anonymousTrace=await fetch(origin+'/api/process-bootstrap?view=dashboard',{headers:{'X-Process-Timing':'1'}});assert.equal(anonymousTrace.status,401);assert.equal(anonymousTrace.headers.get('server-timing'),null);report.checks.push('actual anonymous bootstrap opt-in emits no timings');
 const login=await fetch(origin+'/api/platform-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({id:'frank',password:f.password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const config=await fetch(origin+'/api/navigation-diagnostics',{headers:{cookie}});assert.equal((await config.json()).enabled,true);
 browser=await chromium.launch({headless:true,...(process.env.PROCESS_BROWSER_EXECUTABLE?{executablePath:process.env.PROCESS_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();const writes=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(new URL(r.url()).pathname);});
 await page.goto(origin+'/navigation-timing');await page.getByRole('button',{name:'開始 10 分鐘 / Bắt đầu',exact:true}).waitFor();
 await page.getByRole('button',{name:'開始 10 分鐘 / Bắt đầu',exact:true}).click();await page.waitForFunction(()=>!!window.ProcessNavigationTiming&&!!sessionStorage.getItem('process-navigation-timing-v1'));
 await page.getByRole('link',{name:'登入頁 / Đăng nhập',exact:true}).click();await page.locator('#id').fill('frank');await page.locator('#password').fill(f.password);
 await page.getByRole('button',{name:'登入平台 / Đăng nhập',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.documentElement.hasAttribute('data-process-boot'));
 await page.goto(origin+'/process/?view=data&dataTab=quality-fqc');
 await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&window.ProcessSync?.destination?.dataTab==='quality-fqc');
 await page.getByRole('link',{name:'效能診斷 / Chẩn đoán',exact:true}).click();await page.getByRole('button',{name:'更新摘要 / Cập nhật',exact:true}).click();
 const rows=await page.evaluate(()=>window.ProcessNavigationTiming.snapshot());assert(rows.rows.some(r=>r.kind==='response'&&r.route==='login'&&r.requestId));assert(rows.rows.some(r=>r.route==='fqc'&&r.requestId));assert(rows.rows.some(r=>r.kind==='resource'));assert(rows.rows.some(r=>r.spans?.some(s=>s.name==='r2.get')));assert(rows.rows.some(r=>r.totals?.some(s=>s.name==='r2.get')));assert(rows.rows.some(r=>r.kind==='ready'&&r.route==='login'));
 const wire=JSON.stringify(rows);for(const marker of [f.password,'Synthetic Photo QA','fqc-error','platformUsers','set-cookie','/api/','?view='])assert(!wire.includes(marker),marker);
 assert(rows.rows.length<=240);report.checks.push('native UI enables, records credential login / dashboard / FQC, displays redacted summary');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 JSON / Xuất JSON',exact:true}).click();const download=await downloadPromise;const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const exported=JSON.parse(Buffer.concat(chunks).toString());assert(exported.rows.some(r=>r.requestId));report.checks.push('native UI JSON export');await page.setViewportSize({width:390,height:844});assert(await page.getByRole('button',{name:'停止 / Dừng',exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('390px bilingual controls, no page horizontal overflow');await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'停止並清除 / Dừng và xóa',exact:true}).click();assert.equal(await page.evaluate(()=>window.ProcessNavigationTiming.snapshot().rows.length),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('process-navigation-timing-v1-rows')),null);report.checks.push('native Clear removes RAM and storage; snapshot cannot resurrect rows');const requests=[];page.on('request',r=>requests.push({path:new URL(r.url()).pathname,timing:r.headers()['x-process-timing']}));
 await page.goto(origin+'/process/?view=dashboard');await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');assert(!requests.some(r=>r.path==='/process/navigation-diagnostics.js'||r.timing));report.checks.push('stop removes recorder loads and request opt-in');
 assert.deepEqual(writes,['/api/platform-login']);report.checks.push('no business POST from diagnostic UI / recorder');
 // Small bounded AB/BA comparison: same Worker, same snapshot, same endpoint.
 const url=origin+'/api/process-bootstrap?view=dashboard';
 for(let round=0;round<5;round++)for(const enabled of round%2?[true,false]:[false,true]){
  const start=performance.now(),response=await fetch(url,{headers:{cookie,...(enabled?{'X-Process-Timing':'1'}:{})}}),body=await response.text(),ms=performance.now()-start;
  assert.equal(response.status,200);assert.equal(!!response.headers.get('server-timing'),enabled);
  report.pairs.push({round,enabled,ms,bodyBytes:Buffer.byteLength(body),headerBytes:Buffer.byteLength(response.headers.get('server-timing')||'')});
  if(enabled)assert.match(response.headers.get('server-timing'),/db.first/);
 }
 assert.equal(new Set(report.pairs.map(r=>r.bodyBytes)).size,1);
 report.entryPairs=[];
 for(let round=0;round<5;round++)for(const enabled of round%2?[true,false]:[false,true]){
  await page.evaluate(enabled=>{if(enabled)sessionStorage.setItem('process-navigation-timing-v1',JSON.stringify({until:Date.now()+600000}));else sessionStorage.removeItem('process-navigation-timing-v1');},enabled);
  const start=performance.now();await page.goto(origin+'/process/?view=dashboard');await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');
  report.entryPairs.push({round,enabled,ms:performance.now()-start});
 }
 // Independent revocation checks after cost measurements; direct fixture DB only.
 // No business command, account change or persistent credential is introduced.
 for(const label of ['更新摘要 / Cập nhật','匯出 JSON / Xuất JSON']){
  const checkContext=await browser.newContext();await checkContext.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);
  await checkContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const checkPage=await checkContext.newPage();let downloads=0;checkPage.on('download',()=>downloads++);
  await checkPage.goto(origin+'/navigation-timing');await checkPage.getByRole('button',{name:'開始 10 分鐘 / Bắt đầu',exact:true}).click();
  await checkPage.waitForFunction(()=>!!window.ProcessNavigationTiming&&!!sessionStorage.getItem('process-navigation-timing-v1'));
  await checkPage.getByRole('button',{name:label,exact:true}).waitFor();
  const digest=createHash('sha256').update(cookie.slice(cookie.indexOf('=')+1)).digest('hex');
  await f.db.prepare('INSERT INTO process_revoked_sessions(token_digest,expires_at,revoked_at) VALUES(?,?,?)').bind(digest,Date.now()+600000,Date.now()).run();
  const deniedResponse=checkPage.waitForResponse(r=>new URL(r.url()).pathname==='/api/navigation-diagnostics'&&r.status()===403);
  await checkPage.getByRole('button',{name:label,exact:true}).click();await deniedResponse;
  await checkPage.getByText('權限已失效、診斷已關閉或無法確認；已停止 / Quyền không còn hợp lệ hoặc đã tắt; đã dừng',{exact:true}).waitFor();
  assert.equal(downloads,0);assert.equal(await checkPage.evaluate(()=>sessionStorage.getItem('process-navigation-timing-v1')),null);assert.equal(await checkPage.getByRole('table').count(),0);
  const deniedSample=await fetch(origin+'/api/process-bootstrap?view=dashboard',{headers:{cookie,'X-Process-Timing':'1'}});assert.equal(deniedSample.status,401);assert.equal(deniedSample.headers.get('server-timing'),null);
  await f.db.prepare('DELETE FROM process_revoked_sessions WHERE token_digest=?').bind(digest).run();await checkContext.close();
  report.checks.push('native revoked admin '+label+' rechecks auth, stops, hides rows and does not download; bootstrap denies');
 }
 const after=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();assert.deepEqual(after,before);report.checks.push('business shared state byte-identical after all reads and logins');
 report.browserRows=rows.rows.length;report.sampleServerHeader=rows.rows.find(r=>r.route==='bootstrap'&&r.requestId);
 for(const enabled of [false,true]){const values=report.pairs.filter(r=>r.enabled===enabled).map(r=>r.ms).sort((a,b)=>a-b);report[enabled?'enabled':'disabled']={n:values.length,median:values[2],max:values.at(-1)};}
 report.result='PASS';
}finally{await browser?.close();await f.close();const out=process.env.PROCESS_DIAG_RESULT||'.sites-runtime/navigation-diagnostics/result.json';fs.mkdirSync(new URL('../.sites-runtime/navigation-diagnostics/',import.meta.url),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
