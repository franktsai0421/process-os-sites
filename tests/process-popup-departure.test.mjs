// Actual equipment closure + actual master departure block/coordinator; bounded DOM
// and storage ports only. No browser, server, business-data or remote writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
function between(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a,start);return text.slice(a,b);}
function fixture(){
 const events=new Map(),frames=[],nodes=new Map(),markers=new Map([['original-unknown','receipt-reference']]);
 let markup='',writes=0,nameRecordClears=0,uploadResolve;
 const node=(extra={})=>Object.defineProperties({isConnected:true,open:false,inert:false,value:'',listeners:new Map(),
  addEventListener(type,fn){const callbacks=this.listeners.get(type)||[];callbacks.push(fn);this.listeners.set(type,callbacks);},
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(cb=>cb!==fn));},
  fire(type,event={}){for(const fn of this.listeners.get(type)||[])fn({target:this,...event});},
  focus(){},setSelectionRange(){},contains:()=>true,append(){},setAttribute(){},
  querySelector(){return null;},querySelectorAll(){return[];},showModal(){this.open=true;},close(){this.open=false;},
  remove(){this.isConnected=false;this.open=false;for(const [key,value]of nodes)if(value===this)nodes.delete(key);}},Object.getOwnPropertyDescriptors(extra));
 const area=node({set innerHTML(value){markup=value;for(const old of nodes.values())old.isConnected=false;nodes.clear();
  for(const id of ['equipment-panel','equipment-search','equipment-line-filter','equipment-stage-filter','equipment-filter-clear','add-equipment'])nodes.set('#'+id,node());
  if(value.includes('id="equipment-editor-dialog"')){
   nodes.set('#equipment-editor-dialog',node({querySelector:selector=>selector==='.equipment-dialog-photos'?node():null}));
   for(const key of ['name','number','nameVi']){const match=value.match(new RegExp('data-equipment-field="'+key+'" value="([^"]*)"'));nodes.set('[data-equipment-field="'+key+'"]',node({dataset:{equipmentField:key},value:match?.[1]||''}));}
   for(const key of ['equipment-close','equipment-save','equipment-photo-add','equipment-photo-replace'])nodes.set('[data-'+key+']',node());
  }
 },get innerHTML(){return markup;},querySelector(selector){return nodes.get(selector)||null;},querySelectorAll(selector){return document.querySelectorAll(selector);}});
 const document={documentElement:{lang:'zh'},querySelector(selector){if(selector==='#data-content')return area;if(selector==='#equipment-editor-dialog[open]'){const dialog=nodes.get('#equipment-editor-dialog');return dialog?.open?dialog:null;}return nodes.get(selector)||null;},querySelectorAll(selector){if(selector.includes('dialog[open]')){const dialog=this.querySelector('#equipment-editor-dialog[open]');return dialog?[dialog]:[];}if(selector==='[data-equipment-field]')return [...nodes].filter(([key])=>key.startsWith('[data-equipment-field=')).map(([,value])=>value);const item=nodes.get(selector);return item?[item]:[];},createElement:()=>node()};
 const identity={id:'owner'},snapshot={'A-STAGE':[{id:'machine-template',presetKey:'machine-assembly',equipment:[]}]},flow={generation:'generation',revision:1,pendingId:null,working:snapshot,saved:null};
 let unknown=false;
 const client={hasUnknown:()=>unknown,hasSyncFailures:()=>false,departureIdle:()=>true,departureUnknown:()=>({operationId:'original-unknown'}),coverDeparture(){return{current:()=>markers.has('original-unknown'),release(){}};},otherDeparturePending:()=>false};
 const shared={flow:()=>flow,permissions:()=>({view:true,edit:true,save:true}),busy:()=>false,localDirty:()=>false,client:()=>client,discardLocal(){},resetReads(){},execute(){writes++;throw Error('UNEXPECTED_WRITE');}};
 const window={ProcessSync:{identity,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:()=>true},ProcessNavigationForms:{composing:()=>false},VersionDraftUI:{},hasPermission:()=>true,
  addEventListener(type,fn){const list=events.get(type)||[];list.push(fn);events.set(type,list);},removeEventListener(type,fn){events.set(type,(events.get(type)||[]).filter(cb=>cb!==fn));},sharedDraftAccountState:()=>({unknown}),sharedDraftDepartureBlocked:()=>unknown};
 const routing={lines:[{code:'A',stages:[{code:'A-STAGE',name:'Stage'}]}],productRoutes:{}};
 const box={window,host:window,document,console,JSON,Set,Map,Promise,crypto:webcrypto,CSS:{escape:x=>x},scrollY:0,scrollTo(){},requestAnimationFrame:fn=>frames.push(fn),
  state:{view:'data',dataTab:'process-master',masterScope:'AB'},routing,data:{products:[]},seed:{},abProducts:[],control:{active:{},versions:[]},deliveryGeneration:0,sharedLoaded:new Set(),sharedLoading:new Set(),dataReady:Promise.resolve(),dataError:null,STORAGE:'masterDataControl',shared,
  currentUser:identity,approvalVersions:[],currentProcessMasterData:()=>snapshot,editableProcessMasterData:()=>snapshot,processMasterDraft:()=>({snapshot}),processMasterVersions:()=>[],
  stageFor:()=>routing.lines[0].stages[0],canDeleteProcessMaster:()=>true,processMasterView:()=>'<base/>',bindDataInner(){},bindLightbox(){},toast(){},readStore:(_key,fallback)=>fallback,clone:x=>JSON.parse(JSON.stringify(x)),routeLine:()=>'',routeStages:()=>[],applyActive(){},persist(){},record(){},ownsDelivery:()=>true,
  prepareMediaUploads:()=>new Promise(resolve=>uploadResolve=resolve),processMasterNameBindings:new Set(),clearNameRecord(){nameRecordClears++;markers.delete('original-unknown');},
 };
 vm.createContext(box);
 const ui=source('version-draft-ui.js');vm.runInContext(between(ui,'  function createDeparture(config){','  host.VersionDraftUI=')+'\nwindow.VersionDraftUI.createDeparture=createDeparture;',box);
 const app=source('app.js');vm.runInContext('window.ProcessMasterVersioning={'+between(app,'  departureNames:{','  validate:')+'};',box);
 vm.runInContext(source('process-equipment.js'),box);
 const master=source('master-data.js');vm.runInContext(between(master,'  let moduleDeparture;','  // Read on explicit entry'),box);
 const adapter=window.MasterDataWorkflow.navigation.departure;
 const flush=()=>{while(frames.length)frames.shift()();};
 const render=()=>{area.innerHTML=box.processMasterView();box.bindDataInner('process-master');flush();};
 render();
 return{box,window,adapter,markers,shared,flow,render,flush,markup:()=>markup,writes:()=>writes,nameRecordClears:()=>nameRecordClears,dialog:()=>document.querySelector('#equipment-editor-dialog'),
  open(){document.querySelector('#add-equipment').fire('click');flush();assert(this.dialog()?.open);},
  edit(value){const input=document.querySelector('[data-equipment-field="name"]');input.value=value;input.oninput();},
  language(){document.documentElement.lang='vi';for(const fn of events.get('process-language-change')||[])fn();flush();},
  filter(){document.querySelector('#equipment-line-filter').fire('change');flush();},
  unknown(value){unknown=value;},
  upload(){const input=document.querySelector('[data-equipment-photo-add]');input.files=[{name:'local.png'}];input.fire('change');},finishUpload(){uploadResolve({items:[{src:'local:image',name:'local.png',type:'image/png'}]});},
  addName({pending=false}={}){box.namePending=pending;vm.runInContext(`(() => {const input={isConnected:true,oninput:()=>{}},owner=window.ProcessSync.identity,generation='generation',key='template',drain=()=>{},apply=()=>{},discard=()=>{},pendingCommand=namePending?{operationId:'original-unknown'}:null,active=false,failure=null,recoveryBusy=false,composing=false,dirty=()=>true,clearOwnRecord=clearNameRecord,detachComposition=()=>{},persist=()=>{},recovery=null,recoveryDialog=null,invalidateRecoveryView=()=>{};let abandoned=false;${between(app,'  const binding={input,owner,generation,key,drain,apply,discard,abandon(){','  const attach=')}processMasterNameBindings.add(binding);})()`,box);},
  installNameReset(){vm.runInContext(between(app,'    for(const binding of processMasterNameBindings){binding.closeRecovery?.();binding.input.oninput=','    window.ProcessRoles?.refresh?.();applyPlatformIdentity();'),box);},
 };
}
for(const dirty of [false,true])void test(`PROCESS ${dirty?'dirty':'clean'} popup: true departure removes closure and cannot revive on entry/language`,async()=>{
 const f=fixture();f.open();if(dirty)f.edit('private unsent equipment');assert.equal(f.window.ProcessEquipment.hasUnappliedChanges(),dirty);assert.equal(f.adapter.inspect().state,dirty?'dirty':'clean');
 let lease;if(dirty)lease=await f.adapter.abandon();f.adapter.closeClean();lease?.release();assert.equal(f.dialog(),null);assert.equal(f.window.ProcessEquipment.hasUnappliedChanges(),false);
 f.render();f.language();assert.equal(f.dialog(),null);assert(!f.markup().includes('private unsent equipment'));assert.equal(f.writes(),0);
});
void test('PROCESS same-page equipment filter/language retains unapplied input until true departure',()=>{
 const f=fixture();f.open();f.edit('retained in page');f.filter();assert(f.markup().includes('retained in page'));f.language();assert(f.dialog()?.open);assert(f.markup().includes('retained in page'));assert.equal(f.window.ProcessEquipment.hasUnappliedChanges(),true);assert.equal(f.writes(),0);
});
void test('PROCESS names are cleared even when the equipment popup was clean',()=>{
 const f=fixture();f.open();f.addName();assert.equal(f.box.processMasterNameBindings.size,1);vm.runInContext('closeDepartureDialogs()',f.box);assert.equal(f.box.processMasterNameBindings.size,0);f.render();f.language();assert.equal(f.dialog(),null);assert.equal(f.writes(),0);
});
void test('PROCESS unknown departure clears popup/name RAM but keeps the original pending marker',async()=>{
 const f=fixture();f.open();f.edit('not submitted');f.addName({pending:true});f.unknown(true);const before=[...f.markers];assert.equal(f.adapter.inspect().state,'unknown');assert.equal(f.adapter.inspect().canAbandon,true);
 const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();assert.deepEqual([...f.markers],before);assert.equal(f.nameRecordClears(),0);assert.equal(f.box.processMasterNameBindings.size,0);f.render();f.language();assert.equal(f.dialog(),null);assert.equal(f.writes(),0);
});
for(const identityReset of [false,true])void test(`PROCESS projection reset ${identityReset?'after identity installation':'directly'} clears equipment and names`,()=>{
 const f=fixture();f.open();f.edit('previous private popup');f.addName({pending:true});const before=[...f.markers];if(identityReset){f.window.ProcessSync.identity={id:'next-owner'};f.installNameReset();}
 f.window.MasterDataWorkflow.resetProjection();assert.equal(f.box.processMasterNameBindings.size,0);assert.deepEqual([...f.markers],before);f.render();f.language();assert.equal(f.dialog(),null);assert(!f.markup().includes('previous private popup'));assert.equal(f.writes(),0);
});
void test('PROCESS late photo preparation cannot restore a popup after projection reset',async()=>{
 const f=fixture();f.open();f.upload();f.window.MasterDataWorkflow.resetProjection();f.finishUpload();await new Promise(resolve=>setImmediate(resolve));f.render();f.language();assert.equal(f.dialog(),null);assert(!f.markup().includes('local:image'));assert.equal(f.writes(),0);
});
