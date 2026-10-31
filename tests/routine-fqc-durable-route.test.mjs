import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Actual Workers route and production routine/shared-draft kernels. The only
// substitutes are ephemeral SQLite, Map-backed R2, and a synthetic signed user;
// no listener, fetch, persistent database, employee data, or remote binding.
const require = createRequire(import.meta.url);
const harness = require('../scripts/ipqc-ab-import-harness.cjs');
const protectBackups = require('../scripts/automatic-backup-fixture.cjs');
const routineUISource = fs.readFileSync('public/process/routine-fqc.js', 'utf8');
const sharedClientSource = fs.readFileSync('public/process/shared-draft-client.js', 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const schemaFiles = [
  'drizzle/0000_conscious_skin.sql',
  'drizzle/0001_woozy_roxanne_simpson.sql',
  'drizzle/0002_local_feedback_sessions.sql',
  'drizzle/0003_login_limits.sql',
];

async function fixture(t, { withPeer = false } = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of schemaFiles) db.exec(fs.readFileSync(file, 'utf8'));
  const verifyBackups = protectBackups(db);
  const objects = new Map([
    ['fixture/unrelated-retained-object', { bytes: Buffer.from('synthetic retained bytes'), options: {} }],
  ]);
  const counts = { post: 0, get: 0, receiptGet: 0, stateGet: 0, dbRun: 0, r2Put: 0, r2Head: 0 };
  const env = {
    PROCESS_SESSION_SECRET: randomUUID(),
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() { return db.prepare(sql).get(...args) || null; },
          async all() { return { results: db.prepare(sql).all(...args) }; },
          async run() {
            counts.dbRun++;
            return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
          },
        };
      },
    },
    STATE_ARCHIVE: {
      async head(key) { counts.r2Head++; return objects.has(key) ? {} : null; },
      async put(key, value, options) {
        counts.r2Put++;
        objects.set(key, { bytes: Buffer.from(value), options: structuredClone(options) });
      },
      async get(key) {
        const item = objects.get(key);
        if (!item) return null;
        const bytes = item.bytes;
        return {
          body: bytes,
          text: async () => bytes.toString(),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          httpMetadata: item.options?.httpMetadata,
        };
      },
    },
  };
  const load = harness(env);
  const core = load('lib/process-state.ts');
  const model = load('lib/routine-fqc.ts');
  const route = load('app/api/routine-fqc/route.ts');
  const today = model.companyDate();
  const user = {
    id: 'fixture-route-admin', name: 'Synthetic route administrator',
    role: 'admin', enabled: true, inheritRole: false,
    accessOverrides: Object.fromEntries([
      'routine.view', 'routine.edit', 'routine.save', 'routine.submit',
      'routine.withdraw', 'routine.approve', 'routine.return', 'routine.history',
      'routine.create', 'routine.delete', 'routine.settings',
      'approval.revoke', 'approval.revise',
    ].map((key) => [key, true])),
  };
  const peer = withPeer ? { ...clone(user), id: 'fixture-route-peer', name: 'Synthetic independent peer' } : null;
  const values = {
    platformUsers: JSON.stringify(peer ? [user, peer] : [user]),
    routineFqcEnabled: '1', sentinel: 'unrelated synthetic module bytes',
    qualityMasterControl: JSON.stringify({ libraries: { fqc: {
      activeVersionId: 'fixture-approved-source',
      versions: [{
        id: 'fixture-approved-source', number: 1, status: 'approved',
        reviewedAt: today + 'T00:00:00Z',
        snapshot: { errors: [], items: [{
          id: 'fixture-item', name: 'Synthetic weekly check', checkNo: 'SYNTHETIC-1',
          line: 'A', category: 'QA', isEnabled: true, productCodes: ['FIXTURE-A'],
          rule: { cadence: 'time', timeFrequency: 'weekly' },
        }] },
      }],
    } } }),
  };
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
    .run(JSON.stringify(values), 'synthetic fixture initialization');
  const base = 'https://routine-fixture.invalid';
  const url = base + '/api/routine-fqc';
  const cookies = { owner: 'process_demo=' + await core.demoSession(new Request(url), user.id, false) };
  if (peer) cookies.peer = 'process_demo=' + await core.demoSession(new Request(url), peer.id, false);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all().map((row) => row.name);
  const persisted = () => ({
    tables: tables.map((name) => [name, clone(db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all())]),
    objects: [...objects].map(([key, item]) => [key, item.bytes.toString('base64'), clone(item.options || {})]),
  });
  const storedValues = () => JSON.parse(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values);
  const control = () => model.parseRoutine(storedValues()[model.RF_KEY]);
  const document = (id) => control().documents.find((item) => item.id === id);
  let sequence = 0;
  async function dispatch(input, options = {}, actor = 'owner') {
    const target = new URL(input, base);
    assert.equal(target.origin, base);
    assert.equal(target.pathname, '/api/routine-fqc');
    const method = options.method || 'GET';
    assert.ok(Object.hasOwn(cookies, actor), 'only an initialized signed fixture actor may dispatch');
    assert.ok(['GET', 'POST'].includes(method), 'fixture dispatch only admits the actual routine handlers');
    if (method === 'POST') counts.post++;
    else {
      counts.get++;
      if (target.searchParams.has('operationId')) counts.receiptGet++;
      else counts.stateGet++;
    }
    return route[method](new Request(target, {
      ...options, method,
      headers: { ...options.headers, Cookie: cookies[actor], Origin: base, 'Content-Type': 'application/json' },
    }));
  }
  async function get(query = '') {
    const response = await dispatch(url + query);
    return { status: response.status, body: await response.json() };
  }
  async function post(command, actor = 'owner') {
    const response = await dispatch(url, { method: 'POST', body: JSON.stringify(command) }, actor);
    return { status: response.status, body: await response.json() };
  }
  const command = (action, extra = {}) => ({
    action, operationId: randomUUID(), expectedRevision: control().revision, ...extra,
  });
  const draft = (id, action, extra = {}) => {
    const operationId = randomUUID();
    return {
      action: 'draft', documentId: id, operationId,
      command: {
        action, operationId, generation: document(id).flow.generation,
        clientId: 'synthetic-route-client', sequence: ++sequence,
        ...(['save', 'submit'].includes(action) ? { expectedRevision: document(id).flow.revision } : {}),
        ...extra,
      },
    };
  };
  async function accepted(command) {
    const response = await post(command);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.match(response.body.requestId, uuid, 'original POST carries a server request UUID');
    return response.body;
  }
  const delta = (before) => Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - before[key]]));
  async function createPlan() {
    await accepted(command('configure', { startDate: today }));
    await accepted(command('generate'));
    const jobs = control().jobs;
    assert.equal(jobs.length, 1);
    return (await accepted(command('create-plan', { jobIds: [jobs[0].id] }))).result.documentId;
  }
  async function approve(id) {
    await accepted(draft(id, 'save'));
    await accepted(draft(id, 'submit', { savedId: document(id).flow.saved.id, reason: 'Synthetic submission' }));
    await accepted(draft(id, 'approve', {
      caseId: document(id).flow.pendingId, reason: 'Synthetic review', selfReviewConfirmed: true,
    }));
  }
  return { counts, persisted, verifyBackups, storedValues, control, document, dispatch, get, post, command, draft, accepted, delta, createPlan, approve };
}

