import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs.readFileSync(new URL('../public/process/canvas-recovery-store.js', import.meta.url), 'utf8');
const journalSource = fs.readFileSync(new URL('../public/process/canvas-local.js', import.meta.url), 'utf8');
const payload = name => ({ version: 2, entries: { one: { value: name, base: undefined } }, dependencies: {}, baselines: {}, forms: {}, pending: null });
function storage() {
  const data = new Map(), reads = [], writes = [], deletes = [];
  let failWrite = false, failRead = false;
  return {
    data, reads, writes, deletes,
    get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem(key) { reads.push(key); if (failRead) throw Error('fixture read'); return data.get(key) ?? null; },
    setItem(key, value) { if (failWrite) throw Error('fixture quota'); writes.push(key); data.set(key, value); },
    removeItem(key) { deletes.push(key); data.delete(key); },
    quota(value = true) { failWrite = value; }, denied(value = true) { failRead = value; },
  };
}
function lockManager() {
  const held = new Set(); let rejected = false, paused = false; const requests = [], pending = [];
  return {
    held, requests,
    reject(value = true) { rejected = value; }, pause(value = true) { paused = value; },
    resume() { paused = false; for (const next of pending.splice(0)) next(); },
    async request(name, options, callback) {
      requests.push({ name, options });
      await Promise.resolve();
      if (paused) await new Promise(resolve => pending.push(resolve));
      if (rejected) throw Error('fixture lock rejected');
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  };
}
function fixture({ disk = storage(), locks = lockManager(), actor = 'a', epoch = 1, base = '["g1",1,null]', onStatus } = {}) {
  const ctx = { actorId: actor, epoch, baseVersion: base, canView: true, canEdit: true, pending: false, verified: false, hasLocalChanges: false, localRevision: 0, writeState: 'idle' };
  const handlers = new Map(), timers = new Map(); let nextTimer = 0, serializes = 0;
  const host = { crypto: webcrypto, location: { origin: 'https://fixture.invalid', pathname: '/process/' }, navigator: locks ? { locks } : {}, localStorage: disk,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
  };
  const sandbox = { ...host, JSON: { parse: JSON.parse, stringify(value) { serializes++; return JSON.stringify(value); } } }; sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  const store = sandbox.CanvasRecoveryStore.create({ getContext: () => ctx, onStatus });
  return { ctx, store, disk, locks, timers, factory: sandbox.CanvasRecoveryStore, serializes: () => serializes,
    tick() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
    emit(name, event = {}) { for (const fn of handlers.get(name) ?? []) fn(event); },
    async ready() { await store.ready; return this; },
  };
}
async function save(f, text = 'draft') { await f.ready(); assert.equal(f.store.schedule(() => payload(text)).ok, true); assert.equal(f.store.flush().ok, true); }
async function historical() {
  const disk = storage(), locks = lockManager(), source = fixture({ disk, locks, epoch: 7 }); await save(source); const key = source.store.key; source.store.close(); await Promise.resolve();
  const target = fixture({ disk, locks, epoch: 1 }); await target.ready(); return { source, target, disk, locks, key };
}
void test('100 inputs do not read, capture, stringify, or write before one lazy flush', async () => {
  const f = await fixture().ready(); let captures = 0; const before = f.serializes();
  for (let index = 0; index < 100; index++) f.store.schedule(() => { captures++; return payload('edit-' + index); });
  assert.equal(captures, 0); assert.equal(f.serializes(), before); assert.equal(f.disk.reads.length, 0); assert.equal(f.disk.writes.length, 0); assert.equal(f.timers.size, 1);
  f.tick(); assert.equal(captures, 1); assert.equal(f.serializes(), before + 1); assert.equal(f.disk.writes.length, 1); assert.equal(f.store.status().durable, true); f.store.close();
});
void test('occupied source claim never reads the other runtime payload or auto-hydrates', async () => {
  const disk = storage(), locks = lockManager(), a = fixture({ disk, locks }), b = fixture({ disk, locks }); await save(a); await b.ready(); disk.reads.length = 0;
  const inventory = b.store.discover(); assert.equal(inventory.records.length, 1); assert.equal(disk.reads.length, 0);
  assert.equal(b.store.preview(a.store.key).code, 'RECOVERY_CLAIM_REQUIRED'); assert.equal((await b.store.claim(a.store.key)).code, 'RECOVERY_IN_USE'); assert.equal(disk.reads.length, 0);
  assert.notEqual(a.store.key, b.store.key); a.store.close(); b.store.close();
});
for (const failure of ['unavailable', 'rejected']) void test(failure + ' Locks keep fresh edits but cannot read historical payload', async () => {
  const h = await historical(), locks = failure === 'unavailable' ? null : lockManager(); locks?.reject(); const f = await fixture({ disk: h.disk, locks }).ready(); h.disk.reads.length = 0;
  assert.equal(f.store.status().canRecover, false); assert(f.store.status().notice); assert.equal((await f.store.claim(h.key)).code, 'WEB_LOCKS_UNAVAILABLE'); assert.equal(f.store.preview(h.key).code, 'WEB_LOCKS_UNAVAILABLE'); assert.equal(h.disk.reads.length, 0);
  assert.equal(f.store.schedule(() => payload('new')).ok, true); assert.equal(f.store.flush().ok, true); assert.notEqual(f.store.key, h.key); assert(h.disk.data.has(h.key)); f.store.close(); h.target.store.close();
});
void test('unclaimed and legacy source keys cannot be claimed or previewed even with Locks now available', async () => {
  const disk = storage(), old = fixture({ disk, locks: null }); await save(old); old.store.close();
  const legacy = 'process-canvas-v1:' + JSON.stringify(['https://fixture.invalid', '/process/', 'a', 'g1', 'old-tab']); disk.data.set(legacy, '{"private":"legacy"}');
  const f = await fixture({ disk }).ready(); disk.reads.length = 0;
  assert.equal((await f.store.claim(old.store.key)).code, 'SOURCE_LEASE_UNAVAILABLE'); assert.equal(f.store.preview(old.store.key).code, 'SOURCE_LEASE_UNAVAILABLE'); assert.equal((await f.store.claim(legacy)).code, 'RECOVERY_KEY_INVALID');
  assert.equal(f.store.discover().records.find(row => row.key === legacy).legacy, true); assert.equal(disk.reads.length, 0); f.store.close();
});
void test('another account keys are neither listed nor read, even if caller supplies the exact key', async () => {
  const disk = storage(), a = fixture({ disk, actor: 'other' }); await save(a, 'other-secret'); a.store.close(); const b = await fixture({ disk }).ready(); disk.reads.length = 0;
  assert.equal(b.store.discover().records.length, 0); assert.equal((await b.store.claim(a.store.key)).code, 'RECOVERY_KEY_INVALID'); assert.equal(b.store.preview(a.store.key).code, 'RECOVERY_KEY_INVALID'); assert.equal(disk.reads.length, 0); b.store.close();
});
void test('explicit claim plus verified exact base restores historical epoch only into empty current buffer', async () => {
  const h = await historical(), f = h.target; assert.equal((await f.store.claim(h.key)).ok, true); assert.equal(h.disk.reads.filter(k => k === h.key).length, 2, 'claim itself adds no value read');
  const first = f.store.preview(h.key); assert.equal(first.canRestore, false); assert.equal(first.reason, 'LATEST_STATE_REQUIRED'); f.ctx.verified = true;
  const preview = f.store.preview(h.key), restored = f.store.restore(preview.token); assert.equal(restored.ok, true); assert.equal(restored.owner.epoch, 7); assert.equal(restored.payload.entries.one.value, 'draft'); assert(h.disk.data.has(h.key)); assert.equal(f.store.restore(preview.token).code, 'PREVIEW_EXPIRED'); f.store.close();
});
for (const [name, mutate, expected] of [
  ['edit revoked', f => { f.ctx.canEdit = false; }, 'EDIT_PERMISSION_REQUIRED'],
  ['view revoked', f => { f.ctx.canView = false; }, 'VIEW_PERMISSION_REQUIRED'],
  ['pending', f => { f.ctx.pending = true; }, 'SCOPE_PENDING'],
  ['unknown write', f => { f.ctx.writeState = 'unknown'; }, 'WRITE_UNRESOLVED'],
  ['base changed', f => { f.ctx.baseVersion = 'changed'; }, 'BASE_VERSION_CHANGED'],
  ['new local input', f => { f.ctx.hasLocalChanges = true; }, 'LOCAL_CHANGES_PRESENT'],
  ['local revision changed', f => { f.ctx.localRevision++; }, 'LOCAL_REVISION_CHANGED'],
  ['actor changed', f => { f.ctx.actorId = 'b'; }, 'OWNER_CHANGED'],
  ['epoch changed', f => { f.ctx.epoch++; }, 'OWNER_CHANGED'],
]) void test('restore rechecks ' + name + ' after preview', async () => {
  const h = await historical(), f = h.target; f.ctx.verified = true; await f.store.claim(h.key); const preview = f.store.preview(h.key); mutate(f);
  assert.equal(f.store.restore(preview.token).code, expected); assert(h.disk.data.has(h.key)); f.store.close();
});
void test('record replacement after preview prevents restore and targeted discard', async () => {
  const h = await historical(), f = h.target; f.ctx.verified = true; await f.store.claim(h.key); const p = f.store.preview(h.key); const changed = JSON.parse(h.disk.data.get(h.key)); changed.payload.entries.one.value = 'new'; h.disk.data.set(h.key, JSON.stringify(changed));
  assert.equal(f.store.restore(p.token).code, 'RECORD_CHANGED'); assert.equal(f.store.discard(p.token).code, 'RECORD_CHANGED'); assert.equal(h.disk.deletes.length, 0); f.store.close();
});
void test('targeted discard requires only view and idle, preserves current and unrelated keys', async () => {
  const h = await historical(), f = h.target; await save(f, 'current'); const ownRaw = h.disk.data.get(f.store.key); h.disk.data.set('unrelated', 'keep'); await f.store.claim(h.key); const p = f.store.preview(h.key);
  f.ctx.canEdit = false; f.ctx.pending = true; f.ctx.baseVersion = 'new'; assert.equal(f.store.discard(p.token).ok, true); assert(!h.disk.data.has(h.key)); assert.equal(h.disk.data.get(f.store.key), ownRaw); assert.equal(h.disk.data.get('unrelated'), 'keep'); f.store.close();
});
void test('quota preserves old durable bytes and latest RAM; old disk discard cannot erase newer RAM', async () => {
  const f = await fixture().ready(); await save(f, 'old'); const old = f.disk.data.get(f.store.key); f.ctx.localRevision++; f.disk.quota(); f.store.schedule(() => payload('new')); assert.equal(f.store.flush().code, 'STORAGE_WRITE_FAILED'); assert.equal(f.disk.data.get(f.store.key), old);
  const disk = f.store.preview(f.store.key), ram = f.store.preview(f.store.key, 'memory'); assert.equal(disk.payload.entries.one.value, 'old'); assert.equal(ram.payload.entries.one.value, 'new'); assert.equal(f.store.discard(disk.token).ok, true); assert.equal(f.store.preview(f.store.key, 'memory').payload.entries.one.value, 'new'); f.store.close();
});
void test('RAM-only discard preserves durable source and own queued reader is cancelled explicitly', async () => {
  const f = await fixture().ready(); await save(f, 'old'); const old = f.disk.data.get(f.store.key); f.disk.quota(); f.store.schedule(() => payload('new')); f.store.flush(); const p = f.store.preview(f.store.key, 'memory');
  const discarded = f.store.discard(p.token); assert.equal(discarded.durableRecordPreserved, true); assert.equal(f.disk.data.get(f.store.key), old); f.store.schedule(() => payload('not saved')); f.store.cancelScheduled(); f.tick(); assert.equal(f.disk.data.get(f.store.key), old); f.store.close();
});
for (const corrupt of ['{bad', '{"version":99}', 'null']) void test('corrupt/schema record stays in storage and is never silently replaced: ' + corrupt, async () => {
  const h = await historical(), f = h.target; h.disk.data.set(h.key, corrupt); await f.store.claim(h.key); const p = f.store.preview(h.key); assert.equal(p.ok, false); assert.equal(h.disk.data.get(h.key), corrupt); assert.equal(h.disk.deletes.length, 0); f.store.close();
});
void test('own durable record externally replaced fails writes closed and retains RAM', async () => {
  const f = await fixture().ready(); await save(f); f.disk.data.set(f.store.key, '{bad'); f.store.schedule(() => payload('next')); assert.equal(f.store.flush().code, 'RECORD_CHANGED'); assert.equal(f.disk.data.get(f.store.key), '{bad'); assert.equal(f.store.preview(f.store.key, 'memory').payload.entries.one.value, 'next'); f.store.close();
});
for (const change of ['actor', 'epoch', 'base', 'view']) void test('late debounce does not read payload or write after ' + change + ' changes', async () => {
  const f = await fixture().ready(); let captured = 0; f.store.schedule(() => { captured++; return payload('late'); });
  if (change === 'actor') f.ctx.actorId = 'b'; if (change === 'epoch') f.ctx.epoch++; if (change === 'base') f.ctx.baseVersion = 'g2'; if (change === 'view') f.ctx.canView = false;
  f.tick(); assert.equal(captured, 0); assert.equal(f.disk.writes.length, 0); f.store.close();
});
void test('delayed claim callback after owner change releases lock without a source read', async () => {
  const h = await historical(), f = h.target; h.disk.reads.length = 0; h.locks.pause(); const claim = f.store.claim(h.key); await Promise.resolve(); f.ctx.epoch++; h.locks.resume(); const r = await claim; assert.equal(r.ok, false); assert.equal(h.disk.reads.length, 0); f.store.close();
});
void test('pagehide flushes last window and invalidates claim before unlock; BFCache must reacquire', async () => {
  const h = await historical(), f = h.target; await f.store.claim(h.key); f.ctx.verified = true; const p = f.store.preview(h.key); f.store.schedule(() => payload('last')); f.emit('pagehide'); assert.equal(f.disk.data.has(f.store.key), true); assert.equal(f.store.restore(p.token).code, 'PREVIEW_EXPIRED'); assert.equal(f.store.status().ready, false);
  f.emit('pageshow', { persisted: true }); await f.store.ready; assert.equal(f.store.status().ready, true); assert.equal(f.store.preview(h.key).code, 'RECOVERY_CLAIM_REQUIRED'); f.store.close();
});
void test('JSON rejects cycles, accessors, nonplain and pending commands without losing previous bytes', async () => {
  const f = await fixture().ready(); await save(f); const old = f.disk.data.get(f.store.key);
  const cycle = payload('cycle'); cycle.entries.loop = cycle;
  const accessor = payload('accessor'); Object.defineProperty(accessor.entries, 'secret', { enumerable: true, get() { throw Error('GETTER_EXECUTED'); } });
  const pending = payload('pending'); pending.pending = { command: { headers: 'secret', body: 'secret' } };
  for (const value of [cycle, accessor, pending, { ...payload('date'), forms: { date: new Date() } }]) { f.store.schedule(() => value); assert.equal(f.store.flush().ok, false); assert.equal(f.disk.data.get(f.store.key), old); }
  f.store.close();
});
void test('actual Journal producer optional undefined fields and multi-MiB raw media are preserved', async () => {
  const sandbox = { structuredClone }; vm.runInNewContext(journalSource, sandbox); const content = { workspaces: [{ id: 'w', stages: { S: [{ id: 'one', stageCode: 'S', x: 0, nextIds: [] }] } }] };
  const j = new sandbox.CanvasJournal(content); j.edit('w', 'S', [{ id: 'one', f: 'name', value: 'new optional name' }]);
  const media = 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024); j.forms['["w","S","one"]'] = { original: { id: 'one', stageCode: 'S' }, draft: { id: 'one', stageCode: 'S', media }, isNew: false };
  const f = await fixture().ready(); const before = f.serializes(), start = performance.now(); for (let i = 0; i < 100; i++) f.store.schedule(() => j.record()); assert.equal(f.serializes(), before); assert.equal(f.disk.writes.length, 0); assert(performance.now() - start < 1000, 'no perinput payload walk');
  assert.equal(f.store.flush().ok, true); const preview = f.store.preview(f.store.key); assert.equal(preview.payload.forms['["w","S","one"]'].draft.media, media); assert.equal(Object.hasOwn(Object.values(preview.payload.entries)[0], 'base'), false); assert.doesNotThrow(() => new sandbox.CanvasJournal(content, preview.payload)); f.store.close();
});
void test('inventory is bounded, honest, and only reads keys even for large origin storage', async () => {
  const f = await fixture().ready(); for (let i = 0; i < 1100; i++) f.disk.data.set('unrelated-' + i, 'large'.repeat(100)); const d = f.store.discover(); assert.equal(d.code, 'SCAN_LIMIT'); assert.equal(d.incomplete, true); assert.equal(f.disk.reads.length, 0); f.store.close();
});
void test('observer receives metadata only; exceptions and reentrant schedules do not drop next input', async () => {
  let next = false; const observed = []; const f = await fixture({ onStatus(metadata) { observed.push(metadata); if (metadata.code === 'OK' && f && !next) { next = true; f.store.schedule(() => payload('next')); } throw Error('observer'); } }).ready();
  f.store.schedule(() => payload('first')); assert.equal(f.store.flush().ok, true); assert.equal(f.timers.size, 1); f.tick(); assert.equal(f.store.preview(f.store.key).payload.entries.one.value, 'next'); assert(observed.every(m => !('payload' in m) && !JSON.stringify(m).includes('first'))); f.store.close();
});
void test('capture callbacks changing write state cannot persist an editable local snapshot', async () => {
  const f = await fixture().ready(); f.store.schedule(() => { f.ctx.writeState = 'unknown'; return payload('must not save'); }); assert.equal(f.store.flush().ok, false); assert.equal(f.disk.writes.length, 0); f.store.close();
});
void test('storage read reentrancy changing owner cannot write the old runtime afterward', async () => {
  const disk = storage(), original = disk.getItem.bind(disk); const f = await fixture({ disk }).ready(); disk.getItem = key => { const value = original(key); f.ctx.epoch++; return value; };
  f.store.schedule(() => payload('not written')); assert.equal(f.store.flush().code, 'OWNER_CHANGED'); assert.equal(disk.writes.length, 0); f.store.close();
});
void test('reader exceptions never leak arbitrary raw error text through metadata', async () => {
  const statuses = [], f = await fixture({ onStatus: value => statuses.push(value) }).ready(); f.store.schedule(() => { throw Error('Bearer secret-content'); }); const r = f.store.flush(); assert.equal(r.code, 'SNAPSHOT_CAPTURE_FAILED'); assert(!JSON.stringify([r, statuses]).includes('secret-content')); f.store.close();
});
void test('read failure is distinct from quota, and unconfirmed successful writes can be verified without a duplicate write', async () => {
  const f = await fixture().ready(); f.disk.denied(); f.store.schedule(() => payload('retained')); assert.equal(f.store.flush().code, 'STORAGE_READ_FAILED'); f.disk.denied(false);
  const original = f.disk.setItem.bind(f.disk); f.disk.setItem = (key, value) => { original(key, value); f.disk.denied(); };
  assert.equal(f.store.flush().code, 'STORAGE_VERIFY_FAILED'); assert.equal(f.store.status().durable, false); assert.equal(f.disk.writes.length, 1);
  f.disk.denied(false); assert.equal(f.store.flush().ok, true); assert.equal(f.disk.writes.length, 1); assert.equal(f.store.status().durable, true); f.store.close();
});
void test('nested newer flush cannot be overwritten by the older capture afterward', async () => {
  const f = await fixture().ready(); f.store.schedule(() => { f.store.schedule(() => payload('newer')); assert.equal(f.store.flush().ok, true); return payload('older'); });
  assert.equal(f.store.flush().code, 'SUPERSEDED'); assert.equal(f.store.preview(f.store.key).payload.entries.one.value, 'newer'); assert.equal(f.disk.writes.length, 1); f.store.close();
});
void test('future unknown envelopes are never exposed as editable local content', async () => {
  const h = await historical(), record = JSON.parse(h.disk.data.get(h.key)); record.kind = 'unknown'; record.payload = { command: 'private should not appear' }; h.disk.data.set(h.key, JSON.stringify(record)); await h.target.store.claim(h.key);
  const p = h.target.store.preview(h.key); assert.equal(p.ok, false); assert.equal('payload' in p, false); assert(h.disk.data.has(h.key)); h.target.store.close();
});
void test('failed targeted remove verification never reports successful discard or clears retained RAM', async () => {
  const f = await fixture().ready(); await save(f); const p = f.store.preview(f.store.key); f.disk.removeItem = () => {};
  assert.equal(f.store.discard(p.token).code, 'STORAGE_VERIFY_FAILED'); assert.equal(f.store.preview(f.store.key, 'memory').payload.entries.one.value, 'draft'); assert(f.disk.data.has(f.store.key)); f.store.close();
});
const canvasPayload = (value = 5, media) => ({ version: 2, entries: { '["w","S","a","x"]': { w: 'w', s: 'S', id: 'a', f: 'x', base: 0, value } }, dependencies: {}, baselines: { '["w","S","a"]': { id: 'a', stageCode: 'S', x: 0, nextIds: [] } }, forms: media ? { '["w","T","b"]': { original: { id: 'b', stageCode: 'T' }, draft: { id: 'b', stageCode: 'T', media }, isNew: false } } : {}, pending: null });
function writeInput(readPayload = () => canvasPayload()) {
  const reference = { operationId: webcrypto.randomUUID(), generation: 'g1', workspace: 'w', stage: 'S', channel: 'canvas-v2' };
  return { reference, sent: { workspace: 'w', stage: 'S', entries: canvasPayload().entries, dependencies: {} }, readPayload };
}
function commandFor(input) {
  return { operationId: input.reference.operationId, generation: input.reference.generation, action: 'apply', source: 'canvas-v2:["w","S"]', patches: [{ op: 'set', path: ['workspaces', { id: 'w' }, 'stages', 'S', { id: 'a' }, 'x'], value: 5 }], guards: [{ path: ['workspaces', { id: 'w' }, 'stages', 'S', { id: 'a' }, 'x'], value: 0 }] };
}
function evidence(input, revision = 2) {
  return { receipt: { operationId: input.reference.operationId, generation: 'g1', revision, savedId: null, caseId: null, unchanged: false }, workflow: { scope: 'process:platform', generation: 'g1', revision, saved: null } };
}
function verified(f, revision = 2) { f.ctx.verified = true; f.ctx.baseVersion = JSON.stringify(['g1', revision, null]); f.ctx.writeState = 'unknown'; }
function clearSent({ payload, sent }) { for (const [key, entry] of Object.entries(sent.entries)) { if (payload.entries[key]?.value === entry.value) delete payload.entries[key]; else if (payload.entries[key]) payload.entries[key].base = entry.value; } return payload; }
async function preparedFixture(options) {
  const f = await fixture(options).ready(), input = writeInput(); const prepared = f.store.prepareWrite(input); assert.equal(prepared.ok, true); return { ...f, input, prepared, command: commandFor(input) };
}
void test('unknown prepare durably writes isolated snapshot before receipt-only anchor, never transport objects', async () => {
  const f = await fixture().ready(), media = 'data:image/png;base64,' + 'Z'.repeat(1024 * 1024), input = writeInput(() => canvasPayload(5, media)), p = f.store.prepareWrite(input);
  assert.equal(p.ok, true); assert.equal(p.durable, true); assert.equal(f.disk.writes.length, 3); const anchor = JSON.parse(f.disk.data.get(f.store.key)); assert.equal(f.disk.writes[0], anchor.snapshotKey); assert.equal(f.disk.writes[1], f.store.key); assert.equal(anchor.kind, 'unknown'); assert(!JSON.stringify(anchor).includes(media)); assert.deepEqual(Object.keys(anchor).sort(), ['version', 'kind', 'owner', 'baseVersion', 'leaseProtocol', 'lineageId', 'reference', 'snapshotKey'].sort());
  const isolated = JSON.parse(f.disk.data.get(anchor.snapshotKey)); assert.equal(isolated.payload.forms['["w","T","b"]'].draft.media, media); assert.equal(isolated.payload.pending, null); for (const text of ['"command":', '"patches":', '"guards":', '"headers":', '"body":']) assert(!JSON.stringify(isolated).includes(text)); f.store.close();
});
void test('unknown preview, restore and discard never read isolated payload or expose input', async () => {
  const f = await preparedFixture(), anchor = JSON.parse(f.disk.data.get(f.store.key)); f.disk.reads.length = 0; const p = f.store.preview(f.store.key); assert.equal(p.kind, 'unknown'); assert.equal(p.reference.operationId, f.input.reference.operationId); assert.equal('payload' in p, false); assert.equal(p.canRestore, false); assert.equal(p.canDiscard, false); assert.equal(f.store.restore(p.token).code, 'RECEIPT_REQUIRED'); assert.equal(f.store.discard(p.token).code, 'RECEIPT_REQUIRED'); assert(!f.disk.reads.includes(anchor.snapshotKey)); f.store.close();
});
void test('pending 100 inputs lazily update only isolated snapshot; frozen sent and anchor remain unchanged', async () => {
  const f = await preparedFixture(), anchor = f.disk.data.get(f.store.key), metadata = JSON.parse(anchor), before = f.serializes(), beforeWrites = f.disk.writes.length; f.ctx.writeState = 'unknown'; let captured = 0;
  for (let i = 0; i < 100; i++) f.store.schedulePending(f.prepared.reservation, () => { captured++; return canvasPayload(6); }); assert.equal(captured, 0); assert.equal(f.serializes(), before); assert.equal(f.disk.writes.length, beforeWrites);
  f.tick(); assert.equal(captured, 1); assert.equal(f.disk.writes.length, beforeWrites + 1); assert.equal(f.disk.data.get(f.store.key), anchor); const isolated = JSON.parse(f.disk.data.get(metadata.snapshotKey)); assert.equal(isolated.sent.entries['["w","S","a","x"]'].value, 5); assert.equal(isolated.payload.entries['["w","S","a","x"]'].value, 6); f.store.close();
});
void test('snapshot quota before dispatch preserves old local record and RAM, and cancellation must be durable', async () => {
  const f = await fixture().ready(); await save(f, 'old'); const old = f.disk.data.get(f.store.key); f.disk.quota(); const input = writeInput(), p = f.store.prepareWrite(input); assert.equal(p.ok, false); assert(p.reservation); assert.equal(p.durable, false); assert.equal(f.disk.data.get(f.store.key), old); let sends = 0;
  await assert.rejects(f.store.dispatchPrepared(p.reservation, commandFor(input), async () => { sends++; }), /RECORD_CHANGED|DURABLE|STORAGE/); assert.equal(sends, 0); assert.equal(f.store.cancelPrepared(p.reservation).ok, false); assert.equal(f.store.status().unknown, true);
  f.disk.quota(false); assert.equal(f.store.cancelPrepared(p.reservation).ok, true); assert.equal(f.store.status().unknown, false); assert.equal(f.store.preview(f.store.key).payload.entries['["w","S","a","x"]'].value, 5); f.store.close();
});
void test('anchor verification failure cannot dispatch; explicit not-dispatched cancellation restores local only after verify', async () => {
  const f = await fixture().ready(), original = f.disk.setItem.bind(f.disk); f.disk.setItem = (key, value) => { original(key, value); if (key === f.store.key) f.disk.denied(); };
  const input = writeInput(), p = f.store.prepareWrite(input); assert.equal(p.ok, false); assert(p.reservation); assert.equal(p.durable, false); f.disk.denied(false); let posts = 0;
  await assert.rejects(f.store.dispatchPrepared(p.reservation, commandFor(input), async () => { posts++; }), /DURABLE/); assert.equal(posts, 0); f.disk.setItem = original; assert.equal(f.store.cancelPrepared(p.reservation).ok, true); assert.equal(f.store.preview(f.store.key).kind, 'local'); f.store.close();
});
void test('dispatch invokes one sender once; ordinary repeated Apply cannot rePOST or cancel dispatched reservation', async () => {
  const f = await preparedFixture(); let sends = 0; const out = await f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { sends++; return { receipt: 'response' }; }); assert.equal(out.receipt, 'response'); assert.equal(sends, 1);
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { sends++; }), /MISMATCH/); assert.equal(sends, 1); assert.equal(f.store.cancelPrepared(f.prepared.reservation).code, 'ALREADY_DISPATCHED'); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
for (const code of [400, 401, 403, 404, 409, 422, 500, 503]) void test('unproven status ' + code + ' remains unknown with no resend', async () => {
  const f = await preparedFixture(), error = Object.assign(Error('server failure'), { status: code }); let posts = 0; await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { posts++; throw error; }), value => value === error);
  assert.equal(posts, 1); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
