// Actual primary transport + helper + session + complete IPQC-C module. Synthetic
// fetch, DOM, Web Locks and Web Storage only; no browser/server/live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const helperSource=process.env.IPQCC_HELPER_SOURCE?fs.readFileSync(process.env.IPQCC_HELPER_SOURCE,'utf8'):source('local-draft-recovery.js');
const sessionSource=process.env.IPQCC_SESSION_SOURCE?fs.readFileSync(process.env.IPQCC_SESSION_SOURCE,'utf8'):source('local-draft-recovery-session.js');
const transport=process.env.IPQCC_TRANSPORT_SOURCE?fs.readFileSync(process.env.IPQCC_TRANSPORT_SOURCE,'utf8'):source('shared-draft-client.js');
const clone=value=>JSON.parse(JSON.stringify(value)),turn=()=>new Promise(setImmediate);
const endpoint='/api/ipqc-c/workflow?caseMetadata=1';
function lockManager(){const held=new Set();return{request(name,_options,callback){if(held.has(name))return Promise.resolve(callback(null));held.add(name);return Promise.resolve(callback({name})).finally(()=>held.delete(name));}};}
function remoteState(){return{scope:'ipqc-c',generation:'g1',revision:1,working:{errors:[{id:'E1',name:'Original',note:'Old note',code:'C-1-L1',productCode:'P1',stageCode:'S1'}],items:[]},saved:{id:'s1',revision:1,actor:{id:'actor-a',name:'Synthetic'},at:'fixture'},pendingId:null,activeId:null,contributors:{},editable:true};}
async function fixture({data=new Map(),locks=lockManager(),remote=remoteState(),mode='ok',cold=false}={}){
 const {document,events}=canvasDOM(),calls=[],storageCalls=[],timers=new Map(),receipts=new Map();let actor={id:'actor-a'},epoch=1,delivery=1,nextMode=mode,hook=null,removeHook=null,setHook=null,getHook=null,serial=0;
 let permissions={view:true,edit:true,save:true,submit:true,history:true,restore:true,create:true,delete:true,withdraw:true,approve:true,return:true};
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem(key){storageCalls.push(['get',key]);getHook?.(key);return data.get(key)??null;},setItem(key,value){setHook?.(key,value);storageCalls.push(['set',key,value]);data.set(key,String(value));},removeItem(key){storageCalls.push(['remove',key]);removeHook?.(key);data.delete(key);},clear(){throw Error('UNRELATED_CLEAR');}};
 const control=()=>({activeVersionId:null,versions:[{id:'shared-g1',status:'draft',snapshot:clone(remote.working),number:1,history:[]}],workflow:{...clone(remote),cases:[],saved:{...clone(remote.saved),content:clone(remote.working)}}});
 const state=()=>({revision:remote.revision,permissions:{...permissions},workflow:clone(remote)});
 const box=events({console,document,crypto:webcrypto,TextEncoder,Uint8Array,URL,URLSearchParams,Response,AbortController,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:storage,sessionStorage:storage,navigator:locks?{locks}:{},CustomEvent:class{constructor(type){this.type=type;}},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},confirm:()=>true,alert(){},toast(){}});box.window=box;
 box.ProcessSync={get identity(){return actor;},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,platformHeaders:()=>({'Content-Type':'application/json'})};
 box.VersionDraftUI={preserveView:()=>()=>{},t:key=>key,date:()=>'',reasonFor:()=>'',confirmSubmit:async()=> 'fixture submit',confirmReview:async()=>({reason:'fixture review'})};
 box.ProcessIPQC={mountReferences:async()=>{},referenceMarkup:()=>''};
 box.fetch=async(url,options={})=>{const params=new URL(url,'https://fixture.invalid').searchParams,body=options.body?JSON.parse(options.body):null,event={url,method:options.method||'GET',body};calls.push(event);await hook?.(event);
  if(body?.action==='begin')return Response.json({control:control(),revision:remote.revision});
  if(body?.command){const command=body.command;
   if(['pending','stale'].includes(nextMode))return Response.json({error:nextMode==='pending'?'PENDING_LOCKED':'STALE_GENERATION',requestId:'12345678-1234-4234-8234-123456789abc'},{status:409});
   if(nextMode==='unknown404')throw Error('LOST_RESPONSE');
   for(const guard of command.guards||[]){let value=remote.working;for(const part of guard.path)value=typeof part==='object'?value?.find(row=>row.id===part.id):value?.[part];if(JSON.stringify(value)!==JSON.stringify(guard.value))return Response.json({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:guard.path}},{status:409});}
   for(const patch of command.patches||[]){let target=remote.working;for(const part of patch.path.slice(0,-1))target=typeof part==='object'?target.find(row=>row.id===part.id):target[part];target[patch.path.at(-1)]=clone(patch.value);}
   remote.revision++;const receipt={operationId:command.operationId,generation:command.generation,revision:remote.revision,savedId:remote.saved?.id||null,caseId:null,unchanged:false};receipts.set(command.operationId,receipt);
   if(nextMode==='unknown')throw Error('LOST_RESPONSE');return Response.json({control:control(),revision:remote.revision,receipt,permissions:{...permissions}});
  }
  if(params.has('operationId')){const receipt=receipts.get(params.get('operationId'));if(nextMode.startsWith('unknown')||!receipt)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return Response.json({receipt});}
  if(url.startsWith('/api/ipqc-c?'))return Response.json({control:control(),revision:remote.revision,catalog:{products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]}});
  if(params.has('permissions'))return Response.json({permissions:{...permissions},revision:remote.revision});
  return Response.json(state());
 };
 vm.createContext(box);for(const [name,text] of [['transport',transport],['helper',helperSource],['session',sessionSource]])vm.runInContext(text,box,{filename:name+'.js'});
 const area=document.createElement('section');area.innerHTML='<section id="ipqcc-page"><form id="ipqcc-editor"><input name="name"><textarea name="note"></textarea></form></section>';document.body.append(area);
 const hookSource=`\nwindow.__errorRecoveryTest={setup(value,element){control=value;working=copy(value.workflow.working);revision=value.workflow.revision;selectedVersionId='shared-'+value.workflow.generation;host=element;catalog={products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]};},sharedTransport,prepareErrorRecovery,restoreErrorRecovery,discardErrorRecovery,resolveErrorRecovery,reconcileErrorRecovery,finalizeErrorRecoveryRejection,openErrorRecovery,errorRecoveryProjection,startEditor,closeEditor,bind,writeShared,checkErrorRecoveryRead,validateErrorRecovery,queueErrorRecovery,discardUnsentScope,mainHTML,\nstate:()=>({modal,recovery:errorRecovery,pending:errorRecoveryPending,revision:errorRecoveryRevision,control,working,message}),\nedit(name,value){modal.fields[name]=value;modal.dirty=true;errorRecoveryRevision++;queueErrorRecovery();},setModal(value){modal=value;},selected(value){selectedVersionId=value;},\napply(){const target=modal,keys=['name','note','reason'].filter(key=>String(target.fields[key]??'')!==target.base[key]);return writeShared('apply',{patches:keys.map(key=>({op:'set',path:['errors',{id:target.existingId},key],value:target.fields[key]??''})),guards:keys.map(key=>({path:['errors',{id:target.existingId},key],value:target.base[key]}))},true);}};\n`;
 const moduleSource=source('ipqc-c.js'),end=moduleSource.lastIndexOf('})();');vm.runInContext(moduleSource.slice(0,end)+hookSource+moduleSource.slice(end),box,{filename:'ipqc-c.js'});
 const api=box.__errorRecoveryTest;api.setup(control(),area);if(cold)await api.sharedTransport().permissions();else await api.sharedTransport().read();api.prepareErrorRecovery();await api.state().recovery.session.ready;api.bind();
 const initialStorageCalls=storageCalls.slice();calls.length=0;storageCalls.length=0;
 return{api,box,document,area,data,remote,locks,calls,storageCalls,initialStorageCalls,receipts,start(){api.startEditor('error',api.state().working.errors[0]);},edit(value='Local'){api.edit('name',value);},tick(){const run=[...timers].filter(([,v])=>v.ms===250);for(const [id,{fn}]of run){timers.delete(id);fn();}},async close(){box.dispatchEvent({type:'pagehide'});await turn();},mode:value=>nextMode=value,hook:value=>hook=value,removeHook:value=>removeHook=value,setHook:value=>setHook=value,getHook:value=>getHook=value,permissions:value=>permissions={...permissions,...value},epoch:value=>epoch=value,actor:value=>actor={id:value},delivery:()=>delivery++};
}
const posts=f=>f.calls.filter(call=>call.method==='POST');
const session=f=>f.api.state().recovery.session;
const keys=f=>session(f).discover().items.map(item=>item.key);
// Unsubmitted-form persistence and restoration were retired by the explicit
// 2026-11-12 requirement. Keep sent-operation safety cases below; new cases
// assert RAM-only input and silent discard rather than re-enabling old recovery.
void test('existing error edits and composition stay RAM-only with zero request or payload storage',async()=>{
 const f=await fixture();f.start();const prior=new Map(f.data);f.edit('名稱 Việt');f.tick();
 assert.equal(f.api.state().modal.fields.name,'名稱 Việt');assert.equal(f.calls.length,0);assert.deepEqual(f.data,prior);
 assert(!f.storageCalls.some(([kind])=>kind==='set'));await f.close();
});
void test('scope departure silently discards input and preserves existing receipt bytes',async()=>{
 const f=await fixture();f.start();f.edit();const key='unrelated-original-receipt',raw='preserved';f.data.set(key,raw);f.api.discardUnsentScope();
 assert.equal(f.api.state().modal,null);assert.equal(f.api.state().working.errors[0].name,'Original');assert.equal(f.data.get(key),raw);assert.equal(f.calls.length,0);await f.close();
});
void test('current page has no unsent recovery or complete-latest conflict entry',async()=>{
 const f=await fixture();const html=f.api.mainHTML();for(const id of ['ipqcc-recovery','ipqcc-recovery-reconcile','ipqcc-reload','ipqcc-case-restore'])assert(!html.includes('id="'+id+'"'),id);await f.close();
});
void test('selected Apply uses actual transport, exact guards, receipt-only durable markers and clears only submitted input',async()=>{
 const oldKey='shared-draft-v3-operation:actor-a:'+endpoint,raw='legacy secret command unchanged',f=await fixture({data:new Map([[oldKey,raw]])});f.start();f.edit();await f.api.apply();assert.equal(posts(f).length,1);assert.equal(f.api.state().modal,null);assert.equal(f.remote.working.errors[0].name,'Local');assert.equal(f.data.get(oldKey),raw);assert(![...f.initialStorageCalls,...f.storageCalls].some(([,key])=>key===oldKey));assert(!f.api.sharedTransport().hasUnknown());await f.close();
});
void test('quota before durability preserves original local bytes and RAM with zero POST',async()=>{
 const f=await fixture();f.start();f.edit('Old durable');f.tick();const key=keys(f)[0],raw=f.data.get(key);f.edit('Newest RAM');f.setHook(()=>{throw Error('quota');});await f.api.apply();assert.equal(posts(f).length,0);assert.equal(f.data.get(key),raw);assert.equal(f.api.state().modal.fields.name,'Newest RAM');f.setHook(null);await f.close();
});
void test('same-account epoch replacement cannot persist old modal under a new recovery owner',async()=>{
 const f=await fixture();f.start();f.edit();f.tick();const before=new Map(f.data);f.epoch(2);f.edit('New epoch old modal');f.tick();await f.api.apply();assert.equal(posts(f).length,0);assert.deepEqual(f.data,before);assert.equal(f.api.state().modal.fields.name,'New epoch old modal');await f.close();
});
void test('readback newer than POST control uses original owned full read instead of stale adoption',async()=>{
 const f=await fixture();let changed=false;f.hook(event=>{if(!changed&&event.method==='GET'&&posts(f).length){changed=true;f.remote.revision++;f.remote.working.errors[0].note='Changed after ACK';}});await f.api.writeShared('apply',{patches:[],guards:[]},false);assert.equal(posts(f).length,1);assert.equal(f.api.state().control.workflow.revision,f.remote.revision);assert.equal(f.api.state().working.errors[0].note,'Changed after ACK');assert(f.calls.some(call=>call.url.startsWith('/api/ipqc-c?')));await f.close();
});
void test('ordinary unselected Apply remains on primary client and does not produce a local-form payload',async()=>{
 const f=await fixture();await f.api.writeShared('apply',{patches:[{op:'set',path:['errors',{id:'E1'},'note'],value:'Ordinary apply'}],guards:[{path:['errors',{id:'E1'},'note'],value:'Old note'}]},false);assert.equal(posts(f).length,1);assert.equal(f.remote.working.errors[0].note,'Ordinary apply');assert.equal(keys(f).length,0);assert.equal(f.api.state().modal,null);await f.close();
});
