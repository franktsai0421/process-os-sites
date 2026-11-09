// Actual account controller and native FormData/dialogs; intercepted synthetic API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import * as policy from '../public/process/access-policy.mjs';
const source=fs.readFileSync('public/process/user-access.js','utf8');
const policySource=fs.readFileSync('public/process/access-policy.mjs','utf8').replace(/^export /gm,'');
const all=Object.fromEntries(policy.accessKeys.map(k=>[k,true]));
const actor={id:'frank',name:'Synthetic primary',role:'admin',enabled:true,primary:true,cells:all,roleCells:all};
const target={id:'synthetic.missing',name:'Synthetic employee',role:'staff',enabled:true,credentialState:'missing',authEpoch:1,cells:{},roleCells:{},editable:{},actions:{view:true,password:true}};
const initial={revision:1,actor,users:[{...actor,actions:{}},target],roles:[{id:'admin',name:'ADMIN'},{id:'staff',name:'STAFF'}],canCreate:false,canRoles:true};
const origin='http://127.0.0.1:31967';
const browser=await chromium.launch({executablePath:process.env.ACCOUNT_TEST_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const language of ['zh','vi'])for(const viewport of [{width:1440,height:900},{width:390,height:844}])for(const unknown of ['network','500','503']){
  await test(`${language} ${viewport.width} ${unknown}: native password form, prewrite failure correction, duplicate guard and uncertain-write fence`,async()=>{
   const context=await browser.newContext({viewport});let model=structuredClone(initial),posts=0,hold=null,mode='outage';const errors=[];
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));
   await page.route('**/*',async route=>{
    const request=route.request();
    if(request.url()===origin+'/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="account-menu"></div><main id="data-content" data-active-tab="users"></main><p id="toast"></p>'});
    assert.equal(request.url(),origin+'/api/user-access','unexpected browser network denied');
    if(request.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
    posts++;const body=request.postDataJSON();assert.equal(body.action,'password');assert.equal(body.id,target.id);assert.equal(body.baseRevision,model.revision);assert.equal(body.password,'Synthetic-UI-Only-20261106!');assert.equal(body.confirmation,body.password);assert(!('oldPassword' in body));
    if(mode==='outage'){await new Promise(resolve=>hold=resolve);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'PASSWORD_SERVICE_UNAVAILABLE'})});}
    if(mode==='unknown')return unknown==='network'?route.abort('failed'):route.fulfill({status:Number(unknown),contentType:'application/json',body:JSON.stringify({error:'SERVER_ERROR'})});
    model={...model,revision:model.revision+1,users:model.users.map(u=>u.id===target.id?{...u,credentialState:'scrypt',authEpoch:2}:u),ok:true};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
   });
   try{
    await page.goto(origin+'/fixture');
    await page.addStyleTag({content:fs.readFileSync('public/process/user-access.css','utf8')});
    await page.evaluate(({language,actor,policySource})=>{
     localStorage.setItem('processUILanguage',language);window.currentUser=actor;window.state={view:'data',dataTab:'users'};window.ProcessSync={identity:actor,identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'}),clearIdentity(){this.identity=null;}};
     window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.toast=s=>document.querySelector('#toast').textContent=s;window.renderLogin=()=>{};window.bindDataInner=()=>{};window.bindView=()=>{};
     // Local copy of the actual module, without module loading/network.
     window.eval(policySource+';window.ProcessAccessPolicy={catalog,columns,accessKeys,effectiveCells,roleEditable,invalidDependencies,newDependencyIssues,dependencyIssues};');
    },{language,actor,policySource});
    await page.addScriptTag({content:source});await page.evaluate(()=>window.ProcessUserAccess.readyForDestination());
    const open=async()=>{await page.locator('[data-ua-more="synthetic.missing"]').click();await page.locator('[data-ua-password]').click();await page.waitForFunction(()=>!document.querySelector('dialog:not([open])'));};
    await open();assert.equal(await page.locator('dialog .ua-notice').count(),1);assert.equal(await page.locator('[name="oldPassword"]').count(),0);
    const bounds=await page.locator('dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1);assert(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1);
    await page.locator('[name="password"]').fill('Synthetic-UI-Only-20261106!');await page.locator('[name="confirmation"]').fill('Synthetic-UI-Only-20261106!');
    await page.locator('dialog form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await page.waitForFunction(()=>document.querySelector('dialog')?.dataset.saving==='1');
    while(!hold)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(posts,1);hold();
    await page.waitForFunction(()=>document.querySelector('.ua-error')?.textContent.includes('未儲存')||document.querySelector('.ua-error')?.textContent.includes('chưa lưu'));
    assert.equal(await page.locator('[name="password"]').inputValue(),'Synthetic-UI-Only-20261106!');assert.equal(await page.locator('dialog [type="submit"]').isEnabled(),true);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(posts,1,'no automatic resend after definite prewrite failure');
    mode='success';await page.locator('dialog [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(posts,2);assert.equal(model.revision,2);
    // A transport failure may have committed: retain input and block resubmission.
    await open();mode='unknown';await page.locator('[name="password"]').fill('Synthetic-UI-Only-20261106!');await page.locator('[name="confirmation"]').fill('Synthetic-UI-Only-20261106!');await page.locator('dialog [type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('.ua-error')?.textContent.includes('寫入結果')||document.querySelector('.ua-error')?.textContent.includes('Chưa xác nhận'));
    await page.locator('dialog [type="submit"]').click();assert.equal(posts,3);assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }
}finally{await browser.close();}
