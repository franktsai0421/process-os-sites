process.chdir(require('node:path').resolve(__dirname,'..'));
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/process/ipqc-ab.js','utf8');
const shared=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const body=revision=>({revision,control:{scopes:{'A:G':{versions:[{id:'d',status:'draft',snapshot:{errors:[{id:'e',stageCode:'CUT',name:'SERVER NAME'}],items:[]}}]}}},catalog:{groups:[{line:'A',name:'G',defaultStages:['CUT']}],products:[],stages:[]},equipment:[]});
function fixture({missingPort}={}){
 const pending=[],identity={id:'owner',role:'admin'},listeners=[],retry={},nameInput={value:'UNSAVED PRIVATE'};
 const sync={identity,identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:value=>value===1,platformHeaders:()=>({})};
 if(missingPort)delete sync[missingPort];
 const window={VersionDraftUI:{t:zh=>zh,mount(){}},addEventListener(){},ProcessSync:sync,ProcessIPQC:{mountReferences(){},referenceMarkup:()=>''}};
 const visible={isConnected:true,dataset:{activeTab:'quality-ipqc-ab'},innerHTML:'old content',childNodes:[nameInput],
  querySelector(selector){if(selector==='[data-ab-access-retry]')return retry;if(selector==='#ab-error-name')return nameInput;if(selector.startsWith('#')&&this.innerHTML.includes('id="'+selector.slice(1)+'"'))return{addEventListener:(type,handler)=>listeners.push({s:selector,type,handler})};return null;},querySelectorAll:()=>[]};
 const context={window,document:{documentElement:{lang:'zh'},contains:()=>true,querySelectorAll:()=>[],querySelector:()=>null},MutationObserver:class{observe(){}},setTimeout,clearTimeout,AbortController,crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:class{},URLSearchParams,location:{search:''},structuredClone,console,
  fetch:()=>new Promise(resolve=>pending.push(resolve))};
 vm.createContext(context);vm.runInContext(shared,context);require('./entry-performance/fixture-ports.cjs')(context);
 // Seed only a clean selection. The real load below, not this hook, establishes
 // the input owner/baseline before a private modal is opened.
 const injection=`window.test={init(data,target){control=data.control;catalog=data.catalog;equipment=[];revision=1;line='A';group='G';stage='CUT';errorId='e';versionId='d';working=clone(data.control.scopes['A:G'].versions[0].snapshot);host=target;},openPrivate(){modal={type:'error',id:'e',name:'OLD NAME'};viewer={itemId:'missing',kind:'standard',index:0};modalBase=clone(working);modalGeneration='old-generation';},get(){return{modal,viewer,modalBase,modalGeneration,privateQuarantine,accessBlocked,inputBasisOwner,working};},load,draw};`;
 assert.equal(source.split('  window.IPQCABUI = {').length,2,'actual full AB module required');
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,injection+'})();'),context);
 const t=window.test;t.init(body(1),visible);
 const answer=(index,data,status=200)=>{assert.equal(typeof pending[index],'function','expected actual dispatched request '+index);pending[index]({ok:status<400,status,json:async()=>data});};
 return{t,visible,pending,listeners,retry,sync,identity,answer,
  async prime(){const start=pending.length,loading=t.load();assert.equal(pending.length-start,2);answer(start,{revision:1,permissions:{view:true,edit:true}});answer(start+1,body(1));assert.equal(await loading,true);assert.equal(t.get().inputBasisOwner.actor,identity);assert.equal(t.get().inputBasisOwner.host,visible);}};
}
void (async()=>{
 const f=fixture(),{t,visible,pending,listeners,retry,answer}=f;
 await f.prime();t.openPrivate();
 const start=pending.length,denied=t.load();assert.equal(pending.length-start,2);
 answer(start+1,{error:'FORBIDDEN'},403);await assert.rejects(denied);answer(start,{revision:1,permissions:{view:true,edit:true}});await tick();
 t.draw();assert(visible.innerHTML.includes('data-ab-access-retry'));assert.equal(t.get().privateQuarantine.modal.name,'UNSAVED PRIVATE');
 const retained=t.get().privateQuarantine,again=pending.length,deniedAgain=retry.onclick();answer(again+1,{error:'FORBIDDEN'},403);await deniedAgain;answer(again,{revision:1,permissions:{view:true,edit:true}});await tick();
 assert.equal(t.get().privateQuarantine,retained);assert.equal(retained.modal.name,'UNSAVED PRIVATE');
 const freshStart=pending.length,fresh=retry.onclick();answer(freshStart+1,body(2));await tick();answer(freshStart,{revision:2,permissions:{view:true,edit:true}});await fresh;
 assert.equal(visible.innerHTML.includes('ipqcab-overlay'),false);
 for(const field of ['modal','viewer','modalBase','modalGeneration'])assert.equal(t.get()[field],null,field);
 assert.equal(t.get().privateQuarantine,retained);assert.equal(retained.modal.name,'UNSAVED PRIVATE');
 assert(visible.innerHTML.includes('SERVER NAME'));assert(!visible.innerHTML.includes('ipqcab-modal'));assert(listeners.some(value=>value.s==='#ipqcab-line'&&value.type==='change'));
 const negative=[];
 // Missing original basis/strict owner ports must remain pre-GET rejections.
 for(const missing of ['basis','identityGeneration','captureDelivery','actor-object']){
  const bad=fixture({missingPort:['identityGeneration','captureDelivery'].includes(missing)?missing:undefined});
  if(missing!=='basis')await bad.prime();bad.t.openPrivate();
  if(missing==='actor-object')bad.sync.identity={...bad.identity};
  const before=bad.pending.length,original=bad.t.get();assert.equal(await bad.t.load(),false);assert.equal(bad.pending.length,before);
  const after=bad.t.get();assert.equal(after.working,original.working);assert.equal(after.modal,original.modal);assert(after.accessBlocked);assert(after.privateQuarantine);
  if(missing==='basis')assert.equal(after.privateQuarantine.owner,null);else assert.equal(after.privateQuarantine.owner.actor,bad.identity);
  assert(!bad.visible.innerHTML.includes('UNSAVED PRIVATE'));negative.push({missing,additionalRequests:0,retained:true});
 }
 console.log(JSON.stringify({status:'PASS_PRIVATE_MODAL_QUARANTINE',freshServerRendered:true,publicModalAndBaselineCleared:true,privateNotAutoRestored:true,negative,limits:'Full actual AB/default client/load/draw/mainHTML/retry; actual bind with synthetic DOM and fetch; no browser/API/kernel or live-data claim.'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
