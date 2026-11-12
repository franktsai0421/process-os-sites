import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import * as deliveryPolicy from '../public/process/delivery-purpose.mjs';
import * as accessPolicy from '../public/process/access-policy.mjs';
import * as ownedDraftPolicy from '../public/process/owned-draft-ledger.mjs';
import * as accountReviewPolicy from '../public/process/account-review-preview.mjs';
// This VM fixture binds four reviewed, side-effect-free real module namespaces.
// Asset URL/module-identity contracts are tested separately. Missing, repeated or
// unknown imports fail here before bootstrap can swallow a fixture binding error.
const bootstrap=fs.readFileSync('public/process/bootstrap.js','utf8');
function bootstrapSource(text=bootstrap){
 for(const {pattern,binding}of [{pattern:/import\('\.\/access-policy\.mjs(?:\?[^']*)?'\)/g,binding:'accessPolicy'},{pattern:/import\('\.\/delivery-purpose\.mjs(?:\?[^']*)?'\)/g,binding:'deliveryPolicy'},{pattern:/import\('\.\/owned-draft-ledger\.mjs(?:\?[^']*)?'\)/g,binding:'ownedDraftPolicy'},{pattern:/import\('\.\/account-review-preview\.mjs(?:\?[^']*)?'\)/g,binding:'accountReviewPolicy'}]){
  assert.equal([...text.matchAll(pattern)].length,1,'exactly one bootstrap import for '+binding);
  text=text.replace(pattern,binding);
 }
 assert.doesNotMatch(text,/\bimport\s*\(/,'unexpected bootstrap import needs an explicit fixture binding');
 return text.replace('void (async () =>','(async () =>');
}
void test('bootstrap VM binds real policy modules across cache tokens and rejects dependency drift',()=>{
 const text=bootstrapSource();assert.match(text,/\[window\.ProcessAccessPolicy,window\.ProcessDeliveryPurpose,window\.ProcessAccountReview\]=await Promise\.all/);assert.match(text,/accessPolicy,/);assert.match(text,/deliveryPolicy,/);assert.match(text,/accountReviewPolicy,/);
 assert.equal(bootstrapSource(bootstrap.replace(/((?:access-policy|delivery-purpose|owned-draft-ledger|account-review-preview)\.mjs)\?v=[^']+/g,'$1?v=fixture-cache-token')),text);
 for(const name of ['access-policy','delivery-purpose','owned-draft-ledger','account-review-preview']){
  const pattern=new RegExp("import\\('\\./"+name+"\\.mjs(?:\\?[^']*)?'\\)");
  assert.throws(()=>bootstrapSource(bootstrap.replace(pattern,'({})')),/exactly one bootstrap import/);
  assert.throws(()=>bootstrapSource(bootstrap.replace(name+'.mjs','other-policy.mjs')),/exactly one bootstrap import/);
  assert.throws(()=>bootstrapSource(bootstrap+"\nawait import('./"+name+".mjs?v=duplicate');"),/exactly one bootstrap import/);
 }
 assert.throws(()=>bootstrapSource(bootstrap+"\nawait import('./unknown-module.mjs');"),/unexpected bootstrap import/);
});
void test('a grouped script without its execution receipt fails closed and stops later scripts',async()=>{
 const requested=[],gate={setAttribute(){},append(){},remove(){throw Error('MUST_NOT_REVEAL');}},attrs={};
 const scripts=['group.js','later.js'].map((src,i)=>({dataset:{processSrc:src,...(i===0?{processBundle:'test-receipt'}:{})},replaceWith(script){requested.push(script.src);script.onload();}}));
 const window={ProcessSync:{ready:Promise.resolve(),identity:{id:'staff'},destination:{view:'dashboard',system:'process'},catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{},routing:{},lineC:{}}}};
 const document={querySelector:()=>gate,querySelectorAll:()=>scripts,createElement:()=>({}),head:{append(){}},documentElement:{dataset:attrs}};
 await vm.runInNewContext(bootstrapSource(),{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10},location:{href:'https://fixture.invalid/process/index.html',reload(){}}});
 assert.deepEqual(requested,['group.js']);assert.match(gate.textContent,/載入失敗/);assert.equal(attrs.processReadyMs,undefined);
});
void test('real shell shared-client cache URL survives preload and ordered script loading after the auth gate',async()=>{
 const html=fs.readFileSync('public/process/index.html','utf8'),refs=[...html.matchAll(/data-process-src="(shared-draft-client\.js\?v=[^"]+)"/g)].map(m=>m[1]);assert.equal(refs.length,1);
 const requested=[],preloaded=[],attrs={};let release;const ready=new Promise(resolve=>{release=resolve;}),gate={remove(){},setAttribute(){},append(){}};
 const script={dataset:{processSrc:refs[0]},replaceWith(element){requested.push(element.src);element.onload();}};
 const window={ProcessSync:{ready,identity:{id:'staff'},destination:{view:'dashboard',system:'process'},catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{},routing:{},lineC:{}}}};
 const document={querySelector:()=>gate,querySelectorAll:()=>[script],createElement:()=>({}),head:{append(element){if(element.as==='script')preloaded.push(element.href);}},documentElement:{dataset:attrs,removeAttribute(){}}};
 const completed=vm.runInNewContext(bootstrapSource(),{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10,mark(){}},location:{href:'https://fixture.invalid/process/index.html',reload(){}}});
 await new Promise(setImmediate);assert.deepEqual(preloaded,[]);assert.deepEqual(requested,[]);release();await completed;
 assert.deepEqual(preloaded,refs);assert.deepEqual(requested,refs);assert.equal(attrs.processNavigationStatus,'ready');
});
const source=fs.readFileSync('public/process/shared-state.js','utf8');
async function client(search=''){
 class Storage{constructor(){this.items=new Map();}getItem(k){return this.items.get(k)??null;}setItem(k,v){this.items.set(k,String(v));}removeItem(k){this.items.delete(k);}}
 const localStorage=new Storage(),sessionStorage=new Storage(),timers=new Map(),calls=[];let id=0;
 const events=[];const window={addEventListener(){},dispatchEvent(event){events.push(event.type);}};
 const values={platformUsers:'[]',masterDataControl:'{"active":{},"versions":[]}',dispatchBoard:'{"A":[]}'};
 const fetch=async(url,o={})=>{calls.push({url,method:o.method||'GET'});if(o.method==='POST')return Response.json({revision:11,values:{...values,...JSON.parse(o.body).updates},identity:{id:'staff',role:'staff'}});return Response.json({revision:10,values,identity:{id:'staff',role:'staff'},serverProtected:true,deliveryProjection:true,writableKeys:['dispatchBoard'],catalog:{format:'PROCESS_RUNTIME_CATALOG_V1'}});};
 vm.runInNewContext(source,{Storage,localStorage,sessionStorage,window,fetch,crypto:webcrypto,TextEncoder,AbortSignal,URLSearchParams,location:{search},CustomEvent:class{constructor(type){this.type=type;}},console,document:{documentElement:{lang:'zh'}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});
 await window.ProcessSync.ready;return {api:window.ProcessSync,localStorage,calls,timers,events};
}
void test('real client refuses partial legacy writes without false save success; complete dispatch key still uses original write endpoint',async()=>{
 const f=await client();assert.equal(f.calls[0].url,'/api/process-bootstrap');assert.equal(f.api.pendingState().dirty,0);
 f.localStorage.setItem('masterDataControl','{"seed":true}');assert.equal(f.api.projectionWriteError,null);assert.equal(f.localStorage.getItem('masterDataControl'),'{"active":{},"versions":[]}');assert.equal(f.calls.length,1);
 f.api.bootstrapping=false;
 f.localStorage.setItem('masterDataControl','{"active":{"incomplete":true}}');assert.equal(f.localStorage.getItem('masterDataControl'),'{"active":{},"versions":[]}');assert.equal(await f.api.flush(),false);assert.equal(f.api.saveError.message,'USE_MODULE_WORKFLOW');assert.equal(f.calls.length,1);
 const g=await client();g.localStorage.setItem('platformUsers','[]');g.localStorage.setItem('dispatchBoard','{"A":["TEST"]}');assert.equal(await g.api.flush(),true);assert.equal(g.calls.filter(c=>c.method==='POST').length,1);assert.equal(g.calls.at(-1).url,'/api/shared-state');assert.equal(g.api.revision,11);
 g.api.applyServerState({revision:12,values:{masterDataControl:'{"fullUnrelatedScope":true}',iqcMasterControl:'{"other":true}',dispatchBoard:'{"A":["confirmed"]}'}});assert.equal(g.localStorage.getItem('masterDataControl'),'{"active":{},"versions":[]}');assert.equal(g.localStorage.getItem('iqcMasterControl'),null);assert.equal(g.localStorage.getItem('dispatchBoard'),'{"A":["confirmed"]}');
});
void test('real bootstrap never requests raw seeds, waits authoritative editor readiness, and keeps failures covered',async()=>{
 const text=bootstrapSource();
 async function boot(failed=false){
  const requested=[],removed=[],attrs={},gate={style:{},setAttribute(){},append(){},remove(){removed.push('gate');}};
  const scripts=['./data/imported-data.js?v=1','data/line-process-data.js','data/line-c-master.js','./app.js','./module.js'].map(src=>({dataset:{processSrc:src},remove(){removed.push(src);},replaceWith(script){requested.push(script.src);script.onload();}}));
  let release,releaseModule;const readiness=new Promise(resolve=>release=resolve),moduleReady=new Promise(resolve=>releaseModule=resolve),window={ProcessSync:{ready:Promise.resolve(),identity:{id:'staff'},loadError:failed?'failed':null,destination:{view:'editor',system:'process'},catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{products:[]},routing:{lines:[]},lineC:{products:[]}}},ProcessAuthoringV3:{readyForEditor:()=>readiness},ProcessDualSystem:{readyForDestination:()=>moduleReady},dispatchEvent(){}};
  const document={querySelector:()=>gate,querySelectorAll:()=>scripts,createElement:()=>({}),head:{append:link=>requested.push(link.href)},documentElement:{dataset:attrs,removeAttribute(){}}};
  const p=vm.runInNewContext(text,{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10,mark(){}},Event:class{},location:{href:'https://fixture.invalid/process/index.html?view=editor',reload(){}}});
  for(let n=0;n<15;n++)await Promise.resolve();if(!failed)assert(removed.includes('gate'),'authenticated shell is usable before target reads settle');assert.equal(attrs.processReadyMs,undefined);
  release();for(let n=0;n<10;n++)await Promise.resolve();if(!failed)assert(removed.includes('gate'));assert.equal(attrs.processReadyMs,undefined,'target remains honestly not ready');releaseModule();await p;return {requested,removed,attrs,gate};
 }
 const ok=await boot();assert(ok.removed.includes('gate'));assert(ok.requested.length>0);assert(ok.requested.every(path=>!path.includes('/data/')&&!path.startsWith('data/')));assert.equal(ok.attrs.processReadyMs,10);
 const bad=await boot(true);assert.deepEqual(bad.requested,[]);assert(!bad.removed.includes('gate'));assert.match(bad.gate.textContent,/載入失敗/);
});
void test('expired normal session returns to fixed login with display intent and requests no seed',async()=>{
 const text=bootstrapSource();
 const navigations=[],gate={textContent:''};
 await vm.runInNewContext(text,{window:{ProcessSync:{ready:Promise.resolve(),loginRequired:true}},accessPolicy,deliveryPolicy,accountReviewPolicy,document:{querySelector:()=>gate,querySelectorAll:()=>[]},localStorage:{getItem:()=> 'zh'},URLSearchParams,location:{search:'?system=process&view=player&line=C&stage=C-CUT&next=https://bad.invalid&role=admin',replace:url=>navigations.push(url)}});
 assert.deepEqual(navigations,['/login?system=process&view=player&line=C&stage=C-CUT']);
});
void test('expired approval entry carries only one valid tab through the fixed login redirect', async () => {
 const text=bootstrapSource();
 for(const system of ['process','quality'])for(const tab of ['master','process','quality','routine']){
  const navigations=[],gate={textContent:''};
  await vm.runInNewContext(text,{window:{ProcessSync:{ready:Promise.resolve(),loginRequired:true}},accessPolicy,deliveryPolicy,accountReviewPolicy,document:{querySelector:()=>gate,querySelectorAll:()=>[]},localStorage:{getItem:()=> 'zh'},URLSearchParams,location:{search:`?system=${system}&view=approval&approvalTab=${tab}&role=admin&next=https://bad.invalid`,replace:url=>navigations.push(url)}});
  assert.deepEqual(navigations,[`/login?system=${system}&view=approval&approvalTab=${tab}`]);
 }
 for(const query of ['view=approval&approvalTab=unknown','view=approval&approvalTab=process&approvalTab=quality','view=approval&approvalTab=process&approvalTab=process','view=data&approvalTab=process','view=approval&view=data&approvalTab=process']){
  const navigations=[],gate={textContent:''};
  await vm.runInNewContext(text,{window:{ProcessSync:{ready:Promise.resolve(),loginRequired:true}},accessPolicy,deliveryPolicy,accountReviewPolicy,document:{querySelector:()=>gate,querySelectorAll:()=>[]},localStorage:{getItem:()=> 'zh'},URLSearchParams,location:{search:'?system=process&'+query,replace:url=>navigations.push(url)}});
  assert.equal(new URL(navigations[0],'https://synthetic.invalid').searchParams.has('approvalTab'),false);
 }
});
void test('account and review destinations wait for their existing reads without launching another read',async()=>{
 const text=bootstrapSource();
 for(const destination of [{view:'data',dataTab:'users',system:'process'},{view:'approval',system:'process'}]){
  let release,removed=false,calls=0;const existing=new Promise(resolve=>release=resolve),wait=()=>{calls++;return existing;},gate={setAttribute(){},append(){},remove(){removed=true;}};
  const window={ProcessSync:{ready:Promise.resolve(),identity:{id:'frank'},destination,catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{products:[]},routing:{lines:[]},lineC:{products:[]}}},ProcessUserAccess:{readyForDestination:wait},BOMWorkspace:{readyForReview:wait,loadReview(){throw Error('DUPLICATE_REVIEW_READ');}},dispatchEvent(){}};
  const document={querySelector:()=>gate,querySelectorAll:()=>[],createElement:()=>({}),head:{append(){}},documentElement:{dataset:{},removeAttribute(){}}};
  const pending=vm.runInNewContext(text,{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10,mark(){}},Event:class{},location:{href:'https://fixture.invalid/process/index.html',reload(){}}});
  for(let n=0;n<20;n++)await Promise.resolve();assert.equal(calls,1);assert.equal(removed,true);assert.equal(document.documentElement.dataset.processReadyMs,undefined);release();await pending;assert.equal(removed,true);assert.equal(calls,1);
 }
});
void test('bootstrap sends only destination intent; account change clears old delivery and cannot refresh it into another actor',async()=>{
 const f=await client('?view=data&dataTab=quality-iqc&system=quality&role=admin&token=not-a-credential');
 assert.equal(f.calls[0].url,'/api/process-bootstrap?system=quality&view=data&dataTab=quality-iqc');
 f.api.setPlatformIdentity({id:'other',role:'staff'});assert.equal(f.api.requiresReload,true);assert.equal(f.api.catalog,null);assert.equal(f.localStorage.getItem('masterDataControl'),null);
 assert(f.events.includes('process-delivery-invalidated'));await assert.rejects(()=>f.api.refresh(),/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(f.calls.length,1);
});
void test('cold bootstrap completion cannot mark a newer same-document target ready',async()=>{
 const text=bootstrapSource();
 let epoch=0,release,removed=false,reads=0;const targetReady=new Promise(resolve=>release=resolve),attrs={processDestinationGeneration:'0'},gate={setAttribute(){},append(){},remove(){removed=true;}};
 const window={ProcessSync:{ready:Promise.resolve(),identity:{id:'frank'},captureDelivery:()=>epoch,isCurrentDelivery:old=>old===epoch,destination:{view:'dashboard',system:'process'},catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{},routing:{},lineC:{}}},ProcessDeliveryNavigation:{initialized:Promise.resolve(),readyForDestination:()=>{reads++;return targetReady;}},dispatchEvent(){}};
 const document={querySelector:()=>gate,querySelectorAll:()=>[],createElement:()=>({}),head:{append(){}},documentElement:{dataset:attrs,removeAttribute(){}}};
 const pending=vm.runInNewContext(text,{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10,mark(){}},Event:class{},location:{href:'https://fixture.invalid/process/index.html?view=dashboard',reload(){}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(removed,true);assert.equal(reads,1,'owner fence must follow a real pending target read');epoch++;attrs.processDestinationGeneration='1';release();await pending;assert.equal(attrs.processDestinationReadyGeneration,undefined);assert.equal(attrs.processReadyMs,undefined);
});
void test('late cold target-read error preserves already interactive owned module DOM',async()=>{
 const text=bootstrapSource();
 let reject,removed=false,prepended=0,replaced=0;const targetReady=new Promise((_r,j)=>reject=j),root={prepend(){prepended++;},replaceChildren(){replaced++;}},gate={setAttribute(){},append(){},remove(){removed=true;}};
 const window={ProcessSync:{ready:Promise.resolve(),identity:{id:'frank'},captureDelivery:()=>({id:'frank',generation:0}),isCurrentDelivery:()=>true,destination:{view:'dashboard',system:'process'},catalog:{format:'PROCESS_RUNTIME_CATALOG_V1',imported:{},routing:{},lineC:{}}},ProcessDeliveryNavigation:{initialized:Promise.resolve(),readyForDestination:()=>targetReady},dispatchEvent(){}};
 const document={querySelector:s=>s==='#view-root'?root:removed?null:gate,querySelectorAll:()=>[],createElement:()=>({dataset:{},setAttribute(){},append(){}}),head:{append(){}},documentElement:{dataset:{},removeAttribute(){}}};
 const pending=vm.runInNewContext(text,{window,document,accessPolicy,deliveryPolicy,accountReviewPolicy,ownedDraftPolicy,history:{state:null,replaceState(){}},localStorage:{getItem:()=> 'zh'},performance:{now:()=>10,mark(){}},Event:class{},location:{href:'https://fixture.invalid/process/index.html?view=dashboard',reload(){}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(removed,true);reject(Error('target read failed'));await pending;assert.equal(replaced,0);assert.equal(prepended,1);assert.equal(document.documentElement.dataset.processNavigationStatus,'error');
});
