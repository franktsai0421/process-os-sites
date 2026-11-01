import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const sparseArray = (length) => {
  const value = [];
  value.length = length;
  return value;
};
const source = fs.readFileSync(
  new URL('../public/process/local-draft-recovery.js', import.meta.url),
  'utf8',
);
function storage() {
  const values = new Map(),
    calls = { reads: [], writes: 0, removes: [], clear: 0 };
  return {
    values,
    calls,
    quota: false,
    readError: false,
    removeError: false,
    get length() {
      return values.size;
    },
    key(i) {
      return [...values.keys()][i] ?? null;
    },
    getItem(key) {
      calls.reads.push(key);
      if (this.readError) throw Error('denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.writes++;
      if (this.quota)
        throw Object.assign(Error('full'), { name: 'QuotaExceededError' });
      values.set(key, value);
    },
    removeItem(key) {
      calls.removes.push(key);
      if (this.removeError) throw Error('denied');
      values.delete(key);
    },
    clear() {
      calls.clear++;
      throw Error('must not clear');
    },
  };
}
function fixture(config = {}) {
  const state = {
    actorId: 'a',
    scope: 'ipqc:ab',
    tabId: 'tab-a',
    epoch: 1,
    baseVersion: '["g1",2,"s1"]',
    canView: true,
    canEdit: true,
    pending: false,
    verified: true,
    hasLocalChanges: false,
    localRevision: 0,
    writeState: 'idle',
    ...config.state,
  };
  const timers = new Map(),
    allTimers = [],
    calls = { network: 0, capture: 0, stringify: 0 };
  const store = config.storage || storage();
  const host = {
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    localStorage: store,
    fetch() {
      calls.network++;
      throw Error('NETWORK_FORBIDDEN');
    },
    XMLHttpRequest() {
      calls.network++;
      throw Error('NETWORK_FORBIDDEN');
    },
  };
  const sandbox = vm.createContext({
    window: host,
    TextEncoder,
    Uint8Array,
    JSON: {
      parse: JSON.parse,
      stringify(value) {
        calls.stringify++;
        return JSON.stringify(value);
      },
    },
  });
  vm.runInContext(source, sandbox);
  let sequence = 0;
  const options = {
    storage: store,
    leaseProtocol: 'web-lock-v1',
    ...(config.options?.ownsRecovery ? { ownsLineage: () => true, adoptLineage: () => true } : {}),
    getContext: () => state,
    now: () => 1793400000000,
    setTimeout(fn) {
      const id = ++sequence;
      timers.set(id, fn);
      allTimers.push(fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    ...config.options,
  };
  const recovery = host.LocalDraftRecovery.create(options);
  const capture = (value) => () => {
    calls.capture++;
    return value;
  };
  function tick() {
    const queued = [...timers.values()];
    timers.clear();
    for (const fn of queued) fn();
  }
  function save(value = { name: 'draft' }) {
    assert.equal(recovery.schedule(capture(value)).code, 'SCHEDULED');
    tick();
    assert.equal(recovery.status().code, 'OK');
    return recovery.key;
  }
  return {
    state,
    timers,
    allTimers,
    calls,
    store,
    host,
    options,
    recovery,
    capture,
    tick,
    save,
  };
}

void test('100 edits defer capture and serialization; one debounced write, latest input only', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++)
    f.recovery.schedule(f.capture({ name: String(i) }));
  assert.equal(f.calls.capture, 0);
  assert.equal(f.store.calls.writes, 0);
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(f.calls.capture, 1);
  assert.equal(f.store.calls.writes, 1);
  assert.equal(f.recovery.preview(f.recovery.key).payload.name, '99');
  assert.equal(f.calls.network, 0);
});
void test('a cancelled late timer cannot flush a newer batch early', () => {
  const f = fixture();
  f.recovery.schedule(f.capture({ name: 'old' }));
  const late = f.allTimers[0];
  f.recovery.schedule(f.capture({ name: 'new' }));
  late();
  assert.equal(f.calls.capture, 0);
  f.tick();
  assert.equal(f.calls.capture, 1);
});
void test('explicit flush cancels debounce without a duplicate write', () => {
  const f = fixture();
  f.recovery.schedule(f.capture({ name: 'once' }));
  assert.equal(f.recovery.flush().code, 'OK');
  f.tick();
  assert.equal(f.store.calls.writes, 1);
});
for (const [field, value, code] of [
  ['actorId', 'b', 'OWNER_CHANGED'],
  ['scope', 'fqc', 'OWNER_CHANGED'],
  ['tabId', 'b', 'OWNER_CHANGED'],
  ['epoch', 2, 'OWNER_CHANGED'],
  ['baseVersion', 'g2:r1:s1', 'BASE_CHANGED'],
  ['canView', false, 'VIEW_PERMISSION_REQUIRED'],
]) {
  void test(`${field} change fences lazy capture and all late writes`, () => {
    const f = fixture();
    f.recovery.schedule(f.capture({ name: 'private' }));
    f.state[field] = value;
    assert.equal(f.recovery.flush().code, code);
    f.tick();
    assert.equal(f.calls.capture, 0);
    assert.equal(f.store.calls.writes, 0);
    assert.equal(f.recovery.preview(f.recovery.key).payload, undefined);
  });
}
void test('owner change inside payload reader is checked again before serialization/write', () => {
  const f = fixture();
  f.recovery.schedule(() => {
    f.state.actorId = 'b';
    return { name: 'private' };
  });
  assert.equal(f.recovery.flush().code, 'OWNER_CHANGED');
  assert.equal(f.store.calls.writes, 0);
});
void test('closed helper neither flushes nor reveals records', () => {
  const f = fixture();
  f.recovery.schedule(f.capture({ name: 'old' }));
  const late = f.allTimers[0];
  f.recovery.close();
  late();
  assert.equal(f.store.calls.writes, 0);
  assert.equal(f.calls.capture, 0);
  assert.equal(f.recovery.list().code, 'CLOSED');
  assert.equal(f.recovery.schedule(() => ({})).code, 'CLOSED');
});
void test('reload/duplicated-tab runtime keys and batch IDs never overwrite each other', () => {
  const a = fixture(),
    b = fixture({ storage: a.store });
  a.save({ name: 'A' });
  b.save({ name: 'B' });
  assert.notEqual(a.recovery.runtimeId, b.recovery.runtimeId);
  assert.notEqual(a.recovery.key, b.recovery.key);
  assert.equal(a.store.values.size, 2);
  assert.equal(b.recovery.list().items.length, 2);
  assert.notEqual(
    a.recovery.preview(a.recovery.key).batchId,
    b.recovery.preview(b.recovery.key).batchId,
  );
});
void test('other account/scope/tab/epoch values are not read, previewed, restored or removed', () => {
  const a = fixture();
  a.save({ name: 'mine' });
  for (const state of [
    { actorId: 'b' },
    { scope: 'other' },
    { tabId: 'other' },
    { epoch: 2 },
  ]) {
    const b = fixture({ storage: a.store, state });
    b.save({ name: 'private' });
    const before = a.store.calls.reads.length;
    assert.equal(a.recovery.preview(b.recovery.key).code, 'NOT_OWNED');
    assert.equal(a.store.calls.reads.length, before);
  }
  a.store.calls.reads.length = 0;
  const list = a.recovery.list();
  assert.equal(list.items.length, 1);
  assert.deepEqual(a.store.calls.reads, []);
  assert.equal(a.store.calls.clear, 0);
});
void test('preview and restore are explicit, isolated copies and never delete or publish', () => {
  const first = fixture();
  const key = first.save({ name: 'retained', rows: [{ value: 3 }] });
  const f = fixture({
    storage: first.store,
    options: { ownsRecovery: (candidate) => candidate.key === key },
  });
  assert.equal(f.calls.capture, 0);
  assert.equal(f.recovery.restore('made-up').code, 'PREVIEW_REQUIRED');
  const preview = f.recovery.preview(key);
  assert.equal(preview.canRestore, true);
  preview.payload.name = 'mutated preview';
  const restored = f.recovery.restore(preview.token);
  assert.equal(restored.code, 'OK');
  assert.equal(restored.payload.name, 'retained');
  restored.payload.rows[0].value = 8;
  assert.equal(f.recovery.preview(key).payload.rows[0].value, 3);
  assert.equal(f.recovery.restore(preview.token).code, 'PREVIEW_REQUIRED');
  assert.equal(f.store.values.has(key), true);
  assert.equal(f.calls.network, 0);
});
for (const [field, value, code] of [
  ['canEdit', false, 'EDIT_PERMISSION_REQUIRED'],
  ['pending', true, 'PENDING_LOCKED'],
  ['pending', undefined, 'PENDING_LOCKED'],
  ['verified', false, 'LATEST_STATE_REQUIRED'],
  ['baseVersion', 'new', 'BASE_CONFLICT'],
  ['hasLocalChanges', true, 'LOCAL_CHANGES_PRESENT'],
  ['localRevision', 1, 'LOCAL_CHANGED'],
  ['writeState', 'pending', 'RECEIPT_REQUIRED'],
  ['writeState', 'unknown', 'RECEIPT_REQUIRED'],
  ['actorId', 'b', 'OWNER_CHANGED'],
  ['epoch', 2, 'OWNER_CHANGED'],
  ['canView', false, 'VIEW_PERMISSION_REQUIRED'],
]) {
  void test(`restore rechecks ${field} after preview`, () => {
    const f = fixture();
    f.save();
    const preview = f.recovery.preview(f.recovery.key);
    f.state[field] = value;
    const restored = f.recovery.restore(preview.token);
    assert.equal(restored.code, code);
    assert.equal(restored.payload, undefined);
    assert.equal(f.store.values.size, 1);
  });
}
void test('pending/read-only users may inspect but not edit their saved local input', () => {
  const f = fixture();
  f.save();
  f.state.pending = true;
  f.state.canEdit = false;
  const preview = f.recovery.preview(f.recovery.key);
  assert.equal(preview.payload.name, 'draft');
  assert.equal(preview.canRestore, false);
  assert.equal(preview.canDiscard, true);
});
void test('permission unknown is fail closed', () => {
  const f = fixture();
  f.save();
  f.state.canEdit = undefined;
  assert.equal(f.recovery.preview(f.recovery.key).canRestore, false);
});
void test('record modification after preview refuses restore and discard', () => {
  const f = fixture();
  f.save();
  const preview = f.recovery.preview(f.recovery.key);
  const changed = JSON.parse(f.store.values.get(f.recovery.key));
  changed.payload.name = 'new';
  f.store.values.set(f.recovery.key, JSON.stringify(changed));
  assert.equal(f.recovery.restore(preview.token).code, 'RECORD_CHANGED');
  assert.equal(f.recovery.discard(preview.token).code, 'RECORD_CHANGED');
  assert.equal(f.store.calls.removes.length, 0);
});
void test('discard targets one exact reviewed record and preserves every other key', () => {
  const a = fixture(),
    b = fixture({ storage: a.store });
  a.save();
  b.save();
  a.store.values.set('unrelated', 'keep');
  const snapshot = new Map(a.store.values);
  const preview = a.recovery.preview(a.recovery.key);
  assert.equal(a.recovery.discard(preview.token).code, 'OK');
  assert.deepEqual(a.store.calls.removes, [a.recovery.key]);
  assert.equal(a.store.calls.clear, 0);
  snapshot.delete(a.recovery.key);
  assert.deepEqual(a.store.values, snapshot);
});
void test('explicit own local discard still works after edit revocation, pending or base change', () => {
  const f = fixture();
  f.save();
  const preview = f.recovery.preview(f.recovery.key);
  f.state.canEdit = false;
  f.state.pending = true;
  f.state.baseVersion = 'new';
  assert.equal(f.recovery.discard(preview.token).code, 'OK');
  assert.equal(f.calls.network, 0);
});
void test('new queued edits prevent discard of the current runtime record', () => {
  const f = fixture();
  f.save();
  const preview = f.recovery.preview(f.recovery.key);
  f.recovery.schedule(f.capture({ name: 'new' }));
  assert.equal(f.recovery.discard(preview.token).code, 'LOCAL_CHANGES_PRESENT');
  assert.equal(f.store.values.size, 1);
  f.tick();
  assert.equal(f.recovery.preview(f.recovery.key).payload.name, 'new');
});
void test('quota failure preserves previous durable record and latest bounded RAM copy', () => {
  const f = fixture();
  f.save({ name: 'old' });
  const old = f.store.values.get(f.recovery.key);
  f.store.quota = true;
  f.recovery.schedule(f.capture({ name: 'new' }));
  f.tick();
  assert.equal(f.recovery.status().code, 'QUOTA_EXCEEDED');
  assert.equal(f.recovery.status().durable, false);
  assert.equal(f.store.values.get(f.recovery.key), old);
  const ram = f.recovery.preview(f.recovery.key, 'memory');
  assert.equal(ram.payload.name, 'new');
  assert.equal(ram.durable, false);
  assert.equal(f.store.calls.removes.length, 0);
  assert.equal(f.store.calls.clear, 0);
});
void test('targeted discard of old durable record after quota must preserve newer RAM', () => {
  const f = fixture();
  f.save({ name: 'old' });
  const old = f.recovery.preview(f.recovery.key);
  f.store.quota = true;
  f.recovery.schedule(f.capture({ name: 'new' }));
  f.tick();
  assert.equal(f.recovery.discard(old.token).code, 'OK');
  assert.equal(
    f.recovery.preview(f.recovery.key, 'memory').payload.name,
    'new',
  );
});
void test('storage blocked reports error, preserves RAM, and never claims durable success', () => {
  const f = fixture({ options: { storage: null } });
  f.recovery.schedule(f.capture({ name: 'RAM' }));
  f.tick();
  assert.equal(f.recovery.status().code, 'STORAGE_UNAVAILABLE');
  assert.equal(f.recovery.status().durable, false);
  assert.equal(
    f.recovery.preview(f.recovery.key, 'memory').payload.name,
    'RAM',
  );
});
void test('storage read/removal failures retain data and return honest errors', () => {
  const f = fixture();
  f.save();
  const preview = f.recovery.preview(f.recovery.key);
  f.store.removeError = true;
  assert.equal(f.recovery.discard(preview.token).code, 'STORAGE_REMOVE_FAILED');
  assert.equal(f.store.values.size, 1);
  f.store.readError = true;
  assert.equal(f.recovery.preview(f.recovery.key).code, 'STORAGE_READ_FAILED');
});
void test('unexpected storage occupant is preserved, not overwritten', () => {
  const f = fixture();
  f.store.values.set(f.recovery.key, 'pre-existing corruption');
  f.recovery.schedule(f.capture({ name: 'safe RAM' }));
  f.tick();
  assert.equal(f.recovery.status().code, 'STORAGE_CHANGED');
  assert.equal(f.store.values.get(f.recovery.key), 'pre-existing corruption');
  assert.equal(f.store.calls.writes, 0);
});
for (const [name, mutate, code] of [
  ['malformed JSON', () => '{', 'CORRUPT_RECORD'],
  [
    'future schema',
    (record) => JSON.stringify({ ...record, version: 99 }),
    'UNSUPPORTED_SCHEMA',
  ],
  [
    'missing payload',
    (record) => {
      delete record.payload;
      return JSON.stringify(record);
    },
    'INVALID_RECORD',
  ],
  [
    'other owner under current key',
    (record) => {
      record.owner.actorId = 'other';
      return JSON.stringify(record);
    },
    'INVALID_RECORD',
  ],
  [
    'extra property',
    (record) => JSON.stringify({ ...record, surprise: true }),
    'INVALID_RECORD',
  ],
  ['oversized stored JSON', () => ' '.repeat(262145), 'RECORD_LIMIT'],
]) {
  void test(`${typeof name === 'string' ? name : 'invalid fixture'} remains untouched and is not exposed as a valid draft`, () => {
    const f = fixture();
    f.save();
    const raw = mutate(JSON.parse(f.store.values.get(f.recovery.key)));
    f.store.values.set(f.recovery.key, raw);
    const preview = f.recovery.preview(f.recovery.key);
    assert.equal(preview.code, code);
    assert.equal(preview.payload, undefined);
    assert.equal(f.recovery.list().items[0].issue, undefined); // Inventory never reads the malformed value.
    assert.equal(f.store.values.get(f.recovery.key), raw);
    assert.equal(f.store.calls.removes.length, 0);
  });
}
void test('unknown receipt replaces editable snapshot; preview exposes reference only, zero POST', () => {
  const f = fixture();
  f.save({ name: 'not an editable retry' });
  const result = f.recovery.rememberUnknown({
    operationId: 'operation-1',
    generation: 'g1',
  });
  assert.equal(result.durable, true);
  const stored = JSON.parse(f.store.values.get(f.recovery.key));
  assert.equal(stored.payload, undefined);
  assert.deepEqual(stored.receipt, {
    operationId: 'operation-1',
    generation: 'g1',
  });
  const preview = f.recovery.preview(f.recovery.key);
  assert.equal(preview.canRestore, false);
  assert.equal(preview.payload, undefined);
  assert.equal(preview.canDiscard, false);
  assert.equal(f.recovery.restore(preview.token).code, 'RECEIPT_REQUIRED');
  assert.equal(f.recovery.discard(preview.token).code, 'RECEIPT_REQUIRED');
  assert.equal(
    f.recovery.schedule(() => ({ name: 'retry' })).code,
    'RECEIPT_REQUIRED',
  );
  assert.equal(f.calls.network, 0);
});
void test('unknown marker cancels queued editable capture and cannot be replaced by another operation', () => {
  const f = fixture();
  f.recovery.schedule(f.capture({ name: 'not captured' }));
  f.recovery.rememberUnknown({ operationId: 'one', generation: 'g1' });
  f.tick();
  assert.equal(f.calls.capture, 0);
  assert.equal(
    f.recovery.rememberUnknown({ operationId: 'two', generation: 'g1' }).code,
    'RECEIPT_REQUIRED',
  );
  assert.equal(f.recovery.preview(f.recovery.key).receipt.operationId, 'one');
});
void test('unknown marker rejects extra command/body/media fields instead of persisting replay data', () => {
  const f = fixture();
  assert.equal(
    f.recovery.rememberUnknown({
      operationId: 'one',
      generation: 'g1',
      command: { action: 'apply' },
    }).code,
    'INVALID_RECEIPT',
  );
  assert.equal(f.store.values.size, 0);
  assert.equal(f.calls.network, 0);
});
void test('unknown marker quota failure is not durable and RAM remains receipt-only', () => {
  const f = fixture();
  f.save();
  const raw = f.store.values.get(f.recovery.key);
  f.store.quota = true;
  assert.equal(
    f.recovery.rememberUnknown({ operationId: 'one', generation: 'g1' }).code,
    'QUOTA_EXCEEDED',
  );
  assert.equal(f.store.values.get(f.recovery.key), raw);
  const preview = f.recovery.preview(f.recovery.key, 'memory');
  assert.equal(preview.payload, undefined);
  assert.equal(preview.durable, false);
  assert.equal(f.recovery.restore(preview.token).code, 'RECEIPT_REQUIRED');
  assert.equal(f.calls.network, 0);
});
for (const payload of [
  { password: 'secret' },
  { nested: { access_token: 'secret' } },
  { apiKey: 'secret' },
  { token: 'secret' },
  { authToken: 'secret' },
  { jwt: 'secret' },
  { image: 'data:image/png;base64,AAAA' },
  { file: 'blob:https://example.test/id' },
  { note: 'Bearer abcdef' },
  { note: '-----BEGIN PRIVATE KEY-----' },
  { url: 'https://name:password@example.test/a' },
  { url: 'https://example.test?token=private' },
  { image: 'A'.repeat(2100) },
  JSON.parse('{"__proto__":{"private":true}}'),
]) {
  void test(`sensitive/raw-media payload rejected: ${Object.keys(payload)[0]} (${JSON.stringify(payload).length} chars)`, () => {
    const f = fixture();
    f.recovery.schedule(f.capture(payload));
    f.tick();
    assert.equal(f.recovery.status().code, 'SENSITIVE_PAYLOAD');
    assert.equal(f.store.calls.writes, 0);
  });
}
for (const [name, payload, code] of [
  ['overlong string', { note: 'x'.repeat(32769) }, 'PAYLOAD_LIMIT'],
  [
    'overwide array',
    { rows: Array.from({ length: 4001 }, () => null) },
    'PAYLOAD_LIMIT',
  ],
  ['nonfinite', { value: Infinity }, 'INVALID_JSON'],
  ['undefined', { value: undefined }, 'INVALID_JSON'],
  ['date', { value: new Date() }, 'INVALID_JSON'],
  ['function', { value() {} }, 'INVALID_JSON'],
  ['sparse array', { values: sparseArray(2) }, 'INVALID_JSON'],
]) {
  void test(`${typeof name === 'string' ? name : 'invalid fixture'} is bounded and never written`, () => {
    const f = fixture();
    f.recovery.schedule(f.capture(payload));
    f.tick();
    assert.equal(f.recovery.status().code, code);
    assert.equal(f.store.calls.writes, 0);
  });
}
void test('cycles, excessive nesting and getters are rejected without invoking getters', () => {
  const cycle = {};
  cycle.self = cycle;
  let depth = {};
  for (let i = 0; i < 30; i++) depth = { next: depth };
  let getters = 0;
  const getter = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      getters++;
      return 'secret';
    },
  });
  for (const [value, code] of [
    [cycle, 'INVALID_JSON'],
    [depth, 'PAYLOAD_LIMIT'],
    [getter, 'INVALID_JSON'],
  ]) {
    const f = fixture();
    f.recovery.schedule(f.capture(value));
    f.tick();
    assert.equal(f.recovery.status().code, code);
    assert.equal(f.store.calls.writes, 0);
  }
  assert.equal(getters, 0);
});
void test('bounded scan reports incomplete, does not parse unrelated values or delete anything', () => {
  const f = fixture();
  for (let i = 0; i < 1030; i++) f.store.values.set(`other-${i}`, 'private');
  const listed = f.recovery.list();
  assert.equal(listed.code, 'SCAN_LIMIT');
  assert.equal(listed.incomplete, true);
  assert.equal(listed.items.length, 0);
  assert.equal(f.store.calls.reads.length, 0);
  assert.equal(f.store.calls.clear, 0);
});
void test('large payload event CPU: 100 captures deferred, once bounded serialization, no network', (t) => {
  const f = fixture(),
    rows = Array.from({ length: 1500 }, (_, i) => ({
      id: `row-${i}`,
      name: `文字 draft ${i}`,
      value: i,
    }));
  const started = performance.now();
  for (let i = 0; i < 100; i++) f.recovery.schedule(f.capture({ rows }));
  const scheduleMs = performance.now() - started;
  const flushStart = performance.now();
  f.tick();
  const flushMs = performance.now() - flushStart;
  assert.equal(f.calls.capture, 1);
  assert.equal(f.store.calls.writes, 1);
  assert.equal(f.recovery.status().code, 'OK');
  assert(
    scheduleMs < 1000,
    'loose VM runaway guard, not a browser speed budget',
  );
  assert(flushMs < 2000, 'loose VM runaway guard');
  t.diagnostic(
    JSON.stringify({
      rows: rows.length,
      edits: 100,
      captures: f.calls.capture,
      writes: f.store.calls.writes,
      scheduleMs,
      flushMs,
      bytes: Buffer.byteLength(f.store.values.get(f.recovery.key)),
    }),
  );
});
void test('a million-element input rejects at the array bound before enumeration', (t) => {
  const f = fixture();
  f.recovery.schedule(() => ({ rows: sparseArray(1000000) }));
  const start = performance.now();
  f.tick();
  const elapsedMs = performance.now() - start;
  assert.equal(f.recovery.status().code, 'PAYLOAD_LIMIT');
  assert.equal(f.store.calls.writes, 0);
  assert(elapsedMs < 1000);
  t.diagnostic(JSON.stringify({ oversizedArrayMs: elapsedMs }));
});
void test('factory fails without cryptographic runtime IDs instead of reusing a tab slot', () => {
  const f = fixture();
  f.host.crypto = null;
  assert.throws(
    () => f.host.LocalDraftRecovery.create(f.options),
    /SECURE_RUNTIME_ID_UNAVAILABLE/,
  );
});

