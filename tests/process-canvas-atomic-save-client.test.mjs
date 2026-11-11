// Production store + canvas + shared transport, synthetic fetch only (no sockets).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=name=>fs.readFileSync('public/process/'+name+'.js','utf8');
const clone=structuredClone,workspace='workspace',stage='S';
function storage(){const data=new Map(),reads=[],writes=[],deletes=[];let quota=false;return{data,reads,writes,deletes,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>{reads.push(k);return data.get(k)??null;},setItem(k,v){if(quota)throw Error('quota');writes.push(k);data.set(k,v);},removeItem(k){deletes.push(k);data.delete(k);},quota:v=>{quota=v;}};}
function locks(){const held=new Set();return{held,async request(name,_options,callback){await Promise.resolve();if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};}
const initial=()=>({scope:'process:platform',generation:'g1',revision:1,saved:{id:'saved-1'},pendingId:null,working:{workspaces:[{id:workspace,stages:{S:[{id:'one',stageCode:stage,name:'Original',x:0,y:0,nextIds:[]}]}}]}});
function server(){const remote=initial();let mode='ok',receipt=null,posts=0,gets=0,receipts=0,release;
 const payload=()=>({control:{workflow:clone(remote),versions:[{id:'draft',status:'draft'}]},permissions:{view:true,edit:true}});
 const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>clone(body)});
 const unpack=value=>{if(value.commandWireVersion!==1)return value;const expand=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(expand):Object.hasOwn(x,'__commandMedia')?value.media[x.__commandMedia]:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,expand(v)]))):x;return expand(value.command);};
 const commit=command=>{for(const patch of command.patches){const rows=remote.working.workspaces.find(row=>row.id===patch.path[1].id).stages[patch.path[3]];if(patch.op==='set')rows.find(row=>row.id===patch.path[4].id)[patch.path.at(-1)]=clone(patch.value);else if(patch.op==='insert')rows.push(clone(patch.value));else if(patch.op==='remove')rows.splice(rows.findIndex(row=>row.id===patch.path[4].id),1);}remote.revision++;if(command.moduleAction==='save-canvas-v1')remote.saved={id:'saved-'+remote.revision,revision:remote.revision,content:clone(remote.working)};receipt={operationId:command.operationId,generation:command.generation,revision:remote.revision,savedId:remote.saved.id,caseId:null,unchanged:false};return response({...payload(),receipt});};
 return{payload,remote:()=>remote,posts:()=>posts,gets:()=>gets,receipts:()=>receipts,mode:v=>{mode=v;},release:()=>release(),async fetch(url,options={}){if(options.method==='POST'){posts++;const command=unpack(JSON.parse(options.body).command);if(mode==='proxy409')return response({error:'proxy failure'},409);if(mode==='guard')return response({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:webcrypto.randomUUID(),details:{path:clone(command.guards[0].path)}},409);if(mode==='held')return new Promise(resolve=>{release=()=>resolve(commit(command));});const answer=commit(command);if(mode==='lost')throw Error('synthetic lost ACK');return answer;}gets++;if(String(url).includes('operationId=')){receipts++;if(mode==='lost'||mode==='missing'||!receipt)return response({error:'OPERATION_NOT_FOUND'},404);assert.equal(new URL(url,'https://fixture.invalid').searchParams.get('operationId'),receipt.operationId);return response({receipt});}return response(payload());}};
}
async function fixture({disk=storage(),session=storage(),manager=locks(),remote=server(),epoch=1,wrapRecovery=session=>session}={}){
 let version=epoch,model=initial(),nextTimer=0;const events=new Map(),timers=new Map(),clients=[],status={textContent:''};
 const box={window:null,console,structuredClone,performance,crypto:webcrypto,AbortController,URL,URLSearchParams,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:disk,sessionStorage:session,navigator:manager?{locks:manager}:{},fetch:(...args)=>remote.fetch(...args),setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);},document:{documentElement:{lang:'zh'},querySelector:selector=>selector==='.pe-local-status'?status:null,querySelectorAll:()=>[]},ProcessSync:{identity:{id:'a'},identityGeneration:()=>version,platformHeaders:()=>({})},ProcessEditorV2:{currentCanvas:()=>({workspace,stage}),refreshRecovery(){},confirm:async()=>true}};box.window=box;
 box.ProcessAuthoringV3={flow:()=>model,recoveryAuthority:()=>({canView:true,canEdit:true,pending:!!model.pendingId,hasOpenForm:false,interacting:false,busy:false}),captureCanvasRecovery:()=>({}),async readCanvasRecovery(){return (await remote.fetch('/api/process-authoring/workflow',{method:'GET'})).json();},acceptCanvasRecovery(value){model=clone(value.control.workflow);box.ProcessCanvasLocal.accept(model);},canEditCanvas:()=>!model.pendingId,canEditLocalCanvas:()=>!model.pendingId,updateLocalSaveState(){}};
 vm.createContext(box);vm.runInContext(source('shared-draft-client'),box);const realCreate=box.createSharedDraftClient;box.createSharedDraftClient=options=>{const client=realCreate(options);clients.push(client);return client;};vm.runInContext(source('canvas-recovery-store'),box);const recoveryFactory=box.CanvasRecoveryStore;box.CanvasRecoveryStore={...recoveryFactory,create:options=>wrapRecovery(recoveryFactory.create(options))};vm.runInContext(source('canvas-local'),box);box.ProcessCanvasLocal.accept(model);await box.ProcessCanvasLocal.recoveryReady();
 return{box,local:box.ProcessCanvasLocal,disk,session,manager,remote,clients,status,model:()=>model,setEpoch:v=>{version=v;},edit:value=>box.ProcessCanvasLocal.edit(workspace,stage,[{id:'one',f:'name',value}]),media:value=>box.ProcessCanvasLocal.edit(workspace,stage,[{id:'one',f:'mediaItems',value:[{src:value,type:'image/png'}]}]),tick(){for(const [id,fn]of timers){timers.delete(id);fn();}},emit(name,event={}){for(const fn of events.get(name)||[])fn(event);}};
}
const records=disk=>[...disk.data].filter(([key])=>key.startsWith('process-canvas-recovery-v3:')).map(([key,raw])=>({key,record:JSON.parse(raw)}));

