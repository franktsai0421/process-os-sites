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
const sourcePath = process.env.AB_CREATE_NEXT_SOURCE || 'public/process/ipqc-ab.js';
const source = fs.readFileSync(sourcePath, 'utf8');
const shared = fs.readFileSync('public/process/shared-draft-client.js', 'utf8');
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
  let failure = null, uploadHold = null, postReply = value => value, hold = null, beforeCommit = () => {}, getHold = null, pollTask = null, receiptOnly = false, paintChecks = 0, readReply = (_url, value) => ({ value, status: 200 }), losePost = false;
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
        const value = parsed.pathname === '/api/ipqc-ab' ? body() : { control: parsed.searchParams.has('module') ? project(moduleFlow) : project(parsed.searchParams.get('scope') === 'A:QB' ? secondFlow : flow), permissions, revision };
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
      } catch (error) { value = { error: error.code || error.message, details: error.details }; responseStatus = error.status || 500; }
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
    setViewer(value){viewer=value;},setWorking(value){working=value;},setModal(value){modal=value;modalBase=clone(opened().snapshot);modalGeneration=scope().workflow.generation;},
    replacePendingOperation(){const old=pendingOperations.get(sharedClient);pendingOperations.set(sharedClient,{...old,operationId:'new-original-operation'});},setRevision(value){revision=value;},setHost(value){host=value;},setScope(value){group=value;},setClient(value){sharedClient=value;},setBusy(value){busy=value;}
  },`;
  vm.runInContext(text.replace(anchor, anchor + hook), context, { filename: sourcePath });
  const ui = window.IPQCABUI.__test; ui.init(body(), host); assert.equal(await ui.load(false), true); await ui.transport().read(); ui.bind(); calls.length = 0;
  return { ui, box, window, host, fields, apply, close, retry, receiptQuery, groupSelect, buttons, calls, permissions,
    postReply: callback => { postReply = callback; }, failAfterCommit: value => { failure=value; }, holdUpload() { const value={started:deferred(),release:deferred()};uploadHold=value;return value; }, readReply: callback => { readReply = callback; }, losePost: () => { losePost = true; }, modulePending: () => { moduleFlow.pendingId = 'pending-module'; },
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
const collection = kind => kind === 'item' ? 'items' : 'errors';
const editable = kind => kind === 'item' ? 'standard' : 'name';
const createdId = (f, kind) => kind + '-' + f.calls.find(call => call.method === 'POST').body.command.operationId;
const posts = f => f.calls.filter(call => call.method === 'POST');
async function nextCreate(f, kind) {
  openCreate(f, kind); const held = f.holdPost(), pending = f.apply.click(); await held.started.promise;
  f.fields[kind === 'item' ? '#ab-standard' : '#ab-error-name'].value = 'Newest private input';
  held.release.resolve(); await pending;
}
for (const kind of ['item', 'error']) void test(`actual create-${kind} ACK maps exact row, preserves next DOM input, and manual Apply never creates twice`, async () => {
  const f = await fixture(); await nextCreate(f, kind); const id = createdId(f, kind), key = collection(kind), field = editable(kind);
  assert.equal(posts(f).length, 1); assert.equal(f.calls.filter(call => call.method === 'GET').length, 0);
  assert.equal(f.ui.get().modal.id, id); assert.equal(f.ui.get().modal.type, kind);
  assert.equal(f.ui.get().working[key].find(row => row.id === id)[field], 'Newest private input');
  assert.equal(f.ui.get().localBatch.created, undefined);
  assert.deepEqual(clone(f.ui.get().localBatch.base[key].find(row => row.id === id)), f.state().working[key].find(row => row.id === id));
  await f.apply.click(); assert.equal(posts(f).length, 2); assert.equal(posts(f)[1].body.command.moduleAction, undefined);
  assert.deepEqual(posts(f)[1].body.command.guards, [{ path: [key, { id }, field], value: kind === 'item' ? 'Sent created standard' : 'Sent created error' }]);
  assert.equal(f.state().working[key].filter(row => row.id === id).length, 1);
  assert.equal(f.state().working[key].find(row => row.id === id)[field], 'Newest private input');
  assert.equal(f.ui.get().localBatch, null); assert.equal(f.ui.get().modal, null);
});
for (const kind of ['item', 'error']) void test(`create-${kind} keeps pre-dispatch unrelated local edits and original guards rather than using whole sent S`, async () => {
  const f = await fixture(); f.ui.get().working.items[0].methodText = 'Unsent before create'; openCreate(f, kind);
  f.beforeCommit(() => { f.peer(flow => { flow.working.items[0].methodText = 'Peer during create'; }); f.beforeCommit(() => {}); });
  if(kind==='error')await f.ui.writeShared('create-error',{stageCode:'S01',name:'Sent created error'});else await f.apply.click(); const id = createdId(f, kind);
  assert.equal(f.ui.get().working.items[0].methodText, 'Unsent before create');
  assert.equal(f.ui.get().localBatch.base.items[0].methodText, 'Initial method');
  assert.equal(f.ui.get().localBatch.base[collection(kind)].filter(row => row.id === id).length, 1);
  const result = await f.ui.save('apply'); assert.equal(result, null); assert.equal(posts(f).length, 2); assert.equal(posts(f)[1].status, 409);
  assert.deepEqual(posts(f)[1].body.command.guards, [{ path: ['items', { id: 'item-1' }, 'methodText'], value: 'Initial method' }]);
  assert.equal(f.state().working.items[0].methodText, 'Peer during create');
});
for (const kind of ['item', 'error']) void test(`Cancel mapped ${kind} retains the created server row and only reverts unsent next input`, async () => {
  const f = await fixture(); await nextCreate(f, kind); const id = createdId(f, kind), key = collection(kind);
  const confirmed = clone(f.state().working[key].find(row => row.id === id)); await f.close.click();
  assert.ok(f.ui.get().working[key].find(row => row.id === id), 'Cancel must retain the exact committed row');
  assert.deepEqual(clone(f.ui.get().working[key].find(row => row.id === id)), confirmed);
  assert.equal(f.state().working[key].filter(row => row.id === id).length, 1); assert.equal(posts(f).length, 1);
  assert.equal(f.ui.get().modal, null);
  await f.ui.save('apply'); assert.equal(posts(f).length, 1); assert.equal(f.ui.get().localBatch, null);
});
for (const kind of ['item', 'error']) for (const fault of ['missing', 'duplicate', 'deleted', 'editable-peer', 'wrong-parent', 'wrong-operation', 'new-generation', 'lower-receipt', 'missing-field', 'snapshot-mismatch', 'pending', 'readonly-field']) void test(`${kind} ${fault} ACK fails closed before model adoption, second Apply never creates again`, async () => {
  const f = await fixture(), before = f.ui.get().revision; openCreate(f, kind);
  f.postReply((value, sent) => {
    const rows = value.control.workflow.working[collection(kind)], id = kind + '-' + sent.command.operationId, row = rows.find(value => value.id === id);
    if (fault === 'missing') rows.splice(rows.indexOf(row), 1);
    if (fault === 'duplicate') rows.push(clone(row));
    if (fault === 'deleted') row.deleted = true;
    if (fault === 'editable-peer') row[editable(kind)] = 'Peer changed created row';
    if (fault === 'wrong-parent') { if (kind === 'item') row.errorId = 'another-parent'; else row.stageCode = 'another-stage'; }
    if (fault === 'wrong-operation') row.id = kind + '-different-operation';
    if (fault === 'new-generation') value.control.workflow.generation = 'another-generation';
    if (fault === 'lower-receipt') value.receipt.revision = 0;
    if (fault === 'missing-field') delete row[editable(kind)];
    if (fault === 'pending') value.control.workflow.pendingId='peer-pending';
    if (fault === 'readonly-field') row.sourceRows=['unexpected-source'];
    if (fault !== 'snapshot-mismatch') value.control.versions[0].snapshot = clone(value.control.workflow.working);
    else value.control.versions[0].snapshot[collection(kind)] = [];
    return value;
  });
  await f.apply.click(); assert.equal(f.ui.get().revision, before); assert.equal(posts(f).length, 1);
  assert.ok(f.ui.get().localBatch.created); assert.equal(f.ui.get().modal.type, kind === 'item' ? 'item' : 'new-error');
  if (kind === 'item') assert.equal(f.ui.get().modal.id, 'temp-exact');
  await f.apply.click(); await f.ui.save('apply'); assert.equal(posts(f).length, 1);
});
for (const changed of ['actor', 'epoch', 'delivery', 'host', 'client', 'generation', 'modal']) void test(`late create after ${changed} cannot map private row or adopt ACK`, async () => {
  const f = await fixture(); openCreate(f, 'item'); const local = f.ui.get().working, row = local.items.at(-1), originalModal = f.ui.get().modal, revision = f.ui.get().revision;
  const held = f.holdPost(), pending = f.apply.click(); await held.started.promise;
  if (changed === 'actor') f.window.ProcessSync.identity = { ...f.window.ProcessSync.identity };
  if (changed === 'epoch') f.box.epoch++;
  if (changed === 'delivery') f.box.delivery++;
  if (changed === 'host') f.ui.setHost({ ...f.host });
  if (changed === 'client') f.ui.setClient({});
  if (changed === 'generation') f.ui.get().control.scopes['A:QA'].workflow.generation = 'replacement';
  if (changed === 'modal') f.ui.setModal({ type: 'new-error', name: 'New modal private' });
  held.release.resolve(); await pending;
  assert.equal(f.ui.get().revision, revision); assert.equal(f.ui.get().working, local); assert.equal(local.items.at(-1), row); assert.equal(row.id, 'temp-exact');
  assert.equal(f.ui.get().localBatch.created.modal, originalModal); assert.equal(posts(f).length, 1);
  if(changed==='modal') assert.equal(f.ui.get().modal.name, 'New modal private');
});
for (const kind of ['item', 'error']) void test(`unknown ${kind} original receipt 404 and terminal query never permit another create`, async () => {
  const f = await fixture(); openCreate(f, kind); f.losePost(); await f.apply.click();
  const id = createdId(f, kind), operation = posts(f)[0].body.command, key = collection(kind); assert.equal(f.ui.get().client.hasUnknown(), true);
  f.readReply((url, value) => url.searchParams.has('operationId') ? { status: 404, value: { error: 'OPERATION_NOT_FOUND' } } : { status: 200, value });
  await assert.rejects(f.ui.get().client.resolveUnknown()); assert.equal(f.ui.get().client.hasUnknown(), true);
  await f.apply.click(); await f.close.click(); assert.ok(f.ui.get().modal); assert.equal(posts(f).length, 1);
  f.readReply((url, value) => url.searchParams.has('operationId') ? { status: 200, value: { ...value, receipt: clone(f.state().receipts[operation.operationId].result) } } : { status: 200, value });
  await f.ui.get().client.resolveUnknown(); assert.equal(f.ui.get().client.hasUnknown(), false);
  await f.apply.click(); assert.equal(posts(f).length, 1); assert.equal(f.state().working[key].filter(row => row.id === id).length, 1);
  assert.ok(f.ui.get().localBatch.created); assert.deepEqual(f.calls.slice(1).map(call => call.method), ['GET', 'GET', 'GET']); // Default client first attempts one receipt GET after lost POST.
});
for (const failure of [403, 409, 'throw-status']) void test(`untrusted ${failure} after actual create commit cannot unlock a second create`, async () => {
  const f = await fixture(); openCreate(f, 'item'); f.failAfterCommit(failure); await f.apply.click();
  assert.equal(f.state().working.items.length, 2); assert.ok(f.ui.get().localBatch.created);
  f.fields['#ab-standard'].value = 'Corrected input'; await f.apply.click(); await f.ui.save('apply');
  assert.equal(posts(f).length, 1); assert.equal(f.state().working.items.length, 2);
});
void test('actual upload flight keeps original working/item/modal/array aliases through create ACK and appends to mapped row', async () => {
  const f = await fixture(); openCreate(f, 'item'); const local = f.ui.get().working, row = local.items.at(-1), target = f.ui.get().modal, photos = row.standardPhotos;
  const post = f.holdPost(), create = f.apply.click(); await post.started.promise;
  const photo = f.holdUpload(), upload = f.ui.upload([{name:'synthetic.png',type:'image/png'}],'standard'); await photo.started.promise;
  post.release.resolve(); await create; const id = createdId(f, 'item');
  assert.equal(f.ui.get().working, local); assert.equal(f.ui.get().modal, target); assert.equal(row.id, id); assert.equal(row.standardPhotos, photos);
  photo.release.resolve(); await upload;
  assert.deepEqual(clone(row.standardPhotos), [{id:'a'.repeat(64),name:'synthetic.png',note:''}]);
  assert.equal(f.ui.get().localBatch.base.items.find(value=>value.id===id).standardPhotos.length, 0);
  assert.equal(posts(f).length, 1); await f.apply.click(); assert.equal(posts(f).length, 2);
  assert.equal(f.state().working.items.find(value=>value.id===id).standardPhotos.length, 1);
});
for (const transition of ['visual-equipment', 'equipment-equipment', 'equipment-visual']) void test(`mapping preserves latest ${transition} selection without applying the sent equipment snapshot`, async () => {
  const f=await fixture(); openCreate(f,'item'); const row=f.ui.get().working.items.at(-1);
  if(transition.startsWith('equipment')){f.fields['#ab-mode'].value='equipment';row.equipmentId='equipment-1';row.equipmentSnapshot={id:'equipment-1',assetCode:'Local1'};}
  const held=f.holdPost(), pending=f.apply.click();await held.started.promise;
  const latest=transition.endsWith('visual')?'visual':'equipment', snapshot={id:'equipment-2',assetCode:'Local newest selection'};
  f.fields['#ab-mode'].value=latest;row.equipmentId=latest==='visual'?'':'equipment-2';row.equipmentSnapshot=latest==='visual'?null:snapshot;
  held.release.resolve();await pending;assert.equal(f.ui.get().working.items.at(-1),row);assert.equal(row.id,createdId(f,'item'));
  assert.equal(row.inspectionMode,latest);assert.equal(row.equipmentSnapshot,latest==='visual'?null:snapshot);
  const base=f.ui.get().localBatch.base.items.at(-1);assert.equal(base.equipmentId,transition.startsWith('equipment')?'equipment-1':'');
  await f.apply.click();assert.equal(posts(f).length,2);assert.equal(posts(f)[1].status,200);
  const actual=f.state().working.items.at(-1);assert.equal(actual.equipmentId,latest==='visual'?'':'equipment-2');
  assert.equal(actual.equipmentSnapshot?.id||null,latest==='visual'?null:'equipment-2');
});
for (const kind of ['item','error']) void test(`peer changes the exact created ${kind} after mapping; next manual Apply conflicts against original sent guard`,async()=>{
  const f=await fixture();await nextCreate(f,kind);const id=createdId(f,kind),key=collection(kind),field=editable(kind);
  f.peer(flow=>{flow.working[key].find(row=>row.id===id)[field]='Peer next value';});await f.apply.click();
  assert.equal(posts(f).length,2);assert.equal(posts(f)[1].status,409);assert.equal(f.state().working[key].find(row=>row.id===id)[field],'Peer next value');
  assert.equal(f.ui.get().working[key].find(row=>row.id===id)[field],'Newest private input');
});
if(process.env.AB_CREATE_NEXT_BASELINE)void test('paired normal creates keep identical request counts and bytes',async(t)=>{
  const baseline=fs.readFileSync(process.env.AB_CREATE_NEXT_BASELINE,'utf8');
  for(const kind of ['item','error']){
    async function measure(text){const f=await fixture(text);openCreate(f,kind);await f.apply.click();assert.equal(posts(f).length,1);assert.equal(f.calls.length,1);assert.equal(posts(f)[0].status,200);return f.calls.map(({method,requestBytes,responseBytes})=>({method,requestBytes,responseBytes}));}
    const old=await measure(baseline),current=await measure(source);assert.deepEqual(current,old);t.diagnostic(JSON.stringify({kind,old,current,sourceSha256:createHash('sha256').update(source).digest('hex')}));
  }
});
void test('mapped item Cancel does not discard another pre-dispatch private row edit',async()=>{
  const f=await fixture();f.ui.get().working.items[0].methodText='Other retained input';await nextCreate(f,'item');
  await f.close.click();assert.equal(f.ui.get().working.items[0].methodText,'Other retained input');
  assert.equal(f.ui.get().localBatch.base.items[0].methodText,'Initial method');await f.ui.save('apply');
  assert.deepEqual(posts(f)[1].body.command.guards,[{path:['items',{id:'item-1'},'methodText'],value:'Initial method'}]);
});
void test('exact temporary viewer follows mapped item; another viewer is never retargeted',async()=>{
  for(const target of ['temp-exact','item-1']){
    const f=await fixture();openCreate(f,'item');const viewer={itemId:target,kind:'standard',index:0};f.ui.setViewer(viewer);
    const held=f.holdPost(),pending=f.apply.click();await held.started.promise;f.fields['#ab-standard'].value='Next';held.release.resolve();await pending;
    assert.equal(f.ui.get().viewer,viewer);assert.equal(viewer.itemId,target==='temp-exact'?createdId(f,'item'):target);
  }
});
for(const fault of ['duplicate-temp','deleted-temp','local-server-id-collision'])void test(`live ${fault} during create ACK retains RAM and blocks remapping/recreation`,async()=>{
  const f=await fixture();openCreate(f,'item');const held=f.holdPost(),pending=f.apply.click();await held.started.promise;
  if(fault==='duplicate-temp')f.ui.get().working.items.push(clone(f.ui.get().working.items.at(-1)));
  if(fault==='deleted-temp')f.ui.get().working.items.at(-1).deleted=true;
  if(fault==='local-server-id-collision')f.ui.get().working.items.push(item(createdId(f,'item')));
  const before=clone(f.ui.get().working);held.release.resolve();await pending;assert.deepEqual(clone(f.ui.get().working),before);
  assert.ok(f.ui.get().localBatch.created);await f.apply.click();assert.equal(posts(f).length,1);
});
void test('adapter-only 422 without actual-route UUID retains exact create fence rather than guessing trusted noncommit',async()=>{
  const f=await fixture();openCreate(f,'item');f.fields['#ab-mode'].value='equipment';await f.apply.click();
  assert.equal(posts(f)[0].status,422);assert.equal(f.state().working.items.length,1);assert.ok(f.ui.get().localBatch.created);
  f.fields['#ab-mode'].value='visual';await f.apply.click();assert.equal(posts(f).length,1);
  // This adapter-only response has no actual-route request UUID. Only the
  // separately tested original HTTP pre-CAS proof may settle a trusted rejection.
});
for(const kind of ['item','error'])void test(`canonical allocated ${kind} code uses original prefix and positive padded suffix`,async()=>{
  for(const suffix of ['0','00','001','wrong-prefix']){
    const f=await fixture();openCreate(f,kind);const before=f.ui.get().revision;
    f.postReply((value,sent)=>{const row=value.control.workflow.working[collection(kind)].find(row=>row.id===kind+'-'+sent.command.operationId);
      row.code=(kind==='item'?'A-QA-01-L01-':'A-QA-1-L')+suffix;
      value.control.versions[0].snapshot=clone(value.control.workflow.working);return value;});
    await f.apply.click();assert.equal(f.ui.get().revision,before);assert.ok(f.ui.get().localBatch.created);await f.apply.click();assert.equal(posts(f).length,1);
  }
});
for(const shape of ['object','missing'])void test(`create-error rejects unrelated items ${shape} before whole-model adoption`,async()=>{
  const f=await fixture();openCreate(f,'error');const before=f.ui.get().revision;
  f.postReply(value=>{if(shape==='object')value.control.workflow.working.items={};else delete value.control.workflow.working.items;value.control.versions[0].snapshot=clone(value.control.workflow.working);return value;});
  await f.apply.click();assert.equal(f.ui.get().revision,before);assert.ok(f.ui.get().localBatch.created);await f.apply.click();assert.equal(posts(f).length,1);
});
void test('a simultaneously altered ACK parent code cannot authorize its fabricated created item code',async()=>{
  const f=await fixture();openCreate(f,'item');const before=f.ui.get().revision;
  f.postReply((value,sent)=>{value.control.workflow.working.errors[0].code='fabricated-parent';value.control.workflow.working.items.find(row=>row.id==='item-'+sent.command.operationId).code='fabricated-parent-01';value.control.versions[0].snapshot=clone(value.control.workflow.working);return value;});
  await f.apply.click();assert.equal(f.ui.get().revision,before);assert.ok(f.ui.get().localBatch.created);await f.apply.click();assert.equal(posts(f).length,1);
});
