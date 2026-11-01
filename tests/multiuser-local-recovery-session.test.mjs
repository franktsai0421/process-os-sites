import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const sources = [
  'local-draft-recovery.js',
  'local-draft-recovery-session.js',
].map((name) =>
  fs.readFileSync(
    new URL('../public/process/' + name, import.meta.url),
    'utf8',
  ),
);
function storage() {
  const values = new Map(),
    calls = { reads: [], writes: [], removes: [], network: 0 };
  return {
    values,
    calls,
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem(key) {
      calls.reads.push(key);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.writes.push(key);
      values.set(key, value);
    },
    removeItem(key) {
      calls.removes.push(key);
      values.delete(key);
    },
    clear() {
      throw Error('UNRELATED_STORAGE_MUST_NOT_CLEAR');
    },
  };
}
function lockManager() {
  const held = new Map(),
    calls = [];
  return {
    held,
    calls,
    async request(name, options, callback) {
      calls.push({ name, options });
      assert.equal(options.ifAvailable, true);
      assert.equal(options.mode, 'exclusive');
      if (held.has(name)) return callback(null);
      const lock = { name };
      held.set(name, lock);
      try {
        return await callback(lock);
      } finally {
        if (held.get(name) === lock) held.delete(name);
      }
    },
  };
}
function events() {
  const handlers = new Map();
  return {
    addEventListener(name, fn) {
      handlers.set(name, fn);
    },
    removeEventListener(name) {
      handlers.delete(name);
    },
    dispatch(name, value = {}) {
      handlers.get(name)?.(value);
    },
  };
}
function fixture(config = {}) {
  const state = {
    actorId: 'a',
    scope: 'fqc',
    epoch: 1,
    baseVersion: '["g1",3,null]',
    canView: true,
    canEdit: true,
    pending: false,
    verified: true,
    hasLocalChanges: false,
    localRevision: 0,
    writeState: 'idle',
    ...config.state,
  };
  const store = config.storage || storage(),
    locks = config.locks === undefined ? lockManager() : config.locks,
    target = events(),
    timers = new Map();
  let next = 0;
  const host = {
    crypto: webcrypto,
    navigator: { locks },
    localStorage: store,
    fetch() {
      store.calls.network++;
      throw Error('NO_NETWORK');
    },
    setTimeout(fn) {
      const id = ++next;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const world = vm.createContext({ window: host, TextEncoder, Uint8Array });
  for (const source of sources) vm.runInContext(source, world);
  const session = host.LocalDraftRecoverySession.create({
    getContext: () => ({ ...state }),
    storage: store,
    locks,
    eventTarget: target,
    ...config.options,
  });
  function tick() {
    const queued = [...timers.values()];
    timers.clear();
    queued.forEach((fn) => fn());
  }
  async function save(payload = { title: 'local draft' }) {
    await session.ready;
    assert.equal(session.schedule(() => payload).code, 'SCHEDULED');
    tick();
    assert.equal(session.status().code, 'OK');
    return session.key;
  }
  return { session, state, store, locks, target, timers, tick, save, host };
}
const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
async function historical(config = {}) {
  const first = fixture(config);
  await first.save({ title: 'historical local' });
  const key = first.session.key;
  first.session.close();
  await settled();
  const next = fixture({
    storage: first.store,
    locks: first.locks,
    state: { epoch: 3 },
  });
  await next.session.ready;
  return { first, next, key };
}

void test('runtime acquires exclusive UUID lock before any record write', async () => {
  const f = fixture();
  f.session.schedule(() => ({ title: 'waiting' }));
  f.tick();
  assert.equal(f.store.calls.writes.length, 0);
  assert.equal((await f.session.ready).ready, true);
  assert.equal(f.session.flush().ok, true);
  assert.equal(f.store.calls.writes.length, 1);
  assert.equal(f.locks.held.size, 2);
  f.session.close();
  await settled();
  assert.equal(f.locks.held.size, 0);
});
void test('discover finds same actor/scope historical tab/epoch without reading other accounts', async () => {
  const { next, key } = await historical();
  const other = fixture({
    storage: next.store,
    locks: next.locks,
    state: { actorId: 'b' },
  });
  await other.save({ title: 'secret B' });
  next.store.calls.reads.length = 0;
  const found = next.session.discover();
  assert.equal(found.ok, true);
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].key, key);
  assert.equal(next.store.calls.reads.includes(other.session.key), false);
  assert.equal(next.session.preview(other.session.key).code, 'NOT_OWNED');
  next.session.close();
  other.session.close();
});
void test('historical preview is read-only; exact exclusive claim permits explicit restore', async () => {
  const { next, key } = await historical();
  const before = next.session.preview(key);
  assert.equal(before.code, 'RECOVERY_CLAIM_REQUIRED');
  assert.equal('payload' in before, false);
  assert.equal((await next.session.claim(key)).ok, true);
  const preview = next.session.preview(key);
  assert.equal(preview.canRestore, true);
  const restored = next.session.restore(preview.token);
  assert.equal(restored.ok, true);
  assert.equal(restored.payload.title, 'historical local');
  assert(next.store.values.has(key));
  assert.equal(next.store.calls.network, 0);
  next.session.close();
});
void test('live duplicated tab/source runtime lock blocks restore and discard without waiting', async () => {
  const a = fixture({ state: { tabId: 'copied' } });
  await a.save();
  const b = fixture({
    storage: a.store,
    locks: a.locks,
    state: { tabId: 'copied' },
  });
  await b.session.ready;
  assert.equal((await b.session.claim(a.session.key)).code, 'RECOVERY_IN_USE');
  const p = b.session.preview(a.session.key);
  assert.equal(p.code, 'RECOVERY_CLAIM_REQUIRED');
  assert.equal(b.session.restore(p.token).code, 'PREVIEW_REQUIRED');
  assert.equal(b.session.discard(p.token).code, 'PREVIEW_REQUIRED');
  assert(a.store.values.has(a.session.key));
  a.session.close();
  b.session.close();
});
void test('only one recovering runtime can acquire an abandoned source', async () => {
  const { next, key } = await historical();
  const rival = fixture({ storage: next.store, locks: next.locks });
  await rival.session.ready;
  assert.equal((await next.session.claim(key)).ok, true);
  assert.equal((await rival.session.claim(key)).code, 'RECOVERY_IN_USE');
  next.session.close();
  await settled();
  assert.equal((await rival.session.claim(key)).ok, true);
  rival.session.close();
});
void test('Web Locks unavailable permits fresh saving with honest notice but no historical claim', async () => {
  const { first, key } = await historical();
  const f = fixture({ storage: first.store, locks: null });
  const ready = await f.session.ready;
  assert.equal(ready.ready, true);
  assert.equal(ready.canRecover, false);
  assert.equal(ready.notice, 'WEB_LOCKS_UNAVAILABLE');
  await f.save();
  assert.equal(f.session.status().notice, 'WEB_LOCKS_UNAVAILABLE');
  assert.equal((await f.session.claim(key)).code, 'WEB_LOCKS_UNAVAILABLE');
  f.session.close();
});
void test('lock-capable recovery cannot claim an unclaimed no-lock source even if lock appears free', async () => {
  const a = fixture({ locks: null });
  await a.save();
  const b = fixture({ storage: a.store, locks: lockManager() });
  await b.session.ready;
  assert.equal(
    (await b.session.claim(a.session.key)).code,
    'SOURCE_LEASE_UNAVAILABLE',
  );
  assert.equal(b.session.preview(a.session.key).code, 'SOURCE_LEASE_UNAVAILABLE');
  a.session.close();
  b.session.close();
});
void test('pagehide fences timers and all claims before release; BFCache must reacquire', async () => {
  const { next, key } = await historical();
  await next.session.claim(key);
  const token = next.session.preview(key).token;
  next.session.schedule(() => ({ title: 'new local' }));
  next.target.dispatch('pagehide', { persisted: true });
  next.tick();
  assert.equal(next.session.restore(token).code, 'RUNTIME_SUSPENDED');
  assert.equal(next.session.status().ready, false);
  await settled();
  assert.equal(next.locks.held.size, 0);
  next.target.dispatch('pageshow', { persisted: true });
  assert.equal(next.session.flush().code, 'RUNTIME_NOT_READY');
  assert.equal((await next.session.ready).ready, true);
  assert.equal(next.session.preview(key).code, 'RECOVERY_CLAIM_REQUIRED'); // Source claim was not resurrected.
  next.session.close();
});
void test('BFCache cannot write if another runtime claimed its released source while away', async () => {
  const a = fixture();
  await a.save();
  a.target.dispatch('pagehide', { persisted: true });
  await settled();
  const b = fixture({ storage: a.store, locks: a.locks });
  await b.session.ready;
  assert.equal((await b.session.claim(a.session.key)).ok, true);
  a.target.dispatch('pageshow', { persisted: true });
  assert.equal((await a.session.ready).code, 'RECOVERY_IN_USE');
  assert.equal(a.session.flush().code, 'RUNTIME_NOT_READY');
  a.session.close();
  b.session.close();
});
for (const [field, value] of [
  ['actorId', 'b'],
  ['scope', 'master:PROCESS'],
  ['epoch', 9],
]) {
  void test(`${field} changes never authorize late restore after source claim`, async () => {
    const { next, key } = await historical();
    await next.session.claim(key);
    const p = next.session.preview(key);
    next.state[field] = value;
    assert.equal(next.session.restore(p.token).code, 'OWNER_CHANGED');
    assert.equal(next.session.discard(p.token).code, 'OWNER_CHANGED');
    assert(next.store.values.has(key));
    next.session.close();
  });
}
void test('historical discard removes exactly reviewed source and no new runtime record', async () => {
  const { next, key } = await historical();
  await next.session.claim(key);
  await next.save({ title: 'current' });
  const p = next.session.preview(key);
  assert.equal(next.session.discard(p.token).ok, true);
  assert.equal(next.store.values.has(key), false);
  assert(next.store.values.has(next.session.key));
  next.session.close();
});
void test('corrupt historical records remain untouched and do not leak raw data', async () => {
  const { next, key } = await historical();
  next.store.values.set(key, '{private broken');
  const list = next.session.discover();
  assert.equal(list.items[0].issue, undefined);
  assert.equal((await next.session.claim(key)).ok, true);
  assert.equal(next.session.preview(key).code, 'CORRUPT_RECORD');
  assert.equal(next.session.preview(key).payload, undefined);
  assert.equal(next.store.values.get(key), '{private broken');
  next.session.close();
});