void test('one explicit Save sends one command and saves the captured canvas',async()=>{
 const f=await fixture();for(let i=0;i<50;i++)f.edit('Local '+i);assert.equal(f.remote.posts(),0);
 const answer=await f.local.beforeSave();assert.equal(answer.canvasSaved,true);assert.equal(f.remote.posts(),1);assert.equal(f.local.dirty(),false);assert.equal(f.model().saved.content.workspaces[0].stages.S[0].name,'Local 49');
});
void test('Save with an empty journal still produces a durable recoverable operation',async()=>{
 const f=await fixture();const answer=await f.local.beforeSave();assert.equal(answer.canvasSaved,true);assert.equal(f.remote.posts(),1);assert.equal(f.local.pending(),false);assert.equal(f.local.dirty(),false);
});
void test('lost Save ACK only queries its original receipt and preserves newer edits',async()=>{
 const f=await fixture();f.edit('Captured');f.remote.mode('lost');await assert.rejects(f.local.beforeSave(),/UNKNOWN/);f.edit('Newer');f.remote.mode('missing');await assert.rejects(f.local.beforeSave(),/NOT_FOUND/);assert.equal(f.remote.posts(),1);assert(f.local.pending());
 f.remote.mode('ok');await f.local.beforeSave();assert.equal(f.remote.posts(),1);assert.equal(f.model().saved.content.workspaces[0].stages.S[0].name,'Captured');assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Newer');assert(f.local.dirty());await f.local.beforeSave();assert.equal(f.remote.posts(),2);assert.equal(f.model().saved.content.workspaces[0].stages.S[0].name,'Newer');
});
void test('empty Save unknown survives reload and resolves without any second POST',async()=>{
 const a=await fixture();a.remote.mode('lost');await assert.rejects(a.local.beforeSave(),/UNKNOWN/);const unknown=records(a.disk).find(row=>row.record.kind==='unknown');assert(unknown);a.emit('pagehide');await Promise.resolve();await Promise.resolve();a.remote.mode('ok');const b=await fixture({disk:a.disk,manager:a.manager,remote:a.remote,epoch:2});await b.local.resolveRecovery(unknown.key);assert.equal(b.remote.posts(),1);assert(!b.local.pending());
});
void test('Save permission and open form refuse before any POST',async()=>{
 const f=await fixture();f.edit('Keep');f.box.ProcessAuthoringV3.canSaveCanvas=()=>false;await assert.rejects(f.local.beforeSave(),/PERMISSION/);assert.equal(f.remote.posts(),0);assert(f.local.dirty());f.box.ProcessAuthoringV3.canSaveCanvas=()=>true;
 const original=clone(f.model().working.workspaces[0].stages.S[0]);f.local.storeForm(workspace,stage,'one',{original,draft:{...original,name:'Form'},isNew:false});await assert.rejects(f.local.beforeSave(),/LOCAL_INPUT/);assert.equal(f.remote.posts(),0);
});
void test('local quota refuses Save before POST and retains the input',async()=>{const f=await fixture();f.edit('Keep');f.disk.quota(true);await assert.rejects(f.local.beforeSave(),/STORAGE/);assert.equal(f.remote.posts(),0);assert(f.local.dirty());});

