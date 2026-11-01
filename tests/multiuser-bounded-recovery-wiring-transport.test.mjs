// Four real production layers; synthetic fetch/storage/DOM only, no live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { canvasDOM } from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const sources={helper:read('local-draft-recovery.js'),session:read('local-draft-recovery-session.js'),transport:read('shared-draft-client.js'),bridge:read('master-shared-client.js'),app:read('app.js'),fqc:read('fqc-master.js')};
const ast=ts.createSourceFile('app.js',sources.app,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),binder=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='bindProcessMasterName').getText(ast);
const cut=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return s.slice(start,end);};
const clone=value=>JSON.parse(JSON.stringify(value)),turn=()=>new Promise(setImmediate);
function lockManager(){const held=new Set();return{held,request(name,_options,callback){if(held.has(name))return Promise.resolve(callback(null));held.add(name);return Promise.resolve(callback({name})).finally(()=>held.delete(name));}};}
function sharedState(scope){const working=scope==='PROCESS'?{CUT:[{id:'one',name:'Original'}]}:{errors:[],items:[{id:'I1',checkNo:'FQC-01',name:'Synthetic',productCodes:[],productRefs:[],products:[]}]};return{scope:scope==='PROCESS'?'master:PROCESS':'fqc',generation:'g1',revision:1,pendingId:null,saved:{id:'s1',content:clone(working)},working};}
async function fixture(scope,{data=new Map(),locks=lockManager(),remote=sharedState(scope),actorId='actor-a',epoch=1,mode='ok'}={}){
 const {document,events}=canvasDOM();const create=document.createElement;document.createElement=tag=>{const node=create(tag);node.dataset=new Proxy(node.dataset,{set(target,key,value){target[key]=String(value);node.attrs['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});return node;};
 const endpoint=scope==='PROCESS'?'/api/master/workflow?scope=PROCESS&caseMetadata=1':'/api/fqc/workflow?caseMetadata=1';
 let actor={id:actorId},identityEpoch=epoch,delivery=1,nextMode=mode,permissions={view:true,edit:true,save:true,submit:true,history:true,restore:true},hook=null,removeHook=null;
 const calls=[],storageCalls=[],timers=new Map(),receipts=new Map();let serial=0;
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem(key){storageCalls.push(['get',key]);return data.get(key)??null;},setItem(key,value){storageCalls.push(['set',key,value]);data.set(key,String(value));},removeItem(key){storageCalls.push(['remove',key]);removeHook?.(key);data.delete(key);},clear(){throw Error('UNRELATED_CLEAR');}};
 const stateResult=()=>({revision:remote.revision,permissions:{...permissions},control:{versions:[{id:'draft1',scope,status:'draft',snapshot:clone(remote.working)}],workflow:clone(remote),activeVersionId:null}});
 const box=events({console,document,crypto:webcrypto,TextEncoder,Uint8Array,URL,URLSearchParams,Response,AbortController,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:storage,sessionStorage:storage,navigator:{locks},CustomEvent:class{constructor(type){this.type=type;}},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},confirm:()=>true,alert(){},toast(){}});box.window=box;
 box.ProcessSync={get identity(){return actor;},identityGeneration:()=>identityEpoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,platformHeaders:()=>({'Content-Type':'application/json'})};
 box.fetch=async(url,options)=>{const params=new URL(url,'https://fixture.invalid').searchParams,body=options.body?JSON.parse(options.body):null,event={url,method:options.method,body};calls.push(event);await hook?.(event);
   if(body?.action==='begin')return Response.json(stateResult());
   if(body?.command){const command=body.command;assert.equal(command.commandWireVersion,undefined,'bounded fixture never needs media packing');
     if(['stale','pending','pending-no-id'].includes(nextMode))return Response.json({error:nextMode==='stale'?'STALE_GENERATION':'PENDING_LOCKED',...(nextMode==='pending-no-id'?{}:{requestId:'12345678-1234-4234-8234-123456789abc'})},{status:409});
     for(const guard of command.guards||[]){let value=remote.working;for(const part of guard.path)value=typeof part==='object'?value?.find(row=>row.id===part.id):value?.[part];if(JSON.stringify(value)!==JSON.stringify(guard.value))return Response.json({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:guard.path}},{status:409});}
     for(const patch of command.patches||[]){let target=remote.working;for(const part of patch.path.slice(0,-1))target=typeof part==='object'?target.find(row=>row.id===part.id):target[part];target[patch.path.at(-1)]=clone(patch.value);}
     remote.revision++;const receipt={operationId:command.operationId,generation:command.generation,revision:remote.revision,savedId:remote.saved.id,caseId:null,unchanged:false};receipts.set(command.operationId,receipt);
     if(nextMode==='unknown')throw Error('SYNTHETIC_LOST_RESPONSE');return Response.json({...stateResult(),receipt});
   }
   if(params.has('operationId')){if(nextMode==='get-pending')return Response.json({error:'PENDING_LOCKED',requestId:'12345678-1234-4234-8234-123456789abc'},{status:409});const receipt=receipts.get(params.get('operationId'));if(nextMode==='unknown'||!receipt)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return Response.json({receipt});}
   return Response.json(stateResult());
 };
 vm.createContext(box);for(const key of ['transport','helper','session'])vm.runInContext(sources[key],box,{filename:key+'.js'});
 let input,api,control,initialSession;
 const area=document.createElement('section');document.body.append(area);
 if(scope==='PROCESS'){
   control={versions:[],active:{},workflowScopes:{PROCESS:clone(remote)}};vm.runInContext(sources.bridge,box,{filename:'master-shared-client.js'});const bridge=box.createMasterSharedBridge({control,onChange(){}});box.MasterDataWorkflow={shared:bridge};await bridge.readRecovery('PROCESS');
   box.editableProcessMasterData=()=>bridge.client('PROCESS').permission('edit')===true&&!bridge.flow('PROCESS').pendingId?bridge.flow('PROCESS').working:null;box.processMasterCatalogMatches=snapshot=>Object.values(snapshot).flat();box.updateProcessSharedStatus=()=>{};
   vm.runInContext('const processMasterNameBindings=new Set();\n'+binder,box,{filename:'app-name-binder.js'});
   const template=document.createElement('section');template.className='master-template';template.dataset.templateKey='preset';const label=document.createElement('label');label.className='template-name-field';input=document.createElement('input');input.value='Original';label.append(input);template.append(label);area.append(template);box.bindProcessMasterName(input);await turn();
   api={edit(value='Local name'){input.value=value;input.oninput({});},apply:()=>input.processMasterNameApply(),discover:()=>input.processMasterNameListRecovery(),preview:key=>input.processMasterNamePreviewRecovery(key),restore:key=>input.processMasterNameRestoreRecovery(key),receipt:key=>input.processMasterNameReceiptRecovery(key),client:()=>bridge.client('PROCESS'),value:()=>input.value,dirty:()=>input.dataset.unapplied==='true',open:()=>input.processMasterNameShowRecovery(),review:()=>input.processMasterNameReview(),discard:()=>input.processMasterNameDiscard(),finalize:key=>input.processMasterNameFinalizeRecovery(key),finalizeRejected:()=>input.processMasterNameFinalizeRejectedRecovery()};
 }else{
   control={libraries:{fqc:stateResult().control}};const products=Array.from({length:100},(_,i)=>({code:'P'+i,name:'Product '+i,kind:'product',specification:''}));Object.assign(box,{hostElement:area,ui:{saving:false,search:''},clone,h:String,isVi:()=>false,identity:()=>actor,library:()=>control.libraries.fqc,editable:()=>control.libraries.fqc.versions[0],selected:()=>control.libraries.fqc.versions[0],ensureControl:()=>control,canEditDraft:()=>box.actualClient().permission('edit')===true,currentReadOwner:()=>{const pin=actor,e=identityEpoch,d=delivery;return()=>pin===actor&&e===identityEpoch&&d===delivery;},workspaceReady:()=>true,catalog:()=>({products,productMap:new Map(products.map(p=>[p.code,p]))}),render(){},displayDraftError:error=>error.message});
   vm.runInContext("let sharedClient,sharedClientOwner=null,sharedActor='',syncBase=null,syncGeneration=null,sharedStateCurrent=()=>true,pendingCommandFeedback=null,activeSharedAction=null;\n"+cut(sources.fqc,'  function transport(){','  async function loadShared(')+'this.actualClient=transport;',box);
   await box.actualClient().read();
   vm.runInContext(cut(sources.fqc,'  // Matrix choices stay private','  const commandFeedbackPending=')+cut(sources.fqc,'  function matrixHTML(','  function bindEvents()')+'\nthis.matrixAPI={toggleMatrixChoice,applyMatrixChoices,discardMatrixChoices,reconcileMatrixChoices,restoreMatrixChoices,restoreMatrixRecord,resolveMatrixRecord,finalizeMatrixRecord,finalizeMatrixRejection,openMatrixRecovery,matrixToolbarHTML,matrixHTML,paintMatrixActions,matrixDirty,getBatch:()=>matrixBatch,session:()=>matrixRecoverySession};',box);
   box.itemRows=v=>v.snapshot.items;box.matrixAPI.restoreMatrixChoices();await box.matrixAPI.session().ready;initialSession=box.matrixAPI.session();area.innerHTML=box.matrixAPI.matrixToolbarHTML()+box.matrixAPI.matrixHTML(box.editable(),'A',products,true);box.matrixAPI.paintMatrixActions();
   api={edit(index=2){box.matrixAPI.toggleMatrixChoice(area.querySelector(`[data-matrix-product="P${index}"]`));},apply:()=>box.matrixAPI.applyMatrixChoices(),discover:()=>box.matrixAPI.session().discover(),preview:async key=>{const session=box.matrixAPI.session(),claim=await session.claim(key);if(!claim.ok)throw Error(claim.code);const result=session.preview(key);if(!result.ok)throw Error(result.code);return result;},restore:key=>box.matrixAPI.restoreMatrixRecord(key,async()=>true),receipt:key=>box.matrixAPI.resolveMatrixRecord(key),client:()=>box.actualClient(),value:()=>[...(box.matrixAPI.getBatch()?.rows.get('I1')?.codes||[])],dirty:()=>box.matrixAPI.matrixDirty(),open:()=>box.matrixAPI.openMatrixRecovery(),session:()=>box.matrixAPI.session(),discard:()=>box.matrixAPI.discardMatrixChoices(),finalize:key=>box.matrixAPI.finalizeMatrixRecord(key,async()=>true),finalizeRejected:()=>box.matrixAPI.finalizeMatrixRejection(),async review(){const pending=box.matrixAPI.reconcileMatrixChoices();await turn();document.querySelector('[data-matrix-review-confirm]')?.click();await pending;}};
 }
 const initialStorageCalls=storageCalls.slice();calls.length=0;storageCalls.length=0;
 return{initialStorageCalls,scope,box,document,data,storageCalls,calls,api,endpoint,remote,locks,receipts,initialSession,input,tick(){const run=[...timers].filter(([,v])=>v.ms===250);for(const [id,{fn}]of run){timers.delete(id);fn();}},async close(){box.dispatchEvent({type:'pagehide'});await turn();},mode:value=>nextMode=value,epoch:value=>identityEpoch=value,delivery:()=>delivery++,actor:id=>actor={id},permissions:value=>permissions={...permissions,...value},hook:value=>hook=value,removeHook:value=>removeHook=value};
}
const localKeys=f=>f.api.discover().items.map(item=>item.key);
const posts=f=>f.calls.filter(event=>event.method==='POST');
const receiptGets=f=>f.calls.filter(event=>event.method==='GET'&&event.url.includes('operationId='));
for(const scope of ['PROCESS','FQC']){
 void test(scope+' primary constructor never reads or deletes a legacy full command',async()=>{
   const endpoint=scope==='PROCESS'?'/api/master/workflow?scope=PROCESS&caseMetadata=1':'/api/fqc/workflow?caseMetadata=1',key='shared-draft-v3-operation:actor-a:'+endpoint,raw='{legacy command rawmedia private buffer';const f=await fixture(scope,{data:new Map([[key,raw]])});
   f.api.edit();f.tick();await f.api.apply();assert.equal(posts(f).length,1);assert.equal(f.data.get(key),raw);assert(![...f.initialStorageCalls,...f.storageCalls].some(([,name])=>name===key));assert.equal(f.api.dirty(),false);await f.close();
 });
 void test(scope+' 100 input edits have zero requests and a single bounded debounce write',async()=>{
   const f=await fixture(scope);for(let i=0;i<100;i++)f.api.edit(scope==='PROCESS'?'Name '+i:i);assert.equal(f.calls.length,0);assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,0);f.tick();assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,1);await f.close();
 });
 void test(scope+' metadata inventory and failed active-source claim never read its buffer',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0],copy=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});copy.storageCalls.length=0;const item=copy.api.discover().items.find(item=>item.key===key);assert(item);assert.equal(item.kind,undefined);assert.equal(item.payload,undefined);assert(!copy.storageCalls.some(([kind,name])=>kind==='get'&&name===key));await assert.rejects(copy.api.preview(key),/RECOVERY_IN_USE/);assert(!copy.storageCalls.some(([kind,name])=>kind==='get'&&name===key));assert.equal(copy.calls.length,0);await source.close();await copy.close();
 });
 void test(scope+' explicit restore preserves lineage through unknown; ancestor cannot replay',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0],raw=source.data.get(key);await source.close();
   const restored=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});const originalSession=restored.api.session?.();await restored.api.restore(key);assert.equal(restored.calls.length,2);assert.equal(posts(restored).length,0);if(originalSession)assert.equal(restored.api.session(),originalSession);restored.tick();
   const copy=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});await assert.rejects(copy.api.restore(key),/RECOVERY_IN_USE/);assert.equal(copy.calls.length,0);await copy.close();
   restored.mode('unknown');try{await restored.api.apply();}catch(error){assert.match(error.message,/UNKNOWN/);}assert.equal(posts(restored).length,1);assert(restored.api.dirty());assert.equal(restored.data.get(key),raw);await restored.close();
   const reload=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});reload.storageCalls.length=0;await assert.rejects(reload.api.restore(key),/LINEAGE|RECEIPT|RESOLVED/);assert(!reload.storageCalls.some(([kind,name])=>kind==='get'&&name===key));assert.equal(posts(reload).length,0);await reload.close();
 });
 void test(scope+' actual unknown transport queries only original receipt and never POSTs twice',async()=>{
   const f=await fixture(scope,{mode:'unknown'});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/UNKNOWN/);}const command=posts(f)[0].body.command,key=localKeys(f)[0];assert(command);await assert.rejects(f.api.receipt(key),/OPERATION_NOT_FOUND/);assert.equal(posts(f).length,1);assert(receiptGets(f).every(event=>new URL(event.url,'https://fixture.invalid').searchParams.get('operationId')===command.operationId));f.mode('ok');await f.api.receipt(key);assert.equal(posts(f).length,1);assert.equal(f.api.dirty(),false);await f.close();
 });
 void test(scope+' confirmed rebase retains restored lineage before the next unknown Apply',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0],raw=source.data.get(key);await source.close();const restored=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});await restored.api.restore(key);restored.tick();
   if(scope==='PROCESS')restored.remote.working.CUT[0].name='Other actor';else restored.remote.working.items[0].productCodes=['P8'];restored.remote.revision++;
   try{await restored.api.apply();}catch(error){assert.match(error.message,/DEPENDENCY_CHANGED/);}assert.equal(posts(restored).length,1);assert(restored.api.dirty());await restored.api.review();assert(restored.api.dirty());
   restored.mode('unknown');try{await restored.api.apply();}catch(error){assert.match(error.message,/UNKNOWN/);}assert.equal(posts(restored).length,2);assert.equal(restored.data.get(key),raw);await restored.close();const copy=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});await assert.rejects(copy.api.restore(key),/LINEAGE|RECEIPT|RESOLVED/);assert.equal(posts(copy).length,0);await copy.close();
 });
 void test(scope+' terminal cleanup failure has explicit exact finalization without a second POST',async()=>{
   const f=await fixture(scope);f.api.edit();f.removeHook(key=>{if(key.startsWith('process-local-draft-v2:'))throw Error('SYNTHETIC_REMOVE_DENIED');});try{await f.api.apply();}catch(error){assert.match(error.message,/SETTLEMENT|REMOVE/);}assert.equal(posts(f).length,1);assert(f.api.dirty());const key=localKeys(f)[0],preview=await f.api.preview(key);assert.equal(preview.kind,'resolved');assert.equal(preview.outcome,'receipt');assert.equal(preview.payload,undefined);
   if(scope==='PROCESS')f.api.edit('Newer input');f.removeHook(null);await f.api.finalize(key);assert.equal(posts(f).length,1);assert.equal(f.data.has(key),false);if(scope==='PROCESS'){assert.equal(f.api.value(),'Newer input');assert(f.api.dirty());}else assert.equal(f.api.dirty(),false);await f.close();
 });
 void test(scope+' proven rejection cleanup failure finalizes only the exact aborted marker and keeps input',async()=>{
   const f=await fixture(scope);f.api.edit();if(scope==='PROCESS')f.remote.working.CUT[0].name='Remote changed';else f.remote.working.items[0].productCodes=['P8'];f.remote.revision++;
   f.removeHook(key=>{if(key.startsWith('process-local-draft-v2:'))throw Error('SYNTHETIC_REMOVE_DENIED');});try{await f.api.apply();}catch(error){assert.match(error.message,/DEPENDENCY_CHANGED/);}assert.equal(posts(f).length,1);const key=localKeys(f)[0],preview=await f.api.preview(key);assert.equal(preview.kind,'resolved');assert.equal(preview.outcome,'aborted');const before=f.api.value(),requests=f.calls.length;f.removeHook(null);await f.api.finalize(key);assert.equal(f.calls.length,requests);assert.deepEqual(f.api.value(),before);assert(f.api.dirty());await f.close();
 });
 void test(scope+' BFCache rebuilds primary and cannot adopt a pre-pagehide late ACK',async()=>{
   const f=await fixture(scope);let release;const held=new Promise(done=>release=done),originalClient=f.api.client();f.hook(event=>event.body?.command?held:undefined);f.api.edit();const pending=f.api.apply().catch(error=>error);await turn();assert.equal(posts(f).length,1);const key=localKeys(f)[0];f.box.dispatchEvent({type:'pagehide'});f.box.dispatchEvent({type:'pageshow',persisted:true});await turn();const nextClient=f.api.client();assert.notEqual(nextClient,originalClient);await nextClient.read();release();await pending;assert(f.api.dirty());assert(f.data.has(key));assert.equal(posts(f).length,1);
   f.hook(null);await f.api.receipt(key);assert.equal(posts(f).length,1);assert.equal(f.api.dirty(),false);assert.deepEqual(clone(f.box.sharedDraftAccountState()),{queued:0,unknown:false,failed:false});await f.close();
 });
 void test(scope+' suspended explicit restore reuses authorization GET and still performs exactly two GETs',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0];await source.close();const f=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});f.box.dispatchEvent({type:'pagehide'});f.box.dispatchEvent({type:'pageshow',persisted:true});await turn();await f.api.restore(key);assert.equal(f.calls.filter(event=>event.method==='GET').length,2);assert.equal(posts(f).length,0);assert(f.api.dirty());await f.close();
 });
 void test(scope+' late-owner resume read cannot activate recovery or expose a source payload',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0],raw=source.data.get(key);await source.close();const f=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});f.box.dispatchEvent({type:'pagehide'});f.box.dispatchEvent({type:'pageshow',persisted:true});await turn();f.hook(event=>{if(event.method==='GET')f.epoch(2);});f.storageCalls.length=0;await assert.rejects(f.api.restore(key),/OWNER_CHANGED|CONTEXT_CHANGED|DEPENDENCY_CHANGED/);assert.equal(posts(f).length,0);assert.equal(f.data.get(key),raw);assert(!f.storageCalls.some(([kind,name])=>kind==='get'&&name===key));await f.close();
 });
 void test(scope+' repeated same-owner factory calls retain one primary ordered stream',async()=>{
   const f=await fixture(scope),primary=f.api.client(),again=f.box.createSharedDraftClient({endpoint:f.endpoint,actorId:'actor-a',headers:()=>({'Content-Type':'application/json'}),externalDurableBounded:{scope}});assert.equal(again,primary);await f.close();
 });
 void test(scope+' explicit discard abandons all restored intent before any new local batch',async()=>{
   const source=await fixture(scope);source.api.edit();source.tick();const key=localKeys(source)[0],raw=source.data.get(key);await source.close();const f=await fixture(scope,{data:source.data,locks:source.locks,remote:source.remote});await f.api.restore(key);f.tick();f.api.discard();await turn();assert.equal(f.api.dirty(),false);assert.equal(f.api.client().hasUnknown(),false);assert.deepEqual(f.api.value(),scope==='PROCESS'?'Original':[]);assert.equal(f.data.get(key),raw);assert.equal(posts(f).length,0);
   f.api.edit(scope==='PROCESS'?'Entirely new input':7);f.tick();const local=localKeys(f).filter(name=>name!==key).map(name=>JSON.parse(f.data.get(name)));assert.equal(local.length,1);assert.equal(local[0].kind,'local');if(scope==='PROCESS')assert.equal(local[0].payload.desired,'Entirely new input');else assert.deepEqual(local[0].payload.rows[0].codes,['P7']);await f.close();
 });
 void test(scope+' unknown Apply cannot discard or fork away from its exact receipt marker',async()=>{
   const f=await fixture(scope,{mode:'unknown'});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/UNKNOWN/);}const before=new Map(f.data),value=f.api.value();try{f.api.discard();}catch(error){assert.match(error.message,/UNKNOWN/);}assert.deepEqual(f.data,before);assert.deepEqual(f.api.value(),value);assert(f.api.dirty());assert.equal(f.api.client().hasUnknown(),true);assert.equal(posts(f).length,1);await f.close();
 });
 for(const mode of ['stale','pending'])void test(scope+' actual private proof returns selected '+mode+' rejection to local without retry',async()=>{
   const f=await fixture(scope,{mode});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/STALE_GENERATION|PENDING_LOCKED/);}f.tick();assert.equal(posts(f).length,1);assert.equal(f.api.client().hasUnknown(),false);assert(f.api.dirty());const records=localKeys(f).map(key=>JSON.parse(f.data.get(key)));assert.equal(records.some(record=>record.kind==='unknown'),false);assert.equal(records.some(record=>record.kind==='local'),true);assert(![...f.data.keys()].some(key=>key.startsWith('shared-draft-receipt-only-v1:')));await f.close();
 });
 for(const bad of [true,{}])void test(scope+' forged '+(bad===true?'Boolean':'object')+' cannot clear helper marker after a broad rejection',async()=>{
   const f=await fixture(scope,{mode:'pending'});f.api.client().rejectionCapability=()=>bad;f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}assert.equal(posts(f).length,1);const marker=localKeys(f).map(key=>JSON.parse(f.data.get(key))).find(record=>record.kind==='unknown');assert(marker);assert(f.api.dirty());await f.close();
 });
 void test(scope+' missing UUID cannot upgrade broad response into a trusted helper rejection',async()=>{
   const f=await fixture(scope,{mode:'pending-no-id'});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}assert.equal(posts(f).length,1);assert.equal(f.api.client().hasUnknown(),true);assert(localKeys(f).some(key=>JSON.parse(f.data.get(key)).kind==='unknown'));await f.close();
 });
 void test(scope+' receipt GET rejection cannot consume original dispatch capability',async()=>{
   const f=await fixture(scope,{mode:'unknown'});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/UNKNOWN/);}const key=localKeys(f)[0],raw=f.data.get(key);f.mode('get-pending');await assert.rejects(f.api.receipt(key),/PENDING_LOCKED/);assert.equal(f.data.get(key),raw);assert.equal(posts(f).length,1);assert.equal(f.api.client().hasUnknown(),true);await f.close();
 });
 void test(scope+' late-owner HTTP rejection cannot clear either durable marker',async()=>{
   const f=await fixture(scope,{mode:'pending'});f.hook(event=>{if(event.body?.command)f.epoch(2);});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/OWNER_CHANGED/);}assert.equal(posts(f).length,1);assert([...f.data].some(([key,raw])=>key.startsWith('process-local-draft-v2:')&&JSON.parse(raw).kind==='unknown'));assert([...f.data.keys()].some(key=>key.startsWith('shared-draft-receipt-only-v1:')));await f.close();
 });
 for(const where of ['transport','helper'])void test(scope+' '+where+' rejection cleanup failure never loses the remaining recovery evidence',async()=>{
   const f=await fixture(scope,{mode:'pending'});f.removeHook(key=>{if(key.startsWith(where==='transport'?'shared-draft-receipt-only-v1:':'process-local-draft-v2:'))throw Error('SYNTHETIC_REMOVE_DENIED');});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/REMOVE|PENDING_LOCKED|RECOVERY/);}assert.equal(posts(f).length,1);
   if(where==='helper'){const key=localKeys(f)[0],preview=await f.api.preview(key);assert.equal(preview.kind,'resolved');assert.equal(preview.outcome,'aborted');}else{assert.equal(localKeys(f).length,0,'helper already proved ABORTED; central marker still fences original input');assert.equal(f.api.client().hasUnknown(),true);}
   const requests=f.calls.length,value=f.api.value();f.removeHook(null);f.api.finalizeRejected();assert.equal(f.calls.length,requests);assert.deepEqual(f.api.value(),value);assert(f.api.dirty());assert.equal(f.api.client().hasUnknown(),false);assert.equal(posts(f).length,1);await f.close();
 });
 void test(scope+' wrapping the actual sender promise invalidates the opaque rejection capability',async()=>{
   const f=await fixture(scope,{mode:'pending'}),client=f.api.client(),send=client.sendPrepared;client.sendPrepared=(...args)=>send(...args).then(value=>value);f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}assert.equal(posts(f).length,1);assert(localKeys(f).some(key=>JSON.parse(f.data.get(key)).kind==='unknown'));assert(f.api.dirty());await f.close();
 });
 void test(scope+' fetch-thrown lookalike rejection never receives a private HTTP capability',async()=>{
   const f=await fixture(scope);f.hook(event=>{if(event.body?.command)throw Object.assign(Error('PENDING_LOCKED'),{status:409,requestId:'12345678-1234-4234-8234-123456789abc'});});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}assert.equal(posts(f).length,1);assert.equal(f.api.client().hasUnknown(),true);assert(localKeys(f).some(key=>JSON.parse(f.data.get(key)).kind==='unknown'));await f.close();
 });
 void test(scope+' reload without RAM rejection proof keeps cleanup-failed reference receipt-only',async()=>{
   const f=await fixture(scope,{mode:'pending'});f.removeHook(key=>{if(key.startsWith('shared-draft-receipt-only-v1:'))throw Error('SYNTHETIC_REMOVE_DENIED');});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}await f.close();const next=await fixture(scope,{data:f.data,locks:f.locks,remote:f.remote});assert.equal(next.api.client().hasUnknown(),true);await assert.rejects(next.api.client().resolveUnknown(),/OPERATION_NOT_FOUND/);assert.equal(posts(next).length,0);assert.equal(next.api.client().hasUnknown(),true);await next.close();
 });
 void test(scope+' cleanup UI works when only the transport marker remains, without GET or POST',async()=>{
   const f=await fixture(scope,{mode:'pending'});f.removeHook(key=>{if(key.startsWith('shared-draft-receipt-only-v1:'))throw Error('SYNTHETIC_REMOVE_DENIED');});f.api.edit();try{await f.api.apply();}catch(error){assert.match(error.message,/PENDING_LOCKED/);}assert.equal(localKeys(f).length,0);f.removeHook(null);const requests=f.calls.length;await f.api.open();const button=f.document.querySelectorAll('button').find(node=>node.textContent==='完成已拒絕操作清理');assert(button);await button.click();assert.equal(f.calls.length,requests);assert.equal(f.api.client().hasUnknown(),false);assert(f.api.dirty());await f.close();
 });
 void test(scope+' selected prepareRecovery cannot omit actual single-use proof',async()=>{
   const f=await fixture(scope),client=f.api.client(),command=client.prepareRecovery('g1',{patches:[],guards:[]});assert.throws(()=>client.sendPrepared(command),error=>error.notSent===true);assert.equal(posts(f).length,0);await f.close();
 });
 void test(scope+' primary cache rebuilds for same-account epoch and delivery changes',async()=>{
   const f=await fixture(scope),first=f.api.client();f.epoch(2);const second=f.api.client();assert.notEqual(second,first);f.delivery();const third=f.api.client();assert.notEqual(third,second);f.actor('actor-a');assert.notEqual(f.api.client(),third);assert.equal(posts(f).length,0);await f.close();
 });
}
void test('FQC ordinary dialog Apply with matrix-shaped paths is not mislabeled as selected recovery',async()=>{
 const f=await fixture('FQC'),client=f.api.client();await client.command('g1','apply',{patches:[{op:'set',path:['items',{id:'I1'},'productCodes'],value:['P7']}],guards:[{path:['items',{id:'I1'},'productCodes'],value:[]}]});assert.equal(posts(f).length,1);assert.deepEqual(f.remote.working.items[0].productCodes,['P7']);await f.close();
});
