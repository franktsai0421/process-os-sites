import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {passwordFixture} from './password-outcome-fixture.mjs';
// Failed state comparisons must not print generated credentials or verifiers.
const same=(actual,expected)=>assert.equal(isDeepStrictEqual(actual,expected),true,'Synthetic values differ; contents suppressed');
const change=(id,secret,extra={})=>({action:'password',id,password:secret,confirmation:secret,...extra});
for(const format of ['inline','records','chunks','monolith'])for(const id of ['missing','legacy','hashed'])void test(format+' administrator resets '+id+'; persisted new login, old login/session denied, business refs unchanged',async t=>{
 const f=await passwordFixture(format);t.after(()=>f.close());const next=randomUUID(),before=f.snapshot(),r=await f.post('manager',change(id,next));assert.equal(r.status,200);const ack=await r.json();assert.equal(ack.ok,true);assert.equal(ack.relogin,false);assert.equal((await f.get('manager')).status,200);assert.equal((await f.get(id)).status,401);assert.equal((await f.sign(id,next)).status,200);assert.equal((await f.sign(id)).status,401);
 const state=await f.core.readState(),target=JSON.parse(state.values.platformUsers).find(u=>u.id===id);assert.equal(target.authEpoch,2);assert.equal(Object.hasOwn(target,'password'),false);assert.equal(await f.pw.verifyPassword(target,next),true);assert.equal(state.values.masterDataControl,f.values.masterDataControl);
 for(const user of JSON.parse(state.values.platformUsers).filter(u=>u.id!==id))same(user,f.users.find(u=>u.id===user.id));
 const audit=JSON.parse(state.values.processAccessControl).audit;assert.equal(audit.length,1);for(const output of [JSON.stringify(ack),JSON.stringify(audit),JSON.stringify(f.warnings)])for(const credential of [f.secret,next,target.passwordHash])assert.equal(output.includes(credential),false);
 const old=JSON.parse(before.values),now=JSON.parse(f.snapshot().values);if(format==='records'){for(const [key,ref]of Object.entries(old.__processRecords.values))if(!['platformUsers','processAccessControl'].includes(key))assert.deepEqual(now.__processRecords.values[key],ref);assert.deepEqual(now.__processRecords.legacySources,old.__processRecords.legacySources);assert.deepEqual(now.__processRecords.allocations,old.__processRecords.allocations);}else assert.equal(state.values.publishedProcess,format==='monolith'?JSON.stringify({content:'x'.repeat(600000)}):f.values.publishedProcess);
});
for(const id of ['legacy','hashed','frank'])void test('records own '+id+' requires old secret and signs in with the new one',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const next=randomUUID(),before=f.snapshot();assert.equal((await f.post(id,change(id,next,{oldPassword:randomUUID()}))).status,400);same(f.snapshot(),before);const r=await f.post(id,change(id,next,{oldPassword:f.secret}));assert.equal(r.status,200);assert.equal((await r.json()).relogin,true);assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal((await f.get(id)).status,401);assert.equal((await f.sign(id,next)).status,200);assert.equal((await f.sign(id)).status,401);assert.equal((await f.get('other')).status,200);
});
void test('records password does not fetch or rewrite unrelated immutable business bodies',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const envelope=JSON.parse(f.snapshot().values),ref=envelope.__processRecords.values.publishedProcess;f.fault(ref.key);
 await assert.rejects(f.core.readState({deferHistory:true,deferDependencyHistory:true}),/SYNTHETIC_READ_UNAVAILABLE/);f.resetIO();const r=await f.post('manager',change('missing',randomUUID()));assert.equal(r.status,200);assert.equal(f.io().gets.includes(ref.key),false);assert.equal(f.io().puts,2);assert.deepEqual(JSON.parse(f.snapshot().values).__processRecords.values.publishedProcess,ref);
});
for(const fault of ['put','before-cas','after-cas'])void test(fault+' never reports success; only an actual commit changes new-password login',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const next=randomUUID(),before=f.snapshot();f.fault(fault);const r=await f.post('manager',change('legacy',next));assert.equal(r.status,500);assert.equal((await r.json()).error,'SERVER_ERROR');f.fault(null);assert.equal((await f.sign('legacy',next)).status,fault==='after-cas'?200:401);assert.equal((await f.sign('legacy')).status,fault==='after-cas'?401:200);if(fault!=='after-cas')same(f.snapshot(),before);else assert.equal(f.snapshot().revision,before.revision+1);
});
void test('stale revision, CAS race, protected peer and ordinary user stay rejected',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const next=randomUUID(),before=f.snapshot();for(const [actor,id]of [['legacy','other'],['manager','frank'],['manager','manager']])assert.equal((await f.post(actor,change(id,next))).status,actor===id?400:403);assert.equal((await f.post('frank',change('legacy',next,{baseRevision:0}))).status,409);same(f.snapshot(),before);f.beforeCAS(()=>f.db.prepare('UPDATE shared_state SET revision=revision+1').run());assert.equal((await f.post('frank',change('legacy',next))).status,409);same(f.snapshot().values,before.values);assert.equal((await f.sign('legacy')).status,200);
});
void test('selected overlay cannot become a generic partial writer or change roles/business/accounts',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const port=await f.source.load('lib/password-state.ts'),state=await port.readPasswordState();await assert.rejects(f.core.encodeValues(state.values,state),/Partial read cannot be saved/);const before=f.snapshot();
 for(const values of [{...state.values,publishedProcess:'{}'},{...state.values,processCustomRoles:'[] '},{...state.values,platformUsers:JSON.stringify(f.users.map(u=>u.id==='legacy'?{...u,role:'admin'}:u))}])await assert.rejects(port.encodePasswordState(values,state),/Invalid password state overlay/);
 await assert.rejects(port.encodePasswordState(state.values,{...state}),/Invalid password state overlay/);same(f.snapshot(),before);assert.equal(f.io().puts,0);
});
void test('missing/corrupt selected account aggregate fails closed without writes',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const before=f.snapshot(),key=JSON.parse(before.values).__processRecords.values.platformUsers.key;f.objects.set(key,Buffer.from('[]'));const r=await f.post('frank',change('missing',randomUUID()));assert.equal(r.status,500);same(f.snapshot(),before);assert.equal(f.io().puts,0);
});
void test('replaying the original lost-ACK request is refused by its pinned revision; audit/epoch change once',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const next=randomUUID(),body=change('legacy',next,{baseRevision:1});f.fault('after-cas');assert.equal((await f.post('manager',body)).status,500);f.fault(null);const committed=f.snapshot();assert.equal((await f.post('manager',body)).status,409);same(f.snapshot(),committed);const state=await f.core.readState();assert.equal(JSON.parse(state.values.processAccessControl).audit.length,1);assert.equal(JSON.parse(state.values.platformUsers).find(u=>u.id==='legacy').authEpoch,2);assert.equal((await f.sign('legacy',next)).status,200);
});
void test('concurrent password changes from one revision commit only one credential and one audit entry',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const secrets=[randomUUID(),randomUUID()],responses=await Promise.all(secrets.map(next=>f.post('manager',change('legacy',next,{baseRevision:1}))));assert.deepEqual(responses.map(r=>r.status).sort((a,b)=>a-b),[200,409]);const winner=responses.findIndex(r=>r.status===200);assert.equal((await f.sign('legacy',secrets[winner])).status,200);assert.equal((await f.sign('legacy',secrets[1-winner])).status,401);const state=await f.core.readState();assert.equal(JSON.parse(state.values.processAccessControl).audit.length,1);
});
void test('divergent inline account metadata cannot substitute for the SHA-verified authority aggregate',async t=>{
 const f=await passwordFixture();t.after(()=>f.close());const envelope=JSON.parse(f.snapshot().values);envelope.platformUsers='[]';f.db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify(envelope));const before=f.snapshot();assert.equal((await f.post('manager',change('missing',randomUUID()))).status,500);same(f.snapshot(),before);assert.equal(f.io().puts,0);
});

void test('intentional failed snapshot comparison exposes no generated credential in its error',()=>{
 const secret=randomUUID();let caught;try{same({privateValue:secret},{privateValue:randomUUID()});}catch(error){caught=error;}assert(caught instanceof Error);assert.equal(caught.message.includes(secret),false);assert.equal(JSON.stringify(caught).includes(secret),false);
});
