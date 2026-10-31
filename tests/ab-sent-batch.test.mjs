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
const sourcePath = process.env.AB_SENT_BATCH_SOURCE || 'public/process/ipqc-ab.js';
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
  let hold = null, beforeCommit = () => {}, getHold = null, pollTask = null, receiptOnly = false, paintChecks = 0, readReply = (_url, value) => ({ value, status: 200 }), losePost = false;
  const calls = [];
  const permissions = Object.fromEntries(['view', 'edit', 'save', 'submit', 'withdraw', 'approve', 'return', 'history', 'delete', 'create', 'restore'].map(key => [key, true]));
  const project = current => ({ activeVersionId: current.active.id, workflow: clone(current), versions: [{ id: 'shared-' + current.generation, number: 1,
    status: current.pendingId ? 'pending' : 'draft', revision: current.revision, snapshot: clone(current.working), history: [], creatorId: 'owner', creatorName: 'Synthetic', createdAt: 'fixture', updatedAt: 'fixture' }] });
  const root = () => ({ schemaVersion: 1, scopes: { 'A:QA': { line: 'A', group: 'QA', ...project(flow) }, ...(twoScopes ? { 'A:QB': { line: 'A', group: 'QB', ...project(secondFlow) } } : {}) },
    moduleDraft: project(moduleFlow), source: null, reservedErrorCodes: [], reservedItemCodes: [] });
  const body = () => ({ control: root(), catalog: clone(localCatalog), equipment: [], revision });
  const fields = {
    '#ab-standard': { value: content.items[0].standard }, '#ab-method': { value: content.items[0].methodText },
    '#ab-enabled': { checked: true }, '#ab-error-name': { value: content.errors[0].name },
  };
  let visibleFields = fields;
  const modalBody = { querySelector: selector => selector === '[name="ab-mode"]:checked' ? { value: 'visual' } : fields[selector] || null,
    querySelectorAll: () => [] };
  const buttons = ['P1', 'P2'].map(code => ({ checked: false, disabled: false, dataset: { abMatrixItem: 'item-1', abMatrixProduct: code },
    addEventListener(_event, callback) { this.change = callback; } }));
  const retry = {}, receiptQuery = {};
  const groupSelect = { addEventListener(_event, callback) { this.change = callback; } };
  const apply = { addEventListener(_event, callback) { this.click = callback; } };
  const host = { isConnected: true, dataset: { activeTab: 'quality-ipqc-ab' }, contains: () => false,
    querySelector: selector => selector === '.ipqcab-dialog-body' ? (visibleFields === fields ? modalBody : null) : selector === '[data-ab-access-retry]' ? retry : selector === '[data-ab-receipt-query]' ? (host.markup?.includes('data-ab-receipt-query') ? receiptQuery : null) : selector === '#ab-apply' ? apply : selector === '#ipqcab-group' ? groupSelect : visibleFields[selector] || null,
    querySelectorAll: selector => selector === '[data-ab-matrix-item]' ? buttons : [], childNodes: [{ fields }],
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
            categoryGroups: localCatalog.groups, lines: [{ code: 'A', stages: [{ code: 'S01', name: 'Synthetic' }] }] } } }) } };
          const context = adapter.context(control, state, base);
          const applied = adapter.apply(control, sent.command, context); if (requestScope === 'A:QB') secondFlow = applied.state; else flow = applied.state; revision++;
          value = { control: project(applied.state), permissions, revision, receipt: clone(applied.receipt) };
        }
      } catch (error) { value = { error: error.code || error.message, details: error.details }; responseStatus = error.status || 500; }
      if (receiptOnly && value.receipt) { delete value.control; receiptOnly = false; }
      call.status = responseStatus; call.responseBytes = Buffer.byteLength(JSON.stringify(value));
      if (hold) { const held = hold; hold = null; held.started.resolve(); await held.release.promise; }
      if (losePost) { losePost = false; throw Error('Synthetic lost ACK'); }
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
  const hook = `__test:{writeShared,save,moduleSave,load,bind,transport,moduleTransport,scheduleRefresh,reconfirmRetainedDelivery:typeof reconfirmRetainedDelivery==='undefined'?null:reconfirmRetainedDelivery,
    init(value,page){control=value.control;catalog=value.catalog;equipment=[];revision=value.revision;host=page;line='A';group='QA';stage='S01';errorId='error-1';versionId=opened().id;working=clone(opened().snapshot);},
    get(){return{control,revision,working,busy,message,modal,modalBase,host,accessBlocked,privateQuarantine,client:sharedClient,localBatch:typeof localBatch==='undefined'?null:localBatch};},
    setWorking(value){working=value;},setModal(value){modal=value;modalBase=clone(opened().snapshot);modalGeneration=scope().workflow.generation;},
    replacePendingOperation(){const old=pendingOperations.get(sharedClient);pendingOperations.set(sharedClient,{...old,operationId:'new-original-operation'});},setRevision(value){revision=value;},setHost(value){host=value;},setScope(value){group=value;},setClient(value){sharedClient=value;},setBusy(value){busy=value;}
  },`;
  vm.runInContext(text.replace(anchor, anchor + hook), context, { filename: sourcePath });
  const ui = window.IPQCABUI.__test; ui.init(body(), host); assert.equal(await ui.load(false), true); await ui.transport().read(); ui.bind(); calls.length = 0;
  return { ui, box, window, host, fields, apply, retry, receiptQuery, groupSelect, buttons, calls, permissions,
    readReply: callback => { readReply = callback; }, losePost: () => { losePost = true; }, modulePending: () => { moduleFlow.pendingId = 'pending-module'; },
    state: (scope = 'A:QA') => clone(scope === 'A:QB' ? secondFlow : flow), root, body, paintChecks: () => paintChecks, receiptOnly: () => { receiptOnly = true; },
    holdPost() { const value = { started: deferred(), release: deferred() }; hold = value; return value; },
    holdGet(predicate) { const value = { predicate, started: deferred(), release: deferred() }; getHold = value; return value; },
    beforeCommit: callback => { beforeCommit = callback; },
    peer(callback) { callback(flow); revision++; },
    poll: async () => { ui.scheduleRefresh(); assert(pollTask); await pollTask(); },
    reset: () => window.IPQCABUI.navigation.reset(),
  };
}

