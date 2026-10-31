import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const helperSource=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const helper=helperSource.slice(helperSource.indexOf('  function createDeparture(config){'),helperSource.indexOf('  host.VersionDraftUI='));
const modules=['master-data','bom-workspace','fqc-master','iqc-master','ipqc-ab','ipqc-c','routine-equipment','tooling','routine-fqc'];
function fixture(name,{omitBomRecovery=false}={}){
 const source=fs.readFileSync(`public/process/${name}.js`,'utf8'),start=source.indexOf('window.VersionDraftUI.createDeparture('),end=source.indexOf('});},',start);assert(start>=0&&end>start,name);
 const config=source.slice(start+'window.VersionDraftUI.createDeparture('.length,end+1);
 let writes=0,unknown=false,failed=false,allowed=true;
 const identity={id:'user'},root={isConnected:true,inert:false,querySelector:()=>null,querySelectorAll:()=>[]};
 const f={generation:'generation',revision:2,contributors:{field:{actor:{id:'user'}}},working:{value:'new'},saved:{id:'old',content:{value:'old'}},pendingId:null};
 const version={id:'version',status:'draft',snapshot:f.working};
 const client={permission:()=>allowed,hasUnknown:()=>unknown,hasSyncFailures:()=>failed};
 const ack=async()=>{writes++;box.revision++;f.saved={id:'confirmed',content:structuredClone(f.working)};return{receipt:{status:'confirmed'}};};
 const window={ProcessSync:{identity,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:()=>true},sharedDraftNeedsSave:x=>!!x&&!x.pendingId&&JSON.stringify(x.working)!==JSON.stringify(x.saved?.content),VersionDraftUI:{},ProcessNavigationForms:{composing:()=>false},ProcessMasterVersioning:{departureNames:{dirty:()=>false}},dispatchEvent(){}};
 const document={documentElement:{lang:'zh'},querySelector:q=>q==='#data-content'?root:null,querySelectorAll:()=>[]};
 const box={window,document,JSON,Set,Map,URL,revision:2,departureSharedCache:null,root,hostElement:root,host:root,client,sharedClient:client,moduleClient:client,
  control:{workflow:f,libraries:{fqc:{workflow:f}},moduleDraft:{workflow:f}},flow:()=>f,library:()=>({workflow:f}),scope:()=>({workflow:f}),
  shared:{flow:()=>f,permissions:()=>({save:allowed,edit:allowed}),busy:()=>false,client:()=>client,execute:ack},departureScope:()=>name==='master-data'?'AB':'PROCESS',departureDialogs:()=>[],closeDepartureDialogs(){},deliveryGeneration:1,
  actor:'user',sharedActor:'user',controlActor:'user',identity:()=>identity,currentReadOwner:()=>()=>true,sharedStateCurrent:()=>true,
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
 // The module's selected() closure and Tooling's selected string are distinct.
 if(name!=='tooling')box.selected=()=>version;
 if(name==='bom-workspace'){box.ownerQuarantined=false;box.transportOwner=()=>true;box.recoveryFlight=null;box.recoverySession=null;box.localRevision=0;if(!omitBomRecovery)vm.runInNewContext(source.slice(source.indexOf(' function discardOwnRecovery(){'),source.indexOf(' async function reconcileLocal(')),box);}
 if(name==='iqc-master'){box.errorBatch=null;box.errorRecoverySession=null;box.errorLocalRevision=0;vm.runInNewContext(source.slice(source.indexOf('  function discardErrorInput('),source.indexOf('  async function discardErrorRecord(')),box);}
 if(name==='ipqc-ab'){box.actor=()=>identity;box.sharedIdentity='user:A:G';}
 vm.createContext(box);vm.runInContext(helper.replaceAll('host.','window.')+'\nwindow.VersionDraftUI.createDeparture=createDeparture;',box);
 if(name==='ipqc-ab')vm.runInContext(source.slice(source.indexOf('  function departureSharedState(){'),source.indexOf('  window.IPQCABUI =')),box);
 if(name==='routine-fqc')vm.runInContext(source.slice(source.indexOf('  const departureSharedOwned='),source.indexOf('  window.RoutineFQCUI =')),box);
 const adapter=vm.runInContext('window.VersionDraftUI.createDeparture('+config+')',box);
 return {adapter,box,flow:f,get writes(){return writes;},unknown:value=>unknown=value,failed:value=>failed=value,allowed:value=>{allowed=value;box.data.permissions={save:value,edit:value};}};
}
for(const name of modules){
 test(`${name}: actual adapter allows acknowledged shared Save but refuses whole-shared discard`,async()=>{
  const f=fixture(name),status=f.adapter.inspect();assert.equal(status.state,'dirty');assert.equal(status.canSave,true);assert.equal(status.canDiscard,false);await assert.rejects(f.adapter.discard());assert.equal(f.writes,0);
  const lease=await f.adapter.save();assert.equal(f.writes,1);assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.box.root.inert,true);lease.release();assert.equal(f.box.root.inert,false);
 });
 test(`${name}: actual adapter refuses unknown/revoked/pending without a write`,async()=>{
  const f=fixture(name);f.unknown(true);if(name==='routine-fqc')f.box.s.retry={operationId:'original'};
  assert.equal(f.adapter.inspect().state,'unknown');await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());assert.equal(f.writes,0);
  f.unknown(false);f.box.s.retry=null;f.allowed(false);assert.equal(f.adapter.inspect().canSave,false);await assert.rejects(f.adapter.save());assert.equal(f.writes,0);
 });
}
for(const name of modules)for(const revoked of [false,true])test(`${name}: actual local-only discard ${revoked?'after edit revocation':'with edit access'} never calls Save or rewrites shared content`,async()=>{
 const f=fixture(name),b=f.box;f.flow.contributors={field:{actor:{id:'colleague'}}};if(revoked)f.allowed(false);const before=JSON.stringify(f.flow);
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
 const status=f.adapter.inspect();assert.equal(status.state,'dirty');assert.equal(status.canDiscard,true);const lease=await f.adapter.discard();assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);lease.release();
 if(name==='iqc-master')assert.equal([...b.editorOwners].length,1,'old quarantined owner is not removed');
});

