// Actual account page/controller/i18n, synthetic projection, no writes or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {accessKeys} from '../public/process/access-policy.mjs';
const sourceRef=process.env.USER_ACCESS_ROLE_SOURCE_REF;
const source=sourceRef?execFileSync('git',['show',sourceRef+':public/process/user-access.js'],{encoding:'utf8'}):fs.readFileSync('public/process/user-access.js','utf8');
const policy=fs.readFileSync('public/process/access-policy.mjs','utf8'),all=Object.fromEntries(accessKeys.map(key=>[key,true]));
const actor={id:'frank',name:'Synthetic primary',role:'admin',primary:true,enabled:true,cells:all,roleCells:all};
const model={revision:1,actor,users:[{...actor,actions:{}}],roles:['admin','rd','staff'].map(id=>({id,name:id.toUpperCase(),access:all,assigned:0,formalCount:0})),canCreate:true,canRoles:true};
const origin='https://role-i18n.synthetic.invalid',evidence=process.env.USER_ACCESS_ROLE_I18N_EVIDENCE_ROOT;
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.ACCOUNT_TEST_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const language of ['zh','vi'])for(const size of ['desktop','mobile']){
  await test(`${language} ${size}: role page, preview, details and edit dialog keep complete translations`,async()=>{
   const context=await browser.newContext({viewport:size==='desktop'?{width:1440,height:900}:{width:390,height:844}}),page=await context.newPage();let posts=0;const errors=[];
   page.on('pageerror',()=>errors.push('pageerror'));page.on('dialog',dialog=>dialog.accept());
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);
    if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="top-actions"><div id="account-menu"></div></div><main id="data-content" data-active-tab="users"></main><p id="toast"></p>'});
    assert.equal(url.pathname,'/api/user-access');
    if(request.method()==='POST'){posts++;return route.abort('blockedbyclient');}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(model)});
   });
   const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const text=async selector=>(await page.locator(selector).textContent()).trim();
   const completeLanguage=async selector=>{await settle();const content=await text(selector);if(language==='vi')assert.equal(/[\u3400-\u9fff]/.test(content),false,'generic i18n must not partially rewrite complete Vietnamese strings');else assert(!content.includes('Quyền')&&!content.includes('vai trò')&&!content.includes('Chi tiết'),'Chinese application labels stay Chinese');};
   try{
    await page.goto(origin+'/fixture');for(const name of ['styles.css','user-access.css'])await page.addStyleTag({content:fs.readFileSync('public/process/'+name,'utf8')});
    await page.evaluate(async({actor,language,policy})=>{
     localStorage.setItem('processUILanguage',language);window.currentUser=actor;window.state={view:'data',dataTab:'users'};window.ProcessSync={identity:actor,identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'}),clearIdentity(){this.identity=null;}};
     window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.toast=()=>{};window.renderLogin=()=>{};window.bindDataInner=()=>{};window.bindView=()=>{};
     const url=URL.createObjectURL(new Blob([policy],{type:'text/javascript'}));try{window.ProcessAccessPolicy=await import(url);}finally{URL.revokeObjectURL(url);}
    },{actor,language,policy});
    await page.addScriptTag({content:fs.readFileSync('public/process/i18n.js','utf8')});await page.addScriptTag({content:source});await page.addScriptTag({content:fs.readFileSync('public/process/navigation-forms.js','utf8')});await page.evaluate(()=>window.ProcessUserAccess.readyForDestination());
    // Reproduce the cross-tab-like storage/document language mismatch from the old UI.
    if(language==='vi')await page.evaluate(()=>localStorage.setItem('processUILanguage','zh'));
    await page.locator('[data-ua-page="roles"]').click();await completeLanguage('.ua-page');
    assert.equal(await text('#ua-header-password'),language==='vi'?'Đổi mật khẩu của tôi':'修改我的密碼');
    assert.equal(await text('[data-ua-page="users"]'),language==='vi'?'Thiết lập tài khoản':'使用者設定');
    assert.equal(await text('[data-ua-edit-role]'),language==='vi'?'Sửa vai trò':'編輯角色');
    assert.equal(await text('.ua-role-preview thead th:first-child'),language==='vi'?'Trang / mô-đun':'頁面／模組');
    assert.equal(await text('.ua-role-preview thead th:last-child'),language==='vi'?'Quyền khác':'其他權限');
    assert.equal(await page.locator('.ua-role-preview input[type="checkbox"]:not(:disabled)').count(),0,'preview stays read-only');
    for(const id of ['c','bom','editor','fqc']){
     const details=page.locator(`.ua-role-preview [data-ua-details="${id}"]`);await details.locator('summary').click();assert.equal(await text(`.ua-role-preview [data-ua-details="${id}"] summary span`),language==='vi'?'Chi tiết':'詳細設定');
     assert((await text(`.ua-role-preview [data-ua-details="${id}"]`)).includes(language==='vi'?'Rút hồ sơ':'撤回送審'));
    }
    assert((await text('.ua-role-preview [data-ua-matrix-row="fqc"]')).includes(language==='vi'?'Cần quyền Xem AB và thiết bị':'亦需 AB 與檢具查看權限'));
    const legacy=page.locator('.ua-role-preview [data-ua-matrix-row="lines"] details');await legacy.locator('summary').click();assert.equal(await text('.ua-role-preview [data-ua-matrix-row="lines"] summary'),language==='vi'?'Xem cấu hình cũ được giữ lại':'查看保留的舊設定');await completeLanguage('.ua-role-preview');
    const search=page.locator('[data-ua-role-matrix-search]');await search.fill('fqc');assert.equal(await page.locator('.ua-role-preview [data-ua-matrix-row]').count(),1);await search.fill('');await completeLanguage('.ua-role-preview');
    if(evidence)await page.screenshot({path:path.join(evidence,language+'-'+size+'-role-page.png')});
    await page.locator('[data-ua-edit-role]').click();await completeLanguage('dialog');assert.equal(await page.locator('dialog input[type="password"]').count(),0);
    assert.equal(await text('dialog h3'),language==='vi'?'Quyền vai trò':'角色權限');assert.equal(await text('dialog [type="submit"]'),language==='vi'?'Lưu mẫu vai trò':'保存角色範本');
    assert.equal(await text('dialog footer [data-ua-close]'),language==='vi'?'Hủy':'取消');assert.equal(await text('.ua-change-review strong'),language==='vi'?'Quyền chưa thay đổi':'權限未變更');
    await page.locator('dialog [data-ua-details="editor"] summary').click();await page.locator('dialog [data-ua-cell="editor.withdraw"]').uncheck();assert((await text('.ua-change-review')).includes(language==='vi'?'Chưa lưu':'尚未保存'));await completeLanguage('dialog');
    const dialogSearch=page.locator('dialog [data-ua-role-search]');await dialogSearch.fill('fqc');assert.equal(await page.locator('dialog [data-ua-matrix-row]').count(),1);await dialogSearch.fill('');await completeLanguage('dialog');
    assert.equal(await page.locator('dialog [data-ua-cell="editor.withdraw"]').isChecked(),false,'local draft survives search repaint');
    if(evidence)await page.screenshot({path:path.join(evidence,language+'-'+size+'-role-dialog.png')});
    await page.locator('dialog footer [data-ua-close]').click();await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(posts,0);assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }
}finally{await browser.close();}
