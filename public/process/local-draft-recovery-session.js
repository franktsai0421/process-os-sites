/* Runtime + lineage leases for bounded explicit recovery. No transport or TTL claims. */
(function (host) {
  'use strict';
  const LOCK = 'process-local-draft-v2-runtime:', LINEAGE = 'process-local-draft-v2-lineage:';
  const outcome = (code, extra = {}) => ({ ok: code === 'OK' || code === 'SCHEDULED', code, ...extra });
  function create(options) {
    if (!host.LocalDraftRecovery || typeof options?.getContext !== 'function') throw Error('RECOVERY_HELPER_REQUIRED');
    const first = options.getContext(), tabId = first?.tabId || host.crypto.randomUUID();
    const initial = { actorId: first?.actorId, scope: first?.scope, epoch: first?.epoch, tabId };
    const locks = options.locks === undefined ? host.navigator?.locks : options.locks, events = options.eventTarget || host;
    const supported = typeof locks?.request === 'function', claims = new Map(), lineageClaims = new Map();
    let active = true, closed = false, generation = 0, ownLease = null, lineageLease = null, runtimeReady = false, everReady = false, rebaseClaim = null;
    let notice = supported ? '' : 'WEB_LOCKS_UNAVAILABLE', ready, acquiring = null, releaseBarrier = Promise.resolve();
    function current() {
      if (closed) return 'CLOSED'; if (!active) return 'RUNTIME_SUSPENDED';
      let value; try { value = options.getContext(); } catch { return 'OWNER_CHANGED'; }
      if (!value || value.actorId !== initial.actorId || value.scope !== initial.scope || value.epoch !== initial.epoch || (value.tabId || tabId) !== initial.tabId) return 'OWNER_CHANGED';
      if (value.canView !== true) return 'VIEW_PERMISSION_REQUIRED';
      try { if (options.current && options.current() !== true) return 'OWNER_CHANGED'; } catch { return 'OWNER_CHANGED'; }
      return '';
    }
    function live(lease) { return !!lease && !lease.released && lease.generation === generation && !current(); }
    function release(lease) { if (lease && !lease.released) { lease.released = true; lease.release(); } }
    function ownsLineage(id) { return id === helper.lineageId ? helper.leaseProtocol === 'unclaimed' || live(lineageLease) : live(lineageClaims.get(id)); }
    function canWrite() { return runtimeReady && !current() && (helper.leaseProtocol === 'unclaimed' || live(ownLease) && ownsLineage(helper.lineageId)); }
    function ownsRecovery(source) { const lease = claims.get(source.key); return source.leaseProtocol === 'web-lock-v1' && canWrite() && live(lease) && lease.runtimeId === source.runtimeId && ownsLineage(source.lineageId); }
    function adoptLineage(id) {
      if (!canWrite() || helper.leaseProtocol !== 'web-lock-v1' || !ownsLineage(id)) return false;
      if (id === helper.lineageId) return true;
      const next = lineageClaims.get(id); if (!live(next)) return false;
      release(lineageLease); lineageLease = next; lineageClaims.delete(id); return true;
    }
    function ownsRebaseRuntime(id) { return !!rebaseClaim && rebaseClaim.runtimeId === id && rebaseClaim.generation === generation && canWrite() && (helper.leaseProtocol === 'unclaimed' || live(rebaseClaim.lease)); }
    const helper = host.LocalDraftRecovery.create({ ...options, getContext: () => ({ ...options.getContext(), tabId }), allowHistory: true, leaseProtocol: supported ? 'web-lock-v1' : 'unclaimed', canWrite, ownsRecovery, ownsLineage, adoptLineage, ownsRebaseRuntime,
      onStatus(metadata) { if (current() || typeof options.onStatus !== 'function') return; try { options.onStatus({ ...metadata, ready: canWrite(), canRecover: helper.leaseProtocol === 'web-lock-v1' && canWrite() }); } catch { /* Observer cannot authorize writes. */ } },
    });
    function invalidate() {
      runtimeReady = false; generation++; helper.invalidatePrepared();
      const released = [...claims.values(), ...lineageClaims.values(), ownLease, lineageLease, rebaseClaim?.lease].filter(Boolean);
      for (const lease of released) release(lease);
      releaseBarrier = Promise.all(released.map(lease => lease.completed));
      claims.clear(); lineageClaims.clear(); ownLease = null; lineageLease = null; rebaseClaim = null;
    }
    function acquire(id, key, prefix) {
      const start = generation; let complete; const completed = new Promise(resolve => { complete = resolve; });
      return new Promise(resolve => {
        let answered = false; const answer = value => { if (!answered) { answered = true; resolve(value); } };
        try { Promise.resolve(locks.request(prefix + id, { mode: 'exclusive', ifAvailable: true }, async lock => {
          if (!lock) { answer(outcome('RECOVERY_IN_USE')); return; }
          if (start !== generation || current()) { answer(outcome(current() || 'RUNTIME_CHANGED')); return; }
          let finish; const held = new Promise(done => { finish = done; });
          answer(outcome('OK', { lease: { runtimeId: id, key, generation: start, released: false, release: finish, completed } })); await held;
        })).then(complete, () => { answer(outcome('RECOVERY_LOCK_FAILED')); complete(); }); }
        catch { answer(outcome('RECOVERY_LOCK_FAILED')); complete(); }
      });
    }
    async function acquireRuntime(allowFreshFallback = true) {
      await releaseBarrier;
      if (current()) return outcome(current(), { ready: false });
      if (helper.leaseProtocol === 'unclaimed') { runtimeReady = true; everReady = true; return outcome('OK', { ready: true, canRecover: false, notice }); }
      const start = generation, runtime = await acquire(helper.runtimeId, helper.key, LOCK);
      if (start !== generation || current()) { release(runtime.lease); return outcome(current() || 'RUNTIME_CHANGED'); }
      let failed = runtime.ok ? '' : runtime.code;
      if (runtime.ok) {
        ownLease = runtime.lease; const lineage = await acquire(helper.lineageId, helper.key, LINEAGE);
        if (lineage.ok) lineageLease = lineage.lease; else failed = lineage.code;
      }
      if (start !== generation || current()) { release(ownLease); release(lineageLease); ownLease = null; lineageLease = null; return outcome(current() || 'RUNTIME_CHANGED'); }
      if (failed) {
        release(ownLease); release(lineageLease); ownLease = null; lineageLease = null;
        if (everReady || !allowFreshFallback) return outcome(failed, { ready: false, canRecover: false });
        const fallback = helper.freshUnclaimed(); if (!fallback.ok) return fallback; notice = failed;
      }
      runtimeReady = true; everReady = true; return outcome('OK', { ready: true, canRecover: helper.leaseProtocol === 'web-lock-v1', notice });
    }
    function startAcquire(allowFreshFallback) {
      if (acquiring) return acquiring;
      const task = acquireRuntime(allowFreshFallback); acquiring = task;
      void task.then(() => { if (acquiring === task) acquiring = null; }, () => { if (acquiring === task) acquiring = null; });
      return task;
    }
    function resume() {
      const error = current(); if (error) return Promise.resolve(outcome(error, { ready: false }));
      if (options.getContext().verified !== true) return Promise.resolve(outcome('LATEST_STATE_REQUIRED', { ready: false }));
      if (canWrite()) return Promise.resolve(outcome('OK', { ready: true, canRecover: helper.leaseProtocol === 'web-lock-v1', notice }));
      ready = startAcquire(false); return ready;
    }
    async function claim(key) {
      if (current()) return outcome(current()); if (!canWrite()) return outcome('RUNTIME_NOT_READY');
      const item = helper.describeKey(key); if (!item) return outcome(typeof key === 'string' && key.startsWith('process-local-draft-v1:') ? 'UNSUPPORTED_LEGACY' : 'NOT_OWNED');
      if (key === helper.key) return helper.checkClaim(key);
      if (helper.leaseProtocol !== 'web-lock-v1') return outcome('WEB_LOCKS_UNAVAILABLE');
      if (item.leaseProtocol !== 'web-lock-v1') return outcome('SOURCE_LEASE_UNAVAILABLE');
      const start = generation;
      if (!ownsLineage(item.lineageId)) {
        const acquired = await acquire(item.lineageId, key, LINEAGE); if (!acquired.ok) return acquired;
        if (start !== generation || current() || !canWrite()) { release(acquired.lease); return outcome(current() || 'RUNTIME_CHANGED'); }
        lineageClaims.set(item.lineageId, acquired.lease);
      }
      if (!live(claims.get(key))) {
        const acquired = await acquire(item.runtimeId, key, LOCK); if (!acquired.ok) return acquired;
        if (start !== generation || current() || !canWrite()) { release(acquired.lease); return outcome(current() || 'RUNTIME_CHANGED'); }
        claims.set(key, acquired.lease);
      }
      return helper.checkClaim(key); // Small metadata only; no source value read.
    }
    function guarded(method, ...args) {
      const error = current(); if (error) return outcome(error);
      if (!['schedule', 'discover', 'list', 'preview'].includes(method) && !canWrite()) return outcome('RUNTIME_NOT_READY');
      const value = helper[method](...args), late = current(); return late ? outcome(late) : value;
    }
    async function transactionalRebase(input) {
      const error = current(); if (error) return outcome(error);
      if (!canWrite()) return outcome('RUNTIME_NOT_READY');
      if (rebaseClaim) return outcome('REBASE_IN_PROGRESS');
      const prepared = helper.prepareRebaseLocal(input); if (!prepared.ok) return prepared;
      const claim = { runtimeId: prepared.runtimeId, generation, lease: null }; rebaseClaim = claim;
      try {
        if (prepared.leaseProtocol === 'web-lock-v1') {
          const acquired = await acquire(prepared.runtimeId, prepared.key, LOCK);
          claim.lease = acquired.lease;
          if (!acquired.ok) return acquired;
        }
        if (rebaseClaim !== claim || claim.generation !== generation || current() || !canWrite()) return outcome(current() || 'RUNTIME_CHANGED');
        const value = helper.finishRebaseLocal(prepared.transaction);
        if (!value.ok) return value;
        // Synchronous with the helper commit; no observer/current callback or
        // await can separate the key/runtime swap from the matching lease.
        const previous = ownLease; ownLease = claim.lease; claim.lease = null; rebaseClaim = null;
        release(previous);
        return value;
      } catch (failure) { return outcome(failure.code || 'REBASE_FAILED', { durable: false }); }
      finally { helper.cancelRebaseLocal(prepared.transaction); release(claim.lease); if (rebaseClaim === claim) rebaseClaim = null; }
    }
    function pagehide() { try { if (canWrite()) helper.flush(); } finally { active = false; invalidate(); } }
    function pageshow(event) { if (!closed && event?.persisted) { active = true; ready = startAcquire(false); } }
    events.addEventListener?.('pagehide', pagehide); events.addEventListener?.('pageshow', pageshow); ready = startAcquire(true);
    return Object.freeze({ get ready() { return ready; }, get key() { return helper.key; }, get runtimeId() { return helper.runtimeId; },
      schedule: reader => guarded('schedule', reader), flush: () => guarded('flush'), cancelScheduled: () => guarded('cancelScheduled'), discover: () => guarded('discover'), list: () => guarded('list'), preview: (key, source) => guarded('preview', key, source), claim, resume,
      restore: token => guarded('restore', token), discard: token => guarded('discard', token), rememberUnknown: ref => guarded('rememberUnknown', ref), prepareWrite: ref => guarded('prepareWrite', ref), markDispatched: reservation => guarded('markDispatched', reservation), cancelPrepared: reservation => guarded('cancelPrepared', reservation),
      dispatchPrepared(reservation, command, sender, proofOptions) { const error = current(); if (error || !canWrite()) return Promise.reject(Error(error || 'RUNTIME_NOT_READY')); return helper.dispatchPrepared(reservation, command, sender, proofOptions); },
      assertDispatch: command => !current() && canWrite() && helper.assertDispatch(command), wasRejected: (reservation, error) => !current() && canWrite() && helper.wasRejected(reservation, error), retryRejected: (reservation, error) => guarded('retryRejected', reservation, error),
      rebaseLocal: input => input && Object.hasOwn(input, 'payload') ? transactionalRebase(input) : guarded('rebaseLocal', input),
      settleReceipt: (token, evidence) => guarded('settleReceipt', token, evidence), finalizeDisposition: token => guarded('finalizeDisposition', token),
      status() { const error = current(); return error ? outcome(error, { ready: false, canRecover: false }) : { ...helper.status(), ready: canWrite(), canRecover: helper.leaseProtocol === 'web-lock-v1' && canWrite(), notice }; },
      close() { if (closed) return; closed = true; invalidate(); helper.close(); events.removeEventListener?.('pagehide', pagehide); events.removeEventListener?.('pageshow', pageshow); },
    });
  }
  host.LocalDraftRecoverySession = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
