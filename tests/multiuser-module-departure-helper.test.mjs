import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the actual shared adapter, not a copy. The surrounding VersionDraftUI
// DOM mounting is covered separately; these ports deliberately model only the
// module ownership, acknowledged Save and unshared-buffer boundaries.
const source = fs.readFileSync(new URL('../public/process/version-draft-ui.js', import.meta.url), 'utf8');
const start = source.indexOf('  function createDeparture(config){');
const end = source.indexOf('  host.VersionDraftUI=', start);
assert(start >= 0 && end > start, 'VersionDraftUI.createDeparture source boundary exists');
const helper = source.slice(start, end);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function fixture(options = {}) {
  const state = {
    local: false, shared: true, busy: false, unknown: false, failed: false,
    locked: false, canSave: true, canDiscard: true, localSave: false,
    active: true, current: true, composing: false, epoch: 1,
    scope: 'module-a', version: 'draft-1', delivery: 1,
    ...options,
  };
  const flow = {generation: 'generation-1', pendingId: null, saved: {id: 'saved-1', content: {value: 'saved'}}, working: {value: 'shared'}};
  const root = {inert: false}, dialog = {inert: true};
  const document = {documentElement: {lang: options.lang || 'zh-TW'}};
  const calls = {save: 0, discard: 0, apply: 0, sync: 0, post: 0, close: 0};
  const host = {
    ProcessSync: {
      identity: {id: 'actor-a'}, requiresReload: false,
      identityGeneration: () => state.epoch,
      captureDelivery: () => state.delivery,
      isCurrentDelivery: token => token === state.delivery,
    },
    ProcessNavigationForms: {composing: () => state.composing},
    sharedDraftNeedsSave: () => state.shared,
  };
  const context = vm.createContext({host, document});
  const create = vm.runInContext(helper + '\ncreateDeparture;', context);
  const config = {
    root: () => root, dialogs: () => [dialog], active: () => state.active,
    current: () => state.current, context: () => [state.scope, state.version, flow.generation],
    flow: () => flow, local: () => state.local, busy: () => state.busy,
    unknown: () => state.unknown, failed: () => state.failed,
    locked: () => state.locked, canSave: () => state.canSave,
    canDiscard: () => state.canDiscard, localSave: () => state.localSave,
    async save() {
      calls.save++; calls.post++;
      if (state.saveHook) return state.saveHook();
      state.shared = false; state.local = false;
      flow.saved = {id: 'saved-2', content: structuredClone(flow.working)};
      return {receipt: {savedId: 'saved-2'}};
    },
    discard() {
      calls.discard++;
      if (state.discardHook) return state.discardHook();
      state.local = false;
    },
    closeClean() { calls.close++; },
    apply() { calls.apply++; }, sync() { calls.sync++; },
  };
  const adapter = create(config);
  return {state, flow, root, dialog, host, document, calls, config, adapter};
}

void test('unapplied input blocks departure Save without applying or syncing', async () => {
  const f = fixture({local: true, shared: false});
  const status = f.adapter.inspect();
  assert.equal(status.state, 'dirty'); assert.equal(status.canSave, false);
  assert.equal(status.canDiscard, true); assert.match(status.reason, /未套用/);
  await assert.rejects(f.adapter.save(), /未套用/);
  assert.equal(f.state.local, true);
  assert.deepEqual(f.calls, {save: 0, discard: 0, apply: 0, sync: 0, post: 0, close: 0});
});

void test('module-specific local action location is reported without executing it', async () => {
  const f = fixture({local: true, shared: false});
  f.config.localReason = () => '請返回矩陣按「套用勾選變更」';
  assert.match(f.adapter.inspect().reason, /套用勾選變更/);
  await assert.rejects(f.adapter.save(), /套用勾選變更/);
  assert.equal(f.calls.apply, 0); assert.equal(f.calls.post, 0);
});

