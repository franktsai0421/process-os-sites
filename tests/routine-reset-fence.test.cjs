const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('../scripts/fqc-bootstrap-projection-fixture.cjs')(require('node:path').resolve(__dirname,'..'),{},{});
const {assertRoutineResetFence:guard}=load('lib/routine-reset-fence.ts');
test('reset floor is optional only for never-fenced legacy controls',()=>{
 assert.doesNotThrow(()=>guard({revision:5},undefined));
 for(const floor of [null,undefined,0,-1,NaN,1.5,6])assert.throws(()=>guard({revision:5,resetGenerationRevision:floor},5),e=>e.code==='RESET_FENCE_INVALID');
});
test('only commands inside the selected module generation can proceed',()=>{
 const c={revision:9,resetGenerationRevision:6};
 for(const revision of [undefined,null,NaN,'6',5,10])assert.throws(()=>guard(c,revision),e=>e.code==='RESET_GENERATION_CHANGED');
 for(const revision of [6,7,9])assert.doesNotThrow(()=>guard(c,revision));
 assert.deepEqual(c,{revision:9,resetGenerationRevision:6});
});