void test('RAM unknown marker blocks restore/discard of an older local persisted record after quota', () => {
  const f = fixture();
  f.save();
  const old = f.recovery.preview(f.recovery.key);
  f.store.quota = true;
  f.recovery.rememberUnknown({ operationId: 'one', generation: 'g1' });
  const preview = f.recovery.preview(f.recovery.key);
  assert.equal(preview.canRestore, false);
  assert.equal(preview.canDiscard, false);
  assert.equal(f.recovery.restore(old.token).code, 'RECEIPT_REQUIRED');
  assert.equal(f.recovery.discard(old.token).code, 'RECEIPT_REQUIRED');
  assert.equal(f.store.values.size, 1);
});
void test('duplicated-tab runtime cannot read, restore or delete a live sibling without an exclusive recovery claim', () => {
  const a = fixture(), b = fixture({ storage: a.store }); a.save(); b.save(); a.store.calls.reads.length = 0;
  const preview = b.recovery.preview(a.recovery.key); assert.equal(preview.code, 'RECOVERY_CLAIM_REQUIRED'); assert.equal('payload' in preview, false); assert.equal(a.store.calls.reads.length, 0);
  assert.equal(b.recovery.restore(preview.token).code, 'PREVIEW_REQUIRED'); assert.equal(b.recovery.discard(preview.token).code, 'PREVIEW_REQUIRED'); assert.equal(a.store.values.size, 2);
});
void test('foreign-runtime recovery claim is rechecked immediately before restore/discard', () => {
  const a = fixture();
  a.save();
  let claimed = true;
  const b = fixture({
    storage: a.store,
    options: { ownsRecovery: () => claimed },
  });
  const preview = b.recovery.preview(a.recovery.key);
  assert.equal(preview.canRestore, true);
  claimed = false;
  assert.equal(
    b.recovery.restore(preview.token).code,
    'RECOVERY_CLAIM_REQUIRED',
  );
  assert.equal(
    b.recovery.discard(preview.token).code,
    'RECOVERY_CLAIM_REQUIRED',
  );
  assert.equal(a.store.values.size, 1);
});
void test('memory preview cannot fall back to storage for another runtime key', () => {
  const a = fixture(),
    b = fixture({ storage: a.store });
  a.save();
  const before = a.store.calls.reads.length;
  assert.equal(
    b.recovery.preview(a.recovery.key, 'memory').code,
    'NOT_OWNED_MEMORY',
  );
  assert.equal(a.store.calls.reads.length, before);
});

