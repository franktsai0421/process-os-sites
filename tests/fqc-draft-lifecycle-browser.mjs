// Native compiled-Worker FQC button acceptance. CI-only; never a workaround for
// denied local sockets/Chromium. All data/accounts are isolated synthetic inputs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildFqcDraftLifecycleSeed} from './fqc-draft-lifecycle-route-fixture.mjs';
import {measureAction, summarizeActions, REQUIRED_SAMPLES} from './draft-action-measurement.mjs';

export const fqcBrowserActions = Object.freeze([
  'begin', 'error-edit-open', 'error-edit-apply', 'error-new-open', 'error-new-apply', 'error-cancel-open', 'error-cancel',
  'item-edit-open', 'item-edit-apply', 'item-new-open', 'item-new-apply', 'item-cancel-open', 'item-cancel',
  'matrix-discard-choice', 'matrix-discard', 'matrix-choice', 'matrix-apply', 'save', 'read-saved-draft',
  'submit-open', 'submit-confirm', 'withdraw-open', 'withdraw-confirm', 'resubmit-open', 'resubmit-confirm',
  'review-return-select', 'return-open', 'return-confirm', 'returned-submit-open', 'returned-submit-confirm',
  'review-approve-select', 'approve-open', 'approve-confirm',
]);
const formSelector = '.fqc-modal-overlay .fqc-modal-form';
const formSubmit = formSelector + ' button[type="submit"]';
const formCancel = formSelector + ' footer [data-close]';
const confirmSelector = '.vd-confirm[open] button[type="submit"]';
const flowOf = () => window.FQCMasterUI?.control?.libraries?.fqc?.workflow;

