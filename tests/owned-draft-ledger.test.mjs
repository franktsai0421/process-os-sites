import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';
const {createSharedDraft,applyDraftCommand}=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({})('lib/shared-draft.ts');
const path=['rows',{id:'row-a'},'name'];
const copy=v=>structuredClone(v);
const memoryStorage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};};
function fixture(recoveryStorage=memoryStorage()){
 let state=createSharedDraft('process:platform',{rows:[{id:'row-a',name:'saved',photo:'original',x:1},{id:'row-c',name:'C'}]},null,'generation-ledger'),number=0,operation=0,view,owner='current',posts=0;
 const receipts=new Map(),sequences=new Map();
 const context={actor:{id:'frank',name:'Frank',admin:true},at:'synthetic',id:()=>`generated-${++number}`,allowed:()=>true,structure:()=>{},validate:()=>[],semantic:v=>v,activeId:null};
 function makeClient(actor='frank',clientId='client-authoring'){
  const prepare=(generation,action,details={})=>{const key=actor+clientId,sequence=(sequences.get(key)||0)+1;sequences.set(key,sequence);return {generation,action,clientId,sequence,operationId:`operation-${++operation}`,...copy(details)};};
  const client={prepare,async sendPrepared(command){posts++;const result=applyDraftCommand(state,command,{...context,actor:{id:actor,name:actor,admin:true}});state=result.state;receipts.set(command.operationId,result.receipt);return {receipt:copy(result.receipt),control:{workflow:copy(state)},permissions:{view:true,edit:true,save:true,delete:true}};},async read(){return {control:{workflow:copy(state)},permissions:{view:true,edit:true,save:true,delete:true}};},async receipt(id){if(!receipts.has(id))throw Object.assign(Error('NOT_FOUND'),{status:404});return {receipt:copy(receipts.get(id))};},async flush(){}};
  return client;
 }
 const client=makeClient(),foreign=makeClient('reviewer','client-foreign'),otherTab=makeClient('frank','client-other-tab');
 const ledger=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage,captureOwner:()=>owner,isOwnerCurrent:value=>owner===value});
 const valueAt=p=>p.reduce((v,k)=>typeof k==='string'?v[k]:v.find(row=>row.id===k.id),state.working);
 const details=(value,p=path)=>({patches:[{op:'set',path:p,value}],guards:[{path:p,value:copy(valueAt(p))}]});
 const adopt=result=>{view=result.control.workflow;ledger.observe(view);return result;};
 async function own(action='apply',detail=details('mine'),transport=client){return adopt(await ledger.command(transport,state.generation,action,detail,()=>view));}
 async function outside(value,p=path,transport=foreign){return transport.sendPrepared(transport.prepare(state.generation,'apply',details(value,p)));}
 const setup=async()=>{await client.sendPrepared(client.prepare(state.generation,'save'));adopt(await client.read());};
 return {client,foreign,otherTab,ledger,recoveryStorage,own,outside,details,adopt,setup,makeClient,context,receipts,get state(){return state;},get view(){return view;},get posts(){return posts;},invalidate(){owner='other';}};
}
void test('actual kernel ledger confirms own commands, reverts exact latest fields and preserves saved/history',async()=>{
 const f=fixture();await f.setup();const before=copy(f.state);await f.own();assert.equal(f.ledger.inspect().state,'dirty');
 const result=await f.ledger.discard(f.client);f.adopt(result);assert.equal(f.state.working.rows[0].name,'saved');assert.equal(f.ledger.inspect().state,'clean');
 assert.deepEqual(copy(f.state.saved),before.saved);assert.deepEqual(copy(f.state.saves),before.saves);assert.deepEqual(copy(f.state.cases),before.cases);
});
void test('checkpoint preserves prior other C work and only reverses this tab A, without Save or history changes',async()=>{
 const f=fixture();await f.setup();await f.outside('other C',['rows',{id:'row-c'},'name']);f.adopt(await f.client.read());
 assert.equal(f.ledger.inspect().ownershipUnknown,true);assert.equal(f.ledger.inspect().canDiscard,false);assert.equal(f.ledger.inspect().canSave,true);
 const before=copy(f.state);await f.own();assert.equal(f.ledger.inspect().canDiscard,true);assert.equal(f.ledger.inspect().priorShared,true);
 f.adopt(await f.ledger.discard(f.client));assert.deepEqual(copy(f.state.working),before.working);assert.deepEqual(copy(f.state.saved),before.saved);assert.deepEqual(copy(f.state.saves),before.saves);
 const status=f.ledger.inspect();assert.equal(status.state,'clean');assert.equal(status.priorShared,true);assert.equal(status.sharedUnsaved,true);assert.match(status.reason,/保留本次編輯前/);
});
void test('same tab authoring and canvas clients share a single contiguous trusted ledger',async()=>{
 const f=fixture();await f.setup();await f.own();await f.own('apply',f.details(12,['rows',{id:'row-a'},'x']),f.makeClient('frank','client-canvas'));
 assert.equal(f.ledger.inspect().ownChanges,2);f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows[0].x,1);assert.equal(f.state.working.rows[0].name,'saved');
});
for(const other of ['foreign','otherTab'])void test('actual kernel blocks '+other+' ABA and posts no inverse',async()=>{
 const f=fixture();await f.setup();await f.own();await f.outside('other',path,f[other]);await f.outside('mine',path,f[other]);const count=f.posts;
 await assert.rejects(f.ledger.discard(f.client),/其他修改|操作紀錄/);assert.equal(f.posts,count);assert.equal(f.state.working.rows[0].name,'mine');assert.equal(f.ledger.inspect().canDiscard,false);
});
void test('unrelated intervening write refuses entire batch, including own later command',async()=>{
 const f=fixture();await f.setup();await f.own();await f.outside('other photo',['rows',{id:'row-a'},'photo']);f.adopt(await f.client.read());await f.own('apply',f.details('latest'));const before=copy(f.state),count=f.posts;
 await assert.rejects(f.ledger.discard(f.client));assert.equal(f.posts,count);assert.deepEqual(copy(f.state),before);
});
void test('own noop and foreign noop do not manufacture an unsafe mutating receipt',async()=>{
 const f=fixture();await f.setup();await f.own();await f.outside('mine');await f.own('apply',f.details('mine'));assert.equal(f.ledger.inspect().ownChanges,1);f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows[0].name,'saved');
});
void test('Save establishes a new successful boundary; Discard preserves saved content and history',async()=>{
 const f=fixture();await f.setup();await f.own();await f.own('save',{});assert.equal(f.ledger.inspect().state,'clean');const saved=copy(f.state.saved),saves=copy(f.state.saves);
 await f.own('apply',f.details('latest'));f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows[0].name,'mine');assert.deepEqual(copy(f.state.saved),saved);assert.deepEqual(copy(f.state.saves),saves);
});
void test('unsupported remove blocks the whole batch without resurrecting tombstones or dropping prior changes',async()=>{
 const f=fixture();await f.setup();await f.own();await f.own('apply',{patches:[{op:'remove',path:['rows',{id:'row-c'}]}],guards:[{path:['rows',{id:'row-c'}],value:copy(f.state.working.rows[1])}]});const before=copy(f.state),count=f.posts;
 assert.equal(f.ledger.inspect().canDiscard,false);assert.equal(f.ledger.inspect().canSave,true);await assert.rejects(f.ledger.discard(f.client));assert.equal(f.posts,count);assert.deepEqual(copy(f.state),before);
});
void test('insert inverse uses normal guarded remove and retains reserved identity',async()=>{
 const f=fixture();await f.setup();const value={id:'row-new',name:'new'};await f.own('apply',{patches:[{op:'insert',path:['rows'],value}],guards:[]});assert.equal(f.ledger.inspect().requiresDelete,true);f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows.length,2);assert.equal(f.state.tombstones.length,1);
 await assert.rejects(f.client.sendPrepared(f.client.prepare(f.state.generation,'apply',{patches:[{op:'insert',path:['rows'],value}],guards:[]})),/ENTITY_ID_RESERVED/);
});
void test('guarded order reverses through actual kernel without touching row content',async()=>{
 const f=fixture();await f.setup();const before=copy(f.state.working.rows);await f.own('apply',{patches:[{op:'order',path:['rows'],ids:['row-c','row-a']}],guards:[{path:['rows'],value:before}]});f.adopt(await f.ledger.discard(f.client));assert.deepEqual(copy(f.state.working.rows),before);
});
void test('ancestor set may not resurrect entity membership through a parent array',async()=>{
 const f=fixture();await f.setup();await f.own('apply',{patches:[{op:'set',path:['rows'],value:[copy(f.state.working.rows[0])]}],guards:[{path:['rows'],value:copy(f.state.working.rows)}]});assert.equal(f.ledger.inspect().canDiscard,false);await assert.rejects(f.ledger.discard(f.client));
});
void test('unknown write resolves original receipt and authoritative model without duplicate POST',async()=>{
 const f=fixture();await f.setup();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};
 await assert.rejects(f.own('apply',f.details('mine'),uncertain),/NETWORK_TIMEOUT/);assert.equal(f.ledger.inspect().canSave,false);assert.equal(f.ledger.inspect().canDiscard,false);const count=f.posts,id=[...f.receipts.keys()].at(-1);
 await f.ledger.resolve(f.client,'receipt',[id,f.state.generation]);assert.equal(f.ledger.inspect().canSave,false);f.adopt(await f.client.read());assert.equal(f.ledger.inspect().state,'dirty');assert.equal(f.posts,count);f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows[0].name,'saved');
});
void test('queued command uses captured immutable payload, not a later caller mutation',async()=>{
 const f=fixture();await f.setup();let release;const gate=new Promise(resolve=>{release=resolve;});const delayed={...f.client,async sendPrepared(c){await gate;return f.client.sendPrepared(c);}};
 const command=f.client.prepare(f.state.generation,'apply',f.details('mine'));const sent=f.ledger.sendPrepared(delayed,command,()=>f.view);command.patches[0].value='tampered';release();f.adopt(await sent);assert.equal(f.state.working.rows[0].name,'mine');f.adopt(await f.ledger.discard(f.client));assert.equal(f.state.working.rows[0].name,'saved');
});
void test('repeated inspect performs no repeated whole-content clone after a confirmed revision',async()=>{
 const f=fixture();await f.setup();await f.own();const original=globalThis.structuredClone;let copies=0;try{globalThis.structuredClone=v=>{copies++;return original(v);};for(let i=0;i<100;i++)assert.equal(f.ledger.inspect(f.view).state,'dirty');assert.equal(copies,0);}finally{globalThis.structuredClone=original;}
});
void test('changed account blocks Save and Discard and preserves acknowledged work',async()=>{
 const f=fixture();await f.setup();await f.own();f.invalidate();assert.equal(f.ledger.inspect().canSave,false);await assert.rejects(f.ledger.discard(f.client),/登入/);assert.equal(f.state.working.rows[0].name,'mine');
});
void test('unknown inverse retains proof/local state and recovers the original receipt without another POST',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};
 await assert.rejects(f.ledger.discard(uncertain),/NETWORK_TIMEOUT/);assert.equal(f.ledger.hasRevertRecovery(),true);assert.equal(f.ledger.inspect().canSave,false);assert.equal(f.ledger.inspect().ownChanges,1);assert.equal(f.view.working.rows[0].name,'mine');const count=f.posts;
 await assert.rejects(f.ledger.discard(f.client));f.adopt(await f.ledger.recoverDiscard(f.client));assert.equal(f.posts,count);assert.equal(f.ledger.hasRevertRecovery(),false);assert.equal(f.ledger.inspect().state,'clean');assert.equal(f.state.working.rows[0].name,'saved');
});
void test('inverse receipt with missing readback keeps input and can recover through a fresh read',async()=>{
 const f=fixture();await f.setup();await f.own();let reads=0;const partial={...f.client,async read(){if(++reads>1)throw Error('READ_TIMEOUT');return f.client.read();},async sendPrepared(command){const r=await f.client.sendPrepared(command);return {receipt:r.receipt};}};
 await assert.rejects(f.ledger.discard(partial),/READ_TIMEOUT/);assert.equal(f.ledger.hasRevertRecovery(),true);assert.equal(f.view.working.rows[0].name,'mine');const count=f.posts;
 f.adopt(await f.ledger.recoverDiscard(f.client));assert.equal(f.posts,count);assert.equal(f.ledger.inspect().state,'clean');
});
void test('missing inverse receipt remains blocked and never automatically retransmits',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(){throw Error('NETWORK_TIMEOUT');}};
 await assert.rejects(f.ledger.discard(uncertain));const count=f.posts;await assert.rejects(f.ledger.recoverDiscard(f.client),/NOT_FOUND/);assert.equal(f.posts,count);assert.equal(f.ledger.hasRevertRecovery(),true);assert.equal(f.ledger.inspect().canSave,false);
});
void test('confirmed inverse followed by foreign work recovers to explicit reconfirmation, never duplicate undo',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};
 await assert.rejects(f.ledger.discard(uncertain));await f.outside('late C',['rows',{id:'row-c'},'name']);const count=f.posts;await assert.rejects(f.ledger.recoverDiscard(f.client),/其他修改|操作紀錄/);
 assert.equal(f.posts,count);assert.equal(f.ledger.hasRevertRecovery(),false);assert.equal(f.ledger.inspect().canDiscard,false);assert.equal(f.ledger.inspect().canSave,true);assert.equal(f.state.working.rows[0].name,'saved');assert.equal(f.state.working.rows[1].name,'late C');
});
void test('definite inverse rejection keeps ledger retryable and never clears the saved baseline',async()=>{
 const f=fixture();await f.setup();await f.own();const denied={...f.client,async sendPrepared(){throw Object.assign(Error('FORBIDDEN'),{status:403});}};
 await assert.rejects(f.ledger.discard(denied),/FORBIDDEN/);assert.equal(f.ledger.hasRevertRecovery(),false);assert.equal(f.ledger.inspect().ownChanges,1);assert.equal(f.state.working.rows[0].name,'mine');f.adopt(await f.ledger.discard(f.client));assert.equal(f.ledger.inspect().state,'clean');
});
void test('background read cannot release unresolved inverse outcome or permit a new Save',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};await assert.rejects(f.ledger.discard(uncertain));f.adopt(await f.client.read());assert.equal(f.ledger.inspect().canSave,false);assert.equal(f.ledger.hasRevertRecovery(),true);f.adopt(await f.ledger.recoverDiscard(f.client));assert.equal(f.ledger.inspect().state,'clean');
});
void test('rejected retry admission cannot erase a prior unknown command',async()=>{
 const f=fixture();await f.setup();const command=f.client.prepare(f.state.generation,'apply',f.details('mine'));const uncertain={...f.client,async sendPrepared(){throw Error('NETWORK_TIMEOUT');}};await assert.rejects(f.ledger.sendPrepared(uncertain,command,()=>f.view));const notSent={...f.client,sendPrepared(){throw Error('ADMISSION_REJECTED');}};await assert.rejects(f.ledger.sendPrepared(notSent,command,()=>f.view),/ADMISSION_REJECTED/);assert.equal(f.ledger.inspect().canSave,false);assert.equal(f.ledger.inspect().canDiscard,false);await assert.rejects(f.ledger.settle());
});

