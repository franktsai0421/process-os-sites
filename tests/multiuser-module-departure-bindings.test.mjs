import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const helperSource=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const helper=helperSource.slice(helperSource.indexOf('  function createDeparture(config){'),helperSource.indexOf('  host.VersionDraftUI='));
const modules=['master-data','bom-workspace','fqc-master','iqc-master','ipqc-ab','ipqc-c','routine-equipment','tooling','routine-fqc'];
// Each opt-in retains its module-specific checked RAM abandonment and original unknown obligations.
const decisionModules=modules.filter(name=>name!=='ipqc-c');
function sourceBlock(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`${start} … ${end}`);return source.slice(a,b);}
function sourceDeclaration(ast,name){
 const matches=[];function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)matches.push(node);if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)===name))matches.push(node);ts.forEachChild(node,visit);}visit(ast);
 assert.equal(matches.length,1,`one actual declaration for ${name}`);return matches[0].getText(ast);
}
function sourceInitializers(ast,names){
 const values=new Map();function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.includes(node.name.text)){assert(!values.has(node.name.text));assert(node.initializer);values.set(node.name.text,node.initializer.getText(ast));}ts.forEachChild(node,visit);}visit(ast);
 return names.map(name=>{assert(values.has(name),`actual initializer for ${name}`);return `globalThis.${name}=${values.get(name)};`;}).join('\n');
}
function stageAB(box,key='A:G'){const base=structuredClone(box.flow().working),snapshot={...structuredClone(base),value:'unsaved local'};box.localScopes.set(key,{base,snapshot});return snapshot;}
function fixture(name,{omitBomRecovery=false,omitInputClosures=false}={}){
 const source=fs.readFileSync(`public/process/${name}.js`,'utf8');
 const ast=ts.createSourceFile(name+'.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let config;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)===(name==='routine-equipment'?'equipmentDeparture':name==='routine-fqc'?'routineDeparture':'window.VersionDraftUI.createDeparture')){assert.equal(config,undefined,'one departure factory per module');config=node.arguments[0].getText(ast);}ts.forEachChild(node,visit);}
 visit(ast);assert(config,name+' departure config');
 let writes=0,unknown=false,failed=false,allowed=true;
 const identity={id:'user'},root={isConnected:true,inert:false,dataset:{activeTab:name},querySelector:()=>null,querySelectorAll:()=>[]};
 const f={generation:'generation',revision:2,contributors:{field:{actor:{id:'user'}}},working:{value:'new'},saved:{id:'old',content:{value:'old'}},pendingId:null};
 const version={id:'version',status:'draft',snapshot:f.working};
 const client={permission:()=>allowed,hasUnknown:()=>unknown,hasSyncFailures:()=>failed};
 const ack=async()=>{writes++;box.revision++;f.saved={id:'confirmed',content:structuredClone(f.working)};return{receipt:{status:'confirmed'}};};
 const window={ProcessSync:{identity,epoch:1,delivery:1,identityGeneration(){return this.epoch;},captureDelivery(){return this.delivery;},isCurrentDelivery(value){return value===this.delivery;}},sharedDraftNeedsSave:x=>!!x&&!x.pendingId&&JSON.stringify(x.working)!==JSON.stringify(x.saved?.content),VersionDraftUI:{},ProcessNavigationForms:{composing:()=>false},ProcessMasterVersioning:{departureNames:{dirty:()=>false}},dispatchEvent(){}};
 const document={documentElement:{lang:'zh'},querySelector:q=>q==='#data-content'?root:null,querySelectorAll:()=>[]};
 const box={historyAllowsMutation:()=>!box.approvedHistoryView?.blocked,comparisonCancellable:()=>false,cancelSaveComparison(){},activeSaveComparison:null,approvedHistoryView:null,historyDisplayEpoch:0,pageDraftMode:false,localPhotos:new Map(),clearLocalPhotos(){},window,document,JSON,Set,Map,URL,revision:2,departureSharedCache:null,root,hostElement:root,host:root,client,sharedClient:client,moduleClient:client,
  control:{workflow:f,libraries:{fqc:{workflow:f}},moduleDraft:{workflow:f}},flow:()=>f,library:()=>({workflow:f}),scope:()=>({workflow:f}),
  shared:{flow:()=>f,permissions:()=>({save:allowed,edit:allowed}),busy:()=>false,client:()=>client,execute:ack},departureScope:()=>name==='master-data'?'AB':'PROCESS',departureDialogs:()=>[],closeDepartureDialogs(){},deliveryGeneration:1,
  actor:'user',sharedActor:'user',controlActor:'user',identity:()=>window.ProcessSync.identity,currentReadOwner:()=>()=>true,sharedStateCurrent:()=>true,
  mountSequence:1,viewEpoch:1,selectedVersionId:'version',versionId:'version',selected:'version',key:()=> 'A:G',
  ui:{versionId:'version',selectedVersionId:'version',busy:false,saving:false},busy:false,loading:false,readOnlyBusy:false,beginRecovery:null,
  readDenied:null,accessBlocked:null,privateQuarantine:null,readUnavailable:false,readRecoveryNeeded:false,readAccessBlocked:()=>false,saveInputNoticePending:()=>false,conflict:null,
  matrixBatch:null,matrixRecoveryBlocked:false,matrixDirty:()=>false,modal:null,dialog:null,departureUploads:0,
  working:f.working,opened:()=>version,open:()=>version,editable:()=>version,editing:()=>allowed,draftOpen:()=>true,
  canDraftAction:()=>allowed&&f,mayDraftAction:()=>allowed&&f,permittedAction:()=>allowed,operationAllowed:()=>allowed,draftActionAllowed:()=>allowed,permission:()=>allowed,mayEdit:()=>allowed,
  isVi:()=>false,t:zh=>zh,hasUnsavedChanges:()=>!!box.pending?.length,unappliedImport:()=>false,
  editingEquipmentId:'',isDirty:()=>false,isFormDirty:()=>false,pendingPhotos:new Map(),nodeDialog:null,transferDialog:null,addingEquipment:false,transferBusy:()=>false,equipmentReadAttempt:null,hasBeginRecovery:()=>false,
  s:{selected:'doc',busy:false,retry:null,dialogOpen:false},data:{identity,permissions:{save:true,edit:true}},docs:()=>[{id:'doc',flow:f}],dirty:()=>false,status:()=> 'draft',inFlightMutation:0,
  departureDocuments:()=>[{id:'doc',flow:f}],save:ack,saveDraft:ack,write:ack,post:ack,sharedAction:ack,saveOrSubmit:ack,run:fn=>fn(),paint(){},render(){},draw(){},closeClean(){},copy:structuredClone,clone:structuredClone};
 // Bind the current master bridge's real local-state accessors. A peer's
 // acknowledged working delta is not this document's unsent local overlay.
 if(name==='master-data'){
  const bridge=fs.readFileSync('public/process/master-shared-client.js','utf8');
  box.locals=new Map();box.draft=()=>version;
  const localDirty=sourceBlock(bridge,'    const localDirty=','    function productReferenceCode(');
  const discard=sourceBlock(bridge,'    function discardLocal(','    function stageLocal(');
  vm.runInNewContext(localDirty+discard+'\nshared.localDirty=localDirty;shared.discardLocal=discardLocal;',box);
 }
 // The module's selected() closure and Tooling's selected string are distinct.
 if(name!=='tooling')box.selected=()=>version;
 if(name==='bom-workspace'){box.ownerQuarantined=false;box.transportOwner=()=>true;box.recoveryFlight=null;box.recoverySession=null;box.localRevision=0;Object.assign(box,{pending:[],batch:null,edit:null,saveCommand:null,departureRetained:false,isolatedInputs:[],manualLocal:()=>!!box.pending.length,active:()=>({snapshot:{bom:{}}})});vm.runInNewContext(sourceBlock(source,' function unknownReady(){',' let moduleDeparture;'),box);if(!omitBomRecovery)vm.runInNewContext(source.slice(source.indexOf(' function discardOwnRecovery(){'),source.indexOf(' async function reconcileLocal(')),box);}
 if(name==='fqc-master'){
  f.working={errors:[{id:'error',name:'Shared current'}],items:[]};f.saved.content={errors:[{id:'error',name:'Saved earlier'}],items:[]};version.snapshot=structuredClone(f.working);
  Object.assign(box,{syncBase:structuredClone(f.working),localRejection:null,formOwners:new WeakMap(),matrixOwner:()=>false,transport:()=>client});
  if(!omitInputClosures)vm.runInNewContext(sourceBlock(source,'  const sharedFields=','  function transport(')+sourceBlock(source,'  function changes(','  async function reconcileLocalConflict('),box);
 }
 // Tooling now owns a document-local candidate; its actual departure closure
 // reads and clears these variables even when no editor dialog is open.
 if(name==='tooling'){Object.assign(box,{localBase:null,localSnapshot:null,localGeneration:null});vm.runInNewContext(sourceInitializers(ast,['photoFiles','photoOutcomes','photoFileObjects'])+'\n'+sourceDeclaration(ast,'discardCatalogInputs')+'\n'+sourceDeclaration(ast,'clearPhotoFiles'),box);}
 if(name==='iqc-master'){box.localSnapshot=null;box.localBase=null;box.localGeneration=null;box.editorOwners=new Set();box.errorBatch=null;box.errorRecoverySession=null;box.errorLocalRevision=0;vm.runInNewContext(source.slice(source.indexOf('  function discardErrorInput('),source.indexOf('  async function discardErrorRecord(')),box);vm.runInNewContext(sourceBlock(source,'  function discardLocalInput(){','\n})(window);'),box);}
 // Run the actual caller closures, not always-true owner/local-input stand-ins.
 // Save remains the existing acknowledgement stub: these are binding tests, not transport/route acceptance.
 if(name==='ipqc-ab'){
  Object.assign(box,{actor:()=>window.ProcessSync.identity,sharedIdentity:'user:A:G',reviewHost:null,mutationLifetime:0,localBatch:null,inputBasisOwner:null,modalBase:null,modalGeneration:null,viewer:null,
   API:'/api/ipqc-ab',sessionStorage:{length:0,key:()=>null},localScopes:new Map(),localFilterViews:new Map(),localScopeSelections:new Map(),localPhotos:new Map(),legacyClients:new Map(),localModuleGeneration:null,localBeginReceipt:null,localBeginExpectation:null,localBusinessBase:null,localSent:null,localConflict:null,localSaveIntent:null,conflictEscapeCleanup:null,approvedHistoryView:null,moduleTransport:()=>client});
  const closures=['legacyABClients','photoOperationPrefix','photoOperations','localPending','clearConflictEscape','clearLocalEditing','abandonLocalEditing','historyAllowsMutation','photoDeparturePins','photoDepartureCoverage','photoDepartureTransport'];if(!omitInputClosures)closures.push('localDirty','hasLocalFilterForm');
  vm.runInNewContext(closures.map(n=>sourceDeclaration(ast,n)).join('\n'),box);
  if(!omitInputClosures)vm.runInNewContext(sourceBlock(source,'  const sameInput=','  function mutationCurrent(')+sourceBlock(source,'  function hasPrivateInput(){','  function retainInputBase('),box);
 }
 if(name==='ipqc-c'){
  Object.assign(box,{localChanges:[{action:'edit'}],localGeneration:'generation',localPhotos:new Map(),picker:{},viewer:{}});
  // The extracted callback reads the real module's idle choice binding too.
  vm.runInNewContext(sourceDeclaration(ast,'cancelSaveChoice')+'\n'+sourceDeclaration(ast,'clearLocal')+'\n'+sourceDeclaration(ast,'productForms')+'\n'+sourceDeclaration(ast,'clearProductForms'),box);
 }
 if(name==='routine-equipment'){
  vm.runInNewContext(sourceInitializers(ast,['equipmentSaveChoice','equipmentSaveComparison'])+'\n'+sourceDeclaration(ast,'retireEquipmentSaveComparison'),box);
  const markers=new Map();
  Object.assign(box,{iqcTransferClient:null,fqcTransferClient:null,inputOwner:null,equipmentEditRequest:0,sessionStorage:{getItem:key=>markers.get(key)??null,setItem:(key,value)=>markers.set(key,value),removeItem:key=>markers.delete(key)},localBeginReceipt:null,pendingSaveBatch:null,formPendingPhoto:null,newEquipmentForm:null,newEquipmentOwner:null,syncBase:null,syncGeneration:f.generation,snapshotOf:v=>structuredClone(v.snapshot)});
  if(!omitInputClosures)vm.runInNewContext(sourceBlock(source,'  function inputPrincipalCurrent(){','  function sharedTransport(')+'\nrememberInputOwner();',box);
  vm.runInNewContext(sourceBlock(source,'  const isDirty =','\n'),box);
  vm.runInNewContext(sourceBlock(source,'  const beginRecoveryKey =','  function readBeginRecovery('),box);
  vm.runInNewContext(sourceBlock(source,'  const fqcTransferKey =','  const fqcTransferUnknown'),box);
  vm.runInNewContext(sourceBlock(source,'  const iqcTransferKey =','  const iqcTransferUnknown'),box);
  vm.runInNewContext(sourceBlock(source,'  function equipmentDeparture(config){','  let navigationError='),box);
 }
 vm.createContext(box);vm.runInContext(helper.replaceAll('host.','window.')+'\nwindow.VersionDraftUI.createDeparture=createDeparture;',box);
 if(name==='routine-fqc'){
  Object.assign(box,{receiptInvalid:false,receiptRecord:null,receiptSuspended:false,receiptLifecycle:0});
  vm.runInContext(sourceBlock(source,'  let historyDisplayEpoch=','  function retireApprovedHistory(')+sourceDeclaration(ast,'routineDeparture')+source.slice(source.indexOf('  const departureSharedOwned='),source.indexOf('  window.RoutineFQCUI =')),box);
 }
 const adapter=vm.runInContext((name==='routine-equipment'?'equipmentDeparture':name==='routine-fqc'?'routineDeparture':'window.VersionDraftUI.createDeparture')+'('+config+')',box);
 return {adapter,box,flow:f,get writes(){return writes;},unknown:value=>unknown=value,failed:value=>failed=value,allowed:value=>{allowed=value;box.data.permissions={save:value,edit:value};}};
}
for(const name of decisionModules){
 void test(`${name}: actual adapter preserves its current shared departure policy`,async()=>{
  const f=fixture(name),status=f.adapter.inspect();
  if(['master-data','fqc-master','iqc-master','bom-workspace','routine-equipment','ipqc-ab'].includes(name)){
   const before=JSON.stringify(f.flow);assert.equal(status.state,'clean');assert.equal(status.canSave,false);assert.equal(status.canDiscard,false);await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());f.adapter.closeClean();assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);return;
  }
  assert.equal(status.state,'dirty');assert.equal(status.canSave,true);assert.equal(status.canDiscard,false);await assert.rejects(f.adapter.discard());assert.equal(f.writes,0);
  const lease=await f.adapter.save();assert.equal(f.writes,1);assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.box.root.inert,true);lease.release();assert.equal(f.box.root.inert,false);
 });
 void test(`${name}: actual adapter refuses unknown/revoked/pending without a write`,async()=>{
  const f=fixture(name);f.unknown(true);if(name==='routine-fqc')f.box.s.retry={operationId:'original'};
  assert.equal(f.adapter.inspect().state,'unknown');await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());assert.equal(f.writes,0);
  f.unknown(false);f.box.s.retry=null;f.allowed(false);assert.equal(f.adapter.inspect().canSave,false);await assert.rejects(f.adapter.save());assert.equal(f.writes,0);
 });
}
for(const name of decisionModules)for(const revoked of [false,true])for(const action of ['discard','abandon'])void test(`${name}: actual local-only ${action} ${revoked?'after edit revocation':'with edit access'} never calls Save or rewrites shared content`,async()=>{
 const f=fixture(name),b=f.box;f.flow.contributors={field:{actor:{id:action==='abandon'?'user':'colleague'}}};if(revoked)f.allowed(false);const before=JSON.stringify(f.flow);
 const dialog={isConnected:true,inert:false,querySelector:q=>q.includes(':disabled')?null:{},close(){},remove(){this.isConnected=false;}};
 if(name==='master-data'){let dialogs=[dialog];b.departureDialogs=()=>dialogs;b.closeDepartureDialogs=()=>{dialogs=[];};}
 if(name==='bom-workspace'){b.pending=[{}];b.hasUnsavedChanges=()=>b.pending.length>0;}
 if(name==='fqc-master'){let local=true;b.matrixDirty=()=>local;b.discardMatrixChoices=()=>{local=false;};}
 if(name==='iqc-master'){
  const original=b.document.querySelector;b.document.querySelector=q=>q==='.iqc-dialog-overlay'&&dialog.isConnected?dialog:original(q);
  const old={terminal:true,overlay:{isConnected:false},assert(){throw Error('OLD_QUARANTINED_OWNER');}};
  const owner={terminal:false,overlay:dialog,assert(){},detach(){dialog.remove();}};b.editorOwners=new Set([old,owner]);
 }
 if(name==='ipqc-ab'||name==='ipqc-c'){b.modal={readonly:false,photos:[]};b.working={value:'local'};b.closeEditor=()=>{b.modal=null;};}
 if(name==='routine-equipment'){b.editingEquipmentId='eq';b.equipmentEditRequest=0;b.snapshotOf=v=>v.snapshot;b.newEquipmentForm=null;b.newEquipmentOwner=null;b.syncBase=null;}
 if(name==='tooling')b.dialog=dialog;
 if(name==='routine-fqc'){b.s.buffers=new Map([['doc',{value:'local'}]]);b.s.bases=new Map([['doc',{value:'shared'}]]);b.dirty=d=>b.s.buffers.has(d.id);}
 const status=f.adapter.inspect();assert.equal(status.state,'dirty');assert.equal(status[action==='abandon'?'canAbandon':'canDiscard'],true);const lease=await f.adapter[action]();assert.equal(f.adapter.inspect().state,action==='abandon'?'departing':'clean');assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);lease.release();
 if(name==='iqc-master')assert.equal([...b.editorOwners].length,1,'old quarantined owner is not removed');
});

