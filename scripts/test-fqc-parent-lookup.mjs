// Actual historical/current adapter and handler pairs; isolated SQLite/R2 only.
// Counter evidence is algorithmic work, not hosted CPU, latency, heap or native UI acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,webcrypto,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),target='lib/fqc-workflow.ts';
// Both exact historical blobs are available through normal full Git history.
// Use the matching stack capability so this test isolates only parent lookup.
const current=fs.readFileSync(path.join(root,target),'utf8');
const fullFlow=/\bfqcLifecycle8Mutation\s*:\s*true\b/.test(current);
const baselineBlob=fullFlow?'fafb835ccc22d136acd04e17c2e1d8471c545afc':'359d7dd148ef06a3ba001a6eb574db959b75d422';
const baselineHash=fullFlow?'687bde00732f31faa3e645d4840c9d6cb54c334bc2d50f60ee338cc60932beca':'7822bf5450e0ed593ea7a5dce8a52ae2bb6a593a14a878f7dcb514b513097812';
const prior=execFileSync('git',['show',baselineBlob],{cwd:root,encoding:'utf8'});
const sha=v=>createHash('sha256').update(v).digest('hex'),copy=structuredClone;
assert.equal(sha(prior),baselineHash);
const requireModule=createRequire(import.meta.url),at='2026-10-28T00:00:00.000Z',fixed=Date.parse(at),secret=randomBytes(32).toString('hex');
class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
function loader(source,env={},count=false){
 const modules=new Map(),probe={comparisons:0,indexRows:0,lookups:0};let uuid=0,bound=false;
 function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);const mod={exports:{}};modules.set(file,mod.exports);let input=fs.readFileSync(file,'utf8');
  if(path.relative(root,file).split(path.sep).join('/')===target){bound=true;input=source;if(count){
   input=input.replace('content.errors.find(e=>e.id===row.errorId)','content.errors.find(e=>(probe.comparisons++,e.id===row.errorId))');
   input=input.replace('for(const error of content.errors)if(!parentErrors.has(error.id))parentErrors.set(error.id,error);','for(const error of content.errors){probe.indexRows++;if(!parentErrors.has(error.id))parentErrors.set(error.id,error);}');
   input=input.replace('parent=parentErrors.get(row.errorId)','parent=(probe.lookups++,parentErrors.get(row.errorId))');
  }}
  const code=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return requireModule(id);const resolved=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);return resolved.endsWith('.mjs')?requireModule(resolved):load(resolved.endsWith('.ts')?resolved:resolved+'.ts');},Request,Response,ReadableStream,Headers,URL,TextEncoder,TextDecoder,atob,btoa,structuredClone,Date:Clock,crypto:{subtle:webcrypto.subtle,getRandomValues:a=>webcrypto.getRandomValues(a),randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`},console:{...console,error(){}},probe});
  modules.set(file,mod.exports);return mod.exports;
 }
 return{load,probe,bound:()=>bound,reset(){uuid=0;for(const key of Object.keys(probe))probe[key]=0;}};
}
const error=(i=0)=>({id:'e'+i,code:'QA-FQC-L'+i,name:'Synthetic error '+i,category:'QA',line:'A'});
const item=(i=0,parent=0)=>({id:'i'+i,checkNo:'QA-FQC-L'+parent+'-'+i,name:'Synthetic item '+i,category:'QA',line:'A',errorId:'e'+parent,productCodes:['P1'],mediaItems:[{id:'fixture-photo',src:'/synthetic.png'}],isEnabled:true,equipmentId:null,tool:'目視檢查',rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:3}});
const snapshot=(errors=3,items=5)=>({errors:Array.from({length:errors},(_,i)=>error(i)),items:Array.from({length:items},(_,i)=>item(i,Math.max(0,errors-1)))});
const contexts=[prior,current].map(source=>{const l=loader(source,{},true),adapter=l.load(target).fqcWorkflowAdapter();return{l,context:adapter.context({activeVersionId:null,versions:[]},{values:{}},{})};});
const structureCases=[];
function structurePair(name,content,previous=content,check){
 const results=contexts.map(({l,context})=>{l.reset();const input=copy(content),before=copy(previous),prev=copy(previous);let outcome={ok:true};try{context.structure(input,prev);}catch(e){outcome={ok:false,name:e.name,code:e.code||null,status:e.status||null,message:e.message};}assert.deepEqual(prev,before,'previous content stays unchanged');assert(l.bound());return{...outcome,content:input,counts:{...l.probe}};});
 const withoutCounts=({counts:_counts,...result})=>result;assert.deepEqual(withoutCounts(results[1]),withoutCounts(results[0]),name);check?.(results[1],results[0]);structureCases.push({name,status:'PASS',result:results[1].ok?'success':results[1].code||results[1].name,old:results[0].counts,next:results[1].counts});
}
structurePair('normal 3 errors / 5 items',snapshot(),undefined,(next,old)=>{assert.equal(old.counts.comparisons,15);assert.equal(next.counts.indexRows,3);assert.equal(next.counts.lookups,5);});
structurePair('120 errors / 1000 items count bound',snapshot(120,1000),undefined,(next,old)=>{assert.equal(old.counts.comparisons,120000);assert.equal(next.counts.indexRows,120);assert.equal(next.counts.lookups,1000);});
structurePair('no item does not populate parent index',snapshot(120,0),undefined,next=>assert.equal(next.counts.indexRows,0));
structurePair('small first-parent case exposes index overhead',{errors:snapshot(120,0).errors,items:[item(0,0)]},undefined,(next,old)=>{assert.equal(old.counts.comparisons,1);assert.equal(next.counts.indexRows,120);assert.equal(next.counts.lookups,1);});
let p=snapshot();structurePair('reordered parents', {...copy(p),errors:[p.errors[2],p.errors[0],p.errors[1]]},p);
p=snapshot();structurePair('duplicate current parent rejects before index', {...p,errors:[...p.errors,{...p.errors[2],code:'unique-but-duplicate-id'}]},p,next=>{assert.equal(next.code,'INVALID_FQC_IDENTITY');assert.equal(next.counts.indexRows,0);});
p=snapshot();structurePair('duplicate previous parent retains first identity',p,{...copy(p),errors:[p.errors[2],{...p.errors[2],category:'WRONG'},...p.errors.slice(0,2)]});
p=snapshot();structurePair('duplicate current item precedes missing parent',{errors:[],items:[p.items[0],{...p.items[0],checkNo:'UNIQUE'}]},p,next=>assert.equal(next.code,'INVALID_FQC_IDENTITY'));
p=snapshot();structurePair('missing parent precedes bad product shape',{errors:[],items:[{...p.items[0],productCodes:null}]},p,next=>assert.equal(next.code,'ERROR_PARENT_INVALID'));
p=snapshot();structurePair('deleted parent', {...copy(p),errors:p.errors.map(e=>({...e,isDeleted:true}))},p,next=>assert.equal(next.code,'ERROR_PARENT_INVALID'));
p=snapshot();structurePair('wrong category parent', {...copy(p),errors:p.errors.map(e=>({...e,category:'OTHER'}))},{errors:[],items:[]},next=>assert.equal(next.code,'ERROR_PARENT_INVALID'));
p=snapshot();structurePair('deleted item with missing parent still validates item', {errors:[],items:[{...p.items[0],isDeleted:true,productCodes:null}]},p,next=>assert.equal(next.code,'INVALID_FQC_ITEM'));
p=snapshot();structurePair('malformed first current error preserves native failure',{errors:[null],items:p.items},p,next=>assert.equal(next.name,'TypeError'));
p=snapshot();structurePair('invalid collection precedes malformed later prior',{errors:null,items:p.items},{errors:null,items:null},next=>assert.equal(next.code,'INVALID_COLLECTION'));
p=snapshot();structurePair('malformed current item is checked before parent-index creation',{errors:p.errors,items:[null]},p,next=>{assert.equal(next.name,'TypeError');assert.equal(next.counts.indexRows,0);});
p=snapshot();structurePair('malformed prior before matching error preserves throw',p,{errors:[null,...p.errors],items:p.items},next=>assert.equal(next.name,'TypeError'));
p=snapshot();structurePair('malformed prior after matching error preserves first-match',p,{errors:[...p.errors,null],items:p.items});
p=snapshot();p.items[0].equipmentSnapshot={name:'preserved'};structurePair('prior equipment snapshot remains exact',p,p,next=>assert.equal(next.content.items[0].equipmentSnapshot.name,'preserved'));
p=snapshot();structurePair('protected identity precedes parent check',{...copy(p),items:[{...p.items[0],category:'OTHER'}]},p,next=>assert.equal(next.code,'FQC_IDENTITY_PROTECTED'));
p=snapshot();structurePair('fresh call cannot reuse previous parent index',{...copy(p),errors:[]},p,next=>assert.equal(next.code,'ERROR_PARENT_INVALID'));

const {accessKeys}=requireModule('../public/process/access-policy.mjs');
const users=['editor','reader'].map(id=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,key==='fqc.view'||id==='editor'&&key.startsWith('fqc.')]))}));
function runtime(source){
 const db=new DatabaseSync(':memory:'),objects=new Map(),events=[];db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');let collision=false;
 const bucket={async put(key,value){events.push({type:'put',key});objects.set(key,String(value));},async get(key){events.push({type:'get',key});return objects.has(key)?{text:async()=>objects.get(key)}:null;},async head(key){return objects.has(key)?{}:null;}};
 const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'1',DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){events.push({type:'sqlRead',sql});if(collision&&sql.startsWith('SELECT revision FROM'))db.exec('UPDATE shared_state SET revision=revision+1');return db.prepare(sql).get(...args)||null;},async run(){events.push({type:'sqlWrite',sql});return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const l=loader(source,env),core=l.load('lib/process-state.ts'),records=l.load('lib/state-records.ts'),draft=l.load('lib/shared-draft.ts'),route=l.load('app/api/fqc/workflow/route.ts');
 const row=()=>({...db.prepare('SELECT * FROM shared_state').get()}),flow=()=>JSON.parse(objects.get(JSON.parse(row().values).__processRecords.values.qualityMasterControl.key)).libraries.fqc.workflow;
 async function setup(change){collision=false;l.reset();objects.clear();events.length=0;db.exec('DELETE FROM process_revoked_sessions');const content=snapshot(),working=copy(content);change?.(working);const f=draft.createSharedDraft('fqc',content,'approved','generation-parent-fixture');f.working=working;
  const version=(id,status,data)=>({id,number:status==='approved'?1:2,status,snapshot:data,revision:0,creatorId:'editor',creatorName:'editor',createdAt:at,updatedAt:at,history:[]});
  const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',qualityMasterControl:JSON.stringify({schemaVersion:1,libraries:{fqc:{activeVersionId:'approved',versions:[version('approved','approved',content),version('shared-generation-parent-fixture','draft',working)],workflow:f}}}),masterDataControl:JSON.stringify({active:{AB:{products:[{code:'P1'}]}},versions:[{id:'AB',scope:'AB',status:'approved',snapshot:{products:[{code:'P1'}]}}]}),routineEquipmentControl:JSON.stringify({activeVersionId:null,versions:[]}),unrelated:'{"retain":true}'};
  db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?,?)').run(9,await records.encodeRecordValues(bucket,values),at);events.length=0;
 }
 function command(action='apply',extra={}){const f=flow();return{action,operationId:'operation-parent-'+action+'-'+row().revision,generation:f.generation,clientId:'client-parent-fixture',sequence:row().revision+1,...(action==='apply'?{patches:[{op:'set',path:['items',{id:'i0'},'name'],value:'Updated'}],guards:[{path:['items',{id:'i0'},'name'],value:'Synthetic item 0'}]}:{}),...(action==='submit'?{savedId:f.saved?.id,reason:'Submit fixture'}:{}),...(action==='return'?{caseId:f.pendingId,reason:'Return fixture',selfReviewConfirmed:true}:{}),...extra};}
 async function post(cmd,who='editor'){const url='https://fqc-parent-fixture.invalid/api/fqc/workflow?caseMetadata=1&compact=1',base=new Request(url),token=await core.demoSession(base,who,false,1);events.length=0;const response=await route.POST(new Request(url,{method:'POST',headers:{origin:new URL(url).origin,'content-type':'application/json',cookie:core.sessionCookie(base,token).split(';')[0]},body:JSON.stringify({command:cmd})})),body=await response.json();return{status:response.status,body,headers:Object.fromEntries(response.headers),stored:row(),events:copy(events)};}
 return{db,objects,setup,command,post,row,collision(){collision=true;},missingWorking(){const envelope=JSON.parse(row().values),q=JSON.parse(objects.get(envelope.__processRecords.values.qualityMasterControl.key));objects.delete(q.libraries.fqc.workflow.working.__immutableBody.key);}};
}
const sides=[runtime(prior),runtime(current)],handlerCases=[];
async function paired(name,options={}){
 const outputs=[];for(const s of sides){await s.setup(options.change);options.before?.(s);const cmd=s.command(options.action||'apply',options.extra||{}),result=await s.post(cmd,options.who||'editor');if(options.expect!==undefined)assert.equal(result.status,options.expect,name);if(options.replay){const before=copy(s.row()),replay=await s.post(cmd);assert.equal(replay.body.unchanged,true);assert.deepEqual(replay.stored,before);assert.equal(replay.events.filter(e=>e.type==='put'||e.type==='sqlWrite').length,0);outputs.push({result,replay});}else if(options.chain){const chain=[result];for(const action of ['save','submit','return']){const r=await s.post(s.command(action));assert.equal(r.status,200);chain.push(r);}outputs.push(chain);}else outputs.push(result);}
 assert.deepEqual(outputs[1],outputs[0],name+' exact DTO, immutable keys, I/O order, auth reads, and stored state');handlerCases.push({name,status:'PASS'});
}
try{
 await paired('normal existing Apply exact DTO and full module lifecycle',{expect:200,chain:true});
 await paired('same operation receipt replay performs no second write',{expect:200,replay:true});
 await paired('existing item parent move within category',{expect:200,extra:{patches:[{op:'set',path:['items',{id:'i0'},'errorId'],value:'e0'}],guards:[{path:['items',{id:'i0'},'errorId'],value:'e2'}]}});
 await paired('guard rejection before structure',{expect:409,extra:{guards:[{path:['items',{id:'i0'},'name'],value:'wrong baseline'}]}});
 await paired('deleted parent still rejects with identical error',{expect:422,change:c=>{c.errors[2].isDeleted=true;}});
 await paired('duplicate errors preserve failure order',{expect:422,change:c=>{c.errors.push({...c.errors[2],code:'unique'});}});
 await paired('malformed collection preserves adapter rejection',{expect:422,change:c=>{c.errors=null;}});
 await paired('reader remains unauthorized',{expect:403,who:'reader'});
 await paired('required body fault retains ordinary fallback',{expect:500,before:s=>s.missingWorking()});
 await paired('global CAS collision retains bounded retries',{expect:409,before:s=>s.collision()});
}finally{for(const s of sides)s.db.close();}
console.log(JSON.stringify({status:'PASS_FQC_PARENT_LOOKUP_PAIRS',baselineBlob,baselineSHA256:sha(prior),candidateSHA256:sha(current),structureCases,handlerCases,groups:structureCases.length+handlerCases.length,limits:['No network/live data/browser','I/O counts/order and fresh auth are unchanged, not reduced','Deterministic comparison/index counters are not runtime milliseconds','An item already matching the first error adds index work; this targets repeated searches, not every fixture','Parent index only follows successful structural identity checks and lives for one call']},null,2));
