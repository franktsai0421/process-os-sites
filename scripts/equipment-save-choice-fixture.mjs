// Actual full equipment caller, registered input handlers, default shared client and
// shared-draft kernel and shipped equipment Apply adapter. DOM/timing and HTTP
// responses are synthetic and in-memory.
// No network, browser, route authorization, persistence or native layout claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto, randomUUID} from 'node:crypto';
import {canvasDOM} from './login-reentry-dom.mjs';
const require=createRequire(import.meta.url),load=require('./ipqc-ab-import-harness.cjs')();
const {createSharedDraft,applyDraftCommand}=load('lib/shared-draft.ts');
const {equipmentWorkflowAdapter}=load('lib/equipment-workflow.ts');
const {checkedSnapshot}=load('lib/routine-equipment.ts');
const source=fs.readFileSync(process.env.EQUIPMENT_SENT_BATCH_SOURCE||'public/process/routine-equipment.js','utf8');
const clientSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

const storage=()=>{const map=new Map();return{get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
export async function fixture({hold='POST',receiptOnly=false,unknown=false,receiptStatus=503}={}){
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
 const receipts=new Map();let receiptDown=unknown;const waiting=deferred(),release=deferred(),calls=[],revoked=[],events=[],rejections=[];let paused=false,failRead=false,onPost=async()=>{},onRead=async()=>{};
 const c={...dom,console,crypto:webcrypto,URL:class extends URL{static revokeObjectURL(url){revoked.push(url);}static createObjectURL(){return'blob:new';}},URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,structuredClone,Map,Set,Promise,JSON,Date,Math,Intl,Number,Error,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href:'https://synthetic.invalid/process/',origin:'https://synthetic.invalid',pathname:'/process/'},CSS:{escape:String},scrollX:0,scrollY:0,scrollTo(){},requestAnimationFrame(){},
  setTimeout,clearTimeout,setInterval(){throw Error('Unexpected fixed poll');},clearInterval(){},localStorage:storage(),sessionStorage:storage(),confirm:()=>true,alert(){},hasPermission:()=>true,
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
   if(String(url).includes('operationId=')){const receipt=receipts.get(new URL(url,'https://synthetic.invalid').searchParams.get('operationId'));return receipt&&!receiptDown?Response.json({receipt,revision,permissions,control:control()}):Response.json({error:'RECEIPT_UNAVAILABLE'},{status:receiptStatus});}
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
  state=result.state;revision++;receipts.set(body.command.operationId,clone(result.receipt));
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

 const p=c.testPort;p.install(control());p.sharedTransport();
 // Initial access hydration is setup, not an extra dispatch read.
 const savedHold=hold;hold='';await p.client.read();hold=savedHold;calls.length=0;p.render();
 return{close:()=>c.RoutineEquipmentUI.navigation.reset(),c,p,explicitSave:()=>p.saveDraft('save'),host,calls,revoked,events,rejections,serverControl:control,waiting:waiting.promise,release:()=>release.resolve(),state:()=>state,permissions,
  restoreOwner(){c.ProcessSync.identity=actor;epoch=1;delivery=1;},posts:()=>calls.filter(x=>x.method==='POST'),setFailRead:value=>{failRead=value!==false;},onPost:fn=>onPost=fn,onRead:fn=>onRead=fn,recover(){receiptDown=false;unknown=false;},
  mutate(kind){if(kind==='actor')c.ProcessSync.identity={id:'other'};else if(kind==='same-id-object')c.ProcessSync.identity={...actor};else if(kind==='epoch')epoch++;else if(kind==='malformed-epoch')epoch=NaN;else if(kind==='null-epoch')epoch=null;else if(kind==='object-epoch')epoch={};else if(kind==='negative-epoch')epoch=-1;else if(kind==='missing-epoch')delete c.ProcessSync.identityGeneration;else if(kind==='missing-capture')delete c.ProcessSync.captureDelivery;else if(kind==='null-delivery')c.ProcessSync.captureDelivery=()=>null;else if(kind==='missing-current')delete c.ProcessSync.isCurrentDelivery;else if(kind==='false-current')c.ProcessSync.isCurrentDelivery=()=>false;else if(kind==='delivery')delivery++;else if(kind==='tab')host.dataset.activeTab='other';else if(kind==='disconnect')host.remove();else if(kind==='reload')c.ProcessSync.requiresReload=true;else p.change(kind);},
  type(value){const input=host.querySelector('[data-issue-result]');assert(input,'actual rendered issue input');input.value=value;input.oninput();return input;},
  serverChange(fn){fn(state);revision++;},peer(collection,id,field,value){state.working[collection].find(row=>row.id===id)[field]=value;state.revision++;revision++;},
 };
}
