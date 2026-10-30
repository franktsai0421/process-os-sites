import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
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
function bomPollFixture({workspace=false,allow=false}={}){
 const f=foregroundFixture(),reads=[],paints=[],events=[],permissions=new Set(allow?['bom.view']:[]),paused=new Set();let unknown=false,readHandler=null,delivery=1;
 const node={isConnected:true,setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]};let dialog=false;
 f.document.documentElement={lang:'zh'};f.document.querySelector=selector=>selector==='.bw-workspace'?workspace?node:null:selector==='.bw-workspace,#master-unified-review'?node:selector==='dialog[open]'?dialog?node:null:null;
 f.document.querySelectorAll=()=>[];f.document.activeElement=null;
 const client={canPoll:kind=>!paused.has(kind),hasUnknown:()=>unknown,hasSyncFailures:()=>false,permission:()=>true,resolveUnknown:async()=>{reads.push('receipt');unknown=false;},read:async()=>{reads.push('state');return readHandler?readHandler():{revision:11,control:bomControl()};},reviewMetadata:async()=>{reads.push('review');return readHandler?readHandler():{revision:11,review:{versions:[],workflow:{pendingId:null},cases:[]}};},command(){throw Error('UNEXPECTED_POST');}};
 f.window.ProcessSync={identity:{id:'actor'},captureDelivery:()=>delivery,isCurrentDelivery:owner=>owner===delivery};f.window.hasPermission=key=>permissions.has(key);if(allow==='missing')delete f.window.hasPermission;f.window.createSharedDraftClient=()=>client;f.window.dispatchEvent=event=>{events.push(event.type);};
 const box={window:f.window,document:f.document,console,bindDataInner(){},bomTable(){},MutationObserver:class{observe(){}},CustomEvent:class{constructor(type){this.type=type;}},__paint:()=>paints.push('paint')};
 const hook=`paint=()=>__paint();window.__bomComposition={run,seed(value){transport();control=value;fullRevision=10;},state:()=>({control,editor,error,busy,polling}),set(kind){if(kind==='pending')pending.push({local:true});if(kind==='batch')batch={changes:[{local:true}]};if(kind==='edit')edit={rows:[]};if(kind==='busy')busy=true;if(kind==='loading')loading=true;},timer:foregroundPoll};`;
 assert.equal(bomSource.split('\n})();').length,2,'unique BOM closure hook');vm.runInNewContext(bomSource.replace('\n})();','\n'+hook+'\n})();'),box);const api=f.window.__bomComposition;api.seed(bomControl());
 return Object.assign(f,{api,reads,paints,events,paused,permissions,client,unknown:()=>{unknown=true;},handler:value=>{readHandler=value;},dialog:()=>{dialog=true;},rotate:()=>{delivery++;f.window.ProcessSync.identity={id:'new-actor'};}});
}
function bomControl(){return{activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:{bom:{}}},{id:'draft',status:'draft',snapshot:{bom:{}}}],workflow:{generation:'g',revision:1,working:{bom:{}},saved:null,pendingId:null,cases:[]}};}
for(const allow of [false,true,'missing']){
 const f=bomPollFixture({allow});f.focus(false);await f.tick(60000);assert.deepEqual(f.reads,[]);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,allow===true?['review']:[]);assert.equal(f.paints.length,0,'review metadata never hydrates or repaints editor');assert.equal(f.api.state().busy,false);assert.equal(f.timers,1,'a denied review gate retains its foreground scheduler');await f.tick(30000);assert.deepEqual(f.reads,allow===true?['review','review']:[]);assert.equal(f.timers,1);if(allow!==true){f.permissions.add('bom.view');f.window.hasPermission=key=>f.permissions.has(key);f.focus(false);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,['review'],'fresh foreground admission rechecks a newly available grant');}assert.deepEqual(f.errors,[]);f.api.timer.cancel();compositionCases++;
}
{
 const f=bomPollFixture({workspace:true,allow:false});await f.tick(30000);assert.deepEqual(f.reads,['state'],'workspace keeps its existing authorized-transport path; new gate is review-only');assert.equal(f.paints.length,1);assert.deepEqual(f.errors,[]);f.api.timer.cancel();compositionCases++;
}
for(const kind of ['pending','batch','edit','busy','loading','dialog','focused-input']){
 const f=bomPollFixture({workspace:true,allow:true});if(kind==='dialog')f.dialog();else if(kind==='focused-input')f.document.activeElement={matches:()=>true};else f.api.set(kind);await f.tick(60000);assert.deepEqual(f.reads,[],kind+' retains local work without an automatic read');assert.equal(f.paints.length,0);assert.deepEqual(f.errors,[]);f.api.timer.cancel();compositionCases++;
}
for(const kind of ['state','review','receipt']){
 const f=bomPollFixture({workspace:kind!=='review',allow:true});f.paused.add(kind);if(kind==='receipt')f.unknown();await f.tick(30000);f.focus(false);f.focus(true);await f.tick(0);assert.deepEqual(f.reads,[],kind+' pause survives foreground resume');assert.equal(f.paints.length,0);assert.deepEqual(f.errors,[]);f.api.timer.cancel();compositionCases++;
}
{
 const f=bomPollFixture({workspace:true,allow:true});f.unknown();await f.tick(30000);assert.deepEqual(f.reads,['receipt','state'],'receipt is resolved before reading, never a retry POST');assert.deepEqual(f.errors,[]);f.api.timer.cancel();compositionCases++;
}
for(const outcome of ['resolve','reject']){
 const f=bomPollFixture({workspace:true,allow:true}),old=deferred(),operation=deferred();f.handler(()=>old.promise);await f.tick(30000);assert.deepEqual(f.reads,['state']);const before=f.api.state().control,working=f.api.run(()=>operation.promise);assert.equal(f.api.state().busy,true);
 if(outcome==='resolve')old.resolve({revision:11,control:bomControl()});else old.reject(Error('old-poll-error'));await f.tick(0);assert.equal(f.api.state().control,before);assert.equal(f.api.state().error,'');assert.equal(f.api.state().busy,true);assert.equal(f.paints.length,0);assert.equal(f.api.state().polling,false);assert.deepEqual(f.errors,[]);operation.resolve();await working;assert.equal(f.api.state().busy,false);assert.equal(f.paints.length,1,'only the current operation completion paints');f.api.timer.cancel();compositionCases++;
}
console.log(JSON.stringify({status:'PASS_MASTER_REVIEW_FOREGROUND_COMPOSITION',cases:compositionCases,actualMasterCallers:true,actualBOMClosure:true,actualForegroundScheduler:true,syntheticDependencies:true,network:false,browser:false,limits:'No server authorization or browser acceptance; transport ports record read kinds and reject any command.'}));
