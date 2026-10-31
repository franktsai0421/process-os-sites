import installForegroundPorts from '../scripts/entry-performance/fixture-ports.cjs';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as policy from '../public/process/delivery-purpose.mjs';
import * as coordinatorModule from '../public/process/navigation-lifecycle.mjs';
const src=file=>fs.readFileSync(new URL('../public/process/'+file,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
// Actual relevant application cascade, synthetic DOM/storage/fetch ports only.
// No application origin, network listener, browser or real business data.
async function fixture({bindTransport=true,enumerateStorage=true}={}){
 class Storage{constructor(){this.items=new Map();}get length(){return this.items.size;}key(i){return [...this.items.keys()][i]??null;}getItem(k){return this.items.get(k)??null;}setItem(k,v){this.items.set(k,String(v));}removeItem(k){this.items.delete(k);}}
 if(!enumerateStorage){delete Storage.prototype.key;delete Storage.prototype.length;}
 const events=new Map(),docEvents=new Map(),nodes=new Set(),pending=[],calls=[],dispatches=[],resets={IQC:0,effective:0,overview:0};
 function element(tag='div'){
  const controls=new Map(),attributes=new Map();let html='';
  return {tagName:tag.toUpperCase(),className:'',id:'',dataset:{},style:{},isConnected:true,textContent:'',children:[],
   setAttribute(k,v){attributes.set(k,v);},removeAttribute(k){attributes.delete(k);},getAttribute(k){return attributes.get(k)??null;},append(...n){this.children.push(...n);},prepend(){},
   set innerHTML(value){html=value;controls.clear();const match=value.match(/<img src="([^"]+)"/);if(match){const img=element('img');img.setAttribute('src',match[1]);controls.set('img',img);}},get innerHTML(){return html;},
   replaceChildren(...n){this.children=n;this.innerHTML='';},
   querySelector(selector){if(!controls.has(selector))controls.set(selector,element('button'));return controls.get(selector);},
   querySelectorAll(selector){return [...controls.values()].filter(n=>selector==='img'?n.tagName==='IMG':selector==='button'?n.tagName==='BUTTON':false);},
   remove(){this.isConnected=false;nodes.delete(this);},focus(){calls.push('focus');}
  };
 }
 const shell=element(),area=element(),content=element();content.dataset.activeTab='quality-iqc';
 const match=(n,s)=>s.startsWith('.')?n.className===s.slice(1):s.startsWith('#')?n.id===s.slice(1):false;
 const document={documentElement:{lang:'zh',dataset:{}},visibilityState:'visible',hidden:false,activeElement:null,createElement:element,body:{append:n=>nodes.add(n)},querySelector:s=>s==='.app-shell'?shell:s==='#view-root'?area:s==='#data-content'?content:[...nodes].find(n=>match(n,s))||null,querySelectorAll:s=>[...nodes].filter(n=>s.split(',').some(p=>match(n,p))),addEventListener(n,f){if(!docEvents.has(n))docEvents.set(n,new Set());docEvents.get(n).add(f);},removeEventListener(n,f){docEvents.get(n)?.delete(f);}};
 const window={ProcessDeliveryPurpose:policy,addEventListener(n,f){if(!events.has(n))events.set(n,[]);events.get(n).push(f);},dispatchEvent(e){dispatches.push(e.type);for(const listener of events.get(e.type)||[])listener(e);},ProcessRuntimeProjection:{canLeave:()=>true,install(){}},MasterDataWorkflow:{canLeave:()=>true,resetProjection(){}},ProcessDualSystem:{activeSystem:'quality',installSystem(){},readyForDestination:async()=>{}},ProcessDataTabs:{readyForDestination:async()=>{}},sharedDraftAccountState:()=>({}),IMPORTED_DATA:{synthetic:'old'},LINE_PROCESS_DATA:{synthetic:'old'},LINE_C_MASTER:{synthetic:'old'}};
 const destination={view:'data',dataTab:'quality-iqc',module:'iqc',system:'quality'};destination.key=policy.destinationKey(destination);
 const initial={revision:10,values:{dispatchBoard:'{}',platformUsers:JSON.stringify([{id:'synthetic',role:'staff'}])},identity:{id:'synthetic',role:'staff'},serverProtected:true,deliveryProjection:true,writableKeys:['dispatchBoard'],catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{products:[]},routing:{lines:[]},lineC:{}},destination};
 const location={href:'https://fixture.invalid/process/index.html?system=quality&view=data&dataTab=quality-iqc',get origin(){return new URL(this.href).origin;},get pathname(){return new URL(this.href).pathname;},get search(){return new URL(this.href).search;},reload(){calls.push('reload');}};
 const history={state:{},replaceState(s,_t,url){this.state=s;location.href=String(url);},pushState(s,_t,url){this.state=s;location.href=String(url);},go(){}};
 let first=true;
 const context=vm.createContext({window,document,crypto:webcrypto,bindDataInner(){throw Error('UNEXPECTED_PROCESS_MASTER_BIND');},Storage,localStorage:new Storage(),sessionStorage:new Storage(),URL,URLSearchParams,AbortSignal,AbortController,Response,Promise,location,history,state:{view:'data',dataTab:'quality-iqc',approvalTab:'quality'},currentUser:{id:'synthetic'},coordinatorModule,CustomEvent:class{constructor(type,detail){this.type=type;this.detail=detail;}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,console,performance:{now:()=>1},navigate(){},render(){},toast(){},fetch:(url,options)=>{calls.push(['STUB_FETCH_ONLY',url]);if(first){first=false;return Promise.resolve(Response.json(initial));}return new Promise(resolve=>pending.push({resolve,url,options}));}});
 vm.runInContext(src('shared-state.js'),context);await window.ProcessSync.ready;
 vm.runInContext(src('navigation-forms.js'),context);
 // Preserve the existing shared-state/navigation event subscriptions while
 // adding the scheduler's removal/dispatch dependency ports.
 window.removeEventListener=(name,fn)=>events.set(name,(events.get(name)||[]).filter(listener=>listener!==fn));
 document.dispatchEvent=event=>{const pendingEvents=Array.from(docEvents.get(event.type)||[]);for(const fn of pendingEvents)fn(event);return true;};
 vm.runInContext(src('shared-draft-client.js'),context);installForegroundPorts(context);
 // Load the real dependency now used by IQC's departure getter, not a permissive adapter stub.
 vm.runInContext(src('version-draft-ui.js'),context);
 // Test-only export of unchanged actual functions, inside their original closure.
 // No source file is changed; actual reset and all IQC event registrations run.
 const iqc=src('iqc-master.js');assert(iqc.endsWith('})(window);\r\n')||iqc.endsWith('})(window);\n'));
 vm.runInContext(iqc.replace('})(window);','host.__testIqc={photoViewerPhotos,dialog,transport};\n})(window);'),context);
 // Bind the actual transport to the existing actor as normal load does. This
 // fixture does not mount an IQC data model or manufacture a clean owner flag.
 if(bindTransport){const reads=calls.length;window.__testIqc.transport();assert.equal(calls.length,reads,'owner binding performs no fetch');assert.equal(window.IQCMasterUI.navigation.departure.inspect().state,'clean');}

 vm.runInContext(src('effective-version-notice.js'),context);
 vm.runInContext(src('quality-review-overview.js'),context);
 for(const [object,key,label]of [[window.IQCMasterUI.navigation,'reset','IQC'],[window.EffectiveVersionNotice,'reset','effective'],[window.QualityReviewOverview,'dispose','overview']]){const original=object[key];object[key]=function(...args){resets[label]++;return original.apply(this,args);};}
 vm.runInContext(src('delivery-navigation.js').replace(/import\('\.\/navigation-lifecycle\.mjs\?v=[^']+'\)/,'Promise.resolve(coordinatorModule)'),context);await window.ProcessDeliveryNavigation.initialized;
 function open(){window.__testIqc.photoViewerPhotos([{src:'/fixture/old-synthetic-0.png'},{src:'/fixture/old-synthetic-1.png'}]);return [...nodes].find(n=>n.className==='iqc-lightbox');}
 const shellKeyListeners=new Set(docEvents.get('keydown')||[]);
 const iqcKeys=()=>new Set([...(docEvents.get('keydown')||[])].filter(fn=>!shellKeyListeners.has(fn)));
 function state(){return{identity:window.ProcessSync.identity,requiresReload:window.ProcessSync.requiresReload,destination:window.ProcessSync.destination,shellHidden:shell.hidden===true,viewers:[...nodes].filter(n=>n.className==='iqc-lightbox').length,keydownListeners:iqcKeys().size,reloadGates:[...nodes].filter(n=>n.id==='process-boot').length,resets:{...resets},dispatches:[...dispatches],stubFetchCalls:calls.filter(v=>Array.isArray(v)).length};}
 return{window,context,document,events,docEvents,nodes,pending,resets,open,state,calls,iqcKeys};
}
for(const mode of ['clearIdentity','refresh401','pendingNavigation401','sameActorReplacement'])void test('IQC viewer is disposed by actual '+mode+' cascade without resetting editors/transports',async()=>{
 const f=await fixture();
 if(mode==='pendingNavigation401'){f.window.ProcessDeliveryNavigation.navigate('player');assert.equal(f.pending.length,1);}
 const viewer=f.open(),image=viewer.querySelector('img'),oldKey=[...f.iqcKeys()][0],oldNext=viewer.querySelector('#iqc-photo-next').onclick;
 assert.equal(f.iqcKeys().size,1);assert(image.getAttribute('src'));
 f.context.sessionStorage.setItem('synthetic-owned-unknown-receipt','retained');
 if(mode==='clearIdentity'){
  f.context.localStorage.setItem('dispatchBoard','{"unsaved":"synthetic"}');
  f.window.ProcessSync.clearIdentity();
 }else if(mode==='sameActorReplacement')f.window.ProcessSync.setPlatformIdentity({id:'synthetic',name:'same actor',role:'staff'});
 else if(mode==='refresh401'){const refresh=f.window.ProcessSync.refresh();await tick();f.pending[0].resolve(Response.json({error:'LOGIN_REQUIRED'},{status:401}));await refresh;}
 else{f.pending[0].resolve(Response.json({error:'LOGIN_REQUIRED'},{status:401}));await tick();await tick();}
 const state=f.state();assert.equal(state.requiresReload,true);assert.equal(state.destination,null);assert.equal(state.shellHidden,true);assert.equal(state.viewers,0);assert.equal(state.keydownListeners,0);assert.equal(state.reloadGates,1);assert.equal(state.resets.IQC,0);assert.equal(state.resets.overview,0);
 assert.equal(viewer.isConnected,false);assert.equal(image.getAttribute('src'),null);assert.equal(viewer.innerHTML,'');
 oldKey({key:'ArrowRight'});oldNext();assert.equal(viewer.innerHTML,'');assert.equal(f.state().viewers,0);assert.equal(f.open(),undefined);
 f.window.dispatchEvent({type:'process-delivery-invalidated'});f.window.IQCMasterUI.navigation.reset();assert.equal(f.state().viewers,0);assert.equal(f.state().keydownListeners,0);
 assert.equal(f.context.sessionStorage.getItem('synthetic-owned-unknown-receipt'),'retained');
 if(mode==='clearIdentity'){const recovery=JSON.parse(f.context.sessionStorage.getItem('process-unsynced-recovery:synthetic'));assert.equal(recovery.actorId,'synthetic');assert.equal(recovery.updates.dispatchBoard,'{"unsaved":"synthetic"}');}
 assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='STUB_FETCH_ONLY').length,mode==='refresh401'||mode==='pendingNavigation401'?2:1);
 assert(!f.calls.includes('focus'),'viewer disposal never refocuses an editor');
});
void test('IQC denied target retains current viewer; normal close and repeated clean reset release only owned resources',async()=>{
 const f=await fixture();f.window.ProcessDeliveryNavigation.navigate('player');const viewer=f.open();f.pending[0].resolve(Response.json({error:'DENIED'},{status:403}));await tick();await tick();assert.equal(f.state().requiresReload,false);assert.equal(f.state().viewers,1);
 for(const key of f.docEvents.get('keydown'))key({key:'ArrowRight'});assert(viewer.innerHTML.includes('old-synthetic-1.png'));
 viewer.querySelector('#iqc-photo-close').onclick();assert.equal(f.state().viewers,0);assert.equal(f.state().keydownListeners,0);
 for(let i=0;i<200;i++){const node=f.open();assert(node);if(i%2)node.querySelector('#iqc-photo-close').onclick();else f.window.IQCMasterUI.navigation.reset();assert.equal(f.state().viewers,0);assert.equal(f.state().keydownListeners,0);}
});
for(const mode of ['clearIdentity','refresh401','pendingNavigation401','sameActorReplacement'])void test('actual '+mode+' cascade quarantines IQC editor without normal close or receipt cleanup',async()=>{
 const f=await fixture();if(mode==='pendingNavigation401'){f.window.ProcessDeliveryNavigation.navigate('player');assert.equal(f.pending.length,1);}
 const {overlay,owner,close}=f.window.__testIqc.dialog('<input value="synthetic pending text">'),input=overlay.querySelector('input'),files=[{name:'unsent.png'}];input.value='中文 Việt composing';input.files=files;const base=owner.base,html=overlay.innerHTML,key=[...f.iqcKeys()][0],focusCount=f.calls.filter(x=>x==='focus').length;
 f.context.sessionStorage.setItem('synthetic-owned-unknown-receipt','exact retained bytes');
 if(mode==='clearIdentity')f.window.ProcessSync.clearIdentity();else if(mode==='sameActorReplacement')f.window.ProcessSync.setPlatformIdentity({id:'synthetic',role:'staff'});else if(mode==='refresh401'){const p=f.window.ProcessSync.refresh();await tick();f.pending[0].resolve(Response.json({error:'LOGIN_REQUIRED'},{status:401}));await p;}else{f.pending[0].resolve(Response.json({error:'LOGIN_REQUIRED'},{status:401}));await tick();await tick();}
 assert(f.window.ProcessSync.requiresReload);assert(owner.terminal);assert.equal(owner.current(),false);assert.equal(overlay.isConnected,false);assert.equal(overlay.innerHTML,html);assert.equal(input.value,'中文 Việt composing');assert.equal(input.files,files);assert.equal(owner.base,base);assert.equal(f.iqcKeys().size,0);assert.equal(f.resets.IQC,0);
 close();key({key:'Escape',preventDefault(){}});assert.equal(f.calls.filter(x=>x==='focus').length,focusCount);assert.equal(f.context.sessionStorage.getItem('synthetic-owned-unknown-receipt'),'exact retained bytes');assert.equal(f.state().reloadGates,1);assert.equal(f.state().stubFetchCalls,mode==='refresh401'||mode==='pendingNavigation401'?2:1);
});

for(const mode of ['unbound-owner','invalidated-owner'])void test('real IQC departure '+mode+' refuses Save/Discard without fetch or receipt cleanup',async()=>{
 const f=await fixture({bindTransport:mode!=='unbound-owner'}),viewer=f.open();
 f.context.sessionStorage.setItem('synthetic-owned-unknown-receipt','exact retained bytes');
 if(mode==='invalidated-owner')f.window.ProcessSync.setPlatformIdentity({id:'synthetic',role:'staff'});
 const adapter=f.window.IQCMasterUI.navigation.departure,before=JSON.stringify(f.state()),html=viewer.innerHTML;
 assert.equal(adapter.inspect().state,'unknown');await assert.rejects(adapter.save());await assert.rejects(adapter.discard());
 assert.equal(JSON.stringify(f.state()),before);assert.equal(viewer.innerHTML,html);
 assert.equal(f.context.sessionStorage.getItem('synthetic-owned-unknown-receipt'),'exact retained bytes');
 assert.equal(f.state().stubFetchCalls,1);
});

void test('missing WebStorage enumeration keeps actual IQC departure unknown without dispatch',async()=>{const f=await fixture({bindTransport:false,enumerateStorage:false}),before=f.state().stubFetchCalls;f.window.__testIqc.transport();const adapter=f.window.IQCMasterUI.navigation.departure;assert.equal(adapter.inspect().state,'unknown');await assert.rejects(adapter.save());await assert.rejects(adapter.discard());assert.equal(f.state().stubFetchCalls,before);});
