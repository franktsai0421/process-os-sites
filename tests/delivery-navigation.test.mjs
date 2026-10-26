import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import * as policy from '../public/process/delivery-purpose.mjs';import * as coordinator from '../public/process/navigation-lifecycle.mjs';
const source=fs.readFileSync('public/process/delivery-navigation.js','utf8').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};const turn=()=>new Promise(resolve=>setImmediate(resolve));
const masterSource=fs.readFileSync('public/process/master-data.js','utf8');
const masterHistory=masterSource.slice(masterSource.indexOf("  window.addEventListener('popstate',()=>{"),masterSource.indexOf('  function rerenderMaster()'));
const appHistory=fs.readFileSync('public/process/app.js','utf8').split('\n').find(line=>line.startsWith("window.addEventListener('popstate',"));
assert(masterHistory.includes('selectDataTab(state.dataTab)'));assert(appHistory);
async function fixture({legacy=false}={}){
 const listeners={},events={},clicks={},calls=[],messages=[],pending={dirty:0},drafts={},reads=[],ready=deferred();let readiness=Promise.resolve(),clearCount=0;
 const location={href:'https://fixture.invalid/process/index.html?system=process&view=dashboard',get search(){return new URL(this.href).search;},reload:()=>calls.push('reload')};
 const element=()=>({dataset:{},setAttribute(){},append(){},prepend(){calls.push('banner');},querySelector:()=>null,querySelectorAll:()=>[],replaceChildren(){clearCount++;},remove(){}}),area=element(),shell=element();
 const document={documentElement:{dataset:{},lang:'zh'},addEventListener:(name,fn)=>clicks[name]=fn,querySelector:s=>s==='#view-root'?area:s==='.app-shell'?shell:null,querySelectorAll:()=>[],createElement:element,body:{append(){}}};
 const sync={deliveryProjection:true,identity:{id:'frank'},identityGeneration:()=>1,destination:{view:'dashboard',dataTab:null,system:'process',key:'dashboard'},pendingState:()=>pending,
 prepareDestination(target,signal){const q=deferred();reads.push({...q,target,signal});return q.promise;},validateDestination(){},commitDestination(handle){calls.push('commit');this.destination=handle.destination;this.catalog={};},suspendDestination(){calls.push('suspend');}};
 const state={view:'dashboard',dataTab:null,approvalTab:'master'},history={state:{},replaceState(state,_title,url){this.state=state;location.href=String(url);calls.push('replace');},pushState(state,_title,url){this.state=state;location.href=String(url);calls.push('push');},go(delta){calls.push(['go',delta]);}};
 const window={ProcessSync:sync,ProcessDeliveryPurpose:policy,ProcessDualSystem:{activeSystem:'process',installSystem(system){this.activeSystem=system;},readyForDestination:()=>readiness},ProcessDataTabs:{readyForDestination:()=>readiness},ProcessRuntimeProjection:{canLeave:()=>true,install(){calls.push('install');}},MasterDataWorkflow:{canLeave:()=>true,resetProjection(){calls.push('master-reset');}},sharedDraftAccountState:()=>drafts,addEventListener(name,fn){events[name]=fn;(listeners[name]||=[]).push(fn);},dispatchEvent(){},IMPORTED_DATA:{old:'private'},LINE_PROCESS_DATA:{old:'private'},LINE_C_MASTER:{old:'private'}};
 const applyPlayerIntent=()=>{if(new URL(location.href).searchParams.get('view')==='player')calls.push(['player-intent',new URL(location.href).searchParams.get('line'),calls.includes('install')]);};
 if(legacy)window.ProcessRuntimeProjection.applyPlayerIntent=applyPlayerIntent;
 const context=vm.createContext({window,document,location,history,state,currentUser:sync.identity,selectDataTab:tab=>calls.push(['legacy-master',tab]),applyPlayerIntent,coordinatorModule:coordinator,URL,Promise,AbortController,CustomEvent:class{},performance:{now:()=>10},navigate:view=>{state.view=view;calls.push(['render',view]);},render:()=>calls.push('render'),toast:m=>messages.push(m)});if(legacy)vm.runInContext(masterHistory+'\n'+appHistory,context);vm.runInContext(source,context);await window.ProcessDeliveryNavigation.initialized;calls.length=0;
 return{dispatchPop(index){let stopped=false;const event={state:{processNavigationIndex:index},stopImmediatePropagation(){stopped=true;}};for(const listener of listeners.popstate||[]){listener(event);if(stopped)break;}},api:window.ProcessDeliveryNavigation,window,context,events,clicks,calls,messages,pending,drafts,reads,location,sync,document,history,state,clearCount:()=>clearCount,ready:promise=>readiness=promise,finish(index){const row=reads[index];row.resolve({destination:{...row.target,key:policy.destinationKey(row.target)}});}};
}
test('actual router keeps source intact during preparation and commits same-document after fresh projection',async()=>{
 const f=await fixture(),q=deferred();f.ready(q.promise);f.api.navigate('data','quality-iqc','quality');assert.equal(f.reads.length,1);assert.equal(f.state.view,'dashboard');assert.equal(f.clearCount(),0);assert.equal(new URL(f.location.href).searchParams.get('view'),'dashboard');
 f.finish(0);await turn();assert.equal(f.state.view,'data');assert.equal(new URL(f.location.href).searchParams.get('dataTab'),'quality-iqc');assert(!f.document.documentElement.dataset.processDestinationReadyGeneration);assert.equal(f.calls.includes('reload'),false);
 q.resolve();await turn();assert.equal(f.document.documentElement.dataset.processDestinationReadyGeneration,'1');assert.equal(f.document.documentElement.dataset.processNavigationStatus,'ready');
});
test('actual router target403 preserves source session URL and DOM without reinstall',async()=>{const f=await fixture(),before=f.location.href;f.api.navigate('editor');f.reads[0].reject(Object.assign(Error('DESTINATION_FORBIDDEN'),{status:403}));await turn();assert.equal(f.location.href,before);assert.equal(f.sync.identity.id,'frank');assert.equal(f.state.view,'dashboard');assert.equal(f.clearCount(),0);assert(!f.calls.includes('commit'));});
test('actual router blocks dirty and unknown writes without requests',async()=>{const f=await fixture();for(const [object,key]of [[f.pending,'dirty'],[f.drafts,'unknown'],[f.drafts,'queued']]){object[key]=1;f.api.navigate('editor');await turn();object[key]=0;}assert.equal(f.reads.length,0);assert.equal(f.state.view,'dashboard');});
test('actual router deduplicates rapid same-target clicks and suppresses older target response',async()=>{const f=await fixture();f.api.navigate('editor');f.api.navigate('editor');assert.equal(f.reads.length,1);f.api.navigate('player');assert.equal(f.reads.length,2);assert(f.reads[0].signal.aborted);f.finish(1);await turn();f.finish(0);await turn();assert.equal(f.state.view,'player');assert.equal(f.calls.filter(v=>v==='commit').length,1);});
test('actual router partial install failure suspends writes and never restores old projection',async()=>{const f=await fixture();f.window.ProcessRuntimeProjection.install=()=>{throw Error('injected install failure');};f.api.navigate('editor');f.finish(0);await turn();assert(f.calls.includes('suspend'));assert.equal(f.document.documentElement.dataset.processNavigationStatus,'error');assert.deepEqual(Object.keys(f.window.IMPORTED_DATA),[]);assert.equal(f.sync.identity.id,'frank');});
test('actual router postcommit target read failure is not ready and does not resurrect source',async()=>{const f=await fixture(),q=deferred();f.ready(q.promise);f.api.navigate('editor');f.finish(0);await turn();q.reject(Error('target GET unavailable'));await turn();assert.equal(f.state.view,'editor');assert.equal(f.document.documentElement.dataset.processNavigationStatus,'error');assert(!f.document.documentElement.dataset.processDestinationReadyGeneration);assert(!f.calls.includes('suspend'));});
test('actual router approval panels are separately prepared without mutating selected panel early',async()=>{const f=await fixture();f.api.approval('quality');assert.equal(f.state.view,'dashboard');assert.equal(f.state.approvalTab,'master');f.finish(0);await turn();assert.equal(f.state.approvalTab,'quality');assert.equal(new URL(f.location.href).searchParams.get('approvalTab'),'quality');});
test('actual invalidation clears private globals and bfcache still requires revalidation',async()=>{const f=await fixture();f.sync.requiresReload=true;f.sync.identity=null;f.events['process-delivery-invalidated']();assert.deepEqual(Object.keys(f.window.IMPORTED_DATA),[]);f.events.pageshow({persisted:true});assert(f.calls.includes('reload'));});
test('actual popstate commits player intent only after fresh catalog and keeps numbered entry',async()=>{
 const f=await fixture();let intent;
 f.window.ProcessRuntimeProjection.applyPlayerIntent=()=>{intent={line:new URL(f.location.href).searchParams.get('line'),installed:f.calls.includes('install')};};
 f.api.navigate('editor');f.finish(0);await turn();
 f.location.href='https://fixture.invalid/process/index.html?system=process&view=player&line=C&stage=C-CUT';f.events.popstate({state:{processNavigationIndex:0},stopImmediatePropagation(){}});assert.equal(f.state.view,'editor');f.finish(1);await turn();assert.deepEqual(intent,{line:'C',installed:true});assert.equal(f.state.view,'player');assert.equal(f.history.state.processNavigationIndex,0);
});
test('actual failed pop restores committed history entry without adding another entry',async()=>{const f=await fixture();f.api.navigate('editor');f.finish(0);await turn();f.location.href='https://fixture.invalid/process/index.html?system=process&view=dashboard';f.events.popstate({state:{processNavigationIndex:0},stopImmediatePropagation(){}});f.reads[1].reject(Object.assign(Error('denied'),{status:403}));await turn();assert.deepEqual(f.calls.at(-1),['go',1]);assert.equal(f.state.view,'editor');assert.equal(f.calls.filter(v=>v==='push').length,1);});
for(const success of [false,true])test('actual pending pop → click '+(success?'success':'failure')+' restores physical source before new request',async()=>{
 const f=await fixture();f.api.navigate('editor');f.finish(0);await turn();const source=f.location.href,index=f.history.state.processNavigationIndex;
 f.location.href='https://fixture.invalid/process/index.html?system=process&view=dashboard';f.events.popstate({state:{processNavigationIndex:0},stopImmediatePropagation(){}});f.api.navigate('player');assert(f.reads[1].signal.aborted);assert.equal(f.reads.length,2,'new request waits for actual restoration');assert.deepEqual(f.calls.at(-1),['go',1]);
 f.location.href=source;f.events.popstate({state:{processNavigationIndex:index},stopImmediatePropagation(){}});assert.equal(f.reads.length,3);
 if(success)f.finish(2);else f.reads[2].reject(Object.assign(Error('denied'),{status:403}));await turn();f.finish(1);await turn();
 assert.equal(f.state.view,success?'player':'editor');assert.equal(new URL(f.location.href).searchParams.get('view'),success?'player':'editor');assert.equal(f.history.state.processNavigationIndex,success?index+1:index);
});
test('newer click during delayed history restoration replaces queued older intent',async()=>{
 const f=await fixture();f.api.navigate('editor');f.finish(0);await turn();const source=f.location.href;
 f.location.href='https://fixture.invalid/process/index.html?view=dashboard';f.events.popstate({state:{processNavigationIndex:0},stopImmediatePropagation(){}});f.api.navigate('player');f.api.navigate('dispatch');assert.equal(f.reads.length,2);
 f.location.href=source;f.events.popstate({state:{processNavigationIndex:1},stopImmediatePropagation(){}});assert.equal(f.reads.length,3);assert.equal(f.reads[2].target.view,'dispatch');f.finish(2);await turn();assert.equal(f.state.view,'dispatch');
});
test('ordinary target-read error keeps owned input/recovery DOM instead of destructive rollback',async()=>{const f=await fixture(),q=deferred();f.ready(q.promise);f.api.navigate('editor');f.finish(0);await turn();const cleared=f.clearCount();q.reject(Error('one module read failed'));await turn();assert.equal(f.clearCount(),cleared);assert(f.calls.includes('banner'));assert.equal(f.document.documentElement.dataset.processNavigationStatus,'error');});

