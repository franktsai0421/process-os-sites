// Contract tests do not launch Chromium or turn source checks into UI evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
import {fqcBrowserActions, fqcEditorReady, fqcPendingReady, fqcReviewReady, fqcPageDiagnostic, observeFqcSetup, fqcFixtureRevisionDiagnostic, readFqcFixtureValues} from './fqc-draft-lifecycle-browser.mjs';
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
  const wrapper = node({open: true, contains: value => value === review, querySelector: selector => selector === '[data-quality-review-state="ready"]' ? node() : null});
  let wrappers = [wrapper];
  const panel = node({querySelector: selector => selector === '[data-quality-review-state="ready"]' ? node() : null,
    querySelectorAll: selector => selector === '[data-quality-review="case"]' ? [review] : selector === 'details[data-review-module="fqc"]' ? wrappers : []});
  const context = {window: {ProcessSync: {identity: {id: actor}, destination: {view: 'data'}}, FQCMasterUI: {control: {libraries: {fqc: c}}, navigation: {error: () => error}}},
    document: {documentElement: {dataset: {processNavigationStatus: 'ready'}}, querySelector: selector => ({'#data-content': host, '#approval-panel-quality': panel})[selector] || null,
      querySelectorAll: selector => selector === '[data-review-tab="quality"]' ? [tab] : []}, location: {pathname: '/process/index.html'}};
  return {context, actor, reviewer, generation, savedId, pendingId, flow, c, select, withdraw, tab, review, host, panel,
    wrapper, wrappers(value) { wrappers = value; },
    writes(value) { writes = value; }, error(value) { error = value; }, run(fn, args) { return vm.runInNewContext('(' + fn.toString() + ')(args)', {...context, args}); }};
}
void test('FQC phases independently require five real browser samples; prior canvas rows do not satisfy them', () => {
  assert.equal(fqcBrowserActions.length, 32); assert.equal(new Set(fqcBrowserActions).size, fqcBrowserActions.length);
  for (const name of ['begin', 'error-edit-stage', 'error-new-stage', 'item-edit-stage', 'item-new-stage', 'matrix-choice', 'matrix-discard', 'save', 'read-saved-draft', 'submit-confirm', 'withdraw-confirm', 'resubmit-confirm', 'return-confirm', 'returned-submit-confirm', 'approve-confirm']) assert(fqcBrowserActions.includes(name));
  assert(summarizeActions([], fqcBrowserActions).every(row => row.status === 'NOT_COMPLETE' && row.medianMs === null));
  assert.throws(() => summarizeActions([{action: 'sync-current-canvas', cycle: 1}], fqcBrowserActions));
});
void test('native lifecycle stages forms and matrix locally before one explicit Save', () => {
  assert(!fqcBrowserActions.includes('matrix-apply'));
  assert.match(source, /Completing a form must not write shared business state/);
  assert.match(source, /await verify\(await localContent\(\)\);\s*}, 0\)/);
  assert.match(source, /Discarding matrix choices preserves staged forms/);
  assert.match(source, /locator\('#fqc-matrix-apply'\)\.isVisible\(\), false/);
  const save = source.slice(source.indexOf("await measure(editor.page, 'save'"), source.indexOf('// Actual persisted readback'));
  for (const field of ['forms.errorName', 'forms.newErrorName', 'forms.itemName', 'forms.newItemName', 'forms.description', 'seed.ids.product2']) assert(save.includes(field));
  assert.match(save, /}, 1\)/);
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