async function rejectedWithoutCommit(f, command, status, code) {
  const before = f.persisted(), counts = { ...f.counts };
  const response = await f.post(command);
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.error, code);
  assert.match(response.body.requestId, uuid, 'the original definitive POST rejection has its own request UUID');
  assert.notEqual(response.body.requestId, command.operationId, 'request UUID is not the operation receipt identity');
  assert.equal(response.body.result, undefined);
  assert.deepEqual(f.persisted(), before, 'rejected POST preserves all SQLite rows, revisions, histories, receipts, and R2 bytes');
  assert.equal(f.delta(counts).dbRun, 0, 'rejection is before any persistence/CAS write');
  assert.equal(f.delta(counts).r2Put, 0, 'rejection is before any R2 write');
  assert.equal(f.control().receipts[command.operationId], undefined);
  const receipt = await f.get('?operationId=' + encodeURIComponent(command.operationId));
  assert.equal(receipt.status, 404);
  assert.deepEqual(receipt.body, { error: 'OPERATION_NOT_FOUND' }, 'receipt GET 404 has no original POST request UUID');
  assert.deepEqual(f.persisted(), before, 'missing receipt read is also side-effect free');
  assert.deepEqual(f.delta(counts), {
    post: 1, get: 1, receiptGet: 1, stateGet: 0, dbRun: 0, r2Put: 0,
    r2Head: code === 'PHOTO_NOT_UPLOADED' ? 1 : 0,
  });
  f.verifyBackups();
  return response.body;
}

