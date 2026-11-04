import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const routeFixture = require('../scripts/fqc-apply-fixture.cjs');
const {fixture: moduleFixture} = require('../scripts/test-fqc-feedback-races.cjs');
// Same production FQC module + recovery helpers + shared client + real TypeScript
// route/kernel over synthetic SQLite/R2. DOM, timer, VersionDraftUI mount and
// UI hasPermission ports are synthetic; server permission checks remain real.
// This is not native browser, live latency, or employee-data acceptance.
const tick = () => new Promise(setImmediate);
const plain = value => JSON.parse(JSON.stringify(value));
const posts = f => f.requests.filter(r => r.method === 'POST' && JSON.parse(r.body).command);
const command = row => JSON.parse(row.body).command;
const codes = (flow, id = 'item') => flow.working.items.find(row => row.id === id).productCodes;
async function until(predicate, label) {
  const deadline=performance.now()+5000;
  while(performance.now()<deadline) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,5)); }
  assert.fail('Missing required synthetic event: ' + label);
}
async function seed() {
  const f = await routeFixture();
  await f.mutate(values => {
    const q = JSON.parse(values.qualityMasterControl), content = q.libraries.fqc.versions[0].snapshot;
    content.items[0].rule = {cadence:'batch', batchKind:'fixed_count', fixedCount:1};
    content.items.push({...structuredClone(content.items[0]), id:'item2', checkNo:'SYN-FQC-L1-02', name:'Synthetic second item'});
    const m = JSON.parse(values.masterDataControl);
    for (const code of ['SYN-Q','SYN-R']) m.active.AB.products.push({...m.active.AB.products[0], code, name:'Synthetic '+code});
    m.versions[0].snapshot = structuredClone(m.active.AB);
    values.masterDataControl = JSON.stringify(m); values.qualityMasterControl = JSON.stringify(q);
  });
  return f;
}
async function mount(f, actor, intercept = null, session) {
  const initial = await f.call('/api/fqc/workflow?caseMetadata=1', {}, actor);
  assert.equal(initial.status, 200);
  const wire = [];
  const ui = await moduleFixture({initialControl:(await initial.json()).control,
    identityUser:{id:actor,name:'Synthetic '+actor,role:'staff'}, session,catalogProducts:['SYN-P','SYN-Q','SYN-R'].map(code=>({code,name:code,category:'SYN',line:'A'})),
    send:async (url,options={}) => {
      const start = performance.now();
      const request = {actor, method:options.method||'GET', url:String(url), requestBytes:Buffer.byteLength(options.body||'')}; wire.push(request);
      try {
        const send = () => f.call(url,options,actor);
        const res = intercept ? await intercept(url,options,send) : await send();
        request.status=res.status; request.responseBytes=(await res.clone().arrayBuffer()).byteLength; return res;
      } catch (error) {request.transportFailure=true; throw error;}
      finally {request.syntheticVmMs=performance.now()-start;}
    }});
  const advisories=[];
  ui.c.alert=message=>{assert.equal(message,'目前沒有其他已啟用的審核人，仍可送審。具審核權限者可經確認後自審。');advisories.push(message);};
  return Object.assign(ui,{wire,advisories});
}
async function pair(f) {
  const a = await mount(f,'editor'); await a.c.__fqcTest.sharedAction('begin');
  const b = await mount(f,'other');
  assert.notEqual(a.c.ProcessSync.identity.id,b.c.ProcessSync.identity.id);
  assert.equal(a.library.workflow.generation,b.library.workflow.generation);
  return {a,b};
}
async function choose(ui, id='item') {
  await ui.c.__fqcTest.recoverySession().ready; await tick();
  const cell = ui.main.querySelector(`[data-matrix-item="${id}"]`);
  assert(cell,'required actual matrix cell'); assert.equal(cell.disabled,false);
  await cell.click(); assert.equal(cell.textContent,'✓'); assert.equal(ui.c.__fqcTest.matrixDirty(),true);
  return cell;
}
async function checkResult(ui) {
  const button=ui.main.querySelector('#fqc-check-result');assert(button,'required original-operation result control');
  await button.click();await until(()=>!ui.c.__fqcTest.ui.saving,'explicit original receipt query');
}
async function holdFirstCas(f) {
  let release, held=false;
  f.hooks.run = async sql => {
    if (held || !sql.startsWith('UPDATE shared_state')) return;
    held=true; await new Promise(resolve => {release=resolve;});
  };
  return {wait:()=>until(()=>held,'first actual CAS paused'), release:()=>release()};
}
function report(t, ui, name) {
  t.diagnostic(JSON.stringify({layer:'ACTUAL_ROUTE_MODULE_SYNTHETIC_DOM_NOT_BROWSER',scenario:name,
    requests:ui.wire.length,gets:ui.wire.filter(r=>r.method==='GET').length,posts:ui.wire.filter(r=>r.method==='POST').length,
    requestBytes:ui.wire.reduce((n,r)=>n+r.requestBytes,0),responseBytes:ui.wire.reduce((n,r)=>n+(r.responseBytes||0),0),
    measurementWindow:'module transport since synthetic mount; excludes fixture pre-read, seed and state oracle',
    syntheticVmMs:ui.wire.reduce((n,r)=>n+r.syntheticVmMs,0),notLiveLatency:true}));
}

