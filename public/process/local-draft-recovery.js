/* Explicit device-local recovery only. This helper has no network or module hooks. */
(function (host) {
  'use strict';
  const PREFIX = 'process-local-draft-v2:';
  const LEGACY = 'process-local-draft-v1:';
  const REGISTRY = 'process-local-draft-lineage-v1:';
  const LIMITS = Object.freeze({
    bytes: 262144,
    string: 32768,
    nodes: 12000,
    depth: 16,
    array: 4000,
    keys: 2000,
    scan: 1024,
    scanRecords: 32,
    scanBytes: 1048576,
  });
  const forbiddenKey =
    /password|passwd|secret|credential|authorization|cookie|accesstoken|refreshtoken|sessiontoken|sessionid|sessionkey|privatekey|apikey|signingkey|signer|token|jwt|bearer/;
  const fail = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  const result = (code, extra = {}) => ({
    ok: code === 'OK' || code === 'SCHEDULED',
    code,
    ...extra,
  });
  const scalar = (value) =>
    (typeof value === 'string' && value.length > 0 && value.length <= 256) ||
    (Number.isSafeInteger(value) && value >= 0);
  const id = (value) =>
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32);
  const stamp = (context) => {
    if (
      !context ||
      !id(context.actorId) ||
      !id(context.scope) ||
      !id(context.tabId) ||
      !scalar(context.epoch) ||
      !id(context.baseVersion)
    )
      fail('CONTEXT_REQUIRED');
    return {
      actorId: context.actorId,
      scope: context.scope,
      tabId: context.tabId,
      epoch: context.epoch,
      baseVersion: context.baseVersion,
    };
  };
  const sameOwner = (a, b) =>
    a.actorId === b.actorId &&
    a.scope === b.scope &&
    a.tabId === b.tabId &&
    a.epoch === b.epoch;
  const keyFor = (owner, protocol, lineageId, runtimeId) => PREFIX + JSON.stringify([owner.actorId, owner.scope, owner.tabId, owner.epoch, protocol, lineageId, runtimeId]);
  function describeKey(target, owner) {
    if (typeof target !== 'string' || target.length > 2000 || !target.startsWith(PREFIX)) return null;
    let parts; try { parts = JSON.parse(target.slice(PREFIX.length)); } catch { return null; }
    if (!Array.isArray(parts) || parts.length !== 7 || !parts.slice(0, 3).every(id) || !scalar(parts[3]) || !['web-lock-v1', 'unclaimed'].includes(parts[4]) || !id(parts[5]) || !id(parts[6]) || parts[0] !== owner.actorId || parts[1] !== owner.scope) return null;
    return { key: target, owner: { actorId: parts[0], scope: parts[1], tabId: parts[2], epoch: parts[3] }, leaseProtocol: parts[4], lineageId: parts[5], runtimeId: parts[6] };
  }
  function uuid() {
    if (typeof host.crypto?.randomUUID === 'function')
      return host.crypto.randomUUID();
    if (typeof host.crypto?.getRandomValues !== 'function')
      fail('SECURE_RUNTIME_ID_UNAVAILABLE');
    return Array.from(host.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }
  function unsafeString(value) {
    return (
      /(?:data:|blob:)/i.test(value) ||
      /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|https?:\/\/[^/\s]+@|[?&](?:token|secret|api[_-]?key|signature)=/i.test(
        value,
      ) ||
      (value.length > 2048 && /^[a-z\d+/=_-]+$/i.test(value))
    );
  }
  // Work is bounded before stringify; accessors, cycles and non-JSON values fail
  // closed. Adapters must still project an allowlisted draft, never full state.
  function boundedJSON(input) {
    let nodes = 0,
      chars = 0;
    const ancestors = new Set();
    function copy(value, depth) {
      if (++nodes > LIMITS.nodes || depth > LIMITS.depth) fail('PAYLOAD_LIMIT');
      if (value === null || typeof value === 'boolean') {
        chars += 5;
        return value;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('INVALID_JSON');
        chars += 24;
        return value;
      }
      if (typeof value === 'string') {
        if (
          value.length > LIMITS.string ||
          (chars += value.length + 2) > LIMITS.bytes
        )
          fail('PAYLOAD_LIMIT');
        if (unsafeString(value)) fail('SENSITIVE_PAYLOAD');
        return value;
      }
      if (typeof value !== 'object' || ancestors.has(value))
        fail('INVALID_JSON');
      const array = Array.isArray(value),
        proto = Object.getPrototypeOf(value);
      if (
        !array &&
        proto !== null &&
        (!Object.hasOwn(proto, 'constructor') ||
          Object.getOwnPropertyDescriptor(proto, 'constructor')?.value?.name !==
            'Object')
      )
        fail('INVALID_JSON');
      if (array && value.length > LIMITS.array) fail('PAYLOAD_LIMIT');
      ancestors.add(value);
      const out = array ? [] : Object.create(null);
      let keys = 0;
      if (array) {
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !Object.hasOwn(descriptor, 'value'))
            fail('INVALID_JSON');
          out.push(copy(descriptor.value, depth + 1));
        }
      } else {
        for (const name in value) {
          if (!Object.hasOwn(value, name)) continue;
          if (
            ++keys > LIMITS.keys ||
            name.length > 256 ||
            (chars += name.length + 3) > LIMITS.bytes
          )
            fail('PAYLOAD_LIMIT');
          if (
            ['__proto__', 'constructor', 'prototype'].includes(name) ||
            forbiddenKey.test(name.toLowerCase().replace(/[^a-z]/g, ''))
          )
            fail('SENSITIVE_PAYLOAD');
          const descriptor = Object.getOwnPropertyDescriptor(value, name);
          if (!descriptor || !Object.hasOwn(descriptor, 'value'))
            fail('INVALID_JSON');
          out[name] = copy(descriptor.value, depth + 1);
        }
      }
      ancestors.delete(value);
      return out;
    }
    const value = copy(input, 0),
      raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).byteLength > LIMITS.bytes)
      fail('PAYLOAD_LIMIT');
    return { value, raw };
  }
  function exactKeys(value, keys) {
    return (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
    );
  }
  function receipt(input) {
    if (
      !exactKeys(input, ['operationId', 'generation']) ||
      !id(input.operationId) ||
      !scalar(input.generation)
    )
      fail('INVALID_RECEIPT');
    return boundedJSON(input).value;
  }
  function parse(raw, key, source, owner) {
    if (typeof raw !== 'string' || raw.length > LIMITS.bytes)
      fail('RECORD_LIMIT');
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      fail('CORRUPT_RECORD');
    }
    if (value?.version !== 2) fail('UNSUPPORTED_SCHEMA');
    const fields = [
      'version',
      'kind',
      'owner',
      'baseVersion',
      'runtimeId',
      'batchId',
      'updatedAt',
      'lineageId',
      'leaseProtocol',
      value.kind === 'local' ? 'payload' : 'receipt',
    ];
    if (
      (value.leaseProtocol !== undefined &&
        !['web-lock-v1', 'unclaimed'].includes(value.leaseProtocol)) ||
      !exactKeys(value, fields) ||
      !['local', 'unknown'].includes(value.kind) ||
      !exactKeys(value.owner, ['actorId', 'scope', 'tabId', 'epoch']) ||
      !sameOwner(value.owner, owner) ||
      !id(value.baseVersion) ||
      !id(value.runtimeId) ||
      key !== keyFor(owner, value.leaseProtocol, value.lineageId, value.runtimeId) || value.lineageId !== source.lineageId || value.leaseProtocol !== source.leaseProtocol ||
      !id(value.batchId) ||
      !value.batchId.startsWith(value.runtimeId + ':') ||
      !Number.isSafeInteger(value.updatedAt) ||
      value.updatedAt < 0
    )
      fail('INVALID_RECORD');
    if (value.kind === 'unknown') receipt(value.receipt);
    return boundedJSON(value).value;
  }
  function create(options) {
    if (typeof options?.getContext !== 'function') fail('CONTEXT_REQUIRED');
    const initial = stamp(options.getContext());
    let runtimeId = uuid(), lineageId = runtimeId, protocol = options.leaseProtocol || 'unclaimed';
    let key = keyFor(initial, protocol, lineageId, runtimeId);
    let lifecycle = 0, activePreparation = null, rebasePreparation = null;
    const registryKeys = new Map([[lineageId, REGISTRY + JSON.stringify([initial.actorId, initial.scope, lineageId])]]);
    let storage;
    try {
      storage =
        options.storage === undefined ? host.localStorage : options.storage;
    } catch {
      /* Report unavailable on first use. */
    }
    const setTimer = options.setTimeout || host.setTimeout.bind(host),
      clearTimer = options.clearTimeout || host.clearTimeout.bind(host);
    const delay = Number.isFinite(options.debounceMs)
      ? Math.max(50, Math.min(2000, options.debounceMs))
      : 250;
    const now = options.now || Date.now;
    let timer = null,
      pending = null,
      memory = null,
      expectedRaw = null,
      sequence = 0,
      closed = false;
    let status = result('EMPTY', { durable: false });
    const tickets = new Map(),
      preparations = new Map(),
      rejections = new Map();
    function publish(next) {
      status = next;
      try {
        context();
      } catch (error) {
        return result(error.code || 'CONTEXT_REQUIRED', { durable: false });
      }
      if (typeof options.onStatus === 'function') {
        const metadata = {
          ok: next.ok === true,
          code:
            typeof next.code === 'string' &&
            /^[A-Z][A-Z0-9_]{0,63}$/.test(next.code)
              ? next.code
              : 'RECOVERY_ERROR',
          durable: next.durable === true,
          hasPending: !!pending,
          hasMemory: !!memory,
          ...(memory ? { kind: memory.record.kind } : {}),
        };
        try {
          options.onStatus(metadata);
        } catch {
          /* Observers never decide persistence outcome. */
        }
      }
      try {
        context();
      } catch (error) {
        return result(error.code || 'CONTEXT_REQUIRED', { durable: false });
      }
      return { ...next };
    }
    function context(requireBase = false) {
      if (closed) fail('CLOSED');
      const current = options.getContext(),
        pin = stamp(current);
      if (!sameOwner(pin, initial)) fail('OWNER_CHANGED');
      if (current.canView !== true) fail('VIEW_PERMISSION_REQUIRED');
      if (requireBase && pin.baseVersion !== initial.baseVersion)
        fail('BASE_CHANGED');
      return current;
    }
    function read(target) {
      if (!storage || typeof storage.getItem !== 'function')
        fail('STORAGE_UNAVAILABLE');
      try {
        return storage.getItem(target);
      } catch {
        fail('STORAGE_READ_FAILED');
      }
    }
    function sourceIdentity(target, historical = options.allowHistory === true) {
      const source = describeKey(target, initial);
      return source && (historical || sameOwner(source.owner, initial)) ? source : null;
    }
    function ownsLineage(idValue) { return idValue === lineageId ? !options.canWrite || options.canWrite() === true : options.ownsLineage?.(idValue) === true; }
    function sourceGate(target) {
      context();
      const source = sourceIdentity(target); if (!source) fail(target?.startsWith?.(LEGACY) ? 'UNSUPPORTED_LEGACY' : 'NOT_OWNED');
      if (target === key) return source;
      if (source.leaseProtocol !== 'web-lock-v1') fail('SOURCE_LEASE_UNAVAILABLE');
      if (options.ownsRecovery?.({ ...source, ...source.owner }) !== true || !ownsLineage(source.lineageId)) fail('RECOVERY_CLAIM_REQUIRED');
      return source;
    }
    function registryKey(idValue) { if (!registryKeys.has(idValue)) registryKeys.set(idValue, REGISTRY + JSON.stringify([initial.actorId, initial.scope, idValue])); return registryKeys.get(idValue); }
    function registry(idValue = lineageId) {
      context(); if (!ownsLineage(idValue)) fail('RECOVERY_CLAIM_REQUIRED');
      const raw = read(registryKey(idValue)); context(); if (!ownsLineage(idValue)) fail('RECOVERY_CLAIM_REQUIRED');
      if (raw === null) return { raw, record: null };
      let value; try { if (typeof raw !== 'string' || raw.length > 16384) fail('LINEAGE_REGISTRY_INVALID'); value = JSON.parse(raw); } catch { fail('LINEAGE_REGISTRY_INVALID'); }
      const source = describeKey(value?.anchorKey, initial);
      if (!exactKeys(value, ['version', 'actorId', 'scope', 'lineageId', 'state', 'anchorKey', 'receipt', 'baseVersion', 'outcome', 'nextBase']) || value.version !== 1 || value.actorId !== initial.actorId || value.scope !== initial.scope || value.lineageId !== idValue || !source || source.lineageId !== idValue || !id(value.baseVersion) || !['armed', 'final'].includes(value.state)) fail('LINEAGE_REGISTRY_INVALID');
      receipt(value.receipt);
      if (value.state === 'armed' ? value.outcome !== null || value.nextBase !== null : !['aborted', 'receipt'].includes(value.outcome) || !id(value.nextBase)) fail('LINEAGE_REGISTRY_INVALID');
      return { raw, record: value };
    }
    function registryGate(target, source) {
      const value = registry(source.lineageId);
      if (value.record?.state === 'armed' && value.record.anchorKey !== target) fail('LINEAGE_UNRESOLVED');
      return value;
    }
    function writeMetadata(target, raw) {
      context(); if (options.canWrite && !options.canWrite()) fail('RUNTIME_NOT_READY');
      storage.setItem(target, raw);
      context(); if (options.canWrite && !options.canWrite()) fail('RUNTIME_NOT_READY');
      if (read(target) !== raw) fail('STORAGE_UNCONFIRMED');
      context();
    }
    function arm(item) {
      const before = registry();
      if (before.record?.state === 'armed' && (before.record.anchorKey !== key || before.record.receipt.operationId !== item.receipt.operationId || before.record.receipt.generation !== item.receipt.generation)) fail('LINEAGE_UNRESOLVED');
      const raw = JSON.stringify({ version: 1, actorId: initial.actorId, scope: initial.scope, lineageId, state: 'armed', anchorKey: key, receipt: item.receipt, baseVersion: item.baseVersion, outcome: null, nextBase: null });
      if (before.raw !== raw) writeMetadata(registryKey(lineageId), raw);
      return raw;
    }
    function terminal(item, target, outcome, nextBase) {
      const before = registry(item.lineageId), old = before.record;
      if (old && old.state === 'armed' && (old.anchorKey !== target || old.receipt.operationId !== item.receipt.operationId || old.receipt.generation !== item.receipt.generation)) fail('LINEAGE_UNRESOLVED');
      const value = { version: 1, actorId: initial.actorId, scope: initial.scope, lineageId: item.lineageId, state: 'final', anchorKey: target, receipt: item.receipt, baseVersion: item.baseVersion, outcome, nextBase };
      const raw = JSON.stringify(value); if (before.raw !== raw) writeMetadata(registryKey(item.lineageId), raw);
      return value;
    }
    function writeContext() {
      const current = context(true);
      if (options.canWrite && options.canWrite() !== true)
        fail('RUNTIME_NOT_READY');
      context(true);
      return current;
    }
    function write(record, queued = null) {
      let encoded;
      try {
        encoded = boundedJSON(record);
      } catch (error) {
        return publish(
          result(error.code || 'INVALID_JSON', { durable: false }),
        );
      }
      memory = { key, record: encoded.value, raw: encoded.raw, durable: false };
      if (queued && pending === queued) pending = null;
      try {
        writeContext();
        const lineage = registry();
        if (record.kind === 'local' && lineage.record?.state === 'armed') fail('LINEAGE_UNRESOLVED');
        if (read(key) !== expectedRaw) fail('STORAGE_CHANGED');
        writeContext();
        if (typeof storage.setItem !== 'function') fail('STORAGE_UNAVAILABLE');
        storage.setItem(key, encoded.raw);
        expectedRaw = encoded.raw;
        if (read(key) !== encoded.raw) fail('STORAGE_UNCONFIRMED');
        if (record.kind === 'unknown') arm(encoded.value);
        memory.durable = true;
        return publish(
          result('OK', {
            durable: true,
            key,
            batchId: record.batchId,
            kind: record.kind,
          }),
        );
      } catch (error) {
        const code =
          error.name === 'QuotaExceededError'
            ? 'QUOTA_EXCEEDED'
            : error.code || 'STORAGE_WRITE_FAILED';
        return publish(
          result(code, {
            durable: false,
            key,
            batchId: record.batchId,
            kind: record.kind,
          }),
        );
      }
    }
    function record(kind, value) {
      const { actorId, scope, tabId, epoch, baseVersion } = initial;
      return {
        version: 2,
        lineageId,
        kind,
        owner: { actorId, scope, tabId, epoch },
        baseVersion,
        runtimeId,
        batchId: runtimeId + ':' + ++sequence,
        updatedAt: now(),
        leaseProtocol: protocol,
        [kind === 'local' ? 'payload' : 'receipt']: value,
      };
    }
    function cancelTimer() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    }
    function cancelScheduled() {
      try {
        context();
        if (options.canWrite && options.canWrite() !== true)
          fail('RUNTIME_NOT_READY');
        const cancelled = !!pending;
        cancelTimer();
        pending = null;
        context();
        return result('OK', { cancelled });
      } catch (error) {
        return result(error.code || 'CONTEXT_REQUIRED');
      }
    }
    function flush() {
      cancelTimer();
      if (!pending) {
        if (!memory || memory.durable) return { ...status };
        try {
          const current = writeContext();
          if (memory.record.kind === 'local' && current.writeState !== 'idle')
            fail('RECEIPT_REQUIRED');
          return write(memory.record);
        } catch (error) {
          return publish(
            result(error.code || 'CONTEXT_REQUIRED', { durable: false }),
          );
        }
      }
      const queued = pending;
      try {
        const current = writeContext();
        if (current.writeState !== 'idle') fail('RECEIPT_REQUIRED');
        // No serialization or payload-reader call happens on the typing path.
        const payload = queued.readPayload();
        context(true);
        const prepared = record('local', payload);
        return write(prepared, queued);
      } catch (error) {
        return publish(
          result(error.code || 'PAYLOAD_READ_FAILED', { durable: false }),
        );
      }
    }
    function schedule(readPayload) {
      try {
        const current = context(true);
        if (current.writeState !== 'idle' || memory?.record.kind === 'unknown')
          fail('RECEIPT_REQUIRED');
        if (typeof readPayload !== 'function') fail('PAYLOAD_READER_REQUIRED');
        cancelTimer();
        pending = { readPayload };
        const scheduled = pending;
        timer = setTimer(() => {
          if (pending === scheduled) flush();
        }, delay);
        return publish(result('SCHEDULED', { durable: false }));
      } catch (error) {
        return publish(
          result(error.code || 'CONTEXT_REQUIRED', { durable: false }),
        );
      }
    }
    function rememberUnknown(reference) {
      try {
        context(true);
        const ref = receipt(reference);
        // An explicit unknown declaration revokes all queued preparation proof.
        preparations.clear(); activePreparation = null;
        if (memory?.record.kind === 'unknown') {
          const original = memory.record.receipt;
          if (
            original.operationId !== ref.operationId ||
            original.generation !== ref.generation
          )
            fail('RECEIPT_REQUIRED');
          return memory.durable
            ? result('OK', {
                durable: true,
                key,
                batchId: memory.record.batchId,
                kind: 'unknown',
              })
            : write(memory.record);
        }
        const prepared = record('unknown', ref);
        cancelTimer();
        pending = null;
        return write(prepared);
      } catch (error) {
        return publish(
          result(error.code || 'INVALID_RECEIPT', { durable: false }),
        );
      }
    }
    function prepareWrite(reference) {
      try {
        const current = writeContext();
        if (current.writeState === 'unknown') fail('RECEIPT_REQUIRED');
        if (current.canEdit !== true) fail('EDIT_PERMISSION_REQUIRED');
        if (current.pending !== false) fail('PENDING_LOCKED');
        if (memory?.record.kind === 'unknown' || preparations.size)
          fail('RECEIPT_REQUIRED');
        const lineage = registry(); if (lineage.record?.state === 'armed') fail('LINEAGE_UNRESOLVED');
        const ref = receipt(reference),
          prepared = record('unknown', ref),
          reservation = uuid();
        let pinnedBase; try { pinnedBase = JSON.parse(initial.baseVersion); } catch { /* Opaque base remains receipt-unsettleable. */ }
        if (Array.isArray(pinnedBase) && pinnedBase[0] !== ref.generation) fail('BASE_CHANGED');
        cancelTimer();
        pending = null;
        const previousRaw = expectedRaw;
        const saved = write(prepared);
        if (memory?.record.batchId !== prepared.batchId) return saved;
        preparations.set(reservation, {
          raw: memory.raw, previousRaw,
          dispatched: false,
          operationId: ref.operationId,
          generation: ref.generation,
          lifecycle, key, lineageId, baseVersion: initial.baseVersion, registryRaw: saved.ok ? registry().raw : null,
        });
        activePreparation = preparations.get(reservation);
        return { ...saved, reservation };
      } catch (error) {
        return result(error.code || 'PREPARATION_FAILED');
      }
    }
    function markDispatched(reservation) {
      try {
        const admission = writeContext();
        if (admission.canEdit !== true) fail('EDIT_PERMISSION_REQUIRED');
        if (admission.pending !== false) fail('PENDING_LOCKED');
        const prepared = preparations.get(reservation);
        if (!prepared) fail('PREPARATION_REQUIRED');
        if (prepared.dispatched) fail('ALREADY_DISPATCHED');
        if (prepared.lifecycle !== lifecycle || prepared.key !== key || prepared.lineageId !== lineageId) fail('PREPARATION_CHANGED');
        if (!prepared.registryRaw || registry().raw !== prepared.registryRaw) fail('DURABLE_RECEIPT_REQUIRED');
        if (
          memory?.raw !== prepared.raw ||
          !memory.durable ||
          read(key) !== prepared.raw
        )
          fail('DURABLE_RECEIPT_REQUIRED');
        writeContext();
        prepared.dispatched = true;
        return result('OK', {
          operationId: prepared.operationId,
          generation: prepared.generation,
        });
      } catch (error) {
        return result(error.code || 'DISPATCH_MARK_FAILED');
      }
    }
    function cancelPreparedRecord(reservation, rejected = false) {
      try {
        context();
        if (options.canWrite && options.canWrite() !== true)
          fail('RUNTIME_NOT_READY');
        const prepared = preparations.get(reservation);
        if (!prepared) fail('PREPARATION_REQUIRED');
        if (prepared.lifecycle !== lifecycle || prepared.key !== key || prepared.lineageId !== lineageId) fail('PREPARATION_CHANGED');
        if (prepared.dispatched && !rejected) fail('RECEIPT_REQUIRED');
        if (memory?.raw !== prepared.raw) fail('RECORD_CHANGED');
        const stored = read(key);
        if (stored !== prepared.raw && stored !== expectedRaw)
          fail('RECORD_CHANGED');
        context();
        if (options.canWrite && options.canWrite() !== true)
          fail('RUNTIME_NOT_READY');
        const lineage = registry();
        const untouched = !prepared.dispatched && stored !== prepared.raw && stored === prepared.previousRaw && !(lineage.record?.state === 'armed' && lineage.record.anchorKey === key);
        if (!untouched) terminal(memory.record, key, 'aborted', initial.baseVersion);
        if (stored === prepared.raw) {
          storage.removeItem(key);
          if (read(key) !== null) fail('DISCARD_UNCONFIRMED');
          expectedRaw = null;
        }
        memory = null;
        preparations.delete(reservation); activePreparation = null;
        publish(result('EMPTY', { durable: false }));
        return result('OK', {
          key,
          operationId: prepared.operationId,
          notDispatched: true,
        });
      } catch (error) {
        return result(error.code || 'PREPARATION_CANCEL_FAILED');
      }
    }
    function cancelPrepared(reservation) {
      return cancelPreparedRecord(reservation);
    }
    function pathIdentity(path) {
      if (
        !Array.isArray(path) ||
        !path.length ||
        path.length > 32 ||
        path.some(
          (part) => !(id(part) || (exactKeys(part, ['id']) && id(part.id))),
        )
      )
        return null;
      return JSON.stringify(path);
    }
    async function dispatchPrepared(reservation, command, sender, proofOptions) {
      const prepared = preparations.get(reservation);
      if (
        !prepared ||
        prepared.dispatched ||
        typeof sender !== 'function' ||
        !command ||
        command.operationId !== prepared.operationId ||
        command.generation !== prepared.generation ||
        !id(command.action)
      )
        fail('PREPARATION_COMMAND_MISMATCH');
      const pinned = {
        operationId: command.operationId,
        generation: command.generation,
        action: command.action,
        paths:
          Array.isArray(command.guards) && command.guards.length <= 512
            ? command.guards
                .map((guard) => pathIdentity(guard?.path))
                .filter(Boolean)
            : [],
      };
      prepared.commandRaw = JSON.stringify(command); prepared.transportAdmitted = false; prepared.rejectionCapability = proofOptions?.rejectionProof;
      let senderPromise;
      const marked = markDispatched(reservation);
      if (!marked.ok) fail(marked.code);
      try {
        if (
          command.operationId !== pinned.operationId ||
          command.generation !== pinned.generation ||
          command.action !== pinned.action
        ) {
          throw Object.assign(new Error('PREPARATION_COMMAND_CHANGED'), {
            notSent: true,
          });
        }
        // The trusted adapter passes the existing sendPrepared port. This is the
        // only invocation; classification is tied to this exact returned promise.
        senderPromise = sender(command);
        const response = await senderPromise;
        const latest = context();
        let base; try { base = JSON.parse(latest.baseVersion); } catch { /* Opaque bases cannot silently advance. */ }
        if (Array.isArray(base) ? base[0] !== prepared.generation : latest.baseVersion !== prepared.baseVersion) fail('BASE_CHANGED');
        if (options.canWrite && options.canWrite() !== true)
          fail('RUNTIME_NOT_READY');
        if (preparations.get(reservation) !== prepared)
          fail('PREPARATION_CHANGED');
        return response;
      } catch (error) {
        const path = pathIdentity(error?.details?.path);
        const deniedBeforeMutation =
          error?.notSent === true ||
          (pinned.action === 'apply' &&
            error?.status === 409 &&
            error?.message === 'DEPENDENCY_CHANGED_RECONFIRM' &&
            typeof error.requestId === 'string' &&
            /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
              error.requestId,
            ) &&
            path !== null &&
            pinned.paths.includes(path)) || trustedRejection(prepared, reservation, error, command, senderPromise);
        if (
          deniedBeforeMutation &&
          preparations.get(reservation) === prepared
        ) {
          prepared.rejectionProof = error;
          const cancelled = cancelPreparedRecord(reservation, true);
          if (cancelled.ok) {
            if (rejections.size >= 16)
              rejections.delete(rejections.keys().next().value);
            rejections.set(reservation, error);
          }
        }
        throw error;
      }
    }
    function trustedRejection(prepared, reservation, error, command, senderPromise) {
      try {
        const capability = prepared.rejectionCapability, descriptor = Object.getOwnPropertyDescriptor(host, 'SharedDraftRejectionProof'), authority = descriptor?.value;
        if (!capability || typeof capability !== 'object' || !authority || descriptor.writable !== false || descriptor.configurable !== false || !Object.isFrozen(authority) || typeof authority.verify !== 'function' || !senderPromise) return false;
        const current = context(); if (options.canWrite && options.canWrite() !== true) return false;
        let base; try { base = JSON.parse(current.baseVersion); } catch { /* An opaque pin may not silently change. */ }
        if (Array.isArray(base) ? base[0] !== prepared.generation : current.baseVersion !== prepared.baseVersion) return false;
        if (preparations.get(reservation) !== prepared || prepared !== activePreparation || !prepared.dispatched || prepared.lifecycle !== lifecycle || prepared.key !== key || prepared.lineageId !== lineageId || memory?.raw !== prepared.raw || !memory.durable || read(key) !== prepared.raw || registry().raw !== prepared.registryRaw || JSON.stringify(command) !== prepared.commandRaw) return false;
        context(); if (options.canWrite && options.canWrite() !== true) return false;
        // Only the readonly transport authority can verify its opaque capability,
        // original POST error brand and the exact promise this sender returned.
        return authority.verify(capability, error, command, senderPromise) === true;
      } catch { return false; }
    }
    function assertDispatch(command) {
      try {
        const admission = writeContext(); if (admission.canEdit !== true || admission.pending !== false) return false;
        const prepared = activePreparation;
        if (!prepared || !prepared.dispatched || prepared.transportAdmitted || prepared.lifecycle !== lifecycle || prepared.key !== key || prepared.lineageId !== lineageId || registry().raw !== prepared.registryRaw || read(key) !== prepared.raw || !memory?.durable) return false;
        if (JSON.stringify(command) !== prepared.commandRaw) return false;
        writeContext(); prepared.transportAdmitted = true; return true;
      } catch { return false; }
    }
    function retryRejected(reservation, error) {
      const prepared = preparations.get(reservation);
      if (!prepared || prepared.rejectionProof !== error || !error) return result('REJECTION_PROOF_REQUIRED');
      const cancelled = cancelPreparedRecord(reservation, true);
      if (cancelled.ok) rejections.set(reservation, error);
      return cancelled;
    }
    function wasRejected(reservation, error) {
      try {
        context();
        if (options.canWrite && options.canWrite() !== true) return false;
        return (
          rejections.has(reservation) && rejections.get(reservation) === error
        );
      } catch {
        return false;
      }
    }
    function load(target, source = 'storage') {
      context();
      if (source !== 'storage' && source !== 'memory') fail('INVALID_SOURCE');
      if (source === 'memory' && target !== key) fail('NOT_OWNED_MEMORY');
      const sourceOwner = sourceGate(target);
      let lineage;
      try { lineage = registryGate(target, sourceOwner); } catch (error) {
        if (source !== 'memory' || !['STORAGE_READ_FAILED', 'STORAGE_UNAVAILABLE'].includes(error.code)) throw error;
        lineage = { raw: null, record: null, unavailable: error.code };
      }
      const raw = source === 'memory' ? memory?.raw : read(target); if (raw == null) fail('NOT_FOUND');
      return { raw, record: parse(raw, target, sourceOwner, sourceOwner.owner), lineage };
    }
    function ownsRuntime(item) {
      if (options.canWrite && options.canWrite() !== true) return false;
      return (
        (item.runtimeId === runtimeId && sameOwner(item.owner, initial)) ||
        options.ownsRecovery?.({
          key: keyFor(item.owner, item.leaseProtocol, item.lineageId, item.runtimeId),
          lineageId: item.lineageId,
          runtimeId: item.runtimeId,
          leaseProtocol: item.leaseProtocol || 'unclaimed',
          actorId: item.owner.actorId,
          scope: item.owner.scope,
          tabId: item.owner.tabId,
          epoch: item.owner.epoch,
        }) === true
      );
    }
    function editReason(item, current) {
      if (options.canWrite && options.canWrite() !== true)
        return 'RUNTIME_NOT_READY';
      if (
        item.kind === 'unknown' ||
        memory?.record.kind === 'unknown' ||
        current.writeState !== 'idle'
      )
        return 'RECEIPT_REQUIRED';
      if (current.canEdit !== true) return 'EDIT_PERMISSION_REQUIRED';
      if (current.pending !== false) return 'PENDING_LOCKED';
      if (current.verified !== true) return 'LATEST_STATE_REQUIRED';
      if (current.baseVersion !== item.baseVersion) return 'BASE_CONFLICT';
      if (current.hasLocalChanges !== false || pending)
        return 'LOCAL_CHANGES_PRESENT';
      if (!scalar(current.localRevision)) return 'LOCAL_REVISION_REQUIRED';
      return '';
    }
    function restoreReason(item, current) {
      const reason = editReason(item, current);
      if (reason) return reason;
      if (!ownsRuntime(item)) return 'RECOVERY_CLAIM_REQUIRED';
      const target = keyFor(item.owner, item.leaseProtocol, item.lineageId, item.runtimeId);
      registryGate(target, { lineageId: item.lineageId });
      if (!ownsRuntime(item)) return 'RECOVERY_CLAIM_REQUIRED';
      return editReason(item, context());
    }
    function preview(target, source = 'storage') {
      try {
        const { raw, record: item, lineage } = load(target, source),
          current = context();
        const token = uuid();
        if (tickets.size >= 16) tickets.delete(tickets.keys().next().value);
        tickets.set(token, {
          target,
          source,
          raw,
          localRevision: current.localRevision, lifecycle, registryRaw: lineage.raw,
        });
        if (lineage.record?.anchorKey === target && lineage.record.state === 'armed' && (item.kind !== 'unknown' || item.receipt.operationId !== lineage.record.receipt.operationId || item.receipt.generation !== lineage.record.receipt.generation)) fail('LINEAGE_RECORD_MISMATCH');
        if (item.kind === 'unknown' && lineage.record?.state === 'final' && lineage.record.anchorKey === target && lineage.record.receipt.operationId === item.receipt.operationId && lineage.record.receipt.generation === item.receipt.generation) return result('OK', { token, key: target, kind: 'resolved', owner: { ...item.owner }, runtimeId: item.runtimeId, lineageId: item.lineageId, leaseProtocol: item.leaseProtocol, receipt: { ...item.receipt }, baseVersion: item.baseVersion, outcome: lineage.record.outcome, canFinalize: true, canRestore: false, canDiscard: false });
        const reason = lineage.unavailable || restoreReason(item, current),
          canDiscard =
            item.kind === 'local' &&
            memory?.record.kind !== 'unknown' &&
            current.writeState === 'idle' &&
            ownsRuntime(item);
        context();
        return result('OK', {
          token,
          key: target,
          kind: item.kind,
          runtimeId: item.runtimeId,
          lineageId: item.lineageId,
          leaseProtocol: item.leaseProtocol || 'unclaimed',
          owner: { ...item.owner },
          baseVersion: item.baseVersion,
          batchId: item.batchId,
          updatedAt: item.updatedAt,
          durable: source === 'storage' || !!memory?.durable,
          canRestore: !reason,
          reason,
          canDiscard,
          ...(item.kind === 'local'
            ? { payload: item.payload }
            : { receipt: item.receipt }),
        });
      } catch (error) {
        return result(error.code || 'INVALID_RECORD');
      }
    }
    function checkedTicket(token) {
      context();
      const ticket = tickets.get(token);
      if (!ticket || ticket.lifecycle !== lifecycle) fail('PREVIEW_REQUIRED');
      const found = load(ticket.target, ticket.source);
      if (found.raw !== ticket.raw || found.lineage.raw !== ticket.registryRaw) fail('RECORD_CHANGED');
      return { ticket, item: found.record, lineage: found.lineage };
    }
    function restore(token) {
      try {
        const { ticket, item } = checkedTicket(token),
          current = context();
        const reason = restoreReason(item, current);
        if (reason) fail(reason);
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        if (load(ticket.target, ticket.source).raw !== ticket.raw)
          fail('RECORD_CHANGED');
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        const latest = context(),
          lateReason = editReason(item, latest);
        if (lateReason) fail(lateReason);
        if (latest.localRevision !== ticket.localRevision)
          fail('LOCAL_CHANGED');
        let pinnedBase, sourceBase; try { pinnedBase = JSON.parse(initial.baseVersion); sourceBase = JSON.parse(item.baseVersion); } catch { /* Exact opaque base equality remains mandatory. */ }
        if (Array.isArray(pinnedBase) && Array.isArray(sourceBase)) {
          if (![3, 4].includes(pinnedBase.length) || sourceBase.length !== pinnedBase.length || !id(sourceBase[0]) || sourceBase[0] !== pinnedBase[0] || !Number.isSafeInteger(sourceBase[1]) || !Number.isSafeInteger(pinnedBase[1]) || sourceBase[1] < pinnedBase[1] || !(sourceBase[2] === null || id(sourceBase[2])) || sourceBase.length === 4 && (sourceBase[3] !== pinnedBase[3] || !id(sourceBase[3]))) fail('BASE_CONFLICT');
        } else if (initial.baseVersion !== item.baseVersion) fail('BASE_CONFLICT');
        if (item.lineageId !== lineageId) {
          if (memory || pending || preparations.size) fail('LOCAL_CHANGES_PRESENT');
          if (options.adoptLineage?.(item.lineageId) !== true) fail('RECOVERY_CLAIM_REQUIRED');
          lineageId = item.lineageId; key = keyFor(initial, protocol, lineageId, runtimeId); registryKey(lineageId); memory = null; expectedRaw = null; preparations.clear(); activePreparation = null; tickets.clear(); status = result('EMPTY', { durable: false });
        }
        initial.baseVersion = item.baseVersion;
        tickets.delete(token);
        // Return an isolated copy only. Caller must apply locally synchronously;
        // no Apply/Save/Sync, automatic deletion, or remote replay is performed.
        return result('OK', {
          payload: item.payload,
          baseVersion: item.baseVersion,
          batchId: item.batchId,
        });
      } catch (error) {
        return result(error.code || 'RESTORE_FAILED');
      }
    }
    function discard(token) {
      try {
        const { ticket, item } = checkedTicket(token),
          current = context();
        if (
          item.kind === 'unknown' ||
          memory?.record.kind === 'unknown' ||
          current.writeState !== 'idle'
        )
          fail('RECEIPT_REQUIRED');
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        // Discard is local-only: stale base / pending / lost edit permission do
        // not grant a shared mutation and do not trap an owned local record.
        if (ticket.target === key && pending) fail('LOCAL_CHANGES_PRESENT');
        if (ticket.source === 'memory' && !memory?.durable) {
          context();
          memory = null;
          tickets.delete(token);
          publish(result('EMPTY', { durable: false }));
          return result('OK', {
            key,
            source: 'memory',
            durableRecordPreserved: true,
          });
        }
        if (read(ticket.target) !== ticket.raw) fail('RECORD_CHANGED');
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        const latest = context();
        if (latest.writeState !== 'idle' || memory?.record.kind === 'unknown')
          fail('RECEIPT_REQUIRED');
        if (typeof storage.removeItem !== 'function')
          fail('STORAGE_UNAVAILABLE');
        storage.removeItem(ticket.target);
        if (read(ticket.target) !== null) fail('DISCARD_UNCONFIRMED');
        if (ticket.target === key) {
          if (memory?.raw === ticket.raw) memory = null;
          expectedRaw = null;
          if (!memory) publish(result('EMPTY', { durable: false }));
        }
        tickets.delete(token);
        return result('OK', { key: ticket.target });
      } catch (error) {
        return result(error.code || 'STORAGE_REMOVE_FAILED');
      }
    }
    function inventory(historical) {
      try {
        context(); if (!storage || typeof storage.key !== 'function') fail('STORAGE_UNAVAILABLE');
        const items = [], count = storage.length; let incomplete = count > LIMITS.scan;
        if (!Number.isSafeInteger(count) || count < 0) fail('STORAGE_READ_FAILED');
        for (let i = 0; i < Math.min(count, LIMITS.scan); i++) {
          context(); const target = storage.key(i), source = sourceIdentity(target, historical);
          if (source) items.push({ ...source, claimable: source.leaseProtocol === 'web-lock-v1' });
          else if (typeof target === 'string' && target.length <= 1600 && target.startsWith(LEGACY)) {
            let parts; try { parts = JSON.parse(target.slice(LEGACY.length, target.lastIndexOf(':'))); } catch { continue; }
            if (Array.isArray(parts) && parts.length === 4 && parts[0] === initial.actorId && parts[1] === initial.scope) items.push({ key: target, legacy: true, claimable: false, issue: 'UNSUPPORTED_LEGACY' });
          }
          if (items.length >= LIMITS.scanRecords) { incomplete = i + 1 < count; break; }
        }
        context(); return result(incomplete ? 'SCAN_LIMIT' : 'OK', { items, incomplete, complete: !incomplete });
      } catch (error) { return result(error.code || 'STORAGE_READ_FAILED', { items: [] }); }
    }
    function list() {
      return inventory(false);
    }
    function discover() {
      return inventory(options.allowHistory === true);
    }
    function settlementReason(item, evidence) {
      const r = evidence?.receipt,
        flow = evidence?.workflow;
      if (
        item.kind !== 'unknown' ||
        !r ||
        !flow ||
        !id(r.generation) ||
        r.operationId !== item.receipt.operationId ||
        r.generation !== item.receipt.generation ||
        !Number.isSafeInteger(r.revision) ||
        r.revision < 0 ||
        typeof r.unchanged !== 'boolean' ||
        (!r.unchanged && r.revision < 1) ||
        !(r.savedId === null || id(r.savedId)) ||
        !(r.caseId === null || id(r.caseId))
      )
        return 'TERMINAL_RECEIPT_REQUIRED';
      if (
        flow.scope !== initial.scope ||
        flow.generation !== r.generation ||
        !Number.isSafeInteger(flow.revision) ||
        flow.revision < r.revision
      )
        return 'AUTHORITATIVE_READBACK_REQUIRED';
      let base, latest; try { base = JSON.parse(item.baseVersion); latest = JSON.parse(context().baseVersion); } catch { return 'SOURCE_BASE_EVIDENCE_REQUIRED'; }
      const validBase = value => Array.isArray(value) && [3, 4].includes(value.length) && id(value[0]) && Number.isSafeInteger(value[1]) && value[1] >= 0 && (value[2] === null || id(value[2])) && (value.length === 3 || id(value[3]));
      if (!validBase(base) || base[0] !== r.generation) return 'SOURCE_BASE_EVIDENCE_REQUIRED';
      if (r.revision < base[1] || !r.unchanged && r.revision <= base[1]) return 'TERMINAL_RECEIPT_REQUIRED';
      const current = context();
      if (!validBase(latest) || latest.length !== base.length || latest[0] !== flow.generation || latest[1] !== flow.revision || latest[2] !== (flow.saved?.id ?? null) || base.length === 4 && latest[3] !== base[3] || current.verified !== true || current.writeState === 'pending') return 'AUTHORITATIVE_READBACK_REQUIRED';
      return '';
    }
    function settleReceipt(token, evidence) {
      try {
        const { ticket, item } = checkedTicket(token);
        if (ticket.source !== 'storage') fail('DURABLE_RECEIPT_REQUIRED');
        let reason = settlementReason(item, evidence);
        if (reason) fail(reason);
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        if (read(ticket.target) !== ticket.raw) fail('RECORD_CHANGED');
        reason = settlementReason(item, evidence);
        if (reason) fail(reason);
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        context();
        if (typeof storage.removeItem !== 'function')
          fail('STORAGE_UNAVAILABLE');
        const nextBase = context().baseVersion;
        terminal(item, ticket.target, 'receipt', nextBase);
        storage.removeItem(ticket.target);
        if (read(ticket.target) !== null) fail('DISCARD_UNCONFIRMED');
        if (ticket.target === key) {
          initial.baseVersion = nextBase; activePreparation = null;
          if (memory?.raw === ticket.raw) memory = null;
          expectedRaw = null;
          if (!memory) publish(result('EMPTY', { durable: false }));
        }
        tickets.delete(token);
        if (ticket.target === key) preparations.clear();
        return result('OK', {
          key: ticket.target,
          operationId: item.receipt.operationId,
        });
      } catch (error) {
        return result(error.code || 'SETTLEMENT_FAILED');
      }
    }
    function rebaseContext(input) {
        const current = context();
        if (options.canWrite && !options.canWrite()) fail('RUNTIME_NOT_READY');
        if (current.canEdit !== true || current.pending !== false || current.verified !== true || current.writeState !== 'idle') fail('LATEST_STATE_REQUIRED');
        if (!scalar(input?.localRevision) || !scalar(current.localRevision) || input.localRevision !== current.localRevision) fail('LOCAL_CHANGED');
        if (input?.baseVersion !== current.baseVersion) fail('BASE_CONFLICT');
        let before, after; try { before = JSON.parse(initial.baseVersion); after = JSON.parse(input.baseVersion); } catch { fail('SOURCE_BASE_EVIDENCE_REQUIRED'); }
        const flow = input.workflow;
        if (!Array.isArray(before) || ![3, 4].includes(before.length) || !Array.isArray(after) || after.length !== before.length || !id(before[0]) || !id(after[0]) || !(before[2] === null || id(before[2])) || before[0] !== after[0] || after[0] !== flow?.generation || flow?.scope !== initial.scope || !Number.isSafeInteger(before[1]) || !Number.isSafeInteger(after[1]) || before[1] < 0 || after[1] < before[1] || after[1] !== flow.revision || after[2] !== (flow.saved?.id ?? null) || !(after[2] === null || id(after[2])) || before.length === 4 && (before[3] !== after[3] || !id(after[3]))) fail('BASE_CONFLICT');
        return current;
    }
    function rebaseLocal(input) {
      try {
        rebaseContext(input);
        if (memory || pending || preparations.size || expectedRaw !== null || read(key) !== null) fail('LOCAL_CHANGES_PRESENT');
        if (registry().record?.state === 'armed') fail('RECEIPT_REQUIRED');
        rebaseContext(input); initial.baseVersion = input.baseVersion; return result('OK', { baseVersion: initial.baseVersion });
      } catch (error) { return result(error.code || 'REBASE_FAILED'); }
    }
    // Explicit rebase is copy-on-write, never clear-then-overwrite. These three
    // private session ports keep the old source and RAM intact through the
    // asynchronous successor-runtime claim and every storage failure window.
    function prepareRebaseLocal(input) {
      let pin;
      try {
        if (rebasePreparation) fail('REBASE_IN_PROGRESS');
        rebaseContext(input);
        if (!Object.hasOwn(input, 'payload')) fail('PAYLOAD_REQUIRED');
        if (memory?.record.kind === 'unknown' || preparations.size) fail('RECEIPT_REQUIRED');
        pin = { token: uuid(), key, runtimeId, lineageId, protocol, baseVersion: initial.baseVersion, expectedRaw, memory, pending, sequence, lifecycle };
        const lineage = registry(); if (lineage.record?.state === 'armed') fail('RECEIPT_REQUIRED');
        const oldRaw = read(key); if (oldRaw !== expectedRaw) fail('STORAGE_CHANGED');
        if (oldRaw !== null && parse(oldRaw, key, sourceIdentity(key), initial).kind !== 'local') fail('RECEIPT_REQUIRED');
        const nextRuntime = uuid(), nextKey = keyFor(initial, protocol, lineageId, nextRuntime);
        const encoded = boundedJSON({ version: 2, kind: 'local', owner: { actorId: initial.actorId, scope: initial.scope, tabId: initial.tabId, epoch: initial.epoch }, baseVersion: input.baseVersion, runtimeId: nextRuntime, batchId: nextRuntime + ':1', updatedAt: now(), lineageId, leaseProtocol: protocol, payload: input.payload });
        const flow = input.workflow;
        Object.assign(pin, { oldRaw, registryRaw: lineage.raw, nextRuntime, nextKey, encoded,
          input: { baseVersion: input.baseVersion, localRevision: input.localRevision, workflow: { scope: flow.scope, generation: flow.generation, revision: flow.revision, saved: { id: flow.saved?.id ?? null } } } });
        rebasePreparation = pin;
        checkRebase(pin, false);
        return result('OK', { transaction: pin.token, runtimeId: nextRuntime, key: nextKey, leaseProtocol: protocol });
      } catch (error) { if (rebasePreparation === pin) rebasePreparation = null; return result(error.code || 'REBASE_FAILED', { durable: false }); }
    }
    function checkRebase(pin, successorClaim) {
      if (successorClaim && options.ownsRebaseRuntime?.(pin.nextRuntime) !== true) fail('RECOVERY_CLAIM_REQUIRED');
      rebaseContext(pin.input);
      const current = context();
      if (current.baseVersion !== pin.input.baseVersion) fail('BASE_CONFLICT');
      if (current.localRevision !== pin.input.localRevision) fail('LOCAL_CHANGED');
      if (current.canEdit !== true || current.pending !== false || current.verified !== true || current.writeState !== 'idle') fail('LATEST_STATE_REQUIRED');
      if (rebasePreparation !== pin || pin.lifecycle !== lifecycle || pin.key !== key || pin.runtimeId !== runtimeId || pin.lineageId !== lineageId || pin.protocol !== protocol || pin.baseVersion !== initial.baseVersion || pin.expectedRaw !== expectedRaw || pin.memory !== memory || pin.pending !== pending || pin.sequence !== sequence) fail('PREPARATION_CHANGED');
      if (memory?.record.kind === 'unknown' || preparations.size) fail('RECEIPT_REQUIRED');
    }
    function finishRebaseLocal(token) {
      const pin = rebasePreparation;
      try {
        if (!pin || pin.token !== token) fail('PREPARATION_REQUIRED');
        checkRebase(pin, true);
        const before = registry(); if (before.record?.state === 'armed') fail('RECEIPT_REQUIRED');
        if (before.raw !== pin.registryRaw) fail('RECORD_CHANGED');
        if (read(pin.key) !== pin.oldRaw || read(pin.nextKey) !== null) fail('STORAGE_CHANGED');
        checkRebase(pin, true);
        if (typeof storage?.setItem !== 'function') fail('STORAGE_UNAVAILABLE');
        storage.setItem(pin.nextKey, pin.encoded.raw);
        // No old-key overwrite or rollback: even a successful set followed by a
        // failed read/owner check leaves the exact old durable bytes available.
        if (read(pin.nextKey) !== pin.encoded.raw) fail('STORAGE_UNCONFIRMED');
        if (read(pin.key) !== pin.oldRaw) fail('STORAGE_CHANGED');
        if (registry().raw !== pin.registryRaw) fail('RECORD_CHANGED');
        checkRebase(pin, true);
        // No callbacks/await inside this commit. The session swaps its runtime
        // lease immediately on return, retaining the same lineage throughout.
        runtimeId = pin.nextRuntime; key = pin.nextKey; initial.baseVersion = pin.input.baseVersion;
        expectedRaw = pin.encoded.raw; memory = { key, record: pin.encoded.value, raw: expectedRaw, durable: true }; sequence = 1;
        pending = null; timer = null; tickets.clear(); preparations.clear(); activePreparation = null; rejections.clear(); rebasePreparation = null;
        // An already queued timer is harmless: its old pending identity no
        // longer matches. Avoid invoking a timer/observer callback at commit.
        status = result('OK', { durable: true, key, previousKey: pin.key, baseVersion: initial.baseVersion, batchId: memory.record.batchId, kind: 'local' });
        return { ...status };
      } catch (error) {
        if (rebasePreparation === pin) rebasePreparation = null;
        return result(error.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : error.code || 'STORAGE_WRITE_FAILED', { durable: false });
      }
    }
    function cancelRebaseLocal(token) { if (rebasePreparation?.token === token) rebasePreparation = null; }
    function finalizeDisposition(token) {
      try {
        const { ticket, item, lineage } = checkedTicket(token), disposition = lineage.record;
        if (ticket.source !== 'storage' || item.kind !== 'unknown' || disposition?.state !== 'final' || disposition.anchorKey !== ticket.target || disposition.receipt.operationId !== item.receipt.operationId || disposition.receipt.generation !== item.receipt.generation) fail('LOCAL_FINALIZATION_REQUIRED');
        if (!ownsRuntime(item)) fail('RECOVERY_CLAIM_REQUIRED');
        if (read(ticket.target) !== ticket.raw) fail('RECORD_CHANGED');
        context(); storage.removeItem(ticket.target); if (read(ticket.target) !== null) fail('DISCARD_UNCONFIRMED'); context();
        if (ticket.target === key) { memory = null; expectedRaw = null; preparations.clear(); activePreparation = null; initial.baseVersion = disposition.nextBase; }
        tickets.delete(token); return result('OK', { outcome: disposition.outcome, key: ticket.target, baseVersion: disposition.nextBase });
      } catch (error) { return result(error.code || 'FINALIZATION_FAILED'); }
    }
    return Object.freeze({
      schedule,
      cancelScheduled,
      flush,
      rememberUnknown,
      prepareWrite,
      markDispatched,
      cancelPrepared,
      dispatchPrepared,
      wasRejected, assertDispatch, retryRejected, finalizeDisposition, rebaseLocal, prepareRebaseLocal, finishRebaseLocal, cancelRebaseLocal,
      describeKey: target => sourceIdentity(target, true),
      checkClaim(target) { try { const source = sourceIdentity(target, true); if (!source) fail('NOT_OWNED'); registryGate(target, source); return result('OK'); } catch (error) { return result(error.code || 'CLAIM_FAILED'); } },
      freshUnclaimed() { if (memory || preparations.size) return result('RUNTIME_NOT_READY'); protocol = 'unclaimed'; runtimeId = uuid(); lineageId = runtimeId; key = keyFor(initial, protocol, lineageId, runtimeId); return result('OK'); },
      invalidatePrepared: () => {
        lifecycle++; activePreparation = null; rebasePreparation = null; tickets.clear();
        preparations.clear();
        rejections.clear();
      },
      list,
      discover,
      preview,
      restore,
      discard,
      settleReceipt,
      status: () => {
        try {
          context();
          return { ...status, runtimeEpoch: lifecycle, lineageId, baseVersion: initial.baseVersion, hasPending: !!pending, hasMemory: !!memory };
        } catch (error) {
          return result(error.code || 'CONTEXT_REQUIRED');
        }
      },
      close: () => {
        cancelTimer();
        pending = null;
        tickets.clear();
        preparations.clear(); activePreparation = null; rebasePreparation = null;
        rejections.clear();
        closed = true;
      },
      get key() { return key; },
      get runtimeId() { return runtimeId; },
      get lineageId() { return lineageId; },
      get leaseProtocol() { return protocol; },
    });
  }
  host.LocalDraftRecovery = Object.freeze({ create, limits: LIMITS });
})(typeof window === 'undefined' ? globalThis : window);