void test('equipment actual auto-abandon wrapper retains legacy Begin marker bytes without settling or writing',async()=>{
 const f=fixture('routine-equipment'),b=f.box,key='routine-equipment-begin-recovery:user',marker=JSON.stringify({schema:1,actorId:'user',generation:'original',activeVersionId:'active'}),before=JSON.stringify(f.flow);
 b.sessionStorage.setItem(key,marker);b.working={value:'unsent local'};
 assert.equal(f.adapter.autoAbandon,true);assert.equal(f.adapter.inspect().state,'unknown');assert.equal(f.adapter.inspect().canAbandon,true);
 const lease=await f.adapter.abandon();assert.equal(f.adapter.inspect().state,'departing');f.adapter.closeClean();lease.release();
 assert.equal(f.adapter.inspect().state,'unknown');assert.equal(b.sessionStorage.getItem(key),marker);assert.equal(JSON.stringify(f.flow),before);assert.equal(f.writes,0);
});

for(const name of modules)for(const viewer of [false,true])void test(`${name}: different-actor shared changes allow ${viewer?'viewer':'untouched editor'} departure without writes`,async()=>{const f=fixture(name);f.flow.contributors={field:{actor:{id:'colleague'}}};if(viewer)f.allowed(false);const before=JSON.stringify(f.flow);assert.equal(f.adapter.inspect().state,'clean');f.adapter.closeClean();await assert.rejects(f.adapter.save());assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);});
for(const actor of ['user','colleague'])void test(`IPQC-AB legacy shared group changes by ${actor} do not cause an implicit departure Save`,async()=>{const f=fixture('ipqc-ab'),b=f.box;f.flow.saved.content=structuredClone(f.flow.working);const group={generation:'group',working:{items:[{id:'i',name:'new'}]},contributors:{field:{actor:{id:actor}}}};b.control.scopes={G:{workflow:group}};b.control.moduleDraft.workflow={generation:'module',working:{scopes:{G:{items:[{id:'i',name:'old'}]}}},saved:{id:'cutoff',content:{scopes:{G:{items:[{id:'i',name:'old'}]}}}}};const before=JSON.stringify(b.control);assert.equal(f.adapter.inspect().state,'clean');await assert.rejects(f.adapter.save());f.adapter.closeClean();assert.equal(JSON.stringify(b.control),before);assert.equal(f.writes,0);});
void test('IPQC-AB observed module Save settles matching groups despite retained group contributor stamps',()=>{const f=fixture('ipqc-ab'),b=f.box;b.control.scopes={G:{workflow:f.flow}};b.control.moduleDraft.workflow={generation:'module',saved:{id:'cutoff',content:{scopes:{G:structuredClone(f.flow.working)}}}};assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.writes,0);});

