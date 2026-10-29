import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import {createFeedbackPositioner} from '../public/process/web-feedback-layout.mjs';
import {feedbackDOM} from './helpers/feedback-dom.mjs';
import {destinationPlan} from '../lib/destination-delivery.mjs';import {deliveryCandidate} from '../public/process/delivery-purpose.mjs';import {loginIntent} from '../lib/login-destination.mjs';
const read=name=>fs.readFileSync('public/process/'+name,'utf8'),tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture({enabled=true,boot=false,tab=null,autoScripts=true}={}){
 const dom=feedbackDOM(),{document,Node}=dom,shell=new Node('div');shell.className='app-shell';document.body.append(shell);const tabs=new Node('div');tabs.className='master-tabs';shell.append(tabs);const users=new Node('button');users.setAttribute('data-tab','users');tabs.append(users);const content=new Node('div');content.id='data-content';shell.append(content);
 if(boot)document.documentElement.setAttribute('data-process-boot','');
 let generation=1,epoch=1;const calls=[],requests=[],writes=new Map(),frames=[];
 const sync={deliveryProjection:true,requiresReload:false,features:{webFeedback:enabled},identity:{id:'A',role:'admin'},identityGeneration:()=>epoch,destination:{view:tab?'data':'dashboard',dataTab:tab,system:'process'},captureDelivery:()=>({id:sync.identity?.id,epoch,generation}),isCurrentDelivery:owner=>!sync.requiresReload&&owner.id===sync.identity?.id&&owner.epoch===epoch&&owner.generation===generation,clearIdentity(){epoch++;sync.requiresReload=true;window.dispatchEvent({type:'process-delivery-invalidated'});sync.identity=null;}};
 const window=dom.events({ProcessSync:sync,ProcessDeliveryNavigation:{ownsHistory:true,navigate:(...args)=>{calls.push(['navigate',...args]);return true;}},innerWidth:1180,innerHeight:757,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){}});
 const history={state:{processNavigationIndex:3},pushState(){calls.push(['unindexed-push']);}},location={href:'https://fixture.invalid/process/index.html?system=process&view='+(tab?'data&dataTab='+tab:'dashboard'),origin:'https://fixture.invalid'};
 const observer=class{observe(){}disconnect(){calls.push(['disconnect']);}};
 const context=vm.createContext({window,document,history,location,state:{view:tab?'data':'dashboard',dataTab:tab},console,URL,URLSearchParams,AbortController,Promise,Map,WeakSet,structuredClone,crypto:webcrypto,Blob,performance:{now:()=>10,timeOrigin:100},innerHeight:757,innerWidth:1180,requestAnimationFrame:window.requestAnimationFrame,MutationObserver:observer,PerformanceObserver:observer,ResizeObserver:observer,queueMicrotask,setTimeout,clearTimeout,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},fetch:(url,options)=>{const pending=deferred();requests.push({url,options,...pending});return pending.promise;}});
 const coreCode=read('web-feedback.js').replace(' window.WebFeedback={open,admin,identityChanged,routeChanged};',`window.__core={setup(value){actor='A';draft=value;reportPhase='ready';panel=document.createElement('section');panel.id='wf-panel';document.body.append(panel);storage=window.__storage;draw();},setupBoard(){board=document.createElement('div');document.body.append(board);board.innerHTML='<div role="status"></div><button data-export></button><input data-pick="fixture" type="checkbox">';selected.add('fixture');},state:()=>({draft,actor,retained,exportOperation,persisting,busy,board,composing,storageFailed,epoch,reportPhase}),waitWrites(promise){persistChain=promise;},hold(value){busy=value.busy||false;composing=value.composing||false;},submit,exportZip,guard,request,draw,routeChanged,persist,selectLocation,showImage};\n window.WebFeedback={open,admin,identityChanged,routeChanged};`);
 window.__storage=async(mode,key,value)=>{if(mode==='readwrite')writes.set(key,structuredClone(value));return structuredClone(writes.get(key));};
 const run=name=>vm.runInContext(name==='web-feedback.js'?coreCode:read(name).replace("import('./web-feedback-layout.mjs?v=20261029-feedback2')","Promise.resolve({createFeedbackPositioner:()=>({update(){},dispose(){},isReservedTarget(){return false;}})})"),context,{filename:name});
 document.head.onappend=node=>{calls.push(['asset',node.src||node.href]);if(autoScripts)queueMicrotask(()=>{if(node.tagName==='SCRIPT'){run(node.src.includes('loader')?'web-feedback-loader.js':'web-feedback.js');}node.onload?.();});};
 function invalidate(mode='event'){if(mode==='delivery'){generation++;return;}if(mode==='epoch'){epoch++;return;}sync.requiresReload=true;window.dispatchEvent({type:'process-delivery-invalidated'});if(mode==='actor')sync.identity={id:'B',role:'admin'};}
 return{...dom,window,sync,context,content,calls,requests,writes,frames,run,invalidate,location};
}
const sample=(images=[])=>({start:{view:'dashboard',tab:'',system:'process',display:'Synthetic'},markers:[{id:'m1',description:'中文 Việt',location:{view:'dashboard',tab:'',system:'process'},images}],pending:null});
const reply=(request,value,status=200)=>request.resolve({ok:status>=200&&status<300,status,json:async()=>value});

