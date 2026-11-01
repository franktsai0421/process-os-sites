import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
import installForegroundPorts from '../scripts/entry-performance/fixture-ports.cjs';
import {createFqcDraftLifecycleFixture} from './fqc-draft-lifecycle-route-fixture.mjs';
import * as deliveryPolicy from '../public/process/delivery-purpose.mjs';

// Production bootstrap/route/module/overview/readiness closures over synthetic
// SQLite/R2 + DOM presentation ports. Not Chromium or real-time permission push.
const read = file => fs.readFileSync(new URL('../public/process/' + file, import.meta.url), 'utf8');
const modules = ['FQCMasterUI','IQCMasterUI','IPQCABUI','IPQCCUI','ToolingUI','RoutineEquipmentUI'];
const ids = ['fqc','iqc','ipqc-ab','ipqc-c','tooling','equipment'];
const keys = ['fqc.view','iqc.view','ipqc-ab.view','ipqc-c.view','tooling.view','equipment.view'];
const plain = value => JSON.parse(JSON.stringify(value));
let route, bootstrap;
before(async () => {
  route = await createFqcDraftLifecycleFixture();
  const result = await route.request({actor:'reviewer', target:'bootstrap', suffix:'?system=quality&view=approval'});
  assert.equal(result.status,200); bootstrap=result.body;
  assert.equal(bootstrap.destination.key,'approval');
});
after(() => route?.close());
function cells(payload) { return JSON.parse(payload.values.platformUsers)[0]; }
function alterUser(payload, change) { const rows=JSON.parse(payload.values.platformUsers); change(rows[0], rows); payload.values.platformUsers=JSON.stringify(rows); }
async function fixture({mutate, status=200, actual=false, lang='zh', moduleOverride}={}) {
  class Storage {
    constructor(){this.data=new Map();}
    getItem(key){return this.data.get(key)??null;}
    setItem(key,value){this.data.set(key,String(value));}
    removeItem(key){this.data.delete(key);}
    get length(){return this.data.size;}
    key(index){return [...this.data.keys()][index]??null;}
  }
  const dom=canvasDOM(),requests=[],observers=[];
  dom.Node.prototype.replaceChildren=function(...nodes){this._text='';this.children.forEach(node=>{node.parentElement=null;});this.children=[];this.append(...nodes);};
  dom.Node.prototype.before=function(node){const p=this.parentElement;node.remove();node.parentElement=p;p.children.splice(p.children.indexOf(this),0,node);};
  const payload=plain(bootstrap);mutate?.(payload);
  let nextPayload=payload,nextStatus=status,hold=null;
  const c={...dom,console,crypto:webcrypto,URL,URLSearchParams,Response,Headers,AbortController,AbortSignal,TextEncoder,structuredClone,Storage,
    localStorage:new Storage(),sessionStorage:new Storage(),location:{search:'?system=quality&view=approval',href:'https://lifecycle.synthetic.invalid/process/?system=quality&view=approval',origin:'https://lifecycle.synthetic.invalid',pathname:'/process/'},
    setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},CustomEvent:class {constructor(type){this.type=type;}},addEventListener(){},removeEventListener(){},dispatchEvent(){},
    MutationObserver:class {constructor(fn){observers.push(fn);}observe(){}disconnect(){}},
    ProcessDeliveryPurpose:deliveryPolicy,VersionDraftUI:{preserveView:()=>()=>{},updateSync(){},date:()=>'',t:x=>x},
    ProcessDataTabs:{readyForDestination:async()=>{}},hasPermission:()=>true,
    fetch:async(url,options={})=>{
      assert.equal(options.method||'GET','GET','this readiness fixture never writes');
      const u=new URL(url,c.location.origin);requests.push(u.pathname+u.search);
      if(u.pathname==='/api/process-bootstrap') {const value=nextPayload,code=nextStatus,wait=hold;if(wait)await wait;return Response.json(value,{status:code});}
      if(!actual)throw Error('UNEXPECTED_MODULE_READ');
      const target=u.pathname==='/api/fqc/workflow'?'workflow':u.pathname==='/api/tooling/workflow'?'tooling-review':null;
      assert.ok(target,'bounded actual route targets');
      if(moduleOverride&&target==='workflow')return moduleOverride();
      const r=await route.request({actor:'reviewer',target});return Response.json(r.body,{status:r.status});
    }};
  c.window=c; c.document.documentElement.lang=lang;vm.createContext(c);
  vm.runInContext(read('shared-state.js'),c);await c.ProcessSync.ready;
  const sync=c.ProcessSync;
  vm.runInContext(read('quality-review-overview.js'),c);
  const tab=c.document.createElement('button');tab.id='approval-tab-quality';tab.innerHTML='<span class="approval-tab-count">0</span>';c.document.body.append(tab);
  const panel=c.document.createElement('section');panel.id='approval-panel-quality';panel.innerHTML=c.QualityReviewOverview.html()+ids.map(id=>`<section id="review-${id}">old private row</section>`).join('');c.document.body.append(panel);
  const reads=[],bound=[]; const moduleErrors=new Map();
  for(let i=0;i<modules.length;i++) {
    const name=modules[i],id=ids[i];
    c[name]={bindReview(p){bound.push(name);p.querySelector('#review-'+id).textContent=id+' ready';return Promise.resolve();},pendingCount:()=>2,navigation:{error:()=>moduleErrors.get(name)||null}};
  }
  if(actual){
    vm.runInContext(read('shared-draft-client.js'),c);installForegroundPorts(c);
    vm.runInContext(read('tooling.js'),c);vm.runInContext(read('fqc-master.js'),c);
  }
  const source=read('delivery-navigation.js'),start=source.indexOf('  async function readyForDestination(target){'),end=source.indexOf('  const coordinator=',start);assert(start>0&&end>start);
  vm.runInContext('const moduleNames='+JSON.stringify([...modules,'RoutineFQCUI','BOMWorkspace','ProcessAuthoringV3','ProcessUserAccess'])+';\n'+source.slice(start,end)+'\nwindow.__ready=readyForDestination;',c);
  const line=read('master-data.js').split('\n').find(x=>x.includes("for(const name of ['ToolingUI','FQCMasterUI'"));assert.ok(line);
  async function bind(){c.QualityReviewOverview.mount(panel);c.reads=reads;c.panel=panel;vm.runInContext(line,c);await Promise.all(reads);await Promise.resolve();}
  return {c,sync,panel,reads,bound,requests,moduleErrors,bind,update:()=>observers.at(-1)(),payload,
    response(value,code=200){nextPayload=value;nextStatus=code;},hold(value){hold=value;},
    ready:target=>c.__ready(target||{view:'approval',approvalTab:'quality'})};
}

