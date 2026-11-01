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
function remoteState(){return{scope:'ipqc-c',generation:'g1',revision:1,working:{errors:[{id:'E1',name:'Original',note:'Old note',code:'C-1-L1',productCode:'P1',stageCode:'S1'}],items:[]},saved:{id:'s1',revision:1},pendingId:null,activeId:null,contributors:{},editable:true};}
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
 const hookSource=`\nwindow.__errorRecoveryTest={setup(value,element){control=value;working=copy(value.workflow.working);revision=value.workflow.revision;selectedVersionId='shared-'+value.workflow.generation;host=element;catalog={products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]};},sharedTransport,prepareErrorRecovery,restoreErrorRecovery,discardErrorRecovery,resolveErrorRecovery,reconcileErrorRecovery,finalizeErrorRecoveryRejection,openErrorRecovery,errorRecoveryProjection,startEditor,closeEditor,bind,writeShared,checkErrorRecoveryRead,validateErrorRecovery,queueErrorRecovery,\nstate:()=>({modal,recovery:errorRecovery,pending:errorRecoveryPending,revision:errorRecoveryRevision,control,working,message}),\nedit(name,value){modal.fields[name]=value;modal.dirty=true;errorRecoveryRevision++;queueErrorRecovery();},setModal(value){modal=value;},selected(value){selectedVersionId=value;},\napply(){const target=modal,keys=['name','note','reason'].filter(key=>String(target.fields[key]??'')!==target.base[key]);return writeShared('apply',{patches:keys.map(key=>({op:'set',path:['errors',{id:target.existingId},key],value:target.fields[key]??''})),guards:keys.map(key=>({path:['errors',{id:target.existingId},key],value:target.base[key]}))},true);}};\n`;
 const moduleSource=source('ipqc-c.js'),end=moduleSource.lastIndexOf('})();');vm.runInContext(moduleSource.slice(0,end)+hookSource+moduleSource.slice(end),box,{filename:'ipqc-c.js'});
 const api=box.__errorRecoveryTest;api.setup(control(),area);if(cold)await api.sharedTransport().permissions();else await api.sharedTransport().read();api.prepareErrorRecovery();await api.state().recovery.session.ready;api.bind();
 const initialStorageCalls=storageCalls.slice();calls.length=0;storageCalls.length=0;
 return{api,box,document,area,data,remote,locks,calls,storageCalls,initialStorageCalls,receipts,start(){api.startEditor('error',api.state().working.errors[0]);},edit(value='Local'){api.edit('name',value);},tick(){const run=[...timers].filter(([,v])=>v.ms===250);for(const [id,{fn}]of run){timers.delete(id);fn();}},async close(){box.dispatchEvent({type:'pagehide'});await turn();},mode:value=>nextMode=value,hook:value=>hook=value,removeHook:value=>removeHook=value,setHook:value=>setHook=value,getHook:value=>getHook=value,permissions:value=>permissions={...permissions,...value},epoch:value=>epoch=value,actor:value=>actor={id:value},delivery:()=>delivery++};
}
const posts=f=>f.calls.filter(call=>call.method==='POST');
const session=f=>f.api.state().recovery.session;
const keys=f=>session(f).discover().items.map(item=>item.key);
async function savedSource(){const f=await fixture();f.start();f.edit();f.tick();const key=keys(f)[0];await f.close();return {f,key};}
void test('existing error input uses one lazy bounded flush; does not serialize working/photos or GET/POST',async()=>{
 const f=await fixture();f.start();vm.runInContext('this.inputStringifies=0;const originalStringify=JSON.stringify;JSON.stringify=(...args)=>{inputStringifies++;return originalStringify(...args);};',f.box);for(let i=0;i<100;i++)f.edit('Name '+i);assert.equal(f.box.inputStringifies,0);assert.equal(f.calls.length,0);assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,0);f.tick();assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,1);const raw=f.data.get(keys(f)[0]),payload=JSON.parse(raw).payload;assert.deepEqual(Object.keys(payload).sort(),['base','errorId','fields','versionId']);assert.equal(payload.fields.name,'Name 99');assert.equal(payload.base.reason,null);assert(!raw.includes('productCode'));await f.close();
});
void test('unsupported new rows/items/files never schedule, and actual null baseline is rejected',async()=>{
 const f=await fixture();for(const modal of [{kind:'error',existingId:'',base:null,fields:{name:'new'},photos:[],dirty:true},{kind:'item',existingId:'I1',base:{},fields:{description:'text'},photos:[{file:{name:'synthetic.png'},preview:'blob:fixture'}],dirty:true}]){f.api.setModal(modal);f.api.queueErrorRecovery();}f.tick();assert.equal(f.data.size,0);assert.equal(f.calls.length,0);f.start();f.api.state().modal.base.note=null;assert.throws(()=>f.api.errorRecoveryProjection(),/INVALID_ERROR_FORM_RECOVERY/);await f.close();
});
void test('metadata-only discovery and active source claim perform zero historical payload reads',async()=>{
 const f=await fixture();f.start();f.edit();f.tick();const key=keys(f)[0],next=await fixture({data:f.data,locks:f.locks,remote:f.remote});next.storageCalls.length=0;assert(keys(next).includes(key));assert(!next.storageCalls.some(([kind,name])=>kind==='get'&&name===key));await assert.rejects(next.api.restoreErrorRecovery(key,async()=>true),/RECOVERY_IN_USE/);assert(!next.storageCalls.some(([kind,name])=>kind==='get'&&name===key));assert.equal(next.calls.length,0);await next.close();await f.close();
});
void test('explicit restore uses two fresh top-level workflow GETs, no automatic hydration or POST',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote});assert.equal(next.api.state().modal,null);await next.api.restoreErrorRecovery(key,async()=>true);assert.equal(next.calls.length,2);assert(next.calls.every(call=>call.method==='GET'&&call.url.startsWith(endpoint)));assert.equal(next.api.state().modal.fields.name,'Local');assert.equal(next.api.state().modal.fields.reason,'');assert.equal(posts(next).length,0);await next.close();
});
for(const condition of ['pending','view','edit','newer','late-owner','new-input'])void test('restore rejects '+condition+' without hydrating old local bytes',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote});if(condition==='pending')next.remote.pendingId='case1';if(condition==='view')next.permissions({view:false});if(condition==='edit')next.permissions({edit:false});if(condition==='newer')next.remote.revision++;
 await assert.rejects(next.api.restoreErrorRecovery(key,async()=>{if(condition==='late-owner')next.epoch(2);if(condition==='new-input'){next.start();next.edit('new input');}return true;}));assert.equal(next.api.state().modal?.fields.name,condition==='new-input'?'new input':undefined);assert.equal(posts(next).length,0);assert(f.data.has(key));await next.close();
});
void test('selected Apply uses actual transport, exact guards, receipt-only durable markers and clears only submitted input',async()=>{
 const oldKey='shared-draft-v3-operation:actor-a:'+endpoint,raw='legacy secret command unchanged',f=await fixture({data:new Map([[oldKey,raw]])});f.start();f.edit();await f.api.apply();assert.equal(posts(f).length,1);assert.equal(f.api.state().modal,null);assert.equal(f.remote.working.errors[0].name,'Local');assert.equal(f.data.get(oldKey),raw);assert(![...f.initialStorageCalls,...f.storageCalls].some(([,key])=>key===oldKey));assert(!f.api.sharedTransport().hasUnknown());await f.close();
});
void test('input arriving during Apply survives ACK, same session/lineage persists and next Apply sends it',async()=>{
 const f=await fixture();f.start();f.edit();const initial=session(f);let release;const hold=new Promise(done=>release=done);f.hook(event=>event.body?.command?hold:undefined);const apply=f.api.apply();await turn();f.edit('Newer');release();await apply;assert.equal(f.api.state().modal.fields.name,'Newer');assert.equal(session(f),initial);f.tick();assert.equal(JSON.parse(f.data.get(keys(f)[0])).payload.fields.name,'Newer');f.hook(null);await f.api.apply();assert.equal(posts(f).length,2);assert.equal(f.remote.working.errors[0].name,'Newer');await f.close();
});
void test('unknown receipt 404 never rePOSTs, discards or restores editable content',async()=>{
 const f=await fixture({mode:'unknown404'});f.start();f.edit();await f.api.apply();const key=keys(f)[0],raw=f.data.get(key);assert.equal(JSON.parse(raw).kind,'unknown');await assert.rejects(f.api.resolveErrorRecovery(key),/OPERATION_NOT_FOUND/);f.api.closeEditor(true,false);assert(f.api.state().modal);assert.equal(f.data.get(key),raw);assert.equal(posts(f).length,1);await f.close();const next=await fixture({data:f.data,locks:f.locks,remote:f.remote});await assert.rejects(next.api.restoreErrorRecovery(key,async()=>true));assert.equal(posts(next).length,0);assert.equal(next.api.state().modal,null);await next.close();
});
void test('quota before durability preserves original local bytes and RAM with zero POST',async()=>{
 const f=await fixture();f.start();f.edit('Old durable');f.tick();const key=keys(f)[0],raw=f.data.get(key);f.edit('Newest RAM');f.setHook(()=>{throw Error('quota');});await f.api.apply();assert.equal(posts(f).length,0);assert.equal(f.data.get(key),raw);assert.equal(f.api.state().modal.fields.name,'Newest RAM');f.setHook(null);await f.close();
});
for(const where of ['helper','transport'])void test(where+' known rejection cleanup retains RAM proof and explicitly retries with zero requests',async()=>{
 const f=await fixture({mode:'pending'});f.start();f.edit();f.removeHook(key=>{if(key.startsWith(where==='helper'?'process-local-draft-v2:':'shared-draft-receipt-only-v1:'))throw Error('remove denied');});await f.api.apply();assert.equal(posts(f).length,1);assert(f.api.state().pending?.rejection);const count=f.calls.length;f.removeHook(null);f.api.finalizeErrorRecoveryRejection();assert.equal(f.calls.length,count);assert.equal(f.api.state().pending,null);assert.equal(f.api.state().modal.fields.name,'Local');await f.close();
});
void test('restored intent keeps ancestor fenced through known rejection, rebase and unknown send',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote});await next.api.restoreErrorRecovery(key,async()=>true);next.tick();const initial=session(next);next.remote.working.errors[0].name='Remote';next.remote.revision++;await next.api.apply();assert.equal(next.api.state().pending,null);await next.api.reconcileErrorRecovery(async()=>true);assert.equal(session(next),initial);next.mode('unknown');await next.api.apply();assert.equal(posts(next).length,2);await next.close();const reload=await fixture({data:f.data,locks:f.locks,remote:f.remote});await assert.rejects(reload.api.restoreErrorRecovery(key,async()=>true),/LINEAGE|RECEIPT|RESOLVED/);assert.equal(posts(reload).length,0);await reload.close();
});
void test('no-lock runtime permits fresh input but cannot recover cross-runtime source',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:null,remote:f.remote});await assert.rejects(next.api.restoreErrorRecovery(key,async()=>true),/WEB_LOCKS_UNAVAILABLE/);next.start();next.edit('Fresh');await next.api.apply();assert.equal(posts(next).length,1);assert.equal(next.api.state().modal,null);await next.close();
});
void test('actual DOM input listener schedules lazy recovery without rebuilding the editor',async()=>{
 const f=await fixture();f.start();const form=f.area.querySelector('#ipqcc-editor'),input=form.querySelector('input');input.name='name';input.value='IME 越語 Việt';form.dispatchEvent({type:'input',target:input});assert.equal(f.api.state().modal.fields.name,input.value);assert.equal(f.calls.length,0);assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,0);assert.equal(f.area.querySelector('#ipqcc-editor'),form);f.tick();assert.equal(JSON.parse(f.data.get(keys(f)[0])).payload.fields.name,input.value);await f.close();
});
void test('late restore GET cannot hydrate another owner or remove original source bytes',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote});const raw=f.data.get(key);next.hook(event=>{if(event.method==='GET')next.actor('actor-b');});await assert.rejects(next.api.restoreErrorRecovery(key,async()=>true),/CONTEXT_CHANGED|OWNER_CHANGED|SUPERSEDED|ACCOUNT_CHANGED/);assert.equal(next.api.state().modal,null);assert.equal(f.data.get(key),raw);assert.equal(posts(next).length,0);await next.close();
});
void test('same-account epoch replacement cannot persist old modal under a new recovery owner',async()=>{
 const f=await fixture();f.start();f.edit();f.tick();const before=new Map(f.data);f.epoch(2);f.edit('New epoch old modal');f.tick();await f.api.apply();assert.equal(posts(f).length,0);assert.deepEqual(f.data,before);assert.equal(f.api.state().modal.fields.name,'New epoch old modal');await f.close();
});
void test('BFCache explicit restore reacquires authority and keeps exactly two workflow GETs',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote});const oldClient=next.api.sharedTransport();next.box.dispatchEvent({type:'pagehide'});next.box.dispatchEvent({type:'pageshow',persisted:true});await turn();await next.api.restoreErrorRecovery(key,async()=>true);assert.notEqual(next.api.sharedTransport(),oldClient);assert.equal(next.calls.filter(call=>call.method==='GET').length,2);assert.equal(posts(next).length,0);await next.close();
});
void test('terminal helper cleanup failure remains receipt-only and finalizes without rePOST',async()=>{
 const f=await fixture();f.start();f.edit();f.removeHook(key=>{if(key.startsWith('process-local-draft-v2:'))throw Error('remove denied');});await f.api.apply();assert(f.api.state().pending);const key=keys(f)[0];assert.equal(JSON.parse(f.data.get(key)).kind,'unknown');f.edit('Newer');f.removeHook(null);await f.api.resolveErrorRecovery(key);assert.equal(posts(f).length,1);assert.equal(f.api.state().modal.fields.name,'Newer');assert.equal(f.api.state().pending,null);await f.close();
});
void test('reload after rejection cleanup loses private proof and remains unknown on receipt 404',async()=>{
 const f=await fixture({mode:'pending'});f.start();f.edit();f.removeHook(key=>{if(key.startsWith('shared-draft-receipt-only-v1:'))throw Error('remove denied');});await f.api.apply();assert(f.api.state().pending?.rejection);await f.close();const next=await fixture({data:f.data,locks:f.locks,remote:f.remote});assert(next.api.sharedTransport().hasUnknown());await assert.rejects(next.api.sharedTransport().resolveUnknown(),/OPERATION_NOT_FOUND/);assert.equal(next.api.state().modal,null);assert.equal(posts(next).length,0);await next.close();
});
void test('copied wrapper sender cannot turn a real broad rejection into helper proof',async()=>{
 const f=await fixture({mode:'pending'}),client=f.api.sharedTransport(),send=client.sendPrepared;client.sendPrepared=(...args)=>send(...args).then(value=>value);f.start();f.edit();await f.api.apply();assert(f.api.state().pending);assert.equal(JSON.parse(f.data.get(keys(f)[0])).kind,'unknown');assert.equal(posts(f).length,1);await f.close();
});
void test('readback newer than POST control uses original owned full read instead of stale adoption',async()=>{
 const f=await fixture();let changed=false;f.hook(event=>{if(!changed&&event.method==='GET'&&posts(f).length){changed=true;f.remote.revision++;f.remote.working.errors[0].note='Changed after ACK';}});await f.api.writeShared('apply',{patches:[],guards:[]},false);assert.equal(posts(f).length,1);assert.equal(f.api.state().control.workflow.revision,f.remote.revision);assert.equal(f.api.state().working.errors[0].note,'Changed after ACK');assert(f.calls.some(call=>call.url.startsWith('/api/ipqc-c?')));await f.close();
});
void test('ordinary unselected Apply remains on primary client and does not produce a local-form payload',async()=>{
 const f=await fixture();await f.api.writeShared('apply',{patches:[{op:'set',path:['errors',{id:'E1'},'note'],value:'Ordinary apply'}],guards:[{path:['errors',{id:'E1'},'note'],value:'Old note'}]},false);assert.equal(posts(f).length,1);assert.equal(f.remote.working.errors[0].note,'Ordinary apply');assert.equal(keys(f).length,0);assert.equal(f.api.state().modal,null);await f.close();
});
void test('preview cancel does not hydrate, delete, POST or do the second fresh GET',async()=>{
 const {f,key}=await savedSource(),next=await fixture({data:f.data,locks:f.locks,remote:f.remote}),raw=f.data.get(key);assert.equal(await next.api.restoreErrorRecovery(key,async()=>false),false);assert.equal(next.calls.length,1);assert.equal(next.api.state().modal,null);assert.equal(f.data.get(key),raw);await next.close();
});
void test('discard confirmation cannot erase newer unflushed local input',async()=>{
 const f=await fixture();f.start();f.edit('Saved local');f.tick();const key=keys(f)[0],raw=f.data.get(key);await assert.rejects(f.api.discardErrorRecovery(key,async()=>{f.edit('New during confirmation');return true;}),/CONTEXT_CHANGED/);assert.equal(f.api.state().modal.fields.name,'New during confirmation');assert.equal(f.data.get(key),raw);assert.equal(posts(f).length,0);await f.close();
});
void test('unknown original editor cannot be replaced by another normal editor open',async()=>{
 const f=await fixture({mode:'unknown'});f.start();f.edit();await f.api.apply();const original=f.api.state().modal;f.api.startEditor('error',f.api.state().working.errors[0]);assert.equal(f.api.state().modal,original);f.mode('ok');await f.api.resolveErrorRecovery(keys(f)[0]);assert.equal(f.api.state().modal,null);assert.equal(posts(f).length,1);await f.close();
});
void test('a replaced modal is never cleared by an older operation receipt',async()=>{
 const f=await fixture({mode:'unknown'});f.start();f.edit();await f.api.apply();const replacement={...f.api.state().modal,fields:{...f.api.state().modal.fields,name:'Replacement'},dirty:true};f.api.setModal(replacement);f.mode('ok');await f.api.resolveErrorRecovery(keys(f)[0]);assert.equal(f.api.state().modal,replacement);assert.equal(replacement.fields.name,'Replacement');assert.equal(posts(f).length,1);await f.close();
});
for(const cold of [true,false])void test((cold?'cold':'warm')+' selected Apply has exact authoritative GET/POST ordering, with no input requests',async()=>{
 const f=await fixture({cold});f.start();f.edit('Request count');assert.equal(f.calls.length,0);await f.api.apply();assert.deepEqual(f.calls.map(call=>call.method),cold?['GET','POST','GET']:['POST','GET']);assert(f.calls.filter(call=>call.method==='GET').every(call=>call.url===endpoint+'&compact=1'),JSON.stringify(f.calls.map(call=>call.url)));assert.equal(f.api.state().modal,null);await f.close();
});
void test('recovery UI explicitly marks legacy command bytes unsupported without reading or deleting them',async()=>{
 const key='shared-draft-v3-operation:actor-a:'+endpoint,raw='untouched legacy command with private body',f=await fixture({data:new Map([[key,raw]])});await f.api.openErrorRecovery();const list=f.document.querySelector('[data-recovery-list]');assert(list);assert(list.textContent.includes('舊版完整命令暫存保留原樣'));assert(list.textContent.includes('尚不支援安全恢復'));assert.equal(f.data.get(key),raw);assert(![...f.initialStorageCalls,...f.storageCalls].some(([,name])=>name===key));assert.equal(f.calls.length,0);await f.close();
});
void test('transactional rebase quota failure preserves prior durable bytes, base and editable RAM',async()=>{
 const f=await fixture();f.start();f.edit('Keep my local edit');f.tick();const key=keys(f)[0],raw=f.data.get(key),base=clone(f.api.state().modal.base),originalSession=session(f);f.remote.working.errors[0].note='New remote baseline';f.remote.revision++;
 let failedWrites=0;f.setHook(name=>{if(name.startsWith('process-local-draft-v2:')){failedWrites++;throw Error('quota');}});await f.api.reconcileErrorRecovery(async()=>true).catch(()=>false);f.tick();assert(failedWrites>0,'probe must reach the transactional durable write');assert.equal(f.data.get(key),raw,'quota must not consume the previous durable local intent');assert.deepEqual(clone(f.api.state().modal.base),base);assert.equal(f.api.state().modal.fields.name,'Keep my local edit');assert.equal(session(f),originalSession);assert.equal(posts(f).length,0);f.setHook(null);await f.close();
});
void test('transactional rebase post-write verification failure retains recoverable old bytes and original local base',async()=>{
 const f=await fixture();f.start();f.edit('Keep my local edit');f.tick();const key=keys(f)[0],raw=f.data.get(key),base=clone(f.api.state().modal.base);f.remote.working.errors[0].note='New remote baseline';f.remote.revision++;let verifyKey=null,verificationFailures=0;
 f.setHook((name,value)=>{if(name.startsWith('process-local-draft-v2:')&&value!==raw)verifyKey=name;});f.getHook(name=>{if(name===verifyKey){verifyKey=null;verificationFailures++;throw Error('verification read denied');}});
 await f.api.reconcileErrorRecovery(async()=>true).catch(()=>false);f.tick();assert(verificationFailures>0,'probe must fail verification after the successor write');assert([...f.data.values()].includes(raw),'a failed verification must retain the exact previous durable bytes, even if isolated in a recovery transaction');assert.deepEqual(clone(f.api.state().modal.base),base);assert.equal(f.api.state().modal.fields.name,'Keep my local edit');assert.equal(posts(f).length,0);f.setHook(null);f.getHook(null);await f.close();
});
void test('successful transactional rebase keeps exact old bytes, same session lineage and a durable successor without extra debounce',async()=>{
 const f=await fixture();f.start();f.edit('Retained local');f.tick();const oldKey=keys(f)[0],oldRaw=f.data.get(oldKey),original=session(f);f.remote.working.errors[0].note='Fresh note';f.remote.revision++;assert.equal(await f.api.reconcileErrorRecovery(async()=>true),true);assert.equal(session(f),original);assert.notEqual(session(f).key,oldKey);assert.equal(f.data.get(oldKey),oldRaw);const next=JSON.parse(f.data.get(session(f).key));assert.equal(next.payload.fields.name,'Retained local');assert.equal(next.payload.base.note,'Fresh note');assert.equal(next.lineageId,JSON.parse(oldRaw).lineageId);const writes=f.storageCalls.filter(([kind])=>kind==='set').length;f.tick();assert.equal(f.storageCalls.filter(([kind])=>kind==='set').length,writes);assert.equal(posts(f).length,0);await f.close();
});
void test('input after durable preparation but before fetch rejects dispatch with zero POST, clears only proven pending and keeps latest DOM input',async()=>{
 const f=await fixture();f.start();f.edit('Before preparation');let changed=false;f.setHook((key,raw)=>{if(!changed&&key.startsWith('process-local-draft-v2:')&&JSON.parse(raw).kind==='unknown'){changed=true;f.edit('Typed before fetch');}});await f.api.apply();assert(changed,'race injected at durable unknown marker write');assert.equal(posts(f).length,0);assert.equal(f.api.state().pending,null,'exact notSent proof releases own pending despite newer local revision');assert.equal(f.api.state().modal.fields.name,'Typed before fetch');assert.equal(f.api.sharedTransport().hasUnknown(),false);f.setHook(null);f.tick();assert.equal(JSON.parse(f.data.get(session(f).key)).payload.fields.name,'Typed before fetch');await f.close();
});
for(const change of ['owner','input'])void test('transactional rebase '+change+' change during successor write never adopts stale modal baseline',async()=>{
 const f=await fixture();f.start();f.edit('Before transaction');f.tick();const oldKey=session(f).key,oldRaw=f.data.get(oldKey),base=clone(f.api.state().modal.base);f.remote.working.errors[0].note='Remote revision';f.remote.revision++;let changed=false;f.setHook((key,raw)=>{if(!changed&&key.startsWith('process-local-draft-v2:')&&key!==oldKey&&JSON.parse(raw).kind==='local'){changed=true;if(change==='owner')f.epoch(2);else f.edit('During transaction');}});await assert.rejects(f.api.reconcileErrorRecovery(async()=>true));assert(changed);assert.equal(f.data.get(oldKey),oldRaw);assert.equal(session(f).key,oldKey);assert.deepEqual(clone(f.api.state().modal.base),base);assert.equal(f.api.state().modal.fields.name,change==='input'?'During transaction':'Before transaction');assert.equal(posts(f).length,0);f.setHook(null);await f.close();
});
