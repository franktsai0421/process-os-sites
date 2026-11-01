// Wire seam only: actual production TS route Responses enter the complete
// routine frontend IIFE plus current shared client. SQLite/R2/signers/storage
// are ephemeral synthetic ports. No listener/browser/native-site timing claim.
// Run with --experimental-vm-modules for the production history-module import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture as frontendFixture} from './fixtures/routine-fqc-durable.mjs';
import {workflowFixture, copy, hash, manifest, faultRef, assertReadOnly} from './scoped-workflow-read-benchmark.mjs';

async function withBridge({disabled = false, brokenSource = false, revokeAtTerminal = false} = {}, body) {
  const server = await workflowFixture({transform(values) {
    const control = JSON.parse(values.routineFqcControl);
    control.startDate = '2026-10-31';
    // The older GET fixture uses a non-UI synthetic scope. This seam explicitly
    // seeds the production canonical document scope; it does not fake a route.
    for (const document of control.documents) document.flow.scope = 'routine-fqc:' + document.id;
    values.routineFqcControl = JSON.stringify(control);
    if (disabled) values.routineFqcEnabled = '0';
  }});
  let client;
  try {
    const initialValues = await server.decoded(), initialControl = JSON.parse(initialValues.routineFqcControl);
    if (brokenSource) faultRef(server, manifest(server).__processRecords.values.qualityMasterControl, 'missing');
    if (revokeAtTerminal) server.hooks.set('revocation.before', event => {if (event.count === 4) server.revoke();});
    client = frontendFixture({actor: server.user.id, cold: true});
    assert.equal(client.sync.identity.id, server.user.id);
    const route = server.load('app/api/routine-fqc/route.ts');
    const bridge = {server, client, initialControl, initialRevision: server.row().revision, calls: [], beforeDispatch: null};
    /** @param {string} input @param {RequestInit} [options] */
    const fetchFromRoute = async (input, options = {}) => {
      const url = new URL(input, 'https://fixture.invalid'), method = options.method || 'GET';
      assert.equal(url.origin, 'https://fixture.invalid'); assert.equal(url.pathname, '/api/routine-fqc');
      assert.equal(url.search, '', 'no availability/receipt/compact/FQC-ack projection request');
      assert.ok(['GET', 'POST'].includes(method));
      await bridge.beforeDispatch?.(method, bridge.calls.length);
      const row = {method, path: url.pathname, status: null, counters: null, payload: null}; bridge.calls.push(row);
      // Bind this in-memory fixture's signed session and same-origin credentials
      // only at the transport port. Never log bodies, headers or signer bytes.
      const headers = new Headers(options.headers);
      for (const [key, value] of Object.entries(server.headers)) headers.set(key, value);
      const request = new Request(url, {method, headers, ...(method === 'POST' ? {body: options.body} : {})});
      const before = server.row(), objects = [...server.objects]; server.reset();
      const response = await route[method](request);
      row.status = response.status; row.counters = {...server.stats}; row.payload = await response.clone().json();
      if (method === 'GET') assertReadOnly(server, before, objects);
      return response; // Unmodified real Response, not a hand-built expected DTO.
    };
    client.box.fetch = fetchFromRoute;
    await body(bridge);
  } finally {
    if (client) client.box.fetch = undefined;
    server.close();
  }
}
const navigationError = client => client.win.RoutineFQCUI.navigation.error();
const methods = bridge => bridge.calls.map(call => call.method);
function completeAdoption(bridge, index = 0) {
  const adopted = copy(bridge.client.api.getData()), delivered = bridge.calls[index].payload;
  assert.equal(hash(JSON.stringify(adopted)), hash(JSON.stringify(delivered)), 'adopt the exact full real DTO');
  assert.equal(adopted.identity.id, bridge.server.user.id); assert.equal(adopted.permissions.view, true);
  assert.ok(Array.isArray(adopted.sources)); assert.ok(adopted.catalog); assert.ok(adopted.today);
  assert.ok(Number.isSafeInteger(adopted.revision)); assert.ok(Number.isSafeInteger(adopted.control.revision));
  assert.deepEqual(adopted.control.receipts, {});
  for (const document of adopted.control.documents) {
    assert.equal(document.flow.scope, 'routine-fqc:' + document.id);
    assert.deepEqual(document.flow.receipts, {}); assert.deepEqual(document.flow.sequences, {});
  }
  assert.equal(navigationError(bridge.client), null);
}
function seedUnknown(bridge) {
  const {client, server, initialControl, initialRevision} = bridge, runtime = randomUUID();
  // Durable reference only, not a command/body or invented terminal proof.
  const meta = {protocol: 1, endpoint: '/api/routine-fqc', actor: server.user.id, runtime, epoch: 1,
    operationId: 'synthetic-persisted-unknown', action: 'generate', documentId: null, innerAction: null,
    generation: null, documentRevision: null, aggregateRevision: initialControl.revision, globalRevision: initialRevision,
    caseId: null, savedId: null, pendingId: null, submitSavedId: null, restoreSaveId: null, requestedRevision: null};
  const key = 'routine-fqc-receipt-v1:' + encodeURIComponent(meta.actor) + ':' + runtime + ':' + meta.operationId;
  client.store.map.set(key, JSON.stringify(meta)); return [...client.store.map];
}

