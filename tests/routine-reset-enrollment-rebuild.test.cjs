const {test}=require('node:test'),assert=require('node:assert/strict'),fixture=require('../scripts/fqc-apply-fixture.cjs'),a=require('../scripts/routine-reset-authority-fixture.cjs');
const KEY='routineResetEnrollments';
async function setup(t){
 const f=await fixture();t.after(()=>f.close());await f.mutate(v=>{const u=JSON.parse(v.platformUsers)[0];Object.assign(u,{id:'frank',role:'admin',authMode:'platform'});v.platformUsers=JSON.stringify([u,{...u,id:'other',role:'staff'}]);v.routineFqcEnabled='1';v.routineFqcControl=JSON.stringify(f.load('lib/routine-fqc.ts').emptyRoutine());v.routineIqcControl=JSON.stringify(f.load('lib/routine-iqc-workflow.ts').readRoutineIqc({revision:0,values:{}}));});
 const req=new Request(a.origin),cookie=f.core.sessionCookie(req,await f.core.demoSession(req,'frank',false,1)).split(';')[0],activation=JSON.parse(a.enable(f));
 delete f.env.PROCESS_ROUTINE_RESET_ACTIVATION;const {scopes,siteOwnerIdSha256,...common}=activation;const config={...common,enrollmentId:crypto.randomUUID(),secret:'d'.repeat(64)};f.env.PROCESS_ROUTINE_RESET_ENROLLMENT=JSON.stringify(config);
 const route=f.load('app/api/routine-reset-enrollment/route.ts');
 const call=async(body,options={})=>{const method=body?'POST':'GET',r=await route[method](new Request((options.origin||a.origin)+'/api/routine-reset-enrollment'+(options.query||''),{method,headers:{...a.headers,origin:a.origin,cookie,...options.headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,value:r.headers.get('content-type').includes('application/json')?await r.json():await r.text()};};
 const begin=()=>call({action:'begin',confirm:'BEGIN OWNER ENROLLMENT'}),confirm=token=>call({action:'confirm',confirm:'ENROLL CURRENT SIGNED-IN OWNER',token}),saved=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 const gate=(scope='fqc',headers={})=>f.load('lib/routine-reset-authority.ts').resetAuthority(new Request(a.origin+'/api/routine-reset',{headers:{...a.headers,...headers}}),scope);
 return {f,cookie,activation,config,call,begin,confirm,saved,gate};
}
test('normal owner enrollment preserves all business data, hides proof and does not activate Reset',async t=>{
 const s=await setup(t),before=await s.f.core.readState(),saved=s.saved();assert.equal((await s.call()).status,200);assert.deepEqual(s.saved(),saved);
 const r=await s.begin();assert.equal(r.status,200);assert.match(r.value.token,/^[a-f0-9]{64}$/);for(const secret of [s.config.secret,a.siteIdentity,s.cookie])assert(!JSON.stringify(r.value).includes(secret));
 const pending=await s.f.core.readState();for(const[k,v]of Object.entries(before.values))assert.equal(pending.values[k],v);assert(!pending.values[KEY].includes(r.value.token));
 assert.equal(s.f.core.allowedKey(KEY),false);assert(!Object.hasOwn(s.f.core.publicState(pending,'frank').values,KEY));
 assert.equal((await s.confirm(r.value.token)).value.status,'confirmed');assert.equal(await s.gate(),null);
 const {siteOwnerIdSha256,...c}=s.activation;s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({...c,enrollmentId:s.config.enrollmentId,scopes:{fqc:true,iqc:false}});assert(await s.gate());assert.equal(await s.gate('iqc'),null);
 assert.equal((await s.confirm(r.value.token)).status,409);const status=await s.call(null,{query:'?status=1'});assert.deepEqual(Object.keys(status.value).sort(),['enrollmentDoesNotEnableReset','enrollmentId','status']);
});
test('default OFF, anonymous/non-owner, missing native identity and CSRF denied; sign-in GET is read-only',async t=>{
 const s=await setup(t),before=s.saved(),raw=s.f.env.PROCESS_ROUTINE_RESET_ENROLLMENT;delete s.f.env.PROCESS_ROUTINE_RESET_ENROLLMENT;assert.equal((await s.begin()).status,403);s.f.env.PROCESS_ROUTINE_RESET_ENROLLMENT=raw;
 const body={action:'begin',confirm:'BEGIN OWNER ENROLLMENT'};
 for(const headers of [{cookie:''},{cookie:s.f.cookies.other},{'oai-authenticated-user-id':''},{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await s.call(body,{headers})).status,403);
 const html=await s.call(null,{headers:{'oai-authenticated-user-id':''}});assert.equal(html.status,200);assert.match(html.value,/target="_top" href="\/signin-with-chatgpt\?return_to=%2Fapi%2Froutine-reset-enrollment"/);assert.deepEqual(s.saved(),before);
});
test('site, release, lineage, owner and expiry pins fail closed',async t=>{
 const s=await setup(t),before=s.saved();
 for(const patch of [{projectId:'other'},{ownerId:'other'},{programCommit:'e'.repeat(40)},{dbTarget:'f'.repeat(64)},{bootstrapAttemptId:'other'},{transferId:'other'},{testOnly:false},{expiresAt:'2000-01-01Z'},{secret:''}]){s.f.env.PROCESS_ROUTINE_RESET_ENROLLMENT=JSON.stringify({...s.config,...patch});assert.equal((await s.begin()).status,403);}
 assert.deepEqual(s.saved(),before);
});
test('proof is bound to session/native identity, wrong token rejected, begin never reissues',async t=>{
 const s=await setup(t),r=await s.begin(),before=s.saved(),b={action:'confirm',confirm:'ENROLL CURRENT SIGNED-IN OWNER',token:r.value.token};
 for(const headers of [{'oai-authenticated-user-id':'different'},{cookie:s.cookie+'; extra=1'}])assert.equal((await s.call(b,{headers})).status,409);
 assert.equal((await s.confirm('f'.repeat(64))).status,409);assert.equal((await s.begin()).status,409);assert.deepEqual(s.saved(),before);
});
test('challenge expires after five minutes and status never writes',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-23T08:00:00Z')});const s=await setup(t),r=await s.begin(),before=s.saved();t.mock.timers.tick(300001);assert.equal((await s.confirm(r.value.token)).status,409);assert.equal((await s.call(null,{query:'?status=1'})).value.status,'expired');assert.deepEqual(s.saved(),before);
});
test('concurrent confirmation commits once and lost result uses read-only lookup',async t=>{
 const s=await setup(t),r=await s.begin(),before=s.saved();const results=await Promise.all([s.confirm(r.value.token),s.confirm(r.value.token)]);assert.deepEqual(results.map(v=>v.status).sort(),[200,409]);assert.equal(s.saved().revision,before.revision+1);const after=s.saved();assert.equal((await s.call(null,{query:'?status=1'})).value.status,'confirmed');assert.deepEqual(s.saved(),after);
});
test('lineage changing after preflight and grant revocation during encoding cannot commit',async t=>{
 const s=await setup(t),r=await s.begin(),before=s.saved();s.f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){delete s.f.hooks.run;s.f.db.exec("UPDATE process_snapshot_target SET target='changed'");}};assert.equal((await s.confirm(r.value.token)).status,409);assert.deepEqual(s.saved(),before);
 a.enable(s.f);delete s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION;s.f.hooks.put=async()=>{delete s.f.env.PROCESS_ROUTINE_RESET_ENROLLMENT;};assert.equal((await s.confirm(r.value.token)).status,409);assert.deepEqual(s.saved(),before);
});
test('duplicate/corrupt/unconfirmed enrolled receipts cannot authorize',async t=>{
 const s=await setup(t),r=await s.begin();await s.confirm(r.value.token);const original=JSON.parse((await s.f.core.readState()).values[KEY]),{siteOwnerIdSha256,...c}=s.activation;s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({...c,enrollmentId:s.config.enrollmentId});assert(await s.gate());
 for(const entries of [[original.entries[0],original.entries[0]],[{...original.entries[0],status:'pending'}],[{...original.entries[0],confirmedAt:null}]]){await s.f.mutate(v=>v[KEY]=JSON.stringify({version:1,entries}));assert.equal(await s.gate(),null);}
});
test('direct owner pin rejects spoofed identity, wrong DB and expired activation; old alias grants nothing',async t=>{
 const s=await setup(t);s.f.env.ROUTINE_RESET_DEDICATED_TEST_DB=s.f.env.DB;assert.equal(await s.gate(),null);s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify(s.activation);assert(await s.gate());assert.equal(await s.gate('fqc',{'oai-authenticated-user-id':'','x-process-admin-id':'frank'}),null);
 s.f.db.exec("UPDATE process_snapshot_transfers SET phase='receiving'");assert.equal(await s.gate(),null);
});
for(const scope of ['fqc','iqc'])test(scope+' authorized Reset preserves peer; concurrent DB proof change prevents mutation',async t=>{
 const s=await setup(t);s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({...s.activation,scopes:{fqc:scope==='fqc',iqc:scope==='iqc'}});const route=s.f.load('app/api/routine-reset/route.ts');
 const call=(body,headers={})=>route.POST(new Request(a.origin+'/api/routine-reset?scope='+scope,{method:'POST',headers:{...a.headers,origin:a.origin,cookie:s.cookie,...headers},body:JSON.stringify(body)}));
 const before=await s.f.core.readState(),body={id:crypto.randomUUID(),scope,confirm:'RESET '+scope.toUpperCase(),irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision};
 for(const headers of [{cookie:''},{cookie:s.f.cookies.other},{origin:'https://foreign.invalid'}])assert.equal((await call(body,headers)).status,403);
 s.f.hooks.run=async sql=>{if(sql.startsWith('UPDATE shared_state')){delete s.f.hooks.run;s.f.db.exec("UPDATE process_snapshot_target SET target='changed'");}};assert.equal((await call(body)).status,409);assert.equal((await s.f.core.readState()).revision,before.revision);
 a.enable(s.f);assert.equal((await call(body)).status,200);const after=await s.f.core.readState();for(const[k,v]of Object.entries(before.values))if(k!==(scope==='fqc'?'routineFqcControl':'routineIqcControl'))assert.equal(after.values[k],v);
});
test('Reset activation revoked during encode fails closed without changing state',async t=>{
 const s=await setup(t);a.enable(s.f);const before=s.saved(),route=s.f.load('app/api/routine-reset/route.ts');s.f.hooks.put=async()=>{delete s.f.env.PROCESS_ROUTINE_RESET_ACTIVATION;};
 const body={id:crypto.randomUUID(),scope:'fqc',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision};
 const r=await route.POST(new Request(a.origin+'/api/routine-reset?scope=fqc',{method:'POST',headers:{...a.headers,origin:a.origin,cookie:s.cookie},body:JSON.stringify(body)}));assert.equal(r.status,403);assert.deepEqual(s.saved(),before);
});
test('unknown request origin and client identity injection are rejected',async t=>{
 const s=await setup(t),before=s.saved(),body={action:'begin',confirm:'BEGIN OWNER ENROLLMENT'};
 assert.equal((await s.call(body,{origin:'https://production.invalid'})).status,403);assert.equal((await s.call({...body,siteOwnerId:'frank'})).status,422);assert.deepEqual(s.saved(),before);
});

test('challenge uses one creation timestamp across millisecond boundaries',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now++);const s=await setup(t),r=await s.begin();assert.equal(r.status,200);const ledger=JSON.parse((await s.f.core.readState()).values[KEY]);assert.equal(ledger.entries[0].expiresAt-ledger.entries[0].createdAt,300000);assert.equal((await s.confirm(r.value.token)).status,200);
});
