// Actual FQC functions + synthetic DOM/transport ports. No server or business data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const source=fs.readFileSync(new URL('../public/process/fqc-master.js',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const cut=(s,a,b)=>{const begin=s.indexOf(a),end=s.indexOf(b,begin+a.length);assert(begin>=0&&end>begin,`Missing actual source: ${a}`);return s.slice(begin,end);};
const clone=v=>JSON.parse(JSON.stringify(v));
const recoverySource=fs.readFileSync(new URL('../public/process/local-draft-recovery.js',import.meta.url),'utf8');
const sessionSource=fs.readFileSync(new URL('../public/process/local-draft-recovery-session.js',import.meta.url),'utf8');
const heldLocks=new Set();
const locks={request:async(name,_options,callback)=>{if(heldLocks.has(name))return callback(null);heldLocks.add(name);try{return await callback({name});}finally{heldLocks.delete(name);}}};
async function fixture({mode='ok',size=100,records=new Map(),actorId='A',generation='gen1',epoch:initialEpoch=1,writeFail=false,lockSupported=true}={}){
 const {document}=canvasDOM(),area=document.createElement('section');document.body.append(area);document.documentElement.lang='zh';
 const products=Array.from({length:size},(_,i)=>({code:'P'+i,name:'Synthetic '+i,kind:'product',specification:''}));
 const item={id:'I1',checkNo:'FQC-01',name:'Synthetic',category:'A',productCodes:[],productRefs:[],products:[]};
 const flow={generation,revision:3,pendingId:null,working:{errors:[],items:[clone(item)]},saved:{id:'save1',at:'2026-10-30T00:00:00Z',actor:{name:'Synthetic editor'},content:{errors:[],items:[clone(item)]}}};
 const version={id:'draft1',status:'draft',snapshot:clone(flow.working)},library={workflow:flow,versions:[version]};
 let actor={id:actorId},epoch=initialEpoch,poll=null,unknown=false,sequence=0,deferred=null,receipt=null,confirmAction=async()=> 'reason';
 let remoteRevision=3;const remote=clone(flow.working),events=new Map();
 const stats={posts:0,reads:0,stateReads:0,writes:0,renders:0,adopts:0,commands:[],notices:[],statuses:[],syncStatuses:[]};
 const store={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:key=>records.get(key)??null,setItem:(key,value)=>{stats.writes++;if(writeFail&&key.startsWith('process-local-draft-'))throw Object.assign(Error('synthetic quota'),{name:'QuotaExceededError'});records.set(key,String(value));},removeItem:key=>records.delete(key)};
 const client={permission:()=>true,rejectionCapability:()=>null,isConfirmedRejection:()=>false,hasUnknown:()=>unknown,canPoll:()=>true,flush:async()=>{},prepareRecovery:(generation,detail)=>({...detail,generation,action:'apply',operationId:'operation-'+(++sequence)}),
  sendPrepared:async(cmd,options)=>{assert.equal(options.assertDispatch(cmd),true);stats.posts++;stats.commands.push(clone(cmd));for(const guard of cmd.guards){const row=remote.items.find(x=>x.id===guard.path[1].id);if(JSON.stringify(row?.[guard.path[2]])!==JSON.stringify(guard.value))throw Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'),{status:409,requestId:'fbd95cef-43d9-4229-a623-c8e0ab785db1',details:{path:clone(guard.path)}});}for(const patch of cmd.patches)remote.items.find(x=>x.id===patch.path[1].id)[patch.path[2]]=clone(patch.value);remoteRevision++;
   receipt={operationId:cmd.operationId,generation:cmd.generation,revision:remoteRevision,savedId:'save1',caseId:null,unchanged:false};
   if(mode==='wait'){unknown=true;return new Promise(resolve=>{deferred=()=>{unknown=false;resolve({receipt});};});}if(mode==='unknown'){unknown=true;throw Error('RESULT_UNKNOWN_CHECK_BEFORE_RETRY');}return{receipt};},
  resolveUnknown:async()=>{stats.reads++;if(mode==='unknown')throw Object.assign(Error('OPERATION_NOT_FOUND'),{status:404});unknown=false;return{receipt};},
  receipt:async(id,gen)=>{stats.reads++;if(mode==='unknown')throw Object.assign(Error('OPERATION_NOT_FOUND'),{status:404});if(receipt?.operationId!==id||receipt?.generation!==gen)throw Error('RECEIPT_NOT_FOUND');unknown=false;return{receipt};},
  command:async (generation,action,detail)=>{stats.posts++;stats.commands.push({generation,action,...detail});return{};},
  read:async()=>{stats.stateReads++;return{permissions:{view:client.permission('view')===true,edit:client.permission('edit')===true},control:{...clone(library),workflow:{...library.workflow,revision:remoteRevision,working:clone(remote)},versions:library.versions.map(v=>({...v,snapshot:clone(remote)}))}};}};
 const box={console,Map,Set,JSON,Error,Object,Array,Number,String,TextEncoder,Uint8Array,setTimeout,clearTimeout,sessionStorage:store,localStorage:store,CustomEvent:class{constructor(type){this.type=type;}},document,ui:{saving:false},hostElement:area,sharedClient:client,activeSharedAction:null,pendingCommandFeedback:null,
  clone,h:String,isVi:()=>document.documentElement.lang==='vi',identity:()=>actor,editable:()=>library.versions[0],library:()=>library,transport:()=>client,canEditDraft:()=>client.permission('edit')===true,
  currentReadOwner:()=>{const original=actor,e=epoch;return()=>actor===original&&epoch===e;},catalog:()=>({products,productMap:new Map(products.map(p=>[p.code,p]))}),
  adopt:r=>{stats.adopts++;if(r.control)Object.assign(library,r.control);},render:()=>stats.renders++,toast:m=>stats.notices.push(m),displayDraftError:e=>e?.message||e,
  workspaceReady:()=>true,sharedPoll:{capture:()=>1,isCurrent:()=>true,schedule:fn=>{poll=fn;},cancel(){}},
  window:{crypto:webcrypto,setTimeout,clearTimeout,localStorage:store,sessionStorage:store,navigator:lockSupported?{locks}:{},confirm:()=>true,
   addEventListener(name,callback){const list=events.get(name)||[];list.push(callback);events.set(name,list);},removeEventListener(name,callback){events.set(name,(events.get(name)||[]).filter(fn=>fn!==callback));},ProcessSync:{identityGeneration:()=>epoch},dispatchEvent(){},VersionDraftUI:{updateSync:(_root,busy,failed,dirty)=>stats.syncStatuses.push({busy,failed,dirty}),updateSaved:(_root,_flow,dirty)=>stats.statuses.push(dirty),reasonFor:()=>'',confirmSubmit:(...args)=>confirmAction(...args)}}};
 vm.createContext(box);vm.runInContext(recoverySource,box);vm.runInContext(sessionSource,box);
 vm.runInContext(cut(shared,'  window.captureSharedDraftSubmission=','  // Begin alone'),box);
 vm.runInContext(cut(source,'  // Matrix choices stay private','  const commandFeedbackPending=')+cut(source,'  async function loadShared(','  function changes(')+cut(source,'  function pollShared()','  const ui =')+cut(source,'  async function submitDraft()','  async function withdrawDraft()')+cut(source,'  function matrixHTML(','  function bindEvents()')+'\nthis.api={toggleMatrixChoice,applyMatrixChoices,discardMatrixChoices,reconcileMatrixChoices,matrixDirty,matrixToolbarHTML,paintMatrixActions,matrixHTML,pollShared,submitDraft,assertNoUnapplied,persistMatrixChoices,restoreMatrixChoices,restoreMatrixRecord,discardMatrixRecord,resolveMatrixRecord,openMatrixRecovery,session:()=>matrixRecoverySession,recoveryState:()=>({ready:matrixRecoveryReady,blocked:matrixRecoveryBlocked,note:matrixRecoveryNote,error:matrixRecoveryError,tab:matrixRecoverySession?.runtimeId}),getBatch:()=>matrixBatch};',box);
 vm.runInContext(cut(source,'  async function sharedAction(','  function pollShared()')+'this.actualSharedAction=sharedAction;',box);
 box.sharedAction=async(action,detail)=>{box.api.assertNoUnapplied();stats.posts++;stats.commands.push({action,...detail});};
 box.itemRows=v=>v.snapshot.items;box.ui.search='';
 box.api.restoreMatrixChoices();await box.api.session()?.ready;await Promise.resolve();
 const paint=()=>{area.innerHTML=box.api.matrixToolbarHTML()+box.api.matrixHTML(library.versions[0],'A',products,true);box.api.paintMatrixActions();};paint();
 const button=i=>area.querySelector(`[data-matrix-product="P${i}"]`);
 return{api:box.api,box,stats,version,library,products,area,document,client,paint,button,remote,records,store,emit:name=>events.get(name)?.slice().forEach(callback=>callback()),writeFail:value=>{writeFail=value;},
  changeMode:value=>{mode=value;},actor:value=>{actor={id:value};},epoch:()=>epoch++,resolve:()=>deferred(),poll:()=>poll(),confirm:fn=>{confirmAction=fn;},flow:()=>library.workflow,remoteRevision:value=>{remoteRevision=value;}};
}

void test('100 matrix clicks send zero commands, preserve source and avoid full redraw',async()=>{
 const f=await fixture(),before=JSON.stringify(f.version);for(let i=0;i<100;i++)f.api.toggleMatrixChoice(f.button(i));
 assert.equal(f.stats.posts,0);assert.equal(f.stats.renders,0);assert.equal(f.api.getBatch().count,100);assert.equal(JSON.stringify(f.version),before);assert.match(f.area.querySelector('#fqc-matrix-count').textContent,/100/);
 f.api.toggleMatrixChoice(f.button(0));assert.equal(f.api.getBatch().count,99);assert.equal(f.button(0).getAttribute('aria-pressed'),'false');
});
void test('one explicit Apply sends all choices with original guards, then clears only acknowledged batch',async()=>{
 const f=await fixture();for(const i of [1,3,5])f.api.toggleMatrixChoice(f.button(i));await f.api.applyMatrixChoices();
 assert.equal(f.stats.posts,1);assert.equal(f.stats.commands[0].action,'apply');assert.deepEqual(f.remote.items[0].productCodes,['P1','P3','P5']);assert(f.stats.commands[0].guards.every(g=>Array.isArray(g.value)&&g.value.length===0));assert.equal(f.api.matrixDirty(),false);
});
void test('remote same-field conflict retains every choice and original guards',async()=>{
 const f=await fixture();for(const i of [2,4])f.api.toggleMatrixChoice(f.button(i));f.remote.items[0].productCodes=['P8'];await f.api.applyMatrixChoices();
 assert.equal(f.api.getBatch().count,2);assert.deepEqual([...f.api.getBatch().rows.get('I1').codes],['P2','P4']);assert.equal(f.stats.adopts,0);assert.match(f.api.getBatch().error,/DEPENDENCY_CHANGED/);assert.deepEqual(f.remote.items[0].productCodes,['P8']);
});
void test('Apply retains existing product reference snapshots when upstream catalogue name/spec changed',async()=>{
 const f=await fixture(),oldRef={code:'P0',kind:'product',name:'Original name',specification:'Original spec',custom:'retained'},oldLegacy={...oldRef,name:'Legacy snapshot'};
 Object.assign(f.version.snapshot.items[0],{productCodes:['P0'],productRefs:[clone(oldRef)],products:[clone(oldLegacy)]});Object.assign(f.remote.items[0],clone(f.version.snapshot.items[0]));f.products[0].name='Upstream renamed';f.products[0].specification='Upstream changed spec';f.products[1].name='New selection current name';
 f.api.toggleMatrixChoice(f.button(1));await f.api.applyMatrixChoices();assert.equal(f.stats.posts,1);assert.deepEqual(f.remote.items[0].productRefs[0],oldRef);assert.deepEqual(f.remote.items[0].products[0],oldLegacy);assert.equal(f.remote.items[0].productRefs[1].name,'New selection current name');
});
void test('unknown Apply queries original receipt without another POST or new operation ID',async()=>{
 const f=await fixture({mode:'unknown'});f.api.toggleMatrixChoice(f.button(1));await f.api.applyMatrixChoices();const id=f.api.getBatch().pending.operationId;
 await f.api.applyMatrixChoices();f.api.discardMatrixChoices();assert.equal(f.stats.posts,1);assert.equal(f.stats.reads,1);assert.equal(f.api.getBatch().pending.operationId,id);assert.equal(f.api.getBatch().count,1);
 f.changeMode('ok');await f.api.applyMatrixChoices();assert.equal(f.stats.posts,1);assert.equal(f.stats.reads,2);assert.equal(f.api.matrixDirty(),false);
});

void test('known pending Apply can still query its receipt after edit is revoked',async()=>{
 const f=await fixture({mode:'unknown'});f.api.toggleMatrixChoice(f.button(1));await f.api.applyMatrixChoices();f.client.permission=permission=>permission!=='edit';f.changeMode('ok');await f.api.applyMatrixChoices();assert.equal(f.stats.posts,1);assert.equal(f.stats.reads,1);assert.equal(f.api.matrixDirty(),false);
});
void test('poll, search, language and independent repaint retain local matrix batch',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(7));f.api.pollShared();await f.poll();assert.equal(f.stats.adopts,0);
 f.box.ui.search='P7';f.document.documentElement.lang='vi';f.paint();assert.equal(f.button(7).textContent,'✓');assert.equal(f.api.getBatch().count,1);assert.match(f.area.querySelector('#fqc-matrix-apply').textContent,/Áp dụng/);
 f.box.ui.search='';f.document.documentElement.lang='zh';f.paint();assert.equal(f.button(7).textContent,'✓');assert.equal(f.stats.posts,0);
});
void test('dirty matrix blocks Save/Submit; ordinary discard never writes',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));assert.throws(()=>f.api.assertNoUnapplied(),/套用或放棄/);await f.api.submitDraft();assert.equal(f.stats.posts,0);
 await assert.rejects(f.box.actualSharedAction('save'),/套用或放棄/);assert.equal(f.stats.posts,0);
 f.api.discardMatrixChoices();assert.equal(f.api.matrixDirty(),false);assert.equal(f.stats.posts,0);
});
void test('unapplied form blocks Submit before confirmation and sends no command',async()=>{
 const f=await fixture(),form=f.document.createElement('div');form.className='fqc-modal-overlay';f.document.body.append(form);let prompts=0;f.confirm(async()=>{prompts++;return'reason';});await f.api.submitDraft();assert.equal(prompts,0);assert.equal(f.stats.posts,0);assert.equal(form.isConnected,true);
});
void test('actor change during Apply cannot publish ACK or clear private batch into the new actor',async()=>{
 const f=await fixture({mode:'wait'});f.api.toggleMatrixChoice(f.button(1));const pending=f.api.applyMatrixChoices();f.actor('B');f.resolve();await pending;assert.equal(f.stats.adopts,0);assert.equal(f.api.matrixDirty(),false);assert.equal(f.api.getBatch().count,1);
});
void test('revoked edit cannot send queued matrix choices',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(1));f.client.permission=()=>false;await f.api.applyMatrixChoices();assert.equal(f.stats.posts,0);assert.equal(f.api.getBatch().count,1);assert.match(f.api.getBatch().error,/FORBIDDEN/);
});
void test('Submit pins revision before confirmation and never substitutes latest revision',async()=>{
 const f=await fixture();f.confirm(async()=>{f.library.workflow.revision++;return'reason';});await f.api.submitDraft();
 assert.equal(f.stats.posts,0);assert.match(f.stats.notices.at(-1),/DRAFT_REVISION_CHANGED_RECONFIRM/);
});
void test('Submit owner and generation changes invalidate the pending confirmation',async()=>{
 for(const change of [f=>f.actor('B'),f=>f.epoch(),f=>{f.library.workflow.generation='gen2';}]){const f=await fixture();f.confirm(async()=>{change(f);return'reason';});await f.api.submitDraft();assert.equal(f.stats.posts,0);}
});
void test('successful Submit includes captured savedId, revision and generation',async()=>{
 const f=await fixture();f.confirm(async(_reason,_scope,options)=>{assert.deepEqual(clone(options.savedVersion),{id:'save1',revision:3,at:'2026-10-30T00:00:00Z',actor:'Synthetic editor'});return'reason';});await f.api.submitDraft();assert.equal(f.stats.posts,1);assert.deepEqual(f.stats.commands[0],{action:'submit',savedId:'save1',expectedRevision:3,generation:'gen1',reason:'reason'});
});

