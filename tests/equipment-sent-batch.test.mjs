// Actual full equipment caller, registered input handlers, default shared client and
// shared-draft kernel and shipped equipment Apply adapter. DOM/timing and HTTP
// responses are synthetic and in-memory.
// No network, browser, route authorization, persistence or native layout claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto, randomUUID, createHash} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')();
const {createSharedDraft,applyDraftCommand}=load('lib/shared-draft.ts');
const {equipmentWorkflowAdapter}=load('lib/equipment-workflow.ts');
const {checkedSnapshot}=load('lib/routine-equipment.ts');
const source=fs.readFileSync(process.env.EQUIPMENT_SENT_BATCH_SOURCE||'public/process/routine-equipment.js','utf8');
const clientSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const tick=()=>new Promise(setImmediate);
const storage=()=>{const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
async function fixture({hold='POST',receiptOnly=false,unknown=false}={}){
 const dom=canvasDOM(),document=dom.document;document.getElementById=id=>document.querySelector('#'+id);document.visibilityState='visible';
 // The bounded DOM parser does not initialize select.value from option markup.
 // Supply that browser port without firing input or editing the working model.
 const html=Object.getOwnPropertyDescriptor(dom.Node.prototype,'innerHTML');
 Object.defineProperty(dom.Node.prototype,'innerHTML',{...html,set(value){html.set.call(this,value);
  for(const select of [...(this.tagName==='SELECT'?[this]:[]),...this.querySelectorAll('select')]){
   const options=select.querySelectorAll('option'),option=options.find(node=>node.hasAttribute('selected'))||options[0];
   select.value=option?(option.getAttribute('value')??option.textContent):'';
  }
 }});

 const host=document.createElement('main');host.id='data-content';host.dataset.activeTab='quality-routine-equipment';document.body.append(host);
 const content={equipment:[{id:'eq',name:'Tool',assetCode:'TEST',pieceMark:'01',unit:'支',enabled:true,groupId:'grp',photoId:'a'.repeat(64),notes:''}],categories:[{id:'cat',code:'C01',name:'Category',photoId:''}],subcategories:[{id:'sub',categoryId:'cat',name:'Sub'}],groups:[{id:'grp',categoryId:'cat',subcategoryId:'sub',name:'Group'}],issues:[{id:'issue',status:'pending',resolution:'',assetCode:'TEST',type:'synthetic'}]};
 // Build the legacy synthetic seed with the same domain constructor as a real
 // new equipment snapshot; do not invent client-specific default fields.
 Object.assign(content,checkedSnapshot({equipment:[],categories:[],subcategories:[],groups:[],issues:content.issues},content));
 let state=createSharedDraft('routine-equipment',content,null,'gen'),revision=10,epoch=1,delivery=1,pollCallback,pollEpoch=0;
 let allocations={reservedMarks:{},reservedCategoryCodes:[]};
 const control=()=>({schemaVersion:1,issues:clone(state.working.issues),...clone(allocations),activeVersionId:null,workflow:clone(state),versions:[{id:'draft',number:1,status:state.pendingId?'pending':'draft',history:[],snapshot:clone(state.working),...clone(state.working)}]});
 const actor={id:'owner',name:'Owner',role:'admin'},permissions=Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete','create','restore'].map(k=>[k,true]));
 const waiting=deferred(),release=deferred(),calls=[],revoked=[],events=[];let paused=false,failRead=false,onPost=async()=>{},onRead=async()=>{};
 const c={...dom,console,crypto:webcrypto,URL:class extends URL{static revokeObjectURL(url){revoked.push(url);}static createObjectURL(){return'blob:new';}},URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,structuredClone,Map,Set,Promise,JSON,Date,Math,Intl,Number,Error,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href:'https://synthetic.invalid/process/',origin:'https://synthetic.invalid',pathname:'/process/'},CSS:{escape:String},scrollX:0,scrollY:0,scrollTo(){},requestAnimationFrame(){},
  setTimeout:()=>1,clearTimeout(){},setInterval(){},clearInterval(){},localStorage:storage(),sessionStorage:storage(),confirm:()=>true,alert(){},hasPermission:()=>true,
  ProcessSync:{identity:actor,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:d=>d===delivery,platformHeaders:()=>({'Content-Type':'application/json'}),requiresReload:false},
  VersionDraftUI:{mount(){},t:value=>value,date:()=>'',updateSync(){},preserveView:()=>()=>{},reasonFor:()=>'',confirmSubmit:async()=> 'confirm',confirmReview:async()=>({reason:'confirm',selfReviewConfirmed:true})}
 };c.window=c;dom.events(c);c.addEventListener('routine-equipment-updated',event=>events.push(event));
 async function pause(method){if(hold===method&&!paused){paused=true;waiting.resolve();await release.promise;}}
 c.fetch=async(url,options={})=>{
  const method=options.method||'GET',body=typeof options.body==='string'?JSON.parse(options.body):null;calls.push({method,url,body,bytes:typeof options.body==='string'?Buffer.byteLength(options.body):0});
  if(method==='PUT'){await pause('PUT');return Response.json({id:'b'.repeat(64)});}
  if(method==='GET'&&!String(url).startsWith('/api/routine-equipment'))return Response.json(String(url).includes('replacement')?{modules:[],pending:[]}:String(url).includes('ipqc-ab')?{control:{scopes:{}}}:{control:{versions:[]}});
  if(method==='GET'){
   await pause('GET');const override=await onRead(url);if(override)return override;
   if(failRead)return Response.json({error:'READ_FAILED'},{status:503});
   if(String(url).includes('operationId='))return Response.json({error:'RECEIPT_UNAVAILABLE'},{status:503});
   return Response.json({control:control(),revision,permissions});
  }
  if(body?.action==='begin'){state=createSharedDraft('routine-equipment',content,null,'new-gen');revision++;await pause('POST');return Response.json({control:control(),revision,permissions});}
  assert(body?.command,'fixture only accepts actual client commands');
  let result;
  try{
   const context={actor:{...actor,admin:true},at:'2026-10-31T00:00:00Z',id:randomUUID,allowed:()=>true,activeId:null,semantic:v=>v,structure(){},validate:()=>[]};
   if(body.command.action==='apply'){
    // Use the shipped allocation/structure adapter, not a hand-written ACK
    // normalizer. Completion validation, ACL and persistence remain out of scope.
    const model=control(),domain=equipmentWorkflowAdapter.context(model,{values:{}},context);
    result=equipmentWorkflowAdapter.apply(model,body.command,{...domain,validate:()=>[]});
    allocations={reservedMarks:clone(model.reservedMarks),reservedCategoryCodes:clone(model.reservedCategoryCodes||[])};
   }else result=applyDraftCommand(state,body.command,context);
  }
  catch(error){return Response.json({error:error.message,details:error.details},{status:error.status||409});}
  state=result.state;revision++;await onPost(body.command);
  const response={revision,permissions,receipt:clone(result.receipt),...(receiptOnly?{}:{control:control()})};
  await pause('POST');if(unknown)throw Error('SYNTHETIC_ACK_LOST');return Response.json(response);
 };
 vm.createContext(c);vm.runInContext(clientSource,c);
 c.createForegroundPoll=()=>({capture:()=>pollEpoch,isCurrent:v=>v===pollEpoch,cancel(){pollEpoch++;},schedule:fn=>{pollCallback=fn;}});
 const hook=`window.testPort={writeShared,read,bind,render,pollShared,confirmNodeDialog,openNodeDialog,confirmAddEquipment,openAddEquipmentDialog,sharedTransport,
  get working(){return working;},get base(){return syncBase;},get control(){return control;},get revision(){return revision;},get busy(){return busy;},get message(){return message;},get node(){return nodeDialog;},get form(){return newEquipmentForm;},get photos(){return pendingPhotos;},get unavailable(){return readUnavailable;},get client(){return sharedClient;},get editId(){return editingEquipmentId;},
  install(model){host=document.querySelector('#data-content');control=model;controlActor=identity().id;revision=10;selectedVersionId='draft';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='grp';working=snapshotOf(open());syncBase=clone(working);syncGeneration=control.workflow.generation;},
  change(kind){if(kind==='host')host={isConnected:true};if(kind==='scope')selectedVersionId='another';if(kind==='generation')control.workflow.generation='replacement';if(kind==='lifecycle')equipmentEditRequest++;if(kind==='client')sharedClient={};if(kind==='attempt'){writeShared.attempt={};busy=true;}if(kind==='same-gen-model'){control=clone(control);control.workflow.revision++;revision=99;}if(kind==='new-model'){control=clone(control);control.workflow.generation='new';revision=99;}},
  edit(){editingEquipmentId='eq';formSnapshot=clone(working.equipment[0]);render();},nodeReplace(){nodeDialog={kind:'category',name:'New dialog'};},setBusy(){busy=true;},
 };`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,hook+'})();'),c);
 const p=c.testPort;p.install(control());p.sharedTransport();
 // Initial access hydration is setup, not an extra dispatch read.
 const savedHold=hold;hold='';await p.client.read();hold=savedHold;calls.length=0;p.render();
 return{c,p,host,calls,revoked,events,waiting:waiting.promise,release:()=>release.resolve(),state:()=>state,permissions,
  restoreOwner(){c.ProcessSync.identity=actor;epoch=1;delivery=1;},posts:()=>calls.filter(x=>x.method==='POST'),setFailRead:value=>{failRead=value!==false;},onPost:fn=>onPost=fn,onRead:fn=>onRead=fn,
  mutate(kind){if(kind==='actor')c.ProcessSync.identity={id:'other'};else if(kind==='same-id-object')c.ProcessSync.identity={...actor};else if(kind==='epoch')epoch++;else if(kind==='malformed-epoch')epoch=NaN;else if(kind==='null-epoch')epoch=null;else if(kind==='object-epoch')epoch={};else if(kind==='negative-epoch')epoch=-1;else if(kind==='missing-epoch')delete c.ProcessSync.identityGeneration;else if(kind==='missing-capture')delete c.ProcessSync.captureDelivery;else if(kind==='null-delivery')c.ProcessSync.captureDelivery=()=>null;else if(kind==='missing-current')delete c.ProcessSync.isCurrentDelivery;else if(kind==='false-current')c.ProcessSync.isCurrentDelivery=()=>false;else if(kind==='delivery')delivery++;else if(kind==='tab')host.dataset.activeTab='other';else if(kind==='disconnect')host.remove();else if(kind==='reload')c.ProcessSync.requiresReload=true;else p.change(kind);},
  type(value){const input=host.querySelector('[data-issue-result]');assert(input,'actual rendered issue input');input.value=value;input.oninput();return input;},
  peer(collection,id,field,value){state.working[collection].find(row=>row.id===id)[field]=value;state.revision++;revision++;},
  async poll(){document.activeElement=null;p.pollShared();await pollCallback();},
 };
}

