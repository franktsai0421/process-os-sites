import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Actual implementation, in-memory transport/DOM doubles; no server, browser,
// credentials, business/storage writes or source rewriting.
const source = fs.readFileSync(new URL('../public/process/fqc-master.js', import.meta.url), 'utf8');
// Keep the fixture's unrelated read ports, but execute the actual production poll gate.
const sharedSource = fs.readFileSync(new URL('../public/process/shared-draft-client.js', import.meta.url), 'utf8');
const pauseStart = sharedSource.indexOf('  window.createScopedReadPause = label => {');
const pauseEnd = sharedSource.indexOf('  const clients=new Set(),transports=new Map(),', pauseStart);
assert(pauseStart >= 0 && pauseEnd > pauseStart);
const pauseSource = sharedSource.slice(pauseStart, pauseEnd);
const part = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a);
  return source.slice(a, b);
};
const clone = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
function queue() {
  const pending = [];
  return { pending, request() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
}
const equipment = { revision: 7, control: { schemaVersion: 1, activeVersionId: 'tool-v1', versions: [
  { id: 'tool-v1', status: 'approved', equipment: [{ id: 'tool' }], groups: [], categories: [], subcategories: [], issues: [] }
], issues: [], reservedMarks: {} } };
const master = { revision: 7, permissions: { view: true }, control: { activeVersionId: 'ab-v1', versions: [
  { id: 'ab-v1', status: 'approved', snapshot: { products: [{ code: 'P' }], lines: [], categoryGroups: [] } }
] } };
const shared = { revision: 7, permissions: { view: true }, control: { workflow: { generation: 'fqc-generation', revision: 1 } } };
function fixture(cells = { 'ab.view': true, 'equipment.view': true }) {
  const reads = { shared: queue(), master: queue(), equipment: queue(), permission: queue() };
  let epoch = 1, active = true, clock = 0, timerId = 0, focused = true;
  const activeTimers = new Map();
  const owner = { id: 'ACTOR' }, sync = { identity: owner, identityGeneration: () => epoch, platformHeaders: () => ({}) };
  const results = { adopted: [], renders: [], polls: 0, fetches: [] }, events = {}, timers = []; 
  const button = {}, element = { innerHTML: '', querySelector: () => button };
  const client = { read: () => reads.shared.request(), permissions: () => reads.permission.request() };
  const box = {
    Error, Array, Object, Promise, AbortSignal, clone,performance:{now:()=>clock},
    clearTimeout(id) { activeTimers.delete(id); },
    setTimeout(callback, delay) { assert.equal(typeof callback,'function');assert(Number.isFinite(delay)&&delay>=0);const id=++timerId,record={callback,due:clock+delay};activeTimers.set(id,record);timers.push(()=>{if(!activeTimers.has(id))return;activeTimers.delete(id);clock=Math.max(clock,record.due);return record.callback();});results.polls++;return id; },
    document: { visibilityState: 'visible', querySelector: () => null, activeElement: null },
    ui: { saving: false }, library: () => shared.control,
    window: { ProcessSync: sync, addEventListener: (name, callback) => { events[name] = callback; }, createSharedDraftClient: () => ({ read: () => reads.master.request() }) },
    identity: () => sync.identity, transport: () => client,
    fetch: async (url, options) => {
      results.fetches.push({ url, options });
      const value = await reads.equipment.request();
      return { status: value.status || 200, ok: (value.status || 200) === 200, json: async () => clone(value.body || equipment) };
    },
    ensureControl() {}, html: () => 'initial', isVi: () => false, h: String,
    fqcTabIsActive: () => active,
    adopt: value => results.adopted.push(value),
    render: () => results.renders.push(box.state()), pollShared: () => results.polls++,
    read() { throw Error('STORAGE_ACCESS_REFUSED'); }
  };
  // Real listener registration/dispatch semantics for the actual shared scheduler.
  // Existing event handles remain available to original assertions; no scheduler stub.
  for(const target of [box.window,box.document]){const listeners=new Map();target.addEventListener=(name,callback)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);if(target===box.window)events[name]=()=>target.dispatchEvent({type:name});};target.removeEventListener=(name,callback)=>listeners.get(name)?.delete(callback);target.dispatchEvent=event=>{const pendingEvents=Array.from(listeners.get(event.type)||[]);for(const callback of pendingEvents)callback.call(target,event);return true;};}
  box.document.hasFocus=()=>focused;
  // The real IIFE receives window as host. Model only the two explicit read
  // dependencies; missing/false cells deny and no unrelated right is granted.
  box.host = box.window;
  box.window.hasPermission = key => cells[key] === true;
  vm.createContext(box);
  vm.runInContext(pauseSource, box);
  const pause = box.window.createScopedReadPause('FQC readiness fixture');
  client.canPoll = kind => pause.canPoll(kind);
  vm.runInContext(`let mountSequence=0,hostElement=null,sharedPoll=window.createForegroundPoll(),workspaceReady=()=>false;` +
    part('  async function loadShared(', '  function changes(') +
    part('  function pollShared()', '  const ui =') +
    part('  let equipmentCache =', '  function eqPhotoUrl(') +
    part('  let masterCatalogCache =', '  function snapshotFromCanonical(') +
    part('  function bind(element) {', '  function fqcTabIsActive()') +
    part("  window.addEventListener('process-language-change'", "  window.addEventListener('fqc-equipment-references-updated'") +
    `this.bind=bind;this.loadEquipment=loadEquipmentCatalog;this.loadMaster=loadMasterCatalog;
     this.state=()=>({equipment:equipmentCache,master:masterCatalogCache,masterActor:masterCatalogActor,error:equipmentLoadError});
     this.cached=getCachedEquipment;this.catalogRead=catalog;`, box);
  return { box, reads, results, element, sync, button, events, timers, pause, focus:value=>{focused=value;box.window.dispatchEvent({type:value?'focus':'blur'});}, visibility:value=>{box.document.visibilityState=value?'visible':'hidden';box.document.dispatchEvent({type:'visibilitychange'});}, epoch: value => { epoch = value; }, active: value => { active = value; } };
}
async function resolveContent(f, { sharedIndex = 0, masterIndex = 0, equipmentIndex = 0, revisions = [7, 7, 7] } = {}) {
  f.reads.shared.pending[sharedIndex].resolve({ ...clone(shared), revision: revisions[0] }); await flush();
  f.reads.master.pending[masterIndex].resolve({ ...clone(master), revision: revisions[1] }); await flush();
  f.reads.equipment.pending[equipmentIndex].resolve({ body: { ...clone(equipment), revision: revisions[2] } }); await flush();
}