void test('reload never hydrates; explicit claimed restore uses two GET and zero POST',async()=>{
 const first=await fixture();first.api.toggleMatrixChoice(first.button(2));first.emit('beforeunload');const key=first.api.session().key,original=first.records.get(key);first.emit('pagehide');
 const second=await fixture({records:first.records});assert.equal(second.api.getBatch(),null);assert.equal(second.button(2).getAttribute('aria-pressed'),'false');assert.equal(second.stats.stateReads,0);
 await second.api.restoreMatrixRecord(key,async()=>true);assert.equal(second.stats.stateReads,2);assert.equal(second.stats.posts,0);assert.equal(second.api.getBatch().count,1);assert.equal(second.button(2).getAttribute('aria-pressed'),'true');assert.equal(second.records.get(key),original);
 await second.api.applyMatrixChoices();assert.equal(second.stats.posts,1);assert.equal(second.api.matrixDirty(),false);assert.equal(second.records.has(second.api.session().key),false);assert.equal(second.records.get(key),original);
});
void test('actor isolation and generation/base conflict retain the original record',async()=>{
 const first=await fixture();first.api.toggleMatrixChoice(first.button(2));first.api.persistMatrixChoices();const key=first.api.session().key,original=first.records.get(key);first.emit('pagehide');
 const other=await fixture({records:first.records,actorId:'B'});assert.equal(other.api.session().discover().items.length,0);assert.equal(other.api.session().preview(key).payload,undefined);
 const changed=await fixture({records:first.records,generation:'gen2'});await assert.rejects(changed.api.restoreMatrixRecord(key,async()=>true),/BASE_CONFLICT/);assert.equal(changed.api.getBatch(),null);assert.equal(changed.stats.posts,0);assert.equal(changed.records.get(key),original);
});
void test('live source runtime cannot be claimed by a second same-account tab',async()=>{
 const first=await fixture({mode:'unknown'});first.api.toggleMatrixChoice(first.button(2));await first.api.applyMatrixChoices();const id=first.api.getBatch().pending.operationId,key=first.api.session().key;
 const copied=await fixture({records:first.records});assert.equal(copied.api.getBatch(),null);const claim=await copied.api.session().claim(key);assert.equal(claim.code,'RECOVERY_IN_USE');assert.equal(copied.stats.posts,0);assert.equal(first.api.getBatch().pending.operationId,id);
 copied.api.toggleMatrixChoice(copied.button(4));copied.api.persistMatrixChoices();assert.equal(copied.api.getBatch().pending,null);assert.equal(first.api.getBatch().count,1);assert.notEqual(copied.api.session().key,key);
});
void test('corrupt recovery stays byte-for-byte and never becomes editable input',async()=>{
 const first=await fixture();first.api.toggleMatrixChoice(first.button(2));first.api.persistMatrixChoices();const key=first.api.session().key;first.records.set(key,'{corrupt');first.emit('pagehide');
 const second=await fixture({records:first.records});assert.equal(second.api.getBatch(),null);await assert.rejects(second.api.restoreMatrixRecord(key,async()=>true),/CORRUPT_RECORD/);assert.equal(second.records.get(key),'{corrupt');assert.equal(second.stats.posts,0);
 assert.equal(second.api.session().discover().items.find(row=>row.key===key).issue,undefined,'inventory never reads payload to classify corruption');
});
void test('quota failure retains input, reports recovery failure and stops Apply before POST',async()=>{
 const f=await fixture({writeFail:true});f.api.toggleMatrixChoice(f.button(3));assert.equal(f.api.persistMatrixChoices(),false);await f.api.applyMatrixChoices();assert.equal(f.stats.posts,0);assert.equal(f.api.getBatch().count,1);assert.equal(f.api.getBatch().pending,null);assert.match(f.api.getBatch().storageError,/存檔失敗/);
 f.writeFail(false);await f.api.applyMatrixChoices();assert.equal(f.stats.posts,1);assert.equal(f.api.matrixDirty(),false);
});
void test('reloaded unknown is receipt-only; 404 retains it and a terminal receipt plus readback settles without POST',async()=>{
 const first=await fixture({mode:'unknown'});first.api.toggleMatrixChoice(first.button(2));await first.api.applyMatrixChoices();const id=first.api.getBatch().pending.operationId,key=first.api.session().key,raw=first.records.get(key);first.emit('pagehide');
 const second=await fixture({records:first.records});assert.equal(second.api.getBatch(),null);second.client.receipt=async(operationId,generation)=>{second.stats.reads++;assert.equal(operationId,id);assert.equal(generation,'gen1');throw Object.assign(Error('OPERATION_NOT_FOUND'),{status:404});};
 await assert.rejects(second.api.resolveMatrixRecord(key),/OPERATION_NOT_FOUND/);assert.equal(second.stats.posts,0);assert.equal(second.stats.reads,1);assert.equal(second.records.get(key),raw);assert.equal(second.api.session().preview(key).payload,undefined);
 second.client.receipt=async operationId=>({receipt:{operationId,generation:'gen1',revision:4,savedId:'save1',caseId:null,unchanged:false}});second.remoteRevision(4);await second.api.resolveMatrixRecord(key);assert.equal(second.stats.posts,0);assert.equal(second.records.has(key),false);
});

