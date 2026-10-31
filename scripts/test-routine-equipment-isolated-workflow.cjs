// Normal synthetic logins, actual route handlers and full equipment JS in synthetic DOM.
// All business state is in private SQLite/R2 memory. No browser, HTTP server, or live writes.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const { fixture: apiFixture } = require('./ipqc-c-operation-fixture.cjs');
const { fixture: uiFixture, copy, tick } = require('./test-routine-equipment-transfer-intent.cjs');
const results = [], trace = [], steps = [];
async function step(name, task) { const start = performance.now(); const result = await task(); steps.push({ name, isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); return result; }
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const png = require('../tests/photo-fixtures.mjs').pngFixture({ width: 8, height: 8 });
const moduleId = 'routine-equipment';
async function check(name, task) { const start = performance.now(); await task(); const result = { name, status: 'PASS', isolatedHandlerMs: +(performance.now() - start).toFixed(2) }; results.push(result); console.log(JSON.stringify(result)); }
async function upload(h, bytes, type) {
  const start = performance.now();
  const response = await h.load('app/api/routine-equipment/photo/route.ts').PUT(new Request('http://fixture/api/routine-equipment/photo', { method: 'PUT', headers: { ...h.sessions.editor, 'Content-Type': type }, body: bytes }));
  const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.id, createHash('sha256').update(bytes).digest('hex')); steps.push({ name: 'general photo PUT ' + type, isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); return body.id;
}
async function seed({ iqcReferenceView = true } = {}) {
  const empty = { AB: { products: [], lines: [], categoryGroups: [] }, C: { products: [], lines: [], categoryGroups: [] }, PROCESS: {} };
  const master = { active: copy(empty), versions: Object.entries(empty).map(([scope, snapshot]) => ({ id: 'empty-' + scope, scope, number: 1, status: 'approved', snapshot, revision: 1, creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [] })) };
  const h = await apiFixture({ masterDataControl: JSON.stringify(master), processMasterData: '{}' }, { iqcReferenceView }), oldPhoto = await upload(h, gif, 'image/gif');
  const originalCommand = h.command; h.command = (...args) => step('actual route ' + args[0] + ' ' + args[1] + ' ' + (args[2]?.patches?.map(patch => patch.path[0]).join(',') || ''), () => originalCommand(...args));
  await h.begin(moduleId);
  await h.command(moduleId, 'apply', { patches: [insert('categories', { id: 'old-cat', name: 'Existing synthetic category', photoId: oldPhoto }), insert('subcategories', { id: 'old-sub', categoryId: 'old-cat', name: 'Existing synthetic subcategory', photoId: oldPhoto }), insert('groups', { id: 'old-group', categoryId: 'old-cat', subcategoryId: 'old-sub', name: 'Existing synthetic group' })] });
  await h.command(moduleId, 'apply', { patches: ['source', 'target'].map((id, i) => insert('equipment', { id, assetCode: 'SYN-BASE-' + i, name: 'Existing synthetic ' + id, groupId: 'old-group', spec: '0–150 mm', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '', photoId: oldPhoto })) });
  const originalCase = await h.promote(moduleId), before = h.flow(await h.read(moduleId));
  return { h, oldPhoto, originalCase, originalActive: copy(before.active), originalSaved: copy(before.saved), originalObjects: new Map(h.objects) };
}
async function connect(h, { fault = '', language = 'zh' } = {}) {
  const f = await uiFixture({ openTransfer: false }), requests = [];
  let who = 'editor', injected = false;
  const setActor = async next => { who = next; f.c.ProcessSync.identity = await h.core.identity(new Request('http://fixture/api/routine-equipment', { headers: h.sessions[who] }), await h.core.readState()); f.rotateEpoch(); };
  await setActor('editor'); f.c.document.documentElement.lang = language;
  f.c.CustomEvent = class { constructor(type, detail) { this.type = type; this.detail = detail?.detail; } };
  f.c.VersionDraftUI.confirmSubmit = async () => 'Synthetic explicit submit'; f.c.VersionDraftUI.reasonFor = () => 'Synthetic explicit submit'; f.c.VersionDraftUI.confirmReview = async () => ({ reason: 'Synthetic independent review', selfReviewConfirmed: false });
  f.c.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://fixture'), method = options.method || 'GET', body = typeof options.body === 'string' ? JSON.parse(options.body) : null, start = performance.now();
    const isBegin = method === 'POST' && body?.action === 'begin', isRecovery = injected && method === 'GET' && parsed.pathname.endsWith('/workflow');
    if (isBegin && fault === 'before-commit' && !injected) { injected = true; requests.push({ path: parsed.pathname, method, action: 'begin', injected: 'before-handler', dispatchedToHandler: false }); throw Object.assign(Error('signal is aborted without reason'), { name: 'AbortError' }); }
    if (isRecovery && fault === 'recovery-503') { requests.push({ path: parsed.pathname, method, status: 503, injected: 'read-failure' }); return Response.json({ error: 'SYNTHETIC_READ_FAILURE' }, { status: 503 }); }
    const route = h.load('app' + parsed.pathname + '/route.ts'), response = await route[method](new Request(parsed, { method, headers: { ...h.sessions[who], ...options.headers }, ...(method === 'GET' ? {} : { body: options.body }) }));
    requests.push({ path: parsed.pathname, method, action: body?.command?.action || body?.action, actor: who, status: response.status, isolatedHandlerMs: +(performance.now() - start).toFixed(2) });
    if (isBegin && ['after-commit', 'recovery-503', 'actor-drift'].includes(fault) && !injected) { injected = true; assert.equal(response.status, 200); throw Object.assign(Error('signal is aborted without reason'), { name: 'AbortError' }); }
    if (isRecovery && fault === 'actor-drift') f.rotateActor();
    return response;
  };
  const mountedAt = performance.now(); f.c.RoutineEquipmentUI.navigation.reset(); await f.c.RoutineEquipmentUI.mount(f.host);
  requests.push({ operation: 'mount actual UI + workflow handler', isolatedHandlerMs: +(performance.now() - mountedAt).toFixed(2), qualification: 'synthetic DOM, not native page entry/load' });
  return { ...f, requests, setActor, posts: () => requests.filter(row => row.method === 'POST') };
}
module.exports = { connect };
if (require.main === module) (async () => {
  for (const fault of ['', 'after-commit', 'before-commit', 'recovery-503', 'actor-drift']) {
    const seeded = await seed(), { h } = seeded;
    try {
      await check('Begin actual UI/handler ' + (fault || 'normal ACK'), async () => {
        const f = await connect(h, { fault }), before = h.flow(await h.read(moduleId));
        const result = await f.test.writeShared('begin'), after = h.flow(await h.read(moduleId));
        assert.equal(f.posts().length, 1, 'at most the user-requested Begin, never an automatic second POST');
        assert.deepEqual(after.active, before.active); assert.deepEqual(after.saved, before.saved); assert.deepEqual(after.cases, before.cases);
        if (fault === '') { assert(result?.control); assert.equal(f.test.readUnavailable, false); assert(f.host.querySelector('#routine-add'), 'real product renderer exposes editable draft actions'); assert.equal(f.storage.size, 0); }
        else { assert.equal(result, null); assert.equal(f.storage.size, 1); assert.equal(f.test.model.versions.some(version => version.status === 'draft'), false); await f.test.writeShared('begin'); assert.equal(f.posts().length, 1); if(fault === 'after-commit'){await f.test.enterExistingDraft();assert.equal(f.test.readUnavailable,false);assert.equal(f.storage.size,0);assert.equal(f.posts().length,1);assert(f.host.querySelector('#routine-add'));} }
        if (fault === 'before-commit') assert.deepEqual(after, before, 'no handler ran; readback cannot invent a draft');
        else assert((await h.read(moduleId)).control.versions.some(version => version.status === 'draft'), 'actual handler created the one shared draft');
        trace.push(...f.requests);
      });
    } finally { h.close(); }
  }
  // Cross-quality destructive checks need an explicit IQC read grant, never a fabricated empty response.
  const deniedSeed = await seed({ iqcReferenceView: false });
  try {
    await check('missing IQC reference view denies deletion with zero POST and unchanged persisted draft', async () => {
      const { h } = deniedSeed, f = await connect(h); assert(await f.test.writeShared('begin'));
      await h.command(moduleId, 'apply', { patches: [insert('equipment', { id: 'denied-new-tool', assetCode: 'SYN-DENIED', name: 'Denied new tool', groupId: 'old-group', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '', photoId: deniedSeed.oldPhoto })] });
      await f.test.read(); f.test.render();
      const before = h.snapshot(), posts = f.posts().length, requestStart = f.requests.length;
      await f.test.deleteEquipment('denied-new-tool');
      assert(f.requests.slice(requestStart).some(row => row.path === '/api/iqc' && row.method === 'GET' && row.status === 403));
      assert.equal(f.posts().length, posts); assert.deepEqual(h.snapshot(), before);
      assert(f.test.working.equipment.some(row => row.id === 'denied-new-tool'));
      assert.match(f.test.message, /無法確認品質標準引用/); trace.push(...f.requests);
      const path = ['equipment', { id: 'source' }], source = h.flow(await h.read(moduleId)).working.equipment.find(row => row.id === 'source');
      const refusal = await h.command(moduleId, 'apply', { patches: [{ op: 'remove', path }], guards: [{ path, value: source }] }, 'editor', 422);
      assert.equal(refusal.error, 'EFFECTIVE_EQUIPMENT_DELETE_FORBIDDEN'); assert.deepEqual(h.snapshot(), before);
    });
  } finally { deniedSeed.h.close(); }
  const seeded = await seed(), { h, oldPhoto, originalCase, originalActive, originalObjects } = seeded;
  try {
    const f = await connect(h); assert(await f.test.writeShared('begin'));
    const newPhoto = await upload(h, png, 'image/png');
    await check('two categories/subcategories/tools, general photos, selected new-only deletions preserve formal source', async () => {
      await h.command(moduleId, 'apply', { patches: [1, 2].map(i => insert('categories', { id: 'test-cat-' + i, name: 'Test category ' + i, photoId: newPhoto })) });
      await h.command(moduleId, 'apply', { patches: [1, 2].map(i => insert('subcategories', { id: 'test-sub-' + i, categoryId: 'test-cat-1', name: 'Test subcategory ' + i, photoId: newPhoto })) });
      await h.command(moduleId, 'apply', { patches: [insert('groups', { id: 'test-group', categoryId: 'test-cat-1', subcategoryId: 'test-sub-1', name: 'Test ordinary group' })] });
      await h.command(moduleId, 'apply', { patches: [1, 2].map(i => insert('equipment', { id: 'test-tool-' + i, assetCode: 'SYN-NEW-' + i, name: 'Test tool ' + i, groupId: 'test-group', unit: '支', enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '', photoId: newPhoto })) });
      await f.test.read(); f.test.render();
      for (const [kind, id, name] of [['category', 'test-cat-1', 'Updated category'], ['subcategory', 'test-sub-1', 'Updated subcategory']]) await step(kind + ' name/photo edit through actual UI and photo PUT', async () => {
        f.host.querySelector('[data-node-select="category"][data-id="test-cat-1"]').click();
        f.test.openNodeDialog(kind, id);
        f.host.querySelector('#routine-dialog-name').value = name;
        const input = f.host.querySelector('#routine-dialog-photo-input'); assert.equal(input.getAttribute('accept'), 'image/*');
        const bytes = require('../tests/photo-fixtures.mjs').pngFixture({ width: kind === 'category' ? 9 : 10, height: 8 });
        input.dispatchEvent({ type: 'change', target: { files: [new File([bytes], 'ordinary.png', { type: 'image/png' })] } });
        await f.test.confirmNodeDialog();
        const collection = kind === 'category' ? 'categories' : 'subcategories', row = h.flow(await h.read(moduleId)).working[collection].find(value => value.id === id);
        assert.equal(row.name, name); assert.equal(row.photoId, createHash('sha256').update(bytes).digest('hex'));
      });
      await step('delete only new category/subcategory with no children through actual UI guards', async () => {
        await f.test.deleteNode('category', 'test-cat-2'); await f.test.deleteNode('subcategory', 'test-sub-2');
        const before = h.snapshot(); await f.test.deleteNode('category', 'test-cat-1'); assert.deepEqual(h.snapshot(), before); assert.match(f.test.message, /下階已有資料/);
        await f.test.deleteNode('subcategory', 'test-sub-1'); assert.deepEqual(h.snapshot(), before); assert.match(f.test.message, /下階已有資料/);
      });
      await step('new tool edit and apply through actual UI/shared transport', async () => {
        await f.test.openEditEquipment('test-tool-1');
        const input = f.host.querySelector('#routine-editor [data-field="name"]'); assert(input); input.value = 'Test tool 1 edited'; input.oninput();
        assert(await f.test.writeShared('apply'));
        assert.equal(h.flow(await h.read(moduleId)).working.equipment.find(row => row.id === 'test-tool-1').name, 'Test tool 1 edited');
        // An applied but still-open form must not bypass the Save guard.
        const appliedState=h.snapshot(),postCount=f.posts().length;
        assert.equal(await f.test.writeShared('save'),null);assert.equal(f.posts().length,postCount);assert.deepEqual(h.snapshot(),appliedState);
        const close=f.host.querySelector('#routine-form-cancel');assert(close,'actual bound equipment form Close button');close.click();
        assert.equal(f.host.querySelector('#routine-editor'),null,'editor really closed, not an optional-selector no-op');
        assert.equal(f.test.working.equipment.find(row=>row.id==='test-tool-1').name,'Test tool 1 edited');
        assert.deepEqual(h.snapshot(),appliedState,'Close after successful Apply preserves shared value and complete persistence');
      });
      await step('delete only the unapproved unreferenced second new tool through strict UI checks', async () => {
        const requestStart = f.requests.length;
        await f.test.deleteEquipment('test-tool-2'); assert(!h.flow(await h.read(moduleId)).working.equipment.some(row => row.id === 'test-tool-2'));
        assert(f.requests.slice(requestStart).some(row => row.path === '/api/iqc' && row.method === 'GET' && row.status === 200));
      });
      const current = h.flow(await h.read(moduleId)); assert.deepEqual(current.active, originalActive); assert.equal(current.working.equipment.filter(row => row.id.startsWith('test-tool')).length, 1); assert.equal(current.working.equipment.find(row => row.id === 'source').photoId, oldPhoto);
      assert.equal(current.working.categories.filter(row => row.id.startsWith('test-cat')).length, 1); assert.equal(current.working.subcategories.filter(row => row.id.startsWith('test-sub')).length, 1);
      await f.test.read(); f.test.render();
      for (const search of ['SYN-NEW-1', 'Test tool 1 edited']) await step('search by ' + search, async () => { const input = f.host.querySelector('#routine-search'); input.value = search; input.dispatchEvent({ type: 'input', target: input }); assert(f.host.querySelector('[data-equipment-view="test-tool-1"]')); });
      await step('view equipment details with actual bound UI action', async () => {
        const button = f.host.querySelector('[data-equipment-view="test-tool-1"]'); await button.onclick({ stopPropagation() {} });
        assert(f.host.querySelector('#routine-view-modal-backdrop')); assert.match(f.host.querySelector('#routine-view-modal-backdrop').textContent, /Test tool 1 edited/);
        f.host.querySelector('#routine-view-close').click(); assert.equal(f.host.querySelector('#routine-view-modal-backdrop'), null);
      });
      assert.equal(f.test.model.versions.find(version => version.status === 'draft').equipment.length, 3);
    });
    await check('actual full UI Save → Submit → pending lock → reviewer Return → edit/Save → revised Resubmit → reviewer Approve', async () => {
      assert(await f.test.writeShared('save')); const saved = h.flow(await h.read(moduleId)).saved; assert(saved);
      const submit = await f.test.writeShared('submit'); assert(submit?.receipt?.caseId); const firstCaseId = submit.receipt.caseId;
      assert.equal(h.flow(await h.read(moduleId)).pendingId, firstCaseId);
      const beforeRejected = h.snapshot(), path = ['equipment', { id: 'test-tool-1' }, 'name'];
      const locked = await h.command(moduleId, 'apply', { patches: [{ op: 'set', path, value: 'Forbidden pending edit' }], guards: [{ path, value: 'Test tool 1 edited' }] }, 'editor', 409);
      assert.equal(locked.error, 'PENDING_LOCKED'); assert.deepEqual(h.snapshot(), beforeRejected);
      const review = f.c.document.createElement('section'); review.id = 'review-equipment'; f.c.document.body.append(review);
      async function reviewAction(action, caseId) {
        await step('version confirmation platform ' + action + ' bound handler', async () => {
          review.innerHTML = f.c.RoutineEquipmentUI.reviewHTML();
          // Local synthetic DOM seam: its tag matcher only accepts letters, so h3 needs exact tag lookup.
          // No product HTML, permission, pending case, action, or response is substituted.
          const section = review.querySelector('.routine-review'), query = section.querySelector.bind(section);
          section.querySelector = selector => selector === 'h3' ? section.children.find(node => node.tagName === 'H3') || null : query(selector);
          await f.c.RoutineEquipmentUI.bindReview(review);
          const button = review.querySelector('[data-routine-review="' + action + '"][data-version="' + caseId + '"]'); assert(button, 'exact pending case in equipment review platform: ' + review.textContent + ' :: ' + JSON.stringify(f.test.model.versions.map(row=>({id:row.id,status:row.status})))); await button.onclick();
        });
      }
      await f.setActor('reviewer'); await reviewAction('reject', firstCaseId); assert.equal(h.flow(await h.read(moduleId)).pendingId, null);
      await f.setActor('editor'); await f.test.read();
      const returned = h.flow(await h.read(moduleId)); assert.deepEqual(returned.saved, saved); assert.deepEqual(returned.active, originalActive);
      const oldSaves = copy(JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow.saves);
      await step('returned draft is really edited, applied and saved before resubmit', async () => {
        f.test.working.equipment.find(row => row.id === 'test-tool-1').notes = 'Reworked after independent return';
        assert(await f.test.writeShared('apply')); assert(await f.test.writeShared('save'));
      });
      const revised = h.flow(await h.read(moduleId)).saved; assert.notEqual(revised.id, saved.id);
      const nextSaves = JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow.saves; assert.equal(nextSaves.length, oldSaves.length + 1); assert.deepEqual(nextSaves.slice(0, -1), oldSaves);
      assert.equal(revised.content.equipment.find(row => row.id === 'test-tool-1').notes, 'Reworked after independent return');
      const second = await f.test.writeShared('submit'); assert(second?.receipt?.caseId); assert.notEqual(second.receipt.caseId, firstCaseId);
      const pending = h.flow(await h.read(moduleId)); assert.equal(pending.saved.id, revised.id); assert.deepEqual(pending.saved.content, revised.content); assert.deepEqual(pending.active, originalActive);
      const storedCases = JSON.parse((await h.core.readState()).values.routineEquipmentControl).workflow.cases;
      assert.deepEqual(storedCases.find(row => row.id === firstCaseId).content, saved.content, 'full persisted returned case remains immutable; caseMetadata GET intentionally omits its content');
      await f.setActor('reviewer'); await reviewAction('approve', second.receipt.caseId); assert.equal(h.flow(await h.read(moduleId)).pendingId, null);
      const final = h.flow(await h.read(moduleId)); assert.equal(final.active.id, second.receipt.caseId); assert.equal(final.cases.find(row => row.id === firstCaseId).status, 'returned'); assert(final.cases.some(row => row.id === originalCase && row.status === 'approved'));
      assert.equal(final.active.content.equipment.find(row => row.id === 'test-tool-1').notes, 'Reworked after independent return'); assert.equal(final.active.content.equipment.some(row => row.id === 'test-tool-2'), false);
      for (const [key, bytes] of originalObjects) assert(h.objects.get(key)?.equals(bytes), 'preexisting immutable bodies/photos remain unchanged');
      const shell = fs.readFileSync('public/process/master-data.js', 'utf8'); assert.match(shell, /id="review-equipment">\$\{window\.RoutineEquipmentUI\?\.reviewHTML/); assert(!f.requests.some(row => row.path?.includes('process-authoring')));
      trace.push(...f.requests);
    });
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM state_backups').get().n, 0);
  } finally { h.close(); }
  await tick(); const summary = { status: 'PASS_ISOLATED_EQUIPMENT_UI_ACTUAL_HANDLERS', groups: results.length, results, steps, trace, limits: ['Normal fixture users and all approvals are isolated, not real accounts or live data', 'Actual UI/shared-client handlers and actual SQLite/R2 route handlers, but synthetic DOM/HTTP; no native render, browser, page-load, accessibility or physical-device acceptance', 'Creation uses actual route commands; category/subcategory photo edits and guarded deletion, tool edit/apply/delete, search and Begin/Save/Submit/Return/Resubmit/Approve use actual product UI functions in synthetic DOM', 'Cross-quality replacement is covered by separate dedicated suites, not certified by this equipment-only script', 'Root shell quality-version route verified in source plus actual equipment reviewHTML/bindReview Return/Approve actions in synthetic DOM; still no native browser platform acceptance'] }; console.log(JSON.stringify(summary));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
