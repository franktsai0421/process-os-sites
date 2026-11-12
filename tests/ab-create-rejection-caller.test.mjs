import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  writes,
  stageCreate,
  expanded,
  sameLocal,
  isSave,
  beginSave,
} from './ab-local-save-fixture.mjs';
async function invalid(s, kind = 'item') {
  await stageCreate(s, kind);
  await s.page.evaluate((kind) => {
    const e = __ABTest.entry();
    if (kind === 'item') {
      const row = e.snapshot.items.at(-1);
      row.inspectionMode = 'equipment';
      row.equipmentId = '';
    } else { e.snapshot.items[0].inspectionMode = 'equipment'; e.snapshot.items[0].equipmentId = ''; } // Invalid related item proves the entire error-create batch is rejected atomically.
  }, kind);
}
for (const kind of ['item', 'error'])
  void test(`trusted ${kind} pre-CAS Save rejection preserves base and local input; only explicit corrected Save creates`, async (t) => {
    const s = await fixture(t);
    await invalid(s, kind);
    const original = await s.state(),
      stored = s.f.snapshot();
    await s.apiSave();
    assert.equal(writes(s)[0].status, 422);
    assert.deepEqual(s.f.snapshot(), stored);
    await sameLocal(s, original);
    assert.equal(await s.unknown(), false);
    assert.equal((await s.state()).localSent, null);
    await s.page.evaluate((kind) => {
      const e = __ABTest.entry();
      if (kind === 'item') {
        e.snapshot.items.at(-1).inspectionMode = 'visual';
        e.snapshot.items.at(-1).standard = 'Corrected';
      } else { e.snapshot.items[0].inspectionMode = 'visual'; e.snapshot.errors.at(-1).name = 'Corrected error'; }
    }, kind);
    assert.equal(writes(s).length, 1);
    await s.apiSave();
    assert.equal(writes(s).length, 2);
    assert.equal(writes(s)[1].status, 200);
    assert.notEqual(
      writes(s)[0].body.command.operationId,
      writes(s)[1].body.command.operationId,
    );
    assert.equal(
      (await s.group()).control.workflow.working[
        kind === 'item' ? 'items' : 'errors'
      ].length,
      2,
    );
    s.cleanErrors();
  });
for (const kind of ['item', 'error'])
  for (const shape of [
    'missing',
    'invalid',
    'object',
    'wrong-scope',
    'wrong-path',
  ])
    void test(`${kind} rejection with untrusted ${shape} proof cannot clear original unknown`, async (t) => {
      const s = await fixture(t);
      await invalid(s, kind);
      s.transform((r, bytes) => {
        if (!isSave(r)) return;
        const body = expanded(s, bytes);
        if (shape === 'missing') delete body.requestId;
        if (shape === 'invalid') body.requestId = 'bad-id';
        if (shape === 'object') body.requestId = { uuid: body.requestId };
        if (shape === 'wrong-scope' || shape === 'wrong-path') {
          body.error = 'DEPENDENCY_CHANGED_RECONFIRM';
          body.details = {
            scope: shape === 'wrong-scope' ? 'B:Other' : 'A:G',
            path: ['items', { id: 'foreign' }, 'methodText'],
          };
          return { status: 409, body };
        }
        return { body };
      });
      const before = await s.state(),
        stored = s.f.snapshot();
      await s.apiSave();
      assert(await s.unknown());
      const keys = await s.keys();
      await s.apiSave();
      assert.equal(writes(s).length, 1);
      assert.deepEqual(await s.keys(), keys);
      await sameLocal(s, before);
      assert.deepEqual(s.f.snapshot(), stored);
    });
for (const status of [403, 409, 422, 503, 'throw-status'])
  void test(`committed Save followed by untrusted ${status} cannot unlock or create a duplicate`, async (t) => {
    const s = await fixture(t);
    await stageCreate(s);
    s.transform((r) => {
      if (!isSave(r)) return;
      if (status === 'throw-status')
        return {
          status: 500,
          body: {
            error: 'Fetch failed',
            notSent: true,
            confirmedRejection: true,
          },
        };
      return {
        status,
        body: {
          error: 'STAGE_INVALID',
          notSent: true,
          confirmedRejection: true,
        },
      };
    });
    const before = await s.state();
    await s.apiSave();
    assert.equal((await s.group()).control.workflow.working.items.length, 2);
    assert(await s.unknown());
    const keys = await s.keys();
    await s.apiSave();
    assert.equal(writes(s).length, 1);
    await sameLocal(s, before);
    assert.deepEqual(await s.keys(), keys);
    s.cleanErrors();
  });
