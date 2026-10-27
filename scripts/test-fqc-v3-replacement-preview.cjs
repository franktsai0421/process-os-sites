/* In-process actual handlers, normal synthetic logins and private SQLite/R2.
 * No HTTP server, browser, production credentials, business data or ACL changes.
 * Legacy compatibility projection is derived from normal-created approvals; it
 * is not a claim that a legacy business lifecycle ran.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, createHash } = require('node:crypto');
const source = path.resolve(process.env.FQC_PREVIEW_SOURCE_ROOT || path.join(__dirname, '..'));
process.chdir(source);
const loader = require(path.join(source, 'scripts/ipqc-ab-import-harness.cjs'));
const { accessKeys } = require(path.join(source, 'public/process/access-policy.mjs'));
const json = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const groups = [], trace = [];
const record = name => { groups.push({ name, status: 'PASS' }); console.log(JSON.stringify(groups.at(-1))); };
const ops = ['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw'];
const allowed = {
  editor: ['fqc', 'equipment'].flatMap(module => ops.map(op => module + '.' + op)),
  reviewer: ['fqc', 'equipment'].flatMap(module => ['view', 'approve', 'return'].map(op => module + '.' + op)),
  'edit-only': ['equipment.view', 'fqc.view', 'fqc.edit', 'fqc.save'],
  'no-edit': ['equipment.view', 'equipment.submit', 'fqc.view', 'fqc.submit'],
  'no-view': ['equipment.view', 'equipment.submit', 'fqc.edit', 'fqc.submit'],
  admin: ['fqc', 'equipment'].flatMap(module => ops.map(op => module + '.' + op)),
};
async function fixture(projection = {}) {
  const db = new DatabaseSync(':memory:'), objects = new Map();
  for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort())
    db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
  const env = { PROCESS_SESSION_SECRET: randomUUID(),
    DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      async run() {
        if (/\b(INSERT|UPDATE|DELETE)\b.*state_backups/i.test(sql)) throw Error('BACKUP_WRITE_FORBIDDEN');
        return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
      },
    }; }, async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.all()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } },
    STATE_ARCHIVE: {
      async put(key, value) { objects.set(key, Buffer.from(value)); },
      async head(key) { return objects.has(key) ? {} : null; },
      async get(key) { const bytes = objects.get(key); return bytes ? {
        text: async () => bytes.toString(),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      } : null; },
      async delete() { throw Error('R2_DELETE_FORBIDDEN'); },
    },
  };
  const load = loader(env), core = load('lib/process-state.ts'), wire = load('lib/workflow-wire.ts');
  const password = randomUUID(), sessions = {}, sequence = {};
  const users = Object.entries(allowed).map(([id, keys]) => ({ id: 'preview-' + id, name: 'Synthetic ' + id,
    role: id === 'admin' ? 'admin' : 'staff', enabled: true, inheritRole: false, authEpoch: 1,
    password, lines: ['A', 'B', 'C'], views: ['data', 'approval'],
    permissions: ['editor', 'no-edit', 'no-view', 'admin'].includes(id) ? ['approval.submit'] : [],
    accessOverrides: Object.fromEntries(accessKeys.map(key => [key, keys.includes(key)])),
  }));
  const values = { ...projection, platformUsers: JSON.stringify(users) };
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(
    await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, values), 'synthetic');
  for (const user of users) {
    const response = await load('app/api/platform-login/route.ts').POST(new Request('http://fixture/api/platform-login', {
      method: 'POST', headers: { Origin: 'http://fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, password }),
    }));
    assert.equal(response.status, 200, response.status === 200 ? '' : await response.text());
    sessions[user.id.slice(8)] = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: 'http://fixture', 'Content-Type': 'application/json' };
    trace.push({ endpoint: 'platform-login', method: 'POST', actor: user.id, status: response.status });
  }
  const flow = body => body.control.workflow;
  async function call(endpoint, method = 'GET', body, who = 'editor', expected = 200, query = '') {
    const response = await load('app/api/' + endpoint + '/route.ts')[method](new Request('http://fixture/api/' + endpoint + query, {
      method, headers: sessions[who], ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const data = wire.expandWorkflowPayload(await response.json());
    trace.push({ endpoint, method, action: body?.command?.action || body?.action, who, status: response.status });
    assert.equal(response.status, expected, endpoint + ' ' + method + ': ' + JSON.stringify(data).slice(0,240));
    return data;
  }
  const read = (module, who = 'editor') => call(module + '/workflow', 'GET', undefined, who, 200, '?caseMetadata=1');
  const begin = (module, who = 'editor', expected = 200) => call(module + '/workflow', 'POST', { action: 'begin' }, who, expected, '?caseMetadata=1');
  async function command(module, action, detail = {}, who = 'editor', expected = 200) {
    const before = await read(module), state = flow(before);
    const command = { operationId: randomUUID(), clientId: 'preview-' + who, sequence: sequence[who] = (sequence[who] || 0) + 1,
      generation: state.generation, expectedRevision: state.revision, action, ...detail };
    return call(module + '/workflow', 'POST', { command }, who, expected, '?caseMetadata=1');
  }
  async function promote(module) {
    const saved = flow(await command(module, 'save')).saved;
    const submitted = await command(module, 'submit', { savedId: saved.id, reason: 'Synthetic preview fixture' });
    await command(module, 'approve', { caseId: submitted.receipt.caseId }, 'reviewer');
    return submitted.receipt.caseId;
  }
  const snapshot = () => ({ row: { ...db.prepare('SELECT * FROM shared_state').get() }, objects: [...objects].map(([key, bytes]) => [key, hash(bytes)]) });
  async function preview(who = 'editor', expected = 200) {
    const before = snapshot();
    const result = await call('quality-equipment-replacement', 'GET', undefined, who, expected, '?sourceId=source');
    assert.deepEqual(snapshot(), before, 'preview must be read-only'); return result;
  }
  return { db, objects, load, core, flow, call, read, begin, command, promote, snapshot, preview, close: () => db.close() };
}
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
(async () => {
  const h = await fixture();
  try {
    await h.begin('routine-equipment');
    await h.command('routine-equipment', 'apply', { patches: [
      insert('categories', { id: 'category', name: 'Synthetic category' }),
      insert('subcategories', { id: 'subcategory', categoryId: 'category', name: 'Synthetic subcategory' }),
      insert('groups', { id: 'group', categoryId: 'category', subcategoryId: 'subcategory', name: 'Synthetic group' }),
    ] });
    const equipment = { groupId: 'group', spec: '0–150 mm', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '' };
    await h.command('routine-equipment', 'apply', { patches: ['source', 'target'].map((id, i) => insert('equipment', { ...equipment, id, assetCode: 'FX700' + i, name: 'Synthetic ' + id })) });
    await h.promote('routine-equipment');
    await h.begin('fqc');
    await h.command('fqc', 'apply', { patches: [
      insert('errors', { id: 'error', name: 'Synthetic error', line: 'A', category: 'Fixture' }),
      insert('items', { id: 'item', errorId: 'error', name: 'Synthetic item', description: 'Keep standards / 保留標準', line: 'A', category: 'Fixture',
        isEnabled: true, equipmentId: 'source', equipmentSnapshot: null, tool: 'FX7000', mediaItems: [], productCodes: [], rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' } }),
    ] });
    const originalCaseId = await h.promote('fqc');
    const originalCase = await h.call('fqc/workflow', 'GET', undefined, 'editor', 200, '?caseId=' + originalCaseId);
    const initial = await h.read('fqc'), originalActive = json(h.flow(initial).active), originalSaved = json(h.flow(initial).saved);
    assert.equal(initial.permissions.edit, true);
    const initialPreview = await h.preview(), fqc = initialPreview.modules.find(module => module.moduleId === 'fqc');
    assert(fqc.workflow);
    assert.equal(fqc.items[0].selectable, true, 'adopted V3 FQC editor must be selectable without ADMIN');
    const otherModules = json(initialPreview.modules.filter(module => module.moduleId !== 'fqc'));
    record('Normal-created approval: staff with existing FQC view/edit can select V3 replacement; preview makes zero writes');
    const beforeEdits = await h.core.readState();
    const legacyQuality = JSON.parse(beforeEdits.values.qualityMasterControl);
    delete legacyQuality.libraries.fqc.workflow;
    const legacyProjection = { qualityMasterControl: JSON.stringify(legacyQuality), routineEquipmentControl: beforeEdits.values.routineEquipmentControl };
    // Same real guarded fields used by executeTransfer; not native UI invocation.
    async function replace(who, target, expected = 200) {
      const row = h.flow(await h.read('fqc')).working.items[0], equipment = h.flow(await h.read('routine-equipment')).active.content.equipment.find(item => item.id === target);
      const patches = [{ op: 'set', path: ['items', { id: row.id }, 'equipmentId'], value: target }, { op: 'set', path: ['items', { id: row.id }, 'tool'], value: equipment.pieceMark || equipment.assetCode }];
      return h.command('fqc', 'apply', { patches, guards: patches.map(patch => ({ path: patch.path, value: row[patch.path.at(-1)] })) }, who, expected);
    }
    await h.begin('fqc');
    await replace('editor', 'target');
    let current = h.flow(await h.read('fqc'));
    assert.equal(current.working.items[0].equipmentId, 'target');
    assert.deepEqual(current.active, originalActive); assert.deepEqual(current.saved, originalSaved);
    assert.deepEqual(await h.call('fqc/workflow', 'GET', undefined, 'editor', 200, '?caseId=' + originalCaseId), originalCase);
    assert.equal(current.working.items[0].description, 'Keep standards / 保留標準');
    record('Permitted staff guarded replacement edits only working; saved, effective and original fixed case remain unchanged');
    const editOnlyPreview = await h.preview('edit-only');
    assert.equal(editOnlyPreview.modules.find(module => module.moduleId === 'fqc').items[0].selectable, true);
    const editOnlyPermissions = (await h.read('fqc', 'edit-only')).permissions;
    assert.equal(editOnlyPermissions.edit, true); assert.equal(editOnlyPermissions.submit, false);
    await replace('edit-only', 'source');
    const saved = h.flow(await h.command('fqc', 'save', {}, 'edit-only')).saved;
    let before = h.snapshot();
    const deniedSubmit = await h.command('fqc', 'submit', { savedId: saved.id, reason: 'must remain forbidden' }, 'edit-only', 403);
    assert.equal(deniedSubmit.error, 'FORBIDDEN'); assert.deepEqual(h.snapshot(), before);
    record('Existing edit without submit selects and applies working-only replacement; independent Submit permission still rejects with zero persistence');
    for (const who of ['no-edit', 'no-view']) {
      const preview = await h.preview(who); assert.equal(preview.modules.find(module => module.moduleId === 'fqc').items[0].selectable, false);
      before = h.snapshot(); await replace(who, 'target', 403); assert.deepEqual(h.snapshot(), before);
    }
    record('Missing FQC edit or view remains unselectable and Apply403 despite other-module submit capability');
    await replace('editor', 'target');
    const replacementSave = h.flow(await h.command('fqc', 'save')).saved;
    const submitted = await h.command('fqc', 'submit', { savedId: replacementSave.id, reason: 'Synthetic replacement approval' });
    const pendingPreview = await h.preview(); assert.equal(pendingPreview.modules.find(module => module.moduleId === 'fqc').items[0].selectable, false);
    before = h.snapshot(); const locked = await replace('editor', 'source', 409); assert.equal(locked.error, 'PENDING_LOCKED'); assert.deepEqual(h.snapshot(), before);
    await h.command('fqc', 'approve', { caseId: submitted.receipt.caseId }, 'reviewer');
    current = h.flow(await h.read('fqc')); assert.equal(current.active.content.items[0].equipmentId, 'target');
    assert.deepEqual(await h.call('fqc/workflow', 'GET', undefined, 'editor', 200, '?caseId=' + originalCaseId), originalCase);
    record('Pending stays locked; only explicit Save/Submit/independent approval changes effective equipment and retains original fixed case');
    const afterPreview = await h.preview(); assert.deepEqual(afterPreview.modules.filter(module => module.moduleId !== 'fqc'), otherModules);
    before = h.snapshot(); const legacyPost = await h.call('quality-equipment-replacement', 'POST', { action: 'apply', baseRevision: afterPreview.revision, moduleId: 'fqc', sourceEquipmentId: 'source', targetEquipmentId: 'target', itemIds: ['item'] }, 'editor', 403); assert(legacyPost.error); assert.deepEqual(h.snapshot(), before);
    const adminPreview = await h.preview('admin'); before = h.snapshot(); const adoptedLegacyPost = await h.call('quality-equipment-replacement', 'POST', { action: 'apply', baseRevision: adminPreview.revision, moduleId: 'fqc', sourceEquipmentId: 'source', targetEquipmentId: 'target', itemIds: ['item'] }, 'admin', 409); assert.equal(adoptedLegacyPost.code, 'WORKFLOW_V3_REQUIRED'); assert.deepEqual(h.snapshot(), before);
    record('Other module preview DTOs unchanged in this fixture; old POST remains ADMIN-only and refuses adopted V3 writes');
    const legacy = await fixture(legacyProjection);
    try {
      const staffPreview = await legacy.preview(), adminPreview = await legacy.preview('admin');
      assert.equal(staffPreview.modules.find(module => module.moduleId === 'fqc').workflow, null);
      assert.equal(staffPreview.modules.find(module => module.moduleId === 'fqc').items[0].selectable, false);
      assert.equal(adminPreview.modules.find(module => module.moduleId === 'fqc').items[0].selectable, true);
      const before = legacy.snapshot(); await legacy.call('quality-equipment-replacement', 'POST', { action: 'apply', baseRevision: staffPreview.revision, moduleId: 'fqc', sourceEquipmentId: 'source', targetEquipmentId: 'target', itemIds: ['item'] }, 'editor', 403); assert.deepEqual(legacy.snapshot(), before);
      record('Read-only legacy compatibility projection of normal approvals retains staff denial and ADMIN preview eligibility; no legacy mutation lifecycle claimed');
    } finally { legacy.close(); }
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM state_backups').get().n, 0);
    const summary = { status: 'PASS_BOUNDED_FQC_V3_REPLACEMENT_PREVIEW', groups: groups.length, directHandlerInvocations: trace.length, checks: groups, trace,
      limits: ['Synthetic actual handlers only; no native UI/checkbox/confirm or live speed.', 'Non-FQC module DTOs here are unconnected; populated cross-module behavior is not certified.', 'Legacy projection derives normal-approved synthetic controls but is not a normal legacy creation/approval lifecycle.', 'No broad ACL, browser, build, deployment or four-canvas acceptance inferred.'] };
    if (process.env.FQC_PREVIEW_EVIDENCE_PATH) fs.writeFileSync(process.env.FQC_PREVIEW_EVIDENCE_PATH, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ status: summary.status, groups: groups.length, directHandlerInvocations: trace.length }));
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
