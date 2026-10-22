/* oxlint-disable typescript/no-require-imports -- Isolated Workers route fixture. */
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
      return { body: bytes, text: async () => bytes.toString(), httpMetadata: item.options?.httpMetadata }; },
  },
};
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const workflowModule = { exports: {} }; cache.set(file, workflowModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: workflowModule, exports: workflowModule.exports, require(id) {
    if (id === 'cloudflare:workers') return { env };
    const target = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
    return target.endsWith('.mjs') ? require(target) : load(target.endsWith('.ts') ? target : `${target}.ts`);
  }, Request, Response, URL, crypto: webcrypto, Date, TextEncoder, TextDecoder, atob, btoa, console });
  cache.set(file, workflowModule.exports); return workflowModule.exports;
}
const now = new Date().toISOString();
const version = (id, status, items) => ({ id, number: 1, status, revision: 1,
  snapshot: { errors: [], items }, baseVersionId: null, creatorId: 'demo-admin', creatorName: 'Admin',
  createdAt: now, updatedAt: now, history: [] });
const makeItem = (id, equipmentId, extra = {}) => ({ id, checkNo: id, name: id,
  equipmentId, equipmentSnapshot: { id: equipmentId }, isEnabled: true, ...extra });
const fqc = { activeVersionId: 'fqc-active', versions: [version('fqc-active', 'approved', [
  makeItem('fqc-1', 'source', { reason: 'preserve me' }), makeItem('fqc-2', 'source')])] };
const iqc = { activeVersionId: 'iqc-active', versions: [
  version('iqc-active', 'approved', [makeItem('iqc-1', 'source', { toolVi: 'Nguyên văn' })]),
  version('iqc-pending', 'pending', [makeItem('iqc-1', 'source', { toolVi: 'Nguyên văn' })]) ] };
const ipqcItem = makeItem('ipqc-1', 'source', { code: 'C-X-L1-01', errorId: 'ipqc-error',
  productCode: 'X', stageCode: 'C-TIEN', standard: '12 mm', cpkEnabled: false, standardEnabled: true,
  description: '', tool: 'Nguyên văn', method: '', frequency: '', note: '', reason: '',
  equipmentGroupId: 'group-1', notApplicable: false, mediaItems: [], deleted: false });
const ipqcVersion = version('ipqc-active', 'approved', [ipqcItem]);
ipqcVersion.snapshot.errors.push({ id: 'ipqc-error', code: 'C-X-L1', productCode: 'X', stageCode: 'C-TIEN',
  name: 'Lỗi', note: '', reason: '', deleted: false });
const ipqc = { schemaVersion: 1, activeVersionId: 'ipqc-active', versions: [ipqcVersion],
  reservedErrorCodes: [], reservedItemCodes: [], source: null };
const routine = { activeVersionId: 'equipment-active', versions: [{ id: 'equipment-active', status: 'approved',
  equipment: [{ id: 'source', assetCode: 'G7T001-1', pieceMark: '02', enabled: true },
    { id: 'target', assetCode: 'G7T001', pieceMark: '01', enabled: true, photoId: 'a'.repeat(64) },
    { id: 'disabled', assetCode: 'OFF', pieceMark: '01', enabled: false }] }] };
const users = ['admin', 'rd', 'staff'].map(role => ({ id: `demo-${role}`, name: role, role,
  authMode: 'demo', enabled: true, inheritRole: true }));
const values = { platformUsers: JSON.stringify(users), routineEquipmentControl: JSON.stringify(routine),
  qualityMasterControl: JSON.stringify({ schemaVersion: 1, libraries: { fqc } }),
  iqcMasterControl: JSON.stringify(iqc), ipqcCMasterControl: JSON.stringify(ipqc) };
db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
  .run(JSON.stringify(values), now);
const core = load('lib/process-state.ts');
const api = load('app/api/quality-equipment-replacement/route.ts');
const ipqcApi = load('app/api/ipqc-c/route.ts');
const base = 'http://127.0.0.1:3902';
const state = () => {
  const row = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const data = JSON.parse(row.values);
  return { revision: row.revision, routine: JSON.parse(data.routineEquipmentControl),
    fqc: JSON.parse(data.qualityMasterControl).libraries.fqc,
    iqc: JSON.parse(data.iqcMasterControl), ipqc: data.ipqcCMasterControl ? JSON.parse(data.ipqcCMasterControl) : null };
};
async function call(cookie, detail, revision = state().revision) {
  const response = await api.POST(new Request(`${base}/api/quality-equipment-replacement`, {
    method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: revision, sourceEquipmentId: 'source',
      targetEquipmentId: 'target', ...detail }),
  }));
  return { status: response.status, body: await response.json() };
}
function change(fn) {
  const row = db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const data = JSON.parse(row.values); fn(data);
  db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(row.revision + 1, JSON.stringify(data));
}

