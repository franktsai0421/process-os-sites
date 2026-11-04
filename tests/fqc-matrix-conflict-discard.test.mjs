import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const routeFixture = require('../scripts/fqc-apply-fixture.cjs');
const {
  fixture: moduleFixture,
} = require('../scripts/test-fqc-feedback-races.cjs');
const tick = () => new Promise(setImmediate);
async function idle(ui) {
  for (let i = 0; i < 1000 && ui.c.__fqcTest.ui.saving; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ui.c.__fqcTest.ui.saving, false);
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const posts = (f) =>
  f.requests.filter((r) => r.method === 'POST' && JSON.parse(r.body).command);
const assignment = (id, next, previous) => ({
  patches: [
    { op: 'set', path: ['items', { id }, 'productCodes'], value: next },
  ],
  guards: [{ path: ['items', { id }, 'productCodes'], value: previous }],
});
async function mount(f, intercept) {
  const initial = await f.call('/api/fqc/workflow?caseMetadata=1');
  return moduleFixture({
    initialControl: (await initial.json()).control,
    identityUser: { id: 'editor', name: 'Synthetic editor', role: 'staff' },
    send: (url, o) =>
      intercept ? intercept(url, o, () => f.call(url, o)) : f.call(url, o),
  });
}
async function conflicted(f, intercept) {
  const ui = await mount(f, intercept);
  await ui.c.__fqcTest.sharedAction('begin');
  const client = ui.c.__fqcTest.transport(),
    rejections = [],
    send = client.sendPrepared;
  client.sendPrepared = (command, options) => {
    const flight = send(command, options);
    void flight.catch((error) => rejections.push({ command, error }));
    return flight;
  };
  ui.c.__fqcTest.openErrorModal('error');
  const form = ui.doc.querySelector('.fqc-modal-form');
  form.querySelector('[name="name"]').value = 'My local error';
  await form.onsubmit({ preventDefault() {}, target: form });
  await ui.c.__fqcTest.recoverySession().ready;
  await tick();
  await ui.main.querySelector('[data-matrix-item="item"]').click();
  const peer = f.realm('other');
  await peer.client.read();
  await peer.client.command(ui.library.workflow.generation, 'apply', {
    patches: [
      {
        op: 'set',
        path: ['errors', { id: 'error' }, 'name'],
        value: 'Peer error',
      },
    ],
    guards: [
      { path: ['errors', { id: 'error' }, 'name'], value: 'Synthetic error' },
    ],
  });
  await assert.rejects(
    ui.c.__fqcTest.sharedAction('save'),
    /DEPENDENCY_CHANGED_RECONFIRM/,
  );
  assert.equal(posts(f).at(-1).status, 409);
  assert.equal(client.hasUnknown(), false);
  assert.equal(client.hasSyncFailures(), true);
  return { ui, peer, client, rejections };
}
async function discard(ui) {
  const lease = await ui.c.FQCMasterUI.navigation.departure.abandon();
  lease.release();
}
async function reconcile(ui) {
  const button = ui.main.querySelector('#fqc-resolve-conflict');
  assert(button);
  await button.click();
  await idle(ui);
}
void test('confirmed field conflict plus matrix choices can be abandoned locally; subsequent Save preserves peer data', async () => {
  const f = await routeFixture();
  try {
    const { ui, client } = await conflicted(f),
      before = posts(f).length,
      latest = plain((await f.state()).workflow);
    await discard(ui);
    assert.equal(posts(f).length, before);
    assert.equal(client.hasSyncFailures(), false);
    assert.equal(ui.c.__fqcTest.matrixDirty(), false);
    assert.deepEqual(plain((await f.state()).workflow), latest);
    await ui.c.__fqcTest.sharedAction('save');
    assert.equal(posts(f).length, before + 1);
    assert.deepEqual((await f.state()).workflow.saved.content, latest.working);
  } finally {
    f.close();
  }
});
for (const mode of [
  'null-working',
  'missing-items',
  'invalid-row',
  'mismatched-draft',
  'missing-draft-snapshot',
  'duplicate-draft',
  'invalid-version',
  'invalid-saved',
])
  void test(`malformed conflict-reconcile read ${mode} cannot clear local intent or original failure`, async () => {
    const f = await routeFixture();
    let armed = false;
    try {
      const { ui, client } = await conflicted(f, async (url, o, send) => {
        if (!armed || o.method === 'POST') return send();
        const response = await f.call('/api/fqc/workflow?caseMetadata=1'),
          data = await response.json(),
          flow = data.control.workflow,
          draft = data.control.versions.find((v) => v.status === 'draft');
        if (mode === 'null-working') flow.working = null;
        if (mode === 'missing-items') delete flow.working.items;
        if (mode === 'invalid-row') flow.working.items[0] = null;
        if (mode === 'mismatched-draft')
          draft.snapshot.errors[0].name = 'Wrong';
        if (mode === 'missing-draft-snapshot') delete draft.snapshot;
        if (mode === 'duplicate-draft')
          data.control.versions.push(plain(draft));
        if (mode === 'invalid-version') data.control.versions.push(null);
        if (mode === 'invalid-saved')
          flow.saved = { id: 'synthetic-saved', content: null };
        return Response.json(data);
      });
      const before = posts(f).length,
        local = plain(ui.c.__fqcTest.selected().snapshot),
        shared = plain((await f.state()).workflow);
      armed = true;
      await reconcile(ui);
      assert.equal(client.hasSyncFailures(), true);
      assert.equal(ui.c.__fqcTest.matrixDirty(), true);
      assert.deepEqual(plain(ui.c.__fqcTest.selected().snapshot), local);
      assert.equal(posts(f).length, before);
      assert.deepEqual(plain((await f.state()).workflow), shared);
    } finally {
      f.close();
    }
  });
void test('local-storage removal failure does not turn unsent edits into shared writes', async () => {
  const f = await routeFixture();
  try {
    const { ui, client } = await conflicted(f),
      before = posts(f).length;
    ui.c.localStorage.removeItem = () => {
      throw Error('LOCAL_STORAGE_UNAVAILABLE');
    };
    await discard(ui);
    assert.equal(posts(f).length, before);
    assert.equal(client.hasSyncFailures(), false);
    assert.equal(ui.c.__fqcTest.matrixDirty(), false);
    assert.equal((await f.state()).workflow.saved, null);
  } finally {
    f.close();
  }
});
void test('receipt marker cleanup failure remains unknown and cannot be relabeled as safely discardable', async () => {
  const f = await routeFixture();
  try {
    const ui = await mount(f);
    await ui.c.__fqcTest.sharedAction('begin');
    await ui.c.__fqcTest.recoverySession().ready;
    await ui.main.querySelector('[data-matrix-item="item"]').click();
    await f.mutate((v) => {
      const q = JSON.parse(v.qualityMasterControl);
      q.libraries.fqc.workflow.pendingId = 'pending';
      v.qualityMasterControl = JSON.stringify(q);
    });
    ui.c.sessionStorage.removeItem = () => {
      throw Error('REMOVE_DENIED');
    };
    let command;
    await assert.rejects(
      ui.c.__fqcTest.sharedAction('save', {}, (sent) => {
        command = sent;
      }),
      /PENDING_LOCKED/,
    );
    const client = ui.c.__fqcTest.transport(),
      before = posts(f).length;
    assert.equal(client.hasUnknown(), true);
    assert.equal(client.discardRejectedLocalSave(command), false);
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'), /UNKNOWN/);
    assert.equal(posts(f).length, before);
    assert.equal((await f.state()).workflow.saved, null);
  } finally {
    f.close();
  }
});
void test('known rejection blocks subsequent Save until explicit discard; later unknown receipt does not resend', async () => {
  const f = await routeFixture();
  let armed = false,
    lost = false;
  try {
    const { ui, client } = await conflicted(f, async (url, o, send) => {
      if (armed && o.method === 'POST') {
        await send();
        lost = true;
        throw Error('LOST_ACK');
      }
      if (armed && lost && String(url).includes('operationId='))
        return Response.json({ error: 'OPERATION_NOT_FOUND' }, { status: 404 });
      return send();
    });
    const before = posts(f).length;
    await assert.rejects(
      ui.c.__fqcTest.sharedAction('save'),
      /DEPENDENCY_CHANGED/,
    );
    assert.equal(posts(f).length, before);
    await discard(ui);
    armed = true;
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'), /RESULT_UNKNOWN/);
    assert.equal(client.hasUnknown(), true);
    const count = posts(f).length;
    armed = false;
    await ui.main.querySelector('#fqc-check-result').click();
    await idle(ui);
    assert.equal(client.hasUnknown(), false);
    assert.equal(client.hasSyncFailures(), false);
    assert.equal(posts(f).length, count);
  } finally {
    f.close();
  }
});
void test('GET and toggling cells back do not clear the exact rejected local Save obligation', async () => {
  const f = await routeFixture();
  try {
    const { ui, client } = await conflicted(f);
    const before = posts(f).length;
    await client.read();
    assert.equal(client.hasSyncFailures(), true);
    await ui.main.querySelector('[data-matrix-item="item"]').click();
    assert.equal(client.hasSyncFailures(), true);
    await discard(ui);
    assert.equal(client.hasSyncFailures(), false);
    assert.equal(posts(f).length, before);
    await ui.c.__fqcTest.sharedAction('save');
    assert.equal(
      (await f.state()).workflow.saved.content.errors[0].name,
      'Peer error',
    );
  } finally {
    f.close();
  }
});
void test('exact rejection discard refuses changed commands, another client and unrelated operations; consumption is one-time', async () => {
  const f = await routeFixture();
  try {
    const { ui, client, rejections } = await conflicted(f),
      first = rejections[0];
    for (const command of [
      { ...first.command, operationId: 'different' },
      { ...first.command, input: { matrixCells: [] } },
      null,
    ])
      assert.equal(client.discardRejectedLocalSave(command), false);
    const other = f.realm('editor');
    await other.client.read();
    assert.equal(other.client.discardRejectedLocalSave(first.command), false);
    await assert.rejects(
      client.command(ui.library.workflow.generation, 'apply', {
        patches: [
          {
            op: 'set',
            path: ['errors', { id: 'error' }, 'name'],
            value: 'Other local',
          },
        ],
        guards: [
          {
            path: ['errors', { id: 'error' }, 'name'],
            value: 'Synthetic error',
          },
        ],
      }),
      /DEPENDENCY_CHANGED/,
    );
    assert.equal(client.discardRejectedLocalSave(first.command), true);
    assert.equal(client.discardRejectedLocalSave(first.command), false);
    assert.equal(client.hasSyncFailures(), true);
    assert.equal(
      client.discardRejected([['errors', { id: 'error' }, 'name']]),
      true,
    );
  } finally {
    f.close();
  }
});
for (const mode of [
  'read-failure',
  'read-revoked',
  'edit-revoked',
  'new-generation',
  'pending-lock',
  'local-storage-failure',
])
  void test(`conflict resolution ${mode} cannot accidentally save local changes`, async () => {
    const f = await routeFixture();
    let failRead = false;
    try {
      const { ui, client } = await conflicted(f, async (url, o, send) =>
        failRead && o.method !== 'POST'
          ? Response.json({ error: 'UNAVAILABLE' }, { status: 503 })
          : send(),
      );
      if (mode === 'read-failure') failRead = true;
      if (mode === 'read-revoked') f.revoke('editor');
      if (mode === 'edit-revoked')
        await f.mutate((v) => {
          const u = JSON.parse(v.platformUsers);
          u[0].accessOverrides['fqc.edit'] = false;
          v.platformUsers = JSON.stringify(u);
        });
      if (mode === 'new-generation' || mode === 'pending-lock')
        await f.mutate((v) => {
          const q = JSON.parse(v.qualityMasterControl);
          if (mode === 'new-generation')
            q.libraries.fqc.workflow.generation = 'next-generation';
          else q.libraries.fqc.workflow.pendingId = 'pending';
          v.qualityMasterControl = JSON.stringify(q);
        });
      if (mode === 'local-storage-failure')
        ui.c.localStorage.removeItem = () => {
          throw Error('REMOVE_DENIED');
        };
      const before = posts(f).length,
        latest = plain((await f.state()).workflow);
      await reconcile(ui);
      assert.equal(posts(f).length, before);
      assert.deepEqual(plain((await f.state()).workflow), latest);
      if (mode !== 'local-storage-failure') {
        assert.equal(client.hasSyncFailures(), true);
        assert.equal(ui.c.__fqcTest.matrixDirty(), true);
      } else {
        assert.equal(client.hasUnknown(), false);
        assert.equal(
          ui.c.__fqcTest.selected().snapshot.errors[0].name,
          'My local error',
        );
      }
    } finally {
      f.close();
    }
  });
void test('conflict reconciliation is single-flight and a failed GET can be retried without a POST', async () => {
  const f = await routeFixture();
  let armed = false,
    release,
    entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    const { ui, client } = await conflicted(f, async (url, o, send) => {
      if (armed && o.method !== 'POST') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
        return Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
      }
      return send();
    });
    const before = posts(f).length;
    armed = true;
    ui.main.querySelector('#fqc-resolve-conflict').click();
    await started;
    const requests = ui.requests.length;
    ui.main.querySelector('#fqc-resolve-conflict').click();
    assert.equal(ui.requests.length, requests);
    release();
    await idle(ui);
    assert.equal(client.hasSyncFailures(), true);
    armed = false;
    await reconcile(ui);
    assert.equal(client.hasSyncFailures(), false);
    assert.equal(posts(f).length, before);
    assert.equal(
      ui.c.__fqcTest.selected().snapshot.errors[0].name,
      'My local error',
    );
  } finally {
    f.close();
  }
});
void test('discard cannot grant freshly revoked edit/save authority', async () => {
  const f = await routeFixture();
  try {
    const { ui } = await conflicted(f);
    await f.mutate((v) => {
      const u = JSON.parse(v.platformUsers);
      u[0].accessOverrides['fqc.save'] = false;
      u[0].accessOverrides['fqc.edit'] = false;
      v.platformUsers = JSON.stringify(u);
    });
    await discard(ui);
    const before = plain((await f.state()).workflow);
    await assert.rejects(ui.c.__fqcTest.sharedAction('save'), /FORBIDDEN/);
    assert.deepEqual(plain((await f.state()).workflow), before);
  } finally {
    f.close();
  }
});
void test('actor replacement during reconcile GET cannot adopt or clear original local intent', async () => {
  const f = await routeFixture();
  let armed = false,
    release,
    entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    const { ui, client } = await conflicted(f, async (url, o, send) => {
      if (armed && o.method !== 'POST') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return send();
    });
    const before = posts(f).length,
      local = plain(ui.c.__fqcTest.selected().snapshot);
    armed = true;
    ui.main.querySelector('#fqc-resolve-conflict').click();
    await started;
    ui.c.ProcessSync.identity = { ...ui.c.ProcessSync.identity };
    release();
    await idle(ui);
    assert.equal(client.hasSyncFailures(), true);
    assert.deepEqual(plain(ui.c.__fqcTest.selected().snapshot), local);
    assert.equal(posts(f).length, before);
  } finally {
    f.close();
  }
});
void test('queued request then uncorrelated409 never becomes an exact safe-discard proof', async () => {
  const f = await routeFixture();
  let armed = false,
    release,
    entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    const { ui, client, rejections } = await conflicted(
      f,
      async (url, o, send) => {
        if (armed && o.method === 'POST') {
          entered();
          await new Promise((resolve) => {
            release = resolve;
          });
          return Response.json(
            {
              error: 'DEPENDENCY_CHANGED_RECONFIRM',
              details: { path: ['items', { id: 'item' }, 'productCodes'] },
            },
            { status: 409 },
          );
        }
        return send();
      },
    );
    armed = true;
    const pending = assert.rejects(
      client.command(
        ui.library.workflow.generation,
        'apply',
        assignment('item', ['SYN-P'], []),
      ),
      /DEPENDENCY_CHANGED/,
    );
    await started;
    assert.equal(client.discardRejectedLocalSave(rejections[0].command), false);
    const before = posts(f).length;
    release();
    await pending;
    assert.equal(client.hasUnknown(), true);
    assert.equal(client.discardRejectedLocalSave(rejections[0].command), false);
    await assert.rejects(client.retryUnknown(), /OPERATION_NOT_FOUND/);
    assert.equal(client.hasUnknown(), true);
    assert.equal(posts(f).length, before);
  } finally {
    f.close();
  }
});
void test('a different audited refusal cannot be relabeled into an original guard409 proof', async () => {
  const f = await routeFixture();
  try {
    const realm = f.realm(),
      { client } = realm,
      begun = await client.begin(),
      command = client.prepare(
        begun.control.workflow.generation,
        'apply',
        assignment('item', ['SYN-P'], []),
      );
    realm.intercept((url, o, send) =>
      o.method === 'POST'
        ? Response.json(
            {
              error: 'EQUIPMENT_UNAVAILABLE',
              requestId: '12345678-1234-4234-8234-123456789abc',
              details: { path: ['items', { id: 'item' }, 'productCodes'] },
            },
            { status: 422 },
          )
        : send(),
    );
    let error;
    await assert.rejects(client.sendPrepared(command), (e) => {
      error = e;
      return e.message === 'EQUIPMENT_UNAVAILABLE';
    });
    assert.equal(client.isConfirmedRejection(error, command), true);
    assert.equal(client.hasUnknown(), false);
    error.message = 'DEPENDENCY_CHANGED_RECONFIRM';
    error.status = 409;
    assert.equal(client.canDiscardMatrixConflicts([{ command, error }]), false);
    assert.equal(client.hasSyncFailures(), true);
  } finally {
    f.close();
  }
});
