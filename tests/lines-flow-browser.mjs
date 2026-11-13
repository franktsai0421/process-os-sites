// Native Chromium renders the current LINES controller and durable HTTP client.
// Every request is fulfilled by actual routes with isolated SQLite/Map R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),fixture=require('../scripts/test-master-page-runtime.cjs');
const files=['shared-draft-client','version-draft-ui','canvas-approved-history','page-draft-merge','master-admin-ui','master-page-transfer','master-page-approved-history','master-page-editor'];
const styles=['styles','master-data','master-data-extra','master-admin-ui','version-draft-ui'].map(file=>fs.readFileSync('public/process/'+file+'.css','utf8')).join('\n');
const report={checks:[],pageErrors:[],scope:'Native browser module harness, actual production routes, SQLite :memory:/Map R2; no compiled SPA, live Site, real IME or physical device'};
let browser;
try{
 browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 for(const [width,lang]of [[1280,'zh-TW'],[390,'vi']]){
  const f=await fixture(true),context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),calls=[];
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Synthetic review reason'):dialog.accept());
  try{
   await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/process/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><section class="page"><main id="data-content" data-active-tab="line-admin"></main></section><script>window.ProcessSync={identity:{id:'writer'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:()=>true};window.bindDataInner=()=>{};</script>${files.map(file=>`<script src="/process/${file}.js"></script>`).join('')}<script>window.api=ProcessMasterPages.mount(document.querySelector('main'),{page:'LINES'});</script></html>`});
    if(files.some(file=>url.pathname==='/process/'+file+'.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('public'+url.pathname,'utf8')});
    if(url.pathname==='/api/master/pages'){const body=request.postDataJSON();calls.push({method:request.method(),body,url:url.href});const result=await f.route[request.method()](new Request(url,{method:request.method(),headers:{cookie:f.cookies.writer,origin:f.base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});}
    return route.abort('blockedbyclient');
   });
   await page.goto(f.base+'/process/');const vi=lang==='vi',label=(zh,vn)=>vi?vn:zh;
   const button=(zh,vn)=>page.getByRole('button',{name:label(zh,vn),exact:true});
   const idle=()=>page.waitForFunction(()=>!window.api.busy());
   const click=async(zh,vn)=>{await button(zh,vn).click();await idle();};
   await idle();await click('開啟草稿','Mở bản nháp');
   await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).fill('Native local A');await click('C','C');await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).fill('Native local C');await click('AB','AB');assert.equal(await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).inputValue(),'Native local A');
   const beforeSave=calls.filter(row=>row.method==='POST').length;await button('存取草稿','Lưu bản nháp').dblclick();await idle();assert.equal(calls.filter(row=>row.method==='POST').length,beforeSave+1);await click('重新載入','Tải lại');assert.equal(await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).inputValue(),'Native local A');
   await click('新增工段','Thêm công đoạn');const codes=page.getByLabel(label('工段代碼','Mã công đoạn'),{exact:true}),names=page.getByLabel(label('工段名稱','Tên công đoạn'),{exact:true});await codes.last().fill('A-NEW');await names.last().fill('Native stage');await click('存取草稿','Lưu bản nháp');
   await click('向前移 · A-NEW','Chuyển lên · A-NEW');await click('向後移 · A-NEW','Chuyển xuống · A-NEW');await click('存取草稿','Lưu bản nháp');
   await click('送審','Gửi duyệt');assert(await button('存取草稿','Lưu bản nháp').isDisabled());await click('撤回','Rút lại');await click('送審','Gửi duyệt');await click('退回','Trả lại');await click('送審','Gửi duyệt');await click('核准','Duyệt');let root=await f.readRoot();assert(root.active.LINES.AB.lines[0].stages.some(row=>row.code==='A-NEW'));assert.equal(root.active.PROCESS['A-NEW'],undefined);
   await click('開啟草稿','Mở bản nháp');await button('刪除工段','Xóa công đoạn').last().click();await idle();await click('存取草稿','Lưu bản nháp');await click('送審','Gửi duyệt');await click('核准','Duyệt');root=await f.readRoot();assert(!root.active.LINES.AB.lines[0].stages.some(row=>row.code==='A-NEW'));
   await click('開啟草稿','Mở bản nháp');await click('新增線別','Thêm chuyền');await page.getByLabel(label('線別代碼','Mã chuyền'),{exact:true}).last().fill('AX');await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).last().fill('Native empty line');await button('刪除線別','Xóa chuyền').last().click();await idle();assert.equal(await page.getByLabel(label('線別代碼','Mã chuyền'),{exact:true}).count(),1);
   await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).fill('Cancel local input');await click('取消本機修改','Hủy thay đổi cục bộ');assert.equal(await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).inputValue(),'Native local A');await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).fill('Unsent abandoned');const count=calls.filter(row=>row.method==='POST').length;await page.evaluate(()=>{ProcessMasterPages.leave();document.querySelector('main').dataset.activeTab='users';});await page.evaluate(()=>{document.querySelector('main').dataset.activeTab='line-admin';window.api=ProcessMasterPages.mount(document.querySelector('main'),{page:'LINES'});});await idle();assert.equal(await page.getByLabel(label('線別名稱','Tên chuyền'),{exact:true}).inputValue(),'Native local A');assert.equal(calls.filter(row=>row.method==='POST').length,count);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'page uses inner table horizontal scroll');const bounds=await button('存取草稿','Lưu bản nháp').boundingBox();assert(bounds.width>40&&bounds.height>=38);
   const dir='.sites-runtime/lines-flow';fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/lines-'+width+'-'+lang+'.png',fullPage:true});report.checks.push({width,lang,status:'PASS',checks:'same-page AB/C retained; double click one Save; reload; create/edit/delete stage and empty line; submit/withdraw/resubmit/return/approve; PROCESS unchanged; departure abandons RAM only; viewport overflow/touch target',posts:count});
  }finally{await context.close();f.close();}
 }
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();fs.mkdirSync('.sites-runtime/lines-flow',{recursive:true});fs.writeFileSync('.sites-runtime/lines-flow/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
