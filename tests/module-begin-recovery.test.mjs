import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=name=>fs.readFileSync(new URL(`../public/process/${name}.js`,import.meta.url),'utf8');
const between=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
const copy=structuredClone;
const receipt={generation:'original',operationId:'begin-op'};
const recovered={receipt,control:{workflow:{generation:'original',working:{remote:true}}}};
function run(code,c){c.window=c;c.host=c;vm.createContext(c);vm.runInContext(code,c);return c;}

void test('FQC Begin recovery preserves original snapshot, baseline and matrix choices without Save',async()=>{
 const snapshot={items:[{id:'local'}]},base={items:[]},rows=new Map([['local',{codes:new Set(['P'])}]]),draft={snapshot};let unknown=true;
 const client={hasUnknownBegin:()=>true,hasUnknown:()=>unknown,resolveUnknown:async()=>{unknown=false;return recovered;},isVerifiedReadback:()=>true};
 const c=run(between(source('fqc-master'),'  async function checkPreviousResult(','  function formWriteCurrent'),{ui:{saving:false},matrixDirty:()=>false,currentReadOwner:()=>()=>true,transport:()=>client,activeSharedAction:null,document:{querySelectorAll:()=>[]},syncBase:base,syncGeneration:'original',matrixBatch:{rows,count:1},matrixChoiceRevision:2,editable:()=>draft,clone:copy,adopt(){draft.snapshot={items:[]};c.syncBase={remote:true};c.syncGeneration='original';},render(){},toast(){},displayDraftError:String});
 await c.checkPreviousResult();assert.deepEqual(draft.snapshot,snapshot);assert.equal(c.syncBase,base);assert.equal(c.matrixBatch.rows,rows);assert.equal(c.matrixChoiceRevision,2);assert.equal(c.ui.lastError,null);
});
void test('FQC historical Begin receipt never rebases local content to a replacement generation',async()=>{
 const draft={snapshot:{items:[{id:'local'}]}};let adopted=0;
 const c=run(between(source('fqc-master'),'  async function checkPreviousResult(','  function formWriteCurrent'),{ui:{},matrixDirty:()=>false,currentReadOwner:()=>()=>true,transport:()=>({hasUnknownBegin:()=>true,hasUnknown:()=>false,resolveUnknown:async()=>({...recovered,control:{workflow:{generation:'new'}}}),isVerifiedReadback:()=>true}),activeSharedAction:null,document:{querySelectorAll:()=>[]},syncBase:{items:[]},syncGeneration:'original',editable:()=>draft,clone:copy,adopt(){adopted++;},render(){},toast(){},displayDraftError:String});
 await c.checkPreviousResult();assert.equal(adopted,0);assert.equal(c.ui.lastError,'STALE_GENERATION');assert.equal(draft.snapshot.items[0].id,'local');
});
void test('IQC Begin recovery retains pending local save, snapshot and baseline and pins original generation',async()=>{
 const snapshot={items:['local']},base={items:['saved']},actor={id:'actor'},client={hasUnknownBegin:()=>true,resolveUnknown:async()=>recovered};let reads=0;
 const c=run(between(source('iqc-master'),'  let operationCheck=null;','  function renderReadDenied'),{ui:{},transport:()=>client,sharedClient:client,identity:()=>actor,ProcessSync:{},mountSequence:1,loadSequence:1,readDenied:null,localSnapshot:snapshot,localBase:base,localGeneration:null,localBeginReceipt:null,dialogBase:null,dialogGeneration:null,dialogBeginReceipt:null,copy,pendingLocalSave:true,load:async()=>{reads++;},render(){}});
 await c.checkOperation();assert.equal(reads,1);assert.equal(c.localSnapshot,snapshot);assert.equal(c.localBase,base);assert.equal(c.pendingLocalSave,true);assert.equal(c.localGeneration,'original');
});
for(const action of ['save','submit','begin'])void test(`IPQC-C Begin receipt recovery does not continue ${action} or clear staged changes`,async()=>{
 const actor={id:'actor'},changes=[{action:'edit',base:'saved',value:'local'}],client={hasUnknown:()=>true,hasUnknownBegin:()=>true,resolveUnknown:async()=>recovered};let reads=0;
 const c=run(between(source('ipqc-c'),'  function captureOperationQuery(','  const open ='),{querySelector:()=>null,localSaveAttempt:null,busy:false,errorRecoveryPending:false,modal:null,saveInputNoticePending:()=>false,readAckContext:null,message:'',VersionDraftUI:{preserveView:()=>()=>{}},host:null,reviewHost:null,identity:()=>actor,ProcessSync:{},mountSequence:1,readAccessBlocked:()=>false,sharedTransport:()=>client,sharedClient:client,working:{items:['local']},localChanges:changes,localGeneration:null,read:async()=>{reads++;},clearLocal(){assert.fail('Begin cannot clear local changes');},operationAllowed(){assert.fail('Recovery cannot continue requested action');},isReadSuperseded:()=>false,workflowErrors:{},draw(){},reviewDraw(){}});
 c.host=c;await c.writeShared(action);assert.equal(reads,1);assert.equal(c.localChanges,changes);assert.equal(c.localGeneration,'original');
});
for(const missing of [false,true])void test(`authoring Begin recovery ${missing?'404 never offers retry':'preserves editor and canvas baselines'}`,async()=>{
 const calls=[],client={hasUnknown:()=>true,hasUnknownBegin:()=>true};
 const branch=between(source('process-authoring-v3'),"    if(name==='retry')",'    const detail={};');
 const c=run(`async function recover(){const name='retry';${branch}}`,{ownedLedger:null,client:()=>client,transport:client,identityStamp:()=>1,sameStamp:()=>true,flow:()=>({generation:'original'}),trackedRecovery:async(c,m)=>{calls.push(m);if(missing)throw Object.assign(Error('NOT_FOUND'),{status:404});return recovered;},adopt:(result,replace,preserve)=>calls.push({replace,preserve}),panel(){},confirm(){assert.fail('Begin must not offer POST retry');}});
 if(missing)await assert.rejects(c.recover(),{status:404});else await c.recover();assert.deepEqual(calls,missing?['resolveUnknown']:['resolveUnknown',{replace:false,preserve:true}]);
});
void test('empty canvas Begin departure lease requires live proof and fails after identity change',()=>{
 let proof=true;const c=run(source('canvas-local'),{document:{documentElement:{lang:'zh'},querySelector:()=>null},structuredClone,ProcessSync:{identity:{id:'actor'},identityGeneration:()=>1},ProcessAuthoringV3:{flow:()=>null},addEventListener(){},setTimeout,clearTimeout});
 assert.throws(()=>c.ProcessCanvasLocal.lockForDeparture(),/CANVAS_LOAD_REQUIRED/);
 const lease=c.ProcessCanvasLocal.lockForDeparture(()=>proof);assert.equal(lease.current(),true);let discarded=0;c.ProcessCanvasLocal.discardUnsentForDeparture(null,lease,()=>discarded++);assert.equal(discarded,1);assert.equal(c.ProcessCanvasLocal.departureReady(lease),true);proof=false;assert.equal(lease.current(),false);assert.throws(()=>c.ProcessCanvasLocal.discardUnsentForDeparture(null,lease),/CANVAS_DEPARTURE_LOCKED/);lease.release();
 proof=true;const next=c.ProcessCanvasLocal.lockForDeparture(()=>proof);c.ProcessSync.identity={id:'other'};assert.equal(next.current(),false);next.release();
});
void test('authoring no-workflow departure requires a verified unknown Begin marker',()=>{
 let proof=true;
 const client={hasUnknownBegin:()=>true,hasUnknown:()=>true,departureUnknown:()=>proof?{kind:'begin-v1'}:null};
 const c=run(between(source('process-authoring-v3'),' function departureStatus(){',' function departureCheck('),{enabled:()=>true,transport:client,ownFlow:()=>false,flow:()=>null,ProcessSync:{},busy:false,ownIntentPending:()=>false,departureOperation:null,ProcessEditorV2:{departure:{inspect:()=>({state:'clean'})}},ProcessCanvasLocal:{pending:()=>false,discardUnsentForDeparture(){},departureReady(){}},submitStateUnconfirmed:null,unknownDeparturePlan:()=>proof?{pins:[{client}]}:null,ownedLedger:null,localFailure:false,t:zh=>zh});
 assert.equal(c.departureStatus().canAbandon,true);proof=false;assert.equal(!!c.departureStatus().canAbandon,false);
});
for(const change of ['actor','mount','input'])void test(`IPQC-C late Begin recovery rejects changed ${change} before assigning generation or reading`,async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});let actor={id:'original'},reads=0;
 const client={hasUnknownBegin:()=>true,resolveUnknown:()=>pending};
 const c=run(between(source('ipqc-c'),'  function captureOperationQuery(','  async function writeShared('),{localSaveAttempt:null,busy:false,sharedTransport:()=>client,sharedClient:client,identity:()=>actor,ProcessSync:{},mountSequence:1,localChanges:[{value:'local'}],working:{items:['local']},localGeneration:null,read:async()=>{reads++;},isReadSuperseded:e=>e.message==='IPQCC_READ_SUPERSEDED',draw(){},t:zh=>zh});
 const checking=c.checkPreviousOperation();if(change==='actor')actor={id:'new'};if(change==='mount')c.mountSequence++;if(change==='input')c.localChanges.push({value:'new-local'});release(recovered);await checking;assert.equal(reads,0);assert.equal(c.localGeneration,null);assert.equal(c.working.items[0],'local');
});
void test('authoring same-actor runtime renewal preserves local input and baseline',()=>{
 const base={workspaces:['original']},editors={current:['unsaved']},fresh={};let creates=0;
 const c=run(between(source('process-authoring-v3'),'function client(){',' const diff='),{actorId:'actor',transport:{isRuntimeCurrent:()=>true,isBeginRuntimeCurrent:()=>false},loadedStamp:1,localBase:base,state:{editorByCategory:editors},ProcessSync:{identity:{id:'actor'}},createSharedDraftClient:options=>{assert.equal(options.durableBegin,true);creates++;return fresh;}});
 assert.equal(c.client(),fresh);assert.equal(creates,1);assert.equal(c.loadedStamp,null);assert.equal(c.localBase,base);assert.equal(c.state.editorByCategory,editors);
});
for(const generation of ['original','replacement'])void test(`IPQC-C initial Begin projection reads full control and ${generation==='original'?'keeps staged baseline':'rejects generation replacement without binding local edits'}`,async()=>{
 const actor={id:'actor'},changes=[{value:'local',base:'original baseline'}],working={items:['local']};let reads=0;
 const client={hasUnknown:()=>false,hasUnknownBegin:()=>false,begin:async()=>({...recovered,control:undefined,workflow:{generation:'original'},recoveryKind:'begin-v1'})};
 const c=run(between(source('ipqc-c'),'  function captureOperationQuery(','  const open ='),{querySelector:()=>null,localSaveAttempt:null,busy:false,errorRecoveryPending:false,modal:null,saveInputNoticePending:()=>false,readAckContext:null,message:'',VersionDraftUI:{preserveView:()=>()=>{}},host:null,reviewHost:null,identity:()=>actor,ProcessSync:{},mountSequence:1,readAccessBlocked:()=>false,sharedTransport:()=>client,sharedClient:client,control:{versions:[]},working,localChanges:changes,localGeneration:null,selectedVersionId:'legacy',operationAllowed:()=>true,open:()=>({id:'new-draft',status:'draft'}),active:()=>null,read:async(preserve,current)=>{assert.equal(current(),true);reads++;c.control={workflow:{generation},versions:[]};},isReadSuperseded:e=>e.message==='IPQCC_READ_SUPERSEDED',workflowErrors:{},draw(){},reviewDraw(){},toast(){},t:vi=>vi});
 await c.writeShared('begin');assert.equal(reads,1);assert.equal(c.localChanges,changes);assert.equal(c.working,working);assert.equal(c.localChanges[0].base,'original baseline');assert.equal(c.localGeneration,generation==='original'?'original':null);assert.equal(c.message,generation==='original'?'':'STALE_GENERATION');
});
