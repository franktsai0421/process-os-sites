const authorityFixture=require('../scripts/routine-reset-authority-fixture.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const createStore = require('../scripts/fqc-apply-fixture.cjs');
const { fixture } = require('../scripts/test-routine-whole-page.cjs');

void test('whole-page RESET removes every review state, fences old page writes and restarts in the same store', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-21T10:00:00+07:00') });
  const store = await createStore();
  t.after(() => store.close());
  const page = fixture();
  const plan = crypto.randomUUID(), report = crypto.randomUUID();
  page.run(page.save([{ id: plan, type: 'plan', jobIds: ['job-a'] }]));
  for (const action of ['withdraw', 'return']) {
    page.submit();
    page.run(page.command(action, { caseId: page.root.page.workflow.pendingId, reason: 'Synthetic revision' }));
  }
  page.submit(); page.approve();
  page.run(page.save([{ id: report, type: 'report', documentId: plan }]));
  const row = page.root.page.workflow.working.documents.find(document => document.id === report);
  const line = row.content.lines[0];
  const results = structuredClone(line.results);
  const photo = 'a'.repeat(64);
  Object.assign(results[0], { samples: ['P1'], outcome: 'fail', notes: 'Synthetic result', photos: [photo] });
  const path = ['documents', { id: report }, 'content', 'lines', { id: line.id }, 'results'];
  page.run(page.save([], [{ patches: [{ op: 'set', path, value: results }], guards: [{ path, value: line.results }] }]));
  page.submit(); page.approve();
  page.run(page.save([{ id: crypto.randomUUID(), type: 'plan', jobIds: ['job-b'] }]));
  page.submit();
  page.root.startDate = '2026-11-09';
  assert.equal(page.root.cases.length, 1);
  assert.deepEqual(Array.from(page.root.page.workflow.cases, item => item.status), ['withdrawn', 'returned', 'approved', 'approved', 'pending']);
  const stale = page.command('save', { moduleAction: 'domain-v1', input: { action: 'generate' } });
  const photoKey = 'routine-fqc/photos/' + photo;
  store.objects.set(photoKey, Buffer.from('SYNTHETIC'));
  await store.mutate(values => {
    const [user] = JSON.parse(values.platformUsers);
    user.role = 'admin';
    Object.assign(user.accessOverrides, { 'routine.view': true, 'routine.edit': true, 'routine.settings': true });
    values.platformUsers = JSON.stringify([user, { ...user, id: 'frank' }]);
    values.routineFqcEnabled = '1';
    values.routineFqcControl = JSON.stringify(page.root);
    values.routineIqcControl = JSON.stringify({ unrelated: 'synthetic IQC record' });
    const master = JSON.parse(values.qualityMasterControl), version = master.libraries.fqc.versions[0];
    version.updatedAt = version.createdAt = '2026-01-01T00:00:00+07:00';
    version.snapshot.items = [{ ...version.snapshot.items[0], id: 'synthetic-weekly', productCodes: ['SYN-P'], rule: { cadence: 'time', timeFrequency: 'weekly' } }];
    values.qualityMasterControl = JSON.stringify(master);
  });
  const origin = authorityFixture.origin, login = new Request(origin);
  const cookie = store.core.sessionCookie(login, await store.core.demoSession(login, 'frank', false, 1)).split(';')[0];
  const reset = '/api/routine-reset?scope=fqc', endpoint = '/api/routine-fqc/page';
  async function call(url, body, status = 200) {
    const method = body ? 'POST' : 'GET';
    const handler = store.load('app' + url.split('?')[0] + '/route.ts');
    const res = await handler[method](new Request(origin + url, { method, headers: { ...authorityFixture.headers, cookie, origin, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) }));
    const result = await res.json(); assert.equal(res.status, status, JSON.stringify(result));
    return result;
  }
  const state = async () => (await store.core.readState()).values;
  const unrelated = values => Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'routineFqcControl'));
  const before = await state();
  assert.equal((await call(reset + '&capability=1')).available, false);
  authorityFixture.enable(store);
  const cap = await call(reset + '&capability=1');
  assert.equal(cap.available, true); assert.equal(cap.pendingCount, 1);
  const body = { scope: 'fqc', revision: cap.revision, pendingCount: 1, id: crypto.randomUUID(),
    irreversibleAck: true, confirm: 'RESET FQC', reason: 'Synthetic whole-page reset' };
  await call(reset, { ...body, pendingCount: 0 }, 409);
  assert.deepEqual(await state(), before);
  await call(reset, body);
  const after = await state();
  assert.deepEqual(unrelated(after), unrelated(before));
  assert.equal(store.objects.get(photoKey).toString(), 'SYNTHETIC');
  const persisted = JSON.parse(after.routineFqcControl);
  assert.equal(persisted.pageDraftLayout, 'page-v1');
  assert.notEqual(persisted.page.workflow.generation, stale.generation);
  for (const rows of [persisted.documents, persisted.jobs, persisted.cases, persisted.page.workflow.cases,
    persisted.page.workflow.saves, persisted.page.workflow.active.content.documents, persisted.page.workflow.working.documents,
    persisted.page.baseline.content.documents]) assert.deepEqual(rows, []);
  for (const key of [plan, report, ...page.root.page.workflow.cases.map(item => item.id)]) assert(!after.routineFqcControl.includes(key));
  assert.equal((await call(reset, body)).replayed, true);
  assert.equal((await call(reset + '&operationId=' + body.id)).id, body.id);
  assert.equal((await call(endpoint, { command: stale }, 409)).error, 'STALE_GENERATION');
  assert.deepEqual(await state(), after);
  const empty = await call(endpoint);
  assert.equal(empty.startDate, null); assert.equal(empty.canConfigureStartDate, true);
  let sequence = 0;
  async function act(input) {
    const flow = (await call(endpoint)).control.workflow;
    await call(endpoint, { command: { action: 'save', moduleAction: 'domain-v1', input, generation: flow.generation,
      expectedRevision: flow.revision, operationId: crypto.randomUUID(), clientId: 'synthetic-reset-client', sequence: ++sequence } });
  }
  await act({ action: 'configure', startDate: '2026-11-20' });
  await act({ action: 'generate' });
  await act({ action: 'generate' });
  const fresh = await call(endpoint);
  assert.equal(fresh.startDate, '2026-11-20'); assert.deepEqual(fresh.documents, []);
  assert.deepEqual(fresh.jobs.map(job => job.itemId), ['synthetic-weekly']);
  assert.deepEqual(unrelated(await state()), unrelated(before));
});
