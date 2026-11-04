// Actual FQC UI/client/recovery and signed TypeScript route over synthetic SQLite/R2.
// DOM and timers are explicit test ports. No live Site, real account or business data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const routeFixture = require('../scripts/fqc-apply-fixture.cjs');
const {
  fixture: moduleFixture,
} = require('../scripts/test-fqc-feedback-races.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
const posts = (f) =>
  f.requests.filter((r) => r.method === 'POST' && JSON.parse(r.body).command);
const command = (row) => JSON.parse(row.body).command;
const receipts = (ui) =>
  ui.requests.filter((row) => row.url.includes('operationId='));
const tick = () => new Promise(setImmediate);
async function idle(ui) {
  for (let i = 0; i < 1000 && ui.c.__fqcTest.ui.saving; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ui.c.__fqcTest.ui.saving, false);
}
async function mount(f, { actor = 'editor', intercept } = {}) {
  const initial = await f.call('/api/fqc/workflow?caseMetadata=1', {}, actor);
  assert.equal(initial.status, 200);
  return moduleFixture({
    initialControl: (await initial.json()).control,
    identityUser: { id: actor, name: 'Synthetic ' + actor, role: 'staff' },
    send: (url, o) =>
      intercept
        ? intercept(url, o, () => f.call(url, o, actor))
        : f.call(url, o, actor),
  });
}
async function setup(options) {
  const f = await routeFixture();
  await f.mutate((values) => {
    const q = JSON.parse(values.qualityMasterControl),
      content = q.libraries.fqc.versions[0].snapshot;
    content.items[0].rule = {
      cadence: 'batch',
      batchKind: 'fixed_count',
      fixedCount: 1,
    };
    content.items.push({
      ...plain(content.items[0]),
      id: 'item2',
      checkNo: 'SYN-FQC-L1-02',
      name: 'Synthetic second item',
    });
    values.qualityMasterControl = JSON.stringify(q);
  });
  const ui = await mount(f, options);
  await ui.c.__fqcTest.sharedAction('begin');
  return { f, ui };
}
async function choose(ui, id = 'item') {
  await ui.c.__fqcTest.recoverySession().ready;
  await tick();
  const cell = ui.main.querySelector(`[data-matrix-item="${id}"]`);
  assert(cell && !cell.disabled);
  await cell.click();
}
async function save(ui) {
  await ui.main.querySelector('#fqc-save').click();
  await tick();
  await idle(ui);
}
async function query(ui) {
  const button = ui.main.querySelector('#fqc-check-result');
  assert(button && !button.disabled);
  await button.click();
  await tick();
  await idle(ui);
}
async function abandon(ui) {
  const lease = await ui.c.FQCMasterUI.navigation.departure.abandon();
  lease.release();
}

void test('choices remain private until one Save; fresh peer sees saved shared content', async () => {
  const { f, ui } = await setup();
  try {
    const before = posts(f).length;
    await choose(ui);
    assert.equal(posts(f).length, before);
    const peer = await mount(f, { actor: 'other' });
    assert.deepEqual(
      plain(peer.library.workflow.working.items[0].productCodes),
      [],
    );
    await save(ui);
    assert.equal(posts(f).length, before + 1);
    assert.equal(receipts(ui).length, 0);
    assert.equal(ui.c.__fqcTest.matrixDirty(), false);
    const flow = (await f.state()).workflow;
    assert.deepEqual(flow.saved.content, flow.working);
    const fresh = await mount(f, { actor: 'other' });
    assert.deepEqual(
      plain(fresh.library.workflow.saved.content.items[0].productCodes),
      ['SYN-P'],
    );
    assert.deepEqual(
      posts(f)
        .slice(before)
        .map((r) => command(r).action),
      ['save'],
    );
  } finally {
    f.close();
  }
});
void test('second local edit can Save directly without separate Apply', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    await save(ui);
    await choose(ui, 'item2');
    const before = posts(f).length;
    await save(ui);
    assert.equal(posts(f).length, before + 1);
    assert.deepEqual(
      (await f.state()).workflow.saved.content.items.map((r) => r.productCodes),
      [['SYN-P'], ['SYN-P']],
    );
  } finally {
    f.close();
  }
});
void test('rapid repeated Save emits one command', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    const before = posts(f).length,
      button = ui.main.querySelector('#fqc-save');
    button.click();
    button.click();
    button.click();
    await idle(ui);
    assert.deepEqual(
      posts(f)
        .slice(before)
        .map((r) => command(r).action),
      ['save'],
    );
    assert((await f.state()).workflow.saved);
  } finally {
    f.close();
  }
});
void test('discarding later unsent choices preserves previously saved matrix', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    await save(ui);
    const before = plain((await f.state()).workflow),
      writes = posts(f).length;
    await choose(ui, 'item2');
    await abandon(ui);
    assert.deepEqual(plain((await f.state()).workflow), before);
    assert.equal(posts(f).length, writes);
    assert.equal(ui.c.__fqcTest.matrixDirty(), false);
  } finally {
    f.close();
  }
});
void test('receipt-marker quota failure preserves local choice and prevents all POSTs', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    const before = posts(f).length;
    ui.c.sessionStorage.setItem = () => {
      throw Object.assign(Error('SYNTHETIC_QUOTA'), {
        name: 'QuotaExceededError',
      });
    };
    await save(ui);
    assert.equal(posts(f).length, before);
    assert.equal(ui.c.__fqcTest.matrixDirty(), true);
    assert.equal((await f.state()).workflow.saved, null);
    assert(ui.c.__fqcTest.ui.lastError);
  } finally {
    f.close();
  }
});
void test('Save merges peer cells and does not replay previously saved choices', async () => {
  const { f, ui } = await setup();
  try {
    const peer = await mount(f, { actor: 'other' });
    await choose(ui);
    await choose(peer, 'item2');
    await save(ui);
    await save(peer);
    const before = posts(f).length;
    await save(ui);
    assert.deepEqual(
      posts(f)
        .slice(before)
        .map((r) => command(r).action),
      ['save'],
    );
    const flow = (await f.state()).workflow;
    assert.deepEqual(
      flow.working.items.map((r) => r.productCodes),
      [['SYN-P'], ['SYN-P']],
    );
    assert.deepEqual(flow.saved.content, flow.working);
  } finally {
    f.close();
  }
});
for (const refusal of ['PENDING_LOCKED', 'STALE_GENERATION', 'FORBIDDEN'])
  void test(`server ${refusal} atomically refuses Save and keeps local choices`, async () => {
    const { f, ui } = await setup();
    try {
      await choose(ui);
      await f.mutate((values) => {
        if (refusal === 'FORBIDDEN') {
          const users = JSON.parse(values.platformUsers);
          users[0].accessOverrides['fqc.edit'] = false;
          values.platformUsers = JSON.stringify(users);
        } else {
          const q = JSON.parse(values.qualityMasterControl),
            flow = q.libraries.fqc.workflow;
          if (refusal === 'PENDING_LOCKED')
            flow.pendingId = 'synthetic-pending';
          else flow.generation = 'synthetic-new-generation';
          values.qualityMasterControl = JSON.stringify(q);
        }
      });
      const before = posts(f).length,
        unchanged = plain((await f.state()).workflow);
      await save(ui);
      assert.deepEqual(
        posts(f)
          .slice(before)
          .map((r) => command(r).action),
        ['save'],
      );
      assert.equal(posts(f).at(-1).result.error, refusal);
      assert.deepEqual(plain((await f.state()).workflow), unchanged);
      assert.equal(ui.c.__fqcTest.matrixDirty(), true);
      assert.equal(receipts(ui).length, 0);
    } finally {
      f.close();
    }
  });