test('actual routine route: original rejection status/code provenance and pre-CAS atomicity', async (t) => {
  const f = await fixture(t), planId = await f.createPlan();
  await t.test('draft apply: DEPENDENCY_CHANGED_RECONFIRM is 409', async () => {
    const body = await rejectedWithoutCommit(f, f.draft(planId, 'apply', {
      patches: [{ op: 'set', path: ['notes'], value: 'Local unsent edit' }],
      guards: [{ path: ['notes'], value: 'Stale observed value' }],
    }), 409, 'DEPENDENCY_CHANGED_RECONFIRM');
    assert.deepEqual(body.details.path, ['notes']);
  });
  await t.test('draft apply: PHOTO_NOT_UPLOADED is 422 even after the request-local kernel transition', async () => {
    const body = await rejectedWithoutCommit(f, f.draft(planId, 'apply', {
      patches: [{ op: 'set', path: ['evidence'], value: ['a'.repeat(64)] }],
      guards: [{ path: ['evidence'], value: [] }],
    }), 422, 'PHOTO_NOT_UPLOADED');
    assert.equal(body.details.issues[0].message, 'PHOTO_NOT_UPLOADED');
  });
  await t.test('draft save: DRAFT_REVISION_CHANGED_RECONFIRM is 409', async () => {
    await rejectedWithoutCommit(f, f.draft(planId, 'save', {
      expectedRevision: f.document(planId).flow.revision + 1,
    }), 409, 'DRAFT_REVISION_CHANGED_RECONFIRM');
  });
  await t.test('generic create-plan: JOB_ALREADY_ASSIGNED is 409', async () => {
    await rejectedWithoutCommit(f, f.command('create-plan', {
      jobIds: [f.control().jobs[0].id],
    }), 409, 'JOB_ALREADY_ASSIGNED');
  });
  await t.test('actual wrong workflow state: CASE_NOT_PENDING is 409, not an invented status/code pair', async () => {
    await rejectedWithoutCommit(f, f.draft(planId, 'withdraw', {
      caseId: 'synthetic-no-pending-case', reason: 'Synthetic wrong-state attempt',
    }), 409, 'CASE_NOT_PENDING');
  });
  await t.test('draft submit: UNSAVED_CHANGES_SAVE_REQUIRED is 409', async () => {
    await f.accepted(f.draft(planId, 'save'));
    await f.accepted(f.draft(planId, 'apply', {
      patches: [{ op: 'set', path: ['notes'], value: 'Applied but not saved' }],
      guards: [{ path: ['notes'], value: '' }],
    }));
    await rejectedWithoutCommit(f, f.draft(planId, 'submit', {
      savedId: f.document(planId).flow.saved.id, reason: 'Synthetic unsaved submission',
    }), 409, 'UNSAVED_CHANGES_SAVE_REQUIRED');
  });
  await f.approve(planId);
  const reportId = (await f.accepted(f.command('create-report', { documentId: planId }))).result.documentId;
  await t.test('draft submit: VALIDATION_FAILED is 422 for a saved incomplete report', async () => {
    await f.accepted(f.draft(reportId, 'save'));
    const body = await rejectedWithoutCommit(f, f.draft(reportId, 'submit', {
      savedId: f.document(reportId).flow.saved.id, reason: 'Synthetic incomplete report',
    }), 422, 'VALIDATION_FAILED');
    assert.ok(body.details.issues.some((issue) => issue.message === 'RESULT_REQUIRED'));
  });
  f.verifyBackups();
});

