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
  mountSequence:1,loadSequence:0,mutationSequence:0,versionReadSequence:0,activeDeferredId:'',modalBase:null,modalGeneration:null,versionId:'draft-one',selectedVersionId:'draft-one',issues:[],readAckContext:null,
  user,epoch:1,deliveryCurrent:true,render(){calls.push({action:'render'});},draw(){calls.push({action:'draw'});},drawReview(){},reviewDraw(){},toast(){},selectDefaults(){},syncSelection(){},validateIqcPayload(){},
  identity:()=>g.user,actor:()=>g.user,key:()=> 'A',scope:()=>g.control.scopes.A,opened:()=>moduleControl.versions[0],open:()=>moduleControl.versions[0],active:()=>null,version:()=>moduleControl.versions[0],selected:()=>moduleControl.versions[0],
  mayEdit:()=>true,operationAllowed:()=>true,readAccessBlocked:()=>false,saveInputNoticePending:()=>false,isReadSuperseded:()=>false,captureSaveProjection:()=>null,workflowErrors:{},
  load:async()=>true,read:async()=>true,t:(a,b)=>kind==='c'?b:a,
  document:{querySelector:()=>form?{fixture:'unapplied form'}:null},
 };
 const client={hasUnknown:()=>false,flush:async()=>{calls.push({action:'flush'});},read:async()=>({control:moduleControl,revision:11}),
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
