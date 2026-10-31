/* oxlint-disable typescript/no-require-imports -- Isolated production adapter comparison. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{createHash}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs'),factory=require('./v3-master-permission-fixture.cjs');
const sourceFile='lib/master-workflow.ts',candidate=fs.readFileSync(sourceFile,'utf8');
const baseline=process.env.MASTER_EQUALITY_BASELINE?fs.readFileSync(process.env.MASTER_EQUALITY_BASELINE,'utf8'):require('node:child_process').execFileSync('git',['show','ca6647977a8680038444ce2c1ba4e80f2343cd0a:'+sourceFile],{encoding:'utf8'});
const hash=value=>createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value));
function loadAdapter(source){
 const load=harness(),kernel=load('lib/shared-draft.ts'),stats={canonicalComparisons:0,canonicalCodeUnits:0,valueComparisons:0};
 const instrumented={...kernel,stableDraftJSON(value){const text=kernel.stableDraftJSON(value);stats.canonicalComparisons++;stats.canonicalCodeUnits+=text.length;return text;},sameDraftValue(a,b){stats.valueComparisons++;return kernel.sameDraftValue(a,b);}};
 const mod={exports:{}},code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){return id==='./shared-draft'?instrumented:load(path.resolve('lib',id+'.ts'));},JSON,Map,Set,console});
 return {create:mod.exports.masterWorkflowAdapter,stats,reset(){for(const key of Object.keys(stats))stats[key]=0;}};
}
const adapters={baseline:loadAdapter(baseline),candidate:loadAdapter(candidate)},cases=[],rows=[];
function result(variant,scope,root,prepared){
 const input=structuredClone(root),before=JSON.stringify(input),raw=JSON.stringify(input),adapter=adapters[variant].create(scope);adapters[variant].reset();
 let out;try{out={ok:true,control:plain(adapter.parse(raw,prepared?input:undefined))};}catch(error){out={ok:false,error:error.code||error.name,status:error.status};}
 assert.equal(JSON.stringify(input),before,'parse does not mutate the request model');return out;
}
function check(name,scope,root,{expectedError,activeId,prepared=true}={}){
 const before=result('baseline',scope,root,prepared),after=result('candidate',scope,root,prepared);
 assert.deepEqual(after,before,name);
 if(expectedError){assert.equal(after.ok,false,name);assert.equal(after.error,expectedError,name);}else{assert.equal(after.ok,true,name);if(activeId)assert.equal(after.control.activeVersionId,activeId,name);}
 cases.push({name,scope,prepared,status:'PASS'});
}
function reverseKeys(value){if(Array.isArray(value))return value.map(reverseKeys);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reverseKeys(child)]));return value;}
function addJsonValues(root,scope){const snapshot=root.active[scope],row=scope==='PROCESS'?snapshot['A-CUT'][0]:snapshot.products[0];row.syntheticValues={text:'中文 Đường kính 😀',nil:null,zero:0,negativeZero:-0,tiny:1e-300,large:1e100,array:[null,false,true,0,''],nested:{a:1,b:2},...JSON.parse('{"__proto__":{"safe":"JSON own key"}}')};return root;}
(async()=>{
 for(const scope of ['AB','C','PROCESS']){
  const root=JSON.parse(factory('master-'+scope).values.masterDataControl),expected=root.workflowScopes[scope].active.id;
  for(const prepared of [false,true])check('existing approved baseline',scope,root,{prepared,activeId:expected});
  const alias=structuredClone(root);alias.versions.find(version=>version.id===expected).snapshot=alias.active[scope];check('verified body alias',scope,alias,{activeId:expected});
  const reordered=addJsonValues(structuredClone(root),scope);reordered.versions.find(version=>version.id===expected).snapshot=reverseKeys(reordered.active[scope]);check('JSON key order, arrays, null, finite numbers, own prototype key and multilingual values',scope,reordered,{activeId:expected});
  const legacy=structuredClone(reordered);delete legacy.workflowScopes;check('legacy without adopted workflow pointer',scope,legacy,{prepared:false,activeId:expected});
  const wrongPointer=structuredClone(root);wrongPointer.workflowScopes[scope].active.id='missing';check('missing active pointer retains matching approved fallback',scope,wrongPointer,{activeId:expected});
  const multiple=structuredClone(root);multiple.versions.unshift({...structuredClone(multiple.versions.find(version=>version.id===expected)),id:'wrong-approved',snapshot:scope==='PROCESS'?{}:{products:[],lines:[],categoryGroups:[]}});delete multiple.workflowScopes;check('wrong earlier approved snapshot does not hide later matching baseline',scope,multiple,{activeId:expected});
  const mismatch=structuredClone(root);if(scope==='PROCESS')mismatch.active[scope]['A-CUT'][0].name='Different active content';else mismatch.active[scope].products[0].name='Different active content';check('different active value refuses baseline',scope,mismatch,{expectedError:'MASTER_EFFECTIVE_BASELINE_CONFLICT'});
  const typeMismatch=structuredClone(reordered),typeRow=scope==='PROCESS'?typeMismatch.active[scope]['A-CUT'][0]:typeMismatch.active[scope].products[0];typeRow.syntheticValues.zero='0';check('JSON scalar type mismatch refuses baseline',scope,typeMismatch,{expectedError:'MASTER_EFFECTIVE_BASELINE_CONFLICT'});
  const arrayMismatch=structuredClone(reordered),arrayRow=scope==='PROCESS'?arrayMismatch.active[scope]['A-CUT'][0]:arrayMismatch.active[scope].products[0];arrayRow.syntheticValues.array.reverse();check('array order mismatch refuses baseline',scope,arrayMismatch,{expectedError:'MASTER_EFFECTIVE_BASELINE_CONFLICT'});
  const noApproved=structuredClone(root);noApproved.versions=noApproved.versions.filter(version=>version.status!=='approved');check('missing approved baseline refuses',scope,noApproved,{expectedError:'MASTER_EFFECTIVE_BASELINE_CONFLICT'});
  const invalid=structuredClone(root);delete invalid.active[scope];check('missing active scope refuses',scope,invalid,{expectedError:'MASTER_EXISTING_DATA_INVALID'});
 }
 // Actual records retain verified body aliasing; corruption still fails before parsing.
 const objects=new Map(),bucket={async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;}},codec=harness()('lib/state-records.ts');
 const values=factory('master-PROCESS').values,encoded=JSON.parse(await codec.encodeRecordValues(bucket,values)),decoded=await codec.decodeRecordValues(bucket,encoded,{modelKey:'masterDataControl',deferHistory:true,deferDependencyHistory:true}),prepared=decoded.recordStorage.models.get('masterDataControl');
 assert.equal(prepared.versions.find(version=>version.id===prepared.workflowScopes.PROCESS.active.id).snapshot,prepared.active.PROCESS);
 check('actual decoder model preserves verified aliases and same projected control','PROCESS',prepared);
 const aggregate=encoded.__processRecords.values.masterDataControl,original=objects.get(aggregate.key);objects.set(aggregate.key,original+' ');
 await assert.rejects(()=>codec.decodeRecordValues(bucket,encoded,{modelKey:'masterDataControl',deferHistory:true}),/Immutable record corrupt/);objects.set(aggregate.key,original);
 const bodyRef=JSON.parse(original).active.PROCESS.__immutableBody,body=objects.get(bodyRef.key);objects.set(bodyRef.key,body+' ');
 await assert.rejects(()=>codec.decodeRecordValues(bucket,encoded,{modelKey:'masterDataControl',deferHistory:true}),/Immutable record corrupt/);objects.set(bodyRef.key,body);
 cases.push({name:'aggregate and required active body SHA failures remain closed before either adapter',status:'PASS'});
 if(process.env.MASTER_EQUALITY_BENCHMARK==='1'){
  const root=JSON.parse(values.masterDataControl),photo='data:image/png;base64,'+'A'.repeat(512*1024);
  root.active.PROCESS['A-CUT'][0].mediaItems=[{id:'synthetic-photo',src:photo}];
  for(const version of root.versions)version.snapshot=structuredClone(root.active.PROCESS);
  root.workflowScopes.PROCESS.active.content=structuredClone(root.active.PROCESS);root.workflowScopes.PROCESS.working=structuredClone(root.active.PROCESS);
  for(const scenario of ['parsed-photo','prepared-photo-alias'])for(let round=1;round<=5;round++){
   const pair={};for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
    const input=structuredClone(root);if(scenario==='prepared-photo-alias')input.versions.find(version=>version.id===input.workflowScopes.PROCESS.active.id).snapshot=input.active.PROCESS;
    const raw=JSON.stringify(input),adapter=adapters[variant].create('PROCESS');adapters[variant].reset();
    const start=performance.now(),control=adapter.parse(raw,scenario==='prepared-photo-alias'?input:undefined),ms=Math.round((performance.now()-start)*10)/10;
    pair[variant]=plain(control);rows.push({scenario,variant,round,ms,...adapters[variant].stats});
   }assert.deepEqual(pair.candidate,pair.baseline);
  }
 }
 const report={status:'PASS',runtime:'production adapter parse and actual record decoder only; not API or browser timing',sourceHashes:{baseline:hash(baseline),candidate:hash(candidate)},counterUnit:'canonicalCodeUnits is UTF-16 length of comparator result strings, not network bytes',data:'synthetic master catalogs; benchmark adds 512KiB data URI stand-in; no live data',limits:['Only JSON storage values; functions, Dates, cycles, undefined fields and sparse arrays cannot be produced by the JSON decoder.','JSON own-key ordering does not change equality; array order and scalar types remain significant.'],cases,rows};
 fs.mkdirSync('.sites-runtime/perf-500ms-round4',{recursive:true});fs.writeFileSync(process.env.MASTER_EQUALITY_OUTPUT||'.sites-runtime/perf-500ms-round4/master-baseline-equality.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
