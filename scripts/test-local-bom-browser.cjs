/* oxlint-disable typescript/no-require-imports -- CommonJS is required by the existing fixture loader and browser runtime. */
// Isolated browser integration: real API handlers, SQLite and private-R2 fixture.
// No existing Local database, employee accounts, media or Production bindings are used.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const ts = require('typescript');
const {DatabaseSync} = require('node:sqlite');
const {webcrypto, randomUUID} = require('node:crypto');
const runtime = require('./browser-test-runtime.cjs');
process.chdir(runtime.repositoryRoot);
const {chromium} = require(runtime.playwrightModule);
const db = new DatabaseSync(':memory:');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
const objects = new Map();
const env = {PROCESS_SESSION_SECRET:randomUUID(), DEMO_LOGIN_ENABLED:'true',
  DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},
    async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};}};},
    async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},
  STATE_ARCHIVE:{async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{text:async()=>Buffer.from(objects.get(key)).toString(),arrayBuffer:async()=>Uint8Array.from(Buffer.from(objects.get(key))).buffer}:null;}}};
const views=['dashboard','player','dispatch','productStatus','approval','editor','data'];
const seed={revision:1,values:{platformUsers:JSON.stringify(['admin','rd','staff'].map(role=>({id:`demo-${role}`,name:`Demo ${role}`,role,authMode:'demo',enabled:true,views,lines:['A','B','C']})))}};
if(process.argv[2]){
  Object.assign(seed.values,JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
}else{
  // Reproducible default uses only the versioned, sanitized Canonical package.
  const canonical=require('../lib/canonical-data.mjs');
  Object.assign(seed.values,canonical.materialize({},canonical.readPackage(runtime.repositoryRoot).domains));
  const version=JSON.parse(seed.values.approvalVersions).find(v=>v.category==='BORUAXE1021'&&v.line==='A');
  assert.ok(version,'Canonical contains the existing BORUAXE1021 workspace fixture');
  seed.values['processEditor:BORUAXE1021:A']=JSON.stringify({category:version.category,line:version.line,stages:version.stages,savedAt:'2099-01-01T00:00:00.000Z'});
  seed.values.versionSampleSeed4='true';
}
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(1,JSON.stringify(seed.values),'fixture');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const fixtureModule={exports:{}};cache.set(file,fixtureModule.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require(id){if(id==='cloudflare:workers')return {env};if(id==='@/db/seed.json')return seed;
    const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},
    Request,Response,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,console});return fixtureModule.exports;}