void test('actual matrix handler retains P2 typed while P1 Apply ACK is pending, then explicitly sends only the next batch', async () => {
  const f = await fixture(), held = f.holdPost();
  f.buttons[0].checked = true; const first = f.buttons[0].change(); await held.started.promise;
  f.buttons[1].checked = true; await f.buttons[1].change();
  assert.deepEqual(clone(f.ui.get().working.items[0].productCodes), ['P1', 'P2']);
  held.release.resolve(); await first;
  assert.deepEqual(clone(f.state().working.items[0].productCodes), ['P1']);
  assert.deepEqual(clone(f.ui.get().working.items[0].productCodes), ['P1', 'P2']);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.match(f.ui.get().message, /未套用|chưa áp dụng/);
  await f.ui.save('apply');
  const posts = f.calls.filter(call => call.method === 'POST'); assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].body.command.guards, [{ path: ['items', { id: 'item-1' }, 'productCodes'], value: ['P1'] }]);
  assert.deepEqual(clone(f.state().working.items[0].productCodes), ['P1', 'P2']);
  assert.equal(f.ui.get().localBatch, null);
});

void test('actual modal Apply captures DOM-only next standard/method before redraw and does not close the edited modal', async () => {
  const f = await fixture(); f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
  f.fields['#ab-standard'].value = 'Sent standard'; const held = f.holdPost(), pending = f.apply.click(); await held.started.promise;
  f.fields['#ab-standard'].value = 'Next DOM standard'; f.fields['#ab-method'].value = 'Next DOM method';
  held.release.resolve(); await pending;
  assert.equal(f.state().working.items[0].standard, 'Sent standard');
  assert.equal(f.ui.get().working.items[0].standard, 'Next DOM standard');
  assert.equal(f.ui.get().working.items[0].methodText, 'Next DOM method');
  assert.equal(f.ui.get().modal?.id, 'item-1');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

void test('peer edit in an unsent field never becomes a new local guard; next Apply conflicts instead of overwriting peer', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Own sent standard';
  f.beforeCommit(() => { f.peer(flow => { flow.working.items[0].methodText = 'Peer method'; }); f.beforeCommit(() => {}); });
  const held = f.holdPost(), first = f.ui.save('apply'); await held.started.promise;
  f.ui.get().working.items[0].methodText = 'Own next method'; held.release.resolve(); await first;
  assert.equal(f.ui.get().control.scopes['A:QA'].workflow.working.items[0].methodText, 'Peer method');
  assert.equal(f.ui.get().working.items[0].methodText, 'Own next method');
  const failed = await f.ui.save('apply'); assert.equal(failed, null);
  const second = f.calls.filter(call => call.method === 'POST')[1]; assert.equal(second.status, 409);
  assert.deepEqual(second.body.command.guards, [{ path: ['items', { id: 'item-1' }, 'methodText'], value: 'Initial method' }]);
  assert.equal(f.state().working.items[0].methodText, 'Peer method');
  assert.equal(f.ui.get().working.items[0].methodText, 'Own next method');
});

for (const change of ['epoch', 'actor', 'delivery', 'host', 'scope', 'generation', 'client', 'lifecycle']) {
  void test('late actual Apply after ' + change + ' cannot adopt metadata, clear local input, or unlock a newer attempt', async () => {
    const f = await fixture(); f.ui.get().working.items[0].standard = 'Original input';
    const before = f.ui.get().revision, held = f.holdPost(), pending = f.ui.save('apply'); await held.started.promise;
    if (change === 'epoch') f.box.epoch++;
    if (change === 'actor') f.window.ProcessSync.identity = { ...f.window.ProcessSync.identity };
    if (change === 'delivery') f.box.delivery++;
    if (change === 'host') f.ui.setHost({ ...f.host });
    if (change === 'scope') f.ui.setScope('OTHER');
    if (change === 'generation') f.ui.get().control.scopes['A:QA'].workflow.generation = 'new-generation';
    if (change === 'client') f.ui.setClient({});
    if (change === 'lifecycle') { f.reset(); f.ui.init(f.body(), f.host); f.ui.setWorking({ ...clone(f.state().working), items: [{ ...item(), standard: 'New lifecycle input' }] }); f.ui.setBusy(true); }
    held.release.resolve(); await pending;
    if (change === 'lifecycle') { assert.equal(f.ui.get().working.items[0].standard, 'New lifecycle input'); assert.equal(f.ui.get().busy, true); }
    else { assert.equal(f.ui.get().revision, before); assert.equal(f.ui.get().working.items[0].standard, 'Original input'); }
  });
}

void test('poll and load preserve the next batch and its original base; permission-await input reference replacement is not lost', async () => {
  const f = await fixture(), held = f.holdPost(); f.buttons[0].checked = true; const first = f.buttons[0].change(); await held.started.promise;
  f.buttons[1].checked = true; await f.buttons[1].change(); held.release.resolve(); await first;
  const base = clone(f.ui.get().localBatch.base);
  f.peer(flow => { flow.working.items[0].methodText = 'Peer later method'; }); await f.poll();
  assert.deepEqual(clone(f.ui.get().localBatch.base), base);
  assert.deepEqual(clone(f.ui.get().working.items[0].productCodes), ['P1', 'P2']);
  const permission = f.holdGet(url => url.searchParams.has('permissions')); const reading = f.ui.load(false); await permission.started.promise;
  const newer = clone(f.ui.get().working); newer.items[0].reason = 'Input entered during permission await'; f.ui.setWorking(newer);
  permission.release.resolve(); await reading;
  assert.equal(f.ui.get().working.items[0].reason, 'Input entered during permission await');
  assert.deepEqual(clone(f.ui.get().localBatch.base), base);
});

for (const kind of ['deleted', 'ambiguous', 'generation']) void test('retained batch refuses ' + kind + ' server target without resurrecting or dropping local input', async () => {
  const f = await fixture(), held = f.holdPost(); f.ui.get().working.items[0].standard = 'First'; const first = f.ui.save('apply'); await held.started.promise;
  f.ui.get().working.items[0].methodText = 'Retained next'; held.release.resolve(); await first;
  f.peer(flow => { if (kind === 'deleted') flow.working.items[0].deleted = true; else if (kind === 'ambiguous') flow.working.items.push(clone(flow.working.items[0])); else flow.generation = 'generation-new'; });
  await f.ui.load(true); const before = f.calls.filter(call => call.method === 'POST').length;
  assert.equal(await f.ui.save('apply'), null);
  assert.equal(f.ui.get().working.items[0].methodText, 'Retained next');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, before + (kind === 'generation' ? 0 : 1));
});

