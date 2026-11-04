import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const h=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({});
const {createSharedDraft,applyDraftCommand}=h('lib/shared-draft.ts');
const {processAuthoringAdapter}=h('lib/process-authoring-workflow.ts');
const {processSaveCommand}=h('lib/process-save-record-mutation.ts');
const {processFlowCommand}=h('lib/process-flow-record-mutation.ts');
const workspace=JSON.stringify(['Synthetic','A']),path=['workspaces',{id:workspace},'stages','S',{id:'a'},'name'];
const copy=structuredClone;
function fixture(){
 const content={workspaces:[{id:workspace,category:'Synthetic',line:'A',stages:{S:[{id:'a',stageCode:'S',name:'Old',x:0,nextIds:[],productCodes:[]}]}}]};
 const workflow=createSharedDraft('process:platform',content,null,'generation-test');
 const control={workflow,versions:[]},ctx={actor:{id:'a',name:'A',admin:true},at:'synthetic',id:randomUUID,allowed:()=>true,structure:()=>{},validate:()=>[],semantic:x=>x,activeId:null};
 const command=(patches=[{op:'set',path,value:'New'}],guards=[{path,value:'Old'}])=>({action:'apply',moduleAction:'save-canvas-v1',operationId:randomUUID(),clientId:'atomic-save-test',sequence:1,generation:workflow.generation,source:'canvas-v2:'+JSON.stringify([workspace,'S']),patches,guards});
 return {control,ctx,command,apply:(cmd,context=ctx)=>processAuthoringAdapter(true).apply(control,cmd,context)};
}
void test('one revision and receipt cover apply plus Save, including the first empty Save',()=>{
 for(const empty of [false,true]){const f=fixture(),cmd=empty?f.command([],[]):f.command(),before=copy(f.control);assert(!processSaveCommand(cmd));assert(!processFlowCommand(cmd));const result=f.apply(cmd);
 assert.equal(result.state.revision,1);assert.equal(result.state.saved.revision,1);assert.equal(result.receipt.savedId,result.state.saved.id);assert.equal(Object.keys(result.state.receipts).length,1);assert.equal(result.state.saves.length,1);assert.deepEqual(copy(result.state.saved.content),copy(result.state.working));assert.deepEqual(copy(f.control),before);}
});
void test('save, edit and view are independently required, and pending/generation/guard failures preserve source',()=>{
 for(const denied of ['save','edit','view']){const f=fixture(),before=copy(f.control);assert.throws(()=>f.apply(f.command(),{...f.ctx,allowed:p=>p!==denied}),/FORBIDDEN/);assert.deepEqual(copy(f.control),before);}
 for(const reason of ['pending','generation','guard']){const f=fixture(),cmd=f.command();if(reason==='pending')f.control.workflow.pendingId='pending';if(reason==='generation')cmd.generation='wrong';if(reason==='guard')cmd.guards[0].value='wrong';const before=copy(f.control);assert.throws(()=>f.apply(cmd),/PENDING_LOCKED|STALE_GENERATION|DEPENDENCY_CHANGED/);assert.deepEqual(copy(f.control),before);}
});
void test('replay is exact, does not create a second save, and rejects changed command/actor',()=>{
 const f=fixture(),cmd=f.command(),first=f.apply(cmd);f.control.workflow=first.state;
 assert.deepEqual(copy(f.apply(cmd).receipt),copy(first.receipt));assert.equal(f.control.workflow.saves.length,1);
 assert.throws(()=>f.apply({...cmd,moduleAction:undefined}),/OPERATION_ID_REUSED/);
 assert.throws(()=>f.apply(cmd,{...f.ctx,actor:{id:'b',name:'B',admin:true}}),/OPERATION_ID_REUSED/);
});
void test('Save retains immutable old saved, effective, cases and receipts; Submit uses the new whole saved snapshot',()=>{
 const f=fixture();const old=applyDraftCommand(f.control.workflow,{...f.command([],[]),action:'save',moduleAction:undefined},f.ctx);f.control.workflow=old.state;const original=copy(old.state),cmd={...f.command(),sequence:2};const next=f.apply(cmd);assert.deepEqual(copy(next.state.saves[0]),copy(original.saved));assert.deepEqual(copy(next.state.active),copy(original.active));assert.deepEqual(copy(next.state.cases),copy(original.cases));assert.deepEqual(copy(next.state.receipts[old.receipt.operationId]),copy(original.receipts[old.receipt.operationId]));
 const submitted=applyDraftCommand(next.state,{action:'submit',reason:'Synthetic submission',operationId:randomUUID(),clientId:'atomic-save-test',sequence:3,generation:next.state.generation,expectedRevision:next.state.revision,savedId:next.state.saved.id},f.ctx);assert.deepEqual(copy(submitted.state.cases[0].content),copy(next.state.saved.content));assert.equal(submitted.state.cases[0].savedId,next.state.saved.id);
});