test('actual routine route: Apply/Save receipt document revisions remain distinct from aggregate revision', async (t) => {
  const f = await fixture(t), planId = await f.createPlan();
  const before = f.document(planId).flow;
  const aggregateBefore = f.control().revision;
  const counts = { ...f.counts };
  const apply = f.draft(planId, 'apply', {
    patches: [{ op: 'set', path: ['notes'], value: 'Exact synthetic saved text' }],
    guards: [{ path: ['notes'], value: '' }],
  });
  const applied = await f.accepted(apply);
  assert.equal(applied.result.operationId, apply.operationId);
  assert.equal(applied.result.generation, before.generation);
  assert.equal(applied.result.revision, before.revision + 1);
  assert.equal(applied.result.unchanged, false);
  assert.equal(applied.revision, aggregateBefore + 1);
  assert.notEqual(applied.revision, applied.result.revision, 'aggregate revision is never the document receipt revision');
  assert.equal(applied.result.savedId, null);
  assert.equal(f.document(planId).flow.saved, null, 'Apply alone does not Save');
  const save = f.draft(planId, 'save', { expectedRevision: applied.result.revision });
  const saved = await f.accepted(save);
  assert.equal(saved.result.operationId, save.operationId);
  assert.equal(saved.result.revision, applied.result.revision + 1);
  assert.equal(saved.revision, applied.revision + 1);
  assert.equal(saved.result.savedId, f.document(planId).flow.saved.id);
  assert.equal(f.document(planId).flow.saved.revision, applied.result.revision);
  assert.equal(f.document(planId).flow.saved.content.notes, 'Exact synthetic saved text');
  assert.equal(f.document(planId).flow.saves.length, 1);
  assert.deepEqual(f.delta(counts), {
    post: 2, get: 0, receiptGet: 0, stateGet: 0, dbRun: 2, r2Put: 0, r2Head: 0,
  }, 'direct dirty Apply then fixed Save needs exactly two POSTs; this is not a browser timing claim');
  const committed = f.persisted(), receiptCounts = { ...f.counts };
  for (const [command, original] of [[apply, applied], [save, saved]]) {
    const receipt = await f.get('?operationId=' + command.operationId);
    assert.equal(receipt.status, 200);
    assert.deepEqual(receipt.body.result, original.result, 'GET returns the exact nested committed receipt');
    assert.equal(receipt.body.revision, saved.revision, 'receipt GET reports current aggregate revision');
    assert.equal(Object.hasOwn(receipt.body, 'requestId'), false);
  }
  const readback = await f.get();
  assert.equal(readback.status, 200);
  const readDoc = readback.body.control.documents.find((item) => item.id === planId);
  assert.equal(readDoc.flow.saved.content.notes, 'Exact synthetic saved text');
  assert.equal(readDoc.flow.saved.id, saved.result.savedId);
  assert.deepEqual(readDoc.flow.receipts, {}, 'normal GET does not expose document receipt indexes');
  assert.deepEqual(readback.body.control.receipts, {}, 'normal GET does not expose aggregate receipt indexes');
  assert.deepEqual(f.persisted(), committed, 'receipt and full state reads are non-mutating');
  assert.deepEqual(f.delta(receiptCounts), {
    post: 0, get: 3, receiptGet: 2, stateGet: 1, dbRun: 0, r2Put: 0, r2Head: 0,
  });
  f.verifyBackups();
});

