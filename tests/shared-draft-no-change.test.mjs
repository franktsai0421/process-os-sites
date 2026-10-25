import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{createSharedDraft,applyDraftCommand}=require('../scripts/ipqc-ab-import-harness.cjs')()('lib/shared-draft.ts');
function fixture(activeId='approved',seed){
 let state=createSharedDraft('iqc',{items:[{id:'row',name:'Initial'}],metadata:'original'},activeId,randomUUID()),sequence=0;
 const actor={id:'editor',name:'Synthetic',admin:true};
 if(seed)state=seed(state,actor);
 const context=()=>({actor,at:'2026-10-25T00:00:00Z',id:randomUUID,allowed:()=>true,structure(){},validate:()=>[],semantic:content=>content.items,activeId:state.active.id});
 const command=(action,detail={})=>({operationId:randomUUID(),clientId:'synthetic-client',generation:state.generation,sequence:++sequence,action,...detail});
 const send=cmd=>{const result=applyDraftCommand(state,cmd,context());state=result.state;return result;};
 const run=(action,detail)=>send(command(action,detail));
 return{get state(){return state;},command,send,run};
}
const name=value=>({op:'set',path:['items',{id:'row'},'name'],value});
function rejectNoChange(f){f.run('save');const before=JSON.stringify(f.state),cmd=f.command('submit',{savedId:f.state.saved.id,reason:'Synthetic review'});assert.throws(()=>f.send(cmd),e=>e.code==='NO_SUBSTANTIVE_CHANGE'&&e.status===422);assert.equal(JSON.stringify(f.state),before);assert.equal(f.state.pendingId,null);assert.equal(f.state.receipts[cmd.operationId],undefined);}
test('unchanged approved content rejects submit without changing saves, receipt, revision or pending lock',()=>rejectNoChange(fixture()));
test('edit then revert and metadata-only edits are still semantically unchanged',()=>{
 const f=fixture();f.run('apply',{patches:[name('Changed')]});f.run('save');f.run('apply',{patches:[name('Initial')]});rejectNoChange(f);
 const g=fixture();g.run('apply',{patches:[{op:'set',path:['metadata'],value:'New display metadata'}]});rejectNoChange(g);
});
test('first baseline without an active version may submit unchanged content',()=>{const f=fixture(null);f.run('save');f.run('submit',{savedId:f.state.saved.id,reason:'First baseline'});assert(f.state.pendingId);});
test('genuine saved change locks pending; withdrawal and return allow resubmission of still changed content',()=>{
 for(const action of ['withdraw','return']){const f=fixture();f.run('apply',{patches:[name('Changed')]});f.run('save');const first=f.run('submit',{savedId:f.state.saved.id,reason:'Changed'});assert(f.state.pendingId);assert.throws(()=>f.run('apply',{patches:[name('While pending')]}));f.run(action,{caseId:first.receipt.caseId,reason:'Reconsider',selfReviewConfirmed:true});assert.equal(f.state.pendingId,null);assert.equal(f.state.cases[0].status,action==='withdraw'?'withdrawn':'returned');f.run('submit',{savedId:f.state.saved.id,reason:'Still changed'});assert(f.state.pendingId);assert.equal(f.state.cases.length,2);}
});
test('already committed exact receipt stays idempotent after active content changes',()=>{const f=fixture();f.run('apply',{patches:[name('Changed')]});f.run('save');const cmd=f.command('submit',{savedId:f.state.saved.id,reason:'Changed'}),receipt=f.send(cmd).receipt;f.run('approve',{caseId:receipt.caseId,selfReviewConfirmed:true});const before=JSON.stringify(f.state);assert.deepEqual(f.send(cmd).receipt,receipt);assert.equal(JSON.stringify(f.state),before);assert.equal(f.state.cases[0].status,'approved');});

// An older handler admitted no-change cases. Exercise their persisted pending
// state, then perform the real withdraw/return and resubmit transitions.
function legacyPending(){return fixture('approved',(state,actor)=>{
 const stamp={actor,at:'2026-10-24T00:00:00Z'};
 state.saved={...stamp,id:'legacy-save',revision:0,content:structuredClone(state.active.content),contributors:{}};
 state.saves=[structuredClone(state.saved)];
 state.cases=[{...stamp,id:'legacy-case',savedId:state.saved.id,baseId:state.active.id,content:structuredClone(state.saved.content),before:structuredClone(state.active.content),reason:'Previously admitted',status:'pending'}];state.pendingId='legacy-case';return state;
});}
for(const action of ['withdraw','return'])test(`${action} permits the exact fixed saved snapshot again even when equal to active`,()=>{
 const f=legacyPending(),saved=structuredClone(f.state.saved),active=structuredClone(f.state.active);
 f.run(action,{caseId:'legacy-case',reason:'Reconsider',selfReviewConfirmed:true});
 const oldCase=structuredClone(f.state.cases[0]);assert.equal(oldCase.status,action==='withdraw'?'withdrawn':'returned');
 f.run('submit',{savedId:saved.id,reason:'Send fixed snapshot again'});
 assert.equal(f.state.cases.length,2);assert.deepEqual(JSON.parse(JSON.stringify(f.state.cases[0])),oldCase);assert.deepEqual(JSON.parse(JSON.stringify(f.state.saved)),saved);assert.deepEqual(JSON.parse(JSON.stringify(f.state.active)),active);assert.deepEqual(JSON.parse(JSON.stringify(f.state.cases[1].content)),saved.content);assert.equal(f.state.cases[1].savedId,saved.id);
});
test('approval closes the resubmit exception; new unchanged submit rejects but actual modification can submit',()=>{
 const f=legacyPending();f.run('withdraw',{caseId:'legacy-case',reason:'Reconsider'});const submitted=f.run('submit',{savedId:f.state.saved.id,reason:'Resubmit'});
 f.run('approve',{caseId:submitted.receipt.caseId,selfReviewConfirmed:true});rejectNoChange(f);
 f.run('apply',{patches:[name('Actual subsequent change')]});f.run('save');f.run('submit',{savedId:f.state.saved.id,reason:'Subsequent change'});assert.equal(f.state.cases.at(-1).status,'pending');
});
test('client flags, changed saved body and changed baseline cannot forge fixed-case resubmission',()=>{
 const f=fixture();f.run('save');let before=JSON.stringify(f.state);assert.throws(()=>f.run('submit',{savedId:f.state.saved.id,reason:'No change',allowUnchanged:true,reopened:true}),e=>e.code==='NO_SUBSTANTIVE_CHANGE'&&e.status===422);assert.equal(JSON.stringify(f.state),before);
 const g=legacyPending();g.run('return',{caseId:'legacy-case',reason:'Reconsider',selfReviewConfirmed:true});g.run('apply',{patches:[{op:'set',path:['metadata'],value:'Different snapshot'}]});g.run('save');before=JSON.stringify(g.state);assert.throws(()=>g.run('submit',{savedId:g.state.saved.id,reason:'Different save'}),e=>e.code==='NO_SUBSTANTIVE_CHANGE');assert.equal(JSON.stringify(g.state),before);
 const h=legacyPending();h.run('withdraw',{caseId:'legacy-case',reason:'Reconsider'});h.state.active.id='new-active';before=JSON.stringify(h.state);assert.throws(()=>h.run('submit',{savedId:h.state.saved.id,reason:'Stale baseline'}),e=>e.code==='ACTIVE_VERSION_CHANGED');assert.equal(JSON.stringify(h.state),before);
});