void test('late cached entry initializes authenticated helper after UI-ready was already dispatched',async()=>{
 const f=fixture();f.window.dispatchEvent({type:'process-ui-ready'});f.run('web-feedback-entry.js');await tick();assert(f.document.querySelector('#wf-launcher'));assert.equal(f.requests.length,0);assert.equal(f.calls.filter(c=>String(c[1]).includes('web-feedback-loader')).length,1);
});

void test('feedback explicit and fallback admission is opt-in, view-authorized and identity-only; login preserves intent',async()=>{
 const query='?view=data&dataTab=web-feedback';assert.equal(deliveryCandidate(query).module,'feedback');
 for(const value of [false,undefined,'true',1])await assert.rejects(destinationPlan(query,()=>true,[],{webFeedback:value}),/DESTINATION_UNAVAILABLE/);
 await assert.rejects(destinationPlan(query,()=>false,[],{webFeedback:true}),/DESTINATION_FORBIDDEN/);
 const plan=await destinationPlan(query,p=>p==='feedback.view',[],{webFeedback:true});assert.deepEqual(plan.deliveryKeys,[]);assert.deepEqual(plan.catalog.scopes,[]);assert(!plan.keys.includes('masterDataControl'));assert(!plan.keys.includes('users'));
 await assert.rejects(destinationPlan('',p=>p==='feedback.view'),/DESTINATION_FORBIDDEN/);assert.equal((await destinationPlan('',p=>p==='feedback.view',[],{webFeedback:true})).destination.module,'feedback');
 assert.equal(loginIntent(query).get('dataTab'),'web-feedback');
});

void test('ordinary UI-ready loads no disabled helper and enabled host only, never core/private records',async()=>{
 for(const enabled of [false,true]){const f=fixture({enabled});f.run('web-feedback-entry.js');assert.equal(f.calls.length,0);f.window.dispatchEvent({type:'process-ui-ready'});await tick();assert.equal(f.requests.length,0);assert.equal(f.writes.size,0);assert.equal(f.calls.filter(c=>c[0]==='asset').length,enabled?1:0);assert.equal(!!f.window.WebFeedback, false);if(enabled){assert(f.document.querySelector('#wf-launcher'));assert(f.document.querySelector('#wf-admin-tab'));}}
});