void test('normal actual Apply retains one POST and no GET; normal modal closes only after the exact unchanged batch', async (t) => {
  const f = await fixture(); f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
  f.fields['#ab-standard'].value = 'Normally applied'; await f.apply.click();
  assert.equal(f.state().working.items[0].standard, 'Normally applied'); assert.equal(f.ui.get().modal, null); assert.equal(f.ui.get().busy, false);
  assert.deepEqual(f.calls.map(call => call.method), ['POST']);
  t.diagnostic(JSON.stringify({ sourceSha256: createHash('sha256').update(source).digest('hex'), requestBytes: f.calls[0].requestBytes, responseBytes: f.calls[0].responseBytes }));
});

void test('normal module Save and Begin finish their own legal generation transition without sticking busy', async () => {
  const f = await fixture(); assert.ok(await f.ui.save('save')); assert.equal(f.ui.get().busy, false);
  assert.ok(f.calls.some(call => call.body?.command?.action === 'save'));
  const generation = f.ui.get().control.scopes['A:QA'].workflow.generation;
  assert.ok(await f.ui.writeShared('begin')); assert.notEqual(f.ui.get().control.scopes['A:QA'].workflow.generation, generation); assert.equal(f.ui.get().busy, false);
});

void test('module Save does not Apply or mark a new local batch clean during post-Save readback', async () => {
  const f = await fixture(), held = f.holdPost(), saving = f.ui.save('save'); await held.started.promise;
  f.ui.get().working.items[0].methodText = 'New unsent during Save'; held.release.resolve(); await saving;
  assert.equal(f.ui.get().working.items[0].methodText, 'New unsent during Save');
  assert.equal(f.state().working.items[0].methodText, 'Initial method');
  assert.ok(f.ui.get().localBatch); assert.equal(await f.ui.save('save'), null);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

void test('create-item ACK maps later DOM input to its exact server row and manual Apply cannot issue another create', async () => {
  const f = await fixture(), temporary = item('temp-synthetic'); f.ui.get().working.items.push(temporary);
  f.ui.setModal({ type: 'item', id: temporary.id }); f.fields['#ab-standard'].value = 'Created first standard';
  const held = f.holdPost(), creating = f.apply.click(); await held.started.promise;
  f.fields['#ab-standard'].value = 'Later temporary input'; held.release.resolve(); await creating;
  const id = 'item-' + f.calls.find(call => call.method === 'POST').body.command.operationId;
  assert.equal(f.ui.get().modal?.id, id);
  assert.equal(f.ui.get().working.items.find(row => row.id === id).standard, 'Later temporary input');
  assert.equal(f.state().working.items.filter(row => row.id !== 'item-1').length, 1);
  await f.apply.click(); const posts = f.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 2); assert.equal(posts[1].body.command.moduleAction, undefined);
  assert.equal(f.state().working.items.filter(row => row.id !== 'item-1').length, 1);
});

for (const action of ['apply', 'save']) void test('late ' + action + ' cannot capture or close a different modal opened during its flight', async () => {
  const f = await fixture();
  if (action === 'apply') {
    f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
    f.fields['#ab-standard'].value = 'First modal sent';
  }
  const held = f.holdPost(), pending = action === 'apply' ? f.apply.click() : f.ui.save('save'); await held.started.promise;
  const nextModal = { type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]), marker: 'next modal' };
  f.ui.setModal(nextModal); f.fields['#ab-standard'].value = 'Different modal private DOM';
  const painted = f.paintChecks();
  held.release.resolve(); await pending;
  assert.equal(f.ui.get().modal, nextModal);
  assert.notEqual(f.ui.get().working.items[0].standard, 'Different modal private DOM');
  assert.equal(f.fields['#ab-standard'].value, 'Different modal private DOM');
  assert.equal(f.paintChecks(), painted, 'old flight must not enter redraw for the newer modal');
  assert.equal(f.ui.get().busy, false);
});

