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
const photoFile=size=>new Blob([new Uint8Array(size)],{type:'image/png'});
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const tick=()=>new Promise(setImmediate);
const cleanups=[];test.afterEach(()=>{for(const fn of cleanups.splice(0))fn();});
const storage=()=>{const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
async function fixture({hold='POST',receiptOnly=false,unknown=false,receiptStatus=503,holdAfterPost=false}={}){
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
 let state=createSharedDraft('routine-equipment',content,null,'gen'),revision=10,epoch=1,delivery=1;
 let allocations={reservedMarks:{},reservedCategoryCodes:[]};
 const control=()=>({schemaVersion:1,issues:clone(state.working.issues),...clone(allocations),activeVersionId:null,workflow:clone(state),versions:[{id:'draft',number:1,status:state.pendingId?'pending':'draft',history:[],snapshot:clone(state.working),...clone(state.working)}]});
 const actor={id:'owner',name:'Owner',role:'admin'},permissions=Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete','create','restore'].map(k=>[k,true]));
 const waiting=deferred(),release=deferred(),calls=[],revoked=[],events=[],rejections=[];let paused=false,failRead=false,onPost=async()=>{},onRead=async()=>{};
 const c={...dom,console,crypto:webcrypto,URL:class extends URL{static revokeObjectURL(url){revoked.push(url);}static createObjectURL(){return'blob:new';}},URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,structuredClone,Map,Set,Promise,JSON,Date,Math,Intl,Number,Error,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href:'https://synthetic.invalid/process/',origin:'https://synthetic.invalid',pathname:'/process/'},CSS:{escape:String},scrollX:0,scrollY:0,scrollTo(){},requestAnimationFrame(){},
  setTimeout,clearTimeout,setInterval(){throw Error('Unexpected fixed poll');},clearInterval(){},localStorage:storage(),sessionStorage:storage(),confirm:()=>true,alert(){},hasPermission:()=>true,
  ProcessSync:{identity:actor,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:d=>d===delivery,platformHeaders:()=>({'Content-Type':'application/json'}),requiresReload:false},
  VersionDraftUI:{mount(){},t:value=>value,date:()=>'',updateSync(){},preserveView:()=>()=>{},reasonFor:()=>'',confirmSubmit:async()=> 'confirm',confirmReview:async()=>({reason:'confirm',selfReviewConfirmed:true})}
 };c.window=c;dom.events(c);c.addEventListener('routine-equipment-updated',event=>events.push(event));
 async function pause(method){if(hold===method&&!paused&&(!holdAfterPost||calls.some(call=>call.method==='POST'))){paused=true;waiting.resolve();await release.promise;}}
 c.fetch=async(url,options={})=>{
  const method=options.method||'GET',body=typeof options.body==='string'?JSON.parse(options.body):null;calls.push({method,url,body,bytes:typeof options.body==='string'?Buffer.byteLength(options.body):0});
  if(method==='PUT'){await pause('PUT');return Response.json({id:createHash('sha256').update(new Uint8Array(await options.body.arrayBuffer())).digest('hex')});}
  if(method==='GET'&&!String(url).startsWith('/api/routine-equipment'))return Response.json(String(url).includes('replacement')?{modules:[],pending:[]}:String(url).includes('ipqc-ab')?{control:{scopes:{}}}:{control:{versions:[]}});
  if(method==='GET'){
   await pause('GET');const override=await onRead(url);if(override)return override;
   if(failRead)return Response.json({error:'READ_FAILED'},{status:503});
   if(String(url).includes('operationId='))return Response.json({error:'RECEIPT_UNAVAILABLE'},{status:receiptStatus});
   return Response.json({control:control(),revision,permissions});
  }
  if(body?.action==='begin'){state=createSharedDraft('routine-equipment',content,null,'new-gen');revision++;await pause('POST');return Response.json({control:control(),revision,permissions});}
  assert(body?.command,'fixture only accepts actual client commands');
  let result;
  try{
   const context={actor:{...actor,admin:true},at:'2026-10-31T00:00:00Z',id:randomUUID,allowed:()=>true,activeId:null,semantic:v=>v,structure(){},validate:()=>[]};
   if(['apply','save'].includes(body.command.action)){
    // Use the shipped allocation/structure adapter, not a hand-written ACK
    // normalizer. Completion validation, ACL and persistence remain out of scope.
    const model=control(),domain=equipmentWorkflowAdapter.context(model,{values:{}},context);
    result=equipmentWorkflowAdapter.apply(model,body.command,{...domain,validate:()=>[]});
    allocations={reservedMarks:clone(model.reservedMarks),reservedCategoryCodes:clone(model.reservedCategoryCodes||[])};
   }else result=applyDraftCommand(state,body.command,context);
  }
  catch(error){rejections.push({code:error.message,status:error.status||409});return Response.json({error:error.message,details:error.details},{status:error.status||409});}
  state=result.state;revision++;
  const response={requestId:randomUUID(),revision,permissions,receipt:clone(result.receipt),...(receiptOnly?{}:{control:control()})};
  await onPost(body.command);await pause('POST');if(unknown)throw Error('SYNTHETIC_ACK_LOST');return Response.json(response);
 };
 vm.createContext(c);vm.runInContext(clientSource,c);
 const hook=`window.testPort={writeShared,read,bind,render,saveDraft,enterExistingDraft,confirmNodeDialog,openNodeDialog,confirmAddEquipment,openAddEquipmentDialog,sharedTransport,
  get working(){return working;},get base(){return syncBase;},get control(){return control;},get revision(){return revision;},get busy(){return busy;},get message(){return message;},get node(){return nodeDialog;},get form(){return newEquipmentForm;},get photos(){return pendingPhotos;},get unavailable(){return readUnavailable;},get client(){return sharedClient;},get editId(){return editingEquipmentId;},
  install(model){host=document.querySelector('#data-content');control=model;controlActor=identity().id;revision=10;selectedVersionId='draft';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='grp';working=snapshotOf(open());syncBase=clone(working);syncGeneration=control.workflow.generation;},
  change(kind){if(kind==='local-begin-generation')localBeginReceipt={generation:'different-generation'};if(kind==='host')host={isConnected:true};if(kind==='scope')selectedVersionId='another';if(kind==='generation')control.workflow.generation='replacement';if(kind==='lifecycle')equipmentEditRequest++;if(kind==='client')sharedClient={};if(kind==='attempt'){writeShared.attempt={};busy=true;}if(kind==='same-gen-model'){control=clone(control);control.workflow.revision++;revision=99;}if(kind==='new-model'){control=clone(control);control.workflow.generation='new';revision=99;}},
  edit(id='eq'){editingEquipmentId=id;formSnapshot=clone(working.equipment.find(row=>row.id===id));render();},nodeReplace(){nodeDialog={kind:'category',name:'New dialog'};},setBusy(){busy=true;},
 };`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,hook+'})();'),c);
 cleanups.push(()=>c.RoutineEquipmentUI.navigation.reset());
 const p=c.testPort;p.install(control());p.sharedTransport();
 // Initial access hydration is setup, not an extra dispatch read.
 const savedHold=hold;hold='';await p.client.read();hold=savedHold;calls.length=0;p.render();
 return{c,p,explicitSave:()=>p.saveDraft('save'),host,calls,revoked,events,rejections,serverControl:control,waiting:waiting.promise,release:()=>release.resolve(),state:()=>state,permissions,
  restoreOwner(){c.ProcessSync.identity=actor;epoch=1;delivery=1;},posts:()=>calls.filter(x=>x.method==='POST'),setFailRead:value=>{failRead=value!==false;},onPost:fn=>onPost=fn,onRead:fn=>onRead=fn,
  mutate(kind){if(kind==='actor')c.ProcessSync.identity={id:'other'};else if(kind==='same-id-object')c.ProcessSync.identity={...actor};else if(kind==='epoch')epoch++;else if(kind==='malformed-epoch')epoch=NaN;else if(kind==='null-epoch')epoch=null;else if(kind==='object-epoch')epoch={};else if(kind==='negative-epoch')epoch=-1;else if(kind==='missing-epoch')delete c.ProcessSync.identityGeneration;else if(kind==='missing-capture')delete c.ProcessSync.captureDelivery;else if(kind==='null-delivery')c.ProcessSync.captureDelivery=()=>null;else if(kind==='missing-current')delete c.ProcessSync.isCurrentDelivery;else if(kind==='false-current')c.ProcessSync.isCurrentDelivery=()=>false;else if(kind==='delivery')delivery++;else if(kind==='tab')host.dataset.activeTab='other';else if(kind==='disconnect')host.remove();else if(kind==='reload')c.ProcessSync.requiresReload=true;else p.change(kind);},
  type(value){const input=host.querySelector('[data-issue-result]');assert(input,'actual rendered issue input');input.value=value;input.oninput();return input;},
  peer(collection,id,field,value){state.working[collection].find(row=>row.id===id)[field]=value;state.revision++;revision++;},
 };
}

