import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/process/iqc-master.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const clone=structuredClone;
const receipt={operationId:'original-begin',generation:'original',revision:0,savedId:null,caseId:null,unchanged:false};
function fixture({generation='original',lose=false}={}){
 let actor={id:'editor'},unknown=false,begins=0;const commands=[];
 const base={items:[{id:'i',name:'base'}]},snapshot={items:[{id:'i',name:'local'}]};
 const control=()=>({versions:[{id:'draft',status:'draft'}],workflow:{generation,revision:1,working:{items:[{id:'i',name:'peer'}]}}});
 const begun=()=>({control:control(),revision:2,receipt:clone(receipt)});
 const client={hasUnknown:()=>unknown,hasUnknownBegin:()=>unknown,begin:async()=>{begins++;if(lose){unknown=true;throw Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY');}return begun();},flush:async()=>{},command:async(g,a,d)=>{commands.push({generation:g,action:a,detail:clone(d)});return {receipt:{operationId:'save'}};},verifiedReadback:()=>({control:control(),revision:3}),resolveUnknown:async()=>{unknown=false;return begun();}};
 const c={console,readDenied:null,revision:1,ui:{busy:false},document:{querySelector:()=>null},identity:()=>actor,ProcessSync:{identityGeneration:()=>1},mountSequence:1,mutationSequence:0,loadSequence:0,versionReadSequence:0,activeDeferredId:'',localBase:base,localSnapshot:snapshot,localGeneration:null,localBeginReceipt:null,pendingLocalSave:false,dialogBase:null,dialogGeneration:null,dialogBeginReceipt:null,control:{versions:[{id:'legacy',status:'draft'}]},transport:()=>client,sharedClient:client,mayEdit:()=>true,validateIqcPayload(){},copy:clone,render(){},draft:()=>c.control.versions[0],notice(){},t:x=>x,snapshotChanges:(b,s)=>({patches:[{base:clone(b),value:clone(s)}]}),dispatchEvent(){},CustomEvent:class{},load:async()=>{c.control=control();c.revision=2;}};c.window=c;c.host=c;
 vm.createContext(c);vm.runInContext(section('  async function saveSnapshot(','  async function withDraft(')+section('  async function post(','  function versionBar()')+section('  let operationCheck=null;','  function renderReadDenied()'),c);
 return {c,client,base,snapshot,commands,begins:()=>begins,rotate(){actor={id:'other'};},setGeneration(value){generation=value;}};
}
void test('IQC initial local Save rejects receipt/readback generation mismatch; repeated Save and fresh reads keep original pin',async()=>{
 const f=fixture({generation:'replacement'});
 await assert.rejects(f.c.post('save'),/STALE_GENERATION/);
 assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);assert.notEqual(f.c.localBeginReceipt,receipt);assert.equal(f.c.localBase,f.base);assert.equal(f.c.localSnapshot,f.snapshot);assert.equal(f.client.hasUnknown(),false,'confirmed Begin is not disguised as unknown');
 await f.c.load();await f.c.load();await assert.rejects(f.c.post('save'),/STALE_GENERATION/);
 assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);assert.equal(f.c.localBase,f.base);assert.equal(f.c.localSnapshot,f.snapshot);
});
void test('IQC same-generation initial local Save sends original baseline once and clears local pin only on verified Save',async()=>{
 const f=fixture();await f.c.post('save');assert.equal(f.begins(),1);assert.equal(f.commands.length,1);assert.equal(f.commands[0].generation,'original');assert.equal(f.commands[0].detail.moduleAction,'save-local-v1');assert.deepEqual(f.commands[0].detail.patches[0],{base:f.base,value:f.snapshot});assert.equal(f.c.localSnapshot,null);assert.equal(f.c.localBase,null);assert.equal(f.c.localGeneration,null);assert.equal(f.c.localBeginReceipt,null);
});
void test('IQC unknown Begin cannot resend on repeated Save; GET recovery pins original receipt through replacement read',async()=>{
 const f=fixture({lose:true,generation:'replacement'});await assert.rejects(f.c.post('save'),/RESULT_UNKNOWN/);await assert.rejects(f.c.post('save'),/PREVIOUS_OPERATION_UNKNOWN/);assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.localSnapshot,f.snapshot);assert.equal(f.c.localBase,f.base);
 await f.c.checkOperation();assert.equal(f.client.hasUnknown(),false);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);await assert.rejects(f.c.post('save'),/STALE_GENERATION/);assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.localSnapshot,f.snapshot);assert.equal(f.c.localBase,f.base);
});
void test('IQC late Begin for replaced identity cannot adopt control or attach receipt to local edits',async()=>{
 const f=fixture(),old=f.c.control;let release;f.client.begin=()=>new Promise(resolve=>{release=resolve;});const saving=f.c.post('save');f.rotate();release({control:{versions:[],workflow:{generation:'replacement'}},revision:2,receipt});await assert.rejects(saving,/IDENTITY_CHANGED/);assert.equal(f.c.control,old);assert.equal(f.c.localGeneration,null);assert.equal(f.c.localBeginReceipt,null);assert.equal(f.c.localSnapshot,f.snapshot);assert.equal(f.commands.length,0);
});
void test('IQC recovered Begin pins open form owner and dialog baseline to original generation',async()=>{
 const f=fixture({lose:true,generation:'replacement'});f.c.localSnapshot=null;f.c.localBase=null;f.c.dialogBase={items:['original form base']};const owner={assert(){},current:()=>true};await assert.rejects(f.c.post('begin',{},owner),/RESULT_UNKNOWN/);await f.c.checkOperation(owner);assert.equal(owner.generation,'original');assert.deepEqual(owner.beginReceipt,receipt);assert.equal(f.c.dialogGeneration,'original');assert.equal(f.c.localBeginReceipt,null);assert.deepEqual(f.c.dialogBase,{items:['original form base']});assert.equal(f.commands.length,0);assert.equal(f.begins(),1);const local={items:['retained form edit']};owner.base=f.c.dialogBase;await f.c.saveSnapshot(local,'',owner);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);await assert.rejects(f.c.post('save'),/STALE_GENERATION/);assert.deepEqual(f.c.localSnapshot,local);assert.equal(f.commands.length,0);assert.equal(f.begins(),1);
});
void test('IQC confirmed Begin receipt plus failed state read cannot start another Begin on Save retry',async()=>{
 const f=fixture({lose:true});await assert.rejects(f.c.post('save'),/RESULT_UNKNOWN/);f.c.load=async()=>{throw Error('STATE_READ_FAILED');};await assert.rejects(f.c.checkOperation(),/STATE_READ_FAILED/);assert.equal(f.client.hasUnknown(),false);assert.equal(f.c.control.workflow,undefined);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);
 for(let i=0;i<2;i++)await assert.rejects(f.c.post('save'),/AUTHORITATIVE_READBACK_REQUIRED/);
 assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.localSnapshot,f.snapshot);assert.equal(f.c.localBase,f.base);
});
void test('IQC page-level receipt lookup carries dialog receipt into later local Apply without rebasing',async()=>{
 const f=fixture({lose:true,generation:'replacement'});f.c.localSnapshot=null;f.c.localBase=null;f.c.dialogBase={items:['old dialog']};await assert.rejects(f.c.post('begin'),/RESULT_UNKNOWN/);await f.c.checkOperation();assert.deepEqual(f.c.dialogBeginReceipt,receipt);const next={items:['unsent form']};await f.c.saveSnapshot(next);assert.equal(f.c.localGeneration,'original');assert.deepEqual(f.c.localBeginReceipt,receipt);await assert.rejects(f.c.post('save'),/STALE_GENERATION/);assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.deepEqual(f.c.localSnapshot,next);
});
for(const action of ['createError','createItem'])void test(`IQC dialog-only confirmed Begin blocks repeated ${action} after page-level recovery read fails`,async()=>{
 const f=fixture({lose:true});f.c.localSnapshot=null;f.c.localBase=null;const base={items:['old form baseline']};f.c.dialogBase=base;const owner={assert(){},current:()=>true,base};await assert.rejects(f.c.post(action,{},owner),/RESULT_UNKNOWN/);f.c.load=async()=>{throw Error('STATE_READ_FAILED');};await assert.rejects(f.c.checkOperation(),/STATE_READ_FAILED/);
 assert.equal(f.client.hasUnknown(),false);assert.equal(f.c.control.workflow,undefined);assert.equal(f.c.localBeginReceipt,null);assert.equal(owner.beginReceipt,undefined);assert.deepEqual(f.c.dialogBeginReceipt,receipt);assert.equal(f.c.dialogGeneration,'original');
 for(let i=0;i<2;i++)await assert.rejects(f.c.post(action,{},owner),/AUTHORITATIVE_READBACK_REQUIRED/);
 assert.equal(f.begins(),1);assert.equal(f.commands.length,0);assert.equal(f.c.dialogBase,base);assert.equal(owner.base,base);assert.deepEqual(f.c.dialogBeginReceipt,receipt);
});