test('normal Apply remains one POST with no new GET; exact default command snapshot',async()=>{
 const f=await fixture({hold:''});const input=f.type('first');await input.onchange();assert.equal(f.p.working.issues[0].resolution,'first');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.p.busy,false);assert.equal(f.posts().length,1);assert.equal(f.calls.length,1);assert.equal(f.state().saved,null);assert.equal(f.p.client.hasUnknown(),false);
 console.log(JSON.stringify({evidence:'normal request count',sourceSha256:createHash('sha256').update(source).digest('hex'),POST:1,GET:0,requestBytes:f.calls[0].bytes}));
});
test('actual oninput while actual onchange awaits ACK retains next batch; only explicit later Apply posts',async()=>{
 const f=await fixture(),input=f.type('first'),pending=input.onchange();await f.waiting;f.type('second');const local=f.p.working;f.release();await pending;
 assert.equal(f.p.working,local);assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.state().working.issues[0].resolution,'first');assert.equal(f.posts().length,1);assert.equal(f.calls.length,1);assert.equal(f.p.busy,false);
 await f.p.writeShared('save');assert.equal(f.posts().length,1,'Save never implicitly applies second input');await f.p.writeShared('apply');assert.equal(f.posts().length,2);assert.equal(f.posts()[1].body.command.guards[0].value,'first');assert.equal(f.state().working.issues[0].resolution,'second');
});
for(const kind of ['actor','same-id-object','epoch','delivery','host','scope','generation','lifecycle','client','attempt','reload','new-model','same-gen-model','tab','disconnect'])test('late '+kind+' ACK cannot adopt metadata, clear RAM/photos or unlock a newer attempt',async()=>{
 const f=await fixture(),input=f.type('sent'),pending=input.onchange();await f.waiting;f.type('next');const local=f.p.working,base=f.p.base;f.mutate(kind);const revision=f.p.revision;f.release();await pending;
 assert.equal(f.p.revision,revision);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.busy,kind==='attempt');assert.equal(f.events.length,0);assert.equal(f.posts().length,1);if(kind!=='actor')assert.equal(f.p.client?.hasUnknown?.()??false,false);
});
test('malformed epoch refuses dispatch with RAM preserved',async()=>{const f=await fixture({hold:''});f.type('next');f.mutate('malformed-epoch');await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'next');});
test('next input on peer-changed path retains pre-send guard and conflicts instead of silent rebase',async()=>{
 const f=await fixture();f.p.working.equipment[0].name='sent title';f.onPost(()=>f.peer('equipment','eq','notes','peer note'));const pending=f.p.writeShared('apply');await f.waiting;f.p.working.equipment[0].notes='my next note';f.release();await pending;
 assert.equal(f.p.base.equipment[0].notes,'');assert.equal(f.p.working.equipment[0].notes,'my next note');assert.equal(f.p.control.workflow.working.equipment[0].notes,'peer note');await f.p.writeShared('apply');
 assert.equal(f.posts()[1].body.command.guards.find(g=>g.path.at(-1)==='notes').value,'');assert.equal(f.p.working.equipment[0].notes,'my next note');assert.equal(f.state().working.equipment[0].notes,'peer note');assert.equal(f.posts().length,2);
});
test('blurred pending next batch survives actual poll and ordinary read without rebasing',async()=>{
 const f=await fixture(),pending=f.type('first').onchange();await f.waiting;f.type('next');f.release();await pending;const local=f.p.working,base=f.p.base;f.peer('issues','issue','resolution','peer');await f.poll();assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.p.read();assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.posts().length,1);
});
test('photo upload freezes entries and only releases still-identical sent preview',async()=>{
 const f=await fixture({hold:'PUT'}),old={file:{size:1,type:'image/png'},url:'blob:old'},next={file:{size:2,type:'image/png'},url:'blob:next'},added={file:{size:3,type:'image/png'},url:'blob:added'};
 f.p.photos.set('eq',old);const pending=f.p.writeShared('apply');await f.waiting;f.p.photos.set('eq',next);f.p.photos.set('cat',added);f.type('next input');f.release();await pending;
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);assert.equal(f.posts().length,1);assert.equal(f.p.photos.get('eq'),next);assert.equal(f.p.photos.get('cat'),added);assert.deepEqual(f.revoked,[]);assert.equal(f.p.base.equipment[0].photoId,'b'.repeat(64));assert.equal(f.p.working.issues[0].resolution,'next input');
});
test('unchanged sent photo with later text gets exact uploaded id, releases old entry only',async()=>{
 const f=await fixture({hold:'PUT'}),old={file:{size:1,type:'image/png'},url:'blob:old'};f.p.photos.set('eq',old);const pending=f.p.writeShared('apply');await f.waiting;f.type('next input');f.release();await pending;
 assert.equal(f.p.working.equipment[0].photoId,'b'.repeat(64));assert.equal(f.p.base.equipment[0].photoId,'b'.repeat(64));assert.equal(f.p.photos.size,0);assert.deepEqual(f.revoked,['blob:old']);assert.equal(f.posts().length,1);
});
for(const kind of ['same-id-object','epoch','delivery','host','lifecycle'])test('photo upload '+kind+' prevents later command and preview cleanup',async()=>{
 const f=await fixture({hold:'PUT'}),entry={file:{size:1,type:'image/png'},url:'blob:old'};f.p.photos.set('eq',entry);const pending=f.p.writeShared('apply');await f.waiting;f.mutate(kind);f.release();await pending;assert.equal(f.posts().length,0);assert.equal(f.p.photos.get('eq'),entry);assert.deepEqual(f.revoked,[]);assert.equal(f.p.revision,10);
});
test('receipt-only ACK fallback preserves later input and original next guard',async()=>{
 const f=await fixture({receiptOnly:true}),pending=f.type('first').onchange();await f.waiting;f.type('second');f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.posts().length,1);assert.equal(f.calls.filter(x=>x.method==='GET').length,1);
});
test('failed receipt-only readback preserves RAM/base and never auto POSTs',async()=>{
 const f=await fixture({receiptOnly:true}),pending=f.type('first').onchange();await f.waiting;f.type('second');const base=f.p.base;f.setFailRead();f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base,base);assert.equal(f.p.revision,10);assert.equal(f.posts().length,1);
});
test('Save keeps its shared snapshot while later actual input remains unapplied, including fallback',async()=>{for(const receiptOnly of [false,true]){
 const f=await fixture({receiptOnly}),pending=f.p.writeShared('save');await f.waiting;f.type('unsent');const base=f.p.base;f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'unsent');assert.equal(f.p.base,base);assert.equal(f.state().saved.content.issues[0].resolution,'');assert.deepEqual(f.posts().map(x=>x.body.command.action),['save']);assert.equal(f.p.busy,false);
}});
test('unknown ACK retains sent and next input; next explicit Apply only queries receipt',async()=>{
 const f=await fixture({unknown:true}),pending=f.type('first').onchange();await f.waiting;f.type('second');const base=f.p.base;f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base,base);assert.equal(f.p.client.hasUnknown(),true);await f.p.writeShared('apply');assert.equal(f.posts().length,1);assert.equal(f.p.working.issues[0].resolution,'second');
});
test('same node dialog with actual later typing stays open with input; no duplicate POST',async()=>{
 const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=f.p.confirmNodeDialog();await f.waiting;name.value='second';name.dispatchEvent({type:'input',target:name});const dialog=f.p.node;f.release();await pending;assert.equal(f.p.node,dialog);assert.equal(f.p.node.name,'second');assert.equal(f.host.querySelector('#routine-dialog-name').value,'second');assert.equal(f.posts().length,1);
});
test('later node dialog is never closed by previous Apply completion',async()=>{
 const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';const pending=f.p.confirmNodeDialog();await f.waiting;f.p.openNodeDialog('group','grp');const dialog=f.p.node;f.release();await pending;assert.equal(f.p.node,dialog);assert.equal(f.posts().length,1);
});
test('actual equipment form Apply retains later actual editor input instead of closing',async()=>{
 const f=await fixture();f.p.edit();const input=f.host.querySelector('#routine-editor [data-field="name"]');input.value='first';input.oninput();f.host.querySelector('#routine-form-apply').click();await f.waiting;input.value='next';input.oninput();f.release();await tick();await tick();assert.equal(f.p.editId,'eq');assert.equal(f.p.working.equipment[0].name,'next');assert.equal(f.posts().length,1);
});