void test('cold feedback destination is non-circular and readiness waits for actual list; adapter is deduplicated',async()=>{
 const f=fixture({boot:true,tab:'web-feedback'});f.run('web-feedback-entry.js');f.content.dataset.activeTab='web-feedback';f.window.ProcessFeedbackEntry.mount(f.content);await tick();assert.equal(f.calls.length,0);
 f.document.documentElement.removeAttribute('data-process-boot');let ready=false;const task=f.window.ProcessFeedbackEntry.readyForDestination().then(()=>ready=true);await tick();assert.equal(ready,false);assert.equal(f.requests.length,1);assert.match(f.requests[0].url,/action=list/);assert.equal(f.writes.size,0);
 reply(f.requests[0],{issues:[],admin:true,permissions:{view:true,edit:true,exchange:true}});await task;assert.equal(ready,true);assert(f.content.querySelector('[data-board-tab]'));
 f.run('web-feedback-loader.js');f.window.dispatchEvent({type:'process-ui-ready'});await tick();assert.equal(f.calls.filter(c=>String(c[1]).includes('web-feedback-loader')).length,1);assert.equal(f.requests.length,1);
});

void test('management entry uses coordinator, never a direct unindexed push',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');const tab=f.document.querySelector('#wf-admin-tab');tab.dispatchEvent({type:'click',preventDefault(){},stopImmediatePropagation(){}});assert.deepEqual(f.calls.find(c=>c[0]==='navigate'),['navigate','data','web-feedback','process']);assert(!f.calls.some(c=>c[0]==='unindexed-push'));
});

void test('cold board overlaps list with assets and does not render until both finish',async()=>{
 const f=fixture({boot:true,tab:'web-feedback',autoScripts:false});f.run('web-feedback-loader.js');
 const task=f.window.WebFeedbackHost.showAdmin(f.content);
 assert.equal(f.requests.length,1);assert.equal(f.window.WebFeedback,undefined);
 reply(f.requests[0],{issues:[],admin:true,permissions:{view:true}});await tick();
 assert.equal(f.content.querySelector('[data-board-tab]'),null);
 f.run('web-feedback.js');f.document.head.querySelector('script').onload();
 await tick();assert.equal(f.content.querySelector('[data-board-tab]'),null);
 f.document.head.querySelector('link').onload();await task;
 assert(f.content.querySelector('[data-board-tab]'));assert.equal(f.requests.length,1);
});

for(const mode of ['actor','epoch','delivery'])void test('parallel first list cannot publish after '+mode+' changes during asset loading',async()=>{
 const f=fixture({boot:true,tab:'web-feedback',autoScripts:false});f.run('web-feedback-loader.js');
 const task=f.window.WebFeedbackHost.showAdmin(f.content);
 reply(f.requests[0],{issues:[],admin:true,permissions:{view:true}});await tick();f.invalidate(mode);
 const outcome=mode==='actor'?assert.rejects(task,/回報功能暫時無法載入/):task;
 const script=f.document.head.querySelector('script'),style=f.document.head.querySelector('link');
 f.run('web-feedback.js');script.onload();style.onload();await outcome;
 assert.equal(f.content.querySelector('[data-board-tab]'),null);assert.equal(f.requests.length,1);assert.equal(f.writes.size,0);
});

void test('parallel list failure is observed and retry performs a fresh authorized read',async()=>{
 const f=fixture({boot:true,tab:'web-feedback',autoScripts:false});f.run('web-feedback-loader.js');
 const task=f.window.WebFeedbackHost.showAdmin(f.content);const rejected=assert.rejects(task,/DENIED/);
 reply(f.requests[0],{error:'DENIED'},403);await tick();
 f.run('web-feedback.js');f.document.head.querySelector('script').onload();f.document.head.querySelector('link').onload();await rejected;
 assert.equal(f.content.querySelector('[data-board-tab]'),null);
 const retry=f.window.WebFeedbackHost.showAdmin(f.content);assert.equal(f.requests.length,2);
 reply(f.requests[1],{issues:[],admin:false,permissions:{view:true}});await retry;
 assert(f.content.querySelector('[data-board-tab]'));assert.equal(f.writes.size,0);
});

