import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { canvasDOM } from '../scripts/login-reentry-dom.mjs';

// Complete production modules, shared client and real TS routes over isolated
// in-memory SQLite/R2. DOM and clock are dependency ports, not browser evidence.
// Injection only exposes closures; no production function is replaced/extracted.
const require=createRequire(import.meta.url),routeFixture=require('../scripts/fqc-apply-fixture.cjs');
const read=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const permissions=['view','edit','create','save','submit','withdraw','approve','return','delete','history'];
const names={FQC:'fqc-master.js',IQC:'iqc-master.js'};
const fields={FQC:'name',IQC:'nameVi'};
const initialName={FQC:'Synthetic error',IQC:'Synthetic IQC error'};
class Storage {
  items=new Map();get length(){return this.items.size;}key(i){return [...this.items.keys()][i]??null;}
  getItem(key){return this.items.get(key)??null;}setItem(key,value){this.items.set(key,String(value));}removeItem(key){this.items.delete(key);}
}
async function fixture(kind,{holdInitial=false}={}){
  const routes=await routeFixture();
  if(kind==='IQC')await routes.mutate(values=>{
    const users=JSON.parse(values.platformUsers);for(const user of users)for(const key of permissions)user.accessOverrides['iqc.'+key]=true;values.platformUsers=JSON.stringify(users);
    const snapshot={categories:[{id:'cat',nameVi:'Synthetic'}],suppliers:[],parts:[{id:'part',code:'P',nameVi:'Synthetic part',categoryId:'cat',supplierIds:[],photos:[]}],errors:[{id:'error',code:'P-IQC-L1',partCode:'P',nameVi:initialName.IQC}],items:[]};
    values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'active',versions:[{id:'active',number:1,status:'approved',snapshot,revision:1,history:[]}],issues:[],reservedErrorCodes:['P-IQC-L1'],reservedCheckNos:[]});
  });
  const endpoint='/api/'+kind.toLowerCase()+'/workflow';
  const call=kind==='FQC'?(url,options)=>routes.call(url,options):async(url,options={})=>{
    const request=new Request(new URL(url,'https://synthetic.invalid'),{...options,headers:{origin:'https://synthetic.invalid','content-type':'application/json',cookie:routes.cookies.editor,...options.headers}});
    return routes.load('app/api/iqc/workflow/route.ts')[request.method](request);
  };
  const started=await call(endpoint,{method:'POST',body:JSON.stringify({action:'begin'})});assert.equal(started.status,200);
  const dom=canvasDOM(),doc=dom.document;doc.visibilityState='visible';doc.hidden=false;doc.documentElement.lang='zh';doc.hasFocus=()=>focused;
  Object.defineProperty(dom.Node.prototype,'options',{get(){return this.children;}});
  Object.defineProperty(dom.Node.prototype,'firstChild',{get(){return this.children[0]||null;}});
  dom.Node.prototype.before=function(node){const parent=this.parentElement;if(!parent)return;node.remove();node.parentElement=parent;parent.children.splice(parent.children.indexOf(this),0,node);};
  const main=doc.createElement('main');main.id='data-content';main.dataset.activeTab='quality-'+kind.toLowerCase();doc.body.append(main);
  let epoch=1,delivery=1,focused=true,elapsed=0,sequence=0,intercept=null,hold=holdInitial;
  const requests=[],timers=new Map(),held=[],factoryCalls=[],intervalCalls=[],localStorage=new Storage(),sessionStorage=new Storage();
  const c={...dom,window:null,console,crypto:webcrypto,TextEncoder,Uint8Array,URL,URLSearchParams,Request,Response,Headers,AbortController,AbortSignal,structuredClone,Map,Set,Error,Promise,JSON,Date,Number,Math,queueMicrotask,
    CSS:{escape:String},NodeFilter:{SHOW_TEXT:4},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    FormData:class{constructor(form){this.entries=[...form.querySelectorAll('[name]')].filter(n=>!n.disabled&&(!['checkbox','radio'].includes(n.type)||n.checked)).map(n=>[n.getAttribute('name'),n.value]);}get(k){return this.entries.find(e=>e[0]===k)?.[1]??null;}getAll(k){return this.entries.filter(e=>e[0]===k).map(e=>e[1]);}},
    location:{origin:'https://synthetic.invalid',href:'https://synthetic.invalid/process/',pathname:'/process/'},state:{view:'data',dataTab:'quality-'+kind.toLowerCase()},scrollY:0,scrollTo(){},
    performance:{now:()=>elapsed},setTimeout(fn,ms){assert.equal(typeof fn,'function');assert(Number.isFinite(ms)&&ms>=0);const id=++sequence;timers.set(id,{fn,due:elapsed+ms,ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval(...args){intervalCalls.push(args);throw Error('PERIODIC_TIMER_FORBIDDEN');},clearInterval(){},
    localStorage,sessionStorage,ProcessSync:{identity:{id:'editor',name:'Synthetic editor',role:'staff'},identityGeneration:()=>epoch,captureDelivery:()=>({epoch,delivery}),isCurrentDelivery:o=>o.epoch===epoch&&o.delivery===delivery,platformHeaders:()=>({}),requiresReload:false},
    hasPermission:()=>true,confirm:()=>true,toast(){},alert(){},bindDataInner(){},render(){},navigate(){throw Error('UNEXPECTED_NAVIGATION');}};
  dom.events(c);c.window=c;c.fetch=async(url,options={})=>{
    const request={url:String(url),method:options.method||'GET',body:options.body};requests.push(request);
    const send=()=>call(url,options);
    if(hold&&String(url).startsWith(endpoint)&&request.method==='GET'){const response=await send();await new Promise(resolve=>held.push(resolve));return response;}
    return intercept?intercept(request,send):send();
  };
  vm.createContext(c);
  for(const name of ['local-draft-recovery.js','local-draft-recovery-session.js','shared-draft-client.js','version-draft-ui.js'])vm.runInContext(read(name),c,{filename:name});
  c.createForegroundPoll=(...args)=>{factoryCalls.push(args);throw Error('PERIODIC_FACTORY_FORBIDDEN');};
  const hook=kind==='FQC'?`host.__probe={transport,loadShared,sharedAction,openErrorModal,render,selected,library,ui,localDirty,currentReadOwner};`:
    `host.__probe={transport,load,post,checkOperation,editError,render,selected,snap,ui,mayEdit,state:()=>({control,revision,readDenied,localSnapshot,localGeneration,loadSequence})};`;
  const source=read(names[kind]),tail='})(window);';assert.equal(source.split(tail).length,2,'unique closure export');
  vm.runInContext(source.replace(tail,hook+tail),c,{filename:names[kind]});
  const api=c[kind+'MasterUI'],probe=c.__probe;
  const enter=()=>{if(kind==='IQC')main.innerHTML=api.html();return kind==='FQC'?api.bind(main):api.mount(main);};
  async function advance(ms){const end=elapsed+ms;let count=0;while(true){const next=[...timers].filter(([,timer])=>timer.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;assert(++count<100,'bounded deterministic timer drain');timers.delete(next[0]);elapsed=next[1].due;await next[1].fn();await tick();}elapsed=end;await tick();}
  return{kind,c,doc,main,api,probe,routes,call,requests,timers,factoryCalls,intervalCalls,sessionStorage,localStorage,held,enter,advance,
    intercept(value){intercept=value;},release(){hold=false;for(const release of held.splice(0))release();},hold(){hold=true;},
    rotate(mode){if(mode==='actor')c.ProcessSync.identity={id:'other',name:'Other',role:'staff'};if(mode==='epoch')epoch++;if(mode==='delivery')delivery++;if(mode==='same-id'){epoch++;c.ProcessSync.identity={...c.ProcessSync.identity};}},
    focus(value){focused=value;c.dispatchEvent({type:value?'focus':'blur'});},visible(value){doc.visibilityState=value?'visible':'hidden';doc.dispatchEvent({type:'visibilitychange'});},
    flow:()=>kind==='FQC'?probe.library().workflow:probe.state().control?.workflow,
    error:()=>api.navigation.error(),getReadCount:()=>requests.filter(r=>r.method==='GET').length,posts:()=>requests.filter(r=>r.method==='POST'),
    close(){routes.close();}};
}
async function warmed(kind){const f=await fixture(kind);await f.enter();assert.equal(f.error(),null);assert(f.flow());assert(f.probe.transport().permission('view'));return f;}
function openForm(f){if(f.kind==='FQC')f.probe.openErrorModal('error');else f.probe.editError('error');const form=f.doc.querySelector(f.kind==='FQC'?'.fqc-modal-form':'#iqc-error-form');assert(form,'real module opens its error editor');return form;}
async function stage(f,value){const form=openForm(f);form.querySelector('[name="'+fields[f.kind]+'"]').value=value;await form.onsubmit({preventDefault(){},target:form,currentTarget:form});return form;}
const save=f=>f.kind==='FQC'?f.probe.sharedAction('save'):f.probe.post('save');
for(const kind of ['FQC','IQC'])void test(`${kind}: complete module initializes, enters, idles seven days, focus/reentry/reset never starts a periodic factory`,async()=>{
  const f=await warmed(kind);try{
    const count=f.getReadCount();assert.equal(count,kind==='FQC'?3:1,'exact entry reads');
    await f.advance(7*24*3600*1000);f.focus(false);f.visible(false);f.focus(true);f.visible(true);await f.advance(24*3600*1000);
    assert.equal(f.getReadCount(),count);assert.equal(f.posts().length,0);assert.equal(f.factoryCalls.length,0);assert.equal(f.intervalCalls.length,0);
    f.api.navigation.reset();await f.enter();assert.equal(f.getReadCount(),count*2);await f.advance(3600*1000);assert.equal(f.getReadCount(),count*2);assert.equal(f.factoryCalls.length,0);
  }finally{f.close();}
});
for(const kind of ['FQC','IQC'])for(const fault of [401,403,'offline'])void test(`${kind}: entry ${fault} fails closed, stays idle, explicit Retry alone reloads`,async()=>{
  const f=await fixture(kind);let denied=true;f.intercept((request,send)=>{if(denied){if(fault==='offline')throw Error('SYNTHETIC_OFFLINE');return Response.json({error:'FORBIDDEN'},{status:fault});}return send();});
  try{
    await f.enter();assert(f.error());assert.equal(f.getReadCount(),1);assert(!f.main.querySelector(kind==='FQC'?'#fqc-save':'#iqc-save'));
    const before=f.getReadCount();await f.advance(7*24*3600*1000);assert.equal(f.getReadCount(),before);
    denied=false;const retry=f.main.querySelector(kind==='FQC'?'#fqc-load-retry':'#iqc-retry');assert(retry);await retry.click();
    assert.equal(f.error(),null);assert.equal(f.getReadCount(),before+(kind==='FQC'?3:1));assert(f.probe.transport().permission('view'));
    await f.advance(3600*1000);assert.equal(f.getReadCount(),before+(kind==='FQC'?3:1));assert.equal(f.posts().length,0);
  }finally{f.close();}
});
for(const permission of ['ab.view','equipment.view'])void test(`FQC: denied ${permission} keeps dependency order and explicit Retry without any auto-grant`,async()=>{
  const f=await fixture('FQC');let allowed=false;f.c.hasPermission=key=>key!==permission||allowed;
  try{await f.enter();assert.match(f.error().message,/AB.*檢具/);assert.equal(f.getReadCount(),1);assert.equal(f.posts().length,0);await f.advance(86400000);assert.equal(f.getReadCount(),1);
    allowed=true;await f.main.querySelector('#fqc-load-retry').click();assert.equal(f.error(),null);assert.equal(f.getReadCount(),4);assert.equal(f.posts().length,0);
  }finally{f.close();}
});
for(const kind of ['FQC','IQC'])for(const mode of ['actor','epoch','delivery','same-id','reentry'])for(const lateStatus of [200,403])void test(`${kind}: late ${lateStatus} entry after ${mode} cannot replace the reentered owner`,async()=>{
  const f=await fixture(kind);let release,arrive,entered=false;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>arrive=resolve);
  f.intercept(async(request,send)=>{const response=await send();if(!entered){entered=true;arrive();await gate;return lateStatus===200?response:Response.json({error:'OLD_DENIAL'},{status:lateStatus});}return response;});
  try{
    const old=f.enter();await ready;assert(entered);
    if(mode!=='reentry')f.rotate(mode);f.api.navigation.reset();await f.enter();assert.equal(f.error(),null);
    const html=f.main.innerHTML,flow=JSON.stringify(f.flow()),count=f.getReadCount();release();await old;
    assert.equal(f.main.innerHTML,html);assert.equal(JSON.stringify(f.flow()),flow);assert.equal(f.error(),null);assert.equal(f.getReadCount(),count);
    await f.advance(86400000);assert.equal(f.getReadCount(),count);assert.equal(f.posts().length,0);
  }finally{release();f.close();}
});
for(const kind of ['FQC','IQC'])void test(`${kind}: focused new typing and staged local input survive idle; Apply is RAM-only and explicit Save remains authoritative`,async()=>{
  const f=await warmed(kind);try{
    const form=openForm(f),input=form.querySelector('[name="'+fields[kind]+'"]'),count=f.getReadCount();input.value='中文 Việt new typing';input.focus();
    await f.advance(7*86400000);f.focus(false);f.focus(true);await f.advance(30000);
    assert.equal(input.value,'中文 Việt new typing');assert.equal(f.doc.activeElement,input);assert(form.isConnected);assert.equal(f.getReadCount(),count);assert.equal(f.posts().length,0);
    await form.onsubmit({preventDefault(){},target:form,currentTarget:form});assert.equal(f.posts().length,0,'Apply is local');assert.equal(f.flow().working.errors[0][fields[kind]],initialName[kind]);
    await f.advance(86400000);assert.equal(f.getReadCount(),count);await save(f);assert.equal(f.posts().length,1);assert.equal(JSON.parse(f.posts()[0].body).command.action,'save');
    assert.equal(f.flow().saved.content.errors[0][fields[kind]],'中文 Việt new typing');const after=f.getReadCount();await f.advance(86400000);assert.equal(f.getReadCount(),after);
  }finally{f.close();}
});
for(const kind of ['FQC','IQC'])void test(`${kind}: server permission revocation still refuses cached Save and idle performs no follow-up`,async()=>{
  const f=await warmed(kind);try{
    await stage(f,'Unauthorized value');await f.routes.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides[kind.toLowerCase()+'.edit']=false;values.platformUsers=JSON.stringify(users);});
    const row=f.routes.db.prepare('SELECT * FROM shared_state').get(),objects=[...f.routes.objects];await assert.rejects(save(f),/FORBIDDEN|PERMISSION/);
    assert.deepEqual(f.routes.db.prepare('SELECT * FROM shared_state').get(),row);assert.deepEqual([...f.routes.objects],objects);assert.equal(f.posts().length,0);
    const count=f.getReadCount();await f.advance(7*86400000);assert.equal(f.getReadCount(),count);assert.equal(f.posts().length,0);
  }finally{f.close();}
});
for(const kind of ['FQC','IQC'])void test(`${kind}: lost Save ACK preserves original operation/generation; 404 and seven idle days never resend, explicit receipt alone settles`,async()=>{
  const f=await warmed(kind);let hide=true,lost=true;
  f.intercept(async(request,send)=>{if(request.url.includes('operationId=')&&hide)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const response=await send();if(request.method==='POST'&&lost){lost=false;throw Error('SYNTHETIC_LOST_ACK');}return response;});
  async function query(){if(kind==='IQC')return f.probe.checkOperation().catch(error=>error);const button=f.main.querySelector('#fqc-check-result');assert(button,'actual FQC original-result button');assert.equal(button.disabled,false);const listeners=[...f.c.eventSets.keys()].filter(key=>key.target===button&&key.type==='click');assert.equal(listeners.length,1,'exact actual receipt button listener');await listeners[0].fn({type:'click',target:button});assert.equal(f.probe.ui.saving,false);}
  try{
    await stage(f,'Saved before lost ACK');await assert.rejects(save(f),/RESULT_UNKNOWN/);assert.equal(f.posts().length,1);const command=JSON.parse(f.posts()[0].body).command;assert(command.operationId);assert(command.generation);
    assert(f.probe.transport().hasUnknown());const records=[...f.sessionStorage.items],count=f.getReadCount();assert(records.some(([key])=>key.includes(command.operationId)));
    await f.advance(7*86400000);assert.equal(f.getReadCount(),count);assert.deepEqual([...f.sessionStorage.items],records);
    await assert.rejects(save(f),/UNKNOWN/);assert.equal(f.posts().length,1);assert.equal(f.getReadCount(),count);
    await query();assert(f.probe.transport().hasUnknown());assert.equal(f.posts().length,1);assert.equal(f.getReadCount(),count+1);assert.deepEqual([...f.sessionStorage.items],records);
    const queries=f.requests.filter(r=>r.url.includes('operationId='));assert(queries.length>=2);for(const request of queries){const url=new URL(request.url,'https://synthetic.invalid');assert.equal(url.searchParams.get('operationId'),command.operationId);assert.equal(f.probe.transport().departureUnknown().generation,command.generation);}
    hide=false;await query();assert.equal(f.probe.transport().hasUnknown(),false);assert.equal(f.posts().length,1);assert.equal(f.flow().saved.content.errors[0][fields[kind]],'Saved before lost ACK');
    const after=f.getReadCount();await f.advance(86400000);assert.equal(f.getReadCount(),after);assert.equal(f.factoryCalls.length,0);assert.equal(f.intervalCalls.length,0);
  }finally{f.close();}
});
void test('neither quality master references any periodic producer',()=>{
  for(const name of Object.values(names))assert.doesNotMatch(read(name),/createForegroundPoll|setInterval\s*\(|pollShared|sharedPoll|scheduleRefresh|pollTimer/);
});
for(const kind of ['FQC','IQC'])void test(`${kind}: newly typed form survives a late authorized notification/permission response without read rescheduling`,async()=>{
  const f=await warmed(kind);let release,arrive;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>arrive=resolve);
  f.intercept(async(_request,send)=>{const response=await send();arrive();await gate;return response;});
  try{
    const original=f.flow(),count=f.getReadCount();let pending;
    if(kind==='FQC')f.c.dispatchEvent({type:'process-shared-state-updated'});else pending=f.probe.transport().permissions();
    await ready;const form=openForm(f),input=form.querySelector('[name="'+fields[kind]+'"]');input.value='New input after read dispatch';input.focus();release();if(pending)await pending;await tick();
    assert.equal(f.flow(),original);assert(form.isConnected);assert.equal(input.value,'New input after read dispatch');assert.equal(f.doc.activeElement,input);assert.equal(f.posts().length,0);assert.equal(f.getReadCount(),count+1);
    await f.advance(86400000);assert.equal(f.getReadCount(),count+1);assert.equal(f.factoryCalls.length,0);assert.equal(f.intervalCalls.length,0);
  }finally{release();f.close();}
});