void test('finalizing a proven rejection does not report a successful Save or send another POST',async()=>{
 const f=await fixture(),set=f.disk.setItem.bind(f.disk);let failed=false;
 f.disk.setItem=(key,raw)=>{if(!failed&&key.startsWith('process-canvas-recovery-v3:')&&!key.includes('#')&&JSON.parse(raw).kind==='local'){failed=true;throw Error('quota while finalizing rejection');}set(key,raw);};
 f.edit('Keep');f.remote.mode('guard');await assert.rejects(f.local.beforeSave(),/DEPENDENCY_CHANGED/);assert(f.local.pending());assert.equal(f.remote.posts(),1);
 f.remote.mode('ok');const recovered=await f.local.beforeSave();assert.equal(recovered.canvasSaved,false);assert.equal(f.remote.posts(),1);assert(f.local.dirty());
 const saved=await f.local.beforeSave();assert.equal(saved.canvasSaved,true);assert.equal(f.remote.posts(),2);
});

for(const fault of ['saved-id','saved-content'])void test(`same-revision ${fault} mismatch retains durable pending Save and recovers by original receipt`,async()=>{
 const f=await fixture(),read=f.box.ProcessAuthoringV3.readCanvasRecovery;
 f.box.ProcessAuthoringV3.readCanvasRecovery=async()=>{const result=await read();if(!f.remote.posts())return result;if(fault==='saved-id')result.control.workflow.saved.id='wrong-saved-id';else result.control.workflow.saved.content.workspaces[0].stages.S[0].name='wrong-content';return result;};
 f.edit('Captured');await assert.rejects(f.local.beforeSave(),/CANVAS_SAVE_ACK_MISMATCH/);
 const marker=records(f.disk).find(row=>row.record.kind==='unknown');assert(marker);assert(f.local.pending());assert(f.local.dirty());assert.equal(f.remote.posts(),1);
 await assert.rejects(f.local.beforeSave(),/CANVAS_SAVE_ACK_MISMATCH/);assert.equal(f.remote.posts(),1);assert.deepEqual(records(f.disk).find(row=>row.key===marker.key).record,marker.record);
 f.box.ProcessAuthoringV3.readCanvasRecovery=read;await f.local.beforeSave();assert.equal(f.remote.posts(),1);assert(!f.local.pending());assert(!f.local.dirty());
});