void test('routine FQC malformed legacy actor is unknown attribution, not proven different actor',()=>{const f=fixture('routine-fqc');f.flow.contributors={field:{actor:{id:123}}};assert.equal(f.adapter.inspect().state,'dirty');assert.equal(f.adapter.inspect().canDiscard,false);assert.equal(f.writes,0);});

void test('BOM extracted departure requires the real recovery closure and fails closed when missing',async()=>{const f=fixture('bom-workspace',{omitBomRecovery:true});f.flow.contributors={field:{actor:{id:'colleague'}}};f.box.pending=[{}];f.box.hasUnsavedChanges=()=>true;await assert.rejects(f.adapter.discard(),/discardOwnRecovery is not defined/);assert.equal(f.writes,0);assert.equal(f.box.pending.length,1);});

void test('IQC actual recovery discard refuses a pending name batch before removing its dialog',async()=>{const f=fixture('iqc-master'),b=f.box;f.flow.contributors={field:{actor:{id:'colleague'}}};const dialog={isConnected:true,querySelector:()=>null,remove(){this.isConnected=false;}};const original=b.document.querySelector;b.document.querySelector=q=>q==='.iqc-dialog-overlay'&&dialog.isConnected?dialog:original(q);const owner={terminal:false,overlay:dialog,assert(){},detach(){dialog.remove();}};b.editorOwners=new Set([owner]);b.errorBatch={pending:{operationId:'pending'},error:'keep'};await assert.rejects(f.adapter.discard(),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert.equal(dialog.isConnected,true);assert.equal(owner.terminal,false);assert.equal(b.errorBatch.error,'keep');assert.equal(f.writes,0);});

for(const name of ['ipqc-ab','routine-equipment'])void test(`${name}: extracted departure requires its actual input closures`,()=>{
 const f=fixture(name,{omitInputClosures:true});
 assert.throws(()=>f.adapter.inspect(),name==='ipqc-ab'?/localDirty is not defined/:/inputOwnerCurrent is not defined/);
 assert.equal(f.writes,0);
});

for(const kind of ['snapshot','multiple groups','modal'])void test(`IPQC-AB actual local-input closures retain ${kind} until local-only discard`,async()=>{
 const f=fixture('ipqc-ab'),b=f.box;f.flow.contributors={field:{actor:{id:'colleague'}}};const before=JSON.stringify(f.flow);
 if(kind!=='modal')b.working=stageAB(b);
 if(kind==='multiple groups')stageAB(b,'B:G');
 if(kind==='modal')b.modal={readonly:false,photos:[]};
 assert.equal(b.hasPrivateInput(),true);assert.equal(f.adapter.inspect().canSave,false);await assert.rejects(f.adapter.save());
 const lease=await f.adapter.discard();assert.equal(b.hasPrivateInput(),false);assert.equal(b.localScopes.size,0);assert.equal(b.working,null);assert.equal(b.modal,null);assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);lease.release();
});