void test('preserves sequential FQC then AB then narrowed equipment reads, renders once without new permission request', async () => {
  const f = fixture(), done = f.box.bind(f.element);
  assert.equal(f.reads.shared.pending.length, 1); assert.equal(f.reads.master.pending.length, 0); assert.equal(f.reads.equipment.pending.length, 0);
  f.reads.shared.pending[0].resolve(clone(shared)); await flush();
  assert.equal(f.reads.master.pending.length, 1); assert.equal(f.reads.equipment.pending.length, 0); assert.equal(f.results.renders.length, 0);
  f.reads.master.pending[0].resolve(clone(master)); await flush();
  assert.equal(f.reads.equipment.pending.length, 1); assert.equal(f.results.renders.length, 0); assert.equal(f.results.polls, 0);
  f.reads.equipment.pending[0].resolve({}); await done;
  assert.equal(f.results.adopted.length, 1); assert.equal(f.results.renders.length, 1); assert.equal(f.results.polls, 1);
  assert.equal(f.results.renders[0].equipment.activeVersionId, 'tool-v1'); assert.equal(f.results.renders[0].master.products[0].code, 'P');
  assert.equal(f.reads.permission.pending.length, 0);
  assert.equal(f.results.fetches[0].url, '/api/routine-equipment?catalog=effective');
  assert.equal(f.results.fetches[0].options.cache, 'no-store');
});

for (const dependency of ['ab.view', 'equipment.view']) for (const mode of ['missing', 'false', 'null']) void test(`${dependency} ${mode} blocks dependencies without partial render or authority changes`, async () => {
  const cells = { 'ab.view': true, 'equipment.view': true };
  if (mode === 'missing') delete cells[dependency]; else cells[dependency] = mode === 'null' ? null : false;
  const before = clone(cells), f = fixture(cells), owner = f.sync.identity;
  const done = f.box.bind(f.element);
  assert.equal(f.reads.shared.pending.length, 1, 'retain the established initial FQC read');
  f.reads.shared.pending[0].resolve(clone(shared)); await done;
  assert.equal(f.reads.master.pending.length, 0); assert.equal(f.reads.equipment.pending.length, 0);
  assert.equal(f.reads.permission.pending.length, 0); assert.equal(f.results.fetches.length, 0);
  assert.equal(f.results.renders.length, 0); assert.equal(f.results.adopted.length, 0); assert.equal(f.results.polls, 0);
  assert.equal(f.box.state().master, null); assert.equal(f.box.state().equipment, null);
  assert.match(f.element.innerHTML, /FQC 載入目錄需要 AB 與檢具查看權限/);
  assert.equal(f.sync.identity, owner); assert.equal(f.sync.identityGeneration(), 1);
  assert.deepEqual(cells, before, 'dependency denial must not auto-grant a missing right');
  assert.equal(f.box.window.hasPermission('users.view'), false);
});