function memoryStorage() {
  const values = new Map([['unrelated-storage-key', 'synthetic retained local value']]);
  const writes = [];
  return {
    writes,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) {
      key = String(key); value = String(value);
      writes.push({ key, value }); values.set(key, value);
    },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    snapshot() { return [...values]; },
  };
}

function actualUI(f, source, identity, { durableStorage = true } = {}) {
  const calls = [], localStorage = memoryStorage(), sessionStorage = memoryStorage();
  let afterPost = () => {};
  const window = {
    ProcessSync: {
      identity: clone(identity), requiresReload: false,
      identityGeneration: () => 1, captureDelivery: () => 1,
      isCurrentDelivery: (delivery) => delivery === 1,
    },
    addEventListener() {},
    ...(durableStorage ? { localStorage, sessionStorage } : {}),
  };
  const context = vm.createContext({
    window, document: { documentElement: { lang: 'zh' }, querySelector: () => null },
    crypto: webcrypto, URL, URLSearchParams, Request, Response, Headers,
    AbortController, TextEncoder, TextDecoder, structuredClone,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    ...(durableStorage ? { localStorage, sessionStorage } : {}),
    async fetch(url, options = {}) {
      const method = options.method || 'GET';
      const call = {
        method, url, body: options.body ? JSON.parse(options.body) : null,
        requestBytes: Buffer.byteLength(options.body || ''),
        markersAtDispatch: localStorage.snapshot().filter(([key]) => key.startsWith('routine-fqc-receipt-v1:')),
      };
      calls.push(call);
      const response = await f.dispatch(url, options);
      call.status = response.status;
      call.responseBytes = Buffer.byteLength(await response.clone().text());
      if (method === 'POST') await Promise.resolve(afterPost(call.body));
      return response;
    },
  });
  // Full production scripts, not copied Save/transport bodies. Expose closure
  // state only at the existing UI export; no guard, readback, or persistence
  // function is replaced, and render/mount/timers are deliberately not invoked.
  vm.runInContext(sharedClientSource, context,
    { filename: 'public/process/shared-draft-client.js' });
  const exportPoint = '  window.RoutineFQCUI = {';
  assert.equal(source.split(exportPoint).length, 2, 'one exact test-only export injection point');
  vm.runInContext(source.replace(exportPoint,
    exportPoint + '\n    __test: { s, save, read, doc, setData(value) { data = value; } },'), context,
  { filename: 'public/process/routine-fqc.js' });
  return {
    ui: window.RoutineFQCUI.__test, calls, localStorage, sessionStorage,
    afterPost: (hook) => { afterPost = hook; },
  };
}

const receiptMetadataFields = [
  'protocol', 'endpoint', 'actor', 'runtime', 'epoch', 'operationId', 'action',
  'documentId', 'innerAction', 'generation', 'documentRevision',
  'aggregateRevision', 'globalRevision', 'caseId', 'savedId', 'pendingId',
  'submitSavedId', 'restoreSaveId', 'requestedRevision',
].sort();
const uiSentText = 'Synthetic UI-only dirty Save payload: never durable metadata';
const uiNextText = 'Synthetic next input during Apply: must stay only in RAM';

