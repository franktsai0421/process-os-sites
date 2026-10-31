// Isolated component browser fixture: actual binder, shared transport/bridge,
// stylesheet and draft kernel. This does not claim full-site navigation coverage.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const load=require('../scripts/ipqc-ab-import-harness.cjs')(),{createSharedDraft,applyDraftCommand}=load('lib/shared-draft.ts');
const source=fs.readFileSync('public/process/app.js','utf8'),tree=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),binder=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='bindProcessMasterName').getText(tree);
async function fixture(){
 let flow=createSharedDraft('master:PROCESS',{CUT:[{id:'one',name:'Original'}],PACK:[{id:'two',name:'Original'}]},null,'fixture-generation'),drop=false,receiptUnavailable=false,writes=0;
 const permissions=Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','restore','delete'].map(k=>[k,true]));
 const payload=()=>({revision:flow.revision,permissions,control:{activeVersionId:null,versions:[{id:'draft',scope:'PROCESS',status:'draft',snapshot:flow.working}],workflow:flow}});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture.invalid');
  const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(url.pathname==='/api/master/workflow'){
   if(req.method==='GET'){
    if(url.searchParams.has('operationId')){if(receiptUnavailable)return json({error:'SYNTHETIC_UNAVAILABLE'},503);const receipt=flow.receipts[url.searchParams.get('operationId')]?.result;return json(receipt?{receipt}:{error:'OPERATION_NOT_FOUND'},receipt?200:404);}
    return json(payload());
   }
   let raw='';for await(const part of req)raw+=part;
   try{const {command}=JSON.parse(raw),result=applyDraftCommand(flow,command,{actor:{id:req.headers['x-fixture-actor']||'operator-a',name:'Synthetic'},at:'2026-10-30',id:randomUUID,allowed:()=>true,structure(){},validate:()=>[],semantic:x=>x,activeId:null});flow=result.state;writes++;if(drop){drop=false;return json({error:'SYNTHETIC_RESPONSE_LOST'},503);}return json({...payload(),receipt:result.receipt});}catch(error){return json({error:error.code||error.message,details:error.details,requestId:randomUUID()},error.status||500);}
  }
  const files={'/client.js':'public/process/shared-draft-client.js','/bridge.js':'public/process/master-shared-client.js','/style.css':'public/process/version-draft-ui.css','/recovery.css':'public/process/process-equipment.css','/recovery-helper.js':'public/process/local-draft-recovery.js','/recovery-session.js':'public/process/local-draft-recovery-session.js'};
  if(files[url.pathname]){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(files[url.pathname]));return;}
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(`<!doctype html><html lang="${url.searchParams.get('lang')==='vi'?'vi':'zh'}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/recovery.css"><style>body{margin:12px;font-family:sans-serif}.master-template{width:100%}.template-name-field{display:block}input{box-sizing:border-box;width:100%;min-height:44px}</style><main class="master-template" data-template-key="preset"><label class="template-name-field">名稱 / Tên<input data-master-name></label><button id="save">Save</button></main><script>window.ProcessSync={identity:{id:new URL(location).searchParams.get('actor')||'operator-a'},identityGeneration(){return 1},captureDelivery(){return{id:this.identity.id,epoch:1}},isCurrentDelivery(pin){return pin.id===this.identity.id&&pin.epoch===1},platformHeaders(){return{'Content-Type':'application/json','X-Fixture-Actor':this.identity.id}}};window.notices=[];window.toast=m=>notices.push(m);</script><script src="/client.js"></script><script src="/bridge.js"></script><script src="/recovery-helper.js"></script><script src="/recovery-session.js"></script><script>const control={versions:[],active:{}},processMasterNameBindings=new Set();window.MasterDataWorkflow={shared:createMasterSharedBridge({control})};function editableProcessMasterData(){const f=MasterDataWorkflow.shared.flow('PROCESS');return f?.pendingId?null:f?.working}function processMasterCatalogMatches(s){return Object.values(s).flat()}function updateProcessSharedStatus(){}${binder}\n(async()=>{await MasterDataWorkflow.shared.load('PROCESS');const input=document.querySelector('input');input.value=editableProcessMasterData().CUT[0].name;bindProcessMasterName(input);document.querySelector('#save').onclick=async()=>{try{await input.processMasterNameFlush();await MasterDataWorkflow.shared.execute('PROCESS','save');}catch(e){toast(e.message)}};window.ready=true;})()</script></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 return{origin,get flow(){return flow;},get writes(){return writes;},unknown(){drop=true;receiptUnavailable=true;},recover(){receiptUnavailable=false;},close:()=>new Promise(resolve=>server.close(resolve))};
}
void test('380px Chinese/Vietnamese manual name Apply, input focus, reload recovery, and exact unknown receipt',async()=>{
 const f=await fixture(),browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  for(const lang of ['zh','vi']){
   const context=await browser.newContext({viewport:{width:380,height:780},isMobile:true,hasTouch:true}),page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());await page.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
   await page.goto(f.origin+'/?lang='+lang);await page.waitForFunction(()=>window.ready);const input=page.locator('input'),name=lang==='zh'?'本機未套用名稱':'Tên chưa áp dụng';
   const before=f.writes,sharedNameBefore=f.flow.working.CUT[0].name;await input.evaluate((n,value)=>{n.dispatchEvent(new CompositionEvent('compositionstart'));n.value=value;n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));},name);assert.equal(await page.locator('[data-name-action="apply"]').isDisabled(),true);assert.equal(f.writes,before);await input.evaluate(n=>n.dispatchEvent(new CompositionEvent('compositionend')));await input.fill(name);await input.evaluate(n=>n.setSelectionRange(2,2));await page.waitForTimeout(300);assert.equal(f.writes,before);
   assert.equal(await input.evaluate(n=>document.activeElement===n&&n.selectionStart===2),true);
   const layout=await page.locator('.process-name-apply-bar').evaluate(bar=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...bar.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>({height:b.getBoundingClientRect().height,left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right}))}));
   assert.equal(layout.overflow,false);assert(layout.buttons.every(b=>b.height>=44&&b.left>=0&&b.right<=380));
   await page.locator('#save').click();assert.equal(f.writes,before);assert(await page.evaluate(()=>notices.includes('UNAPPLIED_CHANGES_APPLY_REQUIRED')));
   await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await input.inputValue(),sharedNameBefore);assert.equal(f.writes,before);
   await page.locator('[data-name-action="recovery"]').click();await page.locator('dialog section button').first().click();assert.match(await page.locator('dialog pre').textContent(),new RegExp(name));
   await page.getByRole('button',{name:lang==='zh'?'恢復至本機':'Khôi phục cục bộ',exact:true}).first().click();await page.waitForFunction(value=>document.querySelector('input').value===value,name);assert.equal(f.writes,before);
   await page.locator('[data-name-action="apply"]').click();await page.waitForFunction(()=>document.querySelector('input').dataset.unapplied==='false');assert.equal(f.writes,before+1);assert.equal(f.flow.working.CUT[0].name,name);
   await input.fill(name+' unknown');f.unknown();const outcome=await input.evaluate(async n=>{try{await n.processMasterNameApply();return 'unexpected';}catch(e){return e.message;}});assert.equal(outcome,'RESULT_UNKNOWN_CHECK_BEFORE_RETRY');assert.equal(f.writes,before+2);
   assert.equal(await page.evaluate(()=>MasterDataWorkflow.shared.client('PROCESS').hasUnknown()),true);f.recover();
   await page.locator('[data-name-action="recovery"]').click();await page.getByRole('button',{name:lang==='zh'?'查原收據':'Kiểm tra biên nhận',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
   await input.evaluate(n=>n.processMasterNameFlush());assert.equal(f.writes,before+2,'original receipt plus authoritative readback must not resend Apply');assert.equal(await input.inputValue(),name+' unknown');assert.deepEqual(errors,[]);
   await context.close();
  }
 }finally{await browser.close();await f.close();}
});
