/* Local HTTP, actual API handlers, Chromium and synthetic DB/R2 only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{chromium}=require('playwright');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
(async()=>{
 const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',name:'Fixture',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}})});
 await h.begin('ipqc-c');await h.command('ipqc-c','apply',{moduleAction:'create-error',input:{productCode:'C100',stageCode:'C-CUT',name:'Original'}});await h.command('ipqc-c','save');
 let base,dropSave=false;const mutations=[],errors=[];
 const scripts=['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js','ipqc-c.js'];
 const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,base);
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/ipqc-c.css"><link rel="stylesheet" href="/process/version-draft-ui.css"><main id="data-content" data-active-tab="quality-ipqc-c"></main><script>window.ProcessSync={identity:{id:'preview-editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>1,platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=()=>true;window.toast=()=>{};window.state={};window.bindDataInner=()=>{};window.ProcessIPQC={mountReferences(){},referenceMarkup:()=>''};</script>${scripts.map(name=>'<script src="/process/'+name+'"></script>').join('')}<script>IPQCCUI.mount(document.querySelector('main'));</script></html>`);return;}
 if(url.pathname.startsWith('/process/')){const name=url.pathname.slice(9);if(!/^[\w.-]+$/.test(name))throw Error('BAD_ASSET');let source=fs.readFileSync('public/process/'+name,'utf8');if(name==='ipqc-c.js')source=source.replace('  window.IPQCCUI={',`  window.__localTest={read:()=>read(false),state:()=>({working,localChanges,message}),edit:()=>startEditor('error',working.errors[0])};\n  window.IPQCCUI={`);res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(source);return;}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);if(req.method!=='GET')mutations.push({path:url.pathname,body:body.toString()});
 const endpoint=url.pathname.replace('/api/',''),route=h.load('app/api/'+endpoint+'/route.ts');const headers=new Headers(req.headers);headers.set('Cookie',h.sessions.editor.Cookie);headers.set('Origin',base);const response=await route[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));if(dropSave&&req.method==='POST'&&response.status===200){dropSave=false;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){errors.push(e.stack);res.writeHead(500);res.end(String(e));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true});
 try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.stack));await page.goto(base+'/fixture');await page.locator('#ipqcc-save').waitFor();mutations.length=0;
 await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Local '+width);await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});
 assert.equal(mutations.length,0,'Finish never writes');assert.equal(await page.evaluate(()=>__localTest.state().localChanges.length),1);
 await page.locator('#ipqcc-search').fill('C100');await page.evaluate(()=>__localTest.read());assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),'Local '+width,'read/filter preserves input');
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0,{},{timeout:10000}).catch(async e=>{console.error(await page.evaluate(()=>__localTest.state()),mutations,errors);throw e;});
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1);const flow=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));assert.equal(flow.saved.content.errors[0].name,'Local '+width);
 mutations.length=0;
 await page.locator('[data-ipqcc-add="item"]').click();await page.locator('textarea[name="description"]').fill('Inspection photo and rule');await page.locator('input[name="standard"]').count().then(async count=>{if(count)await page.locator('input[name="standard"]').fill('10');else await page.locator('textarea[name="standard"]').fill('10');});
 await page.locator('input[name="cpkEnabled"]').check();await page.locator('input[name="aqlValue"]').fill('0.25');
 await page.locator('#ipqcc-photo-input').setInputFiles({name:'fixture.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
 await page.locator('#ipqcc-editor button[type="submit"]').click();await page.locator('#ipqcc-editor').waitFor({state:'detached'});assert.equal(mutations.length,0,'photos remain local until Save');
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0);
 assert.equal(mutations.filter(m=>m.path.endsWith('/photo')).length,1);assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1);
 const withPhoto=h.flow(await h.call('ipqc-c','GET',undefined,'editor',200,'?caseMetadata=1'));assert.equal(withPhoto.saved.content.items.at(-1).cpkEnabled,true);assert.equal(withPhoto.saved.content.items.at(-1).mediaItems.length,1);
 await page.evaluate(()=>{document.documentElement.lang='vi';dispatchEvent(new CustomEvent('process-language-change',{detail:{language:'vi'}}));});assert.equal(await page.locator('#ipqcc-save').innerText(),'Lưu');
 if(width===390){
 mutations.length=0;await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Recovered receipt');await page.locator('#ipqcc-editor button[type="submit"]').click();dropSave=true;
 await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().message||__localTest.state().localChanges.length===0);
 if(await page.evaluate(()=>__localTest.state().localChanges.length)){await page.locator('#ipqcc-save').click();await page.waitForFunction(()=>__localTest.state().localChanges.length===0);}
 assert.equal(mutations.filter(m=>m.path.endsWith('/workflow')).length,1,'lost ACK checks receipt without resending');
 }
 await page.evaluate(()=>__localTest.edit());await page.locator('input[name="name"]').fill('Abandoned');assert.equal(await page.evaluate(()=>IPQCCUI.navigation.departure.inspect().state),'clean');await page.evaluate(()=>IPQCCUI.navigation.departure.closeClean());assert.equal(await page.locator('#ipqcc-editor').count(),1,'departure closes model; navigation replaces DOM');
 await page.reload();await page.locator('#ipqcc-save').waitFor();assert.equal(await page.evaluate(()=>__localTest.state().working.errors[0].name),width===390?'Recovered receipt':'Local '+width);
 const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(layout.scroll<=layout.width+1,JSON.stringify(layout));await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS Chromium 1440/390: local edit, filter/read preservation, one Save POST, shared saved result, silent departure and reload');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
