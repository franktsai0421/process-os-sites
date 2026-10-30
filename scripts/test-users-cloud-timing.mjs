// Repeated browser timings on an owned synthetic fixture; never a hosted-performance claim.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const label=process.argv[2]||'baseline', base=process.env.USERS_QA_URL, rows=[], api=[];
const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.port||url.port==='3000')throw Error('OWNED_LOOPBACK_FIXTURE_REQUIRED');
const evidence=process.env.USER_PERMISSIONS_EVIDENCE;if(!evidence||!path.isAbsolute(evidence))throw Error('ABSOLUTE_EVIDENCE_DIRECTORY_REQUIRED');fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
let page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('response',async r=>{try{if(r.url().endsWith('/api/user-access')){const timing=r.request().timing();await r.finished();api.push({method:r.request().method(),status:r.status(),ms:r.request().timing().responseEnd-timing.startTime+timing.startTime});}}catch{}});
page.on('dialog',d=>d.accept());
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function measure(name,fn){const start=performance.now();await fn();await settle();rows.push({name,ms:Math.round((performance.now()-start)*10)/10});}
async function read(){return page.evaluate(async()=>{const r=await fetch('/api/user-access');if(!r.ok)throw Error('read '+r.status);return r.json();});}
async function close(){await page.locator('.ua-dialog [data-ua-close]').first().click();}
async function saved(){await page.locator('.ua-dialog').waitFor({state:'detached'});return read();}
try{
for(let i=0;i<5;i++){const cold=await browser.newContext({viewport:{width:1440,height:1000}}),tab=await cold.newPage();const start=performance.now();await tab.goto(base+'/fixture?actor=frank&lang=zh');await tab.locator('#ua-search').waitFor();await tab.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));rows.push({name:'first-entry',ms:Math.round((performance.now()-start)*10)/10});await cold.close();}
for(let i=0;i<5;i++){
 await measure('reentry',async()=>{await page.goto(base+'/fixture?actor=frank&lang=zh');await page.locator('#ua-rows tr').first().waitFor();});
 await measure('search',async()=>{await page.locator('#ua-search').fill('staff-one');assert.equal(await page.locator('#ua-rows tr').count(),1);});
 await measure('filter-combine-clear',async()=>{await page.locator('#ua-role-filter').selectOption('staff');await page.locator('#ua-status-filter').selectOption('enabled');assert.equal(await page.locator('#ua-rows tr').count(),1);await page.locator('#ua-search').fill('');await page.locator('#ua-role-filter').selectOption('');await page.locator('#ua-status-filter').selectOption('');});
 await measure('open-user',async()=>{await page.locator('[data-ua-view="staff-one"]').click();await page.locator('[data-ua-cell="bom.view"]').waitFor();assert.equal(await page.locator('.ua-dialog [name="id"]').inputValue(),'staff-one');});
 await measure('individual-toggle',async()=>{await page.locator('[data-ua-cell="bom.edit"]').uncheck();});
 await measure('individual-save-readback',async()=>{await page.locator('.ua-dialog[open] [type="submit"]').click();const m=await saved();assert.equal(m.users.find(u=>u.id==='staff-one').cells['bom.edit'],false);});
 await page.locator('[data-ua-view="staff-one"]').click();await page.locator('[data-ua-cell="bom.edit"]').check();await page.locator('.ua-dialog[open] [type="submit"]').click();await saved();
 for(const enabled of [false,true])await measure(enabled?'reenable-readback':'disable-readback',async()=>{await page.locator('[data-ua-more="staff-one"]').click();await page.locator('[data-ua-status]').click();await page.locator('.ua-dialog[open] [type="submit"]').click();const m=await saved();assert.equal(m.users.find(u=>u.id==='staff-one').enabled,enabled);});
 await measure('reset-password-readback',async()=>{await page.locator('[data-ua-more="staff-one"]').click();await page.locator('[data-ua-password]').click();await page.locator('[name="password"]').fill('Synthetic-Only-2026');await page.locator('[name="confirmation"]').fill('Synthetic-Only-2026');await page.locator('.ua-dialog[open] [type="submit"]').click();await saved();});
 await measure('roles-tab',async()=>{await page.locator('[data-ua-page="roles"]').click();await page.locator('.ua-role-preview [data-ua-cell="bom.view"]').waitFor();});
 await measure('role-open',async()=>{await page.locator('[data-ua-edit-role="staff"]').click();await page.locator('.ua-dialog [data-ua-cell="bom.view"]').waitFor();});
 await measure('role-save-readback',async()=>{await page.locator('.ua-dialog [name="description"]').fill('Synthetic benchmark '+i);await page.locator('.ua-dialog[open] [type="submit"]').click();const m=await saved();assert.equal(m.roles.find(r=>r.id==='staff').description,'Synthetic benchmark '+i);});
 await measure('users-tab',async()=>{await page.locator('[data-ua-page="users"]').click();await page.locator('#ua-search').waitFor();});
}
for(let i=0;i<5;i++){
 const id='timing-delete-'+i;
 await page.evaluate(async({id})=>{const m=await(await fetch('/api/user-access')).json();const r=await fetch('/api/user-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:m.revision,action:'create-user',id,name:'Synthetic deletion',role:'staff',password:'Synthetic-Only-2026',confirmation:'Synthetic-Only-2026'})});if(!r.ok)throw Error('create fixture');await window.ProcessUserAccess.refresh();},{id});
 await measure('delete-readback',async()=>{await page.locator('[data-ua-more="'+id+'"]').click();await page.locator('.ua-dialog[open] [data-ua-delete]').click();await page.locator('.ua-dialog[open] [type="submit"]').click();const m=await saved();assert(!m.users.some(u=>u.id===id));});
}
const primaryPage=page;
for(let i=0;i<5;i++){
 const actor=i%2?'rd-one':'staff-one',context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('dialog',d=>d.accept());await page.goto(base+'/fixture?actor='+actor+'&lang=zh');await page.locator('.ua-own').waitFor();
 await measure('own-password-login-readback',async()=>{await page.locator('#ua-header-password').click();if(await page.locator('[name="oldPassword"]').count())await page.locator('[name="oldPassword"]').fill('Synthetic-Only-2026');await page.locator('[name="password"]').fill('Synthetic-next-password-2026');await page.locator('[name="confirmation"]').fill('Synthetic-next-password-2026');await page.locator('.ua-dialog[open] [type="submit"]').click();await page.locator('.ua-dialog[open]').waitFor({state:'detached'});const result=await page.evaluate(async actor=>{const login=async password=>fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:actor,password})});const old=await login('Synthetic-Only-2026'),next=await login('Synthetic-next-password-2026'),m=await(await fetch('/api/user-access')).json();return {old:old.status,next:next.status,id:m.actor?.id};},actor);assert.deepEqual(result,{old:401,next:200,id:actor});});
 await context.close();page=primaryPage;await page.evaluate(async actor=>{const m=await(await fetch('/api/user-access')).json();const r=await fetch('/api/user-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:m.revision,action:'password',id:actor,password:'Synthetic-Only-2026',confirmation:'Synthetic-Only-2026'})});if(!r.ok)throw Error('reset synthetic password');},actor);
}
await page.goto(base+'/fixture?actor=staff-one&lang=zh');await page.locator('.ua-own').waitFor();await page.locator('[data-ua-account-info]').click();await page.locator('.ua-dialog').waitFor();rows.push({name:'own-effective-permissions-visible',pass:await page.locator('.ua-dialog [data-ua-cell]').count()>0});await close();
await page.goto(base+'/fixture?actor=manager&lang=zh');await page.locator('#ua-search').waitFor();await page.locator('#ua-header-password').click();rows.push({name:'admin-old-password-required',pass:await page.locator('[name="oldPassword"]').count()>0});
}finally{await browser.close();}
const summaries=Object.fromEntries([...new Set(rows.filter(r=>'ms'in r).map(r=>r.name))].map(name=>{const values=rows.filter(r=>r.name===name).map(r=>r.ms).sort((a,b)=>a-b);return[name,{n:values.length,median:values[Math.floor(values.length/2)],max:values.at(-1)}];}));
const sourceRoot=process.env.USERS_QA_SOURCE_ROOT||process.cwd(),sourceFiles=['app/api/user-access/route.ts','lib/user-access.ts','public/process/user-access.js','public/process/user-access.css'];
const source={head:execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha256:Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,file))).digest('hex')]))};
const result={label,source,conditions:{runtime:'Node SQLite/R2 memory fixture; real Chromium; loopback, no throttling; 4 formal users; same session warm API; first entry includes fixture synthetic login; not hosted E2E'},summaries,checks:rows.filter(r=>!('ms'in r)),rows,api};fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({label,summaries,checks:result.checks}));
