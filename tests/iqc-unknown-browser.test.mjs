import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
const origin='https://iqc-fixture.invalid',photo='a'.repeat(64),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
for(const [width,lang]of [[390,'zh'],[1280,'vi']])void test(`actual IQC form photo/tool, unknown recovery and visible query ${width}/${lang}`,{timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage();page.setDefaultTimeout(5000);
 let lookup='missing',command=null,queries=0;const posts=[],errors=[];
 const permissions=Object.fromEntries(['view','edit','create','save','submit','withdraw','approve','return','history','delete','restore'].map(k=>[k,true]));
 const snapshot={categories:[{id:'c',nameVi:'Cat'}],suppliers:[],parts:[{id:'p',code:'P',nameVi:'Part',categoryId:'c',supplierIds:[],photos:[]}],errors:[{id:'e',code:'P-IQC-L1',partCode:'P',nameVi:'Error'}],items:[]};
 const full=()=>({revision:lookup==='found'?2:1,permissions,control:{schemaVersion:1,activeVersionId:null,issues:[],reservedErrorCodes:['P-IQC-L1'],reservedCheckNos:[],versions:[{id:'v',number:1,status:'draft',snapshot,history:[]}],workflow:{scope:'iqc',generation:'g',revision:lookup==='found'?2:1,saved:null,pendingId:null,cases:[],working:snapshot,active:{id:null,content:structuredClone(snapshot)}}}});
 try{
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin);
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><body><div id="data-content"><section id="iqc-page"></section></div><div id="toast"></div></body></html>'});
   if(url.pathname==='/synthetic.png')return route.fulfill({contentType:'image/png',body:png});
   if(url.pathname==='/api/iqc/photo')return route.fulfill({json:{id:photo,url:'/synthetic.png'}});
   if(url.pathname==='/api/routine-equipment')return route.fulfill({json:{control:{activeVersionId:'a',versions:[{id:'a',status:'approved',categories:[],subcategories:[],groups:[],equipment:[{id:'new-tool',name:'New synthetic tool',assetCode:'SYN-NEW',pieceMark:'02',enabled:true}]}]}}});
   if(url.pathname==='/api/iqc/workflow'){
    if(request.method()==='POST'){command=JSON.parse(request.postData()).command;posts.push(command);return route.abort('failed');}
    if(url.searchParams.has('operationId')){queries++;return lookup==='missing'?route.fulfill({status:404,json:{error:'OPERATION_NOT_FOUND'}}):route.fulfill({json:{receipt:{operationId:command.operationId,generation:'g',revision:2,savedId:null,caseId:null,unchanged:false}}});}
    return route.fulfill({json:full()});
   }
   throw Error('Unexpected isolated request '+url.pathname);
  });
  await page.goto(origin);await page.evaluate(lang=>{document.documentElement.lang=lang;window.ProcessSync={identity:{id:'actor'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,platformHeaders:()=>({})};window.bindDataInner=()=>{};window.render=()=>{};window.hasPermission=()=>true;window.createForegroundPoll=()=>({stop(){},start(){}});window.VersionDraftUI=undefined;},lang);
  for(const file of ['styles.css','iqc-master.css','version-draft-ui.css'])await page.addStyleTag({content:fs.readFileSync('public/process/'+file,'utf8')});
  for(const file of ['shared-draft-client.js','version-draft-ui.js'])await page.addScriptTag({content:fs.readFileSync('public/process/'+file,'utf8')});
  const source=fs.readFileSync('public/process/iqc-master.js','utf8').replace('})(window);',"host.iqcProbe={async init(){root=document.querySelector('#iqc-page');await load();ui.versionId='v';ui.partCode='P';render();},open:()=>editItem('','e'),client:transport,post,checkOperation};})(window);");await page.addScriptTag({content:source});await page.evaluate(()=>window.iqcProbe.init());
  await page.evaluate(()=>window.iqcProbe.open());await page.locator('#iqc-item-form [name=nameVi]').fill('Unsent input to abandon');await page.evaluate(()=>window.IQCMasterUI.navigation.departure.abandon());assert.equal(await page.locator('#iqc-item-form').count(),0);assert.equal(posts.length,0);
  await page.evaluate(()=>window.iqcProbe.open());await page.locator('#iqc-item-form [name=nameVi]').fill('中文 Kiểm tra');await page.locator('#iqc-item-file').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await page.locator('#iqc-item-photo-list img').waitFor();
  await page.locator('[name=inspectionMode][value=equipment]').check();await page.locator('#iqc-equipment-change').click();await page.locator('[data-iqc-select-equipment="new-tool"]').click();await page.locator('#iqc-item-form [type=submit]').click();
  const button=page.locator('[data-iqc-item-check]');await button.waitFor();assert.equal(posts.length,1);assert.equal(posts[0].input.equipmentId,'new-tool');assert.equal(posts[0].input.mediaItems[0].id,photo);assert(await page.locator('#iqc-item-form [type=submit]').isDisabled());
  await button.click();await page.waitForFunction(()=>document.querySelector('#iqc-item-error').textContent.includes(document.documentElement.lang==='vi'?'Chưa tìm thấy':'尚未找到'));if(process.env.IQC_UI_EVIDENCE_DIR){fs.mkdirSync(process.env.IQC_UI_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.IQC_UI_EVIDENCE_DIR,`iqc-unknown-${width}-${lang}.png`),fullPage:true});}assert.equal(posts.length,1);assert.equal(await page.locator('#iqc-item-form [name=nameVi]').inputValue(),'中文 Kiểm tra');
  // Cancel and open a fresh creation form while the original receipt becomes visible.
  await page.locator('#iqc-item-form [data-close]').first().click();assert(await page.locator('#iqc-operation-check').isVisible());assert.equal(await page.locator('#iqc-operation-check').evaluate(el=>!!el.closest('details')),false);
  lookup='found';await page.evaluate(()=>window.iqcProbe.open());await page.locator('#iqc-item-form [name=nameVi]').fill('Do not duplicate');const before=queries;await page.locator('#iqc-item-form [type=submit]').click();await button.waitFor();assert.equal(queries,before);assert.equal(posts.length,1);
  await button.click();await page.waitForFunction(()=>document.querySelector('#iqc-item-error').textContent.includes(document.documentElement.lang==='vi'?'Đã xác nhận':'已確認原操作'));assert.equal(posts.length,1);assert(await page.locator('#iqc-item-form [type=submit]').isDisabled());assert.equal(await page.locator('#iqc-item-form [name=nameVi]').inputValue(),'Do not duplicate');
  await page.locator('#iqc-item-form').evaluate(form=>form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));assert.equal(posts.length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});
