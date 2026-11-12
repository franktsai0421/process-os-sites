import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createABCFixture } from './ab-c-native-fixture.mjs';
import { accessKeys } from '../public/process/access-policy.mjs';
const programCommit = process.env.PROCESS_PROGRAM_COMMIT;
async function setup(t) {
  const roles = {
    viewer: ['view'],
    editor: ['view', 'edit'],
    submitter: ['view', 'submit'],
    'no-view': ['edit', 'submit'],
  };
  const f = await createABCFixture({
    programCommit,
    products: 4,
    decorate(values) {
      const users = JSON.parse(values.platformUsers);
      for (const [id, rights] of Object.entries(roles))
        users.push({
          id: 'compiled-' + id,
          name: 'Synthetic ' + id,
          role: 'staff',
          enabled: true,
          authMode: 'platform',
          authEpoch: 1,
          inheritRole: false,
          accessOverrides: Object.fromEntries(
            accessKeys.map((k) => [
              k,
              rights.some((r) => k === 'ipqc-ab.' + r),
            ]),
          ),
        });
      values.platformUsers = JSON.stringify(users);
    },
  });
  const b = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    headless: true,
  });
  t.after(async () => {
    await b.close();
    await f.close();
  });
  const contexts = [];
  const open = async (who = 'frank', width = 1280, lang = 'zh') => {
    const c = await b.newContext({ viewport: { width, height: 850 } });
    contexts.push(c);
    await c.addCookies([
      { name: 'process_demo', value: f.cookie(who), url: f.url.origin },
    ]);
    await c.addInitScript(
      (lang) => localStorage.setItem('processUILanguage', lang),
      lang,
    );
    const page = await c.newPage();
    page.setDefaultTimeout(10000);
    page.on('dialog', (d) => d.accept());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      new URL(r.request().url()).origin === f.url.origin
        ? r.continue()
        : r.abort(),
    );
    return {
      page,
      c,
      actorId:who,
      errors,
      go: async () => {
        await page.goto(
          f.url.origin +
            '/process/?system=quality&view=data&dataTab=quality-ipqc-ab',
        );
      },
    };
  };
  const state = async () => {
    const row = await f.db
        .prepare('SELECT revision,"values" FROM shared_state WHERE id=1')
        .first(),
      bucket = await f.mf.getR2Bucket('STATE_ARCHIVE'),
      decoded = await f
        .load('lib/state-records.ts')
        .decodeRecordValues(bucket, JSON.parse(row.values));
    return {
      row,
      root: JSON.parse(decoded.values.ipqcABMasterControl || '{}'),
    };
  };
  const admin = await open();
  let seq = 0;
  const call = async (actor, method, query, body) => {
    const response = await actor.c.request.fetch(
      f.url.origin + '/api/ipqc-ab/workflow?caseMetadata=1&' + query,
      {
        method,
        headers: { Origin: f.url.origin, 'X-Process-Expected-Actor':actor.actorId },
        ...(body ? { data: body } : {}),
      },
    );
    const result = f
      .load('lib/workflow-wire.ts')
      .expandWorkflowPayload(await response.json());
    return { status: response.status(), body: result };
  };
  const cmd = async (actor, action, detail = {}, query = 'module=1') => {
    const read = await call(admin, 'GET', query),
      flow = read.body.control.workflow;
    return call(actor, 'POST', query, {
      command: {
        operationId: randomUUID(),
        clientId: 'compiled-gap-' + ++seq,
        sequence: seq,
        action,
        generation: flow.generation,
        expectedRevision:flow.revision,
        input: { stateRevision: read.body.revision },
        ...detail,
        input: { stateRevision: read.body.revision, ...detail.input },
      },
    });
  };
  assert.equal(
    (await call(admin, 'POST', 'scope=A%3AGROUP-1', { action: 'begin' }))
      .status,
    200,
  );
  assert.equal(
    (
      await cmd(
        admin,
        'apply',
        {
          moduleAction: 'create-error',
          input: { stageCode: 'A-A', name: 'Synthetic restricted error' },
        },
        'scope=A%3AGROUP-1',
      )
    ).status,
    200,
  );
  const group = (await call(admin, 'GET', 'scope=A%3AGROUP-1')).body.control;
  assert.equal(
    (
      await cmd(
        admin,
        'apply',
        {
          moduleAction: 'create-item',
          input: {
            errorId: group.workflow.working.errors[0].id,
            item: {
              standard: 'Synthetic restricted standard',
              methodText: 'Visual',
              productCodes: ['A001'],
            },
          },
        },
        'scope=A%3AGROUP-1',
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(admin, 'POST', 'module=1', { action: 'begin' })).status,
    200,
  );
  assert.equal((await cmd(admin, 'save')).status, 200);
  return { f, b, open, state, admin, call, cmd };
}
const idle = (page) =>
  page.waitForFunction(
    () =>
      !sharedDraftAccountState().queued &&
      IPQCABUI.navigation.canLeave() &&
      !document.querySelector('#ipqcab-save')?.disabled,
  );
