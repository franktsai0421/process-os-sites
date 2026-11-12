import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createD1R2Source } from '../lib/snapshot-d1-r2.mjs';
import { exportSnapshot, sha256 } from '../lib/snapshot-contract.mjs';
import { restoreLocalSnapshot } from '../lib/snapshot-local.mjs';
import { fakeDb, fakeBucket, memoryPackage, stage } from './snapshot-fixtures.mjs';

const require = createRequire(import.meta.url);
const load = require('../scripts/ipqc-ab-import-harness.cjs')({ DB: { prepare() { throw Error('REAL_DB_FORBIDDEN'); } },
  STATE_ARCHIVE: { get() { throw Error('REAL_R2_FORBIDDEN'); }, put() { throw Error('REAL_R2_FORBIDDEN'); } } });
const records = load('lib/state-records.ts'), restore = load('lib/state-records-restore.ts');
const boundary = load('lib/master-page-boundary.ts'), draft = load('lib/shared-draft.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const hash = value => createHash('sha256').update(draft.stableDraftJSON(value)).digest('hex');
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false };
const reviewer = { id: 'reviewer-fixture', name: 'Synthetic reviewer', admin: false };
const programCommit = 'd4ac309fe05c89288af226b52c18161865ccdcb8';
const proof = { kind: 'local-platform-proxy', remoteBindings: false, emptyTarget: true };
const jsonTextName = '  { "標準": "Giữ nguyên", "value": 1e2 }  ';
const findings = [], checks = [];
let ids = 0;

async function fixture() {
  const raw = new Map(), media = new Map();
  const bucket = { async put(key, value) { raw.set(key, value); }, async get(key) {
    const value = raw.get(key); return value === undefined ? null : { size: Buffer.byteLength(value), async text() { return value; } };
  } };
  for (const [name, length] of [['approved', 97], ['c-approved', 103], ['history', 109], ['pending', 1024 * 1024 + 17]]) {
    const bytes = new Uint8Array(length); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes[8] = name.length;
    const id = await sha256(bytes); media.set(name, { key: 'delivery/media/' + id, data: bytes,
      httpMetadata: { contentType: 'image/png' }, customMetadata: { label: name } });
  }
  const photo = name => '/api/state-media?id=' + media.get(name).key.split('/').at(-1);
  const catalog = line => ({ products: [{ id: 'p-' + line, code: 'P-' + line, name: 'Product ' + line, line,
    category: 'Group', stages: [line + '-1'], routeMode: 'exception', photo: photo(line === 'A' ? 'approved' : 'c-approved') }],
    lines: [{ id: 'l-' + line, code: line, name: line, stages: [{ id: 's-1', code: line + '-1', name: 'Stage' }] }],
    categoryGroups: [{ id: 'g-' + line, line, name: 'Group', defaultStages: [line + '-1'] }], extra: { retain: true } });
  const root = { active: { AB: catalog('A'), C: catalog('C'), PROCESS: { 'A-1': [{ id: 'flow-a', name: 'Máy',
    presetKey: 'machine-assembly', equipment: [{ id: 'machine-a', stageCode: 'A-1', line: 'A', kind: 'machine-assembly',
      name: 'Synthetic machine', number: 'M-1', mediaItems: [{ src: photo('approved') }] }] }] } },
    versions: [], workflowScopes: {}, unknownRoot: { literal: jsonTextName, untouched: ['保留', 'Việt'] } };
  const versions = { AB: 'approved-ab', C: 'approved-c', PROCESS: 'approved-process' };
  for (const scope of ['AB', 'C', 'PROCESS']) {
    root.versions.push({ id: versions[scope], scope, status: 'approved', snapshot: structuredClone(root.active[scope]), number: 1 });
    root.workflowScopes[scope] = plain(draft.createSharedDraft('master:' + scope, root.active[scope], versions[scope], 'generation-' + scope));
  }
  const historic = structuredClone(root.active.AB); historic.products[0].photo = photo('history');
  root.versions.push({ id: 'retained-history', scope: 'AB', status: 'superseded', snapshot: historic, number: 0 });
  let flow = root.workflowScopes.AB, sequence = 0;
  const context = actor => ({ actor, at: '2026-11-09T00:00:00Z', id: () => 'generated-' + ++ids, allowed: () => true,
    activeId: versions.AB, structure() {}, validate: () => [], semantic: value => value });
  const run = (action, extra = {}, actor = author) => {
    const command = { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture', sequence: ++sequence,
      generation: flow.generation, ...extra };
    flow = draft.applyDraftCommand(flow, command, context(actor)).state; return command;
  };
  const namePath = ['products', { id: 'p-A' }, 'name'], photoPath = ['products', { id: 'p-A' }, 'photo'];
  const originalCommand = run('apply', { patches: [{ op: 'set', path: namePath, value: jsonTextName },
    { op: 'set', path: photoPath, value: photo('pending') }], guards: [{ path: namePath, value: 'Product A' }] });
  run('save'); run('submit', { savedId: flow.saved.id, expectedRevision: flow.revision, reason: 'Synthetic pending' });
  root.workflowScopes.AB = plain(flow);
  root.versions.push({ id: flow.pendingId, scope: 'AB', status: 'pending', snapshot: plain(flow.cases.at(-1).content), number: 2 });
  const values = { masterDataControl: JSON.stringify(root),
    platformUsers: JSON.stringify([author, reviewer].map(actor => ({ ...actor, role: 'staff', passwordHash: 'SYNTHETIC_VERIFIER_ONLY' }))),
    unknownFormatting: ' { "number": 1e2, "zero": -0, "unicode": "Việt 😀" } ' };
  const envelope = JSON.parse(await records.encodeRecordValues(bucket, values));
  const source = { revision: 42, root }, pins = { revision: 42, rootDigest: hash(root), versions };
  return { raw, bucket, media, values, envelope, source, pins, originalCommand, context };
}
function bridge(bucket) {
  return { async get(key) { const object = await bucket.get(key); return !object ? null : { size: object.size,
    async text() { return new Response(object.body).text(); } }; } };
}
async function transferFixture(f) {
  f ??= await fixture();
  const bucket = fakeBucket([...f.raw].map(([key, raw]) => ({ key, data: encode(raw), httpMetadata: { contentType: 'application/json' } }))
    .concat([...f.media.values()]));
  const values = JSON.stringify(f.envelope);
  const db = fakeDb({ shared_state: [{ id: 1, revision: 42, values, updated_at: 'synthetic-time' }],
    state_backups: ['older-a', 'older-b'].map(id => ({ id, revision: 41, values, reason: 'Synthetic retained backup', actor: author.id, created_at: 'synthetic-time' })),
    web_feedback_store: [{ id: 1, revision: 0, payload: '{"issues":[],"attachments":[],"batches":[],"handoffs":[]}' }] });
  return { ...f, db, transferBucket: bucket };
}
const sourceFor = f => createD1R2Source({ db: f.db, bucket: f.transferBucket, programCommit });
async function pack(f) { const result = memoryPackage(); await exportSnapshot(await sourceFor(f), result); return result; }
async function check(name, run) { await run(); checks.push(name); }

