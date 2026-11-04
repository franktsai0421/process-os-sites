/* Actual quality UI command handlers with isolated synthetic ports.
 * Tests caller pinning/form admission only; helper and transport are contract ports.
 * Dispatch confirmation only: terminal readback/adoption is outside these contract-port cases.
 * No browser, HTTP, live account, persistence or backend-authorization claim. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const files={iqc:['iqc-master.js','  async function post(','  function versionBar()'],ab:['ipqc-ab.js','  async function writeShared(','  function selectDefaults()'],module:['ipqc-ab.js','  async function moduleSave(','  async function save('],c:['ipqc-c.js','  async function writeShared(','  const open =']};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(kind){
 const [file,start,end]=files[kind],source=fs.readFileSync('public/process/'+file,'utf8'),from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from);
 const calls=[],snapshot={scopes:{A:{items:[],errors:[]}}},flow={generation:'generation-one',revision:7,pendingId:null,working:clone(snapshot),saved:{id:'saved-one',content:clone(snapshot),at:'2026-10-30T01:02:03Z',actor:{name:'Fixture editor'}},cases:[]};
 const moduleControl={workflow:flow,activeVersionId:null,versions:[{id:'draft-one',status:'draft',snapshot:clone(snapshot)}]};
 const rootControl=kind==='ab'||kind==='module'?{scopes:{A:moduleControl},moduleDraft:moduleControl}:moduleControl;
 let answer=()=> 'confirmed',form=false;const user={id:'actor-one'},delivery={};
 const g={console,Error,JSON,CustomEvent:class{constructor(type){this.type=type;}},clone,copy:clone,
  ui:{busy:false,versionId:'draft-one'},busy:false,control:rootControl,revision:11,readDenied:null,accessBlocked:null,modal:null,working:clone(snapshot),reason:'why',message:'',host:{isConnected:true,dataset:{activeTab:'quality-ipqc-ab'}},reviewHost:null,privateQuarantine:null,
  errorRecoveryPending:null,localSnapshot:null,localBase:null,localGeneration:null,pendingLocalSave:false,localChanges:[],mountSequence:1,loadSequence:0,mutationSequence:0,versionReadSequence:0,activeDeferredId:'',modalBase:null,modalGeneration:null,versionId:'draft-one',selectedVersionId:'draft-one',issues:[],readAckContext:null,
  user,epoch:1,deliveryCurrent:true,render(){calls.push({action:'render'});},draw(){calls.push({action:'draw'});},drawReview(){},reviewDraw(){},toast(){},selectDefaults(){},syncSelection(){},validateIqcPayload(){},
  identity:()=>g.user,actor:()=>g.user,key:()=> 'A',scope:()=>g.control.scopes.A,opened:()=>moduleControl.versions[0],open:()=>moduleControl.versions[0],active:()=>null,version:()=>moduleControl.versions[0],selected:()=>moduleControl.versions[0],
  mayEdit:()=>true,operationAllowed:()=>true,readAccessBlocked:()=>false,saveInputNoticePending:()=>false,isReadSuperseded:()=>false,captureSaveProjection:()=>null,workflowErrors:{},
  load:async()=>true,read:async()=>true,t:(a,b)=>kind==='c'?b:a,
  document:{querySelector:()=>form?{fixture:'unapplied form'}:null},
 };
 const client={begin:async()=>{calls.push({action:'begin'});throw Error('UNEXPECTED_BEGIN');},hasUnknown:()=>false,flush:async()=>{calls.push({action:'flush'});},read:async()=>({control:moduleControl,revision:11}),
  command:async(generation,action,fields)=>{calls.push({generation,action,...clone(fields)});return{control:moduleControl,revision:12,receipt:{operationId:'fixture-receipt'}};},
  prepare:(generation,action,fields)=>({generation,action,...fields}),sendPrepared:async command=>{calls.push(clone(command));return{control:moduleControl,revision:12,receipt:{operationId:'fixture-receipt'}};}};
 g.sharedClient=client;g.moduleClient=client;g.transport=()=>client;g.moduleTransport=()=>client;g.sharedTransport=()=>client;
 g.window={ProcessSync:{identity:user,identityGeneration:()=>g.epoch,requiresReload:false,captureDelivery:()=>delivery,isCurrentDelivery:()=>g.deliveryCurrent},
  captureSharedDraftSubmission:current=>{calls.push({action:'capture'});assert.equal(current,flow);if(!current.saved)throw Error('SUCCESSFUL_SAVE_REQUIRED');return{savedId:current.saved.id,expectedRevision:current.revision};},
  VersionDraftUI:{preserveView:()=>()=>{},reasonFor:()=>'',confirmSubmit:async(reason,scope,options)=>{calls.push({action:'confirm',reason,scope,options:clone(options)});return answer();}},dispatchEvent(){}};
 const context=vm.createContext(g);
 if(kind==='ab'||kind==='module'){
  const boundaryStart=source.indexOf('  // Caller-only RAM batch boundary.'),boundaryEnd=source.indexOf('  async function writeShared(',boundaryStart);
  assert(boundaryStart>=0&&boundaryEnd>boundaryStart,'Actual AB caller helpers are required');
  vm.runInContext(source.slice(boundaryStart,boundaryEnd)+'\ninputBasisOwner=inputOwner();',context,{filename:file+':actual-caller-ownership'});
 }
 const handler=vm.runInContext('('+source.slice(from,to).trim()+')',context,{filename:file+':actual-command-handler'});
 return{g,flow,calls,setAnswer:fn=>{answer=fn;},setForm(){form=true;g.modal={dirty:true,readonly:false,fields:{name:'尚未套用 Việt'}};},async run(action='submit'){try{return await handler(action);}catch(error){g.message=error.message;return null;}},sends:()=>calls.filter(call=>call.action==='submit'||call.action==='save'||call.action==='apply')};
}
for(const kind of Object.keys(files)){
 void test(kind+': confirmation sends the captured savedId, generation and revision',async()=>{const f=fixture(kind);await f.run();assert.equal(f.sends().length,1,JSON.stringify({calls:f.calls,error:f.g.message}));const c=f.sends()[0];assert.equal(c.action,'submit');assert.equal(c.savedId,'saved-one');assert.equal(c.expectedRevision,7);assert.equal(c.generation,'generation-one');assert.equal(f.calls.filter(c=>c.action==='capture').length,1);assert.deepEqual(f.calls.find(c=>c.action==='confirm').options.savedVersion,{id:'saved-one',revision:7,at:'2026-10-30T01:02:03Z',actor:'Fixture editor'});assert(f.calls.findIndex(c=>c.action==='capture')<f.calls.findIndex(c=>c.action==='confirm'));if(kind==='module')assert.equal(c.input.stateRevision,11);});
 void test(kind+': changed saved/revision/generation during confirmation sends nothing',async()=>{for(const [field,change] of [['saved',f=>f.flow.saved.id='saved-two'],['revision',f=>f.flow.revision++],['generation',f=>f.flow.generation='generation-two']]){const f=fixture(kind);f.setAnswer(()=>{change(f);return'confirmed';});await f.run();assert.equal(f.sends().length,0);if(field==='generation'&&(kind==='ab'||kind==='module'))assert.equal(f.g.message,kind==='ab'?'IDENTITY_OR_SCOPE_CHANGED':'IDENTITY_CHANGED','Generation drift is refused by the earlier exact owner fence');else assert.match(f.g.message,/RECONFIRM/);}});
 void test(kind+': actor, identity epoch and delivery replacement during confirmation send nothing',async()=>{for(const change of [f=>{f.g.user={id:'actor-two'};},f=>{f.g.epoch++;},f=>{f.g.deliveryCurrent=false;}]){const f=fixture(kind);f.setAnswer(()=>{change(f);return'confirmed';});await f.run();assert.equal(f.sends().length,0);}});
 void test(kind+': unapplied local form blocks Save/Submit without auto Apply',async()=>{for(const action of ['save','submit']){const f=fixture(kind);f.setForm();const input=clone(f.g.modal);await f.run(action);assert.equal(f.sends().length,0);assert.equal(f.calls.length,0,'no transport/helper/confirmation on an unapplied form');assert.deepEqual(f.g.modal,input);assert.match(f.g.message,/套用|彈窗/);}});
 void test(kind+': cancel keeps the saved version and sends nothing',async()=>{const f=fixture(kind);f.setAnswer(()=>null);await f.run();assert.equal(f.sends().length,0);assert.equal(f.flow.saved.id,'saved-one');});
 void test(kind+': helper refusal is surfaced before showing confirmation',async()=>{const f=fixture(kind);f.g.window.captureSharedDraftSubmission=()=>{throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');};await f.run();assert.equal(f.sends().length,0);assert(!f.calls.some(c=>c.action==='confirm'));assert.match(f.g.message,/UNSAVED_CHANGES_SAVE_REQUIRED/);});
}

void test('c: completed local edits require explicit Save before submission confirmation',async()=>{
 const f=fixture('c');f.g.localChanges=[{action:'update-item',id:'local'}];
 await f.run();assert.equal(f.sends().length,0);assert(!f.calls.some(c=>c.action==='confirm'||c.action==='capture'));
 assert.equal(f.g.message,'UNSAVED_CHANGES_SAVE_REQUIRED');assert.equal(f.g.localChanges.length,1);
});

for(const legacy of [false,true])void test(`iqc: completed local edits block Submit before ${legacy?'legacy Begin':'saved-version capture'} or confirmation`,async()=>{
 const f=fixture('iqc'),local={items:[{id:'local-item',nameVi:'Unsent edit'}]};f.g.localSnapshot=local;f.g.localBase={items:[]};f.g.localGeneration=legacy?null:f.flow.generation;if(legacy)f.g.control.workflow=null;
 const before=clone(f.flow);await f.run();assert.equal(f.calls.length,0,'no Begin, render, capture, confirmation or transport');assert.equal(f.sends().length,0);assert.match(f.g.message,/UNSAVED_CHANGES_SAVE_REQUIRED/);assert.equal(f.g.localSnapshot,local);assert.deepEqual(f.flow,before);
});
void test('iqc: local edits arriving while Submit confirmation is open block the original saved snapshot',async()=>{
 const f=fixture('iqc'),local={items:[{id:'local-item',nameVi:'Late edit'}]},before=clone(f.flow);
 f.setAnswer(()=>{f.g.localSnapshot=local;return 'confirmed';});await f.run();assert.equal(f.calls.filter(c=>c.action==='confirm').length,1);assert.equal(f.sends().length,0);assert.match(f.g.message,/UNSAVED_CHANGES_SAVE_REQUIRED/);assert.equal(f.g.localSnapshot,local);assert.deepEqual(f.flow,before);assert.equal(f.g.ui.busy,false);
});
void test('iqc: Submit button reflects local Save requirement without disabling explicit Save',()=>{
 const f=fixture('iqc'),source=fs.readFileSync('public/process/iqc-master.js','utf8');
 Object.assign(f.g,{h:String,status:value=>value,date:String,lastEdit:()=>null,mayDraftAction:()=>true,mayWithdraw:()=>false});
 const bar=vm.runInContext('('+source.slice(source.indexOf('  function versionBar()'),source.indexOf('  function issuesPanel()')).trim()+')',vm.createContext(f.g));
 const button=id=>bar().match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))[0];
 assert(!button('iqc-submit').includes('disabled'));f.g.localSnapshot={items:[{id:'local'}]};assert(button('iqc-submit').includes('disabled'));assert(!button('iqc-save').includes('disabled'));f.g.localSnapshot=null;assert(!button('iqc-submit').includes('disabled'));
});
void test('iqc: form opened during Submit confirmation blocks dispatch and preserves input',async()=>{
 const f=fixture('iqc');f.setAnswer(()=>{f.setForm();return 'confirmed';});await f.run();assert.equal(f.sends().length,0);assert.equal(f.g.modal.fields.name,'尚未套用 Việt');assert.match(f.g.message,/套用/);assert.equal(f.g.ui.busy,false);
});
void test('iqc: unsaved Submit refusal preserves an existing unknown transport obligation',async()=>{
 const f=fixture('iqc'),local={items:[{id:'retained'}]};f.g.localSnapshot=local;f.g.sharedClient.hasUnknown=()=>true;await f.run();assert.equal(f.calls.length,0);assert.equal(f.g.sharedClient.hasUnknown(),true);assert.equal(f.g.localSnapshot,local);
});
