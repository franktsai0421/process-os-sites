import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const part=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

function masterTabFixture(tab,{registered=false,selected,projected=true,master=false}={}){
 const state={view:'data',masterScope:'AB',...(selected?{dataTab:selected}:{})},content={dataset:{},textContent:'',innerHTML:''},calls=[];
 const catalog={products:[],lines:[],categoryGroups:[]},control={active:master?{AB:catalog,C:catalog}:{},versions:[]};
 const box={state,control,URL,location:{href:'https://fixture.invalid/process/?view=data&dataTab='+tab},document:{documentElement:{lang:'zh',dataset:{}},querySelector:selector=>selector==='#data-content'?content:null},hasPermission:()=>false,history:{pushState(){throw Error('UNEXPECTED_HISTORY_WRITE');}},fetch(){throw Error('UNEXPECTED_READ');},localStorage:{setItem(){throw Error('UNEXPECTED_STORAGE_WRITE');}},bindData:null,bindTabButtons:()=>calls.push('tabs'),bindMaster:()=>calls.push('master'),sharedLoaded:new Set(),sharedLoading:new Set()};
 box.window=box;box.MutationObserver=class{observe(){}};box.ProcessSync={deliveryProjection:projected};if(registered)box.ProcessDualSystem={renderQualityDataTab:value=>calls.push(['quality',value])};
 vm.createContext(box);vm.runInContext(source('master-admin-ui.js'),box,{filename:'master-admin-ui.js'});
 const admin=box.MasterAdminUI.install({state,control,versions:()=>[],draft:()=>null,pending:()=>null,shared:{flow:()=>null,permissions:()=>({})}});box.masterView=admin.masterView;
 const text=source('master-data.js');for(const [start,end]of [['  function selectDataTab(','  function bindTabButtons('],['  bindData = function () {',"  window.addEventListener('popstate'"]]){
  const offset=text.indexOf(start);assert(offset>=0&&text.indexOf(end,offset)>offset);vm.runInContext(part(text,start,end),box,{filename:'master-data.js',lineOffset:text.slice(0,offset).split('\n').length-1});
 }
 return{box,state,content,calls,control};
}
for(const tab of ['quality-fqc','quality-iqc','quality-ipqc-ab','quality-ipqc-c','quality-mold-equipment','quality-routine-equipment','quality-routine-reports'])void test('cold destination '+tab+' never falls back to an absent master scope',()=>{
 for(const registered of [false,true]){
  const f=masterTabFixture(tab,{registered}),before=JSON.stringify(f.control);f.box.bindData();
  assert.equal(f.state.dataTab,tab);assert.equal(JSON.stringify(f.control),before);assert.equal(f.content.innerHTML,'');
  assert.deepEqual(f.calls,registered?[['quality',tab]]:[]);assert.equal(f.content.textContent,registered?'':'…');
  assert.equal(f.box.document.documentElement.dataset.processDestinationReadyGeneration,undefined);
 }
});
void test('cold destination keeps an installed quality tab ahead of an old display URL',()=>{const f=masterTabFixture('AB',{registered:true,selected:'quality-iqc'});f.box.bindData();assert.deepEqual(f.calls,[['quality','quality-iqc']]);assert.equal(f.state.dataTab,'quality-iqc');});
for(const tab of ['AB','C'])void test('cold destination retains actual authorized '+tab+' master renderer',()=>{const f=masterTabFixture(tab,{master:true});f.box.bindData();assert.equal(f.state.dataTab,tab);assert.equal(f.state.masterScope,tab);assert.match(f.content.innerHTML,/master-organized/);assert.deepEqual(f.calls,['master','tabs']);});
void test('legacy nonprojected quality intent retains existing master fallback',()=>{const f=masterTabFixture('quality-iqc',{projected:false,master:true});f.box.bindData();assert.equal(f.state.dataTab,'AB');assert.match(f.content.innerHTML,/master-organized/);assert.deepEqual(f.calls,['master','tabs']);});
const iqcSource=source('iqc-master.js'),iqcLoad=part(iqcSource,'  async function load(owner) {','  async function post(');
const iqcAdmission=part(iqcSource,'  const completeSnapshot=','  async function hydrateVersion('),iqcSelected=part(iqcSource,'  const selected =','  const active =');
assert(iqcAdmission.includes('function validateIqcPayload(')&&iqcSelected.includes('control?.versions.find'),'actual admission and selection source required');
// IQC now admits one complete fresh response, not two independent reads.
// Execute the shipped load body with explicit deferred client closure ports;
// the full shared transport is exercised by the dedicated IQC race suites.
function iqcLoadFixture(){
 let epoch=1;const response=deferred(),events=[],actor={id:'synthetic'},options=[];
 const box={control:null,revision:null,loadSequence:0,readDenied:null,navigationError:null,activeDeferredId:'',ui:{versionId:''},identity:()=>actor,
  window:{ProcessSync:{captureDelivery:()=>epoch,isCurrentDelivery:owner=>owner===epoch}},
  transport:()=>({read:(token,opt)=>{assert.equal(token,undefined);assert.equal(opt.requireAcceptedAccess,true);assert.equal(opt.isCurrent(),true);events.push('combined');options.push(opt);return response.promise;}}),
  denyRead:error=>{box.readDenied=error;}};
 vm.createContext(box);vm.runInContext(iqcSelected+iqcAdmission+iqcLoad,box);return{box,response,events,options,invalidate:()=>{epoch++;}};
}
const iqcFull=()=>({revision:9,permissions:Object.fromEntries(['view','edit','save','submit','withdraw','approve','return','history','delete'].map(key=>[key,true])),control:{schemaVersion:1,versions:[],issues:[],reservedErrorCodes:[],reservedCheckNos:[]}});
for(const kind of ['delivery','entry-owner'])void test('actual IQC load rejects old '+kind+' without installing model',async()=>{
 const f=iqcLoadFixture();let current=true;const owner={assert(){if(!current)throw Error('DELIVERY_SUPERSEDED');}},promise=f.box.load(owner),rejected=assert.rejects(promise,/DELIVERY_SUPERSEDED/);
 assert.deepEqual(f.events,['combined']);assert.equal(f.box.control,null);assert.equal(f.box.revision,null);
 if(kind==='delivery')f.invalidate();else current=false;assert.equal(f.options[0].isCurrent(),false);f.response.resolve(iqcFull());
 await rejected;assert.equal(f.box.control,null);assert.equal(f.box.revision,null);assert.deepEqual(f.events,['combined']);
});
void test('actual IQC waits for one complete combined response before adoption',async()=>{
 const f=iqcLoadFixture(),promise=f.box.load(),full=iqcFull();assert.deepEqual(f.events,['combined']);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.box.control,null);assert.equal(f.box.revision,null);
 f.response.resolve(full);await promise;assert.equal(f.box.revision,9);assert.deepEqual(f.box.control,full.control);assert.deepEqual(f.events,['combined']);
});
for(const missing of ['control','permissions'])void test('actual IQC combined response missing '+missing+' cannot install model',async()=>{
 const f=iqcLoadFixture(),promise=f.box.load(),rejected=assert.rejects(promise,/IQC/),full=iqcFull();delete full[missing];f.response.resolve(full);
 await rejected;assert.equal(f.box.control,null);assert.equal(f.box.revision,null);assert(f.box.readDenied);assert.deepEqual(f.events,['combined']);
});
const accountSend=part(source('user-access.js'),' async function send(payload){','\n function paint()');
function accountBox(response){const box={writing:0,writeUncertain:false,model:{actor:{id:'frank'},revision:1},modelStamp:{id:'frank'},identityStamp:()=>({id:'frank'}),sameIdentity:()=>true,fetch:async()=>response,window:{ProcessSync:{platformHeaders:()=>({})}},emitIdentity(){},calls:0};const fetch=box.fetch;box.fetch=async(...args)=>{box.calls++;return fetch(...args);};vm.createContext(box);vm.runInContext(accountSend,box);return box;}
for(const kind of ['network','body','500'])void test('actual account '+kind+' lost acknowledgement stays guarded and cannot replay',async()=>{
 const box=accountBox({ok:kind==='body',status:kind==='500'?500:200,json:async()=>{if(kind==='body')throw Error('lost body');return{error:'SERVER_FAILURE'};}});
 if(kind==='network')box.fetch=async()=>{box.calls++;throw Error('offline');};
 await assert.rejects(box.send({action:'update'}));assert.equal(box.writing,0);assert.equal(box.writeUncertain,true);assert.equal(box.calls,1);
 await assert.rejects(box.send({action:'update'}),/WRITE_RESULT_UNKNOWN/);assert.equal(box.calls,1);
});
void test('actual account definite 4xx rejection releases departure guard without retry',async()=>{const box=accountBox({ok:false,status:403,json:async()=>({error:'FORBIDDEN'})});await assert.rejects(box.send({}),/FORBIDDEN/);assert.equal(box.writeUncertain,false);assert.equal(box.calls,1);});
void test('actual account acknowledged write releases departure guard',async()=>{const box=accountBox({ok:true,status:200,json:async()=>({actor:{id:'frank'},revision:2})});await box.send({});assert.equal(box.writeUncertain,false);assert.equal(box.model.revision,2);assert.equal(box.calls,1);});
void test('actual role refresh removes deleted custom names and old built-in overrides',()=>{
 const text=source('permission-controls.js'),refresh=part(text,'  function refresh(){','  refresh();');
 const values={processCustomRoles:[],processRoleTemplateOverrides:{}};
 const box={roleNames:{staff:'OLD',custom_removed:'REMOVED'},builtInRoleNames:{admin:'ADMIN',staff:'STAFF'},customTemplates:[{id:'custom_removed'}],roleOverrides:{staff:{name:'OLD'}},templates:{},builtInTemplates:{admin:{views:[]},staff:{views:[]}},readStore:(key,fallback)=>values[key]||fallback};
 vm.createContext(box);vm.runInContext(refresh,box);box.refresh();assert.deepEqual(box.roleNames,{admin:'ADMIN',staff:'STAFF'});assert.equal(box.customTemplates.length,0);assert.deepEqual(box.roleOverrides,{});
});
void test('actual form tracker only guards explicitly supplied editing scope and acknowledges saved input',()=>{
 const listeners={},box={window:{},document:{addEventListener:(name,fn)=>listeners[name]=fn}};vm.createContext(box);vm.runInContext(source('navigation-forms.js'),box);
 const input={type:'text',tagName:'INPUT',value:'old',defaultValue:'old',isConnected:true,matches:()=>true};const scope={querySelectorAll:()=>[input]},api=box.window.ProcessNavigationForms;
 listeners.focusin({target:input});input.value='new';listeners.input({target:input});
 assert.equal(api.dirty(),false,'search/filter DOM is not implicitly a business form');assert.equal(api.dirty(scope),true);api.acknowledge(scope);assert.equal(api.dirty(scope),false);
 listeners.compositionstart({target:input});assert.equal(api.composing(),true);listeners.compositionend({target:input});assert.equal(api.composing(),false);
 input.type='file';input.files=[{name:'original.png',size:33,lastModified:1}];assert.equal(api.dirty(scope),true);
});
for(const outcome of ['resolve','reject'])void test('actual BOM stale run '+outcome+' cannot clear new operation busy/error or repaint',async()=>{
 const text=source('bom-workspace.js'),run=part(text,' async function run(fn){',' function selectionAllowed()');let delivery=1;const old=deferred(),fresh=deferred(),events=[];
 const box={busy:false,runSequence:0,readEpoch:0,error:'',lastErrorCode:'',window:{ProcessSync:{captureDelivery:()=>delivery,isCurrentDelivery:owner=>owner===delivery},VersionDraftUI:{updateSync(){}}},document:{querySelector:()=>null,querySelectorAll:()=>[]},paint:()=>events.push('paint'),renderReview:()=>events.push('review'),errorText:e=>e.message,permission:()=>true};vm.createContext(box);vm.runInContext(run,box);
 const first=box.run(()=>old.promise);delivery++;box.runSequence++;box.busy=false;const second=box.run(()=>fresh.promise);
 if(outcome==='reject')old.reject(Error('old-read'));else old.resolve();await first;
 assert.equal(box.busy,true);assert.equal(box.error,'');assert.deepEqual(events,[]);fresh.resolve();await second;assert.equal(box.busy,false);assert.deepEqual(events,['paint','review']);
});
for(const outcome of ['resolve','reject'])void test('actual FQC approval '+outcome+' after delivery change cannot set new error or toast',async()=>{
 const text=source('fqc-master.js'),bind=part(text,'  function bindReview(panel) {','  function refreshReviewUI(panel)');let epoch=1;const read=deferred(),events=[],panel={isConnected:true,querySelector:()=>null};
 const box={sharedStateCurrent:()=>false,reviewReadSequence:0,reviewHTML:()=>'<p>Loading</p>',library:()=>({}),currentReadOwner:predicate=>{const owner=epoch;return()=>epoch===owner&&predicate();},loadShared:()=>read.promise,navigationError:null,refreshReviewUI:()=>events.push('render'),toast:()=>events.push('toast'),displayDraftError:e=>e.message};vm.createContext(box);vm.runInContext(bind,box);const pending=box.bindReview(panel);epoch++;if(outcome==='resolve')read.resolve({});else read.reject(Error('DELIVERY_SUPERSEDED'));await pending;assert.equal(box.navigationError,null);assert.deepEqual(events,[]);
});
void test('actual account malformed successful ACK stays guarded and describes no-resubmit recovery',async()=>{const box=accountBox({ok:true,status:200,json:async()=>({revision:2})});await assert.rejects(box.send({}),/WRITE_RESULT_UNKNOWN_RELOAD_REQUIRED/);assert.equal(box.writeUncertain,true);assert.equal(box.calls,1);});
void test('changed persistent-navigation executable references have coherent new cache versions',()=>{
 const expectedVersions={"shared-state.js":"20261026-feedback1","imported-data.js":"20260829-1425","line-process-data.js":"20260829-1425","line-c-master.js":"20260903-1510","min.js":"20260903-1510","editor-line-selection.js":"20260905-1100","version-return-policy.js":"20260905-1500","data-safety.js":"20260907-2500","master-admin-ui.js":"20261010-review2","app.js":"20261027-login-reentry1","version-workflow.js":"20261025-bounded-media1","line-stage-excel.js":"20260911-6000","master-page-excel.js":"20260911-6000","master-review.js":"20261012-bom-incremental3","approval-tabs.js":"20261025-navigation2","shared-draft-client.js":"20261029-stack-iqc-projection1","master-shared-client.js":"20261025-navigation2","web-feedback-entry.js":"20261026-hosted1","master-data.js":"20261027-readscope-truthful1","process-equipment.js":"20261026-input-lifecycle1","permission-controls.js":"20261025-navigation2","flow-zoom.js":"20261002-v3","editor-version-guard.js":"20260919-workflow","withdraw-queue.js":"20260829-1425","i18n.js":"20261014-language9","bom-search-engine.js":"20260903-1540","bom-excel.js":"20260911-6000","bom-search.js":"20260903-1630","bom-workspace.js":"20261027-scoped-read-pause1","data-safety-ui.js":"20261027-login-reentry1","system-upgrade.js":"20261025-bounded-media1","version-draft-ui.js":"20261012-bom-incremental3","process-authoring-v3.js":"20261027-scoped-read-pause1","effective-version-notice.js":"20261027-scoped-read-pause1","fqc-excel.js":"20260921-fqc","fqc-master.js":"20261028-matrix-rule-layout1","iqc-master.js":"20261030-iqc-poll-owner1","routine-equipment.js":"20261027-fqc-followon1","tooling.js":"20261027-scoped-read-pause1","quality-review-overview.js":"20261027-readscope-truthful1","process-ipqc.js":"20261027-scoped-read-pause1","ipqc-c.js":"20261029-quality-projection1","ipqc-ab.js":"20261029-begin-foreground1","routine-fqc.js":"20261028-modern-unload1","dual-system.js":"20261025-navigation2","editor-graph.js":"20261008-compact3","canvas-local.js":"20261027-save-inspection1","process-editor.js":"20261027-c-query1","user-access.js":"20261025-navigation2","navigation-forms.js":"20261025-navigation2","delivery-navigation.js":"20261027-login-reentry1","bootstrap.js":"20261026-feedback1"};
 const _foregroundAssets=["bom-workspace.js", "bootstrap.js", "fqc-master.js", "ipqc-ab.js", "ipqc-c.js", "iqc-master.js", "master-data.js", "process-authoring-v3.js", "process-ipqc.js", "routine-equipment.js", "shared-draft-client.js", "tooling.js"];const _readPaused=["shared-draft-client.js", "process-authoring-v3.js", "master-data.js", "fqc-master.js", "iqc-master.js", "ipqc-ab.js", "ipqc-c.js", "routine-equipment.js", "bom-workspace.js", "tooling.js", "effective-version-notice.js", "routine-fqc.js", "process-ipqc.js"];const html=source('index.html');for(const file of ['app.js','approval-tabs.js','bom-workspace.js','bootstrap.js','canvas-local.js','delivery-navigation.js','dual-system.js','effective-version-notice.js','fqc-master.js','ipqc-ab.js','ipqc-c.js','iqc-master.js','master-data.js','master-shared-client.js','permission-controls.js','process-authoring-v3.js','quality-review-overview.js','routine-equipment.js','routine-fqc.js','shared-draft-client.js','shared-state.js','tooling.js','user-access.js','navigation-forms.js'])assert(html.includes(file+'?v='+expectedVersions[file]),file);
 assert(html.includes("process-ipqc.js?v=20261027-scoped-read-pause1"));
 assert(html.includes("data-safety-ui.js?v=20261027-login-reentry1"));
 assert(html.includes("process-equipment.js?v=20261026-input-lifecycle1"));
 assert(html.includes("process-editor.js?v=20261027-c-query1"));
 assert(source('delivery-navigation.js').includes("navigation-lifecycle.mjs?v=20261025-navigation2"));
});
