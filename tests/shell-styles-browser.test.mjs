import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
const folder=process.env.STYLES_OUTPUT||'.sites-runtime/perf-500ms';
const snapshot=process.env.PERF_BASELINE_ASSETS;
fs.mkdirSync(folder,{recursive:true});
const html={baseline:fs.readFileSync(snapshot?snapshot+'/index.html':folder+'/index-before.html','utf8'),candidate:fs.readFileSync('dist/client/process/index.html','utf8')};
const bootstrap={baseline:fs.readFileSync(snapshot?snapshot+'/bootstrap.js':folder+'/bootstrap-before.js','utf8'),candidate:fs.readFileSync('dist/client/process/bootstrap.js','utf8')};
const targets=['view=dashboard','view=editor','view=data&dataTab=quality-fqc','view=data&dataTab=users'];
const report={realData:false,physicalPhone:false,cases:[],errors:[]};
let fixture,browser;
try{
 fixture=await createPhotoEntryFixture();browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [lang,width] of [['zh',1365],['vi',390]]){
  const layouts=new Map();
  for(const variant of ['baseline','candidate']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),lang);
   await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==fixture.url.origin)return r.abort();if(snapshot&&u.pathname.startsWith('/process/')){const relative=u.pathname.slice('/process/'.length);if(relative&&!relative.includes('..')&&/\.(?:js|mjs|css|html)$/.test(relative)){const file=(variant==='baseline'?snapshot:'dist/client/process')+'/'+relative;if(fs.existsSync(file))return r.fulfill({status:200,contentType:relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':'text/javascript',body:fs.readFileSync(file)});}}if(u.pathname==='/process/bootstrap.js')return r.fulfill({contentType:'text/javascript',body:bootstrap[variant]});if(u.pathname==='/process/index.html')return r.fulfill({contentType:'text/html',body:html[variant]});return r.continue();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(fixture.url.origin+'/login');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForURL('**/process/**');
   for(const target of targets){
    await page.goto(fixture.url.origin+'/process/index.html?'+target);
    await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&!document.querySelector('#process-boot'));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const layout=await page.locator('#view-root').evaluate(root=>[root,...root.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).slice(0,150).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,style:['display','position','fontFamily','fontSize','color','backgroundColor','padding','margin','overflow','gridTemplateColumns'].map(k=>s[k]),bounds:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10)};}));
    assert(layout.length>1);
    if(variant==='baseline')layouts.set(target,layout);else assert.deepEqual(layout,layouts.get(target),target+' '+lang+' '+width+' cascade/layout');
    const screenshot=folder+'/styles-'+variant+'-'+lang+'-'+target.replace(/[^a-zA-Z0-9-]/g,'_')+'.png';await page.screenshot({path:screenshot});
    report.cases.push({variant,lang,width,target,visibleElements:layout.length,status:'PASS',screenshot});
   }
   await context.close();
  }
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.writeFileSync(folder+'/styles-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error?.slice(0,300)}));}