const ownerChanges={
 'same-id replacement actor':b=>{b.window.ProcessSync.identity={id:'user'};},
 'different actor':b=>{b.window.ProcessSync.identity={id:'other'};},
 epoch:b=>{b.window.ProcessSync.epoch++;},
 delivery:b=>{b.window.ProcessSync.delivery++;},
 'missing epoch port':b=>{delete b.window.ProcessSync.identityGeneration;},
 'missing delivery port':b=>{delete b.window.ProcessSync.isCurrentDelivery;},
 'invalid epoch':b=>{b.window.ProcessSync.epoch=-1;},
 'reload required':b=>{b.window.ProcessSync.requiresReload=true;},
 'different host':b=>{b.host={...b.root};},
 'different tab':b=>{b.root.dataset.activeTab='other';},
 'disconnected host':b=>{b.root.isConnected=false;},
 generation:b=>{b.control.workflow={...b.control.workflow,generation:'replacement'};},
};
for(const [reason,change]of Object.entries(ownerChanges))void test(`equipment actual owner closure blocks ${reason} without writes or local cleanup`,async()=>{
 const f=fixture('routine-equipment'),b=f.box;b.editingEquipmentId='eq';b.working={value:'keep'};const working=b.working,owner=b.inputOwner;
 assert.equal(b.inputOwnerCurrent(),true);change(b);assert.equal(b.inputOwnerCurrent(),false);
 assert.equal(f.adapter.inspect().state,'unknown');await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());
 assert.equal(f.writes,0);assert.equal(b.working,working);assert.equal(b.inputOwner,owner);assert.equal(b.editingEquipmentId,'eq');
});