async function marker() {
  const a = fixture();
  await a.session.ready;
  assert.equal(
    a.session.rememberUnknown({ operationId: 'op-a', generation: 'g1' }).ok,
    true,
  );
  const key = a.session.key;
  a.session.close();
  await settled();
  const b = fixture({ storage: a.store, locks: a.locks, state: { epoch: 4 } });
  await b.session.ready;
  await b.session.claim(key);
  const evidence = {
    receipt: {
      operationId: 'op-a',
      generation: 'g1',
      revision: 4,
      savedId: null,
      caseId: null,
      unchanged: false,
    },
    workflow: { scope: 'fqc', generation: 'g1', revision: 4 },
  };
  b.state.baseVersion = '["g1",4,null]';
  return { b, key, evidence };
}
void test('terminal authenticated receipt plus authoritative readback settles exact historical marker only', async () => {
  const { b, key, evidence } = await marker();
  b.store.values.set('unrelated', 'keep');
  const p = b.session.preview(key);
  assert.equal(p.kind, 'unknown');
  assert.equal(p.payload, undefined);
  assert.equal(b.session.settleReceipt(p.token, evidence).ok, true);
  assert.equal(b.store.values.has(key), false);
  assert.equal(b.store.values.get('unrelated'), 'keep');
  assert.equal(b.store.calls.network, 0);
  b.session.close();
});
for (const [label, mutate] of [
  [
    '404',
    (e) => {
      e.receipt = { status: 404 };
    },
  ],
  [
    'missing',
    (e) => {
      delete e.receipt;
    },
  ],
  [
    'wrong operation',
    (e) => {
      e.receipt.operationId = 'other';
    },
  ],
  [
    'wrong generation',
    (e) => {
      e.receipt.generation = 'other';
    },
  ],
  [
    'missing unchanged',
    (e) => {
      delete e.receipt.unchanged;
    },
  ],
  [
    'invalid revision',
    (e) => {
      e.receipt.revision = -1;
    },
  ],
  [
    'missing nullable receipt fields',
    (e) => {
      delete e.receipt.savedId;
    },
  ],
  [
    'old readback',
    (e) => {
      e.workflow.revision = 3;
    },
  ],
  [
    'wrong scope',
    (e) => {
      e.workflow.scope = 'master:PROCESS';
    },
  ],
  [
    'wrong readback generation',
    (e) => {
      e.workflow.generation = 'g2';
    },
  ],
]) {
  void test(`settlement rejects ${String(label)}, retains marker, and never POSTs`, async () => {
    const { b, key, evidence } = await marker();
    mutate(evidence);
    const raw = b.store.values.get(key);
    assert.equal(
      b.session.settleReceipt(b.session.preview(key).token, evidence).ok,
      false,
    );
    assert.equal(b.store.values.get(key), raw);
    assert.equal(b.store.calls.network, 0);
    b.session.close();
  });
}
void test('settlement rechecks owner, exact marker bytes and source lease', async () => {
  const { b, key, evidence } = await marker();
  const p = b.session.preview(key);
  const changed = JSON.parse(b.store.values.get(key));
  changed.updatedAt++;
  b.store.values.set(key, JSON.stringify(changed));
  assert.equal(
    b.session.settleReceipt(p.token, evidence).code,
    'RECORD_CHANGED',
  );
  const current = b.session.preview(key);
  b.state.canView = false;
  assert.equal(
    b.session.settleReceipt(current.token, evidence).code,
    'VIEW_PERMISSION_REQUIRED',
  );
  assert(b.store.values.has(key));
  b.session.close();
});
void test('unknown historical marker does not block unrelated independent lineage', async () => {
  const { b, key, evidence } = await marker(); b.state.baseVersion = '["g1",3,null]'; await b.save({ title: 'unsent' }); assert.equal(b.session.preview(b.session.key).canRestore, true);
  b.state.baseVersion = '["g1",4,null]'; assert.equal(b.session.settleReceipt(b.session.preview(key).token, evidence).ok, true); assert.equal(b.session.status().baseVersion, '["g1",3,null]'); b.session.close();
});
void test('prepareWrite cancellation before dispatch restores local eligibility without POST', async () => {
  const f = fixture();
  await f.save({ title: 'not sent' });
  const prepared = f.session.prepareWrite({
    operationId: 'reserved',
    generation: 'g1',
  });
  assert.equal(prepared.ok, true);
  assert.equal(typeof prepared.reservation, 'string');
  const stored = JSON.parse(f.store.values.get(f.session.key));
  assert.equal(stored.kind, 'unknown');
  assert.equal(stored.payload, undefined);
  assert.equal(f.session.cancelPrepared(prepared.reservation).ok, true);
  assert.equal(f.store.values.has(f.session.key), false);
  await f.save({ title: 'not sent' });
  assert.equal(f.session.preview(f.session.key).payload.title, 'not sent');
  assert.equal(f.store.calls.network, 0);
  f.session.close();
});
void test('markDispatched is one-shot; cancellation/second dispatch cannot classify unknown as notSent', async () => {
  const f = fixture();
  await f.session.ready;
  const p = f.session.prepareWrite({
    operationId: 'reserved',
    generation: 'g1',
  });
  assert.equal(f.session.markDispatched(p.reservation).ok, true);
  assert.equal(
    f.session.markDispatched(p.reservation).code,
    'ALREADY_DISPATCHED',
  );
  assert.equal(
    f.session.cancelPrepared(p.reservation).code,
    'RECEIPT_REQUIRED',
  );
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
void test('strict rememberUnknown never issues a cancellable preparation capability', async () => {
  const f = fixture();
  await f.session.ready;
  const unknown = f.session.rememberUnknown({
    operationId: 'actual-unknown',
    generation: 'g1',
  });
  assert.equal(unknown.reservation, undefined);
  assert.equal(
    f.session.prepareWrite({ operationId: 'actual-unknown', generation: 'g1' })
      .code,
    'RECEIPT_REQUIRED',
  );
  assert.equal(
    f.session.cancelPrepared({ notSent: true }).code,
    'PREPARATION_REQUIRED',
  );
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
void test('quota-failed pre-dispatch marker can only cancel RAM, preserving old durable local copy', async () => {
  const f = fixture();
  await f.save({ title: 'old durable' });
  const raw = f.store.values.get(f.session.key);
  f.store.setItem = () => {
    throw Object.assign(Error('full'), { name: 'QuotaExceededError' });
  };
  const p = f.session.prepareWrite({
    operationId: 'never-sent',
    generation: 'g1',
  });
  assert.equal(p.code, 'QUOTA_EXCEEDED');
  assert(p.reservation);
  assert.equal(
    f.session.markDispatched(p.reservation).code,
    'DURABLE_RECEIPT_REQUIRED',
  );
  assert.equal(f.session.cancelPrepared(p.reservation).ok, true);
  assert.equal(f.store.values.get(f.session.key), raw);
  f.session.close();
});
void test('base change permits exact proven-not-dispatched cancellation but blocks dispatch', async () => {
  const f = fixture();
  await f.session.ready;
  const p = f.session.prepareWrite({
    operationId: 'not-sent',
    generation: 'g1',
  });
  f.state.baseVersion = 'g2:r1';
  assert.equal(f.session.markDispatched(p.reservation).code, 'BASE_CHANGED');
  assert.equal(f.session.cancelPrepared(p.reservation).ok, true);
  f.session.close();
});
void test('pagehide invalidates preparation proof; BFCache cannot cancel an uncertain marker', async () => {
  const f = fixture();
  await f.session.ready;
  const p = f.session.prepareWrite({
    operationId: 'reserved',
    generation: 'g1',
  });
  f.target.dispatch('pagehide', { persisted: true });
  await settled();
  f.target.dispatch('pageshow', { persisted: true });
  await f.session.ready;
  assert.equal(
    f.session.cancelPrepared(p.reservation).code,
    'PREPARATION_REQUIRED',
  );
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
void test('pagehide flushes the last sub-debounce input before releasing the runtime lock', async () => {
  const f = fixture();
  await f.session.ready;
  let captures = 0;
  f.session.schedule(() => {
    captures++;
    assert.equal(f.locks.held.size, 2);
    return { title: 'last keystroke' };
  });
  f.target.dispatch('pagehide', { persisted: true });
  assert.equal(captures, 1);
  assert.equal(
    JSON.parse(f.store.values.get(f.session.key)).payload.title,
    'last keystroke',
  );
  f.tick();
  assert.equal(captures, 1);
  await settled();
  assert.equal(f.locks.held.size, 0);
  f.session.close();
});
void test('settlement cannot delete after pagehide invalidates the own runtime lease', async () => {
  const f = fixture();
  await f.session.ready;
  f.session.rememberUnknown({ operationId: 'op-a', generation: 'g1' });
  const p = f.session.preview(f.session.key),
    get = f.store.getItem.bind(f.store);
  let reads = 0;
  f.store.getItem = (key) => {
    const value = get(key);
    if (++reads === 2) f.target.dispatch('pagehide', { persisted: true });
    return value;
  };
  const evidence = {
    receipt: {
      operationId: 'op-a',
      generation: 'g1',
      revision: 4,
      savedId: null,
      caseId: null,
      unchanged: false,
    },
    workflow: { scope: 'fqc', generation: 'g1', revision: 4 },
  };
  assert.equal(f.session.settleReceipt(p.token, evidence).ok, false);
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
void test('dispatch fencing checks owner again after marker read and never sends', async () => {
  const f = fixture();
  await f.session.ready;
  const p = f.session.prepareWrite({ operationId: 'op-a', generation: 'g1' });
  const get = f.store.getItem.bind(f.store);
  f.store.getItem = (key) => {
    const raw = get(key);
    f.state.epoch++;
    return raw;
  };
  assert.equal(f.session.markDispatched(p.reservation).code, 'OWNER_CHANGED');
  assert(f.store.values.has(f.session.key));
  assert.equal(f.store.calls.network, 0);
  f.session.close();
});

void test('an explicit unknown declaration revokes a prior not-dispatched capability', async () => {
  const f = fixture();
  await f.session.ready;
  const ref = { operationId: 'op-a', generation: 'g1' },
    p = f.session.prepareWrite(ref);
  assert.equal(f.session.rememberUnknown(ref).ok, true);
  assert.equal(
    f.session.cancelPrepared(p.reservation).code,
    'PREPARATION_REQUIRED',
  );
  assert(f.store.values.has(f.session.key));
  f.session.close();
});

function dependencyError(extra = {}) {
  return Object.assign(new Error('DEPENDENCY_CHANGED_RECONFIRM'), {
    status: 409,
    requestId: 'deaddead-aaaa-4bbb-8ccc-1234567890ab',
    details: { path: ['rows', { id: 'r1' }, 'name'] },
    ...extra,
  });
}
function preparedCommand() {
  return {
    action: 'apply',
    operationId: 'prepared-op',
    generation: 'g1',
    guards: [{ path: ['rows', { id: 'r1' }, 'name'], value: 'before' }],
    patches: [],
  };
}
async function dispatchFixture() {
  const f = fixture();
  await f.session.ready;
  const command = preparedCommand();
  const prepared = f.session.prepareWrite({
    operationId: command.operationId,
    generation: command.generation,
  });
  return { f, command, reservation: prepared.reservation };
}
void test('dispatchPrepared binds original dependency rejection to exact marker and error identity', async () => {
  const { f, command, reservation } = await dispatchFixture();
  const error = dependencyError();
  let sends = 0;
  await assert.rejects(
    f.session.dispatchPrepared(reservation, command, (received) => {
      sends++;
      assert.equal(received, command);
      return Promise.reject(error);
    }),
    (thrown) => thrown === error,
  );
  assert.equal(sends, 1);
  assert.equal(f.session.wasRejected(reservation, error), true);
  assert.equal(f.session.wasRejected(reservation, dependencyError()), false);
  assert.equal(f.session.wasRejected('wrong', error), false);
  assert.equal(f.store.values.has(f.session.key), false);
  await f.save({ title: 'original input remains local' });
  f.session.close();
});
void test('trusted predispatch notSent from exact sender promise permits marker cleanup only', async () => {
  const { f, command, reservation } = await dispatchFixture();
  const error = Object.assign(Error('PREFLIGHT_FAILED'), { notSent: true });
  await assert.rejects(
    f.session.dispatchPrepared(reservation, command, () =>
      Promise.reject(error),
    ),
    (thrown) => thrown === error,
  );
  assert.equal(f.session.wasRejected(reservation, error), true);
  assert.equal(f.store.values.has(f.session.key), false);
  f.session.close();
});
for (const [label, alter] of [
  [
    'missing request ID',
    (error) => {
      delete error.requestId;
    },
  ],
  [
    'invalid request ID',
    (error) => {
      error.requestId = 'proxy-message';
    },
  ],
  [
    'wrong path',
    (error) => {
      error.details.path = ['rows', { id: 'r2' }, 'name'];
    },
  ],
  [
    'missing path',
    (error) => {
      error.details = {};
    },
  ],
  [
    'receipt 404',
    (error) => {
      error.status = 404;
    },
  ],
  [
    'proxy 409',
    (error) => {
      error.message = 'HTTP 409';
    },
  ],
  [
    'generic validation 422',
    (error) => {
      error.status = 422;
    },
  ],
  [
    'server 500',
    (error) => {
      error.status = 500;
    },
  ],
  [
    'timeout',
    (error) => {
      error.message = 'WORKFLOW_MUTATION_TIMEOUT_UNKNOWN';
      error.status = undefined;
    },
  ],
]) {
  void test(`dispatchPrepared retains unknown for ${String(label)} without retry`, async () => {
    const { f, command, reservation } = await dispatchFixture();
    const error = dependencyError();
    alter(error);
    let sends = 0;
    const before = f.store.values.get(f.session.key);
    await assert.rejects(
      f.session.dispatchPrepared(reservation, command, () => {
        sends++;
        return Promise.reject(error);
      }),
      (thrown) => thrown === error,
    );
    assert.equal(sends, 1);
    assert.equal(f.session.wasRejected(reservation, error), false);
    assert.equal(f.store.values.get(f.session.key), before);
    f.session.close();
  });
}
for (const [label, mutate] of [
  [
    'absent original guards',
    (command) => {
      delete command.guards;
    },
  ],
  [
    'different original guard',
    (command) => {
      command.guards[0].path = ['other'];
    },
  ],
  [
    'non-apply action',
    (command) => {
      command.action = 'save';
    },
  ],
]) {
  void test(`dependency denial requires ${String(label)} binding`, async () => {
    const { f, command, reservation } = await dispatchFixture();
    mutate(command);
    const error = dependencyError();
    await assert.rejects(
      f.session.dispatchPrepared(reservation, command, () =>
        Promise.reject(error),
      ),
      (thrown) => thrown === error,
    );
    assert.equal(f.session.wasRejected(reservation, error), false);
    assert(f.store.values.has(f.session.key));
    f.session.close();
  });
}
for (const field of ['operationId', 'generation']) {
  void test(`dispatchPrepared rejects mismatched ${field} without invoking sender`, async () => {
    const { f, command, reservation } = await dispatchFixture();
    command[field] = 'wrong';
    let sends = 0;
    await assert.rejects(
      f.session.dispatchPrepared(reservation, command, () => {
        sends++;
      }),
      /PREPARATION_COMMAND_MISMATCH/,
    );
    assert.equal(sends, 0);
    assert(f.store.values.has(f.session.key));
    f.session.close();
  });
}
void test('wrong reservation cannot dispatch or clear another prepared operation', async () => {
  const { f, command } = await dispatchFixture();
  let sends = 0;
  await assert.rejects(
    f.session.dispatchPrepared('wrong', command, () => {
      sends++;
    }),
    /PREPARATION_COMMAND_MISMATCH/,
  );
  assert.equal(sends, 0);
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
for (const change of ['owner', 'runtime', 'marker']) {
  void test(`late original rejection cannot clean after ${change} changes`, async () => {
    const { f, command, reservation } = await dispatchFixture();
    const error = dependencyError();
    let reject;
    const sent = f.session.dispatchPrepared(
      reservation,
      command,
      () =>
        new Promise((resolve, fail) => {
          reject = fail;
        }),
    );
    if (change === 'owner') f.state.epoch++;
    if (change === 'runtime')
      f.target.dispatch('pagehide', { persisted: true });
    if (change === 'marker') {
      const record = JSON.parse(f.store.values.get(f.session.key));
      record.updatedAt++;
      f.store.values.set(f.session.key, JSON.stringify(record));
    }
    reject(error);
    await assert.rejects(sent, (thrown) => thrown === error);
    assert.equal(f.session.wasRejected(reservation, error), false);
    assert(f.store.values.has(f.session.key));
    f.session.close();
  });
}
void test('success is returned unchanged; dispatch cannot silently clear marker without authoritative readback', async () => {
  const { f, command, reservation } = await dispatchFixture();
  const response = { receipt: { operationId: command.operationId } };
  let sends = 0;
  assert.equal(
    await f.session.dispatchPrepared(reservation, command, () => {
      sends++;
      return Promise.resolve(response);
    }),
    response,
  );
  assert.equal(sends, 1);
  assert(f.store.values.has(f.session.key));
  await assert.rejects(
    f.session.dispatchPrepared(reservation, command, () => {
      sends++;
    }),
    /PREPARATION_COMMAND_MISMATCH/,
  );
  assert.equal(sends, 1);
  f.session.close();
});

void test('cancelScheduled drops only this runtime lazy callback, not durable/RAM records', async () => {
  const f = fixture();
  await f.save({ title: 'durable' });
  const raw = f.store.values.get(f.session.key);
  let captures = 0;
  f.session.schedule(() => {
    captures++;
    return { title: 'newer' };
  });
  assert.equal(f.session.cancelScheduled().ok, true);
  f.tick();
  assert.equal(captures, 0);
  assert.equal(f.store.values.get(f.session.key), raw);
  assert.equal(
    f.session.preview(f.session.key, 'memory').payload.title,
    'durable',
  );
  assert.equal(f.session.status().hasPending, false);
  f.session.close();
});
void test('cancelScheduled leaves unknown marker and one-shot preparation capability unchanged', async () => {
  const f = fixture();
  await f.session.ready;
  const p = f.session.prepareWrite({ operationId: 'op-a', generation: 'g1' }),
    raw = f.store.values.get(f.session.key);
  assert.equal(f.session.cancelScheduled().ok, true);
  assert.equal(f.store.values.get(f.session.key), raw);
  assert.equal(f.session.cancelPrepared(p.reservation).ok, true);
  f.session.close();
});
void test('cancelScheduled rejects cross-owner callbacks without dropping retained input', async () => {
  const f = fixture();
  await f.session.ready;
  f.session.schedule(() => ({ title: 'old owner input' }));
  f.state.epoch++;
  assert.equal(f.session.cancelScheduled().code, 'OWNER_CHANGED');
  assert.equal(f.timers.size, 1);
  f.session.close();
});
void test('debounced quota status reaches metadata observer without payload/identity/receipt content', async () => {
  const observed = [],
    f = fixture({
      options: { onStatus: (metadata) => observed.push(metadata) },
    });
  await f.session.ready;
  f.store.setItem = () => {
    throw Object.assign(Error('full'), { name: 'QuotaExceededError' });
  };
  f.session.schedule(() => ({ title: 'private text' }));
  f.tick();
  assert.equal(observed[0].code, 'SCHEDULED');
  assert.equal(observed.at(-1).code, 'QUOTA_EXCEEDED');
  assert.equal(observed.at(-1).durable, false);
  for (const item of observed) {
    assert(
      Object.keys(item).every((key) =>
        [
          'ok',
          'code',
          'durable',
          'hasPending',
          'hasMemory',
          'kind',
          'ready',
          'canRecover',
        ].includes(key),
      ),
    );
    assert.equal(JSON.stringify(item).includes('private text'), false);
    assert.equal(Object.hasOwn(item, 'key'), false);
    assert.equal(Object.hasOwn(item, 'receipt'), false);
  }
  f.session.close();
});
void test('observer throwing cannot change successful persistence into failure', async () => {
  const f = fixture({
    options: {
      onStatus() {
        throw Error('UI_ERROR');
      },
    },
  });
  await f.save();
  assert.equal(f.session.status().code, 'OK');
  assert.equal(f.session.status().durable, true);
  f.session.close();
});
void test('observer-induced owner switch cannot return old owner success metadata/key', async () => {
  let switchOwner = false;
  const f = fixture({
    options: {
      onStatus(metadata) {
        if (switchOwner && metadata.code === 'OK') f.state.actorId = 'b';
      },
    },
  });
  await f.session.ready;
  f.session.schedule(() => ({ title: 'owner a' }));
  switchOwner = true;
  const result = f.session.flush();
  assert.equal(result.code, 'OWNER_CHANGED');
  assert.equal(result.key, undefined);
  assert.equal(result.payload, undefined);
  assert.equal(f.session.preview(f.session.key).payload, undefined);
  f.session.close();
});
void test('observer callback cannot dispatch stale owner writes through a late debounce', async () => {
  const f = fixture({
    options: {
      onStatus(metadata) {
        if (metadata.code === 'SCHEDULED') f.state.epoch++;
      },
    },
  });
  await f.session.ready;
  assert.equal(
    f.session.schedule(() => ({ title: 'old' })).code,
    'OWNER_CHANGED',
  );
  f.tick();
  assert.equal(f.store.calls.writes.length, 0);
  f.session.close();
});

void test('a status observer scheduling newer input cannot lose that next debounce batch', async () => {
  let replaced = false;
  const f = fixture({
    options: {
      onStatus(metadata) {
        if (metadata.code === 'OK' && !replaced) {
          replaced = true;
          f.session.schedule(() => ({ title: 'next batch' }));
        }
      },
    },
  });
  await f.session.ready;
  f.session.schedule(() => ({ title: 'first batch' }));
  f.tick();
  assert.equal(f.session.status().hasPending, true);
  f.tick();
  assert.equal(f.session.preview(f.session.key).payload.title, 'next batch');
  assert.equal(f.store.calls.writes.length, 2);
  f.session.close();
});

for (const change of ['owner', 'runtime']) {
  void test(`late successful dispatch cannot expose original response after ${change} changes`, async () => {
    const { f, command, reservation } = await dispatchFixture();
    let resolve;
    const sent = f.session.dispatchPrepared(
      reservation,
      command,
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    if (change === 'owner') f.state.actorId = 'b';
    else f.target.dispatch('pagehide', { persisted: true });
    resolve({ control: { private: 'old account workflow' } });
    await assert.rejects(sent, /OWNER_CHANGED|RUNTIME_NOT_READY/);
    assert(f.store.values.has(f.session.key));
    f.session.close();
  });
}
void test('successful dispatch may advance the same owner base before returning without being misclassified', async () => {
  const { f, command, reservation } = await dispatchFixture();
  const response = { receipt: { operationId: command.operationId } };
  const received = await f.session.dispatchPrepared(
    reservation,
    command,
    async () => {
      f.state.baseVersion = '["g1",5,null]';
      return response;
    },
  );
  assert.equal(received, response);
  assert(f.store.values.has(f.session.key));
  f.session.close();
});
