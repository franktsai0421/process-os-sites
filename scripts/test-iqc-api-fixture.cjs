/* oxlint-disable typescript/no-require-imports -- Isolated Workers handler fixture. */
/* In-memory D1/R2 only; existing Local and remote data are not touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, randomUUID } = require('node:crypto');

const db = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort())
  db.exec(fs.readFileSync(path.join('drizzle', name), 'utf8'));
const objects = new Map();
const env = {
  PROCESS_SESSION_SECRET: randomUUID(), DEMO_LOGIN_ENABLED: 'true',
  DB: { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
  }; } },
  STATE_ARCHIVE: {
    async head(key) { return objects.has(key) ? {} : null; },
    async put(key, value, options) { objects.set(key, { value, options }); },
    async get(key) { const item = objects.get(key); if (!item) return null;
      const bytes = Buffer.from(item.value);
      return { body: bytes, text: async () => bytes.toString(), httpMetadata: item.options?.httpMetadata };
    },
  },
};
const users = ['admin', 'rd', 'staff'].map(role => ({ id: `demo-${role}`, name: `Demo ${role}`,
  role, authMode: 'demo', enabled: true, inheritRole: true }));
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
  .run(JSON.stringify({ platformUsers: JSON.stringify(users) }), 'fixture');
const sourceDisk = JSON.parse(fs.readFileSync('public/process/iqc-source.json', 'utf8'));
const fixtureManifest = structuredClone(sourceDisk);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const fixtureModule = { exports: {} }; cache.set(file, fixtureModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module: fixtureModule, exports: fixtureModule.exports, require(id) {
    if (id === 'cloudflare:workers') return { env };
    if (id === '@/public/process/iqc-source.json') return fixtureManifest;
    const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
    return target.endsWith('.mjs') ? require(target) : load(target.endsWith('.ts') ? target : target + '.ts');
  }, Request, Response, URL, crypto: webcrypto, Date, TextEncoder, TextDecoder, atob, btoa, console });
  cache.set(file, fixtureModule.exports);
  return fixtureModule.exports;
}
const core = load('lib/process-state.ts');
const api = load('app/api/iqc/route.ts');
const photoApi = load('app/api/iqc/photo/route.ts');
const base = 'http://127.0.0.1:3901';
let cookies;
async function read(role = 'admin') {
  const response = await api.GET(new Request(base + '/api/iqc', { headers: { Cookie: cookies[role] } }));
  return { status: response.status, body: await response.json() };
}
async function call(role, action, extra = {}, revision) {
  const current = revision ?? (await read(role)).body.revision;
  const response = await api.POST(new Request(base + '/api/iqc', { method: 'POST',
    headers: { Cookie: cookies[role], Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, baseRevision: current, ...extra }),
  }));
  return { status: response.status, body: await response.json() };
}

(async () => {
  cookies = Object.fromEntries(await Promise.all(['admin', 'rd', 'staff'].map(async role => [role,
    `process_demo=${await core.demoSession(new Request(base), `demo-${role}`, true)}`])));
  assert.equal((await api.GET(new Request(base + '/api/iqc'))).status, 403);
  const manifest = structuredClone(fixtureManifest);
  assert.equal(sourceDisk.ready, true, 'The reviewed category map must be verified before import');
  assert.deepEqual([manifest.snapshot.parts.length, manifest.snapshot.errors.length,
    manifest.snapshot.items.length, manifest.snapshot.parts.flatMap(part => part.photos).length],
  [187, 538, 538, 185]);
  // The fixture uses the audited manifest, while D1 and R2 remain in-memory only.
  manifest.snapshot.parts.forEach(part => {
    part.photos.forEach(photo => { photo.src = `/api/iqc/photo?id=${photo.id}`;
      objects.set(`iqc/photos/${photo.id}`, { value: Buffer.from([1, 2, 3]) });
      delete photo.webPath;
    });
  });
  assert.equal((await call('staff', 'approve')).status, 403);
  let result = await call('admin', 'import', { source: manifest });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.versions[0].status, 'draft');
  assert.equal(result.body.control.activeVersionId, null);
  assert.equal((await call('admin', 'import', { source: manifest })).body.unchanged, true);
  let draft = (await read('staff')).body.control.versions[0];
  const tampered = structuredClone(draft.snapshot);
  tampered.parts[0].sourceRow += 1;
  assert.equal((await call('staff', 'save', { versionId: draft.id,
    versionRevision: draft.revision, snapshot: tampered })).status, 422);
  const saved = structuredClone(draft.snapshot);
  saved.parts[0].nameVi = 'Đã sửa trong bản nháp';
  result = await call('staff', 'save', { versionId: draft.id, versionRevision: draft.revision, snapshot: saved });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await read('admin')).body.control.versions[0].snapshot.parts[0].nameVi, saved.parts[0].nameVi);
  assert.equal((await call('staff', 'save', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: saved })).status, 409);
  draft = (await read('staff')).body.control.versions[0];
  result = await call('staff', 'createError', { versionId: draft.id, versionRevision: draft.revision,
    partCode: saved.parts[0].code, nameVi: 'Lỗi mới' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const created = result.body.control.versions[0].snapshot.errors.at(-1);
  assert.ok(created.code.startsWith(`${saved.parts[0].code}-IQC-L`));
  draft = result.body.control.versions[0];
  result = await call('staff', 'createItem', { versionId: draft.id, versionRevision: draft.revision,
    errorId: created.id, nameVi: 'Kiểm tra mới', rules: [{ id: 'fixture-rule', cadence: 'batch',
      kind: 'fixed_count', value: '5' }] });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  draft = result.body.control.versions[0];
  const lastEdit = structuredClone(draft.snapshot);
  lastEdit.parts[0].nameVi = 'Sửa cuối cùng trước khi gửi';
  result = await call('staff', 'submit', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: lastEdit });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.versions[0].status, 'pending');
  assert.equal(result.body.control.versions[0].snapshot.parts[0].nameVi, lastEdit.parts[0].nameVi);
  assert.equal((await call('staff', 'approve', { versionId: draft.id, versionRevision: result.body.control.versions[0].revision,
    comment: 'Không được phép' })).status, 403);
  // Quality review no longer requires a written opinion; rejection below still keeps history.
  result = await call('rd', 'reject', { versionId: draft.id, versionRevision: result.body.control.versions[0].revision,
    comment: 'Cần kiểm tra lại' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.versions[0].status, 'draft');
  draft = result.body.control.versions[0];
  result = await call('staff', 'submit', { versionId: draft.id, versionRevision: draft.revision,
    snapshot: draft.snapshot });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  result = await call('rd', 'approve', { versionId: draft.id, versionRevision: result.body.control.versions[0].revision,
    comment: 'Đã đối chiếu' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.activeVersionId, draft.id);
  assert.equal((await call('admin', 'begin')).body.control.versions.length, 2);
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const photo = await photoApi.PUT(new Request(base + '/api/iqc/photo', { method: 'PUT',
    headers: { Cookie: cookies.admin, Origin: base, 'Content-Type': 'image/png' }, body: image }));
  assert.equal(photo.status, 200);
  const imageId = (await photo.json()).id;
  assert.equal((await photoApi.GET(new Request(`${base}/api/iqc/photo?id=${imageId}`,
    { headers: { Cookie: cookies.admin } }))).status, 200);
  const activeDraft = (await read()).body.control.versions.find(version => version.status === 'draft');
  const withImage = structuredClone(activeDraft.snapshot);
  withImage.parts[0].photos.push({ id: imageId, src: `/api/iqc/photo?id=${imageId}` });
  assert.equal((await call('admin', 'save', { versionId: activeDraft.id,
    versionRevision: activeDraft.revision, snapshot: withImage })).status, 200);
  assert.equal((await read('rd')).body.control.versions.find(version => version.status === 'draft')
    .snapshot.parts[0].photos.at(-1).id, imageId);
  // A routine-equipment write advances the same D1 revision. IQC links must
  // use the active approved equipment ID, while source toolVi remains intact.
  const stateValues = (await core.readState()).values;
  stateValues.routineEquipmentControl = JSON.stringify({ activeVersionId: 'effective-equipment', versions: [{
    id: 'effective-equipment', status: 'approved', equipment: [
      { id: 'eq-1', assetCode: 'G7T017', pieceMark: '01', name: 'Dưỡng thử', spec: '10 mm', enabled: true },
      { id: 'eq-off', assetCode: 'OFF', pieceMark: '01', name: 'Disabled', enabled: false },
    ],
  }] });
  db.prepare('UPDATE shared_state SET revision=revision+1, "values"=? WHERE id=1')
    .run(await core.encodeValues(stateValues));
  let linkedDraft = (await read()).body.control.versions.find(version => version.status === 'draft');
  const linked = structuredClone(linkedDraft.snapshot);
  const originalTool = linked.items[0].toolVi;
  linked.items[0].inspectionMode = 'equipment';
  linked.items[0].equipmentId = 'eq-1';
  linked.items[0].equipmentSnapshot = { id: 'eq-1', assetCode: 'FAKE', pieceMark: '', name: 'Forged', spec: '' };
  linked.items[0].inspectionSpecVi = 'Thông số kiểm tra';
  linked.items[0].isEnabled = false;
  linked.items[0].mediaItems = [{ id: imageId, src: `/api/iqc/photo?id=${imageId}`, note: 'Ảnh kiểm tra' }];
  result = await call('admin', 'save', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, snapshot: linked });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].equipmentSnapshot.assetCode, 'G7T017');
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].toolVi, originalTool);
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].mediaItems[0].note, 'Ảnh kiểm tra');
  linkedDraft = (await read()).body.control.versions.find(version => version.status === 'draft');
  const forged = structuredClone(linkedDraft.snapshot);
  forged.items[0].equipmentSnapshot.name = 'Spoofed';
  result = await call('admin', 'save', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, snapshot: forged });
  assert.equal(result.status, 200);
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].equipmentSnapshot.name, 'Dưỡng thử');
  linkedDraft = result.body.control.versions.at(-1);
  result = await call('admin', 'createItem', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, errorId: created.id,
    nameVi: 'Kiểm tra thiết bị mới', toolVi: 'Nguyên văn mới', inspectionSpecVi: '10 mm',
    inspectionMode: 'equipment', equipmentId: 'eq-1', isEnabled: true,
    mediaItems: [{ id: imageId, src: `/api/iqc/photo?id=${imageId}`, note: 'Mặt trước' }],
    rules: [{ id: 'new-linked-rule', cadence: 'batch', kind: 'fixed_count', value: '3' }] });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.versions.at(-1).snapshot.items.at(-1).equipmentSnapshot.assetCode, 'G7T017');
  assert.equal(result.body.control.versions.at(-1).snapshot.items.at(-1).mediaItems[0].note, 'Mặt trước');
  linkedDraft = result.body.control.versions.at(-1);
  const disabled = structuredClone(linkedDraft.snapshot);
  disabled.items[0].equipmentId = 'eq-off';
  disabled.items[0].equipmentSnapshot = { id: 'eq-off' };
  assert.equal((await call('admin', 'save', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, snapshot: disabled })).status, 422);
  assert.equal((await call('admin', 'save', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, snapshot: linkedDraft.snapshot }, 1)).status, 409);
  const customRulesSnapshot = structuredClone(linkedDraft.snapshot);
  const originalSourceRules = customRulesSnapshot.items[0].rules.filter(rule => rule.cadence === 'source');
  customRulesSnapshot.items[0].rules.push(
    { id: 'custom-batch-rule', cadence: 'batch', kind: 'custom', nameVi: 'Mẫu tùy', value: 'Theo khách hàng' },
    { id: 'custom-time-rule', cadence: 'time', kind: 'custom', nameVi: 'Mỗi 9 ngày', value: '' });
  result = await call('admin', 'submit', { versionId: linkedDraft.id,
    versionRevision: linkedDraft.revision, snapshot: customRulesSnapshot });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const pendingLinked = result.body.control.versions.find(version => version.id === linkedDraft.id);
  assert.deepEqual(pendingLinked.snapshot.items[0].rules.filter(rule => rule.cadence === 'source'), originalSourceRules);
  assert.equal(pendingLinked.snapshot.items[0].rules.find(rule => rule.id === 'custom-batch-rule').value, 'Theo khách hàng');
  result = await call('rd', 'approve', { versionId: linkedDraft.id,
    versionRevision: pendingLinked.revision, comment: 'Thiết bị và ảnh đã đối chiếu' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.control.activeVersionId, linkedDraft.id);
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].equipmentId, 'eq-1');
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].mediaItems[0].note, 'Ảnh kiểm tra');
  assert.equal(result.body.control.versions.at(-1).snapshot.items[0].rules.length, customRulesSnapshot.items[0].rules.length);
  console.log(JSON.stringify({ isolated: true, sourceCounts: true, importIdempotent: true,
    draftReload: true, staleSaveBlocked: true, serverNumbering: true, submitIncludesLastEdit: true,
    rejectAndApprove: true, roleEnforced: true, photoR2: true,
    equipmentIdValidated: true, sourceToolPreserved: true, itemPhotoSaved: true,
    forgedSnapshotIgnored: true, staleRevisionBlocked: true,
    linkedItemSurvivesReviewAndApproval: true, customTextAndMultipleRulesPersist: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
