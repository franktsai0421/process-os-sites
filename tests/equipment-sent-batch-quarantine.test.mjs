// Actual full equipment caller, registered input handlers, default shared client and
// shared-draft kernel. DOM/timing and HTTP responses are synthetic and in-memory.
// No network, browser, route authorization, persistence or native layout claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto, randomUUID} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')();
const {createSharedDraft,applyDraftCommand}=load('lib/shared-draft.ts');
const source=fs.readFileSync(process.env.EQUIPMENT_SENT_BATCH_SOURCE||'public/process/routine-equipment.js','utf8');
const clientSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const storage=()=>{const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
async function fixture({hold='POST',receiptOnly=false,unknown=false}={}){
 const dom=canvasDOM(),document=dom.document;document.getElementById=id=>document.querySelector('#'+id);document.visibilityState='visible';
 const host=document.createElement('main');host.id='data-content';host.dataset.activeTab='quality-routine-equipment';document.body.append(host);
 const content={equipment:[{id:'eq',name:'Tool',assetCode:'TEST',pieceMark:'01',unit:'支',enabled:true,groupId:'grp',photoId:'old-photo',notes:''}],categories:[{id:'cat',code:'C01',name:'Category',photoId:''}],subcategories:[{id:'sub',categoryId:'cat',name:'Sub'}],groups:[{id:'grp',categoryId:'cat',subcategoryId:'sub',name:'Group'}],issues:[{id:'issue',status:'pending',resolution:'',assetCode:'TEST',type:'synthetic'}]};
 let state=createSharedDraft('routine-equipment',content,null,'gen'),revision=10,epoch=1,delivery=1,pollCallback,pollEpoch=0;
 const control=()=>({schemaVersion:1,issues:clone(state.working.issues),reservedMarks:{},activeVersionId:null,workflow:clone(state),versions:[{id:'draft',number:1,status:state.pendingId?'pending':'draft',history:[],snapshot:clone(state.working),...clone(state.working)}]});
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
  try{result=applyDraftCommand(state,body.command,{actor:{...actor,admin:true},at:'2026-10-31T00:00:00Z',id:randomUUID,allowed:()=>true,activeId:null,semantic:v=>v,structure(){},validate:()=>[]});}
  catch(error){return Response.json({error:error.message,details:error.details},{status:error.status||409});}
  state=result.state;revision++;await onPost(body.command);
  const response={revision,permissions,receipt:clone(result.receipt),...(receiptOnly?{}:{control:control()})};
  await pause('POST');if(unknown)throw Error('SYNTHETIC_ACK_LOST');return Response.json(response);
 };
 vm.createContext(c);vm.runInContext(clientSource,c);
 c.createForegroundPoll=()=>({capture:()=>pollEpoch,isCurrent:v=>v===pollEpoch,cancel(){pollEpoch++;},schedule:fn=>{pollCallback=fn;}});
 const hook=`window.testPort={writeShared,read,bind,render,recoverAddEquipmentRead,pollShared,confirmNodeDialog,openNodeDialog,confirmAddEquipment,openAddEquipmentDialog,sharedTransport,
  get origin(){return inputOwner;},get working(){return working;},get base(){return syncBase;},get control(){return control;},get revision(){return revision;},get busy(){return busy;},get message(){return message;},get node(){return nodeDialog;},get form(){return newEquipmentForm;},get photos(){return pendingPhotos;},get unavailable(){return readUnavailable;},get client(){return sharedClient;},get editId(){return editingEquipmentId;},
  install(model){host=document.querySelector('#data-content');control=model;controlActor=identity().id;revision=10;selectedVersionId='draft';selectedCategory='cat';selectedSubcategory='sub';selectedGroup='grp';working=snapshotOf(open());syncBase=clone(working);syncGeneration=control.workflow.generation;},
  change(kind){if(kind==='owner')newEquipmentOwner={...newEquipmentOwner};if(kind==='form')newEquipmentForm={...newEquipmentForm,name:'replacement form'};if(kind==='restore-target'){selectedVersionId='draft';control.workflow.generation='gen';}if(kind==='host')host={isConnected:true};if(kind==='scope')selectedVersionId='another';if(kind==='generation')control.workflow.generation='replacement';if(kind==='lifecycle')equipmentEditRequest++;if(kind==='client')sharedClient={};if(kind==='attempt'){writeShared.attempt={};busy=true;}if(kind==='same-gen-model'){control=clone(control);control.workflow.revision++;revision=99;}if(kind==='new-model'){control=clone(control);control.workflow.generation='new';revision=99;}},
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


const raw={assetCode:' QA RAW ',name:'  名稱 Tên  ',unit:'組',owner:'  QA RD  ',calibrationMethod:'internal',calibrationCycle:'custom',customCycle:'  45 days  ',calibratedAt:'2026-10-17',expiresAt:'2027-10-17',intakeDate:'2026-10-16',spec:'  spec\nline  ',notes:'  notes\n尾端  ',groupId:'grp',enabled:false,confirmed:true};
const fieldIds={assetCode:'asset-code',name:'name',unit:'unit',owner:'owner',calibrationMethod:'calibration-method',calibrationCycle:'calibration-cycle',customCycle:'custom-cycle',calibratedAt:'calibrated-at',expiresAt:'expires-at',intakeDate:'intake-date',spec:'spec',notes:'notes',groupId:'group-select',enabled:'enabled',confirmed:'confirmed'};
async function rawDrawer(){const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const photo={file:{size:1,type:'image/png'},url:'blob:private-original'};f.p.form.pendingPhoto=photo;const form=f.p.form,origin=f.p.origin,working=f.p.working,base=f.p.base,drawer=f.host.querySelector('#routine-add-modal');for(const[key,id]of Object.entries(fieldIds)){let field=f.host.querySelector('#routine-add-'+id);if(!field){field=f.c.document.createElement('input');field.id='routine-add-'+id;drawer.append(field);}field.value=String(raw[key]);}assert.equal(form.assetCode,'','DOM-only raw changes deliberately fire no input/change events');return{...f,form,origin,working,base,drawer,photo};}
function preserved(f,{requests=0,origin=f.origin}={}){assert.equal(f.p.form,f.form);assert.equal(f.p.origin,origin);assert.equal(f.p.working,f.working);assert.equal(f.p.base,f.base);assert.equal(f.form.pendingPhoto,f.photo);for(const[key,value]of Object.entries(raw))assert.equal(f.form[key],value,key);assert.equal(f.calls.length,requests);assert.deepEqual(f.revoked,[]);}

void test('actual recovery plus actual quarantine renderer retains DOM-only raw inputs on same-principal generation drift',async()=>{const f=await rawDrawer();f.mutate('generation');await f.p.recoverAddEquipmentRead();assert.equal(f.drawer.isConnected,false,'actual renderer removed the old drawer');preserved(f);assert.equal(f.host.querySelector('#routine-add-name'),null,'quarantine does not admit the new generation');await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.origin,f.origin);});
void test('direct actual quarantine render also captures same-principal raw DOM before replacing it',async()=>{const f=await rawDrawer();f.mutate('generation');f.p.render();preserved(f);assert.equal(f.drawer.isConnected,false);});
void test('same-principal delivery drift preserves raw drawer without granting delivery admission',async()=>{const f=await rawDrawer();f.mutate('delivery');await f.p.recoverAddEquipmentRead();preserved(f);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.origin,f.origin);});
for(const kind of ['actor','same-id-object','epoch'])void test(kind+' quarantine retains original DOM privately, never captures or exposes it under the new principal',async()=>{const f=await rawDrawer(),query=f.drawer.querySelector.bind(f.drawer);let privateFieldReads=0;f.drawer.querySelector=selector=>{if(selector.startsWith('#routine-add-'))privateFieldReads++;return query(selector);};f.mutate(kind);await f.p.recoverAddEquipmentRead();assert.equal(privateFieldReads,0,'foreign principal must not inspect retained raw fields');assert.equal(f.p.form,f.form);assert.equal(f.form.assetCode,'','not copied under another principal');assert.equal(f.drawer.isConnected,false);assert.equal(f.host.querySelector('#routine-add-name'),null);assert.doesNotMatch(f.host.innerHTML,/QA RAW|名稱 Tên/);assert.equal(f.p.origin,f.origin);assert.equal(f.calls.length,0);f.restoreOwner();await f.p.read(false,true);const recheckedOwner=f.p.origin;f.p.render();preserved(f,{requests:2,origin:recheckedOwner});assert.equal(f.posts().length,0);assert.equal(f.host.querySelector('#routine-add-name').value,raw.name,'returning explicitly rechecked original principal receives its private raw input');});
void test('different selected version does not copy raw values into another context',async()=>{const f=await rawDrawer();f.mutate('scope');f.p.render();assert.equal(f.form.assetCode,'');assert.equal(f.drawer.isConnected,false);assert.equal(f.calls.length,0);f.p.change('restore-target');f.p.render();preserved(f);});
void test('replacement form identity cannot absorb the old drawer fields',async()=>{const f=await rawDrawer();f.mutate('form');f.mutate('generation');await f.p.recoverAddEquipmentRead();assert.notEqual(f.p.form,f.form);assert.equal(f.p.form.name,'replacement form');assert.equal(f.p.form.assetCode,'');assert.equal(f.form.assetCode,'');assert.equal(f.calls.length,0);assert.deepEqual(f.revoked,[]);});

void test('replacement drawer-owner object cannot absorb original DOM-only values',async()=>{const f=await rawDrawer();f.mutate('owner');f.mutate('generation');await f.p.recoverAddEquipmentRead();assert.equal(f.p.form,f.form);assert.equal(f.form.assetCode,'');assert.equal(f.form.name,'');assert.equal(f.p.origin,f.origin);assert.equal(f.calls.length,0);assert.deepEqual(f.revoked,[]);});
void test('ordinary bound typing adds no serialization, network, or drawer replacement',async()=>{const f=await fixture({hold:''});f.p.openAddEquipmentDialog();const input=f.host.querySelector('#routine-add-name'),original=f.c.JSON;let serializations=0;f.c.JSON={parse:original.parse,stringify(...args){serializations++;return original.stringify(...args);}};for(let i=0;i<1000;i++){input.value='Typed '+i;input.dispatchEvent({type:'input',target:input});}assert.equal(serializations,0);assert.equal(f.calls.length,0);assert.equal(f.host.querySelector('#routine-add-name'),input);assert.equal(f.p.form.name,'Typed 999');});

void test('pending workflow still blocks renewal and Apply while keeping raw fields, base, and photo identity',async()=>{const f=await rawDrawer(),fetch=f.c.fetch;f.p.control.workflow.pendingId='pending';f.state().pendingId='pending';f.c.fetch=(url,options={})=>{if(url==='/api/shared-state'){f.calls.push({method:'GET',url});return Promise.resolve(Response.json({identity:{id:'owner',sessionType:'platform'}}));}return fetch(url,options);};await f.p.recoverAddEquipmentRead();preserved(f,{requests:2});assert.equal(f.p.unavailable,true);await f.p.writeShared('apply');assert.equal(f.posts().length,0);assert.equal(f.p.origin,f.origin);});