const markers = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(sessionStorage).filter(([k]) =>
        k.startsWith('shared-draft'),
      ),
    ),
  );
void test(
  'compiled restricted role UI and backend Save/create/delete/Submit/view separation',
  { timeout: 60000 },
  async (t) => {
    const s = await setup(t),
      results = [];
    const negative = async (actor, detail) => {
      const before = (await s.state()).row;
      const reply = await s.cmd(actor, 'save', detail);
      assert.equal(reply.status, 403, JSON.stringify(reply.body));
      assert.deepEqual((await s.state()).row, before);
    };
    const view = await s.open('compiled-viewer');
    await view.go();
    await view.page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
    assert.equal(
      await view.page
        .locator(
          '#ipqcab-save,#ipqcab-begin,#ipqcab-submit,[data-ab-edit-item],[data-ab-delete-item]',
        )
        .count(),
      0,
    );
    let root = (await s.state()).root,
      g = root.scopes['A:GROUP-1'],
      row = g.workflow.working.items[0];
    const editDetail = () => ({
      moduleAction: 'save-local-v1',
      input: {
        scopes: [
          {
            scope: 'A:GROUP-1',
            generation: g.workflow.generation,
            baseId: g.activeVersionId,
            changes: [
              {
                patches: [
                  {
                    op: 'set',
                    path: ['items', { id: row.id }, 'standard'],
                    value: 'Denied edit',
                  },
                ],
                guards: [
                  {
                    path: ['items', { id: row.id }, 'standard'],
                    value: row.standard,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    await negative(view, editDetail());
    let before = (await s.state()).row;
    assert.equal(
      (
        await s.cmd(view, 'submit', {
          savedId: root.moduleDraft.workflow.saved.id,
          reason: 'Denied',
        })
      ).status,
      403,
    );
    assert.deepEqual((await s.state()).row, before);
    results.push(
      'PASS viewer: UI read-only, direct Save/Submit forbidden without state writes',
    );
    const rawEditor = JSON.parse(s.f.values.platformUsers).find(
      (user) => user.id === 'compiled-editor',
    );
    assert.equal(rawEditor.accessOverrides['ipqc-ab.view'], true);
    assert.equal(rawEditor.accessOverrides['ipqc-ab.edit'], true);
    for (const action of ['save', 'submit', 'create', 'delete'])
      assert.equal(rawEditor.accessOverrides['ipqc-ab.' + action], false);
    const edit = await s.open('compiled-editor');
    const effective = await s.call(edit, 'GET', 'module=1&permissions=1');
    assert.equal(effective.status, 200);
    for (const action of ['view', 'edit', 'save'])
      assert.equal(effective.body.permissions[action], true);
    for (const action of ['submit', 'create', 'delete'])
      assert.equal(effective.body.permissions[action], false);
    await edit.go();
    await edit.page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
    assert.equal(
      await edit.page
        .locator(
          '#ipqcab-submit:not([disabled]),#ipqcab-add-error:not([disabled]),#ipqcab-add-item:not([disabled]),[data-ab-delete-item]:not([disabled])',
        )
        .count(),
      0,
    );
    await edit.page.locator('[data-ab-edit-item]').first().click();
    await edit.page.locator('#ab-standard').fill('Edit-only compiled saved');
    await edit.page.locator('#ab-apply').click();
    await edit.page.locator('#ipqcab-save').click();
    await idle(edit.page);
    root = (await s.state()).root;
    g = root.scopes['A:GROUP-1'];
    row = g.workflow.working.items[0];
    assert.equal(
      root.moduleDraft.workflow.saved.content.scopes['A:GROUP-1'].items[0]
        .standard,
      'Edit-only compiled saved',
    );
    for (const change of [
      {
        moduleAction: 'create-error',
        localId: 'local-denied-create123',
        input: { stageCode: 'A-A', name: 'Denied' },
      },
      {
        moduleAction: 'delete-item',
        input: { id: row.id },
        guards: [{ path: ['items', { id: row.id }], value: row }],
      },
    ])
      await negative(edit, {
        moduleAction: 'save-local-v1',
        input: {
          scopes: [
            {
              scope: 'A:GROUP-1',
              generation: g.workflow.generation,
              baseId: g.activeVersionId,
              changes: [change],
            },
          ],
        },
      });
    before = (await s.state()).row;
    assert.equal(
      (
        await s.cmd(edit, 'submit', {
          savedId: root.moduleDraft.workflow.saved.id,
          reason: 'Denied',
        })
      ).status,
      403,
    );
    assert.deepEqual((await s.state()).row, before);
    results.push(
      'PASS raw edit=true/save=false produces effective Save=true and successful UI Save; Submit/create/delete remain false and forbidden',
    );
    const submit = await s.open('compiled-submitter');
    await submit.go();
    await submit.page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
    assert.equal(
      await submit.page
        .locator('#ipqcab-save,#ipqcab-begin,[data-ab-edit-item]')
        .count(),
      0,
    );
    await negative(submit, editDetail());
    await submit.page.locator('#ipqcab-submit').click();
    await submit.page
      .locator('dialog[open] textarea')
      .fill('Submit-only compiled review');
    await submit.page.locator('dialog[open] button[type=submit]').click();
    await idle(submit.page);
    root = (await s.state()).root;
    assert(root.moduleDraft.workflow.pendingId);
    assert.equal(
      root.moduleDraft.workflow.cases.at(-1).actor.id,
      'compiled-submitter',
    );
    assert.equal(await submit.page.locator('#ipqcab-withdraw').count(), 0);
    before = (await s.state()).row;
    for (const action of ['withdraw', 'approve'])
      assert.equal(
        (
          await s.cmd(submit, action, {
            caseId: root.moduleDraft.workflow.pendingId,
            reason: 'Denied',
            selfReviewConfirmed: true,
          })
        ).status,
        403,
      );
    assert.deepEqual((await s.state()).row, before);
    results.push(
      'PASS submit-only: cannot edit/Save, can submit fixed saved snapshot, no Withdraw grant',
    );
    const hidden = await s.open('compiled-no-view');
    await hidden.go();
    const denied = await s.call(hidden, 'GET', 'module=1');
    assert.equal(denied.status, 403);
    await negative(hidden, editDetail());
    const deniedEntry = await hidden.page.locator('body').innerText();
    assert.match(deniedEntry, /載入失敗/);
    t.diagnostic(
      JSON.stringify({
        noViewEntryText: deniedEntry.slice(0, 1000),
        bootAttribute: await hidden.page
          .locator('html')
          .getAttribute('data-process-boot'),
      }),
    );
    assert.equal(await hidden.page.locator('#ipqcab-line').count(), 0);
    assert(
      !(await hidden.page.locator('body').innerText()).includes(
        'Edit-only compiled saved',
      ),
    );
    results.push(
      'PASS no-view backend 403 and no private data displayed; normal shell readiness NOT_VERIFIED',
    );
    for (const actor of [view, edit, submit, hidden])
      assert.deepEqual(actor.errors, []);
    t.diagnostic(
      JSON.stringify({
        programCommit,
        buildEntrySha256: s.f.buildEntrySha256,
        results,
      }),
    );
  },
);
void test(
  'compiled narrow 390 vi unknown Save keeps original marker across departure/reload/404, recovers GET-only',
  { timeout: 60000 },
  async (t) => {
    const s = await setup(t),
      a = await s.open('frank', 390, 'vi'),
      page = a.page,
      posts = [];
    page.on('request', (r) => {
      if (
        r.method() === 'POST' &&
        new URL(r.url()).pathname === '/api/ipqc-ab/workflow'
      )
        posts.push(JSON.parse(r.postData()));
    });
    await a.go();
    await page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
    await page.locator('[data-ab-edit-item]').first().click();
    await page.locator('#ab-standard').fill('Narrow committed ACK loss');
    await page.locator('#ab-apply').click();
    let loss = false,
      down = true;
    await page.route('**/api/ipqc-ab/workflow?*', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (down && url.searchParams.has('operationId'))
        return route.fulfill({
          status: 404,
          json: { error: 'OPERATION_NOT_FOUND' },
        });
      if (
        !loss &&
        req.method() === 'POST' &&
        JSON.parse(req.postData() || '{}').command?.action === 'save'
      ) {
        loss = true;
        await route.fetch();
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.locator('#ipqcab-save').click();
    await idle(page);
    assert(loss);
    assert.equal(posts.length, 1);
    const original = posts[0].command.operationId,
      keys = await markers(page);
    assert(Object.keys(keys).length);
    assert(await page.evaluate(() => sharedDraftAccountState().unknown));
    const saved = (await s.state()).root.moduleDraft.workflow.saved.id;
    await page.evaluate(() => {
      void ProcessDeliveryNavigation.navigate('dashboard');
    });
    await page.waitForFunction(() => state.view === 'dashboard');
    assert.equal(
      await page.locator('#process-navigation-departure').count(),
      0,
    );
    assert.deepEqual(await markers(page), keys);
    await page.evaluate(() => {
      void ProcessDeliveryNavigation.navigate('data', 'quality-ipqc-ab');
    });
    await page.locator('[data-ab-local-query]').waitFor();
    await page.reload();
    await page.locator('[data-ab-local-query]').waitFor({ timeout: 30000 });
    assert.deepEqual(await markers(page), keys);
    assert.match(
      await page.locator('[data-ab-local-unknown]').innerText(),
      /Chưa xác nhận/,
    );
    await page.locator('[data-ab-local-query]').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-ab-local-query]')?.disabled,
    );
    assert(await page.evaluate(() => sharedDraftAccountState().unknown));
    assert.deepEqual(await markers(page), keys);
    assert.equal(posts.length, 1);
    down = false;
    const lookup = page.waitForRequest(
      (r) => new URL(r.url()).searchParams.get('operationId') === original,
    );
    await page.locator('[data-ab-local-query]').click();
    assert.equal((await lookup).method(), 'GET');
    await page.waitForFunction(
      () =>
        !sharedDraftAccountState().unknown && IPQCABUI.navigation.canLeave(),
    );
    assert.equal(posts.length, 1);
    const root = (await s.state()).root;
    assert.equal(root.moduleDraft.workflow.saved.id, saved);
    assert.equal(
      root.moduleDraft.workflow.saved.content.scopes['A:GROUP-1'].items[0]
        .standard,
      'Narrow committed ACK loss',
    );
    assert.deepEqual(a.errors, []);
    t.diagnostic(
      JSON.stringify({
        programCommit,
        buildEntrySha256: s.f.buildEntrySha256,
        width: 390,
        lang: 'vi',
        savePOSTs: 1,
        originalReceipt: original,
        status: 'PASS',
        realCompiledWorker: true,
        receipt404FaultInjected: true,
      }),
    );
  },
);