for(const mode of ['event','actor','epoch','delivery'])void test('retained actual helper handlers are inert after '+mode,async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());const input=f.document.querySelector('#wf-panel textarea'),submit=f.document.querySelector('[data-submit]').onclick,oninput=input.oninput;
 f.invalidate(mode);await submit({});input.value='late';oninput({target:input});await tick();assert.equal(f.requests.length,0);assert.equal(f.writes.size,0);if(mode==='event'||mode==='actor'){assert.equal(f.document.querySelector('#wf-panel'),null);assert.equal(f.window.__core.state().retained[0].draft.markers[0].description,'中文 Việt');}
});

void test('pending persistence settles under original key but invalidation prevents first POST',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');const pending=deferred();f.window.__storage=async(mode,key,value)=>{await pending.promise;f.writes.set(key,structuredClone(value));};f.window.__core.setup(sample());const task=f.window.__core.submit();await tick();f.invalidate('actor');pending.resolve();await task;assert.equal(f.requests.length,0);assert.equal([...f.writes.keys()][0],'https://fixture.invalid|feedback-v1|A');assert(f.writes.values().next().value.pending.operationId);assert.equal(f.window.__core.state().retained[0].draft.pending.operationId,f.writes.values().next().value.pending.operationId);
});

for(const stage of ['upload','submit'])void test('late '+stage+' ACK cannot clear or retarget original pending receipt',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');const data=sample(stage==='upload'?[{id:'image',name:'synthetic.png',blob:new Blob(['synthetic'],{type:'image/png'})}]:[]);f.window.__core.setup(data);const task=f.window.__core.submit();await tick();assert.equal(f.requests.length,1);const before=structuredClone([...f.writes.values()][0]);f.invalidate('actor');reply(f.requests[0],stage==='upload'?{id:'uploaded'}:{ids:['case']});await task;assert.equal(f.requests.length,1);assert.deepEqual([...f.writes.values()][0],before);assert(f.window.__core.state().retained[0].draft.pending);
});

void test('unknown export retries frozen selection; invalidation retains that in private terminal memory',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setupBoard();const task=f.window.__core.exportZip();assert.equal(f.requests.length,1);const body=f.requests[0].options.body;f.requests[0].reject(Error('synthetic uncertain'));await task;assert.equal(f.window.WebFeedback.navigation.canLeave(),false);assert.equal(f.window.__core.state().board.querySelector('[data-pick]').disabled,true);
 const retry=f.window.__core.exportZip();assert.equal(f.requests[1].options.body,body);f.invalidate('actor');reply(f.requests[1],{id:'handoff'});await retry;assert.equal(JSON.stringify(f.window.__core.state().retained.at(-1).exportOperation),body);assert.equal(f.requests.length,2);
});

void test('403 retains current verified draft; 401 invalidates synchronously without deleting its pending bytes',async()=>{
 for(const status of [403,401]){const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());const task=f.window.__core.submit();await tick();reply(f.requests[0],{error:'DENIED'},status);await task;const saved=[...f.writes.values()][0];assert(saved.pending);assert.equal(f.sync.requiresReload,status===401);if(status===403)assert(f.document.querySelector('#wf-panel'));else assert.equal(f.document.querySelector('#wf-panel'),null);}
});

void test('normal navigation preserves nonempty persisted draft; composing input node is not replaced',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());const before=f.window.__core.state().draft;await f.window.__core.persist();assert.equal(f.window.WebFeedback.navigation.canLeave(),true);f.window.WebFeedback.navigation.reset();assert.equal(f.window.__core.state().draft,before);
 const input=f.document.querySelector('#wf-panel textarea');input.oncompositionstart({});input.value='完成 tiếng Việt';input.oninput({target:input});f.window.__core.draw();assert.equal(f.document.querySelector('#wf-panel textarea'),input);assert.equal(f.window.WebFeedback.navigation.canLeave(),false);input.oncompositionend({});await tick();assert.equal(f.window.__core.state().draft.markers[0].description,'完成 tiếng Việt');assert.equal(f.window.WebFeedback.navigation.canLeave(),true);
});