void test('explicit flush retries only the retained RAM record after quota recovery', () => {
  const f = fixture();
  f.save({ name: 'old' });
  f.store.quota = true;
  f.recovery.schedule(f.capture({ name: 'new' }));
  f.tick();
  const batch = f.recovery.status().batchId;
  f.store.quota = false;
  assert.equal(f.recovery.flush().code, 'OK');
  assert.equal(f.recovery.preview(f.recovery.key).payload.name, 'new');
  assert.equal(f.recovery.status().batchId, batch);
  assert.equal(f.calls.capture, 2);
  assert.equal(f.calls.network, 0);
});
void test('unrelated lineage unknown does not block a claimed independent local source', () => {
  const a = fixture(); a.save({ name: 'independent copy' }); const b = fixture({ storage: a.store }); b.recovery.rememberUnknown({ operationId: 'unknown', generation: 'g1' });
  const c = fixture({ storage: a.store, options: { ownsRecovery: () => true } }); const preview = c.recovery.preview(a.recovery.key); assert.equal(preview.canRestore, true); assert.equal(c.calls.network, 0);
});
void test('list caps cumulative owned records instead of parsing 1024 full payloads', () => {
  const f = fixture();
  f.save();
  const record = JSON.parse(f.store.values.get(f.recovery.key));
  const parts = JSON.parse(f.recovery.key.slice('process-local-draft-v2:'.length));
  for (let i = 0; i < 40; i++) {
    const runtimeId = `old-${i}`;
    f.store.values.set(
      'process-local-draft-v2:' + JSON.stringify([...parts.slice(0, 6), runtimeId]),
      JSON.stringify({ ...record, runtimeId, batchId: runtimeId + ':1' }),
    );
  }
  const list = f.recovery.list();
  assert.equal(list.code, 'SCAN_LIMIT');
  assert.equal(list.items.length, 32);
  assert.equal(list.incomplete, true);
  assert.equal(f.recovery.preview(f.recovery.key).canRestore, true);
});
void test('keys-only list never scans cumulative payload bytes or drops storage', () => {
  const f = fixture();
  f.save({
    rows: Array.from({ length: 1500 }, (_, i) => ({
      id: `row-${i}`,
      name: `文字 draft ${i}`,
      value: i,
    })),
  });
  const record = JSON.parse(f.store.values.get(f.recovery.key)),
    parts = JSON.parse(f.recovery.key.slice('process-local-draft-v2:'.length));
  for (let i = 0; i < 10; i++) {
    const runtimeId = `old-${i}`;
    f.store.values.set(
      'process-local-draft-v2:' + JSON.stringify([...parts.slice(0, 6), runtimeId]),
      JSON.stringify({ ...record, runtimeId, batchId: runtimeId + ':1' }),
    );
  }
  const list = f.recovery.list();
  assert.equal(list.code, 'OK');
  assert.equal(list.items.length, 11);
  assert.equal(f.store.values.size, 11);
});

