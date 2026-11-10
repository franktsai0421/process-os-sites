import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  writes,
  stageCreate,
  expanded,
  beginSave,
  sameLocal,
  loseSave,
} from './ab-local-save-fixture.mjs';
const collection = (kind) => (kind === 'item' ? 'items' : 'errors');
const field = (kind) => (kind === 'item' ? 'standard' : 'name');
for (const kind of ['item', 'error'])
  void test(`${kind} Apply has zero writes; Save allocates exactly once and later edits use its real ID`, async (t) => {
    const s = await fixture(t),
      before = s.f.snapshot(),
      local = await stageCreate(s, kind);
    assert(local.id.startsWith('local-'));
    assert.equal(writes(s).length, 0);
    assert.deepEqual(s.f.snapshot(), before);
    await s.apiSave();
    assert.equal(writes(s).length, 1);
    assert.equal(writes(s)[0].status, 200);
    const rows = (await s.group()).control.workflow.working[collection(kind)],
      row = rows.at(-1);
    assert.equal(rows.length, 2);
    assert(!row.id.startsWith('local-'));
    assert.equal(
      row[field(kind)],
      kind === 'item' ? 'Sent created standard' : 'Sent created error',
    );
    if (kind === 'item') {
      await s.page.locator('[data-ab-edit-item]').last().click();
      await s.page.locator('#ab-standard').fill('Next explicit edit');
    } else {
      await s.page.locator('[data-ab-edit-error]').last().click();
      await s.page.locator('#ab-error-name').fill('Next explicit edit');
    }
    await s.page.locator('#ab-apply').click();
    assert.equal(writes(s).length, 1);
    await s.apiSave();
    assert.equal(writes(s).length, 2);
    const changes = writes(s)
      .at(-1)
      .body.command.input.scopes.flatMap((e) => e.changes);
    assert(changes.every((c) => !c.moduleAction));
    assert.equal(
      (await s.group()).control.workflow.working[collection(kind)].length,
      2,
    );
    s.cleanErrors();
  });
for (const kind of ['item', 'error'])
  void test(`${kind} create cannot rebase unrelated edits or allocate through a true peer conflict`, async (t) => {
    const s = await fixture(t);
    await s.edit('methodText', 'Own original');
    await stageCreate(s, kind);
    const local = await s.state();
    await s.peer('methodText', 'Peer');
    const before = s.f.snapshot();
    await s.apiSave();
    assert.equal(writes(s).length, 0, 'comparison stops before create allocation or Save');
    await s.page.locator('[data-ab-conflict]').waitFor();
    await s.page.locator('[data-ab-conflict-choice="cancel"]').click();
    await s.page.waitForFunction(() => !__ABTest.view().busy && !document.querySelector('[data-ab-conflict]'));
    assert.deepEqual(s.f.snapshot(), before);
    await sameLocal(s, local);
    assert.equal((await s.entry()).base.items[0].methodText, 'Initial method');
    assert.equal(
      (await s.group()).control.workflow.working[collection(kind)].length,
      1,
    );
    s.cleanErrors();
  });
for (const kind of ['item', 'error'])
  void test(`${kind} cancel before Save never creates; cancel after Save retains the exact committed row`, async (t) => {
    const s = await fixture(t);
    if (kind === 'item') await s.page.locator('#ipqcab-add-item').click();
    else await s.page.locator('#ipqcab-add-error').click();
    await s.page
      .locator(kind === 'item' ? '#ab-standard' : '#ab-error-name')
      .fill('Cancel unsent');
    await s.page.locator('[data-ab-close]').first().click();
    assert.equal(writes(s).length, 0);
    assert.equal(
      (await s.group()).control.workflow.working[collection(kind)].length,
      1,
    );
    await stageCreate(s, kind);
    await s.apiSave();
    const before = s.f.snapshot(),
      row = (await s.group()).control.workflow.working[collection(kind)].at(-1);
    await s.page
      .locator(kind === 'item' ? '[data-ab-edit-item]' : '[data-ab-edit-error]')
      .last()
      .click();
    await s.page
      .locator(kind === 'item' ? '#ab-standard' : '#ab-error-name')
      .fill('Cancel next');
    await s.page.locator('[data-ab-close]').first().click();
    assert.deepEqual(s.f.snapshot(), before);
    assert.deepEqual((await s.state()).working[collection(kind)].at(-1), row);
    assert.equal(writes(s).length, 1);
    s.cleanErrors();
  });