for (const type of ['notSent', 'guard']) void test('trusted exact ' + type + ' rejection returns latest queued input to durable local, not a sent command', async () => {
  const f = await preparedFixture(), error = type === 'notSent' ? Object.assign(Error('not dispatched'), { notSent: true }) : Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status: 409, requestId: webcrypto.randomUUID(), details: { path: f.command.guards[0].path } });
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { f.ctx.localRevision++; f.store.schedulePending(f.prepared.reservation, () => canvasPayload(9)); throw error; }), value => value === error);
  assert.equal(f.store.wasRejected(f.prepared.reservation, error), true); assert.equal(f.store.wasRejected(f.prepared.reservation, new Error(error.message)), false); assert.equal(f.store.preview(f.store.key).payload.entries['["w","S","a","x"]'].value, 9); assert.equal(f.store.status().unknown, false); f.store.close();
});
for (const variant of ['missing requestId', 'wrong requestId', 'wrong path', 'missing guards', 'wrong message', 'late actor', 'late epoch', 'runtime closed']) void test('rejection classifier negative: ' + variant, async () => {
  const f = await preparedFixture(), error = Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status: 409, requestId: webcrypto.randomUUID(), details: { path: f.command.guards[0].path } });
  if (variant === 'missing requestId') delete error.requestId; if (variant === 'wrong requestId') error.requestId = 'not-a-uuid'; if (variant === 'wrong path') error.details.path = ['wrong']; if (variant === 'missing guards') f.command.guards = []; if (variant === 'wrong message') error.message = 'generic conflict';
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { if (variant === 'late actor') f.ctx.actorId = 'b'; if (variant === 'late epoch') f.ctx.epoch++; if (variant === 'runtime closed') f.store.close(); throw error; }), value => value === error);
  assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); assert.equal(JSON.parse(f.disk.data.get(f.store.key)).kind, 'unknown'); f.store.close();
});
for (const field of ['operationId', 'generation', 'source', 'action']) void test('mismatched dispatch ' + field + ' never invokes sender or changes marker', async () => {
  const f = await preparedFixture(), raw = f.disk.data.get(f.store.key); f.command[field] = 'wrong'; let calls = 0; await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { calls++; }), /MISMATCH/); assert.equal(calls, 0); assert.equal(f.disk.data.get(f.store.key), raw); f.store.close();
});
void test('a foreign or stale reservation cannot dispatch or establish rejection evidence', async () => {
  const f = await preparedFixture(), other = await preparedFixture(); let calls = 0; await assert.rejects(other.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { calls++; }), /PREPARATION_CHANGED/); assert.equal(calls, 0); assert.equal(other.store.wasRejected(f.prepared.reservation, Error('x')), false); f.store.close(); other.store.close();
});
void test('proven rejection with quota cannot clear unknown or report wasRejected', async () => {
  const f = await preparedFixture(), error = Object.assign(Error('not sent'), { notSent: true }); await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { f.disk.quota(); throw error; }), value => value === error); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); assert.equal(f.store.status().unknown, true); f.store.close();
});
void test('terminal receipt plus exact readback settles queued newest payload and preserves next batch and other forms', async () => {
  const f = await preparedFixture(); await f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => ({})); f.ctx.localRevision++; f.store.schedulePending(f.prepared.reservation, () => canvasPayload(8, 'data:image/png;base64,unchanged-media'));
  verified(f); const p = f.store.preview(f.store.key), settled = f.store.settleReceipt(p.token, evidence(f.input), clearSent); assert.equal(settled.ok, true); assert.equal(settled.payload.entries['["w","S","a","x"]'].value, 8); assert.equal(settled.payload.entries['["w","S","a","x"]'].base, 5); assert.equal(settled.payload.forms['["w","T","b"]'].draft.media, 'data:image/png;base64,unchanged-media'); assert.equal(f.disk.data.size, 2); assert.equal(f.store.preview(f.store.key).kind, 'local'); assert.equal(f.store.status().unknown, false); f.store.close();
});
void test('historical unknown only reads isolated snapshot after trusted receipt and never changes current local snapshot', async () => {
  const f = await preparedFixture(), disk = f.disk, locks = f.locks, sourceKey = f.store.key, ref = f.input; await f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => ({})); f.store.close(); await Promise.resolve();
  const target = await fixture({ disk, locks, epoch: 2 }).ready(); await save(target, 'current input'); const currentRaw = disk.data.get(target.store.key); await target.store.claim(sourceKey); disk.reads.length = 0; const p = target.store.preview(sourceKey); assert.equal(disk.reads.filter(k => k === sourceKey).length, 1); assert.equal(disk.reads.some(k => k.includes('#isolated:')), false); assert.equal(p.kind, 'unknown'); verified(target);
  const settled = target.store.settleReceipt(p.token, evidence(ref), clearSent); assert.equal(settled.ok, true); assert.equal(disk.data.get(target.store.key), currentRaw); assert.equal(JSON.parse(disk.data.get(sourceKey)).kind, 'local'); assert.equal(settled.payload.entries['["w","S","a","x"]'], undefined); target.store.close();
});
for (const variant of ['missing savedId', 'wrong operation', 'wrong generation', 'bad revision', 'nonterminal', 'wrong scope', 'older workflow', 'unverified', 'newer current base', 'pending write']) void test('receipt settlement negative: ' + variant, async () => {
  const f = await preparedFixture(); verified(f); const p = f.store.preview(f.store.key), e = evidence(f.input), raw = f.disk.data.get(f.store.key); let calls = 0;
  if (variant === 'missing savedId') delete e.receipt.savedId; if (variant === 'wrong operation') e.receipt.operationId = webcrypto.randomUUID(); if (variant === 'wrong generation') e.receipt.generation = 'g2'; if (variant === 'bad revision') e.receipt.revision = -1; if (variant === 'nonterminal') delete e.receipt.unchanged; if (variant === 'wrong scope') e.workflow.scope = 'another'; if (variant === 'older workflow') e.workflow.revision = 1; if (variant === 'unverified') f.ctx.verified = false; if (variant === 'newer current base') f.ctx.baseVersion = '["g1",10,null]'; if (variant === 'pending write') f.ctx.writeState = 'pending';
  const out = f.store.settleReceipt(p.token, e, input => { calls++; return clearSent(input); }); assert.equal(out.ok, false); assert.equal(calls, 0); assert.equal(f.disk.data.get(f.store.key), raw); f.store.close();
});
for (const variant of ['missing', 'malformed', 'wrong reference', 'wrong owner', 'wrong sent scope']) void test('isolated snapshot ' + variant + ' cannot be guessed into editable recovery', async () => {
  const f = await preparedFixture(), anchor = JSON.parse(f.disk.data.get(f.store.key)), record = JSON.parse(f.disk.data.get(anchor.snapshotKey)); f.store.close(); await Promise.resolve(); const target = await fixture({ disk: f.disk, locks: f.locks }).ready(); await target.store.claim(f.store.key); verified(target);
  if (variant === 'missing') f.disk.data.delete(anchor.snapshotKey); else if (variant === 'malformed') f.disk.data.set(anchor.snapshotKey, '{'); else { if (variant === 'wrong reference') record.reference.operationId = webcrypto.randomUUID(); if (variant === 'wrong owner') record.owner.actorId = 'b'; if (variant === 'wrong sent scope') record.sent.stage = 'T'; f.disk.data.set(anchor.snapshotKey, JSON.stringify(record)); }
  const p = target.store.preview(f.store.key); let calls = 0; assert.equal(target.store.settleReceipt(p.token, evidence(f.input), input => { calls++; return clearSent(input); }).ok, false); assert.equal(calls, 0); assert.equal(JSON.parse(f.disk.data.get(f.store.key)).kind, 'unknown'); target.store.close();
});
for (const variant of ['throw', 'owner change', 'local change', 'record changed']) void test('reconcile ' + variant + ' cannot clear marker', async () => {
  const f = await preparedFixture(); verified(f); const p = f.store.preview(f.store.key), raw = f.disk.data.get(f.store.key);
  const settled = f.store.settleReceipt(p.token, evidence(f.input), input => { if (variant === 'throw') throw Error('secret payload'); if (variant === 'owner change') f.ctx.epoch++; if (variant === 'local change') f.ctx.localRevision++; if (variant === 'record changed') f.disk.data.set(f.store.key, raw + ' '); return clearSent(input); });
  assert.equal(settled.ok, false); assert.equal(JSON.parse(f.disk.data.get(f.store.key)).kind, 'unknown'); assert(!JSON.stringify(settled).includes('secret payload')); f.store.close();
});
void test('settlement quota preserves receipt marker and isolated bytes; cleanup failure is separate after committed local outcome', async () => {
  const f = await preparedFixture(); verified(f); const p = f.store.preview(f.store.key), anchor = f.disk.data.get(f.store.key), isolatedKey = JSON.parse(anchor).snapshotKey; f.disk.quota(); assert.equal(f.store.settleReceipt(p.token, evidence(f.input), clearSent).ok, false); assert.equal(f.disk.data.get(f.store.key), anchor); assert(f.disk.data.has(isolatedKey));
  f.disk.quota(false); f.disk.removeItem = () => { throw Error('remove failed'); }; const settled = f.store.settleReceipt(p.token, evidence(f.input), clearSent); assert.equal(settled.ok, true); assert.equal(settled.cleanupPending, true); assert.equal(f.store.preview(f.store.key).kind, 'local'); assert(f.disk.data.has(isolatedKey)); f.store.close();
});
void test('pagehide invalidates unknown reservations and flushes latest isolated payload before releasing runtime', async () => {
  const f = await preparedFixture(); f.store.schedulePending(f.prepared.reservation, () => canvasPayload(7)); f.emit('pagehide'); const anchor = JSON.parse(f.disk.data.get(f.store.key)); assert.equal(JSON.parse(f.disk.data.get(anchor.snapshotKey)).payload.entries['["w","S","a","x"]'].value, 7); f.emit('pageshow', { persisted: true }); await f.store.ready;
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { throw Error('MUST_NOT_DISPATCH'); }), /PREPARATION_CHANGED/); assert.equal(f.store.wasRejected(f.prepared.reservation, Error('old')), false); f.store.close();
});
void test('same-runtime BFCache resumes snapshot preservation and explicit receipt settlement, never old dispatch/cancel authority', async () => {
  const f = await preparedFixture(), oldEpoch = f.store.status().runtimeEpoch; await f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => ({})); f.emit('pagehide'); f.emit('pageshow', { persisted: true }); await f.store.ready;
  assert.notEqual(f.store.status().runtimeEpoch, oldEpoch); let posts = 0; await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { posts++; }), /PREPARATION_CHANGED/); assert.equal(posts, 0); assert.equal(f.store.cancelPrepared(f.prepared.reservation).code, 'PREPARATION_CHANGED'); assert.equal(f.store.wasRejected(f.prepared.reservation, Error('old')), false);
  f.ctx.localRevision++; assert.equal(f.store.schedulePending(f.prepared.reservation, () => canvasPayload(12)).ok, true); assert.equal(f.store.flushPending(f.prepared.reservation).ok, true); verified(f); const selected = f.store.preview(f.store.key), settled = f.store.settleReceipt(selected.token, evidence(f.input), clearSent); assert.equal(settled.ok, true); assert.equal(settled.payload.entries['["w","S","a","x"]'].value, 12); assert.equal(settled.payload.entries['["w","S","a","x"]'].base, 5); f.store.close();
});
for (const change of ['actor', 'epoch']) void test('BFCache snapshot resume rejects changed ' + change, async () => {
  const f = await preparedFixture(); f.emit('pagehide'); if (change === 'actor') f.ctx.actorId = 'other'; else f.ctx.epoch++; f.emit('pageshow', { persisted: true }); await f.store.ready; const writes = f.disk.writes.length;
  assert.equal(f.store.schedulePending(f.prepared.reservation, () => canvasPayload(20)).code, 'OWNER_CHANGED'); assert.equal(f.store.flushPending(f.prepared.reservation).code, 'OWNER_CHANGED'); assert.equal(f.disk.writes.length, writes); f.store.close();
});
void test('late sender success after pagehide and reacquire still rejects original lifecycle', async () => {
  const f = await preparedFixture(); let done; const sent = f.store.dispatchPrepared(f.prepared.reservation, f.command, () => new Promise(resolve => { done = resolve; })); f.emit('pagehide'); f.emit('pageshow', { persisted: true }); await f.store.ready; done({ receipt: 'late' }); await assert.rejects(sent, /PREPARATION_CHANGED/); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
void test('new preparation invalidates prior exact rejection evidence', async () => {
  const f = await preparedFixture(), error = Object.assign(Error('trusted unsent'), { notSent: true }); await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { throw error; })); assert.equal(f.store.wasRejected(f.prepared.reservation, error), true);
  const next = f.store.prepareWrite(writeInput()); assert.equal(next.ok, true); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); f.store.close();
});
void test('nested pending flush cannot overwrite newer isolated snapshot', async () => {
  const f = await preparedFixture(); f.store.schedulePending(f.prepared.reservation, () => { f.store.schedulePending(f.prepared.reservation, () => canvasPayload(30)); assert.equal(f.store.flushPending(f.prepared.reservation).ok, true); return canvasPayload(20); }); assert.equal(f.store.flushPending(f.prepared.reservation).code, 'SUPERSEDED');
  const anchor = JSON.parse(f.disk.data.get(f.store.key)); assert.equal(JSON.parse(f.disk.data.get(anchor.snapshotKey)).payload.entries['["w","S","a","x"]'].value, 30); f.store.close();
});
void test('explicit retry of exact proven rejection after quota clears only to local without a POST', async () => {
  const f = await preparedFixture(), error = Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status: 409, requestId: webcrypto.randomUUID(), details: { path: f.command.guards[0].path } }); let sends = 0;
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { sends++; f.disk.quota(); throw error; }), value => value === error); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); assert.equal(f.store.retryRejected(f.prepared.reservation, error).ok, false);
  f.ctx.localRevision++; f.store.schedulePending(f.prepared.reservation, () => canvasPayload(15)); f.disk.quota(false); const restored = f.store.retryRejected(f.prepared.reservation, error); assert.equal(restored.ok, true); assert.equal(f.store.wasRejected(f.prepared.reservation, error), true); assert.equal(f.store.preview(f.store.key).kind, 'local'); assert.equal(f.store.preview(f.store.key).payload.entries['["w","S","a","x"]'].value, 15); assert.equal(sends, 1); f.store.close();
});
for (const variant of ['wrong error', 'actor', 'epoch', 'lifecycle', 'real unknown']) void test('rejected quota retry negative: ' + variant, async () => {
  const f = await preparedFixture(), error = variant === 'real unknown' ? Object.assign(Error('proxy error'), { status: 409 }) : Object.assign(Error('trusted notSent'), { notSent: true });
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { f.disk.quota(); throw error; })); f.disk.quota(false); const original = f.disk.data.get(f.store.key);
  if (variant === 'actor') f.ctx.actorId = 'other'; if (variant === 'epoch') f.ctx.epoch++; if (variant === 'lifecycle') { f.emit('pagehide'); f.emit('pageshow', { persisted: true }); await f.store.ready; }
  const out = f.store.retryRejected(f.prepared.reservation, variant === 'wrong error' ? Object.assign(Error('trusted notSent'), { notSent: true }) : error); assert.equal(out.ok, false); assert.equal(f.disk.data.get(f.store.key), original); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); f.store.close();
});
void test('status uses constant-time durability flags, including large quota-failed pending snapshots', async () => {
  const statusSource = source.slice(source.indexOf('    function status()'), source.indexOf('    function publish(')); assert.doesNotMatch(statusSource, /memory\s*===|snapshotRaw\s*===|\.length|JSON\.|copyJSON/);
  const f = await preparedFixture(); const media = 'data:image/png;base64,' + 'M'.repeat(4 * 1024 * 1024); f.store.schedulePending(f.prepared.reservation, () => canvasPayload(6, media)); f.disk.quota(); assert.equal(f.store.flushPending(f.prepared.reservation).ok, false); assert.equal(f.store.status().snapshotDurable, false); assert.equal(f.store.status().durable, false);
  const before = f.serializes(), reads = f.disk.reads.length, start = performance.now(); for (let i = 0; i < 1000; i++) assert.equal(f.store.status().durable, false); assert.equal(f.serializes(), before); assert.equal(f.disk.reads.length, reads); assert(performance.now() - start < 1000);
  f.disk.quota(false); assert.equal(f.store.flushPending(f.prepared.reservation).ok, true); assert.equal(f.store.status().durable, true); f.store.close();
});
void test('unknown source reference must agree with its pinned base generation', async () => {
  const f = await preparedFixture(), anchor = JSON.parse(f.disk.data.get(f.store.key)); anchor.baseVersion = '["different-generation",1,null]'; f.disk.data.set(f.store.key, JSON.stringify(anchor)); assert.equal(f.store.preview(f.store.key).code, 'INVALID_RECORD_SCHEMA'); f.store.close();
});
void test('even a terminal no-op cannot settle authoritative state older than the original source base', async () => {
  const f = await preparedFixture(), e = evidence(f.input, 0); e.receipt.unchanged = true; verified(f, 0); const p = f.store.preview(f.store.key); assert.equal(f.store.settleReceipt(p.token, e, clearSent).code, 'TERMINAL_RECEIPT_REQUIRED'); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
void test('legal no-op revision zero remains supported when source base itself is zero', async () => {
  const f = await preparedFixture({ base: '["g1",0,null]' }), e = evidence(f.input, 0); e.receipt.unchanged = true; verified(f, 0); const p = f.store.preview(f.store.key); assert.equal(f.store.settleReceipt(p.token, e, clearSent).ok, true); f.store.close();
});
void test('non-string requestId cannot gain rejection proof through implicit UUID coercion', async () => {
  const f = await preparedFixture(), error = Object.assign(Error('DEPENDENCY_CHANGED_RECONFIRM'), { status: 409, requestId: { toString: () => webcrypto.randomUUID() }, details: { path: f.command.guards[0].path } });
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async () => { throw error; }), value => value === error); assert.equal(f.store.wasRejected(f.prepared.reservation, error), false); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
void test('malformed runtime key identifier fails closed without invoking coercion', async () => {
  const f = await fixture().ready(), key = 'process-canvas-recovery-v3:' + JSON.stringify(['https://fixture.invalid', '/process/', 'a', 1, 'web-lock-v1', { toString: null }]);
  assert.equal((await f.store.claim(key)).code, 'RECOVERY_KEY_INVALID'); assert.equal(f.store.preview(key).code, 'RECOVERY_KEY_INVALID'); assert.equal(f.disk.reads.length, 0); f.store.close();
});
function registryEntry(f) { return [...f.disk.data.entries()].find(([key]) => key.startsWith('process-canvas-lineage-registry-v1:')); }
function successor(f, handoff, base = f.ctx.baseVersion) {
  const ctx = { ...f.ctx, baseVersion: base, writeState: 'idle', hasLocalChanges: false, verified: true, pending: false, localRevision: 0 };
  const store = f.factory.create({ getContext: () => ctx, ...(handoff ? { handoff } : {}) });
  return { ...f, store, ctx, async ready() { await store.ready; return this; } };
}
void test('opaque restore handoff transfers lineage lease across donor close and prevents ancestor replay after unknown', async () => {
  const a = await fixture().ready(); await save(a); const keyA = a.store.key, lineage = a.store.status().lineageId; a.store.close(); await Promise.resolve();
  const b = await fixture({ disk: a.disk, locks: a.locks }).ready(); b.ctx.verified = true; assert.equal((await b.store.claim(keyA)).ok, true);
  const restored = b.store.restore(b.store.preview(keyA).token); assert.equal(restored.ok, true); b.store.close();
  const next = successor(b, restored.handoff); await next.ready(); assert.equal(next.store.status().ready, true); assert.equal(next.store.status().lineageId, lineage);
  await save(next); const input = writeInput(), p = next.store.prepareWrite(input); assert.equal(p.ok, true); let posts = 0;
  await assert.rejects(next.store.dispatchPrepared(p.reservation, commandFor(input), async () => { posts++; throw Error('lost ACK'); }), /lost ACK/);
  const c = await fixture({ disk: a.disk, locks: a.locks }).ready(); a.disk.reads.length = 0; assert.equal((await c.store.claim(keyA)).code, 'RECOVERY_IN_USE'); assert.equal(a.disk.reads.includes(keyA), false);
  next.store.close(); await new Promise(resolve => setImmediate(resolve)); a.disk.reads.length = 0; assert.equal((await c.store.claim(keyA)).code, 'LINEAGE_UNRESOLVED'); assert.equal(a.disk.reads.includes(keyA), false); assert.equal(c.store.preview(keyA).code, 'LINEAGE_UNRESOLVED'); assert.equal(posts, 1);
  assert.equal((await c.store.claim(next.store.key)).ok, true); assert.equal(c.store.preview(next.store.key).kind, 'unknown'); c.store.close();
});
void test('a consumed handoff cannot create a second alias or give the donor another lineage transfer', async () => {
  const f = await fixture().ready(); await save(f); const transferred = f.store.handoff(); assert.equal(transferred.ok, true); assert.equal(f.store.status().ready, false);
  const next = successor(f, transferred.handoff); await next.ready(); assert.equal(next.store.status().ready, true);
  assert.throws(() => successor(f, transferred.handoff), /HANDOFF_INVALID/); assert.equal(f.store.handoff().ok, false); assert.equal(f.store.prepareWrite(writeInput()).code, 'RUNTIME_NOT_READY'); f.store.close(); next.store.close();
});
for (const variant of ['forged', 'actor', 'epoch', 'base', 'pagehide']) void test('handoff capability rejects ' + variant + ' without reading a payload', async () => {
  const f = await fixture().ready(); await save(f); const grant = f.store.handoff(); const ctx = { ...f.ctx }; let token = grant.handoff;
  if (variant === 'forged') token = { lineageId: f.store.status().lineageId }; if (variant === 'actor') ctx.actorId = 'other'; if (variant === 'epoch') ctx.epoch++; if (variant === 'base') ctx.baseVersion = '["g1",2,null]'; if (variant === 'pagehide') f.emit('pagehide');
  f.disk.reads.length = 0; assert.throws(() => f.factory.create({ handoff: token, getContext: () => ctx }), /HANDOFF_INVALID/); assert.equal(f.disk.reads.length, 0); f.factory.releaseHandoff(grant.handoff); f.store.close();
});
void test('unused handoff can roll back; failed successor runtime claim rolls back a live donor rather than unclaimed alias', async () => {
  const f = await fixture().ready(); const grant = f.store.handoff(); f.factory.releaseHandoff(grant.handoff); assert.equal(f.store.status().ready, true);
  const again = f.store.handoff(); f.locks.reject(); const next = successor(f, again.handoff); const ready = await next.store.ready; assert.equal(ready.ok, false); assert.equal(ready.handoffRolledBack, true); assert.equal(next.store.status().ready, false); assert.equal(f.store.status().ready, true); next.store.close(); f.store.close();
});
for (const variant of ['malformed', 'wrong lineage', 'foreign anchor']) void test('small registry ' + variant + ' refuses claim before source payload read', async () => {
  const f = await preparedFixture(), [registryKey, raw] = registryEntry(f), sourceKey = f.store.key; const record = JSON.parse(raw);
  if (variant === 'wrong lineage') record.lineageId = webcrypto.randomUUID(); if (variant === 'foreign anchor') record.anchorKey = record.anchorKey.replace('"a"', '"other"');
  f.disk.data.set(registryKey, variant === 'malformed' ? '{' : JSON.stringify(record)); f.store.close(); await Promise.resolve(); const target = await fixture({ disk: f.disk, locks: f.locks }).ready(); f.disk.reads.length = 0;
  assert.equal((await target.store.claim(sourceKey)).code, 'LINEAGE_REGISTRY_INVALID'); assert.equal(f.disk.reads.includes(sourceKey), false); target.store.close();
});
void test('an independent lineage can Sync while another lineage is unresolved and inputs never scan registry', async () => {
  const a = await preparedFixture(), b = await fixture({ disk: a.disk, locks: a.locks }).ready(); a.disk.reads.length = 0; const before = b.serializes(); for (let i = 0; i < 100; i++) b.store.schedule(() => canvasPayload(i)); assert.equal(a.disk.reads.length, 0); assert.equal(b.serializes(), before);
  const input = writeInput(), p = b.store.prepareWrite(input); assert.equal(p.ok, true); let calls = 0; await b.store.dispatchPrepared(p.reservation, commandFor(input), async () => { calls++; }); assert.equal(calls, 1); a.store.close(); b.store.close();
});
for (const [revision, unchanged] of [[1, false], [0, true], [5, false]]) void test('receipt cannot settle below source base 5 or report a non-noop at same revision: ' + revision + '/' + unchanged, async () => {
  const f = await preparedFixture({ base: '["g1",5,null]' }), e = evidence(f.input, revision); e.receipt.unchanged = unchanged; e.workflow.revision = 5; verified(f, 5);
  assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, e, clearSent).code, 'TERMINAL_RECEIPT_REQUIRED'); assert.equal(registryEntry(f)[1], JSON.stringify(JSON.parse(registryEntry(f)[1]))); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); f.store.close();
});
void test('same-base terminal no-op at base 5 is valid', async () => {
  const f = await preparedFixture({ base: '["g1",5,null]' }), e = evidence(f.input, 5); e.receipt.unchanged = true; verified(f, 5); assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, e, clearSent).ok, true); f.store.close();
});
for (const phase of ['staged', 'resolved', 'anchor', 'final']) void test('receipt quota at ' + phase + ' leaves an exact retryable disposition, not orphan-key deadlock', async () => {
  const f = await preparedFixture(); verified(f); const original = f.disk.setItem.bind(f.disk); let failed = false;
  f.disk.setItem = (key, raw) => { const record = JSON.parse(raw); if (!failed && (phase === 'staged' && key.includes('#local:') || phase === 'resolved' && record.state === 'resolved' || phase === 'anchor' && key === f.store.key && record.kind === 'local' || phase === 'final' && record.state === 'final')) { failed = true; throw Error('quota'); } original(key, raw); };
  const first = f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent); assert.equal(first.ok, false); assert.equal(f.store.status().unknown, true);
  const p = f.store.preview(f.store.key); assert.equal(p.kind, ['anchor', 'final'].includes(phase) ? 'resolved' : 'unknown'); assert.equal('payload' in p, false);
  const next = ['anchor', 'final'].includes(phase) ? f.store.finalizeDisposition(p.token) : f.store.settleReceipt(p.token, evidence(f.input), clearSent); assert.equal(next.ok, true); assert.equal(f.store.status().unknown, false); assert.equal(JSON.parse(registryEntry(f)[1]).state, 'final'); assert.equal(f.store.preview(f.store.key).kind, 'local'); f.store.close();
});
void test('durable resolved receipt with newer pending input requires fresh receipt reconciliation rather than old staged snapshot', async () => {
  const f = await preparedFixture(); verified(f); const original = f.disk.setItem.bind(f.disk); let failed = false; f.disk.setItem = (key, raw) => { if (!failed && key === f.store.key && JSON.parse(raw).kind === 'local') { failed = true; throw Error('quota'); } original(key, raw); };
  assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent).ok, false); f.ctx.localRevision++; f.store.schedulePending(f.prepared.reservation, () => canvasPayload(9));
  assert.equal(f.store.finalizeDisposition(f.store.preview(f.store.key).token).code, 'RESOLUTION_INPUT_CHANGED_RECHECK'); const next = f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent); assert.equal(next.ok, true); assert.equal(next.payload.entries['["w","S","a","x"]'].value, 9); assert.equal(next.payload.entries['["w","S","a","x"]'].base, 5); f.store.close();
});
void test('durable aborted disposition finalizes latest pending input after local anchor quota', async () => {
  const f = await preparedFixture(), original = f.disk.setItem.bind(f.disk); let failed = false; f.disk.setItem = (key, raw) => { if (!failed && key === f.store.key && JSON.parse(raw).kind === 'local') { failed = true; throw Error('quota'); } original(key, raw); };
  assert.equal(f.store.cancelPrepared(f.prepared.reservation).ok, false); assert.equal(f.store.preview(f.store.key).outcome, 'aborted'); f.ctx.localRevision++; f.store.schedulePending(f.prepared.reservation, () => canvasPayload(9));
  const done = f.store.finalizeDisposition(f.store.preview(f.store.key).token); assert.equal(done.ok, true); assert.equal(done.payload.entries['["w","S","a","x"]'].value, 9); assert.equal(f.store.status().unknown, false); f.store.close();
});
void test('verified terminal cleanup failure does not block the lineage after handoff to a new runtime', async () => {
  const f = await preparedFixture(); verified(f); f.disk.removeItem = () => { throw Error('remove failed'); }; const settled = f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent); assert.equal(settled.ok, true); assert.equal(settled.cleanupPending, true);
  const grant = f.store.handoff(); assert.equal(grant.ok, true); const next = successor(f, grant.handoff, '["g1",2,null]'); await next.ready(); f.store.close(); const p = next.store.prepareWrite(writeInput()); assert.equal(p.ok, true); assert.equal(next.store.status().lineageId, f.store.status().lineageId); next.store.close();
});
for (const variant of ['unavailable', 'request rejects']) void test('fresh-only ' + variant + ' supports one durable Sync but no lineage handoff or historical restore', async () => {
  const locks = variant === 'unavailable' ? null : lockManager(); locks?.reject(); const f = await preparedFixture({ locks }); assert.equal(f.store.status().canRecover, false); let posts = 0;
  await assert.rejects(f.store.dispatchPrepared(f.prepared.reservation, f.command, async command => { assert.equal(f.store.assertDispatch(JSON.parse(JSON.stringify(command))), true); posts++; throw Error('lost ACK'); }), /lost ACK/);
  assert.equal(posts, 1); assert.equal(f.store.assertDispatch(f.command), false); assert.equal(f.store.preview(f.store.key).kind, 'unknown'); verified(f); assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent).ok, true); assert.equal(f.store.handoff().code, 'SOURCE_LEASE_UNAVAILABLE');
  f.store.close(); const target = await fixture({ disk: f.disk }).ready(); f.disk.reads.length = 0; assert.equal((await target.store.claim(f.store.key)).code, 'SOURCE_LEASE_UNAVAILABLE'); assert.equal(f.disk.reads.includes(f.store.key), false); target.store.close();
});
for (const variant of ['quota', 'verify']) void test('no-Locks ' + variant + ' preparation failure permits zero dispatch', async () => {
  const f = await fixture({ locks: null }).ready(), input = writeInput(); if (variant === 'quota') f.disk.quota(); else { const original = f.disk.setItem.bind(f.disk); f.disk.setItem = (key, value) => { original(key, value); f.disk.denied(); }; }
  const p = f.store.prepareWrite(input); assert.equal(p.ok, false); let posts = 0; await assert.rejects(f.store.dispatchPrepared(p.reservation, commandFor(input), async () => { posts++; })); assert.equal(posts, 0); f.store.close();
});
for (const variant of ['valid clone', 'body changed', 'owner changed', 'lifecycle changed', 'registry changed', 'anchor changed', 'snapshot changed']) void test('actual transport admission exact one-use proof: ' + variant, async () => {
  const f = await preparedFixture(); let admitted; await f.store.dispatchPrepared(f.prepared.reservation, f.command, async command => {
    const candidate = JSON.parse(JSON.stringify(command)); if (variant === 'body changed') candidate.patches[0].value = 99; if (variant === 'owner changed') f.ctx.epoch++; if (variant === 'lifecycle changed') f.emit('pagehide'); if (variant === 'registry changed') f.disk.data.set(registryEntry(f)[0], '{'); if (variant === 'anchor changed') f.disk.data.set(f.store.key, '{}'); if (variant === 'snapshot changed') f.disk.data.set(JSON.parse(f.disk.data.get(f.store.key)).snapshotKey, '{}');
    admitted = f.store.assertDispatch(candidate); if (variant === 'valid clone') assert.equal(f.store.assertDispatch(candidate), false);
  }).catch(error => { assert(['OWNER_CHANGED', 'RUNTIME_SUSPENDED'].includes(error.message)); }); assert.equal(admitted, variant === 'valid clone'); f.store.close();
});
for (const phase of ['resolved', 'anchor', 'final']) void test('write succeeded but verification failed at ' + phase + ' has an explicit durable recovery path', async () => {
  const f = await preparedFixture(), originalSet = f.disk.setItem.bind(f.disk), originalGet = f.disk.getItem.bind(f.disk); let denyKey = null, failed = false;
  f.disk.setItem = (key, raw) => { originalSet(key, raw); const record = JSON.parse(raw); if (!failed && (phase === 'resolved' && record.state === 'resolved' || phase === 'anchor' && key === f.store.key && record.kind === 'local' || phase === 'final' && record.state === 'final')) { failed = true; denyKey = key; } };
  f.disk.getItem = key => { if (key === denyKey) { denyKey = null; throw Error('verify failure'); } return originalGet(key); };
  verified(f); assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent).ok, false); assert.equal(f.store.status().unknown, true);
  const p = f.store.preview(f.store.key); assert.equal(p.kind, 'resolved'); const done = f.store.finalizeDisposition(p.token); assert.equal(done.ok, true); assert.equal(f.store.status().unknown, false); assert.equal(JSON.parse(registryEntry(f)[1]).state, 'final'); f.store.close();
});
for (const outcome of ['receipt', 'aborted']) void test('reload can explicitly finish durable ' + outcome + ' disposition without remote dispatch or auto hydrate', async () => {
  const f = await preparedFixture(), original = f.disk.setItem.bind(f.disk); let failed = false;
  f.disk.setItem = (key, raw) => { if (!failed && key === f.store.key && JSON.parse(raw).kind === 'local') { failed = true; throw Error('quota'); } original(key, raw); };
  verified(f); const done = outcome === 'receipt' ? f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent) : f.store.cancelPrepared(f.prepared.reservation); assert.equal(done.ok, false);
  f.store.close(); await new Promise(resolve => setImmediate(resolve)); const target = await fixture({ disk: f.disk, locks: f.locks, epoch: 7 }).ready(); await target.store.claim(f.store.key); f.disk.reads.length = 0;
  const p = target.store.preview(f.store.key); assert.equal(p.kind, 'resolved'); assert.equal(p.outcome, outcome); assert.equal('payload' in p, false); assert.equal(f.disk.reads.some(key => key.includes('#isolated:') || key.includes('#local:')), false);
  assert.equal(target.store.restore(p.token).code, 'RECEIPT_REQUIRED'); assert.equal(target.store.discard(p.token).code, 'RECEIPT_REQUIRED'); const finalized = target.store.finalizeDisposition(p.token); assert.equal(finalized.ok, true); assert.equal(target.store.status().hasMemory, false); assert.equal(target.store.preview(f.store.key).kind, 'local'); target.store.close();
});
void test('finalization rechecks owner, exact anchor and isolated bytes before clearing receipt state', async () => {
  const f = await preparedFixture(), original = f.disk.setItem.bind(f.disk); let failed = false; f.disk.setItem = (key, raw) => { if (!failed && key === f.store.key && JSON.parse(raw).kind === 'local') { failed = true; throw Error('quota'); } original(key, raw); };
  verified(f); assert.equal(f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent).ok, false); const p = f.store.preview(f.store.key); f.ctx.epoch++;
  assert.equal(f.store.finalizeDisposition(p.token).code, 'OWNER_CHANGED'); assert.equal(JSON.parse(registryEntry(f)[1]).state, 'resolved'); f.store.close();
});
void test('ARMED registry never makes a substituted local anchor editable', async () => {
  const f = await fixture().ready(); await save(f); const local = f.disk.data.get(f.store.key), p = f.store.prepareWrite(writeInput()); assert.equal(p.ok, true); f.disk.data.set(f.store.key, local);
  assert.equal(f.store.preview(f.store.key).code, 'LINEAGE_RECORD_MISMATCH'); f.store.close();
});
void test('no-Locks BFCache fences old ACK and permits new explicit receipt query without another dispatch', async () => {
  const f = await preparedFixture({ locks: null }); let release, posts = 0; const sent = f.store.dispatchPrepared(f.prepared.reservation, f.command, () => { posts++; return new Promise(resolve => { release = resolve; }); });
  f.emit('pagehide'); f.emit('pageshow', { persisted: true }); await f.store.ready; release({}); await assert.rejects(sent, /PREPARATION_CHANGED/); assert.equal(f.store.cancelPrepared(f.prepared.reservation).code, 'PREPARATION_CHANGED');
  f.store.schedulePending(f.prepared.reservation, () => canvasPayload(8)); verified(f); const settled = f.store.settleReceipt(f.store.preview(f.store.key).token, evidence(f.input), clearSent); assert.equal(settled.ok, true); assert.equal(settled.payload.entries['["w","S","a","x"]'].value, 8); assert.equal(posts, 1); f.store.close();
});
void test('historical six-field pre-lineage v3 bytes remain unsupported and unread', async () => {
  const f = await fixture().ready(), legacy = 'process-canvas-recovery-v3:' + JSON.stringify(['https://fixture.invalid', '/process/', 'a', 1, 'web-lock-v1', webcrypto.randomUUID()]); f.disk.data.set(legacy, '{"payload":"old uncertain alias"}');
  const listed = f.store.discover().items.find(item => item.key === legacy); assert.equal(listed.legacy, true); assert.equal(listed.claimable, false); assert.equal((await f.store.claim(legacy)).code, 'RECOVERY_KEY_INVALID'); assert.equal(f.disk.reads.includes(legacy), false); assert(f.disk.data.has(legacy)); f.store.close();
});
void test('registry read changing owner cannot return source payload or successful claim', async () => {
  const h = await historical(), original = h.disk.getItem.bind(h.disk); h.disk.getItem = key => { const value = original(key); if (key.startsWith('process-canvas-lineage-registry-v1:')) h.target.ctx.epoch++; return value; };
  assert.equal((await h.target.store.claim(h.key)).code, 'OWNER_CHANGED'); assert.equal(h.target.store.preview(h.key).code, 'OWNER_CHANGED'); h.target.store.close();
});
for (const failure of ['throw', 'invalid JSON']) void test('pending capture ' + failure + ' retains exact reader for explicit retry without falsely saving old payload', async () => {
  const f = await preparedFixture(); let invalid = true, calls = 0;
  f.store.schedulePending(f.prepared.reservation, () => { calls++; if (invalid) { if (failure === 'throw') throw Error('capture failed'); const p = canvasPayload(8); p.forms.cycle = p; return p; } return canvasPayload(8); });
  assert.equal(f.store.flushPending(f.prepared.reservation).ok, false); assert.equal(f.store.status().hasPending, true); assert.equal(f.timers.size, 0); assert.equal(f.store.flushPending(f.prepared.reservation).ok, false); assert.equal(calls, 2);
  invalid = false; assert.equal(f.store.flushPending(f.prepared.reservation).ok, true); assert.equal(calls, 3); const anchor = JSON.parse(f.disk.data.get(f.store.key)); assert.equal(JSON.parse(f.disk.data.get(anchor.snapshotKey)).payload.entries['["w","S","a","x"]'].value, 8); f.store.close();
});
void test('failed old capture never replaces a newer queued reader', async () => {
  const f = await preparedFixture(); f.store.schedulePending(f.prepared.reservation, () => { f.store.schedulePending(f.prepared.reservation, () => canvasPayload(9)); throw Error('old capture'); });
  assert.equal(f.store.flushPending(f.prepared.reservation).ok, false); assert.equal(f.store.flushPending(f.prepared.reservation).ok, true); const anchor = JSON.parse(f.disk.data.get(f.store.key)); assert.equal(JSON.parse(f.disk.data.get(anchor.snapshotKey)).payload.entries['["w","S","a","x"]'].value, 9); f.store.close();
});
void test('failed old capture cannot revive a reader after pagehide invalidation', async () => {
  const f = await preparedFixture(); f.store.schedulePending(f.prepared.reservation, () => { f.emit('pagehide'); throw Error('old capture'); }); assert.equal(f.store.flushPending(f.prepared.reservation).ok, false); assert.equal(f.store.status().hasPending, false); f.store.close();
});