for(const decision of ['mine','latest'])void test(`Save choice ${decision} preserves disjoint edits and supports the next edit back to original`,async()=>{
 const f=await fixture();f.edit('First local');f.local.edit(workspace,stage,[{id:'one',f:'x',value:42}]);const peer=f.remote.remote();peer.working.workspaces[0].stages.S[0].name='Peer';peer.working.workspaces[0].stages.S[0].y=99;peer.revision++;
 let choices=0;f.box.ProcessEditorV2.resolveSaveConflicts=async review=>{choices++;assert.equal(review.changes.filter(c=>c.conflict).length,1);return decision;};
 assert.equal((await f.local.beforeSave()).canvasSaved,true);assert.equal(choices,1);assert.equal(f.remote.posts(),1);
 const saved=f.model().saved.content.workspaces[0].stages.S[0];assert.equal(saved.name,decision==='mine'?'First local':'Peer');assert.equal(saved.x,42);assert.equal(saved.y,99);
 f.edit('Original');assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Original');assert(f.local.dirty());
 assert.equal((await f.local.beforeSave()).canvasSaved,true);assert.equal(f.remote.posts(),2);assert.equal(f.model().saved.content.workspaces[0].stages.S[0].name,'Original');
});
void test('cancelled Save comparison preserves all input and makes no POST',async()=>{
 const f=await fixture();f.edit('Mine');f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;f.box.ProcessEditorV2.resolveSaveConflicts=async()=>null;
 assert.equal(await f.local.beforeSave(),null);assert.equal(f.remote.posts(),0);assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Mine');assert(f.local.dirty());
});
for(const reason of ['actor','same-actor-object','epoch','generation','revision','stage','view','permission','pending','new-input','form'])void test(`Save conflict choice cannot cross ${reason} change`,async()=>{
 const f=await fixture();f.edit('Mine');f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;
 const authority=f.box.ProcessAuthoringV3.recoveryAuthority;let extra={currentView:{view:'editor',stage:'S'}};f.box.ProcessAuthoringV3.recoveryAuthority=()=>({...authority(),...extra});
 f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{
  if(reason==='actor')f.box.ProcessSync.identity={id:'b'};
  if(reason==='same-actor-object')f.box.ProcessSync.identity={id:'a'};
  if(reason==='epoch')f.setEpoch(2);
  if(reason==='generation')f.model().generation='g2';
  if(reason==='revision')f.model().revision++;
  if(reason==='stage')f.box.ProcessEditorV2.currentCanvas=()=>({workspace,stage:'T'});
  if(reason==='view')extra={currentView:{view:'approval',stage:'S'}};
  if(reason==='permission')extra={...extra,canEdit:false};
  if(reason==='pending')f.model().pendingId='case';
  if(reason==='new-input')f.edit('Newest input');
  if(reason==='form'){const original=clone(f.model().working.workspaces[0].stages.S[0]);f.local.storeForm(workspace,stage,'one',{original,draft:{...original,name:'Unfinished'},isNew:false});}
  return 'latest';
 };
 await assert.rejects(f.local.beforeSave(),/CHANGED|LOCKED/);assert.equal(f.remote.posts(),0);
 if(['stage','view','permission','pending','new-input','form','revision'].includes(reason)){assert.equal(f.local.counts().fields,1);if(reason==='form')assert.equal(f.local.form(workspace,stage,'one').draft.name,'Unfinished');}
});
void test('quota after choosing theirs cannot consume conflicting or independent input',async()=>{
 const f=await fixture();f.edit('Mine');f.local.edit(workspace,stage,[{id:'one',f:'x',value:42}]);f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;
 f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{f.disk.quota(true);return 'latest';};
 await assert.rejects(f.local.beforeSave(),/STORAGE/);assert.equal(f.remote.posts(),0);assert(f.local.pending(),'failed cancellation keeps its original reserved operation');assert.equal(f.local.counts().fields,2);
 const local=f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0];assert.equal(local.name,'Mine');assert.equal(local.x,42);
 f.disk.quota(false);await assert.rejects(f.local.beforeSave(),/NOT_FOUND/);assert.equal(f.remote.posts(),0,'receipt lookup never resends');assert(!f.local.pending(),'private never-dispatched cancellation proof can now be durably recorded; 404 alone did not release it');assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Mine');
});
void test('unknown Save never reopens conflict choice or creates a replacement command',async()=>{
 const f=await fixture();f.edit('Mine');f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;let choices=0;f.box.ProcessEditorV2.resolveSaveConflicts=async()=>{choices++;return 'mine';};
 f.remote.mode('lost');await assert.rejects(f.local.beforeSave(),/UNKNOWN/);const unknown=records(f.disk).find(row=>row.record.kind==='unknown');assert(unknown);f.edit('Later input');f.remote.mode('missing');await assert.rejects(f.local.beforeSave(),/NOT_FOUND/);assert.equal(f.remote.posts(),1);assert.equal(choices,1);assert.equal(records(f.disk).find(row=>row.record.kind==='unknown').record.reference.operationId,unknown.record.reference.operationId);
 f.remote.mode('ok');assert.equal((await f.local.beforeSave()).canvasSaved,true);assert.equal(f.remote.posts(),1);assert.equal(choices,1);assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Later input');
});