// A/B no longer adopts a create ACK's rows. Its receipt must be proven and a
// fresh read supplies the real model. Corrupt ACK rows may not poison that model.
const faults = [
  'missing',
  'duplicate',
  'deleted',
  'editable-peer',
  'wrong-parent',
  'wrong-operation',
  'missing-field',
  'snapshot-mismatch',
  'readonly-field',
  'unrelated-items-object',
  'unrelated-items-missing',
  'fabricated-code',
];
for (const kind of ['item', 'error'])
  for (const fault of faults)
    void test(`${kind} corrupt ${fault} ACK cannot change confirmed server model or trigger another create`, async (t) => {
      const s = await fixture(t);
      await stageCreate(s, kind);
      let seen = false;
      s.transform((r, bytes) => {
        if (r.body?.command?.action !== 'save') return;
        seen = true;
        const value = expanded(s, bytes),
          scope = value.control.workflow.working.scopes['A:G'],
          rows = scope[collection(kind)],
          row = rows.at(-1);
        if (fault === 'missing') rows.pop();
        if (fault === 'duplicate') rows.push(structuredClone(row));
        if (fault === 'deleted') row.deleted = true;
        if (fault === 'editable-peer') row[field(kind)] = 'Fabricated';
        if (fault === 'wrong-parent') {
          if (kind === 'item') row.errorId = 'wrong-parent';
          else row.stageCode = 'wrong-stage';
        }
        if (fault === 'wrong-operation') row.id = 'forged-id';
        if (fault === 'missing-field') delete row[field(kind)];
        if (fault === 'snapshot-mismatch') value.control.versions = [];
        if (fault === 'readonly-field') row.sourceRows = ['fabricated'];
        if (fault === 'unrelated-items-object') scope.items = {};
        if (fault === 'unrelated-items-missing') delete scope.items;
        if (fault === 'fabricated-code') row.code = 'bad-00';
        return { body: value };
      });
      await s.apiSave();
      assert(seen);
      assert.equal(writes(s).length, 1);
      const actual = (await s.group()).control.workflow.working;
      assert.equal(actual[collection(kind)].length, 2);
      assert.equal(
        actual[collection(kind)].at(-1)[field(kind)],
        kind === 'item' ? 'Sent created standard' : 'Sent created error',
      );
      const view = await s.state();
      if (view.localScopes.length === 0) assert.deepEqual(view.working, actual);
      else
        assert(
          await s.unknown(),
          'unsettled input requires retained original unknown',
        );
      assert(!JSON.stringify(view.working).includes('Fabricated'));
      assert(!JSON.stringify(view.working).includes('bad-00'));
      s.cleanErrors();
    });
for (const kind of ['item', 'error'])
  for (const fault of [
    'duplicate-temp',
    'deleted-temp',
    'local-server-id-collision',
  ])
    void test(`${kind} changed local ${fault} during ACK cannot be discarded or re-created`, async (t) => {
      const s = await fixture(t);
      await stageCreate(s, kind);
      const { held, saving } = await beginSave(s);
      await s.page.evaluate(
        ({ fault, kind }) => {
          const rows =
              __ABTest.entry().snapshot[kind === 'item' ? 'items' : 'errors'],
            row = rows.at(-1);
          if (fault === 'duplicate-temp') rows.push(structuredClone(row));
          if (fault === 'deleted-temp') row.deleted = true;
          if (fault === 'local-server-id-collision')
            rows.push({
              ...structuredClone(row),
              id: 'synthetic-server-collision',
            });
        },
        { fault, kind },
      );
      const before = await s.state();
      held.release();
      await saving;
      await sameLocal(s, before);
      await s.apiSave();
      assert.equal(writes(s).length, 1);
      assert.equal(
        (await s.group()).control.workflow.working[collection(kind)].length,
        2,
      );
    });
