/* Real Chromium and actual page routes. SQLite :memory:, Map R2, synthetic users only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright');
const fixture=require('./test-master-page-runtime.cjs');
const evidence=process.env.TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'master-page-browser-evidence');fs.mkdirSync(evidence,{recursive:true});
async function run(width,lang){
 const f=await fixture(true),posts=[],errors=[];let server,browser,loseSave=false,blockReceipts=false;
 try{
  server=http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(url.pathname.startsWith('/process/')){const file=url.pathname.slice('/process/'.length);if(!['styles.css','master-data.css','version-draft-ui.css','shared-draft-client.js','version-draft-ui.js','page-draft-merge.js','master-page-approved-history.js','master-page-editor.js'].includes(file)){res.writeHead(404);res.end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync('public/process/'+file));return;}
   if(url.pathname==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/master-data.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><main id="fixture" data-active-tab="line-admin"></main><script>window.ProcessSync={identity:{id:'writer'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:()=>true};window.hasPermission=()=>true;window.bindDataInner=()=>{};</script><script src="/process/shared-draft-client.js"></script><script src="/process/version-draft-ui.js"></script><script src="/process/page-draft-merge.js"></script><script src="/process/master-page-approved-history.js"></script><script src="/process/master-page-editor.js"></script><script>window.mount=()=>ProcessMasterPages.mount(document.querySelector('#fixture'),{page:'LINES'});mount();</script>`);return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),body=bytes.length?JSON.parse(bytes):null;if(body)posts.push(body);
   if(blockReceipts&&url.searchParams.has('operationId')){res.writeHead(503);res.end('{}');return;}
   const response=await f.route[req.method](new Request(base+req.url,{method:req.method,headers:{...req.headers,cookie:f.cookies.writer,origin:base},...(bytes.length?{body:bytes}:{})}));
   if(loseSave&&body?.command?.action==='save'){loseSave=false;res.writeHead(503);res.end('{}');return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true});const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const label=(zh,vi)=>lang==='vi'?vi:zh;
  const save=()=>page.getByRole('button',{name:label('存取草稿','Lưu bản nháp'),exact:true}).click();
  const idle=()=>page.waitForFunction(()=>!ProcessMasterPages.busy());
  const name=()=>page.getByRole('textbox',{name:label('線別名稱','Tên chuyền'),exact:true});
  const stage=()=>page.getByRole('textbox',{name:label('工段名稱','Tên công đoạn'),exact:true});
  await page.goto(base+'/fixture');await page.getByRole('button',{name:label('開啟草稿','Mở bản nháp'),exact:true}).click();await idle();
  let count=posts.length;await name().fill('Local A');await page.getByRole('button',{name:'C',exact:true}).click();await idle();await name().fill('Local C');assert.equal(posts.length,count);
  await page.getByRole('button',{name:'AB',exact:true}).click();await idle();assert.equal(await name().inputValue(),'Local A');await save();await idle();
  let root=await f.readRoot();assert.equal(root.workflowScopes.LINES.saved.content.AB.lines[0].name,'Local A');assert.equal(root.workflowScopes.LINES.saved.content.C.lines[0].name,'Local C');assert.equal(root.active.AB.lines[0].name,'A');
  async function peer(batches){const c=(await f.send('LINES')).body.control;const r=await f.send('LINES',{command:f.save(c,batches)},'reviewer');assert.equal(r.status,200,JSON.stringify(r));}
  const linePath=['AB','lines',{id:'line-A'},'name'],cStage=['C','lines',{id:'line-C'},'stages',{id:'stage-C'},'name'];
  await name().fill('Mine A');await peer([{patches:[{op:'set',path:linePath,value:'Peer A'},{op:'set',path:cStage,value:'Peer untouched'}],guards:[{path:linePath,value:'Local A'},{path:cStage,value:'Stage C'}]}]);
  await save();await page.locator('dialog').waitFor();await page.getByRole('button',{name:label('用我的','Dùng của tôi'),exact:true}).click();await idle();root=await f.readRoot();assert.equal(root.workflowScopes.LINES.working.AB.lines[0].name,'Mine A');assert.equal(root.workflowScopes.LINES.working.C.lines[0].stages[0].name,'Peer untouched');
  await stage().fill('Restored same stage');root=await f.readRoot();const old=root.workflowScopes.LINES.working.AB.lines[0].stages[0],path=['AB','lines',{id:'line-A'},'stages',{id:old.id}];
  await peer([{patches:[{op:'remove',path}],guards:[{path,value:old}]}]);await save();await page.locator('dialog').waitFor();await page.getByRole('button',{name:label('用我的','Dùng của tôi'),exact:true}).click();await idle();root=await f.readRoot();assert.equal(root.workflowScopes.LINES.working.AB.lines[0].stages[0].id,old.id);assert.equal(root.workflowScopes.LINES.working.AB.lines[0].stages[0].name,'Restored same stage');
  await name().fill('Cancel keeps text');await peer([{patches:[{op:'set',path:linePath,value:'Another peer'}],guards:[{path:linePath,value:'Mine A'}]}]);count=posts.length;await save();await page.locator('dialog').waitFor();await page.getByRole('button',{name:label('取消','Hủy'),exact:true}).click();await idle();assert.equal(posts.length,count);assert.equal(await name().inputValue(),'Cancel keeps text');
  await save();await page.locator('dialog').waitFor();await page.getByRole('button',{name:label('用對方的','Dùng của người khác'),exact:true}).click();await idle();assert.equal(await name().inputValue(),'Another peer');
  await name().fill('Unknown committed once');loseSave=true;blockReceipts=true;count=posts.length;await save();await idle();await page.getByRole('button',{name:label('查詢原操作結果','Tra cứu kết quả thao tác'),exact:true}).waitFor();assert.equal(posts.length,count+1);
  blockReceipts=false;await page.getByRole('button',{name:label('查詢原操作結果','Tra cứu kết quả thao tác'),exact:true}).click();await idle();assert.equal(posts.length,count+1);assert.equal(await name().inputValue(),'Unknown committed once');
  const before=posts.length;await page.keyboard.press('Tab');assert.equal(posts.length,before);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'page-level horizontal overflow');
  await page.screenshot({path:evidence+'/master-pages-'+width+'-'+lang+'.png',fullPage:true});assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',width,lang,postCount:posts.length,checks:['local-only two partition edits','same Save grouped conflicts preserve peer fields','same-ID deleted-stage restoration','cancel retains text and sends nothing','chosen-theirs continues Save','UNKNOWN receipt lookup without repost','keyboard and page overflow'],browser:'real Chromium',storage:'memory fixtures only'}));
 }finally{await browser?.close();await new Promise(resolve=>server?.close(resolve)||resolve());f.close();}
}
(async()=>{await run(1366,'zh-TW');await run(390,'vi');})().catch(error=>{console.error(error);process.exitCode=1;});
