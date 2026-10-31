import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const sources = ['local-draft-recovery.js', 'local-draft-recovery-session.js'].map(name => fs.readFileSync(new URL('../public/process/' + name, import.meta.url), 'utf8'));
const OLD = '["g1",5,null,"draft-v1"]', NEXT = '["g1",6,null,"draft-v1"]';
const PREFIX = 'process-local-draft-v2:', REGISTRY = 'process-local-draft-lineage-v1:';
const pause = () => new Promise(resolve => setImmediate(resolve));
function disk() {
  const values = new Map(), reads = [], writes = [], removes = [];
  return { values, reads, writes, removes, onRead: null, onWrite: null,
    get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem(key) { reads.push(key); const answer = this.onRead?.(key); return answer === undefined ? values.get(key) ?? null : answer; },
    setItem(key, raw) { writes.push({ key, raw }); this.onWrite?.(key, raw, () => values.set(key, raw)); if (!this.onWrite) values.set(key, raw); },
    removeItem(key) { removes.push(key); values.delete(key); }, clear() { throw Error('CLEAR_FORBIDDEN'); } };
}
function locks() {
  const held = new Set(); let delayed = null, reject = false;
  return { held, delayNext() { let resume; const promise = new Promise(resolve => { resume = resolve; }); delayed = promise; return resume; }, rejectNext() { reject = true; },
    async request(name, options, callback) {
      assert.equal(options.ifAvailable, true); assert.equal(options.mode, 'exclusive');
      if (reject) { reject = false; throw Error('LOCK_FAILURE'); }
      const waiting = delayed; delayed = null; if (waiting) await waiting;
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    } };
}
async function fixture({ store = disk(), manager = locks(), base = OLD, epoch = 1 } = {}) {
  const state = { actorId: 'actor-a', scope: 'IPQC-C:error-form', tabId: webcrypto.randomUUID(), epoch, baseVersion: base, canView: true, canEdit: true, pending: false, verified: true, writeState: 'idle', hasLocalChanges: true, localRevision: 7 };
  const timers = new Map(), events = new Map(); let serial = 0, network = 0;
  const host = { crypto: webcrypto, navigator: { locks: manager }, localStorage: store,
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); },
    fetch() { network++; throw Error('NETWORK_FORBIDDEN'); } };
  const world = vm.createContext({ window: host, TextEncoder, Uint8Array }); for (const source of sources) vm.runInContext(source, world);
  const session = host.LocalDraftRecoverySession.create({ getContext: () => ({ ...state }) }); await session.ready;
  return { session, state, store, manager, host, network: () => network, emit: name => events.get(name)?.({ persisted: true }),
    tick() { const jobs = [...timers.values()]; timers.clear(); for (const job of jobs) job(); },
    save(payload = { name: 'old local input' }) { assert.equal(session.schedule(() => payload).ok, true); assert.equal(session.flush().ok, true); },
    input(payload = { name: 'reviewed local input' }) { state.baseVersion = NEXT; return { baseVersion: NEXT, localRevision: state.localRevision, workflow: { scope: state.scope, generation: 'g1', revision: 6, saved: null }, payload }; } };
}
function snapshot(f) { return { key: f.session.key, runtime: f.session.runtimeId, lineage: f.session.status().lineageId, raw: f.store.values.get(f.session.key), memory: JSON.stringify(f.session.preview(f.session.key, 'memory').payload) }; }
function retained(f, old) {
  assert.equal(f.session.key, old.key); assert.equal(f.session.runtimeId, old.runtime);
  assert.equal(f.store.values.get(old.key), old.raw); assert.equal(f.store.removes.length, 0);
  assert.equal(f.session.status().baseVersion, OLD); assert.equal(f.session.status().lineageId, old.lineage);
  assert.equal(JSON.stringify(f.session.preview(old.key, 'memory').payload), old.memory); assert.equal(f.network(), 0);
}

