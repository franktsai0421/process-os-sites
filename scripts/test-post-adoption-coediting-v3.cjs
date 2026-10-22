const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- full-page tests against a readonly Local snapshot and isolated DB/R2 overlay. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),fixture=require('./v3-local-preparation-fixture.cjs');
const base=isolatedTestTarget_20261010,out=path.resolve(process.env.V3_OUTPUT_ROOT||'.wrangler/local-only/v3-evidence/post-adoption-coediting-20261003');
const applicabilityOnly=process.env.V3_ONLY==='applicability',reportFile=path.join(out,applicabilityOnly?'applicability-regression.json':'report.json');
const report={startedAt:new Date().toISOString(),status:'RUNNING',isolation:'Current adopted Local row copied into independent memory DB; original immutable R2 read-only, generated R2 objects isolated; all browser requests intercepted and handled locally',realLocalBusinessWrites:0,checks:[]};
let f,browser,phase='source';
fs.mkdirSync(out,{recursive:true});
function record(name,detail={}){report.checks.push({name,status:'PASS_ISOLATED_FULL_PAGE',...detail});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log('PASS',name);}
void(async()=>{try{
 f=await fixture();assert.ok(f.original.processAuthoringControl,'CURRENT_LOCAL_MUST_ALREADY_BE_ADOPTED');report.sourceRevision=f.revision;report.sourceToken=f.sourceToken;report.sourceControlPreserved=true;
 if(process.env.V3_REUSE_DESKTOP==='1'){const prior=JSON.parse(fs.readFileSync(path.join(out,'desktop-pass-before-mobile-navigation-fix.json')));assert.equal(prior.sourceToken,f.sourceToken);report.checks=prior.checks.filter(c=>c.name.endsWith('1366')).map(c=>({...c,reusedFrom:prior.startedAt}));assert.equal(report.checks.length,6);report.writes1366=prior.writes1366;}
 const initial=JSON.parse(f.original.processAuthoringControl),workspace=c=>c.workspaces.find(w=>w.category==='BORUAXE1021'&&w.line==='A'),id=workspace(initial.workflow.working).stages['A-CUT'][0].id,op=c=>workspace(c).stages['A-CUT'].find(o=>o.id===id);
 const flow=async()=>JSON.parse((await f.core.readState()).values.processAuthoringControl).workflow;
 const routes=new Map(),handler=url=>{const name='app'+url.pathname+'/route.ts';if(!routes.has(name))routes.set(name,f.load(name));return routes.get(name);};
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
 for(const width of (process.env.V3_WIDTHS||'1366,390').split(',').map(Number)){
  phase='setup '+width;await f.reset();assert.deepEqual(await flow(),initial.workflow);const errors=[],writes=[],sessions=[];report['writes'+width]=writes;
  async function session(actor){
   const context=await browser.newContext({viewport:{width,height:900}}),s={context,actor,cookie:'',offline:false,holdNext:false,held:false,release:null};sessions.push(s);
   await context.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
   await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),method=req.method();
    if(url.origin!==base)return route.fulfill({status:404});
    if(url.pathname.startsWith('/api/')){
     if(s.offline)return route.abort('internetdisconnected');
     const body=method==='GET'?undefined:req.postDataJSON(),action=body?.command?.action||body?.action;
     if(s.holdNext&&action==='apply'){s.holdNext=false;s.held=true;await new Promise(resolve=>{s.release=resolve;});}
     const file=path.resolve('app'+url.pathname+'/route.ts');if(!fs.existsSync(file))return route.fulfill({status:404});
     const response=await handler(url)[method](new Request(url,{method,headers:{Cookie:s.cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
     const raw=Buffer.from(await response.arrayBuffer());
     if(url.pathname==='/api/platform-login'&&response.ok&&response.headers.get('set-cookie'))s.cookie=response.headers.get('set-cookie').split(';')[0];
     if(method!=='GET'){
      let result;try{result=JSON.parse(raw);}catch{result={};}
      writes.push({actor,path:url.pathname,action:action||'login',status:response.status,revision:result.control?.workflow?.revision,error:result.error,patches:body?.command?.patches?.map(p=>({op:p.op,path:p.path}))});
     }
     return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:raw});
    }
    const root=path.resolve('public'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404});
    return route.fulfill({contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   s.page=await context.newPage();s.page.on('pageerror',e=>errors.push(e.message));s.page.on('dialog',d=>d.accept());
   await s.page.goto(base+'/process/?system=process&view=editor');await s.page.locator('#login-id').waitFor({state:'visible'});
   const user=JSON.parse(f.testValues.platformUsers).find(u=>u.id===actor);await s.page.locator('#login-id').fill(actor);await s.page.locator('#login-password').fill(user.password);await s.page.locator('#login-submit').click();
   await s.page.waitForFunction(actor=>ProcessSync.identity?.id===actor,actor);
   if(width<768)await s.page.locator('#menu-toggle').click();
   await s.page.locator('#main-nav [data-view="editor"]').click();
   await s.page.waitForFunction(()=>!!window.ProcessAuthoringV3?.flow());
   await s.page.evaluate(()=>{state.view='editor';state.category='BORUAXE1021';state.editorLine='A';state.editorVersionId=null;render();});
   await s.page.locator('[data-av3="save"]').waitFor();return s;
  }
  const a=await session('preparation-a'),b=await session('preparation-b');assert.ok(a.cookie&&b.cookie);assert.notEqual(a.cookie,b.cookie);
  async function open(s){await s.page.waitForFunction(()=>ProcessAuthoringV3.canMutate());await s.page.evaluate(id=>ProcessOpenOperation(Object.values(ensureCategoryEditor()).flat().find(o=>o.id===id)),id);await s.page.locator('#operation-name').waitFor({state:'visible'});}
  async function applied(s){await s.page.locator('#apply-operation').click();try{await s.page.waitForFunction(()=>!document.querySelector('#process-operation-dialog').open);}catch(error){console.log(JSON.stringify({actor:s.actor,writes,errors,status:await s.page.locator('#authoring-v3-panel').innerText()}));throw error;}}
  async function shows(s,field,value){await s.page.waitForFunction(({id,field,value})=>ProcessAuthoringV3.flow().working.workspaces.find(w=>w.category==='BORUAXE1021'&&w.line==='A').stages['A-CUT'].find(o=>o.id===id)[field]===value,{id,field,value});}
  async function save(s){const before=(await flow()).saved?.id;await s.page.locator('[data-av3="save"]').click();await s.page.waitForFunction(before=>ProcessAuthoringV3.flow().saved?.id&&ProcessAuthoringV3.flow().saved.id!==before,before);}
  if(!applicabilityOnly){
  phase='different fields '+width;await open(a);await open(b);const different='isolated-different-'+width;
  await a.page.locator('#operation-name').fill(different);await b.page.locator('#operation-people').fill('23');
  await applied(a);await applied(b);let current=await flow();assert.equal(op(current.working).name,different);assert.equal(Number(op(current.working).people),23);await shows(a,'name',different);await shows(b,'name',different);
  record('Different fields from stale open forms '+width,{fields:['name','people'],bothRetained:true});
  phase='same field server order '+width;await open(a);await open(b);await a.page.locator('#operation-name').fill('A-sent-first-accepted-last-'+width);await b.page.locator('#operation-name').fill('B-accepted-first-'+width);
  const start=writes.length;a.holdNext=true;await a.page.locator('#apply-operation').click();await a.page.waitForFunction(()=>document.querySelector('#process-operation-dialog').open);await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(a.held){clearInterval(timer);resolve();}},20);setTimeout(()=>{clearInterval(timer);reject(Error('Request not held'));},5000).unref();});
  await applied(b);assert.equal(op((await flow()).working).name,'B-accepted-first-'+width);a.release();await a.page.waitForFunction(()=>!document.querySelector('#process-operation-dialog').open);
  const accepted=writes.slice(start).filter(w=>w.action==='apply'&&w.status===200);assert.deepEqual(accepted.map(w=>w.actor),['preparation-b','preparation-a']);assert.ok(accepted[1].revision>accepted[0].revision);assert.equal(op((await flow()).working).name,'A-sent-first-accepted-last-'+width);await shows(b,'name','A-sent-first-accepted-last-'+width);
  record('Same field follows accepted server order '+width,{acceptedActors:accepted.map(w=>w.actor),acceptedRevisions:accepted.map(w=>w.revision)});
  phase='A edits B saves '+width;await open(a);await a.page.locator('#operation-name').fill('A-edit-B-save-'+width);await applied(a);await save(b);current=await flow();assert.equal(op(current.saved.content).name,'A-edit-B-save-'+width);assert.equal(current.saved.actor.id,'preparation-b');assert.deepEqual(current.saved.content,current.working);
  const saved=structuredClone(current.saved);record('A modifies, B manually saves '+width,{savedActor:current.saved.actor.id});
  phase='post-save remains unsaved '+width;await open(a);await a.page.locator('#operation-name').fill('new-unsaved-'+width);await applied(a);current=await flow();assert.deepEqual(current.saved,saved);assert.notDeepEqual(current.saved.content,current.working);await shows(b,'name','new-unsaved-'+width);assert.match(await b.page.locator('#authoring-v3-panel').innerText(),/尚未儲存/);
  record('New synchronized edit remains unsaved '+width,{savedIdUnchanged:true});
  phase='close reopen '+width;await b.page.close();b.page=await b.context.newPage();b.page.on('pageerror',e=>errors.push(e.message));b.page.on('dialog',d=>d.accept());await b.page.goto(base+'/process/?system=process&view=editor');await b.page.waitForFunction(()=>!!window.ProcessAuthoringV3?.flow());await b.page.evaluate(()=>{state.view='editor';state.category='BORUAXE1021';state.editorLine='A';render();});await shows(b,'name','new-unsaved-'+width);assert.equal(await b.page.evaluate(()=>ProcessAuthoringV3.flow().saved.id),saved.id);assert.deepEqual((await flow()).saved,saved);
  record('Close page and reopen preserves saved and newer working separately '+width,{savedIdUnchanged:true});
  phase='offline stale form reconnect '+width;await open(a);a.offline=true;await a.context.setOffline(true);await a.page.locator('#operation-ipqc').fill('isolated-offline-ipqc-'+width);await a.page.locator('#apply-operation').click();await a.page.waitForFunction(()=>sharedDraftAccountState().unknown||sharedDraftAccountState().failed);assert.notEqual(op((await flow()).working).ipqc,'isolated-offline-ipqc-'+width);
  await open(b);await b.page.locator('#operation-name').fill('B-newer-during-A-offline-'+width);await applied(b);const beforeReconnect=writes.length;
  a.offline=false;await a.context.setOffline(false);await a.page.locator('.editor-modal-close').click();await a.page.locator('[data-av3="retry"]').click();await shows(a,'name','B-newer-during-A-offline-'+width);await shows(a,'ipqc','isolated-offline-ipqc-'+width);
  current=await flow();assert.equal(op(current.working).name,'B-newer-during-A-offline-'+width);assert.equal(op(current.working).ipqc,'isolated-offline-ipqc-'+width);assert.deepEqual(current.saved,saved);const recovery=writes.slice(beforeReconnect).filter(w=>w.action==='apply'&&w.status===200);assert.equal(recovery.length,1);assert.deepEqual(recovery[0].patches.map(p=>p.path.at(-1)),['ipqc']);
  record('Offline unknown result recovery does not overwrite remote field '+width,{replayedFields:['ipqc'],remoteNewerNamePreserved:true,savedUnchanged:true});
  }else{
   phase='explicit product applicability '+width;const prior=await flow();await open(a);const checkbox=a.page.locator('[data-operation-product]:checked').first(),code=await checkbox.getAttribute('data-operation-product');assert.ok(code);await a.page.locator('[data-operation-product="'+code+'"]').uncheck();await applied(a);const after=await flow();assert.deepEqual(after.saved,prior.saved);assert.ok(Object.values(workspace(after.working).stages).flat().every(o=>!o.productCodes.includes(code)),'Explicit removal still propagates through the workspace');assert.ok(op(after.working).productCodes.length>0);record('Explicit product edit retains workspace propagation '+width,{savedUnchanged:true});
  }
  assert.deepEqual(errors,[]);assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await a.page.screenshot({path:path.join(out,(applicabilityOnly?'applicability-':'coediting-')+width+'.png'),fullPage:true});
  const state=(await f.core.readState()).values;for(const key of Object.keys(f.original))if(!['platformUsers','processAuthoringControl'].includes(key))assert.equal(state[key],f.original[key],'Unrelated source key changed: '+key);
  assert.deepEqual((await flow()).cases,initial.workflow.cases);assert.deepEqual(workspace((await flow()).working).stages['A-CUT'].map(o=>o.id),workspace(initial.workflow.working).stages['A-CUT'].map(o=>o.id));assert.deepEqual((await flow()).working.workspaces.find(w=>w.category==='56464654'),initial.workflow.working.workspaces.find(w=>w.category==='56464654'));
  report['writes'+width]=writes;assert.ok(writes.every(w=>w.path==='/api/platform-login'||w.path==='/api/process-authoring/workflow'&&['apply','save'].includes(w.action)));for(const s of sessions)await s.context.close();f.verifySource();
 }
 report.status='PASS_POST_ADOPTION_ISOLATED';report.finishedAt=new Date().toISOString();report.sourceUnchanged=true;report.pending21NotRepaired=true;report.originalEmployeeLogin='NOT_TESTED_ISOLATED_TEST_ACCOUNTS_ONLY';
}catch(error){report.status='FAIL';report.failure={phase,message:error.message,stack:error.stack};console.error(phase,error);process.exitCode=1;}finally{if(browser)await browser.close();if(f){try{f.close();}catch(error){report.sourceUnchanged=false;report.sourceFailure=error.message;process.exitCode=1;}}fs.writeFileSync(reportFile,JSON.stringify(report,null,2));}})();
