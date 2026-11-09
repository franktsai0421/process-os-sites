// Negative browser regression only: actual controller/i18n/native validation;
// synthetic GET projection, no POST permitted and no credentials or real session.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {accessKeys} from '../public/process/access-policy.mjs';
const ref=process.env.USER_ACCESS_VALIDATION_SOURCE_REF;
const source=ref?execFileSync('git',['show',ref+':public/process/user-access.js'],{encoding:'utf8'}):fs.readFileSync('public/process/user-access.js','utf8');
const policy=fs.readFileSync('public/process/access-policy.mjs','utf8');
const all=Object.fromEntries(accessKeys.map(key=>[key,true])),none=Object.fromEntries(accessKeys.map(key=>[key,false]));
const actor={id:'frank',name:'Synthetic primary',role:'admin',primary:true,enabled:true,cells:all,roleCells:all};
const target={id:'synthetic.validation',name:'Synthetic employee',role:'staff',enabled:true,cells:none,roleCells:none,configuredCells:none,editable:all,actions:{view:true,edit:true,password:true}};
const model={revision:1,actor,users:[{...actor,actions:{}},target],roles:[{id:'admin',name:'ADMIN',access:all},{id:'staff',name:'STAFF',access:none}],canCreate:false,canRoles:true};
const origin='https://validation.synthetic.invalid';
const browser=await chromium.launch({executablePath:process.env.ACCOUNT_TEST_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const language of ['zh','vi'])for(const kind of ['empty-password','short-password','empty-name'])for(const trigger of ['click','Enter']){
  await test(`${language} ${kind} ${trigger}: native invalid stays blocked with visible dialog feedback`,async()=>{
   const context=await browser.newContext({viewport:language==='zh'?{width:1440,height:900}:{width:390,height:844}}),page=await context.newPage();let posts=0;const errors=[];page.on('pageerror',()=>errors.push('pageerror'));page.on('dialog',dialog=>dialog.accept());
   await page.route('**/*',async route=>{
    const request=route.request();assert.equal(new URL(request.url()).origin,origin);
    if(new URL(request.url()).pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="top-actions"><div class="account-wrap" id="account-menu"></div></div><main id="data-content" data-active-tab="users"></main><p id="toast"></p>'});
    assert.equal(new URL(request.url()).pathname,'/api/user-access');
    if(request.method()==='POST'){posts++;return route.abort('blockedbyclient');}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
   });
   try{
    await page.goto(origin+'/fixture');await page.addStyleTag({content:fs.readFileSync('public/process/user-access.css','utf8')});
    await page.evaluate(async({actor,language,policy})=>{
     localStorage.setItem('processUILanguage',language);window.currentUser=actor;window.state={view:'data',dataTab:'users'};window.ProcessSync={identity:actor,identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'}),clearIdentity(){this.identity=null;}};
     window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.toast=()=>{};window.renderLogin=()=>{};window.bindDataInner=()=>{};window.bindView=()=>{};
     const url=URL.createObjectURL(new Blob([policy],{type:'text/javascript'}));try{window.ProcessAccessPolicy=await import(url);}finally{URL.revokeObjectURL(url);}
     window.validationEvents={submit:0,invalid:0};document.addEventListener('submit',()=>window.validationEvents.submit++,true);document.addEventListener('invalid',()=>window.validationEvents.invalid++,true);
    },{actor,language,policy});
    await page.addScriptTag({content:fs.readFileSync('public/process/i18n.js','utf8')});await page.addScriptTag({content:source});await page.addScriptTag({content:fs.readFileSync('public/process/navigation-forms.js','utf8')});await page.evaluate(()=>window.ProcessUserAccess.readyForDestination());
    if(kind==='empty-name'){await page.locator('[data-ua-view="synthetic.validation"]').click();await page.locator('dialog [name="name"]').fill('');}
    else{
     await page.locator('[data-ua-more="synthetic.validation"]').click();await page.locator('[data-ua-password]').click();await page.waitForFunction(()=>!document.querySelector('dialog:not([open])'));
     if(kind==='short-password')for(const name of ['password','confirmation'])await page.locator('[name="'+name+'"]').pressSequentially('x'.repeat(7));
    }
    if(trigger==='click')await page.locator('dialog[open] [type="submit"]').click();else await page.locator(kind==='empty-name'?'dialog [name="name"]':'dialog [name="confirmation"]').press('Enter');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const feedback=await page.evaluate(()=>{const form=document.querySelector('dialog[open] form'),field=form.querySelector('input:invalid,select:invalid,textarea:invalid'),error=form.querySelector('.ua-validation')||form.querySelector('.ua-error'),rect=error.getBoundingClientRect();return{nativeInvalid:!!field,nativeMessagePresent:!!field?.validationMessage,feedbackPresent:!!error.textContent.trim(),feedbackVisible:getComputedStyle(error).display!=='none'&&rect.height>0&&rect.top>=0&&rect.bottom<=innerHeight,focusedInvalid:document.activeElement===field,noValidate:form.noValidate,submit:window.validationEvents.submit,invalid:window.validationEvents.invalid};});
    assert.equal(feedback.nativeInvalid,true);assert.equal(feedback.nativeMessagePresent,true);assert.equal(feedback.noValidate,false);assert.equal(feedback.submit,0);assert(feedback.invalid>0);assert.equal(posts,0);
    assert.equal(feedback.feedbackPresent,true,'native validation must leave persistent inline feedback');assert.equal(feedback.feedbackVisible,true);assert.equal(feedback.focusedInvalid,true);assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }
}finally{await browser.close();}
