/* oxlint-disable typescript/no-require-imports -- isolated real review renderer. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),path=require('node:path');
(async()=>{const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});try{
 for(const width of[1366,390]){const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main></body></html>');
  for(const css of['styles','master-data','master-data-extra','master-data-validation','master-admin-ui'])await page.addStyleTag({path:path.resolve('public/process/'+css+'.css')});await page.addScriptTag({path:path.resolve('public/process/master-review.js')});
  await page.evaluate(()=>{window.currentUser={id:'fixture',role:'admin'};window.canApprove=()=>true;window.state={};window.reviewControl={active:{},versions:[]};window.fixtureReview=MasterReview.install({state,control:reviewControl,persist:()=>{throw Error('unexpected write');},record:()=>{},validateCatalog:()=>[],applyActive:()=>{},showVersion:()=>{}});window.render=()=>{document.querySelector('#root').innerHTML=fixtureReview.view();fixtureReview.bind();};render();});
  assert.equal(await page.getByText('Hiện chưa có hồ sơ gửi duyệt.').count(),1);assert.equal(await page.getByText(/SAMPLE/).count(),0);
  await page.evaluate(()=>{reviewControl.versions.push({id:'old-case',scope:'AB',status:'approved',number:1,creatorName:'Người kiểm tra',updatedAt:'2026-10-01',snapshot:{products:[{code:'P1',name:'Tên sản phẩm đã được kiểm tra và đối chiếu theo bản vẽ kỹ thuật chính thức '.repeat(6),line:'A',category:'Nhóm',stages:['A-CUT']}],lines:[]},history:[]});render();});
  assert.equal(await page.locator('[data-master-review="old-case"]').count(),1);assert.equal(await page.getByText(/SAMPLE/).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await page.close();console.log('PASS real master review no virtual test entry; existing history and long Vietnamese at '+width);
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