void test('older ACK cannot roll back a newer already-adopted caller revision or clear its input', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Own awaiting ACK';
  const held = f.holdPost(), pending = f.ui.save('apply'); await held.started.promise;
  f.ui.setRevision(100); f.ui.get().working.items[0].methodText = 'Newer caller input';
  held.release.resolve(); assert.equal(await pending, null);
  assert.equal(f.ui.get().revision, 100); assert.equal(f.ui.get().working.items[0].methodText, 'Newer caller input');
});

// Baseline is an explicitly supplied source file, not a dependency on git history.
// This paired evidence test is registered only for a deliberate local comparison.
if (process.env.AB_SENT_BATCH_BASELINE) void test('paired baseline/current normal Apply and module Save have identical request counts and bytes', async (t) => {
  const baseline = fs.readFileSync(process.env.AB_SENT_BATCH_BASELINE, 'utf8');
  const measure = async (text, action) => {
    const f = await fixture(text);
    if (action === 'apply') {
      f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
      f.fields['#ab-standard'].value = 'Normally applied'; await f.apply.click();
      assert.equal(f.state().working.items[0].standard, 'Normally applied'); assert.equal(f.ui.get().modal, null);
    } else assert.ok(await f.ui.save('save'));
    assert.equal(f.ui.get().busy, false);
    return f.calls.map(({ method, requestBytes, responseBytes }) => ({ method, requestBytes, responseBytes }));
  };
  for (const action of ['apply', 'save']) {
    const old = await measure(baseline, action), current = await measure(source, action);
    assert.deepEqual(current, old);
    t.diagnostic(JSON.stringify({ action, baselineSha256: createHash('sha256').update(baseline).digest('hex'), currentSha256: createHash('sha256').update(source).digest('hex'), old, current }));
  }
});

void test('rejected actual Apply captures newer same-modal DOM before its error redraw without rebasing the original guard', async () => {
  const f = await fixture(); f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
  f.fields['#ab-standard'].value = 'Rejected sent standard';
  f.beforeCommit(() => { f.peer(flow => { flow.working.items[0].standard = 'Conflicting peer standard'; }); f.beforeCommit(() => {}); });
  const held = f.holdPost(), pending = f.apply.click(); await held.started.promise;
  f.fields['#ab-method'].value = 'Next DOM after rejected dispatch'; held.release.resolve(); await pending;
  assert.equal(f.calls.find(call => call.method === 'POST').status, 409);
  assert.equal(f.ui.get().working.items[0].methodText, 'Next DOM after rejected dispatch');
  assert.equal(f.ui.get().localBatch.base.items[0].standard, 'Initial standard');
  assert.equal(f.state().working.items[0].standard, 'Conflicting peer standard');
  assert.equal(f.ui.get().modal?.id, 'item-1');
});

