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
function lockManager(){const held=new Set();return{request(name,_options,callback){if(held.has(name))return Promise.resolve(callback(null));held.add(name);return Promise.resolve(callback({name})).finally(()=>held.delete(name));}};}
function remoteState(){return{scope:'ipqc-c',generation:'g1',revision:1,working:{errors:[{id:'E1',name:'Original',note:'Old note',code:'C-1-L1',productCode:'P1',stageCode:'S1'}],items:[]},saved:{id:'s1',revision:1,actor:{id:'actor-a',name:'Fixture'},at:'fixture'},pendingId:null,activeId:null,contributors:{},editable:true};}
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
 const hookSource=`\nwindow.__errorRecoveryTest={setup(value,element){control=value;working=copy(value.workflow.working);revision=value.workflow.revision;selectedVersionId='shared-'+value.workflow.generation;host=element;catalog={products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]};},sharedTransport,legacyReceipts,queryLegacyReceipt,openLegacyReceipts,startEditor,closeEditor,bind,writeShared,write,checkPreviousOperation,draw,render(lang){language=lang;host.innerHTML=mainHTML();bind();},\nstate:()=>({modal,control,working,message,localChanges}),\nedit(name,value){modal.fields[name]=value;modal.dirty=true;},setModal(value){modal=value;},selected(value){selectedVersionId=value;},\napply(){const target=modal,keys=['name','note','reason'].filter(key=>String(target.fields[key]??'')!==target.base[key]);return write('apply',{patches:keys.map(key=>({op:'set',path:['errors',{id:target.existingId},key],value:target.fields[key]??''})),guards:keys.map(key=>({path:['errors',{id:target.existingId},key],value:target.base[key]}))},true);}};\n`;
 const moduleSource=source('ipqc-c.js'),end=moduleSource.lastIndexOf('})();');vm.runInContext(moduleSource.slice(0,end)+hookSource+moduleSource.slice(end),box,{filename:'ipqc-c.js'});
 const api=box.__errorRecoveryTest;api.setup(control(),area);if(cold)await api.sharedTransport().permissions();else await api.sharedTransport().read();api.bind();
 const initialStorageCalls=storageCalls.slice();calls.length=0;storageCalls.length=0;
 return{api,box,document,area,data,remote,locks,calls,storageCalls,initialStorageCalls,receipts,start(){api.startEditor('error',api.state().working.errors[0]);},edit(value='Local'){api.edit('name',value);},tick(){const run=[...timers].filter(([,v])=>v.ms===250);for(const [id,{fn}]of run){timers.delete(id);fn();}},async close(){box.dispatchEvent({type:'pagehide'});await turn();},mode:value=>nextMode=value,hook:value=>hook=value,removeHook:value=>removeHook=value,setHook:value=>setHook=value,getHook:value=>getHook=value,permissions:value=>permissions={...permissions,...value},epoch:value=>epoch=value,actor:value=>actor={id:value},delivery:()=>delivery++};
}
const posts=f=>f.calls.filter(call=>call.method==='POST');

