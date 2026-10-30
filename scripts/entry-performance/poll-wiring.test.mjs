import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {fixture} from './foreground-poll.test.mjs';import ts from 'typescript';
const actualVariable=(source,name)=>{const ast=ts.createSourceFile('ipqc-c.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];const walk=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found.push(node);ts.forEachChild(node,walk);};walk(ast);assert.equal(found.length,1,'unique actual C closure '+name);return 'const '+found[0].getText(ast)+';';};
const cases=[['fqc-master.js','function pollShared()','  const ui =','pollShared'],['routine-equipment.js','function pollShared()','  const unitLabels','pollShared'],['master-data.js','function pollMaster()','  pollMaster();','pollMaster'],['iqc-master.js','function scheduleRefresh()','  function twoConfirm','scheduleRefresh'],['ipqc-ab.js','function scheduleRefresh()','  function photoButtons','scheduleRefresh'],['ipqc-c.js','function scheduleSharedRefresh()','  function pendingCount','scheduleSharedRefresh'],['bom-workspace.js',' async function pollTick()',' foregroundPoll.schedule(pollTick);','pollTick'],['tooling.js',' async function poll(){'," document.addEventListener('focusout'",'poll']];
let count=0;
for(const [file,start,end,name]of cases){const path='public/process/'+file;assert.ok(fs.existsSync(path),file+' required shipped module');const source=fs.readFileSync(path,'utf8'),a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,file);let fragment=source.slice(a,b);if(file==='tooling.js')fragment+='\nasync function pollTick(){try{await poll();}finally{foregroundPoll.schedule(pollTick);}}';
 for(const mode of (['bom-workspace.js','tooling.js'].includes(file)?['allowed','denied']:['allowed','denied','cancel-inflight'])){const denied=mode==='denied',f=fixture(),scheduler=f.create();let reads=0,paints=0,delivery=1,release;const admissions=[];const pending=mode==='cancel-inflight'?new Promise(r=>release=r):Promise.resolve();const performRead=async(_token,options)=>{reads++;if(file==='iqc-master.js')admissions.push({current:options?.isCurrent?.(),accepted:options?.requireAcceptedAccess});await pending;return{unchanged:mode!=='cancel-inflight',control:{},permissions:{history:true}};};const node={isConnected:true,dataset:{activeTab:file==='ipqc-ab.js'?'quality-ipqc-ab':file==='ipqc-c.js'?'quality-ipqc-c':'quality-mold-equipment'},contains:()=>false,querySelector:()=>null};
 const client={canPoll:()=>!denied,hasUnknown:()=>false,read:performRead};f.window.ProcessSync={identity:{id:'owner'},captureDelivery:()=>delivery,isCurrentDelivery:d=>d===delivery};f.document.querySelector=s=>s==='.master-organized,.process-master-version'||s==='.bw-workspace,#master-unified-review'||s==='.bw-workspace'?node:null;f.document.activeElement=null;
 const context={window:f.window,document:f.document,sharedPoll:scheduler,pollTimer:scheduler,foregroundPoll:scheduler,actor:()=>f.window.ProcessSync.identity,accessBlocked:null,revision:null,loadGeneration:0,workspaceReady:()=>true,currentReadOwner:()=>()=>true,ui:{saving:false,busy:false},transport:()=>client,sharedTransport:()=>client,library:()=>({workflow:null}),control:{workflow:null},busy:false,root:node,reviewRoot:null,host:node,reviewHost:null,identity:()=>f.window.ProcessSync.identity,loadSequence:0,mutationSequence:0,mountSequence:1,caseHistory:null,readBeginRecovery:()=>null,routineTabIsActive:()=>true,readIntent:0,deliveryGeneration:1,ownsDelivery:g=>g===1,sharedLoaded:new Set(['AB']),state:{view:'data',masterScope:'AB'},shared:{busy:()=>false,client:()=>client,load:performRead},applyActive:()=>{paints++;},render:()=>{paints++;},draw:()=>{paints++;},paint:()=>{paints++;},renderReview:()=>{paints++;},flushChecks(){},beginRecovery:null,client,polling:false,dialog:null,viewEpoch:1,readEpoch:1,flow:()=>null,runSequence:1,loading:false,pending:[],batch:null,edit:null,read:async()=>{reads++;return{unchanged:true};},key:()=> 'A:G',scope:()=>({workflow:null}),errorText:e=>e.message,displayDraftError:e=>e.message,t:(a,_b)=>a,showEquipmentReadRecovery:e=>{throw e;}};
 const closure=file==='ipqc-c.js'?['readErrorOwners','isReadSuperseded','saveInputNoticePending'].map(name=>actualVariable(source,name)).join('\n')+'\n':'';if(file==='ipqc-c.js')context.saveInputNotice=null;
 let boot;if(file==='bom-workspace.js'||file==='tooling.js')boot=fragment+'\nforegroundPoll.schedule(pollTick);';else boot=fragment+'\n'+name+'();';vm.runInNewContext(closure+boot,context);
 if(mode==='cancel-inflight'){await f.tick(30000);assert.equal(reads,1,file+' pending');if(file==='iqc-master.js')assert.deepEqual(admissions,[{current:true,accepted:true}],'IQC current transport admission');scheduler.cancel();let newer=0;scheduler.schedule(async()=>newer++);release();await f.tick(30000);assert.equal(reads,1,file+' old poll not revived');assert.equal(newer,1,file+' new schedule not replaced');assert.equal(paints,0,file+' canceled response not painted');assert.equal(f.timers,0,file+' canceled old finally did not rearm');assert.deepEqual(f.errors,[]);count++;console.log('PASS '+file+' cancel inflight keeps new owner');continue;}
 f.focus(false);await f.tick(60000);assert.equal(reads,0,file+' background');f.focus(true);f.visible(true);await f.tick(0);assert.equal(reads,denied?0:1,file+' resume');if(file==='iqc-master.js')assert.deepEqual(admissions,denied?[]:[{current:true,accepted:true}],'IQC stable owner actually admits the read');await f.tick(29999);assert.equal(reads,denied?0:1,file+' idle');await f.tick(1);assert.equal(reads,denied?0:2,file+' interval');assert.equal(paints,0,file+' unchanged preserves DOM');assert.deepEqual(f.errors,[],file+' callback no synthetic errors');scheduler.cancel();delivery++;await f.tick(60000);assert.equal(reads,denied?0:2,file+' canceled');count++;console.log('PASS '+file+' actual poll callback '+(denied?'denied':'allowed'));}
}
assert.equal(count,22,'all eight module callback contracts must run');
console.log(JSON.stringify({status:'PASS',moduleCases:count,actualExtractedCallbacks:true,syntheticDependencies:true,virtualClock:true,browser:false,network:false}));

// Focused IQC binding evidence complements the separate 24-case actual
// post/load/hydration suite; it does not replace those transaction contracts.
const iqcSource=fs.readFileSync('public/process/iqc-master.js','utf8');
const iqcStart=iqcSource.indexOf('function scheduleRefresh()'),iqcEnd=iqcSource.indexOf('  function twoConfirm',iqcStart);
assert(iqcStart>=0&&iqcEnd>iqcStart);const iqcPoll=iqcSource.slice(iqcStart,iqcEnd);
let iqcCases=0;
for(const missing of ['loadSequence','mutationSequence']){
 const f=fixture(),scheduler=f.create(),owner={id:'owner'},node={isConnected:true};let reads=0;
 f.window.ProcessSync={identity:owner,captureDelivery:()=>1,isCurrentDelivery:value=>value===1};
 const ports={window:f.window,document:f.document,pollTimer:scheduler,root:node,reviewRoot:null,identity:()=>owner,loadSequence:0,mutationSequence:0,control:{workflow:null},revision:10,ui:{busy:false},transport:()=>({canPoll:()=>true,read:async()=>{reads++;return{unchanged:true};}})};
 delete ports[missing];vm.runInNewContext(iqcPoll+'\nscheduleRefresh();',ports);await f.tick(30000);
 assert.equal(reads,0);assert.equal(f.errors.length,1);assert.equal(f.errors[0].name,'ReferenceError');assert.match(f.errors[0].message,new RegExp(missing+' is not defined'));assert.equal(f.timers,0,'missing setup port cannot be reported as a successful idle poll');iqcCases++;
 console.log('PASS IQC missing '+missing+' exposes the exact scheduler error before transport');
}
function iqcBindingFixture(unstableIdentity=false){
 const f=fixture(),requests=[],admissions=[];let paints=0,epoch=1;
 f.window.ProcessSync={identity:{id:'owner'},identityGeneration:()=>epoch,captureDelivery:()=>epoch,isCurrentDelivery:owner=>owner===epoch};
 if(unstableIdentity)Object.defineProperty(f.window.ProcessSync,'identity',{get:()=>({id:'owner'})});
 f.document.documentElement={lang:'zh'};f.document.querySelector=()=>null;f.document.querySelectorAll=()=>[];
 const node={isConnected:true,contains:()=>false,querySelector:()=>null};
 const client={canPoll:()=>true,read:(_token,options)=>{admissions.push({current:options.isCurrent(),accepted:options.requireAcceptedAccess});return new Promise(resolve=>requests.push({options,resolve}));}};
 f.window.createSharedDraftClient=()=>client;
 const context={window:f.window,document:f.document,console,__paint:()=>{paints++;}};
 assert.equal(iqcSource.split('})(window);').length,2,'unique full IQC closure hook');
 const hook=`render=()=>__paint();host.__iqcBinding={seed(node,data){root=node;control=data.control;revision=data.revision;},schedule:scheduleRefresh,timer:pollTimer,state:()=>({control,revision}),transition(kind){if(kind==='load')loadSequence++;if(kind==='mutation'){ui.busy=true;mutationSequence++;ui.busy=false;}}};`;
 vm.runInNewContext(iqcSource.replace('})(window);',hook+'})(window);'),context);
 const api=f.window.__iqcBinding;api.seed(node,{revision:10,control:{versions:[],workflow:null}});api.schedule();
 return Object.assign(f,{api,requests,admissions,paints:()=>paints,actor(){f.window.ProcessSync.identity={id:'next-owner'};},epoch(){epoch++;}});
}
const iqcReply=revision=>({revision,permissions:{view:true,edit:true,save:true,submit:false,withdraw:false,approve:false,return:false,history:true,delete:false},control:{schemaVersion:1,versions:[],issues:[],reservedErrorCodes:[],reservedCheckNos:[]}});
{
 const f=iqcBindingFixture(true);await f.tick(30000);assert.equal(f.requests.length,1);assert.deepEqual(f.admissions,[{current:false,accepted:true}],'unstable identity breaks real isCurrent even if unchanged read-count tests look successful');assert.equal(f.requests[0].options.isCurrent(),false);f.requests[0].resolve({unchanged:true});await f.tick(0);assert.equal(f.api.state().revision,10);assert.equal(f.paints(),0);assert.deepEqual(f.errors,[]);f.api.timer.cancel();iqcCases++;
 console.log('PASS IQC unstable identity is rejected by actual owner admission, not mistaken for stable success');
}
{
 const f=iqcBindingFixture();await f.tick(30000);assert.equal(f.requests.length,1);assert.deepEqual(f.admissions,[{current:true,accepted:true}]);const body=iqcReply(11);f.requests[0].resolve(body);await f.tick(0);assert.equal(f.api.state().control,body.control);assert.equal(f.api.state().revision,11);assert.equal(f.paints(),1,'real validation/adoption path renders once, not a vacuous unchanged pass');assert.equal(f.timers,1);assert.deepEqual(f.errors,[]);f.api.timer.cancel();iqcCases++;
 console.log('PASS IQC stable identity validates and adopts one full payload and renders once');
}
for(const kind of ['load','mutation','actor','epoch']){
 const f=iqcBindingFixture();await f.tick(30000);assert.equal(f.requests.length,1);assert.deepEqual(f.admissions,[{current:true,accepted:true}]);const before=f.api.state().control;
 if(kind==='actor')f.actor();else if(kind==='epoch')f.epoch();else f.api.transition(kind);
 assert.equal(f.requests[0].options.isCurrent(),false);f.requests[0].resolve(iqcReply(11));await f.tick(0);assert.equal(f.api.state().control,before);assert.equal(f.api.state().revision,10);assert.equal(f.paints(),0);assert.deepEqual(f.errors,[]);
 if(kind==='epoch'){assert.equal(f.timers,0,'invalid delivery cannot rearm old owner');f.api.schedule();}
 else assert.equal(f.timers,1,'valid scheduler survives superseded model');
 await f.tick(30000);assert.equal(f.requests.length,2,'a fresh poll still runs after stale reply');assert.deepEqual(f.admissions[1],{current:true,accepted:true});f.requests[1].resolve(iqcReply(12));await f.tick(0);assert.equal(f.api.state().revision,12);assert.equal(f.paints(),1);assert.deepEqual(f.errors,[]);f.api.timer.cancel();iqcCases++;console.log('PASS IQC '+kind+' stale full reply discarded, fresh poll adopts');
}
assert.equal(iqcCases,8);console.log(JSON.stringify({status:'PASS_IQC_BINDING_PORTS',cases:iqcCases,actualIqcClosure:true,actualScheduler:true,syntheticTransportAndRender:true,scope:'Owner transitions are explicit synthetic ports; transaction/post/hydration acceptance remains in the separate IQC ownership suite.'}));
