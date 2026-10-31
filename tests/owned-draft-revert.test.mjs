import test from 'node:test';import assert from 'node:assert/strict';
import {planOwnedDraftRevert} from '../public/process/owned-draft-revert.mjs';
const path=['rows',{id:'r'},'name'];
function fixture(){return {actorId:'a',clientId:'c',flow:{schemaVersion:3,generation:'g',revision:2,saved:{id:'s',revision:1},pendingId:null,working:{rows:[{id:'r',name:'mine',photo:'coworker-photo'}]}},operations:[{actorId:'a',command:{action:'apply',clientId:'c',generation:'g',operationId:'op',patches:[{op:'set',path,value:'mine'}],guards:[{path,value:'saved'}]},receipt:{operationId:'op',generation:'g',revision:2,savedId:'s',unchanged:false}}]};}
void test('reverts own field and preserves prior unrelated content with server revision/guard fences',()=>{const f=fixture(),before=structuredClone(f),p=planOwnedDraftRevert(f);assert.deepEqual(f,before);assert.deepEqual(p.patches,[{op:'set',path,value:'saved'}]);assert.equal(p.expectedRevision,2);assert.equal(p.guards[0].value,'mine');});
void test('same field changed by coworker refuses without mutating inputs',()=>{const f=fixture();f.flow.working.rows[0].name='coworker';const before=structuredClone(f);assert.throws(()=>planOwnedDraftRevert(f),/FIELD_CHANGED/);assert.deepEqual(f,before);});
void test('multiple own edits unwind in reverse with one current-value server guard',()=>{const f=fixture(),next=structuredClone(f.operations[0]);next.command.operationId='op2';next.receipt.operationId='op2';next.receipt.revision=3;next.command.guards[0].value='mine';next.command.patches[0].value='latest';f.operations.push(next);f.flow.revision=3;f.flow.working.rows[0].name='latest';const p=planOwnedDraftRevert(f);assert.deepEqual(p.patches.map(x=>x.value),['mine','saved']);assert.deepEqual(p.guards.map(x=>x.value),['latest']);});
for(const [name,change]of Object.entries({actor:f=>f.actorId='other',client:f=>f.clientId='other',generation:f=>f.flow.generation='new',save:f=>f.flow.saved.id='new',savedRevision:f=>f.flow.saved.revision=2,pending:f=>f.flow.pendingId='case',missingReceipt:f=>delete f.operations[0].receipt,unguarded:f=>f.operations[0].command.guards=[],remove:f=>f.operations[0].command.patches[0].op='remove'}))void test(name+' refuses',()=>{const f=fixture();change(f);assert.throws(()=>planOwnedDraftRevert(f));});

const kernelPromise=import('node:module').then(({createRequire})=>createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({})('lib/shared-draft.ts'));
async function kernelFixture(){
 const {createSharedDraft,applyDraftCommand}=await kernelPromise;
 const source=createSharedDraft('fixture',{rows:[{id:'r',name:'saved',photo:'initial'}]},null,'generation-0001');
 let n=0,operation=0;const sequences=new Map();
 const ctx={actor:{id:'a',name:'Synthetic',admin:true},at:'synthetic',id:()=>`generated-${++n}`,allowed:()=>true,structure:()=>{},validate:()=>[],semantic:v=>v,activeId:null};
 let state=source;
 function execute(action,detail={},actorId='a',clientId='client-0001'){
  const key=actorId+':'+clientId,sequence=(sequences.get(key)||0)+1;sequences.set(key,sequence);
  const command={action,operationId:`operation-${++operation}`,clientId,sequence,generation:state.generation,...detail};
  const result=applyDraftCommand(state,command,{...ctx,actor:{id:actorId,name:actorId,admin:true}});state=result.state;
  return{actorId,command,receipt:result.receipt};
 }
 execute('save');
 const set=(value,field=path,actor='a',client='client-0001')=>execute('apply',{patches:[{op:'set',path:field,value}],guards:[{path:field,value:structuredClone(field.length===1?state.working[field[0]]:state.working.rows[0][field.at(-1)])}]},actor,client);
 const plan=operations=>planOwnedDraftRevert({flow:state,actorId:'a',clientId:'client-0001',operations});
 return {execute,set,plan,ctx,applyDraftCommand,get state(){return state;}};
}
function refusesUnchangedInputs(f,operations,code){
 const before=structuredClone(f.state),log=structuredClone(operations);
 assert.throws(()=>f.plan(operations),code);
 assert.deepEqual(structuredClone(f.state),before);assert.deepEqual(structuredClone(operations),log);
}

