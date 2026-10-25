/* oxlint-disable typescript/no-require-imports -- isolated real handlers, SQLite and synthetic R2; no network. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash,randomBytes}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();let gets=[],bytes=0,puts=0,cancels=0,onGet=null;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
const digest=x=>createHash('sha256').update(x).digest('hex');
const bucket={async put(key,value,options={}){puts++;objects.set(key,{raw:typeof value==='string'?value:Buffer.from(value),...options});},async get(key){
 gets.push(key);onGet?.(key);const item=objects.get(key);if(!item)return null;const raw=Buffer.from(item.raw);bytes+=raw.length;
 return {size:raw.length,text:async()=>raw.toString(),customMetadata:item.customMetadata,httpMetadata:item.httpMetadata,
  body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(raw));},cancel(){cancels++;}})};
}};
const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:randomBytes(32).toString('hex'),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts');
const canonical=load('app/api/canonical-assets/route.ts'),media=load('app/api/state-media/route.ts'),versions=load('app/api/effective-versions/route.ts');
// Setup may seed synthetic objects; none of the actual GET handlers may write.
for(const route of [canonical,media,versions]){const get=route.GET;route.GET=async request=>{const before=puts;try{return await get(request);}finally{assert.equal(puts,before,'read handler must not write R2');}};}
const {imageUrl}=require('../lib/canonical-images.mjs'),{accessKeys}=require('../public/process/access-policy.mjs');
const {effectiveVersionMetadata}=require('../lib/effective-version-metadata.mjs');
const actor=(id,permission)=>({id,name:id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,k===permission]))});
const users=[actor('player','player.view'),actor('quality','iqc.view'),actor('editor','editor.view'),actor('denied','')];
const id='a'.repeat(64),image=Buffer.from([1,2,3,4]),version=digest(image),mediaId='b'.repeat(64),hidden='c'.repeat(64);
const url=imageUrl({sha256:id,web:{sha256:version}}),mediaUrl='/api/state-media?id='+mediaId;
const content={photos:[url,mediaUrl]},history=Array.from({length:24},(_,i)=>({id:'old'+i,status:'superseded',snapshot:{padding:'history-'+i+' '.repeat(16000),image:'/api/state-media?id='+hidden}}));
const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active:{PROCESS:content,AB:{private:'other scope'}},versions:[],workflowScopes:{PROCESS:{cases:[],saves:[],working:{private:'draft'}}}}),processAuthoringControl:JSON.stringify({activeVersionId:'current',versions:[{id:'current',status:'approved',snapshot:content},...history],workflow:{cases:[],saves:[],working:{secret:'private'}}}),iqcMasterControl:JSON.stringify({activeVersionId:'q-now',versions:[{id:'q-now',status:'approved',snapshot:{private:'quality'}},...history],workflow:{cases:[],saves:[]}})};
const cpath='/api/canonical-assets?id='+id+'&version='+version,mpath='/api/state-media?id='+mediaId;
async function request(path,who='player'){const base=new Request('https://asset-fixture.invalid'+path);const proof=await core.demoSession(base,who,false,1);return new Request(base.url,{headers:{cookie:core.sessionCookie(base,proof).split(';')[0]}});}
async function consume(response){assert.equal(response.status,200);const reader=response.body.getReader(),chunk=await reader.read();assert.deepEqual(Buffer.from(chunk.value),image);await reader.cancel();}
const checks=[];async function check(name,fn){await fn();checks.push(name);}
function resetMetrics(){gets=[];bytes=0;}
(async()=>{try{
 const raw=await records.encodeRecordValues(bucket,values),envelope=JSON.parse(raw);
 db.prepare('INSERT INTO shared_state VALUES(1,498,?,?)').run(raw,'fixture');
 await bucket.put('canonical-images/'+id+'/'+version+'.webp',image,{customMetadata:{sourceSha256:id,webSha256:version}});
 await bucket.put('delivery/media/'+mediaId,image,{httpMetadata:{contentType:'image/png'}});
 const beforePuts=puts;
 await check('formal stored URL including exact fragment delivers bytes; no substring or incorrect fragment grants access',async()=>{
  await consume(await canonical.GET(await request(cpath)));
  for(const stored of [url+'extra',url.replace('#asset-'+id,'#asset-'+hidden),'see '+url]){
   const changed={...values,masterDataControl:JSON.stringify({active:{PROCESS:{photo:stored}},versions:[]}),processAuthoringControl:JSON.stringify({activeVersionId:null,versions:[],workflow:{}})};
   db.prepare('UPDATE shared_state SET "values"=?').run(await records.encodeRecordValues(bucket,changed));
   assert.equal((await canonical.GET(await request(cpath))).status,403);
  }db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('both routes reject anonymous and cross-module callers without fetching private image bytes',async()=>{
  for(const [route,path,objectKey]of [[canonical,cpath,'canonical-images/'+id+'/'+version+'.webp'],[media,mpath,'delivery/media/'+mediaId]]){
   assert.equal((await route.GET(new Request('https://asset-fixture.invalid'+path))).status,401);
   resetMetrics();assert.equal((await route.GET(await request(path,'quality'))).status,403);assert(!gets.includes(objectKey));
   assert.equal((await route.GET(await request(path,'denied'))).status,403);
  }
 });
 let baselineMetrics,reducedMetrics;
 await check('same fixture keeps reference result, skips forbidden modules and private bodies before hydration',async()=>{
  const req=await request(mpath);resetMetrics();
  // Reproduce the complete previous route: identity read, full read/public
  // projection, then the image object. Comparing hydration alone would omit
  // the old route's identity I/O while charging the new route for its fences.
  assert(await core.companyReader(req,await core.readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']})));
  const baseline=await core.readState({deferHistory:true,deferDependencyHistory:true});
  const projected=await core.companyState(req,baseline);
  assert(await require('../lib/site-security.mjs').visibleMediaReference(projected.values,mediaId));
  await (await bucket.get('delivery/media/'+mediaId)).body.cancel();
  baselineMetrics={gets:gets.length,bytes};resetMetrics();
  await consume(await media.GET(req));reducedMetrics={gets:gets.length,bytes};
  assert(reducedMetrics.gets<baselineMetrics.gets);assert(reducedMetrics.bytes<baselineMetrics.bytes);
  assert(!gets.includes(envelope.__processRecords.values.iqcMasterControl.key));
  assert(!gets.includes(envelope.__processRecords.values.processAuthoringControl.key),'stop after first valid aggregate');
 });
 await check('adopted editor current image works without reinterpreting stripped workflow; private history stays forbidden',async()=>{
  const adopted={...values,masterDataControl:JSON.stringify({active:{PROCESS:{}},versions:[]})};
  db.prepare('UPDATE shared_state SET "values"=?').run(await records.encodeRecordValues(bucket,adopted));
  await consume(await canonical.GET(await request(cpath,'editor')));
  await consume(await media.GET(await request(mpath,'editor')));
  assert.equal((await media.GET(await request('/api/state-media?id='+hidden,'editor'))).status,403);
  db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('legacy inline and compact no-body records preserve dynamic editor access and adoption exclusion',async()=>{
  const legacy={platformUsers:values.platformUsers,'processEditor:legacy':JSON.stringify({photos:[url,mediaUrl]})};
  const plain={__processRecords:{version:1,values:{}}};for(const[k,v]of Object.entries(legacy)){const sha256=digest(v),ref={key:'state-records/v1/'+sha256+'.json',sha256};await bucket.put(ref.key,v);plain.__processRecords.values[k]=ref;}
  for(const representation of [JSON.stringify(legacy),JSON.stringify(plain)]){
   db.prepare('UPDATE shared_state SET "values"=?').run(representation);
   await consume(await canonical.GET(await request(cpath,'editor')));await consume(await media.GET(await request(mpath,'editor')));
   assert.equal((await media.GET(await request(mpath,'quality'))).status,403);
   assert.equal(db.prepare('SELECT "values" v FROM shared_state').get().v,representation);
  }
  const adopted={...legacy,processAuthoringControl:JSON.stringify({activeVersionId:null,versions:[],workflow:{}})};
  for(const representation of [JSON.stringify(adopted),await records.encodeRecordValues(bucket,adopted)]){
   db.prepare('UPDATE shared_state SET "values"=?').run(representation);
   assert.equal((await canonical.GET(await request(cpath,'editor'))).status,403);assert.equal((await media.GET(await request(mpath,'editor'))).status,403);
  }db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('sanitized caller identity references retain format parity without scanning another account or password',async()=>{
  const own={platformUsers:JSON.stringify(users.map(u=>u.id==='player'?{...u,name:url,email:mediaUrl}:u))};
  const privateOnly={platformUsers:JSON.stringify(users.map(u=>u.id==='player'?{...u,password:url,passwordHash:mediaUrl}:u.id==='quality'?{...u,name:url,email:mediaUrl}:u))};
  for(const [source,status]of [[own,200],[privateOnly,403]])for(const representation of [JSON.stringify(source),await records.encodeRecordValues(bucket,source)]){
   db.prepare('UPDATE shared_state SET "values"=?').run(representation);
   for(const [route,path]of [[canonical,cpath],[media,mpath]]){const response=await route.GET(await request(path));assert.equal(response.status,status);if(status===200)await consume(response);}
  }
  const deniedOwn={platformUsers:JSON.stringify(users.map(u=>u.id==='denied'?{...u,name:url,email:mediaUrl}:u))};
  for(const [representation,canonicalStatus]of [[JSON.stringify(deniedOwn),200],[await records.encodeRecordValues(bucket,deniedOwn),403]]){
   db.prepare('UPDATE shared_state SET "values"=?').run(representation);
   const response=await canonical.GET(await request(cpath,'denied'));assert.equal(response.status,canonicalStatus);if(canonicalStatus===200)await consume(response);
   await consume(await media.GET(await request(mpath,'denied')));
  }db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('mixed inline and immutable master snapshots retain hydrated equality and exact version metadata visibility',async()=>{
  const active={name:'same active body'},source={platformUsers:values.platformUsers,masterDataControl:JSON.stringify({active:{PROCESS:active},versions:[{id:'current',scope:'PROCESS',status:'approved',snapshot:active,history:[{comment:url,photo:mediaUrl}]}],workflowScopes:{PROCESS:{}}})};
  const mixed=JSON.parse(await records.encodeRecordValues(bucket,source)),ref=mixed.__processRecords.values.masterDataControl,control=JSON.parse(objects.get(ref.key).raw);
  control.versions[0].snapshot=active;
  const aggregate=JSON.stringify(control),sha256=digest(aggregate),key='state-records/v1/'+sha256+'.json';await bucket.put(key,aggregate);mixed.__processRecords.values.masterDataControl={key,sha256};
  db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify(mixed));
  const req=await request(mpath),baseline=await core.companyState(req,await core.readState({deferHistory:true,deferDependencyHistory:true}));
  assert(await require('../lib/site-security.mjs').visibleMediaReference(baseline.values,mediaId));
  await consume(await media.GET(req));await consume(await canonical.GET(await request(cpath)));
  assert.equal((await media.GET(await request(mpath,'quality'))).status,403);
  db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('revision change or epoch revocation during image I/O cancels the body and fails closed',async()=>{
  for(const [route,path,key]of [[canonical,cpath,'canonical-images/'+id+'/'+version+'.webp'],[media,mpath,'delivery/media/'+mediaId]])for(const revoke of [false,true]){
   const req=await request(path),before=cancels;let changed=false;
   const revoked=await records.encodeRecordValues(bucket,{...values,platformUsers:JSON.stringify(users.map(u=>u.id==='player'?{...u,authEpoch:2}:u))});
   // Epoch-only mutation deliberately retains revision, proving the fresh
   // identity check independently rather than only exercising the CAS fence.
   onGet=k=>{if(k===key&&!changed){changed=true;db.prepare('UPDATE shared_state SET revision=?,"values"=?').run(revoke?498:499,revoke?revoked:raw);}};
   assert.equal((await route.GET(req)).status,409);assert(changed);assert.equal(cancels,before+1);onGet=null;
   db.prepare('UPDATE shared_state SET revision=498,"values"=?').run(raw);
  }
 });
 await check('version metadata preserves exact notification IDs with zero immutable body reads and no write baseline',async()=>{
  const full=await core.readState(),expected=JSON.parse(JSON.stringify(versions.effectiveVersionIds(full.values)));resetMetrics();
  const response=await versions.GET(await request('/api/effective-versions'));assert.equal(response.status,200);assert.deepEqual((await response.json()).effective,expected);
  const aggregateKeys=new Set(Object.values(envelope.__processRecords.values).map(ref=>ref.key));assert(gets.every(key=>aggregateKeys.has(key)));
  const partial=await records.decodeRecordValues(bucket,envelope,{keys:['processAuthoringControl'],projectValue:effectiveVersionMetadata});
  await assert.rejects(()=>records.encodeRecordValues(bucket,partial.values,partial.recordStorage),/Partial read cannot be saved/);
  const projectedOnly=await records.decodeRecordValues(bucket,envelope,{projectValue:(key,raw)=>key==='platformUsers'?raw:effectiveVersionMetadata(key,raw)});
  assert(projectedOnly.recordStorage.partial,'projection alone marks the baseline partial even without a key filter');
  await assert.rejects(()=>records.encodeRecordValues(bucket,projectedOnly.values,projectedOnly.recordStorage),/Partial read cannot be saved/);
  resetMetrics();assert.equal((await versions.GET(new Request('https://asset-fixture.invalid/api/effective-versions'))).status,403);
  assert(!gets.includes(envelope.__processRecords.values.processAuthoringControl.key));
 });
 await check('post-fetch identity read failure and canonical metadata rejection cancel fetched streams',async()=>{
  for(const [route,path,key]of [[canonical,cpath,'canonical-images/'+id+'/'+version+'.webp'],[media,mpath,'delivery/media/'+mediaId]]){
   const before=cancels;onGet=k=>{if(k===key)db.prepare('UPDATE shared_state SET "values"=?').run('not json');};
   assert.equal((await route.GET(await request(path))).status,503);assert.equal(cancels,before+1);onGet=null;db.prepare('UPDATE shared_state SET "values"=?').run(raw);
  }
  const key='canonical-images/'+id+'/'+version+'.webp',item=objects.get(key),before=cancels;
  objects.set(key,{...item,customMetadata:{sourceSha256:hidden,webSha256:version}});
  assert.equal((await canonical.GET(await request(cpath))).status,404);assert.equal(cancels,before+1);objects.set(key,item);
 });
 await check('metadata preserves first master and last legacy ordering plus every scoped active ID without bodies',async()=>{
  const snapshot={large:'metadata-only '.repeat(5000)},row=(id,extra={})=>({id,status:'approved',snapshot,...extra});
  const all={platformUsers:values.platformUsers,
   masterDataControl:JSON.stringify({active:{AB:snapshot},versions:[row('ab-first',{scope:'AB'}),row('ab-last',{scope:'AB'}),row('c-draft',{scope:'C',status:'draft'})]}),
   approvalVersions:JSON.stringify([row('legacy-first',{category:'cat',line:'A'}),row('legacy-last',{category:'cat',line:'A'}),row('pending',{category:'cat',line:'B',status:'pending'})]),
   qualityMasterControl:JSON.stringify({libraries:{fqc:{activeVersionId:'fqc-now',versions:[row('fqc-now')]},empty:{versions:[]}}}),
   ipqcABMasterControl:JSON.stringify({scopes:{A:{activeVersionId:'ab-now',versions:[row('ab-now')]},B:{activeVersionId:null,versions:[]}}}),
  };
  for(const key of ['processAuthoringControl','iqcMasterControl','ipqcCMasterControl','routineEquipmentControl','bomMasterControl','toolingMasterControl'])all[key]=JSON.stringify({activeVersionId:key+'-now',versions:[row(key+'-now')],workflow:{working:snapshot}});
  const expected={'master:AB':'ab-first','master:C':null,'master:PROCESS':null,'legacy:["cat","A"]':'legacy-last','quality:fqc':'fqc-now','quality:empty':null,'ipqc-ab:A':'ab-now','ipqc-ab:B':null};
  for(const key of ['processAuthoringControl','iqcMasterControl','ipqcCMasterControl','routineEquipmentControl','bomMasterControl','toolingMasterControl'])expected[key]=key+'-now';
  const encoded=await records.encodeRecordValues(bucket,all),refs=new Set(Object.values(JSON.parse(encoded).__processRecords.values).map(ref=>ref.key));
  for(const representation of [JSON.stringify(all),encoded]){
   db.prepare('UPDATE shared_state SET "values"=?').run(representation);resetMetrics();
   const response=await versions.GET(await request('/api/effective-versions'));assert.equal(response.status,200);assert.deepEqual((await response.json()).effective,expected);assert(gets.every(key=>refs.has(key)),'only aggregate metadata is read');
  }db.prepare('UPDATE shared_state SET "values"=?').run(raw);
 });
 await check('SHA corruption is rejected before projection; notifications retain revision fencing',async()=>{
  const ref=envelope.__processRecords.values.masterDataControl,item=objects.get(ref.key);objects.set(ref.key,{raw:'{}'});
  assert.equal((await media.GET(await request(mpath))).status,503);objects.set(ref.key,item);
  let changed=false;onGet=key=>{if(key===ref.key&&!changed){changed=true;db.prepare('UPDATE shared_state SET revision=revision+1').run();}};
  assert.equal((await versions.GET(await request('/api/effective-versions'))).status,409);onGet=null;
  db.prepare('UPDATE shared_state SET revision=498').run();
 });
 assert.equal(db.prepare('SELECT "values" v FROM shared_state').get().v,raw);
 console.log(JSON.stringify({status:'PASS_ASSET_DELIVERY_READ',checks,baselineMetrics,reducedMetrics,fixtureOnly:true,remoteSpeedMeasured:false,productionRequests:0,fixtureSetupPuts:puts-beforePuts}));
}finally{onGet=null;db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
