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
    limitations: ['Loopback compiled synthetic data, not live HTTPS or employee-site timing.', 'No baseline pairing and no guarantee of <1000ms.', 'UI duration includes automation ready polling/IPC and two-frame observation, not isolated product CPU.', 'First batch covers 18 explicit process action phases, not all 173 inventory rows.', 'History/restore, receipt fault UI, first-load/reload/navigation five-sample timings and other module adapters remain separate.'],
  };
  let fixture, browser, stage = 'fixture';
  const contexts = new Set();
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
      const nativeConfirmations = [];
      async function open(actor, view) {
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1365, height: 900}}); contexts.add(context);
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          const allowed = url.origin === origin && (['GET', 'HEAD'].includes(req.method()) || req.method() === 'POST' && url.pathname === '/api/process-authoring/workflow');
          return allowed ? route.continue() : route.abort();
        });
        const payload = Buffer.from(JSON.stringify({version: 2, id: actor.id, sessionType: 'platform', authEpoch: 1, expires: Date.now() + 600000, nonce: 'lifecycle-' + cycle + '-' + actor.id})).toString('base64');
        await context.addCookies([{name: 'process_demo', value: payload + '.' + createHmac('sha256', secret).update(payload).digest('hex'), url: origin, httpOnly: true, sameSite: 'Lax'}]);
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        page.on('pageerror', error => report.pageErrors.push({stage, name: error.name}));
        // Current source has a pinned false-positive endpoint advisory. This exact
        // scenario must take its real confirmation; every other native dialog fails.
        page.on('dialog', dialog => {
          if (stage === cycle + ':approve-confirm' && actor.id === seed.actors.reviewer.id && seed.expectedContentIssues.length === 1 && dialog.type() === 'confirm' && /待補|cần bổ sung/.test(dialog.message())) {
            nativeConfirmations.push({cycle, action: 'approve-confirm', type: 'confirm', accepted: true}); void dialog.accept();
          } else { report.pageErrors.push({stage, name: 'UnexpectedNativeDialog', type: dialog.type()}); void dialog.dismiss(); }
        });
        await page.goto(origin + '/process/index.html?view=' + view + (view === 'approval' ? '&approvalTab=process' : ''), {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(({view, actor}) => window.ProcessSync?.identity?.id === actor && window.ProcessSync?.destination?.view === view && document.documentElement.dataset.processNavigationStatus === 'ready' && !document.querySelector('#process-boot') && !!window.ProcessAuthoringV3?.flow(), {view, actor: actor.id});
        await idle(page);
        return {context, page};
      }
      let editor = await open(seed.actors.editor, 'editor');
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
        const saved = (await control()).workflow.saved;
        await measure(editor.page, prefix + '-open', mainSelector('submit'), async () => {
          await editor.page.locator('.vd-confirm[open] [data-submit-snapshot]').waitFor();
          assert((await editor.page.locator('.vd-confirm .vd-snapshot-id').innerText()).includes(saved.id));
        }, async () => assert.equal((await control()).workflow.pendingId, null), 0);
        await editor.page.locator('.vd-confirm[open] textarea').fill('Synthetic lifecycle ' + prefix);
        await measure(editor.page, prefix + '-confirm', confirmSelector, async () => {
          await editor.page.locator('.vd-confirm').waitFor({state: 'detached'});
          await editor.page.waitForFunction(() => !!window.ProcessAuthoringV3.flow()?.pendingId); await idle(editor.page);
          assert.equal(await editor.page.locator(mainSelector('save')).isDisabled(), true);
        }, async () => {
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
        const id = (await control()).workflow.pendingId, reviewer = await open(seed.actors.reviewer, 'approval');
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
      await editor.context.close(); contexts.delete(editor.context); editor = await open(seed.actors.editor, 'editor');
      await submit('returned-submit'); await review('approve');
      const finalValues = await readValues();
      for (const key of Object.keys(seed.values).filter(key => key !== 'processAuthoringControl')) assert.equal(finalValues[key], seed.values[key], 'Unrelated scope preserved: ' + key);
      assert.deepEqual(report.pageErrors, []);
      report.cycles.push({cycle, status: 'PASS', contentBytes: seed.contentBytes, seedBytes: seed.seedBytes, cases: (await control()).workflow.cases.map(row => row.status), nativeConfirmations, expectedContentIssues: seed.expectedContentIssues});
      await editor.context.close(); contexts.delete(editor.context);
    }
    report.summary = summarizeActions(report.samples, processBrowserActions);
    assert(report.summary.every(row => row.status === 'PASS_FUNCTION_MEASURED'));
    report.status = 'PASS_CI_SYNTHETIC_PROCESS_LIFECYCLE';
  } catch (error) {
    report.status = 'FAIL_CI_SYNTHETIC_PROCESS_LIFECYCLE'; report.failedStage = stage;
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
