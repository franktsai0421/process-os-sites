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
async function fixture({disk=storage(),session=storage(),manager=locks(),remote=server(),epoch=1}={}){
 let version=epoch,model=initial(),nextTimer=0;const events=new Map(),timers=new Map(),clients=[],status={textContent:''};
 const box={window:null,console,structuredClone,performance,crypto:webcrypto,AbortController,URL,URLSearchParams,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:disk,sessionStorage:session,navigator:manager?{locks:manager}:{},fetch:(...args)=>remote.fetch(...args),setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);},document:{documentElement:{lang:'zh'},querySelector:selector=>selector==='.pe-local-status'?status:null,querySelectorAll:()=>[]},ProcessSync:{identity:{id:'a'},identityGeneration:()=>version,platformHeaders:()=>({})},ProcessEditorV2:{currentCanvas:()=>({workspace,stage}),refreshRecovery(){},confirm:async()=>true}};box.window=box;
 box.ProcessAuthoringV3={flow:()=>model,recoveryAuthority:()=>({canView:true,canEdit:true,pending:!!model.pendingId,hasOpenForm:false,interacting:false,busy:false}),captureCanvasRecovery:()=>({}),async readCanvasRecovery(){return (await remote.fetch('/api/process-authoring/workflow',{method:'GET'})).json();},acceptCanvasRecovery(value){model=clone(value.control.workflow);box.ProcessCanvasLocal.accept(model);},canEditCanvas:()=>!model.pendingId,canEditLocalCanvas:()=>!model.pendingId,updateLocalSaveState(){}};
 vm.createContext(box);vm.runInContext(source('shared-draft-client'),box);const realCreate=box.createSharedDraftClient;box.createSharedDraftClient=options=>{const client=realCreate(options);clients.push(client);return client;};vm.runInContext(source('canvas-recovery-store'),box);vm.runInContext(source('canvas-local'),box);box.ProcessCanvasLocal.accept(model);await box.ProcessCanvasLocal.recoveryReady();
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
