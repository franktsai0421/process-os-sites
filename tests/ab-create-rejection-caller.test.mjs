import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID, webcrypto, createHash } from 'node:crypto';

// Full actual UI + default shared client + production draft/AB kernels. Only
// DOM rendering, poll scheduling, and the in-memory HTTP boundary are synthetic.
const require = createRequire(import.meta.url);
const load = require('../scripts/ipqc-ab-import-harness.cjs')();
const { createSharedDraft, applyDraftCommand } = load('lib/shared-draft.ts');
const { abWorkflowAdapter } = load('lib/ipqc-ab-workflow.ts');
const sourcePath = process.env.AB_CREATE_REJECTION_CALLER_SOURCE || 'public/process/ipqc-ab.js';
const source = fs.readFileSync(sourcePath, 'utf8');
const shared = fs.readFileSync(process.env.AB_CREATE_REJECTION_SHARED_SOURCE || 'public/process/shared-draft-client.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const storage = () => { const values = new Map(); return { get length() { return values.size; }, key: n => [...values.keys()][n] ?? null,
  getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
const item = (id = 'item-1') => ({ id, code: 'A-QA-01-L01-01', errorId: 'error-1', standard: 'Initial standard', methodText: 'Initial method',
  inspectionMode: 'visual', equipmentId: '', equipmentSnapshot: null, isEnabled: true, rules: [], standardPhotos: [], methodPhotos: [],
  productCodes: [], sourceRows: [], sourceTool: '', sourceMethod: '', sourceFrequency: '', reason: '', deleted: false });
const catalog = { groups: [{ line: 'A', name: 'QA', defaultStages: ['S01'] }],
  products: ['P1', 'P2'].map(code => ({ code, name: code, line: 'A', category: 'QA', stages: ['S01'] })),
  stages: [{ line: 'A', code: 'S01', name: 'Synthetic stage' }] };

async function fixture(text = source, { twoScopes = false } = {}) {
  const content = { errors: [{ id: 'error-1', code: 'A-QA-01-L01', name: 'Synthetic error', line: 'A', group: 'QA', stageCode: 'S01', sourceRows: [], deleted: false }], items: [item()] };
  const localCatalog = clone(catalog); if (twoScopes) localCatalog.groups.push({ line: 'A', name: 'QB', defaultStages: ['S01'] });
  const secondContent = clone(content); secondContent.errors[0].group = 'QB'; secondContent.errors[0].code = 'A-QB-01-L01'; secondContent.items[0].code = 'A-QB-01-L01-01';
  let secondFlow = createSharedDraft('ipqc-ab:A:QB', secondContent, null, 'generation-QB');
  let flow = createSharedDraft('ipqc-ab:A:QA', content, null, 'generation-1'), revision = 10;
  let moduleFlow = createSharedDraft('ipqc-ab:module', { scopes: { 'A:QA': clone(content) }, bases: { 'A:QA': null } }, null, 'module-generation');
  let requestId = () => randomUUID(), failure = null, uploadHold = null, postReply = value => value, hold = null, beforeCommit = () => {}, getHold = null, pollTask = null, receiptOnly = false, paintChecks = 0, readReply = (_url, value) => ({ value, status: 200 }), losePost = false;
  const calls = [];
  const permissions = Object.fromEntries(['view', 'edit', 'save', 'submit', 'withdraw', 'approve', 'return', 'history', 'delete', 'create', 'restore'].map(key => [key, true]));
  const project = current => ({ activeVersionId: current.active.id, workflow: clone(current), versions: [{ id: 'shared-' + current.generation, number: 1,
    status: current.pendingId ? 'pending' : 'draft', revision: current.revision, snapshot: clone(current.working), history: [], creatorId: 'owner', creatorName: 'Synthetic', createdAt: 'fixture', updatedAt: 'fixture' }] });
  const root = () => ({ schemaVersion: 1, scopes: { 'A:QA': { line: 'A', group: 'QA', ...project(flow) }, ...(twoScopes ? { 'A:QB': { line: 'A', group: 'QB', ...project(secondFlow) } } : {}) },
    moduleDraft: project(moduleFlow), source: null, reservedErrorCodes: [], reservedItemCodes: [] });
  const body = () => ({ control: root(), catalog: clone(localCatalog), equipment: [], revision });
  const fields = {
    '#ab-standard': { value: content.items[0].standard }, '#ab-method': { value: content.items[0].methodText },
    '#ab-mode': { value: 'visual' }, '#ab-enabled': { checked: true }, '#ab-error-name': { value: content.errors[0].name },
  };
  let visibleFields = fields;
  const modalBody = { querySelector: selector => selector === '[name="ab-mode"]:checked' ? fields['#ab-mode'] : fields[selector] || null,
    querySelectorAll: () => [] };
  const buttons = ['P1', 'P2'].map(code => ({ checked: false, disabled: false, dataset: { abMatrixItem: 'item-1', abMatrixProduct: code },
    addEventListener(_event, callback) { this.change = callback; } }));
  const retry = {}, receiptQuery = {}, close = { addEventListener(_event, callback) { this.click = callback; } };
  const groupSelect = { addEventListener(_event, callback) { this.change = callback; } };
  const apply = { addEventListener(_event, callback) { this.click = callback; } };
  const host = { isConnected: true, dataset: { activeTab: 'quality-ipqc-ab' }, contains: () => false,
    querySelector: selector => selector === '.ipqcab-dialog-body' ? (visibleFields === fields ? modalBody : null) : selector === '[data-ab-access-retry]' ? retry : selector === '[data-ab-receipt-query]' ? (host.markup?.includes('data-ab-receipt-query') ? receiptQuery : null) : selector === '#ab-apply' ? apply : selector === '#ipqcab-group' ? groupSelect : visibleFields[selector] || null,
    querySelectorAll: selector => selector === '[data-ab-close]' ? [close] : selector === '[data-ab-matrix-item]' ? buttons : [], childNodes: [{ fields }],
    replaceChildren(...nodes) { this.childNodes = nodes; visibleFields = nodes[0]?.fields || {}; this.markup = ''; },
    get innerHTML() { return this.markup || ''; }, set innerHTML(value) { this.markup = value; this.childNodes = [{ markup: value }]; visibleFields = {}; } };
  const window = { addEventListener() {}, dispatchEvent() {}, scrollTo() {}, confirm: () => true,
    VersionDraftUI: { preserveView: () => () => {}, confirmReview: async () => ({ reason: 'Synthetic review', selfReviewConfirmed: true }) } };
  const box = { window, document: { documentElement: { lang: 'zh' }, contains: () => { paintChecks++; return false; }, visibilityState: 'visible', activeElement: null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    crypto: webcrypto, AbortController, Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    structuredClone, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    MutationObserver: class { observe() {} }, CustomEvent: class {}, toast() {}, sessionStorage: storage(), localStorage: storage(),
    location: new URL('https://fixture.invalid/process/'), epoch: 1, delivery: 1,
    async fetch(url, options = {}) {
      if(options.method==='PUT'){
        calls.push({method:'PUT',url}); const held=uploadHold; uploadHold=null; held.started.resolve(); await held.release.promise;
        return Response.json({id:'a'.repeat(64)});
      }
      const parsed = new URL(url, 'https://fixture.invalid'), sent = options.body ? JSON.parse(options.body) : null;
      const call = { method: options.method || 'GET', url, body: sent, requestBytes: Buffer.byteLength(options.body || '') }; calls.push(call);
      if (!sent) {
        if (getHold?.predicate(parsed)) { const held = getHold; getHold = null; held.started.resolve(); await held.release.promise; }
        const value = parsed.pathname === '/api/ipqc-ab' ? body() : parsed.searchParams.has('permissions') ? {permissions,revision} : { control: parsed.searchParams.has('module') ? project(moduleFlow) : project(parsed.searchParams.get('scope') === 'A:QB' ? secondFlow : flow), permissions, revision };
        const reply = readReply(parsed, value); call.responseBytes = Buffer.byteLength(JSON.stringify(reply.value)); return Response.json(reply.value, { status: reply.status });
      }
      let value, responseStatus = 200;
      try {
        await Promise.resolve(beforeCommit(sent));
        const base = { actor: { id: 'owner', name: 'Synthetic', admin: true }, at: '2026-10-31T00:00:00Z', id: randomUUID,
          allowed: () => true, activeId: null, semantic: value => value, structure() {}, validate: () => [] };
        if (sent.action === 'begin') {
          flow = createSharedDraft(flow.scope, flow.working, null, randomUUID()); revision++;
          value = { control: project(flow), permissions, revision };
        } else if (parsed.searchParams.has('module')) {
          if (sent.command.action === 'save') moduleFlow.working = { scopes: { 'A:QA': clone(flow.working) }, bases: { 'A:QA': null } };
          const applied = applyDraftCommand(moduleFlow, sent.command, base); moduleFlow = applied.state; revision++;
          value = { control: project(moduleFlow), permissions, revision, receipt: clone(applied.receipt) };
        } else {
          const requestScope = parsed.searchParams.get('scope') || 'A:QA', adapter = abWorkflowAdapter(requestScope), control = adapter.parse(JSON.stringify(root()));
          const state = { revision, values: { masterDataControl: JSON.stringify({ active: { AB: { products: localCatalog.products,
            categoryGroups: localCatalog.groups, lines: [{ code: 'A', stages: [{ code: 'S01', name: 'Synthetic' }] }] } } }), routineEquipmentControl: JSON.stringify({activeVersionId:'equipment-approved',versions:[{id:'equipment-approved',status:'approved',equipment:[{id:'equipment-1',assetCode:'EQ1',pieceMark:'1',name:'Synthetic equipment'},{id:'equipment-2',assetCode:'EQ2',pieceMark:'2',name:'Next equipment'}]}]}) } };
          const context = adapter.context(control, state, base);
          const applied = adapter.apply(control, sent.command, context); if (requestScope === 'A:QB') secondFlow = applied.state; else flow = applied.state; revision++;
          value = { control: project(applied.state), permissions, revision, receipt: clone(applied.receipt) };
        }
      } catch (error) { value = { error: error.code || error.message, details: error.details, requestId: requestId() }; responseStatus = error.status || 500; }
      value = postReply(value, sent);
      if (receiptOnly && value.receipt) { delete value.control; receiptOnly = false; }
      call.status = responseStatus; call.responseBytes = Buffer.byteLength(JSON.stringify(value));
      if (hold) { const held = hold; hold = null; held.started.resolve(); await held.release.promise; }
      if (losePost) { losePost = false; throw Error('Synthetic lost ACK'); }
      if(failure){const fault=failure;failure=null;if(fault==='throw-status')throw Object.assign(Error('Synthetic proxy failure'),{status:409});return Response.json({error:'Synthetic proxy failure'},{status:fault});}
      return Response.json(value, { status: responseStatus });
    },
  };
  window.ProcessSync = { identity: { id: 'owner', name: 'Synthetic', role: 'admin' }, requiresReload: false,
    identityGeneration: () => box.epoch, captureDelivery: () => box.delivery, isCurrentDelivery: value => value === box.delivery };
  const context = vm.createContext(box);
  vm.runInContext(shared, context, { filename: 'shared-draft-client.js' });
  window.createForegroundPoll = () => ({ capture: () => 1, isCurrent: value => value === 1,
    schedule: task => { pollTask = task; }, cancel() {} });
  const anchor = '  window.IPQCABUI = {'; assert.equal(text.split(anchor).length, 2);
  const hook = `__test:{writeShared,save,moduleSave,load,bind,upload,transport,moduleTransport,scheduleRefresh,reconfirmRetainedDelivery:typeof reconfirmRetainedDelivery==='undefined'?null:reconfirmRetainedDelivery,
    init(value,page){control=value.control;catalog=value.catalog;equipment=[];revision=value.revision;host=page;line='A';group='QA';stage='S01';errorId='error-1';versionId=opened().id;working=clone(opened().snapshot);},
    get(){return{control,revision,working,busy,message,modal,modalBase,viewer,host,accessBlocked,privateQuarantine,client:sharedClient,localBatch:typeof localBatch==='undefined'?null:localBatch};},
    replaceReservation(){localBatch={...localBatch,created:{...localBatch.created}};},setStage(value){stage=value;},setViewer(value){viewer=value;},setWorking(value){working=value;},setModal(value){modal=value;modalBase=clone(opened().snapshot);modalGeneration=scope().workflow.generation;},
    replacePendingOperation(){const old=pendingOperations.get(sharedClient);pendingOperations.set(sharedClient,{...old,operationId:'new-original-operation'});},setRevision(value){revision=value;},setHost(value){host=value;},setScope(value){group=value;},setClient(value){sharedClient=value;},setBusy(value){busy=value;}
  },`;
  vm.runInContext(text.replace(anchor, anchor + hook), context, { filename: sourcePath });
  const ui = window.IPQCABUI.__test; await window.IPQCABUI.mount(host); assert.ok(ui.get().control); ui.bind(); const initialReads=clone(calls); calls.length = 0;
  return { ui, box, window, host, initialReads, fields, apply, close, retry, receiptQuery, groupSelect, buttons, calls, permissions,
    requestId: callback => { requestId=callback; }, postReply: callback => { postReply = callback; }, failAfterCommit: value => { failure=value; }, holdUpload() { const value={started:deferred(),release:deferred()};uploadHold=value;return value; }, readReply: callback => { readReply = callback; }, losePost: () => { losePost = true; }, modulePending: () => { moduleFlow.pendingId = 'pending-module'; },
    state: (scope = 'A:QA') => clone(scope === 'A:QB' ? secondFlow : flow), root, body, paintChecks: () => paintChecks, receiptOnly: () => { receiptOnly = true; },
    holdPost() { const value = { started: deferred(), release: deferred() }; hold = value; return value; },
    holdGet(predicate) { const value = { predicate, started: deferred(), release: deferred() }; getHold = value; return value; },
    beforeCommit: callback => { beforeCommit = callback; },
    peer(callback) { callback(flow); revision++; },
    poll: async () => { ui.scheduleRefresh(); assert(pollTask); await pollTask(); },
    reset: () => window.IPQCABUI.navigation.reset(),
  };
}

// Fixture above keeps the complete production caller/default client/AB adapter
// and draft kernel. Synthetic DOM and HTTP projections are not route/native QA.
function openCreate(f, kind) {
  if (kind === 'item') {
    const temporary = item('temp-exact'); f.ui.get().working.items.push(temporary);
    f.ui.setModal({ type: 'item', id: temporary.id }); f.fields['#ab-standard'].value = 'Sent created standard';
  } else { f.ui.setModal({ type: 'new-error', name: 'Sent created error' }); f.fields['#ab-error-name'].value = 'Sent created error'; }
}
const posts = f => f.calls.filter(call => call.method === 'POST');

// This caller fixture obtains real adapter/kernel errors but supplies their
// requestId at the synthetic HTTP envelope. Actual route UUID/pre-CAS authority
// is covered separately by the transport owner's actual-route test suite.
const recoveryKeys = f => Array.from({length:f.box.sessionStorage.length},(_,index)=>f.box.sessionStorage.key(index)).filter(key=>key.startsWith('shared-draft-v3-operation:'));
const callerCreated = f => f.ui.get().localBatch?.created;

void test('bound Apply finalizes true create rejection, keeps later DOM input and original B, then manual correction creates once',async()=>{
  const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';
  const local=f.ui.get().working,row=local.items.at(-1),target=f.ui.get().modal,base=clone(f.ui.get().modalBase);
  const held=f.holdPost(),pending=f.apply.click();await held.started.promise;
  f.fields['#ab-standard'].value='Latest input while 422 pending';held.release.resolve();await pending;
  assert.equal(posts(f).length,1);assert.equal(posts(f)[0].status,422);assert.equal(f.state().working.items.length,1);
  assert.equal(f.ui.get().working,local);assert.equal(f.ui.get().working.items.at(-1),row);assert.equal(f.ui.get().modal,target);
  assert.equal(row.standard,'Latest input while 422 pending');assert.deepEqual(clone(f.ui.get().localBatch.base),base);
  assert.equal(callerCreated(f),undefined);assert.equal(f.ui.get().client.hasUnknown(),false);await f.ui.get().client.flush();
  assert.equal(f.calls.filter(call=>call.method==='GET').length,0);
  f.fields['#ab-mode'].value='visual';await f.apply.click();assert.equal(posts(f).length,2);assert.equal(posts(f)[1].status,200);
  assert.notEqual(posts(f)[1].body.command.operationId,posts(f)[0].body.command.operationId);
  assert.equal(f.state().working.items.length,2);assert.equal(f.state().working.items.at(-1).standard,'Latest input while 422 pending');
});

void test('cleanup quota failure keeps both layers; explicit retry only finalizes the original rejection and a later Apply sends correction',async()=>{
  const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';
  const other='shared-draft-v3-operation:another-actor:/api/other/workflow',otherValue='do-not-touch';f.box.sessionStorage.setItem(other,otherValue);
  const originalRemove=f.box.sessionStorage.removeItem;let quota=true;
  f.box.sessionStorage.removeItem=key=>{if(quota&&key!==other&&key.startsWith('shared-draft-v3-operation:'))throw Error('Synthetic cleanup quota');originalRemove(key);};
  await f.apply.click();const reservation=callerCreated(f),local=f.ui.get().working,base=f.ui.get().localBatch.base,target=f.ui.get().modal;
  assert.ok(reservation);assert.equal(f.ui.get().client.hasUnknown(),true);assert.equal(recoveryKeys(f).length,2);
  f.fields['#ab-standard'].value='New input after cleanup failed';f.fields['#ab-mode'].value='visual';quota=false;
  const painted=f.paintChecks();await f.apply.click();assert.ok(f.paintChecks()>painted,'successful explicit cleanup must repaint its ready-to-Apply notice');assert.equal(posts(f).length,1,'cleanup retry must not create in the same user action');
  assert.equal(callerCreated(f),undefined);assert.equal(f.ui.get().client.hasUnknown(),false);assert.equal(f.ui.get().working,local);assert.equal(f.ui.get().localBatch.base,base);assert.equal(f.ui.get().modal,target);
  assert.equal(local.items.at(-1).standard,'New input after cleanup failed');assert.equal(f.box.sessionStorage.getItem(other),otherValue);assert.deepEqual(recoveryKeys(f),[other]);
  await f.ui.get().client.flush();assert.match(f.ui.get().message,/再次套用|áp dụng lại/);
  await f.apply.click();assert.equal(posts(f).length,2);assert.equal(f.state().working.items.length,2);
});

void test('trusted create cleanup cannot erase a different operation sync failure or another marker',async()=>{
  const f=await fixture(),client=f.ui.get().client;
  const foreign='shared-draft-v3-operation:foreign:/api/foreign/workflow';f.box.sessionStorage.setItem(foreign,'foreign-marker');
  const unrelated=client.prepare(f.state().generation,'apply',{patches:[{op:'set',path:['items',{id:'item-1'},'sourceTool'],value:'forbidden'}],guards:[]});
  await assert.rejects(client.sendPrepared(unrelated));openCreate(f,'item');f.fields['#ab-mode'].value='equipment';await f.apply.click();
  assert.equal(callerCreated(f),undefined);assert.equal(client.hasUnknown(),false);assert.equal(f.box.sessionStorage.getItem(foreign),'foreign-marker');
  await assert.rejects(client.flush(),/UNSUPPORTED_ITEM_PATCH/);assert.equal(f.state().working.items.length,1);
});

for(const boundary of ['actor','epoch','delivery','modal','reservation'])void test(`late ${boundary} cannot finalize or release a create reservation`,async()=>{
  const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';const local=f.ui.get().working,target=f.ui.get().modal;
  const held=f.holdPost(),pending=f.apply.click();await held.started.promise;const original=callerCreated(f);
  if(boundary==='actor')f.window.ProcessSync.identity={...f.window.ProcessSync.identity};
  if(boundary==='epoch')f.box.epoch++;
  if(boundary==='delivery')f.box.delivery++;
  if(boundary==='modal')f.ui.setModal({type:'new-error',name:'New private modal'});
  if(boundary==='reservation')f.ui.replaceReservation();
  held.release.resolve();await pending;assert.ok(callerCreated(f));assert.equal(f.ui.get().working,local);assert.equal(posts(f).length,1);
  if(boundary==='modal')assert.notEqual(f.ui.get().modal,target);else assert.equal(f.ui.get().modal,target);
  assert.equal(original.modal,target);await f.apply.click();assert.equal(posts(f).length,1);
});

for(const shape of ['missing','invalid','object'])void test(`untrusted requestId ${shape} does not release even a listed adapter error`,async()=>{
  const f=await fixture();f.requestId(()=>shape==='missing'?undefined:shape==='invalid'?'not-a-uuid':{uuid:randomUUID()});
  openCreate(f,'item');f.fields['#ab-mode'].value='equipment';await f.apply.click();assert.ok(callerCreated(f));assert.equal(f.ui.get().client.hasUnknown(),true);
  f.fields['#ab-mode'].value='visual';await f.apply.click();assert.equal(posts(f).length,1);assert.equal(f.state().working.items.length,1);
});

for(const failure of [403,409,'throw-status'])void test(`committed create followed by ${failure} cannot use flags to unlock a second create`,async()=>{
  const f=await fixture();openCreate(f,'item');f.failAfterCommit(failure);await f.apply.click();assert.equal(f.state().working.items.length,2);
  assert.ok(callerCreated(f));assert.equal(f.ui.get().client.hasUnknown(),true);await f.apply.click();assert.equal(posts(f).length,1);
});

void test('original receipt 404 never releases the retained create or permits retry with a new operation',async()=>{
  const f=await fixture();openCreate(f,'item');f.losePost();await f.apply.click();const op=posts(f)[0].body.command.operationId;
  f.readReply((url,value)=>url.searchParams.has('operationId')?{status:404,value:{error:'OPERATION_NOT_FOUND',requestId:randomUUID()}}:{status:200,value});
  await assert.rejects(f.ui.get().client.resolveUnknown());assert.ok(callerCreated(f));assert.equal(f.ui.get().client.hasUnknown(),true);
  await f.apply.click();assert.equal(posts(f).length,1);assert.ok(f.calls.filter(call=>call.method==='GET').every(call=>new URL(call.url,'https://fixture.invalid').searchParams.get('operationId')===op));
});

if(process.env.AB_CREATE_REJECTION_BASELINE)void test('paired opt-in caller normal create keeps one POST, zero GET and identical bytes',async(t)=>{
  const baseline=fs.readFileSync(process.env.AB_CREATE_REJECTION_BASELINE,'utf8');
  for(const kind of ['item','error']){
    async function measure(text){const f=await fixture(text);openCreate(f,kind);await f.apply.click();assert.equal(posts(f).length,1);assert.equal(posts(f)[0].status,200);assert.equal(f.calls.length,1);return f.calls.map(({method,requestBytes,responseBytes})=>({method,requestBytes,responseBytes}));}
    const old=await measure(baseline),current=await measure(source);assert.deepEqual(current,old);t.diagnostic(JSON.stringify({kind,old,current,sourceSha256:createHash('sha256').update(source).digest('hex'),sharedSha256:createHash('sha256').update(shared).digest('hex')}));
  }
});
void test('new-error bound Apply can correct trusted invalid stage without losing its newer private name',async()=>{
  const f=await fixture();openCreate(f,'error');f.ui.setStage('INVALID');
  const target=f.ui.get().modal,held=f.holdPost(),pending=f.apply.click();await held.started.promise;
  f.fields['#ab-error-name'].value='Newer name during rejection';held.release.resolve();await pending;
  assert.equal(posts(f)[0].status,422);assert.equal(callerCreated(f),undefined);assert.equal(f.ui.get().modal,target);assert.equal(target.name,'Newer name during rejection');
  assert.equal(f.state().working.errors.length,1);f.ui.setStage('S01');await f.apply.click();
  assert.equal(posts(f).length,2);assert.equal(posts(f)[1].status,200);assert.equal(f.state().working.errors.length,2);
  assert.equal(f.state().working.errors.at(-1).name,'Newer name during rejection');assert.equal(f.calls.filter(call=>call.method==='GET').length,0);
});

void test('fresh empty-group public mount performs only module and permission reads, then immediate create stays one POST zero GET',async()=>{
  for(const kind of ['item','error']){
    const f=await fixture();assert.equal(f.initialReads.length,2);assert.ok(f.initialReads.every(call=>call.method==='GET'));
    const urls=f.initialReads.map(call=>new URL(call.url,'https://fixture.invalid'));
    assert.equal(urls[0].pathname,'/api/ipqc-ab');assert.equal(urls[1].pathname,'/api/ipqc-ab/workflow');assert.equal(urls[1].searchParams.get('scope'),'A:QA');assert.equal(urls[1].searchParams.get('permissions'),'1');
    openCreate(f,kind);await f.apply.click();assert.equal(posts(f).length,1,JSON.stringify({message:f.ui.get().message,calls:f.calls}));assert.equal(posts(f)[0].status,200);assert.equal(f.calls.length,1);
  }
});
void test('fresh loaded caller basis still rejects old private input after owner, epoch, delivery or host changes before prepare',async()=>{
  for(const boundary of ['actor','epoch','delivery','host']){
    const f=await fixture();openCreate(f,'item');const local=f.ui.get().working,target=f.ui.get().modal;f.fields['#ab-standard'].value='Old owner private DOM';
    if(boundary==='actor')f.window.ProcessSync.identity={...f.window.ProcessSync.identity};
    if(boundary==='epoch')f.box.epoch++;
    if(boundary==='delivery')f.box.delivery++;
    if(boundary==='host')f.ui.setHost({...f.host});
    await f.apply.click();assert.equal(f.calls.length,0);assert.equal(f.ui.get().working,local);assert.equal(f.ui.get().modal,target);assert.ok(f.ui.get().privateQuarantine);
  }
});
void test('trusted create rejection and correction never rebase another unsent row guard to a peer value',async()=>{
  const f=await fixture();f.ui.get().working.items[0].methodText='Private before rejected create';openCreate(f,'item');f.fields['#ab-mode'].value='equipment';
  f.beforeCommit(()=>{f.peer(flow=>{flow.working.items[0].methodText='Peer while rejected create';});f.beforeCommit(()=>{});});
  await f.apply.click();assert.equal(posts(f)[0].status,422);assert.equal(callerCreated(f),undefined);assert.equal(f.ui.get().localBatch.base.items[0].methodText,'Initial method');
  f.fields['#ab-mode'].value='visual';await f.apply.click();assert.equal(posts(f)[1].status,200);assert.equal(f.ui.get().working.items[0].methodText,'Private before rejected create');
  assert.equal(f.ui.get().localBatch.base.items[0].methodText,'Initial method');assert.equal(await f.ui.save('apply'),null);
  assert.equal(posts(f).length,3);assert.equal(posts(f)[2].status,409);assert.deepEqual(posts(f)[2].body.command.guards,[{path:['items',{id:'item-1'},'methodText'],value:'Initial method'}]);
  assert.equal(f.state().working.items[0].methodText,'Peer while rejected create');
});
