const {test}=require('node:test'),assert=require('node:assert/strict'),fixture=require('../scripts/fqc-apply-fixture.cjs'),a=require('../scripts/routine-reset-authority-fixture.cjs');
async function setup(t){
 const f=await fixture();t.after(()=>f.close());
 await f.mutate(v=>{const u=JSON.parse(v.platformUsers)[0];u.authMode='platform';u.accessOverrides={...u.accessOverrides,'routine.view':true,'routine.edit':true,'routine.settings':true,'routine.delete':true,'iqc.view':true};v.platformUsers=JSON.stringify(['frank','admin-two','staff','disabled'].map(id=>({...u,id,name:id==='staff'?'ADMIN FRANK':id,role:id==='staff'?'staff':'admin',enabled:id!=='disabled'})));const q=JSON.parse(v.qualityMasterControl);q.libraries.fqc.versions[0].createdAt=q.libraries.fqc.versions[0].updatedAt='2026-01-01T00:00:00+07:00';v.qualityMasterControl=JSON.stringify(q);v.routineFqcEnabled='1';v.routineFqcControl=JSON.stringify(f.load('lib/routine-fqc.ts').emptyRoutine());v.routineIqcControl=JSON.stringify(f.load('lib/routine-iqc-workflow.ts').readRoutineIqc({revision:0,values:{}}));});
 const {siteOwnerIdSha256,...old}=JSON.parse(a.enable(f));const config={...old,version:2,authorization:'application-admin'};f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify(config);
 const cookie=async(id,demo=false)=>f.core.sessionCookie(new Request(a.origin),await f.core.demoSession(new Request(a.origin),id,demo,1)).split(';')[0];
 async function call(scope,id,body,overrides={}){const method=body?'POST':'GET';const r=await f.load('app/api/routine-reset/route.ts')[method](new Request((overrides.urlOrigin||a.origin)+'/api/routine-reset?scope='+scope+(body?'':'&capability=1'),{method,headers:{origin:a.origin,'content-type':'application/json',cookie:id?await cookie(id):'',...overrides.headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,body:await r.json()};}
 return {f,config,cookie,call};
}

for(const stage of ['read_state','receipt','encode_state','commit'])test('diagnostic '+stage+' is sanitized and preserves unconfirmed/noncommit behavior',async t=>{
 const s=await setup(t),before=await s.f.core.readState(),logs=[];
 t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const secret='SECRET fixture token /private/path user-record';
 if(stage==='read_state'){const original=s.f.core.readState;s.f.core.readState=async options=>{if(!options)throw new Error(secret);return original(options);};}
 if(stage==='receipt')s.f.load('lib/routine-reset-ledger.ts').findResetEntry=()=>{throw new SyntaxError(secret);};
 if(stage==='encode_state')s.f.core.encodeValues=async()=>{throw new TypeError(secret);};
 if(stage==='commit')s.f.hooks.run=sql=>{if(sql.startsWith('UPDATE shared_state'))throw new Error(secret);};
 const b={id:crypto.randomUUID(),scope:'fqc',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision};
 const r=await s.call('fqc','frank',b);assert.equal(r.status,503);assert.deepEqual(r.body,{error:'RESET_RESULT_UNCONFIRMED'});
 assert.deepEqual(logs,[{event:'routine_reset_diagnostic',version:1,operation:'write',stage,category:stage==='receipt'?'syntax_error':stage==='encode_state'?'type_error':'unknown'}]);
 assert(!JSON.stringify(logs).includes(secret));
 assert.equal(s.f.db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,before.revision);
});
test('receipt GET failure is sanitized; logging failure preserves the 503 response',async t=>{
 const s=await setup(t),logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 s.f.load('lib/routine-reset-ledger.ts').findResetEntry=()=>{throw new Error('private receipt identifier');};
 const request=()=>new Request(a.origin+'/api/routine-reset?scope=fqc&operationId=synthetic-missing',{headers:{cookie:savedCookie,origin:a.origin}});
 const savedCookie=await s.cookie('frank'),route=s.f.load('app/api/routine-reset/route.ts');
 let r=await route.GET(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'RECEIPT_UNAVAILABLE'});
 assert.deepEqual(logs,[{event:'routine_reset_diagnostic',version:1,operation:'read',stage:'receipt',category:'unknown'}]);
 console.error=()=>{throw new Error('logger unavailable');};
 r=await route.GET(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'RECEIPT_UNAVAILABLE'});
});
test('typed conflicts retain their existing status/code and reveal no exception detail',async t=>{
 const s=await setup(t),before=await s.f.core.readState(),logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const {DraftConflict}=s.f.load('lib/shared-draft.ts');s.f.core.encodeValues=async()=>{throw new DraftConflict('REVISION_CONFLICT');};
 const r=await s.call('fqc','frank',{id:crypto.randomUUID(),scope:'fqc',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision});
 assert.equal(r.status,409);assert.equal(r.body.error,'REVISION_CONFLICT');assert.equal(logs[0].category,'draft_conflict');
});