void test('two signed actors overlap different-row matrix Save at real CAS and retain both saved choices', async t => {
  const f=await seed(); try {
    const {a,b}=await pair(f),before=posts(f).length;
    await choose(a,'item'); await choose(b,'item2'); assert.equal(posts(f).length,before);
    const gate=await holdFirstCas(f), first=a.c.__fqcTest.sharedAction('save'); await gate.wait();
    await b.c.__fqcTest.sharedAction('save'); gate.release(); await first;
    const flow=(await f.state()).workflow;
    assert.deepEqual(codes(flow),['SYN-P']); assert.deepEqual(codes(flow,'item2'),['SYN-P']); assert.deepEqual(flow.saved.content,flow.working);assert.equal(flow.saves.length,2);
    assert.equal(a.c.__fqcTest.matrixDirty(),false); assert.equal(b.c.__fqcTest.matrixDirty(),false);
    const sent=posts(f).slice(before); assert.equal(sent.length,2); assert.deepEqual(new Set(sent.map(r=>r.actor)),new Set(['editor','other']));
    assert.notEqual(command(sent[0]).operationId,command(sent[1]).operationId); assert.notEqual(command(sent[0]).clientId,command(sent[1]).clientId);
    assert(sent.every(r=>r.status===200));assert(sent.every(r=>command(r).action==='save'&&command(r).moduleAction==='save-local-v1'));assert(sent.every(r=>command(r).input.matrixCells.length===1)); assert.equal(f.events.filter(e=>e.kind==='sql'&&e.sql.startsWith('UPDATE shared_state')).length,4,'Begin plus two commits plus one actual CAS retry');
    assert.deepEqual(a.wire.slice(-2).map(r=>r.method),['POST','GET']);assert.deepEqual(b.wire.slice(-2).map(r=>r.method),['POST','GET']);
    report(t,a,'actor-A-different-row'); report(t,b,'actor-B-different-row');
  } finally {f.close();}
});

void test('same matrix selections may commit twice without guard conflict or duplicate saved snapshot',async()=>{
 const f=await seed();try{const {a,b}=await pair(f);await choose(a);await choose(b);const before=posts(f).length;await a.c.__fqcTest.sharedAction('save');await b.c.__fqcTest.sharedAction('save');assert(posts(f).slice(before).every(r=>r.status===200));assert.equal(a.c.__fqcTest.matrixDirty(),false);assert.equal(b.c.__fqcTest.matrixDirty(),false);assert.deepEqual(codes((await f.state()).workflow),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);assert.equal((await f.state()).workflow.saves.length,1);}finally{f.close();}
});

function localAssignment(itemId,productCode,base,value){return {moduleAction:'save-local-v1',patches:[],guards:[],input:{matrixCells:[{itemId,productCode,base,value}]}};}
function assignment(id, next, previous) {
  return {patches:[{op:'set',path:['items',{id},'productCodes'],value:next}],guards:[{path:['items',{id},'productCodes'],value:previous}]};
}
void test('stale local matrix preserves another product on the same row',async()=>{
 const f=await seed();try{const {a,b}=await pair(f);await choose(a);await b.c.__fqcTest.transport().command(b.library.workflow.generation,'apply',assignment('item',['SYN-Q'],[]));await a.c.__fqcTest.sharedAction('save');assert.equal(posts(f).at(-1).status,200);assert.deepEqual(new Set(codes((await f.state()).workflow)),new Set(['SYN-P','SYN-Q']));assert.equal(a.c.__fqcTest.matrixDirty(),false);assert.equal(a.main.querySelector('#fqc-matrix-reconcile').hidden,true);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);}finally{f.close();}
});

void test('discarding unsent local selection does not write or change peer working',async()=>{
 const f=await seed();try{const {a,b}=await pair(f);await choose(a);await b.c.__fqcTest.transport().command(b.library.workflow.generation,'apply',assignment('item',['SYN-Q'],[]));const before=posts(f).length;await a.main.querySelector('#fqc-matrix-discard').click();await until(()=>!a.c.__fqcTest.ui.saving,'discard');assert.equal(posts(f).length,before);assert.equal(a.c.__fqcTest.matrixDirty(),false);assert.deepEqual(codes((await f.state()).workflow),['SYN-Q']);}finally{f.close();}
});

void test('one matrix Save is visible to a fresh other actor; later local input stays separate until saved', async t => {
  const f=await seed(); try {
    const {a,b}=await pair(f); await choose(a);const saveStart=a.wire.length;await a.c.__fqcTest.sharedAction('save');
    assert.deepEqual(a.wire.slice(saveStart).map(r=>r.method),['POST','GET']);const flow=(await f.state()).workflow,saved=plain(flow.saved);
    assert.deepEqual(saved.content,plain(flow.working)); assert.equal(saved.actor.id,'editor');
    const reload=await mount(f,'other');assert.deepEqual(plain(reload.library.workflow.saved),saved);assert.deepEqual(codes(reload.library.workflow),['SYN-P']);
    assert.equal(reload.main.querySelector('[data-matrix-item="item"]').textContent,'✓');
    const before=posts(f).length;await choose(b,'item2');assert.equal(posts(f).length,before);assert.equal(b.c.__fqcTest.matrixDirty(),true);
    assert.deepEqual(plain((await f.state()).workflow.saved),saved);assert.deepEqual(codes((await f.state()).workflow,'item2'),[]);
    await b.c.__fqcTest.sharedAction('save');const merged=(await f.state()).workflow;assert.deepEqual(codes(merged),['SYN-P']);assert.deepEqual(codes(merged,'item2'),['SYN-P']);assert.deepEqual(merged.saved.content,merged.working);
    report(t,a,'single-Save');report(t,reload,'other-actor-fresh-read');
  } finally {f.close();}
});