for (const manager of ['locks', 'unclaimed']) void test(manager + ': durable successor commits once, preserves source and lineage, revokes old preview and timer', async () => {
  const f = await fixture({ manager: manager === 'locks' ? locks() : null }); f.save(); const old = snapshot(f), preview = f.session.preview(old.key);
  f.session.schedule(() => ({ name: 'obsolete scheduled snapshot' })); const before = f.store.writes.length;
  const input = f.input(), result = await f.session.rebaseLocal(input);
  assert.equal(result.ok, true); assert.equal(result.durable, true); assert.equal(result.previousKey, old.key);
  assert.notEqual(f.session.key, old.key); assert.notEqual(f.session.runtimeId, old.runtime);
  assert.equal(f.session.status().lineageId, old.lineage); assert.equal(f.session.status().baseVersion, NEXT);
  assert.equal(f.store.values.get(old.key), old.raw); assert.equal(f.store.writes.length, before + 1);
  assert.equal(f.session.preview(f.session.key).payload.name, input.payload.name);
  assert.equal(f.session.restore(preview.token).code, 'PREVIEW_REQUIRED');
  f.tick(); assert.equal(f.store.writes.length, before + 1); assert.equal(f.session.status().hasPending, false);
  assert.equal(f.store.removes.length, 0); assert.equal(f.network(), 0);
  if (manager === 'locks') { await pause(); assert.equal(f.manager.held.has('process-local-draft-v2-runtime:' + old.runtime), false); assert.equal(f.manager.held.has('process-local-draft-v2-lineage:' + old.lineage), true); }
  const successor = f.session.key; f.session.close(); await pause();
  const next = await fixture({ store: f.store, manager: f.manager, base: NEXT });
  assert.equal(next.session.discover().items.length, 2);
  assert.equal(next.session.status().hasMemory, false);
  if (manager === 'unclaimed') for (const key of [old.key, successor]) { assert.equal((await next.session.claim(key)).code, 'WEB_LOCKS_UNAVAILABLE'); assert.equal(next.session.preview(key).code, 'SOURCE_LEASE_UNAVAILABLE'); }
  else { assert.equal((await next.session.claim(successor)).ok, true); assert.equal(next.session.preview(successor).payload.name, input.payload.name); }
  next.session.close();
});

for (const fault of ['quota', 'write error', 'read throws', 'read mismatch']) void test(fault + ': preserves exact old durable bytes, old base and old RAM', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f); let successor, reached = false;
  f.store.onWrite = (key, raw, put) => {
    successor = key; reached = true;
    if (fault === 'quota') throw Object.assign(Error('full'), { name: 'QuotaExceededError' });
    if (fault === 'write error') throw Error('denied');
    put(); f.store.onRead = target => { if (target !== key) return undefined; if (fault === 'read throws') throw Error('read failed'); return raw + ' '; };
  };
  const result = await f.session.rebaseLocal(f.input()); assert.equal(result.ok, false); assert.equal(reached, true);
  assert.equal(result.code, { quota: 'QUOTA_EXCEEDED', 'write error': 'STORAGE_WRITE_FAILED', 'read throws': 'STORAGE_READ_FAILED', 'read mismatch': 'STORAGE_UNCONFIRMED' }[fault]);
  f.store.onRead = null; f.store.onWrite = null; retained(f, old);
  if (fault.startsWith('read')) { assert.equal(JSON.parse(f.store.values.get(successor)).payload.name, 'reviewed local input'); assert.equal(JSON.parse(f.store.values.get(successor)).lineageId, old.lineage); }
  await pause(); assert.equal(f.manager.held.has('process-local-draft-v2-runtime:' + JSON.parse(successor.slice(PREFIX.length))[6]), false);
  f.session.close();
});

for (const fault of ['actor', 'epoch', 'edit permission', 'view permission', 'local revision', 'base', 'pending', 'verified', 'unknown', 'pagehide', 'close']) void test('successful successor set followed by ' + fault + ' refuses RAM commit', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f), original = { ...f.state }; let wrote = false;
  f.store.onWrite = (_key, _raw, put) => { put(); wrote = true;
    if (fault === 'actor') f.state.actorId = 'other'; if (fault === 'epoch') f.state.epoch++;
    if (fault === 'edit permission') f.state.canEdit = false; if (fault === 'view permission') f.state.canView = false;
    if (fault === 'local revision') f.state.localRevision++; if (fault === 'base') f.state.baseVersion = '["g2",1,null,"draft-v1"]';
    if (fault === 'pending') f.state.pending = true; if (fault === 'verified') f.state.verified = false;
    if (fault === 'unknown') f.state.writeState = 'unknown'; if (fault === 'pagehide') f.emit('pagehide'); if (fault === 'close') f.session.close();
  };
  const result = await f.session.rebaseLocal(f.input()); assert.equal(result.ok, false); assert.equal(wrote, true);
  f.store.onWrite = null; Object.assign(f.state, original);
  if (fault === 'pagehide') { f.emit('pageshow'); await f.session.ready; }
  if (fault === 'close') { assert.equal(f.session.key, old.key); assert.equal(f.store.values.get(old.key), old.raw); }
  else retained(f, old);
  f.session.close();
});