function reconciliationResult(f,revision=4){const control=clone(f.library);control.workflow.revision=revision;control.workflow.working=clone(f.remote);control.versions[0].snapshot=clone(f.remote);return{control,permissions:{view:true,edit:true}};}
void test('explicit reconciliation shows three values, keeps other actor choices, and never applies automatically',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));f.remote.items[0].productCodes=['P8'];await f.api.applyMatrixChoices();assert.equal(f.api.getBatch().count,1);
 f.client.read=async()=>reconciliationResult(f);const checking=f.api.reconcileMatrixChoices();await new Promise(setImmediate);
 const overlay=f.document.querySelector('.fqc-modal-overlay');assert(overlay,f.api.getBatch().error);assert.match(overlay.textContent,/原值/);assert.match(overlay.textContent,/共享最新/);assert.match(overlay.textContent,/我的選擇/);assert.match(overlay.textContent,/P8/);assert.match(overlay.textContent,/P2/);
 overlay.querySelector('[data-matrix-review-confirm]').click();await checking;assert.equal(f.stats.posts,1,'only original rejected Apply');assert.deepEqual([...f.api.getBatch().rows.get('I1').codes],['P8','P2']);assert.deepEqual(clone(f.api.getBatch().rows.get('I1').base.productCodes),['P8']);assert.equal(f.api.getBatch().count,1);assert.equal(f.stats.statuses.at(-1),true);assert.equal(f.stats.syncStatuses.at(-1).dirty,true);assert.equal(f.stats.syncStatuses.at(-1).failed,false);
 await f.api.applyMatrixChoices();assert.equal(f.stats.posts,2);assert.deepEqual(f.remote.items[0].productCodes,['P8','P2']);
});
void test('reconciliation cancellation keeps original guards and all local intent',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));const before=clone(f.api.getBatch().rows.get('I1').base);f.client.read=async()=>reconciliationResult(f);const checking=f.api.reconcileMatrixChoices();await new Promise(setImmediate);f.document.querySelector('[data-matrix-review-cancel]').click();await checking;assert.deepEqual(clone(f.api.getBatch().rows.get('I1').base),before);assert.equal(f.api.getBatch().count,1);assert.equal(f.stats.posts,0);assert.equal(f.box.ui.saving,false);
});
void test('revision changing while confirming reconciliation retains original guards and requires recheck',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));let reads=0;f.client.read=async()=>reconciliationResult(f,4+reads++);const checking=f.api.reconcileMatrixChoices();await new Promise(setImmediate);f.document.querySelector('[data-matrix-review-confirm]').click();await checking;assert.equal(f.api.getBatch().count,1);assert.deepEqual(clone(f.api.getBatch().rows.get('I1').base.productCodes),[]);assert.match(f.api.getBatch().error,/REVISION_CHANGED/);assert.equal(f.stats.posts,0);
});
void test('reconciliation rejects deleted row, pending scope, new generation and unknown without dropping choices',async()=>{
 for(const kind of ['deleted','pending','generation','unknown']){const f=await fixture();f.api.toggleMatrixChoice(f.button(2));f.client.read=async()=>{const result=reconciliationResult(f);if(kind==='deleted')result.control.workflow.working.items=[];if(kind==='pending')result.control.workflow.pendingId='case';if(kind==='generation')result.control.workflow.generation='other';return result;};if(kind==='unknown')f.client.hasUnknown=()=>true;await f.api.reconcileMatrixChoices();assert.equal(f.api.getBatch().count,1,kind);assert.equal(f.stats.posts,0,kind);assert.equal(f.document.querySelector('.fqc-modal-overlay'),null,kind);assert(f.api.getBatch().error,kind);}
});
void test('actor change during reconciliation read cannot adopt values or leave operation locked',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));f.client.read=async()=>{f.actor('B');return reconciliationResult(f);};await f.api.reconcileMatrixChoices();assert.equal(f.stats.adopts,0);assert.equal(f.api.getBatch().count,1);assert.equal(f.box.ui.saving,false);assert.equal(f.stats.posts,0);
});
void test('removal reconciliation preserves other actor references and waits for explicit Apply',async()=>{
 const f=await fixture();Object.assign(f.version.snapshot.items[0],{productCodes:['P2'],productRefs:[{code:'P2',name:'Original'}]});f.api.toggleMatrixChoice(f.button(2));const otherRef={code:'P8',kind:'product',name:'Other actor snapshot',specification:'Other spec'};Object.assign(f.remote.items[0],{productCodes:['P2','P8'],productRefs:[{code:'P2',name:'Original'},clone(otherRef)]});f.client.read=async()=>reconciliationResult(f);
 const checking=f.api.reconcileMatrixChoices();await new Promise(setImmediate);f.document.querySelector('[data-matrix-review-confirm]').click();await checking;assert.equal(f.stats.posts,0);assert.deepEqual([...f.api.getBatch().rows.get('I1').codes],['P8']);await f.api.applyMatrixChoices();assert.equal(f.stats.posts,1);assert.deepEqual(f.remote.items[0].productRefs,[otherRef]);
});