for(const name of ['routine-equipment'])for(const reason of ['same-id replacement actor','epoch','delivery'])void test(`${name}: navigation never implicitly saves local input, including after ${reason}`,async()=>{
 const f=fixture(name),b=f.box,key=name==='ipqc-ab'?'save':'saveDraft',save=b[key];
 if(name==='routine-equipment'){
  b.working={value:'Unsent local equipment input'};const local=b.working,before=JSON.stringify(f.flow);assert.equal(f.adapter.inspect().canSave,false);await assert.rejects(f.adapter.save());
  ownerChanges[reason](b);await assert.rejects(f.adapter.save());assert.equal(f.writes,0);assert.equal(b.working,local);assert.equal(JSON.stringify(f.flow),before);assert.equal(b.root.inert,false);return;
 }
 b[key]=async(...args)=>{const result=await save(...args);ownerChanges[reason](b);return result;};
 await assert.rejects(f.adapter.save());assert.equal(f.writes,1);assert.equal(b.root.inert,false,'a stale completion cannot retain a departure lease');
});

for(const name of decisionModules)void test(`${name}: abandon navigation leaves acknowledged shared content intact without Save`,async()=>{
 const f=fixture(name),before=JSON.stringify(f.flow);
 if(name==='ipqc-ab')stageAB(f.box);
 if(['master-data','fqc-master','bom-workspace'].includes(name)){assert.equal(f.adapter.inspect().state,'clean');await assert.rejects(f.adapter.abandon());f.adapter.closeClean();assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);return;}
 if(name==='iqc-master')f.box.localSnapshot={value:'unsaved local'};if(name==='routine-equipment')f.box.working={value:'unsaved local'};assert.equal(f.adapter.inspect().canAbandon,true);
 const lease=await f.adapter.abandon();assert.equal(f.adapter.inspect().state,'departing');assert.equal(f.adapter.inspect().departureId,lease.departureId);assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);
 f.adapter.closeClean();lease.release();assert.equal(f.adapter.inspect().state,['iqc-master','routine-equipment','ipqc-ab'].includes(name)?'clean':'dirty');
});

