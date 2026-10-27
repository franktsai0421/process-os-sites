/* oxlint-disable typescript/no-require-imports -- isolated actual adapter, immutable historical source and counter-only probes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{execFileSync}=require('node:child_process'),{createHash,webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),target='lib/fqc-workflow.ts',base='845a12b47c784069ae786c828339cae09ab1f71a',sha=s=>createHash('sha256').update(s).digest('hex');
const original=execFileSync('git',['show',base+':'+target],{cwd:root,encoding:'utf8'}),current=fs.readFileSync(path.join(root,target),'utf8');
assert.equal(sha(original),'c2375bf63ddb0cd572823f01f6a39f1b316d8ac143231643421a1fd61d89e6f5');assert.notEqual(sha(current),sha(original));
const normalized=(root,file,platform=path)=>platform.relative(root,file).split(platform.sep).join('/');
for(const platform of [path.win32,path.posix]){const syntheticRoot=platform.join('synthetic','repo');assert.equal(normalized(syntheticRoot,platform.join(syntheticRoot,'lib','fqc-workflow.ts'),platform),target);}
function loader(override){const cache=new Map(),probe={comparisons:0,indexRows:0,lookups:0,fallbackComparisons:0},binding={overrideUsed:false,sourceSHA:sha(override)};
 function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);let code=fs.readFileSync(file,'utf8');
  if(normalized(root,file)===target){binding.overrideUsed=true;code=override;
   for(const a of ['previous[key].find(r=>r.id===row.id)','previous.items.find(i=>i.id===row.id)'])if(code.includes(a))code=code.replace(a,a.replace('=>','=> (probe.comparisons++,').replace('id)', 'id))'));
   if(code.includes('for(const row of rows){'))code=code.replace('for(const row of rows){','for(const row of rows){probe.indexRows++;');
   if(code.includes('return index?index.get(id):'))code=code.replace('return index?index.get(id):','return (probe.lookups++,index)?index.get(id):');
   code=code.replaceAll('.find(row=>row.id===id)','.find(row=>(probe.fallbackComparisons++,row.id===id))');
  }
  code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env:{}};if(id.startsWith('node:'))return require(id);const p=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);return p.endsWith('.mjs')?require(p):load(p.endsWith('.ts')?p:p+'.ts');},Request,Response,Headers,ReadableStream,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console,probe});cache.set(file,mod.exports);return mod.exports;}
 const adapter=load(target).fqcWorkflowAdapter(),context=adapter.context({activeVersionId:null,versions:[]},{values:{}},{});assert.equal(binding.overrideUsed,true);return{context,probe,binding};}
const old=loader(original),next=loader(current),clone=structuredClone;
const error=(id='e')=>({id,code:'E-'+id,name:'Synthetic error',category:'G',line:'A'}),item=(i=0)=>({id:'i'+i,checkNo:'C-'+i,name:'Synthetic item '+i,category:'G',line:'A',errorId:'e',productCodes:['P1'],mediaItems:[{id:'synthetic-photo',src:'/synthetic.png'}],isEnabled:true,tool:'目視檢查',equipmentId:null,rule:{cadence:'none'}}),snapshot=(n=1)=>({errors:[error()],items:Array.from({length:n},(_,i)=>item(i))});
const cases=[];function runSide(side,content,previous){const input=clone(content),prior=clone(previous),before=clone(prior);for(const k of Object.keys(side.probe))side.probe[k]=0;let result={ok:true};try{side.context.structure(input,prior);}catch(e){result={ok:false,name:e.name,code:e.code||null,status:e.status||null,message:e.message};}assert.deepEqual(prior,before,'previous snapshot not mutated');return{...result,content:input,counts:{...side.probe}};}
function pair(name,content,previous,check){const a=runSide(old,content,previous),b=runSide(next,content,previous);const strip=x=>{const y=clone(x);delete y.counts;return y;};assert.deepEqual(strip(b),strip(a),name);if(check)check(b,a);cases.push({name,status:'PASS',result:b.ok?'success':b.code||b.name,oldCounts:a.counts,newCounts:b.counts});}
let p=snapshot(24);pair('24 normal rows / previous immutable',p,p,(b,a)=>{assert.equal(a.counts.comparisons,601);assert.equal(b.counts.indexRows,25);assert.equal(b.counts.lookups,49);assert.equal(b.counts.fallbackComparisons,0);});
p=snapshot(200);pair('200 rows scale / order preserved',p,p,(b,a)=>{assert.equal(a.counts.comparisons,40201);assert.equal(b.counts.indexRows,201);assert.equal(b.counts.lookups,401);});
p=snapshot(3);pair('reordered current rows', {...clone(p),items:[p.items[2],p.items[0],p.items[1]]},p);
p=snapshot();pair('missing previous item',p,{errors:clone(p.errors),items:[]});
p=snapshot();pair('missing previous error',p,{errors:[],items:clone(p.items)});
p=snapshot();pair('duplicate previous error first-match wins',p,{errors:[clone(p.errors[0]),{...p.errors[0],category:'OTHER'}],items:clone(p.items)});
p=snapshot();p.items[0].equipmentId='eq';p.items[0].tool='EQ';p.items[0].equipmentSnapshot={name:'FIRST'};pair('duplicate previous item first snapshot wins',p,{errors:clone(p.errors),items:[clone(p.items[0]),{...p.items[0],equipmentSnapshot:{name:'SECOND'}}]},b=>assert.equal(b.content.items[0].equipmentSnapshot.name,'FIRST'));
p=snapshot();pair('duplicate current ID retains identity rejection',{errors:p.errors,items:[p.items[0],{...p.items[0],checkNo:'other'}]},p,b=>assert.equal(b.code,'INVALID_FQC_IDENTITY'));
p=snapshot();pair('missing parent retains parent rejection',{errors:[],items:p.items},p,b=>assert.equal(b.code,'ERROR_PARENT_INVALID'));
p=snapshot();pair('protected identity still rejects',{errors:p.errors,items:[{...p.items[0],category:'OTHER'}]},p,b=>assert.equal(b.code,'FQC_IDENTITY_PROTECTED'));
p=snapshot();pair('malformed prior null after matching row keeps old success',p,{errors:p.errors,items:[p.items[0],null]});
p=snapshot();pair('malformed prior null before matching row keeps old throw',p,{errors:p.errors,items:[null,p.items[0]]},b=>assert.equal(b.name,'TypeError'));
p=snapshot();pair('malformed prior primitive falls back',p,{errors:p.errors,items:[false,p.items[0]]});
p=snapshot();pair('non-string previous ID retains strict-equality behavior',p,{errors:p.errors,items:[{...p.items[0],id:1},p.items[0]]});
p=snapshot();pair('nonarray prior preserves native failure',p,{errors:p.errors,items:null});
p=snapshot();pair('invalid current collection still checked before prior scan',{errors:null,items:p.items},{errors:null,items:null},b=>assert.equal(b.code,'INVALID_COLLECTION'));
p=snapshot();pair('first invalid collection precedes malformed later previous',{errors:[{...p.errors[0],id:''}],items:p.items},{errors:[],items:null},b=>assert.equal(b.code,'INVALID_FQC_IDENTITY'));
p=snapshot();p.items[0].isDeleted=true;pair('deleted item retains structure rules',p,p);
p=snapshot();p.items[0].equipmentSnapshot={name:'legacy'};pair('unchanged no-equipment snapshot retained',p,p,b=>assert.equal(b.content.items[0].equipmentSnapshot.name,'legacy'));
p=snapshot();pair('fresh structure call sees new previous identity',p,{errors:p.errors,items:[{...p.items[0],line:'B'}]},b=>assert.equal(b.code,'FQC_IDENTITY_PROTECTED'));
console.log(JSON.stringify({status:'PASS',groups:cases.length,base,baselineSHA:sha(original),candidateSHA:sha(current),baselineOverrideUsed:old.binding.overrideUsed,candidateOverrideUsed:next.binding.overrideUsed,portableKeyNormalization:'POSIX and Windows exact tested',cases,limits:'Actual adapter structure only; synthetic snapshots and counter-only loader. No handler I/O/native timing or production heap claim.'},null,2));