async function runActualUISave(t, source, { durableStorage = true, nextInput = false } = {}) {
  const f = await fixture(t), planId = await f.createPlan();
  const initial = await f.get();
  assert.equal(initial.status, 200);
  const tab = actualUI(f, source, initial.body.identity, { durableStorage });
  const { ui } = tab;
  ui.setData(initial.body);
  ui.s.selected = planId;
  ui.s.bases.set(planId, clone(ui.doc().flow.working));
  ui.s.buffers.set(planId, { ...clone(ui.doc().flow.working), notes: uiSentText });
  if (nextInput) tab.afterPost((command) => {
    if (command.command?.action === 'apply') ui.s.buffers.get(planId).notes = uiNextText;
  });
  const counts = { ...f.counts };
  const receipt = await ui.save();
  assert.equal(receipt.operationId, tab.calls[2].body.operationId);
  assert.deepEqual(tab.calls.map((call) => [call.method, call.body?.command?.action || 'state']), [
    ['POST', 'apply'], ['GET', 'state'], ['POST', 'save'], ['GET', 'state'],
  ], 'actual dirty Save is original Apply/readback/fixed Save/readback, with no extra receipt GET or resend');
  assert.ok(tab.calls.every((call) => call.status === 200));
  assert.deepEqual(f.delta(counts), {
    post: 2, get: 2, receiptGet: 0, stateGet: 2, dbRun: 2, r2Put: 0, r2Head: 0,
  });
  const saved = f.document(planId).flow;
  assert.equal(saved.saved.id, receipt.savedId);
  assert.equal(saved.saved.content.notes, uiSentText);
  assert.equal(saved.working.notes, uiSentText);
  assert.equal(saved.saves.length, 1);
  assert.equal(ui.doc().flow.saved.id, saved.saved.id, 'actual full GET was adopted');
  if (nextInput) {
    assert.equal(ui.s.buffers.get(planId).notes, uiNextText);
    assert.equal(ui.s.bases.get(planId).notes, uiSentText);
    assert.notEqual(ui.s.buffers.get(planId).notes, ui.s.bases.get(planId).notes);
  } else {
    assert.equal(ui.s.buffers.has(planId), false);
    assert.equal(ui.s.bases.has(planId), false);
  }
  assert.equal(ui.s.retry, null);
  if (durableStorage) {
    assert.equal(tab.localStorage.writes.length, 2, 'exactly one metadata marker before each POST');
    assert.equal(tab.sessionStorage.writes.length, 0, 'no generic full-command session persistence');
    for (const [index, write] of tab.localStorage.writes.entries()) {
      const meta = JSON.parse(write.value), command = tab.calls[index * 2].body;
      assert.match(write.key, /^routine-fqc-receipt-v1:/);
      assert.deepEqual(Object.keys(meta).sort(), receiptMetadataFields);
      assert.equal(meta.operationId, command.operationId);
      assert.equal(meta.innerAction, command.command.action);
      assert.equal(meta.documentId, planId);
      assert.equal(meta.generation, command.command.generation);
      assert.equal(meta.globalRevision, initial.body.revision + index);
      assert.equal(meta.aggregateRevision, initial.body.control.revision + index);
      assert.equal(meta.documentRevision, initial.body.control.documents[0].flow.revision + index);
      assert.equal(write.value.includes(uiSentText), false);
      assert.equal(write.value.includes(uiNextText), false);
      for (const call of tab.calls.slice(index * 2, index * 2 + 2)) {
        assert.deepEqual(call.markersAtDispatch, [[write.key, write.value]],
          'durable original metadata exists before POST and remains until actual full readback');
      }
    }
    assert.deepEqual(tab.localStorage.snapshot(), [['unrelated-storage-key', 'synthetic retained local value']],
      'terminal readbacks clear only their receipt markers');
  } else {
    assert.equal(tab.localStorage.writes.length, 0, 'baseline does not require receipt storage');
  }
  f.verifyBackups();
  return {
    post: f.delta(counts).post, get: f.delta(counts).get,
    requestBytes: tab.calls.map((call) => call.requestBytes),
    responseBytes: tab.calls.map((call) => call.responseBytes),
    localMetadataBytes: tab.localStorage.writes.map((write) => Buffer.byteLength(write.key + write.value)),
  };
}

