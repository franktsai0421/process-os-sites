const {test}=require('node:test'),assert=require('node:assert/strict'),fixture=require('../scripts/fqc-apply-fixture.cjs'),a=require('../scripts/routine-reset-authority-fixture.cjs');
async function setup(t){
 const f=await fixture();t.after(()=>f.close());
 await f.mutate(v=>{const u=JSON.parse(v.platformUsers)[0];u.authMode='platform';u.accessOverrides={...u.accessOverrides,'routine.view':true,'routine.edit':true,'routine.settings':true,'routine.delete':true,'iqc.view':true};v.platformUsers=JSON.stringify(['frank','admin-two','staff','disabled'].map(id=>({...u,id,name:id==='staff'?'ADMIN FRANK':id,role:id==='staff'?'staff':'admin',enabled:id!=='disabled'})));const q=JSON.parse(v.qualityMasterControl);q.libraries.fqc.versions[0].createdAt=q.libraries.fqc.versions[0].updatedAt='2026-01-01T00:00:00+07:00';v.qualityMasterControl=JSON.stringify(q);v.routineFqcEnabled='1';v.routineFqcControl=JSON.stringify(f.load('lib/routine-fqc.ts').emptyRoutine());v.routineIqcControl=JSON.stringify(f.load('lib/routine-iqc-workflow.ts').readRoutineIqc({revision:0,values:{}}));});
 const {siteOwnerIdSha256,...old}=JSON.parse(a.enable(f));const config={...old,version:2,authorization:'application-admin'};f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify(config);
 const cookie=async(id,demo=false)=>f.core.sessionCookie(new Request(a.origin),await f.core.demoSession(new Request(a.origin),id,demo,1)).split(';')[0];
 const origin=a.origin;
 const route=f.load('app/api/routine-reset/route.ts');
 const start=new Date(Date.now()-1000).toISOString();
 f.env.PROCESS_FQC_RESET_READ_PROBE_FROM=start;
 const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
 f.env.STATE_ARCHIVE.get=async key=>{const value=await get(key);return value && {...value,size:f.objects.get(key).length};};
 async function call(id='frank',headers={},query='scope=fqc&diagnostic=read-state',method='GET',host=origin){
   const r=await route[method](new Request(host+'/api/routine-reset?'+query,{method,headers:{cookie:id?await cookie(id):'',
     'sec-fetch-site':'none','sec-fetch-mode':'navigate','sec-fetch-dest':'document','sec-fetch-user':'?1',...headers}}));
   return {status:r.status,body:await r.json()};
 }
 return {f,call,start,origin};
}
function manifest(f){return f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();}
function observe(t,f){
 const initial=manifest(f),entries=[...f.objects].map(([key,value])=>[key,Buffer.from(value)]),messages=[];
 f.events.length=0;t.mock.method(console,'info',s=>messages.push(JSON.parse(s)));
 return {messages,check(){assert.deepEqual(manifest(f),initial);assert.deepEqual([...f.objects],entries);
   assert.equal(f.events.filter(e=>e.kind==='put'||e.kind==='sql').length,0);}};
}
const expected={healthy:['complete','ok'],d1:['d1_query','failed'],provider:['r2_lookup','failed'],missing:['r2_lookup','missing'],body:['r2_body','failed'],digest:['digest','mismatch'],budget:['budget','limit'],nested:['nested_decode','invalid']};
for(const [fault,[stage,category]] of Object.entries(expected))test('FQC operator read: '+fault,async t=>{
 const {f,call}=await setup(t);await f.mutate(v=>{v.syntheticUnrelated=JSON.stringify({snapshot:{test:'nested fixture'}});});
 let envelope=JSON.parse(manifest(f).values),key=envelope.__processRecords.values.syntheticUnrelated.key;
 if(fault==='nested'){
   const {createHash}=require('node:crypto');const ref=raw=>{const sha256=createHash('sha256').update(raw).digest('hex'),k='state-records/v1/'+sha256+'.json';f.objects.set(k,Buffer.from(raw));return {key:k,sha256};};
   envelope.__processRecords.values.syntheticUnrelated=ref(JSON.stringify({snapshot:{__immutableBody:ref('{invalid json')}}));
   f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(envelope));
 }
 if(fault==='d1'){let selects=0;f.hooks.sql=sql=>{if(sql==='SELECT revision,"values" FROM shared_state WHERE id=1'&&++selects===2)throw Error('private database message');};}
 const get=f.env.STATE_ARCHIVE.get;f.env.STATE_ARCHIVE.get=async k=>{
  const obj=await get(k);if(k!==key)return obj;
  switch(fault){case 'provider':throw Error('private provider message');case 'missing':return null;
   case 'body':return {...obj,text:async()=>{throw Error('private object contents');}};case 'digest':return {...obj,text:async()=>'altered bytes'};
   case 'budget':return {...obj,size:9*1024*1024,text:async()=>assert.fail('oversized body consumed')};default:return obj;}
 };
 const watch=observe(t,f),r=await call();assert.equal(r.status,200);assert.deepEqual(r.body,{stage,category});assert.deepEqual(watch.messages,[{event:'routine_reset_read_probe',stage,category}]);watch.check();
 assert.equal((await call()).status,409);watch.check();
});
test('disabled, expired, overlong, unauthorized and background requests cannot start full read',async t=>{
 const {f,call,start}=await setup(t);const watch=observe(t,f);
 for(const value of ['',new Date(Date.now()-610000).toISOString(),new Date(Date.now()+3600000).toISOString()]){f.env.PROCESS_FQC_RESET_READ_PROBE_FROM=value;assert.equal((await call()).status,403);}
 f.env.PROCESS_FQC_RESET_READ_PROBE_FROM=start;
 for(const id of ['','staff','disabled'])assert.equal((await call(id)).status,403);
 for(const h of [{'sec-fetch-site':'cross-site'},{'sec-fetch-mode':'cors'},{'sec-fetch-user':''},{'sec-fetch-dest':'iframe'},{purpose:'prefetch'},{origin:'https://other.invalid'}])assert.equal((await call('frank',h)).status,403);
 assert.equal((await call('frank',{},undefined,'GET','https://other.invalid')).status,403);
 for(const q of ['scope=iqc&diagnostic=read-state','scope=fqc&diagnostic=read-state&extra=1'])assert.equal((await call('frank',{},q)).status,422);
 assert.equal((await call('frank',{},undefined,'POST')).status,422);
 const config=f.env.PROCESS_ROUTINE_RESET_ACTIVATION;f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({...JSON.parse(config),dbTarget:'f'.repeat(64)});assert.equal((await call()).status,403);
 assert.deepEqual(watch.messages,[]);watch.check();
});
test('post-probe revision drift suppresses the response; failure to log does not change a valid read',async t=>{
 for(const drift of [false,true]){const {f,call}=await setup(t);const prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{
   if(drift&&sql.startsWith('SELECT revision FROM shared_state WHERE id=1 AND revision='))return {bind(){return this;},async first(){return null;}};return prepare(sql);};
 const watch=observe(t,f);t.mock.method(console,'info',()=>{throw Error('synthetic logging failure');});const r=await call();assert.equal(r.status,drift?403:200);watch.check();}
});
test('module permission, active scope and activation expiry limit also apply to the diagnostic',async t=>{
 const {f,call}=await setup(t);const original=f.env.PROCESS_ROUTINE_RESET_ACTIVATION,c=JSON.parse(original);
 for(const patch of [{scopes:{fqc:false,iqc:true}},{expiresAt:new Date(Date.now()+30000).toISOString()}]){f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({...c,...patch});assert.equal((await call()).status,403);}
 f.env.PROCESS_ROUTINE_RESET_ACTIVATION=original;await f.mutate(v=>{const users=JSON.parse(v.platformUsers);users.find(u=>u.id==='admin-two').accessOverrides['routine.delete']=false;v.platformUsers=JSON.stringify(users);});const watch=observe(t,f);assert.equal((await call('admin-two')).status,403);assert.equal(watch.messages.length,0);watch.check();
});
test('healthy probe issues the same manifest SELECT and ordered R2 lookups as the full RESET read',async t=>{
 const {f}=await setup(t);const probe=f.load('lib/routine-reset-read-probe.ts').createResetReadProbe(Date.now()+60000);
 const trace=()=>f.events.map(e=>[e.kind,e.key||e.sql]);f.events.length=0;const {revision}=await f.core.readState();const baseline=trace();
 f.events.length=0;assert.deepEqual({...await probe.run(revision)},{stage:'complete',category:'ok'});assert.deepEqual(trace(),baseline);
});
test('shared immutable body expansion is bounded even when the underlying object is fetched only once',async t=>{
 const {f,call}=await setup(t);const body={text:'x'.repeat(256*1024)};
 await f.mutate(v=>{v.syntheticFanout=JSON.stringify(Array.from({length:36},()=>({snapshot:body})));});
 const watch=observe(t,f);assert.deepEqual(await call(),{status:200,body:{stage:'budget',category:'limit'}});watch.check();
});
for(const [label,raw] of [
 ['deep','['.repeat(65)+'0'+']'.repeat(65)],
 ['wide',JSON.stringify(Array(2049).fill(0))],
 ['wide quoted string',JSON.stringify('\\"{}:,'.repeat(4000))],
 ['cumulative syntax',JSON.stringify(Array.from({length:100},()=>Array(700).fill(1)))]
])test('read structure limit: '+label,async t=>{
 const {f,call}=await setup(t);await f.mutate(v=>{v.syntheticStructuralInput=raw;});
 const w=observe(t,f),r=await call();assert.equal(r.status,200);
 assert.deepEqual(r.body,label==='wide quoted string'?{stage:'complete',category:'ok'}:{stage:'budget',category:'limit'});w.check();
});
test('window expiration during final permission lookup withholds result',async t=>{
 const {f,call}=await setup(t);const watch=observe(t,f);let finishedRead=false;
 t.mock.method(console,'info',()=>{finishedRead=true;});
 f.hooks.sql=sql=>{if(finishedRead&&sql.includes('process_revoked_sessions'))f.env.PROCESS_FQC_RESET_READ_PROBE_FROM='';};
 assert.equal((await call()).status,403);watch.check();
});