void test('repeating the same unknown marker is idempotent regardless of reference property order', () => {
  const f = fixture();
  f.recovery.rememberUnknown({ operationId: 'one', generation: 'g1' });
  const batch = f.recovery.status().batchId,
    writes = f.store.calls.writes;
  const repeated = f.recovery.rememberUnknown({
    generation: 'g1',
    operationId: 'one',
  });
  assert.equal(repeated.code, 'OK');
  assert.equal(repeated.batchId, batch);
  assert.equal(f.store.calls.writes, writes);
});
void test('explicit RAM-only discard does not remove the older durable record', () => {
  const f = fixture();
  f.save({ name: 'old' });
  const raw = f.store.values.get(f.recovery.key);
  f.store.quota = true;
  f.recovery.schedule(f.capture({ name: 'new' }));
  f.tick();
  const preview = f.recovery.preview(f.recovery.key, 'memory'),
    discarded = f.recovery.discard(preview.token);
  assert.equal(discarded.code, 'OK');
  assert.equal(discarded.durableRecordPreserved, true);
  assert.equal(f.store.values.get(f.recovery.key), raw);
  assert.equal(f.recovery.preview(f.recovery.key, 'memory').code, 'NOT_FOUND');
  assert.equal(f.store.calls.removes.length, 0);
});
void test('discarded current record is never still reported as durably stored', () => {
  const f = fixture();
  f.save();
  const preview = f.recovery.preview(f.recovery.key);
  f.recovery.discard(preview.token);
  assert.equal(f.recovery.status().durable, false);
  assert.equal(f.recovery.status().hasMemory, false);
});
for (const [field, value, code] of [
  ['canEdit', false, 'EDIT_PERMISSION_REQUIRED'],
  ['baseVersion', 'new', 'BASE_CONFLICT'],
  ['pending', true, 'PENDING_LOCKED'],
  ['localRevision', 1, 'LOCAL_CHANGED'],
  ['writeState', 'unknown', 'RECEIPT_REQUIRED'],
]) {
  void test(`restore rechecks ${field} after registry read callbacks with context snapshots`, () => {
    const first = fixture();
    first.save();
    const state = { ...first.state };
    const f = fixture({
      storage: first.store,
      options: { getContext: () => ({ ...state }), ownsRecovery: () => true },
    });
    const preview = f.recovery.preview(first.recovery.key),
      originalRead = f.store.getItem.bind(f.store);
    f.store.getItem = (key) => { const raw = originalRead(key); if (key.startsWith('process-local-draft-lineage-v1:')) state[field] = value; return raw; };
    assert.equal(f.recovery.restore(preview.token).code, code);
  });
}
void test('preview never exposes old account contents after an ownership callback switches accounts', () => {
  const a = fixture();
  a.save();
  const state = { ...a.state };
  const b = fixture({
    storage: a.store,
    options: {
      getContext: () => ({ ...state }),
      ownsRecovery: () => {
        state.actorId = 'other';
        return true;
      },
    },
  });
  const preview = b.recovery.preview(a.recovery.key);
  assert.equal(preview.ok, false);
  assert.equal(preview.payload, undefined);
});

void test('typing performs zero JSON serialization, one envelope stringify after debounce', () => {
  const f = fixture(),
    before = f.calls.stringify;
  for (let i = 0; i < 100; i++)
    f.recovery.schedule(f.capture({ name: `draft ${i}` }));
  assert.equal(f.calls.stringify, before);
  f.tick();
  assert.equal(f.calls.stringify - before, 1);
});
