/* oxlint-disable typescript/no-require-imports -- actual handlers; isolated SQLite/R2, no network. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomBytes,createHash}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();let reads=[],bytes=0,puts=0,stateReads=0,sqlReads=0,onGet=null;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
db.exec('CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const bucket={async put(key,value){puts++;objects.set(key,Buffer.from(value));},async get(key){reads.push(key);onGet?.(key);const raw=objects.get(key);if(!raw)return null;bytes+=raw.length;return{text:async()=>raw.toString(),arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length)};}};
const env={PROCESS_SESSION_REVOCATION_ENABLED:'1',STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){sqlReads++;if(sql.includes('FROM shared_state'))stateReads++;return db.prepare(sql).get(...args)||null;},async run(){throw Error('GET_DB_WRITE_REFUSED');}};}}};
const load=harness(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),chunks=load('lib/state-chunks.ts'),draft=load('lib/shared-draft.ts'),route=load('app/api/master/workflow/route.ts'),catalog=load('lib/master-catalog.ts');
const {accessKeys}=require('../public/process/access-policy.mjs');
const user=(id,permission)=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,k===permission]))});
const editor=user('ab-editor','ab.view');for(const key of ['ab.edit','ab.delete'])editor.accessOverrides[key]=true;
const capabilities=(id,keys)=>{const account=user(id,'ab.view');for(const key of keys)account.accessOverrides[key]=true;return account;};
const users=[user('ab-reader','ab.view'),editor,user('fqc-only','fqc.view'),user('denied',''),capabilities('ab-create',['ab.edit','ab.create']),capabilities('ab-restore',['ab.edit','ab.restore']),capabilities('ab-both',['ab.edit','ab.create','ab.restore']),capabilities('ab-no-edit',['ab.create','ab.restore']),capabilities('c-grants',['ab.edit','c.view','c.edit','c.create','c.restore'])];
const snapshot={products:[{code:'QA-A',name:'Synthetic A',line:'A',category:'QA',stages:['A-CUT']}],lines:[{code:'A',name:'Synthetic A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'QA'}]};
const cSnapshot={products:[{code:'QA-C',name:'C',line:'C',category:'C',stages:['C-ST'],notes:'unneeded C '.repeat(20000)}],lines:[{code:'C',name:'C',stages:[{code:'C-ST',name:'C'}]}],categoryGroups:[]};
const draftSnapshot={...structuredClone(snapshot),products:[{...snapshot.products[0],code:'DRAFT',notes:'unneeded draft '.repeat(20000)}]};
const root={active:{AB:snapshot,C:cSnapshot,PROCESS:{'A-CUT':[{id:'t',name:'template',notes:'unneeded template '.repeat(10000)}]}},versions:[
{id:'ab-active',scope:'AB',number:3,status:'approved',snapshot},
{id:'ab-draft',scope:'AB',number:4,status:'draft',snapshot:draftSnapshot},
{id:'ab-history',scope:'AB',number:1,status:'superseded',snapshot:{...snapshot,notes:'history '.repeat(20000)}},
{id:'c-active',scope:'C',number:2,status:'approved',snapshot:cSnapshot}],workflowScopes:{AB:draft.createSharedDraft('master:AB',draftSnapshot,'ab-active','g-ab')}};
const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),qualityMasterControl:JSON.stringify({unrelated:'quality '.repeat(10000)}),sentinel:'"unchanged"'};
const fullPath='/api/master/workflow?scope=AB&caseMetadata=1',narrowPath='/api/master/workflow?scope=AB&catalog=effective';
async function request(who='ab-reader',url=narrowPath){const base=new Request('https://catalog-fixture.invalid'+url),token=await core.demoSession(base,who,false,1);return new Request(base.url,{headers:{cookie:core.sessionCookie(base,token).split(';')[0]}});}
function install(raw,revision=17){db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?,?)').run(revision,raw,'fixture');}
function metrics(){const result={r2Gets:reads.length,r2Bytes:bytes,stateReads,sqlReads};reads=[];bytes=0;stateReads=0;sqlReads=0;return result;}
async function get(req){const before=puts,state=db.prepare('SELECT "values" v,revision FROM shared_state').get(),cpu=process.cpuUsage(),start=process.hrtime.bigint();const response=await route.GET(req),body=await response.json();const used=process.cpuUsage(cpu);assert.equal(puts,before,'GET never writes R2');if(!onGet)assert.deepEqual(db.prepare('SELECT "values" v,revision FROM shared_state').get(),state,'GET never writes shared state');return{status:response.status,body,headers:response.headers,localCpuMicros:used.user+used.system,localElapsedMicros:Number(process.hrtime.bigint()-start)/1000};}
function activeProjection(body){const control=body.control,active=control?.versions?.filter(v=>v.id===control.activeVersionId&&v.status==='approved');return active?.length===1?active[0].snapshot:null;}
const checks=[],policyDifferences=[],legacyCosts=[];async function check(name,fn){await fn();checks.push(name);}
(async()=>{try{
 const raw=await records.encodeRecordValues(bucket,values),envelope=JSON.parse(raw),masterKey=envelope.__processRecords.values.masterDataControl.key;install(raw);let baseline,reduced;
 await check('same records fixture returns identical normalized approved AB and permissions with lower reads/bytes',async()=>{
  metrics();const full=await get(await request('ab-reader',fullPath));assert.equal(full.status,200);baseline={...metrics(),localCpuMicros:full.localCpuMicros,localElapsedMicros:full.localElapsedMicros};
  const narrow=await get(await request());assert.equal(narrow.status,200);reduced={...metrics(),localCpuMicros:narrow.localCpuMicros,localElapsedMicros:narrow.localElapsedMicros};
  assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));assert.deepEqual(narrow.body.permissions,full.body.permissions);assert.equal(narrow.body.control.versions.length,1);assert.equal(narrow.body.control.workflow,undefined);assert.equal(narrow.body.revision,full.body.revision);assert.equal(narrow.headers.get('cache-control'),'no-store');
  assert(reduced.r2Gets<baseline.r2Gets);assert(reduced.r2Bytes<baseline.r2Bytes);assert.equal(reduced.stateReads,baseline.stateReads);assert.equal(reduced.sqlReads,baseline.sqlReads);
 });
 await check('view authorization is AB-specific and occurs before master aggregate reads',async()=>{
  for(const req of [new Request('https://catalog-fixture.invalid'+narrowPath),await request('denied'),await request('fqc-only')]){metrics();assert.equal((await get(req)).status,403);assert(!reads.includes(masterKey));}
 });
 await check('editor/delete metadata matches ordinary AB permissions without granting a write capability',async()=>{
  const full=await get(await request('ab-editor',fullPath)),narrow=await get(await request('ab-editor'));assert.equal(full.status,200);assert.equal(narrow.status,200);assert.deepEqual(narrow.body.permissions,full.body.permissions);assert.equal(narrow.body.permissions.edit,true);assert.equal(narrow.body.permissions.delete,true);
 });
 await check('explicit create/restore metadata matches full workflow without inferring edit or cross-scope grants',async()=>{
  for(const [who,create,restore]of [['ab-reader',false,false],['ab-editor',false,false],['ab-create',true,false],['ab-restore',false,true],['ab-both',true,true],['ab-no-edit',false,false],['c-grants',false,false]]){
   const full=await get(await request(who,fullPath)),narrow=await get(await request(who));assert.equal(full.status,200,who);assert.equal(narrow.status,200,who);assert.deepEqual(narrow.body.permissions,full.body.permissions,who+' exact permission DTO');assert.equal(narrow.body.permissions.create,create,who+' explicit create');assert.equal(narrow.body.permissions.restore,restore,who+' explicit restore');assert.equal(narrow.body.control.versions.length,1);assert.equal(narrow.body.control.workflow,undefined);assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));
  }
 });
 await check('create/restore revocation between preflight and selected snapshot is reflected without granting a write',async()=>{
  for(const key of ['ab.create','ab.restore'])for(const path of [fullPath,narrowPath]){install(raw);let hit=false;onGet=objectKey=>{if(objectKey===envelope.__processRecords.values.platformUsers.key&&!hit){hit=true;const changed=users.map(u=>u.id==='ab-both'?{...u,accessOverrides:{...u.accessOverrides,[key]:false}}:u);install(JSON.stringify({...values,platformUsers:JSON.stringify(changed)}),18);}};const result=await get(await request('ab-both',path));assert.equal(result.status,200);assert(hit);assert.equal(result.body.permissions[key.split('.')[1]],false);assert.equal(result.body.permissions.view,true);assert.equal(result.body.permissions.edit,true);assert.equal(result.body.revision,18);onGet=null;}install(raw);
 });
 await check('record projection reads no C/PROCESS or AB working/draft/history body',async()=>{
  metrics();const r=await get(await request());assert.equal(r.status,200);const aggregate=JSON.parse(objects.get(masterKey));
  for(const value of [aggregate.active.C,aggregate.active.PROCESS,aggregate.versions[1].snapshot,aggregate.versions[2].snapshot,aggregate.workflowScopes.AB.working])assert(!reads.includes(value.__immutableBody.key));
  assert(!JSON.stringify(r.body).includes('DRAFT'));assert(!JSON.stringify(r.body).includes('unneeded'));
 });
 await check('inline, chunked, R2 envelope and records preserve same approved normalized catalog',async()=>{
  const inline=JSON.stringify(values),key='snapshots/'+createHash('sha256').update(inline).digest('hex')+'.json';await bucket.put(key,inline);
  for(const representation of [inline,await chunks.encodeChunkedValues(bucket,values),JSON.stringify({__processR2:{key,sha256:key.slice(10,-5)}}),raw]){install(representation);const full=await get(await request('ab-reader',fullPath)),narrow=await get(await request());assert.equal(full.status,200);assert.equal(narrow.status,200);assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));}install(raw);
 });
 async function pair(control){install(await records.encodeRecordValues(bucket,{...values,masterDataControl:JSON.stringify(control)}));const full=await get(await request('ab-reader',fullPath)),narrow=await get(await request());return{full,narrow};}
 await check('legacy non-adopted and genuinely empty approved catalog retain normalization and no fallback working',async()=>{
  for(const source of [(()=>{const c=structuredClone(root);delete c.workflowScopes;return c;})(),{active:{AB:{products:[],lines:[]}},versions:[{id:'empty',scope:'AB',status:'approved',snapshot:{products:[],lines:[]}}]}]){const {full,narrow}=await pair(source);assert.equal(full.status,200);assert.equal(narrow.status,200);assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));}install(raw);
 });
 await check('preferred matching active id and first-matching legacy fallback remain exact',async()=>{
  for(const pointer of ['ab-other','missing','ab-draft']){const c=structuredClone(root);c.versions.splice(1,0,{id:'ab-other',scope:'AB',number:5,status:'approved',snapshot:{categoryGroups:snapshot.categoryGroups,lines:snapshot.lines,products:snapshot.products}});c.workflowScopes.AB.active.id=pointer;const {full,narrow}=await pair(c);assert.equal(full.status,200);assert.equal(narrow.status,200);assert.equal(narrow.body.control.activeVersionId,full.body.control.activeVersionId);assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));}install(raw);
 });
 await check('adopted nonactive approved bodies stay deferred, including huge or missing bodies',async()=>{
  const c=structuredClone(root);c.versions.push({id:'approved-other',scope:'AB',number:1,status:'approved',snapshot:{...snapshot,notes:'other-approved '.repeat(30000)}});
  const encoded=await records.encodeRecordValues(bucket,{...values,masterDataControl:JSON.stringify(c)}),agg=JSON.parse(objects.get(JSON.parse(encoded).__processRecords.values.masterDataControl.key)),ref=agg.versions.at(-1).snapshot.__immutableBody;install(encoded);
  for(const missing of [false,true]){const saved=objects.get(ref.key);if(missing)objects.delete(ref.key);metrics();const full=await get(await request('ab-reader',fullPath));assert.equal(full.status,200);assert(!reads.includes(ref.key));metrics();const narrow=await get(await request());assert.equal(narrow.status,200);assert(!reads.includes(ref.key));assert.deepEqual(activeProjection(narrow.body),activeProjection(full.body));if(missing)objects.set(ref.key,saved);}install(raw);
 });
 await check('missing source, invalid active shape and unmatched baseline retain refusal statuses',async()=>{
  for(const c of [{active:{},versions:[]},{active:{AB:snapshot},versions:{}},{active:{AB:snapshot},versions:[]},{active:{AB:{products:{},lines:[]}},versions:[{id:'bad',scope:'AB',status:'approved',snapshot:{products:{},lines:[]}}]}]){const {full,narrow}=await pair(c);assert(full.status>=400);assert.equal(narrow.status,full.status);assert.equal(narrow.body.error,full.body.error);}
  const v={...values};delete v.masterDataControl;install(await records.encodeRecordValues(bucket,v));const full=await get(await request('ab-reader',fullPath)),narrow=await get(await request());assert.equal(full.status,422);assert.equal(narrow.status,422);assert.equal(narrow.body.error,'MASTER_INITIALIZATION_REQUIRED');install(raw);
 });
 await check('duplicate selected IDs remain unusable rather than becoming a one-row success',async()=>{
  const c=structuredClone(root);c.versions.push({...c.versions[0]});c.catalogVersionIds=['ab-active'];const {full,narrow}=await pair(c);assert.equal(full.status,200);assert.equal(activeProjection(full.body),null,'existing FQC client rejects duplicate IDs');assert.equal(narrow.status,409);assert.equal(narrow.body.error,'MASTER_EFFECTIVE_BASELINE_CONFLICT');install(raw);
 });
 await check('catalog selector refuses C/PROCESS/invalid scope without changing ordinary route',async()=>{
  for(const scope of ['C','PROCESS','invalid'])assert.equal((await get(await request('ab-reader','/api/master/workflow?catalog=effective&scope='+scope))).status,422);
  const full=await get(await request('ab-reader',fullPath));assert.equal(full.status,200);
 });
 await check('required aggregate/active integrity failures still fail closed',async()=>{
  const aggregate=objects.get(masterKey);objects.set(masterKey,Buffer.from('{}'));assert.equal((await get(await request())).status,503);objects.set(masterKey,aggregate);
  const bodyKey=JSON.parse(aggregate).active.AB.__immutableBody.key,body=objects.get(bodyKey);objects.delete(bodyKey);for(const path of [fullPath,narrowPath])assert.equal((await get(await request('ab-reader',path))).status,503);objects.set(bodyKey,body);
 });
 await check('revocation during domain read remains forbidden in both handlers',async()=>{
  for(const path of [fullPath,narrowPath]){install(raw);const req=await request('ab-reader',path),token=req.headers.get('cookie').split('=').slice(1).join('='),digest=createHash('sha256').update(token).digest('hex');let hit=false;onGet=key=>{if(key===masterKey&&!hit){hit=true;db.prepare('INSERT INTO process_revoked_sessions VALUES(?,?,?)').run(digest,Date.now()+3600000,Date.now());}};assert.equal((await get(req)).status,403);assert(hit);onGet=null;db.prepare('DELETE FROM process_revoked_sessions').run();}install(raw);
 });
 await check('permission/epoch change between auth preflight and selected snapshot remains forbidden',async()=>{
  for(const kind of ['permission','epoch'])for(const path of [fullPath,narrowPath]){install(raw);let hit=false;onGet=key=>{if(key===envelope.__processRecords.values.platformUsers.key&&!hit){hit=true;const changed=users.map(u=>u.id==='ab-reader'?{...u,...(kind==='epoch'?{authEpoch:2}:{accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))})}:u);install(JSON.stringify({...values,platformUsers:JSON.stringify(changed)}),18);}};assert.equal((await get(await request('ab-reader',path))).status,403);onGet=null;}install(raw);
 });
 await check('unrelated revision during domain hydration retains existing pinned snapshot behavior',async()=>{
  for(const path of [fullPath,narrowPath]){install(raw);let hit=false;onGet=key=>{if(key===masterKey&&!hit){hit=true;db.prepare('UPDATE shared_state SET revision=18').run();}};const r=await get(await request('ab-reader',path));assert.equal(r.status,200);assert.equal(r.body.revision,17);onGet=null;}install(raw);
 });
 await check('explicit excluded-body fault policy differences are measured, not called equivalent',async()=>{
  for(const [label,field]of [['C active','C'],['PROCESS active','PROCESS'],['AB draft','draft']]){
   const source=structuredClone(root);if(field==='legacy-history')delete source.workflowScopes;
   const encoded=await records.encodeRecordValues(bucket,{...values,masterDataControl:JSON.stringify(source)});install(encoded);const agg=JSON.parse(objects.get(JSON.parse(encoded).__processRecords.values.masterDataControl.key));const ref=field==='draft'?agg.versions[1].snapshot:field==='legacy-history'?agg.versions[2].snapshot:agg.active[field];const key=ref.__immutableBody.key,body=objects.get(key);objects.delete(key);
   const full=await get(await request('ab-reader',fullPath)),narrow=await get(await request());assert.equal(full.status,503);assert.equal(narrow.status,200);policyDifferences.push({excludedBody:label,oldStatus:503,newStatus:200,acceptance:'HOLD_OWNER_FAULT_POLICY_DECISION',writes:0});objects.set(key,body);
  }install(raw);
 });
 await check('unadopted legacy missing historical body retains ordinary 503 through fallback',async()=>{
  const c=structuredClone(root);delete c.workflowScopes;const encoded=await records.encodeRecordValues(bucket,{...values,masterDataControl:JSON.stringify(c)}),agg=JSON.parse(objects.get(JSON.parse(encoded).__processRecords.values.masterDataControl.key)),key=agg.versions[2].snapshot.__immutableBody.key,saved=objects.get(key);install(encoded);objects.delete(key);
  for(const path of [fullPath,narrowPath])assert.equal((await get(await request('ab-reader',path))).status,503);objects.set(key,saved);install(raw);
 });
 await check('legacy fallback cost is measured separately and not presented as an optimization',async()=>{
  const c=structuredClone(root);delete c.workflowScopes;const v={...values,masterDataControl:JSON.stringify(c)};
  for(const [kind,representation]of [['inline',JSON.stringify(v)],['unadopted-records',await records.encodeRecordValues(bucket,v)]]){install(representation);metrics();const full=await get(await request('ab-reader',fullPath));const before=metrics();const narrow=await get(await request());const after=metrics();assert.equal(full.status,200);assert.equal(narrow.status,200);assert.deepEqual(narrow.body,full.body);assert(after.stateReads>before.stateReads);legacyCosts.push({kind,baseline:before,fallback:after,claim:'compatibility fallback, not faster'});}install(raw);
 });
 await check('SHA-valid malformed AB draft is an explicit excluded-draft policy difference',async()=>{
  const c=structuredClone(root);c.versions[1].snapshot={products:{not:'array'},lines:[],categoryGroups:[]};install(await records.encodeRecordValues(bucket,{...values,masterDataControl:JSON.stringify(c)}));const full=await get(await request('ab-reader',fullPath)),narrow=await get(await request());assert.equal(full.status,422);assert.equal(full.body.error,'CATALOG_ARRAY_REQUIRED');assert.equal(narrow.status,200);policyDifferences.push({excludedBody:'AB draft malformed shape with valid SHA',oldStatus:422,newStatus:200,acceptance:'HOLD_OWNER_FAULT_POLICY_DECISION',writes:0});install(raw);
 });
 await check('projected data retains partial-write refusal and cannot become a mutation baseline',async()=>{
  const selected=await records.decodeRecordValues(bucket,envelope,{keys:['masterDataControl'],projectValue:catalog.projectMasterCatalog});assert.equal(selected.recordStorage.partial,true);assert.equal(selected.recordStorage.models.size,0);const before=puts;await assert.rejects(records.encodeRecordValues(bucket,selected.values,selected.recordStorage),/Partial read cannot be saved/);assert.equal(puts,before);assert.equal(catalog.projectMasterCatalog('other','{}'),undefined);
 });
 console.log(JSON.stringify({status:'PASS_ISOLATED_CONTRACTS_WITH_POLICY_ACCEPTANCE_HOLD',checks:checks.length,names:checks,baseline,reduced,legacyCosts,policyDifferences,cpuLimit:'Node process CPU on synthetic fixtures, not native Worker CPU or live performance',network:false,businessWrites:false,liveTests:false}));
}catch(error){console.error(error);process.exitCode=1;}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
