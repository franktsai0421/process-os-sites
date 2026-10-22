/* Isolated port-3002 fixture: effective equipment, selection, versioned references. */
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3002';
(async () => {
  const login = await fetch(`${base}/api/platform-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoRole: 'admin' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const get = async path => {
    const response = await fetch(`${base}${path}`, { headers });
    if (response.status !== 200) throw Error(`${path}: HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  };
  const post = async (path, body, expected = 200) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, expected, `${path} ${body.action}: ${JSON.stringify(result)}`);
    return result;
  };
  const routine = async (action, details = {}, expected = 200) => {
    const state = await get('/api/routine-equipment');
    const version = state.control.versions.find(v => ['draft', 'pending'].includes(v.status));
    return post('/api/routine-equipment', { action, baseRevision: state.revision,
      versionId: version?.id, versionRevision: version?.revision, ...details }, expected);
  };
  let routineState = await get('/api/routine-equipment');
  if (!routineState.control.activeVersionId) {
    if (!routineState.control.versions.some(v => v.status === 'draft')) await routine('begin');
    routineState = await get('/api/routine-equipment');
    let version = routineState.control.versions.find(v => v.status === 'draft');
    if (!version.groups.some(g => g.id === 'ab-test-group')) {
      await routine('save', { snapshot: { equipment: version.equipment, issues: version.issues || [],
        categories: [{ id: 'ab-test-category', code: 'T99', name: 'Test only' }],
        subcategories: [{ id: 'ab-test-subcategory', categoryId: 'ab-test-category', name: 'Test only' }],
        groups: [{ id: 'ab-test-group', categoryId: 'ab-test-category', subcategoryId: 'ab-test-subcategory', name: 'Test only' }] } });
    }
    routineState = await get('/api/routine-equipment');
    version = routineState.control.versions.find(v => v.status === 'draft');
    if (!version.equipment.some(e => e.assetCode === 'ABTEST001')) await routine('create', { assetCode: 'ABTEST001', groupId: 'ab-test-group', unit: '個' });
    routineState = await get('/api/routine-equipment');
    version = routineState.control.versions.find(v => v.status === 'draft');
    const snapshot = { equipment: structuredClone(version.equipment), groups: version.groups,
      categories: version.categories, subcategories: version.subcategories, issues: version.issues || [] };
    const equipment = snapshot.equipment.find(e => e.assetCode === 'ABTEST001');
    equipment.name = 'Dưỡng kiểm IPQC-AB test'; equipment.confirmed = true;
    await routine('submit', { snapshot });
    await routine('approve');
  }
  routineState = await get('/api/routine-equipment');
  const equipment = routineState.control.versions.find(v => v.id === routineState.control.activeVersionId).equipment.find(e => e.assetCode === 'ABTEST001');
  assert.ok(equipment?.id);
  let state = await get('/api/ipqc-ab');
  assert.ok(state.equipment.some(e => e.id === equipment.id), 'effective available equipment in picker');
  const scopeKey = 'A:XETUOICAY';
  let scope = state.control.scopes[scopeKey];
  assert.ok(scope?.activeVersionId, 'existing isolated approved fixture');
  const active = scope.versions.find(v => v.id === scope.activeVersionId);
  if (!scope.versions.some(v => v.status === 'draft')) {
    await post('/api/ipqc-ab', { action: 'begin', baseRevision: state.revision, line: 'A', group: 'XETUOICAY' });
    state = await get('/api/ipqc-ab'); scope = state.control.scopes[scopeKey];
  }
  let draft = scope.versions.find(v => v.status === 'draft');
  const snapshot = structuredClone(draft.snapshot);
  snapshot.items[0].inspectionMode = 'equipment'; snapshot.items[0].equipmentId = equipment.id;
  await post('/api/ipqc-ab', { action: 'save', baseRevision: state.revision, line: 'A', group: 'XETUOICAY',
    versionId: draft.id, versionRevision: draft.revision, snapshot });
  state = await get('/api/ipqc-ab'); scope = state.control.scopes[scopeKey]; draft = scope.versions.find(v => v.status === 'draft');
  assert.equal(draft.snapshot.items[0].equipmentId, equipment.id);
  assert.equal(draft.snapshot.items[0].equipmentSnapshot.assetCode, 'ABTEST001');
  assert.equal(active.snapshot.items[0].equipmentId, '', 'effective reference unchanged before approval');
  await post('/api/ipqc-ab', { action: 'submit', baseRevision: state.revision, line: 'A', group: 'XETUOICAY',
    versionId: draft.id, versionRevision: draft.revision, snapshot: draft.snapshot, reason: 'Isolated equipment link test' });
  state = await get('/api/ipqc-ab'); scope = state.control.scopes[scopeKey]; draft = scope.versions.find(v => v.status === 'pending');
  assert.equal(scope.activeVersionId, active.id);
  await post('/api/ipqc-ab', { action: 'approve', baseRevision: state.revision, line: 'A', group: 'XETUOICAY',
    versionId: draft.id, versionRevision: draft.revision });
  state = await get('/api/ipqc-ab'); scope = state.control.scopes[scopeKey];
  assert.equal(scope.activeVersionId, draft.id);
  assert.equal(scope.versions.find(v => v.id === active.id).status, 'superseded');
  assert.equal(scope.versions.find(v => v.id === draft.id).snapshot.items[0].equipmentId, equipment.id);
  console.log('PASS isolated equipment picker, saved snapshot, draft/pending/effective references, old version preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