void test('cleanup quota failure retains the exact original marker and foreign marker, never falls through to another Save', async (t) => {
  const s = await fixture(t);
  await invalid(s);
  await s.page.evaluate(() => {
    sessionStorage.setItem('foreign-operation', 'preserve');
    const remove = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      'removeItem',
    ).value;
    Storage.prototype.removeItem = function (k) {
      if (k.startsWith('shared-draft-receipt-only-v1:'))
        throw Error('Synthetic cleanup quota');
      return remove.call(this, k);
    };
  });
  const before = await s.state(),
    stored = s.f.snapshot();
  await s.apiSave();
  assert(await s.unknown());
  const keys = await s.keys();
  assert.equal(keys['foreign-operation'], 'preserve');
  await sameLocal(s, before);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  assert.deepEqual(await s.keys(), keys);
  assert.deepEqual(s.f.snapshot(), stored);
  s.cleanErrors();
});
for (const change of ['actor', 'epoch', 'delivery', 'modal', 'operation'])
  void test(`late trusted rejection after ${change} cannot discard local command or another attempt`, async (t) => {
    const s = await fixture(t);
    await invalid(s);
    const before = await s.state(),
      { held, saving } = await beginSave(s);
    await s.owner(change);
    held.release();
    await saving;
    await sameLocal(s, before);
    assert.equal(writes(s).length, 1);
    assert((await s.state()).localSent);
    if (change === 'modal')
      assert.equal((await s.state()).modal?.name, 'New private modal');
  });
void test('clearing one rejected local Save cannot erase another transport failure or a foreign recovery marker', async (t) => {
  const s = await fixture(t);
  await s.page.evaluate(async () => {
    sessionStorage.setItem('foreign-operation', 'untouched');
    const c = createSharedDraftClient({
        endpoint: '/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1',
        actorId: ProcessSync.identity.id,
        headers: () => ({ 'Content-Type': 'application/json', 'X-Process-Expected-Actor':ProcessSync.identity.id }),
      }),
      g = await c.read();
    try {
      await c.sendPrepared(
        c.prepare(g.control.workflow.generation, 'apply', {
          patches: [
            {
              op: 'set',
              path: [
                'items',
                { id: g.control.workflow.working.items[0].id },
                'sourceTool',
              ],
              value: 'forbidden',
            },
          ],
          guards: [],
        }),
      );
    } catch {}
    window.otherFailure = c;
  });
  await invalid(s);
  await s.apiSave();
  assert.equal(
    await s.page.evaluate(() => otherFailure.hasSyncFailures()),
    true,
  );
  assert.equal((await s.keys())['foreign-operation'], 'untouched');
  assert.equal((await s.group()).control.workflow.working.items.length, 1);
  assert.equal(await s.unknown(), false);
  assert.equal(
    await s.page.evaluate(async () => {
      try {
        await otherFailure.flush();
        return false;
      } catch (e) {
        return e.message === 'UNSUPPORTED_ITEM_PATCH';
      }
    }),
    true,
  );
  s.cleanErrors();
});
for (const kind of ['item', 'error'])
  void test(`explicit ${kind} rejection cleanup retry uses original private proof, performs no POST and preserves correction for later Save`, async (t) => {
    const s = await fixture(t);
    await invalid(s, kind);
    await s.page.evaluate(() => {
      sessionStorage.setItem('foreign-operation', 'preserve');
      window.originalRemove = Object.getOwnPropertyDescriptor(
        Storage.prototype,
        'removeItem',
      ).value;
      Storage.prototype.removeItem = function (k) {
        if (k.startsWith('shared-draft-receipt-only-v1:')) throw Error('quota');
        return originalRemove.call(this, k);
      };
    });
    const before = await s.state();
    await s.apiSave();
    assert(await s.unknown());
    assert.equal(writes(s).length, 1);
    await s.page.evaluate(
      () => (Storage.prototype.removeItem = originalRemove),
    );
    await s.query();
    assert.equal(await s.unknown(), false);
    assert.equal(writes(s).length, 1);
    assert.equal((await s.state()).localSent, null);
    await sameLocal(s, before);
    assert.equal((await s.keys())['foreign-operation'], 'preserve');
    assert.match((await s.state()).message, /未寫入|chưa ghi/);
    await s.page.evaluate((kind) => {
      const e = __ABTest.entry();
      if (kind === 'item') e.snapshot.items.at(-1).inspectionMode = 'visual';
      else {e.snapshot.items[0].inspectionMode='visual';e.snapshot.errors.at(-1).stageCode = 'A-CUT';}
    }, kind);
    await s.apiSave();
    assert.equal(writes(s).length, 2);
    assert.equal(writes(s).at(-1).status, 200);
    assert.equal(
      (await s.group()).control.workflow.working[
        kind === 'item' ? 'items' : 'errors'
      ].length,
      2,
    );
    s.cleanErrors();
  });
for (const boundary of ['actor', 'epoch', 'delivery', 'operation'])
  void test(`rejection cleanup after ${boundary} cannot borrow stale original private proof`, async (t) => {
    const s = await fixture(t);
    await invalid(s);
    await s.page.evaluate(() => {
      window.originalRemove = Object.getOwnPropertyDescriptor(
        Storage.prototype,
        'removeItem',
      ).value;
      Storage.prototype.removeItem = function (k) {
        if (k.startsWith('shared-draft-receipt-only-v1:')) throw Error('quota');
        return originalRemove.call(this, k);
      };
    });
    await s.apiSave();
    const keys = await s.keys();
    await s.owner(boundary);
    await s.page.evaluate(
      () => (Storage.prototype.removeItem = originalRemove),
    );
    if(boundary==='operation') await s.query();
    else await assert.rejects(s.query(),/APPROVED_HISTORY_READ_ONLY/);
    assert.deepEqual(await s.keys(), keys);
    assert.equal(writes(s).length, 1);
    assert((await s.state()).localSent);
    assert.equal((await s.group()).control.workflow.working.items.length, 1);
  });
