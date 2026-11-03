import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,send,storedEnvelope,storedRow,resetEvents,noMutation,businessRefSet,addAuthorityAudit,authKeys,rawRef,replaceAggregate} from './fqc-required-dependencies-fixture.mjs';

for(const action of ['apply','save'])void test(`normal authority audit body supports FQC ${action} with original authority pointer retained`,async()=>{
 const c=await setup(),{f}=c;try{
  const body=await addAuthorityAudit(f),before=storedEnvelope(f);resetEvents(f);
  const response=await send(c,action,action==='save'?{}:undefined);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert(!(await response.text()).includes('synthetic-audit'),'authority history is not response data');
  assert(f.events.some(event=>event.kind==='get'&&event.key===body.key));
  assert.deepEqual(storedEnvelope(f).__processRecords.values.processAccessControl,before.__processRecords.values.processAccessControl);
 }finally{f.close();}
});

for(const mode of ['missing','sha','json','transient'])void test(`authority audit ${mode} body fails before business hydration and writes`,async()=>{
 const c=await setup(),{f}=c;try{
  const body=await addAuthorityAudit(f);let reads=0;
  if(mode==='missing')f.objects.delete(body.key);
  if(mode==='sha')f.objects.set(body.key,Buffer.from('{}'));
  if(mode==='json'){
   const ref=storedEnvelope(f).__processRecords.values.processAccessControl,aggregate=JSON.parse(f.objects.get(ref.key).toString());
   aggregate.audit[0].before={__immutableBody:rawRef(f,'[')};replaceAggregate(f,'processAccessControl',JSON.stringify(aggregate));
  }
  if(mode==='transient')f.hooks.get=key=>{if(key===body.key&&++reads===1)throw Error('SYNTHETIC_AUTHORITY_UNAVAILABLE');};
  const before=storedRow(f),business=businessRefSet(f);resetEvents(f);
  const response=await send(c);assert(response.status>=400);noMutation(f,before);
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));
  if(mode==='transient')assert.equal(reads,1,'no alternate reader after integrity failure');
 }finally{f.close();}
});

void test('FQC hydrated authority matches the ordinary verified reader before authorization',async()=>{
 const {f}=await setup();try{
  await addAuthorityAudit(f);const expected=await f.core.readState();let calls=0;
  await f.records.readFqcRequiredRecordMutation(f.env.STATE_ARCHIVE,storedEnvelope(f),storedRow(f).revision,{action:'apply',allocate:false},state=>{
   calls++;for(const key of authKeys)assert.equal(state.values[key],expected.values[key],key);
   assert(!Object.hasOwn(state.values,'qualityMasterControl'));
   return Promise.resolve({actorId:'editor',operationId:'synthetic-op',clientId:'synthetic-client',sequence:1});
  });assert.equal(calls,1);
 }finally{f.close();}
});

void test('revocation during authority body hydration still prevents business reads',async()=>{
 const c=await setup(),{f}=c;try{
  const body=await addAuthorityAudit(f),before=storedRow(f),business=businessRefSet(f);let revoked=false;
  f.hooks.get=key=>{if(key===body.key&&!revoked){revoked=true;f.revoke();}};resetEvents(f);
  const response=await send(c);assert.equal(response.status,401);assert(revoked);noMutation(f,before);
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));
 }finally{f.close();}
});

void test('hydrated audit history does not grant current denied permissions',async()=>{
 const c=await setup(),{f}=c;try{
  await addAuthorityAudit(f);
  await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
  const before=storedRow(f),business=businessRefSet(f);resetEvents(f);
  const response=await send(c);assert.equal(response.status,403);noMutation(f,before);
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));
 }finally{f.close();}
});

void test('maintenance overlay cannot hide unresolved authority inside a verified body',async()=>{
 const c=await setup(),{f}=c;try{
  const nested=rawRef(f,JSON.stringify({note:'Synthetic nested authority'}));
  const body=rawRef(f,JSON.stringify({nested:{__immutableBody:nested}}));
  replaceAggregate(f,'maintenanceMode',JSON.stringify({before:{__immutableBody:body}}));
  assert.equal(storedEnvelope(f).maintenanceMode,'0');
  const before=storedRow(f),business=businessRefSet(f);resetEvents(f);
  const response=await send(c);assert.equal(response.status,500);noMutation(f,before);
  assert(f.events.some(event=>event.kind==='get'&&event.key===body.key));
  assert(!f.events.some(event=>event.kind==='get'&&(event.key===nested.key||business.has(event.key))));
 }finally{f.close();}
});
