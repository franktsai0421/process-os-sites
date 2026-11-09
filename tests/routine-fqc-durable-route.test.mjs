import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { manualUI, dirty, inputs } from './fixtures/routine-fqc-manual-ui.mjs';

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
  let beforeCAS = null;
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
            if (sql.startsWith('UPDATE shared_state SET revision=') && beforeCAS) {
              const hook = beforeCAS; beforeCAS = null; await hook();
            }
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
  const setRight=(key,enabled)=>{const row=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),values=JSON.parse(row.values),users=JSON.parse(values.platformUsers);for(const user of users)user.accessOverrides[key]=enabled;values.platformUsers=JSON.stringify(users);db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(row.revision+1,JSON.stringify(values));};
  const stagePhoto=name=>{const bytes=Buffer.from('synthetic photo '+name),id=createHash('sha256').update(bytes).digest('hex');objects.set('routine-fqc/photos/'+id,{bytes,options:{}});return id;};
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
  return { counts, persisted, verifyBackups, setRight, stagePhoto, storedValues, control, document, dispatch, get, post, command, draft, accepted, delta, createPlan, approve, beforeCAS: hook => { beforeCAS = hook; } };
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

void test('actual routine route: original rejection status/code provenance and pre-CAS atomicity', async (t) => {
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

void test('actual routine route: Apply/Save receipt document revisions remain distinct from aggregate revision', async (t) => {
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
    if (command.command?.action === 'save') ui.s.buffers.get(planId).notes = uiNextText;
  });
  const counts = { ...f.counts };
  const receipt = await ui.save();
  assert.equal(receipt.operationId, tab.calls[1].body.operationId);
  assert.deepEqual(tab.calls.map((call) => [call.method, call.body?.command?.action || 'state']), [
    ['GET', 'state'], ['POST', 'save'], ['GET', 'state'],
  ], 'actual dirty Save compares, atomically Saves, and reads back without a second write or resend');
  assert.ok(tab.calls.every((call) => call.status === 200));
  assert.deepEqual(f.delta(counts), {
    post: 1, get: 2, receiptGet: 0, stateGet: 2, dbRun: 1, r2Put: 0, r2Head: 0,
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
    assert.equal(tab.localStorage.writes.length, 1, 'one metadata marker before the atomic Save POST');
    assert.equal(tab.sessionStorage.writes.length, 0, 'no generic full-command session persistence');
    for (const [index, write] of tab.localStorage.writes.entries()) {
      const meta = JSON.parse(write.value), command = tab.calls[1].body;
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
      for (const call of tab.calls.slice(1, 3)) {
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

void test('actual full routine UI → actual route: dirty Save is 1 POST + 2 GET and metadata-only durability', async (t) => {
  const metrics = await runActualUISave(t, routineUISource);
  t.diagnostic('Current UI source SHA256: ' + createHash('sha256').update(routineUISource).digest('hex'));
  t.diagnostic('Synthetic actual UI/route bytes (not browser timing): ' + JSON.stringify(metrics));
});

void test('actual full routine UI → actual route: input made during atomic Save remains the next unsent batch', async (t) => {
  await runActualUISave(t, routineUISource, { nextInput: true });
});

void test('actual full routine UI → actual route: independent peer Save is preserved by fresh comparison before atomic Save', async (t) => {
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

  let observedSave = null;
  tab.afterPost((command) => {
    assert.equal(ui.s.buffers.get(planId).title, localTitle, 'original local input survives each in-flight POST');
    if (command.command.action === 'save') {
      observedSave = clone(f.control().receipts[command.operationId].result);
      assert.equal(observedSave.revision, 7);
      assert.notEqual(observedSave.savedId, savedB, 'atomic Save creates the merged fixed snapshot');
      assert.equal(observedSave.generation, generation);
      assert.equal(observedSave.unchanged, false);
      assert.deepEqual(command.command.guards, [{ path: ['title'], value: titleBefore }]);
    }
  });
  const ownCounts = { ...f.counts }, saved = await ui.save();
  assert.ok(observedSave);
  assert.deepEqual(tab.calls.map((call) => [call.method, call.body?.command?.action || 'state']), [
    ['GET', 'state'], ['POST', 'save'], ['GET', 'state'],
  ]);
  assert.deepEqual(f.delta(ownCounts), {
    post: 1, get: 2, receiptGet: 0, stateGet: 2, dbRun: 1, r2Put: 0, r2Head: 0,
  }, 'legal peer progress creates no extra receipt lookup or resend');
  assert.equal(saved.revision, 7);
  assert.notEqual(saved.savedId, savedB);
  assert.equal(f.document(planId).flow.saved.actor.id, initial.body.identity.id);
  assert.equal(f.document(planId).flow.saved.content.title, localTitle);
  assert.equal(f.document(planId).flow.saved.content.notes, 'Shared note saved by peer');
  assert.equal(ui.doc().flow.saved.id, saved.savedId);
  assert.equal(ui.s.buffers.has(planId), false);
  assert.equal(ui.s.bases.has(planId), false);
  assert.equal(ui.s.retry, null, 'higher-revision legitimate Apply is not trapped as permanent unknown');
  assert.equal(tab.localStorage.writes.length, 1);
  const [saveMeta] = tab.localStorage.writes.map((write) => JSON.parse(write.value));
  assert.equal(saveMeta.savedId, savedB);
  assert.equal(saveMeta.documentRevision, 6);
  assert.equal(saveMeta.requestedRevision, 6);
  for (const write of tab.localStorage.writes) {
    assert.deepEqual(Object.keys(JSON.parse(write.value)).sort(), receiptMetadataFields);
    assert.equal(write.value.includes(localTitle), false);
    for (const call of tab.calls.slice(1, 3)) {
      assert.deepEqual(call.markersAtDispatch, [[write.key, write.value]], 'each terminal marker waits for its actual full GET');
    }
  }
  assert.deepEqual(tab.localStorage.snapshot(), [['unrelated-storage-key', 'synthetic retained local value']]);
  assert.equal(tab.sessionStorage.writes.length, 0);
  f.verifyBackups();
  t.diagnostic('Peer Save race source SHA256: ' + createHash('sha256').update(routineUISource).digest('hex'));
});

async function rendered(t,kind='report') {
  const f=await fixture(t,{withPeer:true}),plan=await f.createPlan();let id=plan;
  if(kind==='report') {
    await f.approve(plan);id=(await f.accepted(f.command('create-report',{documentId:plan}))).result.documentId;
    const line=f.document(id).flow.working.lines[0];
    await f.accepted(f.draft(id,'apply',{patches:[{op:'set',path:['lines',{id:line.id},'results'],value:['row-a','row-b'].map(id=>({id,samples:[],outcome:'',value:'base value',notes:'base note',photos:[]}))}],guards:[{path:['lines',{id:line.id},'results'],value:clone(line.results)}]}));
    await f.accepted(f.draft(id,'save'));
  }
  const initial=(await f.get()).body,ui=manualUI({actor:initial.identity.id,remote:initial});
  ui.box.FormData=class {getAll(){return [];}get(){return null;}};
  ui.api.s.selected=id;ui.api.s.tab=kind==='report'?'reports':'plans';ui.paint();
  const calls=[];let afterPost=async()=>{};
  ui.box.fetch=async(url,options)=>{options ||= {};calls.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});const response=await f.dispatch(url,options);if(options.method==='POST')await afterPost(calls.at(-1).body,response);return response;};
  const input=(selector,value)=>{const node=ui.root.querySelector(selector);assert(node,selector);node.value=value;node.oninput();};
  const peer=async(change)=>{const content=clone(f.document(id).flow.working);change(content);const patches=[];for(const key of ['title','date','notes','reason','disposition','evidence'])if(JSON.stringify(content[key])!==JSON.stringify(f.document(id).flow.working[key]))patches.push({op:'set',path:[key],value:content[key]});for(const line of content.lines)if(JSON.stringify(line.results)!==JSON.stringify(f.document(id).flow.working.lines.find(x=>x.id===line.id).results))patches.push({op:'set',path:['lines',{id:line.id},'results'],value:line.results});const response=await f.post(f.draft(id,'save',{moduleAction:'save-local-v1',patches,guards:patches.map(p=>({path:p.path,value:p.path.length===1?f.document(id).flow.working[p.path[0]]:f.document(id).flow.working.lines.find(x=>x.id===p.path[1].id).results}))}),'peer');assert.equal(response.status,200,JSON.stringify(response.body));};
  const nextDialog=()=>new Promise(resolve=>{ui.document.body.onappend=node=>{if(node.tagName==='DIALOG'){ui.document.body.onappend=null;resolve(node);}};});
  const choose=(dialog,choice)=>{if(choice==='cancel')return dialog.querySelector('[data-cancel]').click();if(choice==='theirs')return dialog.querySelector('[data-rf-conflict-theirs]').click();const form=dialog.querySelector('form');return form.onsubmit({target:form,preventDefault(){}});};
  return {f,id,ui,calls,input,peer,nextDialog,choose,afterPost:fn=>afterPost=fn};
}

void test('rendered Save merges independent cells in the same result row and retains search filters, with one route CAS',async t=>{
  const x=await rendered(t);x.input('[data-result-field="value"]','local value');
  x.ui.api.s.query='retained search';x.ui.api.s.line='retained line';
  await x.peer(c=>{c.lines[0].results[0].notes='peer same row';c.lines[0].results[1].value='peer other row';});
  const before={...x.f.counts};await x.ui.button('save').click();
  assert.equal(x.ui.api.s.error,'');assert.deepEqual(x.calls.map(x=>x.method),['GET','POST','GET']);
  assert.equal(x.f.delta(before).dbRun,1);assert.equal(x.calls[1].body.command.moduleAction,'save-local-v1');
  const saved=x.f.document(x.id).flow.saved.content;assert.equal(saved.lines[0].results[0].value,'local value');assert.equal(saved.lines[0].results[0].notes,'peer same row');assert.equal(saved.lines[0].results[1].value,'peer other row');
  assert.equal(x.ui.api.s.query,'retained search');assert.equal(x.ui.api.s.line,'retained line');assert.equal(x.ui.api.dirty(x.ui.api.getData().control.documents.find(d=>d.id===x.id)),false);
});

for(const choice of ['mine','theirs','cancel'])for(const lang of ['zh','vi'])void test(`rendered ${lang} ${choice}: one global decision covers all true conflicts, both sides keep unrelated edits`,async t=>{
  const x=await rendered(t);x.ui.document.documentElement.lang=lang;x.ui.paint();
  x.input('[data-field="title"]','mine title');x.input('[data-field="notes"]','mine only');x.input('[data-result-field="value"]','mine cell');
  await x.peer(c=>{c.title='peer title';c.lines[0].results[0].value='peer cell';c.lines[0].results[1].notes='peer only';});
  const before=x.f.persisted(),arriving=x.nextDialog(),running=x.ui.button('save').click(),dialog=await arriving;
  assert.equal(dialog.querySelectorAll('li').length,2);assert.equal(x.calls.filter(x=>x.method==='POST').length,0);
  x.choose(dialog,choice);await running;
  assert.equal(x.ui.api.s.error,'');
  if(choice==='cancel'){assert.deepEqual(x.f.persisted(),before);assert.equal(x.ui.api.s.buffers.get(x.id).title,'mine title');assert.equal(x.calls.length,1);return;}
  assert.deepEqual(x.calls.map(x=>x.method),['GET','GET','POST','GET']);
  const saved=x.f.document(x.id).flow.saved.content;assert.equal(saved.title,choice==='mine'?'mine title':'peer title');assert.equal(saved.lines[0].results[0].value,choice==='mine'?'mine cell':'peer cell');assert.equal(saved.notes,'mine only');assert.equal(saved.lines[0].results[1].notes,'peer only');assert.equal(x.ui.api.dirty(x.ui.api.getData().control.documents.find(d=>d.id===x.id)),false);
});

void test('rendered dialog re-compares changed document before dispatch, includes newly conflicting fields, and still writes once',async t=>{
  const x=await rendered(t);x.input('[data-field="title"]','mine title');x.input('[data-field="notes"]','mine notes');await x.peer(c=>c.title='peer title 1');
  const first=x.nextDialog(),running=x.ui.button('save').click(),dialog=await first;
  await x.peer(c=>{c.title='peer title 2';c.notes='peer notes';});
  const second=x.nextDialog();x.choose(dialog,'mine');const again=await second;
  assert.equal(again.querySelectorAll('li').length,2);assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
  x.choose(again,'theirs');await running;assert.equal(x.ui.api.s.error,'');
  assert.equal(x.f.document(x.id).flow.saved.content.title,'peer title 2');assert.equal(x.f.document(x.id).flow.saved.content.notes,'peer notes');assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});

void test('actual atomic Save rejects stale revision, invalid photo and protected source without any partial write',async t=>{
  const f=await fixture(t),id=await f.createPlan();
  const make=(extra={})=>f.draft(id,'save',{moduleAction:'save-local-v1',patches:[{op:'set',path:['notes'],value:'mine'}],guards:[{path:['notes'],value:''}],...extra});
  await rejectedWithoutCommit(f,make({expectedRevision:100}),409,'DRAFT_REVISION_CHANGED_RECONFIRM');
  await rejectedWithoutCommit(f,make({patches:[{op:'set',path:['evidence'],value:['a'.repeat(64)]}],guards:[{path:['evidence'],value:[]}]}),422,'PHOTO_NOT_UPLOADED');
  await rejectedWithoutCommit(f,make({patches:[{op:'set',path:['lines'],value:[]}],guards:[{path:['lines'],value:clone(f.document(id).flow.working.lines)}]}),422,'PATCH_NOT_ALLOWED');
  await rejectedWithoutCommit(f,make({guards:[{path:['notes'],value:'stale'}]}),409,'DEPENDENCY_CHANGED_RECONFIRM');
  const original=make(),accepted=await f.accepted(original),after=f.persisted();assert.equal(accepted.result.revision,1);assert.equal(f.document(id).flow.saves.length,1);
  const replay=await f.post(original);assert.equal(replay.status,200);assert.deepEqual(replay.body.result,accepted.result);assert.deepEqual(f.persisted(),after);
});

function installDeparture(ui) {
  const source=fs.readFileSync('public/process/version-draft-ui.js','utf8'),a=source.indexOf('  function createDeparture(config){'),b=source.indexOf('  host.VersionDraftUI=',a);
  vm.runInContext('const host=window;'+source.slice(a,b)+'window.VersionDraftUI={createDeparture,mount(){},updateSaved(){}};',ui.box);
  return ui.win.RoutineFQCUI.navigation.departure;
}

void test('rendered silent departure drops unsent RAM only, preserves shared history and performs zero requests',async t=>{
  const x=await rendered(t);x.input('[data-field="notes"]','abandon me');const before=x.f.persisted(),departure=installDeparture(x.ui);
  assert.equal(departure.autoAbandon,true);assert.equal(departure.inspect().state,'dirty');
  const lease=await departure.abandon();assert.equal(departure.inspect().state,'departing');departure.closeClean();lease.release();
  assert.equal(x.ui.api.dirty(x.ui.api.getData().control.documents.find(d=>d.id===x.id)),false);assert.equal(x.calls.length,0);assert.deepEqual(x.f.persisted(),before);
  assert.equal(routineUISource.includes("window.addEventListener('beforeunload'"),false,'RAM-only edits do not request a native unload prompt');
});

void test('actual committed-but-lost Save keeps original metadata across silent departure; retry and 404 never resend',async t=>{
  const x=await rendered(t);x.input('[data-field="notes"]','sent once');let lost=true;const realFetch=x.ui.box.fetch.bind(x.ui.box);
  x.ui.box.fetch=async(url,options)=>{options ||= {};if(lost&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const response=await realFetch(url,options);if(lost&&options.method==='POST')throw Error('Synthetic lost response after commit');return response;};
  await x.ui.button('save').click();const retry=x.ui.api.s.retry,marker=[...x.ui.store.map];assert(retry);assert.equal(x.f.document(x.id).flow.saved.content.notes,'sent once');
  await x.ui.api.act('retry');assert.deepEqual([...x.ui.store.map],marker);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
  const departure=installDeparture(x.ui);assert.equal(departure.inspect().canAbandon,true);const lease=await departure.abandon();assert.equal(departure.inspect().state,'departing');departure.closeClean();lease.release();
  assert.deepEqual([...x.ui.store.map],marker);assert.equal(x.ui.api.s.retry.operationId,retry.operationId);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
  lost=false;await x.ui.api.act('retry');assert.equal(x.ui.api.s.retry,null);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.equal(x.ui.store.map.size,0);
});

for(const mode of ['save-permission','edit-permission','pending','generation','pagehide','identity'])void test('rendered '+mode+' change while deciding cannot dispatch or lose original input',async t=>{
  const x=await rendered(t,'plan');x.input('[data-field="title"]','mine title');await x.peer(c=>c.title='peer title');const arriving=x.nextDialog(),running=x.ui.button('save').click(),dialog=await arriving;
  if(mode==='save-permission')x.f.setRight('routine.save',false);
  if(mode==='edit-permission')x.f.setRight('routine.edit',false);
  if(mode==='pending'||mode==='generation') {
    const submitted=await x.f.accepted(x.f.draft(x.id,'submit',{savedId:x.f.document(x.id).flow.saved.id}));assert(submitted.result.caseId);
    if(mode==='generation')await x.f.accepted(x.f.draft(x.id,'return',{caseId:submitted.result.caseId,reason:'Synthetic return',selfReviewConfirmed:true}));
  }
  if(mode==='pagehide'){x.ui.event('pagehide');x.ui.event('pageshow');}
  if(mode==='identity')x.ui.sync.identity={...x.ui.sync.identity};
  x.choose(dialog,'mine');await running;if(!['pagehide','identity'].includes(mode))assert(x.ui.api.s.error);assert.equal(x.calls.filter(c=>c.method==='POST').length,0);assert.equal(x.ui.api.s.buffers.get(x.id).title,'mine title');
});

void test('actual server permits Save-only snapshots but rejects applying local patches without edit, including replay',async t=>{
  const f=await fixture(t),id=await f.createPlan();f.setRight('routine.edit',false);
  const empty=f.draft(id,'save',{moduleAction:'save-local-v1',patches:[],guards:[]});await f.accepted(empty);
  const changed=f.draft(id,'save',{moduleAction:'save-local-v1',patches:[{op:'set',path:['notes'],value:'no edit'}],guards:[{path:['notes'],value:''}]});await rejectedWithoutCommit(f,changed,403,'FORBIDDEN');
  f.setRight('routine.edit',true);await f.accepted(changed);f.setRight('routine.edit',false);const before=f.persisted(),replay=await f.post(changed);assert.equal(replay.status,403);assert.equal(replay.body.error,'FORBIDDEN');assert.deepEqual(f.persisted(),before);
});

void test('same-result row additions, deletion versus changed row, and cell convergence retain both sides',async t=>{
  const x=await rendered(t);const content=x.ui.api.s.buffers.get(x.id),newRow=id=>({id,samples:[],outcome:'',value:id,notes:'',photos:[]});
  content.lines[0].results.push(newRow('mine-added'));content.lines[0].results[0].value='converged';content.lines[0].results.splice(1,1);
  await x.peer(c=>{c.lines[0].results.push(newRow('peer-added'));c.lines[0].results[0].value='converged';c.lines[0].results[1].notes='peer changed deleted row';});
  const arriving=x.nextDialog(),running=x.ui.button('save').click(),dialog=await arriving;assert.equal(dialog.querySelectorAll('li').length,1);x.choose(dialog,'theirs');await running;
  const rows=x.f.document(x.id).flow.saved.content.lines[0].results;assert.deepEqual(clone(rows.map(row=>row.id)),['row-a','row-b','peer-added','mine-added']);assert.equal(rows[0].value,'converged');assert.equal(rows[1].notes,'peer changed deleted row');assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});

void test('a post-comparison racing Save is a known refusal and is never resubmitted automatically',async t=>{
  const x=await rendered(t);x.input('[data-field="notes"]','mine notes');const fetch=x.ui.box.fetch.bind(x.ui.box);let raced=false;
  x.ui.box.fetch=async(url,options)=>{if(options?.method==='POST'&&!raced){raced=true;await x.peer(c=>c.title='peer racing title');}return fetch(url,options);};
  await x.ui.button('save').click();assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.match(x.ui.api.s.error,/DRAFT_REVISION_CHANGED_RECONFIRM/);assert.equal(x.ui.api.s.retry,null);assert.equal(x.ui.store.map.size,0);assert.equal(x.ui.api.s.buffers.get(x.id).notes,'mine notes');assert.equal(x.f.document(x.id).flow.saved.content.notes,'');assert.equal(x.f.document(x.id).flow.saved.content.title,'peer racing title');
});

void test('atomic Save returning working to an existing snapshot still advances one revision and preserves that saved ID',async t=>{
  const f=await fixture(t),id=await f.createPlan();await f.accepted(f.draft(id,'save'));const saved=f.document(id).flow.saved;
  await f.accepted(f.draft(id,'apply',{patches:[{op:'set',path:['notes'],value:'shared unsaved'}],guards:[{path:['notes'],value:''}]}));
  const before=f.document(id).flow.revision,command=f.draft(id,'save',{moduleAction:'save-local-v1',patches:[{op:'set',path:['notes'],value:''}],guards:[{path:['notes'],value:'shared unsaved'}]}),result=(await f.accepted(command)).result;
  assert.equal(result.revision,before+1);assert.equal(result.unchanged,false);assert.equal(result.savedId,saved.id);assert.equal(f.document(id).flow.saves.length,1);assert.equal(f.document(id).flow.working.notes,'');assert.deepEqual(clone(f.document(id).flow.contributors),{});
  const after=f.persisted();const replay=await f.post(command);assert.equal(replay.status,200);assert.deepEqual(replay.body.result,result);assert.deepEqual(f.persisted(),after);
});


const localState=x=>JSON.stringify({buffers:[...x.ui.api.s.buffers],bases:[...x.ui.api.s.bases],generations:[...x.ui.api.s.bufferGenerations],retry:x.ui.api.s.retry,markers:[...x.ui.store.map]});
function filter(x,key,value) {const input=x.ui.root.querySelector('[data-filter="'+key+'"]');assert(input,key);input.value=value;input.onchange();}
function selectDocument(x,id,tab='reports') {const button=x.ui.root.querySelector('[data-tab="'+tab+'"]');assert(button,tab);button.click();for(const [selector,key]of [['[data-work-state]','workState'],['[data-kind]','kind']])x.ui.root.querySelectorAll(selector).find(node=>node.dataset[key]==='')?.click();const row=x.ui.root.querySelector('[data-id="'+id+'"]');assert(row,id);row.click();}

for(const lang of ['zh','vi'])void test('rendered '+lang+' same-page search/date/status/tab and approved-plan round trip retain exact RAM basis without writes',async t=>{
  const x=await rendered(t);x.ui.document.documentElement.lang=lang;x.ui.paint();x.input('[data-field="notes"]','unsaved report input');x.input('[data-result-field="value"]','unsaved cell');
  const original=localState(x),initial=x.f.persisted(),plan=x.f.document(x.id).planId;
  for(const [key,value]of [['query','not-visible'],['line','missing-line'],['category','missing-category'],['item','missing-item'],['outcome','fail'],['review','approved'],['caseState','closed'],['dateMode','actual'],['from','2099-01-01'],['to','2099-01-02']]){filter(x,key,value);assert.equal(localState(x),original);}
  await x.ui.button('clear-filter').click();assert.equal(localState(x),original);
  selectDocument(x,x.id);for(const selector of ['[data-work-state="pending"]','[data-kind="disposal"]']){const button=x.ui.root.querySelector(selector);if(button){button.click();assert.equal(localState(x),original);}}
  // Opening the linked formal plan is read-only viewing inside Routine FQC.
  selectDocument(x,x.id);const link=x.ui.root.querySelector('[data-doc="'+plan+'"]');assert(link);link.click();assert(x.ui.root.querySelector('[data-field="title"]').disabled);assert.equal(localState(x),original);
  selectDocument(x,x.id);assert.equal(x.ui.root.querySelector('[data-field="notes"]').value,'unsaved report input');assert.equal(x.ui.root.querySelector('[data-result-field="value"]').value,'unsaved cell');assert.equal(localState(x),original);
  await x.ui.button('submit').click();assert.equal(x.calls.filter(call=>call.method==='POST').length,0);assert.equal(localState(x),original);assert.deepEqual(x.f.persisted(),initial);assert.match(x.ui.api.s.error,lang==='vi'?/chưa lưu/:/尚未儲存/);
});

void test('rendered unknown Save survives same-page filters and formal-document viewing; no stale saved snapshot is submitted',async t=>{
  const x=await rendered(t);x.input('[data-field="notes"]','commit-lost input');let lost=true;const fetch=x.ui.box.fetch.bind(x.ui.box);
  x.ui.box.fetch=async(url,options)=>{if(lost&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const response=await fetch(url,options);if(lost&&options?.method==='POST')throw Error('Synthetic committed response lost');return response;};
  await x.ui.button('save').click();assert(x.ui.api.s.retry);const original=localState(x),initial=x.f.persisted(),postCount=x.calls.filter(c=>c.method==='POST').length;
  filter(x,'query','hidden');filter(x,'from','2099-01-01');filter(x,'review','approved');await x.ui.button('clear-filter').click();selectDocument(x,x.id);
  x.ui.root.querySelector('[data-doc="'+x.f.document(x.id).planId+'"]').click();selectDocument(x,x.id);await x.ui.button('submit').click();
  assert.equal(localState(x),original);assert.deepEqual(x.f.persisted(),initial);assert.equal(x.calls.filter(c=>c.method==='POST').length,postCount);
  lost=false;await x.ui.api.act('retry');assert.equal(x.ui.api.s.retry,null);assert.equal(x.calls.filter(c=>c.method==='POST').length,postCount);
});

for(const choice of ['mine','theirs','cancel'])for(const lang of ['zh','vi'])void test('rendered '+lang+' '+choice+' preserves both new result rows, independent photos and unrelated fields',async t=>{
  const x=await rendered(t);x.ui.document.documentElement.lang=lang;x.ui.paint();const minePhoto=x.f.stagePhoto('mine'),peerPhoto=x.f.stagePhoto('peer');
  x.input('[data-field="title"]','mine title');x.input('[data-field="notes"]','mine notes');await x.ui.button('add-result:0').click();
  const local=x.ui.api.s.buffers.get(x.id),newRow=local.lines[0].results.at(-1);newRow.value='mine added result';newRow.photos.push(minePhoto);local.lines[0].results[0].photos.push(minePhoto);local.evidence.push(minePhoto);
  await x.peer(c=>{c.title='peer title';c.evidence.push(peerPhoto);c.lines[0].results[0].photos.push(peerPhoto);c.lines[0].results[1].notes='peer independent note';c.lines[0].results.push({id:'peer-new-result',samples:[],outcome:'',value:'peer added result',notes:'',photos:[peerPhoto]});});
  const before=x.f.persisted(),arriving=x.nextDialog(),running=x.ui.button('save').click(),dialog=await arriving;assert.equal(dialog.querySelectorAll('li').length,1,'only the shared title is a true conflict');x.choose(dialog,choice);await running;if(choice==='cancel'){assert.deepEqual(x.f.persisted(),before);assert.equal(x.calls.filter(c=>c.method==='POST').length,0);assert(x.ui.api.s.buffers.get(x.id).lines[0].results[0].photos.includes(minePhoto));return;}
  const saved=x.f.document(x.id).flow.saved.content,rows=saved.lines[0].results;assert.equal(x.ui.api.s.error,'');assert.equal(saved.title,choice==='mine'?'mine title':'peer title');assert.equal(saved.notes,'mine notes');assert.deepEqual(clone(saved.evidence),[peerPhoto,minePhoto]);assert.equal(rows[1].notes,'peer independent note');assert.deepEqual(clone(rows[0].photos),[peerPhoto,minePhoto]);assert(rows.some(row=>row.id===newRow.id&&row.photos.includes(minePhoto)));assert(rows.some(row=>row.id==='peer-new-result'&&row.photos.includes(peerPhoto)));assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});

void test('photo membership merges removal and independent additions without deleting immutable R2 assets',async t=>{
  const x=await rendered(t),old=x.f.stagePhoto('old'),mine=x.f.stagePhoto('new mine'),peer=x.f.stagePhoto('new peer');await x.peer(c=>c.lines[0].results[0].photos.push(old));await x.ui.api.refresh();x.ui.api.s.buffers.delete(x.id);x.ui.api.s.bases.delete(x.id);x.ui.paint();
  x.ui.api.s.buffers.get(x.id).lines[0].results[0].photos=[mine];await x.peer(c=>c.lines[0].results[0].photos.push(peer));const before=x.f.persisted();await x.ui.button('save').click();
  assert.equal(x.ui.api.s.error,'');assert.deepEqual(clone(x.f.document(x.id).flow.saved.content.lines[0].results[0].photos),[peer,mine]);assert.deepEqual(x.f.persisted().objects,before.objects);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});

void test('retest draft can view its original approved report and return without losing input or submitting an older saved version',async t=>{
  const x=await rendered(t),photo=x.f.stagePhoto('approved failure');await x.peer(c=>{c.lines[0].results=[{id:'failed',samples:['FIXTURE-A'],outcome:'fail',value:'bad reading',notes:'failure evidence',photos:[photo]}];});await x.f.approve(x.id);
  const incident=x.f.control().cases[0],retest=(await x.f.accepted(x.f.command('followup',{caseId:incident.id,kind:'report',notes:'Synthetic improvement'}))).result.documentId;
  await x.f.accepted(x.f.draft(retest,'save'));await x.ui.api.refresh();selectDocument(x,retest);x.input('[data-field="notes"]','unsaved retest notes');const original=localState(x),before=x.f.persisted(),posts=x.calls.filter(c=>c.method==='POST').length;
  const link=x.ui.root.querySelector('[data-doc="'+x.id+'"]');assert(link,'retest exposes original report link');link.click();assert(x.ui.root.querySelector('[data-field="title"]').disabled);selectDocument(x,retest);assert.equal(x.ui.root.querySelector('[data-field="notes"]').value,'unsaved retest notes');assert.equal(localState(x),original);
  await x.ui.button('submit').click();assert.equal(x.calls.filter(c=>c.method==='POST').length,posts);assert.equal(localState(x),original);assert.deepEqual(x.f.persisted(),before);
});

void test('switching between two draft documents keeps separate bases and Save publishes only its selected document',async t=>{
  const x=await rendered(t),plan=x.f.document(x.id).planId,correction=(await x.f.accepted(x.f.command('correct',{documentId:plan,reason:'Synthetic plan correction'}))).result.documentId;
  await x.f.accepted(x.f.draft(correction,'save'));await x.ui.api.refresh();selectDocument(x,x.id);x.input('[data-field="notes"]','report local only');const reportBase=JSON.stringify(x.ui.api.s.bases.get(x.id));
  selectDocument(x,correction,'plans');x.input('[data-field="notes"]','plan local only');const planInput=JSON.stringify(x.ui.api.s.buffers.get(correction)),planBase=JSON.stringify(x.ui.api.s.bases.get(correction)),planGeneration=x.ui.api.s.bufferGenerations.get(correction);
  selectDocument(x,x.id);assert.equal(JSON.stringify(x.ui.api.s.bases.get(x.id)),reportBase);assert.equal(x.ui.root.querySelector('[data-field="notes"]').value,'report local only');await x.ui.button('save').click();
  assert.equal(x.ui.api.s.error,'');assert.equal(x.f.document(x.id).flow.saved.content.notes,'report local only');assert.equal(x.f.document(correction).flow.saved.content.notes,'');assert.equal(JSON.stringify(x.ui.api.s.buffers.get(correction)),planInput);assert.equal(JSON.stringify(x.ui.api.s.bases.get(correction)),planBase);assert.equal(x.ui.api.s.bufferGenerations.get(correction),planGeneration);
  assert.deepEqual(x.calls.filter(c=>c.method==='POST').map(c=>c.body.documentId),[x.id]);selectDocument(x,correction,'plans');await x.ui.button('submit').click();assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.equal(x.f.document(correction).flow.pendingId,null);
});

// Optional explicit local comparison input; core current-code tests above never
// skip or depend on Git history. This turn supplies the exact ab520ee blob.
if (process.env.ROUTINE_FQC_BASELINE_JS) {
  void test('explicit ab520ee baseline versus current full UI: same synthetic Save route counts and wire bytes', async (t) => {
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


async function generatingUI(f) {
  const initial = (await f.get()).body;
  const tab = manualUI({ actor: initial.identity.id, remote: clone(initial) });
  const calls = [];
  tab.box.fetch = async (url, options) => {
    const method = options.method || 'GET';
    calls.push({ method, url, body: options.body ? JSON.parse(options.body) : null });
    return f.dispatch(url, options);
  };
  return { ...tab, calls, methods: () => calls.map(call => call.method) };
}

void test('actual painted Update → route/SQLite: fresh company date and repeated updates never duplicate due jobs', async t => {
  const f = await fixture(t);
  const today = (await f.get()).body.today;
  await f.accepted(f.command('configure', { startDate: today }));
  const tab = await generatingUI(f), before = { ...f.counts };
  tab.api.getData().today = '2000-01-01'; tab.api.getData().sources = [];
  await tab.button().click();
  const first = clone(f.control().jobs);
  assert.equal(first.length, 1);
  assert.equal(tab.api.getData().today, today);
  assert.equal(tab.api.getData().sources[0].id, 'fixture-item');
  assert(first[0].start <= today && first[0].end >= today);
  assert.equal(f.control().documents.length, 0, 'generation creates due work, not inspection reports');
  for (let i = 0; i < 2; i++) await tab.button().click();
  assert.deepEqual(clone(f.control().jobs), first, 'same item/period is stable across distinct explicit operations');
  assert.deepEqual(tab.methods(), Array(3).fill(['GET', 'POST', 'GET']).flat());
  assert.deepEqual(f.delta(before), { post: 3, get: 6, receiptGet: 0, stateGet: 6, dbRun: 3, r2Put: 0, r2Head: 0 });
  assert.equal(tab.store.map.size, 0); f.verifyBackups();
});

void test('actual painted Update → route CAS race recomputes against latest state and retains all original dirty inputs', async t => {
  const f = await fixture(t), planId = await f.createPlan();
  const tab = await generatingUI(f), before = { ...f.counts };
  const input = dirty(tab), originalDocuments = clone(f.control().documents), jobs = clone(f.control().jobs);
  const originalBases = JSON.stringify([...tab.api.s.bases]);
  let peerOperation;
  f.beforeCAS(async () => {
    peerOperation = f.command('generate');
    await f.accepted(peerOperation);
    tab.api.s.buffers.get(planId).notes = 'New local input while actual CAS is pending';
  });
  await tab.button().click();
  assert(peerOperation);
  assert.deepEqual(tab.methods(), ['GET', 'POST', 'GET']);
  assert.deepEqual(f.delta(before), { post: 2, get: 2, receiptGet: 0, stateGet: 2, dbRun: 3, r2Put: 0, r2Head: 0 });
  assert.deepEqual(clone(f.control().jobs), jobs);
  assert.deepEqual(clone(f.control().documents), originalDocuments, 'generate never saves or mutates documents');
  assert.notEqual(inputs(tab), input, 'only the deliberate new input changed');
  assert.equal(tab.api.s.buffers.get(planId).notes, 'New local input while actual CAS is pending');
  assert.equal(JSON.stringify([...tab.api.s.bases]), originalBases);
  assert.equal(tab.api.getData().control.revision, f.control().revision);
  assert.equal(tab.store.map.size, 0);
  const post = tab.calls.find(call => call.method === 'POST');
  assert.deepEqual(Object.keys(post.body).sort(), ['action', 'operationId']);
  assert.notEqual(post.body.operationId, peerOperation.operationId);
  assert(f.control().receipts[post.body.operationId]); assert(f.control().receipts[peerOperation.operationId]);
  f.verifyBackups();
});

void test('actual routine route: integrated atomic local Save keeps one original receipt and rolls back invalid media/guards', async (t) => {
  const f = await fixture(t), id = await f.createPlan();
  const local = (value, extra = {}) => f.draft(id, 'save', {
    moduleAction: 'save-local-v1',
    patches: [{ op: 'set', path: ['notes'], value }],
    guards: [{ path: ['notes'], value: f.document(id).flow.working.notes }], ...extra,
  });
  await t.test('missing uploaded media rejects the complete staged Save before persistent writes', async () => {
    await rejectedWithoutCommit(f, local('not committed', {
      patches: [{ op: 'set', path: ['evidence'], value: ['b'.repeat(64)] }],
      guards: [{ path: ['evidence'], value: [] }],
    }), 422, 'PHOTO_NOT_UPLOADED');
  });
  await t.test('stale guard rejects without creating an outer or document receipt', async () => {
    await rejectedWithoutCommit(f, local('not committed', { guards: [{ path: ['notes'], value: 'stale peer value' }] }), 409, 'DEPENDENCY_CHANGED_RECONFIRM');
  });
  await t.test('actual Save and exact POST/GET replay publish only one Save, receipt and revision', async () => {
    const domainRevision = f.control().revision, revision = f.document(id).flow.revision, command = local('保存一次 Tiếng Việt'), before = { ...f.counts };
    const body = await f.accepted(command), saved = f.document(id).flow;
    assert.equal(f.counts.dbRun - before.dbRun, 1);
    assert.equal(f.control().revision, domainRevision + 1); assert.equal(saved.revision, revision + 1);
    assert.equal(saved.working.notes, '保存一次 Tiếng Việt'); assert.equal(saved.saved.content.notes, saved.working.notes);
    assert.equal(saved.saves.length, 1); assert.deepEqual(Object.keys(saved.receipts), [command.operationId]);
    assert.deepEqual(JSON.parse(saved.receipts[command.operationId].fingerprint), command.command);
    const persisted = f.persisted(), replay = await f.post(command); assert.equal(replay.status, 200); assert.deepEqual(replay.body.result, body.result);
    assert.deepEqual((await f.get('?operationId=' + command.operationId)).body.result, body.result);
    assert.deepEqual(f.persisted(), persisted); f.verifyBackups();
  });
});

void test('actual routine route: atomic local Save retries fresh CAS without duplicating its Save or overwriting a peer operation', async (t) => {
  const f = await fixture(t), id = await f.createPlan(), original = f.document(id).flow, domainRevision = f.control().revision;
  const command = f.draft(id, 'save', { moduleAction: 'save-local-v1', patches: [{ op: 'set', path: ['notes'], value: 'Retried once' }], guards: [{ path: ['notes'], value: original.working.notes }] });
  let peer;
  f.beforeCAS(async () => { peer = f.command('generate'); await f.accepted(peer); });
  await f.accepted(command);
  const flow = f.document(id).flow;
  assert(peer); assert.equal(f.control().revision, domainRevision + 2); assert.equal(flow.revision, original.revision + 1);
  assert.equal(flow.saves.length, 1); assert.equal(flow.saved.content.notes, 'Retried once');
  assert(f.control().receipts[peer.operationId]); assert(f.control().receipts[command.operationId]);
  assert.deepEqual(Object.keys(flow.receipts), [command.operationId]);
  assert.equal(f.storedValues().sentinel, 'unrelated synthetic module bytes'); f.verifyBackups();
});
