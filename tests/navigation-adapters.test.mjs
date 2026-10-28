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
const iqcLoad=part(source('iqc-master.js'),'  async function load(owner) {','  async function post(');
for(const stage of ['json','permissions'])void test('actual IQC load rejects old delivery after '+stage+' without installing model',async()=>{
 let epoch=1,permissionCalls=0;const json=deferred(),permissions=deferred();
 const box={control:null,revision:null,apiUrl:'/api/iqc',fetch:async()=>({ok:true,json:()=>json.promise}),window:{ProcessSync:{captureDelivery:()=>epoch,isCurrentDelivery:owner=>owner===epoch,platformHeaders:()=>({})}},transport:()=>({permissions:()=>{permissionCalls++;return permissions.promise;}})};
 vm.createContext(box);vm.runInContext(iqcLoad,box);const promise=box.load(),rejected=assert.rejects(promise,/DELIVERY_SUPERSEDED/);
 if(stage==='json')epoch++;
 json.resolve({control:{secret:'source'},revision:1});await new Promise(resolve=>setImmediate(resolve));
 if(stage==='permissions'){assert.equal(permissionCalls,1);epoch++;permissions.resolve({view:true});}
 await rejected;assert.equal(box.control,null);assert.equal(box.revision,null);
});
void test('actual IQC keeps model read then permissions then adoption ordering',async()=>{
 const events=[],box={control:null,revision:null,apiUrl:'/api/iqc',fetch:async()=>{events.push('model');return{ok:true,json:async()=>({control:{workflow:{}},revision:9})};},window:{ProcessSync:{captureDelivery:()=>1,isCurrentDelivery:()=>true,platformHeaders:()=>({})}},transport:()=>({permissions:async()=>{events.push('permissions');assert.equal(box.control,null);}})};
 vm.createContext(box);vm.runInContext(iqcLoad,box);await box.load();assert.deepEqual(events,['model','permissions']);assert.equal(box.revision,9);
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
 const readPaused=["shared-draft-client.js", "process-authoring-v3.js", "master-data.js", "fqc-master.js", "iqc-master.js", "ipqc-ab.js", "ipqc-c.js", "routine-equipment.js", "bom-workspace.js", "tooling.js", "effective-version-notice.js", "routine-fqc.js", "process-ipqc.js"];const html=source('index.html');for(const file of ['app.js','approval-tabs.js','bom-workspace.js','bootstrap.js','canvas-local.js','delivery-navigation.js','dual-system.js','effective-version-notice.js','fqc-master.js','ipqc-ab.js','ipqc-c.js','iqc-master.js','master-data.js','master-shared-client.js','permission-controls.js','process-authoring-v3.js','quality-review-overview.js','routine-equipment.js','routine-fqc.js','shared-draft-client.js','shared-state.js','tooling.js','user-access.js','navigation-forms.js'])assert(html.includes(file+'?v='+(['fqc-master.js','master-data.js','quality-review-overview.js'].includes(file)?'20261027-readscope-truthful1':['fqc-master.js','routine-equipment.js'].includes(file)?'20261027-fqc-followon1':readPaused.includes(file)?'20261027-scoped-read-pause1':['app.js','delivery-navigation.js'].includes(file)?'20261027-login-reentry1':['shared-state.js','master-data.js','bootstrap.js'].includes(file)?'20261026-feedback1':file==='iqc-master.js'?'20261026-editor-terminal1':file==='ipqc-c.js'?'20261027-operation-permissions1':['process-authoring-v3.js','canvas-local.js'].includes(file)?'20261027-save-inspection1':file==='shared-draft-client.js'?'20261027-authoring-deadline1':['app.js','master-data.js'].includes(file)?'20261026-navigation4':'20261025-navigation2')),file);
 assert(html.includes("process-ipqc.js?v=20261027-scoped-read-pause1"));
 assert(html.includes("data-safety-ui.js?v=20261027-login-reentry1"));
 assert(html.includes("process-equipment.js?v=20261026-input-lifecycle1"));
 assert(html.includes("process-editor.js?v=20261027-c-query1"));
 assert(source('delivery-navigation.js').includes("navigation-lifecycle.mjs?v=20261025-navigation2"));
});
