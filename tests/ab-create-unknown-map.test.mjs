import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  writes,
  stageCreate,
  expanded,
  loseSave,
  sameLocal,
  deadline,
} from './ab-local-save-fixture.mjs';
async function unknown(s, { reload = false, kind = 'item' } = {}) {
  await stageCreate(s, kind);
  const command = await loseSave(s),
    keys = await s.keys();
  if (reload) {
    await s.boot();
    const state = await s.state();
    assert.equal(
      state.localSent,
      null,
      'reload cannot manufacture a runtime sent snapshot',
    );
    assert.equal(state.localScopes.length, 0);
    assert(await s.unknown());
    assert.match(
      await s.page.locator('[data-ab-local-unknown]').first().innerText(),
      /尚未確認|Chưa xác nhận/,
    );
    assert.deepEqual(await s.keys(), keys);
  }
  return { command, keys, before: await s.state(), stored: s.f.snapshot() };
}
for (const reload of [false, true])
  for (const status of [401, 403, 404, 422, 503])
    void test(`original receipt ${status} with runtime snapshot ${reload ? 'absent after reload' : 'present'} never reports success, clears or resends`, async (t) => {
      const s = await fixture(t),
        p = await unknown(s, { reload });
      s.intercept((r) =>
        r.url.includes('operationId=')
          ? {
              status,
              json: {
                error:
                  status === 404
                    ? 'OPERATION_NOT_FOUND'
                    : 'Synthetic unavailable',
              },
            }
          : null,
      );
      await s.query();
      assert(await s.unknown());
      assert.deepEqual(await s.keys(), p.keys);
      assert.equal((await s.state()).localSent === null, reload);
      await sameLocal(s, p.before);
      assert(!/原操作已核對|Đã kiểm tra/.test((await s.state()).message));
      await s.apiSave();
      assert.equal(writes(s).length, 1);
      assert.deepEqual(s.f.snapshot(), p.stored);
      s.cleanErrors();
    });
for (const reload of [false, true])
  for (const fault of [
    'operation',
    'generation',
    'revision',
    'savedId',
    'case-shape',
    'unchanged-shape',
    'missing-receipt',
  ])
    void test(`wrong receipt ${fault}, snapshot ${reload ? 'absent' : 'present'}, cannot settle the original operation`, async (t) => {
      const s = await fixture(t),
        p = await unknown(s, { reload });
      s.receipts();
      s.transform((r, bytes) => {
        if (!r.url.includes('operationId=')) return;
        const body = expanded(s, bytes),
          receipt = body.receipt;
        if (fault === 'operation') receipt.operationId = 'foreign-op';
        if (fault === 'generation') receipt.generation = 'foreign-gen';
        if (fault === 'revision') receipt.revision = -1;
        if (fault === 'savedId') receipt.savedId = null;
        if (fault === 'case-shape') receipt.caseId = { id: 'bad' };
        if (fault === 'unchanged-shape') receipt.unchanged = 'true';
        if (fault === 'missing-receipt') delete body.receipt;
        return { body };
      });
      await s.query();
      assert(await s.unknown());
      assert.deepEqual(await s.keys(), p.keys);
      await sameLocal(s, p.before);
      await s.apiSave();
      assert.equal(writes(s).length, 1);
      assert.deepEqual(s.f.snapshot(), p.stored);
      s.cleanErrors();
    });
for (const reload of [false, true])
  for (const fault of [
    'generation',
    'revision',
    'scope',
    'view',
    'missing-flow',
  ])
    void test(`authoritative readback ${fault}, snapshot ${reload ? 'absent' : 'present'}, cannot falsely confirm Save`, async (t) => {
      const s = await fixture(t),
        p = await unknown(s, { reload });
      s.receipts();
      s.transform((r, bytes) => {
        if (
          !r.url.includes('module=1') ||
          r.url.includes('operationId=') ||
          r.method !== 'GET'
        )
          return;
        const body = expanded(s, bytes);
        if (fault === 'generation')
          body.control.workflow.generation = 'foreign-gen';
        if (fault === 'revision') body.control.workflow.revision = 0;
        if (fault === 'scope') body.control.workflow.scope = 'other';
        if (fault === 'view') body.permissions.view = false;
        if (fault === 'missing-flow') delete body.control.workflow;
        return { body };
      });
      await s.query();
      assert(await s.unknown());
      assert.deepEqual(await s.keys(), p.keys);
      assert.equal((await s.state()).localSent === null, reload);
      assert(!/原操作已核對|Đã kiểm tra/.test((await s.state()).message));
      await s.apiSave();
      assert.equal(writes(s).length, 1);
      assert.deepEqual(s.f.snapshot(), p.stored);
    });
for (const kind of ['item', 'error'])
  for (const reload of [false, true])
    void test(`valid original ${kind} receipt, snapshot ${reload ? 'absent' : 'present'}, settles only after fresh readback without POST`, async (t) => {
      const s = await fixture(t),
        p = await unknown(s, { kind, reload });
      s.receipts();
      const before = s.requests.length;
      await s.query();
      assert.equal(await s.unknown(), false);
      assert.equal(writes(s).length, 1);
      assert.equal((await s.state()).localSent, null);
      assert.deepEqual(s.f.snapshot(), p.stored);
      const queries = s.requests.slice(before);
      assert(queries.every((r) => r.method === 'GET'));
      assert(queries[0].url.includes('operationId=' + p.command.operationId));
      assert(
        queries.some(
          (r) => r.url.includes('module=1') && !r.url.includes('operationId='),
        ),
      );
      assert.equal(
        (await s.group()).control.workflow.working[
          kind === 'item' ? 'items' : 'errors'
        ].length,
        2,
      );
      assert.match((await s.state()).message, /原操作已核對|Đã kiểm tra/);
      s.cleanErrors();
    });
