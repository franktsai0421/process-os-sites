import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const sources = ['local-draft-recovery.js', 'local-draft-recovery-session.js'].map(name => fs.readFileSync(new URL('../public/process/' + name, import.meta.url), 'utf8'));
function disk() {
  const values = new Map(), reads = [], writes = [], removes = []; let quota = false;
  return { values, reads, writes, removes, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem(key) { reads.push(key); return values.get(key) ?? null; }, setItem(key, raw) { if (quota) throw Object.assign(Error('quota'), { name: 'QuotaExceededError' }); writes.push(key); values.set(key, raw); }, removeItem(key) { removes.push(key); values.delete(key); }, quota(value) { quota = value; } };
}
function locks() {
  const held = new Set(); let reject = false;
  return { held, reject(value = true) { reject = value; }, async request(name, options, callback) { assert.equal(options.ifAvailable, true); if (reject) throw Error('denied'); if (held.has(name)) return callback(null); held.add(name); try { return await callback({ name }); } finally { held.delete(name); } } };
}
function fixture({ store = disk(), manager = locks(), actor = 'a', epoch = 1, base = '["g1",5,null]' } = {}) {
  const state = { actorId: actor, scope: 'fqc', epoch, baseVersion: base, canView: true, canEdit: true, pending: false, verified: true, hasLocalChanges: false, localRevision: 0, writeState: 'idle' }, timers = new Map(), events = new Map(); let id = 0, captures = 0, serializes = 0;
  const host = { crypto: webcrypto, navigator: { locks: manager }, localStorage: store, setTimeout(fn) { const key = ++id; timers.set(key, fn); return key; }, clearTimeout(key) { timers.delete(key); }, addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); }, fetch() { throw Error('NO_NETWORK'); } };
  const world = vm.createContext({ window: host, TextEncoder, Uint8Array, JSON: { parse: JSON.parse, stringify(value) { serializes++; return JSON.stringify(value); } } }); for (const source of sources) vm.runInContext(source, world);
  const session = host.LocalDraftRecoverySession.create({ getContext: () => state });
  return { state, store, manager, session, timers, host, async ready() { await session.ready; return this; }, capture(value) { return () => { captures++; return value; }; }, metrics: () => ({ captures, serializes }), emit: (name, event) => events.get(name)?.(event), tick() { const jobs = [...timers.values()]; timers.clear(); for (const fn of jobs) fn(); } };
}
async function save(f, payload = { name: 'local' }) { await f.ready(); assert.equal(f.session.schedule(f.capture(payload)).ok, true); assert.equal(f.session.flush().ok, true); }
const pause = () => new Promise(resolve => setImmediate(resolve));
const ref = () => ({ operationId: webcrypto.randomUUID(), generation: 'g1' });
const command = r => ({ ...r, action: 'apply', patches: [{ op: 'set', path: ['items', { id: 'a' }, 'name'], value: 'new' }], guards: [{ path: ['items', { id: 'a' }, 'name'], value: 'old' }] });
function evidence(f, r, revision = 6, unchanged = false) { const old = JSON.parse(f.state.baseVersion); f.state.baseVersion = JSON.stringify(['g1', revision, null, ...old.slice(3)]); return { receipt: { ...r, revision, unchanged, savedId: null, caseId: null }, workflow: { scope: 'fqc', generation: 'g1', revision, saved: null } }; }
async function abandoned() { const a = await fixture().ready(); await save(a); const key = a.session.key; a.session.close(); await pause(); const b = await fixture({ store: a.store, manager: a.manager, epoch: 2 }).ready(); return { a, b, key }; }
async function prepared(options) { const f = await fixture(options).ready(), reference = ref(), reservation = f.session.prepareWrite(reference); assert.equal(reservation.ok, true); return { ...f, reference, reservation: reservation.reservation, command: command(reference) }; }
const registryKey = f => [...f.store.values.keys()].find(key => key.startsWith('process-local-draft-lineage-v1:'));
void test('keys-only inventory and occupied claim do not read active sibling payload or metadata', async () => {
  const a = await fixture().ready(); await save(a); const b = await fixture({ store: a.store, manager: a.manager }).ready(); a.store.reads.length = 0;
  const items = b.session.discover().items; assert.equal(items.length, 1); assert.equal(items[0].kind, undefined); assert.equal(items[0].lineageId, a.session.status().lineageId); assert.equal(a.store.reads.length, 0);
  assert.equal(b.session.preview(a.session.key).code, 'RECOVERY_CLAIM_REQUIRED'); assert.equal((await b.session.claim(a.session.key)).code, 'RECOVERY_IN_USE'); assert.equal(a.store.reads.length, 0); a.session.close(); b.session.close();
});
for (const mode of ['none', 'rejected']) void test(mode + ' Locks never reads historical payload and keeps fresh independent writes', async () => {
  const { a, b, key } = await abandoned(), manager = mode === 'none' ? null : locks(); manager?.reject(); const f = await fixture({ store: a.store, manager }).ready(); a.store.reads.length = 0;
  assert.equal(f.session.status().canRecover, false); assert.equal((await f.session.claim(key)).code, 'WEB_LOCKS_UNAVAILABLE'); assert.equal(f.session.preview(key).code, 'RECOVERY_CLAIM_REQUIRED'); assert.equal(a.store.reads.length, 0); await save(f); assert.notEqual(f.session.key, key); f.session.close(); b.session.close();
});
void test('legacy v1 source is metadata-only unsupported, with original bytes untouched', async () => {
  const f = await fixture().ready(), key = 'process-local-draft-v1:' + JSON.stringify(['a', 'fqc', 'copied-tab', 1]) + ':old-runtime'; f.store.values.set(key, '{private broken'); f.store.reads.length = 0;
  const item = f.session.discover().items[0]; assert.equal(item.legacy, true); assert.equal(item.claimable, false); assert.equal((await f.session.claim(key)).code, 'UNSUPPORTED_LEGACY'); assert.equal(f.session.preview(key).code, 'UNSUPPORTED_LEGACY'); assert.equal(f.store.reads.length, 0); assert.equal(f.store.values.get(key), '{private broken'); f.session.close();
});
void test('restore adopts claimed lineage within same runtime and ancestor cannot replay unresolved descendant', async () => {
  const { a, b, key } = await abandoned(), oldKey = b.session.key, runtime = b.session.runtimeId; assert.equal((await b.session.claim(key)).ok, true); assert.equal(b.session.restore(b.session.preview(key).token).ok, true);
  assert.notEqual(b.session.key, oldKey); assert.equal(b.session.runtimeId, runtime); assert.equal(b.session.status().lineageId, JSON.parse(key.slice('process-local-draft-v2:'.length))[5]); await save(b);
  const r = ref(), p = b.session.prepareWrite(r); assert.equal(p.ok, true); await assert.rejects(b.session.dispatchPrepared(p.reservation, command(r), async () => { throw Error('lost ACK'); }), /lost ACK/);
  const c = await fixture({ store: a.store, manager: a.manager }).ready(); a.store.reads.length = 0; assert.equal((await c.session.claim(key)).code, 'RECOVERY_IN_USE'); assert.equal(a.store.reads.includes(key), false);
  const descendant = b.session.key; b.session.close(); await pause(); a.store.reads.length = 0; assert.equal((await c.session.claim(key)).code, 'LINEAGE_UNRESOLVED'); assert.equal(c.session.preview(key).code, 'LINEAGE_UNRESOLVED'); assert.equal(a.store.reads.includes(key), false);
  assert.equal((await c.session.claim(descendant)).ok, true); assert.equal(c.session.preview(descendant).kind, 'unknown'); c.session.close();
});
void test('target RAM must be empty before lineage adoption even if caller dirty flag is false', async () => {
  const { b, key } = await abandoned(); await save(b, { name: 'current retained' }); await b.session.claim(key); const ownKey = b.session.key; assert.equal(b.session.restore(b.session.preview(key).token).code, 'LOCAL_CHANGES_PRESENT'); assert.equal(b.session.key, ownKey); assert.equal(b.session.preview(ownKey).payload.name, 'current retained'); b.session.close();
});
void test('independent lineages can prepare concurrently without whole-scope lock', async () => {
  const a = await prepared(), b = await prepared({ store: a.store, manager: a.manager }); assert.notEqual(a.session.status().lineageId, b.session.status().lineageId); a.session.close(); b.session.close();
});
for (const variant of ['malformed', 'foreign anchor', 'wrong lineage']) void test('registry ' + variant + ' blocks claimed source before payload access', async () => {
  const f = await prepared(), k = registryKey(f), raw = JSON.parse(f.store.values.get(k)), key = f.session.key; if (variant === 'foreign anchor') raw.anchorKey = raw.anchorKey.replace('"a"', '"b"'); if (variant === 'wrong lineage') raw.lineageId = webcrypto.randomUUID(); f.store.values.set(k, variant === 'malformed' ? '{' : JSON.stringify(raw)); f.session.close(); await pause(); const target = await fixture({ store: f.store, manager: f.manager }).ready(); f.store.reads.length = 0;
  assert.equal((await target.session.claim(key)).code, 'LINEAGE_REGISTRY_INVALID'); assert.equal(f.store.reads.includes(key), false); target.session.close();
});
void test('100 inputs do not read registry, capture, serialize, write or POST before lazy flush', async () => {
  const f = await fixture().ready(), before = f.metrics(); f.store.reads.length = 0; for (let i = 0; i < 100; i++) f.session.schedule(f.capture({ name: String(i) })); assert.deepEqual(f.metrics(), before); assert.equal(f.store.reads.length, 0); assert.equal(f.store.writes.length, 0); f.tick(); assert.equal(f.metrics().captures, 1); assert.equal(f.store.writes.length, 1); f.session.close();
});
for (const variant of ['valid clone', 'changed body', 'changed owner', 'pagehide', 'registry corruption', 'anchor corruption']) void test('single-use actual transport proof: ' + variant, async () => {
  const f = await prepared(); let accepted;
  await f.session.dispatchPrepared(f.reservation, f.command, async c => { const cloned = JSON.parse(JSON.stringify(c)); if (variant === 'changed body') cloned.patches[0].value = 'forged'; if (variant === 'changed owner') f.state.epoch++; if (variant === 'pagehide') f.emit('pagehide', {}); if (variant === 'registry corruption') f.store.values.set(registryKey(f), '{}'); if (variant === 'anchor corruption') f.store.values.set(f.session.key, '{}'); accepted = f.session.assertDispatch(cloned); if (accepted) assert.equal(f.session.assertDispatch(cloned), false); }).catch(e => { assert(['OWNER_CHANGED', 'RUNTIME_NOT_READY'].includes(e.message)); }); assert.equal(accepted, variant === 'valid clone'); f.session.close();
});
for (const [revision, unchanged] of [[1, false], [0, true], [5, false]]) void test('receipt source revision 5 lower bound rejects ' + revision + '/' + unchanged, async () => {
  const f = await prepared(), e = evidence(f, f.reference, 5, unchanged); e.receipt.revision = revision; assert.equal(f.session.settleReceipt(f.session.preview(f.session.key).token, e).code, 'TERMINAL_RECEIPT_REQUIRED'); assert.equal(f.session.preview(f.session.key).kind, 'unknown'); f.session.close();
});
for (const base of ['["g1",0,null]', '["g1",5,null]', '["g1",5,null,"shared-g1"]']) void test('legal no-op advances same session with exact source tuple ' + base, async () => {
  const f = await prepared({ base }), revision = JSON.parse(base)[1], e = evidence(f, f.reference, revision, true), key = f.session.key, lineage = f.session.status().lineageId; assert.equal(f.session.settleReceipt(f.session.preview(key).token, e).ok, true); assert.equal(f.session.key, key); assert.equal(f.session.status().lineageId, lineage); assert.equal(f.session.status().baseVersion, base); await save(f, { name: 'next batch' }); f.session.close();
});
void test('opaque source base cannot be replaced with caller-invented lower-bound proof', async () => {
  const f = await prepared({ base: 'legacy-base' }), e = { receipt: { ...f.reference, revision: 1, unchanged: false, savedId: null, caseId: null }, workflow: { scope: 'fqc', generation: 'g1', revision: 1 }, sourceBase: { baseVersion: 'legacy-base', generation: 'g1', revision: 0, savedId: null } }; f.state.baseVersion = '["g1",1,null]'; assert.equal(f.session.settleReceipt(f.session.preview(f.session.key).token, e).code, 'SOURCE_BASE_EVIDENCE_REQUIRED'); f.session.close();
});
for (const kind of ['receipt', 'aborted']) void test(kind + ' FINAL before failed exact delete is explicit-finalizable and forbids another POST', async () => {
  const f = await prepared(), original = f.store.removeItem.bind(f.store); f.store.removeItem = () => { throw Error('remove blocked'); }; const e = evidence(f, f.reference); if (kind === 'aborted') f.state.baseVersion = '["g1",5,null]';
  const first = kind === 'receipt' ? f.session.settleReceipt(f.session.preview(f.session.key).token, e) : f.session.cancelPrepared(f.reservation); assert.equal(first.ok, false); const p = f.session.preview(f.session.key); assert.equal(p.kind, 'resolved'); assert.equal(p.outcome, kind); assert.equal('payload' in p, false); assert.equal(f.session.prepareWrite(ref()).ok, false); assert.equal(f.session.assertDispatch(f.command), false);
  f.store.removeItem = original; assert.equal(f.session.finalizeDisposition(p.token).ok, true); assert.equal(f.store.values.has(f.session.key), false); await save(f, { name: 'RAM latest remains caller owned' }); f.session.close();
});
for (const kind of ['receipt', 'aborted']) void test(kind + ' disposition quota retains unknown and never grants new command', async () => {
  const f = await prepared(), e = evidence(f, f.reference); if (kind === 'aborted') f.state.baseVersion = '["g1",5,null]'; f.store.quota(true); const out = kind === 'receipt' ? f.session.settleReceipt(f.session.preview(f.session.key).token, e) : f.session.cancelPrepared(f.reservation); assert.equal(out.ok, false); assert.equal(f.session.preview(f.session.key).kind, 'unknown'); assert.equal(f.session.prepareWrite(ref()).ok, false); f.store.quota(false); assert.equal((kind === 'receipt' ? f.session.settleReceipt(f.session.preview(f.session.key).token, e) : f.session.cancelPrepared(f.reservation)).ok, true); f.session.close();
});
for (const manager of [null, 'rejected']) void test('fresh-only no-lock Sync and exact receipt advance remain available: ' + manager, async () => {
  const lock = manager === 'rejected' ? locks() : null; lock?.reject(); const f = await prepared({ manager: lock }); let posts = 0; await assert.rejects(f.session.dispatchPrepared(f.reservation, f.command, async c => { assert.equal(f.session.assertDispatch(c), true); posts++; throw Error('lost'); }), /lost/); const e = evidence(f, f.reference); assert.equal(f.session.settleReceipt(f.session.preview(f.session.key).token, e).ok, true); assert.equal(posts, 1); const key = f.session.key; f.session.close(); const target = await fixture({ store: f.store }).ready(); assert.equal((await target.session.claim(key)).code, 'SOURCE_LEASE_UNAVAILABLE'); target.session.close();
});
void test('BFCache reacquires adopted lineage; old reservation never dispatches while a new explicit receipt query can settle', async () => {
  const { b, key } = await abandoned(); await b.session.claim(key); assert.equal(b.session.restore(b.session.preview(key).token).ok, true); const r = ref(), p = b.session.prepareWrite(r); let finish; const sent = b.session.dispatchPrepared(p.reservation, command(r), () => new Promise(resolve => { finish = resolve; }));
  b.emit('pagehide', { persisted: true }); b.emit('pageshow', { persisted: true }); await b.session.ready; finish({}); await assert.rejects(sent, /PREPARATION_CHANGED/); assert.equal(b.session.assertDispatch(command(r)), false); const e = evidence(b, r); assert.equal(b.session.settleReceipt(b.session.preview(b.session.key).token, e).ok, true); b.session.close();
});
void test('explicit rebase requires empty own record, verified metadata and keeps lineage', async () => {
  const f = await fixture().ready(); await save(f); const key = f.session.key, lineage = f.session.status().lineageId; f.state.baseVersion = '["g1",6,null]'; const input = { baseVersion: f.state.baseVersion, localRevision: 0, workflow: { scope: 'fqc', generation: 'g1', revision: 6 } }; assert.equal(f.session.rebaseLocal(input).code, 'LOCAL_CHANGES_PRESENT'); assert.equal(f.session.discard(f.session.preview(key).token).ok, true); assert.equal(f.session.rebaseLocal(input).ok, true); assert.equal(f.session.key, key); assert.equal(f.session.status().lineageId, lineage); await save(f, { name: 'reviewed desired' }); f.session.close();
});
for (const variant of ['edit revoked', 'pending lock', 'generation changed']) void test('queued actual dispatch rechecks ' + variant, async () => {
  const f = await prepared(); let accepted; await f.session.dispatchPrepared(f.reservation, f.command, async c => { if (variant === 'edit revoked') f.state.canEdit = false; if (variant === 'pending lock') f.state.pending = true; if (variant === 'generation changed') f.state.baseVersion = '["g2",1,null]'; accepted = f.session.assertDispatch(c); }).catch(e => assert.equal(e.message, 'BASE_CHANGED')); assert.equal(accepted, false); f.session.close();
});
void test('same-owner late ACK cannot cross a changed generation', async () => {
  const f = await prepared(); await assert.rejects(f.session.dispatchPrepared(f.reservation, f.command, async () => { f.state.baseVersion = '["g2",1,null]'; return { secret: 'old ACK' }; }), /BASE_CHANGED/); assert.equal(f.session.preview(f.session.key).kind, 'unknown'); f.session.close();
});
void test('explicit restore advances pin to verified newer source base while preserving claimed lineage', async () => {
  const a = await fixture({ base: '["g1",6,null]' }).ready(); await save(a); const key = a.session.key; a.session.close(); await pause(); const b = await fixture({ store: a.store, manager: a.manager }).ready(); b.state.baseVersion = '["g1",6,null]'; await b.session.claim(key); assert.equal(b.session.restore(b.session.preview(key).token).ok, true); assert.equal(b.session.status().baseVersion, '["g1",6,null]'); await save(b, { name: 'restored newer source' }); b.session.close();
});
void test('prepare rejects reference generation differing from original pinned base without durable writes', async () => {
  const f = await fixture().ready(), reference = { operationId: webcrypto.randomUUID(), generation: 'g2' }; assert.equal(f.session.prepareWrite(reference).code, 'BASE_CHANGED'); assert.equal(f.store.writes.length, 0); assert.equal(f.session.status().hasMemory, false); f.session.close();
});
for (const variant of ['missing revision', 'invalid revision', 'malformed original savedId']) void test('explicit rebase rejects ' + variant, async () => {
  const f = await fixture({ base: variant === 'malformed original savedId' ? '["g1",5,{}]' : '["g1",5,null]' }).ready(); f.state.baseVersion = '["g1",6,null]'; const input = { baseVersion: f.state.baseVersion, localRevision: 0, workflow: { scope: 'fqc', generation: 'g1', revision: 6 } }; if (variant === 'missing revision') { delete input.localRevision; delete f.state.localRevision; } if (variant === 'invalid revision') input.localRevision = f.state.localRevision = {};
  assert.equal(f.session.rebaseLocal(input).code, variant === 'malformed original savedId' ? 'BASE_CONFLICT' : 'LOCAL_CHANGED'); assert.equal(f.store.writes.length, 0); f.session.close();
});
void test('stale FINAL A never finalizes new marker B after B registry write fails across reload', async () => {
  const f = await prepared(), a = evidence(f, f.reference); assert.equal(f.session.settleReceipt(f.session.preview(f.session.key).token, a).ok, true); const previousFinal = f.store.values.get(registryKey(f)), b = ref(), original = f.store.setItem.bind(f.store);
  f.store.setItem = (key, raw) => { if (key.startsWith('process-local-draft-lineage-v1:')) throw Error('registry quota'); original(key, raw); };
  assert.equal(f.session.prepareWrite(b).ok, false); const key = f.session.key; assert.equal(JSON.parse(f.store.values.get(key)).receipt.operationId, b.operationId); assert.equal(f.store.values.get(registryKey(f)), previousFinal);
  f.session.close(); await pause(); f.store.setItem = original; const target = await fixture({ store: f.store, manager: f.manager, base: '["g1",6,null]' }).ready(); assert.equal((await target.session.claim(key)).ok, true); const p = target.session.preview(key); assert.equal(p.kind, 'unknown'); assert.equal(p.canFinalize, undefined); assert.equal(target.session.finalizeDisposition(p.token).code, 'LOCAL_FINALIZATION_REQUIRED'); assert(f.store.values.has(key));
  const e = evidence(target, b, 7); assert.equal(target.session.settleReceipt(target.session.preview(key).token, e).ok, true); assert.equal(f.store.values.has(key), false); target.session.close();
});
void test('explicit unknown declaration revokes the queued original transport admission proof', async () => {
  const f = await prepared(); let admitted;
  await assert.rejects(f.session.dispatchPrepared(f.reservation, f.command, async c => { assert.equal(f.session.rememberUnknown(f.reference).ok, true); admitted = f.session.assertDispatch(c); }), /PREPARATION_CHANGED/);
  assert.equal(admitted, false); assert.equal(f.session.preview(f.session.key).kind, 'unknown'); f.session.close();
});
void test('close drops queued transport admission and never revives it through the original command', async () => {
  const f = await prepared(); let admitted; await assert.rejects(f.session.dispatchPrepared(f.reservation, f.command, async c => { f.session.close(); admitted = f.session.assertDispatch(c); }), /CLOSED/); assert.equal(admitted, false); assert.equal(f.session.assertDispatch(f.command), false);
});
for (const manager of [null, 'locks']) void test('explicit verified resume recovers BFCache permission-read gap without new identity: ' + manager, async () => {
  const f = await prepared({ manager: manager === 'locks' ? locks() : null }), key = f.session.key, lineage = f.session.status().lineageId; f.emit('pagehide', { persisted: true }); f.state.canView = false; f.emit('pageshow', { persisted: true }); assert.equal((await f.session.ready).code, 'VIEW_PERMISSION_REQUIRED');
  f.state.canView = true; f.state.verified = false; assert.equal((await f.session.resume()).code, 'LATEST_STATE_REQUIRED'); assert.equal(f.session.status().ready, false); f.state.verified = true; const [a, b] = await Promise.all([f.session.resume(), f.session.resume()]); assert.equal(a.ok, true); assert.equal(b.ok, true); assert.equal(f.session.key, key); assert.equal(f.session.status().lineageId, lineage); assert.equal(f.session.status().ready, true); assert.equal(f.session.assertDispatch(f.command), false);
  const e = evidence(f, f.reference); assert.equal(f.session.settleReceipt(f.session.preview(key).token, e).ok, true); f.session.close();
});
void test('resume never downgrades an occupied historical lineage to a fresh unclaimed family', async () => {
  const f = await fixture().ready(); await save(f); const key = f.session.key; f.emit('pagehide', { persisted: true }); await pause(); const other = await fixture({ store: f.store, manager: f.manager }).ready(); assert.equal((await other.session.claim(key)).ok, true); f.emit('pageshow', { persisted: true }); await f.session.ready; assert.equal((await f.session.resume()).code, 'RECOVERY_IN_USE'); assert.equal(f.session.key, key); assert.equal(f.session.status().ready, false); f.session.close(); other.session.close();
});
for (const variant of ['actor', 'epoch', 'closed', 'still suspended']) void test('explicit resume does not bypass ' + variant + ' fence', async () => {
  const f = await prepared(); f.emit('pagehide', { persisted: true }); if (variant !== 'still suspended') { f.state.canView = false; f.emit('pageshow', { persisted: true }); await f.session.ready; f.state.canView = true; }
  if (variant === 'actor') f.state.actorId = 'other'; if (variant === 'epoch') f.state.epoch++; if (variant === 'closed') f.session.close(); assert.equal((await f.session.resume()).ok, false); assert.equal(f.session.assertDispatch(f.command), false); f.session.close();
});
function proofAuthority(f, { writable = false, asyncVerifier = false, throwing = false, thenable = false } = {}) {
  const capabilities = new WeakMap();
  // Deliberately malformed authority: a thenable must never grant synchronous proof.
  // oxlint-disable-next-line unicorn/no-thenable
  const authority = Object.freeze({ verify(capability, error, command, observedPromise) { if (throwing) throw Error('untrusted verifier'); if (thenable) return { then() {} }; if (asyncVerifier) return Promise.resolve(true); const pin = capabilities.get(capability); return !!pin && pin.error === error && pin.command === JSON.stringify(command) && pin.promise === observedPromise && pin.actor === f.state.actorId && pin.epoch === f.state.epoch; } });
  Object.defineProperty(f.host, 'SharedDraftRejectionProof', { value: authority, configurable: writable, writable });
  return { mint(command, error, promise) { const cap = Object.freeze({}); capabilities.set(cap, { command: JSON.stringify(command), error, promise, actor: f.state.actorId, epoch: f.state.epoch }); return cap; } };
}
void test('only exact opaque authority proof for the observed original sender promise can classify a server rejection', async () => {
  const f = await prepared(), authority = proofAuthority(f), error = Object.assign(Error('STALE_DRAFT'), { status: 409, requestId: webcrypto.randomUUID() }); let reject;
  const promise = new Promise((_, fail) => { reject = fail; }), capability = authority.mint(f.command, error, promise);
  const sending = f.session.dispatchPrepared(f.reservation, f.command, () => promise, { rejectionProof: capability }); reject(error); await assert.rejects(sending, e => e === error);
  assert.equal(f.session.wasRejected(f.reservation, error), true); assert.equal(f.store.values.has(f.session.key), false); assert.equal(JSON.parse(f.store.values.get(registryKey(f))).outcome, 'aborted'); f.session.close();
});
for (const variant of ['boolean capability', 'fake object', 'missing authority', 'writable authority', 'async verifier', 'different error', 'different command', 'different sender promise', 'late actor', 'late epoch', 'late generation', 'marker changed', 'registry changed', 'explicit unknown', 'throwing verifier', 'thenable verifier', 'different operation', 'different capability', 'BFCache']) void test('opaque server rejection negative: ' + variant, async () => {
  const f = await prepared(), authority = variant === 'missing authority' ? null : proofAuthority(f, { writable: variant === 'writable authority', asyncVerifier: variant === 'async verifier', throwing: variant === 'throwing verifier', thenable: variant === 'thenable verifier' }), error = Object.assign(Error('PENDING_LOCKED'), { status: 409, requestId: webcrypto.randomUUID() }); let reject;
  const promise = new Promise((_, fail) => { reject = fail; }); let capability = authority?.mint(f.command, error, promise);
  if (variant === 'different capability') capability = authority.mint(f.command, error, Promise.resolve({}));
  if (variant === 'boolean capability') capability = true; if (variant === 'fake object') capability = {};
  let thrown = error; if (variant === 'different error') thrown = Object.assign(Error(error.message), { status: error.status, requestId: error.requestId });
  const sending = f.session.dispatchPrepared(f.reservation, f.command, () => {
    if (variant === 'different operation') f.command.operationId = webcrypto.randomUUID(); if (variant === 'BFCache') f.emit('pagehide', { persisted: true });
    if (variant === 'different command') f.command.patches[0].value = 'changed'; if (variant === 'late actor') f.state.actorId = 'other'; if (variant === 'late epoch') f.state.epoch++; if (variant === 'late generation') f.state.baseVersion = '["g2",1,null]'; if (variant === 'marker changed') f.store.values.set(f.session.key, '{}'); if (variant === 'registry changed') f.store.values.set(registryKey(f), '{}'); if (variant === 'explicit unknown') f.session.rememberUnknown(f.reference);
    return variant === 'different sender promise' ? promise.catch(e => { throw e; }) : promise;
  }, { rejectionProof: capability }); reject(thrown); await assert.rejects(sending, e => e === thrown);
  assert.equal(f.session.wasRejected(f.reservation, thrown), false); assert(f.store.values.has(f.session.key)); f.session.close();
});
void test('opaque confirmed rejection with quota keeps original proof for exact explicit retry only', async () => {
  const f = await prepared(), authority = proofAuthority(f), error = Object.assign(Error('STALE_DRAFT'), { status: 409 }); let reject; const promise = new Promise((_, fail) => { reject = fail; }), capability = authority.mint(f.command, error, promise);
  const sending = f.session.dispatchPrepared(f.reservation, f.command, () => promise, { rejectionProof: capability }); f.store.quota(true); reject(error); await assert.rejects(sending, e => e === error); assert.equal(f.session.wasRejected(f.reservation, error), false); assert.equal(f.session.preview(f.session.key).kind, 'unknown'); f.store.quota(false);
  assert.equal(f.session.retryRejected(f.reservation, Error(error.message)).code, 'REJECTION_PROOF_REQUIRED'); assert.equal(f.session.retryRejected(f.reservation, error).ok, true); assert.equal(f.session.wasRejected(f.reservation, error), true); f.session.close();
});