for(const name of modules)for(const viewer of [false,true])test(`${name}: different-actor shared changes allow ${viewer?'viewer':'untouched editor'} departure without writes`,async()=>{const f=fixture(name);f.flow.contributors={field:{actor:{id:'colleague'}}};if(viewer)f.allowed(false);const before=JSON.stringify(f.flow);assert.equal(f.adapter.inspect().state,'clean');f.adapter.closeClean();await assert.rejects(f.adapter.save());assert.equal(f.writes,0);assert.equal(JSON.stringify(f.flow),before);});
for(const actor of ['user','colleague'])test(`IPQC-AB group Apply by ${actor} is checked against module saved cutoff, not stale aggregate working`,()=>{const f=fixture('ipqc-ab'),b=f.box;f.flow.saved.content=structuredClone(f.flow.working);const group={generation:'group',working:{items:[{id:'i',name:'new'}]},contributors:{field:{actor:{id:actor}}}};b.control.scopes={G:{workflow:group}};b.control.moduleDraft.workflow={generation:'module',working:{scopes:{G:{items:[{id:'i',name:'old'}]}}},saved:{id:'cutoff',content:{scopes:{G:{items:[{id:'i',name:'old'}]}}}}};assert.equal(f.adapter.inspect().state,actor==='user'?'dirty':'clean');assert.equal(f.writes,0);});
test('IPQC-AB observed module Save settles matching groups despite retained group contributor stamps',()=>{const f=fixture('ipqc-ab'),b=f.box;b.control.scopes={G:{workflow:f.flow}};b.control.moduleDraft.workflow={generation:'module',saved:{id:'cutoff',content:{scopes:{G:structuredClone(f.flow.working)}}}};assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.writes,0);});

test('routine FQC malformed legacy actor is unknown attribution, not proven different actor',()=>{const f=fixture('routine-fqc');f.flow.contributors={field:{actor:{id:123}}};assert.equal(f.adapter.inspect().state,'dirty');assert.equal(f.adapter.inspect().canDiscard,false);assert.equal(f.writes,0);});

test('BOM extracted departure requires the real recovery closure and fails closed when missing',async()=>{const f=fixture('bom-workspace',{omitBomRecovery:true});f.flow.contributors={field:{actor:{id:'colleague'}}};f.box.pending=[{}];f.box.hasUnsavedChanges=()=>true;await assert.rejects(f.adapter.discard(),/discardOwnRecovery is not defined/);assert.equal(f.writes,0);assert.equal(f.box.pending.length,1);});

test('IQC actual recovery discard refuses a pending name batch before removing its dialog',async()=>{const f=fixture('iqc-master'),b=f.box;f.flow.contributors={field:{actor:{id:'colleague'}}};const dialog={isConnected:true,querySelector:()=>null,remove(){this.isConnected=false;}};const original=b.document.querySelector;b.document.querySelector=q=>q==='.iqc-dialog-overlay'&&dialog.isConnected?dialog:original(q);const owner={terminal:false,overlay:dialog,assert(){},detach(){dialog.remove();}};b.editorOwners=new Set([owner]);b.errorBatch={pending:{operationId:'pending'},error:'keep'};await assert.rejects(f.adapter.discard(),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert.equal(dialog.isConnected,true);assert.equal(owner.terminal,false);assert.equal(b.errorBatch.error,'keep');assert.equal(f.writes,0);});
