/* Canvas-only local snapshots. Raw media stays local; this store has no transport. */
(function (host) {
  'use strict';
  const PREFIX = 'process-canvas-recovery-v3:';
  const LEGACY = 'process-canvas-v1:';
  const LOCK = 'process-canvas-recovery-v3-runtime:';
  const PROTOCOL = 'web-lock-v1';
  const LINEAGE_LOCK = 'process-canvas-lineage-v1:';
  const REGISTRY = 'process-canvas-lineage-registry-v1:';
  const handoffs = new WeakMap(), pendingHandoffs = new Set();
  function releaseHandle(handle) { if (!handle || handle.released) return; if (--handle.refs === 0) { handle.released = true; handle.native.release(); } }
  function releaseHandoff(token) { const grant = handoffs.get(token); if (!grant || grant.used) return; grant.used = true; pendingHandoffs.delete(token); if (grant.handle.owner === token && grant.canRollback()) grant.handle.owner = grant.donor; releaseHandle(grant.handle); }
  host.addEventListener?.('pagehide', () => { for (const token of pendingHandoffs) releaseHandoff(token); });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const short = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
  const epoch = value => short(value) || Number.isSafeInteger(value) && value >= 0;
  const result = (code, extra = {}) => ({ ok: code === 'OK' || code === 'SCHEDULED', code, ...extra });
  const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  // Strings (including existing multi-MiB data URLs) are immutable and shared.
  // Only containers are copied. No new byte/string cap or media conversion.
  function copyJSON(value) {
    let nodes = 0;
    const ancestors = new WeakSet();
    function visit(item, depth) {
      if (++nodes > 100000 || depth > 128) throw Error('SNAPSHOT_STRUCTURE_LIMIT');
      if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return item;
      if (!item || typeof item !== 'object' || ancestors.has(item)) throw Error('INVALID_SNAPSHOT_JSON');
      const array = Array.isArray(item), prototype = Object.getPrototypeOf(item), constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
      if (prototype !== null && (typeof constructor !== 'function' || constructor.prototype !== prototype || Function.prototype.toString.call(constructor) !== Function.prototype.toString.call(array ? Array : Object))) throw Error('INVALID_SNAPSHOT_JSON');
      const keys = Reflect.ownKeys(item), out = array ? [] : {};
      if (array && (item.length > 100000 || keys.length !== item.length + 1 || keys.at(-1) !== 'length')) throw Error('INVALID_SNAPSHOT_JSON');
      ancestors.add(item);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype' || array && key !== String(index) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw Error('INVALID_SNAPSHOT_JSON');
        // Journal baselines legitimately contain undefined optional fields. Match
        // existing JSON persistence: omit object fields, null array holes.
        if (descriptor.value === undefined) { if (array) out[key] = null; continue; }
        out[key] = visit(descriptor.value, depth + 1);
      }
      ancestors.delete(item);
      return out;
    }
    return visit(value, 0);
  }
  function localPayload(value) {
    if (!exactKeys(value, ['version', 'entries', 'pending', 'dependencies', 'baselines', 'forms']) || value.version !== 2 || value.pending !== null || !['entries', 'dependencies', 'baselines', 'forms'].every(key => plain(value[key]))) throw Error('INVALID_LOCAL_SNAPSHOT');
    return value;
  }
  function create(options) {
    if (typeof options?.getContext !== 'function') throw Error('CONTEXT_REQUIRED');
    const initial = options.getContext();
    if (!short(initial?.actorId) || !epoch(initial.epoch) || !short(initial.baseVersion)) throw Error('INVALID_CONTEXT');
    const origin = options.origin ?? host.location?.origin, path = options.path ?? host.location?.pathname;
    if (!short(origin) || !short(path)) throw Error('INVALID_LOCATION');
    const pinned = { actorId: initial.actorId, epoch: initial.epoch, baseVersion: initial.baseVersion };
    const storage = options.storage ?? host.localStorage, events = options.eventTarget ?? host;
    const locks = options.locks === undefined ? host.navigator?.locks : options.locks;
    const setTimer = options.setTimeout ?? host.setTimeout.bind(host), clearTimer = options.clearTimeout ?? host.clearTimeout.bind(host);
    const debounce = Math.max(50, Math.min(2000, options.debounceMs ?? 250));
    const instance = Object.freeze({});
    let runtimeId = host.crypto.randomUUID(), lineageId = runtimeId, lineageLease = null, inheritedGrant = null, protocol = typeof locks?.request === 'function' ? PROTOCOL : 'unclaimed';
    let key, active = true, closed = false, readyState = false, generation = 0, departure = 0, ownLease = null, ready;
    let queued = null, timer = null, memory = null, durableRaw = null, unconfirmedRaw = null, hasWritten = false, run = 0;
    let releaseBarrier = Promise.resolve();
    let state = result('RUNTIME_ACQUIRING'), notice = protocol === PROTOCOL ? '' : 'WEB_LOCKS_UNAVAILABLE';
    const lineageClaims = new Map();
    const claims = new Map(), tickets = new WeakMap(), preparations = new WeakMap(), rejections = new Map();
    let activePreparation = null, memoryDurable = false, lastLocalBase = pinned.baseVersion;
        function wrapLineage(handle, heldReference = false) {
      if (!heldReference) handle.refs++;
      return { handle, generation, released: false, completed: handle.native.completed, release() { releaseHandle(handle); } };
    }
    if (options.handoff !== undefined) {
      const grant = handoffs.get(options.handoff);
      if (!grant || grant.used || grant.handle.released || grant.handle.owner !== options.handoff || grant.actorId !== pinned.actorId || grant.epoch !== pinned.epoch || grant.origin !== origin || grant.path !== path || grant.baseVersion !== pinned.baseVersion || !grant.ownerCurrent()) throw Error('HANDOFF_INVALID');
      grant.used = true; pendingHandoffs.delete(options.handoff); inheritedGrant = grant;
      lineageId = grant.lineageId; protocol = PROTOCOL; grant.handle.owner = instance; lineageLease = wrapLineage(grant.handle, true);
    }
    const makeKey = () => PREFIX + JSON.stringify([origin, path, pinned.actorId, pinned.epoch, protocol, lineageId, runtimeId]);
    key = makeKey();
    function context() { try { return options.getContext(); } catch { return null; } }
    function current() {
      if (closed) return 'CLOSED';
      if (!active) return 'RUNTIME_SUSPENDED';
      const ctx = context();
      if (!ctx || ctx.actorId !== pinned.actorId || ctx.epoch !== pinned.epoch) return 'OWNER_CHANGED';
      try { if (options.current && options.current() !== true) return 'OWNER_CHANGED'; } catch { return 'OWNER_CHANGED'; }
      if (ctx.canView !== true) return 'VIEW_PERMISSION_REQUIRED';
      return '';
    }
    function live(lease) { return !!lease && !lease.released && lease.generation === generation && !current(); }
    function ownsLineage(id = lineageId) { if (protocol !== PROTOCOL) return id === lineageId; const lease = id === lineageId ? lineageLease : lineageClaims.get(id); return live(lease) && lease.handle.owner === instance && !lease.handle.released; }
    function writable() { return readyState && !current() && (protocol !== PROTOCOL || live(ownLease) && ownsLineage()); }
    function status() { return { ...state, runtimeEpoch: generation, lineageId, unknown: !!activePreparation, snapshotDurable: !activePreparation || activePreparation.snapshotRevision === activePreparation.confirmedSnapshotRevision, ready: writable(), canRecover: protocol === PROTOCOL && writable(), notice, hasPending: !!queued || !!activePreparation?.reader, hasMemory: !!memory, durable: memoryDurable && (!activePreparation || activePreparation.snapshotRevision === activePreparation.confirmedSnapshotRevision) }; }
    function publish(value) {
      state = { ok: value.ok, code: value.code };
      const metadata = status();
      if (!current() && typeof options.onStatus === 'function') try { options.onStatus(metadata); } catch { /* Observer is not authoritative. */ }
      return current() ? result(current()) : { ...value, ...metadata };
    }
    function release(lease) { if (lease && !lease.released) { lease.released = true; lease.release(); } }
    function cancelScheduled() {
      const error = current(); if (error) return result(error);
      if (timer !== null) clearTimer(timer);
      timer = null; queued = null; return result('OK');
    }
    function invalidate() {
      readyState = false; generation++; run++; rejections.clear();
      if (activePreparation && activePreparation.timer !== null) clearTimer(activePreparation.timer);
      if (activePreparation) { activePreparation.timer = null; activePreparation.reader = null; }
      const released = [...claims.values(), ...lineageClaims.values(), ownLease, lineageLease].filter(Boolean);
      for (const lease of released) release(lease);
      releaseBarrier = Promise.all(released.map(lease => lease.completed));
      claims.clear(); lineageClaims.clear(); ownLease = null; lineageLease = null;
    }
    function acquire(id, targetKey, prefix = LOCK) {
      const start = generation;
      let complete; const completed = new Promise(resolve => { complete = resolve; });
      return new Promise(resolve => {
        let answered = false;
        const answer = value => { if (!answered) { answered = true; resolve(value); } };
        try {
          Promise.resolve(locks.request(prefix + id, { mode: 'exclusive', ifAvailable: true }, async lock => {
            if (!lock) { answer(result('RECOVERY_IN_USE')); return; }
            if (start !== generation || current()) { answer(result(current() || 'RUNTIME_CHANGED')); return; }
            let finish; const held = new Promise(done => { finish = done; });
            const lease = { key: targetKey, generation: start, released: false, release: finish, completed };
            answer(result('OK', { lease })); await held;
          })).then(complete, () => { answer(result('RECOVERY_LOCK_FAILED')); complete(); });
        } catch { answer(result('RECOVERY_LOCK_FAILED')); complete(); }
      });
    }
    async function acquireLineage(id) {
      if (ownsLineage(id)) return result('OK');
      const start = generation, acquired = await acquire(id, id, LINEAGE_LOCK); if (!acquired.ok) return acquired;
      if (start !== generation || current()) { release(acquired.lease); return result(current() || 'RUNTIME_CHANGED'); }
      const handle = { native: acquired.lease, refs: 1, owner: instance, released: false };
      const wrapped = wrapLineage(handle, true);
      if (id === lineageId) lineageLease = wrapped; else lineageClaims.set(id, wrapped);
      return result('OK');
    }
    async function acquireRuntime() {
      await releaseBarrier;
      if (current()) return result(current());
      if (protocol !== PROTOCOL) { readyState = true; return publish(result('OK')); }
      const start = generation, acquired = await acquire(runtimeId, key);
      if (start !== generation || current()) { release(acquired.lease); return result(current() || 'RUNTIME_CHANGED'); }
      let failure = acquired.ok ? '' : acquired.code;
      if (acquired.ok) { ownLease = acquired.lease; const lineage = await acquireLineage(lineageId); if (!lineage.ok) failure = lineage.code; }
      if (start !== generation || current()) { release(ownLease); release(lineageLease); ownLease = null; lineageLease = null; return result(current() || 'RUNTIME_CHANGED'); }
      if (failure) {
        release(ownLease); ownLease = null;
        if (inheritedGrant) {
          const rollback = inheritedGrant.handle.owner === instance && inheritedGrant.canRollback();
          if (rollback) inheritedGrant.handle.owner = inheritedGrant.donor;
          release(lineageLease); lineageLease = null;
          return publish(result(failure, { handoffRolledBack: rollback }));
        }
        if (hasWritten || memory) return publish(result(failure));
        protocol = 'unclaimed'; runtimeId = host.crypto.randomUUID(); lineageId = runtimeId; key = makeKey(); notice = failure;
      }
      readyState = true; return publish(result('OK'));
    }
    function makeHandoff(id, baseVersion) {
      if (protocol !== PROTOCOL) return result('SOURCE_LEASE_UNAVAILABLE');
      if (!writable() || !ownsLineage(id)) return result('RECOVERY_CLAIM_REQUIRED');
      const lease = id === lineageId ? lineageLease : lineageClaims.get(id), handle = lease.handle;
      const token = Object.freeze({}), start = generation, departurePin = departure;
      const ownerCurrent = () => {
        const ctx = context();
        try { return departure === departurePin && ctx?.actorId === pinned.actorId && ctx?.epoch === pinned.epoch && ctx?.canView === true && (!options.current || options.current() === true); } catch { return false; }
      };
      const grant = { handle, lineageId: id, baseVersion, actorId: pinned.actorId, epoch: pinned.epoch, origin, path, donor: instance, used: false,
        ownerCurrent, canRollback: () => !closed && active && generation === start && ownerCurrent() && live(lease) };
      handle.refs++; handle.owner = token; handoffs.set(token, grant); pendingHandoffs.add(token);
      return result('OK', { handoff: token });
    }
    function handoff() {
      if (activePreparation) return result('RECEIPT_REQUIRED');
      return makeHandoff(lineageId, lastLocalBase);
    }
    function registryKey(id) { return REGISTRY + JSON.stringify([origin, path, pinned.actorId, id]); }
    function readRegistry(id) {
      if (!ownsLineage(id)) return result('RECOVERY_CLAIM_REQUIRED');
      const value = readRaw(registryKey(id)); if (current() || !ownsLineage(id)) return result(current() || 'RECOVERY_CLAIM_REQUIRED');
      if (!value.ok || value.raw === null) return value;
      let record;
      try { if (typeof value.raw !== 'string' || value.raw.length > 16384) throw Error(); record = JSON.parse(value.raw); } catch { return result('LINEAGE_REGISTRY_INVALID'); }
      const source = parseKey(record?.anchorKey);
      if (!exactKeys(record, ['version', 'actorId', 'lineageId', 'state', 'reference', 'anchorKey', 'snapshotKey', 'baseVersion', 'outcome', 'captureId', 'replacementKey', 'localBaseVersion']) || record.version !== 1 || record.actorId !== pinned.actorId || record.lineageId !== id || !source || source.lineageId !== id || !validReference(record.reference) || !referenceBase(record.baseVersion, record.reference) || !snapshotKey(record.snapshotKey, record.anchorKey)) return result('LINEAGE_REGISTRY_INVALID');
      if (record.state === 'armed') {
        if (['outcome', 'captureId', 'replacementKey', 'localBaseVersion'].some(field => record[field] !== null)) return result('LINEAGE_REGISTRY_INVALID');
      } else if (!['resolved', 'final'].includes(record.state) || !['receipt', 'aborted'].includes(record.outcome) || typeof record.captureId !== 'string' || !UUID.test(record.captureId) || typeof record.replacementKey !== 'string' || !record.replacementKey.startsWith(record.anchorKey + '#local:') || !UUID.test(record.replacementKey.slice((record.anchorKey + '#local:').length)) || !referenceBase(record.localBaseVersion, record.reference)) return result('LINEAGE_REGISTRY_INVALID');
      return result('OK', { raw: value.raw, record });
    }
    function registryGate(candidate, source) {
      const registry = readRegistry(source.lineageId); if (!registry.ok) return registry.code;
      return registry.record && registry.record.state !== 'final' && registry.record.anchorKey !== candidate ? 'LINEAGE_UNRESOLVED' : '';
    }
    function registryMatches(prepared) {
      const value = readRegistry(lineageId);
      return value.ok && value.record?.state === 'armed' && value.record.anchorKey === key && value.record.snapshotKey === prepared.snapshotKey && sameReference(value.record.reference, prepared.reference) && value.raw === prepared.registryRaw;
    }
    function unknownEnvelope(registry) {
      const source = parseKey(registry.anchorKey);
      return { version: 3, kind: 'unknown', owner: { actorId: source.actorId, epoch: source.epoch, runtimeId: source.runtimeId }, baseVersion: registry.baseVersion, leaseProtocol: source.protocol, lineageId: source.lineageId, reference: registry.reference, snapshotKey: registry.snapshotKey };
    }
    function parseKey(candidate) {
      if (typeof candidate !== 'string' || candidate.length > 8192 || !candidate.startsWith(PREFIX)) return null;
      let parts; try { parts = JSON.parse(candidate.slice(PREFIX.length)); } catch { return null; }
      if (!Array.isArray(parts) || parts.length !== 7 || parts[0] !== origin || parts[1] !== path || parts[2] !== pinned.actorId || !epoch(parts[3]) || ![PROTOCOL, 'unclaimed'].includes(parts[4]) || typeof parts[5] !== 'string' || !UUID.test(parts[5]) || typeof parts[6] !== 'string' || !UUID.test(parts[6])) return null;
      return { actorId: parts[2], epoch: parts[3], protocol: parts[4], lineageId: parts[5], runtimeId: parts[6] };
    }
    function gateKey(candidate) {
      const error = current(); if (error) return error;
      const source = parseKey(candidate); if (!source) return 'RECOVERY_KEY_INVALID';
      if (!writable()) return 'RUNTIME_NOT_READY';
      if (candidate === key) return registryGate(candidate, source);
      if (protocol !== PROTOCOL) return 'WEB_LOCKS_UNAVAILABLE';
      if (source.protocol !== PROTOCOL) return 'SOURCE_LEASE_UNAVAILABLE';
      const lease = claims.get(candidate);
      return live(lease) && ownsLineage(source.lineageId) ? registryGate(candidate, source) : 'RECOVERY_CLAIM_REQUIRED';
    }
    async function claim(candidate) {
      const error = current(); if (error) return result(error);
      const source = parseKey(candidate); if (!source) return result('RECOVERY_KEY_INVALID');
      if (!writable()) return result('RUNTIME_NOT_READY');
      if (candidate === key) { const reason = registryGate(candidate, source); return result(reason || 'OK', { key }); }
      if (protocol !== PROTOCOL) return result('WEB_LOCKS_UNAVAILABLE');
      if (source.protocol !== PROTOCOL) return result('SOURCE_LEASE_UNAVAILABLE');
      if (live(claims.get(candidate)) && ownsLineage(source.lineageId)) { const reason = registryGate(candidate, source); return result(reason || 'OK', { key: candidate }); }
      const lineage = await acquireLineage(source.lineageId); if (!lineage.ok) return lineage;
      const start = generation, acquired = await acquire(source.runtimeId, candidate);
      if (!acquired.ok) return acquired;
      if (start !== generation || current() || !writable()) { release(acquired.lease); return result(current() || 'RUNTIME_CHANGED'); }
      claims.set(candidate, acquired.lease);
      // Registry contains only metadata. No source payload is read by claim.
      const reason = registryGate(candidate, source); return result(reason || 'OK', { key: candidate });
    }
    function discover() {
      const error = current(); if (error) return result(error);
      const rows = []; let length;
      try { length = storage.length; } catch { return result('STORAGE_READ_FAILED'); }
      if (!Number.isSafeInteger(length) || length < 0) return result('STORAGE_READ_FAILED');
      let incomplete = length > 1024;
      try {
        for (let index = 0; index < Math.min(length, 1024); index++) {
          const candidate = storage.key(index), source = parseKey(candidate);
          if (source) rows.push({ key: candidate, ...source, own: candidate === key, claimable: source.protocol === PROTOCOL && protocol === PROTOCOL });
          else if (typeof candidate === 'string' && candidate.length <= 8192 && (candidate.startsWith(LEGACY) || candidate.startsWith(PREFIX))) {
            let parts; try { parts = JSON.parse(candidate.slice(candidate.startsWith(LEGACY) ? LEGACY.length : PREFIX.length)); } catch { continue; }
            if (Array.isArray(parts) && [5, 6].includes(parts.length) && parts[0] === origin && parts[1] === path && parts[2] === pinned.actorId) rows.push({ key: candidate, legacy: true, claimable: false, reason: 'SOURCE_LEASE_UNAVAILABLE' });
          }
          if (rows.length >= 32) { incomplete = index + 1 < length; break; }
        }
      } catch { return result('STORAGE_READ_FAILED'); }
      if (current()) return result(current());
      return result(incomplete ? 'SCAN_LIMIT' : 'OK', { items: rows, complete: !incomplete, records: rows, incomplete });
    }
    function validReference(ref) {
      return exactKeys(ref, ['operationId', 'generation', 'workspace', 'stage', 'channel']) && typeof ref.operationId === 'string' && UUID.test(ref.operationId) && short(ref.generation) && short(ref.workspace) && short(ref.stage) && ['canvas-v2', 'canvas'].includes(ref.channel);
    }
    function validSent(sent, ref) {
      return exactKeys(sent, ['workspace', 'stage', 'entries', 'dependencies']) && sent.workspace === ref.workspace && sent.stage === ref.stage && plain(sent.entries) && plain(sent.dependencies) && Object.keys(sent.entries).length <= 256 && Object.entries(sent.entries).every(([entryKey, entry]) => entry && entry.w === ref.workspace && entry.s === ref.stage && short(entry.id) && short(entry.f) && entryKey === JSON.stringify([entry.w, entry.s, entry.id, entry.f])) && Object.entries(sent.dependencies).every(([entryKey, entry]) => entry && entry.w === ref.workspace && entry.s === ref.stage && short(entry.id) && entryKey === JSON.stringify([entry.w, entry.s, entry.id]));
    }
    function referenceBase(value, reference) {
      let base; try { base = JSON.parse(value); } catch { return null; }
      return Array.isArray(base) && base.length === 3 && base[0] === reference.generation && Number.isSafeInteger(base[1]) && base[1] >= 0 && (base[2] === null || short(base[2])) ? base : null;
    }
    function sameReference(a, b) { return validReference(a) && validReference(b) && ['operationId', 'generation', 'workspace', 'stage', 'channel'].every(field => a[field] === b[field]); }
    function snapshotKey(candidate, target) { return typeof candidate === 'string' && candidate.startsWith(target + '#isolated:') && UUID.test(candidate.slice((target + '#isolated:').length)); }
    function parseRecord(raw, candidate) {
      const source = parseKey(candidate); let envelope;
      try { envelope = JSON.parse(raw); } catch { throw Error('MALFORMED_RECORD'); }
      if (!source || !plain(envelope) || envelope.version !== 3 || !exactKeys(envelope.owner, ['actorId', 'epoch', 'runtimeId']) || envelope.owner.actorId !== source.actorId || envelope.owner.epoch !== source.epoch || envelope.owner.runtimeId !== source.runtimeId || envelope.leaseProtocol !== source.protocol || envelope.lineageId !== source.lineageId || !short(envelope.baseVersion)) throw Error('INVALID_RECORD_SCHEMA');
      if (envelope.kind === 'local' && exactKeys(envelope, ['version', 'kind', 'owner', 'baseVersion', 'leaseProtocol', 'lineageId', 'payload'])) localPayload(copyJSON(envelope.payload));
      else if (envelope.kind === 'unknown' && exactKeys(envelope, ['version', 'kind', 'owner', 'baseVersion', 'leaseProtocol', 'lineageId', 'reference', 'snapshotKey']) && validReference(envelope.reference) && referenceBase(envelope.baseVersion, envelope.reference) && snapshotKey(envelope.snapshotKey, candidate)) { /* Receipt metadata only; never read the snapshot here. */ }
      else throw Error('INVALID_RECORD_SCHEMA');
      return envelope;
    }
    function read(candidate, source) {
      const error = gateKey(candidate); if (error) return result(error);
      let raw;
      if (source === 'memory') { if (candidate !== key) return result('MEMORY_OWNER_REQUIRED'); raw = memory; }
      else if (source === 'storage') { try { raw = storage.getItem(candidate); } catch { return result('STORAGE_READ_FAILED'); } }
      else return result('SOURCE_INVALID');
      if (current() || gateKey(candidate)) return result(current() || gateKey(candidate));
      if (raw === null || raw === undefined) return result('NOT_FOUND');
      if (typeof raw !== 'string') return result('MALFORMED_RECORD');
      try {
        const envelope = parseRecord(raw, candidate), registry = readRegistry(envelope.lineageId); if (!registry.ok) return registry;
        if (registry.record?.state === 'armed' && registry.record.anchorKey === candidate && (envelope.kind !== 'unknown' || !sameReference(envelope.reference, registry.record.reference) || envelope.snapshotKey !== registry.record.snapshotKey || envelope.baseVersion !== registry.record.baseVersion)) return result('LINEAGE_RECORD_MISMATCH');
        return result('OK', { raw, envelope });
      }
      catch (error) { return result(error.message); }
    }
    function restoreGate(envelope) {
      const error = current(); if (error) return error;
      const ctx = context();
      if (envelope.kind !== 'local' || activePreparation) return 'RECEIPT_REQUIRED';
      if (ctx.canEdit !== true) return 'EDIT_PERMISSION_REQUIRED';
      if (ctx.pending !== false) return 'SCOPE_PENDING';
      if (ctx.writeState !== 'idle') return 'WRITE_UNRESOLVED';
      if (ctx.verified !== true) return 'LATEST_STATE_REQUIRED';
      if (ctx.baseVersion !== envelope.baseVersion) return 'BASE_VERSION_CHANGED';
      if (ctx.hasLocalChanges !== false || queued) return 'LOCAL_CHANGES_PRESENT';
      return '';
    }
    function preview(candidate, source = 'storage') {
      const value = read(candidate, source); if (!value.ok) return value;
      const ctx = context(), token = Object.freeze({ id: host.crypto.randomUUID() });
      const registry = readRegistry(value.envelope.lineageId); if (!registry.ok) return registry;
      tickets.set(token, { key: candidate, source, raw: value.raw, localRevision: ctx.localRevision, generation, registryRaw: registry.raw });
      if (registry.record && (registry.record.state === 'resolved' || registry.record.state === 'final' && candidate === key && activePreparation && sameReference(registry.record.reference, activePreparation.reference)) && registry.record.anchorKey === candidate) return result('OK', { kind: 'resolved', key: candidate, source, token, owner: { ...value.envelope.owner }, baseVersion: registry.record.localBaseVersion, reference: { ...registry.record.reference }, outcome: registry.record.outcome, canFinalize: true, canRestore: false, reason: 'LOCAL_FINALIZATION_REQUIRED', canDiscard: false });
      if (value.envelope.kind === 'unknown') return result('OK', { kind: 'unknown', key: candidate, source, token, owner: { ...value.envelope.owner }, baseVersion: value.envelope.baseVersion, reference: { ...value.envelope.reference }, canRestore: false, reason: 'RECEIPT_REQUIRED', canDiscard: false });
      const reason = restoreGate(value.envelope);
      return result('OK', { kind: 'local', key: candidate, source, token, owner: { ...value.envelope.owner }, baseVersion: value.envelope.baseVersion, payload: value.envelope.payload, canRestore: !reason, reason, canDiscard: ctx.writeState === 'idle' && !activePreparation });
    }
    function ticket(token) {
      const value = tickets.get(token);
      if (!value || value.generation !== generation) return result('PREVIEW_EXPIRED');
      if (current()) return result(current());
      if (context().localRevision !== value.localRevision) return result('LOCAL_REVISION_CHANGED');
      const checked = read(value.key, value.source); if (!checked.ok) return checked;
      if (checked.raw !== value.raw) return result('RECORD_CHANGED');
      const registry = readRegistry(checked.envelope.lineageId); if (!registry.ok) return registry;
      if (registry.raw !== value.registryRaw) return result('RECORD_CHANGED');
      const unresolved = registry.record && (registry.record.state === 'resolved' || registry.record.state === 'final' && value.key === key && activePreparation && sameReference(registry.record.reference, activePreparation.reference)) && registry.record.anchorKey === value.key;
      return result('OK', { ...value, registry, envelope: unresolved ? unknownEnvelope(registry.record) : checked.envelope });
    }
    function restore(token) {
      const value = ticket(token); if (!value.ok) return value;
      const reason = restoreGate(value.envelope); if (reason) return result(reason);
      const transfer = makeHandoff(value.envelope.lineageId, value.envelope.baseVersion); if (!transfer.ok) return transfer;
      tickets.delete(token); return result('OK', { handoff: transfer.handoff, lineageId: value.envelope.lineageId, payload: value.envelope.payload, owner: { ...value.envelope.owner }, baseVersion: value.envelope.baseVersion, sourceKey: value.key });
    }
    function discard(token) {
      const value = ticket(token); if (!value.ok) return value;
      if (value.envelope.kind !== 'local' || activePreparation) return result('RECEIPT_REQUIRED');
      if (context().writeState !== 'idle') return result('WRITE_UNRESOLVED');
      if (value.source === 'memory') { memory = null; memoryDurable = false; tickets.delete(token); return publish(result('OK', { durableRecordPreserved: durableRaw !== null || unconfirmedRaw !== null })); }
      try { storage.removeItem(value.key); } catch { return result('STORAGE_WRITE_FAILED'); }
      try { if (storage.getItem(value.key) !== null) return result('STORAGE_VERIFY_FAILED'); } catch { return result('STORAGE_VERIFY_FAILED'); }
      if (current()) return result(current());
      if (value.key === key) { durableRaw = null; unconfirmedRaw = null; memoryDurable = false; if (memory === value.raw) memory = null; }
      tickets.delete(token); return publish(result('OK'));
    }
    function schedule(reader) {
      if (activePreparation) return result('RECEIPT_REQUIRED');
      const error = current(); if (error) return result(error);
      if (!writable()) return result('RUNTIME_NOT_READY');
      if (context().baseVersion !== pinned.baseVersion) return result('BASE_VERSION_CHANGED');
      if (typeof reader !== 'function') return result('READER_REQUIRED');
      queued = reader; if (timer !== null) clearTimer(timer);
      timer = setTimer(() => { timer = null; flush(); }, debounce);
      return publish(result('SCHEDULED'));
    }
    function flush() {
      if (activePreparation) return result('RECEIPT_REQUIRED');
      const error = current(); if (error) return result(error);
      if (!writable()) return result('RUNTIME_NOT_READY');
      if (context().baseVersion !== pinned.baseVersion) return publish(result('BASE_VERSION_CHANGED'));
      if (context().writeState !== 'idle') return publish(result('WRITE_UNRESOLVED'));
      if (timer !== null) clearTimer(timer); timer = null;
      const ownRun = ++run, reader = queued; queued = null;
      if (reader) {
        let raw;
        try { const payload = localPayload(copyJSON(reader())); raw = JSON.stringify({ version: 3, kind: 'local', owner: { actorId: pinned.actorId, epoch: pinned.epoch, runtimeId }, baseVersion: pinned.baseVersion, leaseProtocol: protocol, lineageId, payload }); }
        catch (error) { return publish(result(['SNAPSHOT_STRUCTURE_LIMIT', 'INVALID_SNAPSHOT_JSON', 'INVALID_LOCAL_SNAPSHOT'].includes(error.message) ? error.message : 'SNAPSHOT_CAPTURE_FAILED')); }
        if (ownRun !== run) return result('SUPERSEDED');
        if (current() || context().baseVersion !== pinned.baseVersion) return result(current() || 'BASE_VERSION_CHANGED');
        memory = raw; memoryDurable = false;
      }
      if (!memory) return publish(result('EMPTY'));
      if (ownRun !== run || current() || !writable() || context().baseVersion !== pinned.baseVersion || context().writeState !== 'idle') return result(current() || 'CONTEXT_CHANGED');
      let before;
      try { before = storage.getItem(key); } catch { return publish(result('STORAGE_READ_FAILED')); }
      if (current() || !writable() || context().baseVersion !== pinned.baseVersion || context().writeState !== 'idle') return result(current() || 'CONTEXT_CHANGED');
      if (unconfirmedRaw !== null && before === unconfirmedRaw) { durableRaw = unconfirmedRaw; unconfirmedRaw = null; }
      if (before !== durableRaw) return publish(result('RECORD_CHANGED'));
      if (memory === durableRaw) { memoryDurable = true; return publish(result('OK')); }
      try { storage.setItem(key, memory); } catch { return publish(result('STORAGE_WRITE_FAILED')); }
      hasWritten = true; unconfirmedRaw = memory;
      if (current() || !writable() || context().baseVersion !== pinned.baseVersion || context().writeState !== 'idle') return result(current() || 'CONTEXT_CHANGED');
      let after;
      try { after = storage.getItem(key); } catch { return publish(result('STORAGE_VERIFY_FAILED')); }
      if (after !== memory) return publish(result('STORAGE_VERIFY_FAILED'));
      durableRaw = memory; unconfirmedRaw = null; memoryDurable = true;
      return publish(result('OK'));
    }
    function ownerMetadata() { return { actorId: pinned.actorId, epoch: pinned.epoch, runtimeId }; }
    function localEnvelope(payload, owner = ownerMetadata(), base = pinned.baseVersion, lease = protocol, localLineage = lineageId) {
      return { version: 3, kind: 'local', owner, baseVersion: base, leaseProtocol: lease, lineageId: localLineage, payload };
    }
    function knownError(error, fallback) { return ['SNAPSHOT_STRUCTURE_LIMIT', 'INVALID_SNAPSHOT_JSON', 'INVALID_LOCAL_SNAPSHOT'].includes(error?.message) ? error.message : fallback; }
    function pendingDataGate(prepared) {
      const error = current(); if (error) return error;
      if (!prepared || prepared !== activePreparation || prepared.runtimeId !== runtimeId || prepared.done) return 'PREPARATION_CHANGED';
      if (!writable()) return 'RUNTIME_NOT_READY';
      let base; try { base = JSON.parse(context().baseVersion); } catch { return 'BASE_VERSION_CHANGED'; }
      return Array.isArray(base) && base[0] === prepared.reference.generation ? '' : 'BASE_VERSION_CHANGED';
    }
    function preparationGate(prepared) { return pendingDataGate(prepared) || (prepared.runtimeGeneration !== generation ? 'PREPARATION_CHANGED' : ''); }
    function readRaw(target) { try { return result('OK', { raw: storage.getItem(target) }); } catch { return result('STORAGE_READ_FAILED'); } }
    function writeChecked(target, raw, check) {
      let reason = check(); if (reason) return result(reason);
      try { storage.setItem(target, raw); } catch { return result('STORAGE_WRITE_FAILED'); }
      reason = check(); if (reason) return result(reason);
      const after = readRaw(target); if (!after.ok || after.raw !== raw) return result('STORAGE_VERIFY_FAILED');
      reason = check(); return reason ? result(reason) : result('OK');
    }
    function isolatedRaw(prepared, payload) {
      return JSON.stringify({ version: 3, kind: 'isolated', owner: ownerMetadata(), baseVersion: pinned.baseVersion, lineageId, captureId: prepared.captureId, reference: prepared.reference, sent: prepared.sent, payload });
    }
    function prepareWrite(input) {
      if (activePreparation) return result('RECEIPT_REQUIRED');
      const error = current(); if (error) return result(error);
      if (!writable()) return result('RUNTIME_NOT_READY');
      if (context().baseVersion !== pinned.baseVersion || context().writeState !== 'idle') return result('CONTEXT_CHANGED');
      const priorRegistry = readRegistry(lineageId); if (!priorRegistry.ok) return priorRegistry;
      if (priorRegistry.record && priorRegistry.record.state !== 'final') return result('LINEAGE_UNRESOLVED');
      const prepareRun = ++run;
      let reference, sent, payload, base;
      try {
        reference = copyJSON(input?.reference); sent = copyJSON(input?.sent); base = JSON.parse(pinned.baseVersion);
        if (!validReference(reference) || !validSent(sent, reference) || !referenceBase(pinned.baseVersion, reference) || base[0] !== reference.generation || typeof input.readPayload !== 'function') return result('PREPARATION_INVALID');
        payload = localPayload(copyJSON(input.readPayload()));
      } catch (captureError) { return result(knownError(captureError, 'PREPARATION_INVALID')); }
      if (prepareRun !== run || activePreparation) return result('SUPERSEDED');
      if (current() || !writable() || context().baseVersion !== pinned.baseVersion || context().writeState !== 'idle') return result(current() || 'CONTEXT_CHANGED');
      cancelScheduled(); rejections.clear(); run++;
      const reservation = Object.freeze({ id: host.crypto.randomUUID() });
      const prepared = { reference, sent, payload, runtimeGeneration: generation, runtimeId, snapshotKey: key + '#isolated:' + host.crypto.randomUUID(), snapshotRaw: null, snapshotDurableRaw: null, captureId: host.crypto.randomUUID(), snapshotRevision: 1, confirmedSnapshotRevision: 0, previousRaw: durableRaw, anchorRaw: null, dispatched: false, done: false, reader: null, timer: null, reservation, cancelRaw: null };
      prepared.snapshotRaw = isolatedRaw(prepared, payload);
      prepared.anchorRaw = JSON.stringify({ version: 3, kind: 'unknown', owner: ownerMetadata(), baseVersion: pinned.baseVersion, leaseProtocol: protocol, lineageId, reference, snapshotKey: prepared.snapshotKey });
      preparations.set(reservation, prepared); activePreparation = prepared;
      // RAM becomes receipt-only immediately; the independent payload is kept
      // isolated, never exposed by preview/restore while this write is unresolved.
      memory = prepared.anchorRaw; memoryDurable = false;
      const previous = readRaw(key), priorSnapshot = readRaw(prepared.snapshotKey);
      if (!previous.ok || !priorSnapshot.ok) return publish(result('STORAGE_READ_FAILED', { reservation, durable: false }));
      if (previous.raw !== prepared.previousRaw || priorSnapshot.raw !== null) return publish(result('RECORD_CHANGED', { reservation, durable: false }));
      let saved = writeChecked(prepared.snapshotKey, prepared.snapshotRaw, () => preparationGate(prepared));
      if (!saved.ok) return publish({ ...saved, reservation, durable: false });
      prepared.snapshotDurableRaw = prepared.snapshotRaw; prepared.confirmedSnapshotRevision = prepared.snapshotRevision;
      const anchorBefore = readRaw(key);
      if (!anchorBefore.ok || anchorBefore.raw !== prepared.previousRaw) return publish(result(anchorBefore.ok ? 'RECORD_CHANGED' : anchorBefore.code, { reservation, durable: false }));
      saved = writeChecked(key, prepared.anchorRaw, () => preparationGate(prepared));
      hasWritten = true;
      if (!saved.ok) { unconfirmedRaw = prepared.anchorRaw; return publish({ ...saved, reservation, durable: false }); }
      durableRaw = prepared.anchorRaw; unconfirmedRaw = null;
      prepared.registryRaw = JSON.stringify({ version: 1, actorId: pinned.actorId, lineageId, state: 'armed', reference, anchorKey: key, snapshotKey: prepared.snapshotKey, baseVersion: pinned.baseVersion, outcome: null, captureId: null, replacementKey: null, localBaseVersion: null });
      const registryBefore = readRegistry(lineageId);
      if (!registryBefore.ok || registryBefore.raw !== priorRegistry.raw) return publish(result('LINEAGE_REGISTRY_CHANGED', { reservation, durable: false }));
      saved = writeChecked(registryKey(lineageId), prepared.registryRaw, () => preparationGate(prepared));
      if (!saved.ok) return publish({ ...saved, reservation, durable: false });
      memoryDurable = true;
      return publish(result('OK', { reservation, durable: true }));
    }
    function schedulePending(reservation, reader) {
      const prepared = preparations.get(reservation), reason = pendingDataGate(prepared); if (reason) return result(reason);
      if (typeof reader !== 'function') return result('READER_REQUIRED');
      prepared.reader = reader; if (prepared.timer !== null) clearTimer(prepared.timer);
      prepared.timer = setTimer(() => { prepared.timer = null; flushPending(reservation); }, debounce);
      return publish(result('SCHEDULED'));
    }
    function capturePending(prepared) {
      const reason = pendingDataGate(prepared); if (reason) return result(reason);
      if (prepared.timer !== null) clearTimer(prepared.timer); prepared.timer = null;
      const reader = prepared.reader; prepared.reader = null;
      if (reader) {
        const beforeRun = ++run;
        try {
          const payload = localPayload(copyJSON(reader()));
          if (beforeRun !== run || pendingDataGate(prepared)) return result(pendingDataGate(prepared) || 'SUPERSEDED');
          prepared.payload = payload; prepared.captureId = host.crypto.randomUUID(); prepared.snapshotRaw = isolatedRaw(prepared, payload); prepared.snapshotRevision++;
        } catch (error) {
          // A failed lazy read is not a successful save of the old snapshot.
          // Retain this reader for explicit retry, but never overwrite a newer
          // reader or revive work after an owner/lifecycle/supersession fence.
          if (beforeRun === run && !pendingDataGate(prepared) && prepared.reader === null) prepared.reader = reader;
          return result(knownError(error, 'SNAPSHOT_CAPTURE_FAILED'));
        }
      }
      return result('OK');
    }
    function flushPending(reservation) {
      const prepared = preparations.get(reservation), captured = capturePending(prepared); if (!captured.ok) return publish(captured);
      const anchor = readRaw(key); if (!anchor.ok) return publish(anchor);
      if (anchor.raw !== prepared.anchorRaw && anchor.raw !== prepared.cancelRaw) return publish(result('RECORD_CHANGED'));
      const before = readRaw(prepared.snapshotKey); if (!before.ok) return publish(before);
      if (before.raw !== prepared.snapshotDurableRaw && before.raw !== prepared.snapshotRaw) return publish(result('RECORD_CHANGED'));
      if (before.raw !== prepared.snapshotRaw) {
        const saved = writeChecked(prepared.snapshotKey, prepared.snapshotRaw, () => pendingDataGate(prepared)); if (!saved.ok) return publish(saved);
      }
      prepared.snapshotDurableRaw = prepared.snapshotRaw; prepared.confirmedSnapshotRevision = prepared.snapshotRevision;
      return publish(result('OK'));
    }
    function cleanupSnapshot(prepared, target = prepared.snapshotKey, raw = prepared.snapshotDurableRaw, check = () => current()) {
      const reason = check(); if (reason) return reason;
      const before = readRaw(target); if (!before.ok) return before.code;
      if (before.raw === null) return '';
      if (before.raw !== raw) return 'ISOLATED_SNAPSHOT_CHANGED';
      if (check()) return check();
      try { storage.removeItem(target); } catch { return 'STORAGE_WRITE_FAILED'; }
      const after = readRaw(target); return !after.ok || after.raw !== null ? 'STORAGE_VERIFY_FAILED' : check();
    }
    function completeDisposition(record, localRaw, snapshotRaw, check) {
      const reason = check(); if (reason) return result(reason);
      const expectedRegistry = JSON.stringify(record), before = readRegistry(record.lineageId);
      if (!before.ok || before.raw !== expectedRegistry) return result('LINEAGE_REGISTRY_CHANGED');
      const anchorBefore = readRaw(record.anchorKey); if (!anchorBefore.ok) return anchorBefore;
      const boundCheck = () => {
        const reason = check(); if (reason) return reason;
        const anchor = readRaw(record.anchorKey), snapshot = readRaw(record.snapshotKey);
        return !anchor.ok || !snapshot.ok ? 'STORAGE_READ_FAILED' : anchor.raw !== anchorBefore.raw && anchor.raw !== localRaw || snapshot.raw !== snapshotRaw ? 'RECORD_CHANGED' : check();
      };
      const saved = writeChecked(record.anchorKey, localRaw, boundCheck); if (!saved.ok) return saved;
      const final = { ...record, state: 'final' }, finalRaw = JSON.stringify(final);
      const finalSaved = writeChecked(registryKey(record.lineageId), finalRaw, boundCheck); if (!finalSaved.ok) return finalSaved;
      let cleanupCode = cleanupSnapshot({}, record.snapshotKey, snapshotRaw, check);
      const stagedCleanup = cleanupSnapshot({}, record.replacementKey, localRaw, check); cleanupCode ||= stagedCleanup;
      if (record.anchorKey === key) {
        memory = localRaw; durableRaw = localRaw; unconfirmedRaw = null; memoryDurable = true; hasWritten = true; lastLocalBase = record.localBaseVersion;
        if (activePreparation) { activePreparation.done = true; activePreparation = null; }
      }
      return result('OK', { payload: JSON.parse(localRaw).payload, sourceKey: record.anchorKey, baseVersion: record.localBaseVersion, outcome: record.outcome, cleanupPending: !!cleanupCode, cleanupCode });
    }
    function stageDisposition(envelope, anchorKey, payload, isolated, snapshotRaw, baseVersion, outcome, check) {
      const previous = readRegistry(envelope.lineageId); if (!previous.ok) return previous;
      if (previous.record && previous.record.state !== 'final' && (previous.record.anchorKey !== anchorKey || !sameReference(previous.record.reference, envelope.reference))) return result('LINEAGE_UNRESOLVED');
      const localRaw = JSON.stringify(localEnvelope(payload, envelope.owner, baseVersion, envelope.leaseProtocol, envelope.lineageId));
      const record = { version: 1, actorId: pinned.actorId, lineageId: envelope.lineageId, state: 'resolved', reference: envelope.reference, anchorKey, snapshotKey: envelope.snapshotKey, baseVersion: envelope.baseVersion, outcome, captureId: isolated.captureId, replacementKey: anchorKey + '#local:' + host.crypto.randomUUID(), localBaseVersion: baseVersion };
      if (anchorKey === key && activePreparation) activePreparation.cancelRaw = localRaw;
      let saved = writeChecked(record.replacementKey, localRaw, check); if (!saved.ok) return saved;
      const after = readRegistry(envelope.lineageId); if (!after.ok || after.raw !== previous.raw) return result('LINEAGE_REGISTRY_CHANGED');
      saved = writeChecked(registryKey(envelope.lineageId), JSON.stringify(record), check); if (!saved.ok) return saved;
      return completeDisposition(record, localRaw, snapshotRaw, check);
    }
    function cancelPreparedRecord(reservation, provedRejected = false) {
      const prepared = preparations.get(reservation), reason = preparationGate(prepared); if (reason) return result(reason);
      if (prepared.dispatched && !provedRejected) return result('ALREADY_DISPATCHED');
      const captured = capturePending(prepared); if (!captured.ok) return captured;
      const before = readRaw(key); if (!before.ok) return before;
      if (before.raw !== prepared.anchorRaw && before.raw !== prepared.cancelRaw && (prepared.dispatched || before.raw !== prepared.previousRaw)) return result('RECORD_CHANGED');
      // The original sender proved no dispatch/mutation. Durably preserve its
      // latest independent snapshot before publishing an aborted disposition.
      const snapshot = writeChecked(prepared.snapshotKey, prepared.snapshotRaw, () => preparationGate(prepared)); if (!snapshot.ok) return snapshot;
      prepared.snapshotDurableRaw = prepared.snapshotRaw; prepared.confirmedSnapshotRevision = prepared.snapshotRevision;
      const done = stageDisposition(JSON.parse(prepared.anchorRaw), key, prepared.payload, { captureId: prepared.captureId }, prepared.snapshotRaw, pinned.baseVersion, 'aborted', () => preparationGate(prepared));
      return done.ok ? publish(done) : done;
    }
    function cancelPrepared(reservation) { return cancelPreparedRecord(reservation); }
    function pathIdentity(path) {
      if (!Array.isArray(path) || !path.length || path.length > 32 || path.some(part => !(short(part) || exactKeys(part, ['id']) && short(part.id)))) return null;
      return JSON.stringify(path);
    }
    async function dispatchPrepared(reservation, command, sender) {
      const prepared = preparations.get(reservation), reason = preparationGate(prepared);
      if (reason) throw Error(reason);
      const reference = prepared.reference, expectedSource = 'canvas-v2:' + JSON.stringify([reference.workspace, reference.stage]);
      if (prepared.dispatched || typeof sender !== 'function' || command?.operationId !== reference.operationId || command.generation !== reference.generation || command.action !== 'apply' || (reference.channel === 'canvas-v2' ? command.source !== expectedSource : !!command.source) || !Array.isArray(command.patches) || command.patches.length > 256) throw Error('PREPARATION_COMMAND_MISMATCH');
      const frozenCommand = { operationId: command.operationId, generation: command.generation, action: command.action, source: command.source, paths: Array.isArray(command.guards) && command.guards.length <= 512 ? command.guards.map(guard => pathIdentity(guard?.path)).filter(Boolean) : [] };
      const flushed = flushPending(reservation); if (!flushed.ok) throw Error(flushed.code);
      const anchor = readRaw(key), snapshot = readRaw(prepared.snapshotKey);
      if (!anchor.ok || !snapshot.ok || anchor.raw !== prepared.anchorRaw || snapshot.raw !== prepared.snapshotRaw || durableRaw !== prepared.anchorRaw || preparationGate(prepared)) throw Error('DURABLE_RECEIPT_REQUIRED');
      if (!registryMatches(prepared)) throw Error('DURABLE_RECEIPT_REQUIRED');
      prepared.commandRaw = JSON.stringify(command); prepared.transportAdmitted = false; prepared.dispatched = true;
      try {
        if (['operationId', 'generation', 'action', 'source'].some(field => command[field] !== frozenCommand[field])) throw Object.assign(Error('PREPARATION_COMMAND_CHANGED'), { notSent: true });
        const response = await sender(command);
        const late = preparationGate(prepared); if (late) throw Error(late);
        return response;
      } catch (error) {
        const path = pathIdentity(error?.details?.path);
        const rejected = error?.notSent === true || error?.status === 409 && error.message === 'DEPENDENCY_CHANGED_RECONFIRM' && typeof error.requestId === 'string' && UUID.test(error.requestId) && path !== null && frozenCommand.paths.includes(path);
        if (rejected && !preparationGate(prepared)) {
          prepared.rejectionProof = error;
          const cancelled = cancelPreparedRecord(reservation, true);
          if (cancelled.ok && !current() && prepared.runtimeGeneration === generation) rejections.set(reservation, error);
        }
        throw error;
      }
    }
    function assertDispatch(command) {
      const prepared = activePreparation;
      if (preparationGate(prepared) || !prepared.dispatched || prepared.transportAdmitted || !registryMatches(prepared)) return false;
      let raw; try { raw = JSON.stringify(command); } catch { return false; }
      const anchor = readRaw(key), snapshot = readRaw(prepared.snapshotKey);
      if (raw !== prepared.commandRaw || !anchor.ok || !snapshot.ok || anchor.raw !== prepared.anchorRaw || snapshot.raw !== prepared.snapshotRaw || prepared.snapshotRevision !== prepared.confirmedSnapshotRevision || preparationGate(prepared)) return false;
      prepared.transportAdmitted = true; return true;
    }
    function retryRejected(reservation, error) {
      const prepared = preparations.get(reservation), reason = preparationGate(prepared); if (reason) return result(reason);
      if (!prepared.dispatched || !prepared.rejectionProof || prepared.rejectionProof !== error) return result('REJECTION_PROOF_REQUIRED');
      const cancelled = cancelPreparedRecord(reservation, true);
      if (cancelled.ok && !current() && prepared.runtimeGeneration === generation) rejections.set(reservation, error);
      return cancelled;
    }
    function wasRejected(reservation, error) {
      const prepared = preparations.get(reservation);
      return !current() && writable() && !activePreparation && prepared?.runtimeGeneration === generation && prepared.runtimeId === runtimeId && rejections.get(reservation) === error && rejections.has(reservation);
    }
    function settlementGate(envelope, evidence) {
      const receipt = evidence?.receipt, workflow = evidence?.workflow;
      if (envelope.kind !== 'unknown' || !receipt || receipt.operationId !== envelope.reference.operationId || receipt.generation !== envelope.reference.generation || !Number.isSafeInteger(receipt.revision) || receipt.revision < 0 || typeof receipt.unchanged !== 'boolean' || !receipt.unchanged && receipt.revision < 1 || !(receipt.savedId === null || short(receipt.savedId)) || !(receipt.caseId === null || short(receipt.caseId))) return 'TERMINAL_RECEIPT_REQUIRED';
      const sourceBase = referenceBase(envelope.baseVersion, envelope.reference);
      if (!sourceBase || receipt.revision < sourceBase[1] || !receipt.unchanged && receipt.revision <= sourceBase[1]) return 'TERMINAL_RECEIPT_REQUIRED';
      if (!workflow || workflow.revision < sourceBase[1] || workflow.scope !== 'process:platform' || workflow.generation !== receipt.generation || !Number.isSafeInteger(workflow.revision) || workflow.revision < receipt.revision || !(workflow.saved?.id === undefined || workflow.saved?.id === null || short(workflow.saved.id))) return 'AUTHORITATIVE_READBACK_REQUIRED';
      const ctx = context(), base = JSON.stringify([workflow.generation, workflow.revision, workflow.saved?.id ?? null]);
      if (ctx.verified !== true || ctx.baseVersion !== base || ctx.writeState === 'pending') return 'AUTHORITATIVE_READBACK_REQUIRED';
      return '';
    }
    function parseIsolated(raw, envelope) {
      let record; try { record = JSON.parse(raw); } catch { throw Error('ISOLATED_SNAPSHOT_INVALID'); }
      if (!exactKeys(record, ['version', 'kind', 'owner', 'baseVersion', 'lineageId', 'captureId', 'reference', 'sent', 'payload']) || record.version !== 3 || record.kind !== 'isolated' || !exactKeys(record.owner, ['actorId', 'epoch', 'runtimeId']) || ['actorId', 'epoch', 'runtimeId'].some(field => record.owner[field] !== envelope.owner[field]) || record.baseVersion !== envelope.baseVersion || record.lineageId !== envelope.lineageId || typeof record.captureId !== 'string' || !UUID.test(record.captureId) || !sameReference(record.reference, envelope.reference) || !validSent(record.sent, record.reference)) throw Error('ISOLATED_SNAPSHOT_INVALID');
      localPayload(copyJSON(record.payload)); copyJSON(record.sent); return record;
    }
    function settleReceipt(token, evidence, reconcile) {
      let checked = ticket(token); if (!checked.ok) return checked;
      if (checked.source !== 'storage') return result('DURABLE_RECEIPT_REQUIRED');
      let reason = settlementGate(checked.envelope, evidence); if (reason) return result(reason);
      if (typeof reconcile !== 'function') return result('RECONCILE_REQUIRED');
      if (checked.key === key && activePreparation) {
        const flushed = flushPending(activePreparation.reservation); if (!flushed.ok) return flushed;
        checked = ticket(token); if (!checked.ok) return checked;
      }
      const snapshot = readRaw(checked.envelope.snapshotKey); if (!snapshot.ok) return snapshot;
      let isolated, payload;
      try { isolated = parseIsolated(snapshot.raw, checked.envelope); }
      catch (error) { return result(knownError(error, 'ISOLATED_SNAPSHOT_INVALID')); }
      const guard = () => current() || gateKey(checked.key) || context().localRevision !== checked.localRevision && 'LOCAL_REVISION_CHANGED' || settlementGate(checked.envelope, evidence);
      reason = guard(); if (reason) return result(reason);
      try { payload = localPayload(copyJSON(reconcile({ payload: isolated.payload, sent: isolated.sent, reference: { ...isolated.reference } }))); }
      catch (error) { return result(knownError(error, 'RECONCILE_FAILED')); }
      reason = guard(); if (reason) return result(reason);
      const anchorBefore = readRaw(checked.key), snapshotBefore = readRaw(checked.envelope.snapshotKey);
      if (!anchorBefore.ok || !snapshotBefore.ok) return result('STORAGE_READ_FAILED');
      if (anchorBefore.raw !== checked.raw || snapshotBefore.raw !== snapshot.raw) return result('RECORD_CHANGED');
      reason = guard(); if (reason) return result(reason);
      const baseVersion = JSON.stringify([evidence.workflow.generation, evidence.workflow.revision, evidence.workflow.saved?.id ?? null]);
      const done = stageDisposition(checked.envelope, checked.key, payload, isolated, snapshot.raw, baseVersion, 'receipt', guard);
      if (done.ok) tickets.delete(token);
      return done.ok ? publish(done) : done;
    }
    function finalizeDisposition(token) {
      let checked = ticket(token); if (!checked.ok) return checked;
      if (checked.key === key && activePreparation) { const flushed = flushPending(activePreparation.reservation); if (!flushed.ok) return flushed; checked = ticket(token); if (!checked.ok) return checked; }
      const record = checked.registry.record;
      if (checked.source !== 'storage' || !['resolved', 'final'].includes(record?.state) || record.anchorKey !== checked.key) return result('LOCAL_FINALIZATION_REQUIRED');
      const guard = () => current() || gateKey(checked.key) || context().localRevision !== checked.localRevision && 'LOCAL_REVISION_CHANGED';
      const staged = readRaw(record.replacementKey), snapshot = readRaw(record.snapshotKey);
      if (!staged.ok || !snapshot.ok) return result('STORAGE_READ_FAILED');
      let local, isolated;
      try {
        local = parseRecord(staged.raw, record.anchorKey); isolated = parseIsolated(snapshot.raw, unknownEnvelope(record));
        if (local.kind !== 'local' || local.baseVersion !== record.localBaseVersion) return result('INVALID_RECORD_SCHEMA');
      } catch { return result('INVALID_RECORD_SCHEMA'); }
      if (isolated.captureId !== record.captureId) {
        if (record.outcome !== 'aborted') return result('RESOLUTION_INPUT_CHANGED_RECHECK');
        const done = stageDisposition(unknownEnvelope(record), record.anchorKey, isolated.payload, isolated, snapshot.raw, record.localBaseVersion, 'aborted', guard);
        if (done.ok) tickets.delete(token); return done.ok ? publish(done) : done;
      }
      const done = completeDisposition(record, staged.raw, snapshot.raw, guard);
      if (done.ok) tickets.delete(token); return done.ok ? publish(done) : done;
    }
    function pagehide() {
      departure++;
      try { if (writable()) { if (activePreparation) flushPending(activePreparation.reservation); else flush(); } }
      finally { active = false; if (timer !== null) clearTimer(timer); timer = null; queued = null; invalidate(); }
    }
    function pageshow(event) { if (!closed && event?.persisted) { active = true; ready = acquireRuntime(); } }
    function close() {
      if (closed) return;
      if (timer !== null) clearTimer(timer); timer = null; queued = null;
      closed = true; active = false; invalidate();
      events.removeEventListener?.('pagehide', pagehide); events.removeEventListener?.('pageshow', pageshow);
    }
    events.addEventListener?.('pagehide', pagehide); events.addEventListener?.('pageshow', pageshow);
    ready = acquireRuntime();
    return Object.freeze({ get ready() { return ready; }, get key() { return key; }, get runtimeId() { return runtimeId; }, status, schedule, flush, cancelScheduled, discover, claim, preview, restore, discard, prepareWrite, schedulePending, flushPending, cancelPrepared, dispatchPrepared, wasRejected, retryRejected, settleReceipt, finalizeDisposition, handoff, assertDispatch, close });
  }
  host.CanvasRecoveryStore = Object.freeze({ create, releaseHandoff });
})(typeof window === 'undefined' ? globalThis : window);
