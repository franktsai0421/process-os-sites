// CI-only native Chromium + compiled application. Each cycle resets its synthetic
// DB row and browser contexts; one owned nonpersistent Worker/R2 bucket is reused.
// Never run this file as a workaround for a denied local browser/socket capability.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildProcessDraftLifecycleSeed} from './process-draft-lifecycle-route-fixture.mjs';
import {measureAction, summarizeActions, REQUIRED_SAMPLES} from './draft-action-measurement.mjs';

export const processBrowserActions = Object.freeze([
  'begin', 'local-apply', 'sync-current-canvas', 'save', 'submit-open', 'submit-confirm',
  'withdraw-open', 'withdraw-confirm', 'resubmit-open', 'resubmit-confirm',
  'review-return-open', 'return-open', 'return-confirm',
  'returned-submit-open', 'returned-submit-confirm', 'review-approve-open', 'approve-open', 'approve-confirm',
]);
const mainSelector = action => '#authoring-v3-panel [data-av3="' + action + '"]';
const confirmSelector = '.vd-confirm[open] button[type="submit"]';
// Exact existing shared-client advisory; not a success notice or an ACL grant.
export const noReviewerMessages = Object.freeze([
  '目前沒有其他已啟用的審核人，仍可送審。具審核權限者可經確認後自審。',
  'Hiện chưa có người duyệt khác đang hoạt động. Bạn vẫn có thể gửi duyệt. Người có quyền duyệt có thể tự duyệt sau khi xác nhận.',
]);
export function expectedSubmitNotice({cycle, stage, actorId, editorId, type, message, notices}) {
  return Number.isInteger(cycle) && cycle >= 1 && cycle <= REQUIRED_SAMPLES && actorId === editorId &&
    ['submit-confirm', 'resubmit-confirm', 'returned-submit-confirm'].some(action => stage === cycle + ':' + action) &&
    type === 'alert' && noReviewerMessages.includes(message) && !notices.some(row => row.stage === stage);
}
export function assertSubmitNotice(notices, stage) {
  assert.equal(notices.filter(row => row.stage === stage).length, 1, 'This seeded legacy advisory must occur exactly once for this Submit');
}
// Serialized into the browser: require the pending case, fixed Save and locked
// visible view together. The production mount removes Save/Submit when pending.
export function pendingProcessUIReady({savedId, generation}) {
  const api = window.ProcessAuthoringV3, flow = api?.flow(), id = flow?.pendingId;
  const pending = flow?.cases?.find(row => row.id === id), panel = document.querySelector('#authoring-v3-panel');
  const page = document.querySelector('.editor-page'), select = panel?.querySelector('#authoring-version-choice');
  const writes = panel?.querySelectorAll('[data-av3="save"],[data-av3="submit"]');
  const withdraw = panel?.querySelectorAll('[data-av3="withdraw"]');
  return typeof id === 'string' && !!id && flow.scope === 'process:platform' && flow.generation === generation &&
    flow.saved?.id === savedId && pending?.status === 'pending' && pending.savedId === savedId && select?.value === id &&
    page?.classList.contains('editor-readonly') === true && page.classList.contains('editor-submitted-lock') &&
    api.canMutate() === false && api.canEditLocalCanvas() === false && writes?.length === 0 && withdraw?.length === 1 &&
    !withdraw[0].disabled && withdraw[0].getClientRects().length > 0;
}
// Serialized browser probes expose only identity equality and bounded state metadata.
export function processShellReady({view, actor}) {
  return window.ProcessSync?.identity?.id === actor && window.ProcessSync?.destination?.view === view &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot');
}
export function reviewerProcessUIReady({actor, pendingId, generation}) {
  const sync = window.ProcessSync, api = window.ProcessAuthoringV3, flow = api?.flow();
  const tab = document.querySelectorAll('[data-review-tab="process"]'), panel = document.querySelector('#approval-panel-process');
  const reviews = panel?.querySelectorAll('[data-process-review="view"]'), row = flow?.cases?.find(item => item.id === pendingId);
  return sync?.identity?.id === actor && sync.destination?.view === 'approval' &&
    document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot') &&
    tab.length === 1 && tab[0].getAttribute('aria-selected') === 'true' && !tab[0].disabled &&
    panel?.hidden === false && panel.getClientRects().length > 0 && reviews?.length === 1 &&
    !reviews[0].disabled && reviews[0].getClientRects().length > 0 && flow?.scope === 'process:platform' &&
    flow.generation === generation && flow.pendingId === pendingId && row?.status === 'pending' &&
    !!flow.saved?.id && row.savedId === flow.saved.id && api.canMutate() === false && api.canEditLocalCanvas() === false;
}
export function processPageDiagnostic({view, actor, pendingId = null}) {
  const sync = window.ProcessSync, flow = window.ProcessAuthoringV3?.flow(), url = new URL(location.href);
  const tab = document.querySelectorAll('[data-review-tab="process"]'), panel = document.querySelector('#approval-panel-process');
  return {path: url.pathname, requestedView: url.searchParams.get('view'), requestedApprovalTab: url.searchParams.get('approvalTab'),
    expectedView: view, identityMatches: sync?.identity?.id === actor, actualView: sync?.destination?.view ?? null,
    navigationStatus: document.documentElement.dataset.processNavigationStatus ?? null,
    destinationGeneration: document.documentElement.dataset.processDestinationGeneration ?? null,
    readyGeneration: document.documentElement.dataset.processDestinationReadyGeneration ?? null,
    bootPresent: !!document.querySelector('#process-boot'), processTabCount: tab.length,
    processTabSelected: tab.length === 1 && tab[0].getAttribute('aria-selected') === 'true',
    processPanelPresent: !!panel, processPanelHidden: panel?.hidden ?? null,
    reviewButtonCount: panel?.querySelectorAll('[data-process-review="view"]').length ?? 0,
    flowPresent: !!flow, flowScope: flow?.scope ?? null, flowRevision: flow?.revision ?? null,
    expectedPendingMatches: pendingId === null ? null : flow?.pendingId === pendingId,
    pendingCaseStatus: flow?.cases?.find(row => row.id === pendingId)?.status ?? null};
}
const requireVisible = async (page, selector) => {
  const control = page.locator(selector); await control.waitFor({state: 'visible'});
  assert.equal(await control.count(), 1, 'Mandatory unique control: ' + selector);
  assert.equal(await control.isEnabled(), true, 'Mandatory enabled control: ' + selector);
  return control;
};
const idle = page => page.waitForFunction(() => {
  const s = window.sharedDraftAccountState?.();
  return s && s.queued === 0 && !s.unknown && !s.failed;
});
const waitEnabled = (page, selector) => page.waitForFunction(selector => {
  const nodes = document.querySelectorAll(selector);
  return nodes.length === 1 && !nodes[0].disabled && nodes[0].getClientRects().length > 0;
}, selector);