for (const receiptStatus of [404, 503])
  void test(`lost Save ACK and receipt ${receiptStatus} retain one operation; repeated queries never resend`, async () => {
    let lost = false,
      unavailable = true;
    const { f, ui } = await setup({
      intercept: async (url, o, send) => {
        if (
          o.method === 'POST' &&
          JSON.parse(o.body).command?.action === 'save'
        ) {
          await send();
          lost = true;
          throw Error('SYNTHETIC_ACK_LOST');
        }
        if (lost && unavailable && String(url).includes('operationId='))
          return Response.json(
            {
              error:
                receiptStatus === 404
                  ? 'OPERATION_NOT_FOUND'
                  : 'SYNTHETIC_RECEIPT_UNAVAILABLE',
            },
            { status: receiptStatus },
          );
        return send();
      },
    });
    try {
      await choose(ui);
      const before = posts(f).length;
      await save(ui);
      assert.deepEqual(
        posts(f)
          .slice(before)
          .map((r) => command(r).action),
        ['save'],
      );
      const operationId = command(posts(f).at(-1)).operationId;
      assert.equal(ui.c.__fqcTest.transport().hasUnknown(), true);
      assert((await f.state()).workflow.saved);
      assert.equal(ui.library.workflow.saved, null);
      await query(ui);
      await query(ui);
      assert.equal(posts(f).length, before + 1);
      assert(receipts(ui).length >= 3);
      assert(
        receipts(ui).every(
          (r) =>
            new URL(r.url, 'https://synthetic.invalid').searchParams.get(
              'operationId',
            ) === operationId,
        ),
      );
      unavailable = false;
      await query(ui);
      assert.equal(posts(f).length, before + 1);
      assert.equal(ui.c.__fqcTest.transport().hasUnknown(), false);
      assert.deepEqual(
        plain(ui.library.workflow.saved.content),
        (await f.state()).workflow.saved.content,
      );
    } finally {
      f.close();
    }
  });
