const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),{webcrypto,createHash,randomUUID}=require('node:crypto');
const {fixture}=require('../scripts/quality-replacement-preview-fixture.cjs');
const {fixture:cFixture}=require('../scripts/ipqc-c-operation-fixture.cjs');
const base='c178ae227bcddf528a493dbf8b586cf310564c5b',files=['lib/process-state.ts','lib/versioned-shared-workflow.ts','app/api/ipqc-ab/route.ts','app/api/ipqc-c/route.ts','app/api/ipqc-c/workflow/route.ts'];
const prior=Object.fromEntries(files.map(file=>[file,execFileSync('git',['show',base+':'+file],{encoding:'utf8'})]));
const digest=value=>createHash('sha256').update(value).digest('hex');
function loadAt(env,overrides={},instant=Date.now()){
 const cache=new Map();let sequence=0;class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 const crypto={subtle:webcrypto.subtle,randomUUID:()=>`00000000-0000-4000-8000-${String(instant*10+(++sequence)).slice(-12).padStart(12,'0')}`,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);const key=path.relative(process.cwd(),file).split(path.sep).join('/');
  const code=ts.transpileModule(overrides[key]??fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env};if(id.startsWith('node:'))return require(id);const target=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target));return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},Uint8Array,ArrayBuffer,DataView,Request,Response,ReadableStream,Headers,URL,URLSearchParams,crypto,Date:Clock,TextEncoder,TextDecoder,atob,btoa,structuredClone,console});cache.set(file,mod.exports);return mod.exports;
 }return load;
}
const master={active:{AB:{products:[{code:'A1',name:'Synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]},C:{products:[{code:'C1',name:'Synthetic',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}};
const initialC={schemaVersion:1,activeVersionId:'synthetic-initial',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'synthetic-initial',number:1,status:'approved',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
async function setup(t,moduleName){const f=await fixture({masterDataControl:JSON.stringify(master),ipqcCMasterControl:JSON.stringify(initialC),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',unrelated:JSON.stringify({keep:'original'})},{includeIPQCC:true});t.after(()=>f.close());f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const scope=moduleName==='ipqc-ab'?'&scope=A%3AG':'';
 await f.begin(moduleName,'editor',200,scope);await f.command(moduleName,'apply',{moduleAction:'create-error',input:moduleName==='ipqc-ab'?{stageCode:'A-CUT',name:'Synthetic'}:{productCode:'C1',stageCode:'C-CUT',name:'Synthetic'}},'editor',200,scope);
 if(moduleName==='ipqc-ab')await f.begin(moduleName,'editor',200,'&module=1');return f;
}
const snap=f=>({row:{...f.db.prepare('SELECT * FROM shared_state').get()},objects:new Map(f.objects)});
function restore(f,s){f.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(s.row.revision,s.row.values,s.row.updated_at);f.objects.clear();for(const [key,value]of s.objects)f.objects.set(key,value);}
async function call(load,f,endpoint,method='GET',body,who='editor',query=''){const response=await load('app/api/'+endpoint+'/route.ts')[method](new Request('http://fixture/api/'+endpoint+query,{method,headers:f.sessions[who],...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:JSON.parse(JSON.stringify(load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json())))};}
for(const moduleName of ['ipqc-ab','ipqc-c'])void test(moduleName+' exact baseline DTO/state parity through Save Submit Withdraw Resubmit Approve and receipts',async t=>{
 const f=await setup(t,moduleName),query='?caseMetadata=1&compact=1'+(moduleName==='ipqc-ab'?'&module=1':'');let sequence=0;
 for(const action of ['save','submit','withdraw','submit','approve']){
  const flow=f.flow(await f.read(moduleName,'editor',moduleName==='ipqc-ab'?'&module=1':''));const state=await f.core.readState();const command={action,operationId:randomUUID(),clientId:'parity-fixture',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,input:{stateRevision:state.revision},...(action==='submit'?{savedId:flow.saved.id}:{}),...(['withdraw','approve'].includes(action)?{caseId:flow.pendingId}:{}),reason:'Synthetic'};
  const snapshot=snap(f),now=Date.now();const before=await call(loadAt(f.env,prior,now),f,moduleName+'/workflow','POST',{command},action==='approve'?'reviewer':'editor',query);const oldRow=snap(f).row;
  restore(f,snapshot);const after=await call(loadAt(f.env,{},now),f,moduleName+'/workflow','POST',{command},action==='approve'?'reviewer':'editor',query);assert.equal(after.status,200,action+": "+after.body.error);assert.deepEqual(after,before);
  const newRow=snap(f).row;assert.equal(digest(JSON.stringify(newRow)),digest(JSON.stringify(oldRow)),'exact persisted manifest/revision parity');
  const stable=snap(f),receipt=await call(loadAt(f.env),f,moduleName+'/workflow','GET',undefined,action==='approve'?'reviewer':'editor','?operationId='+command.operationId+(moduleName==='ipqc-ab'?'&module=1':''));assert.equal(receipt.status,200);assert.deepEqual(receipt.body.receipt,after.body.receipt);assert.equal(digest(JSON.stringify(snap(f).row)),digest(JSON.stringify(stable.row)),'receipt is readonly');
 }
 for(const who of Object.keys(f.sessions))for(const endpoint of [moduleName,moduleName+'/workflow']){const now=Date.now(),query=endpoint.endsWith('workflow')?'?permissions=1'+(moduleName==='ipqc-ab'?'&module=1':''):'?caseMetadata=1';assert.deepEqual(await call(loadAt(f.env,{},now),f,endpoint,'GET',undefined,who,query),await call(loadAt(f.env,prior,now),f,endpoint,'GET',undefined,who,query),who+' policy parity');}
});
void test('C phase matches legacy can and exact company final approval for every isolated role, then rejects state/header/revocation drift',async t=>{
 const f=await cFixture();t.after(()=>f.close());f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';
 for(const [who,headers]of Object.entries(f.sessions)){
  const state=await f.core.readState(),request=new Request('http://fixture/api/ipqc-c/workflow',{headers}),phase=await f.core.createIpqcCPermissionPhase(request,state);
  for(const key of ['ipqc-c.view','ipqc-c.edit','ipqc-c.save','ipqc-c.submit','ipqc-c.withdraw','ipqc-c.create','ipqc-c.delete','ipqc-c.restore','ipqc-c.return','approval.compare'])assert.equal(phase.allowed(key),await f.core.can(request,state,key),who+' '+key);
  assert.equal(phase.finalApprove(),await f.load('lib/ipqc-c-access.ts').ipqcCFinalReviewAllowed(request,state,'approve'),who+' final approval');assert.equal(await phase.current(),true);
  state.values.maintenanceMode='changed';assert.equal(phase.allowed('ipqc-c.view'),false);assert.equal(phase.finalApprove(),false);assert.equal(await phase.current(),false);
 }
 const state=await f.core.readState(),request=new Request('http://fixture/api/ipqc-c/workflow',{headers:f.sessions.editor}),phase=await f.core.createIpqcCPermissionPhase(request,state);request.headers.set('cookie','changed');assert.equal(await phase.current(),false);
 const other=new Request('http://fixture/api/iqc/workflow',{headers:f.sessions.editor});await assert.rejects(f.core.createIpqcCPermissionPhase(other,state),/INVALID_PERMISSION_PHASE/);
 const prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('FROM process_revoked_sessions'))s.first=async()=>({expires_at:Date.now()+60000});return s;};assert.equal(await f.core.createIpqcCPermissionPhase(new Request('http://fixture/api/ipqc-c/workflow',{headers:f.sessions.editor}),state).then(x=>x.current()),false);
});
for(const moduleName of ['ipqc-ab','ipqc-c'])void test(moduleName+' preserves every required aggregate corruption failure and performs zero GET writes',async t=>{
 const f=await setup(t,moduleName),beforeFlow=f.flow(await f.read(moduleName,'editor',moduleName==='ipqc-ab'?'&module=1':'')),snapshot=snap(f),manifest=JSON.parse(snapshot.row.values).__processRecords.values;
 for(const key of ['platformUsers','processCustomRoles','processAccessControl','masterDataControl',moduleName==='ipqc-ab'?'ipqcABMasterControl':'ipqcCMasterControl','unrelated'])for(const mode of ['missing','corrupt']){
  const original=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE),target=manifest[key].key;f.env.STATE_ARCHIVE.get=async name=>name===target?(mode==='missing'?null:{text:async()=>'{"corrupt":true}'}):original(name);
  const now=Date.now(),query='?caseMetadata=1&compact=1'+(moduleName==='ipqc-ab'?'&module=1':'');const before=await call(loadAt(f.env,prior,now),f,moduleName+'/workflow','GET',undefined,'editor',query),after=await call(loadAt(f.env,{},now),f,moduleName+'/workflow','GET',undefined,'editor',query);assert.deepEqual(after,before,key+' '+mode);assert.equal(digest(JSON.stringify(snap(f).row)),digest(JSON.stringify(snapshot.row)));assert.equal(f.objects.size,snapshot.objects.size);
  const command={action:'save',operationId:randomUUID(),clientId:'fault-fixture',sequence:1,generation:beforeFlow.generation,expectedRevision:beforeFlow.revision,input:{stateRevision:snapshot.row.revision}};
  const oldWrite=await call(loadAt(f.env,prior,now),f,moduleName+'/workflow','POST',{command},'editor',query),newWrite=await call(loadAt(f.env,{},now),f,moduleName+'/workflow','POST',{command},'editor',query);assert.deepEqual(newWrite,oldWrite,key+' '+mode+' POST fault');assert.notEqual(newWrite.status,200);assert.equal(digest(JSON.stringify(snap(f).row)),digest(JSON.stringify(snapshot.row)));assert.equal(f.objects.size,snapshot.objects.size);f.env.STATE_ARCHIVE.get=original;
 }
});
void test('C fresh post-storage session check denies lifecycle commit after revocation',async t=>{
 const f=await setup(t,'ipqc-c'),flow=f.flow(await f.read('ipqc-c')),snapshot=snap(f);const command={action:'save',operationId:randomUUID(),clientId:'revocation-fixture',sequence:1,generation:flow.generation,expectedRevision:flow.revision};
 let revoked=false,cas=0;const put=f.env.STATE_ARCHIVE.put.bind(f.env.STATE_ARCHIVE),prepare=f.env.DB.prepare.bind(f.env.DB);f.env.STATE_ARCHIVE.put=async(...args)=>{await put(...args);revoked=true;};f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('FROM process_revoked_sessions')){const first=s.first.bind(s);s.first=async()=>revoked?{expires_at:Date.now()+60000}:first();}if(/UPDATE shared_state/.test(sql)){const run=s.run.bind(s);s.run=async()=>{cas++;return run();};}return s;};
 const result=await call(f.load,f,'ipqc-c/workflow','POST',{command},'editor','?caseMetadata=1');assert.equal(result.status,401);assert.equal(result.body.error,'LOGIN_REQUIRED');assert.equal(cas,0);assert.equal(digest(JSON.stringify(snap(f).row)),digest(JSON.stringify(snapshot.row)));
});