for (const fault of ['actor', 'local revision', 'base', 'pagehide', 'source bytes', 'registry', 'competing rebase']) void test('delayed runtime acquisition rechecks ' + fault + ' before any candidate write', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f), beforeWrites = f.store.writes.length, original = { ...f.state };
  const resume = f.manager.delayNext(), input = f.input(), pending = f.session.rebaseLocal(input);
  assert.equal(f.manager.held.has('process-local-draft-v2-runtime:' + old.runtime), true);
  assert.equal(f.manager.held.has('process-local-draft-v2-lineage:' + old.lineage), true);
  if (fault === 'actor') f.state.actorId = 'other'; if (fault === 'local revision') f.state.localRevision++;
  if (fault === 'base') f.state.baseVersion = '["g1",7,null,"draft-v1"]'; if (fault === 'pagehide') f.emit('pagehide');
  if (fault === 'source bytes') f.store.values.set(old.key, old.raw + ' ');
  if (fault === 'registry') f.store.values.set(REGISTRY + JSON.stringify([original.actorId, original.scope, old.lineage]), '{}');
  if (fault === 'competing rebase') { assert.equal((await f.session.rebaseLocal(input)).code, 'REBASE_IN_PROGRESS'); f.state.localRevision++; }
  resume(); const result = await pending; assert.equal(result.ok, false); assert.equal(f.store.writes.length, beforeWrites);
  Object.assign(f.state, original); f.store.values.set(old.key, old.raw); for (const key of f.store.values.keys()) if (key.startsWith(REGISTRY)) f.store.values.delete(key);
  if (fault === 'pagehide') { f.emit('pageshow'); await f.session.ready; }
  retained(f, old); f.session.close();
});

void test('candidate lease failure never downgrades web-lock lineage or changes existing source', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f); f.manager.rejectNext();
  assert.equal((await f.session.rebaseLocal(f.input())).code, 'RECOVERY_LOCK_FAILED'); retained(f, old);
  assert.equal(f.session.status().canRecover, true); f.session.close();
});

for (const fault of ['media', 'secret', 'oversize', 'accessor', 'generation', 'version', 'revision', 'scope']) void test('invalid rebase ' + fault + ' is refused without writes', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f), input = f.input(), writes = f.store.writes.length;
  if (fault === 'media') input.payload = { photo: 'data:image/png;base64,ABC' };
  if (fault === 'secret') input.payload = { password: 'never persist' };
  if (fault === 'oversize') input.payload = { text: 'a'.repeat(32769) };
  if (fault === 'accessor') input.payload = Object.defineProperty({}, 'name', { enumerable: true, get() { throw Error('ACCESSOR_MUST_NOT_RUN'); } });
  if (fault === 'generation') { input.baseVersion = f.state.baseVersion = '["g2",6,null,"draft-v1"]'; input.workflow.generation = 'g2'; }
  if (fault === 'version') input.baseVersion = f.state.baseVersion = '["g1",6,null,"other-version"]';
  if (fault === 'revision') input.localRevision++; if (fault === 'scope') input.workflow.scope = 'other';
  assert.equal((await f.session.rebaseLocal(input)).ok, false); assert.equal(f.store.writes.length, writes); retained(f, old); f.session.close();
});

for (const state of ['unknown memory', 'armed registry', 'prepared']) void test(state + ' can never become editable through transactional rebase', async () => {
  const f = await fixture(); f.save(); const ref = { operationId: webcrypto.randomUUID(), generation: 'g1' };
  if (state === 'unknown memory') assert.equal(f.session.rememberUnknown(ref).ok, true);
  if (state === 'prepared') assert.equal(f.session.prepareWrite(ref).ok, true);
  if (state === 'armed registry') {
    const local = JSON.parse(f.store.values.get(f.session.key));
    f.store.values.set(REGISTRY + JSON.stringify([f.state.actorId, f.state.scope, local.lineageId]), JSON.stringify({ version: 1, actorId: f.state.actorId, scope: f.state.scope, lineageId: local.lineageId, state: 'armed', anchorKey: f.session.key, receipt: ref, baseVersion: OLD, outcome: null, nextBase: null }));
  }
  const key = f.session.key, raw = f.store.values.get(key), writes = f.store.writes.length;
  assert.equal((await f.session.rebaseLocal(f.input())).code, 'RECEIPT_REQUIRED'); assert.equal(f.session.key, key); assert.equal(f.store.values.get(key), raw); assert.equal(f.store.writes.length, writes); f.session.close();
});