void test('actual location selector never intercepts platform composedPath or retargeted host',()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());const host=new f.Node('div'),root=new f.Node('shadow'),button=new f.Node('button'),link=new f.Node('a');host.shadowRoot=root;root.mode='open';root.host=host;button.setAttribute('aria-label','Edit site');link.textContent='Edit site in ChatGPT';link.href='https://chatgpt.com/';root.append(button,link);f.document.body.append(host);
 const positioner=createFeedbackPositioner({window:f.window,document:f.document});f.window.WebFeedbackHost.isReservedTarget=positioner.isReservedTarget;f.window.WebFeedbackHost.canSelectLocation=()=>true;f.window.__core.selectLocation();
 for(const type of ['pointerdown','mousedown','pointerup','mouseup','dblclick','click','pointermove']){let prevented=0,stopped=0;f.document.dispatchEvent({type,target:host,composedPath:()=>[button,root,host,f.document.body],preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}});assert.equal(prevented,0,type);assert.equal(stopped,0,type);}
 assert.equal(f.writes.size,0);positioner.dispose();
});

void test('actual master select/bind dispatches feedback without AB hydration and awaits gateway readiness',async()=>{
 const f=fixture({boot:true,tab:'web-feedback'});f.run('web-feedback-entry.js');const text=read('master-data.js'),part=(a,b)=>text.slice(text.indexOf(a),text.indexOf(b));
 Object.assign(f.context,{dataReady:Promise.resolve(),dataError:null,approvalReady:Promise.resolve(),bindTabButtons(){},masterView(){throw Error('AB hydration is forbidden for feedback destination');}});
 vm.runInContext(part('  function selectDataTab(', '  function bindTabButtons(')+part('  window.ProcessDataTabs=', "  window.addEventListener('popstate',()=>{"),f.context);
 vm.runInContext('bindData()',f.context);assert.equal(f.content.dataset.activeTab,'web-feedback');assert.equal(f.requests.length,0);f.document.documentElement.removeAttribute('data-process-boot');const task=f.window.ProcessDataTabs.readyForDestination();await tick();assert.equal(f.requests.length,1);reply(f.requests[0],{issues:[],admin:false,permissions:{view:true}});await task;assert(f.content.querySelector('[data-board-tab]'));
});

void test('late capability response after same-ID delivery or epoch never opens private storage',async()=>{
 for(const mode of ['delivery','epoch','event']){const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');let privateReads=0;f.context.indexedDB={open(){privateReads++;throw Error('Private storage must stay closed');}};f.document.querySelector('#wf-launcher').onclick({timeStamp:10});await tick();assert.equal(f.requests.length,1);f.invalidate(mode);reply(f.requests[0],{enabled:true,account:'A'});await tick();assert.equal(privateReads,0);assert.equal(f.writes.size,0);}
});

void test('feature availability turning off disposes helper without adding a global navigation ACL',async()=>{
 const f=fixture();f.run('web-feedback-entry.js');f.run('web-feedback-loader.js');f.sync.features.webFeedback=false;f.window.WebFeedbackHost.refresh();assert.equal(f.document.querySelector('#wf-launcher'),null);assert.equal(f.window.ProcessFeedbackEntry.navigation.canLeave(),true);f.sync.features.webFeedback=true;await assert.rejects(f.window.ProcessFeedbackEntry.ensure(),/FEEDBACK_RELOAD_REQUIRED/);
});

void test('actual local opt-in middleware still injects one host alongside the registration gateway',async()=>{
 const {localFeaturesPlugin}=await import('../lib/local-features.mjs');let middleware,registrations=0;localFeaturesPlugin(process.cwd(),{webFeedback:false}).configureServer({middlewares:{use(){registrations++;}}});assert.equal(registrations,0);localFeaturesPlugin(process.cwd(),{webFeedback:true}).configureServer({middlewares:{use(fn){middleware=fn;registrations++;}}});let html;middleware({method:'GET',url:'/process/index.html?view=data&dataTab=web-feedback'},{setHeader(){},end(value){html=value;}},()=>assert.fail('eligible local SPA not handled'));assert.equal(registrations,1);assert.equal((html.match(/web-feedback-loader\.js/g)||[]).length,1);assert.equal((html.match(/web-feedback-entry\.js/g)||[]).length,1);
});

void test('review A: invalidation while waiting prior persistence prevents a new private read',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');const waiting=deferred();f.window.__core.waitWrites(waiting.promise);let reads=0;f.context.indexedDB={open(){reads++;throw Error('must not open private storage');}};
 f.document.querySelector('#wf-launcher').onclick({timeStamp:10});reply(f.requests[0],{enabled:true,account:'A'});await tick();assert.equal(reads,0);f.invalidate('actor');waiting.resolve();await tick();assert.equal(reads,0);assert.equal(f.writes.size,0);
});