for(const name of decisionModules)for(const fault of ['identity','generation','unknown','reload'])void test(`${name}: abandonment handoff rejects late ${fault} and releases its lock`,async()=>{
 const f=fixture(name),b=f.box,before=JSON.stringify(f.flow);if(name==='fqc-master')b.editable().snapshot.errors[0].name='Unsent local';if(name==='iqc-master')b.localSnapshot={value:'unsaved local'};if(name==='ipqc-ab')stageAB(b);if(name==='routine-equipment')b.working={value:'unsaved local'};if(name==='bom-workspace')b.pending=[{}];if(name==='master-data')b.locals.set('AB',{batches:[{}]});const lease=await f.adapter.abandon();
 if(fault==='identity')b.window.ProcessSync.identity={id:'other'};
 if(fault==='generation')b.window.ProcessSync.epoch++;
 if(fault==='unknown'){f.unknown(true);if(name==='routine-fqc')b.s.retry={operationId:'original'};}
 if(fault==='reload')b.window.ProcessSync.requiresReload=true;
 assert.equal(f.adapter.inspect().state,'unknown');assert.throws(()=>f.adapter.closeClean());assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);lease.release();assert.equal(b.root.inert,false);
});

void test('FQC extracted departure requires actual local input closures',()=>{
 const f=fixture('fqc-master',{omitInputClosures:true});assert.throws(()=>f.adapter.inspect(),/localDirty is not defined/);assert.equal(f.writes,0);
});
for(const action of ['discard','abandon'])void test(`FQC completed form ${action} restores only local snapshot and keeps saved/shared data`,async()=>{
 const f=fixture('fqc-master'),before=JSON.stringify(f.flow);f.box.editable().snapshot.errors[0].name='Completed local edit';assert.equal(f.box.localDirty(),true);assert.equal(f.adapter.inspect().state,'dirty');
 const lease=await f.adapter[action]();assert.equal(f.box.localDirty(),false);assert.equal(f.box.editable().snapshot.errors[0].name,'Shared current');assert.equal(JSON.stringify(f.flow),before);assert.equal(f.writes,0);assert.equal(f.adapter.inspect().state,action==='abandon'?'departing':'clean');lease.release();
});
for(const condition of ['local','busy','unknown','failed','revoked','pending'])void test(`IPQC C silent departure during ${condition} clears only RAM without settling or writing`,async()=>{
 const f=fixture('ipqc-c'),b=f.box;
 b.modal={dirty:true};b.working={value:'local'};
 if(condition==='busy')b.busy=true;
 if(condition==='unknown')f.unknown(true);
 if(condition==='failed')f.failed(true);
 if(condition==='revoked')f.allowed(false);
 if(condition==='pending')f.flow.pendingId='pending';
 const before=JSON.stringify(f.flow);
 assert.equal(f.adapter.inspect().state,'clean');
 await assert.rejects(f.adapter.save());
 f.adapter.closeClean();
 assert.equal(b.localChanges.length,0);assert.equal(b.localPhotos.size,0);assert.equal(b.localGeneration,null);
 for(const key of ['modal','picker','viewer','working'])assert.equal(b[key],null);
 assert.equal(b.client.hasUnknown(),condition==='unknown');assert.equal(b.client.hasSyncFailures(),condition==='failed');
 assert.equal(JSON.stringify(f.flow),before);assert.equal(f.writes,0);
});
void test('IPQC C silent departure retains global identity reload protection',()=>{
 const f=fixture('ipqc-c');f.box.window.ProcessSync.requiresReload=true;
 assert.equal(f.adapter.inspect().state,'unknown');assert.throws(()=>f.adapter.closeClean());assert.equal(f.writes,0);
});
void test('IQC stale owner cannot discard local memory before ownership checks finish',async()=>{
 const f=fixture('iqc-master'),b=f.box,local={value:'retain unsaved input'};b.localSnapshot=local;b.localBase={value:'base'};b.localGeneration='generation';
 b.editorOwners=new Set([{terminal:false,overlay:{isConnected:true},assert(){throw Error('STALE_EDITOR');},detach(){assert.fail('stale editor must not close');}}]);
 await assert.rejects(f.adapter.abandon(),/STALE_EDITOR/);assert.equal(b.localSnapshot,local);assert.deepEqual(b.localBase,{value:'base'});assert.equal(b.localGeneration,'generation');assert.equal(f.writes,0);
});
void test('IQC local-only memory abandons without saving legacy shared working',async()=>{
 const f=fixture('iqc-master'),b=f.box,shared=JSON.stringify(f.flow);b.localSnapshot={value:'local'};b.localBase={value:'base'};b.localGeneration='generation';
 const lease=await f.adapter.abandon();assert.equal(b.localSnapshot,null);assert.equal(b.localBase,null);assert.equal(b.localGeneration,null);assert.equal(JSON.stringify(f.flow),shared);assert.equal(f.writes,0);lease.release();
});

