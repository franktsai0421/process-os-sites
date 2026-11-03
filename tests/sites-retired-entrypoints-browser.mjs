// Removal acceptance only: isolated compiled Worker, synthetic data, no live URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';

const report={scope:'isolated removal and business navigation acceptance; no speed sampling',checks:[]};
const retired=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_NAVIGATION_TIMING:'1',PROCESS_NAVIGATION_TIMING_UNTIL:new Date(Date.now()+3600000).toISOString()}});
try{
 for(const path of ['/navigation-timing','/api/navigation-diagnostics','/process/navigation-diagnostics.js']){
  const r=await fetch(new URL(path,retired.url),{headers:{'X-Process-Timing':'1'}});
  assert.equal(r.status,404,path);assert.equal(r.headers.get('server-timing'),null);await r.arrayBuffer();
 }
 report.checks.push('retired UI/API return 404 even with obsolete enabled flags and opt-in header');
}finally{await retired.close();}

const f=await createPhotoEntryFixture(),origin=f.url.origin;let browser;
try{
 const before=await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
 browser=await chromium.launch({headless:true,...(process.env.PROCESS_BROWSER_EXECUTABLE?{executablePath:process.env.PROCESS_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>sessionStorage.setItem('process-navigation-timing-v1',JSON.stringify({until:Date.now()+600000})));
 const page=await context.newPage(),posts=[],optIns=[],errors=[];
 page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);if(r.headers()['x-process-timing'])optIns.push(new URL(r.url()).pathname);});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.locator('#id').fill('frank');await page.locator('#password').fill(f.password);
 await page.getByRole('button',{name:'登入平台 / Đăng nhập',exact:true}).click();
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.documentElement.hasAttribute('data-process-boot'));
 await ready();report.checks.push('normal synthetic credential login reaches ready dashboard');
 for(const tab of ['process-master','quality-fqc']){
  await page.goto(origin+'/process/?view=data&dataTab='+tab);await ready();
  assert.equal(await page.evaluate(()=>window.ProcessSync?.destination?.dataTab),tab);
  assert.equal(await page.evaluate(()=>typeof window.ProcessNavigationTiming),'undefined');
  assert.equal(await page.locator('a[href="/navigation-timing"]').count(),0);
  report.checks.push(tab+' reaches ready without a recorder or diagnostic entry despite stale sessionStorage');
 }
 assert.deepEqual(optIns,[]);assert.deepEqual(posts,['/api/platform-login']);assert.deepEqual(errors,[]);
 assert.deepEqual(await f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first(),before);
 report.checks.push('no timing opt-ins, browser errors or business POST; shared state byte-identical');
 report.result='PASS';
}finally{
 await browser?.close();await f.close();
 fs.mkdirSync('.sites-runtime/retired-entrypoints',{recursive:true});
 fs.writeFileSync('.sites-runtime/retired-entrypoints/result.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
