import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/test-routine-equipment-transfer-intent.cjs');
void test('equipment terminal readback is exact-route opt-in; other scopes keep their original admission',async()=>{
 const f=await fixture({openTransfer:false}),create=options=>f.c.createSharedDraftClient({actorId:f.c.ProcessSync.identity.id,headers:()=>({}),...options});
 for(const endpoint of ['/api/fqc/workflow?caseMetadata=1','/api/iqc/workflow?caseMetadata=1','/api/routine-equipment/workflow','/api/routine-equipment/workflow?caseMetadata=1&scope=other'])assert.throws(()=>create({endpoint,equipmentLocalSave:true,durableBegin:true}),/EQUIPMENT_LOCAL_SCOPE_REQUIRED/);
 assert.throws(()=>create({endpoint:'/api/routine-equipment/workflow?caseMetadata=1',equipmentLocalSave:true}),/EQUIPMENT_LOCAL_SCOPE_REQUIRED/);
 const exact=create({endpoint:'/api/routine-equipment/workflow?caseMetadata=1',equipmentLocalSave:true,durableBegin:true});assert(exact);assert.notEqual(create({endpoint:'/api/routine-equipment/workflow?caseMetadata=1',durableBegin:true}),exact,'opt-in must not share a legacy client cache entry');
 assert(create({endpoint:'/api/fqc/workflow?caseMetadata=1'}));assert(create({endpoint:'/api/iqc/workflow?caseMetadata=1'}));
});