async function choose(f,value){for(let i=0;i<100;i++){const button=f.c.document.querySelector('[data-equipment-save-choice="'+value+'"]');if(button){button.click();return;}await tick();}assert.fail('Grouped conflict choice missing: '+f.p.message);}
function nextBatchForm(f){
 f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='Next unsaved category';name.dispatchEvent({type:'input',target:name});
 const photo={file:photoFile(2),url:'blob:later-lifecycle'};f.p.photos.set('eq',photo);return{dialog:f.p.node,photo};
}
function assertNextBatch(f,next){assert.equal(f.p.node,next.dialog);assert.equal(f.p.node.name,'Next unsaved category');assert.equal(f.host.querySelector('#routine-dialog-name').value,'Next unsaved category');assert.equal(f.p.photos.get('eq'),next.photo);assert(!f.revoked.includes(next.photo.url));}

void test('local completion plus explicit Save remains one comparison GET and one POST; exact default command snapshot',async()=>{
 const f=await fixture({hold:''});const input=f.type('first');await input.onchange();await f.explicitSave();assert.equal(f.p.working.issues[0].resolution,'first');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.p.busy,false);assert.equal(f.posts().length,1);assert.equal(f.calls.length,2);assert.equal(f.state().saved.content.issues[0].resolution,'first');assert.equal(f.p.client.hasUnknown(),false);
 console.log(JSON.stringify({evidence:'normal request count',sourceSha256:createHash('sha256').update(source).digest('hex'),POST:1,GET:1,requestBytes:f.posts()[0].bytes}));
});
void test('actual oninput while explicit Save awaits ACK retains next batch; only explicit later Save posts',async()=>{
 const f=await fixture(),input=f.type('first'),pending=(async()=>{await input.onchange();return f.explicitSave();})();await f.waiting;f.type('second');const local=f.p.working;f.release();await pending;
 assert.equal(f.p.working,local);assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.state().working.issues[0].resolution,'first');assert.equal(f.posts().length,1);assert.equal(f.calls.length,2);assert.equal(f.p.busy,false);
 assert.equal(f.posts().length,1,'Later input never auto-sends');await f.explicitSave();assert.equal(f.posts().length,2);assert.equal(f.posts()[1].body.command.guards[0].value,'first');assert.equal(f.state().working.issues[0].resolution,'second');
});
for(const kind of ['actor','same-id-object','epoch','delivery','host','scope','generation','lifecycle','client','attempt','reload','new-model','same-gen-model','tab','disconnect'])void test(kind==='lifecycle'?'late editor lifecycle keeps original Save confirmation and later form, RAM and photo':'late '+kind+' ACK cannot adopt metadata, clear RAM/photos or unlock a newer attempt',async()=>{
 const f=await fixture(),input=f.type('sent'),pending=(async()=>{await input.onchange();return f.explicitSave();})();await f.waiting;f.type('next');const local=f.p.working,base=f.p.base;f.mutate(kind);const revision=f.p.revision,next=kind==='lifecycle'?nextBatchForm(f):null;f.release();await pending;
 // Atomic Save owns its sent batch across newer editors, unlike the former Apply.
 if(next){assert.equal(f.p.revision,revision+1);assert.equal(f.p.working,local);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.base.issues[0].resolution,'sent');assert.equal(f.state().saved.content.issues[0].resolution,'sent');assertNextBatch(f,next);assert.equal(f.p.busy,false);assert.equal(f.events.length,1);assert.equal(f.p.client.hasUnknown(),false);await tick();assert.equal(f.posts().length,1,'new form and photo never auto-save');return;}
 assert.equal(f.p.revision,revision);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.busy,kind==='attempt');assert.equal(f.events.length,0);assert.equal(f.posts().length,1);if(kind!=='actor')assert.equal(f.p.client?.hasUnknown?.()??false,['same-id-object','epoch','delivery','reload'].includes(kind),'identity/delivery-invalid terminal evidence retains UNKNOWN');
});
void test('malformed epoch refuses dispatch with RAM preserved',async()=>{const f=await fixture({hold:''});f.type('next');f.mutate('malformed-epoch');await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'next');});
void test('next input on peer-changed path retains pre-send guard and conflicts instead of silent rebase',async()=>{
 const f=await fixture();f.p.working.equipment[0].name='sent title';f.onPost(()=>f.peer('equipment','eq','notes','peer note'));const pending=f.explicitSave();await f.waiting;f.p.working.equipment[0].notes='my next note';f.release();await pending;
 assert.equal(f.p.base.equipment[0].notes,'');assert.equal(f.p.working.equipment[0].notes,'my next note');assert.equal(f.p.control.workflow.working.equipment[0].notes,'','ACK is frozen at its own CAS, not later peer state');const retry=f.explicitSave();await choose(f,'cancel');assert.equal(await retry,null);
 assert.equal(f.p.base.equipment[0].notes,'');assert.equal(f.p.working.equipment[0].notes,'my next note');assert.equal(f.state().working.equipment[0].notes,'peer note');assert.equal(f.posts().length,1);
});
void test('blurred pending next batch survives idle and ordinary explicit read without rebasing',async()=>{
 const f=await fixture(),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('next');f.release();await pending;const local=f.p.working,base=f.p.base;f.peer('issues','issue','resolution','peer');await tick();assert.equal(f.calls.filter(c=>c.method==='GET').length,1,'idle adds no reads after the Save comparison');assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.p.read();assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.posts().length,1);
});
void test('photo upload freezes entries and only releases still-identical sent preview',async()=>{
 const f=await fixture({hold:'PUT'}),old={file:photoFile(1),url:'blob:old'},next={file:photoFile(2),url:'blob:next'},added={file:photoFile(3),url:'blob:added'};
 f.p.photos.set('eq',old);const pending=f.explicitSave();await f.waiting;f.p.photos.set('eq',next);f.p.photos.set('cat',added);f.type('next input');f.release();await pending;
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);assert.equal(f.posts().length,1);assert.equal(f.p.photos.get('eq'),next);assert.equal(f.p.photos.get('cat'),added);assert.deepEqual(f.revoked,['blob:old']);assert(!f.revoked.includes('blob:next'));assert.equal(f.p.base.equipment[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.equal(f.p.working.issues[0].resolution,'next input');
});
void test('unchanged sent photo with later text gets exact uploaded id, releases old entry only',async()=>{
 const f=await fixture({hold:'PUT'}),old={file:photoFile(1),url:'blob:old'};f.p.photos.set('eq',old);const pending=f.explicitSave();await f.waiting;f.type('next input');f.release();await pending;
 assert.equal(f.p.working.equipment[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.equal(f.p.base.equipment[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.equal(f.p.photos.size,0);assert.deepEqual(f.revoked,['blob:old']);assert.equal(f.posts().length,1);
});
for(const kind of ['same-id-object','epoch','delivery','host','lifecycle'])void test(kind==='lifecycle'?'photo upload across editor lifecycle confirms sent photo and preserves later preview':'photo upload '+kind+' prevents later command and preview cleanup',async()=>{
 const f=await fixture({hold:'PUT'}),entry={file:photoFile(1),url:'blob:old'};f.p.photos.set('eq',entry);const pending=f.explicitSave();await f.waiting;f.mutate(kind);const next=kind==='lifecycle'?nextBatchForm(f):null;f.release();await pending;
 if(next){assert.equal(f.posts().length,1);assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);assert.equal(f.p.revision,11);assert.equal(f.state().saved.content.equipment[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.equal(f.p.base.equipment[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.deepEqual(f.revoked,['blob:old']);assertNextBatch(f,next);assert.equal(f.p.busy,false);await tick();assert.equal(f.posts().length,1);return;}
 assert.equal(f.posts().length,0);assert.equal(f.p.photos.get('eq'),entry);assert.deepEqual(f.revoked,[]);assert.equal(f.p.revision,10);
});
void test('receipt-only ACK fallback preserves later input and original next guard',async()=>{
 const f=await fixture({receiptOnly:true}),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('second');f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.posts().length,1);assert.equal(f.calls.filter(x=>x.method==='GET').length,2);
});
void test('failed receipt-only readback preserves RAM/base and never auto POSTs',async()=>{
 const f=await fixture({receiptOnly:true}),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('second');const base=f.p.base;f.setFailRead();f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base,base);assert.equal(f.p.revision,10);assert.equal(f.posts().length,1);
});
void test('Save keeps its shared snapshot while later actual input remains unapplied, including fallback',async()=>{for(const receiptOnly of [false,true]){
 const f=await fixture({receiptOnly}),pending=f.p.writeShared('save');await f.waiting;f.type('unsent');const base=f.p.base;f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'unsent');assert.deepEqual(f.p.base,base);assert.equal(f.state().saved.content.issues[0].resolution,'');assert.deepEqual(f.posts().map(x=>x.body.command.action),['save']);assert.equal(f.p.busy,false);
}});
void test('unknown ACK retains sent and next input; next explicit Save only queries receipt',async()=>{
 const f=await fixture({unknown:true}),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('second');const base=f.p.base;f.release();await pending;assert.equal(f.p.working.issues[0].resolution,'second');assert.equal(f.p.base,base);assert.equal(f.p.client.hasUnknown(),true);await f.explicitSave();assert.equal(f.posts().length,1);assert.equal(f.p.working.issues[0].resolution,'second');
});
void test('same node dialog with actual later typing stays open with input; no duplicate POST',async()=>{
 const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=(async()=>{await f.p.confirmNodeDialog();return f.explicitSave();})();await f.waiting;f.p.openNodeDialog(f.posts()[0].body.command.patches[0].path[0]==='categories'?'category':f.posts()[0].body.command.patches[0].path[0]==='subcategories'?'subcategory':'group',f.posts()[0].body.command.patches[0].value?.id||'cat');const nextName=f.host.querySelector('#routine-dialog-name');nextName.value='second';nextName.dispatchEvent({type:'input',target:nextName});const dialog=f.p.node;f.release();await pending;assert.equal(f.p.node,dialog);assert.equal(f.p.node.name,'second');assert.equal(f.host.querySelector('#routine-dialog-name').value,'second');assert.equal(f.posts().length,1);
});
void test('later node dialog is never closed by previous Save completion',async()=>{
 const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';const pending=(async()=>{await f.p.confirmNodeDialog();return f.explicitSave();})();await f.waiting;f.p.openNodeDialog('group','grp');const dialog=f.p.node;f.release();await pending;assert.equal(f.p.node,dialog);assert.equal(f.posts().length,1);
});
void test('actual equipment form Save retains later actual editor input instead of closing',async()=>{
 const f=await fixture();f.p.edit();const input=f.host.querySelector('#routine-editor [data-field="name"]');input.value='first';input.oninput();f.host.querySelector('#routine-form-apply').click();await tick();const pending=f.explicitSave();await f.waiting;f.p.edit();const next=f.host.querySelector('#routine-editor [data-field="name"]');next.value='next';next.oninput();f.release();await pending;assert.equal(f.p.editId,'eq');assert.equal(f.p.working.equipment[0].name,'next');assert.equal(f.posts().length,1);
});

void test('normal Begin advances its own generation without leaving busy latched',async()=>{
 const {fixture:routeFixture}=require('../scripts/quality-replacement-preview-fixture.cjs'),{connect}=require('../scripts/test-routine-equipment-isolated-workflow.cjs'),h=await routeFixture();
 try{const f=await connect(h),before=h.flow(await h.read('routine-equipment')),calls=[],raw=f.c.fetch;
  f.c.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});return raw(url,options);};
  const result=await f.test.writeShared('begin'),after=h.flow(await h.read('routine-equipment'));assert(result);assert.equal(result.operationKind,'begin-v1');assert.equal(result.recoveryKind,'begin-v1');
  const posts=calls.filter(call=>call.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].body.action,'begin-v1');assert.equal(result.receipt.operationId,posts[0].body.begin.operationId);assert.equal(result.receipt.generation,after.generation);assert.notEqual(after.generation,before?.generation);assert.equal(f.test.model.workflow.generation,after.generation);
  const lookup=await h.load('app/api/routine-equipment/workflow/route.ts').GET(new Request('http://fixture/api/routine-equipment/workflow?operationId='+result.receipt.operationId,{headers:h.sessions.editor}));assert.equal(lookup.status,200);const receipt=await lookup.json();assert.equal(receipt.operationKind,'begin-v1');assert.deepEqual(receipt.receipt,JSON.parse(JSON.stringify(result.receipt)));assert.equal(f.storage.size,0);assert.equal(f.test.readUnavailable,false);assert.equal(f.host.querySelector('#routine-save').disabled,false,'owned Begin releases busy and enables explicit Save');assert.deepEqual(calls.map(call=>call.method),['GET','POST','GET'],'identified Begin includes original-basis and authoritative readback');f.c.RoutineEquipmentUI.navigation.reset();
 }finally{h.close();}
});
void test('normal Save / Submit / review accepts its own review generation and unlocks',async()=>{const f=await fixture({hold:''});f.c.captureSharedDraftSubmission=flow=>({savedId:flow.saved.id,expectedRevision:flow.revision});assert(await f.p.writeShared('save'));assert(await f.p.writeShared('submit'));const gen=f.p.control.workflow.generation;assert(await f.p.writeShared('reject'));assert.notEqual(f.p.control.workflow.generation,gen);assert.equal(f.p.busy,false);assert.deepEqual(f.posts().map(x=>x.body.command.action),['save','submit','return']);});
for(const kind of ['same-id-object','epoch','delivery','host','lifecycle'])void test(kind==='lifecycle'?'receipt-only fallback across editor lifecycle confirms sent batch and preserves later input':'late receipt-only fallback GET '+kind+' is rejected before metadata adoption',async()=>{const f=await fixture({receiptOnly:true,hold:'GET',holdAfterPost:true}),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('next');f.mutate(kind);const next=kind==='lifecycle'?nextBatchForm(f):null;f.release();await pending;
 if(next){assert.equal(f.p.revision,11);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.base.issues[0].resolution,'first');assert.equal(f.state().saved.content.issues[0].resolution,'first');assertNextBatch(f,next);assert.equal(f.p.busy,false);assert.equal(f.calls.filter(call=>call.method==='GET').length,2);await tick();assert.equal(f.posts().length,1);return;}
 assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.base.issues[0].resolution,'');assert.equal(f.posts().length,1);});