test('normal Begin advances its own generation without leaving busy latched',async()=>{const f=await fixture({hold:''});assert(await f.p.writeShared('begin'));assert.equal(f.p.control.workflow.generation,'new-gen');assert.equal(f.p.busy,false);assert.equal(f.posts().length,1);assert.equal(f.calls.length,1);});
test('normal Save / Submit / review accepts its own review generation and unlocks',async()=>{const f=await fixture({hold:''});f.c.captureSharedDraftSubmission=flow=>({savedId:flow.saved.id,expectedRevision:flow.revision});assert(await f.p.writeShared('save'));assert(await f.p.writeShared('submit'));const gen=f.p.control.workflow.generation;assert(await f.p.writeShared('reject'));assert.notEqual(f.p.control.workflow.generation,gen);assert.equal(f.p.busy,false);assert.deepEqual(f.posts().map(x=>x.body.command.action),['save','submit','return']);});
for(const kind of ['same-id-object','epoch','delivery','host','lifecycle'])test('late receipt-only fallback GET '+kind+' is rejected before metadata adoption',async()=>{const f=await fixture({receiptOnly:true,hold:'GET'}),pending=f.type('first').onchange();await f.waiting;f.type('next');f.mutate(kind);f.release();await pending;assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.base.issues[0].resolution,'');assert.equal(f.posts().length,1);});
test('Save flush awaits existing default-client work but epoch drift cannot dispatch Save',async()=>{const f=await fixture(),path=['equipment',{id:'eq'},'name'],queued=f.p.client.command('gen','apply',{patches:[{op:'set',path,value:'queued'}],guards:[{path,value:'Tool'}]});await f.waiting;const save=f.p.writeShared('save');await tick();f.mutate('epoch');f.release();await queued;await save;assert.deepEqual(f.posts().map(x=>x.body.command.action),['apply']);assert.equal(f.p.revision,10);});
test('same photo-entry object with replaced File/url is still a later preview, never revoked',async()=>{const f=await fixture({hold:'PUT'}),entry={file:{size:1,type:'image/png'},url:'blob:old'};f.p.photos.set('eq',entry);const pending=f.p.writeShared('apply');await f.waiting;entry.file={size:2,type:'image/png'};entry.url='blob:next';f.release();await pending;assert.equal(f.p.photos.get('eq'),entry);assert.deepEqual(f.revoked,[]);assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});

