// Contract tests do not launch Chromium or turn source checks into UI evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fqcBrowserActions, fqcEditorReady, fqcPendingReady, fqcReviewReady, fqcPageDiagnostic} from './fqc-draft-lifecycle-browser.mjs';
import {summarizeActions} from './draft-action-measurement.mjs';
const source = readFileSync(new URL('./fqc-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
const product = readFileSync(new URL('../public/process/fqc-master.js', import.meta.url), 'utf8');
const node = (attrs = {}) => ({disabled: false, hidden: false, isConnected: true, getClientRects: () => [{}], getAttribute: key => attrs[key], ...attrs});
function probes() {
  const actor = 'fqc-editor', reviewer = 'fqc-reviewer', generation = 'fqc-generation', savedId = 'save', pendingId = 'case';
  const flow = {scope: 'fqc', generation, revision: 5, saved: {id: savedId}, pendingId, cases: [{id: pendingId, status: 'pending', savedId}]};
  const c = {workflow: flow, versions: [{id: pendingId, status: 'pending'}, {id: 'draft', status: 'draft'}]};
  const select = node({value: pendingId}), withdraw = node(), tab = node({'aria-selected': 'true'}), review = node();
  let writes = [], error = null;
  const host = node({dataset: {activeTab: 'quality-fqc'}, querySelector: selector => selector === '#fqc-version' ? select : selector === '#fqc-page' ? node() : null,
    querySelectorAll: selector => selector === '#fqc-withdraw' ? [withdraw] : writes});
  const panel = node({querySelector: selector => selector === '[data-quality-review-state="ready"]' ? node() : null,
    querySelectorAll: selector => selector === '[data-quality-review="case"]' ? [review] : []});
  const context = {window: {ProcessSync: {identity: {id: actor}, destination: {view: 'data'}}, FQCMasterUI: {control: {libraries: {fqc: c}}, navigation: {error: () => error}}},
    document: {documentElement: {dataset: {processNavigationStatus: 'ready'}}, querySelector: selector => ({'#data-content': host, '#approval-panel-quality': panel})[selector] || null,
      querySelectorAll: selector => selector === '[data-review-tab="quality"]' ? [tab] : []}, location: {pathname: '/process/index.html'}};
  return {context, actor, reviewer, generation, savedId, pendingId, flow, c, select, withdraw, tab, review, host, panel,
    writes(value) { writes = value; }, error(value) { error = value; }, run(fn, args) { return vm.runInNewContext('(' + fn.toString() + ')(args)', {...context, args}); }};
}
void test('FQC phases independently require five real browser samples; prior canvas rows do not satisfy them', () => {
  assert.equal(fqcBrowserActions.length, 33); assert.equal(new Set(fqcBrowserActions).size, fqcBrowserActions.length);
  for (const name of ['begin', 'error-edit-apply', 'error-new-apply', 'item-edit-apply', 'item-new-apply', 'matrix-choice', 'matrix-apply', 'matrix-discard', 'save', 'read-saved-draft', 'submit-confirm', 'withdraw-confirm', 'resubmit-confirm', 'return-confirm', 'returned-submit-confirm', 'approve-confirm']) assert(fqcBrowserActions.includes(name));
  assert(summarizeActions([], fqcBrowserActions).every(row => row.status === 'NOT_COMPLETE' && row.medianMs === null));
  assert.throws(() => summarizeActions([{action: 'sync-current-canvas', cycle: 1}], fqcBrowserActions));
});
void test('pending FQC gate requires original case/save/generation and absent write controls, not mere missing Save', () => {
  const f = probes(), args = {actor: f.actor, savedId: f.savedId, generation: f.generation};
  assert.equal(f.run(fqcPendingReady, args), true);
  for (const [obj, key, value] of [[f.flow, 'scope', 'process:platform'], [f.flow, 'generation', 'new'], [f.flow.saved, 'id', 'other'],
    [f.flow.cases[0], 'savedId', 'other'], [f.flow.cases[0], 'status', 'withdrawn'], [f.select, 'value', 'draft'],
    [f.withdraw, 'disabled', true], [f.context.window.ProcessSync.identity, 'id', f.reviewer], [f.host.dataset, 'activeTab', 'other']]) {
    const old = obj[key]; obj[key] = value; assert.equal(f.run(fqcPendingReady, args), false, key); obj[key] = old;
  }
  f.writes([node()]); assert.equal(f.run(fqcPendingReady, args), false); f.writes([]);
  f.withdraw.getClientRects = () => []; assert.equal(f.run(fqcPendingReady, args), false);
});
void test('editor admission retains shell error, actor, host, version and scope guards', () => {
  const f = probes(), args = {actor: f.actor, status: 'pending', pendingId: f.pendingId, savedId: f.savedId};
  assert.equal(f.run(fqcEditorReady, args), true);
  f.error(Error('SYNTHETIC_DENIED')); assert.equal(f.run(fqcEditorReady, args), false); f.error(null);
  f.context.document.documentElement.dataset.processNavigationStatus = 'error'; assert.equal(f.run(fqcEditorReady, args), false);
  f.context.document.documentElement.dataset.processNavigationStatus = 'ready'; f.host.isConnected = false; assert.equal(f.run(fqcEditorReady, args), false);
});
void test('review readiness requires actual quality tab, visible pending case, same scope/generation/save linkage', () => {
  const f = probes(); f.context.window.ProcessSync.identity.id = f.reviewer; f.context.window.ProcessSync.destination.view = 'approval';
  const args = {actor: f.reviewer, pendingId: f.pendingId, generation: f.generation}; assert.equal(f.run(fqcReviewReady, args), true);
  for (const [obj, key, value] of [[f.flow, 'scope', 'process:platform'], [f.flow, 'generation', 'wrong'], [f.flow, 'pendingId', 'other'],
    [f.flow.cases[0], 'savedId', 'other'], [f.flow.cases[0], 'status', 'approved'], [f.panel, 'hidden', true], [f.tab, 'disabled', true],
    [f.review, 'disabled', true], [f.context.window.ProcessSync.identity, 'id', f.actor]]) {
    const old = obj[key]; obj[key] = value; assert.equal(f.run(fqcReviewReady, args), false, key); obj[key] = old;
  }
  f.review.getClientRects = () => []; assert.equal(f.run(fqcReviewReady, args), false);
});
void test('failure diagnostics expose bounded state metadata, not actor values/content/cookies', () => {
  const f = probes(); f.flow.working = {secret: 'SYNTHETIC_PRIVATE_INPUT'};
  const result = f.run(fqcPageDiagnostic, {actor: f.actor, view: 'data'}), json = JSON.stringify(result);
  assert.equal(result.identityMatches, true); assert.equal(result.selectedStatus, 'pending');
  assert(!json.includes(f.actor)); assert(!json.includes('SYNTHETIC_PRIVATE_INPUT')); assert(!json.includes('cookie'));
});
void test('native FQC runner uses compiled application, real inputs, exact writes and unchanged permissions', () => {
  assert.match(source, /assert\.equal\(process\.env\.CI, 'true'/); assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /createRootEntryFixture/); assert.match(source, /buildFqcDraftLifecycleSeed/);
  assert.match(source, /cycle <= REQUIRED_SAMPLES/); assert.match(source, /measureAction\(/);
  assert.match(source, /read-saved-draft/); assert.match(source, /persistedSavedReadback: true/);
  assert.match(source, /assert\.deepEqual\(report\.pageErrors, \[\]\)/);
  assert(!source.includes('if (await') && !source.includes('route.fulfill('));
  assert(!source.includes('hasPermission=') && !source.includes('hasPermission ='));
  for (const id of ['fqc-begin', 'fqc-save', 'fqc-submit', 'fqc-withdraw', 'fqc-add-error', 'fqc-add-item', 'fqc-version', 'fqc-matrix-apply', 'fqc-matrix-discard', 'quality-reject', 'quality-approve']) assert(product.includes(id), id + ' actual source');
  assert.match(product, /confirmSubmit/); assert.match(product, /confirmReview/);
  assert.match(source, /Unrelated scope preserved/); assert.match(source, /snapshot, saved\.content/);
});