void test('Save flush awaits existing default-client work but epoch drift cannot dispatch Save',async()=>{const f=await fixture(),path=['equipment',{id:'eq'},'name'],queued=f.p.client.command('gen','apply',{patches:[{op:'set',path,value:'queued'}],guards:[{path,value:'Tool'}]});await f.waiting;const save=f.p.writeShared('save');await tick();f.mutate('epoch');f.release();await assert.rejects(queued,/RESULT_UNKNOWN/);await save;assert.deepEqual(f.posts().map(x=>x.body.command.action),['apply']);assert.equal(f.p.revision,10);});
void test('same photo-entry object with replaced File/url is still a later preview, never revoked',async()=>{const f=await fixture({hold:'PUT'}),entry={file:photoFile(1),url:'blob:old'};f.p.photos.set('eq',entry);const pending=f.explicitSave();await f.waiting;entry.file={size:2,type:'image/png'};entry.url='blob:next';f.release();await pending;assert.equal(f.p.photos.get('eq'),entry);assert.deepEqual(f.revoked,['blob:old']);assert(!f.revoked.includes('blob:next'));assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});

void test('unknown new-equipment Save retains its submitted row and later form input without a second POST',async()=>{const f=await fixture({unknown:true});f.p.openAddEquipmentDialog();for(const[id,value]of [['asset-code','NEW-1'],['name','First new tool']]){const input=f.host.querySelector('#routine-add-'+id);input.value=value;input.dispatchEvent({type:'input',target:input});}const pending=(async()=>{await f.p.confirmAddEquipment();return f.explicitSave();})();await f.waiting;const id=f.p.working.equipment.find(row=>row.assetCode==='NEW-1').id;f.p.edit(id);const input=f.host.querySelector('#routine-editor [data-field="name"]');input.value='Later new tool';input.oninput();const form=f.p.working.equipment.find(row=>row.id===id);f.release();await pending;assert.equal(f.p.working.equipment.find(row=>row.id===id),form);assert.equal(form.name,'Later new tool');assert.equal(f.p.working.equipment.filter(row=>row.assetCode==='NEW-1').length,1);await f.p.enterExistingDraft();assert.equal(f.p.working.equipment.filter(row=>row.assetCode==='NEW-1').length,1);assert.equal(f.posts().length,1);});