await check('exact record retention restores every original business field, pending case and receipt before preview', async () => {
  const f = await fixture(), before = JSON.stringify(f.source), originalObjects = [...f.raw];
  await restore.verifiedRecordRestore(f.bucket, f.envelope);
  const decoded = await records.decodeRecordValues(f.bucket, f.envelope), root = JSON.parse(decoded.values.masterDataControl);
  assert.deepEqual(root, f.source.root);
  for (const [key, raw] of Object.entries(f.values)) assert.equal(await records.readImmutableRecord(f.bucket, f.envelope.__processRecords.legacySources[key]), raw);
  const preview = await boundary.previewMasterPageSplit({ revision: 42, root }, f.pins);
  assert.deepEqual(plain(preview.retainedSource.content), f.source.root);
  assert.equal(root.workflowScopes.AB.pendingId, f.source.root.workflowScopes.AB.pendingId);
  assert.equal(root.unknownRoot.literal, jsonTextName);
  const flow = root.workflowScopes.AB, replay = draft.applyDraftCommand(flow, f.originalCommand, f.context(author));
  assert.equal(replay.state, flow);
  assert.deepEqual(plain(replay.receipt), plain(flow.receipts[f.originalCommand.operationId].result));
  assert.equal(JSON.stringify(f.source), before); assert.deepEqual([...f.raw], originalObjects);
});
await check('verified but still-deferred history cannot substitute for a fully hydrated cutoff source', async () => {
  const f = await fixture(), deferred = await restore.verifiedRecordRestore(f.bucket, f.envelope);
  await assert.rejects(boundary.previewMasterPageSplit({ revision: 42, root: JSON.parse(deferred.values.masterDataControl) }, f.pins),
    e => e.code === 'MASTER_PAGE_SOURCE_NOT_HYDRATED');
});
await check('missing/corrupt historical bodies and original legacy strings stop record verification', async () => {
  for (const mode of ['missing-history', 'corrupt-history', 'missing-original-source', 'corrupt-original-source']) {
    const f = await fixture(), aggregate = JSON.parse(await records.readImmutableRecord(f.bucket, f.envelope.__processRecords.values.masterDataControl));
    const key = mode.endsWith('history') ? aggregate.versions.find(v => v.id === 'retained-history').snapshot.__immutableBody.key
      : f.envelope.__processRecords.legacySources.masterDataControl.key;
    if (mode.startsWith('missing')) f.raw.delete(key); else f.raw.set(key, '{"corrupt":true}');
    const before = JSON.stringify(f.envelope);
    await assert.rejects(restore.verifiedRecordRestore(f.bucket, f.envelope), /missing|corrupt/i);
    assert.equal(JSON.stringify(f.envelope), before);
  }
});
await check('partial records reads cannot become a backup or silently overwrite the complete source', async () => {
  const f = await fixture(), partial = await records.decodeRecordValues(f.bucket, f.envelope, { keys: ['masterDataControl'] });
  const before = [...f.raw];
  assert.equal(partial.recordStorage.partial, true);
  await assert.rejects(records.encodeRecordValues(f.bucket, partial.values, partial.recordStorage), /Partial read cannot be saved/);
  assert.deepEqual([...f.raw], before);
});
await check('redacted distribution roundtrip preserves media coverage but is refused as an exact cutoff/receipt backup', async () => {
  const f = await transferFixture(), packageData = await pack(f), db = fakeDb(), bucket = fakeBucket(), staging = stage();
  await restoreLocalSnapshot(packageData, { db, bucket, staging, proof });
  assert.equal(staging.receipt.dataReady, true); assert.equal(staging.receipt.authReady, false);
  assert.equal(db.tables.state_backups.length, 2);
  for (const media of f.media.values()) {
    const restored = bucket.objects.get(media.key); assert.ok(restored); assert.deepEqual(restored.data, media.data);
  }
  const restoredEnvelope = JSON.parse(db.tables.shared_state[0].values);
  const decoded = await records.decodeRecordValues(bridge(bucket), restoredEnvelope), root = JSON.parse(decoded.values.masterDataControl);
  assert.equal(root.workflowScopes.AB.pendingId, f.source.root.workflowScopes.AB.pendingId);
  assert.equal(root.versions.length, f.source.root.versions.length);
  assert.equal(JSON.parse(decoded.values.platformUsers)[0].id, author.id);
  assert.equal(JSON.parse(decoded.values.platformUsers)[0].passwordHash, undefined);
  // The distribution port recursively parses JSON-looking strings. That can
  // normalize literal business text AND its original operation fingerprint.
  const oldFingerprint = f.source.root.workflowScopes.AB.receipts[f.originalCommand.operationId].fingerprint;
  const newFingerprint = root.workflowScopes.AB.receipts[f.originalCommand.operationId].fingerprint;
  assert.notEqual(root.unknownRoot.literal, jsonTextName); assert.notEqual(oldFingerprint, newFingerprint);
  await assert.rejects(boundary.previewMasterPageSplit({ revision: 42, root }, f.pins), e => e.code === 'MASTER_PAGE_SOURCE_CHANGED');
  assert.throws(() => draft.applyDraftCommand(root.workflowScopes.AB, f.originalCommand, f.context(author)), e => e.code === 'OPERATION_ID_REUSED');
  assert.equal(f.db.writes, 0); assert.equal(f.transferBucket.writes, 0);
  findings.push({ code: 'DISTRIBUTION_SNAPSHOT_IS_NOT_EXACT_RECOVERY_BACKUP', sourceRootDigest: f.pins.rootDigest,
    restoredRootDigest: hash(root), originalReceiptFingerprintDigest: createHash('sha256').update(oldFingerprint).digest('hex'),
    restoredReceiptFingerprintDigest: createHash('sha256').update(newFingerprint).digest('hex'),
    status: 'EXPECTED_PORT_LIMITATION_WITH_SAFE_CUTOFF_REJECTION', realData: false });
});
await check('history-only and pending-only missing media prevent a completed distribution snapshot', async () => {
  for (const name of ['history', 'pending']) {
    const f = await transferFixture(); f.transferBucket.objects.delete(f.media.get(name).key);
    const result = memoryPackage();
    await assert.rejects(async () => exportSnapshot(await sourceFor(f), result), /REFERENCE_MISSING/);
    assert.equal(result.completed, undefined); assert.equal(f.db.writes, 0); assert.equal(f.transferBucket.writes, 0);
  }
});
await check('source revision drift rejects export completion without exporter writes', async () => {
  const f = await transferFixture(), source = await sourceFor(f), result = memoryPackage();
  f.transferBucket.onGet = () => { f.db.tables.shared_state[0].revision = 43; };
  await assert.rejects(exportSnapshot(source, result), /SOURCE_CHANGED/);
  assert.equal(result.completed, undefined); assert.equal(result.aborted, true);
  assert.equal(f.db.writes, 0); assert.equal(f.transferBucket.writes, 0);
});
await check('corrupt transport and existing destination both refuse without publishing an isolated database', async () => {
  const f = await transferFixture(), packageData = await pack(f);
  packageData.chunks.get('c0')[0] ^= 1;
  const db = fakeDb(), bucket = fakeBucket(), staging = stage();
  await assert.rejects(restoreLocalSnapshot(packageData, { db, bucket, staging, proof }), /INTEGRITY/);
  assert.equal(db.writes, 0); assert.equal(bucket.writes, 0); assert.equal(staging.receipt, undefined);
  const existing = fakeDb({ state_backups: [{ id: 'retained-sentinel' }] }), before = JSON.stringify(existing.tables);
  await assert.rejects(restoreLocalSnapshot(await pack(f), { db: existing, bucket: fakeBucket(), staging: stage(), proof }), /TARGET_NOT_EMPTY/);
  assert.equal(existing.writes, 0); assert.equal(JSON.stringify(existing.tables), before);
});

console.log(JSON.stringify({ status: 'PASS', checks, findings,
  scope: { syntheticBindings: true, isolatedTargetOnly: true, realDatabase: false, realR2: false,
    network: false, newOwnerAdoption: false, permissionPolicy: false, migration: false, deployment: false } }, null, 2));