void test('review A: pending database open cannot start a readonly transaction after owner invalidation',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');let request,transactions=0;f.context.indexedDB={open(){request={result:{transaction(){transactions++;throw Error('stale transaction');}}};return request;}};
 f.document.querySelector('#wf-launcher').onclick({timeStamp:10});reply(f.requests[0],{enabled:true,account:'A'});await tick();assert(request);f.invalidate('event');request.onsuccess();await tick();assert.equal(transactions,0);
});

void test('review B: failed persistence reopen verifies caps then preserves original memory and pending bytes',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');let reads=0;f.window.__storage=async mode=>{if(mode==='readonly'){reads++;return sample();}throw Error('synthetic quota');};const value=sample([{id:'blob',name:'synthetic.png',blob:new Blob(['saved-original'],{type:'image/png'})}]);value.pending={operationId:'same-operation',markers:structuredClone(value.markers)};f.window.__core.setup(value);await assert.rejects(f.window.__core.persist(),/quota/);await tick();assert.equal(f.window.__core.state().storageFailed,true);const priorEpoch=f.window.__core.state().epoch;let boardHandler=0;const retainedHandler=f.window.__core.guard(()=>boardHandler++);
 f.window.WebFeedback.close();f.document.querySelector('#wf-launcher').onclick({timeStamp:10});assert.equal(f.window.__core.state().draft,value);assert.equal(reads,0);reply(f.requests[0],{enabled:true,account:'A'});await tick();assert.equal(reads,0);assert.equal(f.window.__core.state().draft,value);assert.equal(value.pending.operationId,'same-operation');assert.equal(await value.markers[0].images[0].blob.text(),'saved-original');assert.equal(f.window.__core.state().storageFailed,true);assert.equal(f.window.__core.state().epoch,priorEpoch);retainedHandler();assert.equal(boardHandler,1);assert.equal(f.requests.length,1);
});

void test('review B: launcher cannot replace busy, persisting or composing report DOM',async()=>{
 for(const condition of ['busy','persisting','composing']){const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());let pending,task;if(condition==='persisting'){pending=deferred();f.window.__storage=()=>pending.promise;/* setup installs the actual dependency port */f.window.__core.setup(sample());task=f.window.__core.persist();}else f.window.__core.hold({[condition]:true});const panel=f.document.querySelector('#wf-panel'),input=panel.querySelector('textarea');f.document.querySelector('#wf-launcher').onclick({timeStamp:10});assert.equal(f.document.querySelector('#wf-panel'),panel);assert.equal(panel.querySelector('textarea'),input);assert.equal(f.requests.length,0);if(pending){pending.resolve();await task;}}
});