const core=load('lib/process-state.ts');
const apis={'/api/shared-state':load('app/api/shared-state/route.ts'),'/api/platform-login':load('app/api/platform-login/route.ts')};
const rejectSave=false, writeDelay=0, raceGate=null;let origin;
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin), api=apis[url.pathname];
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
  browser=await chromium.launch({headless:true,executablePath:runtime.browserExecutable});
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  await page.goto(origin+'/process/');await page.locator('[data-quick-login=admin]').click();
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:844});
   const stat=page.locator('.stat').filter({hasText:'BOM 對應產品'});
   assert.equal(await stat.locator('strong').innerText(),'330');
   assert.equal((await stat.locator('small').innerText()).replace(/[^0-9]/g,''),'6237');
   await page.reload({waitUntil:'networkidle'});
   assert.equal(await stat.locator('strong').innerText(),'330','reload preserves visible Canonical root count');
   assert.equal((await stat.locator('small').innerText()).replace(/[^0-9]/g,''),'6237','reload preserves visible Canonical row count');
  }
  await page.setViewportSize({width:1366,height:900});
  async function editor(line,category){
   if(await page.locator('#menu-toggle').isVisible()&&!await page.locator('.sidebar.open').count())await page.locator('#menu-toggle').click();
   await page.locator('.nav-item[data-view=editor]').click();await page.locator('#editor-line-select').selectOption(line);
   if(category)await page.locator('#category-select').selectOption(category);
  }
  await editor('A','BORUAXE1021');
  const expectedNodes=Object.values(JSON.parse(seed.values['processEditor:BORUAXE1021:A']).stages).flat().length;
  assert.equal(await page.locator('.operation-block').count(),expectedNodes,'existing saved workspace opens');
  const original=await page.evaluate(()=>JSON.stringify(ensureCategoryEditor()));
  await page.locator('.operation-block').first().locator('.operation-number').click();
  await page.locator('#process-operation-dialog .editor-modal-close').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(ensureCategoryEditor())),original);
  const queries=await page.evaluate(()=>Object.fromEntries(['105B100051','3060101','106BX03','yutaC','yutaM'].map(code=>[code,rootBom(code).map(r=>r.itemCode)])));
  const duplicateOrder=await page.evaluate(()=>data.bom['106BX03'].map(r=>({code:r.itemCode,quantity:r.quantity})));
  assert.equal(duplicateOrder[4].code,'3050921','Excel 2691 keeps its original preorder position');
  assert.equal(duplicateOrder[4].quantity,'1','duplicate quantity is not accumulated');
  assert.equal(duplicateOrder.filter(r=>r.code==='3050921').length,1,'Excel 2697 is excluded');
  assert.equal(queries['105B100051'].length,14);assert.deepEqual([...queries['3060101']].sort((a,b)=>a.localeCompare(b)),['203CU001','3060202']);
  assert.ok(queries.yutaC.length&&queries.yutaM.length);assert.equal(queries['106BX03'].filter(c=>c==='3060701').length,1);
  for(const line of ['A','B','C']){
   await editor(line);const categories=await page.locator('#category-select option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));assert.ok(categories.length);
   await page.locator('#category-select').selectOption(categories[0]);
   assert.ok(await page.evaluate(()=>productsForCategory(state.category,state.line).length)>0,`${line} product selection`);
  }
  const evidence=[];
  for(const [part,product,category,width]of [['407HS004','102TC10001','DTLN',1366],['407DX017','102XS08001','SOC',390]]){
   await page.setViewportSize({width,height:844});await editor('A',category);
   const id=await page.evaluate(product=>{
    const stages=ensureCategoryEditor(),stage=Object.keys(stages)[0],op=newOperation(stage,99);
    op.id='BOM-ISOLATED-'+product;op.productCodes=[product];op.bomProductCode=product;op.bomSelections={};op.bomItems=[];op.x=30;op.y=30;
    stages[stage].push(op);render();return op.id;
   },product);
   await page.locator(`.operation-block[data-operation="${id}"] .operation-number`).click();
   const checkbox=page.locator(`input[data-bom-product="${product}"][data-bom-code="${part}"]`);
   assert.equal(await checkbox.count(),1,'new part offered in product BOM');await checkbox.scrollIntoViewIfNeeded();await checkbox.check();
   await page.setViewportSize({width,height:540});const apply=page.locator('#apply-operation');await apply.scrollIntoViewIfNeeded();await apply.focus();assert.ok(await apply.isVisible());await apply.click();
   await page.locator('#save-process').click();await page.waitForFunction(()=>window.ProcessSync.status==='saved');assert.equal(await page.evaluate(()=>window.ProcessSync.flush()),true);
   const durable=await core.readState(),saved=JSON.parse(durable.values[`processEditor:${category}:A`]);
   const op=Object.values(saved.stages).flat().find(n=>n.id===id);assert.ok(op.bomSelections[product].includes(part));
   await page.reload();await editor('A',category);await page.locator(`.operation-block[data-operation="${id}"] .operation-number`).click();
   assert.equal(await checkbox.isChecked(),true,'BOM checkbox survives refresh');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.locator('#process-operation-dialog .editor-modal-close').click();
   evidence.push({part,product,width,result:'PASS',saveAndRefresh:'PASS'});
  }
  assert.deepEqual(errors,[]);
  fs.mkdirSync('outputs/local-bom-20260918',{recursive:true});
  fs.writeFileSync('outputs/local-bom-20260918/browser-test-result.json',JSON.stringify({result:'PASS',existingWorkspace:'PASS',productLines:'A/B/C PASS',queries,evidence},null,2));
  console.log('PASS: real API/SQLite/R2, actual BOM and existing workspace; A/B/C, new-part checkbox/save/refresh, desktop and iPhone dialog. Writes were isolated fixtures only.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
