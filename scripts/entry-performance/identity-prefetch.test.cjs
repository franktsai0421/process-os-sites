/* Isolated actual-decoder virtual-R2 fixture. Run by the designated manager only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),requireRepo=createRequire(path.join(root,'package.json')),ts=requireRepo('typescript');
const hash=raw=>createHash('sha256').update(raw).digest('hex'),ref=raw=>({key:'state-records/v1/'+hash(raw)+'.json',sha256:hash(raw)});
function load(source){const mod={exports:{}};const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(output,{module:mod,exports:mod.exports,require:id=>requireRepo(path.resolve(root,'lib',id)),crypto:webcrypto,TextEncoder,TextDecoder,console,structuredClone});return mod.exports;}
const candidateSource=fs.readFileSync(path.join(root,'lib/state-records.ts'),'utf8').replace(/\r\n/g,'\n');
const inverse=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/identity-prefetch-reverse.json'),'utf8'));
let baselineSource=candidateSource;
for(const row of inverse.spans){assert.equal(hash(row.candidate),row.candidateSHA256,'reviewed inverse span hash');assert.equal(baselineSource.split(row.candidate).length-1,1,'inverse source anchor must occur exactly once');baselineSource=baselineSource.replace(row.candidate,row.baseline);}
const baseline=load(baselineSource),candidate=load(candidateSource);
const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode'];
function setup(size=64){const objects=new Map(),values={};for(let i=0;i<keys.length;i++){const raw=JSON.stringify({index:i,text:'x'.repeat(size)}),r=ref(raw);objects.set(r.key,raw);values[keys[i]]=r;}return{objects,envelope:{__processRecords:{version:1,values}}};}
async function run(lib,fixture,options={},delays=[100,100,100,100]){
 let now=0,outstanding=0,maxOutstanding=0,bytes=0,done=false,result,error,ordinal=0,maxHeap=process.memoryUsage().heapUsed,maxRss=process.memoryUsage().rss;
 const reads=[],textReads=[],cancelled=[],queue=[];const sample=()=>{const m=process.memoryUsage();maxHeap=Math.max(maxHeap,m.heapUsed);maxRss=Math.max(maxRss,m.rss);};
 const bucket={get(key){reads.push(key);outstanding++;maxOutstanding=Math.max(maxOutstanding,outstanding);const delay=delays[ordinal++]??100;return new Promise((resolve,reject)=>queue.push({at:now+delay,resolve(){outstanding--;const raw=fixture.objects.get(key);sample();if(raw instanceof Error){reject(raw);return;}resolve(raw===undefined?null:{size:fixture.sizes?.has(key)?fixture.sizes.get(key):Buffer.byteLength(raw),body:{cancel:async()=>{cancelled.push(key);if(fixture.cancelFails)throw Error('CANCEL_FAILURE');}},text:async()=>{textReads.push(key);bytes+=Buffer.byteLength(raw);sample();return raw;}});}}));},put(){throw Error('NO_WRITES');}};
 const opts={...options};if(opts.token){delete opts.token;opts.identityReadToken=lib.createIdentityReadToken();lib.pinIdentityReadToken(opts.identityReadToken,1,JSON.stringify(fixture.envelope),bucket);}
 const operation=lib.decodeRecordValues(bucket,fixture.envelope,opts).then(value=>{result=value;done=true;},e=>{error=e;done=true;});
 // Drain speculative reads even after the ordered decoder reports failure.
 for(let turns=0;!done||queue.length;turns++){
  assert.ok(turns<10000,'virtual fixture failed to settle');
  if(queue.length){now=Math.min(...queue.map(q=>q.at));const due=queue.filter(q=>q.at<=now);for(const q of due){queue.splice(queue.indexOf(q),1);q.resolve();}}
  await new Promise(resolve=>setImmediate(resolve));sample();
 }
 await operation;
 return{values:result?.values,known:result?[...result.recordStorage.known]:undefined,error:error?.message,reads,textReads,cancelled,virtualMs:now,maxOutstanding,bytes,sampledHeapMax:maxHeap,sampledRssMax:maxRss};
}
const normalize=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));let cases=0;
async function compare(name,f,options={},expected={}){const b=await run(baseline,f,options),c=await run(candidate,f,options);assert.deepEqual(normalize(c.values),normalize(b.values),name+' values');assert.deepEqual(normalize(c.known),normalize(b.known),name+' known');assert.equal(c.error,b.error,name+' ordered error');assert.ok(c.maxOutstanding<=2,name+' concurrency cap');if(expected.error)assert.match(c.error,expected.error);if(expected.reads!==undefined)assert.equal(c.reads.length,expected.reads,name+' reads');if(expected.sameReads)assert.deepEqual(c.reads,b.reads,name+' read order');cases++;return{b,c};}
(async()=>{
 const reports=[];
 for(const size of [64,16384,262144]){
  const f=setup(size);const {b,c}=await compare('success '+size,f,{}, {sameReads:true});assert.equal(b.virtualMs,400);assert.equal(c.virtualMs,200);assert.equal(c.bytes,b.bytes);reports.push({size,mode:'success',baseline:b,candidate:c});
  const broken=setup(size),first=broken.envelope.__processRecords.values[keys[0]];broken.objects.set(first.key,'corrupt');const failed=await compare('early corrupt '+size,broken,{}, {error:/corrupt/,reads:2});assert.equal(failed.b.reads.length,1);reports.push({size,mode:'early-failure',baseline:failed.b,candidate:failed.c});
 }
 await compare('single selected',setup(),{keys:[keys[0]]},{reads:1,sameReads:true});
 await compare('empty selected',setup(),{keys:[]},{reads:0,sameReads:true});
 await compare('token bypass',setup(),{token:true},{reads:4,sameReads:true}).then(({c})=>assert.equal(c.maxOutstanding,1));
 for(const position of [0,1,2,3]){const f=setup();f.envelope.__processRecords.values[keys[position]]={key:'foreign/private',sha256:'a'.repeat(64)};const {c}=await compare('invalid barrier '+position,f,{}, {error:/Invalid immutable/,reads:position});assert.ok(!c.reads.some(k=>k.includes('foreign')));}
 {const f=setup();f.objects.set(f.envelope.__processRecords.values[keys[0]].key,'corrupt');f.envelope.__processRecords.values[keys[1]]={key:'foreign',sha256:'a'.repeat(64)};await compare('earlier corrupt wins later invalid',f,{}, {error:/corrupt/,reads:1});}
 {const f=setup();f.envelope.__processRecords.values[keys[1]]={key:'foreign',sha256:'A'.repeat(64)};await compare('excluded invalid never read',f,{keys:[keys[0],keys[2]]},{reads:2,sameReads:true});}
 {const f=setup();for(const key of keys)f.objects.set(f.envelope.__processRecords.values[key].key,new Error(key));const {c}=await compare('all reject first original',f,{}, {error:/platformUsers/,reads:2});assert.equal(c.error,'platformUsers');}
 {const f=setup();f.envelope.__processRecords.allocations={platformUsers:{key:'foreign',sha256:'a'.repeat(64)}};await compare('allocation precedes aggregates',f,{allocationKey:'platformUsers'},{error:/Invalid immutable/,reads:0});}
 {const f=setup();f.envelope.__processRecords.version=2;await compare('manifest precedes aggregates',f,{}, {error:/Invalid record manifest/,reads:0});}
 {const f=setup(),raw='{}',r=ref(raw);f.objects.set(r.key,raw);const original=f.envelope.__processRecords.values;f.envelope.__processRecords.values={[keys[0]]:original[keys[0]],business:r,[keys[1]]:original[keys[1]],[keys[2]]:original[keys[2]]};const {c}=await compare('nonidentity boundary',f,{}, {sameReads:true});assert.equal(c.virtualMs,300);}
 {const f=setup();const opts={projectValue(key,raw){if(key===keys[0])throw Error('PROJECT_FIRST');return raw;}};await compare('project failure consumes original first',f,opts,{error:/PROJECT_FIRST/,reads:2});}
 {const f=setup();const raw='{"__immutableBody":';const r=ref(raw);f.objects.set(r.key,raw);f.envelope.__processRecords.values[keys[0]]=r;await compare('malformed first JSON',f,{}, {reads:2});}
 {const f=setup(),r={key:'state-records/v1/'+'a'.repeat(64)+'.json',sha256:'a'.repeat(64)},raw=JSON.stringify({__immutableBody:r}),rr=ref(raw);f.objects.set(rr.key,raw);f.envelope.__processRecords.values[keys[0]]=rr;await compare('body missing after aggregate prefetch',f,{}, {error:/missing/,reads:3});}
 // Independent invocations never share fetched content; same ref corruption must fail anew.
 {const f=setup();await compare('first request',f);f.objects.set(f.envelope.__processRecords.values[keys[0]].key,'changed');await compare('second request no reuse',f,{}, {error:/corrupt/,reads:2});}
 // Rejections settle in the opposite order, but original manifest error wins.
 {const f=setup();f.objects.set(f.envelope.__processRecords.values[keys[0]].key,new Error('FIRST'));f.objects.set(f.envelope.__processRecords.values[keys[1]].key,new Error('SECOND'));const c=await run(candidate,f,{},[100,1]);assert.equal(c.error,'FIRST');cases++;}
 // The original first-object failure must not wait for second metadata.
 for(const lib of [baseline,candidate]){
  const f=setup();let secondResolve,calls=0,settled=false,error,cancelled=0;
  const bucket={get(){calls++;if(calls===1)return Promise.resolve({size:64,text:async()=>{throw Error('FIRST_TEXT_FAILURE');}});return new Promise(resolve=>{secondResolve=resolve;});},put(){throw Error('NO_WRITES');}};
  const operation=lib.decodeRecordValues(bucket,f.envelope).then(()=>{settled=true;},e=>{settled=true;error=e.message;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,true,'first failure must settle while second metadata is unresolved');assert.equal(error,'FIRST_TEXT_FAILURE');
  if(secondResolve){secondResolve({size:64,text:async()=>{throw Error('LATE_TEXT_MUST_NOT_RUN');},body:{cancel:async()=>{cancelled++;}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1,'late unused body is released');}
  await operation;cases++;
 }
 // Provider metadata gates speculative raw text, not GET metadata overlap.
 for(const size of [undefined,-1,0.5,NaN,Infinity,262145])for(const position of [0,1]){
  const f=setup();f.sizes=new Map([[f.envelope.__processRecords.values[keys[position]].key,size]]);f.objects.set(f.envelope.__processRecords.values[keys[0]].key,'corrupt');
  const {c}=await compare('fallback metadata '+String(size)+' position '+position,f,{}, {error:/corrupt/,reads:2});assert.equal(c.textReads.length,1,'unknown/large metadata never speculative text');assert.equal(c.cancelled.length,1,'unused body released');
 }
 {const f=setup();f.cancelFails=true;f.sizes=new Map([[f.envelope.__processRecords.values[keys[1]].key,undefined]]);f.objects.set(f.envelope.__processRecords.values[keys[0]].key,'corrupt');const {c}=await compare('cleanup cannot mask first error',f,{}, {error:/corrupt/,reads:2});assert.equal(c.cancelled.length,1);}
 {const f=setup();f.sizes=new Map(Object.values(f.envelope.__processRecords.values).map(r=>[r.key,undefined]));const {c}=await compare('unknown-size success uses each object once',f,{}, {sameReads:true});assert.equal(c.textReads.length,4);assert.equal(c.cancelled.length,0);}
 {const f=setup();f.sizes=new Map(Object.values(f.envelope.__processRecords.values).map(r=>[r.key,262144]));f.objects.set(f.envelope.__processRecords.values[keys[0]].key,'corrupt');const {c}=await compare('inclusive small boundary allows raw overlap',f,{}, {reads:2,error:/corrupt/});assert.equal(c.textReads.length,2);}
 console.log(JSON.stringify({status:'PASS',cases,sourceHashes:{baseline:hash(baselineSource),candidate:hash(candidateSource)},notes:['actual decoder, deferred synthetic R2; virtualMs is dependency wait, not measured hosted latency','heap/RSS are sampled process observations including harness, not exact Worker peaks; only <=256KiB provider-sized pair texts may overlap','no HTTP server, no live requests, no business writes; fresh auth code unchanged'],reports:reports.map(r=>({...r,baseline:{...r.baseline,values:undefined,known:undefined,reads:r.baseline.reads.length},candidate:{...r.candidate,values:undefined,known:undefined,reads:r.candidate.reads.length}}))},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
