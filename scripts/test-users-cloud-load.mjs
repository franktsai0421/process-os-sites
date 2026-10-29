// Repeated full-application loading on synthetic, nonpersistent Workers D1/R2.
// Login is completed before timing. No remote bindings or real account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createRootEntryFixture} from '../tests/root-entry-native-fixture.mjs';
const evidence=process.env.USER_PERMISSIONS_EVIDENCE;
assert(evidence&&path.isAbsolute(evidence),'ABSOLUTE_EVIDENCE_DIRECTORY_REQUIRED');
fs.mkdirSync(evidence,{recursive:true});
const label=process.argv[2]||'candidate';assert(/^[a-z0-9-]+$/.test(label));
const f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID()}});
const report={status:'RUNNING',label,scope:'compiled application + Chromium; synthetic 4/200 accounts; loopback, no throttling; five new contexts each, cold HTTP cache then warm reload; login excluded; completion includes current data, navigation ready and two animation frames',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),buildEntrySha256:f.buildEntrySha256,sourceSha256:Object.fromEntries(['app/api/user-access/route.ts','public/process/user-access.js','public/process/user-access-initial-read.js','public/process/index.html'].map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),samples:[],errors:[]};
let browser;
const password='Synthetic-load-only-2026',base=f.url.origin;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const size of [4,200]){
  const users=Array.from({length:size},(_,i)=>({id:i?'load-user-'+i:'frank',name:'合成使用者 Nguyễn '+i,role:i?'staff':'admin',enabled:true,inheritRole:true,...(i?{}:{password})}));
  await f.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify({platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'}),'synthetic-load').run();
  for(let repeat=0;repeat<5;repeat++){
   const context=await browser.newContext({viewport:{width:1440,height:1000}});
   try{
    const login=await context.request.post(base+'/api/platform-login',{headers:{Origin:base},data:{id:'frank',password}});assert.equal(login.status(),200);
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
    async function ready(){await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&window.ProcessDeliveryNavigation?.current()?.dataTab==='users'&&document.querySelector('#ua-search'));assert.equal(await page.locator('#ua-rows tr').count(),size);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
    async function measure(operation,action){const start=performance.now();await action();await ready();const ms=performance.now()-start;report.samples.push({size,repeat,operation,ms,phases:await page.evaluate(()=>({sharedReadyMs:Number(document.documentElement.dataset.processSharedReadyMs),assetsReadyMs:Number(document.documentElement.dataset.processAssetsReadyMs),readyMs:Number(document.documentElement.dataset.processReadyMs)})),requests:await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/')).map(r=>({path:new URL(r.name).pathname,start:r.startTime,ms:r.duration,bytes:r.encodedBodySize})))});}
    await measure('cold-full-page',()=>page.goto(base+'/process/index.html?system=process&view=data&dataTab=users'));
    await measure('warm-full-reload',()=>page.reload());

   }finally{await context.close();}
  }
 }
 assert.deepEqual(report.errors,[]);
 report.summary=[4,200].flatMap(size=>['cold-full-page','warm-full-reload'].map(operation=>{const samples=report.samples.filter(s=>s.size===size&&s.operation===operation).map(s=>s.ms).sort((a,b)=>a-b);return{size,operation,n:samples.length,median:samples[2],max:samples.at(-1)};}));
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}finally{if(browser)await browser.close();await f.close();fs.writeFileSync(path.join(evidence,'load-'+label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,summary:report.summary}));}
