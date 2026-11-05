import assert from 'node:assert/strict';
import {
  setup,
  addError,
  addItem,
  writes,
  save,
} from './ipqc-ab-local-browser-fixture.mjs';
export { addError, addItem, writes, save };
export const action = (r) => r.body?.command?.action || r.body?.action;
export const isSave = (r) => r.method === 'POST' && action(r) === 'save';
export async function fixture(t, { seed = true, ...options } = {}) {
  const s = await setup({ ...options, controllerHooks: true });
  t.after(() => s.close());
  if (seed) {
    await s.f.begin('ipqc-ab', 'editor', 200, '&scope=A%3AG');
    await s.f.command(
      'ipqc-ab',
      'apply',
      {
        moduleAction: 'create-error',
        input: { stageCode: 'A-CUT', name: 'Initial error' },
      },
      'editor',
      200,
      '&scope=A%3AG',
    );
    const g = await s.f.read('ipqc-ab', 'editor', '&scope=A%3AG');
    await s.f.command(
      'ipqc-ab',
      'apply',
      {
        moduleAction: 'create-item',
        input: {
          errorId: g.control.workflow.working.errors[0].id,
          item: { standard: 'Initial standard', methodText: 'Initial method' },
        },
      },
      'editor',
      200,
      '&scope=A%3AG',
    );
    await s.f.begin('ipqc-ab', 'editor', 200, '&module=1');
    await s.boot();
  }
  s.requests.length = 0;
  s.state = () => s.page.evaluate(() => __ABTest.view());
  s.entry = () => s.page.evaluate(() => __ABTest.entry());
  s.apiSave = () => s.page.evaluate(() => __ABTest.save());
  s.query = () => s.page.evaluate(() => __ABTest.query());
  s.group = () => s.f.read('ipqc-ab', 'editor', '&scope=A%3AG');
  s.root = async () =>
    JSON.parse((await s.f.core.readState()).values.ipqcABMasterControl || '{}');
  s.edit = async (field, value) => {
    await s.page.locator('[data-ab-edit-item]').first().click();
    await s.page
      .locator(field === 'standard' ? '#ab-standard' : '#ab-method')
      .fill(value);
    await s.page.locator('#ab-apply').click();
  };
  s.local = () => s.page.evaluate(() => __ABTest.scopes());
  s.peer = async (field, value) => {
    const g = await s.group(),
      id = g.control.workflow.working.items[0].id,
      path = ['items', { id }, field];
    await s.f.command(
      'ipqc-ab',
      'apply',
      {
        patches: [{ op: 'set', path, value }],
        guards: [{ path, value: g.control.workflow.working.items[0][field] }],
      },
      'editor',
      200,
      '&scope=A%3AG',
    );
  };
  s.mutate = async (fn) => {
    const state = await s.f.core.readState(),
      root = JSON.parse(state.values.ipqcABMasterControl);
    fn(root);
    const values = {
        ...state.values,
        ipqcABMasterControl: JSON.stringify(root),
      },
      encoded = await s.f.core.encodeValues(values, state);
    s.f.db
      .prepare(
        'UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1',
      )
      .run(encoded);
  };
  s.unknown = () => s.page.evaluate(() => sharedDraftAccountState().unknown);
  s.keys = () =>
    s.page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  s.pin = () => s.page.evaluate(() => __ABTest.pin());
  s.pinned = () => s.page.evaluate(() => __ABTest.pinState());
  s.owner = (change) =>
    s.page.evaluate((change) => {
      const sync = ProcessSync;
      if (change === 'actor') sync.identity = { id: 'foreign', role: 'staff' };
      if (change === 'same-id actor') sync.identity = { ...sync.identity };
      if (change === 'epoch') sync._epoch++;
      if (change === 'delivery') sync._delivery++;
      if (change === 'requiresReload') sync.requiresReload = true;
      if (change === 'host') __ABTest.replaceHost();
      if (change === 'tab')
        document.querySelector('main').dataset.activeTab = 'other-tab';
      if (change === 'disconnected') document.querySelector('main').remove();
      if (change === 'lifecycle') __ABTest.reset();
      if (change === 'revision') __ABTest.set('revision', 99999);
      if (change === 'client') __ABTest.replaceClient();
      if (change === 'generation') __ABTest.switchGeneration();
      if (change === 'modal')
        __ABTest.set('modal', { type: 'new-error', name: 'New private modal' });
      if (change === 'operation') __ABTest.replaceSent();
    }, change);
  s.releaseCheck = async (held) => {
    held.release();
    await s.page.waitForFunction(() => !sharedDraftAccountState().queued);
  };
  s.cleanErrors = () => assert.deepEqual(s.errors, []);
  return s;
}
export function deadline(promise, ms = 10000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Error(
              'Expected request was not dispatched within existing browser budget',
            ),
          ),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
export const viewContent = (s) =>
  JSON.stringify({
    base: s.localScopes.map((e) => e.base),
    snapshot: s.localScopes.map((e) => e.snapshot),
  });
export async function beginSave(s) {
  const held = s.hold(isSave);
  const saving = s.apiSave();
  await deadline(held.started);
  return { held, saving };
}
export async function stageCreate(s, kind = 'item') {
  if (kind === 'item') await addItem(s, 'Sent created standard');
  else await addError(s, 'Sent created error');
  const entry = await s.entry();
  return entry.snapshot[kind === 'item' ? 'items' : 'errors'].at(-1);
}
export function expanded(s, bytes) {
  return s.f
    .load('lib/workflow-wire.ts')
    .expandWorkflowPayload(JSON.parse(bytes.toString()));
}
export async function loseSave(s) {
  s.lose('save');
  await s.apiSave();
  assert.equal(await s.unknown(), true);
  assert.equal(writes(s).length, 1);
  return writes(s)[0].body.command;
}
export async function sameLocal(s, before) {
  assert.equal(viewContent(await s.state()), viewContent(before));
}
