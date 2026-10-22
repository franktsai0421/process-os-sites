/* oxlint-disable typescript/no-require-imports -- CommonJS is required by the existing fixture loader and browser runtime. */
// Isolated browser integration: real API handlers, SQLite and private-R2 fixture.
// No existing Local database, employee accounts, media or Production bindings are used.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const ts = require('typescript');
const {DatabaseSync} = require('node:sqlite');
const {webcrypto, randomUUID, createHash} = require('node:crypto');
const runtime = require('./browser-test-runtime.cjs');
process.chdir(runtime.repositoryRoot);
const {chromium} = require(runtime.playwrightModule);
function assertWorkspace(actual,expected,message){
  const compact=value=>{if(Array.isArray(value))return value.map(compact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,compact(item)]));
    return typeof value==='string'&&value.length>1024?'sha256:'+createHash('sha256').update(value).digest('hex'):value;};
  assert.deepEqual(compact(JSON.parse(actual)),compact(JSON.parse(expected)),message);
}
const db = new DatabaseSync(':memory:');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
const objects = new Map();
const env = {PROCESS_SESSION_SECRET:randomUUID(), DEMO_LOGIN_ENABLED:'true',
  DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},
    async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};}};},
    async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},
  STATE_ARCHIVE:{async put(key,value,options){objects.set(key,{value,options});},async head(key){return objects.has(key)?{}:null;},async get(key,options){const item=objects.get(key);if(!item)return null;const full=Buffer.from(item.value),rangeHeader=options?.range?.get('range'),match=/^bytes=(\d+)-(\d*)$/.exec(rangeHeader||'');const range=match?{offset:Number(match[1]),length:(match[2]?Number(match[2])+1:full.length)-Number(match[1])}:undefined;const body=range?full.subarray(range.offset,range.offset+range.length):item.value;return {text:async()=>typeof item.value==='string'?item.value:full.toString(),arrayBuffer:async()=>Uint8Array.from(full).buffer,body,httpMetadata:item.options?.httpMetadata,size:full.length,range};}}};
const lines=['A','B','C'].map(code=>({code,name:`Fixture ${code}`,stages:['CUT','ASSY','PACKING','FINAL'].map(stage=>({code:`${code}-${stage}`,name:`Fixture ${stage}`}))}));
const products=lines.flatMap(line=>['DTLN','OTHER'].map(category=>({code:`FIX-${line.code}-${category}`,name:`Fixture ${category}`,category,line:line.code,stages:line.stages.map(s=>s.code),unit:'pcs'})));
const canonical=require('../lib/canonical-data.mjs'),reviewedMaster=JSON.parse(canonical.materialize({},canonical.readPackage(runtime.repositoryRoot).domains).masterDataControl);
const representatives=['B','C'].map(line=>{
  const scope=reviewedMaster.active[line==='C'?'C':'AB'],category=scope.products.find(p=>p.line===line).category;
  const required=new Set(scope.products.filter(p=>p.line===line&&p.category===category).flatMap(p=>p.stages));
  const stages=scope.lines.find(item=>item.code===line).stages.filter(stage=>required.has(stage.code));
  const fixtureLine=lines.find(item=>item.code===line);
  for(const stage of stages)if(!fixtureLine.stages.some(item=>item.code===stage.code))fixtureLine.stages.push({code:stage.code,name:`Fixture ${stage.code}`});
  products.push({code:`FIX-REP-${line}`,name:`Fixture ${line}`,category,line,stages:stages.map(stage=>stage.code),unit:'pcs'});
  return {line,category,stageCodes:stages.map(stage=>stage.code)};
});
const active={AB:{name:'Fixture AB',lines:lines.slice(0,2),products:products.filter(p=>p.line!=='C')},C:{name:'Fixture C',lines:lines.slice(2),products:products.filter(p=>p.line==='C')},PROCESS:{}};
for(const line of lines)for(const stage of line.stages)active.PROCESS[stage.code]=['entry','manual','manual-inspection','machine-assembly','exit'].map(presetKey=>({id:`${stage.code}-${presetKey}`,presetKey,name:presetKey,mode:'manual',people:0,machineIds:[],mediaItems:[]}));
const views=['dashboard','player','dispatch','productStatus','approval','editor','data'];
const control={active,versions:['AB','C','PROCESS'].map(scope=>({id:`FIX-MD-${scope}`,scope,number:1,status:'approved',snapshot:active[scope],createdAt:'2026-01-01',updatedAt:'2026-01-01',creatorId:'fixture',creatorName:'Fixture',history:[]}))};
const seed={revision:1,values:{platformUsers:JSON.stringify(['admin','rd','staff'].map(role=>({id:`demo-${role}`,name:`Demo ${role}`,role,authMode:'demo',enabled:true,views,lines:['A','B','C']}))),
  masterDataControl:JSON.stringify(control),processMasterData:JSON.stringify(active.PROCESS),approvalVersions:'[]',dispatchBoard:'{}',versionSampleSeed4:'true'}};
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(1,JSON.stringify(seed.values),'fixture');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const fixtureModule={exports:{}};cache.set(file,fixtureModule.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require(id){if(id==='cloudflare:workers')return {env};if(id==='@/db/seed.json')return seed;
    const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},
    Request,Response,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,console});return fixtureModule.exports;}
