// Static/orchestration contracts only. This does not execute Chromium or fill UI timings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {processBrowserActions, runProcessDraftBrowser, expectedSubmitNotice, assertSubmitNotice, noReviewerMessages, pendingProcessUIReady} from './process-draft-lifecycle-browser.mjs';
import {summarizeActions} from './draft-action-measurement.mjs';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';

void test('process browser manifest names every required first-batch action explicitly', () => {
  assert.deepEqual(processBrowserActions, [
    'begin', 'local-apply', 'sync-current-canvas', 'save', 'submit-open', 'submit-confirm',
    'withdraw-open', 'withdraw-confirm', 'resubmit-open', 'resubmit-confirm',
    'review-return-open', 'return-open', 'return-confirm', 'returned-submit-open', 'returned-submit-confirm',
    'review-approve-open', 'approve-open', 'approve-confirm',
  ]);
  assert.equal(Object.isFrozen(processBrowserActions), true);
  const unrun = summarizeActions([], processBrowserActions);
  assert.equal(unrun.length, 18); assert(unrun.every(row => row.status === 'NOT_COMPLETE' && row.medianMs === null && row.samples === 0));
});
void test('local blocked browser capability is not retried by this acceptance entry', async () => {
  const before = process.env.CI;
  try { process.env.CI = 'false'; await assert.rejects(runProcessDraftBrowser(), /authorized CI/); }
  finally { if (before === undefined) delete process.env.CI; else process.env.CI = before; }
});
void test('first browser batch uses actual compiled fixture and real UI, no conditional skip or direct POST driver', () => {
  const source = fs.readFileSync(new URL('./process-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
  assert(source.includes("await import('./root-entry-native-fixture.mjs')"));
  assert(source.includes('cycle <= REQUIRED_SAMPLES'));
  assert.doesNotMatch(source, /if\s*\([^\n]*\.count\(\)/);
  assert.doesNotMatch(source, /route\.fulfill\(|route\.fetch\(|dispatchFetch\(|page\.request\.|fetch\(/);
  assert(source.includes("assert.equal(nativeConfirmations.length, 1"));
  assert(source.includes('assert.deepEqual(pending.contentIssues?.issues || [], seed.expectedContentIssues'));
  assert(source.includes("assert.equal(row.result.contentIssuesConfirmed, true)"));
  assert(source.includes("url.pathname === '/api/process-authoring/workflow'"));
});

void test('only the exact original reviewer advisory at each explicit Submit is admitted once', () => {
  const client = fs.readFileSync(new URL('../public/process/shared-draft-client.js', import.meta.url), 'utf8');
  for (const message of noReviewerMessages) {
    assert(client.includes(message), 'Pinned message is from the actual shared client');
    for (const action of ['submit-confirm', 'resubmit-confirm', 'returned-submit-confirm']) {
      const base = {cycle: 1, stage: '1:' + action, actorId: 'editor', editorId: 'editor', type: 'alert', message, notices: []};
      assert.equal(expectedSubmitNotice(base), true);
      for (const change of [{cycle: 0}, {stage: '2:' + action}, {stage: '1:save'}, {actorId: 'reviewer'}, {type: 'confirm'}, {message: message + ' unexpected'}, {message: 'FORBIDDEN'}, {notices: [{stage: base.stage}]}]) assert.equal(expectedSubmitNotice({...base, ...change}), false);
      assert.throws(() => assertSubmitNotice([], base.stage));
      assert.throws(() => assertSubmitNotice([{stage: '2:' + action}], base.stage));
      assert.throws(() => assertSubmitNotice([{stage: base.stage}, {stage: base.stage}], base.stage));
      assertSubmitNotice([{stage: base.stage}], base.stage);
    }
  }
});

void test('actual pending mount removes draft writes; readiness requires linked case, lock and one usable Withdraw', () => {
  const dom = canvasDOM();
  dom.Node.prototype.before = function (node) { const parent = this.parentElement; node.remove(); node.parentElement = parent; parent.children.splice(parent.children.indexOf(this), 0, node); };
  Object.defineProperty(dom.Node.prototype, 'firstChild', {get() { return this.children[0] || null; }});
  const page = dom.document.createElement('main'); page.className = 'editor-page editor-readonly editor-submitted-lock'; dom.document.body.append(page);
  const panel = dom.document.createElement('section'); panel.id = 'authoring-v3-panel'; page.append(panel);
  panel.innerHTML = '<section class="av3-header"><select id="authoring-version-choice"><option value="case1">Pending</option></select><button data-av3="save">Save</button><button data-av3="submit">Submit</button><button data-av3="withdraw">Withdraw</button></section>';
  const select = panel.querySelector('select'); select.value = 'case1'; select.options = select.querySelectorAll('option');
  const flow = {scope: 'process:platform', generation: 'g1', revision: 3, pendingId: 'case1', saved: {id: 'save1', actor: {name: 'Synthetic'}, content: {}, revision: 1}, working: {}, saves: [], cases: [{id: 'case1', status: 'pending', savedId: 'save1'}]};
  const api = {flow: () => flow, canMutate: () => false, canEditLocalCanvas: () => false};
  const context = {document: dom.document, ProcessAuthoringV3: api, addEventListener() {}, bindDataInner() {}, Intl, Date, console}; context.window = context;
  vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../public/process/version-draft-ui.js', import.meta.url), 'utf8'), context);
  const version = {id: 'case1', status: 'pending', number: 2};
  context.VersionDraftUI.mount(panel, {header: '.av3-header', module: 'Synthetic', scope: 'process:platform', version, versions: [version], flow, actions: {save: '[data-av3="save"]', submit: '[data-av3="submit"]', withdraw: '[data-av3="withdraw"]'}});
  assert.equal(panel.querySelectorAll('[data-av3="save"],[data-av3="submit"]').length, 0, 'Actual mount deliberately does not retain draft write controls while pending');
  const withdraw = panel.querySelector('[data-av3="withdraw"]'); assert(withdraw); withdraw.getClientRects = () => [{}];
  const ready = () => vm.runInContext('(' + pendingProcessUIReady.toString() + ')({savedId:"save1",generation:"g1"})', context);
  assert.equal(ready(), true);
  for (const field of ['scope', 'generation', 'pendingId']) { const prior = flow[field]; flow[field] = 'wrong'; assert.equal(ready(), false, field); flow[field] = prior; }
  for (const [target, field, bad] of [[flow.saved, 'id', 'other-save'], [flow.cases[0], 'savedId', 'other-save'], [flow.cases[0], 'status', 'approved'], [select, 'value', 'other-case'], [withdraw, 'disabled', true]]) { const prior = target[field]; target[field] = bad; assert.equal(ready(), false, field); target[field] = prior; }
  for (const name of ['editor-readonly', 'editor-submitted-lock']) { page.classList.remove(name); assert.equal(ready(), false, name); page.classList.add(name); }
  for (const name of ['canMutate', 'canEditLocalCanvas']) { api[name] = () => true; assert.equal(ready(), false, name); api[name] = () => false; }
  withdraw.getClientRects = () => []; assert.equal(ready(), false); withdraw.getClientRects = () => [{}];
  const extra = dom.document.createElement('button'); extra.setAttribute('data-av3', 'withdraw'); panel.append(extra); assert.equal(ready(), false); extra.remove();
  extra.setAttribute('data-av3', 'save'); panel.append(extra); assert.equal(ready(), false); extra.remove();
  withdraw.remove(); assert.equal(ready(), false, 'Missing controls alone are never proof of a locked pending view');
});
