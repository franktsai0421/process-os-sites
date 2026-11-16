// Actual compiled Worker and Chromium, generated ~12 MB authoring data only.
// Compare the compatible full bootstrap and versioned projection on the same
// server/data. This isolates delivery, not historical Worker or Office timing.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
const require=createRequire(import.meta.url),out='.sites-runtime/quality-authoring-ready';fs.mkdirSync(out,{recursive:true});
let source,fixture,browser,lastPage,stage='setup';const rows=[],errors=[],writes=[];
try{
 source=await require('../scripts/quality-authoring-bootstrap-fixture.cjs')();const password=randomBytes(24).toString('hex');
 await source.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const user of users)user.password=password;values.platformUsers=JSON.stringify(users);values.backupSettings='{"enabled":false}';const master=JSON.parse(values.masterDataControl);master.active.AB.products=[{code:'SYN',name:'Synthetic',category:'Synthetic',line:'A',stages:['S']}];master.active.AB.categoryGroups=[{name:'Synthetic',line:'A',defaultStages:['S']}];values.masterDataControl=JSON.stringify(master);});
 fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomBytes(48).toString('hex'),DEMO_LOGIN_ENABLED:'false'}});
 const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');for(const [key,bytes]of source.objects)await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
 const initial=source.db.prepare('SELECT * FROM shared_state').get();await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').bind(initial.revision,initial.values,initial.updated_at).run();
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--disable-background-networking']});const origin=fixture.url.origin;
 for(let round=1;round<=3;round++)for(const versioned of [false,true]){
  stage='round '+round+' '+(versioned?'versioned':'compatible');const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:900}});
  const login=await context.request.post(origin+'/api/platform-login',{data:{id:'editor',password},headers:{Origin:origin}});assert.equal(login.status(),200);
  let release,seen;const held=new Promise(resolve=>{seen=resolve;}),gate=new Promise(resolve=>{release=resolve;});let first=true;
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!['GET','HEAD'].includes(req.method())){writes.push({path:url.pathname,method:req.method()});return route.abort();}
   if(url.pathname==='/api/process-bootstrap'&&!versioned){const headers={...req.headers()};delete headers['x-process-authoring'];return route.continue({headers});}
   if(first&&url.pathname==='/api/process-authoring/workflow'&&!url.searchParams.has('permissions')&&!url.searchParams.has('contentIssues')&&!url.searchParams.has('approvedOnly')){first=false;seen();await gate;}
   return route.continue();
  });
  const page=await context.newPage();lastPage=page;page.on('pageerror',()=>errors.push({stage}));const started=performance.now();
  await page.goto(origin+'/process/index.html?system=process&view=editor',{waitUntil:'domcontentloaded'});
  let timeout;try{await Promise.race([held,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('WORKFLOW_NOT_REQUESTED')),60000);})]);}finally{clearTimeout(timeout);}
  const blocked=await page.evaluate(()=>({ready:document.documentElement.dataset.processNavigationStatus==='ready',canEdit:window.ProcessAuthoringV3?.canEditLocalCanvas?.()===true}));assert.deepEqual(blocked,{ready:false,canEdit:false});release();
  await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready'&&document.documentElement.dataset.processDestinationReadyGeneration===document.documentElement.dataset.processDestinationGeneration&&window.ProcessAuthoringV3?.canEditLocalCanvas?.()===true,null,{timeout:60000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await page.evaluate(()=>({count:ProcessAuthoringV3.flow().working.workspaces.flatMap(w=>Object.values(w.stages).flat()).length,view:state.view,requests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/process-bootstrap')||r.name.includes('/api/process-authoring/workflow')).map(r=>({path:new URL(r.name).pathname,decodedBytes:r.decodedBodySize,duration:r.duration}))}));assert.equal(state.count,1000);assert.equal(state.view,'editor');
  rows.push({round,versioned,readyAndPaintMs:performance.now()-started,...state});await page.screenshot({path:out+'/'+round+'-'+(versioned?'versioned':'compatible')+'.png'});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(await fixture.db.prepare('SELECT * FROM shared_state').first(),{...initial});
 fs.writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',programCommit:fixture.programCommit,browser:browser.version(),rows,limits:['Generated local Worker data; not hosted/Office acceptance','Same current binary; header changes isolate bootstrap delivery only','Ready timer includes the identical explicit workflow admission assertion, navigation and two animation frames']},null,2));
 console.log(JSON.stringify({status:'PASS_AUTHORING_REAL_READY',rows}));
}catch(error){const failure={status:'FAIL',stage,name:error.name,kind:/WORKFLOW_NOT_REQUESTED/.test(error.message)?'WORKFLOW_NOT_REQUESTED':error.name==='AssertionError'?'ASSERTION':error.name==='TimeoutError'?'TIMEOUT':'OTHER'};try{failure.state=await lastPage?.evaluate(()=>({status:document.documentElement.dataset.processNavigationStatus,boot:!!document.querySelector('#process-boot'),module:!!window.ProcessAuthoringV3,canEdit:window.ProcessAuthoringV3?.canEditLocalCanvas?.()===true,count:window.ProcessAuthoringV3?.flow?.()?.working?.workspaces?.flatMap(w=>Object.values(w.stages).flat()).length}));await lastPage?.screenshot({path:out+'/failure.png'});}catch{}fs.writeFileSync(out+'/result.json',JSON.stringify(failure,null,2));console.error(JSON.stringify(failure));process.exitCode=1;}
finally{await browser?.close();await fixture?.close();source?.close();}