void test('actual signed bootstrap excludes exactly four no-view readers; FQC actual route/module remains ready without grants or writes',async()=>{
  const before=route.row(),objects=[...route.objects],user=cells(bootstrap);
  assert.deepEqual(keys.map(k=>user.cells[k]),[true,false,false,false,false,true]);
  const denied=await route.request({actor:'reviewer',target:'tooling-review'});assert.equal(denied.status,403);assert.equal(denied.body.error,'FORBIDDEN');
  const f=await fixture({actual:true});await f.bind();await f.ready();
  assert.equal(f.c.FQCMasterUI.navigation.error(),null);
  assert.equal(f.panel.querySelector('[data-quality-review-state="ready"]')!==null,true);
  assert.equal(f.c.FQCMasterUI.pendingCount(),0);
  assert.deepEqual(f.requests,['/api/process-bootstrap?system=quality&view=approval','/api/fqc/workflow?caseMetadata=1&compact=1']);
  assert.equal(f.c.ToolingUI.navigation.error(),null,'denied reader was not started, not forgiven');
  for(const id of ['tooling','iqc','ipqc-ab','ipqc-c']) {
    assert.equal(f.panel.querySelector('[data-overview-count="'+id+'"]').textContent,'—');
    assert.equal(f.panel.querySelector('[data-overview-status="'+id+'"]').textContent,'無檢視權限');
    assert.equal(f.panel.querySelector('#review-'+id).textContent.includes('old private'),false);
  }
  assert.match(f.panel.querySelector('[data-review-total]').textContent,/4 個模組無檢視權限/);
  assert.equal(f.c.document.querySelector('.approval-tab-count').textContent,'—');
  assert.deepEqual(route.row(),before);assert.deepEqual([...route.objects],objects);
  assert.deepEqual(cells(bootstrap),user);
});

void test('no-view is omission, not clearing old module error or allowing single-module navigation',async()=>{
  const f=await fixture();const denied=Object.assign(Error('FORBIDDEN'),{status:403});f.moduleErrors.set('ToolingUI',denied);
  await f.bind();await f.ready();assert.equal(f.moduleErrors.get('ToolingUI'),denied);
  await assert.rejects(f.ready({view:'data',dataTab:'quality-mold-equipment'}),/FORBIDDEN/);
});

