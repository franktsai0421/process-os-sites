const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const load=require('../scripts/ipqc-ab-import-harness.cjs')(),helper=load('lib/workflow-begin.ts'),kernel=load('lib/shared-draft.ts');
const basis=()=>({generation:null,activeVersionId:null,openVersionId:null,openVersionStatus:null,openVersionRevision:null});
const body=()=>({action:'begin-v1',begin:{operationId:randomUUID(),basis:basis()}});
void test('Begin identity is an exact versioned UUID envelope with explicit nullable lifecycle basis',()=>{
 assert.equal(helper.parseBeginIdentity({action:'begin'}),null);
 const valid=body();assert.deepEqual(helper.parseBeginIdentity(valid),valid.begin);
 for(const bad of [null,[],{},'',0,{...valid.begin,extra:true},{...valid.begin,operationId:'__proto__'},{...valid.begin,basis:null},{...valid.begin,basis:[]},{...valid.begin,basis:{...basis(),extra:0}},{...valid.begin,basis:{...basis(),generation:''}},{...valid.begin,basis:{...basis(),openVersionStatus:'draft'}},{...valid.begin,basis:{...basis(),openVersionRevision:0}}])assert.throws(()=>helper.parseBeginIdentity({action:'begin-v1',begin:bad}),/INVALID_BEGIN_IDENTITY/);
 for(const value of [-1,0.5,'1',{},[],Number.MAX_SAFE_INTEGER+1])assert.throws(()=>helper.parseBeginIdentity({action:'begin-v1',begin:{...valid.begin,basis:{...basis(),openVersionId:'legacy',openVersionStatus:'draft',openVersionRevision:value}}}),/INVALID_BEGIN_IDENTITY/);
 const legacy={activeVersionId:null,versions:[{id:'legacy',status:'draft'}]},legacyBasis=helper.beginBasis(legacy);assert.equal(legacyBasis.openVersionRevision,null);assert.doesNotThrow(()=>helper.parseBeginIdentity({action:'begin-v1',begin:{...valid.begin,basis:legacyBasis}}));
});
void test('Begin receipt survives ordinary approve generation rotation and exact replay precedes old basis',()=>{
 const control={activeVersionId:null,versions:[],workflow:kernel.createSharedDraft('test',{value:'old'},null,randomUUID())},begin={operationId:randomUUID(),basis:helper.beginBasis(control)},context={actor:{id:'actor',name:'Actor'},at:'synthetic',id:randomUUID,allowed:()=>true,activeId:null,structure(){},validate:()=>[],semantic:x=>x};
 const receipt=structuredClone(helper.recordBegin(control,begin,'actor',false));let sequence=0;
 const apply=(action,fields={})=>{const result=kernel.applyDraftCommand(control.workflow,{action,operationId:randomUUID(),clientId:'test-client',sequence:++sequence,generation:control.workflow.generation,...fields},context);control.workflow=result.state;return result;};
 apply('apply',{patches:[{op:'set',path:['value'],value:'new'}],guards:[{path:['value'],value:'old'}]});apply('save');apply('submit',{savedId:control.workflow.saved.id,expectedRevision:control.workflow.revision,reason:'test'});apply('approve',{caseId:control.workflow.pendingId,selfReviewConfirmed:true});
 assert.notEqual(control.workflow.generation,receipt.generation);assert.deepEqual(structuredClone(helper.replayBegin(control,begin,'actor')),receipt);assert.throws(()=>helper.assertBeginBasis(control,begin),/BEGIN_BASIS_CHANGED/);assert.throws(()=>helper.replayBegin(control,begin,'other'),/OPERATION_ID_REUSED/);
});
