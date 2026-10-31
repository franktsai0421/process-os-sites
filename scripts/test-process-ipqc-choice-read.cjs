/* oxlint-disable typescript/no-require-imports -- Synthetic actual IPQC choice readers and handler. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,randomUUID,createHash}=require('node:crypto');
const files=['lib/process-ipqc.ts','app/api/process-ipqc/route.ts'],baselineDir=process.env.IPQC_CHOICES_BASELINE_DIR;
if(!baselineDir)throw Error('Set IPQC_CHOICES_BASELINE_DIR to the captured pre-edit source directory');
const sources=Object.fromEntries(['baseline','candidate'].map(variant=>[variant,Object.fromEntries(files.map(file=>[file,fs.readFileSync(variant==='baseline'?path.join(baselineDir,file):file,'utf8')]))]));
const sourceKey=(root,file,platform=path)=>platform.relative(root,file).split(platform.sep).join('/');
for(const platform of [path.win32,path.posix])for(const file of files){const root=platform.resolve('synthetic-repo'),key=sourceKey(root,platform.join(root,...file.split('/')),platform);assert.equal(key,file);assert.notEqual(sources.baseline[key],sources.candidate[key],'paired variants must be distinct for '+key);}
const stats={findCalls:0,errorVisits:0,masterParses:0,masterStringifications:0,masterStringifiedCodeUnits:0},events=[];
let trackErrors=true;
function reset(){for(const key of Object.keys(stats))stats[key]=0;events.length=0;}
function measuredErrors(value){
 if(!trackErrors||!value||typeof value!=='object')return;
 if(Array.isArray(value.errors)&&Array.isArray(value.items))Object.defineProperty(value.errors,'find',{enumerable:false,value(predicate){stats.findCalls++;return Array.prototype.find.call(this,(...args)=>{stats.errorVisits++;return predicate(...args);});}});
 for(const child of Object.values(value))if(child&&typeof child==='object')measuredErrors(child);
}
function loader(env,variant){
 const cache=new Map(),json={parse(text,...args){const value=JSON.parse(text,...args);if(value?.active?.PROCESS&&Array.isArray(value.versions))stats.masterParses++;measuredErrors(value);return value;},stringify(value,...args){const result=JSON.stringify(value,...args);if(value?.active?.PROCESS&&Array.isArray(value.versions)){stats.masterStringifications++;stats.masterStringifiedCodeUnits+=result.length;}return result;}};
 function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);const relative=sourceKey(process.cwd(),file),mod={exports:{}};cache.set(file,mod.exports);
  if(files.includes(relative))assert(Object.hasOwn(sources[variant],relative),'MISSING_PAIRED_SOURCE: '+relative);
  const raw=sources[variant][relative]??fs.readFileSync(file,'utf8'),code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return require(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},JSON:json,Request,Response,ReadableStream,Headers,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});
  cache.set(file,mod.exports);return mod.exports;
 }return load;
}
function fixture(line,{errors=32,perError=12,photo=false}={}){
 const source=line==='C'?'C':'AB',stage=line+'-CUT',category='SYN',products=Array.from({length:4},(_,i)=>({code:line+'-P'+i,line,category,stages:[stage]}));
 const catalog={products,lines:[{code:line,stages:[{code:stage,name:'Synthetic'}]}],categoryGroups:[{line,name:category}]};
 const templates={[stage]:[{id:'template',name:'Synthetic machine',presetKey:'machine-assembly',mediaItems:photo?[{id:'photo',src:'data:image/png;base64,'+'A'.repeat(512*1024)}]:[]}]};
 const snapshot={errors:Array.from({length:errors},(_,i)=>({id:'error-'+i,code:'E'+i,name:'Synthetic error '+i,line,group:category,stageCode:stage,productCode:products[i%4].code})),items:[]};
 for(let i=0;i<errors;i++)for(let j=0;j<perError;j++)snapshot.items.push({id:'item-'+i+'-'+j,errorId:'error-'+i,code:'I'+i+'-'+j,isEnabled:true,standardEnabled:true,productCodes:products.map(p=>p.code),productCode:products[i%4].code,stageCode:stage,standard:'標準 Tiêu chuẩn '+i,methodText:'Method',description:'Description',sourceTool:'Visual',sourceMethod:'Check',sourceFrequency:'each',tool:'Visual',method:'Check',frequency:'each',rules:[{cadence:'batch',fixedCount:2}],rule:{cadence:'batch',fixedCount:2},equipmentSnapshot:{id:'equipment',name:'Synthetic gauge'},standardPhotos:[{id:'photo-id',name:'Photo',note:'Preserved'}],methodPhotos:[],mediaItems:[{id:'photo-id',name:'Photo',note:'Preserved'}]});
 const active={AB:source==='AB'?catalog:{products:[],lines:[],categoryGroups:[]},C:source==='C'?catalog:{products:[],lines:[],categoryGroups:[]},PROCESS:templates};
 const versions=[{id:'quality-active',status:'approved',snapshot}],quality=source==='AB'?{scopes:{[line+':'+category]:{activeVersionId:'quality-active',versions}}}:{activeVersionId:'quality-active',versions};
 return {line,source,stage,category,selected:products.map(p=>p.code),qualityKey:source==='AB'?'ipqcABMasterControl':'ipqcCMasterControl',values:{masterDataControl:JSON.stringify({active,versions:[{id:'master-active',scope:'PROCESS',status:'approved',snapshot:templates}]}),[source==='AB'?'ipqcABMasterControl':'ipqcCMasterControl']:JSON.stringify(quality)}};
}
const db=new DatabaseSync(':memory:'),objects=new Map();let testing=false;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT);CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const env={PROCESS_SESSION_SECRET:randomUUID(),PROCESS_SESSION_REVOCATION_ENABLED:'1',STATE_ARCHIVE:{async put(key,value){assert(!testing,'GET must never write R2');objects.set(key,value);},async get(key){events.push({kind:'get',key});return objects.has(key)?{text:async()=>String(objects.get(key))}:null;}},DB:{prepare(sql){assert(/^SELECT /i.test(sql),'GET must never write SQL');let args=[];return{bind(...values){args=values;return this;},async first(){events.push({kind:'sql',sql});return db.prepare(sql).get(...args)||null;}};}}};
const loads={baseline:loader(env,'baseline'),candidate:loader(env,'candidate')},domain=Object.fromEntries(Object.entries(loads).map(([variant,load])=>[variant,load('lib/process-ipqc.ts')])),routes=Object.fromEntries(Object.entries(loads).map(([variant,load])=>[variant,load('app/api/process-ipqc/route.ts')])),codec=loads.candidate('lib/state-records.ts'),core=loads.candidate('lib/process-state.ts'),cookies={},cases=[],rows=[],counts=[],preparedCounts=[];
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function evaluate(variant,f,method='ipqcChoices',args){reset();const before=JSON.stringify(f.values);let result;try{result={ok:true,value:plain(domain[variant][method](...(args||[f.values,{line:f.line,category:f.category},f.stage,f.selected])))};}catch(error){result={ok:false,name:error.name,code:error.code,message:error.message,status:error.status};}assert.equal(JSON.stringify(f.values),before);return{result,counts:{...stats}};}
function unit(name,f,verify=()=>{},method,args){const a=evaluate('baseline',f,method,args),b=evaluate('candidate',f,method,args);assert.deepEqual(b.result,a.result,name);verify(b.result);cases.push({name,status:'PASS'});return{baseline:a.counts,candidate:b.counts};}
function qualityOf(f){const control=JSON.parse(f.values[f.qualityKey]);return{control,version:f.source==='AB'?control.scopes[f.line+':'+f.category].versions[0]:control.versions[0]};}
async function seed(f,change=()=>{},inline=false){const values={...f.values,platformUsers:JSON.stringify([{id:'frank',name:'Synthetic Frank',role:'admin',enabled:true,authEpoch:1},{id:'reader',name:'Reader',role:'staff',enabled:true,authEpoch:1,inheritRole:false,lines:['A','C'],views:['editor'],permissions:[]},{id:'line-a',name:'Line A',role:'staff',enabled:true,authEpoch:1,inheritRole:false,lines:['A'],views:['editor'],permissions:[]},{id:'denied',name:'Denied',role:'staff',enabled:true,authEpoch:1,inheritRole:false,lines:[],views:[],permissions:[]}])};change(values);const raw=inline?JSON.stringify(values):await codec.encodeRecordValues(env.STATE_ARCHIVE,values);db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,7,?)').run(raw);return JSON.parse(raw);}
async function request(variant,f,actor='reader'){
 reset();const query=new URLSearchParams({mode:'choices',line:f.line,category:f.category,stage:f.stage});f.selected.forEach(code=>query.append('product',code));
 const snapshot=db.prepare('SELECT * FROM shared_state').get(),stored=[...objects];testing=true;let response;const start=performance.now();try{response=await routes[variant].GET(new Request('http://fixture/api/process-ipqc?'+query,{headers:cookies[actor]?{Cookie:cookies[actor]}:{}}));}finally{testing=false;}
 const body=await response.json(),ms=Math.round((performance.now()-start)*10)/10,result={status:response.status,body,headers:Object.fromEntries(response.headers),ms,counts:{...stats},events:[...events]};
 assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),snapshot);assert.deepEqual([...objects],stored);return result;
}
async function pair(name,f,expected=200,actor='reader'){
 const a=await request('baseline',f,actor),b=await request('candidate',f,actor);assert.equal(a.status,expected,name);assert.equal(b.status,expected,name);assert.deepEqual(b.body,a.body,name);assert.deepEqual(b.headers,a.headers,name);assert.deepEqual(b.events,a.events,name+' exact SQL/R2 order');cases.push({name,status:'PASS'});return{baseline:a,candidate:b};
}
(async()=>{
 for(const line of ['A','C']){
  const f=fixture(line);counts.push({line,...unit('all fresh enabled approved '+line,f,r=>{assert.equal(r.ok,true);assert.equal(r.value.choices.length,384);})});
  for(const change of ['deleted','disabled','wrong-stage','wrong-product','source-draft','null-trailing-error','duplicate-error','first-ineligible-duplicate','empty-items-with-null-error','null-first-error']){
   const altered=structuredClone(f),{control,version}=qualityOf(altered),snapshot=version.snapshot;
   if(change==='deleted')snapshot.items[0].deleted=true;if(change==='disabled')snapshot.items[0][line==='C'?'standardEnabled':'isEnabled']=false;if(change==='wrong-stage')snapshot.errors[0].stageCode='X';if(change==='wrong-product'){snapshot.items[0].productCode='missing';snapshot.items[0].productCodes=['missing'];}if(change==='source-draft')version.status='draft';if(change==='null-trailing-error')snapshot.errors.push(null);if(change==='null-first-error')snapshot.errors.unshift(null);if(change==='duplicate-error')snapshot.errors.push({...snapshot.errors[0],name:'Later duplicate'});if(change==='first-ineligible-duplicate')snapshot.errors.unshift({...snapshot.errors[0],stageCode:'X',name:'Wrong stage first'});if(change==='empty-items-with-null-error'){snapshot.items=[];snapshot.errors=[null];}
   altered.values[altered.qualityKey]=JSON.stringify(control);unit(line+' '+change,altered);
  }
  const original=domain.candidate.ipqcChoices(f.values,{line:f.line,category:f.category},f.stage,f.selected),operation={id:'op',stageCode:f.stage,name:'Synthetic',productCodes:f.selected,ipqcAssignments:[original.choices[0]]},workspace={id:'workspace',line:f.line,category:f.category,stages:{[f.stage]:[operation]}};
  unit(line+' new valid assignment validation',f,r=>assert.equal(r.ok,true),'validateIPQCAssignments',[[workspace],[],f.values]);
  const prepared=JSON.parse(f.values.masterDataControl),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(prepared);
  preparedCounts.push({line,method:'ipqcChoices',...unit(line+' already parsed master preserves complete choices',f,r=>assert.equal(r.ok,true),'ipqcChoices',[f.values,{line:f.line,category:f.category},f.stage,f.selected,prepared])});
  preparedCounts.push({line,method:'validateIPQCAssignments',...unit(line+' already parsed master preserves assignment validation',f,r=>assert.equal(r.ok,true),'validateIPQCAssignments',[[workspace],[],f.values,prepared])});
  preparedCounts.push({line,method:'ipqcIssues',...unit(line+' already parsed master preserves issue order',f,r=>assert.equal(r.ok,true),'ipqcIssues',[[workspace],f.values,prepared])});
  const duplicate=structuredClone(workspace);duplicate.stages[f.stage].push({...structuredClone(operation),id:'duplicate'});unit(line+' duplicate ownership rejects',f,r=>assert.match(r.code,/IPQC_ALREADY_ASSIGNED/),'validateIPQCAssignments',[[duplicate],[],f.values]);
  const stale={...f.values,[f.qualityKey]:JSON.stringify(f.source==='AB'?{scopes:{}}:{versions:[]})};unit(line+' historical unchanged assignment preserved',f,r=>assert.equal(r.ok,true),'validateIPQCAssignments',[[workspace],[workspace],stale]);unit(line+' new stale assignment rejected',f,r=>assert.match(r.code,/IPQC_SOURCE_CHANGED/),'validateIPQCAssignments',[[workspace],[],stale]);
 }
 for(const id of ['frank','reader','line-a','denied'])cookies[id]='process_demo='+await core.demoSession(new Request('http://fixture'),id,false,1);
 for(const line of ['A','C']){
  const f=fixture(line,{photo:true});const encoded=await seed(f);await pair(line+' actual choice route exact body, auth and I/O',f);await pair(line+' anonymous denied',f,401,'anonymous');await pair(line+' permission denied',f,403,'denied');if(line==='C')await pair('legacy lines field preserves current effective-access policy',f,200,'line-a');
  await seed(f,values=>{const users=JSON.parse(values.platformUsers);users.find(user=>user.id==='reader').enabled=false;values.platformUsers=JSON.stringify(users);});await pair(line+' disabled actor denies',f,401);await seed(f);
  for(const key of ['masterDataControl',f.qualityKey]){const ref=encoded.__processRecords.values[key],saved=objects.get(ref.key);objects.set(ref.key,saved+' ');await pair(line+' corrupt '+key+' rejects',f,503);objects.set(ref.key,saved);}
  await seed(f,()=>{},true);await pair(line+' legacy inline fallback',f);await seed(f);
  if(process.env.IPQC_CHOICES_BENCHMARK==='1'){trackErrors=false;try{for(let round=1;round<=5;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){const result=await request(variant,f);assert.equal(result.status,200);rows.push({line,variant,round,ms:result.ms,...result.counts,gets:result.events.filter(event=>event.kind==='get').length});}}finally{trackErrors=true;}}
 }
 if(process.env.IPQC_CHOICES_EXPECT_REDUCTION==='1'){for(const row of counts){assert(row.candidate.findCalls<row.baseline.findCalls);assert(row.candidate.errorVisits<row.baseline.errorVisits);}for(const row of preparedCounts){assert.equal(row.baseline.masterParses,1);assert.equal(row.candidate.masterParses,0);}}
 const report={status:'PASS',runtime:'actual domain and Request/Response handlers with synthetic SQLite/R2; not browser/Workers timing; find/predicate instrumentation disabled during timed rows',sourceHashes:Object.fromEntries(Object.entries(sources).map(([variant,files])=>[variant,Object.fromEntries(Object.entries(files).map(([file,source])=>[file,createHash('sha256').update(source).digest('hex')]))])),data:'per line: 4 products, 32 errors, 384 items; handler adds512KiB synthetic master photo; no business data',cases,counts,preparedCounts,rows};
 fs.mkdirSync('.sites-runtime/perf-500ms-round5',{recursive:true});fs.writeFileSync(process.env.IPQC_CHOICES_OUTPUT||'.sites-runtime/perf-500ms-round5/ipqc-choice-read.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