test('actual full routine UI → actual route: dirty Save is 2 POST + 2 GET and metadata-only durability', async (t) => {
  const metrics = await runActualUISave(t, routineUISource);
  t.diagnostic('Current UI source SHA256: ' + createHash('sha256').update(routineUISource).digest('hex'));
  t.diagnostic('Synthetic actual UI/route bytes (not browser timing): ' + JSON.stringify(metrics));
});

test('actual full routine UI → actual route: input made during Apply remains the next unsent batch', async (t) => {
  await runActualUISave(t, routineUISource, { nextInput: true });
});

test('actual full routine UI → actual route: independent peer Save before guarded Apply may advance savedId', async (t) => {
  const f = await fixture(t, { withPeer: true }), planId = await f.createPlan();
  const applyNotes = (value) => f.accepted(f.draft(planId, 'apply', {
    patches: [{ op: 'set', path: ['notes'], value }],
    guards: [{ path: ['notes'], value: f.document(planId).flow.working.notes }],
  }));
  await applyNotes('Synthetic original saved notes');
  await f.accepted(f.draft(planId, 'save'));
  const savedA = f.document(planId).flow.saved.id;
  for (const value of ['Shared unsaved note one', 'Shared unsaved note two', 'Shared note saved by peer']) {
    await applyNotes(value);
  }
  assert.equal(f.document(planId).flow.revision, 5);
  assert.equal(f.document(planId).flow.saved.id, savedA);
  const initial = await f.get();
  assert.equal(initial.status, 200);
  const tab = actualUI(f, routineUISource, initial.body.identity), { ui } = tab;
  ui.setData(initial.body); ui.s.selected = planId;
  const generation = ui.doc().flow.generation, titleBefore = ui.doc().flow.working.title;
  const localTitle = 'Local guarded title entered before the independent peer Save';
  ui.s.bases.set(planId, clone(ui.doc().flow.working));
  ui.s.buffers.set(planId, { ...clone(ui.doc().flow.working), title: localTitle });

  // A genuinely different signed actor only Saves the already-shared working
  // content. The title guard remains valid; no UI refresh hides this race.
  const peerCounts = { ...f.counts }, peerCommand = f.draft(planId, 'save');
  const peerResponse = await f.post(peerCommand, 'peer');
  assert.equal(peerResponse.status, 200, JSON.stringify(peerResponse.body));
  const savedB = peerResponse.body.result.savedId;
  assert.notEqual(savedB, savedA);
  assert.equal(peerResponse.body.result.revision, 6);
  assert.equal(peerResponse.body.result.generation, generation);
  assert.equal(f.document(planId).flow.saved.actor.id, 'fixture-route-peer');
  assert.equal(f.control().receipts[peerCommand.operationId].actorId, 'fixture-route-peer');
  assert.equal(f.document(planId).flow.working.title, titleBefore);
  assert.equal(ui.doc().flow.revision, 5, 'client still holds its actual pre-peer full GET');
  assert.equal(ui.doc().flow.saved.id, savedA);
  assert.equal(ui.s.buffers.get(planId).title, localTitle);
  assert.deepEqual(f.delta(peerCounts), {
    post: 1, get: 0, receiptGet: 0, stateGet: 0, dbRun: 1, r2Put: 0, r2Head: 0,
  }, 'peer Save is counted separately from the owner UI operation');

  let observedApply = null;
  tab.afterPost((command) => {
    assert.equal(ui.s.buffers.get(planId).title, localTitle, 'original local input survives each in-flight POST');
    if (command.command.action === 'apply') {
      observedApply = clone(f.control().receipts[command.operationId].result);
      assert.equal(observedApply.revision, 7);
      assert.equal(observedApply.savedId, savedB, 'actual Apply ACK legitimately contains the peer newer savedId');
      assert.equal(observedApply.generation, generation);
      assert.equal(observedApply.unchanged, false);
      assert.deepEqual(command.command.guards, [{ path: ['title'], value: titleBefore }]);
    }
  });
  const ownCounts = { ...f.counts }, saved = await ui.save();
  assert.ok(observedApply);
  assert.deepEqual(tab.calls.map((call) => [call.method, call.body?.command?.action || 'state']), [
    ['POST', 'apply'], ['GET', 'state'], ['POST', 'save'], ['GET', 'state'],
  ]);
  assert.deepEqual(f.delta(ownCounts), {
    post: 2, get: 2, receiptGet: 0, stateGet: 2, dbRun: 2, r2Put: 0, r2Head: 0,
  }, 'legal peer progress creates no extra receipt lookup or resend');
  assert.equal(saved.revision, 8);
  assert.notEqual(saved.savedId, savedB);
  assert.equal(f.document(planId).flow.saved.actor.id, initial.body.identity.id);
  assert.equal(f.document(planId).flow.saved.content.title, localTitle);
  assert.equal(f.document(planId).flow.saved.content.notes, 'Shared note saved by peer');
  assert.equal(ui.doc().flow.saved.id, saved.savedId);
  assert.equal(ui.s.buffers.has(planId), false);
  assert.equal(ui.s.bases.has(planId), false);
  assert.equal(ui.s.retry, null, 'higher-revision legitimate Apply is not trapped as permanent unknown');
  assert.equal(tab.localStorage.writes.length, 2);
  const [applyMeta, saveMeta] = tab.localStorage.writes.map((write) => JSON.parse(write.value));
  assert.equal(applyMeta.savedId, savedA);
  assert.equal(applyMeta.documentRevision, 5);
  assert.equal(saveMeta.savedId, savedB);
  assert.equal(saveMeta.documentRevision, 7);
  assert.equal(saveMeta.requestedRevision, 7);
  for (const [index, write] of tab.localStorage.writes.entries()) {
    assert.deepEqual(Object.keys(JSON.parse(write.value)).sort(), receiptMetadataFields);
    assert.equal(write.value.includes(localTitle), false);
    for (const call of tab.calls.slice(index * 2, index * 2 + 2)) {
      assert.deepEqual(call.markersAtDispatch, [[write.key, write.value]], 'each terminal marker waits for its actual full GET');
    }
  }
  assert.deepEqual(tab.localStorage.snapshot(), [['unrelated-storage-key', 'synthetic retained local value']]);
  assert.equal(tab.sessionStorage.writes.length, 0);
  f.verifyBackups();
  t.diagnostic('Peer Save race source SHA256: ' + createHash('sha256').update(routineUISource).digest('hex'));
});