for(const kind of ['null-epoch','object-epoch','negative-epoch','missing-epoch','missing-capture','null-delivery','missing-current','false-current'])void test('missing or malformed ownership port '+kind+' fails closed with zero POST',async()=>{const f=await fixture({hold:''});f.type('retained');f.mutate(kind);await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'retained');assert.equal(f.p.busy,false);});
for(const kind of ['category','subcategory','group'])void test('new '+kind+' dialog uses exact created row on second explicit Save without duplicate insertion',async()=>{const f=await fixture(),key={category:'categories',subcategory:'subcategories',group:'groups'}[kind],before=f.p.working[key].length;f.p.openNodeDialog(kind);const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=(async()=>{await f.p.confirmNodeDialog();return f.explicitSave();})();await f.waiting;f.p.openNodeDialog(f.posts()[0].body.command.patches[0].path[0]==='categories'?'category':f.posts()[0].body.command.patches[0].path[0]==='subcategories'?'subcategory':'group',f.posts()[0].body.command.patches[0].value?.id||'cat');const nextName=f.host.querySelector('#routine-dialog-name');nextName.value='second';nextName.dispatchEvent({type:'input',target:nextName});f.release();await pending;const id=f.p.node.prior.id;assert.equal(f.p.working[key].length,before+1);await f.p.confirmNodeDialog();await f.explicitSave();assert.equal(f.state().working[key].length,before+1);assert.equal(f.state().working[key].find(row=>row.id===id).name,'second');assert.equal(f.posts().length,2);assert.equal(f.posts()[1].body.command.patches.some(p=>p.op==='insert'),false);});
void test('ordinary read keeps next dialog prior attached to working, so later explicit Save sends it',async()=>{const f=await fixture();f.p.openNodeDialog('category','cat');const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=(async()=>{await f.p.confirmNodeDialog();return f.explicitSave();})();await f.waiting;f.p.openNodeDialog(f.posts()[0].body.command.patches[0].path[0]==='categories'?'category':f.posts()[0].body.command.patches[0].path[0]==='subcategories'?'subcategory':'group',f.posts()[0].body.command.patches[0].value?.id||'cat');const nextName=f.host.querySelector('#routine-dialog-name');nextName.value='second';nextName.dispatchEvent({type:'input',target:nextName});f.release();await pending;const prior=f.p.node.prior;await f.p.read();assert.equal(f.p.working.categories[0],prior);await f.p.confirmNodeDialog();await f.explicitSave();assert.equal(f.state().working.categories[0].name,'second');});
void test('confirmed node photo plus next text keeps authoritative photoId, not revoked preview or duplicate upload',async()=>{const f=await fixture();f.p.openNodeDialog('category','cat');const entry={file:photoFile(1),url:'blob:node'};f.p.node.pendingPhoto=entry;const name=f.host.querySelector('#routine-dialog-name');name.value='first';name.dispatchEvent({type:'input',target:name});const pending=(async()=>{await f.p.confirmNodeDialog();return f.explicitSave();})();await f.waiting;f.p.openNodeDialog(f.posts()[0].body.command.patches[0].path[0]==='categories'?'category':f.posts()[0].body.command.patches[0].path[0]==='subcategories'?'subcategory':'group',f.posts()[0].body.command.patches[0].value?.id||'cat');const nextName=f.host.querySelector('#routine-dialog-name');nextName.value='second';nextName.dispatchEvent({type:'input',target:nextName});f.release();await pending;assert.equal(f.p.node.name,'second');assert.equal(f.p.node.pendingPhoto,null);assert.equal(f.p.node.photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));await f.p.confirmNodeDialog();await f.explicitSave();assert.equal(f.state().working.categories[0].name,'second');assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});
void test('new equipment with acknowledged photo and later form input reuses its row and photo on explicit completion and Save',async()=>{const f=await fixture();f.p.openAddEquipmentDialog();f.p.form.pendingPhoto={file:photoFile(1),url:'blob:add'};for(const[id,value]of [['asset-code','NEW-1'],['name','First new tool']]){const input=f.host.querySelector('#routine-add-'+id);input.value=value;input.dispatchEvent({type:'input',target:input});}const pending=(async()=>{await f.p.confirmAddEquipment();return f.explicitSave();})();await f.waiting;const id=f.p.working.equipment.find(row=>row.assetCode==='NEW-1').id;f.p.edit(id);const input=f.host.querySelector('#routine-editor [data-field="name"]');input.value='Later new tool';input.oninput();f.release();await pending;assert.equal(f.p.photos.has(id),false);await f.p.read();f.host.querySelector('#routine-form-apply').click();await tick();await f.explicitSave();const rows=f.state().working.equipment.filter(row=>row.assetCode==='NEW-1');assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].name,'Later new tool');assert.equal(rows[0].photoId,createHash('sha256').update(new Uint8Array(1)).digest('hex'));assert.equal(f.posts().length,2);assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);});