// Passive setup-only diagnostics: no headers, cookies, query values, response
// bodies or raw console text. These observations never satisfy a readiness gate.
export function observeFqcSetup(page, origin, clock = () => performance.now()) {
  const started = clock(), entries = new Map(), rows = [], consoleCounts = {};
  let stopped = false, stoppedAt = null, dropped = 0, observationErrors = 0, sharedLoadWarning = false;
  const elapsed = () => Math.max(0, clock() - started);
  const safely = callback => value => { try { callback(value); } catch { observationErrors++; } };
  const path = url => ['/process/', '/process/index.html', '/api/process-bootstrap'].includes(url.pathname) ? url.pathname :
    /^\/process\/[a-z0-9-]+\.(?:js|mjs|css)$/i.test(url.pathname) ? url.pathname : url.pathname.startsWith('/api/') ? 'other-api' : 'other-resource';
  const request = safely(req => {
    const url = new URL(req.url()); if (url.origin !== origin) return;
    if (rows.length >= 256) { dropped++; return; }
    const row = {path: path(url), method: ['GET', 'HEAD', 'POST'].includes(req.method()) ? req.method() : 'OTHER',
      startedMs: elapsed(), responseMs: null, finishedMs: null, status: null, failed: false, failureCode: null};
    entries.set(req, row); rows.push(row);
  });
  const response = safely(res => { const row = entries.get(res.request()); if (row) { row.status = res.status(); row.responseMs = elapsed(); } });
  const finished = safely(req => { const row = entries.get(req); if (row) row.finishedMs = elapsed(); });
  const failed = safely(req => { const row = entries.get(req); if (!row) return;
    const code = req.failure()?.errorText;
    row.failed = true; row.finishedMs = elapsed();
    row.failureCode = ['net::ERR_ABORTED', 'net::ERR_FAILED', 'net::ERR_CONNECTION_REFUSED', 'net::ERR_CONNECTION_RESET', 'net::ERR_TIMED_OUT'].includes(code) ? code : 'OTHER';
  });
  const consoleEvent = safely(message => {
    const raw = message.type(), type = ['error', 'warning', 'warn', 'log', 'info', 'debug'].includes(raw) ? raw : 'other';
    consoleCounts[type] = (consoleCounts[type] || 0) + 1;
    if (message.text().startsWith('共用資料服務無法連線')) sharedLoadWarning = true;
  });
  const listeners = {request, response, requestfinished: finished, requestfailed: failed, console: consoleEvent};
  for (const [name, listener] of Object.entries(listeners)) page.on(name, listener);
  const snapshot = () => ({stopped, elapsedMs: stoppedAt ?? elapsed(), dropped, observationErrors, sharedLoadWarning, consoleCounts: {...consoleCounts},
    requests: rows.map(row => ({...row})), pending: rows.filter(row => row.finishedMs === null).length});
  return {snapshot, stop() { if (!stopped) { stoppedAt = elapsed(); stopped = true; for (const [name, listener] of Object.entries(listeners)) page.off(name, listener); } return snapshot(); }};
}
export async function fqcFixtureRevisionDiagnostic(db, timeoutMs = 2000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => db.prepare('SELECT revision FROM shared_state WHERE id=1').first()).then(row =>
        Number.isSafeInteger(row?.revision) && row.revision >= 0 ? {status: 'available', revision: row.revision} : {status: 'malformed'}, () => ({status: 'rejected'})),
      new Promise(resolve => { timer = setTimeout(() => resolve({status: 'timeout'}), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Serialized probes only inspect genuine rendered controls/current public model.
export function fqcShellReady({actor, view}) {
  return window.ProcessSync?.identity?.id === actor && window.ProcessSync?.destination?.view === view &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot');
}
export function fqcEditorReady({actor, status = null, pendingId = null, savedId = null}) {
  const sync = window.ProcessSync, api = window.FQCMasterUI, c = api?.control?.libraries?.fqc;
  const host = document.querySelector('#data-content'), select = host?.querySelector('#fqc-version');
  const v = c?.versions?.find(row => row.id === select?.value), flow = c?.workflow;
  return sync?.identity?.id === actor && sync.destination?.view === 'data' &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot') &&
    host?.isConnected === true && host.dataset.activeTab === 'quality-fqc' && !!host.querySelector('#fqc-page') &&
    !host.querySelector('#fqc-load-retry') && api.navigation.error() === null && flow?.scope === 'fqc' &&
    !!v && (status === null || v.status === status) && (pendingId === null || flow.pendingId === pendingId && v.id === pendingId) &&
    (savedId === null || flow.saved?.id === savedId);
}
export function fqcPendingReady({actor, savedId, generation}) {
  const sync = window.ProcessSync, c = window.FQCMasterUI?.control?.libraries?.fqc, flow = c?.workflow;
  const host = document.querySelector('#data-content'), select = host?.querySelector('#fqc-version');
  const pending = flow?.cases?.find(row => row.id === flow.pendingId);
  const version = c?.versions?.find(row => row.id === select?.value);
  const withdraw = host?.querySelectorAll('#fqc-withdraw');
  return sync?.identity?.id === actor && sync.destination?.view === 'data' && host?.dataset.activeTab === 'quality-fqc' &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && flow?.scope === 'fqc' && flow.generation === generation &&
    typeof flow.pendingId === 'string' && !!flow.pendingId && version?.id === flow.pendingId && version.status === 'pending' &&
    flow.saved?.id === savedId && pending?.savedId === savedId && pending.status === 'pending' &&
    host.querySelectorAll('#fqc-save,#fqc-submit,[data-edit-item],[data-edit-error],#fqc-add-item,#fqc-add-error').length === 0 &&
    withdraw?.length === 1 && !withdraw[0].disabled && withdraw[0].getClientRects().length > 0;
}
export function fqcReviewReady({actor, pendingId, generation}) {
  const sync = window.ProcessSync, c = window.FQCMasterUI?.control?.libraries?.fqc, f = c?.workflow;
  const tabs = document.querySelectorAll('[data-review-tab="quality"]'), panel = document.querySelector('#approval-panel-quality');
  const row = f?.cases?.find(item => item.id === pendingId), button = panel?.querySelectorAll('[data-quality-review="' + pendingId + '"]');
  const modules = panel?.querySelectorAll('details[data-review-module="fqc"]'), wrapper = modules?.[0];
  return sync?.identity?.id === actor && sync.destination?.view === 'approval' &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot') &&
    tabs.length === 1 && tabs[0].getAttribute('aria-selected') === 'true' && !tabs[0].disabled &&
    panel?.hidden === false && panel.getClientRects().length > 0 &&
    modules?.length === 1 && wrapper.open === true &&
    wrapper.querySelector('[data-quality-review-state="ready"]') !== null && !panel.querySelector('#fqc-review-retry') &&
    button?.length === 1 && wrapper.contains(button[0]) && !button[0].disabled && button[0].getClientRects().length > 0 &&
    f?.scope === 'fqc' && f.generation === generation && f.pendingId === pendingId && row?.status === 'pending' && row.savedId === f.saved?.id;
}
export function fqcPageDiagnostic({actor, view}) {
  const sync = window.ProcessSync, c = window.FQCMasterUI?.control?.libraries?.fqc, flow = c?.workflow;
  const host = document.querySelector('#data-content'), select = host?.querySelector('#fqc-version');
  const panel = document.querySelector('#approval-panel-quality'), tabs = document.querySelectorAll('[data-review-tab="quality"]');
  const modules = panel?.querySelectorAll('details[data-review-module="fqc"]');
  return {path: location.pathname, expectedView: view, identityMatches: sync?.identity?.id === actor,
    actualView: sync?.destination?.view ?? null, navigationStatus: document.documentElement.dataset.processNavigationStatus ?? null,
    bootPresent: !!document.querySelector('#process-boot'), bootRole: document.querySelector('#process-boot')?.getAttribute('role') === 'alert' ? 'alert' : 'status-or-absent',
    syncPresent: !!sync, syncStatus: ['loading', 'ready', 'synced', 'offline', 'readonly', 'saving'].includes(sync?.status) ? sync.status : 'other-or-absent',
    syncLoadError: !!sync?.loadError, syncExpired: sync?.expired === true, syncLoginRequired: sync?.loginRequired === true, syncImportPending: sync?.importPending === true,
    syncBootstrapping: sync?.bootstrapping === true, activeTab: host?.dataset.activeTab ?? null,
    fqcPagePresent: !!host?.querySelector('#fqc-page'), loadErrorPresent: !!document.querySelector('#fqc-load-retry,#fqc-review-retry'),
    selectedStatus: c?.versions?.find(row => row.id === select?.value)?.status ?? null,
    qualityTabCount: tabs.length, qualityTabSelected: tabs.length === 1 && tabs[0].getAttribute('aria-selected') === 'true',
    panelPresent: !!panel, panelHidden: panel?.hidden ?? null, fqcModuleCount: modules?.length ?? 0,
    fqcModuleOpen: modules?.length === 1 ? modules[0].open === true : null, flowScope: flow?.scope ?? null,
    flowRevision: flow?.revision ?? null, pending: typeof flow?.pendingId === 'string',
    formCount: document.querySelectorAll('.fqc-modal-form').length, confirmCount: document.querySelectorAll('.vd-confirm[open]').length};
}
const requireVisible = async (page, selector) => {
  const control = page.locator(selector); await control.waitFor({state: 'visible'});
  assert.equal(await control.count(), 1, 'Mandatory unique control: ' + selector);
  assert.equal(await control.isEnabled(), true, 'Mandatory enabled control: ' + selector);
  return control;
};
const waitEnabled = (page, selector) => page.waitForFunction(selector => {
  const nodes = document.querySelectorAll(selector); return nodes.length === 1 && !nodes[0].disabled && nodes[0].getClientRects().length > 0;
}, selector);
const idle = page => page.waitForFunction(() => { const s = window.sharedDraftAccountState?.(); return s && s.queued === 0 && !s.unknown && !s.failed; });

export async function runFqcDraftBrowser() {
  assert.equal(process.env.CI, 'true', 'Native FQC acceptance requires the authorized CI capability, not a local browser bypass');
  const {chromium} = await import('playwright');
  const {createRootEntryFixture} = await import('./root-entry-native-fixture.mjs');
  const secret = randomBytes(32).toString('hex');
  const report = {status: 'RUNNING', layer: 'CI_SYNTHETIC_BROWSER', module: 'fqc', programCommit: process.env.PROCESS_PROGRAM_COMMIT,
    realData: false, realCredentials: false, samples: [], summary: [], cycles: [], pageErrors: [],
    boundary: 'Mandatory genuine DOM click through usable UI plus two frames; text entry and authoritative DB checks excluded. Draft selection includes automation selectOption after its real select click. API window includes background requests. No FQC HTTP error is implicitly ignored.',
    storageConditions: {perCycle: 'reset shared_state row and fresh contexts', reusedAcrossCycles: 'same nonpersistent compiled Worker and R2 bucket; prior immutable objects retained', cacheClassification: 'not classified cold/warm'},
    limitations: ['Synthetic desktop CI, not employee site, physical mobile or live HTTPS.', 'No before/after timing baseline or guarantee of <1000ms.', 'Includes ready polling/IPC and two-frame observation; not isolated CPU.', 'Does not reuse the prior process/canvas 90 samples.', 'Import/export, deletion, history restore, photo upload and equipment picker subflows remain separately listed, not implicitly covered by scalar forms.', 'No new matrix UI approval is implied by these unchanged-control scenarios.']};
  let fixture, browser, stage = 'fixture'; const contexts = new Set(), pages = [];
  try {
    fixture = await createRootEntryFixture({syntheticBindings: {PROCESS_IMPORT_ENABLED: '0', PROCESS_OWNER_BOOTSTRAP_ENABLED: '0', PROCESS_SESSION_SECRET: secret, PROCESS_SESSION_REVOCATION_ENABLED: '1', DEMO_LOGIN_ENABLED: 'false'}});
    const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const load = createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE: bucket});
    const records = load('lib/state-records.ts'), origin = fixture.url.origin;
    assert.equal(fixture.url.hostname, '127.0.0.1'); browser = await chromium.launch({headless: true}); report.buildEntrySha256 = fixture.buildEntrySha256;
    for (let cycle = 1; cycle <= REQUIRED_SAMPLES; cycle++) {
      stage = 'seed-' + cycle; assert.equal(contexts.size, 0);
      const seed = buildFqcDraftLifecycleSeed(load('lib/shared-draft.ts').createSharedDraft, {cycle});
      const raw = await records.encodeRecordValues(bucket, seed.values);
      await fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw, 'synthetic FQC lifecycle').run();
      const readValues = async () => {
        const row = await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
        return (await records.decodeRecordValues(bucket, JSON.parse(row.values))).values;
      };
      const control = async () => JSON.parse((await readValues()).qualityMasterControl).libraries.fqc;
      const forms = {errorName: 'Edited synthetic error ' + cycle, newErrorName: 'Created synthetic error ' + cycle,
        itemName: 'Edited synthetic item ' + cycle, newItemName: 'Created synthetic item ' + cycle, description: 'Synthetic instruction ' + cycle};
      async function open(actor, view, label, expected = {}) {
        stage = cycle + ':' + label + ':shell';
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1365, height: 900}}); contexts.add(context);
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          return url.origin === origin && (['GET', 'HEAD'].includes(req.method()) || req.method() === 'POST' && url.pathname === '/api/fqc/workflow') ? route.continue() : route.abort();
        });
        const payload = Buffer.from(JSON.stringify({version: 2, id: actor.id, sessionType: 'platform', authEpoch: 1, expires: Date.now() + 600000, nonce: 'fqc-lifecycle-' + cycle + '-' + actor.id})).toString('base64');
        await context.addCookies([{name: 'process_demo', value: payload + '.' + createHmac('sha256', secret).update(payload).digest('hex'), url: origin, httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        const setup = observeFqcSetup(page, origin); pages.push({page, actor: actor.id, view, label, setup});
        page.on('pageerror', error => report.pageErrors.push({stage, name: error.name}));
        page.on('dialog', dialog => { report.pageErrors.push({stage, name: 'UnexpectedNativeDialog', type: dialog.type()}); void dialog.dismiss(); });
        await page.goto(origin + '/process/index.html?view=' + view + (view === 'data' ? '&dataTab=quality-fqc' : ''), {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(fqcShellReady, {view, actor: actor.id});
        if (view === 'approval') {
          stage = cycle + ':' + label + ':quality-tab'; await (await requireVisible(page, '[data-review-tab="quality"]')).click();
          // The overview deliberately keeps pending modules collapsed. Follow
          // the user's real card navigation; setup is not a timed action sample.
          stage = cycle + ':' + label + ':quality-fqc-open'; await (await requireVisible(page, '[data-review-jump="fqc"]')).click();
          stage = cycle + ':' + label + ':quality-ready'; await page.waitForFunction(fqcReviewReady, {actor: actor.id, ...expected});
          await requireVisible(page, '[data-quality-review="' + expected.pendingId + '"]');
        } else {
          stage = cycle + ':' + label + ':fqc-ready'; await page.waitForFunction(fqcEditorReady, {actor: actor.id});
        }
        await idle(page); setup.stop(); return {context, page};
      }
      const reader = await open(seed.actors.reader, 'data', 'reader-entry');
      assert.equal(await reader.page.locator('#fqc-begin,#fqc-save,#fqc-submit,#fqc-withdraw,#fqc-add-item,#fqc-add-error,[data-edit-item],[data-edit-error]').count(), 0, 'Read-only account has no mutable workflow/form controls');
      const readerGrants = await reader.page.evaluate(() => Object.fromEntries(['view', 'edit', 'create', 'delete', 'save', 'submit', 'withdraw', 'approve', 'return'].map(op => [op, window.hasPermission('fqc.' + op)])));
      assert.deepEqual(readerGrants, {view: true, edit: false, create: false, delete: false, save: false, submit: false, withdraw: false, approve: false, return: false});
      assert.deepEqual((await control()).workflow.working, seed.initialContent);
      await reader.context.close(); contexts.delete(reader.context);
      let editor = await open(seed.actors.editor, 'data', 'editor-entry');
      async function measure(page, action, selector, ready, verify, expectedPost) {
        stage = cycle + ':' + action; await waitEnabled(page, selector);
        return measureAction({page, origin, action, cycle, selector, ready, verify, expectedPost, samples: report.samples});
      }
      const assertDraft = async () => {
        await editor.page.waitForFunction(fqcEditorReady, {actor: seed.actors.editor.id, status: 'draft'}); await idle(editor.page);
      };
      await measure(editor.page, 'begin', '#fqc-begin', assertDraft, async () => {
        const c = await control(); assert.equal(c.versions.filter(v => v.status === 'draft').length, 1); assert.equal(c.workflow.pendingId, null);
      }, 1);
      async function formOpen(action, selector) {
        const before = await control();
        await measure(editor.page, action, selector, async () => { await requireVisible(editor.page, formSubmit); }, async () => assert.deepEqual(await control(), before), 0);
      }
      async function applyForm(action, verify) {
        await measure(editor.page, action, formSubmit, async () => { await editor.page.locator('.fqc-modal-overlay').waitFor({state: 'detached'}); await assertDraft(); }, verify, 1);
      }
      await formOpen('error-edit-open', '[data-edit-error="' + seed.ids.error + '"]');
      await editor.page.locator(formSelector + ' [name="name"]').fill(forms.errorName);
      await applyForm('error-edit-apply', async () => { const c = await control(); assert.equal(c.workflow.working.errors.find(x => x.id === seed.ids.error).name, forms.errorName); assert.equal(c.workflow.saved, null); });
      await formOpen('error-new-open', '#fqc-add-error');
      await editor.page.locator(formSelector + ' [name="name"]').fill(forms.newErrorName);
      await applyForm('error-new-apply', async () => { const c = await control(); assert.equal(c.workflow.working.errors.length, seed.initialContent.errors.length + 1); assert.equal(c.workflow.working.errors.filter(x => x.name === forms.newErrorName).length, 1); });
      await formOpen('error-cancel-open', '[data-edit-error="' + seed.ids.error + '"]');
      await editor.page.locator(formSelector + ' [name="name"]').fill('Cancelled synthetic error');
      const beforeCancelError = await control();
      await measure(editor.page, 'error-cancel', formCancel, () => editor.page.locator('.fqc-modal-overlay').waitFor({state: 'detached'}), async () => assert.deepEqual(await control(), beforeCancelError), 0);
      await formOpen('item-edit-open', '[data-edit-item="' + seed.ids.item + '"]');
      const edit = editor.page.locator(formSelector);
      await edit.locator('[name="name"]').fill(forms.itemName); await edit.locator('[name="description"]').fill(forms.description);
      await edit.locator('[name="ruleCadence"]').selectOption('batch'); await edit.locator('[name="batchKind"]').selectOption('fixed_count'); await edit.locator('[name="fixedCount"]').fill('1');
      await edit.locator('[name="product"][value="' + seed.ids.product + '"]').check();
      await applyForm('item-edit-apply', async () => { const c = await control(), item = c.workflow.working.items.find(x => x.id === seed.ids.item);
        assert.equal(item.name, forms.itemName); assert.equal(item.description, forms.description); assert.deepEqual(item.productCodes, [seed.ids.product]); assert.equal(item.rule.cadence, 'batch'); assert.equal(item.rule.fixedCount, 1); });
      await formOpen('item-new-open', '#fqc-add-item');
      const add = editor.page.locator(formSelector);
      await add.locator('[name="name"]').fill(forms.newItemName); await add.locator('[name="description"]').fill('Synthetic new instruction');
      await add.locator('[name="ruleCadence"]').selectOption('batch'); await add.locator('[name="batchKind"]').selectOption('fixed_count'); await add.locator('[name="fixedCount"]').fill('1');
      await add.locator('[name="product"][value="' + seed.ids.product2 + '"]').check();
      await applyForm('item-new-apply', async () => { const c = await control(); assert.equal(c.workflow.working.items.length, seed.initialContent.items.length + 1); assert.equal(c.workflow.working.items.filter(x => x.name === forms.newItemName).length, 1); });
      await formOpen('item-cancel-open', '[data-edit-item="' + seed.ids.item + '"]');
      await editor.page.locator(formSelector + ' [name="description"]').fill('Cancelled synthetic instruction'); const beforeCancelItem = await control();
      await measure(editor.page, 'item-cancel', formCancel, () => editor.page.locator('.fqc-modal-overlay').waitFor({state: 'detached'}), async () => assert.deepEqual(await control(), beforeCancelItem), 0);
      const cell = '[data-matrix-item="' + seed.ids.item + '"][data-matrix-product="' + seed.ids.product2 + '"]';
      // Current UI starts expanded. Do not force a model/DOM state to bypass a
      // broken visibility contract; each matrix cell below must really be usable.
      const matrix = editor.page.locator('.fqc-matrix'); assert.equal(await matrix.evaluate(node => node.open), true);
      const beforeMatrix = await control();
      const matrixChoice = async action => measure(editor.page, action, cell, async () => {
        assert.equal(await editor.page.locator(cell).getAttribute('aria-pressed'), 'true'); await waitEnabled(editor.page, '#fqc-matrix-apply');
        assert.equal(await editor.page.evaluate(() => window.FQCMasterUI.navigation.hasLocalChanges()), true);
      }, async () => assert.deepEqual(await control(), beforeMatrix), 0);
      await matrixChoice('matrix-discard-choice');
      await measure(editor.page, 'matrix-discard', '#fqc-matrix-discard', async () => {
        assert.equal(await editor.page.locator(cell).getAttribute('aria-pressed'), 'false');
        assert.equal(await editor.page.evaluate(() => window.FQCMasterUI.navigation.hasLocalChanges()), false);
      }, async () => assert.deepEqual(await control(), beforeMatrix), 0);
      await matrixChoice('matrix-choice');
      await measure(editor.page, 'matrix-apply', '#fqc-matrix-apply', async () => {
        await editor.page.waitForFunction(() => !window.FQCMasterUI.navigation.hasLocalChanges()); await idle(editor.page);
        assert.equal(await editor.page.locator(cell).getAttribute('aria-pressed'), 'true');
      }, async () => { const c = await control(); assert.deepEqual(c.workflow.working.items.find(x => x.id === seed.ids.item).productCodes, [seed.ids.product, seed.ids.product2]); assert.equal(c.workflow.saved, null); }, 1);
      await measure(editor.page, 'save', '#fqc-save', assertDraft, async () => {
        const c = await control(); assert(c.workflow.saved?.id); assert.deepEqual(c.workflow.saved.content, c.workflow.working);
      }, 1);
      // Actual persisted readback uses a fresh authenticated page/context. It is
      // a correctness checkpoint, not mislabeled same-document click timing.
      const saved = (await control()).workflow.saved;
      await editor.context.close(); contexts.delete(editor.context); editor = await open(seed.actors.editor, 'data', 'saved-readback');
      assert.deepEqual(await editor.page.evaluate(flowOf).then(flow => flow.saved.content), saved.content);
      const draftId = (await control()).versions.find(v => v.status === 'draft').id;
      await editor.page.locator('#fqc-version').selectOption(seed.ids.active);
      await editor.page.waitForFunction(({id}) => document.querySelector('#fqc-version')?.value === id && !document.querySelector('#fqc-save'), {id: seed.ids.active});
      await measure(editor.page, 'read-saved-draft', '#fqc-version', async () => {
        await editor.page.locator('#fqc-version').selectOption(draftId); await assertDraft();
        assert.deepEqual(await editor.page.evaluate(flowOf).then(flow => flow.saved.content), saved.content);
      }, async () => assert.deepEqual((await control()).workflow.saved, saved), 0);
      async function submit(prefix) {
        const before = (await control()).workflow;
        await measure(editor.page, prefix + '-open', '#fqc-submit', async () => {
          await editor.page.locator('.vd-confirm[open] [data-submit-snapshot]').waitFor();
          assert((await editor.page.locator('.vd-confirm .vd-snapshot-id').innerText()).includes(before.saved.id));
        }, async () => assert.equal((await control()).workflow.pendingId, null), 0);
        await editor.page.locator('.vd-confirm[open] textarea').fill('Synthetic FQC ' + prefix);
        await measure(editor.page, prefix + '-confirm', confirmSelector, async () => {
          await editor.page.locator('.vd-confirm').waitFor({state: 'detached'});
          await editor.page.waitForFunction(fqcPendingReady, {actor: seed.actors.editor.id, generation: before.generation, savedId: before.saved.id}); await idle(editor.page);
        }, async () => { const f = (await control()).workflow, row = f.cases.find(x => x.id === f.pendingId);
          assert.equal(row.status, 'pending'); assert.equal(row.savedId, before.saved.id); assert.deepEqual(row.content, before.saved.content);
          assert.deepEqual(row.contentIssues?.issues || [], seed.expectedContentIssues);
        }, 1);
      }
      await submit('submit'); const firstPending = (await control()).workflow.pendingId;
      await measure(editor.page, 'withdraw-open', '#fqc-withdraw', () => editor.page.locator('.vd-confirm[open]').waitFor(), async () => assert.equal((await control()).workflow.pendingId, firstPending), 0);
      await editor.page.locator('.vd-confirm[open] textarea').fill('Synthetic FQC withdraw');
      await measure(editor.page, 'withdraw-confirm', confirmSelector, async () => { await editor.page.locator('.vd-confirm').waitFor({state: 'detached'}); await assertDraft(); }, async () => {
        const f = (await control()).workflow; assert.equal(f.pendingId, null); assert.equal(f.cases.find(x => x.id === firstPending).status, 'withdrawn'); assert.deepEqual(f.saved.content, saved.content);
      }, 1);
      await submit('resubmit');
      async function review(kind) {
        const expected = (await control()).workflow, id = expected.pendingId;
        const reviewer = await open(seed.actors.reviewer, 'approval', 'review-' + kind + '-entry', {pendingId: id, generation: expected.generation});
        await measure(reviewer.page, 'review-' + kind + '-select', '[data-quality-review="' + id + '"]', async () => {
          await requireVisible(reviewer.page, kind === 'approve' ? '#quality-approve' : '#quality-reject');
          assert.equal(await reviewer.page.locator('#quality-withdraw').count(), 0, 'Reviewer has no editor withdraw grant');
        }, async () => assert.equal((await control()).workflow.pendingId, id), 0);
        await measure(reviewer.page, kind + '-open', kind === 'approve' ? '#quality-approve' : '#quality-reject', () => reviewer.page.locator('.vd-confirm[open]').waitFor(), async () => assert.equal((await control()).workflow.pendingId, id), 0);
        assert.equal(await reviewer.page.locator('.vd-confirm .vd-self-review').count(), 0);
        await reviewer.page.locator('.vd-confirm[open] textarea').fill('Synthetic FQC ' + kind);
        await measure(reviewer.page, kind + '-confirm', confirmSelector, async () => {
          await reviewer.page.locator('.vd-confirm').waitFor({state: 'detached'});
          await reviewer.page.waitForFunction(() => window.FQCMasterUI.control.libraries.fqc.workflow.pendingId === null); await idle(reviewer.page);
          assert.equal(await reviewer.page.locator('#quality-approve,#quality-reject').count(), 0);
        }, async () => { const c = await control(), row = c.workflow.cases.find(x => x.id === id);
          assert.equal(c.workflow.pendingId, null); assert.equal(row.status, kind === 'approve' ? 'approved' : 'returned'); assert.equal(row.result.actor.id, seed.actors.reviewer.id);
          if (kind === 'approve') assert.deepEqual(c.versions.find(x => x.id === c.activeVersionId).snapshot, saved.content);
        }, 1);
        await reviewer.context.close(); contexts.delete(reviewer.context);
      }
      await review('return'); await editor.context.close(); contexts.delete(editor.context);
      editor = await open(seed.actors.editor, 'data', 'returned-editor-entry'); await submit('returned-submit'); await review('approve');
      const finalValues = await readValues();
      for (const key of Object.keys(seed.values).filter(key => key !== 'qualityMasterControl')) assert.equal(finalValues[key], seed.values[key], 'Unrelated scope preserved: ' + key);
      const finalQuality = JSON.parse(finalValues.qualityMasterControl), initialQuality = JSON.parse(seed.values.qualityMasterControl);
      for (const key of Object.keys(initialQuality.libraries).filter(key => key !== 'fqc')) assert.deepEqual(finalQuality.libraries[key], initialQuality.libraries[key]);
      assert.deepEqual(report.pageErrors, []);
      report.cycles.push({cycle, status: 'PASS', seedBytes: seed.seedBytes, contentBytes: seed.contentBytes, persistedSavedReadback: true, readOnlyUIVerified: true, cases: (await control()).workflow.cases.map(row => row.status)});
      await editor.context.close(); contexts.delete(editor.context);
    }
    report.summary = summarizeActions(report.samples, fqcBrowserActions); assert(report.summary.every(row => row.status === 'PASS_FUNCTION_MEASURED'));
    report.status = 'PASS_CI_SYNTHETIC_FQC_LIFECYCLE';
  } catch (error) {
    report.status = 'FAIL_CI_SYNTHETIC_FQC_LIFECYCLE'; report.failedStage = stage; report.pageDiagnostics = [];
    for (const item of pages.filter(item => !item.page.isClosed())) {
      try { report.pageDiagnostics.push({label: item.label, ...await item.page.evaluate(fqcPageDiagnostic, {actor: item.actor, view: item.view}), setupNetwork: item.setup.snapshot()}); }
      catch { report.pageDiagnostics.push({label: item.label, diagnosticUnavailable: true, setupNetwork: item.setup.snapshot()}); }
    }
    if (fixture) report.fixtureRevision = await fqcFixtureRevisionDiagnostic(fixture.db);
    report.failure = {name: error.name, message: String(error.message).replaceAll(secret, '[redacted]').slice(0, 500)};
    report.summary = summarizeActions(report.samples, fqcBrowserActions);
  } finally {
    for (const item of pages) item.setup.stop();
    for (const context of contexts) await context.close(); if (browser) await browser.close(); if (fixture) await fixture.close(); report.disposed = true;
  }
  fs.mkdirSync('.sites-runtime', {recursive: true}); fs.writeFileSync('.sites-runtime/fqc-draft-lifecycle-browser-result.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runFqcDraftBrowser(); process.exitCode = result.status.startsWith('PASS_') ? 0 : 1;
}
