/* oxlint-disable typescript/no-require-imports -- real GET handler, synthetic SQLite/R2 only; no network or file writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomBytes,createHash}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();let reads=[],bytes=0,puts=0,stateReads=0,onGet=null;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
db.exec('CREATE TABLE process_revoked_sessions(token_digest TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
const bucket={async put(key,value){puts++;objects.set(key,Buffer.from(value));},async get(key){reads.push(key);onGet?.(key);const raw=objects.get(key);if(!raw)return null;bytes+=raw.length;return{text:async()=>raw.toString(),arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)};}};
const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){if(sql.includes('FROM shared_state'))stateReads++;return db.prepare(sql).get(...args)||null;},async run(){throw Error('GET_DB_WRITE_REFUSED');}};}}};
const load=harness(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),chunks=load('lib/state-chunks.ts'),route=load('app/api/routine-equipment/route.ts');
const {accessKeys}=require('../public/process/access-policy.mjs'),{equipmentCatalog,projectEquipmentCatalog}=require('../lib/equipment-catalog.mjs');
const actor=(id,permission)=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,inheritRole:false,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,k===permission]))});
const users=[actor('equipment-reader','equipment.view'),actor('other','fqc.view'),actor('denied','')];
const current={id:'active',status:'approved',equipment:[{id:'tool-active',name:'active tool',enabled:true,photoId:'a'.repeat(64)}],groups:[],categories:[],subcategories:[]};
const history=Array.from({length:15},(_,i)=>({id:'old-'+i,status:'superseded',equipment:[{id:'old-tool-'+i,notes:'private '+i+' '.repeat(20000)}],groups:[],categories:[],subcategories:[],issues:[]}));
const control={schemaVersion:1,activeVersionId:'active',versions:[current,...history,{id:'draft',status:'draft',equipment:[{id:'draft-tool'}],groups:[]}],issues:[{status:'unresolved',resolution:'preserve-current-issue'}],reservedMarks:{A:['001']}};
const values={platformUsers:JSON.stringify(users),routineEquipmentControl:JSON.stringify(control),iqcMasterControl:JSON.stringify({schemaVersion:1,activeVersionId:'iqc-active',versions:[{id:'iqc-active',status:'approved',snapshot:{items:[{notes:'unrelated'.repeat(20000)}]}}]}),sentinel:'"untouched"'};
const path='/api/routine-equipment?catalog=effective';
async function request(who='equipment-reader',url=path){const base=new Request('https://equipment-fixture.invalid'+url),token=await core.demoSession(base,who,false,1);return new Request(base.url,{headers:{cookie:core.sessionCookie(base,token).split(';')[0]}});}
async function get(req){const before=puts,state=db.prepare('SELECT "values" v,revision FROM shared_state').get();const response=await route.GET(req),body=await response.json();assert.equal(puts,before,'GET cannot write R2');if(!onGet)assert.deepEqual(db.prepare('SELECT "values" v,revision FROM shared_state').get(),state,'GET cannot write business state');return{response,body};}
function install(raw,revision=17){db.prepare('INSERT OR REPLACE INTO shared_state VALUES(1,?,?,?)').run(revision,raw,'fixture');}
function metrics(){const result={gets:reads.length,bytes,stateReads};reads=[];bytes=0;stateReads=0;return result;}
const checks=[];async function check(name,run){await run();checks.push(name);}
(async()=>{try{
 const raw=await records.encodeRecordValues(bucket,values),envelope=JSON.parse(raw),equipmentKey=envelope.__processRecords.values.routineEquipmentControl.key;
 install(raw);let baseline,reduced;
 await check('real full and narrow GET return identical FQC active catalog fields with fewer immutable reads',async()=>{
  metrics();const full=await get(await request('equipment-reader','/api/routine-equipment'));assert.equal(full.response.status,200);baseline=metrics();
  const narrow=await get(await request());assert.equal(narrow.response.status,200);reduced=metrics();
  const fullActive=full.body.control.versions.find(v=>v.id===full.body.control.activeVersionId),actual=narrow.body.control.versions[0];
  for(const field of ['equipment','groups','categories','subcategories','issues'])assert.deepEqual(actual[field],fullActive[field]||(field==='issues'?full.body.control.issues:[]));
  assert.equal(narrow.body.revision,17);assert.equal(narrow.body.control.versions.length,1);assert.equal(narrow.body.control.workflow,undefined);assert.equal(narrow.response.headers.get('cache-control'),'no-store');
  assert(reduced.gets<baseline.gets);assert(reduced.bytes<baseline.bytes);assert.equal(baseline.stateReads,1);assert.equal(reduced.stateReads,1);
 });
 await check('unauthenticated and unrelated-role callers do not fetch equipment aggregate',async()=>{
  for(const req of [new Request('https://equipment-fixture.invalid'+path),await request('denied'),await request('other')]){metrics();const r=await get(req);assert.equal(r.response.status,403);assert(!reads.includes(equipmentKey));}
 });
 await check('records response never reads unrelated aggregate or superseded/draft equipment bodies',async()=>{
  metrics();const r=await get(await request());assert.equal(r.response.status,200);assert(!reads.includes(envelope.__processRecords.values.iqcMasterControl.key));
  const aggregate=JSON.parse(objects.get(equipmentKey));for(const v of aggregate.versions.filter(v=>v.id!=='active'))assert(!reads.includes(v.equipment.__immutableBody.key));
  assert(!JSON.stringify(r.body).includes('old-tool'));assert(!JSON.stringify(r.body).includes('draft-tool'));
 });
 await check('inline, chunks, R2 envelope and immutable records retain active fields and meaningful issue fallback',async()=>{
  const inline=JSON.stringify(values),snapshotKey='snapshots/'+createHash('sha256').update(inline).digest('hex')+'.json';await bucket.put(snapshotKey,inline);
  const representations=[inline,await chunks.encodeChunkedValues(bucket,values),JSON.stringify({__processR2:{key:snapshotKey,sha256:snapshotKey.slice(10,-5)}}),raw];
  for(const representation of representations){install(representation);const r=await get(await request());assert.equal(r.response.status,200);assert.deepEqual(r.body.control.versions[0].equipment,current.equipment);assert.deepEqual(r.body.control.versions[0].issues,control.issues);assert.equal(r.body.control.versions[0].status,'approved');}install(raw);
 });
 await check('adopted control excludes private workflow bodies without changing active equipment',async()=>{
  const adopted={...control,workflow:{working:{secret:'working body'},cases:[{id:'private-case',content:{secret:'case body'}}],saves:[{content:{secret:'save body'}}]}};
  const encoded=await records.encodeRecordValues(bucket,{...values,routineEquipmentControl:JSON.stringify(adopted)});install(encoded);metrics();const r=await get(await request());assert.equal(r.response.status,200);assert.deepEqual(r.body.control.versions[0].equipment,current.equipment);assert(!JSON.stringify(r.body).includes('secret'));
  const aggregate=JSON.parse(objects.get(JSON.parse(encoded).__processRecords.values.routineEquipmentControl.key));assert(!reads.includes(aggregate.workflow.working.__immutableBody.key));install(raw);
 });
 await check('legal empty and missing catalogs retain empty success; malformed or inactive data fails closed',async()=>{
  const empty={schemaVersion:1,activeVersionId:null,versions:[],issues:[{resolution:'empty issue'}],reservedMarks:{}};
  for(const supplied of [empty,undefined]){const data={...values};if(supplied)data.routineEquipmentControl=JSON.stringify(supplied);else delete data.routineEquipmentControl;install(await records.encodeRecordValues(bucket,data));const r=await get(await request());assert.equal(r.response.status,200);assert.deepEqual(r.body.control.versions,[]);assert.equal(r.body.control.activeVersionId,null);assert.deepEqual(r.body.control.issues,supplied?.issues||[]);}
  for(const bad of [{...empty,schemaVersion:2},{...empty,reservedMarks:[]},{...empty,versions:[{...current,status:'draft'}]},{...control,activeVersionId:'absent'},{...control,versions:[current,current]},{...control,versions:[{...current,status:'draft'}]},{...control,versions:[{...current,equipment:{}}]},{...control,versions:[{...current,groups:null}]}]){
   install(JSON.stringify({...values,routineEquipmentControl:JSON.stringify(bad)}));assert.equal((await get(await request())).response.status,503);
  }install(raw);
 });
 await check('immutable integrity failure refuses delivery without fallback or writes',async()=>{
  const original=objects.get(equipmentKey);objects.set(equipmentKey,Buffer.from('{}'));assert.equal((await get(await request())).response.status,503);objects.set(equipmentKey,original);
  const aggregate=JSON.parse(original),bodyKey=aggregate.versions[0].equipment.__immutableBody.key,body=objects.get(bodyKey);objects.delete(bodyKey);assert.equal((await get(await request())).response.status,503);objects.set(bodyKey,body);
 });
 await check('unrelated revision and role changes keep baseline single-snapshot semantics without new retry',async()=>{
  const req=await request();
  for(const change of ['revision','epoch','permission']){install(raw);let triggered=false;onGet=key=>{if(key!==equipmentKey||triggered)return;triggered=true;
   if(change==='revision'){db.prepare('UPDATE shared_state SET revision=18').run();return;}
   const changedUsers=users.map(user=>user.id==='equipment-reader'?{...user,...(change==='epoch'?{authEpoch:2}:{accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,false]))})}:user);
   install(JSON.stringify({...values,platformUsers:JSON.stringify(changedUsers)}));
  };const r=await get(req);assert(triggered);assert.equal(r.response.status,200);assert.equal(r.body.revision,17);assert.deepEqual(r.body.control.versions[0].equipment,current.equipment);onGet=null;}install(raw);
 });
 await check('per-session revocation after hydration is refused without another global state read',async()=>{
  env.PROCESS_SESSION_REVOCATION_ENABLED='1';const req=await request();let fired=false;onGet=key=>{if(fired||key!==equipmentKey)return;fired=true;const token=req.headers.get('cookie').split('=')[1],hash=createHash('sha256').update(token).digest('hex');db.prepare('INSERT INTO process_revoked_sessions VALUES(?,?,?)').run(hash,Date.now()+60000,Date.now());};
  assert.equal((await get(req)).response.status,403);assert(fired);onGet=null;env.PROCESS_SESSION_REVOCATION_ENABLED=undefined;
 });
 await check('projected storage stays partial and cannot become a saved state baseline',async()=>{
  const projected=await records.decodeRecordValues(bucket,envelope,{keys:['routineEquipmentControl'],projectValue:projectEquipmentCatalog});
  assert.equal(projected.recordStorage.partial,true);assert.equal(projected.recordStorage.models.size,0);
  const before=puts;await assert.rejects(records.encodeRecordValues(bucket,projected.values,projected.recordStorage),/Partial read cannot be saved/);assert.equal(puts,before);
 });
 await check('projector is narrow and final boundary refuses unhydrated references',async()=>{
  assert.equal(projectEquipmentCatalog('other',JSON.stringify(control)),undefined);
  const aggregate=JSON.parse(objects.get(equipmentKey));assert.throws(()=>equipmentCatalog(projectEquipmentCatalog('routineEquipmentControl',JSON.stringify(aggregate))),/EQUIPMENT_CATALOG_INVALID/);
 });
 console.log(JSON.stringify({pass:true,checks:checks.length,names:checks,baseline,reduced,network:false,businessWrites:false}));
}catch(error){console.error(error);process.exitCode=1;}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