for(const kind of ['actor','same-id-object','epoch'])void test('pre-read '+kind+' cannot reattribute retained local input or project it into the new owner UI',async()=>{const f=await fixture({hold:''});f.type('PRIVATE ORIGINAL INPUT');const local=f.p.working,base=f.p.base;f.mutate(kind);await assert.rejects(f.p.read(),/ACCOUNT_CHANGED/);f.p.render();assert.equal(f.host.querySelector('[data-issue-result]'),null);assert.doesNotMatch(f.host.innerHTML,/PRIVATE ORIGINAL INPUT/);assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.p.working.issues[0].resolution,'PRIVATE ORIGINAL INPUT');f.restoreOwner();await f.p.read();f.p.render();assert.equal(f.host.querySelector('[data-issue-result]').value,'PRIVATE ORIGINAL INPUT');assert.equal(f.p.working,local);});
for(const kind of ['actor','same-id-object','epoch'])void test('clean read after '+kind+' may load new owner without inheriting a private buffer',async()=>{const f=await fixture({hold:''});f.mutate(kind);await f.p.read();f.p.render();f.type('new owner input');await f.explicitSave();assert.equal(f.posts().length,1);assert.equal(f.state().working.issues[0].resolution,'new owner input');});

void test('delivery drift blocks direct Save, idle, and automatic read/mount until explicit UI retry validates it',async()=>{const f=await fixture({hold:''});f.type('retained');const local=f.p.working,base=f.p.base;f.mutate('delivery');await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.host.querySelector('[data-issue-result]'),null);await assert.rejects(f.p.read());await tick();assert.equal(f.calls.filter(c=>c.method==='GET').length,0,'idle creates no reads');await f.c.RoutineEquipmentUI.mount(f.host);assert.equal(f.calls.length,0);const retry=f.host.querySelector('#routine-load-retry');assert(retry,'actual explicit retry button');retry.click();await tick();await tick();assert.equal(f.p.unavailable,false);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.calls.filter(x=>x.method==='GET').length,2);assert.equal(f.posts().length,0);await f.explicitSave();assert.equal(f.posts().length,1);assert.equal(f.posts()[0].body.command.guards[0].value,'');});
void test('explicit delivery recheck keeps original peer-conflicting guard, never rebases private input',async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working,base=f.p.base;f.mutate('delivery');f.peer('issues','issue','resolution','peer');await f.p.read(false,true);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.base.issues[0].resolution,'');const retry=f.explicitSave();await choose(f,'cancel');assert.equal(await retry,null);assert.equal(f.posts().length,0);assert.equal(f.p.base.issues[0].resolution,'');assert.equal(f.state().working.issues[0].resolution,'peer');assert.equal(f.p.working.issues[0].resolution,'mine');});
for(const kind of ['view-denied','edit-denied','pending','generation','scope','malformed-flow','older-revision','http-failure'])void test('explicit delivery recheck '+kind+' does not admit retained inputs',async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working,base=f.p.base,before=f.p.control;f.mutate('delivery');if(kind==='view-denied')f.permissions.view=false;if(kind==='edit-denied')f.permissions.edit=false;if(kind==='pending')f.state().pendingId='pending';if(kind==='generation')f.state().generation='new-generation';if(kind==='scope')f.state().scope='other';if(kind==='malformed-flow')f.state().revision=null;if(kind==='older-revision')f.onRead(async url=>!String(url).includes('/workflow')?Response.json({control:clone(before),revision:9,permissions:f.permissions}):undefined);if(kind==='http-failure')f.setFailRead();await assert.rejects(f.p.read(false,true));assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.control,before);await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.host.querySelector('[data-issue-result]'),null);});
for(const kind of ['host','scope','tab','disconnect'])void test('explicit delivery recheck cannot move RAM across '+kind,async()=>{const f=await fixture({hold:''});f.type('mine');const local=f.p.working;f.mutate('delivery');f.mutate(kind);await assert.rejects(f.p.read(false,true));await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.calls.length,0);assert.equal(f.p.working,local);});
void test('late explicit recheck from prior delivery cannot admit the now newer delivery',async()=>{const f=await fixture({hold:'GET'});f.type('mine');f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;f.mutate('delivery');f.release();await assert.rejects(pending,/DELIVERY/);await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'mine');});
void test('new delivery explicit recheck does not clear unknown marker or failure and next Save only queries original receipt',async()=>{const f=await fixture({unknown:true}),pending=(async()=>{await f.type('first').onchange();return f.explicitSave();})();await f.waiting;f.type('next');f.release();await pending;const records=()=>Array.from({length:f.c.sessionStorage.length},(_,i)=>{const k=f.c.sessionStorage.key(i);return[k,f.c.sessionStorage.getItem(k)];});const marker=records(),failed=f.p.client.hasSyncFailures(),base=f.p.base,local=f.p.working;assert.equal(f.p.client.hasUnknown(),true);f.mutate('delivery');await f.p.read(false,true);assert.equal(f.p.client.hasUnknown(),true);assert.equal(f.p.client.hasSyncFailures(),failed);assert.deepEqual(records(),marker);assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.explicitSave();assert.equal(f.posts().length,1);assert.equal(f.p.client.hasUnknown(),true);assert.deepEqual(records(),marker);});
void test('known pre-CAS Save rejection retains original base through recheck and new compared Save',async()=>{
 const f=await fixture({hold:''});f.peer('issues','issue','resolution','peer');f.type('mine');const local=f.p.working,base=f.p.base;
 // Inject the peer race only after the final readonly comparison: the new
 // pre-dispatch recompare now handles changes made while choosing.
 const dispatch=f.c.fetch;let race='peer after comparison',server;f.c.fetch=async(url,options={})=>{if(options.method==='POST'&&JSON.parse(options.body||'{}').command){f.peer('issues','issue','resolution',race);server=clone(f.serverControl());}return dispatch(url,options);};
 const first=f.explicitSave();await choose(f,'mine');assert.equal(await first,null);
 assert.deepEqual(f.rejections,[{code:'DRAFT_REVISION_CHANGED_RECONFIRM',status:409}]);assert.deepEqual(f.serverControl(),server);assert.equal(f.p.client.hasUnknown(),false);assert.equal(f.p.client.hasSyncFailures(),false);assert.equal(f.c.sessionStorage.length,0);assert.equal(f.posts()[0].body.command.guards[0].value,'peer');assert.equal(f.p.base,base);
 f.mutate('delivery');await f.p.read(false,true);assert.equal(f.posts().length,1);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.base.issues[0].resolution,'');assert.deepEqual(f.serverControl(),server);await tick();assert.equal(f.posts().length,1);
 race='peer after second comparison';const second=f.explicitSave();await choose(f,'mine');assert.equal(await second,null);const newer=server;assert.equal(f.posts().length,2);assert.notEqual(f.posts()[1].body.command.operationId,f.posts()[0].body.command.operationId);assert.equal(f.posts()[1].body.command.guards[0].value,'peer after comparison');assert.deepEqual(f.rejections,[{code:'DRAFT_REVISION_CHANGED_RECONFIRM',status:409},{code:'DRAFT_REVISION_CHANGED_RECONFIRM',status:409}]);assert.deepEqual(f.serverControl(),newer);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.client.hasUnknown(),false);
});
void test('retained add drawer uses explicit delivery gate without applying its DOM inputs',async()=>{const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const input=f.host.querySelector('#routine-add-name');input.value='private new name';input.dispatchEvent({type:'input',target:input});const form=f.p.form;f.mutate('delivery');await f.p.writeShared('save');const retry=f.host.querySelector('#routine-load-retry');assert(retry);retry.click();await tick();await tick();assert.equal(f.p.form,form);assert.equal(f.host.querySelector('#routine-add-name').value,'private new name');assert.equal(f.posts().length,0);assert.equal(f.calls.filter(x=>x.method==='GET').length,2);});

