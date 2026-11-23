const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('../scripts/fqc-bootstrap-projection-fixture.cjs')(require('node:path').resolve(__dirname,'..'),{},{});
const {makeResetLedger,resetLedger,assertNotResetRetired,validResetPending}=load('lib/routine-reset-ledger.ts');
const entry={id:'reset-operation-001',scope:'fqc',actorId:'frank',fingerprint:'a'.repeat(64),revision:8,generationRevision:4,at:'synthetic',reason:'synthetic'};
const pending=[{operationId:'unknown-operation',clientEvidence:'b'.repeat(64)}];
test('unknown is durable, never a failure; repeated reset preserves all audit and first-start evidence',async()=>{
 const retirement={id:'old-start-operation',actorId:'frank',scope:'fqc',expectedRevision:0,fencedRevision:1};
 const ledger=await makeResetLedger({receipts:{},firstStartRetirement:retirement},entry,pending);
 assert.equal(ledger.retired['unknown-operation'].outcome,'unknown');
 assert.deepEqual(JSON.parse(JSON.stringify(ledger.entries[0].firstStartRetirement)),retirement);
 assert.throws(()=>assertNotResetRetired({resetLedger:ledger},'old-start-operation'),e=>e.code==='OPERATION_SUPERSEDED_BY_RESET');
 const second=await makeResetLedger({resetLedger:ledger,receipts:{}},{...entry,id:'reset-operation-002',revision:9,generationRevision:5},[]);
 assert.equal(JSON.stringify(second.entries[0]),JSON.stringify(ledger.entries[0]));assert.equal(JSON.stringify(second.retired),JSON.stringify(ledger.retired));
});
test('wrong pending actor or mixed-scope ledger refuses without mutating input',async()=>{
 const c={receipts:{'unknown-operation':{actorId:'other',fingerprint:'original'}}};const before=JSON.stringify(c);
 await assert.rejects(makeResetLedger(c,entry,pending),e=>e.code==='RESET_PENDING_ACTOR_MISMATCH');assert.equal(JSON.stringify(c),before);
 const ledger=await makeResetLedger({receipts:{}},entry,pending);
 await assert.rejects(makeResetLedger({resetLedger:ledger},{...entry,scope:'iqc'},[]),e=>e.code==='RESET_LEDGER_SCOPE_MISMATCH');
});
test('retired operation cannot reappear with a new receipt',async()=>{
 const ledger=await makeResetLedger({receipts:{}},entry,pending);
 await assert.rejects(makeResetLedger({resetLedger:ledger,receipts:{'unknown-operation':{actorId:'frank',fingerprint:'new'}}},{...entry,id:'reset-operation-002'},[]),e=>e.code==='RESET_RECEIPT_REAPPEARED');
});
test('pending descriptors are bounded and require exact evidence, never scope/all input',()=>{
 assert(validResetPending(pending));
 for(const p of [[...pending,...pending],[{...pending[0],scope:'both'}],[{operationId:'unknown-operation'}],Array.from({length:33},(_,i)=>({operationId:'operation-'+i,clientEvidence:'a'.repeat(64)}))])assert(!validResetPending(p));
});
test('invalid and exhausted ledgers fail closed instead of pruning evidence',async()=>{
 for(const l of [null,{version:1,entries:[],retired:[]},{version:1,entries:[{}],retired:{}}])assert.throws(()=>resetLedger({resetLedger:l}));
 const retired=Object.fromEntries(Array.from({length:10000},(_,i)=>['operation-'+i,{actorId:'frank',outcome:'unknown'}]));
 const c={resetLedger:{version:1,entries:[],retired}};
 await assert.rejects(makeResetLedger(c,entry,pending),e=>e.code==='RESET_LEDGER_CAPACITY');assert.equal(Object.keys(retired).length,10000);
});