void test('unrelated concurrent state revisions do not introduce a new whole-workspace retry gate', async () => {
  const f = fixture(), done = f.box.bind(f.element);
  await resolveContent(f, { revisions: [7, 8, 9] }); await done;
  assert.equal(f.results.renders.length, 1); assert.equal(f.results.adopted.length, 1);
  assert.equal(f.reads.permission.pending.length, 0); assert(!f.element.innerHTML.includes('RELOAD_REQUIRED'));
});

for (const failed of ['shared', 'master', 'equipment']) void test(`${failed} read failure stays covered without partial render or added requests`, async () => {
  const f = fixture(), done = f.box.bind(f.element);
  if (failed !== 'shared') { f.reads.shared.pending[0].resolve(clone(shared)); await flush(); }
  if (failed === 'equipment') { f.reads.master.pending[0].resolve(clone(master)); await flush(); }
  f.reads[failed].pending[0].reject(Error('DENIED')); await done;
  assert.equal(f.results.renders.length, 0); assert.equal(f.results.adopted.length, 0); assert.equal(f.results.polls, 0);
  assert.equal(f.box.state().master, null); assert.equal(f.box.state().equipment, null); assert.match(f.element.innerHTML, /DENIED/);
  assert.equal(f.reads.permission.pending.length, 0); assert.equal(typeof f.button.onclick, 'function');
});

/** @type {[string, (f: ReturnType<typeof fixture>)=>void][]} */
const invalidationCases = [
  ['same actor identity epoch', f => f.epoch(2)], ['another actor', f => { f.sync.identity = { id: 'OTHER' }; }],
  ['delivery invalidation', f => { f.sync.requiresReload = true; }], ['unmounted destination', f => f.active(false)]
];
for (const [name, invalidate] of invalidationCases) void test(`${name} prevents an old read from continuing the destination load`, async () => {
  const f = fixture(), done = f.box.bind(f.element); invalidate(f);
  f.reads.shared.pending[0].resolve(clone(shared)); await done;
  assert.equal(f.reads.master.pending.length, 0); assert.equal(f.reads.equipment.pending.length, 0);
  assert.equal(f.results.renders.length, 0); assert.equal(f.results.adopted.length, 0);
});

void test('newer mount wins when older initial read finishes last', async () => {
  const f = fixture(), first = f.box.bind(f.element), second = f.box.bind(f.element);
  await resolveContent(f, { sharedIndex: 1 }); await second;
  f.reads.shared.pending[0].resolve(clone(shared)); await first;
  assert.equal(f.results.renders.length, 1); assert.equal(f.results.adopted.length, 1); assert.equal(f.reads.master.pending.length, 1);
});

void test('same actor same epoch refresh retains verified catalog and in-flight ownership', async () => {
  const f = fixture(), done = f.box.bind(f.element); f.sync.identity = { id: 'ACTOR' };
  await resolveContent(f); await done; f.sync.identity = { id: 'ACTOR' };
  assert.equal(f.box.cached('tool').id, 'tool'); assert.equal(f.box.catalogRead().comparisonReady, true);
  await f.box.loadEquipment(); assert.equal(f.reads.equipment.pending.length, 1);
});

void test('equipment cache cannot be reused after same-id epoch change or a newer denied read', async () => {
  const f = fixture(), first = f.box.loadEquipment(); f.reads.equipment.pending[0].resolve({}); await first;
  assert.equal(f.box.cached('tool').id, 'tool'); f.epoch(2); assert.equal(f.box.cached('tool'), null);
  const second = f.box.loadEquipment(); f.reads.equipment.pending[1].resolve({ status: 403, body: { error: 'DENIED' } });
  await assert.rejects(second, /DENIED/); assert.equal(f.box.state().equipment, null);
});

void test('late equipment failure cannot overwrite a newer success', async () => {
  const f = fixture(), older = f.box.loadEquipment({ force: true }), newer = f.box.loadEquipment({ force: true });
  f.reads.equipment.pending[1].resolve({}); await newer;
  f.reads.equipment.pending[0].resolve({ status: 403, body: { error: 'OLD_DENIAL' } }); await assert.rejects(older, /SUPERSEDED/);
  assert.equal(f.box.cached('tool').id, 'tool'); assert.equal(f.box.state().error, null);
});