// Optional explicit local comparison input; core current-code tests above never
// skip or depend on Git history. This turn supplies the exact ab520ee blob.
if (process.env.ROUTINE_FQC_BASELINE_JS) {
  test('explicit ab520ee baseline versus current full UI: same synthetic Save route counts and wire bytes', async (t) => {
    const baseline = fs.readFileSync(process.env.ROUTINE_FQC_BASELINE_JS, 'utf8');
    const gitBlob = createHash('sha1').update('blob ' + Buffer.byteLength(baseline) + '\0').update(baseline).digest('hex');
    assert.equal(gitBlob, '12c50d4a6e2444d886f6be107cca273dbfd60462', 'baseline must be the exact ab520ee routine UI source');
    const before = await runActualUISave(t, baseline, { durableStorage: false });
    const after = await runActualUISave(t, routineUISource);
    assert.deepEqual({ post: after.post, get: after.get }, { post: before.post, get: before.get });
    // Native random UUIDs are already fixed width; no payload, response field,
    // or legitimate byte growth is normalized away for this comparison.
    assert.deepEqual(after.requestBytes, before.requestBytes);
    assert.deepEqual(after.responseBytes, before.responseBytes);
    t.diagnostic('Explicit same-data baseline/current counts and bytes: ' + JSON.stringify({ before, after }));
  });
}