for (const success of [true, false]) void test((success ? 'committed predecessor' : 'unconfirmed successor') + ' cannot replay past a same-lineage unknown', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f); let successor;
  if (!success) f.store.onWrite = (key, _raw, put) => { successor = key; put(); f.store.onRead = target => { if (target === key) throw Error('uncertain read'); }; };
  const rebased = await f.session.rebaseLocal(f.input()); assert.equal(rebased.ok, success); successor ||= f.session.key;
  f.store.onWrite = null; f.store.onRead = null; if (!success) f.state.baseVersion = OLD;
  assert.equal(f.session.prepareWrite({ operationId: webcrypto.randomUUID(), generation: 'g1' }).ok, true);
  const alias = success ? old.key : successor; f.session.close(); await pause();
  const next = await fixture({ store: f.store, manager: f.manager, base: success ? NEXT : OLD }); f.store.reads.length = 0;
  assert.equal((await next.session.claim(alias)).code, 'LINEAGE_UNRESOLVED'); assert.equal(next.session.preview(alias).code, 'LINEAGE_UNRESOLVED');
  assert.equal(f.store.reads.includes(alias), false); assert.equal(next.network(), 0); next.session.close();
});

for (const fault of ['actor', 'pagehide']) void test('fresh-only no-Locks rebase still fences ' + fault + ' after set', async () => {
  const f = await fixture({ manager: null }); f.save(); const old = snapshot(f), actor = f.state.actorId;
  f.store.onWrite = (_key, _raw, put) => { put(); if (fault === 'actor') f.state.actorId = 'other'; else f.emit('pagehide'); };
  assert.equal((await f.session.rebaseLocal(f.input())).ok, false); f.store.onWrite = null; f.state.actorId = actor;
  if (fault === 'pagehide') { f.emit('pageshow'); await f.session.ready; }
  retained(f, old); f.session.close();
});

for (const fault of ['armed', 'final', 'malformed']) void test('lineage becomes ' + fault + ' after successor set: old source and RAM remain pinned', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f), registryKey = REGISTRY + JSON.stringify([f.state.actorId, f.state.scope, old.lineage]);
  f.store.onWrite = (_key, _raw, put) => {
    put(); f.store.values.set(registryKey, fault === 'malformed' ? '{}' : JSON.stringify({ version: 1, actorId: f.state.actorId, scope: f.state.scope, lineageId: old.lineage,
      state: fault === 'armed' ? 'armed' : 'final', anchorKey: old.key, receipt: { operationId: webcrypto.randomUUID(), generation: 'g1' }, baseVersion: OLD,
      outcome: fault === 'armed' ? null : 'aborted', nextBase: fault === 'armed' ? null : OLD }));
  };
  const result = await f.session.rebaseLocal(f.input()); assert.equal(result.ok, false);
  assert.equal(result.code, fault === 'malformed' ? 'LINEAGE_REGISTRY_INVALID' : 'RECORD_CHANGED');
  f.store.onWrite = null; f.store.values.delete(registryKey); retained(f, old); f.session.close();
});

void test('successor-key collision cannot overwrite existing bytes', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f), writes = f.store.writes.length;
  f.store.onRead = key => key.startsWith(PREFIX) && key !== old.key ? 'existing collision bytes' : undefined;
  assert.equal((await f.session.rebaseLocal(f.input())).code, 'STORAGE_CHANGED'); assert.equal(f.store.writes.length, writes);
  f.store.onRead = null; retained(f, old); f.session.close();
});

void test('readback callback changing local revision cannot commit a stale candidate', async () => {
  const f = await fixture(); f.save(); const old = snapshot(f);
  f.store.onWrite = (key, _raw, put) => { put(); f.store.onRead = target => { if (target === key) f.state.localRevision++; }; };
  assert.equal((await f.session.rebaseLocal(f.input())).code, 'LOCAL_CHANGED');
  f.store.onRead = null; f.store.onWrite = null; retained(f, old); f.session.close();
});

void test('read-only metadata discovery never reads foreign payloads introduced beside a successor', async () => {
  const f = await fixture(); f.save(); const foreign = await fixture({ store: f.store, manager: f.manager }); foreign.state.actorId = 'different-actor';
  const foreignKey = PREFIX + JSON.stringify(['different-actor', f.state.scope, 'other-tab', 1, 'web-lock-v1', 'other-lineage', 'other-runtime']);
  f.store.values.set(foreignKey, '{private unreadable payload');
  assert.equal((await f.session.rebaseLocal(f.input())).ok, true); f.store.reads.length = 0;
  assert.equal(f.session.discover().items.length, 2); assert.equal(f.store.reads.length, 0);
  assert.equal(f.session.preview(foreignKey).code, 'NOT_OWNED'); assert.equal(f.store.reads.includes(foreignKey), false);
  foreign.session.close(); f.session.close();
});
