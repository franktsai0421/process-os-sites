import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/ipqc-c-operation-fixture.cjs');
const snapshot=index=>({errors:[],items:[{id:'matched-'+index,code:'SYN-'+index,standard:'Retained matched name',equipmentId:'source',isEnabled:true,deleted:false},{id:'other-'+index,code:'OTHER',standard:'x'.repeat(12000),equipmentId:'different',isEnabled:true,deleted:false,standardPhotos:[{id:'synthetic-metadata',note:'x'.repeat(4000)}]}]});
async function setup(){
 const control={schemaVersion:1,source:null,reservedErrorCodes:[],reservedItemCodes:[],scopes:{'A:G':{line:'A',group:'G',activeVersionId:'active',versions:['active','pending','old'].map((id,index)=>({id,number:index+1,status:['approved','pending','superseded'][index],snapshot:snapshot(index)}))}}};
 const master={active:{AB:{products:[],lines:[],categoryGroups:[]}}},f=await fixture({ipqcABMasterControl:JSON.stringify(control),masterDataControl:JSON.stringify(master)});
 const route=f.load('app/api/ipqc-ab/route.ts'),read=(query='',actor='editor')=>route.GET(new Request('http://fixture/api/ipqc-ab'+query,{headers:f.sessions[actor]}));return{...f,read};
}
void test('equipment references preserve every visible version, exact stable-ID relationships and readonly state while excluding unrelated content',async()=>{
 const f=await setup();try{
  const before=f.snapshot(),full=await f.read(),fullText=await full.text(),response=await f.read('?references=source'),text=await response.text(),summary=JSON.parse(text),data=JSON.parse(fullText);assert.equal(response.status,200,text);assert.equal(summary.equipmentReferenceProjection,'ipqc-ab-equipment-v1');
  for(const [key,scope]of Object.entries(data.control.scopes)){
   const actual=summary.control.scopes[key];assert.equal(actual.activeVersionId,scope.activeVersionId);assert.deepEqual(actual.versions,scope.versions.map(v=>({id:v.id,number:v.number,status:v.status,snapshot:{items:v.snapshot.items.filter(item=>!item.deleted&&item.equipmentId==='source').map(({id,code,standard,equipmentId,isEnabled})=>({id,code,standard,equipmentId,isEnabled}))}})));
  }
  assert(text.length<fullText.length/10);assert(!text.includes('standardPhotos'));assert.deepEqual(f.snapshot(),before);
  for(const query of ['?references=','?references=source&references=other','?references=source&caseMetadata=1'])assert.equal((await f.read(query)).status,400);
  const denied=await f.read('?references=source','no-view'),original=await f.read('','no-view');assert.equal(denied.status,original.status,'same pre-existing read permission boundary');
 }finally{f.close();}
});
for(const mode of ['missing','corrupt'])void test(`equipment references fail closed on ${mode} historical body; no partial relationship list`,async()=>{
 const f=await setup();try{
  const row=f.snapshot().row,envelope=JSON.parse(row.values),aggregateRef=envelope.__processRecords.values.ipqcABMasterControl,aggregate=JSON.parse(f.objects.get(aggregateRef.key)),body=aggregate.scopes['A:G'].versions.find(v=>v.id==='old').snapshot.__immutableBody;
  assert(body);if(mode==='missing')f.objects.delete(body.key);else f.objects.set(body.key,Buffer.from('{"tampered":true}'));
  const before=f.snapshot(),r=await f.read('?references=source');assert.equal(r.status,503);assert.equal((await r.json()).control,undefined);assert.deepEqual(f.snapshot(),before);
 }finally{f.close();}
});