for(const revoked of [false,true])void test(`tooling: document-local candidate abandons ${revoked?'after edit revocation':'without an open form'} while retaining shared state`,async()=>{
 const f=fixture('tooling'),b=f.box;
 b.localBase={tools:[{id:'synthetic-tool',notes:'server basis'}]};
 b.localSnapshot={tools:[{id:'synthetic-tool',notes:'unsent local change'}]};
 b.localGeneration=f.flow.generation;
 f.flow.receipts={original:{operationId:'retained-receipt'}};
 f.flow.cases=[{id:'retained-case',content:{notes:'fixed snapshot'}}];
 const before=JSON.stringify(f.flow);
 if(revoked)f.allowed(false);
 assert.equal(b.dialog,null);
 const status=f.adapter.inspect();assert.equal(status.state,'dirty');assert.equal(status.canAbandon,true);
 const lease=await f.adapter.abandon();
 assert.equal(f.adapter.inspect().state,'departing');
 for(const key of ['localBase','localSnapshot','localGeneration'])assert.equal(b[key],null);
 assert.equal(JSON.stringify(f.flow),before);assert.equal(f.writes,0);
 assert.equal(b.root.inert,true);lease.release();assert.equal(b.root.inert,false);
});

void test('master-data: actual bridge discards a completed local batch without rewriting shared flow',async()=>{
 const f=fixture('master-data'),b=f.box,before=JSON.stringify(f.flow);
 b.locals.set('AB',{batches:[{patches:[{op:'set',path:['name'],value:'local'}]}]});
 assert.equal(f.adapter.inspect().state,'dirty');assert.equal(f.adapter.inspect().canAbandon,true);
 const lease=await f.adapter.abandon();assert.equal(b.shared.localDirty('AB'),false);
 assert.equal(JSON.stringify(f.flow),before);assert.equal(f.writes,0);lease.release();
 assert.equal(f.adapter.inspect().state,'clean');assert.equal(b.root.inert,false);
});