void test('receipt-only fallback read retains input entered during its final permission await, not an earlier reference', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Sent before fallback'; f.receiptOnly();
  const held = f.holdGet(url => url.searchParams.has('permissions')), pending = f.ui.save('apply'); await held.started.promise;
  const next = clone(f.ui.get().working); next.items[0].methodText = 'New reference during fallback'; f.ui.setWorking(next);
  held.release.resolve(); assert.ok(await pending);
  assert.equal(f.ui.get().working, next); assert.equal(f.ui.get().working.items[0].methodText, 'New reference during fallback');
  assert.equal(f.ui.get().localBatch.base.items[0].standard, 'Sent before fallback');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

void test('successful ACK with peer-only fields and no next input is not recaptured from the old pre-render DOM', async () => {
  const f = await fixture(); f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) });
  f.fields['#ab-standard'].value = 'Own sent standard';
  f.beforeCommit(() => { f.peer(flow => { flow.working.items[0].methodText = 'Peer-only method'; }); f.beforeCommit(() => {}); });
  assert.ok(await f.ui.save('apply'));
  assert.equal(f.ui.get().working.items[0].methodText, 'Peer-only method');
  assert.equal(f.ui.get().localBatch, null);
});

void test('same-host reconnect releases only the obsolete attempt busy latch without adopting its ACK or clearing RAM', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Retained after reconnect';
  const held = f.holdPost(), pending = f.ui.save('apply'); await held.started.promise;
  f.box.epoch++; f.box.delivery++; held.release.resolve(); assert.equal(await pending, null);
  assert.equal(f.ui.get().busy, false);
  assert.equal(f.ui.get().revision, 10); assert.equal(f.ui.get().working.items[0].standard, 'Retained after reconnect');
});

for (const boundary of ['actor', 'epoch']) void test('load refuses to join retained private input to a new ' + boundary + ' model on the same host', async () => {
  const f = await fixture(), held = f.holdPost(); f.buttons[0].checked = true;
  const pending = f.buttons[0].change(); await held.started.promise; f.buttons[1].checked = true; await f.buttons[1].change(); held.release.resolve(); await pending;
  const prior = f.ui.get(), batch = prior.localBatch;
  if (boundary === 'actor') f.window.ProcessSync.identity = { id: 'other', name: 'Other synthetic', role: 'admin' }; else f.box.epoch++;
  assert.equal(await f.ui.load(false), false);
  assert.equal(f.ui.get().control, prior.control); assert.equal(f.ui.get().working, prior.working); assert.equal(f.ui.get().localBatch, batch);
  assert.ok(f.ui.get().accessBlocked); assert.match(f.host.innerHTML, /LOCAL_BATCH_RECONFIRM/);
  assert.ok(!f.host.innerHTML.includes('Initial standard'));
});

void test('explicit no-delta next Apply settles only its local batch and allows a subsequent module Save without another Apply POST', async () => {
  const f = await fixture(), held = f.holdPost(); f.buttons[0].checked = true;
  const pending = f.buttons[0].change(); await held.started.promise; f.buttons[1].checked = true; await f.buttons[1].change(); held.release.resolve(); await pending;
  f.ui.get().working.items[0].productCodes = ['P1']; assert.ok(await f.ui.save('apply'));
  assert.equal(f.ui.get().localBatch, null); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(await f.ui.save('save')); assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});

for (const boundary of ['tab', 'detached']) void test('late ACK after same-host ' + boundary + ' cannot adopt model or clear private input', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Kept input'; const held = f.holdPost(), pending = f.ui.save('apply'); await held.started.promise;
  if (boundary === 'tab') f.host.dataset.activeTab = 'quality-other'; else f.host.isConnected = false;
  held.release.resolve(); assert.equal(await pending, null);
  assert.equal(f.ui.get().revision, 10); assert.equal(f.ui.get().working.items[0].standard, 'Kept input'); assert.equal(f.ui.get().busy, false);
});

void test('retained old-owner batch fences every shared mutation action before command admission and never enters a fresh poll', async () => {
  for (const action of ['create-item', 'create-error', 'delete-item', 'approve']) {
    const f = await fixture(), held = f.holdPost(); f.buttons[0].checked = true;
    const pending = f.buttons[0].change(); await held.started.promise; f.buttons[1].checked = true; await f.buttons[1].change(); held.release.resolve(); await pending;
    const count = f.calls.length, prior = f.ui.get(); f.window.ProcessSync.identity = { id: 'other', name: 'Other synthetic', role: 'admin' };
    assert.equal(await f.ui.writeShared(action, { item: item('temp-foreign'), errorId: 'error-1', stageCode: 'S01', name: 'foreign' }), null);
    await f.poll(); assert.equal(f.calls.length, count); assert.equal(f.ui.get().control, prior.control); assert.equal(f.ui.get().working, prior.working);
  }
});