(async () => {
  const admin = `process_demo=${await core.demoSession(new Request(base), 'demo-admin', true)}`;
  const reviewer = `process_demo=${await core.demoSession(new Request(base), 'demo-rd', true)}`;
  const staff = `process_demo=${await core.demoSession(new Request(base), 'demo-staff', true)}`;
  assert.equal((await call('', { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'] })).status, 403);
  assert.equal((await call(staff, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'] })).status, 403);
  assert.equal((await call(admin, { action: 'apply', moduleId: 'ipqc-ab', itemIds: ['x'] })).status, 422);
  assert.equal((await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'], targetEquipmentId: 'disabled' })).status, 422);
  const before = state().revision;
  let response = await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1','fqc-2'] });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual([...response.body.results].map(row => row.status), ['applied','applied']);
  assert.equal(state().fqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId, 'target');
  assert.equal(state().fqc.versions.find(row => row.status === 'draft').snapshot.items[0].reason, 'preserve me');
  assert.equal(state().fqc.versions.find(row => row.status === 'approved').snapshot.items[0].equipmentId, 'source');
  assert.equal((await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'] }, before)).status, 409);
  response = await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1','fqc-2'] });
  assert.equal(response.body.unchanged, true);
  response = await call(admin, { action: 'apply', moduleId: 'iqc', itemIds: ['iqc-1'] });
  assert.equal(response.body.results[0].status, 'conflict');
  assert.equal(state().routine.pendingReplacements, undefined);
  const pendingPreview=await (await api.GET(new Request(`${base}/api/quality-equipment-replacement?sourceId=source`,{headers:{Cookie:admin}}))).json();
  assert.equal(pendingPreview.modules.find(row=>row.moduleId==='iqc').items[0].selectable,false);
  response = await call(admin, { action: 'apply', moduleId: 'iqc', itemIds: ['iqc-1'] });
  assert.equal(response.body.unchanged, true);
  assert.equal(state().routine.pendingReplacements, undefined);
  change(data => { const control = JSON.parse(data.iqcMasterControl);
    control.versions.find(row => row.id === 'iqc-pending').status = 'draft';
    data.iqcMasterControl = JSON.stringify(control); });
  response = await call(reviewer, { action: 'reconcile', moduleId: 'iqc' });
  assert.ok([403,409].includes(response.status));
  assert.equal(state().iqc.versions.find(row=>row.id==='iqc-pending').snapshot.items[0].equipmentId,'source');
  response=await call(admin,{action:'apply',moduleId:'iqc',itemIds:['iqc-1']});
  assert.equal(response.body.results[0].status,'applied');
  assert.equal(state().iqc.versions.find(row => row.id === 'iqc-pending').snapshot.items[0].toolVi, 'Nguyên văn');
  assert.equal(state().iqc.versions.find(row => row.id === 'iqc-pending').snapshot.items[0].equipmentId, 'target');
  assert.equal(state().routine.pendingReplacements, undefined);
  response = await call(admin, { action: 'apply', moduleId: 'ipqc-c', itemIds: ['ipqc-1'] });
  assert.equal(response.body.results[0].status, 'applied');
  const draft = state().ipqc.versions.find(row => row.status === 'draft');
  assert.equal(draft.snapshot.items[0].equipmentId, 'target');
  assert.equal(draft.snapshot.items[0].equipmentGroupId, 'group-1');
  assert.equal(draft.snapshot.items[0].tool, 'Nguyên văn');
  const saveResponse = await ipqcApi.POST(new Request(`${base}/api/ipqc-c`, {
    method: 'POST', headers: { Cookie: admin, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', baseRevision: state().revision, versionId: draft.id,
      versionRevision: draft.revision, snapshot: draft.snapshot }),
  }));
  assert.equal(saveResponse.status, 200, JSON.stringify(await saveResponse.json()));
  assert.equal(state().ipqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId, 'target');
  change(data => { const control = JSON.parse(data.qualityMasterControl);
    control.libraries.fqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId = 'third';
    data.qualityMasterControl = JSON.stringify(control); });
  response = await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'] });
  assert.equal(response.body.results[0].status, 'conflict');
  assert.equal(state().fqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId, 'third');
  change(data=>{const q=JSON.parse(data.qualityMasterControl);q.libraries.fqc.versions.find(row=>row.status==='draft').snapshot.items[1].equipmentId='source';data.qualityMasterControl=JSON.stringify(q);});
  const atomicBefore=state();
  response=await call(admin,{action:'apply',moduleId:'fqc',itemIds:['fqc-2','fqc-1']});
  assert.deepEqual(response.body.results.map(row=>row.status),['conflict','conflict']);
  assert.deepEqual(state(),atomicBefore,'one conflict rolls back the whole draft including revisions/history');
  response = await call(admin, { action: 'apply', moduleId: 'fqc', itemIds: ['fqc-1'], overrideItemIds: ['fqc-1'] });
  assert.equal(response.body.results[0].status, 'applied');
  assert.equal(state().fqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId, 'target');
  change(data => {
    const iqcControl = JSON.parse(data.iqcMasterControl);
    iqcControl.versions = [version('iqc-old', 'superseded', [makeItem('iqc-1', 'source')]),
      version('iqc-reviewed', 'pending', [makeItem('iqc-1', 'source')])];
    iqcControl.activeVersionId = 'iqc-old';
    data.iqcMasterControl = JSON.stringify(iqcControl);
    const equipmentControl = JSON.parse(data.routineEquipmentControl);
    equipmentControl.pendingReplacements = [];
    data.routineEquipmentControl = JSON.stringify(equipmentControl);
  });
  response = await call(admin, { action: 'apply', moduleId: 'iqc', itemIds: ['iqc-1'] });
  assert.equal(response.body.results[0].status, 'conflict');
  change(data => {
    const iqcControl = JSON.parse(data.iqcMasterControl);
    iqcControl.versions.find(row => row.id === 'iqc-reviewed').status = 'approved';
    iqcControl.activeVersionId = 'iqc-reviewed';
    data.iqcMasterControl = JSON.stringify(iqcControl);
  });
  response = await call(reviewer, { action: 'reconcile', moduleId: 'iqc' });
  assert.ok([403,409].includes(response.status));
  response=await call(admin,{action:'apply',moduleId:'iqc',itemIds:['iqc-1']});
  assert.equal(response.body.results[0].status,'applied');
  assert.equal(state().iqc.versions.find(row => row.id === 'iqc-reviewed').snapshot.items[0].equipmentId, 'source');
  assert.equal(state().iqc.versions.find(row => row.status === 'draft').snapshot.items[0].equipmentId, 'target');
  change(data => { delete data.ipqcCMasterControl; });
  const partial = await api.GET(new Request(`${base}/api/quality-equipment-replacement?sourceId=source`,
    { headers: { Cookie: admin } }));
  assert.equal(partial.status, 200);
  const partialBody = await partial.json();
  assert.equal(partialBody.modules.find(row => row.moduleId === 'ipqc-c').connected, false);
  assert.equal(partialBody.modules.find(row => row.moduleId === 'fqc').connected, true);
  const disconnected = await api.POST(new Request(`${base}/api/quality-equipment-replacement`, {
    method: 'POST', headers: { Cookie: admin, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply', baseRevision: partialBody.revision, moduleId: 'ipqc-c',
      sourceEquipmentId: 'source', targetEquipmentId: 'target', itemIds: ['ipqc-1'] }),
  }));
  assert.equal(disconnected.status, 422);
  // AB is scoped by line/group; identical item IDs must never cross scopes.
  const abItem=(id,equipmentId)=>({...makeItem(id,equipmentId),code:'AB-L1-01',standard:'12 mm',
    inspectionMode:'equipment',productCodes:['SKU'],standardPhotos:[{id:'a'.repeat(64),note:'manual'}],
    methodPhotos:[],rules:[{id:'r1',cadence:'batch',kind:'custom',name:'manual',value:'two'}],
    methodText:'manual description',sourceImport:{key:'source-key',baseline:{standard:'12 mm'}},deleted:false});
  const ab={schemaVersion:1,source:null,reservedErrorCodes:['reserved'],reservedItemCodes:['reserved-item'],scopes:{
    'A:G1':{line:'A',group:'G1',activeVersionId:'ab-active-1',versions:[version('ab-active-1','approved',[abItem('same','source')]),version('ab-draft-1','draft',[abItem('same','manual-other')])]},
    'B:G2':{line:'B',group:'G2',activeVersionId:null,versions:[version('ab-draft-2','draft',[abItem('same','source')])]},
    'A:G3':{line:'A',group:'G3',activeVersionId:'ab-active-3',versions:[version('ab-active-3','approved',[abItem('same','source')]),version('ab-pending-3','pending-test',[abItem('same','source')])]},
    'A:G4':{line:'A',group:'G4',activeVersionId:'ab-active-4',versions:[version('ab-active-4','approved',[abItem('same','source')])]},
    'B:G5':{line:'B',group:'G5',activeVersionId:null,versions:[version('ab-pending-5','pending',[abItem('same','source')])]},
  }};
  change(data=>{data.ipqcABMasterControl=JSON.stringify(ab);});
  const readAB=()=>JSON.parse(JSON.parse(db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values).ipqcABMasterControl);
  const selection=key=>JSON.stringify([key,'same']);
  assert.equal((await call(admin,{action:'apply',moduleId:'ipqc-ab',itemIds:['same']})).status,422);
  const preview=await (await api.GET(new Request(`${base}/api/quality-equipment-replacement?sourceId=source`,{headers:{Cookie:admin}}))).json();
  const abPreview=preview.modules.find(row=>row.moduleId==='ipqc-ab');
  assert.equal(abPreview.connected,true);assert.equal(abPreview.items.length,5);
  assert.equal(new Set(abPreview.items.map(row=>row.id)).size,5);
  const otherBefore=state().fqc;
  response=await call(admin,{action:'apply',moduleId:'ipqc-ab',itemIds:Object.keys(ab.scopes).map(selection)});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.deepEqual(response.body.results.map(row=>row.status),['conflict','applied','conflict','applied','conflict']);
  let abAfter=readAB();
  assert.equal(abAfter.scopes['A:G1'].versions.find(row=>row.status==='draft').snapshot.items[0].equipmentId,'manual-other');
  assert.equal(abAfter.scopes['B:G2'].versions[0].snapshot.items[0].equipmentId,'target');
  assert.equal(abAfter.scopes['A:G4'].versions.length,2);
  for(const key of Object.keys(ab.scopes)){
    assert.equal(abAfter.scopes[key].activeVersionId,ab.scopes[key].activeVersionId);
    for(const v of ab.scopes[key].versions.filter(row=>row.status!=='draft'))assert.deepEqual(abAfter.scopes[key].versions.find(row=>row.id===v.id),v);
  }
  assert.deepEqual(state().fqc,otherBefore);
  assert.deepEqual(abAfter.scopes['B:G2'].versions[0].snapshot.items[0].standardPhotos,ab.scopes['B:G2'].versions[0].snapshot.items[0].standardPhotos);
  assert.deepEqual(abAfter.scopes['B:G2'].versions[0].snapshot.items[0].sourceImport,ab.scopes['B:G2'].versions[0].snapshot.items[0].sourceImport);
  assert.deepEqual(abAfter.reservedItemCodes,ab.reservedItemCodes);
  assert.equal(state().routine.pendingReplacements.filter(row=>row.moduleId==='ipqc-ab').length,0);
  response=await call(admin,{action:'apply',moduleId:'ipqc-ab',itemIds:Object.keys(ab.scopes).map(selection)});
  assert.equal(state().routine.pendingReplacements.filter(row=>row.moduleId==='ipqc-ab').length,0);
  assert.equal(readAB().scopes['A:G4'].versions.length,2);
  response=await call(admin,{action:'apply',moduleId:'ipqc-ab',itemIds:[selection('A:G1')],overrideItemIds:[selection('A:G1')]});
  assert.equal(response.body.results[0].status,'applied');
  change(data=>{const control=JSON.parse(data.ipqcABMasterControl);for(const key of ['A:G3','B:G5'])control.scopes[key].versions.at(-1).status='draft';data.ipqcABMasterControl=JSON.stringify(control);});
  response=await call(reviewer,{action:'reconcile',moduleId:'ipqc-ab'});
  assert.ok([403,409].includes(response.status));
  response=await call(admin,{action:'apply',moduleId:'ipqc-ab',itemIds:['A:G3','B:G5'].map(selection)});
  assert.deepEqual(response.body.results.map(row=>row.status),['applied','applied']);
  abAfter=readAB();assert.equal(abAfter.scopes['B:G5'].versions[0].snapshot.items[0].equipmentId,'target');
  assert.equal(abAfter.scopes['A:G3'].versions[0].snapshot.items[0].equipmentId,'source');
  console.log(JSON.stringify({ isolated: true, modules: 4, multiReference: true, abScopedIds:true,
    pendingTestLocked:true, abAssetsReservedCodesPreserved:true,
    noDeferredWrites: true, sameDraftAtomic:true, approvedPendingRequiresReselection: true, idempotent: true, cas: true, permissions: true,
    sourceAndOtherFieldsPreserved: true, manualConflict: true, disconnectedModuleIsolated: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