void test('real Submit locks the peer matrix, Withdraw rotates generation, and stale peer input is never silently sent', async () => {
  const f=await seed();try {
    const {a,b}=await pair(f);await choose(a);await a.c.__fqcTest.sharedAction('save');
    await choose(b,'item2');const client=a.c.__fqcTest.transport(),flow=(await f.state()).workflow,g=flow.generation;
    const submitted=await client.command(g,'submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic two-actor check'});
    assert(submitted.control.workflow.pendingId);assert.equal(a.advisories.length,1);const before=f.db.prepare('SELECT * FROM shared_state').get();
    await assert.rejects(b.c.__fqcTest.sharedAction('save'),/PENDING_LOCKED/);assert.equal(posts(f).at(-1).result.error,'PENDING_LOCKED');assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.equal(b.c.__fqcTest.matrixDirty(),true);
    const withdrawn=await client.command(g,'withdraw',{caseId:submitted.control.workflow.pendingId,reason:'Synthetic withdrawal'});
    assert.notEqual(withdrawn.control.workflow.generation,g);assert.equal(withdrawn.control.workflow.pendingId,null);
    const stale=b.c.__fqcTest.transport().prepare(g,'save',localAssignment('item2','SYN-P',false,true));const staleResponse=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:stale})},'other');assert.equal(staleResponse.status,409);assert.equal((await staleResponse.json()).error,'STALE_GENERATION');assert.equal(b.c.__fqcTest.transport().hasUnknown(),false);assert.equal(b.c.__fqcTest.matrixDirty(),true);
    assert.deepEqual(codes((await f.state()).workflow,'item2'),[]);
    const fresh=await mount(f,'other');await choose(fresh,'item2');await fresh.c.__fqcTest.sharedAction('save');assert.equal(fresh.c.__fqcTest.matrixDirty(),false);
    assert.deepEqual(codes((await f.state()).workflow,'item2'),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);assert.notEqual((await f.state()).workflow.saved.id,flow.saved.id,'peer Save after explicit reopen creates a new saved snapshot');
  }finally{f.close();}
});

for(const receiptStatus of [404,503])void test(`lost matrix ACK and receipt ${receiptStatus}: repeated checks never POST, original receipt resolves only its actor`,async () => {
  const f=await seed();try {
    let lost=false,unavailable=true;
    const a=await mount(f,'editor',async(url,o,send)=>{
      if(o.method==='POST'&&JSON.parse(o.body).command?.action==='save'){await send();lost=true;throw Error('SYNTHETIC_ACK_LOST');}
      if(lost&&unavailable&&String(url).includes('operationId='))return Response.json({error:receiptStatus===404?'OPERATION_NOT_FOUND':'SYNTHETIC_RECEIPT_UNAVAILABLE'},{status:receiptStatus});
      return send();
    });
    await a.c.__fqcTest.sharedAction('begin');await choose(a);await assert.rejects(a.c.__fqcTest.sharedAction('save'),/RESULT_UNKNOWN/);
    assert.equal(a.c.__fqcTest.transport().hasUnknown(),true);assert.equal(a.c.__fqcTest.matrixDirty(),true);
    const sent=posts(f).at(-1),op=command(sent).operationId,postCount=posts(f).length,marker=[...a.records];
    assert.deepEqual(codes((await f.state()).workflow),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);
    await checkResult(a);await checkResult(a);await assert.rejects(a.c.__fqcTest.sharedAction('save'),/UNKNOWN_OPERATION_CHECK_REQUIRED/);
    assert.equal(posts(f).length,postCount);assert.deepEqual([...a.records],marker);assert.equal(a.c.__fqcTest.transport().hasUnknown(),true);
    const foreign=await f.call('/api/fqc/workflow?operationId='+op,{},'other');assert.equal(foreign.status,403);
    const reads=a.wire.filter(r=>r.url.includes('operationId='));assert(reads.length>=2);assert(reads.every(r=>new URL(r.url,'https://synthetic.invalid').searchParams.get('operationId')===op));
    unavailable=false;await checkResult(a);assert.equal(posts(f).length,postCount);assert.equal(a.c.__fqcTest.matrixDirty(),false);assert.equal(a.c.__fqcTest.transport().hasUnknown(),false);assert.equal(a.records.size,0);
    assert.deepEqual(codes((await f.state()).workflow),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);
  }finally{f.close();}
});

void test('server permission revocation rejects peer matrix Save and keeps local choice without modifying shared state',async () => {
  const f=await seed();try {
    const {b}=await pair(f);await choose(b);
    await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users.find(u=>u.id==='other').accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
    const before=f.db.prepare('SELECT * FROM shared_state').get();await assert.rejects(b.c.__fqcTest.sharedAction('save'),/FORBIDDEN/);
    assert.equal(posts(f).at(-1).status,403);assert.equal(posts(f).at(-1).result.error,'FORBIDDEN');assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
    assert.equal(b.c.__fqcTest.matrixDirty(),true);assert.equal(b.main.querySelector('[data-matrix-item="item"]').textContent,'✓');
    assert.deepEqual(codes((await f.state()).workflow),[]);assert.equal((await f.state()).workflow.saved,null);
  }finally{f.close();}
});

