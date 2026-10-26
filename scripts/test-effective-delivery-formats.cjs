/* oxlint-disable typescript/no-require-imports -- Actual codecs and routes, isolated synthetic SQLite/R2 only. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const db=new DatabaseSync(':memory:'),objects=new Map(),readKeys=[];let puts=0;
db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT)');
const hash=s=>createHash('sha256').update(s).digest('hex');
const bucket={async put(k,v){puts++;objects.set(k,typeof v==='string'?v:Buffer.from(v).toString('utf8'));},async get(k){readKeys.push(k);const raw=objects.get(k);return raw===undefined?null:{size:Buffer.byteLength(raw),text:async()=>raw,arrayBuffer:async()=>new TextEncoder().encode(raw).buffer,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(raw));c.close();}}),customMetadata:{sourceSha256:'a'.repeat(64),webSha256:'b'.repeat(64)}};}};
const env={STATE_ARCHIVE:bucket,PROCESS_SESSION_SECRET:'synthetic-format-only',DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=require('./ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts'),records=load('lib/state-records.ts'),chunks=load('lib/state-chunks.ts'),images=load('app/api/canonical-assets/route.ts'),bootstrap=load('app/api/process-bootstrap/route.ts');
const {accessKeys}=require('../public/process/access-policy.mjs');
const actor=(id,permission)=>({id,role:'staff',enabled:true,authMode:'platform',authEpoch:1,accessOverrides:Object.fromEntries(accessKeys.map(key=>[key,key===permission]))});
const active={name:'current'},domain={activeVersionId:'v1',versions:[{id:'v1',status:'approved',snapshot:active},{id:'v2',status:'draft',snapshot:{secret:'draft'}},{id:'v0',status:'superseded',snapshot:{secret:'history'}}],moduleDraft:{secret:'module'}};
const values={platformUsers:JSON.stringify([actor('editor','editor.view'),actor('denied',''),actor('dashboard','dashboard.view'),actor('ab','ab.view'),actor('c','c.view'),actor('lines','lines.view'),actor('quality','iqc.view')]),backupSettings:'{"enabled":false}',iqcMasterControl:JSON.stringify(domain),masterDataControl:JSON.stringify({active:{AB:active},versions:[{id:'current',scope:'AB',status:'approved',snapshot:active},{id:'draft',scope:'AB',status:'draft',snapshot:{secret:'scoped draft'}},{id:'old',scope:'AB',status:'approved',snapshot:{secret:'scoped history'}}],workflowScopes:{AB:{working:{secret:'private working'}}}}),'processEditor:legacy':JSON.stringify({image:'asset:'+'a'.repeat(64)})};
const store=raw=>db.prepare('INSERT INTO shared_state VALUES(1,1,?,?) ON CONFLICT(id) DO UPDATE SET "values"=excluded."values"').run(raw,'synthetic');
(async()=>{try{
 const inline=JSON.stringify(values),chunked=await chunks.encodeChunkedValues(bucket,values),r2key='snapshots/'+hash(inline)+'.json';objects.set(r2key,inline);
 const unreferenced={__processRecords:{version:1,values:{}}};for(const[key,raw]of Object.entries(values)){const sha256=hash(raw),ref={key:'state-records/v1/'+sha256+'.json',sha256};objects.set(ref.key,raw);unreferenced.__processRecords.values[key]=ref;}
 const forms=[['inline',inline],['chunks',chunked],['R2',JSON.stringify({__processR2:{key:r2key,sha256:hash(inline)},platformUsers:values.platformUsers})],['record without immutable bodies',JSON.stringify(unreferenced)],['record with immutable bodies',await records.encodeRecordValues(bucket,values)]];
 async function signed(url,id){const base=new Request(url),token=await core.demoSession(base,id,false,1);return new Request(url,{headers:{cookie:core.sessionCookie(base,token).split(';')[0]}});}
 for(const[name,raw]of forms){
  store(raw);const view=await core.readState({effectiveOnly:true,modelKey:'iqcMasterControl'}),shown=JSON.parse(view.values.iqcMasterControl),scoped=JSON.parse(view.values.masterDataControl);
  assert.deepEqual(shown.versions.map(v=>v.id),['v1'],name);assert.equal(shown.moduleDraft,undefined,name);assert(!JSON.stringify(shown).includes('secret'),name);
  assert.deepEqual(scoped.versions.map(v=>v.id),['current'],name);assert.deepEqual(scoped.workflowScopes,{AB:{}},name);assert(!JSON.stringify(scoped).includes('secret'),name);
  assert(view.deliveryOnly);assert(!view.recordStorage?.models.size);await assert.rejects(()=>core.encodeValues(view.values,view),/Read-only delivery/);
  const full=await core.readState();assert.equal(JSON.parse(full.values.iqcMasterControl).versions.length,3,name+' normal history unchanged');assert.equal(JSON.parse(full.values.masterDataControl).versions.length,3,name+' scoped history unchanged');
  readKeys.length=0;const response=await bootstrap.GET(await signed('https://fixture.invalid/api/process-bootstrap','quality'));assert.equal(response.status,200,name);const delivered=await response.json();
  assert.equal(delivered.identity.id,'quality');assert.equal(delivered.destination.module,'iqc');assert.deepEqual(delivered.catalog.loadedScopes,[]);assert.deepEqual(delivered.writableKeys,[]);
  for(const key of ['iqcMasterControl','canonicalQuality','masterDataControl'])assert.equal(Object.hasOwn(delivered.values,key),false,name+' dedicated module data omitted from bootstrap');
  const manifest=JSON.parse(raw).__processRecords;if(manifest)for(const key of ['iqcMasterControl','masterDataControl']){assert(manifest.values[key]?.key);assert(!readKeys.includes(manifest.values[key].key),name+' unrelated aggregate not read');}
  assert(!JSON.stringify(delivered).includes('secret'),name+' no private bootstrap values');
 }
 // Legacy dynamic editor refs retain their original module ACL in both formats.
 objects.set('canonical-images/'+'a'.repeat(64)+'/'+'b'.repeat(64)+'.webp','fixture');
 const url='https://fixture.invalid/api/canonical-assets?id='+'a'.repeat(64)+'&version='+'b'.repeat(64);
 for(const[,raw]of forms){store(raw);assert.equal((await images.GET(await signed(url,'editor'))).status,200);for(const id of ['denied','dashboard','ab','c','lines','quality'])assert.equal((await images.GET(await signed(url,id))).status,403,id+' cannot use editor-only legacy image');}
 const adoptedValues={...values,processAuthoringControl:JSON.stringify({activeVersionId:null,versions:[],workflow:{working:{private:'not current'}}}),approvalVersions:JSON.stringify([{image:'asset:'+'a'.repeat(64)}])};
 for(const raw of [JSON.stringify(adoptedValues),await records.encodeRecordValues(bucket,adoptedValues)]){store(raw);assert.equal((await images.GET(await signed(url,'editor'))).status,403,'adopted editor cannot revive a legacy-only image reference');}
 const ref=unreferenced.__processRecords.values.iqcMasterControl,original=objects.get(ref.key);objects.set(ref.key,original+' ');store(JSON.stringify(unreferenced));await assert.rejects(()=>core.readState({effectiveOnly:true}),/integrity|corrupt|hash|digest/i);objects.set(ref.key,original);
 console.log(JSON.stringify({status:'PASS_EFFECTIVE_DELIVERY_FORMATS',formats:forms.map(x=>x[0]),privateVersionsRemoved:true,normalHistoryRetained:true,partialWritesRejected:true,legacyDynamicImageACL:true,liveRequests:0,puts}));
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
