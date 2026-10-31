import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
const cases=['AB','C','PROCESS','BOM'].map(scope=>({id:scope+'-case',scope,status:'pending',reason:scope+' reason',actor:{id:'submitter',name:'Submitter'},at:'2026-10-10T00:00:00Z',fixed:true}));
const state={view:'approval',approvalTab:'master'},control={versions:[{id:'old',scope:'AB',status:'approved',number:1,snapshot:{products:[],lines:[]}}]};
const host={ProcessSync:{identity:{id:'reviewer'}},addEventListener(){},BOMWorkspace:{reviewItems:()=>cases.filter(c=>c.scope==='BOM'),reviewPermission:()=>true,reviewError:()=>''},hasPermission:key=>["ab.view","c.view","templates.view","bom.view"].includes(key)};
const context={window:host,document:{documentElement:{lang:'zh-Hant'},querySelector:()=>null},URL,location:{href:'http://localhost/process/?view=data&dataTab=bom'},history:{state:null,replaceState(a,b,url){context.location.href=String(url);}},navigate(view){state.view=view;},currentUser:{role:'staff'}};

vm.createContext(context);
vm.runInContext(fs.readFileSync('public/process/master-review.js','utf8'),context);
const review=host.MasterReview.install({state,control,shared:{flow:scope=>({cases:cases.filter(c=>c.scope===scope)}),permissions:()=>({approve:true,return:true,withdraw:true})},applyActive(){},record(){},persist(){throw Error('Unexpected write');},validateCatalog:()=>[]});
let html=review.view();
assert.equal((html.match(/data-master-review=/g)||[]).length,4);
assert(!html.includes('review-bom'));
assert(!html.includes('data-master-review="AB:old"'));
assert.match(html,/data-review-action="approve"/);

cases[2].status='withdrawn';
cases[2].result={actor:{name:'Reviewer'},at:'2026-10-10T01:00:00Z',reason:'withdraw reason'};
state.masterReviewId='PROCESS:PROCESS-case';
html=review.view();
assert.equal((html.match(/data-master-review=/g)||[]).length,3);
assert(!html.includes('data-master-review="PROCESS:PROCESS-case"'));

state.masterReviewMode='history';
state.masterReviewId='PROCESS:PROCESS-case';
html=review.view();
assert.match(html,/withdraw reason/);
assert.match(html,/Reviewer/);
assert(!html.includes('data-review-action='));

host.MasterReview.open('BOM','BOM-case');
assert.equal(state.masterReviewId,'BOM:BOM-case');
assert.equal(state.masterReviewMode,'pending');
const url=new URL(context.location.href);
assert.equal(url.searchParams.get('view'),'approval');
assert.equal(url.searchParams.get('approvalTab'),'master');
assert(!url.searchParams.has('dataTab'));

context.document.documentElement.lang='vi';
html=review.view();
assert.match(html,/Hồ sơ duyệt dữ liệu gốc/);
assert.match(html,/Trả lại/);
assert(!html.includes('主資料送審案件'));

host.ProcessSync.identity={id:'other'};
review.view();
assert.notEqual(state.masterReviewId,'BOM:BOM-case');

console.log('PASS unified AB/C/PROCESS/BOM list, withdrawn exclusion, audit history, read-only closed cases, bilingual labels, route and actor reset');
// A restricted reviewer must not load or display unauthorized cached scopes.
host.hasPermission=key=>key==='templates.view';
state.masterReviewMode='history';state.masterReviewId=null;
html=review.view();assert.match(html,/PROCESS-case/);assert(!html.includes('AB:old'));assert(!html.includes('BOM:BOM-case'));
assert.equal(Array.from(host.MasterReview.readableScopes()).join(','),'PROCESS');
host.hasPermission=()=>false;assert.equal((review.view().match(/data-master-review=/g)||[]).length,0);
console.log('PASS restricted reviewer sees only permitted scopes; denied view exposes no cached cases');