test('unknown new-equipment Apply retains its submitted row and later form input without a second POST',async()=>{const f=await fixture({unknown:true});f.p.openAddEquipmentDialog();for(const[id,value]of [['asset-code','NEW-1'],['name','First new tool']]){const input=f.host.querySelector('#routine-add-'+id);input.value=value;input.dispatchEvent({type:'input',target:input});}const pending=f.p.confirmAddEquipment();await f.waiting;const input=f.host.querySelector('#routine-add-name');input.value='Later new tool';input.dispatchEvent({type:'input',target:input});const form=f.p.form;f.release();await pending;assert.equal(f.p.form,form);assert.equal(form.name,'Later new tool');assert.equal(f.p.working.equipment.filter(row=>row.assetCode==='NEW-1').length,1);await f.p.confirmAddEquipment();assert.equal(f.p.working.equipment.filter(row=>row.assetCode==='NEW-1').length,1);assert.equal(f.posts().length,1);});

for(const kind of ['null-epoch','object-epoch','negative-epoch','missing-epoch','missing-capture','null-delivery','missing-current','false-current'])test('missing or malformed ownership port '+kind+' fails closed with zero POST',async()=>{const f=await fixture({hold:''});f.type('retained');f.mutate(kind);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'retained');assert.equal(f.p.busy,false);});
for(const kind of ['category','subcategory','group'])test('new '+kind+' dialog uses exact created row on second explicit Apply without duplicate insertion',async()=>{const f=await fixture(),key={category:'categories',subcategory:'subcategories',group:'groups'}[kind],before=f.p.working[key].length;f.p.openNodeDialog(kind);const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=f.p.confirmNodeDialog();await f.waiting;name.value='second';name.dispatchEvent({type:'input',target:name});f.release();await pending;const id=f.p.node.prior.id;assert.equal(f.p.working[key].length,before+1);await f.p.confirmNodeDialog();assert.equal(f.state().working[key].length,before+1);assert.equal(f.state().working[key].find(row=>row.id===id).name,'second');assert.equal(f.posts().length,2);assert.equal(f.posts()[1].body.command.patches.some(p=>p.op==='insert'),false);});
test('ordinary read keeps next dialog prior attached to working, so later explicit Apply sends it',async()=>{const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=f.p.confirmNodeDialog();await f.waiting;name.value='second';name.dispatchEvent({type:'input',target:name});f.release();await pending;const prior=f.p.node.prior;await f.p.read();assert.equal(f.p.working.categories[0],prior);await f.p.confirmNodeDialog();assert.equal(f.state().working.categories[0].name,'second');});
test('confirmed node photo plus next text keeps authoritative photoId, not revoked preview or duplicate upload',async()=>{const f=await fixture();f.p.openNodeDialog('category','cat');const entry={file:{size:1,type:'image/png'},url:'blob:node'};f.p.node.pendingPhoto=entry;const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=f.p.confirmNodeDialog();await f.waiting;name.value='second';name.dispatchEvent({type:'input',target:name});f.release();await pending;assert.equal(f.p.node.name,'second');assert.equal(f.p.node.pendingPhoto,null);assert.equal(f.p.node.photoId,'b'.repeat(64));await f.p.confirmNodeDialog();assert.equal(f.state().working.categories[0].name,'second');assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});
test('new equipment with acknowledged photo and later form input reuses its row and photo on explicit Confirm',async()=>{const f=await fixture();f.p.openAddEquipmentDialog();f.p.form.pendingPhoto={file:{size:1,type:'image/png'},url:'blob:add'};for(const[id,value]of [['asset-code','NEW-1'],['name','First new tool']]){const input=f.host.querySelector('#routine-add-'+id);input.value=value;input.dispatchEvent({type:'input',target:input});}const pending=f.p.confirmAddEquipment();await f.waiting;const input=f.host.querySelector('#routine-add-name');input.value='Later new tool';input.dispatchEvent({type:'input',target:input});f.release();await pending;const id=f.p.form.submittedEquipmentId;assert.equal(f.p.form.pendingPhoto,null);await f.p.read();await f.p.confirmAddEquipment();const rows=f.state().working.equipment.filter(row=>row.assetCode==='NEW-1');assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].name,'Later new tool');assert.equal(rows[0].photoId,'b'.repeat(64));assert.equal(f.posts().length,2);assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});