void test('discard clears only the local buffer and holds source inert until release', async () => {
  const f = fixture({local: true, shared: false});
  const saved = structuredClone(f.flow.saved), working = structuredClone(f.flow.working);
  const lease = await f.adapter.discard();
  assert.equal(f.state.local, false); assert.equal(f.calls.discard, 1);
  assert.equal(f.calls.post, 0); assert.equal(f.calls.apply, 0);
  assert.deepEqual(f.flow.saved, saved); assert.deepEqual(f.flow.working, working);
  assert.equal(f.root.inert, true); assert.equal(f.dialog.inert, true);
  assert.equal(f.adapter.inspect().state, 'clean');
  lease.release(); lease.release();
  assert.equal(f.root.inert, false); assert.equal(f.dialog.inert, true);
});

void test('shared unsaved content cannot be discarded, even with local changes', async () => {
  for (const local of [false, true]) {
    const f = fixture({local});
    assert.equal(f.adapter.inspect().canDiscard, false);
    await assert.rejects(f.adapter.discard());
    assert.equal(f.state.shared, true); assert.equal(f.state.local, local);
    assert.equal(f.calls.discard, 0); assert.equal(f.calls.post, 0);
  }
});

void test('shared-only Save requires acknowledged result and clean readback before lease', async () => {
  const f = fixture();
  assert.match(f.adapter.inspect().reason, /整個模組/);
  const lease = await f.adapter.save();
  assert.equal(f.calls.save, 1); assert.equal(f.calls.post, 1);
  assert.equal(f.flow.saved.id, 'saved-2');
  assert.equal(f.adapter.inspect().state, 'clean');
  assert.equal(f.root.inert, true); lease.release(); assert.equal(f.root.inert, false);
});

void test('explicit local-Save module retains its original submission contract', async () => {
  const f = fixture({local: true, shared: false, localSave: true});
  assert.equal(f.adapter.inspect().canSave, true);
  const lease = await f.adapter.save();
  assert.equal(f.calls.save, 1); assert.equal(f.calls.apply, 0); assert.equal(f.calls.sync, 0);
  lease.release();
});

for (const swallowed of [false, null, undefined]) {
  void test(`swallowed Save ${String(swallowed)} cannot authorize departure even if readback looks clean`, async () => {
    const f = fixture();
    f.state.saveHook = () => { f.state.shared = false; return swallowed; };
    await assert.rejects(f.adapter.save(), /失敗|未完成/);
    assert.equal(f.calls.save, 1); assert.equal(f.root.inert, false);
  });
}

void test('truthy Save response with remaining shared changes does not authorize leave', async () => {
  const f = fixture(); f.state.saveHook = () => ({receipt: {savedId: 'old'}});
  await assert.rejects(f.adapter.save());
  assert.equal(f.state.shared, true); assert.equal(f.root.inert, false);
});

void test('new local input during Save is preserved and prevents lease', async () => {
  const f = fixture();
  f.state.saveHook = () => { f.state.shared = false; f.state.local = true; return {receipt: {savedId: 'saved-2'}}; };
  await assert.rejects(f.adapter.save(), /未套用/);
  assert.equal(f.state.local, true); assert.equal(f.calls.discard, 0); assert.equal(f.root.inert, false);
});

void test('unknown result is receipt-only and rejects Save and discard without POST', async () => {
  const f = fixture({local: true, unknown: true});
  assert.equal(f.adapter.inspect().state, 'unknown');
  assert.match(f.adapter.inspect().reason, /收據/);
  await assert.rejects(f.adapter.save()); await assert.rejects(f.adapter.discard());
  assert.equal(f.calls.post, 0); assert.equal(f.calls.discard, 0); assert.equal(f.state.local, true);
});

void test('unknown result appearing after Save response still prevents departure', async () => {
  const f = fixture();
  f.state.saveHook = () => { f.state.shared = false; f.state.unknown = true; return {}; };
  await assert.rejects(f.adapter.save(), /收據/);
  assert.equal(f.calls.post, 1); assert.equal(f.root.inert, false);
});

for (const locked of ['pending', 'readonly']) {
  void test(`${locked} preserves input until explicit local discard, while shared writes stay forbidden`, async () => {
    const f = fixture({local: true, shared: false});
    if (locked === 'pending') f.flow.pendingId = 'case-1'; else f.state.locked = true;
    const status = f.adapter.inspect();
    assert.equal(status.canSave, false); assert.equal(status.canDiscard, true);
    assert.match(status.reason, /待審|唯讀/);
    await assert.rejects(f.adapter.save()); assert.equal(f.state.local, true);
    const lease=await f.adapter.discard();lease.release();
    assert.equal(f.calls.post, 0); assert.equal(f.calls.discard, 1); assert.equal(f.state.local, false);
  });
}