void test('pre-existing drawer retry button cannot use old renewal flow to bypass changed delivery gate',async()=>{const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const input=f.host.querySelector('#routine-add-name');input.value='retained drawer';input.dispatchEvent({type:'input',target:input});f.setFailRead();await assert.rejects(f.p.read());f.p.render();const retry=f.host.querySelector('#routine-load-retry');assert(retry);const start=f.calls.length;f.setFailRead(false);f.mutate('delivery');retry.click();await tick();await tick();assert.equal(f.p.unavailable,false);assert.equal(f.p.form.name,'retained drawer');assert.equal(f.calls.length-start,2);assert.equal(f.calls.slice(start).some(x=>String(x.url).includes('shared-state')),false);assert.equal(f.posts().length,0);});
void test('explicit delivery recheck quarantines detached input, preserves RAM and resumes only live same-owner typing',async()=>{
 const f=await fixture({hold:'GET'}),input=f.type('before'),local=f.p.working,base=f.p.base;
 f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;
 // Recheck renders the quarantine view. A detached event is not new user input.
 assert.equal(input.isConnected,false);assert.equal(f.host.querySelector('[data-issue-result]'),null);
 input.value='stale detached event';input.oninput();assert.equal(f.p.working.issues[0].resolution,'before');
 f.release();await pending;assert.equal(f.p.working,local);assert.equal(f.p.base,base);
 f.p.render();const current=f.type('after recheck');assert.equal(current.isConnected,true);assert.notEqual(current,input);
 input.oninput();assert.equal(f.p.working.issues[0].resolution,'after recheck');assert.equal(f.p.base.issues[0].resolution,'');assert.equal(f.posts().length,0);
});