// Native runner contracts only: importing this module never starts Chromium.
void test('pending peer matrix stays disabled after ready/repaint; backend still rejects and Withdraw restores editing',async t=>{
 const f=await seed();try {
  const {a}=await pair(f);await choose(a);await a.c.__fqcTest.sharedAction('save');
  const flow=(await f.state()).workflow,client=a.c.__fqcTest.transport();
  const submitted=await client.command(flow.generation,'submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic pending UI check'});
  const b=await mount(f,'other');assert.equal(b.c.__fqcTest.selected().status,'pending');assert.equal(b.library.workflow.pendingId,submitted.control.workflow.pendingId);
  const before=f.db.prepare('SELECT * FROM shared_state').get(),objects=[...f.objects].map(([k,v])=>[k,v.toString('base64')]),beforePosts=posts(f).length;
  const cell=b.main.querySelector('[data-matrix-item="item2"]');assert(cell);await cell.onclick();
  assert.equal(b.c.__fqcTest.matrixDirty(),false);assert.equal(posts(f).length,beforePosts,'Even direct handler invocation cannot create a pending batch');
  const attempted=b.c.__fqcTest.transport().prepare(flow.generation,'save',localAssignment('item2','SYN-P',false,true));
  const response=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:attempted})},'other');
  assert.equal(response.status,409);assert.equal((await response.json()).error,'PENDING_LOCKED');
  assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.deepEqual([...f.objects].map(([k,v])=>[k,v.toString('base64')]),objects);
  for(let paint=0;paint<3;paint++){
   const cells=[...b.main.querySelectorAll('[data-matrix-item]')];assert(cells.length>0);assert.equal(cells.filter(n=>!n.disabled).length,0,'Pending controls must stay disabled after recovery ready and same-root repaint');
   b.c.__fqcTest.render();await tick();
  }
  await client.command(flow.generation,'withdraw',{caseId:submitted.control.workflow.pendingId,reason:'Synthetic reopen'});
  const fresh=await mount(f,'other');assert.equal(fresh.c.__fqcTest.selected().status,'draft');assert.equal(fresh.library.workflow.pendingId,null);
  assert.notEqual(fresh.library.workflow.generation,flow.generation);await choose(fresh,'item2');
  t.diagnostic(JSON.stringify({pendingReceived:true,uiBlocked:true,backend:'409 PENDING_LOCKED',stateUnchanged:true,withdrawFreshDraftEditable:true,layer:'ACTUAL_MODULE_ROUTE_SYNTHETIC_DOM'}));
 }finally{f.close();}
});

void test('approved and history matrix projections stay read-only while an explicitly selected healthy draft remains editable',async()=>{
 const f=await seed();try {
  const a=await mount(f,'editor');assert.equal(a.c.__fqcTest.selected().status,'approved');
  await a.c.__fqcTest.sharedAction('begin');const draftId=a.c.__fqcTest.selected().id,approved=a.library.versions.find(v=>v.id===a.library.activeVersionId);assert(approved);
  for(const status of ['approved','superseded']){
   // Read-only display-state coverage uses the actual module with a synthetic
   // history projection; it is not a server history transition acceptance.
   approved.status=status;a.c.__fqcTest.ui.selectedVersionId=approved.id;a.c.__fqcTest.render();await tick();
   const cells=[...a.main.querySelectorAll('[data-matrix-item]')];assert(cells.length>0);assert(cells.every(n=>n.disabled));
   const before=posts(f).length;await cells[0].onclick();assert.equal(posts(f).length,before);assert.equal(a.c.__fqcTest.matrixDirty(),false);
  }
  a.c.__fqcTest.ui.selectedVersionId=draftId;a.c.__fqcTest.render();await choose(a);assert.equal(a.c.__fqcTest.selected().status,'draft');
 }finally{f.close();}
});

void test('read-only draft grant cannot be re-enabled by matrix recovery status or repaint',async()=>{
 const f=await seed();try {
  await pair(f);await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users.find(u=>u.id==='other').accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
  const b=await mount(f,'other');assert.equal(b.library.workflow.pendingId,null);assert.equal(b.c.__fqcTest.selected().status,'draft');assert.equal(b.c.__fqcTest.transport().permission('edit'),false);
  for(let paint=0;paint<2;paint++){
   b.c.__fqcTest.render();await tick();const cells=[...b.main.querySelectorAll('[data-matrix-item]')];assert(cells.length>0);assert(cells.every(n=>n.disabled));
   const before=posts(f).length;await cells[0].onclick();assert.equal(posts(f).length,before);assert.equal(b.c.__fqcTest.matrixDirty(),false);
  }
 }finally{f.close();}
});

void test('same-root busy repaint reapplies matrix gate to new DOM and restores normal draft without extra network',async()=>{
 const f=await seed();try {
  const {a}=await pair(f),before=a.wire.length;a.c.__fqcTest.ui.saving=true;
  for(let paint=0;paint<3;paint++){a.c.__fqcTest.render();const cells=[...a.main.querySelectorAll('[data-matrix-item]')];assert(cells.length>0);assert(cells.every(n=>n.disabled));}
  a.c.__fqcTest.ui.saving=false;a.c.__fqcTest.render();await tick();assert.equal(a.wire.length,before);await choose(a);
 }finally{f.close();}
});

void test('same-root repaint stays disabled while real recovery admission is delayed, then ready enables only the draft',async()=>{
 const f=await seed();try {
  const a=await mount(f,'editor'),original=a.c.LocalDraftRecoverySession;let release;
  // Keep the real helper/session/lease methods; only delay the readiness signal
  // to exercise DOM replacement before admission completes. No write is sent
  // using this scheduling port, and no fake success replaces helper admission.
  a.c.LocalDraftRecoverySession={create(options){const session=original.create(options);let released=false;
   const ready=new Promise(resolve=>{release=async()=>{const status=await session.ready;released=true;resolve(status);};});
   return {...session,ready,status(){const status=session.status();return {...status,ready:released&&status.ready};}};
  }};
  await a.c.__fqcTest.sharedAction('begin');assert.equal(typeof release,'function');const before=a.wire.length;let previous=a.main.querySelector('[data-matrix-item]');
  for(let paint=0;paint<3;paint++){
   a.c.__fqcTest.render();const cells=[...a.main.querySelectorAll('[data-matrix-item]')];assert(cells.length>0);assert.notEqual(cells[0],previous);previous=cells[0];assert.equal(a.wire.length,before);assert(cells.every(n=>n.disabled),'Fresh DOM must receive the closed recovery gate even if cached gate is already false');
  }
  await release();await tick();assert.equal(a.c.__fqcTest.selected().status,'draft');assert.equal(a.c.__fqcTest.recoverySession().status().ready,true);
  assert([...a.main.querySelectorAll('[data-matrix-item]')].every(n=>!n.disabled));assert.equal(a.wire.length,before);
 }finally{f.close();}
});