// Deliberately run the actual legacy registrations first: correctness must not
// depend on capture-phase ordering on Window or stopImmediatePropagation alone.
for(const success of [false,true])test('legacy-first pending quality pop → click '+(success?'success':'failure')+' cannot render an uninstalled master scope',async()=>{
 const f=await fixture({legacy:true});f.api.navigate('data','quality-iqc','quality');f.finish(0);await turn();const source=f.location.href,index=f.history.state.processNavigationIndex,cleared=f.clearCount();
 f.location.href='https://fixture.invalid/process/index.html?system=process&view=data&dataTab=AB';f.dispatchPop(0);
 assert.equal(f.state.dataTab,'quality-iqc');assert.equal(f.clearCount(),cleared);assert.equal(f.calls.some(row=>row[0]==='legacy-master'),false);assert.equal(f.reads.length,2);
 f.api.navigate('editor');assert(f.reads[1].signal.aborted);assert.equal(f.reads.length,2);assert.deepEqual(f.calls.at(-1),['go',1]);
 f.location.href=source;f.dispatchPop(index);assert.equal(f.reads.length,3);assert.equal(f.state.dataTab,'quality-iqc');assert.equal(f.calls.some(row=>row[0]==='legacy-master'),false);
 if(success)f.finish(2);else f.reads[2].reject(Object.assign(Error('denied'),{status:403}));await turn();f.finish(1);await turn();
 assert.equal(f.state.view,success?'editor':'data');assert.equal(f.state.dataTab,success?null:'quality-iqc');assert.equal(new URL(f.location.href).searchParams.get('dataTab'),success?null:'quality-iqc');
 assert.equal(f.history.state.processNavigationIndex,success?index+1:index);assert.equal(f.calls.filter(row=>row==='commit').length,success?2:1);assert.equal(f.calls.some(row=>row[0]==='legacy-master'),false);
});
test('legacy-first player pop defers display intent until fresh catalog installation',async()=>{
 const f=await fixture({legacy:true});f.api.navigate('data','quality-iqc','quality');f.finish(0);await turn();f.calls.length=0;
 f.location.href='https://fixture.invalid/process/index.html?system=process&view=player&line=C&stage=C-CUT';f.dispatchPop(0);
 assert.equal(f.state.view,'data');assert.equal(f.state.dataTab,'quality-iqc');assert.equal(f.calls.some(row=>row[0]==='player-intent'),false);assert.equal(f.reads.length,2);
 f.finish(1);await turn();assert.deepEqual(f.calls.filter(row=>row[0]==='player-intent'),[['player-intent','C',true]]);assert.equal(f.state.view,'player');assert.equal(f.history.state.processNavigationIndex,0);
});
test('actual master popstate preserves native fallback, session and non-data boundaries',()=>{
 for(const owner of [undefined,{ownsHistory:false},{ownsHistory:true}]){
  const calls=[],state={view:'data',dataTab:'C'},window={ProcessSync:{deliveryProjection:true},ProcessDeliveryNavigation:owner,addEventListener(_name,fn){this.popstate=fn;}};
  const context=vm.createContext({window,state,currentUser:{id:'synthetic-actor'},URL,location:{href:'https://fixture.invalid/process/?view=data&dataTab=AB'},navigate:view=>calls.push(['navigate',view]),selectDataTab:tab=>calls.push(['select',tab])});vm.runInContext(masterHistory,context);window.popstate();
  assert.equal(state.dataTab,owner?.ownsHistory?'C':'AB');assert.deepEqual(calls,owner?.ownsHistory?[]:[['select','AB']]);
  context.currentUser=null;state.dataTab='C';calls.length=0;window.popstate();assert.equal(state.dataTab,'C');assert.deepEqual(calls,[]);
  context.currentUser={id:'synthetic-actor'};context.location.href='https://fixture.invalid/process/?view=player';window.popstate();assert.equal(state.dataTab,'C');assert.deepEqual(calls,[]);
 }
});
test('legacy-first pop cannot mutate the source while dirty, in-flight or unknown writes block navigation',async()=>{
 for(const [kind,key]of [['pending','dirty'],['pending','inFlight'],['drafts','unknown']]){
  const f=await fixture({legacy:true});f.api.navigate('data','quality-iqc','quality');f.finish(0);await turn();const source=f.location.href,cleared=f.clearCount();f[kind][key]=1;
  f.location.href='https://fixture.invalid/process/index.html?system=process&view=data&dataTab=AB';f.dispatchPop(0);await turn();
  assert.equal(f.state.view,'data');assert.equal(f.state.dataTab,'quality-iqc');assert.equal(f.reads.length,1);assert.equal(f.clearCount(),cleared);assert.equal(f.calls.some(row=>row[0]==='legacy-master'),false);assert.deepEqual(f.calls.at(-1),['go',1]);
  f.location.href=source;f.dispatchPop(1);assert.equal(f.history.state.processNavigationIndex,1);assert.equal(f.state.dataTab,'quality-iqc');assert.equal(f.reads.length,1);
 }
});