// Fixed before/after CPU/request-count sample. Dependency ports omit network and
// real rendering, so elapsed time is not a browser or end-to-end latency claim.
void test('fixed synthetic before/after sample records command and redraw counts',async()=>{
 // Exact pre-43 handler from reviewed #54 local checkpoint 42b8bcd6f46ce706319300b6dd224ec00d909956.
 const handler=fs.readFileSync('tests/fixtures/fqc-matrix.before-manual-sharing.js','utf8');
 assert.equal(createHash('sha256').update(handler).digest('hex'),'5a17b47fdfde86ec45e9673b152093e687a8d710386415cd7cd58abc600a563f');
 const samples=[];
 for(let round=0;round<5;round++){
  const before=await fixture({size:100}),after=await fixture({size:100});before.box.root=before.area;before.box.record=()=>{};before.box.persist=async()=>{before.stats.posts++;before.stats.renders++;};vm.runInContext(handler,before.box);
  let started=performance.now();for(let i=0;i<100;i++)await before.button(i).onclick();const beforeMs=performance.now()-started;
  started=performance.now();for(let i=0;i<100;i++)after.api.toggleMatrixChoice(after.button(i));const afterMs=performance.now()-started;
  assert.equal(before.stats.posts,100);assert.equal(after.stats.posts,0);assert.equal(after.stats.renders,0);samples.push({round,beforeMs:+beforeMs.toFixed(3),afterMs:+afterMs.toFixed(3),beforeCommands:before.stats.posts,afterCommands:after.stats.posts,beforeRenderPortCalls:before.stats.renders,afterRenderPortCalls:after.stats.renders});
 }
 console.log(JSON.stringify({measurement:'100 choices; synthetic handler/DOM ports, excludes network and real render',samples}));
});

