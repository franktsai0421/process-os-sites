/* oxlint-disable typescript/no-require-imports -- isolated HTTP, signed Sessions and actual master controller. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),{chromium}=require('playwright'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',f),'utf8'));
const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
env.DB.batch=async statements=>Promise.all(statements.map(async statement=>({success:true,...await statement.all()})));
const password=randomUUID(),users=['a','b','reviewer','admin','readonly'].map(id=>({id,name:id,password,enabled:true,role:id==='admin'?'admin':'rd',inheritRole:false,views:id==='readonly'?['data']:['data','approval'],permissions:id==='readonly'?[]:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare']}));
const catalog=line=>({products:[{code:line+'1',name:'Sản phẩm',specification:'10 mm',unit:'CAI',category:'G',line,stages:[line+'-CUT']}],lines:[{code:line,name:'Chuyền',stages:[{code:line+'-CUT',name:'Cắt'}]}],categoryGroups:[{line,name:'G'}]});
const templates=stage=>['entry','manual','manual-inspection','machine-assembly','exit'].map(key=>({id:stage+key,presetKey:key,presetVersion:'existing',name:'Mẫu '+key,mediaItems:[]}));
const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':templates('A-CUT'),'C-CUT':templates('C-CUT')}};
const original={active,versions:Object.entries(active).map(([scope,snapshot])=>({id:scope+'-active',scope,number:1,status:'approved',snapshot,revision:1,creatorId:'system',creatorName:'system',createdAt:'2026-10-01',updatedAt:'2026-10-01',history:[],warnings:[]}))};
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(original),processMasterData:JSON.stringify(active.PROCESS)}),'fixture');
const load=harness(env),api=load('app/api/master/workflow/route.ts'),login=load('app/api/platform-login/route.ts'),core=load('lib/process-state.ts');
const scripts=['shared-draft-client','master-shared-client','master-admin-ui','master-review','approval-tabs','master-data'],styles=['styles','master-data','master-data-extra','master-data-validation','master-admin-ui'];
let loseApplyResponse=false,failReadOnce=false;
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://'+req.headers.host);let response;
 if(failReadOnce&&req.method==='GET'&&u.pathname==='/api/master/workflow'){failReadOnce=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'ISOLATED_LOAD_FAILURE'}));return;}
 if(u.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),request=new Request(u,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})});response=await(u.pathname==='/api/platform-login'?login:api)[req.method](request);
 if(loseApplyResponse&&req.method==='POST'&&JSON.parse(body.toString()).command?.action==='apply'&&response.ok){loseApplyResponse=false;res.destroy();return;}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 const file=u.pathname.slice(1);if([...scripts.map(x=>x+'.js'),...styles.map(x=>x+'.css')].includes(file)){res.setHeader('Content-Type',(file.endsWith('.js')?'text/javascript':'text/css')+'; charset=utf-8');res.end(fs.readFileSync(path.join('public/process',file)));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+styles.map(x=>'<link rel="stylesheet" href="/'+x+'.css">').join('')+'</head><body><main id="root"></main></body></html>');
 }catch(e){res.statusCode=500;res.end(e.message);}});
let browser;const errors=[],results=[];
async function boot(page,id,failedLoad=false){await page.goto(base);await page.evaluate(async({id,password,original})=>{
 const r=await fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,password})});if(!r.ok)throw Error('login '+r.status+' '+await r.text());
 window.currentUser={id,name:id,role:id==='admin'?'admin':'rd'};window.ProcessSync={identity:currentUser,platformHeaders:()=>({'Content-Type':'application/json'})};
 localStorage.setItem('masterDataControl',JSON.stringify(original));localStorage.setItem('processMasterData',JSON.stringify(original.active.PROCESS));
 window.readStore=(key,fallback)=>JSON.parse(localStorage.getItem(key)||'null')??fallback;
 window.escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.state={view:'data',dataTab:'AB',masterScope:'AB',editorByCategory:{}};window.data={products:original.active.AB.products,categories:['G'],bom:{},meta:{}};
 window.routing={lines:[...original.active.AB.lines,...original.active.C.lines],productRoutes:{A1:{line:'A',stages:['A-CUT']}},meta:{}};window.lines=[...routing.lines];
 window.LINE_C_MASTER={products:original.active.C.products,stages:original.active.C.lines[0].stages};window.processMaster=original.active.PROCESS;
 // Host shell only; actual master controller, forms, bridge and review renderer are loaded below.
 window.ensureProcessMasterStages=()=>false;window.platformUsers=[];window.approvalVersions=[];window.dispatchBoard={};window.applyPlatformIdentity=()=>{};
 window.hasPermission=p=>p!=='master.delete'||id==='admin';window.canApprove=()=>true;window.confirmMasterDeletion=()=>true;
 window.toasts=[];window.toast=message=>toasts.push(String(message));window.dataView=()=>'';window.bindData=()=>{};window.bindDataInner=()=>{};
 window.render=()=>{document.querySelector('#root').innerHTML=state.view==='data'?dataView():'<section class="approval-page"></section>';if(state.view==='data')bindData();};
 },{id,password,original});for(const name of scripts)await page.addScriptTag({url:base+'/'+name+'.js'});assert.deepEqual(errors,[]);await page.evaluate(()=>render());
 if(failedLoad){await page.getByRole('button',{name:'Thử tải lại bản nháp chung'}).waitFor();assert.equal(await page.locator('#master-new-draft').isDisabled(),true);assert.equal(await page.locator('.master-table tbody tr').count(),1);await page.getByRole('button',{name:'Thử tải lại bản nháp chung'}).click();}
 await page.waitForFunction(()=>!!MasterDataWorkflow.shared.permissions('AB'));}
let base;

void (async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await boot(page,'admin');
 await page.evaluate(()=>{state.dataTab='line-admin';state.masterSection='lines';render();});
 const timings={};
 async function measure(name,fn){const values=[];for(let i=0;i<5;i++){const start=performance.now();await fn(i);values.push(performance.now()-start);}timings[name]={count:5,medianMs:[...values].sort((a,b)=>a-b)[2],maxMs:Math.max(...values),samplesMs:values};}
 await measure('scope-C',async()=>{await page.locator('#master-lines-scope').selectOption('C');await page.waitForFunction(()=>state.masterScope==='C'&&!document.querySelector('#master-lines-scope').disabled);await page.locator('#master-lines-scope').selectOption('AB');await page.waitForFunction(()=>state.masterScope==='AB'&&!document.querySelector('#master-lines-scope').disabled);});
 await page.locator('#master-new-draft').click();await page.locator('[data-stage-add="A"]').waitFor();
 await page.evaluate(()=>window.VersionDraftUI={date:value=>String(value||''),mount:()=>{},t:()=>document.documentElement.lang==='vi'?'Áp dụng':'套用'});
 await measure('open-stage-edit',async()=>{await page.locator('[data-stage-edit="A-CUT"]').click();await page.locator('#master-edit-dialog [name=name]').waitFor({state:'visible'});assert.equal(await page.locator('#master-edit-dialog [name=name]').inputValue(),'Cắt');await page.locator('#master-edit-dialog [data-cancel]').first().click();});
 const baseline=process.env.LINES_BASELINE==='1';
 if(!baseline){

 let release,started;const gate=new Promise(r=>release=r),requestStarted=new Promise(r=>started=r);
 await page.route('**/api/master/workflow?scope=C**',async route=>{started();await gate;await route.continue();},{times:1});
 await page.locator('#master-lines-scope').selectOption('C');await requestStarted;
 await page.evaluate(()=>{state.dataTab='AB';state.masterSection='products';render();});
 release();await page.waitForFunction(()=>!MasterDataWorkflow.shared.busy());
 assert.equal(await page.evaluate(()=>state.masterScope),'AB');assert.equal(await page.locator('#master-lines-scope').count(),0);results.push('late scope response cannot replace destination');
 await page.evaluate(()=>{state.dataTab='line-admin';state.masterSection='lines';render();});
 assert.equal(await page.locator('#add-master-line').count(),0);
 await page.locator('[data-stage-add="A"]').click();await page.locator('[name=code]').fill('A-ISOLATED');await page.locator('[name=name]').fill('隔離工段 · Công đoạn thử nghiệm');
 await page.locator('#master-edit-dialog [type=submit]').dblclick();await page.waitForFunction(()=>!document.querySelector('#master-edit-dialog'));
 let root=JSON.parse((await core.readState()).values.masterDataControl);assert.equal(root.workflowScopes.AB.working.lines[0].stages.filter(s=>s.code==='A-ISOLATED').length,1);assert(!root.active.AB.lines[0].stages.some(s=>s.code==='A-ISOLATED'));results.push('double apply inserts once; active unchanged');
 await page.evaluate(()=>{state.dataTab='line-admin';state.masterSection='lines';render();});await page.locator('[data-stage-delete="A-ISOLATED"]').click();await page.waitForFunction(()=>!document.querySelector('[data-stage-edit="A-ISOLATED"]'));root=JSON.parse((await core.readState()).values.masterDataControl);assert(!root.workflowScopes.AB.working.lines[0].stages.some(s=>s.code==='A-ISOLATED'));results.push('new unused stage deletion read back');
 await page.locator('[data-line-delete="A"]').click();assert.equal(await page.locator('[data-stage-edit="A-CUT"]').count(),1);results.push('line children retained');
 for(const lang of ['zh-TW','vi']){await page.evaluate(lang=>document.documentElement.lang=lang,lang);await page.setViewportSize({width:390,height:844});await page.locator('#master-lines-scope').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}results.push('390px Chinese/Vietnamese no horizontal document overflow');
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({phase:baseline?'before':'after',data:'synthetic, 1 product and 1 stage per scope; scope timing includes C then AB roundtrip',timings,passed:results,errors},null,2));
 }catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.close();db.close();}})();
