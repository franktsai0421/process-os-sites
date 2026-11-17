import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inventoryReadAhead} from '../lib/inventory-read-ahead.mjs';
const require=createRequire(import.meta.url);
const owners=[['tooling','toolingMasterControl','tooling'],['routine-equipment','routineEquipmentControl','routine-equipment']];
for(const [module,key,scope]of owners){
 const request=(method='GET',query='')=>new Request('https://synthetic.invalid/api/'+module+'/workflow'+query,{method});
 void test(module+' exact scheduling admission leaves deletion/restore/other routes unchanged',()=>{
  assert(inventoryReadAhead(request(),key,scope));assert(!inventoryReadAhead(request('GET','?scope=x'),key,scope));assert(!inventoryReadAhead(request('GET','?restoreSaveId=x'),key,scope));
  for(const action of ['apply','save','submit','withdraw','approve','return'])assert(inventoryReadAhead(request('POST'),key,scope,{command:{action}}));
  for(const action of ['restore','delete','begin'])assert(!inventoryReadAhead(request('POST'),key,scope,{command:{action}}));
  for(const patches of [null,{},[null],[{op:'set',path:1}],[{op:'set'}]])assert(!inventoryReadAhead(request('POST'),key,scope,{command:{action:'save',patches}}));
  for(const op of ['remove','insert'])assert(!inventoryReadAhead(request('POST'),key,scope,{command:{action:'save',moduleAction:'save-local-v1',patches:[{op}]}}));
  assert(!inventoryReadAhead(request('POST'),key,scope,{action:'begin'}));assert(!inventoryReadAhead(request('POST'),key,scope,{command:{action:'save'},extra:true}));
  assert(!inventoryReadAhead(request('POST'),key,scope,{command:{action:'apply',moduleAction:'import-20261006'}}));assert(!inventoryReadAhead(request(),key+'other',scope));
  assert(!inventoryReadAhead(new Request('https://synthetic.invalid/api/other/workflow'),key,scope));
 });
 void test(module+' duplicate Save, stale field refusal, corrected retry and refresh retain one original receipt',async()=>{
  const equipment=module==='routine-equipment',f=equipment?await require('../scripts/equipment-atomic-fixture.cjs').fixture():await require('../scripts/tooling-local-save-fixture.cjs')();
  try{
   const call=async(body)=>{if(!equipment)return f.call(body);const r=await f.call('/api/routine-equipment/workflow?caseMetadata=1',body?{method:'POST',body:JSON.stringify(body)}:{});return{status:r.status,body:await r.json()};};
   if(!equipment)assert.equal((await call({action:'begin'})).status,200);
   const before=(await call()).body,flow=before.control.workflow,path=equipment?['equipment',{id:'source'},'name']:['tools',{id:'one'},'notes'],old=equipment?flow.working.equipment[0].name:flow.working.tools[0].notes;
   const revision=()=>f.db.prepare('SELECT revision FROM shared_state').get().revision;
   const command={action:'save',moduleAction:'save-local-v1',operationId:crypto.randomUUID(),clientId:'speed-regression',sequence:1,generation:flow.generation,patches:[{op:'set',path,value:'Synthetic saved speed edit'}],guards:[{path,value:old}]};
   const initial=revision(),a=await call({command});assert.equal(a.status,200);assert(a.body.receipt);assert.equal(revision(),initial+1);
   const replay=await call({command});assert.equal(replay.status,200);assert.equal(replay.body.receipt.operationId,a.body.receipt.operationId);assert.equal(revision(),initial+1,'duplicate request cannot persist another CAS');
   const bad={...command,operationId:crypto.randomUUID(),sequence:2,patches:[{op:'set',path,value:'Corrected retry'}]};
   const denied=await call({command:bad});assert.equal(denied.status,409);assert.equal(revision(),initial+1,'failed guard must not persist');
   const retry=await call({command:{...bad,operationId:crypto.randomUUID(),guards:[{path,value:'Synthetic saved speed edit'}]}});assert.equal(retry.status,200);assert.equal(revision(),initial+2);
   const fresh=(await call()).body.control.workflow;assert.equal(fresh.saved.content[equipment?'equipment':'tools'][0][equipment?'name':'notes'],'Corrected retry');assert.deepEqual(fresh.saved.content,fresh.working);
  }finally{f.close();}
 });
}
for(const [moduleName,key]of owners)void test(moduleName+' failed domain read permits explicit GET retry; revoked view fails before domain I/O',async()=>{
 const equipment=moduleName==='routine-equipment',f=equipment?await require('../scripts/equipment-atomic-fixture.cjs').fixture():await require('../scripts/tooling-local-save-fixture.cjs')();
 try{
  const get=async()=>{if(!equipment)return f.call();const r=await f.call('/api/routine-equipment/workflow?caseMetadata=1');return{status:r.status,body:await r.json()};};
  const row=f.db.prepare('SELECT revision,"values" FROM shared_state').get(),ref=JSON.parse(row.values).__processRecords.values[key],bytes=f.objects.get(ref.key);assert(bytes);
  f.objects.delete(ref.key);assert.equal((await get()).status,503);assert.equal(f.db.prepare('SELECT revision FROM shared_state').get().revision,row.revision);
  f.objects.set(ref.key,bytes);assert.equal((await get()).status,200,'explicit read retry consumes the same stored state');
  if(equipment)await f.rights('editor',[]);else await f.rights('editor',{view:false});
  f.objects.delete(ref.key);assert.equal((await get()).status,403,'denied view must stop before reading missing private domain data');f.objects.set(ref.key,bytes);
 }finally{f.close();}
});
void test('actual equipment page GET keeps the complete serial-read projection and explicit failure retry',async()=>{
 const f=await require('../scripts/equipment-atomic-fixture.cjs').fixture();
 try{
  const core=f.load('lib/process-state.ts'),original=core.readState,options=[];
  const get=async()=>{const r=await f.call('/api/routine-equipment?caseMetadata=1');return{status:r.status,body:await r.json()};};
  core.readState=o=>{options.push(o);return original({...o,aggregateReadAhead:false});};
  const serial=await get();assert.equal(serial.status,200);
  core.readState=o=>{options.push(o);return original(o);};
  const candidate=await get();assert.equal(candidate.status,200);assert.deepEqual(candidate.body,serial.body);assert(options.every(o=>o.aggregateReadAhead===true),'actual page route opts into the same bounded decoder');
  const row=f.db.prepare('SELECT revision,"values" FROM shared_state').get(),ref=JSON.parse(row.values).__processRecords.values.routineEquipmentControl,bytes=f.objects.get(ref.key);assert(bytes);
  f.objects.delete(ref.key);assert.equal((await get()).status,503);assert.equal(f.db.prepare('SELECT revision FROM shared_state').get().revision,row.revision);
  f.objects.set(ref.key,bytes);assert.deepEqual((await get()).body,candidate.body);
  await f.rights('editor',[]);assert.equal((await get()).status,403);
 }finally{f.close();}
});