export async function runProcessDraftBrowser() {
  assert.equal(process.env.CI, 'true', 'Native browser acceptance is prepared for authorized CI, not a local capability bypass');
  const {chromium} = await import('playwright');
  const {createRootEntryFixture} = await import('./root-entry-native-fixture.mjs');
  const secret = randomBytes(32).toString('hex');
  const report = {
    status: 'RUNNING', layer: 'CI_SYNTHETIC_BROWSER', programCommit: process.env.PROCESS_PROGRAM_COMMIT,
    realData: false, realCredentials: false, samples: [], summary: [], cycles: [], pageErrors: [],
    boundary: 'Real DOM click through asserted usable UI plus two frames; reason typing and authoritative fixture inspection excluded. Same-window API counts include background API requests, never imply exclusive command attribution.',
    storageConditions: {perCycle: 'reset shared_state row and new browser contexts', reusedAcrossCycles: 'same owned nonpersistent Worker and R2 bucket; prior-cycle immutable objects retained', cacheClassification: 'not classified cold/warm; no cache reset claim'},
    limitations: ['Loopback compiled synthetic data, not live HTTPS or employee-site timing.', 'No baseline pairing and no guarantee of <1000ms.', 'UI duration includes automation ready polling/IPC and two-frame observation, not isolated product CPU.', 'First batch covers 18 explicit process action phases, not all 173 inventory rows.', 'History/restore, receipt fault UI, first-load/reload/navigation five-sample timings and other module adapters remain separate.', 'Reviewer entry explicitly clicks the process tab; approvalTab=process initial deep-link selection is not accepted as verified by this runner.'],
  };
  let fixture, browser, stage = 'fixture';
  const contexts = new Set(), pageContexts = [];
  try {
    fixture = await createRootEntryFixture({syntheticBindings: {PROCESS_IMPORT_ENABLED: '0', PROCESS_OWNER_BOOTSTRAP_ENABLED: '0', PROCESS_SESSION_SECRET: secret, PROCESS_SESSION_REVOCATION_ENABLED: '1', DEMO_LOGIN_ENABLED: 'false'}});
    const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const load = createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE: bucket});
    const records = load('lib/state-records.ts');
    const origin = fixture.url.origin;
    assert.equal(fixture.url.hostname, '127.0.0.1');
    browser = await chromium.launch({headless: true});
    report.buildEntrySha256 = fixture.buildEntrySha256;
    for (let cycle = 1; cycle <= REQUIRED_SAMPLES; cycle++) {
      stage = 'seed-' + cycle;
      assert.equal(contexts.size, 0, 'Close all old contexts before resetting this owned fixture');
      const seed = buildProcessDraftLifecycleSeed(load('lib/shared-draft.ts').createSharedDraft, {cycle});
      const raw = await records.encodeRecordValues(bucket, seed.values);
      await fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw, 'synthetic lifecycle').run();
      const readValues = async () => {
        const row = await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
        return (await records.decodeRecordValues(bucket, JSON.parse(row.values))).values;
      };
      const control = async () => JSON.parse((await readValues()).processAuthoringControl);
      const operation = content => content.workspaces.find(row => row.id === seed.ids.workspace).stages[seed.ids.stage].find(row => row.id === seed.ids.operation);
      const nativeConfirmations = [], nativeNotices = [];
      async function open(actor, view, label, expected = {}) {
        stage = cycle + ':' + label + ':shell';
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1365, height: 900}}); contexts.add(context);
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          const allowed = url.origin === origin && (['GET', 'HEAD'].includes(req.method()) || req.method() === 'POST' && url.pathname === '/api/process-authoring/workflow');
          return allowed ? route.continue() : route.abort();
        });
        const payload = Buffer.from(JSON.stringify({version: 2, id: actor.id, sessionType: 'platform', authEpoch: 1, expires: Date.now() + 600000, nonce: 'lifecycle-' + cycle + '-' + actor.id})).toString('base64');
        await context.addCookies([{name: 'process_demo', value: payload + '.' + createHmac('sha256', secret).update(payload).digest('hex'), url: origin, httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        pageContexts.push({page, args: {view, actor: actor.id, pendingId: expected.pendingId ?? null}, label});
        page.on('pageerror', error => report.pageErrors.push({stage, name: error.name}));
        // Current source has a pinned false-positive endpoint advisory. This exact
        // scenario must take its real confirmation and the fixed submit advisory.
        // Wrong stage/actor/text/type or a duplicate notice still fails.
        page.on('dialog', dialog => {
          if (stage === cycle + ':approve-confirm' && actor.id === seed.actors.reviewer.id && seed.expectedContentIssues.length === 1 && dialog.type() === 'confirm' && /待補|cần bổ sung/.test(dialog.message())) {
            nativeConfirmations.push({cycle, action: 'approve-confirm', type: 'confirm', accepted: true}); void dialog.accept();
          } else if (expectedSubmitNotice({cycle, stage, actorId: actor.id, editorId: seed.actors.editor.id, type: dialog.type(), message: dialog.message(), notices: nativeNotices})) {
            nativeNotices.push({cycle, stage, type: 'alert', kind: 'NO_OTHER_LEGACY_REVIEWER_ADVISORY'}); void dialog.accept();
          } else { report.pageErrors.push({stage, name: 'UnexpectedNativeDialog', type: dialog.type(), message: dialog.message().replaceAll(secret, '[redacted]').slice(0, 500)}); void dialog.dismiss(); }
        });
        await page.goto(origin + '/process/index.html?view=' + view, {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(processShellReady, {view, actor: actor.id});
        if (view === 'approval') {
          stage = cycle + ':' + label + ':process-tab';
          // Mandatory real tab navigation, not a direct API command or an assumed deep link.
          await (await requireVisible(page, '[data-review-tab="process"]')).click();
          stage = cycle + ':' + label + ':process-ready';
          await page.waitForFunction(reviewerProcessUIReady, {actor: actor.id, ...expected});
        } else {
          stage = cycle + ':' + label + ':editor-ready';
          await page.waitForFunction(() => !!window.ProcessAuthoringV3?.flow());
        }
        await idle(page);
        return {context, page};
      }
      let editor = await open(seed.actors.editor, 'editor', 'editor-entry');
      const changedName = 'Synthetic completed cycle ' + cycle;
      async function measure(page, action, selector, ready, verify, expectedPost) {
        stage = cycle + ':' + action;
        await waitEnabled(page, selector);
        return measureAction({page, origin, action, cycle, selector, ready, verify, expectedPost, samples: report.samples});
      }
      await measure(editor.page, 'begin', mainSelector('begin'), async () => {
        await waitEnabled(editor.page, mainSelector('save')); await idle(editor.page);
      }, async () => {
        const c = await control(); assert.equal(c.versions.filter(row => row.status === 'draft').length, 1); assert.equal(c.workflow.pendingId, null);
      }, 1);
      const sharedBeforeLocal = await control();
      await (await requireVisible(editor.page, '.pe-card[data-node="' + seed.ids.operation + '"] [data-pe="edit"]')).click();
      await editor.page.locator('#process-operation-dialog[open] [data-field="name"]').fill(changedName);
      await measure(editor.page, 'local-apply', '#apply-operation', async () => {
        await editor.page.locator('#process-operation-dialog').waitFor({state: 'detached'});
        await editor.page.waitForFunction(() => window.ProcessCanvasLocal?.dirty() === true);
        assert.equal(await editor.page.locator('.pe-card[data-node="' + seed.ids.operation + '"] h3').innerText(), changedName);
      }, async () => assert.deepEqual(await control(), sharedBeforeLocal), 0);
      await measure(editor.page, 'sync-current-canvas', '.pe-editor [data-pe="sync"]', async () => {
        await editor.page.waitForFunction(() => window.ProcessCanvasLocal?.dirty() === false); await idle(editor.page);
      }, async () => {
        const c = await control(); assert.equal(operation(c.workflow.working).name, changedName); assert.deepEqual(c.workflow.saved, sharedBeforeLocal.workflow.saved);
      }, 1);
      await measure(editor.page, 'save', mainSelector('save'), async () => {
        await waitEnabled(editor.page, mainSelector('submit')); await idle(editor.page);
      }, async () => {
        const c = await control(); assert(c.workflow.saved?.id); assert.deepEqual(c.workflow.saved.content, c.workflow.working); assert.equal(operation(c.workflow.saved.content).name, changedName);
      }, 1);
      async function submit(prefix) {
        const before = (await control()).workflow, saved = before.saved;
        await measure(editor.page, prefix + '-open', mainSelector('submit'), async () => {
          await editor.page.locator('.vd-confirm[open] [data-submit-snapshot]').waitFor();
          assert((await editor.page.locator('.vd-confirm .vd-snapshot-id').innerText()).includes(saved.id));
        }, async () => assert.equal((await control()).workflow.pendingId, null), 0);
        await editor.page.locator('.vd-confirm[open] textarea').fill('Synthetic lifecycle ' + prefix);
        await measure(editor.page, prefix + '-confirm', confirmSelector, async () => {
          await editor.page.locator('.vd-confirm').waitFor({state: 'detached'});
          await editor.page.waitForFunction(pendingProcessUIReady, {savedId: saved.id, generation: before.generation}); await idle(editor.page);
        }, async () => {
          assertSubmitNotice(nativeNotices, cycle + ':' + prefix + '-confirm');
          const c = await control(), pending = c.workflow.cases.find(row => row.id === c.workflow.pendingId);
          assert(pending); assert.equal(pending.status, 'pending'); assert.equal(pending.savedId, saved.id); assert.deepEqual(pending.content, saved.content);
          assert.deepEqual(pending.contentIssues?.issues || [], seed.expectedContentIssues, 'Only the source-proven canonical endpoint advisory is accepted');
        }, 1);
      }
      await submit('submit');
      const withdrawn = (await control()).workflow.pendingId;
      await measure(editor.page, 'withdraw-open', mainSelector('withdraw'), () => editor.page.locator('.vd-confirm[open]').waitFor(), async () => assert.equal((await control()).workflow.pendingId, withdrawn), 0);
      await editor.page.locator('.vd-confirm[open] textarea').fill('Synthetic withdrawal');
      await measure(editor.page, 'withdraw-confirm', confirmSelector, async () => {
        await editor.page.locator('.vd-confirm').waitFor({state: 'detached'}); await waitEnabled(editor.page, mainSelector('submit')); await idle(editor.page);
      }, async () => {
        const c = await control(); assert.equal(c.workflow.pendingId, null); assert.equal(c.workflow.cases.find(row => row.id === withdrawn).status, 'withdrawn');
      }, 1);
      await submit('resubmit');
      async function review(kind) {
        const expected = (await control()).workflow, id = expected.pendingId;
        const reviewer = await open(seed.actors.reviewer, 'approval', 'review-' + kind + '-entry', {pendingId: id, generation: expected.generation});
        await measure(reviewer.page, 'review-' + kind + '-open', '[data-process-review="view"]', () => reviewer.page.locator('[data-history-review="' + kind + '"]').waitFor(), async () => assert.equal((await control()).workflow.pendingId, id), 0);
        await measure(reviewer.page, kind + '-open', '[data-history-review="' + kind + '"]', () => reviewer.page.locator('.vd-confirm[open]').waitFor(), async () => assert.equal((await control()).workflow.pendingId, id), 0);
        assert.equal(await reviewer.page.locator('.vd-confirm .vd-self-review').count(), 0, 'Distinct reviewer is not a self-review path');
        await reviewer.page.locator('.vd-confirm[open] textarea').fill('Synthetic ' + kind);
        await measure(reviewer.page, kind + '-confirm', confirmSelector, async () => {
          await reviewer.page.locator('.vd-confirm').waitFor({state: 'detached'});
          await reviewer.page.waitForFunction(() => window.ProcessAuthoringV3.flow()?.pendingId === null); await idle(reviewer.page);
        }, async () => {
          const c = await control(), row = c.workflow.cases.find(row => row.id === id);
          assert.equal(c.workflow.pendingId, null); assert.equal(row.status, kind === 'approve' ? 'approved' : 'returned');
          assert.equal(row.result.actor.id, seed.actors.reviewer.id);
          if (kind === 'approve') {
            assert.equal(operation(c.versions.find(row => row.id === c.activeVersionId).snapshot).name, changedName);
            assert.equal(nativeConfirmations.length, 1, 'Required advisory confirmation must actually occur once');
            assert.equal(row.result.contentIssuesConfirmed, true);
          }
        }, 1);
        await reviewer.context.close(); contexts.delete(reviewer.context);
      }
      await review('return');
      // Re-enter with a new UI read, not a programmatic product command or fake model.
      await editor.context.close(); contexts.delete(editor.context); editor = await open(seed.actors.editor, 'editor', 'returned-editor-entry');
      await submit('returned-submit'); await review('approve');
      const finalValues = await readValues();
      for (const key of Object.keys(seed.values).filter(key => key !== 'processAuthoringControl')) assert.equal(finalValues[key], seed.values[key], 'Unrelated scope preserved: ' + key);
      assert.deepEqual(report.pageErrors, []);
      assert.equal(nativeNotices.length, 3, 'Exactly the three explicit Submit actions show their legacy reviewer advisory');
      report.cycles.push({cycle, status: 'PASS', contentBytes: seed.contentBytes, seedBytes: seed.seedBytes, cases: (await control()).workflow.cases.map(row => row.status), nativeConfirmations, nativeNotices, expectedContentIssues: seed.expectedContentIssues});
      await editor.context.close(); contexts.delete(editor.context);
    }
    report.summary = summarizeActions(report.samples, processBrowserActions);
    assert(report.summary.every(row => row.status === 'PASS_FUNCTION_MEASURED'));
    report.status = 'PASS_CI_SYNTHETIC_PROCESS_LIFECYCLE';
  } catch (error) {
    report.status = 'FAIL_CI_SYNTHETIC_PROCESS_LIFECYCLE'; report.failedStage = stage;
    report.pageDiagnostics = [];
    for (const item of pageContexts.filter(item => !item.page.isClosed())) {
      try { report.pageDiagnostics.push({label: item.label, ...await item.page.evaluate(processPageDiagnostic, item.args)}); }
      catch { report.pageDiagnostics.push({label: item.label, diagnosticUnavailable: true}); }
    }
    report.failure = {name: error.name, message: String(error.message).replaceAll(secret, '[redacted]').slice(0, 500)};
    report.summary = summarizeActions(report.samples, processBrowserActions);
  } finally {
    for (const context of contexts) await context.close();
    if (browser) await browser.close(); if (fixture) await fixture.close();
    report.disposed = true;
  }
  fs.mkdirSync('.sites-runtime', {recursive: true});
  fs.writeFileSync('.sites-runtime/process-draft-lifecycle-browser-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProcessDraftBrowser();
  process.exitCode = result.status.startsWith('PASS_') ? 0 : 1;
}