for(const kind of ['tab','disconnect'])void test('late explicit recheck after '+kind+' cannot admit detached or repurposed target',async()=>{const f=await fixture({hold:'GET'});f.type('mine');f.mutate('delivery');const pending=f.p.read(false,true);await f.waiting;f.mutate(kind);f.release();await assert.rejects(pending,/DELIVERY/);await f.explicitSave();assert.equal(f.posts().length,0);assert.equal(f.p.revision,10);assert.equal(f.p.working.issues[0].resolution,'mine');});

void test('synthetic select port preserves empty placeholders and explicit later selection without input events',async()=>{
 const f=await fixture({hold:''}),root=f.c.document.createElement('div');let events=0;
 root.innerHTML='<select><option value="">Choose</option><option value="valid">Valid</option></select>';
 const select=root.querySelector('select');select.addEventListener('change',()=>events++);select.addEventListener('input',()=>events++);
 assert.equal(select.value,'','absence of selected does not invent a legal domain value');select.value='valid';assert.equal(select.value,'valid');select.value='';assert.equal(select.value,'');
 root.innerHTML='<select><option value="">Choose</option><option value="selected" selected>Selected</option></select>';
 assert.equal(root.querySelector('select').value,'selected');assert.equal(events,0);assert.equal(f.calls.length,0);
});


for(const kind of ['actor','same-id-object','epoch','generation','tab','host','disconnect','delivery','scope','reload','local-begin-generation'])void test('explicit equipment delivery permission completion rejects later '+kind+' without renewing runtime',async()=>{
 const f=await fixture({hold:''});f.type('mine');const client=f.p.client,local=f.p.working,base=f.p.base;
 f.mutate('delivery');const reached=deferred(),release=deferred();
 f.onRead(async url=>{if(String(url).includes('permissions=1')){reached.resolve();await release.promise;}});
 const pending=f.p.read(false,true);await reached.promise;f.mutate(kind);release.resolve();await assert.rejects(pending);
 assert.equal(f.p.client,client);assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.posts().length,0);
 await assert.rejects(client.permissions({equipmentRecheck:true,isCurrent:()=>true}));assert.equal(f.calls.length,2,'public read options cannot grant a third read');
});
for(const failure of ['view','edit','older','malformed','http','lost','cancel'])void test('explicit equipment delivery permission '+failure+' cannot commit delivery or discard RAM',async()=>{
 const f=await fixture({hold:''});f.type('mine');const client=f.p.client,local=f.p.working,base=f.p.base;f.mutate('delivery');
 f.onRead(async url=>{if(!String(url).includes('permissions=1'))return;
  if(failure==='lost')throw Error('SYNTHETIC_PERMISSION_LOST');
  if(failure==='cancel')throw Object.assign(Error('SYNTHETIC_CANCEL'),{name:'AbortError'});
  const permissions={...f.permissions};if(failure==='view'||failure==='edit')permissions[failure]=false;
  return Response.json({permissions,revision:failure==='older'?9:failure==='malformed'?null:10},{status:failure==='http'?503:200});
 });
 await assert.rejects(f.p.read(false,true));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(f.p.client,client);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.posts().length,0);assert.equal(f.calls.length,2);
 await assert.rejects(client.permissions());assert.equal(f.calls.length,2,'no implicit retry after refusal');
});
void test('explicit equipment delivery retains exact unknown command bytes and original receipt destination',async()=>{
 const f=await fixture({unknown:true}),pending=(async()=>{await f.type('mine').onchange();return f.explicitSave();})();await f.waiting;f.release();await pending;
 const client=f.p.client,local=f.p.working,base=f.p.base,command=clone(f.posts()[0].body.command),records=()=>Array.from({length:f.c.sessionStorage.length},(_,i)=>{const key=f.c.sessionStorage.key(i);return[key,f.c.sessionStorage.getItem(key)];}),before=records();
 f.mutate('delivery');await f.p.read(false,true);assert.equal(f.p.client,client);assert.equal(client.isBeginRuntimeCurrent(),true);assert.equal(client.hasUnknown(),true);assert.deepEqual(records(),before);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.deepEqual(f.posts()[0].body.command,command);
 await f.p.enterExistingDraft();assert.equal(f.posts().length,1);assert.equal(client.hasUnknown(),true);assert.deepEqual(records(),before);
 const receipts=f.calls.filter(call=>String(call.url).includes('operationId='));assert(receipts.length>0);assert(receipts.every(call=>String(call.url).includes(command.operationId)));assert.deepEqual(f.posts()[0].body.command,command);
});
void test('explicit equipment delivery cannot clear a real queued Apply failure latch',async()=>{
 const f=await fixture({hold:''});f.type('mine');f.peer('issues','issue','resolution','peer');const client=f.p.client,path=['issues',{id:'issue'},'resolution'];
 await assert.rejects(client.command('gen','apply',{patches:[{op:'set',path,value:'mine'}],guards:[{path,value:''}]}));assert.equal(client.hasSyncFailures(),true);
 const count=f.calls.length,local=f.p.working,base=f.p.base;f.mutate('delivery');await assert.rejects(f.p.read(false,true));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(client.hasSyncFailures(),true);assert.equal(f.p.client,client);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.calls.length,count+1);assert.equal(f.posts().length,1);
});
void test('equipment delivery recheck cannot bless a changed unknown journal during permission GET',async()=>{
 const f=await fixture({unknown:true}),pending=(async()=>{await f.type('mine').onchange();return f.explicitSave();})();await f.waiting;f.release();await pending;
 const client=f.p.client,key=Array.from({length:f.c.sessionStorage.length},(_,i)=>f.c.sessionStorage.key(i)).find(key=>key.startsWith('shared-draft-v3-operation:')),before=f.c.sessionStorage.getItem(key),changed=before+' ';
 f.mutate('delivery');f.onRead(async url=>{if(String(url).includes('permissions=1'))f.c.sessionStorage.setItem(key,changed);});
 await assert.rejects(f.p.read(false,true));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(client.hasUnknown(),true);assert.equal(f.c.sessionStorage.getItem(key),changed);assert.equal(f.posts().length,1);
});
void test('equipment delivery recheck never retires an unresolved Begin marker',async()=>{
 const f=await fixture({hold:''});f.type('mine');const client=f.p.client,key='shared-draft-begin-v1:'+JSON.stringify(['owner','/api/routine-equipment/workflow']),marker=JSON.stringify({version:1,actorId:'owner',endpoint:'/api/routine-equipment/workflow',operationId:randomUUID(),basis:{generation:'gen',activeVersionId:null,openVersionId:'draft',openVersionStatus:'draft',openVersionRevision:null}});
 f.c.sessionStorage.setItem(key,marker);f.mutate('delivery');await assert.rejects(f.p.read(false,true));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(client.hasUnknownBegin(),true);assert.equal(f.c.sessionStorage.getItem(key),marker);assert.equal(f.posts().length,0);assert.equal(f.calls.length,1);
});
void test('delivery recheck capability is unavailable to non-equipment clients',async()=>{
 const f=await fixture({hold:''}),client=f.c.createSharedDraftClient({endpoint:'/api/fqc/workflow',actorId:'owner',durableBegin:true,guardAccessResults:true,headers:()=>({'Content-Type':'application/json'})});
 f.mutate('delivery');await assert.rejects(client.recheckEquipmentDelivery('gen',()=>true,()=>true));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(f.calls.length,0);
});

