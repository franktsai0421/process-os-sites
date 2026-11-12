import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  writes,
  beginSave,
  viewContent,
  sameLocal,
  deadline,
} from './ab-local-save-fixture.mjs';
// Migrated from immediate Apply flights: the immutable sent boundary is now Save.
void test('form Apply and both matrix cells stay local, then one Save stores exactly that batch', async (t) => {
  const s = await fixture(t),
    before = s.f.snapshot();
  await s.edit('standard', 'Local standard');
  await s.page.locator('[data-ab-matrix-item]').first().check();
  await s.page.locator('[data-ab-matrix-item]').last().check();
  assert.equal(writes(s).length, 0);
  assert.deepEqual(s.f.snapshot(), before);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  assert.equal(writes(s)[0].status, 200);
  const row = (await s.group()).control.workflow.working.items[0];
  assert.equal(row.standard, 'Local standard');
  assert.deepEqual(row.productCodes, ['A1', 'A2']);
  assert.equal((await s.state()).localScopes.length, 0);
  s.cleanErrors();
});
void test('Save disables editable controls and ignores a detached matrix input event while ACK waits', async (t) => {
  const s = await fixture(t);
  await s.page.locator('[data-ab-matrix-item]').first().check();
  await s.page.evaluate(() => {
    window.detachedMatrix = document.querySelectorAll(
      '[data-ab-matrix-item]',
    )[1];
  });
  const { held, saving } = await beginSave(s);
  try {
    assert.equal((await s.state()).busy, true);
    assert.equal(await s.page.locator('[data-ab-edit-item]').count(), 0);
    await s.page.evaluate(() => {
      detachedMatrix.checked = true;
      detachedMatrix.dispatchEvent(new Event('change'));
    });
    assert.deepEqual((await s.entry()).snapshot.items[0].productCodes, ['A1']);
    await s.apiSave();
    assert.equal(writes(s).length, 1);
  } finally {
    held.release();
    await saving;
  }
  assert.deepEqual(
    (await s.group()).control.workflow.working.items[0].productCodes,
    ['A1'],
  );
  s.cleanErrors();
});
void test('peer edit in an unsent field remains an original guard and conflicting Save cannot overwrite it', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Own standard');
  await s.edit('methodText', 'Own method');
  const original = await s.entry();
  await s.peer('methodText', 'Peer method');
  const server = s.f.snapshot();
  await s.apiSave();
  assert.equal(writes(s).length, 0, 'whole-set preflight compares before dispatch');
  assert.equal(await s.page.locator('[data-ab-conflict]').count(), 1);
  assert.deepEqual(s.f.snapshot(), server);
  assert.deepEqual((await s.entry()).base, original.base);
  assert.equal((await s.entry()).snapshot.items[0].methodText, 'Own method');
  assert.equal(
    (await s.group()).control.workflow.working.items[0].methodText,
    'Peer method',
  );
  const scopes = writes(s)[0].body.command.input.scopes;
  assert(
    scopes[0].changes.some((c) =>
      c.guards?.some(
        (g) => g.path[2] === 'methodText' && g.value === 'Initial method',
      ),
    ),
  );
  s.cleanErrors();
});
void test('read and polling preserve the local snapshot and original comparison base', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Keep private');
  const before = await s.state();
  await s.peer('methodText', 'Peer current');
  await s.page.clock.install();
  await s.page.clock.runFor(16000);
  await sameLocal(s, before);
  await s.page.evaluate(() => __ABTest.load(true));
  await sameLocal(s, before);
  assert.equal(writes(s).length, 0);
  assert.equal((await s.entry()).base.items[0].methodText, 'Initial method');
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
  'generation',
  'modal',
  'operation',
])
  void test(`late Save ${change} cannot clean local state or adopt stale completion`, async (t) => {
    const s = await fixture(t);
    await s.edit('standard', 'Captured input');
    const before = await s.state();
    const { held, saving } = await beginSave(s);
    await s.pin();
    await s.owner(change);
    if (change === 'lifecycle')
      await s.page.evaluate(() => {
        __ABTest.keepBusy();
      });
    held.release();
    await saving;
    const now = await s.state();
    assert.equal(writes(s).length, 1);
    if (change === 'lifecycle') {
      assert.equal(now.busy, true);
      return;
    }
    assert.equal(viewContent(now), viewContent(before));
    if (change === 'revision') assert.equal(now.revision, 99999);
    else assert.equal(now.revision, before.revision);
    if (change === 'modal') assert.equal(now.modal?.name, 'New private modal');
    else assert.equal(now.modal, before.modal);
    if (!['host', 'tab', 'disconnected', 'client'].includes(change))
      assert((await s.pinned()).entries);
    assert.equal(
      (await s.group()).control.workflow.working.items[0].standard,
      'Captured input',
    );
  });
for (const change of [
  'actor',
  'same-id actor',
  'epoch',
  'delivery',
  'requiresReload',
])
  void test(`changed ${change} before Save cannot send old private input under a new owner`, async (t) => {
    const s = await fixture(t);
    await s.edit('standard', 'Private prior owner');
    const before = await s.state(),
      stored = s.f.snapshot();
    await s.owner(change);
    assert.equal(await s.apiSave(), null);
    assert.equal(writes(s).length, 0);
    assert.equal(viewContent(await s.state()), viewContent(before));
    assert.deepEqual(s.f.snapshot(), stored);
  });