void test('duplicate approved pointer fails instead of selecting arbitrary equipment', async () => {
  const f = fixture(), done = f.box.loadEquipment(), bad = clone(equipment); bad.control.versions.push(clone(bad.control.versions[0]));
  f.reads.equipment.pending[0].resolve({ body: bad }); await assert.rejects(done); assert.equal(f.box.state().equipment, null);
});

for (const event of ['process-shared-state-updated', 'routine-equipment-updated', 'process-language-change']) void test(`actual ${event} listener cannot bypass pending or failed mount`, async () => {
  const f = fixture(), done = f.box.bind(f.element); f.events[event](); await flush();
  assert.equal(f.reads.shared.pending.length, 1); assert.equal(f.reads.equipment.pending.length, 0);
  assert.equal(f.results.adopted.length, 0); assert.equal(f.results.renders.length, 0);
  f.reads.shared.pending[0].reject(Error('DENIED')); await done; f.events[event](); await flush();
  assert.equal(f.results.adopted.length, 0); assert.equal(f.results.renders.length, 0); assert.equal(f.reads.shared.pending.length, 1);
});

for (const source of ['shared event', 'equipment event', 'in-flight poll']) void test(`${source} from previous mount cannot adopt, render or reschedule into next mount`, async () => {
  const f = fixture(), first = f.box.bind(f.element); await resolveContent(f); await first; let poll;
  if (source === 'shared event') f.events['process-shared-state-updated']();
  else if (source === 'equipment event') f.events['routine-equipment-updated']();
  else poll = f.timers[0]();
  const next = f.box.bind(f.element);
  if (source === 'equipment event') f.reads.equipment.pending[1].resolve({}); else f.reads.shared.pending[1].resolve(clone(shared));
  await flush(); if (poll) await poll;
  assert.equal(f.results.adopted.length, 1); assert.equal(f.results.renders.length, 1); assert.equal(f.results.polls, 1);
  await resolveContent(f, { sharedIndex: source === 'equipment event' ? 1 : 2, masterIndex: 1, equipmentIndex: source === 'equipment event' ? 2 : 1 }); await next;
  assert.equal(f.results.adopted.length, 2); assert.equal(f.results.renders.length, 2); assert.equal(f.results.polls, 2);
});

for (const source of ['shared event', 'equipment event', 'in-flight poll']) void test(`${source} cannot adopt after same-id epoch change without remount`, async () => {
  const f = fixture(), first = f.box.bind(f.element); await resolveContent(f); await first; let poll;
  if (source === 'shared event') f.events['process-shared-state-updated']();
  else if (source === 'equipment event') f.events['routine-equipment-updated']();
  else poll = f.timers[0]();
  f.epoch(2);
  if (source === 'equipment event') f.reads.equipment.pending[1].resolve({}); else f.reads.shared.pending[1].resolve(clone(shared));
  await flush(); if (poll) await poll;
  assert.equal(f.results.adopted.length, 1); assert.equal(f.results.renders.length, 1); assert.equal(f.results.polls, 1);
});


void test('actual scoped403 pause sends no automatic GET; only current successful recovery resumes polling', async () => {
  const f = fixture(), done = f.box.bind(f.element); await resolveContent(f); await done;
  const owner = f.pause.capture();
  f.pause.denied('state', 403, owner, async () => { throw Error('EXPLICIT_RECHECK_PORT_NOT_INVOKED'); });
  assert.equal(f.pause.canPoll('state'), false);
  await f.timers[0]();
  assert.equal(f.reads.shared.pending.length, 1, 'paused timer must not call the read port');
  assert.equal(f.results.adopted.length, 1); assert.equal(f.results.renders.length, 1);
  const olderRecovery = f.pause.capture(), newerDenial = f.pause.capture();
  f.pause.denied('state', 403, newerDenial, async () => {});
  f.pause.success('state', olderRecovery);
  assert.equal(f.pause.canPoll('state'), false, 'older success cannot clear a newer denial');
  f.pause.success('state', f.pause.capture());
  assert.equal(f.pause.canPoll('state'), true);
  const poll = f.timers[1]();
  assert.equal(f.reads.shared.pending.length, 2, 'current recovery permits the existing GET path');
  f.reads.shared.pending[1].resolve({ unchanged: true }); await poll;
  assert.equal(f.results.adopted.length, 1); assert.equal(f.results.renders.length, 1);
});
