const {withoutLocalAtomicSave}=require('./ipqc-c-local-save-source-contract.cjs');
/* Actual candidate and published handler; synthetic SQLite/R2 only, no network. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),{randomBytes,createHash,createHmac}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {makeLoader,baselineHashes}=require('./read-performance-harness.cjs'),{accessKeys}=require('../public/process/access-policy.mjs');
const {withoutApprovedOperationAlignment}=require('./ipqc-c-operation-source-contract.cjs');
const {assertCreateMutationContract}=require('./ipqc-c-create-source-contract.cjs');
const {withoutComposedPerformance,assertComposedPerformanceContract}=require('./ipqc-c-composed-performance-source-contract.cjs');
const {withoutExplicitPermissionReadAlignment,assertPermissionReadSourceContract}=require('./ipqc-c-permissions-source-contract.cjs');
const route='app/api/ipqc-c/workflow/route.ts',base='dc8c1c2238a6dd89c2707d50e050fe8ae674c9e8';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT);CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const objects=new Map();let events=[],selects=0,revocations=0,testing=false,onGet=null,onRevocation=null;
const bucket={async put(k,v){assert(!testing,'HANDLER_R2_WRITE');objects.set(k,Buffer.from(v));},async get(k){events.push(k);onGet?.(k);const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>Uint8Array.from(b).buffer}:null;},async head(){throw Error('HANDLER_HEAD');},async delete(){throw Error('HANDLER_DELETE');}};
const secret=randomBytes(32).toString('hex'),env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:secret,PROCESS_SESSION_REVOCATION_ENABLED:'1',DEMO_LOGIN_ENABLED:'false',DB:{prepare(sql){assert(/^SELECT /i.test(sql),'HANDLER_SQL_WRITE');let args=[];return{bind(...a){args=a;return this;},async first(){if(sql.includes('FROM shared_state'))selects++;if(sql.includes('process_revoked_sessions')){revocations++;onRevocation?.();}return db.prepare(sql).get(...args)||null;},async run(){throw Error('HANDLER_SQL_WRITE');}};}}};
const load=makeLoader(env),old=makeLoader(env,{baseline:[route]}),api=load(route),prior=old(route),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),chunks=load('lib/state-chunks.ts');
const cells=(...yes)=>Object.fromEntries(accessKeys.map(k=>[k,yes.includes(k)]));
const user=(id,permission,extra={})=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:cells(permission),...extra});
const users=[user('frank','',{role:'admin'}),user('admin-two','',{role:'admin',inheritRole:true,accessOverrides:undefined}),user('reader','ipqc-c.view'),user('approval','approval.view'),user('approval-reader','approval.view',{accessOverrides:cells('approval.view','ipqc-c.view')}),user('custom','',{role:'fixture-role',inheritRole:true,accessOverrides:undefined}),user('template-denied','',{role:'blocked-role',inheritRole:true,accessOverrides:undefined}),user('override-denied','',{role:'fixture-role',inheritRole:true}),user('other','fqc.view'),user('disabled','ipqc-c.view',{enabled:false}),user('deleted','ipqc-c.view',{deletedAt:'fixture'})];
const fixture=require('./v3-quality-growth-fixture.cjs')('ipqc-c',[{id:'a'.repeat(64),bytes:0}],2,20);
const values={...fixture.values,platformUsers:JSON.stringify(users),processCustomRoles:JSON.stringify(['fixture-role','blocked-role'].map(id=>({id,name:id,lines:[],views:[],permissions:[],access:cells('ipqc-c.view')}))),processRoleTemplateOverrides:JSON.stringify({'blocked-role':{access:cells()}}),processAccessControl:'{"audit":"private-access-sentinel"}',maintenanceMode:'0',unrelated:JSON.stringify({text:'測試 Việt'.repeat(10000)})};
const install=(raw,revision=710)=>db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?)').run(revision,raw);
function request(who='reader',query='?permissions=1',{epoch=1,expired=false,forged=false,local=false}={}){const origin=local?'http://localhost':'https://permission.synthetic.invalid',payload=Buffer.from(JSON.stringify({version:2,id:who,sessionType:'platform',authEpoch:epoch,expires:Date.now()+(expired?-60000:600000),nonce:'fixture'})).toString('base64'),headers=who?{cookie:core.sessionCookieName(new Request(origin))+'='+payload+'.'+createHmac('sha256',secret).update(payload).digest('hex')}:{};if(forged)headers['X-ChatGPT-User-Id']='frank';return new Request(origin+'/api/ipqc-c/workflow'+query,{headers});}
async function run(req,baseline=false){events=[];selects=0;revocations=0;const state=db.prepare('SELECT * FROM shared_state').get(),snapshot=new Map(objects);testing=true;let response;try{response=await(baseline?prior:api).GET(req);}finally{testing=false;}const body=await response.json();if(!onGet&&!onRevocation)assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),state);assert.deepEqual(objects,snapshot);return{status:response.status,headers:[...response.headers],body,metrics:{gets:events.length,bytes:events.reduce((n,k)=>n+(objects.get(k)?.length||0),0),selects,revocations},keys:[...events]};}
const comparable=({status,headers,body})=>({status,headers,body});
// #44's existing explicit cells: no implicit withdraw from view, and restore
// is retired for new requests. Keep every other historical DTO field.
// Frozen pre-phase cells retain their independent identity checks; the current
// GET uses one selected-state phase and a fresh end-of-authority check. Counts
// below are an independent actor-class oracle, never derived from observed I/O.
const moduleViewActors=new Set(['frank','admin-two','reader','approval-reader','custom']);
const historicalExtraRevocations=who=>(who?2:0)+(moduleViewActors.has(who)?1:0)+(['frank','admin-two'].includes(who)?6:['reader','custom'].includes(who)?3:who==='approval-reader'?1:who==='approval'?-5:who?-1:0);
const phaseRevocations=who=>who?(moduleViewActors.has(who)?2:1):0;
// Execute the actual frozen pre-optimization access function with the same
// production dependencies, proving the original 16-call oracle still holds.
const phaseBase='c178ae227bcddf528a493dbf8b586cf310564c5b',ts=require('typescript'),vm=require('node:vm');
const phaseBaseBytes=execFileSync('git',['show',phaseBase+':'+route]),phaseTree=ts.createSourceFile(route,phaseBaseBytes.toString(),ts.ScriptTarget.Latest,true);
const phaseAccessNode=phaseTree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='access');assert(phaseAccessNode,'frozen access function missing');
const phaseAccessSource=phaseAccessNode.getText(phaseTree),historicalModule={exports:{}};
vm.runInNewContext(ts.transpileModule(phaseAccessSource+'\nexport {access};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:historicalModule,exports:historicalModule.exports,workflowAccess:load('lib/versioned-shared-workflow.ts').workflowAccess,ipqcCFinalReviewAllowed:load('lib/ipqc-c-access.ts').ipqcCFinalReviewAllowed,restoreAllowed:load('lib/draft-restore-access.ts').restoreAllowed,can:(...args)=>core.can(...args)});
function policyParity(actual,prior,who='reader'){
 const expected=structuredClone(comparable(prior));
 if(prior.status===200&&prior.body.restoreSaveId){assert.deepEqual(comparable(actual),{status:422,headers:prior.headers,body:{error:'DRAFT_RESTORE_NOT_SUPPORTED'}},'new restores are retired without returning any body snapshot');return;}
 if(who==='approval'){
  assert.equal(prior.status,200,'historical approval-only read');assert.equal(prior.body.permissions.view,true);
  assert.deepEqual(comparable(actual),{status:403,headers:[['cache-control','no-store'],['content-type','application/json; charset=utf-8'],['x-content-type-options','nosniff']],body:{error:'FORBIDDEN'}},'module-view denial contains no data or permissions DTO');
  return;
 }
 if(expected.status===200&&expected.body.permissions){
  const allowed=['frank','admin-two'].includes(who);
  for(const op of ['edit','save','submit','delete','withdraw','create'])expected.body.permissions[op]=allowed;
  expected.body.permissions.restore=who==='frank';
 }
 // New ordinary workflow GET exposes only the independently seeded Begin basis.
 // Permissions/history/receipt projections retain their exact historical shapes.
 if(expected.status===200&&Object.hasOwn(expected.body,'workflow')){
  const seeded=JSON.parse(values.ipqcCMasterControl),opened=seeded.versions.find(version=>['draft','pending','pending-test'].includes(version.status));
  expected.body.beginBasis={generation:seeded.workflow?.generation??null,activeVersionId:seeded.activeVersionId??null,openVersionId:opened?.id??null,openVersionStatus:opened?.status??null,openVersionRevision:opened?.revision??null};
 }
 assert.deepEqual(comparable(actual),expected);
}
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{try{const raw=await records.encodeRecordValues(bucket,values),refs=JSON.parse(raw).__processRecords.values;install(raw);let baseline,reduced,grownBaseline;
await check('P0 exact independent final-approval and module-return identity checks; return rechecks revocation',async()=>{
 const review=load('lib/ipqc-c-access.ts'),state={revision:710,values},originalCan=core.can,originalReader=core.companyReader;let trace=[];
 core.can=async(req,current,key)=>{trace.push('can:'+key);return originalCan(req,current,key);};
 core.companyReader=async(req,current)=>{trace.push('companyReader');return originalReader(req,current);};
 try{
  for(const who of users.map(user=>user.id)){
   const req=request(who);trace=[];revocations=0;testing=true;
   try{await review.ipqcCFinalReviewAllowed(req,state,'approve');}finally{testing=false;}
   assert.deepEqual(trace,['companyReader'],who+' final approval uses one independent identity reader');assert.equal(revocations,1);
   trace=[];revocations=0;testing=true;let allowed;
   try{allowed=await review.ipqcCFinalReviewAllowed(req,state,'return');}finally{testing=false;}
   const viewed=moduleViewActors.has(who);
   assert.deepEqual(trace,viewed?['can:ipqc-c.view','can:ipqc-c.return']:['can:ipqc-c.view'],who+' module return checks exact cells without platform authority');
   assert.equal(revocations,viewed?2:1,who+' each explicit cell performs its own identity check');
   assert.equal(allowed,['frank','admin-two'].includes(who),who+' return permission remains independently required');
  }
  const req=request('frank'),token=req.headers.get('cookie').slice('process_demo='.length),digest=createHash('sha256').update(token).digest('hex');let calls=0;
  onRevocation=()=>{if(++calls===2)db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(digest,Date.now()+600000,Date.now());};
  assert.equal(await review.ipqcCFinalReviewAllowed(req,state,'return'),false,'revocation between view and return denies operation');assert.equal(calls,2);
 }finally{testing=false;onRevocation=null;db.exec('DELETE FROM process_revoked_sessions');core.can=originalCan;core.companyReader=originalReader;}
});
await check('P0a frozen pre-phase identity cost and current phase keep the same exact cells/final approval',async()=>{
 const state={revision:710,values},keys=['ipqc-c.view','ipqc-c.edit','ipqc-c.save','ipqc-c.submit','ipqc-c.withdraw','ipqc-c.return','ipqc-c.create','ipqc-c.delete','ipqc-c.restore','approval.view','approval.approve','approval.compare'];
 for(const who of [...users.map(row=>row.id),'']){
  const req=request(who),baseline=await run(req,true);revocations=0;
  await core.identity(req,state);const oldRights=await historicalModule.exports.access(req,state);
  assert.equal(revocations,baseline.metrics.revocations+historicalExtraRevocations(who),who+' original pre-phase exact independent-cell cost');
  const expectedCells=await Promise.all(keys.map(key=>core.can(req,state,key)));revocations=0;
  const phase=await core.createIpqcCPermissionPhase(req,state);
  keys.forEach((key,index)=>assert.equal(phase.allowed(key),expectedCells[index],who+' unchanged cell '+key));
  assert.equal(phase.finalApprove(),oldRights.approve,who+' exact platform-only approval');
  const current=await phase.current();assert.equal(current,!!phase.actor);
  assert.equal(revocations,phase.actor?2:who?1:0,who+' independent initial and fresh terminal session checks');
 }
});
await check('P1 exact authorized operation-cell delta; other permissions revision headers and session parity',async()=>{
 for(const who of ['frank','admin-two','reader','approval','approval-reader','custom','template-denied','override-denied','other','disabled','deleted','']){const req=request(who,'?permissions=1',{forged:!who}),a=await run(req),b=await run(req,true);policyParity(a,b,who);assert.equal(a.metrics.revocations,phaseRevocations(who),who+' exact request-local phase identity-check count');assert.equal(a.status,['frank','admin-two','reader','approval-reader','custom'].includes(who)?200:403,who);assert(!JSON.stringify(a.body).includes('private-access-sentinel'));}
 for(const who of ['approval','approval-reader'])for(const query of ['','?caseMetadata=1']){const req=request(who,query),a=await run(req),b=await run(req,true);policyParity(a,b,who);assert.equal(a.metrics.revocations,phaseRevocations(who));}
 for(const opts of [{expired:true},{epoch:2}]){const req=request('reader','?permissions=1',opts);assert.deepEqual(comparable(await run(req)),comparable(await run(req,true)));assert.equal((await run(req)).status,403);}
 const local=request('reader','?permissions=1',{local:true});policyParity(await run(local),await run(local,true));
});
await check('P2 five-key R2 cost stays bounded as unrelated aggregates grow; two fresh phase identity checks',async()=>{
 const req=request(),a=await run(req),b=await run(req,true);reduced=a.metrics;baseline=b.metrics;
 policyParity(a,b);assert.equal(a.metrics.gets,5);assert.equal(a.metrics.selects,1);assert(a.metrics.gets<b.metrics.gets);assert(a.metrics.bytes<b.metrics.bytes);assert.equal(a.metrics.revocations,phaseRevocations('reader'));assert(a.metrics.revocations>1);
 assert.deepEqual(new Set(a.keys),new Set(['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'].map(k=>refs[k].key)));
 const grown={...values};for(let i=0;i<12;i++)grown['unrelated-'+i]=JSON.stringify({index:i,text:'irrelevant'.repeat(3000)});install(await records.encodeRecordValues(bucket,grown));
 const large=await run(req),oldLarge=await run(req,true);grownBaseline=oldLarge.metrics;assert.deepEqual(large.metrics,reduced);policyParity(large,oldLarge);assert(oldLarge.metrics.gets>baseline.gets);install(raw);
});
await check('P3 required missing/corrupt records still fail closed; unrelated failure isolation is explicit',async()=>{
 for(const key of ['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']){const ref=refs[key],saved=objects.get(ref.key);for(const corrupt of [false,true]){if(corrupt)objects.set(ref.key,Buffer.from('corrupt'));else objects.delete(ref.key);assert.equal((await run(request())).status,503);assert.equal((await run(request(),true)).status,503);}objects.set(ref.key,saved);}
 const ref=refs.unrelated,saved=objects.get(ref.key);objects.set(ref.key,Buffer.from('corrupt'));assert.equal((await run(request())).status,200);assert.equal((await run(request(),true)).status,503);objects.set(ref.key,saved);
});
await check('P4 revocation during selected hydration and later authority checks denies without writes',async()=>{
 const req=request(),token=req.headers.get('cookie').slice('process_demo='.length),digest=createHash('sha256').update(token).digest('hex'),revoke=()=>db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(digest,Date.now()+600000,Date.now());
 for(const baseline of [false,true]){onGet=k=>{if(k===refs.platformUsers.key)revoke();};assert.equal((await run(req,baseline)).status,403);onGet=null;db.exec('DELETE FROM process_revoked_sessions');let calls=0;onRevocation=()=>{if(++calls===2)revoke();};assert.equal((await run(req,baseline)).status,403);assert(calls>=2);onRevocation=null;db.exec('DELETE FROM process_revoked_sessions');}
});
await check('P5 existing pinned-snapshot revision and next-request epoch semantics preserved',async()=>{
 for(const baseline of [false,true]){install(raw);let changed=false;onGet=k=>{if(k===refs.platformUsers.key&&!changed){changed=true;install(JSON.stringify({...values,platformUsers:JSON.stringify(users.map(u=>u.id==='reader'?{...u,authEpoch:2}:u))}),711);}};const a=await run(request(),baseline);assert.equal(a.status,200);assert.equal(a.body.revision,710);assert.equal(a.metrics.selects,1);onGet=null;assert.equal((await run(request(),baseline)).status,403);}install(raw);
});
await check('P6 legacy inline/chunk/R2 and absent archive preserve behavior',async()=>{
 const inline=JSON.stringify(values),sha=createHash('sha256').update(inline).digest('hex'),key='snapshots/'+sha+'.json';objects.set(key,Buffer.from(inline));const formats=[raw,inline,await chunks.encodeChunkedValues(bucket,values),JSON.stringify({__processR2:{key,sha256:sha}})];
 for(const format of formats){install(format);policyParity(await run(request()),await run(request(),true));}
 const original=env.STATE_ARCHIVE;try{env.STATE_ARCHIVE=undefined;install(inline);assert.equal((await run(request())).status,200);install(raw);assert.equal((await run(request())).status,503);}finally{env.STATE_ARCHIVE=original;install(raw);}
});
await check('P7 non-permissions GET preserves data/I/O and exact permission DTO with phase session fences',async()=>{
 for(const query of ['?caseMetadata=1','?since=not-current','?history=cases','?caseId=case0','?uiHistory=1','?legacyHistory=1','?versionId=active','?restoreSaveId=save0','?operationId=not-found']){const req=request('frank',query),a=await run(req),b=await run(req,true);policyParity(a,b,'frank');assert.deepEqual(a.metrics,{...b.metrics,revocations:phaseRevocations('frank')},query);}
 // Existing permissions precedence remains, even with unrelated selectors present.
 const req=request('frank','?permissions=1&caseId=missing&restoreSaveId=missing');policyParity(await run(req),await run(req,true),'frank');
 const denied=request('admin-two','?restoreSaveId=save0'),a=await run(denied),b=await run(denied,true);assert.equal(b.status,200);assert.deepEqual(comparable(a),{status:403,headers:b.headers,body:{error:'FORBIDDEN'}},'ordinary admin cannot inherit restore from edit');assert.equal(a.metrics.revocations,phaseRevocations('admin-two'));
});
await check('P8 exact composed performance plus #44 permission/restore spans and historical read-selection proof',async()=>{
 const priorBytes=execFileSync('git',['show',base+':'+route]),committedBytes=execFileSync('git',['show','HEAD:'+route]);
 const lf=bytes=>Buffer.from([...bytes].filter((value,index)=>value!==13||bytes[index+1]!==10));assert.deepEqual(lf(fs.readFileSync(route)),lf(committedBytes),'working tree differs beyond CRLF');
 const createBase=assertCreateMutationContract(withoutLocalAtomicSave(committedBytes)).normalized;
 assertComposedPerformanceContract(createBase);
 const explicitBytes=withoutComposedPerformance(createBase);
 assertPermissionReadSourceContract(explicitBytes);
 const candidateBytes=withoutApprovedOperationAlignment(route,withoutExplicitPermissionReadAlignment(explicitBytes)),delta=Buffer.from("...(query.has('permissions')?{keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode']}:{}),"),at=candidateBytes.indexOf(delta);assert(at>=0);assert.equal(candidateBytes.indexOf(delta,at+delta.length),-1);assert.deepEqual(Buffer.concat([candidateBytes.subarray(0,at),candidateBytes.subarray(at+delta.length)]),priorBytes);
 const marker=Buffer.from('export async function POST('),a=priorBytes.indexOf(marker),b=candidateBytes.indexOf(marker);assert(a>=0&&b>=0);assert.deepEqual(candidateBytes.subarray(b),priorBytes.subarray(a));
});
console.log(JSON.stringify({status:'PASS',groups:checks.length,checks,baseline,reduced,grownBaseline,baselineCommit:base,baselineHashes:baselineHashes(),network:false,handlerWrites:0,limits:['Synthetic storage work counts, not live latency','Exact #44 view/operation deltas plus independent final-review/module-return readers; new restore previews are retired; composed Save/performance spans reverse to native #44; other response data and read boundaries retained','Unrelated records failure isolation deliberately differs; required records remain fail closed','No cross-request authority cache; exact current phase costs include denied actors and fresh terminal checks. Frozen pre-phase cost and standalone independent review/return readers remain verified; retired restores perform no preview authorization reads']}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