for(const durableBegin of [true,false])void test('equipment delivery opt-out cannot use permission renewal with durableBegin '+durableBegin,async()=>{
 const f=await fixture({hold:''}),client=f.c.createSharedDraftClient({endpoint:'/api/routine-equipment/workflow?caseMetadata=1',actorId:'owner',durableBegin,equipmentLocalSave:false,guardAccessResults:true,headers:()=>({'Content-Type':'application/json'})});
 f.mutate('delivery');await assert.rejects(client.recheckEquipmentDelivery('gen',()=>true,()=>true));assert.throws(()=>client.confirmEquipmentDelivery({permissions:{view:true,edit:true},revision:10}));assert.equal(f.calls.length,0);
});
void test('invalid equipment capability factory destinations fail before any GET',async()=>{
 const f=await fixture({hold:''});for(const endpoint of ['/api/fqc/workflow','/api/routine-equipment/workflow','/api/routine-equipment/workflow?caseMetadata=1&other=1'])assert.throws(()=>f.c.createSharedDraftClient({endpoint,actorId:'owner',durableBegin:true,equipmentLocalSave:true}));
 assert.throws(()=>f.c.createSharedDraftClient({endpoint:'/api/routine-equipment/workflow?caseMetadata=1',actorId:'owner',durableBegin:false,equipmentLocalSave:true}));assert.equal(f.calls.length,0);
});
void test('equipment permission receipt cannot renew before caller confirmation or after owner drift',async()=>{
 const f=await fixture({hold:''});f.type('mine');const client=f.p.client;f.mutate('delivery');
 const result=await client.recheckEquipmentDelivery('gen',()=>true,()=>true);assert.equal(client.isBeginRuntimeCurrent(),false);assert.throws(()=>client.confirmEquipmentDelivery(clone(result)));
 f.mutate('epoch');assert.throws(()=>client.confirmEquipmentDelivery(result));assert.equal(client.isBeginRuntimeCurrent(),false);assert.equal(f.posts().length,0);assert.equal(f.calls.length,1);
});

void test('lost Save ACK plus receipt 404 remains UNKNOWN across explicit recheck, unlike known pre-CAS 409',async()=>{
 const f=await fixture({unknown:true,receiptStatus:404}),pending=(async()=>{await f.type('sent').onchange();return f.explicitSave();})();await f.waiting;f.type('next');f.release();await pending;
 const client=f.p.client,command=clone(f.posts()[0].body.command),local=f.p.working,base=f.p.base,records=()=>Array.from({length:f.c.sessionStorage.length},(_,i)=>{const key=f.c.sessionStorage.key(i);return[key,f.c.sessionStorage.getItem(key)];}),marker=records();
 assert.equal(f.rejections.length,0);assert.equal(f.state().saved.content.issues[0].resolution,'sent','handler actually committed before ACK was lost');assert.equal(client.hasUnknown(),true);assert(marker.length>0);
 f.mutate('delivery');await f.p.read(false,true);assert.equal(f.p.client,client);assert.deepEqual(records(),marker);assert.equal(f.p.working,local);assert.equal(f.p.base,base);await f.p.enterExistingDraft();await f.p.enterExistingDraft();await f.explicitSave();
 assert.equal(f.posts().length,1);assert.equal(client.hasUnknown(),true);assert.deepEqual(records(),marker);assert.equal(f.p.working.issues[0].resolution,'next');assert.equal(f.p.base.issues[0].resolution,'');const receipts=f.calls.filter(call=>String(call.url).includes('operationId='));assert(receipts.length>=3);assert(receipts.every(call=>String(call.url).includes(command.operationId)));assert.equal(f.state().saved.content.issues[0].resolution,'sent');
});