void test('one failed reservation write with proven cancellation rolls back choice and permits a new explicit Save',async()=>{
 const f=await fixture();f.edit('Mine');f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;
 const write=f.disk.setItem.bind(f.disk);let failed=false;f.disk.setItem=(key,raw)=>{if(!failed){failed=true;throw Error('single quota failure');}write(key,raw);};
 f.box.ProcessEditorV2.resolveSaveConflicts=async()=> 'latest';await assert.rejects(f.local.beforeSave(),/STORAGE/);assert(!f.local.pending());assert.equal(f.remote.posts(),0);assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Mine');
 f.box.ProcessEditorV2.resolveSaveConflicts=async()=> 'mine';assert.equal((await f.local.beforeSave()).canvasSaved,true);assert.equal(f.remote.posts(),1);assert.equal(f.model().saved.content.workspaces[0].stages.S[0].name,'Mine');
});

for(const code of ['DRAFT_REVISION_CHANGED_RECONFIRM','DEPENDENCY_CHANGED_RECONFIRM'])void test(`fetch-thrown ${code} flags cannot prove Canvas rejection`,async()=>{
 const f=await fixture(),fetch=f.remote.fetch.bind(f.remote);let posts=0,operation;
 f.remote.fetch=async(url,options)=>{if(options.method!=='POST')return fetch(url,options);posts++;const command=JSON.parse(options.body).command;operation=command.operationId;throw Object.assign(Error(code),{status:409,requestId:webcrypto.randomUUID(),details:{path:command.guards[0].path}});};
 f.edit('Keep');await assert.rejects(f.local.beforeSave(),new RegExp(code));assert(f.local.pending());const original=records(f.disk).find(r=>r.record.kind==='unknown');assert.equal(original.record.reference.operationId,operation);
 await assert.rejects(f.local.beforeSave(),/NOT_FOUND/);assert.equal(posts,1);assert(f.local.pending());assert.deepEqual(records(f.disk).find(r=>r.key===original.key).record,original.record);
});
void test('receipt GET revision error is not evidence that original lost Save was rejected',async()=>{
 const f=await fixture(),fetch=f.remote.fetch.bind(f.remote);f.edit('Captured');f.remote.mode('lost');await assert.rejects(f.local.beforeSave(),/UNKNOWN/);const original=records(f.disk).find(r=>r.record.kind==='unknown');
 f.remote.fetch=async(url,options)=>String(url).includes('operationId=')?{ok:false,status:409,json:async()=>({error:'DRAFT_REVISION_CHANGED_RECONFIRM',requestId:webcrypto.randomUUID()})}:fetch(url,options);
 await assert.rejects(f.local.beforeSave(),/DRAFT_REVISION_CHANGED/);assert(f.local.pending());assert.equal(f.remote.posts(),1);assert.deepEqual(records(f.disk).find(r=>r.key===original.key).record,original.record);
});
void test('private rejection capability binds original command and client, and is consumed only after durable cancellation',async()=>{
 const f=await fixture(),c=f.clients.at(-1);let issued,error,original;const capability=c.canvasRejectionCapability.bind(c),send=c.sendPrepared.bind(c);
 c.canvasRejectionCapability=command=>{original=command;return issued=capability(command);};
 c.sendPrepared=async(command,...args)=>{try{return await send(command,...args);}catch(e){error=e;f.disk.quota(true);throw e;}};
 f.edit('Keep');f.remote.mode('guard');await assert.rejects(f.local.beforeSave(),/DEPENDENCY_CHANGED/);assert(f.local.pending());assert.equal(c.isConfirmedCanvasRejection(error,original,issued),true);
 assert.equal(c.isConfirmedCanvasRejection(error,clone(original),issued),false);assert.equal(c.isConfirmedCanvasRejection(error,original,{}),false);assert.equal(c.isConfirmedCanvasRejection(Object.assign(Error(error.message),error),original,issued),false);
 const other=f.box.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1&channel=canvas-v2',actorId:'a',headers:()=>({}),externalDurableCanvas:{assertDispatch:()=>true}});assert.equal(other.isConfirmedCanvasRejection(error,original,issued),false);
 f.disk.quota(false);const result=await f.local.beforeSave();assert.equal(result.canvasSaved,false);assert(!f.local.pending());assert.equal(f.remote.posts(),1);assert.equal(c.isConfirmedCanvasRejection(error,original,issued),false);assert.equal(c.discardRejectedCanvasSave(original,error,issued),false);
});