async function historical(f,kind,operationId='original-op'){
 const session=f.box.LocalDraftRecoverySession.create({getContext:()=>({actorId:'actor-a',scope:'IPQC-C:error-form',epoch:1,baseVersion:JSON.stringify(['g1',1,'s1','shared-g1']),canView:true,canEdit:true,pending:false,verified:true,hasLocalChanges:false,localRevision:0,writeState:'idle'})});
 await session.ready;
 if(kind==='unknown')assert.equal(session.rememberUnknown({operationId,generation:'g1'}).ok,true);
 else {session.schedule(()=>({fields:{name:'Old private input'}}));assert.equal(session.flush().ok,true);}
 const key=session.key;session.close();await turn();return key;
}
void test('RAM-only DOM input, Apply and departure never persist or restore form content',async()=>{
 const f=await fixture();f.start();const form=f.area.querySelector('#ipqcc-editor'),input=form.querySelector('input');input.name='name';input.value='IME 越語 Việt';form.dispatchEvent({type:'input',target:input});assert.equal(f.api.state().modal.fields.name,input.value);f.tick();assert.equal(f.data.size,0);assert.equal(f.calls.length,0);await f.api.apply();assert.equal(f.api.state().working.errors[0].name,input.value);assert.equal(f.api.state().localChanges.length,1);assert.equal(posts(f).length,0);assert.equal(f.data.size,0);
 f.box.IPQCCUI.navigation.reset();assert.equal(f.api.state().modal,null);assert.equal(f.api.state().localChanges.length,0);
 const next=await fixture({data:f.data,locks:f.locks,remote:f.remote});next.start();assert.equal(next.api.state().modal.fields.name,'Original');assert.equal(next.data.size,0);await next.close();await f.close();
});
void test('old local payload has no UI or source restoration/deletion path and stays byte-identical',async()=>{
 const f=await fixture(),key=await historical(f,'local'),before=new Map(f.data);f.storageCalls.length=0;await f.api.legacyReceipts();assert(!f.storageCalls.some(([kind,k])=>kind==='get'&&k===key));await assert.rejects(f.api.queryLegacyReceipt(key),/RECEIPT_REQUIRED/);assert.deepEqual(f.data,before);assert.equal(f.api.state().modal,null);assert.equal(f.calls.length,0);
 const text=source('ipqc-c.js');for(const forbidden of ['restoreErrorRecovery','reconcileErrorRecovery','discardErrorRecovery','sendErrorRecovery','session.restore(','session.rebaseLocal(','session.discard(','session.schedule(','session.flush(','preview.payload','ipqcc-recovery-reconcile'])assert(!text.includes(forbidden),forbidden);
 assert(text.includes('舊操作收據'));assert(text.includes('Biên nhận thao tác cũ'));assert(text.includes('未存輸入不會恢復'));await f.close();
});
void test('old unknown receipt 404 keeps exact records, input and original operation; never sends POST',async()=>{
 const f=await fixture(),key=await historical(f,'unknown'),before=new Map(f.data);f.start();f.edit('New input');await assert.rejects(f.api.queryLegacyReceipt(key),/OPERATION_NOT_FOUND/);assert.deepEqual(f.data,before);assert.equal(f.api.state().modal.fields.name,'New input');assert.equal(posts(f).length,0);assert(f.calls.some(c=>c.url.includes('operationId=original-op')));await f.close();
});
void test('confirmed legacy receipt is query-only and cannot clear new input or mutate old objects',async()=>{
 const f=await fixture(),key=await historical(f,'unknown');f.receipts.set('original-op',{operationId:'original-op',generation:'g1',revision:1,savedId:'s1',caseId:null,unchanged:false});const before=new Map(f.data);f.start();f.edit('New input');await f.api.queryLegacyReceipt(key);assert.deepEqual(f.data,before);assert.equal(f.api.state().modal.fields.name,'New input');assert.equal(posts(f).length,0);await f.close();
});
for(const change of ['actor','epoch','delivery'])void test('late legacy receipt '+change+' cannot clear new input',async()=>{
 const f=await fixture(),key=await historical(f,'unknown');f.receipts.set('original-op',{operationId:'original-op',generation:'g1',revision:1,savedId:'s1',caseId:null,unchanged:false});f.start();f.edit('New input');const before=new Map(f.data);f.hook(e=>{if(e.url.includes('operationId=')){if(change==='actor')f.actor('actor-b');else if(change==='epoch')f.epoch(2);else f.delivery();}});await assert.rejects(f.api.queryLegacyReceipt(key));assert.equal(f.api.state().modal.fields.name,'New input');assert.deepEqual(f.data,before);assert.equal(posts(f).length,0);await f.close();
});
for(const denied of ['view','pending'])void test(denied+' cannot admit old form restoration or local Apply',async()=>{
 const f=await fixture();await historical(f,'local');f.start();f.edit('New input');if(denied==='view'){f.permissions({view:false,edit:false});await f.api.sharedTransport().permissions();}else f.api.state().control.workflow.pendingId='pending';const before=new Map(f.data);await f.api.apply();assert.equal(f.api.state().localChanges.length,0);assert.equal(f.api.state().modal.fields.name,'New input');assert.deepEqual(f.data,before);assert.equal(posts(f).length,0);await f.close();
});

for(const fault of ['none','404','generation','actor','epoch','revoked'])void test('legacy query with matching active unknown: '+fault,async()=>{
 const f=await fixture({mode:'unknown'}),client=f.api.sharedTransport(),command=client.prepare('g1','save',{});
 await assert.rejects(client.sendPrepared(command));assert.equal(client.hasUnknown(),true);
 const key=await historical(f,'unknown',command.operationId),old=f.data.get(key);f.mode('ok');f.start();f.edit('New local input');
 if(fault==='404')f.receipts.delete(command.operationId);
 if(fault==='generation')f.receipts.get(command.operationId).generation='other';
 if(fault==='actor'||fault==='epoch')f.hook(e=>{if(e.url.includes('operationId=')){if(fault==='actor')f.actor('actor-b');else f.epoch(2);}});
 if(fault==='revoked')f.permissions({view:false,edit:false});
 const before=new Map(f.data);
 if(fault==='none'){await f.api.queryLegacyReceipt(key);assert.equal(client.hasUnknown(),false);assert(f.calls.filter(c=>c.method==='GET'&&!c.url.includes('operationId=')).length>=1);}
 else {await assert.rejects(f.api.queryLegacyReceipt(key));assert.equal(client.hasUnknown(),true);assert.deepEqual(f.data,before);}
 assert.equal(f.data.get(key),old);assert.equal(f.api.state().modal.fields.name,'New local input');assert.equal(posts(f).length,1);await f.close();
});
for(const change of ['actor','epoch','delivery'])void test('old editor '+change+' cannot stage into a new owner',async()=>{
 const f=await fixture();f.start();f.edit('old input');if(change==='actor')f.actor('actor-b');else if(change==='epoch')f.epoch(2);else f.delivery();await f.api.apply();assert.equal(f.api.state().localChanges.length,0);assert.equal(f.api.state().modal.fields.name,'old input');assert.equal(f.data.size,0);assert.equal(posts(f).length,0);await f.close();
});
for(const lang of ['vi','zh'])void test(lang+' receipt UI, pagehide and close cannot flush or delete payload',async()=>{
 const f=await fixture(),key=await historical(f,'local'),before=new Map(f.data);f.api.render(lang);const button=f.area.querySelector('#ipqcc-legacy-receipts');assert(button);button.dispatchEvent({type:'click',target:button});await turn();await turn();assert(f.document.body.textContent.includes(lang==='zh'?'舊操作收據':'Biên nhận thao tác cũ'));assert(!f.document.body.textContent.includes('Old private input'));assert.equal(f.document.querySelector('#ipqcc-recovery'),null);await f.close();f.box.IPQCCUI.navigation.reset();assert.deepEqual(f.data,before);assert.equal(f.data.get(key),before.get(key));
});