for(const reason of ['same-id replacement actor','epoch','delivery'])void test(`IPQC-AB departure refuses ${reason} during RAM discard without Save`,async()=>{
 const f=fixture('ipqc-ab'),b=f.box,before=JSON.stringify(b.control),discard=b.abandonLocalEditing;stageAB(b);
 b.abandonLocalEditing=()=>{discard();ownerChanges[reason](b);};
 await assert.rejects(f.adapter.abandon());assert.equal(f.writes,0);assert.equal(JSON.stringify(b.control),before);assert.equal(b.root.inert,false,'a stale handoff cannot retain a departure lease');
});
for(const condition of ['revoked','pending'])void test(`IPQC-AB ${condition} local input cannot Save on departure and does not rewrite shared data`,async()=>{
 const f=fixture('ipqc-ab'),b=f.box;stageAB(b);if(condition==='revoked')f.allowed(false);else f.flow.pendingId='pending';
 const before=JSON.stringify(b.control);assert.equal(f.adapter.inspect().canSave,false);await assert.rejects(f.adapter.save());
 const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();assert.equal(b.localScopes.size,0);assert.equal(f.writes,0);assert.equal(JSON.stringify(b.control),before);
});
void test('IPQC-AB unknown departure clears RAM but preserves the original sent snapshot and receipt obligation',async()=>{
 const f=fixture('ipqc-ab'),b=f.box,anchor={operationId:'original-save'},client=b.moduleClient;stageAB(b);f.unknown(true);
 const sent={command:{operationId:anchor.operationId},snapshot:'original sent snapshot'};b.localSent=sent;
 Object.assign(client,{departureIdle:()=>true,departureUnknown:()=>anchor,coverDeparture:(value,current)=>{assert.equal(value,anchor);return{current,release(){}};}});
 const before=JSON.stringify(b.control);assert.equal(f.adapter.inspect().canAbandon,true);await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());
 const lease=await f.adapter.abandon();f.adapter.closeClean();lease.release();assert.equal(b.localScopes.size,0);assert.equal(b.localSent,sent);assert.equal(client.departureUnknown(),anchor);assert.equal(client.hasUnknown(),true);assert.equal(f.writes,0);assert.equal(JSON.stringify(b.control),before);
});
