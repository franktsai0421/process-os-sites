// Compiled application + Chromium, isolated D1/R2 and generated credentials only.
// Do not record bodies, console messages, cookies, passwords or verifier material.
import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {chromium} from 'playwright';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';import {workerSource} from './helpers/native-worker-source.mjs';
let f,browser,stage='setup';const contexts=new Set(),report={status:'RUNNING',cases:[],physicalDevice:false,ime:false,live:false,realAccounts:false};
const out='.sites-runtime/password-browser';fs.mkdirSync(out,{recursive:true});
try{
 stage='native-fixture';f=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID(),DEMO_LOGIN_ENABLED:'false'}});
 stage='record-encoder';const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE'),records=await workerSource({STATE_ARCHIVE:bucket}).load('lib/state-records.ts');
 stage='chromium-launch';browser=await chromium.launch({...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),headless:true,args:['--disable-background-networking']});const origin=f.url.origin;
 const checkLogin=async(id,password,expected)=>{const c=await browser.newContext();try{const r=await c.request.post(origin+'/api/platform-login',{headers:{Origin:origin},data:{id,password}});assert.equal(r.status(),expected);}finally{await c.close();}};
 for(const language of ['zh','vi'])for(const width of [1280,390]){
  stage=language+'-'+width+'-setup';const first=randomUUID(),next=randomUUID(),ownNext=randomUUID(),unknownNext=randomUUID();
  const values={platformUsers:JSON.stringify([{id:'frank',role:'admin',password:first},{id:'manager',role:'admin',password:first},{id:'missing',role:'staff'},{id:'unknown',role:'staff'}].map(u=>({name:'Synthetic '+u.id,enabled:true,inheritRole:true,authEpoch:1,...u}))),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{"schemaVersion":2,"primaryAdminId":"frank","audit":[]}',masterDataControl:'{"active":{"AB":{"products":[],"lines":[],"categoryGroups":[]},"C":{"products":[],"lines":[],"categoryGroups":[]},"PROCESS":{}},"versions":[]}',backupSettings:'{"enabled":false}',processMasterData:'{}',bomOverrides:'{"replaceAll":true,"data":{}}'};
  const envelope=await records.encodeRecordValues(bucket,values);await f.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(envelope,'synthetic-password').run();
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});contexts.add(context);await context.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.name));let posts=0,mode='normal',releaseSlow,slowSeen;
  const slowReady=new Promise(r=>slowSeen=r),slowGate=new Promise(r=>releaseSlow=r);
  await context.route('**/api/user-access',async route=>{
   if(route.request().method()!=='POST')return route.continue();posts++;const response=await route.fetch();
   if(mode==='slow'){slowSeen();await slowGate;}
   if(mode==='lost')return route.abort('connectionreset');
   return route.fulfill({response});
  });
  stage=language+'-'+width+'-login';await page.goto(origin+'/login?view=data&dataTab=users');await page.locator('#id').fill('manager');await page.locator('#password').fill(first);await page.locator('.site-entry-submit').click();await page.locator('#ua-header-password').waitFor();
  const reset=async id=>{await page.locator('[data-ua-more="'+id+'"]').click();await page.locator('.ua-dialog[open] [data-ua-password]').click();await page.locator('.ua-dialog[open] input[name=password]').waitFor();};
  const fill=async secret=>{await page.locator('.ua-dialog[open] input[name=password]').fill(secret);await page.locator('.ua-dialog[open] input[name=confirmation]').fill(secret);};
  const submit=()=>page.locator('.ua-dialog[open] [type=submit]');
  stage=language+'-'+width+'-reset';await reset('missing');const d=page.locator('.ua-dialog[open]');assert.match(await d.innerText(),language==='zh'?/尚未設定登入密碼/:/chưa có mật khẩu/);assert.equal(await d.locator('input[type=password]').count(),2);await d.screenshot({path:out+'/'+language+'-'+width+'-empty.png'});
  for(const input of await d.locator('input').all()){const r=await input.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1);}
  // Constraint feedback must not send anything.
  await submit().click();assert.equal(posts,0);assert(await d.locator('.ua-validation').isVisible());
  await fill(next);mode=language==='zh'&&width===1280?'slow':'normal';await submit().click();
  if(mode==='slow'){await slowReady;await page.waitForTimeout(16050);assert.equal(posts,1);assert.equal(await submit().isDisabled(),true);assert.equal(await d.locator('.ua-error').textContent(),'');assert(await d.locator('.ua-progress').textContent());releaseSlow();}
  await page.locator('.ua-dialog[open]').waitFor({state:'detached'});assert.equal(posts,1);assert.match(await page.locator('[data-ua-result]').innerText(),language==='zh'?/已儲存並讀回確認/:/đã được lưu và đọc lại/);await checkLogin('missing',next,200);await checkLogin('missing',first,401);
  stage=language+'-'+width+'-own';mode='normal';await page.locator('#ua-header-password').click();assert.equal(await page.locator('.ua-dialog[open] input[type=password]').count(),3);await page.locator('.ua-dialog[open] [name=oldPassword]').fill(randomUUID());await fill(ownNext);await submit().click();await page.waitForFunction(()=>!!document.querySelector('.ua-dialog[open] .ua-error')?.textContent);assert.equal(posts,2);assert.equal(await submit().isDisabled(),false);await page.locator('.ua-dialog[open] [name=oldPassword]').fill(first);await submit().click();await page.locator('.ua-dialog[open]').waitFor({state:'detached'});assert.equal(posts,3);await checkLogin('manager',ownNext,200);await checkLogin('manager',first,401);
  // Fresh page owns a fresh session after own-password epoch change.
  await page.goto(origin+'/login?view=data&dataTab=users');await page.locator('#id').fill('manager');await page.locator('#password').fill(ownNext);await page.locator('.site-entry-submit').click();await page.locator('#ua-header-password').waitFor();
  stage=language+'-'+width+'-lost-ack';await reset('unknown');await fill(unknownNext);mode='lost';await submit().click();await page.waitForFunction(()=>!!document.querySelector('.ua-dialog[open] .ua-error button'));assert.equal(posts,4);assert.equal(await submit().isDisabled(),true);assert.equal(await page.locator('[data-ua-result]').count(),0);mode='normal';await page.locator('.ua-dialog[open] .ua-error button').click();assert.equal(posts,4);assert.equal(await submit().isDisabled(),true);await checkLogin('unknown',unknownNext,200);
  assert.deepEqual(errors,[]);report.cases.push({language,width,storage:'records',resetAndNewLogin:true,ownChangeAndNewLogin:true,wrongOldPasswordRefused:true,lostAckUnknown:true,readOnlyRecoveryPosts:0,slowOver15s:language==='zh'&&width===1280,posts});await context.close();contexts.delete(context);
 }
 report.status='PASS_COMPILED_PASSWORD_BROWSER';report.programCommit=f.programCommit;
}catch(error){report.status='FAIL_COMPILED_PASSWORD_BROWSER';report.failure={stage,reason:/Executable doesn't exist/.test(error?.message||'')?'CHROMIUM_MISSING':/NO_OUTBOUND|EGRESS|OUTBOUND/.test(error?.message||'')?'OUTBOUND_REFUSED':/socket\(\).*Operation not permitted/.test(error?.message||'')?'SOCKET_REFUSED':null,name:error?.name==='AssertionError'?'AssertionError':error?.name==='TimeoutError'?'TimeoutError':'Error'};process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser?.close();await f?.close();console.log(JSON.stringify(report));}