for (const kind of ['item', 'error'])
  void test(`${kind} unknown 404 then original receipt query never allocates again`, async (t) => {
    const s = await fixture(t);
    await stageCreate(s, kind);
    const command = await loseSave(s),
      before = await s.state(),
      keys = await s.keys();
    await s.query();
    assert(await s.unknown());
    assert.deepEqual(await s.keys(), keys);
    await sameLocal(s, before);
    await s.apiSave();
    assert.equal(writes(s).length, 1);
    s.receipts();
    await s.query();
    assert.equal(await s.unknown(), false);
    assert.equal(writes(s).length, 1);
    assert.equal(
      (await s.group()).control.workflow.working[collection(kind)].length,
      2,
    );
    assert.equal((await s.state()).localSent, null);
    assert(command.operationId);
    s.cleanErrors();
  });
void test('temporary error plus item reference is resolved in one Save with canonical positive allocated codes', async (t) => {
  const s = await fixture(t);
  await stageCreate(s, 'error');
  await stageCreate(s, 'item');
  assert.equal(writes(s).length, 0);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  const content = (await s.group()).control.workflow.working,
    err = content.errors.at(-1),
    item = content.items.at(-1);
  assert.equal(item.errorId, err.id);
  assert(item.code.startsWith(err.code + '-'));
  assert.match(item.code, /-(?:0[1-9]|[1-9]\d+)$/);
  assert.match(err.code, /-L[1-9]\d*$/);
  assert.equal(
    new Set(content.items.map((r) => r.code)).size,
    content.items.length,
  );
  s.cleanErrors();
});
for (const boundary of ['normal', 'actor', 'epoch', 'delivery', 'modal'])
  void test(`photo upload during Save (${boundary}) preserves original row/array aliases and never writes a replacement context`, async (t) => {
    const s = await fixture(t);
    const { pngFixture } = await import('./photo-fixtures.mjs');
    await s.page.locator('#ipqcab-add-item').click();
    await s.page.locator('#ab-standard').fill('Photo local');
    await s.page
      .locator('[data-ab-upload=standard]')
      .setInputFiles({
        name: 'synthetic.png',
        mimeType: 'image/png',
        buffer: Buffer.from(pngFixture({ width: 8, height: 8 })),
      });
    await s.page.locator('.ipqcab-photo-row').waitFor();
    await s.page.locator('#ab-apply').click();
    const before = await s.state();
    assert.equal(s.requests.filter((r) => r.method === 'PUT').length, 0);
    await s.page.evaluate(() => {
      const e = __ABTest.entry(),
        row = e.snapshot.items.at(-1);
      window.photoAliases = { entry: e, row, photos: row.standardPhotos };
    });
    const held = s.hold((r) => r.method === 'PUT'),
      saving = s.apiSave();
    await (await import('./ab-local-save-fixture.mjs')).deadline(held.started);
    if (boundary !== 'normal') await s.owner(boundary);
    held.release();
    await saving;
    if (boundary === 'normal') {
      assert.equal(writes(s).length, 1);
      const row = (await s.group()).control.workflow.working.items.at(-1);
      assert.match(row.standardPhotos[0].id, /^[a-f0-9]{64}$/);
      assert.equal((await s.state()).localSent, null);
    } else {
      assert.equal(writes(s).length, 0);
      assert.equal((await s.group()).control.workflow.working.items.length, 1);
      await sameLocal(s, before);
      assert.equal(
        await s.page.evaluate(
          () =>
            __ABTest.entry() === photoAliases.entry &&
            __ABTest.entry().snapshot.items.at(-1) === photoAliases.row &&
            photoAliases.row.standardPhotos === photoAliases.photos,
        ),
        true,
      );
    }
    s.cleanErrors();
  });