for (const fault of ['deleted', 'ambiguous', 'generation', 'pending'])
  void test(`Save refuses ${fault} server target and preserves original input and all server state`, async (t) => {
    const s = await fixture(t);
    await s.edit('methodText', 'Local retained');
    const before = await s.state();
    await s.mutate((root) => {
      const g = root.scopes['A:G'];
      if (fault === 'deleted') g.workflow.working.items[0].deleted = true;
      if (fault === 'ambiguous')
        g.workflow.working.items.push(
          structuredClone(g.workflow.working.items[0]),
        );
      if (fault === 'generation') g.workflow.generation = 'generation-peer';
      if (fault === 'pending')
        root.moduleDraft.workflow.pendingId = 'pending-peer';
    });
    const stored = s.f.snapshot();
    await s.apiSave();
    assert.equal(viewContent(await s.state()), viewContent(before));
    assert.deepEqual(s.f.snapshot(), stored);
    assert.equal(writes(s).filter((r) => r.status === 200).length, 0);
  });
void test('an edited snapshot during Save readback cannot be cleared or silently rebased', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Captured');
  const before = await s.entry(),
    { held, saving } = await beginSave(s);
  await s.page.evaluate(
    () => (__ABTest.entry().snapshot.items[0].methodText = 'Later local'),
  );
  held.release();
  await saving;
  assert.equal(
    (await s.group()).control.workflow.working.items[0].methodText,
    'Initial method',
  );
  assert.equal((await s.entry()).snapshot.items[0].methodText, 'Later local');
  assert.deepEqual((await s.entry()).base, before.base);
  assert.equal(writes(s).length, 1);
});
void test('a new modal opened during Save is never closed or captured by its old completion', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Captured');
  const { held, saving } = await beginSave(s);
  await s.page.evaluate(() =>
    __ABTest.set('modal', { type: 'new-error', name: 'Different local form' }),
  );
  held.release();
  await saving;
  assert.equal((await s.state()).modal?.name, 'Different local form');
  assert.equal(writes(s).length, 1);
});
void test('selection changes retain local A and B edits; one module Save covers both original scopes', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'A private');
  await s.page.locator('#ipqcab-line').selectOption('B');
  await s.page.locator('#ipqcab-begin').click();
  await s.page.locator('#ipqcab-add-error').click();
  await s.page.locator('#ab-error-name').fill('B private');
  await s.page.locator('#ab-apply').click();
  await s.page.locator('#ipqcab-line').selectOption('A');
  assert.equal((await s.entry()).snapshot.items[0].standard, 'A private');
  assert.equal(writes(s).length, 0);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  assert.equal(writes(s)[0].body.command.input.scopes.length, 2);
  assert.equal(
    (await s.group()).control.workflow.working.items[0].standard,
    'A private',
  );
  const b = await s.f.read('ipqc-ab', 'editor', '&scope=B%3AG');
  assert.equal(b.control.workflow.working.errors[0].name, 'B private');
  s.cleanErrors();
});
void test('a GET already in flight cannot replace local edits started while it waited', async (t) => {
  const s = await fixture(t),
    hold = s.hold((r) => r.url.startsWith('/api/ipqc-ab?'), 'response');
  const reading = s.page.evaluate(() => __ABTest.load());
  await deadline(hold.started);
  await s.edit('methodText', 'Input during read');
  const original = await s.entry();
  hold.release();
  await reading;
  assert.deepEqual(await s.entry(), original);
  assert.equal(writes(s).length, 0);
  s.cleanErrors();
});
void test('normal Save does not recapture stale DOM over untouched peer fields', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Own');
  await s.peer('methodText', 'Peer only');
  await s.apiSave();
  assert.equal(
    (await s.group()).control.workflow.working.items[0].methodText,
    'Peer only',
  );
  assert.equal((await s.state()).working.items[0].methodText, 'Peer only');
  assert.equal((await s.state()).localScopes.length, 0);
  s.cleanErrors();
});
for (const boundary of ['actor', 'same-id actor', 'epoch'])
  void test(`load after ${boundary} quarantines the original private DOM without joining another owner's model`, async (t) => {
    const s = await fixture(t);
    await s.edit('standard', 'SECRET synthetic private text');
    const before = await s.state();
    await s.owner(boundary);
    const reads = s.requests.length;
    assert.equal(await s.page.evaluate(() => __ABTest.load()), false);
    assert.equal(s.requests.length, reads);
    const now = await s.state();
    assert(now.accessBlocked);
    assert(now.privateQuarantine);
    assert.equal(viewContent(now), viewContent(before));
    assert(
      !(await s.page
        .locator('body')
        .innerText()
        .then((v) => v.includes('SECRET synthetic private text'))),
    );
    assert.equal(writes(s).length, 0);
  });
void test('confirmed Save with changed local content can be safely abandoned and returned to without a duplicate create', async (t) => {
  const s = await fixture(t);
  await s.edit('standard', 'Sent');
  const { held, saving } = await beginSave(s);
  await s.page.evaluate(
    () => (__ABTest.entry().snapshot.items[0].methodText = 'Late private'),
  );
  held.release();
  await saving;
  assert((await s.state()).localSent);
  await s.apiSave();
  assert.equal(writes(s).length, 1);
  await s.page.evaluate(async () => {
    const d = IPQCABUI.navigation.departure;
    await d.abandon();
    d.closeClean();
    IPQCABUI.navigation.reset();
  });
  await s.boot();
  assert.equal((await s.state()).localSent, null);
  await s.edit('methodText', 'Fresh after return');
  await s.apiSave();
  assert.equal(writes(s).length, 2);
  assert.equal(
    (await s.group()).control.workflow.working.items[0].methodText,
    'Fresh after return',
  );
  s.cleanErrors();
});