void test('review B: every board/viewer replacement entry preserves unsaved note and unknown export',async()=>{
 for(const critical of ['note','export']){const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());f.window.__core.setupBoard();const board=f.window.__core.state().board,viewer=new f.Node('section');viewer.id='wf-viewer';f.document.body.append(viewer);if(critical==='note'){const note=new f.Node('textarea');note.setAttribute('data-note','');note.value='private unsaved';board.append(note);}else{const task=f.window.__core.exportZip();f.requests[0].reject(Error('unknown export'));await task;}const count=f.requests.length,panel=f.document.querySelector('#wf-panel');assert.equal(panel.querySelector('[data-list]'),null);f.window.__core.showImage('synthetic');f.window.WebFeedback.close();await f.window.WebFeedback.admin(f.content,{id:'A'},true);f.document.querySelector('#wf-launcher').onclick({timeStamp:10});assert.equal(f.window.__core.state().board,board);assert.equal(f.document.querySelector('#wf-viewer'),viewer);assert.equal(panel.hidden,false);assert.equal(f.requests.length,count);if(critical==='note')assert.equal(board.querySelector('[data-note]').value,'private unsaved');else assert(f.window.__core.state().exportOperation);}
});

void test('review C: normal reset detaches only admitted empty unverified shell and cancels its late auth',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');let reads=0;f.context.indexedDB={open(){reads++;throw Error('cancelled shell');}};f.document.querySelector('#wf-launcher').onclick({timeStamp:10});const old=f.document.querySelector('#wf-panel');assert.equal(f.window.WebFeedbackHost.navigation.canLeave(),true);f.window.WebFeedbackHost.navigation.reset();assert.equal(old.isConnected,false);reply(f.requests[0],{enabled:true,account:'A'});await tick();assert.equal(reads,0);assert.equal(f.document.querySelector('#wf-panel'),null);
 f.document.querySelector('#wf-launcher').onclick({timeStamp:10});const next=f.document.querySelector('#wf-panel');next.querySelector('textarea').value='not yet saved';assert.equal(f.window.WebFeedbackHost.navigation.canLeave(),false);f.window.WebFeedbackHost.navigation.reset();assert.equal(next.isConnected,true);
});

void test('review D: locally injected cold feedback route initializes before readiness, with one list and no ui-ready teardown',async()=>{
 const f=fixture({boot:true,tab:'web-feedback'});f.run('web-feedback-loader.js');f.run('web-feedback-entry.js');f.content.dataset.activeTab='web-feedback';f.window.ProcessFeedbackEntry.mount(f.content);assert.equal(f.requests.length,0);f.document.documentElement.removeAttribute('data-process-boot');const ready=f.window.ProcessFeedbackEntry.readyForDestination();await tick();assert.equal(f.requests.length,1);reply(f.requests[0],{issues:[],admin:true,permissions:{view:true}});await ready;const board=f.content.querySelector('.wf-admin');assert(board);f.window.dispatchEvent({type:'process-ui-ready'});await tick();assert.equal(f.content.querySelector('.wf-admin'),board);assert.equal(f.requests.length,1);
});

void test('review E: layout not ready or failed never installs whole-page selection capture',()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');f.window.__core.setup(sample());const before=f.eventSets.size;assert.equal(f.window.WebFeedbackHost.canSelectLocation(),false);f.window.__core.selectLocation();assert.equal(f.eventSets.size,before);assert.equal(f.document.querySelector('#wf-panel .wf-body').hidden,false);
});


void test('review B: preverification shell composition cannot be replaced by another launcher click',()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.document.querySelector('#wf-launcher').onclick({timeStamp:10});const input=f.document.querySelector('#wf-panel textarea');input.oncompositionstart();input.value='正在組字 tiếng';f.document.querySelector('#wf-launcher').onclick({timeStamp:10});assert.equal(f.document.querySelector('#wf-panel textarea'),input);assert.equal(f.requests.length,1);assert.equal(input.value,'正在組字 tiếng');
});