test('actual full route DTO enters history mount with exactly one GET and no availability request', () => withBridge({}, async bridge => {
  const {client} = bridge;
  client.afterImport(() => {assert.equal(client.api.getData(), undefined); assert.deepEqual(methods(bridge), ['GET']);});
  await client.mount(true);
  assert.deepEqual(methods(bridge), ['GET']); assert.equal(bridge.calls[0].status, 200);
  assert.equal(bridge.calls[0].counters.sql, 5); assert.equal(client.imports.length, 1);
  completeAdoption(bridge); assert.equal(client.store.map.size, 0);
}));

test('actual full route DTO discovers but cannot settle a persisted unknown or auto-generate', () => withBridge({}, async bridge => {
  const original = seedUnknown(bridge), {client} = bridge;
  client.afterImport(() => {assert.ok(client.api.s.retry); assert.equal(client.api.getData(), undefined);});
  await client.mount(false);
  assert.deepEqual(methods(bridge), ['GET']); assert.equal(bridge.calls[0].status, 200); completeAdoption(bridge);
  assert.deepEqual([...client.store.map], original); assert.equal(client.api.s.retry.operationId, 'synthetic-persisted-unknown');
  assert.equal(client.api.record().terminal, null); assert.match(client.api.s.error, /待確認/);
}));

test('actual generate GET POST GET retains durable proof until the distinct fresh readback', () => withBridge({}, async bridge => {
  const {client, server} = bridge;
  bridge.beforeDispatch = (method, index) => {
    if (index === 2) {
      assert.equal(method, 'GET'); assert.equal(client.store.map.size, 1);
      assert.equal(client.api.record().meta.action, 'generate'); assert.ok(client.api.record().terminal);
      assert.equal(client.api.getData().revision, bridge.initialRevision, 'initial DTO is not fabricated into the confirmed state');
    }
  };
  await client.mount(false);
  assert.deepEqual(methods(bridge), ['GET', 'POST', 'GET']); assert.ok(bridge.calls.every(call => call.status === 200));
  assert.equal(bridge.calls[0].counters.sql, 5); assert.equal(bridge.calls[2].counters.sql, 5);
  assert.equal(bridge.calls[1].counters.cas, 1); assert.ok(bridge.calls[1].counters.put > 0);
  assert.ok(Number.isSafeInteger(bridge.calls[1].payload.result.generated));
  assert.equal(bridge.calls[2].payload.control.revision, bridge.calls[1].payload.revision);
  assert.equal(server.row().revision, bridge.initialRevision + 1); completeAdoption(bridge, 2);
  assert.equal(client.store.map.size, 0); assert.equal(client.api.s.retry, null); assert.equal(client.api.record(), null);
}));

for (const scenario of [
  {name: 'healthy disabled', status: 404, code: 'FQC_NOT_ENABLED'},
  {name: 'disabled with required source missing', status: 503, code: 'FQC_READ_FAILED', brokenSource: true},
  {name: 'disabled with terminal token revocation', status: 401, code: 'LOGIN_REQUIRED', revokeAtTerminal: true},
]) test('actual ' + scenario.name + ' maps only exact 404 to disabled UI', () => withBridge({disabled: true, ...scenario}, async bridge => {
  const {client} = bridge;
  await client.mount(false);
  assert.deepEqual(methods(bridge), ['GET']); assert.equal(bridge.calls[0].status, scenario.status);
  assert.equal(bridge.calls[0].payload.error, scenario.code); assert.deepEqual(Object.keys(bridge.calls[0].payload), ['error']);
  assert.equal(client.api.getData(), undefined); assert.equal(client.imports.length, 0); assert.equal(client.store.map.size, 0);
  if (scenario.status === 404) {assert.equal(navigationError(client), null); assert.match(client.root.innerHTML, /例行檢查準備中/);}
  else {assert.equal(navigationError(client)?.message, scenario.code); assert.equal(navigationError(client)?.status, scenario.status); assert.equal(client.root.innerHTML, 'loading');}
  if (scenario.revokeAtTerminal) assert.equal(bridge.calls[0].counters.revocation, 4);
}));