void test('separate Save permission is required; no edit-permission substitute', async () => {
  const f = fixture({canSave: false});
  assert.equal(f.adapter.inspect().canSave, false); assert.match(f.adapter.inspect().reason, /儲存權限/);
  await assert.rejects(f.adapter.save()); assert.equal(f.calls.post, 0);
});

void test('server edit revocation does not forbid erasing owned unsent local input', async () => {
  const f = fixture({local: true, shared: false});
  assert.equal(f.adapter.inspect().canDiscard, true);
  f.state.canDiscard = false;
  const before=structuredClone(f.flow),lease=await f.adapter.discard();lease.release();
  assert.equal(f.state.local, false); assert.equal(f.calls.discard, 1);assert.equal(f.calls.post,0);assert.deepEqual(f.flow,before);
});

for (const [name, change] of [
  ['identity object', f => { f.host.ProcessSync.identity = {id: 'actor-b'}; }],
  ['same account new identity epoch', f => { f.state.epoch++; }],
  ['scope', f => { f.state.scope = 'module-b'; }],
  ['generation', f => { f.flow.generation = 'generation-2'; }],
  ['selected version', f => { f.state.version = 'draft-2'; }],
  ['delivery', f => { f.state.delivery++; }],
  ['revoked context', f => { f.state.current = false; }],
  ['reload required', f => { f.host.ProcessSync.requiresReload = true; }],
  ['replaced source root', f => { f.config.root = () => ({inert: false}); }],
]) {
  void test(`late Save after ${String(name)} change cannot authorize navigation`, async () => {
    const f = fixture(), wait = deferred();
    f.state.saveHook = () => wait.promise;
    const pending = f.adapter.save();
    assert.equal(f.root.inert, true); assert.equal(f.adapter.inspect().state, 'busy');
    change(f); f.state.shared = false; wait.resolve({receipt: {savedId: 'saved-2'}});
    await assert.rejects(pending, /登入身分|權限已變更/);
    assert.equal(f.calls.post, 1); assert.equal(f.root.inert, false);
  });
}

void test('rapid duplicate Save does not duplicate POST and held lease remains exclusive', async () => {
  const f = fixture(), wait = deferred();
  f.state.saveHook = () => wait.promise;
  const pending = f.adapter.save();
  await assert.rejects(f.adapter.save()); await assert.rejects(f.adapter.discard());
  assert.equal(f.calls.post, 1);
  f.state.shared = false; wait.resolve({receipt: {savedId: 'saved-2'}});
  const lease = await pending;
  f.state.shared = true;
  await assert.rejects(f.adapter.save()); assert.equal(f.calls.post, 1);
  lease.release(); assert.equal(f.root.inert, false);
});

void test('held departure lease cannot become a navigation permit for a newer module generation', async () => {
  const f = fixture();
  const lease = await f.adapter.save();
  // The destination GET can still be pending after Save is acknowledged.
  f.flow.generation = 'generation-replaced-while-target-loading';
  assert.equal(f.adapter.inspect().state, 'unknown');
  assert.throws(() => f.adapter.closeClean());
  assert.equal(f.calls.close, 0); assert.equal(f.calls.post, 1);
  lease.release(); assert.equal(f.root.inert, false);
});

void test('thrown Save or discard error restores original inert state and retains input', async () => {
  for (const kind of ['save', 'discard']) {
    const f = fixture(kind === 'discard' ? {local: true, shared: false} : {});
    f.state[kind + 'Hook'] = () => { throw Error('REJECTED_FOR_FIXTURE'); };
    await assert.rejects(f.adapter[kind](), /REJECTED_FOR_FIXTURE/);
    assert.equal(f.root.inert, false); assert.equal(f.dialog.inert, true);
    assert.equal(kind === 'discard' ? f.state.local : f.state.shared, true);
  }
});