for(const kind of ['actor','same-id-object','epoch'])test('pre-read '+kind+' cannot reattribute retained local input or project it into the new owner UI',async()=>{const f=await fixture({hold:''});f.type('PRIVATE ORIGINAL INPUT');const local=f.p.working,base=f.p.base;f.mutate(kind);await assert.rejects(f.p.read(),/ACCOUNT_CHANGED/);f.p.render();assert.equal(f.host.querySelector('[data-issue-result]'),null);assert.doesNotMatch(f.host.innerHTML,/PRIVATE ORIGINAL INPUT/);assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'PRIVATE ORIGINAL INPUT');f.restoreOwner();await f.p.read();f.p.render();assert.equal(f.host.querySelector('[data-issue-result]').value,'PRIVATE ORIGINAL INPUT');assert.equal(f.p.working,local);});
for(const kind of ['actor','same-id-object','epoch'])test('clean read after '+kind+' may load new owner without inheriting a private buffer',async()=>{const f=await fixture({hold:''});f.mutate(kind);await f.p.read();f.p.render();f.type('new owner input');await f.p.writeShared('apply');assert.equal(f.posts().length,1);assert.equal(f.state().working.issues[0].resolution,'new owner input');});

test('delivery drift blocks direct Apply, poll, and automatic read/mount until explicit UI retry validates it',async()=>{const f=await fixture({hold:''});f.type('retained');const local=f.p.working,base=f.p.base;f.mutate('delivery');await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.host.querySelector('[data-issue-result]'),null);await assert.rejects(f.p.read());await f.poll();await f.c.RoutineEquipmentUI.mount(f.host);assert.equal(f.calls.length,0);const retry=f.host.querySelector('#routine-load-retry');assert(retry,'actual explicit retry button');retry.click();await tick();await tick();assert.equal(f.p.unavailable,false);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.calls.filter(x=>x.method==='GET').length,2);assert.equal(f.posts().length,0);await f.p.writeShared('apply');assert.equal(f.posts().length,1);assert.equal(f.posts()[0].body.command.guards[0].value,'');});
test('explicit delivery recheck keeps original peer-conflicting guard, never rebases private input',async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working,base=f.p.base;f.mutate('delivery');f.peer('issues','issue','resolution','peer');await f.p.read(false,true);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.base.issues[0].resolution,'');assert.equal(await f.p.writeShared('apply'),null);assert.equal(f.posts()[0].body.command.guards[0].value,'');assert.equal(f.state().working.issues[0].resolution,'peer');assert.equal(f.p.working.issues[0].resolution,'mine');});
for(const kind of ['view-denied','edit-denied','pending','generation','scope','malformed-flow','older-revision','http-failure'])test('explicit delivery recheck '+kind+' does not admit retained inputs',async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working,base=f.p.base,before=f.p.control;f.mutate('delivery');if(kind==='view-denied')f.permissions.view=false;if(kind==='edit-denied')f.permissions.edit=false;if(kind==='pending')f.state().pendingId='pending';if(kind==='generation')f.state().generation='new-generation';if(kind==='scope')f.state().scope='other';if(kind==='malformed-flow')f.state().revision=null;if(kind==='older-revision')f.onRead(async url=>!String(url).includes('/workflow')?Response.json({control:clone(before),revision:9,permissions:f.permissions}):undefined);if(kind==='http-failure')f.setFailRead();await assert.rejects(f.p.read(false,true));assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.control,before);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.host.querySelector('[data-issue-result]'),null);});
for(const kind of ['host','scope','tab','disconnect'])test('explicit delivery recheck cannot move RAM across '+kind,async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working;f.mutate('delivery');f.mutate(kind);await assert.rejects(f.p.read(false,true));await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.calls.length,0);assert.equal(f.p.working,local);});
test('late explicit recheck from prior delivery cannot admit the now newer delivery',async()=>{const f=await fixture({hold:'GET'});f.type('mine');f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;f.mutate('delivery');f.release();await assert.rejects(pending,/DELIVERY/);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'mine');});
test('new delivery explicit recheck does not clear unknown marker or failure and next Apply only queries original receipt',async()=>{const f=await fixture({unknown:true}),pending=f.type('first').onchange();await f.waiting;f.type('next');f.release();await pending;const records=()=>Array.from({length:f.c.sessionStorage.length},(_,i)=>{const k=f.c.sessionStorage.key(i);return[k,f.c.sessionStorage.getItem(k)];});const marker=records(),failed=f.p.client.hasSyncFailures(),base=f.p.base,local=f.p.working;assert.equal(f.p.client.hasUnknown(),true);f.mutate('delivery');await f.p.read(false,true);assert.equal(f.p.client.hasUnknown(),true);assert.equal(f.p.client.hasSyncFailures(),failed);assert.deepEqual(records(),marker);assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.p.writeShared('apply');assert.equal(f.posts().length,1);assert.equal(f.p.client.hasUnknown(),true);assert.deepEqual(records(),marker);});
test('known failed Apply cannot be cleared or admitted by a delivery recheck',async()=>{const f=await fixture({hold:''});f.peer('issues','issue','resolution','peer');f.type('mine');await f.p.writeShared('apply');assert.equal(f.p.client.hasSyncFailures(),true);f.mutate('delivery');await assert.rejects(f.p.read(false,true));await f.p.writeShared('apply');assert.equal(f.p.client.hasSyncFailures(),true);assert.equal(f.posts().length,1);assert.equal(f.p.working.issues[0].resolution,'mine');});
test('retained add drawer uses explicit delivery gate without applying its DOM inputs',async()=>{const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const input=f.host.querySelector('#routine-add-name');input.value='private new name';input.dispatchEvent({type:'input',target:input});const form=f.p.form;f.mutate('delivery');await f.p.writeShared('save');const retry=f.host.querySelector('#routine-load-retry');assert(retry);retry.click();await tick();await tick();assert.equal(f.p.form,form);assert.equal(f.host.querySelector('#routine-add-name').value,'private new name');assert.equal(f.posts().length,0);assert.equal(f.calls.filter(x=>x.method==='GET').length,2);});