void test('review F: retained memory never renders or acts during pending/failed reopen, including language refresh and old handlers',async()=>{
 for(const outcome of ['403','mismatch','network','success']){const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');const value=sample();f.window.__core.setup(value);const input=f.document.querySelector('#wf-panel textarea'),lateInput=input.oninput,lateSubmit=f.document.querySelector('[data-submit]').onclick,lateClose=f.document.querySelector('[data-close]').onclick;
 f.window.__core.showImage('synthetic',true);assert(f.document.querySelector('#wf-viewer'));f.document.querySelector('#wf-launcher').onclick({timeStamp:10});assert.equal(f.document.querySelector('#wf-viewer'),null);const shell=f.document.querySelector('#wf-panel'),shellInput=shell.querySelector('textarea');f.document.documentElement.lang='vi';f.window.WebFeedbackHost.refresh();f.window.__core.draw();await lateSubmit({});lateInput({target:{value:'stale edit'}});lateClose({});assert.equal(shell.querySelector('textarea'),shellInput);assert.equal(shellInput.value,'');assert.equal(shell.hidden,false);assert.equal(value.markers[0].description,'中文 Việt');assert.equal(f.writes.size,0);assert.equal(f.requests.length,1);
 if(outcome==='network')f.requests[0].reject(Error('synthetic failure'));else reply(f.requests[0],{enabled:true,account:outcome==='mismatch'?'B':'A'},outcome==='403'?403:200);await tick();f.document.documentElement.lang='zh';f.window.WebFeedbackHost.refresh();f.window.__core.draw();await lateSubmit({});lateInput({target:{value:'still stale'}});assert.equal(value.markers[0].description,'中文 Việt');assert.equal(f.requests.length,1);assert.equal(f.writes.size,0);assert.equal(f.window.__core.state().draft,value);assert.equal(f.window.__core.state().reportPhase,outcome==='success'?'ready':'blocked');assert.equal(shell.querySelector('textarea').value,outcome==='success'?'中文 Việt':'');}
});

void test('review G: every explicit pending retry must save the unchanged receipt before transport',async()=>{
 const f=fixture();f.run('web-feedback-loader.js');f.run('web-feedback.js');let fails=true,wait=null;f.window.__storage=async(mode,key,value)=>{if(mode==='readwrite'){if(fails)throw Error('quota');if(wait)await wait.promise;f.writes.set(key,structuredClone(value));}return structuredClone(f.writes.get(key));};const value=sample([{id:'image',name:'synthetic.png',blob:new Blob(['synthetic'],{type:'image/png'}),uploaded:'known-upload'}]);f.window.__core.setup(value);
 await f.window.__core.submit();const pendingRef=value.pending,frozen=structuredClone(value.pending);assert(frozen.operationId);assert.equal(f.requests.length,0);await f.window.__core.submit();assert.equal(value.pending,pendingRef);assert.deepEqual(structuredClone(value.pending),frozen);assert.equal(f.requests.length,0);
 fails=false;const recovered=f.window.__core.submit();await tick();assert.equal(f.requests.length,1);const body=JSON.parse(f.requests[0].options.body);assert.equal(body.operationId,frozen.operationId);assert.deepEqual(body.markers[0].attachments,['known-upload']);assert.equal([...f.writes.values()][0].pending.operationId,frozen.operationId);reply(f.requests[0],{error:'unknown'},503);await recovered;assert.equal(value.pending,pendingRef);assert.deepEqual(structuredClone(value.pending),frozen);
 wait=deferred();const last=f.window.__core.submit();await tick();f.invalidate('event');wait.resolve();await last;assert.equal(f.requests.length,1);assert.deepEqual([...f.writes.values()][0].pending,frozen);assert.equal([...f.writes.keys()][0],'https://fixture.invalid|feedback-v1|A');
});