for(const [label,change] of [
  ['missing cells',p=>alterUser(p,u=>delete u.cells)],['missing view key',p=>alterUser(p,u=>delete u.cells['tooling.view'])],
  ['string false',p=>alterUser(p,u=>{u.cells['tooling.view']='false';})],['null view',p=>alterUser(p,u=>{u.cells['tooling.view']=null;})],
  ['disabled actor',p=>alterUser(p,u=>{u.enabled=false;})],['wrong actor',p=>alterUser(p,u=>{u.id='other';})],
  ['duplicate actor',p=>alterUser(p,(_u,rows)=>rows.push({...rows[0]}))],['invalid users JSON',p=>{p.values.platformUsers='{';}],
  ['not a protected server',p=>{p.serverProtected=false;}],['wrong destination',p=>{p.destination.view='data';}],
  ['bad destination key',p=>{p.destination.key='quality:data';}],['legacy payload',p=>{p.deliveryProjection=false;}],
]) void test('unknown bootstrap '+label+' cannot skip a reader or swallow failure',async()=>{
  const f=await fixture({mutate:change});assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
  f.moduleErrors.set('ToolingUI',Error('READ_FAILED'));await f.bind();assert.equal(f.bound.includes('ToolingUI'),true);
  await assert.rejects(f.ready(),/READ_FAILED/);
});
for(const status of [401,403,500]) void test('bootstrap HTTP '+status+' never creates no-view evidence',async()=>{
  const f=await fixture({status});assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
});
for(const [label,change] of [
  ['same id new identity object',f=>{f.sync.identity={...f.sync.identity};}],
  ['same object different id',f=>{f.sync.identity.id='other';}],
  ['same actor new epoch',f=>f.sync.setPlatformIdentity(f.sync.identity)],
  ['suspended destination',f=>f.sync.suspendDestination()],
  ['expired identity',f=>{f.sync.expired=true;}],['load error',f=>{f.sync.loadError='unavailable';}],
  ['untrusted applyServerState',f=>f.sync.applyServerState(f.payload)],
  ['different destination system',f=>{f.sync.destination.system=f.sync.destination.system==='process'?'quality':'process';}],
  ['different panel',f=>f.panel.remove()],
]) void test('omission proof expires for '+label,async()=>{
  const f=await fixture();await f.bind();assert.equal(f.c.QualityReviewOverview.readerOmitted('ToolingUI'),true);
  change(f);await assert.rejects(f.ready(),/QUALITY_REVIEW_CONTEXT_CHANGED/);
});
void test('copied proof, cross-module, cross-runtime and public cells mutation never mint a denial',async()=>{
  const f=await fixture(),g=await fixture(),proof=f.sync.qualityReviewDenial('ToolingUI');assert.ok(proof);
  assert.equal(f.sync.isCurrentQualityReviewDenial({...proof},'ToolingUI'),false);
  assert.equal(f.sync.isCurrentQualityReviewDenial(proof,'FQCMasterUI'),false);
  assert.equal(g.sync.isCurrentQualityReviewDenial(proof,'ToolingUI'),false);
  f.c.hasPermission=()=>false;f.sync.identity.cells={'fqc.view':false};f.c.localStorage.setItem('platformUsers',JSON.stringify([{id:f.sync.identity.id,enabled:true,cells:{'fqc.view':false}}]));
  assert.equal(f.sync.qualityReviewDenial('FQCMasterUI'),null);
});
for(const status of [401,403,500]) void test('a readable sibling failing with '+status+' remains fatal, including revoked access',async()=>{
  const f=await fixture({mutate:p=>alterUser(p,u=>{u.cells['tooling.view']=true;})});
  const failure=Object.assign(Error('READ_'+status),{status});f.moduleErrors.set('ToolingUI',failure);
  await f.bind();assert.equal(f.bound.includes('ToolingUI'),true);await assert.rejects(f.ready(),new RegExp('READ_'+status));
  assert.equal(f.c.QualityReviewOverview.omitDeniedReader(f.panel,'ToolingUI'),false);
});
void test('read started under unknown access cannot later be relabelled denied',async()=>{
  const f=await fixture({mutate:p=>alterUser(p,u=>delete u.cells)});await f.bind();
  f.response(plain(bootstrap));await f.sync.refresh();
  assert.ok(f.sync.qualityReviewDenial('ToolingUI'));
  assert.equal(f.c.QualityReviewOverview.omitDeniedReader(f.panel,'ToolingUI'),false);
  f.moduleErrors.set('ToolingUI',Error('MALFORMED_REQUIRED_DATA'));await assert.rejects(f.ready(),/MALFORMED_REQUIRED_DATA/);
});
void test('new bootstrap in flight invalidates omission; late old response cannot bless new identity',async()=>{
  const f=await fixture();await f.bind();let release;f.hold(new Promise(resolve=>{release=resolve;}));
  const refresh=f.sync.refresh();await Promise.resolve();assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
  await assert.rejects(f.ready(),/QUALITY_REVIEW_CONTEXT_CHANGED/);
  f.sync.setPlatformIdentity(f.sync.identity);release();await refresh;
  assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
});
void test('successful prepared destination requires new exact proof; previous delivery token remains revoked',async()=>{
  const f=await fixture(),proof=f.sync.qualityReviewDenial('ToolingUI');
  const handle=await f.sync.prepareDestination({system:'quality',view:'approval'});f.sync.commitDestination(handle);
  assert.equal(f.sync.isCurrentQualityReviewDenial(proof,'ToolingUI'),false);
  assert.ok(f.sync.qualityReviewDenial('ToolingUI'));await f.bind();await f.ready();
});
void test('Vietnamese denied sections are explicit, unknown counts are not fabricated zero',async()=>{
  const f=await fixture({lang:'vi'});await f.bind();await f.ready();
  assert.equal(f.panel.querySelector('[data-overview-status="tooling"]').textContent,'Không có quyền xem');
  assert.equal(f.panel.querySelector('[data-overview-count="tooling"]').textContent,'—');
  assert.match(f.panel.querySelector('[data-review-total]').textContent,/4 mô-đun không có quyền xem/);
});