test('pre-existing drawer retry button cannot use old renewal flow to bypass changed delivery gate',async()=>{const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const input=f.host.querySelector('#routine-add-name');input.value='retained drawer';input.dispatchEvent({type:'input',target:input});f.setFailRead();await assert.rejects(f.p.read());f.p.render();const retry=f.host.querySelector('#routine-load-retry');assert(retry);const start=f.calls.length;f.setFailRead(false);f.mutate('delivery');retry.click();await tick();await tick();assert.equal(f.p.unavailable,false);assert.equal(f.p.form.name,'retained drawer');assert.equal(f.calls.length-start,2);assert.equal(f.calls.slice(start).some(x=>String(x.url).includes('shared-state')),false);assert.equal(f.posts().length,0);});
test('later same-owner typing during explicit delivery recheck remains latest RAM, never part of its GET',async()=>{const f=await fixture({hold:'GET'});const input=f.type('before');f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;input.value='during read';input.oninput();f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'during read');assert.equal(f.p.base.issues[0].resolution,'');assert.equal(f.posts().length,0);});

for(const kind of ['tab','disconnect'])test('late explicit recheck after '+kind+' cannot admit detached or repurposed target',async()=>{const f=await fixture({hold:'GET'});f.type('mine');f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;f.mutate(kind);f.release();await assert.rejects(pending,/DELIVERY/);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'mine');});

test('synthetic select port preserves empty placeholders and explicit later selection without input events',async()=>{
 const f=await fixture({hold:''}),root=f.c.document.createElement('div');let events=0;
 root.innerHTML='<select><option value="">Choose</option><option value="valid">Valid</option></select>';
 const select=root.querySelector('select');select.addEventListener('change',()=>events++);select.addEventListener('input',()=>events++);
 assert.equal(select.value,'','absence of selected does not invent a legal domain value');select.value='valid';assert.equal(select.value,'valid');select.value='';assert.equal(select.value,'');
 root.innerHTML='<select><option value="">Choose</option><option value="selected" selected>Selected</option></select>';
 assert.equal(root.querySelector('select').value,'selected');assert.equal(events,0);assert.equal(f.calls.length,0);
});