void test('inverse recovery marker contains metadata only and reload forbids generic retry before transport',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};await assert.rejects(f.ledger.discard(uncertain));
 const marker=JSON.parse([...f.recoveryStorage.data.values()][0]);assert.deepEqual(Object.keys(marker).sort(),['actorId','beforeRevision','clientId','generation','operationId','savedId','schema','scope'].sort());assert.equal(marker.actorId,'frank');
 const reloaded=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage:f.recoveryStorage});reloaded.observe(f.view);assert(reloaded.hasRevertRecovery());assert.equal(reloaded.inspect().canSave,false);let retries=0;const c={...f.client,async retryUnknown(){retries++;}};
 await assert.rejects(reloaded.resolve(c,'retryUnknown'));assert.equal(retries,0);const count=f.posts,result=await reloaded.recoverDiscard(c);assert.equal(result.ownedRevertNeedsReview,true);assert.match(result.ownedRevertReviewReason,/重新載入/);assert.equal(f.posts,count);assert.equal(reloaded.inspect().canDiscard,false);assert.equal(reloaded.inspect().canSave,true);assert.equal(f.recoveryStorage.data.size,0);assert.equal(f.view.working.rows[0].name,'mine');
});
void test('marker persistence failure never sends inverse or clears original acknowledged work',async()=>{
 const storage=memoryStorage(),f=fixture(storage);await f.setup();await f.own();storage.setItem=()=>{throw Error('QUOTA');};const count=f.posts;await assert.rejects(f.ledger.discard(f.client),/尚未送出任何放棄/);assert.equal(f.posts,count);assert.equal(f.state.working.rows[0].name,'mine');assert.equal(f.ledger.inspect().canSave,true);assert.equal(f.ledger.inspect().canDiscard,false);
});
void test('corrupt marker blocks recovery/retry and mutation without invoking transport',async()=>{
 const storage=memoryStorage();storage.setItem('process-owned-revert-v1:'+JSON.stringify(['frank','process:platform']),'{broken');const ledger=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage:storage});let sent=0;const c={async retryUnknown(){sent++;},async receipt(){sent++;},sendPrepared(){sent++;}};
 assert(ledger.hasRevertRecovery());await assert.rejects(ledger.resolve(c,'retryUnknown'),/安全離頁紀錄/);await assert.rejects(ledger.recoverDiscard(c),/安全離頁紀錄/);await assert.rejects(ledger.sendPrepared(c,{}));assert.equal(sent,0);assert.equal(ledger.inspect().canSave,false);
});
void test('reload missing inverse receipt retains marker and blocks all retransmission paths',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(){throw Error('NETWORK_TIMEOUT');}};await assert.rejects(f.ledger.discard(uncertain));const ledger=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage:f.recoveryStorage}),count=f.posts;
 await assert.rejects(ledger.recoverDiscard(f.client),/NOT_FOUND/);await assert.rejects(ledger.resolve(f.client,'retryUnknown'));await assert.rejects(ledger.command(f.client,f.state.generation,'save',{}));assert.equal(f.posts,count);assert(ledger.hasRevertRecovery());assert.equal(f.recoveryStorage.data.size,1);
});
void test('marker cannot clear while the transport still retains any unmatched unknown operation',async()=>{
 const f=fixture();await f.setup();await f.own();const uncertain={...f.client,async sendPrepared(command){await f.client.sendPrepared(command);throw Error('NETWORK_TIMEOUT');}};await assert.rejects(f.ledger.discard(uncertain));const raw={...f.client,hasUnknown:()=>true};await assert.rejects(f.ledger.recoverDiscard(raw));assert(f.ledger.hasRevertRecovery());assert.equal(f.recoveryStorage.data.size,1);assert.equal(f.ledger.inspect().canSave,false);
});