for(const [label,reply] of [
  ['revoked 403',()=>Response.json({error:'FORBIDDEN'},{status:403})],
  ['expired 401',()=>Response.json({error:'LOGIN_REQUIRED'},{status:401})],
  ['server 500',()=>Response.json({error:'SERVER_ERROR'},{status:500})],
  ['missing control',()=>Response.json({revision:1,permissions:{view:true},control:null})],
  ['network failure',()=>{throw Error('NETWORK_FAILURE');}],
]) void test('whole authorized FQC reader '+label+' still fails quality readiness',async()=>{
  const f=await fixture({actual:true,moduleOverride:reply});await f.bind();
  assert.ok(f.c.FQCMasterUI.navigation.error());
  assert.equal(f.c.QualityReviewOverview.readerOmitted('FQCMasterUI'),false);
  await assert.rejects(f.ready());
  assert.ok(f.panel.querySelector('[data-quality-review-state="error"]'));
  assert.equal(f.panel.querySelector('[data-overview-count="fqc"]').textContent,'—');
});
for(const status of [401,403,500]) void test('failed refresh '+status+' revokes an existing negative admission',async()=>{
  const f=await fixture();await f.bind();const token=f.sync.qualityReviewDenial('ToolingUI');
  f.response({error:'UNAVAILABLE'},status);if(status===500)await assert.rejects(f.sync.refresh());else {await f.sync.refresh();assert.equal(f.sync.requiresReload,true);assert.equal(f.sync.expired,true);}
  assert.equal(f.sync.isCurrentQualityReviewDenial(token,'ToolingUI'),false);
  await assert.rejects(f.ready(),/QUALITY_REVIEW_CONTEXT_CHANGED/);
});

void test('an older concurrent bootstrap completion cannot mint a new omission after a newer read',async()=>{
  const f=await fixture();let release;f.hold(new Promise(resolve=>{release=resolve;}));
  const old=f.sync.refresh();await Promise.resolve();
  f.hold(null);const next=plain(bootstrap);alterUser(next,u=>{u.cells['tooling.view']=true;});f.response(next);
  await f.sync.refresh();assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
  release();await old;assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null,'late old no-view response is not new admission');
});

for(const method of ['load','prepared']) void test('inflight exact identity object '+method,async()=>{
 const f=await fixture();let release;f.hold(new Promise(resolve=>{release=resolve;}));
 const attempt=method==='load'?f.sync.refresh():f.sync.prepareDestination({system:'quality',view:'approval'});
 await Promise.resolve();f.sync.identity={...f.sync.identity};release();const result=await attempt;
 if(method==='prepared')f.sync.commitDestination(result);
 assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null,'old identity object response is not new negative admission');
});

for(const boundary of ['failed refresh','failed prepare','untrusted apply','newer prepare']) void test('old prepared negative admission cannot revive after '+boundary,async()=>{
  const f=await fixture(),target={system:'quality',view:'approval'};
  const old=await f.sync.prepareDestination(target);
  assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null,'new preparation does not reuse old admission');
  if(boundary==='untrusted apply')f.sync.applyServerState(f.payload);
  else if(boundary==='newer prepare')await f.sync.prepareDestination(target);
  else {f.response({error:'UNAVAILABLE'},500);await assert.rejects(boundary==='failed refresh'?f.sync.refresh():f.sync.prepareDestination(target));}
  // Existing generic commit semantics are outside this correction. Even when
  // it accepts an older handle, it must not produce a new omission capability.
  f.sync.commitDestination(old);
  assert.equal(f.sync.qualityReviewDenial('ToolingUI'),null);
});