const core=load('lib/process-state.ts');
const apis={'/api/shared-state':load('app/api/shared-state/route.ts'),'/api/platform-login':load('app/api/platform-login/route.ts'),'/api/state-media':load('app/api/state-media/route.ts')};
let baselineMode=false;
const baselineAssets=new Map();
if(process.argv.includes('--perf-only')){
  for(const file of ['index.html','shared-state.js','version-workflow.js','editor-version-guard.js','app.js','data-safety-ui.js','system-upgrade.js'])baselineAssets.set('/process/'+file,require('node:child_process').execFileSync('git',['show','origin/main:public/process/'+file]));
}
let rejectSave=false, writeDelay=0, origin, raceGate=null;
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin), api=apis[url.pathname];
  if(baselineMode&&url.pathname==='/process/')url.pathname='/process/index.html';
  if(baselineMode&&baselineAssets.has(url.pathname)){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.html')?'text/html':'text/javascript'});res.end(baselineAssets.get(url.pathname));return;}
  if(api){const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(url.pathname==='/api/shared-state'&&req.method==='POST'){
      if(rejectSave){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Fixture unavailable"}');return;}
      if(writeDelay)await new Promise(resolve=>setTimeout(resolve,writeDelay));
    }
    const response=await api[req.method](new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
    if(raceGate&&url.pathname==='/api/shared-state'&&req.method==='POST'){
      raceGate.started++;
      await new Promise(resolve=>{raceGate.release=resolve;});
      raceGate.release=null;
    }
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname.startsWith('/api/')){res.writeHead(403);res.end('{}');return;}
  const root=path.resolve('public'), file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(error){console.error(error.message);res.writeHead(500);res.end('Fixture error');}});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    if(process.argv.includes('--media-only')){
      const {mediaState,digest}=load('lib/state-media.ts');
      const bytes=require('node:crypto').randomBytes(1024*1024),uri='data:image/png;base64,'+bytes.toString('base64');
      const source={revision:3,values:{platformUsers:seed.values.platformUsers,'processEditor:fixture:A':JSON.stringify({stages:{'A-CUT':[{mediaItems:[{src:uri}],productMediaItems:{FIX:[{src:uri}]} }],'A-ASSY':[{media:uri}]}})}};
      const original=JSON.stringify(source),result=await mediaState(source),raw=JSON.parse(result.values['processEditor:fixture:A']),url=raw.stages['A-CUT'][0].mediaItems[0].src;
      assert.ok(JSON.stringify(result).length<original.length/100);assert.equal(JSON.stringify(source),original,'projection never rewrites source');
      const image=await apis['/api/state-media'].GET(new Request(origin+url));assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes,'exact original bytes');
      const restored=await load('lib/state-media.ts').restoreMediaUpdates(result.values);assert.deepEqual(JSON.parse(restored['processEditor:fixture:A']),JSON.parse(source.values['processEditor:fixture:A']),'transport URLs never alter stored media');
      const partial=await apis['/api/state-media'].GET(new Request(origin+url,{headers:{Range:'bytes=10-29'}}));assert.equal(partial.status,206);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(10,30),'video seeking byte range');
      const count=objects.size;assert.deepEqual(await mediaState(source),result);assert.equal(objects.size,count,'cache/dedup writes are idempotent');
      assert.equal((await apis['/api/state-media'].GET(new Request(origin+'/api/state-media?id=../secret'))).status,404);
      env.DEMO_LOGIN_ENABLED='false';assert.equal((await apis['/api/state-media'].GET(new Request(origin+url))).status,403);env.DEMO_LOGIN_ENABLED='true';
      const receipt=await load('lib/state-media.ts').writeReceipt(source,new Request(origin,{headers:{'X-Process-Receipt':'sha256'}}),{'processEditor:fixture:A':source.values['processEditor:fixture:A']});
      assert.equal(receipt.accepted['processEditor:fixture:A'],await digest(JSON.stringify(source.values['processEditor:fixture:A'])));
      const saved=await apis['/api/shared-state'].POST(new Request(origin+'/api/shared-state?manage=1',{method:'POST',headers:{'Content-Type':'application/json','X-Process-Receipt':'sha256'},body:JSON.stringify({baseRevision:1,updates:{'processEditor:fixture:A':result.values['processEditor:fixture:A']}})}));
      assert.equal(saved.status,200);assert.equal((await core.readState()).values['processEditor:fixture:A'],source.values['processEditor:fixture:A'],'real POST preserves original data-URI storage');
      console.log('PASS: immutable byte-exact media, >99% projected payload reduction, source unchanged, cache/dedup, traversal/auth refusal, exact hashed write receipt');return;
    }
    browser=await chromium.launch({headless:true,executablePath:runtime.browserExecutable});
    if(process.argv.includes('--perf-only')){
      assert.ok(process.env.PROCESS_PERF_SNAPSHOT,'explicit ignored snapshot fixture required');
      const snapshot=JSON.parse(fs.readFileSync(process.env.PROCESS_PERF_SNAPSHOT,'utf8'));
      snapshot.values.platformUsers=seed.values.platformUsers;
      db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(snapshot.revision,JSON.stringify(snapshot.values));
      const timings=[];
      for(const before of [true,false]){
        baselineMode=before;const ctx=await browser.newContext(),p=await ctx.newPage(),cdp=await ctx.newCDPSession(p);
        await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:10*1024*1024/8});
        await p.route('**/api/shared-state',route=>route.request().method()==='POST'?route.abort():route.continue());
        const start=performance.now();await p.goto(origin+'/process/',{timeout:120000});await p.locator('[data-quick-login=admin]').waitFor({state:'visible',timeout:120000});
        if(!before)await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-process-boot'));
        timings.push({variant:before?'main-before':'candidate',readyMs:Math.round(performance.now()-start),...await p.evaluate(()=>({paintMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0),shared:performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/shared-state')).map(r=>({ms:Math.round(r.duration),bytes:r.encodedBodySize}))}))});
        await ctx.close();
      }
      fs.writeFileSync('work/performance-comparison.json',JSON.stringify(timings,null,2));console.log(JSON.stringify(timings));return;
    }
    const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    page.setDefaultTimeout(30000);
    await page.goto(origin+'/process/');await page.locator('[data-quick-login=admin]').click();
    async function navigate(view){if(await page.locator('#menu-toggle').isVisible()&&!await page.locator('.sidebar.open').count())await page.locator('#menu-toggle').click();await page.locator(`.nav-item[data-view=${view}]`).click();await page.locator('#page-title').waitFor({state:'visible'});}
    async function select(line,category='DTLN'){await navigate('editor');await page.locator('#editor-line-select').selectOption(line);await page.locator('#category-select').selectOption(category);}
    async function settled(){await page.waitForFunction(()=>window.ProcessSync.status==='saved');assert.equal(await page.evaluate(()=>window.ProcessSync.flush()),true);}
    const expected=new Map();
    const evidence=[];
    async function concurrentBrowserSave(){
      await select('A');await settled();
      await page.evaluate(()=>{
        const stages=Object.fromEntries(['A-CUT','A-ASSY','A-PACKING','A-FINAL'].map((code,stage)=>[code,Array.from({length:[4,3,2,2][stage]},(_,index)=>{
          const op=newOperation(code,index+1);op.id=`RACE-${code}-${index}`;op.name=`Race ${code} ${index}`;
          op.x=80+index*120;op.y=100+stage*90;op.productCodes=['FIX-A-DTLN'];op.bomProductCode='FIX-A-DTLN';
          op.bomSelections={'FIX-A-DTLN':['SAFE-BOM-FIXTURE']};op.bomItems=['SAFE-BOM-FIXTURE'];
          op.mediaItems=[{name:'Race fixture',type:'image/svg+xml',src:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>')}];
          op.nextIds=index<[4,3,2,2][stage]-1?[`RACE-${code}-${index+1}`]:[];return op;
        })]));
        state.editorByCategory[editorKey()]=stages;state.editorVersionId=null;state.selectedOperation=null;render();
        window.fixtureSaveMessages=[];const originalToast=toast;toast=message=>{window.fixtureSaveMessages.push(message);originalToast(message);};
      });
      await page.locator('.operation-block[data-operation="RACE-A-CUT-0"] .operation-number').click();
      await page.locator('#operation-name').fill('First stage modified before Save');
      await page.locator('#apply-operation').click();await settled();
      raceGate={started:0,release:null};
      const waitRound=async round=>{await new Promise((resolve,reject)=>{const deadline=Date.now()+30000;const poll=()=>{if(raceGate.started>=round&&raceGate.release)return resolve();if(Date.now()>deadline)return reject(Error('SYNC_RACE_ROUND_TIMEOUT'));setTimeout(poll,10);};poll();});};
      const draftSuccess=()=>page.evaluate(()=>window.fixtureSaveMessages.filter(message=>message==='草稿已儲存，可檢查後再送審').length);
      await page.locator('#save-process').click();await waitRound(1);
      assert.equal(await draftSuccess(),0,'draft success is absent while first response is held');
      assert.ok(await page.locator('#save-process').isDisabled());
      await page.locator('.operation-block[data-operation="RACE-A-ASSY-0"] .operation-number').click();
      await page.locator('#operation-name').fill('Second stage modified while request pending');
      await page.locator('#apply-operation').click();
      const expectedRace=await page.evaluate(()=>JSON.stringify(ensureCategoryEditor()));
      assert.ok(JSON.parse(expectedRace)['A-FINAL'][0].bomItems.includes('SAFE-BOM-FIXTURE'),'a nonempty safe BOM fixture is included in persistence checks');
      raceGate.release();await waitRound(2);
      assert.equal(await draftSuccess(),0,'old response cannot complete Save before later dirty write');
      assert.equal(await page.evaluate(()=>ensureCategoryEditor()['A-ASSY'][0].name),'Second stage modified while request pending','old response does not overwrite in-page edit');
      raceGate.release();await page.waitForFunction(()=>window.fixtureSaveMessages.includes('草稿已儲存，可檢查後再送審'));await settled();
      const rounds=raceGate.started;raceGate=null;
      assert.ok(rounds>=2,'later modification has a separate durable write');
      const durable=await core.readState();assertWorkspace(JSON.stringify(JSON.parse(durable.values['processEditor:DTLN:A']).stages),expectedRace,'both edits, BOM, media, positions and links persist');
      assert.equal(await page.locator('.operation-block').count(),11);
      await page.reload();await select('A');assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),expectedRace,'race refresh');
      await page.locator('#account-button').click();await page.locator('#logout-button').click();await page.locator('[data-quick-login=admin]').click();await page.locator('.nav-item[data-view=editor]').waitFor();
      await select('A');assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),expectedRace,'race logout/login');
      const result={result:'PASS',rounds,flows:11,firstEdit:'First stage modified before Save',secondEdit:'Second stage modified while request pending',refresh:'PASS',logoutLogin:'PASS',successAfterDrain:'PASS',oldResponseOverwrite:'PASS',bomMediaPositionsLinks:'PASS'};
      fs.mkdirSync('work/editor-draft-validation',{recursive:true});fs.writeFileSync('work/editor-draft-validation/race-results.json',JSON.stringify(result,null,2));
      console.log('PASS: actual browser edits during held responses, queued drain, success timing, 11 flows, BOM/media/positions/links, refresh and logout/login');
      return result;
    }
    if(process.argv.includes('--race-only')){await concurrentBrowserSave();return;}
    if(process.argv.includes('--workflow-only')){
      // Real handlers and separate signed accounts; never use a production record.
      async function login(target,role){await target.goto(origin+'/process/');await target.locator(`[data-quick-login=${role}]`).click();await target.waitForFunction(()=>currentUser?.authMode==='demo');}
      async function choose(target,line){await target.locator('.nav-item[data-view=editor]').click();await target.locator('#editor-line-select').selectOption(line);await target.locator('#category-select').selectOption('DTLN');}
      const staffState=JSON.parse((await core.readState()).values.platformUsers);
      const staff=staffState.find(u=>u.role==='staff');staff.inheritRole=false;staff.lines=['A','B','C'];staff.permissions=['approval.submit','approval.withdraw','approval.viewAll','approval.compare','approval.revise'];
      db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify({...seed.values,platformUsers:JSON.stringify(staffState)}));
      const staffContext=await browser.newContext({viewport:{width:1366,height:900}}),staffPage=await staffContext.newPage();await login(staffPage,'operator');
      const records=[];
      for(const line of ['A','B','C']){
        await choose(staffPage,line);
        await staffPage.evaluate(line=>{
          const code=`FIX-${line}-DTLN`,stages=Object.fromEntries(routeFor(code).stages.map(stage=>[stage,[0,1].map(i=>{
            const op=newOperation(stage,i+1);op.id=`WF-${stage}-${i}`;op.name=`${stage} 文字 ${i}`;op.mode='manual';op.productCodes=[code];
            op.instructionSteps=[{text:'第一步',standard:'標準一'},{text:'第二步',standard:'標準二'}];op.productInstructionSteps={[code]:[{text:'補充',standard:'補充標準'}]};op.noteProductCode=code;op.productInstructions={};
            const photo={src:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'),type:'image/svg+xml',name:'Fixture photo'};op.mediaItems=[photo];op.productMediaItems={[code]:[photo]};
            op.nextIds=i===0?[`WF-${stage}-1`]:[];op.bomSelections={[code]:rootBom(code).map(x=>x.itemCode)};return op;
          })]));state.editorByCategory[editorKey()]=normalizeEditorData(stages);state.editorVersionId=null;state.selectedOperation=null;render();
        },line);
        await staffPage.locator('#save-process').click();await staffPage.waitForFunction(()=>document.querySelector('#toast').textContent.includes('草稿已儲存'));
        const record=await staffPage.evaluate(()=>({id:state.editorVersionId,stages:JSON.stringify(ensureCategoryEditor())}));record.line=line;records.push(record);
        await staffPage.reload();await choose(staffPage,line);assertWorkspace(await staffPage.evaluate(()=>JSON.stringify(ensureCategoryEditor())),record.stages,'staff saved stages after reopen');
        if(line==='A'){
          rejectSave=true;await staffPage.locator('#submit-version').click();await staffPage.waitForFunction(()=>document.querySelector('#toast').textContent.includes('原狀態已保留'));
          assert.equal(await staffPage.evaluate(id=>approvalVersions.find(v=>v.id===id).status,record.id),'draft');rejectSave=false;
        }
        await staffPage.locator('#submit-version').click();await staffPage.waitForFunction(id=>approvalVersions.find(v=>v.id===id)?.status==='pending',record.id);
        const durable=JSON.parse((await core.readState()).values.approvalVersions).find(v=>v.id===record.id);
        assert.equal(durable.history.filter(h=>h.action==='submitted').length,1,'failed submit/retry produces one submission');
        assertWorkspace(JSON.stringify(durable.stages),record.stages,'submitted complete snapshot');
      }
      // Fully close the editing context, then review using a different account.
      await staffContext.close();
      const reviewContext=await browser.newContext(),reviewPage=await reviewContext.newPage();await login(reviewPage,'rd');
      for(const record of records){
        await reviewPage.evaluate(async id=>{state.approvalVersionId=id;state.approvalTab='process';await navigate('approval');},record.id);
        await reviewPage.waitForSelector('[data-version-action=approve]');
        if(record.line==='A'){
          rejectSave=true;await reviewPage.locator('[data-version-action=approve]').click();await reviewPage.waitForFunction(()=>document.querySelector('#toast').textContent.includes('原狀態已保留'));
          assert.equal(await reviewPage.evaluate(id=>approvalVersions.find(v=>v.id===id).status,record.id),'pending');rejectSave=false;
        }
        await reviewPage.locator('[data-version-action=approve]').click();await reviewPage.waitForFunction(id=>approvalVersions.find(v=>v.id===id)?.status==='approved',record.id);
        await reviewPage.reload();await reviewPage.waitForFunction(()=>!document.documentElement.hasAttribute('data-process-boot'));
        const version=await reviewPage.evaluate(id=>approvalVersions.find(v=>v.id===id),record.id);
        assertWorkspace(JSON.stringify(version.stages),record.stages,'approved snapshot after reload');assert.equal(version.history.filter(h=>h.action==='approved').length,1);
      }
      await reviewContext.close();
      const reopened=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),phone=await reopened.newPage();await login(phone,'operator');
      for(const record of records){
        assert.equal(await phone.evaluate(id=>approvalVersions.find(v=>v.id===id)?.status,record.id),'approved','new browser reads approved status');
        assert.equal(await phone.evaluate(({line})=>window.ProcessVersionValidation.dispatchReadiness(`FIX-${line}-DTLN`,line).ok,record),true,'approved version effective in production');
      }
      // Stale editor cannot replace another account's revision.
      await phone.evaluate(()=>{const version=approvalVersions.find(v=>v.line==='B');version.reviewNote='stale fixture';localStorage.setItem('approvalVersions',JSON.stringify(approvalVersions));});
      const concurrent=await core.readState(),concurrentVersions=JSON.parse(concurrent.values.approvalVersions),concurrentVersion=concurrentVersions.find(v=>v.line==='B');
      concurrentVersion.reviewNote='other writer fixture';
      db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await core.encodeValues({...concurrent.values,approvalVersions:JSON.stringify(concurrentVersions)}));
      assert.equal(await phone.evaluate(()=>window.ProcessSync.flush()),false);assert.equal(await phone.evaluate(()=>window.ProcessSync.status),'conflict');
      const durableVersions=JSON.parse((await core.readState()).values.approvalVersions);
      assert.ok(!durableVersions.some(v=>v.reviewNote==='stale fixture'));assert.equal(durableVersions.find(v=>v.line==='B').reviewNote,'other writer fixture');
      await reopened.close();
      console.log('PASS: staff A/B/C complete steps/order -> durable Save -> failed/retried single Submit -> separate RD failed/retried Approve -> browser close/reopen -> effective dispatch; stale revision rejected; iPhone signed login.');return;
    }
    for(const line of ['A','B','C']){
      await select(line);
      await page.evaluate(line=>{
        const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="green"/><!--'+'F'.repeat(700*1024)+'--></svg>');
        const required=new Set(categoryStageCodes(state.category));
        const stages=Object.fromEntries(lineFor(line).stages.filter(stage=>required.has(stage.code)).map((stage,stageIndex)=>[stage.code,Array.from({length:line==='A'?[4,3,2,2][stageIndex]:2},(_,index)=>{
          const op=newOperation(stage.code,index+1);op.id=`FIX-${stage.code}-${index}`;op.instructions='Fixture guidance';op.instructionSteps=[{text:'Fixture action',standard:'Fixture standard'}];op.productCodes=[];
          op.mediaItems=[{src:svg,type:'image/svg+xml',name:'Fixture photo'}];const count=line==='A'?[4,3,2,2][stageIndex]:2;op.nextIds=index<count-1?[`FIX-${stage.code}-${index+1}`]:[];return op;
        })]));state.editorByCategory[editorKey()]=normalizeEditorData(stages);state.editorVersionId=null;state.selectedOperation=Object.values(stages).flat()[0].id;render();
        if(!localStorage.getItem('fixture-quota'))localStorage.setItem('fixture-quota','F'.repeat(4*1024*1024));
      },line);
      writeDelay=100;await page.locator('#save-process').click();await settled();writeDelay=0;
      assert.equal(await page.locator('.operation-block').count(),line==='A'?11:8);
      assert.match(await page.locator('.editor-version-timeline header').innerText(),/1/,'saved version count is nonzero');
      expected.set(line,await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())));
      evidence.push({line,category:'DTLN',beforeVersions:0,afterVersions:1,stages:4,beforeFlows:line==='A'?11:8,afterFlows:line==='A'?11:8,ids:Object.values(JSON.parse(expected.get(line))).flat().map(op=>op.id)});
      const durable=await core.readState();assertWorkspace(JSON.stringify(JSON.parse(durable.values[`processEditor:DTLN:${line}`]).stages),expected.get(line),'complete durable workspace');
      assert.equal(JSON.parse(durable.values.approvalVersions).filter(v=>v.category==='DTLN'&&v.line===line).length,1);
      await page.reload();await select(line);assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),expected.get(line),'refresh preserves all nodes, links and photos');
    }
    assert.ok(objects.size>0,'large photo snapshots are stored by the real private-R2 serializer');
    for(const representative of representatives){
      await select(representative.line,representative.category);
      await page.evaluate(({stageCodes})=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const c=canvas.getContext('2d');c.fillStyle='blue';c.fillRect(0,0,16,16);const photo=canvas.toDataURL('image/png');
        const stages=Object.fromEntries(stageCodes.map(stageCode=>[stageCode,[0,1].map(index=>{const op=newOperation(stageCode,index+1);op.id=`REP-${stageCode}-${index}`;op.productCodes=[];op.instructionSteps=[{text:'Representative fixture',standard:'Fixture standard'}];op.mediaItems=[{src:photo,type:'image/png',name:'Fixture photo'}];op.nextIds=index===0?[`REP-${stageCode}-1`]:[];return op;})]));
        state.editorByCategory[editorKey()]=normalizeEditorData(stages);state.selectedOperation=Object.values(stages).flat()[0].id;render();
      },representative);
      const before=await page.evaluate(()=>JSON.stringify(ensureCategoryEditor()));
      await page.locator('#save-process').click();await settled();await page.reload();await select(representative.line,representative.category);
      assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),before,'existing B/C category refresh');
      await page.locator('#account-button').click();await page.locator('#logout-button').click();await page.locator('[data-quick-login=admin]').click();await page.locator('.nav-item[data-view=editor]').waitFor({state:'visible'});
      await select(representative.line,representative.category);assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),before,'existing B/C category logout/login');
      const durable=await core.readState(),key=`processEditor:${representative.category}:${representative.line}`;
      assertWorkspace(JSON.stringify(JSON.parse(durable.values[key]).stages),before,'existing category complete durable snapshot');
      assert.equal(JSON.parse(durable.values.approvalVersions).filter(v=>v.category===representative.category&&v.line===representative.line).length,1);
      evidence.push({...representative,beforeVersions:0,afterVersions:1,beforeFlows:representative.stageCodes.length*2,afterFlows:representative.stageCodes.length*2,ids:Object.values(JSON.parse(before)).flat().map(op=>op.id)});
    }
    // Operation Apply advances the workspace without a version Save; reopening must keep it.
    await select('A');
    await page.evaluate(()=>{const op=ensureCategoryEditor()['A-FINAL'][1];op.instructions='Newer workspace fixture';state.selectedOperation=op.id;render();});
    await page.locator('.operation-block[data-operation="FIX-A-FINAL-1"] .operation-number').click();
    await page.locator('#apply-operation').click();await settled();
    expected.set('A',await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())));
    await page.reload();await select('A');assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),expected.get('A'),'newer applied workspace survives older version auto-open');
    // Save a distinct category and a revision, preserving the earlier version snapshots.
    await select('A','OTHER');await page.locator('#save-process').click();await settled();
    await select('B');
    await page.evaluate(()=>{const parent=state.editorVersionId;state.editorVersionId='revision:'+parent;render();});
    await page.locator('#save-process').click();await settled();
    assert.equal(JSON.parse((await core.readState()).values.approvalVersions).filter(v=>v.category==='DTLN'&&v.line==='B').length,2);
    await page.locator('#account-button').click();await page.locator('#logout-button').click();
    await page.locator('[data-quick-login=admin]').click();await page.locator('.nav-item[data-view=editor]').waitFor({state:'visible'});await page.reload();
    for(const line of ['A','B','C']){await select(line);assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),expected.get(line),'logout/login preserves workspace');}
    await page.locator('.top-actions .language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='vi');
    rejectSave=true;
    await page.evaluate(()=>{ensureCategoryEditor()['C-FINAL'][1].instructions='Failed-save fixture';});
    await page.locator('#save-process').click();await page.waitForFunction(()=>window.ProcessSync.status==='offline');
    const notice=page.locator('#toast');await notice.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('máy chủ'));
    assert.doesNotMatch(await notice.innerText(),/[\u3400-\u9fff]/,'Vietnamese failure contains no Chinese');
    rejectSave=false;await page.locator('#save-process').click();await settled();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Bản nháp'));
    assert.doesNotMatch(await notice.innerText(),/[\u3400-\u9fff]/,'Vietnamese success contains no Chinese');
    // Real file upload and a failed decode, using generated images kept in memory.
    await page.locator('.operation-block[data-operation="FIX-C-FINAL-1"] .operation-number').click();
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const c=canvas.getContext('2d');c.fillStyle='green';c.fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];});
    await page.locator('#operation-media').setInputFiles([{name:'fixture-1.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},{name:'fixture-2.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}]);
    await page.waitForFunction(()=>ensureCategoryEditor()['C-FINAL'][1].mediaItems.length===3);
    await page.locator('#apply-operation').click();await settled();
    await page.locator('#save-process').click();await settled();
    const withPhotos=await page.evaluate(()=>JSON.stringify(ensureCategoryEditor()));
    await page.reload();await select('C');assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),withPhotos,'uploaded raster photos survive refresh');
    await page.locator('#account-button').click();await page.locator('#logout-button').click();await page.locator('[data-quick-login=admin]').click();await page.locator('.nav-item[data-view=editor]').waitFor({state:'visible'});
    await select('C');assertWorkspace(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),withPhotos,'uploaded raster photos survive logout/login');
    await page.locator('.operation-block[data-operation="FIX-C-FINAL-1"] .operation-number').click();
    const priorMedia=await page.evaluate(()=>ensureCategoryEditor()['C-FINAL'][1].mediaItems.length);
    await page.locator('#operation-media').setInputFiles({name:'invalid-fixture.png',mimeType:'image/png',buffer:Buffer.from('invalid fixture')});
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('JPG'));
    assert.equal(await page.evaluate(()=>ensureCategoryEditor()['C-FINAL'][1].mediaItems.length),priorMedia,'failed upload never adds a partial photo');
    assert.doesNotMatch(await notice.innerText(),/已儲存|đã được lưu|Đã lưu/,'failed upload cannot report full success');
    assert.doesNotMatch(await notice.innerText(),/[\u3400-\u9fff]/,'Vietnamese upload failure contains no Chinese');
    await page.locator('[data-editor-cancel]').click();
    await page.locator('.top-language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='zh-Hant');
    await page.locator('#save-process').click();await settled();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('草稿已儲存'));
    assert.doesNotMatch(await notice.innerText(),/Bản nháp/,'Chinese success contains no Vietnamese');
    for(const width of [1366,390]){
      await page.setViewportSize({width,height:844});
      for(const view of views){await navigate(view);assert.ok((await page.locator('#view-root').innerText()).trim(),'page is not blank');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${view} at ${width} has no document overflow`);}
      await select('A');const save=page.locator('#save-process');await save.scrollIntoViewIfNeeded();
      assert.ok(await save.isVisible());await save.focus();assert.equal(await save.evaluate(element=>element===document.activeElement),true);
      const bounds=await save.boundingBox();assert.ok(bounds.width>=44&&bounds.height>=40,'save remains a reachable touch target');
      await page.locator('.operation-block').first().locator('.operation-number').click();
      const apply=page.locator('#apply-operation');await apply.scrollIntoViewIfNeeded();assert.ok(await apply.isVisible());
      await page.locator('#process-operation-dialog textarea').first().focus();
      await page.setViewportSize({width,height:540});await apply.scrollIntoViewIfNeeded();assert.ok(await apply.isVisible(),'Apply reachable with reduced keyboard viewport');
      await page.locator('#process-operation-dialog .editor-modal-close').click();await page.setViewportSize({width,height:844});
      fs.mkdirSync('work/editor-draft-validation',{recursive:true});await page.screenshot({path:`work/editor-draft-validation/editor-${width}.png`});
    }
    assert.deepEqual(errors,[],'no uncaught page errors');
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('processEditor:')||key==='approvalVersions')),[],'business photos bypass native browser storage');
    // A missing server draft is preserved across a failed migration, then verified.
    const old=JSON.parse((await core.readState()).values['processEditor:DTLN:C']);old.category='OTHER';
    const legacyPhotos=saved=>Object.values(saved.stages).flat().forEach(op=>{op.mediaItems=(op.mediaItems||[]).map(item=>({...item,src:'data:image/png;base64,'+png,type:'image/png'}));if(op.media){op.media='data:image/png;base64,'+png;op.mediaType='image/png';}});
    legacyPhotos(old);
    const oldKey='processEditor:OTHER:C',legacyContext=await browser.newContext(),legacyPage=await legacyContext.newPage();legacyPage.on('dialog',dialog=>dialog.accept());
    await legacyContext.addInitScript(({key,value})=>{if(!sessionStorage.getItem('fixture-legacy-created')){localStorage.setItem(key,value);sessionStorage.setItem('fixture-legacy-created','1');}},{key:oldKey,value:JSON.stringify(old)});
    await legacyPage.goto(origin+'/process/');assert.equal(await legacyPage.evaluate(key=>Object.keys(localStorage).includes(key),oldKey),true,'old draft remains on initial load');
    rejectSave=true;await legacyPage.locator('[data-quick-login=admin]').click();await legacyPage.waitForFunction(()=>window.ProcessSync.status==='offline');
    assert.equal(await legacyPage.evaluate(key=>Object.keys(localStorage).includes(key),oldKey),true,'failed migration retains old cache');
    rejectSave=false;await legacyPage.locator('.nav-item[data-view=editor]').click();await legacyPage.locator('#editor-line-select').selectOption('C');await legacyPage.locator('#category-select').selectOption('OTHER');
    await legacyPage.locator('#save-process').click();await legacyPage.waitForFunction(()=>window.ProcessSync.status==='saved');
    assertWorkspace(JSON.stringify(JSON.parse((await core.readState()).values[oldKey]).stages),JSON.stringify(old.stages),'old draft migrates without stage/node/media loss');
    assert.equal(await legacyPage.evaluate(key=>Object.keys(localStorage).includes(key),oldKey),false,'verified complete migration clears only its old cache');await legacyContext.close();
    // A conflicting browser snapshot is offered for explicit recovery.
    const conflict=JSON.parse((await core.readState()).values['processEditor:DTLN:A']);conflict.stages['A-FINAL'][1].instructionSteps[0].text='Recovered legacy fixture';
    legacyPhotos(conflict);
    const conflictContext=await browser.newContext(),conflictPage=await conflictContext.newPage();conflictPage.on('dialog',dialog=>dialog.accept());
    await conflictContext.addInitScript(value=>localStorage.setItem('processEditor:DTLN:A',value),JSON.stringify(conflict));
    await conflictPage.goto(origin+'/process/');await conflictPage.locator('[data-quick-login=admin]').click();await conflictPage.locator('.nav-item[data-view=editor]').click();
    await conflictPage.locator('#editor-line-select').selectOption('A');await conflictPage.locator('#category-select').selectOption('DTLN');
    assert.notEqual(await conflictPage.evaluate(()=>ensureCategoryEditor()['A-FINAL'][1].instructionSteps[0].text),'Recovered legacy fixture','old cache does not silently replace server draft');
    await conflictPage.locator('.editor-version-panel button').filter({hasText:'復原此瀏覽器的舊草稿'}).click();await conflictPage.locator('#save-process').click();await conflictPage.waitForFunction(()=>window.ProcessSync.status==='saved');
    assertWorkspace(JSON.stringify(JSON.parse((await core.readState()).values['processEditor:DTLN:A']).stages),JSON.stringify(conflict.stages),'explicit recovery saves complete old draft');
    assert.equal(await conflictPage.evaluate(()=>Object.keys(localStorage).includes('processEditor:DTLN:A')),false);await conflictContext.close();
    const failedContext=await browser.newContext(),failedPage=await failedContext.newPage();
    await failedContext.route('**/api/shared-state',route=>route.fulfill({status:503,json:{error:'Fixture unavailable'}}));await failedPage.goto(origin+'/process/');
    await failedPage.locator('[role=alert]').waitFor();assert.ok(await failedPage.locator('#retry-page-load').isVisible(),'failed initial load displays an error and recovery action');
    assert.equal(await failedPage.evaluate(()=>window.ProcessSync.flush()),false,'unavailable initial data cannot be overwritten');await failedContext.close();
    const renderContext=await browser.newContext(),renderPage=await renderContext.newPage();await renderPage.goto(origin+'/process/');await renderPage.locator('[data-quick-login=admin]').click();await renderPage.locator('.nav-item[data-view=editor]').waitFor();
    await renderPage.evaluate(()=>{dashboard=()=>{throw Error('Fixture render failure');};state.view='dashboard';render();});await renderPage.locator('[role=alert]').waitFor();await renderContext.close();
    fs.writeFileSync('work/editor-draft-validation/results.json',JSON.stringify({evidence,legacyMigration:'PASS',explicitRecovery:'PASS',failedInitialLoad:'PASS',renderError:'PASS',photos:'PASS generated PNG/WebP and >5 MiB SVG fixtures',languages:{zh:'PASS',vi:'PASS',en:'Not available: application has only zh/vi modes'}},null,2));
    console.log('PASS: real API/SQLite/R2 browser integration; complete DTLN A/B/C drafts, counts, versions/category isolation, refresh, logout/login, newer workspace, >5 MiB photos, quota, Vietnamese success/failure, retry, seven pages and desktop/iPhone actions.');
    console.log(`Local isolated acceptance URL: ${origin}/process/ (synthetic fixtures only)`);
  }finally{await browser?.close();if(!process.argv.includes('--serve'))await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
