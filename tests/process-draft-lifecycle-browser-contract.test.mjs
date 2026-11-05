// Static/orchestration contracts only. This does not execute Chromium or fill UI timings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extendProcessNavigationSeed, processBrowserActions, runProcessDraftBrowser, expectedSubmitNotice, assertSubmitNotice, noReviewerMessages, pendingProcessUIReady, processShellReady, reviewerProcessUIReady, processPageDiagnostic, disabledRoutineReviewContext} from './process-draft-lifecycle-browser.mjs';
import {summarizeActions} from './draft-action-measurement.mjs';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';

void test('process browser manifest names every required first-batch action explicitly', () => {
  assert.deepEqual(processBrowserActions, [
    'begin', 'local-layout', 'local-apply', 'save', 'submit-open', 'submit-confirm',
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

for (const system of ['process', 'quality']) for (const selected of ['master', 'process', 'quality', 'routine']) void test(`actual approval tab cold/reload contract selects ${selected} in ${system}`, () => {
 for (let load = 0; load < 2; load++) {
  const dom = canvasDOM(), calls = [], state = {};
  dom.Node.prototype.appendChild = function (node) { this.append(node); return node; };
  Object.defineProperty(dom.Node.prototype, 'childNodes', {get() { return this.children; }, configurable: true});
  Object.defineProperty(dom.Node.prototype, 'firstChild', {get() { return this.children[0] || null; }, configurable: true});
  const page = dom.document.createElement('section'); page.className = 'approval-page'; dom.document.body.append(page);
  const context = {document: dom.document, state, URL, location: {href: `https://synthetic.invalid/process/?system=${system}&view=approval&approvalTab=${selected}`},
    MutationObserver: class { observe() {} }, ProcessDeliveryNavigation: {approval(tab) { calls.push(tab); }}}; context.window = context;
  vm.createContext(context);
  const master = fs.readFileSync(new URL('../public/process/master-data.js', import.meta.url), 'utf8');
  const start = master.indexOf('  const approvalIntent =');
  const initialSelection = master.slice(start, master.indexOf('  render = function ()', start));
  assert(start > 0 && initialSelection.includes("getAll('approvalTab')")); vm.runInContext(initialSelection, context);
  vm.runInContext(fs.readFileSync(new URL('../public/process/approval-tabs.js', import.meta.url), 'utf8'), context);
  const mount = () => context.ApprovalTabs.mount({page, state, masterHTML: '', masterPending: 0, processPending: 1});
  mount(); assert.equal(state.approvalTab, selected);
  for (const key of ['master', 'process', 'quality', 'routine']) {
    assert.equal(page.querySelector(`[data-review-tab="${key}"]`).getAttribute('aria-selected'), String(key === selected));
    assert.equal(page.querySelector('#approval-panel-' + key).hidden, key !== selected);
  }
  const next = selected === 'process' ? 'quality' : 'process';
  page.querySelector(`[data-review-tab="${next}"]`).click(); assert.deepEqual(calls, [next]);
  assert.equal(state.approvalTab, selected, 'The callback request itself is not proof that navigation completed');
  state.approvalTab = next; mount();
  assert.equal(page.querySelector(`[data-review-tab="${next}"]`).getAttribute('aria-selected'), 'true');
  assert.equal(page.querySelector('#approval-panel-' + next).hidden, false);
 }
});
void test('initial approval intent rejects duplicate/unknown tabs and cannot choose another view', () => {
  const master = fs.readFileSync(new URL('../public/process/master-data.js', import.meta.url), 'utf8');
  const start = master.indexOf('  const approvalIntent =');
  const source = master.slice(start, master.indexOf('  render = function ()', start));
  assert(start > 0 && source.includes("getAll('approvalTab')"));
  for (const query of ['', '&approvalTab=', '&approvalTab=unknown', '&approvalTab=process&approvalTab=quality', '&approvalTab=process&approvalTab=process', '&approvalTab=__proto__']) {
    const state = {view: 'approval'};
    vm.runInNewContext(source, {state, URL, location: {href: 'https://synthetic.invalid/process/?view=approval' + query}});
    assert.equal(state.approvalTab, 'master'); assert.equal(state.view, 'approval');
  }
  for (const view of ['dashboard', 'data', 'editor']) {
    const state = {view, approvalTab: 'master'};
    vm.runInNewContext(source, {state, URL, location: {href: `https://synthetic.invalid/process/?view=${view}&approvalTab=process`}});
    assert.equal(state.approvalTab, 'master'); assert.equal(state.view, view);
  }
});

void test('reviewer readiness requires exact actor, selected visible tab, pending case and readonly workflow; diagnostics exclude credentials/content', () => {
  const dom = canvasDOM();
  const flow = {scope: 'process:platform', generation: 'g1', revision: 7, pendingId: 'case1', saved: {id: 'save1', content: {private: 'DO_NOT_REPORT'}}, cases: [{id: 'case1', status: 'pending', savedId: 'save1'}]};
  const api = {flow: () => flow, canMutate: () => false, canEditLocalCanvas: () => false};
  const sync = {identity: {id: 'reviewer', password: 'DO_NOT_REPORT'}, destination: {view: 'approval'}};
  dom.document.body.innerHTML = '<button data-review-tab="process" aria-selected="true">Process</button><section id="approval-panel-process"><button data-process-review="view">Review</button></section>';
  dom.document.documentElement.dataset.processNavigationStatus = 'ready';
  const tab = dom.document.querySelector('[data-review-tab="process"]'), panel = dom.document.querySelector('#approval-panel-process'), review = panel.querySelector('[data-process-review="view"]');
  panel.getClientRects = review.getClientRects = () => [{}];
  const context = {document: dom.document, ProcessSync: sync, ProcessAuthoringV3: api, URL, location: {href: 'https://synthetic.invalid/process/index.html?view=approval&approvalTab=process&secret=DO_NOT_REPORT'}}; context.window = context;
  vm.createContext(context);
  const args = {view: 'approval', actor: 'reviewer', pendingId: 'case1', generation: 'g1'};
  const invoke = fn => vm.runInContext('(' + fn.toString() + ')(' + JSON.stringify(args) + ')', context);
  assert.equal(invoke(processShellReady), true); assert.equal(invoke(reviewerProcessUIReady), true);
  for (const [target, key, bad] of [[sync.identity, 'id', 'editor'], [sync.destination, 'view', 'editor'], [dom.document.documentElement.dataset, 'processNavigationStatus', 'loading'], [panel, 'hidden', true], [review, 'disabled', true], [tab, 'disabled', true], [flow, 'scope', 'wrong'], [flow, 'generation', 'old'], [flow, 'pendingId', 'other'], [flow.saved, 'id', 'other'], [flow.cases[0], 'status', 'returned']]) {
    const prior = target[key]; target[key] = bad; assert.equal(invoke(reviewerProcessUIReady), false, key); target[key] = prior;
  }
  tab.setAttribute('aria-selected', 'false'); assert.equal(invoke(reviewerProcessUIReady), false); tab.setAttribute('aria-selected', 'true');
  for (const node of [panel, review]) { node.getClientRects = () => []; assert.equal(invoke(reviewerProcessUIReady), false); node.getClientRects = () => [{}]; }
  for (const name of ['canMutate', 'canEditLocalCanvas']) { api[name] = () => true; assert.equal(invoke(reviewerProcessUIReady), false); api[name] = () => false; }
  const boot = dom.document.createElement('section'); boot.id = 'process-boot'; dom.document.body.append(boot); assert.equal(invoke(processShellReady), false); assert.equal(invoke(reviewerProcessUIReady), false); boot.remove();
  const duplicate = dom.document.createElement('button'); duplicate.setAttribute('data-process-review', 'view'); panel.append(duplicate); assert.equal(invoke(reviewerProcessUIReady), false); duplicate.remove();
  const diagnostic = invoke(processPageDiagnostic); assert.equal(diagnostic.identityMatches, true); assert.equal(diagnostic.expectedPendingMatches, true);
  assert.equal(diagnostic.processTabSelected, true); assert.equal(diagnostic.reviewButtonCount, 1);
  assert.doesNotMatch(JSON.stringify(diagnostic), /DO_NOT_REPORT|password|secret|content|cookie/i);
  api.flow = () => null; assert.equal(invoke(processShellReady), true, 'Shell entry does not pretend the unselected module has loaded');
  assert.equal(invoke(reviewerProcessUIReady), false); assert.equal(invoke(processPageDiagnostic).flowPresent, false);
});


void test('disabled routine badge classification requires the original reviewer and visible ready process panel', () => {
  const dom = canvasDOM(), sync = {identity: {id: 'reviewer'}, destination: {view: 'approval'}}, flow = {scope: 'process:platform'};
  const api = {flow: () => flow, canMutate: () => false, canEditLocalCanvas: () => false};
  dom.document.body.innerHTML = '<button data-review-tab="process" aria-selected="true">Process</button><section id="approval-panel-process"></section>';
  dom.document.documentElement.dataset.processNavigationStatus = 'ready';
  const tab = dom.document.querySelector('[data-review-tab="process"]'), panel = dom.document.querySelector('#approval-panel-process');
  tab.getClientRects = panel.getClientRects = () => [{}];
  const context = {document: dom.document, ProcessSync: sync, ProcessAuthoringV3: api}; context.window = context; vm.createContext(context);
  const read = () => vm.runInContext('(' + disabledRoutineReviewContext.toString() + ')({reviewer:"reviewer"})', context);
  assert.equal(read(), true);
  for (const [target, key, value] of [[sync.identity, 'id', 'editor'], [sync.destination, 'view', 'editor'], [flow, 'scope', 'routine-fqc:x'],
    [dom.document.documentElement.dataset, 'processNavigationStatus', 'error'], [tab, 'disabled', true], [panel, 'hidden', true]]) {
    const old = target[key]; target[key] = value; assert.equal(read(), false, key); target[key] = old;
  }
  tab.setAttribute('aria-selected', 'false'); assert.equal(read(), false); tab.setAttribute('aria-selected', 'true');
  for (const node of [tab, panel]) { node.getClientRects = () => []; assert.equal(read(), false); node.getClientRects = () => [{}]; }
  for (const name of ['canMutate', 'canEditLocalCanvas']) { api[name] = () => true; assert.equal(read(), false); api[name] = () => false; }
  const boot = dom.document.createElement('div'); boot.id = 'process-boot'; dom.document.body.append(boot); assert.equal(read(), false); boot.remove();
  const extra = dom.document.createElement('button'); extra.setAttribute('data-review-tab', 'process'); dom.document.body.append(extra); assert.equal(read(), false); extra.remove();
  panel.remove(); assert.equal(read(), false);
  const source = fs.readFileSync(new URL('./process-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
  assert(source.includes("if (['return-confirm', 'approve-confirm'].includes(action))"));
  assert(source.includes("seedDisabled: !Object.hasOwn(seed.values, 'routineFqcEnabled')"));
  assert(source.includes('before: await page.evaluate(disabledRoutineReviewContext, {reviewer: seed.actors.reviewer.id})'));
  assert(source.includes('current: () => page.evaluate(disabledRoutineReviewContext, {reviewer: seed.actors.reviewer.id})'));
});

void test('untimed navigation checks use actual stage/line/top controls and do not change the 90 action samples', () => {
  const source = fs.readFileSync(new URL('./process-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
  assert.equal(processBrowserActions.length * 5, 90);
  const start = source.indexOf("for (const kind of ['stage', 'line', 'top-navigation'])");
  const end = source.indexOf('async function submit(prefix)', start);
  assert(start > 0 && end > start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /measureAction|\.selectOption\(|ProcessDeliveryNavigation\.navigate|dispatchEvent/);
  for (const text of ['[data-pe-stage="A-LIFE-NAV"]', '#editor-line-select', '.nav-item[data-view="dashboard"]', '.nav-item[data-view="editor"]', "line.press('ArrowDown')", "back.press('ArrowUp')"]) assert(block.includes(text));
  assert.match(block, /assert\.equal\(writes\.length, 0/);
  assert.match(block, /assert\.deepEqual\(after, navigationBaseline/);
  assert.match(block, /beforeSha256: navigationHash\(navigationBaseline\), afterSha256: navigationHash\(after\)/);
  assert.match(block, /ProcessCanvasLocal\?\.dirty\(\) === false/);
  assert.match(block, /reentryDiscardedLocal: true/);
  assert.match(source, /assert\.equal\(report\.navigationChecks\.length, REQUIRED_SAMPLES \* 3\)/);
  assert.match(source, /page\.setDefaultTimeout\(30000\)/);
});
void test('navigation fixture access adds only synthetic reachability and preserves persisted process snapshots', async () => {
  const {buildProcessDraftLifecycleSeed} = await import('./process-draft-lifecycle-route-fixture.mjs');
  const seed = buildProcessDraftLifecycleSeed((scope, working, activeId, generation) => ({scope, working, activeId, generation}));
  const beforeProcess = seed.values.processAuthoringControl, beforeInitial = JSON.stringify(seed.initialContent), beforeIssues = JSON.stringify(seed.expectedContentIssues);
  extendProcessNavigationSeed(seed);
  assert.equal(seed.values.processAuthoringControl, beforeProcess);
  assert.equal(JSON.stringify(seed.initialContent), beforeInitial);
  assert.equal(JSON.stringify(seed.expectedContentIssues), beforeIssues);
  assert.deepEqual(seed.actors.editor.lines, ['A', 'B']); assert.equal(seed.actors.editor.accessOverrides['dashboard.view'], true);
  assert.deepEqual(seed.actors.reviewer.lines, ['A']); assert.equal(seed.actors.reviewer.accessOverrides['dashboard.view'], undefined);
  const master = JSON.parse(seed.values.masterDataControl);
  assert.deepEqual(master.active.AB.categoryGroups[0].defaultStages, [seed.ids.stage, 'A-LIFE-NAV']);
  assert.equal(master.active.AB.products.length, 1, 'No additional product or process content changes approval advisories');
  assert.equal(master.active.AB.lines.find(line => line.code === 'B').stages.length, 0);
  assert.deepEqual(master.versions.find(version => version.scope === 'AB').snapshot, master.active.AB);
});

void test('Process verification uses full native record oracle and retains failure stage diagnostics', () => {
  const source = fs.readFileSync(new URL('./process-draft-lifecycle-browser.mjs', import.meta.url), 'utf8');
  assert.match(source, /createRootEntryFixture\(\{recordOracle: true/);
  assert.match(source, /fixture\.readRecordValues\(phase =>/);
  assert.doesNotMatch(source, /records\.decodeRecordValues/);
  assert.match(source, /report\.runtimeFailure = nativeFailureDiagnostics\(error\)/);
  assert.match(source, /report\.fixtureRead = fixtureRead/);
});

void test('native resource failures retain allowlisted cause codes without private error contents', async () => {
  const {nativeFailureDiagnostics} = await import('./root-entry-native-fixture.mjs');
  for (const code of ['ENOBUFS', 'EMFILE', 'ENFILE', 'EADDRNOTAVAIL']) {
    const result = nativeFailureDiagnostics(new TypeError('fetch failed', {cause: Object.assign(Error('private fixture content'), {code})}));
    assert.deepEqual(result.causeCodes, [code]);
    assert(!JSON.stringify(result).includes('private'));
  }
});