// Composition coverage: execute actual authorization callers and BOM controller
// with bounded dependency ports. No browser, HTTP server or business writes.
const readSource=name=>fs.readFileSync('public/process/'+name,'utf8');
const masterDataSource=readSource('master-data.js'),masterReviewSource=readSource('master-review.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function exactPart(text,start,end){assert.equal(text.split(start).length,2,'unique '+start);const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(b>a,'complete '+start);return text.slice(a,b);}
const bindCaller=exactPart(masterDataSource,'      bindApprovalMaster = function(){','\n');
const renderCaller=exactPart(masterDataSource,'  render = function () {',"  window.addEventListener('process-language-change'");
let compositionCases=0;
for(const allowed of [[],['templates.view'],['ab.view','c.view']]){
 const reads=[],pending=deferred();let generation=1,renders=0;
 const win={hasPermission:key=>allowed.includes(key),addEventListener(){}};
 const box={window:win,document:{documentElement:{lang:'zh'}},review:{bind(){}},sharedLoaded:new Set(),sharedLoading:new Set(),shared:{load:scope=>{reads.push(scope);return pending.promise;}},deliveryGeneration:1,ownsDelivery:value=>value===generation,dataError:null,dataReady:Promise.resolve(),render:()=>{renders++;},toast(){throw Error('UNEXPECTED_TOAST');},displayDraftError:error=>error.message};
 vm.createContext(box);vm.runInContext(masterReviewSource,box);vm.runInContext(bindCaller,box);box.bindApprovalMaster();
 assert.deepEqual(reads,allowed.length?allowed.includes('templates.view')?['PROCESS']:['AB','C']:[]);box.bindApprovalMaster();assert.equal(reads.length,allowed.length,'in-flight scopes deduplicate');
 pending.resolve();await box.dataReady;assert.deepEqual([...box.sharedLoaded],reads);assert.equal(box.sharedLoading.size,0);assert.equal(renders,allowed.length?1:0);generation++;compositionCases++;
}
{
 const pending=deferred(),reads=[];let owner=true;
 const win={hasPermission:key=>key==='templates.view',addEventListener(){}};
 const box={window:win,document:{documentElement:{lang:'zh'}},review:{bind(){}},sharedLoaded:new Set(),sharedLoading:new Set(),shared:{load:scope=>{reads.push(scope);return pending.promise;}},deliveryGeneration:1,ownsDelivery:()=>owner,dataError:null,dataReady:Promise.resolve(),render(){throw Error('STALE_RENDER');},toast(){throw Error('STALE_TOAST');},displayDraftError:error=>error.message};
 vm.createContext(box);vm.runInContext(masterReviewSource,box);vm.runInContext(bindCaller,box);box.bindApprovalMaster();owner=false;pending.resolve();await box.dataReady;assert.deepEqual(reads,['PROCESS']);assert.equal(box.sharedLoaded.size,0);compositionCases++;
}
function renderCallerFixture({bom=false,routine=false,tab='master'}={}){
 const data=deferred(),bomRead=deferred(),routineCount=deferred(),routineRead=deferred(),calls=[];
 const win={hasPermission:key=>key==='bom.view'?bom:key==='routine.view'?routine:false,ApprovalTabs:{mount(){}},BOMWorkspace:{pendingCount:()=>0,loadReview(){calls.push('bom-review');return bomRead.promise;}},RoutineFQCUI:{pendingCount:()=>0,refreshPending(){calls.push('routine-count');return routineCount.promise;},bindReview(){calls.push('routine-panel');return routineRead.promise;}},ProcessSync:{legacyProcessPendingCount:()=>0}};
 const box={window:win,document:{documentElement:{lang:'zh'},querySelector:()=>null},state:{view:'approval',approvalTab:tab},control:{versions:[]},priorRender(){},approvalSection:()=>'',bindApprovalMaster:()=>calls.push('master-bind'),dataReady:data.promise,URL,location:{href:'https://fixture.invalid/process/'},history:{replaceState(){throw Error('NO_NAVIGATION');}}};
 vm.createContext(box);vm.runInContext(renderCaller,box);box.render();return{box,calls,data,bomRead,routineCount,routineRead};
}
for(const bom of [false,true])for(const routine of [false,true]){
 const f=renderCallerFixture({bom,routine});assert.deepEqual(f.calls,['master-bind',...(bom?['bom-review']:[]),...(routine?['routine-count']:[])]);
 let ready=false;f.box.approvalReady.then(()=>{ready=true;});await drain();assert.equal(ready,false);f.data.resolve();await drain();assert.equal(ready,!bom,'only authorized foreground BOM read joins readiness');if(bom){f.bomRead.resolve();await drain();assert.equal(ready,true);}await f.box.approvalReady;assert.equal(ready,true,'unresolved routine background count never blocks master readiness');compositionCases++;
}
{
 const f=renderCallerFixture({bom:true,routine:true,tab:'routine'});assert.deepEqual(f.calls,['routine-panel']);let ready=false;f.box.approvalReady.then(()=>{ready=true;});await drain();assert.equal(ready,false);f.routineRead.resolve();await f.box.approvalReady;assert.equal(ready,true);compositionCases++;
}

const {fixture:foregroundFixture}=await import('./entry-performance/foreground-poll.test.mjs');
const bomSource=readSource('bom-workspace.js');
assert.match(bomSource,/const foregroundPoll=window\.createForegroundPoll\(\)/,'composition must retain foreground scheduler');
function bomPermissions(){return{view:true,create:true,edit:true,delete:true,save:true,submit:true,withdraw:true,approve:true,return:true,history:true,restore:true,import:true};}
function bomReadResult(){return{revision:11,permissions:bomPermissions(),control:bomControl()};}
function bomPollFixture({workspace=false,allow=false,omitHelper=false,storageMode='complete'}={}){
 const f=foregroundFixture(),reads=[],paints=[],events=[],permissions=new Set(allow?['bom.view']:[]),paused=new Set(),data=new Map(),storageWrites=[],heldLocks=new Set(),helperTimers=new Map();let unknown=false,readHandler=null,delivery=1,epoch=1,access=bomPermissions(),serial=0,commands=0;
 const node={isConnected:true,setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]};let dialog=false;
 f.document.documentElement={lang:'zh'};f.document.querySelector=selector=>selector==='.bw-workspace'?workspace?node:null:selector==='.bw-workspace,#master-unified-review'?node:selector==='dialog[open]'?dialog?node:null:null;
 f.document.querySelectorAll=()=>[];f.document.activeElement=null;
 // Read-only transport dependency port, not a primary-client or server test.
 // Grants reflect the returned permissions rather than unconditional true.
 const client={canPoll:kind=>!paused.has(kind),hasUnknown:()=>unknown,hasSyncFailures:()=>false,permission:name=>access[name]===true,resolveUnknown:async()=>{reads.push('receipt');unknown=false;},read:async()=>{reads.push('state');const result=await(readHandler?readHandler():bomReadResult());access=result.permissions||{};return result;},reviewMetadata:async()=>{reads.push('review');const result=await(readHandler?readHandler():{revision:11,permissions:bomPermissions(),review:{versions:[],workflow:{scope:'bom',generation:'g',revision:1,pendingId:null},cases:[]}});access=result.permissions||{};return result;},command(){commands++;throw Error('UNEXPECTED_POST');}};
 const storage={get length(){return data.size;},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,setItem(key,value){storageWrites.push(['set',key]);data.set(key,String(value));},removeItem(key){storageWrites.push(['remove',key]);data.delete(key);}};
 if(storageMode==='missing-key')delete storage.key;
 Object.assign(f.window,{crypto:webcrypto,localStorage:storageMode==='absent'?null:storage,sessionStorage:storage,navigator:{locks:{request(name,_options,callback){if(heldLocks.has(name))return Promise.resolve(callback(null));heldLocks.add(name);return Promise.resolve(callback({name})).finally(()=>heldLocks.delete(name));}}},setTimeout(fn,delay){const id=++serial;helperTimers.set(id,{fn,delay});return id;},clearTimeout:id=>helperTimers.delete(id)});
 f.window.ProcessSync={identity:{id:'actor'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:owner=>owner===delivery};f.window.hasPermission=key=>permissions.has(key);if(allow==='missing')delete f.window.hasPermission;f.window.createSharedDraftClient=()=>client;f.window.dispatchEvent=event=>{events.push(event.type);};
 const box={window:f.window,document:f.document,console,TextEncoder,bindDataInner(){},bomTable(){},MutationObserver:class{observe(){}},CustomEvent:class{constructor(type){this.type=type;}},__paint:()=>paints.push('paint')};
 const hook=`paint=()=>__paint();window.__bomComposition={run,read,checkRecoveryRead,session:()=>recoverySession,seed(value){transport();control=value;fullRevision=10;},state:()=>({control,editor,error,busy,polling}),set(kind){if(kind==='pending')pending.push({local:true});if(kind==='batch')batch={changes:[{local:true}]};if(kind==='edit')edit={rows:[]};if(kind==='busy')busy=true;if(kind==='loading')loading=true;},timer:foregroundPoll};`;
 vm.createContext(box);if(!omitHelper)for(const name of ['local-draft-recovery.js','local-draft-recovery-session.js'])vm.runInContext(readSource(name),box);
 assert.equal(bomSource.split('\n})();').length,2,'unique BOM closure hook');vm.runInContext(bomSource.replace('\n})();','\n'+hook+'\n})();'),box);const api=f.window.__bomComposition;api.seed(bomControl());
 return Object.assign(f,{api,reads,paints,events,paused,permissions,client,storageWrites,heldLocks,unknown:()=>{unknown=true;},handler:value=>{readHandler=value;},dialog:()=>{dialog=true;},rotate:()=>{delivery++;epoch++;f.window.ProcessSync.identity={id:'new-actor'};},close(){api.timer.cancel();api.session()?.close();assert.equal(commands,0,'readonly composition must never dispatch a command');assert.deepEqual(storageWrites,[],'polling/review never persists local input');assert.equal(helperTimers.size,0);}});
}
function bomControl(){return{schemaVersion:1,activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:{bom:{}}},{id:'draft',status:'draft',snapshot:{bom:{}}}],workflow:{scope:'bom',generation:'g',revision:1,working:{bom:{}},saved:null,pendingId:null,cases:[]}};}
for(const allow of [false,true,'missing']){
 const f=bomPollFixture({allow});f.focus(false);await f.tick(60000);assert.deepEqual(f.reads,[]);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,allow===true?['review']:[]);assert.equal(f.paints.length,0,'review metadata never hydrates or repaints editor');assert.equal(f.api.state().busy,false);assert.equal(f.timers,1,'a denied review gate retains its foreground scheduler');await f.tick(30000);assert.deepEqual(f.reads,allow===true?['review','review']:[]);assert.equal(f.timers,1);if(allow!==true){f.permissions.add('bom.view');f.window.hasPermission=key=>f.permissions.has(key);f.focus(false);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,['review'],'fresh foreground admission rechecks a newly available grant');}assert.deepEqual(f.errors,[]);f.close();compositionCases++;
}
{
 const f=bomPollFixture({workspace:true,allow:false});await f.tick(30000);assert.deepEqual(f.reads,['state'],'workspace keeps its existing authorized-transport path; new gate is review-only');assert.equal(f.paints.length,1);assert.deepEqual(f.errors,[]);assert.equal((await f.api.session().ready).ready,true);assert.equal(f.api.session().status().canRecover,true);assert.equal(f.heldLocks.size,2);assert.equal(f.api.session().discover().complete,true);f.close();compositionCases++;
}
for(const kind of ['pending','batch','edit','busy','loading','dialog','focused-input']){
 const f=bomPollFixture({workspace:true,allow:true});if(kind==='dialog')f.dialog();else if(kind==='focused-input')f.document.activeElement={matches:()=>true};else f.api.set(kind);await f.tick(60000);assert.deepEqual(f.reads,[],kind+' retains local work without an automatic read');assert.equal(f.paints.length,0);assert.deepEqual(f.errors,[]);f.close();compositionCases++;
}
for(const kind of ['state','review','receipt']){
 const f=bomPollFixture({workspace:kind!=='review',allow:true});f.paused.add(kind);if(kind==='receipt')f.unknown();await f.tick(30000);f.focus(false);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,[],kind+' pause survives foreground resume');assert.equal(f.paints.length,0);assert.deepEqual(f.errors,[]);f.close();compositionCases++;
}
{
 const f=bomPollFixture({workspace:true,allow:true});f.unknown();await f.tick(30000);assert.deepEqual(f.reads,['receipt','state'],'receipt is resolved before reading, never a retry POST');assert.deepEqual(f.errors,[]);f.close();compositionCases++;
}
for(const outcome of ['resolve','reject']){
 const f=bomPollFixture({workspace:true,allow:true}),old=deferred(),operation=deferred();f.handler(()=>old.promise);await f.tick(30000);assert.deepEqual(f.reads,['state']);const before=f.api.state().control,working=f.api.run(()=>operation.promise);assert.equal(f.api.state().busy,true);
 if(outcome==='resolve')old.resolve(bomReadResult());else old.reject(Error('old-poll-error'));await f.tick(0);assert.equal(f.api.state().control,before);assert.equal(f.api.state().error,'');assert.equal(f.api.state().busy,true);assert.equal(f.paints.length,0);assert.equal(f.api.state().polling,false);assert.deepEqual(f.errors,[]);operation.resolve();await working;assert.equal(f.api.state().busy,false);assert.equal(f.paints.length,1,'only the current operation completion paints');f.close();compositionCases++;
}
// Original missing helper reproduces the actual swallowed poll error, not a
// weaker paint expectation. Ordinary read is not a full authority-shape guard.
{
 const f=bomPollFixture({workspace:true,allow:true,omitHelper:true});await assert.rejects(f.api.read(),/RECOVERY_HELPER_UNAVAILABLE/);assert.equal(f.api.session(),null);await f.tick(30000);assert.deepEqual(f.reads,['state','state']);assert.equal(f.paints.length,0);assert.match(f.api.state().error,/RECOVERY_HELPER_UNAVAILABLE/);assert.deepEqual(f.errors,[]);f.close();compositionCases++;
}
for(const storageMode of ['missing-key','absent']){
 const f=bomPollFixture({workspace:true,allow:true,storageMode});await f.api.read();const session=f.api.session();await session.ready;const inventory=session.discover();assert.equal(inventory.ok,false);assert.equal(inventory.code,'STORAGE_UNAVAILABLE');assert.notEqual(inventory.complete,true);if(storageMode==='absent'){assert.equal(session.schedule(()=>({kind:'synthetic-local'})).ok,true);const saved=session.flush();assert.equal(saved.ok,false);assert.equal(saved.durable,false);assert.equal(saved.code,'STORAGE_UNAVAILABLE');}assert.deepEqual(f.storageWrites,[]);f.close();compositionCases++;
}
// Authority-shape checks run through their real consumer, checkRecoveryRead;
// they do not claim this readonly transport port validates ordinary GETs.
for(const invalid of ['scope','permissions','permission-type','view-denied','edit-denied','pending','revision']){
 const f=bomPollFixture({workspace:true,allow:true}),result=bomReadResult(),before=f.api.state().control;if(invalid==='scope')delete result.control.workflow.scope;if(invalid==='permissions')delete result.permissions;if(invalid==='permission-type')delete result.permissions.save;if(invalid==='view-denied')result.permissions.view=false;if(invalid==='edit-denied')result.permissions.edit=false;if(invalid==='pending')result.control.workflow.pendingId='pending-case';if(invalid==='revision')result.revision=9;
 assert.throws(()=>f.api.checkRecoveryRead(result),/AUTHORITATIVE_READBACK_REQUIRED|FORBIDDEN|PENDING_LOCKED|DRAFT_REVISION_CHANGED_RECONFIRM/);assert.equal(f.api.state().control,before);assert.deepEqual(f.reads,[]);assert.equal(f.paints.length,0);f.close();compositionCases++;
}
{
 const f=bomPollFixture({workspace:true,allow:true});f.handler(()=>({...bomReadResult(),permissions:{...bomPermissions(),view:false,edit:false}}));await f.api.read();await f.api.session().ready;assert.equal(f.client.permission('view'),false);assert.equal(f.api.session().status().ready,false);assert.equal(f.api.session().discover().code,'VIEW_PERMISSION_REQUIRED');assert.equal(f.heldLocks.size,0);f.close();compositionCases++;
}
console.log(JSON.stringify({status:'PASS_MASTER_REVIEW_FOREGROUND_COMPOSITION',cases:compositionCases,actualMasterCallers:true,actualBOMClosure:true,actualForegroundScheduler:true,actualRecoveryHelperAndSession:true,syntheticDependencies:true,network:false,browser:false,limits:'No primary transport/server authorization or browser acceptance; readonly transport ports reflect response grants, record read kinds and reject any command. Authority-shape negatives exercise checkRecoveryRead, not ordinary read().'}));