void test('actual kernel preserves prior coworker content, saved/history and rejects later server write or revoked edit',async()=>{
 const f=await kernelFixture();f.set('coworker-photo',['rows',{id:'r'},'photo'],'b','client-0002');
 const own=f.set('mine'),plan=f.plan([own]),before=f.state;
 const undo={...plan,action:'apply',operationId:'revert-001',clientId:'client-0001',sequence:3};
 const restored=f.applyDraftCommand(before,undo,f.ctx).state;
 assert.deepEqual(structuredClone(restored.working.rows[0]),{id:'r',name:'saved',photo:'coworker-photo'});
 assert.deepEqual(restored.saved,before.saved);assert.deepEqual(restored.saves,before.saves);assert.deepEqual(restored.cases,before.cases);
 const advanced=f.set('late-photo',['rows',{id:'r'},'photo'],'b','client-0002');assert(advanced.receipt.revision>plan.expectedRevision);
 assert.throws(()=>f.applyDraftCommand(f.state,undo,f.ctx),/DRAFT_REVISION_CHANGED_RECONFIRM/);
 assert.throws(()=>f.applyDraftCommand(before,undo,{...f.ctx,allowed:p=>p!=='edit'}),/FORBIDDEN/);
});
void test('actual kernel contiguous own operations reverse to prior content',async()=>{
 const f=await kernelFixture(),operations=[f.set('mine'),f.set('latest')],before=f.state,plan=f.plan(operations);
 const restored=f.execute('apply',plan);
 assert.equal(restored.receipt.unchanged,false);assert.equal(f.state.working.rows[0].name,'saved');
 assert.deepEqual(f.state.saved,before.saved);assert.deepEqual(f.state.saves,before.saves);assert.deepEqual(f.state.cases,before.cases);
});
for(const [label,actor,client]of [['other actor','b','client-0002'],['same actor different client','a','client-0002']])void test('actual kernel rejects '+label+' ABA after own edit despite equal current value',async()=>{
 const f=await kernelFixture(),own=f.set('mine');f.set('other',path,actor,client);f.set('mine',path,actor,client);
 assert.equal(f.state.working.rows[0].name,own.command.patches[0].value);
 refusesUnchangedInputs(f,[own],/STATE_ADVANCED/);
});
void test('actual kernel rejects ABA between own edits even when latest receipt matches flow',async()=>{
 const f=await kernelFixture(),first=f.set('mine');f.set('other',path,'b','client-0002');f.set('mine',path,'b','client-0002');const last=f.set('latest');
 assert.equal(last.receipt.revision,f.state.revision);refusesUnchangedInputs(f,[first,last],/HISTORY_GAP/);
});
void test('actual kernel rejects unrelated later coworker mutation conservatively',async()=>{
 const f=await kernelFixture(),own=f.set('mine');f.set('coworker-photo',['rows',{id:'r'},'photo'],'b','client-0002');refusesUnchangedInputs(f,[own],/STATE_ADVANCED/);
});
void test('actual kernel rejects unrelated interleaved mutation conservatively',async()=>{
 const f=await kernelFixture(),first=f.set('mine');f.set('coworker-photo',['rows',{id:'r'},'photo'],'b','client-0002');const last=f.set('latest');refusesUnchangedInputs(f,[first,last],/HISTORY_GAP/);
});
void test('actual kernel rejects ancestor replacement ABA even if leaf value returns',async()=>{
 const f=await kernelFixture(),own=f.set('mine');f.set([{id:'r',name:'other',photo:'initial'}],['rows'],'b','client-0002');f.set([{id:'r',name:'mine',photo:'initial'}],['rows'],'b','client-0002');
 refusesUnchangedInputs(f,[own],/STATE_ADVANCED/);
});
void test('actual kernel rejects whole-content restore then leaf ABA',async()=>{
 const f=await kernelFixture(),own=f.set('mine');f.execute('restore',{restoreSaveId:f.state.saved.id,expectedRevision:f.state.revision},'b','client-0002');f.set('mine',path,'b','client-0002');
 refusesUnchangedInputs(f,[own],/STATE_ADVANCED/);
});
void test('actual kernel rejects an omitted mutating operation in the middle of its ledger',async()=>{
 const f=await kernelFixture(),first=f.set('mine');f.set('local-photo',['rows',{id:'r'},'photo']);const last=f.set('latest');refusesUnchangedInputs(f,[first,last],/HISTORY_GAP/);
});
void test('actual kernel a foreign no-op does not manufacture a content revision gap',async()=>{
 const f=await kernelFixture(),own=f.set('mine'),noop=f.set('mine',path,'b','client-0002');
 assert.equal(noop.receipt.unchanged,true);assert.equal(f.state.revision,own.receipt.revision);
 assert.deepEqual(f.plan([own]).patches,[{op:'set',path,value:'saved'}]);
});
void test('actual kernel rejects unchanged or replayed receipt as new mutation proof',async()=>{
 const f=await kernelFixture(),own=f.set('mine'),noop=f.set('mine');assert.equal(noop.receipt.unchanged,true);
 refusesUnchangedInputs(f,[noop],/MUTATION_RECEIPT_REQUIRED/);
 refusesUnchangedInputs(f,[own,own],/CONTEXT_CHANGED/);
});
void test('missing legacy unchanged proof fails closed',()=>{const f=fixture();delete f.operations[0].receipt.unchanged;assert.throws(()=>planOwnedDraftRevert(f),/MUTATION_RECEIPT_REQUIRED/);});
void test('actual kernel a fresh Save boundary invalidates prior operation receipts',async()=>{
 const f=await kernelFixture(),own=f.set('mine');f.execute('save');refusesUnchangedInputs(f,[own],/SAVE_CHANGED/);
});