for (const change of [
  'actor',
  'same-id actor',
  'epoch',
  'delivery',
  'host',
  'tab',
  'disconnected',
  'lifecycle',
  'revision',
  'client',
  'modal',
  'operation',
])
  void test(`late original query ${change} cannot erase local input or adopt stale model`, async (t) => {
    const s = await fixture(t),
      p = await unknown(s);
    s.receipts();
    const held = s.hold((r) => r.url.includes('operationId=')),
      query = s.query();
    await deadline(held.started);
    await s.owner(change);
    held.release();
    await query;
    const now = await s.state();
    assert.equal(writes(s).length, 1);
    if (change === 'lifecycle') return;
    await sameLocal(s, p.before);
    assert(
      now.localSent,
      'original runtime fence survives obsolete UI completion',
    );
    if (change === 'revision') assert.equal(now.revision, 99999);
    else assert.equal(now.revision, p.before.revision);
    assert.deepEqual(s.f.snapshot(), p.stored);
  });
void test('query cannot clear changed local data merely because its original Save receipt is confirmed', async (t) => {
  const s = await fixture(t);
  await unknown(s);
  await s.page.evaluate(
    () =>
      (__ABTest.entry().snapshot.items.at(-1).standard = 'Later private data'),
  );
  const before = await s.state();
  s.receipts();
  await s.query();
  await sameLocal(s, before);
  assert((await s.state()).localSent);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  assert.equal((await s.group()).control.workflow.working.items.length, 2);
});
void test('detached query A cannot acquire newer unknown B on the same client', async (t) => {
  const s = await fixture(t);
  await unknown(s);
  await s.page.evaluate(
    () => (window.oldQuery = document.querySelector('[data-ab-local-query]')),
  );
  s.receipts();
  await s.query();
  await stageCreate(s, 'error');
  s.lose('save');
  await s.apiSave();
  assert(await s.unknown());
  const keys = await s.keys(),
    before = s.requests.length;
  s.receipts();
  await s.page.evaluate(() => oldQuery.click());
  await s.page.waitForTimeout(30);
  assert.equal(s.requests.length, before);
  assert.deepEqual(await s.keys(), keys);
  await s.query();
  assert.equal(await s.unknown(), false);
  assert.equal(writes(s).length, 2);
  s.cleanErrors();
});
void test('detached query cannot inherit a newer delivery authorization for the same operation', async (t) => {
  const s = await fixture(t);
  await unknown(s);
  await s.page.evaluate(
    () => (window.oldQuery = document.querySelector('[data-ab-local-query]')),
  );
  await s.owner('delivery');
  const before = s.requests.length,
    keys = await s.keys();
  s.receipts();
  await s.page.evaluate(() => oldQuery.click());
  assert.equal(s.requests.length, before);
  assert.deepEqual(await s.keys(), keys);
  assert.equal(writes(s).length, 1);
});
for (const kind of ['begin-v1', 'save'])
  void test(`unknown ${kind} safe departure/reload retains original marker, and 404 never becomes success without sent snapshot`, async (t) => {
    const s = await fixture(t, { seed: false });
    await stageCreate(s, 'error');
    s.lose(kind);
    await s.apiSave();
    const keys = await s.keys(),
      count = writes(s).length;
    assert.equal(count, kind === 'begin-v1' ? 1 : 2);
    assert(await s.unknown());
    await s.page.evaluate(async () => {
      const d = IPQCABUI.navigation.departure;
      await d.abandon();
      d.closeClean();
      IPQCABUI.navigation.reset();
    });
    await s.boot();
    assert.equal((await s.state()).localSent, null);
    await s.query();
    assert(await s.unknown());
    assert.deepEqual(await s.keys(), keys);
    assert(!/原操作已核對|Đã kiểm tra/.test((await s.state()).message));
    assert.equal(writes(s).length, count);
    s.receipts();
    await s.query();
    assert.equal(await s.unknown(), false);
    assert.equal(writes(s).length, count);
    assert.equal(
      (await s.f.read('ipqc-ab', 'editor', '&module=1')).control.workflow
        .saved !== null,
      kind === 'save',
    );
    s.cleanErrors();
  });
for (const reload of [false, true])
  void test(`original Save recovery after peer Save (${reload ? 'no runtime snapshot' : 'runtime snapshot'}) never replays or rolls back the newer shared version`, async (t) => {
    const s = await fixture(t),
      p = await unknown(s, { reload });
    await s.peer('methodText', 'Peer after original');
    await s.f.command('ipqc-ab', 'save', {}, 'editor', 200, '&module=1');
    const latest = await s.f.read('ipqc-ab', 'editor', '&module=1'),
      stored = s.f.snapshot();
    s.receipts();
    await s.query();
    assert.equal(await s.unknown(), false);
    assert.equal(writes(s).length, 1);
    assert.deepEqual(s.f.snapshot(), stored);
    const displayed = await s.state();
    assert.equal(displayed.working.items[0].methodText, 'Peer after original');
    assert.equal(
      displayed.control.moduleDraft.workflow.saved.id,
      latest.control.workflow.saved.id,
    );
    const lookup = s.requests.findLast((r) =>
      r.url.includes('operationId=' + p.command.operationId),
    );
    assert.equal(lookup.method, 'GET');
    assert.equal((await s.group()).control.workflow.working.items.length, 2);
    s.cleanErrors();
  });
