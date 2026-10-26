/* oxlint-disable typescript/no-require-imports -- This isolated fixture uses CommonJS to load Workers handlers into a VM. */
/* Isolated D1/R2 fixture; no existing Local database or remote binding is touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, randomUUID } = require('node:crypto');
const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join('drizzle', name), 'utf8'));
const verifyRetainedBackups = require('./automatic-backup-fixture.cjs')(db);
const objects = new Map();
const maintenanceToken = randomUUID();
const env = {
  PROCESS_SESSION_SECRET: randomUUID(), DEMO_LOGIN_ENABLED: 'true', PROCESS_RELEASE_TOKEN: maintenanceToken,
  DB: { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
  }; } },
  STATE_ARCHIVE: {
    async head(key) { return objects.has(key) ? {} : null; },
    async put(key, value, options) { objects.set(key, { value, options }); },
    async get(key) { const item = objects.get(key); if (!item) return null;
      const bytes = typeof item.value === 'string' ? Buffer.from(item.value) : Buffer.from(item.value);
      return { body: bytes, text: async () => bytes.toString(), httpMetadata: item.options?.httpMetadata }; },
  },
};
const users = ['admin','rd','staff'].map(role => ({ id: `demo-${role}`, name: `Demo ${role}`,
  role, authMode: 'demo', enabled: true, inheritRole: true }));
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
  .run(JSON.stringify({ platformUsers: JSON.stringify(users) }), 'fixture');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const fixtureModule = { exports: {} }; cache.set(file, fixtureModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: fixtureModule, exports: fixtureModule.exports, require(id) {
    if (id === 'cloudflare:workers') return { env };
    if (require('node:module').isBuiltin(id)) return require(id);
    const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
    return target.endsWith('.mjs') ? require(target) : load(target.endsWith('.ts') ? target : target + '.ts');
  }, Request, Response, ReadableStream, Headers, structuredClone, URL, crypto: webcrypto, Date, TextEncoder, TextDecoder, atob, btoa, console });
  cache.set(file, fixtureModule.exports); return fixtureModule.exports;
}
const core = load('lib/process-state.ts');
const domain = load('lib/routine-equipment.ts');
const api = load('app/api/routine-equipment/route.ts');
const photoApi = load('app/api/routine-equipment/photo/route.ts');
const base = 'http://127.0.0.1:3900';
let cookies;
async function call(role, action, extra = {}, revision, maintenance = false) {
  const current = revision ?? (await (await api.GET(new Request(base + '/api/routine-equipment',
    { headers: { Cookie: cookies[role] } }))).json()).revision;
  const request = new Request(base + '/api/routine-equipment', { method: 'POST',
    headers: { Cookie: cookies[role], Origin: base, 'Content-Type': 'application/json', ...(maintenance ? { 'X-Process-Release-Token': maintenanceToken } : {}) },
    body: JSON.stringify({ action, baseRevision: current, ...extra }) });
  const response = await api.POST(request);
  return { status: response.status, body: await response.json() };
}
async function read(role) {
  const response = await api.GET(new Request(base + '/api/routine-equipment', { headers: { Cookie: cookies[role] } }));
  return { status: response.status, body: await response.json() };
}

(async () => {
  cookies = Object.fromEntries(await Promise.all(['admin','rd','staff'].map(async role => {
    const token = await core.demoSession(new Request(base), `demo-${role}`, true);
    return [role, `process_demo=${token}`];
  })));
  assert.equal((await api.GET(new Request(base + '/api/routine-equipment'))).status, 403);
  const uncal = { id: 'uncal', assetCode: 'UNCAL', pieceMark: '01', nameVi: 'Chưa hiệu chuẩn', groupId: 'TG-FIX',
    calibrationMethod: '外部校正 / Hiệu chuẩn bên ngoài', calibratedAt: '', expiresAt: '' };
  assert.match(domain.submitErrors({ equipment: [uncal] }).join(' '), /校正日期及有效期限必填/);
  assert.equal(domain.availability({ ...uncal, enabled: true, confirmed: true }), false);
  assert.equal((await call('staff', 'approve')).status, 403);
  let response = await call('admin', 'begin'); assert.equal(response.status, 200);
  const draftId = response.body.control.versions[0].id;
  const group = { id: 'TG-FIX', name: 'Nhóm thử nghiệm', categoryId: 'cat-fixture', subcategoryId: 'sub-fixture', spec: '' };
  const categories = [{ id: 'cat-fixture', code: 'C01', name: '量具' }];
  const subcategories = [{ id: 'sub-fixture', categoryId: 'cat-fixture', name: '量尺' }];
  const initial = response.body.control.versions[0];
  response = await call('admin', 'save', { versionId: draftId, versionRevision: initial.revision,
    snapshot: { equipment: [], groups: [group], categories, subcategories, issues: [] } }); assert.equal(response.status, 200);
  response = await call('staff', 'create', { assetCode: 'FIX001', groupId: 'TG-FIX', unit: '個' }); assert.equal(response.status, 200);
  assert.equal(response.body.control.versions[0].equipment[0].pieceMark, '01');
  let draft = response.body.control.versions[0];
  const snapshot = { equipment: draft.equipment.map(item => ({ ...item, name: 'Bản nháp', groupId: 'TG-FIX' })), groups: [group], categories, subcategories, issues: [] };
  response = await call('staff', 'save', { versionId: draftId, versionRevision: draft.revision, snapshot });
  assert.equal(response.status, 200);
  const persisted = await read('admin'); assert.equal(persisted.body.control.versions[0].equipment[0].name, 'Bản nháp');
  draft = persisted.body.control.versions[0];
  const priorRevision = persisted.body.revision;
  const bad = await call('staff', 'save', { versionId: draftId, versionRevision: draft.revision,
    snapshot: { ...snapshot, equipment: snapshot.equipment.map(item => ({ ...item, groupId: 'MISSING' })) } });
  assert.equal(bad.status, 422); assert.equal((await read('admin')).body.revision, priorRevision);
  // Submit includes unsaved last edit in the same revision-checked D1 update.
  snapshot.equipment[0].name = 'Final edit';
  response = await call('staff', 'submit', { versionId: draftId, versionRevision: draft.revision, snapshot });
  assert.equal(response.status, 200); assert.equal(response.body.control.versions[0].status, 'pending');
  assert.equal(response.body.control.versions[0].equipment[0].name, 'Final edit');
  assert.equal((await call('staff', 'submit', { versionId: draftId, versionRevision: draft.revision, snapshot }, priorRevision)).status, 409);
  assert.equal((await call('staff', 'approve', { versionId: draftId, versionRevision: response.body.control.versions[0].revision, comment: 'Unauthorized' })).status, 403);
  response = await call('rd', 'reject', { versionId: draftId, versionRevision: response.body.control.versions[0].revision, comment: '補充來源' });
  assert.equal(response.status, 200); assert.equal(response.body.control.versions[0].status, 'draft');
  assert.equal(response.body.control.versions[0].reviewComment, '補充來源');
  draft = response.body.control.versions[0];
  response = await call('staff', 'submit', { versionId: draftId, versionRevision: draft.revision,
    snapshot: { equipment: draft.equipment, groups: draft.groups, categories: draft.categories, subcategories: draft.subcategories, issues: draft.issues } });
  assert.equal(response.status, 200);
  response = await call('admin', 'withdraw'); assert.equal(response.status, 200);
  assert.equal(response.body.control.versions[0].status, 'draft');
  draft = response.body.control.versions[0];
  response = await call('staff', 'submit', { versionId: draftId, versionRevision: draft.revision,
    snapshot: { equipment: draft.equipment, groups: draft.groups, categories: draft.categories, subcategories: draft.subcategories, issues: draft.issues } });
  assert.equal(response.status, 200);
  response = await call('rd', 'approve', { versionId: draftId, versionRevision: response.body.control.versions[0].revision, comment: '已核對' });
  assert.equal(response.status, 200); assert.equal(response.body.control.activeVersionId, draftId);
  assert.equal(response.body.control.versions[0].status, 'approved');
  assert.equal(response.body.control.versions[0].equipment[0].effectiveAt.length > 0, true);
  response = await call('admin', 'begin'); assert.equal(response.status, 200);
  const newer = response.body.control.versions.find(version => version.status === 'draft');
  assert.equal(newer.number, 2); assert.equal(newer.equipment[0].name, 'Final edit');
  response = await call('admin', 'create', { assetCode: 'FIX001', groupId: 'TG-FIX', unit: '組' }); assert.equal(response.status, 200);
  assert.equal(response.body.control.versions.find(version => version.status === 'draft').equipment.at(-1).pieceMark, '02');
  const second = response.body.control.versions.find(version => version.status === 'draft').equipment.at(-1);
  response = await call('admin', 'delete', { id: second.id }); assert.equal(response.status, 200);
  response = await call('admin', 'create', { assetCode: 'FIX001', groupId: 'TG-FIX', unit: '組' }); assert.equal(response.status, 200);
  assert.equal(response.body.control.versions.find(version => version.status === 'draft').equipment.at(-1).pieceMark, '03');
  assert.equal((await call('admin', 'delete', { id: response.body.control.versions.find(version => version.status === 'draft').equipment[0].id })).status, 403);
  const {pngFixture}=await import('../tests/photo-fixtures.mjs');
  const image=pngFixture({width:8,height:8});
  const imageResponse = await photoApi.PUT(new Request(base + '/api/routine-equipment/photo', { method: 'PUT',
    headers: { Cookie: cookies.admin, Origin: base, 'Content-Type': 'image/png' }, body: image }));
  assert.equal(imageResponse.status, 200);
  const imageId = (await imageResponse.json()).id;
  assert.equal((await photoApi.GET(new Request(`${base}/api/routine-equipment/photo?id=${imageId}`, { headers: { Cookie: cookies.admin } }))).status, 200);
  assert.equal((await photoApi.GET(new Request(`${base}/api/routine-equipment/photo?id=${imageId}`))).status, 403);
  draft = response.body.control.versions.find(version => version.status === 'draft');
  const nextSnapshot = { equipment: draft.equipment.map(item => item.pieceMark === '03'
    ? { ...item, name: 'Thiết bị ảnh', categoryCode: 'C01', category: '量具', subcategory: '量尺',
      groupId: 'TG-FIX', photoId: imageId, calibrationMethod: 'internal', calibrationCycle: 'monthly' } : item), groups: draft.groups,
    categories: draft.categories, subcategories: draft.subcategories, issues: draft.issues };
  const photoSave = await call('admin', 'save', { versionId: draft.id, versionRevision: draft.revision, snapshot: nextSnapshot });
  assert.equal(photoSave.status, 200);
  const restored = await read('rd');
  assert.equal(restored.body.control.versions.find(version => version.status === 'draft').equipment.at(-1).photoId, imageId);
  const missingDate = domain.submitProblems({ ...draft, equipment: nextSnapshot.equipment }).find(problem => problem.id === draft.equipment.at(-1).id && problem.field === 'calibratedAt');
  assert.ok(missingDate);assert.notEqual(missingDate.blocking, true, 'Missing content remains advisory under whole-module draft policy');
  const invalidDateSnapshot = { ...nextSnapshot, equipment: nextSnapshot.equipment.map(item => item.pieceMark === '03' ? { ...item, calibratedAt: '2026-10-10', expiresAt: '2026-10-09' } : item) };
  const beforeInvalidSubmit = restored.body.revision;
  const invalidSubmit = await call('admin', 'submit', { versionId: draft.id,
    versionRevision: photoSave.body.control.versions.find(version => version.status === 'draft').revision,
    snapshot: invalidDateSnapshot });
  assert.equal(invalidSubmit.status, 422);
  assert.equal((await read('admin')).body.revision, beforeInvalidSubmit);
  assert.ok(invalidSubmit.body.problems.some(problem => problem.id === draft.equipment.at(-1).id && problem.field === 'expiresAt' && problem.blocking === true));
  assert.equal(domain.availability({ ...draft.equipment.at(-1), enabled: true, confirmed: true,
    calibrationMethod: '內部＋外部 / Nội bộ + Bên ngoài' }), false);
  draft = (await read('admin')).body.control.versions.find(version => version.status === 'draft');
  const emptyCategory = { id: 'cat-empty', code: 'C02', name: '空類別' };
  const emptySub = { id: 'sub-empty', categoryId: 'cat-empty', name: '空子類別' };
  const hierarchySnapshot = { equipment: draft.equipment, groups: draft.groups,
    categories: [...draft.categories, emptyCategory], subcategories: [...draft.subcategories, emptySub], issues: draft.issues };
  response = await call('admin', 'save', { versionId: draft.id, versionRevision: draft.revision, snapshot: hierarchySnapshot });
  assert.equal(response.status, 200);
  draft = (await read('rd')).body.control.versions.find(version => version.status === 'draft');
  assert.equal(draft.categories.find(item => item.id === 'cat-empty').name, '空類別');
  assert.equal(draft.subcategories.find(item => item.id === 'sub-empty').name, '空子類別');
  const blockedDelete = await call('admin', 'save', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: { ...hierarchySnapshot, categories: hierarchySnapshot.categories.filter(item => item.id !== 'cat-empty') } });
  assert.equal(blockedDelete.status, 422);
  const blockedGroupDelete = await call('admin', 'save', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: { ...hierarchySnapshot, groups: [] } });
  assert.equal(blockedGroupDelete.status, 422);
  const renamed = domain.checkedSnapshot(draft, { ...hierarchySnapshot,
    categories: hierarchySnapshot.categories.map(item => item.id === 'cat-fixture' ? { ...item, name: '改名後量具' } : item) });
  assert.equal(renamed.groups.find(item => item.id === 'TG-FIX').category, '改名後量具');
  assert.equal(renamed.equipment[0].category, '改名後量具');
  assert.equal(draft.groups.find(item => item.id === 'TG-FIX').category, '量具', 'source draft must not mutate during validation');
  assert.equal(domain.availability({ ...draft.equipment[0], enabled: true, confirmed: true, calibrationMethod: 'none', sourceRow: 2 },
    [{ sourceRow: 2, status: 'pending' }]), false);
  const workbookId = randomUUID();
  const workbookSnapshot = { ...hierarchySnapshot, equipment: [...draft.equipment,
    { id: workbookId, assetCode: 'FIX001', pieceMark: '', groupId: 'TG-FIX', name: 'Mới', quantity: 1,
      unit: '個', enabled: true, confirmed: false, calibrationMethod: 'none', calibratedAt: '', expiresAt: '' }] };
  const beforeMaintenanceImport = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const deniedImport = await call('admin', 'workbookImport', { versionId: draft.id, versionRevision: draft.revision, snapshot: workbookSnapshot });
  assert.equal(deniedImport.status,403);assert.equal(deniedImport.body.error,'NON_BOM_IMPORT_MAINTENANCE_ONLY');
  assert.deepEqual(db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),beforeMaintenanceImport);
  response = await call('admin', 'workbookImport', { versionId: draft.id, versionRevision: draft.revision, snapshot: workbookSnapshot }, undefined, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.control.versions.find(version => version.status === 'draft').equipment.find(item => item.id === workbookId).pieceMark, '04');
  draft = response.body.control.versions.find(version => version.status === 'draft');
  response = await call('admin', 'workbookImport', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: { ...workbookSnapshot, equipment: workbookSnapshot.equipment.map(item => item.id === workbookId ? { ...item, pieceMark: '04' } : item) } }, undefined, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.control.versions.find(version => version.status === 'draft').equipment.filter(item => item.id === workbookId).length, 1);
  const competingRevision = response.body.revision;
  const competing = await Promise.all([
    call('admin', 'create', { assetCode: 'FIX001', groupId: 'TG-FIX', unit: '支' }, competingRevision),
    call('admin', 'create', { assetCode: 'FIX001', groupId: 'TG-FIX', unit: '支' }, competingRevision),
  ]);
  assert.deepEqual(competing.map(result => result.status).sort((a, b) => a - b), [200, 409]);
  assert.equal((await read('admin')).body.control.versions.find(version => version.status === 'draft').equipment.filter(item => item.pieceMark === '05').length, 1);
  const issueRow = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const issueValues = JSON.parse(issueRow.values), issueControl = JSON.parse(issueValues.routineEquipmentControl);
  issueControl.versions.find(version => version.status === 'draft').issues = [{ sourceRow: 77, assetCode: 'FIX001', type: '來源疑點', detail: '原文不可改', status: 'pending' }];
  issueValues.routineEquipmentControl = JSON.stringify(issueControl);
  db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(issueValues));
  draft = (await read('admin')).body.control.versions.find(version => version.status === 'draft');
  const issueSnapshot = { equipment: draft.equipment, groups: draft.groups, categories: draft.categories,
    subcategories: draft.subcategories, issues: [{ ...draft.issues[0], status: 'resolved', resolution: '已查實' }] };
  response = await call('admin', 'save', { versionId: draft.id, versionRevision: draft.revision, snapshot: issueSnapshot });
  assert.equal(response.status, 200);
  const resolvedIssue = response.body.control.versions.find(version => version.status === 'draft').issues[0];
  assert.equal(resolvedIssue.detail, '原文不可改'); assert.equal(resolvedIssue.resolvedById, 'demo-admin');
  assert.ok(resolvedIssue.resolvedAt);
  const currentRow = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const corruptValues = { ...JSON.parse(currentRow.values), routineEquipmentControl: '{broken' };
  db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(corruptValues));
  assert.equal((await read('admin')).status, 503);
  assert.equal((await call('admin', 'begin', {}, currentRow.revision)).status, 500);
  assert.equal(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values, JSON.stringify(corruptValues));
  verifyRetainedBackups();
  console.log(JSON.stringify({ isolated: true, saveReload: true, submitIncludesLastEdit: true, invalidSaveAtomic: true,
    duplicateSubmitBlocked: true, permission: true, rejectResubmitWithdrawApprove: true,
    historicalVersion: true, pieceMarkNoReuse: true, photoR2: true, photoReload: true,
    singleCalibrationSubmitValidation: true, emptyHierarchyPersisted: true, hierarchyDeleteLocked: true,
    issueBlocksAvailability: true, issueAuditStamped: true, stableHierarchyRename: true, workbookImportIdempotent: true, concurrentCreateCAS: true, corruptLoadDoesNotOverwrite: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
