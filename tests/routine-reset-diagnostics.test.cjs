const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../scripts/fqc-reset-request-fixture.cjs'),a=require('../scripts/routine-reset-authority-fixture.cjs');
function failScopedEncode(f,error){
 const original=f.records.prepareFirstStartRetirement;
 f.records.prepareFirstStartRetirement=async(...args)=>({...await original(...args),encode:async()=>{throw error;}});
}

for(const stage of ['read_state','receipt','encode_state','commit'])test('diagnostic '+stage+' is sanitized and preserves unconfirmed/noncommit behavior',async t=>{
 const s=await setup(t),before=await s.f.core.readState(),logs=[];
 t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const secret='SECRET fixture token /private/path user-record';
 if(stage==='read_state'){s.f.core.readSharedStateRow=async()=>{throw new Error(secret);};}
 if(stage==='receipt')s.f.load('lib/routine-reset-ledger.ts').findResetEntry=()=>{throw new SyntaxError(secret);};
 if(stage==='encode_state')failScopedEncode(s.f,new TypeError(secret));
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
 const {DraftConflict}=s.f.load('lib/shared-draft.ts');failScopedEncode(s.f,new DraftConflict('REVISION_CONFLICT'));
 const r=await s.call('fqc','frank',{id:crypto.randomUUID(),scope:'fqc',confirm:'RESET FQC',irreversibleAck:true,reason:'synthetic',pendingCount:0,revision:before.revision});
 assert.equal(r.status,409);assert.equal(r.body.error,'REVISION_CONFLICT');assert.equal(logs[0].category,'draft_conflict');
});