void test('reload drops unsaved input but retains active original receipt-only unknown and 404 lock',async()=>{
 const f=await fixture({mode:'unknown404'}),client=f.api.sharedTransport();f.start();f.edit('Never persist this input');await assert.rejects(client.sendPrepared(client.prepare('g1','save',{})));const before=new Map(f.data);assert(![...before.values()].some(raw=>raw.includes('Never persist this input')));await f.close();
 const next=await fixture({data:f.data,locks:f.locks,remote:f.remote}),nextClient=next.api.sharedTransport();assert.equal(next.api.state().modal,null);assert.equal(nextClient.hasUnknown(),true);await next.api.checkPreviousOperation();assert.equal(nextClient.hasUnknown(),true);assert.deepEqual(next.data,before);assert.equal(posts(next).length,0);assert(next.calls.some(c=>c.url.includes('operationId=')));await next.close();
});

void test('create-item retains fresh terminal GET with narrow selector; other mutations use ordinary GET',async()=>{
 for(const moduleAction of ['create-item','create-error']){const f=await fixture();const client=f.api.sharedTransport();await client.command('g1','apply',{moduleAction,input:{errorId:'E1',item:{description:'Synthetic',cpkEnabled:true}}});assert.deepEqual(f.calls.map(c=>c.method),['POST','GET']);assert.equal(new URL(f.calls[1].url,'https://fixture.invalid').searchParams.get('readback'),moduleAction==='create-item'?'ipqc-c-create-v1':null);assert.equal(client.hasUnknown(),false);await f.close();}
});
void test('create readback denial retains unknown and original operation; no repeat POST',async()=>{
 const f=await fixture();const client=f.api.sharedTransport();f.hook(event=>{if(event.method==='GET'&&event.url.includes('readback='))f.permissions({view:false,edit:false,create:false});});await assert.rejects(client.command('g1','apply',{moduleAction:'create-item',input:{errorId:'E1',item:{}}}));assert.equal(client.hasUnknown(),true);assert.equal(posts(f).length,1);await f.close();
});

for(const change of ['actor','epoch','delivery','reset'])void test('cached legacy receipt open after '+change+' cannot append or focus stale UI',async()=>{
 const f=await fixture();await f.api.legacyReceipts();const before=f.document.body.innerHTML,focused=f.document.activeElement;
 const opening=f.api.openLegacyReceipts();
 if(change==='actor')f.actor('actor-b');else if(change==='epoch')f.epoch(2);else if(change==='delivery')f.delivery();else f.box.IPQCCUI.navigation.reset();
 await assert.rejects(opening,/RECOVERY_CONTEXT_CHANGED/);assert.equal(f.document.body.innerHTML,before);assert.equal(f.document.querySelectorAll('.ipqcc-overlay').length,0);assert.equal(f.document.activeElement,focused);assert.equal(f.calls.length,0);assert.equal(f.data.size,0);await f.close();
});

for(const change of ['close','reset','actor','epoch','delivery'])void test('late legacy receipt '+change+' cannot change note, button or focus',async()=>{
 const f=await fixture();await historical(f,'unknown');await f.api.openLegacyReceipts();
 const overlay=f.document.querySelector('.ipqcc-overlay'),button=overlay.querySelector('[data-receipt-list] button'),note=overlay.querySelector('[data-receipt-message]');let release,entered;
 const held=new Promise(done=>release=done),requested=new Promise(done=>entered=done);f.hook(event=>{if(event.url.includes('operationId=')){entered();return held;}});
 const querying=button.onclick();await requested;assert.equal(button.disabled,true);
 if(change==='close')overlay.querySelector('[data-receipt-close]').onclick();else if(change==='reset')f.box.IPQCCUI.navigation.reset();else if(change==='actor')f.actor('actor-b');else if(change==='epoch')f.epoch(2);else f.delivery();
 const text=note.textContent,focused=f.document.activeElement;release();await querying;assert.equal(button.disabled,true);assert.equal(note.textContent,text);assert.equal(f.document.activeElement,focused);assert.equal(posts(f).length,0);await f.close();
});