for(const save of [false,true])for(const phase of ['storage','readPayload'])for(const field of ['patches','guards'])void test(`${save?'Save':'legacy Sync'} capture-to-sender ${phase} ${field} mutation makes zero POSTs`,async()=>{
 const disk=storage();let changed=false,operation;const get=disk.getItem.bind(disk);
 const f=await fixture({disk,wrapRecovery:session=>{let reader;return{...session,get ready(){return session.ready;},prepareWrite(input){reader=input.readPayload;return session.prepareWrite(input);},dispatchPrepared(reservation,command,...args){
  operation=command.operationId;const mutate=()=>{if(!changed){changed=true;command[field][0].value='Tampered after raw capture';}};
  if(phase==='storage')disk.getItem=key=>{if(new Error().stack.includes('flushPending'))mutate();return get(key);};
  else assert.equal(session.schedulePending(reservation,()=>{mutate();return reader();}).ok,true);
  return session.dispatchPrepared(reservation,command,...args);
 } };}});
 f.edit('Original local intent');await assert.rejects(save?f.local.beforeSave():f.local.sync(workspace,stage),/PREPARATION_COMMAND_CHANGED|CANVAS_DURABLE_DISPATCH_REQUIRED/);
 assert(changed,'mutation ran after initial capture and before the sender');assert.equal(f.remote.posts(),0);assert(f.local.pending());assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Original local intent');
 const original=records(disk).find(row=>row.record.kind==='unknown');assert.equal(original.record.reference.operationId,operation);disk.getItem=get;
 await assert.rejects(save?f.local.beforeSave():f.local.sync(workspace,stage),/NOT_FOUND/);assert.equal(f.remote.posts(),0);assert(f.local.pending());assert.deepEqual(records(disk).find(row=>row.key===original.key).record,original.record);
});

