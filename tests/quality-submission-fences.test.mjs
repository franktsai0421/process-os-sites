// Actual module functions with synthetic DOM/transport ports. No real accounts,
// network, storage, browser, or backend acceptance is implied by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = name => fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
function part(name,start,end) {
  const text=source(name),a=text.indexOf(start),b=text.indexOf(end,a);
  assert(a>=0&&b>a,`source anchors ${name}: ${start}`);return text.slice(a,b);
}
const helper=part('shared-draft-client.js','  window.captureSharedDraftSubmission=','  // Begin alone');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture() {
  const calls=[],pending={};pending.promise=new Promise(resolve=>pending.resolve=resolve);
  const flow={generation:'generation-original',revision:7,pendingId:null,working:{items:[]},saved:{id:'saved-original',content:{items:[]},at:'2026-10-30T10:00:00Z',actor:{id:'other-saver',name:'儲存人 Việt'}}};
  const version={id:'draft-original',status:'draft',snapshot:clone(flow.working)};
  const control={workflow:flow,versions:[version],activeVersionId:'active-original'};
  const statusNode={textContent:''};
  const host={isConnected:true,dataset:{activeTab:'quality-routine-equipment'},querySelector:selector=>selector==='#routine-shared-status'?statusNode:null,querySelectorAll:()=>[],contains:()=>false};
  const identity={id:'actor-original'};
  const sync={identity,identityGeneration:()=>box.identityEpoch,captureDelivery:()=>1,isCurrentDelivery:()=>box.deliveryCurrent,requiresReload:false};
  const caps={view:true,edit:false,save:true,submit:true};
  const client={permission:key=>caps[key]===true,hasUnknown:()=>false,flush:async()=>{},command:async(generation,action,detail)=>{calls.push({generation,action,...clone(detail)});return{control,revision:8};}};
  const box={console,JSON,Number,Map,Set,Error,URL,window:{ProcessSync:sync,captureSharedDraftSubmission:null,VersionDraftUI:{confirmSubmit:(_reason,_scope,options)=>{box.confirmations++;box.confirmOptions=clone(options);return pending.promise;},reasonFor:()=>''},dispatchEvent(){},scrollTo(){}},
    document:{activeElement:null,querySelector:selector=>selector==='#data-content'?host:null,getElementById:()=>null},CustomEvent:class{},
    control,client,sharedClient:client,host,root:host,actor:identity.id,controlActor:identity.id,identityEpoch:1,deliveryCurrent:true,version:()=>version,selected:()=>version,selectedVersionId:version.id,flow:()=>box.control.workflow,identity:()=>box.window.ProcessSync.identity,
    inputOwner:null,reviewHost:null,equipmentEditRequest:0,newEquipmentForm:null,working:clone(flow.working),syncBase:clone(flow.working),syncGeneration:flow.generation,readUnavailable:false,busy:false,readIntent:0,readEpoch:0,viewEpoch:0,dialog:null,beginRecovery:null,checks:{saved:[{},{}]},error:'',message:'',editingEquipmentId:'',nodeDialog:null,addingEquipment:false,pendingPhotos:new Map(),submitProblems:[],problemSnapshot:null,openErrors:false,revision:7,
    t:(a,b)=>b||a,h:x=>String(x),scope:()=> 'synthetic scope',clone,isFormDirty:()=>false,sharedTransport:()=>client,transport:()=>client,readBeginRecovery:()=>null,snapshotOf:value=>clone(value.snapshot),open:()=>version,
    render:()=>{box.renders++;},paint:()=>{box.renders++;},paintReview(){},syncActions(){},read:async()=>{},routineTabIsActive:()=>box.host===host,confirmations:0,renders:0,
    data:{identity:{id:identity.id},permissions:{submit:true}},doc:()=>box.currentDocument,currentDocument:{id:'document-original',number:'FQC-RPT-fixture',flow},status:()=> 'draft',dirty:()=>box.localDirty,localDirty:false,s:{client:'client-fixture',seq:0},id:()=> 'operation-fixture',post:async body=>{calls.push(clone(body));return{};}};
  box.window.VersionDraftUI.updateSync=()=>{};
  const context=vm.createContext(box);vm.runInContext(helper,context);
  return{box,context,flow,version,control,caps,client,calls,pending,host,statusNode,load:text=>vm.runInContext(text,context)};
}
function tooling() {
  const f=fixture();
  f.load(part('tooling.js',' const draftActionAllowed=',' const option=')+part('tooling.js',' async function command(',' function currentLocation('));
  f.load('this.draftActionAllowed=draftActionAllowed;');
  return f;
}
function equipment() {
  const f=fixture();
  f.load(part('routine-equipment.js','  function hasLocalDraftInput(','  function sharedTransport()')+part('routine-equipment.js','  function snapshotChanges(','  const beginRecoveryKey')+part('routine-equipment.js','  function captureTransferOwner()','  function transferBusy(')+part('routine-equipment.js','  async function writeShared(','  // Preserve this unapplied drawer'));
  f.box.rememberInputOwner();assert.equal(f.box.inputOwnerCurrent(),true);
  return f;
}
function routine() {
  const f=fixture();
  f.box.dialog=(_title,body)=>{f.box.confirmations++;f.box.confirmBody=body;return f.pending.promise;};
  f.load(part('routine-fqc.js','  async function draft(','  async function save(target = doc()) {'));
  return f;
}
for(const [name,make,execute] of [
  ['tooling',tooling,f=>f.box.saveOrSubmit('submit')],
  ['equipment',equipment,f=>f.box.writeShared('submit')],
  ['routine FQC',routine,async f=>{const extra=await f.box.confirmSubmission();if(extra)await f.box.draft('submit',extra);}],
]) {
  void test(name+' Submit sends the originally confirmed saved ID, revision and generation',async()=>{
    const f=make(),running=execute(f);assert.equal(f.box.confirmations,1);assert.equal(f.calls.length,0);
    if(name==='routine FQC'){
      assert.match(f.box.confirmBody,/saved-original/);assert.match(f.box.confirmBody,/儲存人 Việt/);assert.match(f.box.confirmBody,/2026-10-30T10:00:00Z/);
    }else{
      assert.deepEqual(f.box.confirmOptions.savedVersion,{id:'saved-original',revision:7,at:'2026-10-30T10:00:00Z',actor:'儲存人 Việt'});
      if(name==='tooling')assert.equal(f.box.confirmOptions.missingCount,2);
    }
    f.pending.resolve('confirmed');await running;
    assert.equal(f.calls.length,1);const cmd=f.calls[0].command||f.calls[0];
    assert.equal(cmd.savedId,'saved-original');assert.equal(cmd.expectedRevision,7);assert.equal(cmd.generation,'generation-original');assert.equal(cmd.action,'submit');
    if(name==='routine FQC')assert.equal(f.calls[0].documentId,'document-original');
  });
  for(const race of ['revision','saved','generation','actor','identity epoch','delivery','revocation'])void test(name+' rejects '+race+' change while confirmation is open',async()=>{
    const f=make(),running=execute(f),caught=Promise.resolve(running).catch(e=>e);
    assert.equal(f.box.confirmations,1);
    if(race==='revision')f.flow.revision++;
    if(race==='saved')f.flow.saved.id='saved-newer';
    if(race==='generation')f.flow.generation='generation-newer';
    if(race==='actor')f.box.window.ProcessSync.identity={id:'other-actor'};
    if(race==='identity epoch')f.box.identityEpoch++;
    if(race==='delivery')f.box.deliveryCurrent=false;
    if(race==='revocation'){f.caps.submit=false;f.box.data.permissions.submit=false;}
    f.pending.resolve('confirmed');await caught;
    assert.equal(f.calls.length,0,'no stale or silently updated Submit');
  });
  void test(name+' cancelled confirmation makes no write',async()=>{const f=make(),running=execute(f);f.pending.resolve(null);await running;assert.equal(f.calls.length,0);});
  void test(name+' applied but unsaved shared changes do not open confirmation or send',async()=>{
    const f=make();f.flow.working.items.push({id:'someone-elses-edit'});
    await Promise.resolve(execute(f)).catch(()=>{});assert.equal(f.box.confirmations,0);assert.equal(f.calls.length,0);assert.equal(f.flow.working.items[0].id,'someone-elses-edit');
  });
}
void test('tooling Save/Submit permissions are independent from edit; revoked Save does not dispatch',async()=>{
  const f=tooling();assert.equal(f.box.draftActionAllowed('edit'),false);assert.equal(f.box.draftActionAllowed('save'),true);assert.equal(f.box.draftActionAllowed('submit'),true);
  await f.box.saveOrSubmit('save');assert.deepEqual(f.calls.map(x=>x.action),['save']);
  f.caps.save=false;await assert.rejects(f.box.saveOrSubmit('save'),/FORBIDDEN/);assert.equal(f.calls.length,1);
});
for(const action of ['save','submit'])void test('tooling '+action+' preserves un-applied inline input and reports error in that editor',async()=>{
  const f=tooling(),input={value:'尚未套用 Việt'},alert={textContent:''},inline={input};
  f.host.querySelector=selector=>selector==='.tooling-inline-editor'?inline:selector==='.tooling-inline-editor [role=alert]'?alert:null;
  f.load(part('tooling.js',' async function run(',' const beginUnconfirmed='));
  await f.box.run(()=>f.box.saveOrSubmit(action));
  assert.equal(f.calls.length,0);assert.equal(f.box.confirmations,0);assert.equal(f.box.renders,0);assert.equal(input.value,'尚未套用 Việt');assert.match(alert.textContent,/套用或取消/);
});
for(const action of ['save','submit'])void test('equipment '+action+' refuses an un-applied form without repainting or clearing it',async()=>{
  const f=equipment();f.box.editingEquipmentId='equipment-original';f.box.working.items.push({id:'local-unsaved'});
  const before=JSON.stringify(f.box.working);await f.box.writeShared(action);
  assert.equal(f.calls.length,0);assert.equal(f.box.confirmations,0);assert.equal(f.box.renders,0);assert.equal(JSON.stringify(f.box.working),before);assert.match(f.statusNode.textContent,/Áp dụng/);
});
void test('routine FQC Submit refuses dirty local buffer, preserving its separate explicit Save workflow',async()=>{
  const f=routine();f.box.localDirty=true;await assert.rejects(f.box.confirmSubmission(),/chưa lưu/);assert.equal(f.calls.length,0);assert.equal(f.box.confirmations,0);assert.equal(f.box.localDirty,true);
});
void test('routine FQC selection change during confirmation cannot submit a different document',async()=>{
  const f=routine(),running=f.box.confirmSubmission(),caught=running.catch(e=>e);f.box.currentDocument={...f.box.currentDocument,id:'another-document'};f.pending.resolve('confirmed');assert.match((await caught).message,/DELIVERY_SUPERSEDED/);assert.equal(f.calls.length,0);
});