void test('review readiness rejects closed, absent, duplicate or wrong FQC disclosure even with nonzero child rectangles', () => {
  const f = probes(); f.context.window.ProcessSync.identity.id = f.reviewer; f.context.window.ProcessSync.destination.view = 'approval';
  const args = {actor: f.reviewer, pendingId: f.pendingId, generation: f.generation};
  assert.equal(f.review.getClientRects().length, 1, 'rectangle presence is not a closed-details visibility proof');
  f.wrapper.open = false; assert.equal(f.run(fqcReviewReady, args), false, 'closed FQC disclosure');
  f.wrapper.open = true; assert.equal(f.run(fqcReviewReady, args), true);
  f.wrappers([]); assert.equal(f.run(fqcReviewReady, args), false, 'missing/wrong module');
  f.wrappers([f.wrapper, f.wrapper]); assert.equal(f.run(fqcReviewReady, args), false, 'duplicate FQC module');
  f.wrappers([node({open: true, querySelector: () => node(), contains: () => false})]); assert.equal(f.run(fqcReviewReady, args), false, 'case belongs to a different module');
});
void test('review setup requires a genuine visible enabled unique FQC overview click before the original ready probe', () => {
  const block = source.slice(source.indexOf("if (view === 'approval') {"), source.indexOf("} else {", source.indexOf("if (view === 'approval') {")));
  const tab = block.indexOf("requireVisible(page, '[data-review-tab=\"quality\"]')"),
    card = block.indexOf("requireVisible(page, '[data-review-jump=\"fqc\"]')"), ready = block.indexOf('page.waitForFunction(fqcReviewReady');
  assert(tab >= 0 && card > tab && ready > card, 'tab -> mandatory FQC module card -> pending ready');
  assert.match(block, /quality-fqc-open/);
  assert.match(block, /await requireVisible\(page, '\[data-quality-review=/);
  assert.match(block, /expected\.pendingId/);
  assert.doesNotMatch(block, /force:|\.open\s*=|dispatchEvent|evaluate/);
  assert.match(source, /Mandatory unique control/); assert.match(source, /Mandatory enabled control/);
  assert.equal(fqcBrowserActions.length, 32, 'setup disclosure is not an invented action timing sample');
});
for (const lang of ['zh', 'vi']) void test('actual overview keeps async pending collapsed and opens exact FQC only on its card click ' + lang, () => {
  const dom = canvasDOM(), doc = dom.document; doc.documentElement.lang = lang;
  dom.Node.prototype.before = function (node) { const p = this.parentElement; node.remove(); node.parentElement = p; p.children.splice(p.children.indexOf(this), 0, node); };
  let update;
  const identity = {id: 'synthetic-reviewer'}, delivery = {}, count = {fqc: 0, iqc: 0};
  const context = {document: doc, ProcessSync: {identity, identityGeneration: () => 1, captureDelivery: () => delivery, isCurrentDelivery: token => token === delivery},
    MutationObserver: class { constructor(fn) { update = fn; } observe() {} disconnect() {} },
    FQCMasterUI: {bindReview() {}, pendingCount: () => count.fqc}, IQCMasterUI: {bindReview() {}, pendingCount: () => count.iqc}};
  context.window = context; vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../public/process/quality-review-overview.js', import.meta.url), 'utf8'), context);
  const panel = doc.createElement('section');
  panel.innerHTML = context.QualityReviewOverview.html() + '<div id="review-fqc">FQC ready <button data-quality-review="case">Case</button></div><div id="review-iqc">IQC ready</div>';
  doc.body.append(panel); context.QualityReviewOverview.mount(panel);
  const fqc = panel.querySelectorAll('details').find(row => row.dataset.reviewModule === 'fqc'), iqc = panel.querySelectorAll('details').find(row => row.dataset.reviewModule === 'iqc');
  assert(fqc && iqc); assert.notEqual(fqc.open, true);
  context.QualityReviewOverview.track(panel, 'FQCMasterUI', undefined);
  count.fqc = 1; update();
  assert.equal(panel.querySelector('[data-overview-count="fqc"]').textContent, '1');
  assert.notEqual(fqc.open, true, 'pending count must not auto-expand a section under the user');
  panel.querySelector('[data-review-jump="iqc"]').click();
  assert.equal(iqc.open, true); assert.notEqual(fqc.open, true, 'wrong module card cannot reveal FQC');
  const button = panel.querySelectorAll('[data-review-jump="fqc"]'); assert.equal(button.length, 1);
  button[0].click(); assert.equal(fqc.open, true);
  assert.equal(doc.activeElement, fqc.querySelector('summary'));
  assert.equal(fqc.querySelectorAll('[data-quality-review="case"]').length, 1);
  assert.deepEqual(count, {fqc: 1, iqc: 0}, 'presentation click neither changes model nor grants permissions');
});

function setupEvents() {
  const handlers = new Map(); let time = 0;
  const page = {on(name, fn) { const values = handlers.get(name) || new Set(); values.add(fn); handlers.set(name, values); },
    off(name, fn) { handlers.get(name)?.delete(fn); }, emit(name, value) { for (const fn of handlers.get(name) || []) fn(value); }};
  const observer = observeFqcSetup(page, 'https://synthetic.invalid', () => time);
  const request = (pathname = '/api/process-bootstrap?secret=SYNTHETIC_PRIVATE', method = 'GET') => ({url: () => 'https://synthetic.invalid' + pathname, method: () => method,
    failure: () => ({errorText: 'net::ERR_ABORTED'}), headers() { throw Error('MUST_NOT_READ_HEADERS'); }, postData() { throw Error('MUST_NOT_READ_BODY'); }});
  return {page, observer, request, time(value) { time = value; }, listeners: () => [...handlers.values()].reduce((sum, values) => sum + values.size, 0)};
}
void test('passive setup diagnostics distinguish missing headers, pending body, completed and failed requests without exposing secrets', () => {
  const f = setupEvents(), bootstrap = f.request(), asset = f.request('/process/bootstrap.js?v=SYNTHETIC_PRIVATE'), unknown = f.request('/api/private/SYNTHETIC_PRIVATE');
  f.page.emit('request', bootstrap); f.time(5); f.page.emit('request', asset); f.page.emit('request', unknown);
  assert.equal(f.observer.snapshot().pending, 3); assert.equal(f.observer.snapshot().requests[0].status, null);
  f.time(10); f.page.emit('response', {request: () => bootstrap, status: () => 200, body() { throw Error('MUST_NOT_READ_BODY'); }});
  assert.equal(f.observer.snapshot().requests[0].responseMs, 10); assert.equal(f.observer.snapshot().requests[0].finishedMs, null);
  f.time(12); f.page.emit('requestfinished', bootstrap); f.page.emit('requestfailed', asset);
  f.page.emit('console', {type: () => 'warning', text: () => '共用資料服務無法連線 SYNTHETIC_PRIVATE'});
  const snapshot = f.observer.snapshot(); assert.equal(snapshot.pending, 1); assert.equal(snapshot.requests[1].failed, true);
  assert.equal(snapshot.requests[1].failureCode, 'net::ERR_ABORTED'); assert.equal(snapshot.sharedLoadWarning, true);
  assert.equal(snapshot.consoleCounts.warning, 1); assert.equal(snapshot.requests[2].path, 'other-api');
  assert.equal(JSON.stringify(snapshot).includes('SYNTHETIC_PRIVATE'), false);
  f.observer.stop(); assert.equal(f.listeners(), 0); f.time(100); assert.equal(f.observer.snapshot().elapsedMs, 12);
});
void test('setup diagnostics remain bounded, isolate listener errors and cannot hide or approve a failed readiness gate', () => {
  const f = setupEvents();
  f.page.emit('request', {url() { throw Error('SYNTHETIC_PRIVATE'); }});
  for (let i = 0; i < 260; i++) f.page.emit('request', f.request('/process/shared-state.js?i=' + i));
  const result = f.observer.stop(); assert.equal(result.requests.length, 256); assert.equal(result.dropped, 4); assert.equal(result.observationErrors, 1);
  assert.equal(result.pending, 256, 'stopping observation is not request completion');
  f.page.emit('request', f.request()); assert.deepEqual(f.observer.snapshot(), result);
  assert.match(source, /page\.setDefaultTimeout\(30000\)/, 'original timeout is not extended');
  assert.match(source, /await page\.waitForFunction\(fqcShellReady/); assert.match(source, /await idle\(page\); setup\.stop\(\)/);
  assert(source.indexOf('const setup = observeFqcSetup') < source.indexOf('await page.goto'));
  assert.match(source, /FAIL_CI_SYNTHETIC_FQC_LIFECYCLE/); assert.match(source, /setupNetwork: item\.setup\.snapshot/);
  assert.match(source, /diagnosticUnavailable: true, setupNetwork: item\.setup\.snapshot\(\)/, 'failed page evaluation still retains the independent request ledger');
});
void test('fixture revision failure probe reads only synthetic revision and bounds failure without supplying a readiness result', async () => {
  const sql = [];
  assert.deepEqual(await fqcFixtureRevisionDiagnostic({prepare(query) { sql.push(query); return {first: async () => ({revision: 14, secret: 'SYNTHETIC_PRIVATE'})}; }}), {status: 'available', revision: 14});
  assert.deepEqual(sql, ['SELECT revision FROM shared_state WHERE id=1']);
  assert.deepEqual(await fqcFixtureRevisionDiagnostic({prepare: () => ({first: async () => ({revision: '14'})})}), {status: 'malformed'});
  assert.deepEqual(await fqcFixtureRevisionDiagnostic({prepare() { throw Error('SYNTHETIC_PRIVATE'); }}), {status: 'rejected'});
  assert.deepEqual(await fqcFixtureRevisionDiagnostic({prepare: () => ({first: () => new Promise(() => {})})}, 1), {status: 'timeout'});
});

void test('fixture read phase identifies D1, JSON and record decode failures without retrying or substituting values', async () => {
  for (const failure of ['shared-row', 'row-json', 'record-decode', null]) {
    const phases = [], calls = [], failureObject = Error('SYNTHETIC_PRIVATE'), bucket = {};
    const db = {prepare(sql) { calls.push(sql); return {first() { if (failure === 'shared-row') throw failureObject; return Promise.resolve({values: failure === 'row-json' ? '{' : '{"synthetic":true}'}); }}; }};
    const records = {decodeRecordValues(actualBucket, envelope) { calls.push('record-decode'); assert.equal(actualBucket, bucket); assert.deepEqual(envelope, {synthetic: true}); if (failure === 'record-decode') throw failureObject; return Promise.resolve({values: {synthetic: 'original'}}); }};
    const task = readFqcFixtureValues(db, records, bucket, phase => phases.push(phase));
    if (failure) { await assert.rejects(task, error => failure === 'row-json' ? error instanceof SyntaxError : error === failureObject); assert.equal(phases.at(-1), failure); }
    else { assert.deepEqual(await task, {synthetic: 'original'}); assert.deepEqual(phases, ['shared-row', 'row-json', 'record-decode', 'complete']); }
    assert.equal(calls.filter(sql => sql.startsWith('SELECT')).length, 1, 'no automatic retry of fixture transport');
    assert.equal(calls.filter(sql => sql === 'record-decode').length, ['record-decode', null].includes(failure) ? 1 : 0);
  }
});
void test('native failure metadata uses existing bounded cause-code sanitizer and preserves distinct post-action cleanup stages', async () => {
  const {nativeFailureDiagnostics} = await import('./root-entry-native-fixture.mjs');
  const error = Object.assign(Error('SYNTHETIC_PRIVATE'), {code: 'SECRET_CODE', cause: Object.assign(Error('SYNTHETIC_PRIVATE'), {code: 'ECONNRESET'})});
  const result = nativeFailureDiagnostics(error); assert.deepEqual(result.causeCodes, ['ECONNRESET']);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE'), false); assert.equal(JSON.stringify(result).includes('SECRET_CODE'), false);
  for (const stage of ['final-read-values', 'verify-unrelated-values', 'final-read-case-statuses', 'editor-close']) assert(source.includes("':" + stage + "'"));
  assert.match(source, /':review-' \+ kind \+ '-close'/);
  assert.match(source, /report\.runtimeFailure = nativeFailureDiagnostics\(error\)/);
  assert.match(source, /report\.fixtureRead = fixtureRead/);
  assert.equal((source.match(/fixture\.close\(\)/g) || []).length, 1, 'worker remains alive through every cycle; only the run finally disposes it');
  assert(source.indexOf('if (fixture) await fixture.close()') > source.indexOf('} finally {\n    for (const item of pages)'));
  assert.match(source, /page\.setDefaultTimeout\(30000\)/);
  assert.equal((source.match(/final-read-case-statuses/g) || []).length, 1);
});

void test('native record oracle transport makes one request and never hides transport/body/HTTP/shape failure', async () => {
  const {bindNativeRecordOracle} = await import('./native-record-oracle.mjs');
  const original = Error('synthetic transport failure');
  for (const mode of ['fetch', 'body', 'http', 'null', 'array', 'nonstring', 'extra', 'success']) {
    let calls = 0; const phases = [];
    const read = bindNativeRecordOracle({async fetch(url, options) {
      calls++; assert.equal(url, 'http://synthetic-record-oracle.invalid/values'); assert.deepEqual(options, {method: 'GET'});
      if (mode === 'fetch') throw original;
      return {status: mode === 'http' ? 500 : 200, async json() {
        if (mode === 'body') throw original;
        return mode === 'http' ? {error: 'RECORD_ORACLE_FAILED', phase: 'record-decode'} : mode === 'null' ? null :
          mode === 'array' ? {values: []} : mode === 'nonstring' ? {values: {wrong: 1}} :
          mode === 'extra' ? {values: {}, error: 'ignored'} : {values: {synthetic: 'complete'}};
      }};
    }});
    if (mode === 'success') assert.deepEqual(await read(phase => phases.push(phase)), {synthetic: 'complete'});
    else await assert.rejects(read(phase => phases.push(phase)), error => ['fetch', 'body'].includes(mode) ? error === original : error instanceof Error);
    assert.equal(calls, 1); assert.equal(phases.includes('complete'), mode === 'success');
    if (mode === 'http') assert.equal(phases.at(-1), 'record-decode');
  }
});

void test('native record oracle uses the same isolated D1/R2 and full production decoder with fail-closed corruption', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const {createRequire} = await import('node:module'), {createRootEntryFixture} = await import('./root-entry-native-fixture.mjs');
  const {buildFqcDraftLifecycleSeed} = await import('./fqc-draft-lifecycle-route-fixture.mjs');
  const {nativeRecordOracleName} = await import('./native-record-oracle.mjs');
  const {buildProcessDraftLifecycleSeed} = await import('./process-draft-lifecycle-route-fixture.mjs');
  // This tiny Worker tests the fixture/binding transport, not compiled UI routes.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'record-oracle-contract-'));
  fs.mkdirSync(path.join(directory, 'server')); fs.mkdirSync(path.join(directory, 'client'));
  fs.writeFileSync(path.join(directory, 'server/index.js'), 'export default {async fetch(request,env){if(new URL(request.url).pathname==="/oracle-contract-revision")return Response.json(await env.DB.prepare("SELECT revision FROM shared_state WHERE id=1").first());return new Response("not an application route",{status:404})}}');
  let fixture;
  try {
    fixture = await createRootEntryFixture({programCommit: '0'.repeat(40), recordOracle: true, buildDirectory: directory});
    assert.match(fixture.recordOracleSha256, /^[a-f0-9]{64}$/);
    const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const load = createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE: bucket});
    const records = load('lib/state-records.ts'), createDraft = load('lib/shared-draft.ts').createSharedDraft;
    const install = raw => fixture.db.prepare('INSERT OR REPLACE INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(raw, 'synthetic oracle only').run();
    const readRow = () => fixture.db.prepare('SELECT * FROM shared_state WHERE id=1').first();
    let original, envelope;
    for (let cycle = 1; cycle <= 5; cycle++) {
      const seed = buildFqcDraftLifecycleSeed(createDraft, {cycle});
      original = await records.encodeRecordValues(bucket, seed.values); envelope = JSON.parse(original); await install(original);
      const before = await readRow();
      const appRead = await fixture.mf.dispatchFetch('http://local/oracle-contract-revision');
      assert.equal(appRead.status, 200); assert.deepEqual(await appRead.json(), {revision: 1});
      const legacy = await readFqcFixtureValues(fixture.db, records, bucket, () => {}), actual = await fixture.readRecordValues();
      assert.deepEqual(actual, seed.values); assert.deepEqual(actual, JSON.parse(JSON.stringify(legacy)));
      assert.deepEqual(await readRow(), before, 'oracle may not mutate state');
    }
    // Process uses the same complete oracle: count the replaced proxy calls,
    // compare every scope, and retain a prior immutable history record.
    for (let cycle = 1; cycle <= 5; cycle++) {
      const seed = buildProcessDraftLifecycleSeed(createDraft, {cycle});
      const values = {...seed.values, oracleProcessHistory: JSON.stringify({versions: [{id: 'prior', snapshot: {keep: cycle}}]})};
      await install(await records.encodeRecordValues(bucket, values));
      const before = await readRow(); let proxyGets = 0;
      const countedBucket = {get: (...args) => { proxyGets++; return bucket.get(...args); }};
      const legacy = await readFqcFixtureValues(fixture.db, records, countedBucket, () => {});
      assert(proxyGets > 1, 'legacy verification makes multiple cross-runtime R2 reads');
      const phases = [], actual = await fixture.readRecordValues(phase => phases.push(phase));
      assert.equal(phases.filter(phase => phase === 'oracle-dispatch').length, 1);
      assert.deepEqual(actual, values); assert.deepEqual(actual, JSON.parse(JSON.stringify(legacy)));
      assert.deepEqual(await readRow(), before);
    }
    const historyValues = {...buildFqcDraftLifecycleSeed(createDraft, {cycle: 5}).values,
      oracleHistoryCoverage: JSON.stringify({versions: [{id: 'synthetic-old-version', status: 'approved', snapshot: {oldValue: 'synthetic full history'}}]})};
    original = await records.encodeRecordValues(bucket, historyValues); envelope = JSON.parse(original); await install(original);
    assert.deepEqual(await fixture.readRecordValues(), historyValues);
    const full = JSON.parse(JSON.stringify(envelope));
    for (const mode of ['aggregate-corrupt', 'aggregate-missing', 'unrelated-aggregate-corrupt', 'body-corrupt', 'body-missing', 'malformed-manifest', 'malformed-row']) {
      await install(original);
      let key, restore;
      if (mode.startsWith('aggregate')) key = full.__processRecords.values.qualityMasterControl.key;
      if (mode === 'unrelated-aggregate-corrupt') key = full.__processRecords.values.routineEquipmentControl.key;
      if (mode.startsWith('body')) {
        const aggregate = JSON.parse(await (await bucket.get(full.__processRecords.values.oracleHistoryCoverage.key)).text());
        const refs = []; const visit = value => { if (!value || typeof value !== 'object') return; if (value.__immutableBody) refs.push(value.__immutableBody.key); else Object.values(value).forEach(visit); }; visit(aggregate);
        assert.equal(refs.length, 1); key = refs[0]; // Unrelated approved historic snapshot must still be fully verified.
      }
      if (key) { restore = await (await bucket.get(key)).text(); if (mode.endsWith('missing')) await bucket.delete(key); else await bucket.put(key, 'synthetic corrupt bytes'); }
      if (mode === 'malformed-manifest') await install('{"__processRecords":{"version":99,"values":{}}}');
      if (mode === 'malformed-row') await install('{');
      const before = await readRow(), phases = [];
      await assert.rejects(readFqcFixtureValues(fixture.db, records, bucket, () => {}));
      await assert.rejects(fixture.readRecordValues(phase => phases.push(phase)), /Synthetic record oracle failed: HTTP 500/);
      assert.equal(phases.includes('complete'), false); assert.deepEqual(await readRow(), before);
      if (key) { assert.equal(await bucket.get(key) === null, mode.endsWith('missing')); await bucket.put(key, restore); }
    }
    await fixture.db.prepare('DELETE FROM shared_state WHERE id=1').run();
    await assert.rejects(fixture.readRecordValues(), /HTTP 500/);
    const internal = await fixture.mf.getWorker(nativeRecordOracleName);
    for (const [url, method] of [['http://synthetic-record-oracle.invalid/values?keys=fqc', 'GET'], ['http://synthetic-record-oracle.invalid/values', 'POST'], ['http://synthetic-record-oracle.invalid/other', 'GET']]) {
      const response = await internal.fetch(url, {method}); assert.equal(response.status, 404); await response.text();
    }
    for (const target of ['http://local/values', 'http://synthetic-record-oracle.invalid/values']) {
      const external = await fixture.mf.dispatchFetch(target); assert.equal(external.status, 404); await external.text();
    }
  } finally { if (fixture) await fixture.close(); fs.rmSync(directory, {recursive: true, force: true}); }
});