void test('unknown matrix result remains GET-only queryable on a read-only selected version',async()=>{
 const f=await seed();try {
  let lost=false;
  const a=await mount(f,'editor',async(url,o,send)=>{
   if(o.method==='POST'&&JSON.parse(o.body).command?.action==='save'){await send();lost=true;throw Error('SYNTHETIC_ACK_LOST');}
   if(lost&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
   return send();
  });
  await a.c.__fqcTest.sharedAction('begin');await choose(a);await assert.rejects(a.c.__fqcTest.sharedAction('save'),/RESULT_UNKNOWN/);assert.equal(a.c.__fqcTest.transport().hasUnknown(),true);
  a.c.__fqcTest.ui.selectedVersionId=a.library.activeVersionId;a.c.__fqcTest.render();await tick();assert.equal(a.c.__fqcTest.selected().status,'approved');
  assert([...a.main.querySelectorAll('[data-matrix-item]')].every(n=>n.disabled));
  const query=a.main.querySelector('#fqc-check-result');assert.equal(query.disabled,false);assert.match(query.textContent,/查詢|Kiểm tra/);
  const before=posts(f).length,reads=a.wire.filter(r=>r.url.includes('operationId=')).length,marker=[...a.records];
  query.click();await until(()=>a.wire.filter(r=>r.url.includes('operationId=')).length>reads&&!a.c.__fqcTest.ui.saving,'explicit unknown receipt check');
  assert.equal(posts(f).length,before);assert.equal(a.c.__fqcTest.transport().hasUnknown(),true);assert.equal(a.c.__fqcTest.matrixDirty(),true);assert.deepEqual([...a.records],marker);
 }finally{f.close();}
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildFqcDraftLifecycleSeed} from './fqc-draft-lifecycle-route-fixture.mjs';
import {buildMatrixMultiuserSeed,exactMatrixFailure,matrixSelectionReady,matrixReceiptQueryReady,matrixMultiuserActions,observeMatrixPage} from './fqc-matrix-multiuser-browser.mjs';
void test('native two-context seed adds one peer with exact editor rights; existing actor rights and unrelated values are unchanged',async()=>{
 const f=await routeFixture();try {
  const factory=f.load('lib/shared-draft.ts').createSharedDraft;
  for(let cycle=1;cycle<=5;cycle++) {
   const before=buildFqcDraftLifecycleSeed(factory,{cycle}),after=buildMatrixMultiuserSeed(factory,{cycle});
   for(const role of ['editor','reviewer','reader'])assert.deepEqual(after.actors[role],before.actors[role]);
   const peer=after.actors.peer;assert.notEqual(peer.id,after.actors.editor.id);
   assert.deepEqual({...peer,id:after.actors.editor.id,name:after.actors.editor.name},after.actors.editor);
   for(const key of Object.keys(before.values).filter(k=>!['platformUsers','qualityMasterControl'].includes(k)))assert.equal(after.values[key],before.values[key]);
   const q=JSON.parse(after.values.qualityMasterControl).libraries.fqc;
   assert.equal(q.workflow.scope,'fqc');assert.equal(q.versions.length,1);assert.equal(q.versions[0].status,'approved');
   assert.deepEqual(q.versions[0].snapshot,after.initialContent);assert.deepEqual(q.workflow.working,after.initialContent);
   assert.equal(new Set(q.workflow.working.items.map(row=>row.id)).size,3);assert.equal(q.workflow.saved,null);
   assert(q.workflow.working.items.every(row=>row.rule.cadence==='batch'&&row.rule.fixedCount===1));
   assert.equal(after.seedBytes,Buffer.byteLength(JSON.stringify(after.values)));
  }
 }finally{f.close();}
});
void test('native exact failure classifier allows only same operation guard conflict, intentional lost ACK, or literal receipt404',()=>{
 const operationId='12345678-1234-4234-8234-123456789abc',path='/api/fqc/workflow';
 const conflict={method:'POST',path,operationId,status:409,failed:false,body:{error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'22345678-1234-4234-8234-123456789abc',details:{path:['items',{id:'row'},'productCodes']}}};
 const expected={kind:'guard409',operationId,itemId:'row'};assert.equal(exactMatrixFailure(conflict,expected),true);
 const wrong=[{...conflict,status:500},{...conflict,status:403},{...conflict,failed:true},{...conflict,method:'GET'},{...conflict,path:'/api/other'},
  {...conflict,operationId:'other'},{...conflict,body:{...conflict.body,error:'OTHER_ERROR'}},{...conflict,body:{...conflict.body,requestId:['22345678-1234-4234-8234-123456789abc']}},
  {...conflict,body:{...conflict.body,details:{path:['items',{id:'peer'},'productCodes']}}},{...conflict,body:{...conflict.body,details:{path:['items',{id:'row'},'productCodes','extra']}}}];
 for(const record of wrong)assert.equal(exactMatrixFailure(record,expected),false);
 for(const itemId of [undefined,null,[],42,''])assert.equal(exactMatrixFailure({...conflict,body:{...conflict.body,details:{path:['items',{id:itemId},'productCodes']}}},{...expected,itemId}),false);
 assert.equal(exactMatrixFailure(conflict,null),false);assert.equal(exactMatrixFailure(conflict,{...expected,operationId:[operationId]}),false);
 const receipt={method:'GET',path,operationId,status:404,failed:false,bodyText:'{"error":"OPERATION_NOT_FOUND"}'};
 assert.equal(exactMatrixFailure(receipt,{kind:'receipt404',operationId}),true);
 for(const extra of [{status:500},{method:'POST'},{failed:true},{operationId:'foreign'},{bodyText:'{"error":"FQC_NOT_ENABLED"}'},{bodyText:'{"error":"OPERATION_NOT_FOUND","unexpected":true}'}])assert.equal(exactMatrixFailure({...receipt,...extra},{kind:'receipt404',operationId}),false);
 const lost={method:'POST',path,operationId,status:null,failed:true};assert.equal(exactMatrixFailure(lost,{kind:'lost-ack',operationId}),true);
 for(const extra of [{status:500},{method:'GET'},{failed:false},{operationId:'foreign'}])assert.equal(exactMatrixFailure({...lost,...extra},{kind:'lost-ack',operationId}),false);
});
void test('native matrix readiness requires exact actor, actual visible enabled cell, dirty state and no unknown',()=>{
 const expected={actor:'editor',itemId:'row',product:'P',pressed:true,dirty:true};
 function probe(change=()=>{}) {
  const node={getAttribute:()=> 'true',disabled:false,getClientRects:()=>[{}]};
  const state={identity:{id:'editor'},flow:{scope:'fqc'},dirty:true,account:{queued:0,unknown:false},host:{dataset:{activeTab:'quality-fqc'},querySelectorAll:()=>[node]},node};change(state);
  return vm.runInNewContext('('+matrixSelectionReady.toString()+')(expected)',{expected,document:{querySelector:()=>state.host},window:{ProcessSync:{identity:state.identity},FQCMasterUI:{control:{libraries:{fqc:{workflow:state.flow}}},navigation:{hasLocalChanges:()=>state.dirty}},sharedDraftAccountState:()=>state.account}});
 }
 assert.equal(probe(),true);
 for(const change of [s=>s.identity.id='other',s=>s.flow.scope='other',s=>s.dirty=false,s=>s.account.unknown=true,s=>s.account.queued=1,
  s=>s.host.dataset.activeTab='other',s=>s.node.disabled=true,s=>s.node.getClientRects=()=>[],s=>s.node.getAttribute=()=> 'false',s=>s.host.querySelectorAll=()=>[],s=>s.host.querySelectorAll=()=>[s.node,s.node]])assert.equal(probe(change),false);
});
void test('native matrix suite is CI-only, two real contexts, five complete cycles, no product auth or optional-button bypass',()=>{
 const source=readFileSync(new URL('./fqc-matrix-multiuser-browser.mjs',import.meta.url),'utf8');
 assert.equal(matrixMultiuserActions.length,12);assert.equal(new Set(matrixMultiuserActions).size,12);assert(matrixMultiuserActions.includes('actor-a-save'));assert(matrixMultiuserActions.includes('actor-b-save'));assert.doesNotMatch(source,/#fqc-matrix-apply|replace-matrix-v1|last-commit-wins|whole-replacement/);assert.match(source,/save-local-v1/);assert.match(source,/overlapping-flight-different-cells-merge/);assert.match(source,/same-row-independent-add-remove-merge/);
 assert.match(source,/assert\.equal\(process\.env\.CI,'true'/);assert.match(source,/createRootEntryFixture/);assert.match(source,/cycle<=REQUIRED_SAMPLES/);
 assert.match(source,/const b=await open\(seed\.actors\.peer\)/);assert.match(source,/await browser\.newContext/);assert.match(source,/assert\.notEqual\(await a\.page\.evaluate/);
 assert.match(source,/allowed=new WeakMap/);assert.match(source,/await route\.fetch\(\)/);assert.match(source,/assert\.equal\(res\.status\(\),200\)/);
 assert.doesNotMatch(source,/hasPermission\s*=|executablePath|localhost:\d|if\s*\([^\n]*\.count\(/);
 assert.match(source,/assert\.equal\(posted\.filter\(row=>row\.status===409\)\.length,0\)/);assert.match(source,/one automatic plus one explicit receipt lookup/);
});

import {EventEmitter} from 'node:events';
const observedRequest=(operationId='operation-one',method='GET')=>({url:()=> 'https://synthetic.invalid/api/fqc/workflow',method:()=>method,postDataJSON:()=>({command:{operationId}})});
function observerFixture(){const page=new EventEmitter(),allowed=new WeakMap(),unexpected=[];const observer=observeMatrixPage(page,{origin:'https://synthetic.invalid',allowed,unexpected,stage:()=> 'test-action'});return{page,allowed,unexpected,observer};}
void test('native observer drains a genuine pending response body before detaching old-page listeners',async()=>{
 const f=observerFixture(),request=observedRequest();let release;
 f.page.emit('request',request);f.page.emit('response',{request:()=>request,status:()=>200,body:()=>new Promise(resolve=>{release=resolve;})});
 const stopping=f.observer.stop(()=>true);await tick();assert.equal(f.observer.isObserving(),true);assert.equal(f.observer.inflight.size,1);assert.equal(f.page.listenerCount('request'),1);
 release(Buffer.from('{}'));await stopping;assert.equal(f.observer.isObserving(),false);assert.equal(f.observer.inflight.size,0);assert.equal(f.observer.bodies.size,0);assert.equal(f.page.listenerCount('response'),0);assert.deepEqual(f.unexpected,[]);
});
void test('native observer late HTTP error refuses clean teardown and keeps the failure ledger intact',async()=>{
 const f=observerFixture(),request=observedRequest();let release;
 f.page.emit('request',request);f.page.emit('response',{request:()=>request,status:()=>500,body:()=>new Promise(resolve=>{release=resolve;})});
 const stopping=assert.rejects(f.observer.stop(()=>true),/Errors observed/);await tick();release(Buffer.from('{"error":"SYNTHETIC_FAILURE"}'));await stopping;
 assert.equal(f.observer.isObserving(),true);assert.equal(f.unexpected.length,1);assert.equal(f.unexpected[0].status,500);f.observer.forceStopAfterFailure();assert.equal(f.unexpected.length,1);
});
void test('native observer rejects unsafe or changed setup safety and unbranded network failures',async()=>{
 const f=observerFixture();await assert.rejects(f.observer.stop(()=>false),/Explicit safe setup/);assert.equal(f.observer.isObserving(),true);
 let checks=0;await assert.rejects(f.observer.stop(()=>++checks===1),/Setup safety changed/);assert.equal(f.observer.isObserving(),true);
 const request=observedRequest();f.page.emit('request',request);f.page.emit('requestfailed',request);await assert.rejects(f.observer.stop(()=>true),/Errors observed/);assert.equal(f.unexpected.length,1);f.observer.forceStopAfterFailure();
});
void test('native fault allowance is attached to the exact original request, not a second request with the same operation',async()=>{
 const f=observerFixture(),original=observedRequest('operation-one','POST'),copy=observedRequest('operation-one','POST');
 f.allowed.set(original,{kind:'lost-ack',operationId:'operation-one'});f.page.emit('request',original);f.page.emit('requestfailed',original);assert.deepEqual(f.unexpected,[]);
 f.page.emit('request',copy);f.page.emit('requestfailed',copy);assert.equal(f.unexpected.length,1);await assert.rejects(f.observer.stop(()=>true));f.observer.forceStopAfterFailure();
});
void test('native three-row/two-editor seed passes actual Begin, both actors single Save, Submit and Withdraw without extra grants',async()=>{
 const f=await routeFixture();try {
  const seed=buildMatrixMultiuserSeed(f.load('lib/shared-draft.ts').createSharedDraft,{cycle:1});
  await f.mutate(values=>{for(const key of Object.keys(values))delete values[key];Object.assign(values,seed.values);});
  for(const actor of [seed.actors.editor,seed.actors.peer]) {
   const request=new Request('https://synthetic.invalid/process/'),token=await f.core.demoSession(request,actor.id,false,actor.authEpoch);
   f.cookies[actor.id]=f.core.sessionCookie(request,token).split(';')[0];
  }
  const a=f.realm(seed.actors.editor.id),b=f.realm(seed.actors.peer.id);
  a.c.alert=()=>assert.fail('The existing distinct reviewer remains available; no seed grant workaround');
  const begun=await a.client.begin();await Promise.all([a.client.read(),b.client.read()]);const g=begun.control.workflow.generation;
  await a.client.command(g,'save',localAssignment(seed.ids.item,seed.ids.product2,false,true));
  await b.client.command(g,'save',localAssignment(seed.ids.secondItem,seed.ids.product,false,true));
  await a.client.command(g,'save',localAssignment(seed.ids.thirdItem,seed.ids.product,false,true));
  const flow=(await f.state()).workflow;assert.deepEqual(flow.saved.content,flow.working);assert.equal(flow.saves.length,3);assert.deepEqual(flow.working.items.find(row=>row.id===seed.ids.item).productCodes,[seed.ids.product2]);assert.deepEqual(flow.working.items.find(row=>row.id===seed.ids.secondItem).productCodes,[seed.ids.product]);assert.deepEqual(flow.working.items.find(row=>row.id===seed.ids.thirdItem).productCodes,[seed.ids.product]);
  const submitted=await a.client.command(g,'submit',{expectedRevision:flow.revision,savedId:flow.saved.id,reason:'Native seed route preflight'});
  assert(submitted.control.workflow.pendingId);assert.deepEqual(submitted.control.workflow.cases.at(-1).contentIssues?.issues||[],[]);
  await assert.rejects(b.client.command(g,'save',localAssignment(seed.ids.secondItem,seed.ids.product,true,false)),/PENDING_LOCKED/);
  const withdrawn=await a.client.command(g,'withdraw',{caseId:submitted.control.workflow.pendingId,reason:'Synthetic native seed withdrawal'});
  assert.notEqual(withdrawn.control.workflow.generation,g);assert.equal(withdrawn.control.workflow.pendingId,null);assert.deepEqual(plain(withdrawn.control.workflow.saved),plain(flow.saved));
  const state=await f.core.readState();for(const key of Object.keys(seed.values).filter(key=>key!=='qualityMasterControl'))assert.equal(state.values[key],seed.values[key]);
 }finally{f.close();}
});

void test('native known-rejection teardown token needs observed original 409 and cannot transfer, clone or survive a later POST',async()=>{
 const f=observerFixture(),g=observerFixture(),request=observedRequest('operation-one','POST');
 const rule={kind:'guard409',operationId:'operation-one',itemId:'row'};f.allowed.set(request,rule);
 assert.equal(f.observer.rejectedTeardownToken(request),null,'allowed plan alone is not actual response proof');
 f.page.emit('request',request);f.page.emit('response',{request:()=>request,status:()=>409,body:async()=>Buffer.from(JSON.stringify({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['items',{id:'row'},'productCodes']}}))});
 await f.observer.drain();const token=f.observer.rejectedTeardownToken(request);assert(token);assert.equal(f.observer.permitsRejectedTeardown(token),true);
 for(const fake of [null,undefined,true,{}, {...token}])assert.equal(f.observer.permitsRejectedTeardown(fake),false);
 assert.equal(g.observer.permitsRejectedTeardown(token),false);assert.equal(f.observer.rejectedTeardownToken(observedRequest('operation-one','POST')),null);
 const later=observedRequest('operation-two','POST');f.page.emit('request',later);assert.equal(f.observer.permitsRejectedTeardown(token),false);assert.equal(f.observer.rejectedTeardownToken(request),null);
 f.observer.forceStopAfterFailure();g.observer.forceStopAfterFailure();
});
void test('native teardown token expires on clean stop and a modified expected rule never grants authority',async()=>{
 const f=observerFixture(),request=observedRequest('operation-one','POST'),rule={kind:'guard409',operationId:'operation-one',itemId:'row'};
 f.allowed.set(request,rule);f.page.emit('request',request);f.page.emit('response',{request:()=>request,status:()=>409,body:async()=>Buffer.from(JSON.stringify({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:['items',{id:'row'},'productCodes']}}))});
 await f.observer.drain();const token=f.observer.rejectedTeardownToken(request);assert(token);rule.itemId='other';assert.equal(f.observer.permitsRejectedTeardown(token),false);rule.itemId='row';assert.equal(f.observer.permitsRejectedTeardown(token),true);
 await f.observer.stop(()=>true);assert.equal(f.observer.permitsRejectedTeardown(token),false);assert.equal(f.observer.rejectedTeardownToken(request),null);
});


void test('native receipt query readiness requires exact supported locale, owner, scope and visible unique enabled unknown control',()=>{
 function probe(language,change=()=>{}) {
  const button={textContent:language==='vi'?'Kiểm tra kết quả':'查詢前次結果',disabled:false,getClientRects:()=>[{}]};
  const state={actor:'editor',identity:{id:'editor'},lang:language,flow:{scope:'fqc'},account:{queued:0,unknown:true},button,
   host:{isConnected:true,dataset:{activeTab:'quality-fqc'},querySelectorAll:()=>[button]}};change(state);
  return vm.runInNewContext('('+matrixReceiptQueryReady.toString()+')({actor})',{actor:state.actor,document:{documentElement:{lang:state.lang},querySelector:()=>state.host},
   window:{ProcessSync:{identity:state.identity},FQCMasterUI:{control:{libraries:{fqc:{workflow:state.flow}}}},sharedDraftAccountState:()=>state.account}});
 }
 for(const language of ['vi','zh','zh-Hant'])assert.equal(probe(language),true);
 for(const language of ['','en','vi-VN'])assert.equal(probe(language),false);
 for(const language of ['vi','zh-Hant'])for(const change of [s=>s.actor='',s=>s.actor=null,s=>s.identity.id='other',s=>s.flow.scope='other',
  s=>s.host.isConnected=false,s=>s.host.dataset.activeTab='other',s=>s.account.queued=1,s=>s.account.queued=undefined,s=>s.account.unknown=false,
  s=>s.button.disabled=true,s=>s.button.getClientRects=()=>[],s=>s.button.textContent+=' ',s=>s.button.textContent=language==='vi'?'查詢前次結果':'Kiểm tra kết quả',
  s=>s.host.querySelectorAll=()=>[],s=>s.host.querySelectorAll=()=>[s.button,s.button]])assert.equal(probe(language,change),false);
});
for(const language of ['zh-Hant','vi'])void test('actual matrix lost ACK stays explicitly queryable in '+language+' without resending',async()=>{
 const f=await seed();try{
  let lost=false,unavailable=true;
  const a=await mount(f,'editor',async(url,o,send)=>{
   if(o.method==='POST'&&JSON.parse(o.body).command?.action==='save'){await send();lost=true;throw Error('SYNTHETIC_ACK_LOST');}
   if(lost&&unavailable&&String(url).includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return send();
  });
  a.c.document.documentElement.lang=language;
  await a.c.__fqcTest.sharedAction('begin');await choose(a);await assert.rejects(a.c.__fqcTest.sharedAction('save'),/RESULT_UNKNOWN/);
  const resultButton=()=>{const button=a.main.querySelector('#fqc-check-result');if(button)button.getClientRects=()=>[{}];return button;}; // VM visibility port, not native layout evidence.
  const ready=()=>{const button=resultButton();return !!button&&a.c.ProcessSync.identity.id==='editor'&&a.c.__fqcTest.transport().hasUnknown()&&button.isConnected&&!button.disabled&&button.getClientRects().length>0&&button.textContent===(language==='vi'?'Kiểm tra kết quả':'查詢前次結果');};
  assert.equal(ready(),true);const sent=posts(f).at(-1),op=command(sent).operationId,count=posts(f).length,markers=[...a.records];
  await resultButton().click();await until(()=>!a.c.__fqcTest.ui.saving,'explicit original receipt check');
  assert.equal(ready(),true);assert.equal(posts(f).length,count);assert.deepEqual([...a.records],markers);
  const reads=a.wire.filter(r=>r.url.includes('operationId='));assert.equal(reads.length,2);assert(reads.every(r=>new URL(r.url,'https://synthetic.invalid').searchParams.get('operationId')===op));
  assert.deepEqual(codes((await f.state()).workflow),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);
  unavailable=false;await resultButton().click();await until(()=>!a.c.__fqcTest.ui.saving,'original receipt resolves');
  assert.equal(posts(f).length,count);assert.equal(a.c.__fqcTest.transport().hasUnknown(),false);assert.equal(a.c.__fqcTest.matrixDirty(),false);assert.equal(a.records.size,0);
  assert.deepEqual(codes((await f.state()).workflow),['SYN-P']);assert.deepEqual((await f.state()).workflow.saved.content,(await f.state()).workflow.working);
 }finally{f.close();}
});
