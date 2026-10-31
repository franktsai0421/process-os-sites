/* oxlint-disable typescript/no-require-imports -- Isolated actual route comparison. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,randomUUID,createHash}=require('node:crypto');
const routeFile='app/api/master/references/route.ts';
const baseline=process.env.REFERENCES_BASELINE?fs.readFileSync(process.env.REFERENCES_BASELINE,'utf8'):require('node:child_process').execFileSync('git',['show','ca6647977a8680038444ce2c1ba4e80f2343cd0a:'+routeFile],{encoding:'utf8'});
const candidate=fs.readFileSync(routeFile,'utf8'),password=randomUUID(),secret=randomUUID();
const hash=value=>createHash('sha256').update(value).digest('hex');
const stats={get:0,put:0,masterStringifications:0,masterStringifiedCodeUnits:0},reads=[];
function reset(){for(const key of Object.keys(stats))stats[key]=0;reads.length=0;}
function loader(env,source){
 const cache=new Map(),json={parse:JSON.parse,stringify(value,...args){const result=JSON.stringify(value,...args);if(value?.active?.PROCESS&&Array.isArray(value.versions)){stats.masterStringifications++;stats.masterStringifiedCodeUnits+=result.length;}return result;}};
 function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const mod={exports:{}};cache.set(file,mod.exports);
  const raw=file===path.resolve(routeFile)?source:fs.readFileSync(file,'utf8');
  const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){
   if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return require(id);
   const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);
   if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));
   return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');
  },JSON:json,Request,Response,ReadableStream,Headers,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});
  cache.set(file,mod.exports);return mod.exports;
 }
 return load;
}
function fixture(photo){
 const {accessKeys}=require('../public/process/access-policy.mjs');
 const cells=allowed=>Object.fromEntries(accessKeys.map(key=>[key,allowed.includes(key)]));
 const users=[{id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,authEpoch:1,password},
  ...[['reader',['templates.view']],['denied',['dashboard.view']]].map(([id,allowed])=>({id,name:id,role:'staff',enabled:true,authEpoch:1,password,accessOverrides:cells(allowed)}))];
 const templates=stage=>['entry','manual','manual-inspection','machine-assembly','exit'].map(presetKey=>({id:stage+'-'+presetKey,presetKey,name:presetKey,mediaItems:[],...(presetKey==='machine-assembly'?{equipment:Array.from({length:20},(_,n)=>({id:stage+'-EQ-'+n,number:'EQ-'+n,name:'Synthetic '+n,line:stage[0],stageCode:stage,mediaItems:photo&&n===0?[{id:'photo',src:photo}]:[]}))}:{})})).concat(Array.from({length:10},(_,n)=>({id:stage+'-CUSTOM-'+n,catalogKey:'fixture-custom-'+n,name:'Synthetic template '+n,mediaItems:[]})));
 const process={'A-CUT':templates('A-CUT'),'C-CUT':templates('C-CUT')},active={AB:{products:[],lines:[],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:process};
 const versions=[{id:'master-active',scope:'PROCESS',status:'approved',number:1,snapshot:process}];
 const op={id:'reference-operation',number:'A-01',name:'Synthetic reference',templateId:'A-CUT-CUSTOM-0',productCodes:['A1'],machineIds:['A-CUT-EQ-0']};
 const content={id:'workspace',line:'A',category:'CAT-A',stages:{'A-CUT':[op]}};
 return {platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active,versions}),processMasterData:JSON.stringify(process),approvalVersions:JSON.stringify([{id:'process-active',number:1,status:'approved',...content}]),'processEditor:CAT-A:A':JSON.stringify(content),publishedProcess:JSON.stringify(content)};
}
const sqlite=new DatabaseSync(':memory:'),objects=new Map();
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8'));
const env={PROCESS_SESSION_SECRET:secret,STATE_ARCHIVE:{
 async get(key){stats.get++;reads.push(key);return objects.has(key)?{text:async()=>String(objects.get(key))}:null;},
 async put(key,value){stats.put++;objects.set(key,value);}
},DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.all());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}}};
const loads={baseline:loader(env,baseline),candidate:loader(env,candidate)},routes=Object.fromEntries(Object.entries(loads).map(([name,load])=>[name,load(routeFile)]));
const codec=loads.candidate('lib/state-records.ts'),cookies=new Map(),url='http://fixture/api/master/references?scope=PROCESS';
async function seed(values,inline=false){
 const raw=inline?JSON.stringify(values):await codec.encodeRecordValues(env.STATE_ARCHIVE,values);
 sqlite.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?) ON CONFLICT(id) DO UPDATE SET revision=1,"values"=excluded."values"').run(raw,'synthetic');return raw;
}
async function call(variant,actor='frank',query='&kind=equipment&id=A-CUT-EQ-0'){
 reset();const start=performance.now();
 const response=await routes[variant].GET(new Request(url+query,{headers:cookies.has(actor)?{Cookie:cookies.get(actor)}:{}}));
 const body=await response.json(),ms=Math.round((performance.now()-start)*10)/10;
 return {status:response.status,body,ms,...stats,readKeys:[...reads]};
}
async function equivalent(name,{actor='frank',query,expected=200,verify=()=>{}}={}){
 const manifest=sqlite.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values,stored=[...objects];
 const before=await call('baseline',actor,query),after=await call('candidate',actor,query);
 assert.equal(before.status,expected,name);assert.equal(after.status,expected,name);
 assert.deepEqual(after.body,before.body,name+' response');assert.deepEqual(after.readKeys,before.readKeys,name+' read order');
 assert.equal(before.put,0);assert.equal(after.put,0);verify(after.body);
 assert.equal(sqlite.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values,manifest);assert.deepEqual([...objects],stored);
 return {name,status:'PASS'};
}
(async()=>{
 const cases=[],rows=[],data=fixture('');await seed(data);
 for(const id of ['frank','reader','denied']){
  const response=await loads.candidate('app/api/platform-login/route.ts').POST(new Request('http://fixture/api/platform-login',{method:'POST',headers:{Origin:'http://fixture','Content-Type':'application/json'},body:JSON.stringify({id,password})}));
  assert.equal(response.status,200);cookies.set(id,response.headers.get('set-cookie').split(';')[0]);
 }
 cases.push(await equivalent('legacy catalog: approved, cached draft and published references',{verify:body=>assert.equal(body.total,3)}));
 cases.push(await equivalent('template catalog alias',{query:'&kind=template&id=fixture-custom-0',verify:body=>assert.equal(body.total,3)}));
 cases.push(await equivalent('restricted details',{actor:'reader',verify:body=>{assert.equal(body.total,3);assert.equal(body.detailsRestricted,true);assert.deepEqual(body.references,[]);}}));
 cases.push(await equivalent('no view permission',{actor:'denied',expected:403}));
 cases.push(await equivalent('no identity',{actor:'anonymous',expected:403}));
 cases.push(await equivalent('invalid target',{query:'&kind=unknown&id=x',expected:422}));
 cases.push(await equivalent('unknown equipment',{query:'&kind=equipment&id=missing',expected:404}));
 const adopted=structuredClone(data),root=JSON.parse(adopted.masterDataControl),working=structuredClone(root.active.PROCESS);
 working['A-CUT'].find(row=>row.presetKey==='machine-assembly').equipment.push({id:'working-only',number:'WORKING',stageCode:'A-CUT'});
 root.workflowScopes={PROCESS:{active:{id:'master-active',content:root.active.PROCESS},working,saved:{id:'master-save',content:working},saves:[],cases:[]}};
 adopted.masterDataControl=JSON.stringify(root);
 const source=JSON.parse(data['processEditor:CAT-A:A']),content={workspaces:[source]};
 adopted.processAuthoringControl=JSON.stringify({workflow:{active:{id:'a',content},working:content,saved:{id:'s',content},cases:[{id:'p',status:'pending',content},{id:'closed',status:'approved',content}]},versions:[]});
 await seed(adopted);
 cases.push(await equivalent('adopted active, working, saved, pending and published; closed excluded',{verify:body=>{assert.equal(body.total,5);assert(!body.references.some(row=>row.versionId==='closed'));}}));
 cases.push(await equivalent('working catalog takes priority over active',{query:'&kind=equipment&id=working-only',verify:body=>assert.equal(body.total,0)}));
 await seed(adopted,true);cases.push(await equivalent('inline legacy storage fallback',{verify:body=>assert.equal(body.total,5)}));
 await seed(adopted);const manifest=JSON.parse(sqlite.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values),key=manifest.__processRecords.values.masterDataControl.key,original=objects.get(key);
 objects.set(key,original+' ');cases.push(await equivalent('aggregate checksum corruption fails closed',{expected:503}));objects.set(key,original);
 const corrupt=structuredClone(adopted);corrupt.publishedProcess='{broken';await seed(corrupt,true);cases.push(await equivalent('invalid inline reference source fails closed',{expected:503}));
 const revoked=structuredClone(adopted),users=JSON.parse(revoked.platformUsers);users.find(user=>user.id==='frank').enabled=false;revoked.platformUsers=JSON.stringify(users);await seed(revoked);cases.push(await equivalent('disabled account rejects existing session',{expected:403}));
 if(process.env.REFERENCES_CORRECTNESS_ONLY!=='1')for(const scenario of ['small-catalog','photo-catalog']){
  const values=fixture(scenario==='photo-catalog'?'data:image/png;base64,'+'A'.repeat(512*1024):'');await seed(values);
  for(const variant of ['baseline','candidate'])assert.equal((await call(variant)).status,200);
  for(let round=1;round<=5;round++){
   const pair={};for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
    const result=await call(variant);assert.equal(result.status,200);assert.equal(result.put,0);assert.equal(result.body.total,3);pair[variant]=result;
    const {readKeys:_readKeys,body:_body,...measurement}=result;rows.push({scenario,variant,round,...measurement});
   }
   assert.deepEqual(pair.candidate.body,pair.baseline.body);assert.deepEqual(pair.candidate.readKeys,pair.baseline.readKeys);
   assert.equal(pair.baseline.masterStringifications,1);assert.equal(pair.candidate.masterStringifications,0);
  }
 }
 const report={status:'PASS',sourceHashes:{baseline:hash(baseline),candidate:hash(candidate)},runtime:'in-process actual route handlers + memory SQLite/R2; not HTTP/browser',data:'synthetic 2 stages, 30 templates, 40 equipment; photo-catalog adds same 512KiB synthetic data URI to one equipment in each stage; no production data',counterUnit:'masterStringifiedCodeUnits is UTF-16 string length, not transferred bytes',cases,rows};
 fs.mkdirSync('.sites-runtime/perf-500ms-round2',{recursive:true});fs.writeFileSync(process.env.REFERENCES_PROFILE_OUTPUT||'.sites-runtime/perf-500ms-round2/master-references-prepared.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sqlite.close());