void test('busy, composition and rejected Apply retain state without entering mutation', async () => {
  for (const key of ['busy', 'composing', 'failed']) {
    const f = fixture({[key]: true, local: true});
    assert.equal(f.adapter.inspect().state, key === 'failed' ? 'blocked' : 'busy');
    await assert.rejects(f.adapter.save()); await assert.rejects(f.adapter.discard());
    assert.equal(f.calls.post, 0); assert.equal(f.state.local, true);
  }
});

void test('clean pending/read-only viewer can leave without mutating shared content', () => {
  const f = fixture({shared: false, locked: true}); f.flow.pendingId = 'case-1';
  assert.equal(f.adapter.inspect().state, 'clean');
  f.adapter.closeClean(); assert.equal(f.calls.close, 1); assert.equal(f.calls.post, 0);
});

void test('closeClean refuses dirty forms; ownsDialog accepts only exact module dialog', () => {
  const f = fixture({local: true, shared: false});
  assert.equal(f.adapter.ownsDialog(f.dialog), true);
  assert.equal(f.adapter.ownsDialog({inert: true}), false);
  assert.throws(() => f.adapter.closeClean()); assert.equal(f.calls.close, 0);
});

void test('inactive modules do not block other destinations or mutate their buffers', async () => {
  const f = fixture({local: true, active: false, unknown: true});
  assert.equal(f.adapter.inspect().state, 'clean');
  await assert.rejects(f.adapter.save()); await assert.rejects(f.adapter.discard());
  assert.equal(f.state.local, true); assert.equal(f.calls.post, 0);
});

void test('status and disabled reasons follow Chinese and Vietnamese without changing state', () => {
  const f = fixture({local: true, shared: false});
  assert.match(f.adapter.inspect().reason, /未套用/);
  f.document.documentElement.lang = 'vi';
  assert.match(f.adapter.inspect().reason, /chưa áp dụng/);
  f.state.unknown = true; assert.match(f.adapter.inspect().reason, /biên nhận/);
  f.state.unknown = false; f.flow.pendingId = 'case-1';
  assert.match(f.adapter.inspect().reason, /chờ duyệt/);
  assert.equal(f.state.local, true); assert.equal(f.calls.post, 0);
});

for(const readonly of [true,false])test(`only another actor's shared changes do not trap ${readonly?'viewer':'untouched editor'}`,async()=>{const f=fixture({canSave:!readonly,canDiscard:!readonly});f.flow.contributors={field:{actor:{id:'actor-b'}}};const before=structuredClone(f.flow);assert.equal(f.adapter.inspect().state,'clean');f.adapter.closeClean();await assert.rejects(f.adapter.save());await assert.rejects(f.adapter.discard());assert.deepEqual(f.flow,before);assert.equal(f.calls.post,0);});
test('viewer with missing legacy attribution and no local/unknown operation can safely leave persisted shared data',()=>{const f=fixture({canSave:false,canDiscard:false});assert.equal(f.adapter.inspect().state,'clean');assert.equal(f.calls.post,0);});
test('different-actor dirty plus local-only discard leaves shared data untouched',async()=>{const f=fixture({local:true});f.flow.contributors={field:{actor:{id:'actor-b'}}};const before=structuredClone(f.flow),lease=await f.adapter.discard();assert.equal(f.adapter.inspect().state,'clean');assert.deepEqual(f.flow,before);assert.equal(f.calls.post,0);lease.release();});
test('unknown own operation still blocks a viewer despite only peer-attributed shared changes',async()=>{const f=fixture({canSave:false,canDiscard:false,unknown:true});f.flow.contributors={field:{actor:{id:'actor-b'}}};assert.equal(f.adapter.inspect().state,'unknown');await assert.rejects(f.adapter.discard());assert.equal(f.calls.post,0);});
test('known own actor changes and missing attribution stay conservative; never authorize whole-scope rollback',()=>{for(const contributors of [undefined,{}, {field:{actor:{id:'actor-a'}}}]){const f=fixture();f.flow.contributors=contributors;assert.equal(f.adapter.inspect().state,'dirty');assert.equal(f.adapter.inspect().canDiscard,false);}});
