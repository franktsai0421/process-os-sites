// Full shipped master-data and review closures; DOM, time and transport are
// synthetic ports. Transaction/receipt behavior is covered by the real bridge
// and production-handler suites, not this lightweight lifecycle fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/process/master-data.js', 'utf8');
const reviewSource = fs.readFileSync('public/process/master-review.js', 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
const copy = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function fixture({tab = 'AB', approval = false, readable = ['AB', 'C', 'PROCESS']} = {}) {
  const calls = [], events = new Map(), timers = new Map(), toasts = [];
  let timerId = 0, time = 0, paints = 0, resets = 0, factories = 0;
  let read = async () => ({unchanged: true, permissions: {view: true}});
  const catalog = scope => ({name: scope, products: [], lines: [], categoryGroups: []});
  const seed = {active: {AB: catalog('AB'), C: catalog('C'), PROCESS: {}}, versions: [], workflowScopes: {}};
  const state = {view: approval ? 'approval' : 'data', dataTab: tab, masterScope: tab === 'C' ? 'C' : 'AB', approvalTab: 'master', editorByCategory: {}};
  const node = () => ({dataset: {}, children: [], textContent: '', innerHTML: '', outerHTML: '', parentElement: null,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, remove() {},
    append(child) { this.children.push(child); }, prepend(child) { this.children.unshift(child); }});
  const content = node(), review = node(), refresh = node();
  review.querySelector = selector => selector === '#master-review-refresh' ? refresh : null;
  const document = {
    documentElement: {lang: 'zh'}, visibilityState: 'visible', activeElement: null,
    querySelector: selector => selector === '#data-content' ? content : selector === '#master-unified-review' ? review : null,
    querySelectorAll: () => [], createElement: node,
  };
  const shared = {
    load(scope) { calls.push(scope); return read(scope); },
    resetReads() { resets++; }, busy: () => false, flow: () => undefined,
    permissions: () => ({view: true}),
  };
  const schedule = (callback, delay = 0) => { const id = ++timerId; timers.set(id, {at: time + delay, callback}); return id; };
  const window = {
    ProcessSync: {deliveryProjection: true, identity: {id: 'synthetic-reader'}, projectProcessMaster: () => true},
    createMasterSharedBridge: () => shared,
    createForegroundPoll() {
      factories++;
      return {capture: () => 1, isCurrent: () => true, schedule: fn => schedule(fn, 30000), cancel: () => timers.clear()};
    },
    addEventListener(name, handler) { const handlers = events.get(name) || []; handlers.push(handler); events.set(name, handlers); },
    dispatchEvent(event) { for (const handler of events.get(event.type) || []) handler(event); },
    hasPermission: key => readable.includes(({ 'ab.view': 'AB', 'c.view': 'C', 'templates.view': 'PROCESS' })[key]),
    MasterAdminUI: {install() { return {
      current: () => catalog(state.masterScope), editable: () => null,
      masterView: () => '<section class="master-organized"></section>', bindMaster() {},
      productRows: () => '', syncRows() {}, categories: () => [], redraw() {}, preserveView: () => () => {},
    }; }},
    ApprovalTabs: {mount() {}}, scrollTo() {},
  };
  const box = vm.createContext({
    window, document, state, URL, Promise, console,
    location: {href: 'https://fixture.invalid/process/?view=' + state.view + '&dataTab=' + tab},
    history: {state: {}, pushState() {}, replaceState() {}},
    currentUser: window.ProcessSync.identity,
    data: {products: [], categories: [], bom: {}}, routing: {productRoutes: {}, lines: []}, lines: [], processMaster: {},
    platformUsers: [], approvalVersions: [], dispatchBoard: {},
    readStore: (key, fallback) => key === 'masterDataControl' ? copy(seed) : fallback,
    localStorage: {length: 0, setItem() { assert.fail('projected lifecycle must not write storage'); }},
    escapeHtml: value => value, toast: value => toasts.push(value), applyPlatformIdentity() {},
    render() { paints++; if (state.view === 'data') box.bindData(); },
    processMasterView: () => '<section class="process-master-version"></section>', bindDataInner() {},
    setTimeout: schedule, clearTimeout: id => timers.delete(id), setInterval() { assert.fail('no repeating timer'); },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  vm.runInContext(reviewSource, box, {filename: 'master-review.js'});
  vm.runInContext(source, box, {filename: 'master-data.js'});
  return {
    box, window, document, state, calls, shared, content, refresh, toasts,
    readWith(handler) { read = handler; }, render: () => box.render(),
    async ready() { await window.ProcessDataTabs.readyForDestination(); await turn(); },
    emit(name) { window.dispatchEvent({type: name}); },
    async advance(ms) {
      const until = time + ms; let count = 0;
      while ([...timers.values()].some(timer => timer.at <= until)) {
        assert(++count < 100, 'bounded synthetic timer drain');
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(id); time = timer.at; await timer.callback(); await turn();
      }
      time = until;
    },
    get paints() { return paints; }, get resets() { return resets; },
    get timerCount() { return timers.size; }, get factories() { return factories; },
  };
}

void test('full master closure allocates no polling factory, timer or eager GET', () => {
  const f = fixture();
  assert.equal(f.factories, 0); assert.equal(f.timerCount, 0); assert.deepEqual(f.calls, []);
  assert.doesNotMatch(source, /\b(?:pollMaster|sharedPoll|createForegroundPoll|setInterval|setTimeout)\b/);
});

for (const scope of ['AB', 'C', 'PROCESS']) void test(scope + ' mounts once, preserves idle input, and rereads only on explicit entry/action', async () => {
  const f = fixture({tab: scope === 'PROCESS' ? 'process-master' : scope});
  f.render(); await f.ready(); assert.deepEqual(f.calls, [scope]);
  const input = {value: '未存輸入 Việt', matches: () => true}; f.document.activeElement = input;
  for (const event of ['blur', 'focus', 'visibilitychange', 'process-permissions-changed', 'process-shared-state-updated']) {
    f.emit(event); await f.advance(60000);
  }
  f.document.visibilityState = 'hidden'; await f.advance(60000);
  f.document.visibilityState = 'visible'; f.emit('visibilitychange'); await f.advance(600000);
  assert.deepEqual(f.calls, [scope]); assert.equal(input.value, '未存輸入 Việt'); assert.equal(f.timerCount, 0);
  f.render(); await f.ready(); assert.deepEqual(f.calls, [scope], 'same-page repaint does not refresh');
  await f.window.MasterDataWorkflow.loadScope(scope); assert.deepEqual(f.calls, [scope, scope]);
  f.window.MasterDataWorkflow.resetProjection(); assert.equal(f.resets, 1);
  assert.deepEqual(f.calls, [scope, scope], 'projection reset itself does not fetch');
  f.render(); await f.ready(); assert.deepEqual(f.calls, [scope, scope, scope]); assert.equal(f.factories, 0);
});

void test('approval mount loads only permitted scopes; its existing refresh button is explicit', async () => {
  const f = fixture({approval: true, readable: ['C', 'PROCESS']});
  f.render(); await f.ready(); assert.deepEqual(f.calls, ['C', 'PROCESS']);
  await f.advance(600000); f.render(); await f.ready(); assert.deepEqual(f.calls, ['C', 'PROCESS']);
  await f.refresh.onclick(); assert.deepEqual(f.calls, ['C', 'PROCESS', 'C', 'PROCESS']);
  await f.advance(600000); assert.equal(f.calls.length, 4); assert.equal(f.timerCount, 0);
});

void test('denied approval view does not create background or explicit refresh reads', async () => {
  const f = fixture({approval: true, readable: []});
  f.render(); await f.ready(); await f.refresh.onclick(); await f.advance(600000);
  assert.deepEqual(f.calls, []); assert.equal(f.timerCount, 0);
});

for (const scope of ['AB', 'PROCESS']) void test(scope + ' failed mount waits for existing manual retry without repeated requests', async () => {
  const f = fixture({tab: scope === 'PROCESS' ? 'process-master' : scope});
  f.readWith(async () => { throw Error('SYNTHETIC_READ_DENIED'); });
  f.render(); await assert.rejects(f.ready(), /SYNTHETIC_READ_DENIED/); await turn();
  await f.advance(600000); assert.deepEqual(f.calls, [scope]); assert.equal(f.content.children.length, 1);
  f.readWith(async () => ({unchanged: true})); f.content.children[0].onclick(); await f.ready();
  assert.deepEqual(f.calls, [scope, scope]); assert.equal(f.timerCount, 0);
});

for (const scope of ['AB', 'PROCESS']) void test(scope + ' late mount after projection reset cannot mark the next entry loaded', async () => {
  const f = fixture({tab: scope === 'PROCESS' ? 'process-master' : scope}), pending = deferred();
  f.readWith(() => pending.promise); f.render(); const before = f.paints;
  f.window.MasterDataWorkflow.resetProjection(); pending.resolve({unchanged: false}); await turn();
  assert.equal(f.paints, before, 'old delivery cannot repaint');
  f.readWith(async () => ({unchanged: true})); f.render(); await f.ready();
  assert.deepEqual(f.calls, [scope, scope]); assert.equal(f.timerCount, 0);
});

void test('explicit loadScope after owner replacement cannot mark an unread new owner scope loaded', async () => {
  const f = fixture({tab: 'C'}), pending = deferred(); f.readWith(() => pending.promise);
  const load = f.window.MasterDataWorkflow.loadScope('C');
  f.window.ProcessSync.identity = {id: 'different-reader'}; pending.resolve({unchanged: true}); await load;
  f.readWith(async () => ({unchanged: true})); f.render(); await f.ready();
  assert.deepEqual(f.calls, ['C', 'C']); assert.equal(f.timerCount, 0);
});