for (const input of ['working', 'DOM-only']) void test('never-applied ' + input + ' stays private to its original loaded owner across actor change', async () => {
  const f = await fixture();
  if (input === 'working') f.ui.get().working.items[0].standard = 'Original actor private';
  else { f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) }); f.fields['#ab-standard'].value = 'Original actor DOM-only private'; }
  assert.equal(f.ui.get().localBatch, null); const prior = f.ui.get(), calls = f.calls.length;
  f.window.ProcessSync.identity = { id: 'other', name: 'Other synthetic', role: 'admin' };
  assert.equal(await f.ui.load(false), false); assert.equal(await f.ui.save('apply'), null);
  assert.equal(f.calls.length, calls); assert.equal(f.ui.get().working, prior.working); assert.equal(f.ui.get().control, prior.control);
  assert.ok(f.ui.get().accessBlocked); assert.ok(!f.host.innerHTML.includes('Original actor'));
  const quarantine = f.ui.get().privateQuarantine;
  assert.equal(await f.ui.load(false), false);
  f.window.ProcessSync.identity = { id: 'third', name: 'Third synthetic', role: 'admin' };
  assert.equal(await f.ui.load(false), false); assert.equal(f.ui.get().privateQuarantine, quarantine); assert.equal(f.calls.length, calls);
  assert.equal(quarantine.owner.actor, quarantine.actor); assert.equal(quarantine.base.items[0].standard, 'Initial standard');
  if (input === 'DOM-only') {
    assert.equal(f.host.querySelector('#ab-standard'), null);
    assert.equal(f.ui.get().privateQuarantine.nodes[0].fields['#ab-standard'].value, 'Original actor DOM-only private');
    assert.equal(f.ui.get().privateQuarantine.actor.id, 'owner');
  }
});

void test('explicit clean group switch establishes the selected scope input basis and can Apply normally without extra reads', async () => {
  const f = await fixture(source, { twoScopes: true });
  f.groupSelect.change({ target: { value: 'QB' } });
  f.ui.get().working.items[0].standard = 'New group own input';
  assert.ok(await f.ui.save('apply'));
  assert.equal(f.state('A:QB').working.items[0].standard, 'New group own input');
  assert.equal(f.state('A:QA').working.items[0].standard, 'Initial standard');
  assert.deepEqual(f.calls.map(call => call.method), ['POST']);
  assert.match(f.calls[0].url, /scope=A%3AQB/);
});

async function retainedMatrix(f) {
  const held = f.holdPost(); f.buttons[0].checked = true;
  const pending = f.buttons[0].change(); await held.started.promise; f.buttons[1].checked = true; await f.buttons[1].change(); held.release.resolve(); await pending;
}

void test('explicit same-owner delivery recheck uses two reads, keeps original next guards, and never sends until manual Apply', async () => {
  const f = await fixture(); await retainedMatrix(f); const base = clone(f.ui.get().localBatch.base); f.box.delivery++;
  const before = f.calls.length; assert.equal(await f.ui.save('apply'), null); await f.poll(); assert.equal(f.calls.length, before);
  await f.retry.onclick(); assert.deepEqual(f.calls.slice(before).map(call => call.method), ['GET', 'GET']);
  assert.deepEqual(clone(f.ui.get().localBatch.base), base); assert.deepEqual(clone(f.ui.get().working.items[0].productCodes), ['P1', 'P2']);
  assert.equal(f.ui.get().accessBlocked, null); assert.equal(f.ui.get().busy, false); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(await f.ui.save('apply')); assert.deepEqual(clone(f.state().working.items[0].productCodes), ['P1', 'P2']);
  assert.deepEqual(f.calls.at(-1).body.command.guards, [{ path: ['items', { id: 'item-1' }, 'productCodes'], value: ['P1'] }]);
});

void test('explicit delivery recheck restores same-owner quarantined DOM only after read authorization, without automatically applying', async () => {
  const f = await fixture(); f.ui.setModal({ type: 'item', id: 'item-1', initial: clone(f.ui.get().working.items[0]) }); f.fields['#ab-standard'].value = 'Private DOM before delivery';
  f.box.delivery++; assert.equal(await f.ui.save('apply'), null); assert.equal(f.host.querySelector('#ab-standard'), null);
  const before = f.calls.length; await f.retry.onclick(); assert.equal(f.calls.length - before, 2);
  assert.equal(f.ui.get().working.items[0].standard, 'Private DOM before delivery'); assert.equal(f.ui.get().localBatch.base.items[0].standard, 'Initial standard');
  assert.equal(f.ui.get().privateQuarantine, null); assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  assert.ok(await f.ui.save('apply')); assert.equal(f.state().working.items[0].standard, 'Private DOM before delivery');
});

void test('delivery recheck may adopt peer shared metadata but never rewrites the retained original guard', async () => {
  const f = await fixture(); await retainedMatrix(f); f.ui.get().working.items[0].methodText = 'Own next method';
  f.peer(flow => { flow.working.items[0].methodText = 'Peer after delivery'; }); f.box.delivery++;
  assert.equal(await f.ui.save('apply'), null); await f.retry.onclick();
  assert.equal(f.ui.get().control.scopes['A:QA'].workflow.working.items[0].methodText, 'Peer after delivery');
  assert.equal(await f.ui.save('apply'), null); assert.equal(f.calls.at(-1).status, 409);
  assert.ok(f.calls.at(-1).body.command.guards.some(guard => guard.path.at(-1) === 'methodText' && guard.value === 'Initial method'));
  assert.equal(f.state().working.items[0].methodText, 'Peer after delivery');
});

