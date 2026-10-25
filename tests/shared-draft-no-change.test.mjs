import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{createSharedDraft,applyDraftCommand}=require('../scripts/ipqc-ab-import-harness.cjs')()('lib/shared-draft.ts');
function fixture(activeId='approved'){
 let state=createSharedDraft('iqc',{items:[{id:'row',name:'Initial'}],metadata:'original'},activeId,randomUUID()),sequence=0;
 const actor={id:'editor',name:'Synthetic',admin:true};
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