void test('rejected Save leaves neither shared changes nor saved snapshot; abandon permits a fresh explicit Save', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    await f.mutate((values) => {
      const q = JSON.parse(values.qualityMasterControl);
      q.libraries.fqc.workflow.pendingId = 'synthetic-pending';
      values.qualityMasterControl = JSON.stringify(q);
    });
    const before = posts(f).length;
    await save(ui);
    assert.equal(posts(f).at(-1).status, 409);
    let flow = (await f.state()).workflow;
    assert.deepEqual(flow.working.items[0].productCodes, []);
    assert.equal(flow.saved, null);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(), false);
    await abandon(ui);
    await f.mutate((values) => {
      const q = JSON.parse(values.qualityMasterControl);
      q.libraries.fqc.workflow.pendingId = null;
      values.qualityMasterControl = JSON.stringify(q);
    });
    await choose(ui);
    await save(ui);
    assert.equal(posts(f).length, before + 2);
    flow = (await f.state()).workflow;
    assert.deepEqual(flow.saved.content.items[0].productCodes, ['SYN-P']);
  } finally {
    f.close();
  }
});
void test('lost Save ACK blocks new Save until authoritative receipt confirms result', async () => {
  let lost = false,
    unavailable = true;
  const { f, ui } = await setup({
    intercept: async (url, o, send) => {
      if (
        o.method === 'POST' &&
        JSON.parse(o.body).command?.action === 'save'
      ) {
        await send();
        lost = true;
        throw Error('SYNTHETIC_SAVE_ACK_LOST');
      }
      if (lost && unavailable && String(url).includes('operationId='))
        return Response.json({ error: 'OPERATION_NOT_FOUND' }, { status: 404 });
      return send();
    },
  });
  try {
    await choose(ui);
    const before = posts(f).length;
    await save(ui);
    assert((await f.state()).workflow.saved);
    assert.equal(ui.library.workflow.saved, null);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(), true);
    await assert.rejects(
      ui.c.__fqcTest.sharedAction('save'),
      /UNKNOWN_OPERATION/,
    );
    assert.equal(posts(f).length, before + 1);
    await query(ui);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(), true);
    unavailable = false;
    await query(ui);
    assert.equal(ui.c.__fqcTest.transport().hasUnknown(), false);
    assert.deepEqual(
      plain(ui.library.workflow.saved.content),
      (await f.state()).workflow.saved.content,
    );
    assert.equal(posts(f).length, before + 1);
  } finally {
    f.close();
  }
});
void test('automatic departure abandons local matrix with a navigation lease and no Save', async () => {
  const { f, ui } = await setup();
  try {
    const before = posts(f).length,
      departure = ui.c.FQCMasterUI.navigation.departure;
    await choose(ui);
    assert.equal(departure.inspect().state, 'dirty');
    assert.equal(departure.autoAbandon, true);
    const lease = await departure.abandon();
    assert.equal(ui.main.inert, true);
    lease.release();
    assert(!ui.main.inert);
    assert.equal(posts(f).length, before);
    assert.equal((await f.state()).workflow.saved, null);
    assert.deepEqual(
      (await f.state()).workflow.working.items[0].productCodes,
      [],
    );
  } finally {
    f.close();
  }
});
void test('departure abandons only current local choices and never removes saved shared content', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    await save(ui);
    const before = plain((await f.state()).workflow),
      writes = posts(f).length;
    await choose(ui, 'item2');
    await abandon(ui);
    assert.deepEqual(plain((await f.state()).workflow), before);
    assert.equal(posts(f).length, writes);
    assert.equal(ui.c.__fqcTest.matrixDirty(), false);
  } finally {
    f.close();
  }
});
void test('unsaved cells cannot Submit; Save then Submit locks fixed selection', async () => {
  const { f, ui } = await setup();
  try {
    await choose(ui);
    const before = posts(f).length;
    await assert.rejects(ui.c.__fqcTest.sharedAction('submit'), /套用|修改/);
    assert.equal(posts(f).length, before);
    await save(ui);
    const flow = (await f.state()).workflow;
    ui.c.alert = () => {};
    await ui.c.__fqcTest.sharedAction('submit', {
      savedId: flow.saved.id,
      expectedRevision: flow.revision,
      generation: flow.generation,
      reason: 'Synthetic matrix submission',
    });
    assert((await f.state()).workflow.pendingId);
    assert.equal(
      ui.main.querySelector('[data-matrix-item="item"]').disabled,
      true,
    );
    assert.deepEqual(
      (await f.state()).workflow.saved.content.items[0].productCodes,
      ['SYN-P'],
    );
  } finally {
    f.close();
  }
});