for (const denial of ['denied', 'missing-edit', 'missing-view', 'pending', 'module-pending', 'generation', 'old-revision', 'mismatched-snapshot']) void test('delivery recheck ' + denial + ' cannot unlock or rebase private input', async () => {
  const f = await fixture(); await retainedMatrix(f); const prior = f.ui.get(), base = clone(prior.localBatch.base); f.box.delivery++;
  assert.equal(await f.ui.save('apply'), null);
  if (denial === 'denied') f.readReply((url, value) => url.searchParams.has('permissions') ? { status: 403, value: { error: 'FORBIDDEN' } } : { status: 200, value });
  if (denial === 'missing-edit') delete f.permissions.edit;
  if (denial === 'missing-view') delete f.permissions.view;
  if (denial === 'old-revision' || denial === 'mismatched-snapshot') f.readReply((url, value) => { if (url.pathname === '/api/ipqc-ab') { if (denial === 'old-revision') value.revision = 1; else value.control.scopes['A:QA'].versions[0].snapshot.items[0].standard = 'Malformed read projection'; } return { status: 200, value }; });
  if (denial === 'pending') f.peer(flow => { flow.pendingId = 'pending-group'; });
  if (denial === 'module-pending') f.modulePending();
  if (denial === 'generation') f.peer(flow => { flow.generation = 'new-generation'; });
  assert.equal(await f.ui.reconfirmRetainedDelivery(), false);
  assert.equal(f.ui.get().control, prior.control); assert.deepEqual(clone(f.ui.get().localBatch.base), base); assert.equal(f.ui.get().localBatch.owner.delivery, 1);
  assert.ok(f.ui.get().accessBlocked); assert.equal(f.ui.get().busy, false); assert.equal(await f.ui.save('apply'), null);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

for (const boundary of ['actor', 'epoch', 'delivery', 'host', 'tab', 'scope']) void test('late explicit recheck after ' + boundary + ' change cannot unlock the original RAM', async () => {
  const f = await fixture(); await retainedMatrix(f); const prior = f.ui.get(); f.box.delivery++;
  assert.equal(await f.ui.save('apply'), null); const held = f.holdGet(url => url.searchParams.has('permissions')), reading = f.ui.reconfirmRetainedDelivery(); await held.started.promise;
  assert.equal(await f.ui.reconfirmRetainedDelivery(), false, 'duplicate explicit request adds no reads');
  if (boundary === 'actor') f.window.ProcessSync.identity = { ...f.window.ProcessSync.identity }; else if (boundary === 'epoch') f.box.epoch++; else if (boundary === 'host') f.ui.setHost({ ...f.host }); else if (boundary === 'tab') f.host.dataset.activeTab = 'quality-other'; else if (boundary === 'scope') f.ui.setScope('OTHER'); else f.box.delivery++;
  held.release.resolve(); assert.equal(await reading, false);
  assert.equal(f.ui.get().control, prior.control); assert.equal(f.ui.get().localBatch, prior.localBatch); assert.equal(f.ui.get().localBatch.owner.delivery, 1);
  assert.equal(f.ui.get().busy, false); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

void test('actual blocked retry grants only original receipt GET; metadata and receipt 404 preserve unknown, RAM and marker', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Unknown original'; f.losePost();
  assert.equal(await f.ui.save('apply'), null); assert.equal(f.ui.transport().hasUnknown(), true);
  const operationId = f.calls.find(call => call.method === 'POST').body.command.operationId, marker = f.ui.get().localBatch, working = f.ui.get().working;
  f.box.delivery++; assert.equal(await f.ui.save('apply'), null); const before = f.calls.length;
  await f.retry.onclick(); assert.deepEqual(f.calls.slice(before).map(call => call.method), ['GET', 'GET']);
  assert.ok(f.calls.slice(before).every(call => !call.url.includes('operationId=')));
  assert.equal(f.ui.transport().hasUnknown(), true); assert.equal(f.ui.get().localBatch, marker); assert.equal(marker.owner.delivery, 1); assert.equal(f.ui.get().working, working);
  assert.ok(f.ui.get().accessBlocked); assert.ok(f.host.querySelector('[data-ab-receipt-query]'));
  f.readReply((url, value) => url.searchParams.has('operationId') ? { status: 404, value: { error: 'OPERATION_NOT_FOUND' } } : { status: 200, value });
  const querying = f.calls.length; assert.equal(await f.receiptQuery.onclick(), false);
  assert.equal(f.calls.length - querying, 1); assert.equal(f.calls.at(-1).method, 'GET'); assert.equal(new URL(f.calls.at(-1).url, 'https://fixture.invalid').searchParams.get('operationId'), operationId);
  assert.equal(f.ui.transport().hasUnknown(), true); assert.equal(f.ui.get().localBatch, marker); assert.equal(f.ui.get().working, working); assert.equal(f.ui.get().working.items[0].standard, 'Unknown original');
  assert.equal(await f.ui.save('apply'), null); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});


void test('first explicit delivery recheck also admits never-applied RAM without creating a batch during the read', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Never-applied private RAM'; f.box.delivery++;
  assert.equal(f.ui.get().localBatch, null); assert.equal(await f.ui.save('apply'), null);
  const held = f.holdGet(url => url.searchParams.has('permissions')), before = f.calls.length, reading = f.ui.reconfirmRetainedDelivery(); await held.started.promise;
  assert.equal(f.ui.get().localBatch, null, 'authorization read cannot mint a new batch'); held.release.resolve(); assert.equal(await reading, true);
  assert.equal(f.calls.length - before, 2); assert.equal(f.ui.get().localBatch.base.items[0].standard, 'Initial standard');
  assert.equal(f.ui.get().working.items[0].standard, 'Never-applied private RAM'); assert.ok(await f.ui.save('apply'));
  assert.equal(f.state().working.items[0].standard, 'Never-applied private RAM');
});

void test('malformed delivery read cannot switch the retained client through load selection fallback or add a third read', async () => {
  const f = await fixture(); await retainedMatrix(f); f.box.delivery++; assert.equal(await f.ui.save('apply'), null);
  const before = f.calls.length, prior = f.ui.get(), client = prior.client, base = clone(prior.localBatch.base);
  f.readReply((url, value) => { if (url.pathname === '/api/ipqc-ab') value.catalog.groups = []; return { status: 200, value }; });
  assert.equal(await f.ui.reconfirmRetainedDelivery(), false);
  assert.equal(f.calls.length - before, 2); assert.equal(f.ui.get().client, client); assert.equal(f.ui.get().localBatch.owner.delivery, 1);
  assert.equal(f.ui.get().working, prior.working); assert.equal(f.ui.get().privateQuarantine, prior.privateQuarantine); assert.deepEqual(clone(f.ui.get().localBatch.base), base);
  assert.ok(f.calls.slice(before).every(call => !call.url.includes('scope=') || call.url.includes('scope=A%3AQA')));
  f.readReply((_url, value) => ({ status: 200, value })); assert.equal(await f.ui.reconfirmRetainedDelivery(), true);
  assert.equal(f.ui.get().client, client); assert.deepEqual(clone(f.ui.get().localBatch.base), base);
});

for (const boundary of ['owner', 'operation']) void test('fresh receipt query UI cannot use its grant after original ' + boundary + ' changes', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Unknown original'; f.losePost(); assert.equal(await f.ui.save('apply'), null);
  f.box.delivery++; assert.equal(await f.ui.save('apply'), null); await f.retry.onclick(); assert.ok(f.host.querySelector('[data-ab-receipt-query]'));
  const before = f.calls.length;
  if (boundary === 'owner') f.box.epoch++; else f.ui.replacePendingOperation();
  assert.equal(await f.receiptQuery.onclick(), false); assert.equal(f.calls.length, before); assert.equal(f.ui.transport().hasUnknown(), true);
});

void test('original terminal receipt settles only the default unknown record; caller RAM/marker stay blocked until another explicit recheck', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Unknown committed'; f.losePost(); assert.equal(await f.ui.save('apply'), null);
  const operationId = f.calls.find(call => call.method === 'POST').body.command.operationId; f.box.delivery++; assert.equal(await f.ui.save('apply'), null); await f.retry.onclick();
  const prior = f.ui.get(), before = f.calls.length;
  f.readReply((url, value) => url.searchParams.has('operationId') ? { status: 200, value: { receipt: f.state().receipts[operationId].result } } : { status: 200, value });
  assert.equal(await f.receiptQuery.onclick(), true); assert.equal(f.calls.length - before, 1); assert.equal(f.calls.at(-1).method, 'GET');
  assert.equal(f.ui.transport().hasUnknown(), false); assert.equal(f.ui.get().control, prior.control); assert.equal(f.ui.get().working, prior.working); assert.equal(f.ui.get().localBatch, prior.localBatch);
  assert.equal(f.ui.get().localBatch.owner.delivery, 1); assert.ok(f.ui.get().accessBlocked); assert.equal(await f.ui.save('apply'), null); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

void test('metadata recheck cannot mint a receipt grant for a replaced original operation during its read', async () => {
  const f = await fixture(); f.ui.get().working.items[0].standard = 'Unknown original'; f.losePost(); assert.equal(await f.ui.save('apply'), null);
  f.box.delivery++; assert.equal(await f.ui.save('apply'), null); const held = f.holdGet(url => url.searchParams.has('permissions')), reading = f.ui.reconfirmRetainedDelivery(); await held.started.promise;
  f.ui.replacePendingOperation(); held.release.resolve(); assert.equal(await reading, false);
  assert.equal(f.host.querySelector('[data-ab-receipt-query]'), null); assert.equal(f.ui.transport().hasUnknown(), true); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