for(const phase of ['prepareWrite','first-readPayload'])for(const field of ['moduleAction','patches','guards','operationId','generation','source'])void test(`issued Save pin predates ${phase} ${field} mutation`,async()=>{
 let original,operation,touched=false;const f=await fixture({wrapRecovery:session=>({...session,get ready(){return session.ready;},captureSaveCommand(command,reference){original=command;operation=command.operationId;return session.captureSaveCommand(command,reference);},prepareWrite(input){const mutate=()=>{touched=true;if(field==='moduleAction')delete original.moduleAction;else if(['patches','guards'].includes(field))original[field][0].value='Mutated';else original[field]='mutated';};if(phase==='prepareWrite'){mutate();return session.prepareWrite(input);}const read=input.readPayload;return session.prepareWrite({...input,readPayload(){mutate();return read();}});}})});
 f.edit('Keep');await assert.rejects(f.local.beforeSave(),/PREPARATION_COMMAND_CHANGED|PREPARATION_COMMAND_MISMATCH/);assert(touched);assert.equal(f.remote.posts(),0);assert.equal(f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0].name,'Keep');
 if(f.local.pending())assert(records(f.disk).some(r=>r.record.kind==='unknown'&&r.record.reference.operationId===operation));
});
for(const invalid of ['getter','prototype','alias'])void test(`Save guard normalizer does not broaden ${invalid} descriptor acceptance`,async()=>{
 const f=await fixture(),client=f.clients.at(-1),prepare=client.prepare.bind(client);let reads=0;
 client.prepare=(generation,action,details)=>{if(invalid==='getter')Object.defineProperty(details.guards[0],'value',{enumerable:true,configurable:true,get(){reads++;return undefined;}});if(invalid==='prototype')Object.setPrototypeOf(details.guards[0],Object.create(Object.prototype));if(invalid==='alias')details.guards[0].path=details.patches[0].path;return prepare(generation,action,details);};
 f.edit('Keep');await assert.rejects(f.local.beforeSave(),/CANVAS_SAVE_PREPARATION_REQUIRED/);assert.equal(reads,0);assert.equal(f.remote.posts(),0);assert(f.local.dirty());
});

void test('removing an issued Save token cannot fall back to legacy preparation',async()=>{
 let command;const f=await fixture({wrapRecovery:session=>({...session,get ready(){return session.ready;},captureSaveCommand(value,reference){command=value;return session.captureSaveCommand(value,reference);},prepareWrite(input){delete input.commandPin;delete command.moduleAction;return session.prepareWrite(input);}})});
 f.edit('Keep');await assert.rejects(f.local.beforeSave(),/SAVE_COMMAND_PIN_REQUIRED/);assert.equal(f.remote.posts(),0);assert(f.local.dirty());
});

for(const at of ['capability','store-token'])void test(`synchronous ${at} rejection after choosing latest restores original input with zero POST`,async()=>{
 const f=await fixture({wrapRecovery:session=>at==='store-token'?{...session,get ready(){return session.ready;},captureSaveCommand(){throw Error('TOKEN_REJECTED');}}:session});f.edit('Mine');f.local.edit(workspace,stage,[{id:'one',f:'x',value:42}]);f.remote.remote().working.workspaces[0].stages.S[0].name='Peer';f.remote.remote().revision++;
 f.box.ProcessEditorV2.resolveSaveConflicts=async()=> 'latest';if(at==='capability')f.clients.at(-1).canvasRejectionCapability=()=>{throw Error('TOKEN_REJECTED');};
 await assert.rejects(f.local.beforeSave(),/TOKEN_REJECTED/);assert.equal(f.remote.posts(),0);assert(!f.local.pending());const row=f.local.project(workspace,stage,f.model().working.workspaces[0].stages.S)[0];assert.equal(row.name,'Mine');assert.equal(row.x,42);assert(f.local.dirty());
});