void test('matrix changes update version header in place and never report local choices saved',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(1));assert.equal(f.stats.statuses.at(-1),true);assert.equal(f.stats.syncStatuses.at(-1).dirty,true);assert.equal(f.stats.renders,0);
 await f.api.applyMatrixChoices();assert.equal(f.stats.statuses.at(-1),false);assert.equal(f.stats.syncStatuses.at(-1).dirty,false);
 f.api.toggleMatrixChoice(f.button(2));assert.equal(f.stats.statuses.at(-1),true);f.api.discardMatrixChoices();assert.equal(f.api.matrixDirty(),false);assert.equal(f.stats.statuses.at(-1),false);assert.equal(f.stats.syncStatuses.at(-1).dirty,false);
 assert.match(source,/flow:library\(\)\.workflow,localUnsaved:matrixDirty\(\)/);
});


void test('current runtime receipt action settles matching pending input and permits the next explicit Apply',async()=>{
 const f=await fixture({mode:'unknown'});f.api.toggleMatrixChoice(f.button(2));await f.api.applyMatrixChoices();const key=f.api.session().key;f.changeMode('ok');
 await f.api.resolveMatrixRecord(key);assert.equal(f.records.has(key),false);assert.equal(f.api.getBatch().pending,null);assert.equal(f.api.matrixDirty(),false);assert.equal(f.api.getBatch().count,0);assert.equal(f.flow().revision,4);assert.equal(f.stats.posts,1);
 f.api.toggleMatrixChoice(f.button(3));await f.api.applyMatrixChoices();assert.equal(f.stats.posts,2);assert.equal(f.api.matrixDirty(),false);
});
void test('historical receipt settlement does not clear an unrelated current local batch',async()=>{
 const first=await fixture({mode:'unknown'});first.api.toggleMatrixChoice(first.button(2));await first.api.applyMatrixChoices();const key=first.api.session().key,record=JSON.parse(first.records.get(key));first.emit('pagehide');
 const f=await fixture({records:first.records});f.api.toggleMatrixChoice(f.button(4));const current=f.api.getBatch();f.client.receipt=async()=>({receipt:{...record.receipt,revision:4,savedId:'save1',caseId:null,unchanged:false}});f.remoteRevision(4);
 await f.api.resolveMatrixRecord(key);assert.equal(f.records.has(key),false);assert.equal(f.api.getBatch(),current);assert.equal(current.count,1);assert.equal(current.rows.get('I1').codes.has('P4'),true);assert.equal(f.stats.posts,0);assert.equal(f.stats.adopts,0);
});
void test('same actor new generation during Apply cannot adopt late old-generation ACK or clear marker',async()=>{
 const f=await fixture({mode:'wait'});f.api.toggleMatrixChoice(f.button(1));const pending=f.api.applyMatrixChoices();f.library.workflow={...f.library.workflow,generation:'new-generation',revision:9};f.resolve();await pending;
 assert.equal(f.flow().generation,'new-generation');assert.equal(f.flow().revision,9);assert.equal(f.stats.adopts,0);assert.equal(f.api.getBatch().count,1);assert(f.api.getBatch().pending);assert.equal(JSON.parse(f.records.get(f.api.session().key)).kind,'unknown');
});
void test('same-generation newer local model refuses stale Apply readback without losing pending input',async()=>{
 const f=await fixture({mode:'wait'});f.api.toggleMatrixChoice(f.button(1));const pending=f.api.applyMatrixChoices();f.library.workflow={...f.library.workflow,revision:9};f.resolve();await pending;
 assert.equal(f.flow().revision,9);assert.equal(f.stats.adopts,0);assert.equal(f.api.getBatch().count,1);assert(f.api.getBatch().pending);assert.match(f.api.getBatch().error,/REVISION_CHANGED/);
});
async function storedMatrix(options={}){
 const first=await fixture(options);first.api.toggleMatrixChoice(first.button(2));first.api.persistMatrixChoices();const key=first.api.session().key,raw=first.records.get(key);first.emit('pagehide');return{first,key,raw};
}
void test('historical epoch differs after reload but explicit claim/current-owner checks permit valid restore',async()=>{
 const {first,key}=await storedMatrix({epoch:7});const f=await fixture({records:first.records,epoch:1});
 await f.api.restoreMatrixRecord(key,async()=>true);assert.equal(f.api.getBatch().epoch,1);assert.equal(f.api.getBatch().count,1);assert.equal(f.stats.posts,0);assert.equal(f.stats.stateReads,2);
});
void test('canceling a recovery confirmation leaves local buffer empty and source untouched',async()=>{
 const {first,key,raw}=await storedMatrix();const f=await fixture({records:first.records});
 assert.equal(await f.api.restoreMatrixRecord(key,async()=>false),false);assert.equal(f.api.getBatch(),null);assert.equal(f.records.get(key),raw);assert.equal(f.stats.stateReads,1);assert.equal(f.stats.posts,0);
});
for(const kind of ['actor','epoch','permission','pending','revision','new-input'])void test(`explicit FQC restore rejects ${kind} changing during confirmation`,async()=>{
 const {first,key,raw}=await storedMatrix();const f=await fixture({records:first.records});
 await assert.rejects(f.api.restoreMatrixRecord(key,async()=>{if(kind==='actor')f.actor('B');if(kind==='epoch')f.epoch();if(kind==='permission')f.client.permission=permission=>permission!=='edit';if(kind==='pending')f.library.workflow.pendingId='case';if(kind==='revision')f.remoteRevision(4);if(kind==='new-input')f.api.toggleMatrixChoice(f.button(4));return true;}));
 assert.equal(f.records.get(key),raw);assert.equal(f.stats.posts,0);if(kind==='new-input'){assert.equal(f.api.getBatch().count,1);assert(f.api.getBatch().rows.get('I1').codes.has('P4'));}else assert.equal(f.api.getBatch(),null);
});
void test('late first restore GET cannot replace a same-owner newer model with an older source revision',async()=>{
 const {first,key,raw}=await storedMatrix();const f=await fixture({records:first.records}),read=f.client.read;
 f.client.read=async()=>{const value=await read();f.library.workflow={...f.library.workflow,revision:10};return value;};
 await assert.rejects(f.api.restoreMatrixRecord(key,async()=>true),/REVISION_CHANGED/);assert.equal(f.flow().revision,10);assert.equal(f.api.getBatch(),null);assert.equal(f.records.get(key),raw);
});
void test('no Web Locks target cannot claim historical data but fresh isolated edits persist',async()=>{
 const {first,key,raw}=await storedMatrix();const f=await fixture({records:first.records,lockSupported:false});
 assert.match(f.api.recoveryState().note,/不支援獨占鎖/);await assert.rejects(f.api.restoreMatrixRecord(key,async()=>true),/WEB_LOCKS_UNAVAILABLE/);f.api.toggleMatrixChoice(f.button(3));assert.equal(f.api.persistMatrixChoices(),true);assert.equal(f.records.get(key),raw);assert.notEqual(f.api.session().key,key);assert.equal(f.stats.posts,0);
});
void test('an unclaimed source cannot be recovered merely because the target supports Web Locks',async()=>{
 const {first,key,raw}=await storedMatrix({lockSupported:false});const f=await fixture({records:first.records});
 await assert.rejects(f.api.restoreMatrixRecord(key,async()=>true),/SOURCE_LEASE_UNAVAILABLE/);assert.equal(f.records.get(key),raw);assert.equal(f.api.getBatch(),null);
});
void test('targeted FQC recovery discard preserves current inputs, other records and unrelated storage',async()=>{
 const {first,key}=await storedMatrix();const f=await fixture({records:first.records});f.records.set('unrelated','keep');f.api.toggleMatrixChoice(f.button(4));f.api.persistMatrixChoices();const ownKey=f.api.session().key,ownRaw=f.records.get(ownKey);
 await f.api.discardMatrixRecord(key,async()=>true);assert.equal(f.records.has(key),false);assert.equal(f.records.get(ownKey),ownRaw);assert.equal(f.records.get('unrelated'),'keep');assert.equal(f.api.getBatch().count,1);assert.equal(f.stats.posts,0);
});
void test('debounced FQC persistence writes once and reports quota failure without POST or full redraw',async()=>{
 const f=await fixture({writeFail:true});for(let i=0;i<100;i++)f.api.toggleMatrixChoice(f.button(i));assert.equal(f.stats.writes,0);assert.equal(f.stats.posts,0);assert.equal(f.stats.stateReads,0);assert.equal(f.stats.renders,0);
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(f.stats.writes,1);assert.match(f.area.querySelector('#fqc-matrix-message').textContent,/存檔失敗|QUOTA/);assert.equal(f.api.getBatch().count,100);assert.equal(f.stats.posts,0);assert.equal(f.stats.renders,0);
});
void test('legacy matrix records remain untouched and never auto-hydrate into the new runtime',async()=>{
 const records=new Map(),key='fqc-matrix-local-v1:'+JSON.stringify(['A','gen1','legacy-tab']),raw=JSON.stringify({schema:1,actorId:'A',generation:'gen1',versionId:'draft1',tab:'legacy-tab',rows:[['I1',{base:{productCodes:[]},codes:['P2'],changed:['P2']}]],pending:null});records.set(key,raw);
 const f=await fixture({records});assert.equal(f.api.getBatch(),null);assert.equal(f.button(2).getAttribute('aria-pressed'),'false');assert.equal(f.records.get(key),raw);assert.equal(f.stats.stateReads,0);assert.equal(f.stats.posts,0);
});
void test('recovery UI opening is read-only and does not issue GET, POST or hydrate choices',async()=>{
 const {first,key}=await storedMatrix();const f=await fixture({records:first.records});await f.api.openMatrixRecovery();const overlay=f.document.querySelector('.fqc-recovery-overlay');assert(overlay);assert.equal(f.api.getBatch(),null);assert.equal(f.stats.stateReads,0);assert.equal(f.stats.posts,0);assert.equal(overlay.querySelector('[data-recovery-preview]').textContent,'');
 const button=[...overlay.querySelectorAll('button')].find(element=>element.textContent.startsWith('預覽本機記錄'));assert(button);await button.onclick();assert.match(overlay.querySelector('[data-recovery-preview]').textContent,/P2/);assert.equal(f.records.has(key),true);assert.equal(f.api.getBatch(),null);overlay.querySelector('[data-recovery-close]').click();assert.equal(f.document.querySelector('.fqc-recovery-overlay'),null);
});

void test('explicit local discard cancels queued recovery without a write, even when storage is full',async()=>{
 const f=await fixture({writeFail:true});f.api.toggleMatrixChoice(f.button(2));f.api.discardMatrixChoices();
 assert.equal(f.api.matrixDirty(),false);assert.equal(f.stats.writes,0);assert.equal(f.stats.posts,0);await new Promise(resolve=>setTimeout(resolve,280));assert.equal(f.records.size,0);assert.equal(f.stats.writes,0);
});
void test('explicit local discard removes only its durable copy without rewriting under quota',async()=>{
 const f=await fixture();f.api.toggleMatrixChoice(f.button(2));f.api.persistMatrixChoices();const key=f.api.session().key,writes=f.stats.writes;f.records.set('unrelated','keep');f.writeFail(true);f.api.toggleMatrixChoice(f.button(3));f.api.discardMatrixChoices();
 assert.equal(f.api.matrixDirty(),false);assert.equal(f.records.has(key),false);assert.equal(f.records.get('unrelated'),'keep');assert.equal(f.stats.writes,writes);assert.equal(f.stats.posts,0);
});
