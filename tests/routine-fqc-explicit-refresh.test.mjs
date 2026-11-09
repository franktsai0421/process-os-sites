import unified from '../scripts/unified-draft-source-contract.cjs';
import {execFileSync} from 'node:child_process';
// Full production closure and actual shared receipt/read-pause helpers. Only the
// DOM paint/search/dialog ports, clock and HTTP store are synthetic. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './fixtures/routine-fqc-durable.mjs';
import {manualUI} from './fixtures/routine-fqc-manual-ui.mjs';

const tick = () => new Promise(setImmediate);
function clock() {
  let now = 0, serial = 0;
  const pending = new Map();
  return {
    schedulers: {
      setInterval(fn, ms) { const id = ++serial; pending.set(id, {fn, ms, at: now + ms, repeat: true}); return id; },
      setTimeout(fn, ms) { const id = ++serial; pending.set(id, {fn, ms, at: now + ms}); return id; },
      clearTimeout(id) { pending.delete(id); },
    },
    pending,
    async advance(ms) {
      const end = now + ms;
      for (let safety = 0;; safety++) {
        assert(safety < 100000, 'Synthetic timer must be bounded');
        const entry = [...pending].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, job] = entry; now = job.at; pending.delete(id);
        if (job.repeat) pending.set(id, {...job, at: now + job.ms});
        await job.fn(); await tick();
      }
      now = end; await tick();
    },
  };
}
function ui() {
  const time = clock(), f = fixture({schedulers: time.schedulers});
  const refreshButton = {dataset: {action: 'refresh'}}, normalTab = {dataset: {tab: 'jobs'}};
  const root = {isConnected: true, innerHTML: '', matches: selector => selector === '#routine-fqc-root',
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-action]' ? [refreshButton] : selector === '[data-tab]' ? [normalTab] : []};
  f.api.setRoot(root); f.api.setHistorySearch({}); f.remote.enabled = true;
  return {...f, time, root, refreshButton, normalTab};
}
const writes = f => f.calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body).action);
const inputs = f => JSON.stringify({buffers: [...f.api.s.buffers], bases: [...f.api.s.bases]});
function dirtyInput(f) { const doc = f.api.getData().control.documents[0]; f.api.buffer(doc).notes = 'New local notes'; return inputs(f); }

void test('idle past midnight/source change registers no polling or generate and keeps input', async () => {
  const f = ui(), before = dirtyInput(f), data = JSON.stringify(f.api.getData());
  f.remote.today = '2026-11-02'; f.remote.sources = [{id: 'new-source'}]; f.remote.catalog = {changed: true};
  await f.time.advance(3 * 24 * 60 * 60 * 1000);
  assert.equal(f.time.pending.size, 0); assert.equal(f.calls.length, 0);
  assert.equal(inputs(f), before); assert.equal(JSON.stringify(f.api.getData()), data);
  f.event('pageshow'); f.event('process-language-change'); f.event('focus');
  await f.time.advance(60000); assert.equal(f.calls.length, 0);
});

void test('explicit mount after idle retains existing availability/read/generate/read sequence', async () => {
  const f = ui(); f.remote.today = '2026-11-02'; f.remote.sources = [{id: 'new-source'}];
  await f.time.advance(2 * 24 * 60 * 60 * 1000); assert.equal(f.calls.length, 0);
  await f.win.RoutineFQCUI.mount(f.root);
  assert.deepEqual(f.calls.map(call => [call.method, call.url]), [
    ['GET', '/api/routine-fqc?availability=1'], ['GET', '/api/routine-fqc'],
    ['POST', '/api/routine-fqc'], ['GET', '/api/routine-fqc'],
  ]);
  assert.deepEqual(writes(f), ['generate']); assert.equal(f.store.map.size, 0);
  await f.time.advance(24 * 60 * 60 * 1000); assert.equal(f.calls.length, 4);
});

for (const mode of ['history', 'read-only', 'no-start', 'disabled']) void test('explicit mount ' + mode + ' does not generate', async () => {
  const f = ui();
  if (mode === 'read-only') f.remote.permissions.edit = false;
  if (mode === 'no-start') f.remote.control.startDate = null;
  if (mode === 'disabled') f.remote.enabled = false;
  await f.win.RoutineFQCUI.mount(f.root, mode === 'history');
  assert.deepEqual(writes(f), []);
  assert.equal(f.calls.length, mode === 'disabled' ? 1 : 2);
  await f.time.advance(3600000); assert.equal(f.time.pending.size, 0);
});

void test('actual painted normal Update generates and preserves dirty buffer/basis', async () => {
  const f = manualUI(), before = dirtyInput(f);
  assert.equal(typeof f.button().onclick, 'function');
  f.remote.today = '2026-11-02'; f.remote.sources = [];
  f.remote.control.documents[0].flow.working.notes = 'Other current value';
  await f.button().click();
  assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']); assert.equal(inputs(f), before);
  assert.equal(f.api.getData().today, f.remote.today); assert.equal(f.api.dirty(f.api.getData().control.documents[0]), true);
});

void test('explicit return from history retains generate, ordinary tab click does not read', async () => {
  const f = ui(); f.api.bind(); f.api.s.tab = 'history'; f.normalTab.onclick();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']); assert.deepEqual(writes(f), ['generate']);
  f.normalTab.onclick(); await tick(); assert.equal(f.calls.length, 3);
});

for (const mode of ['confirm', 'cancel', 'locked']) void test('actual settings ' + mode + ' preserves configure/generate ownership', async () => {
  const f = ui();
  if (mode !== 'locked') { f.remote.control.documents = []; f.api.setData(structuredClone(f.remote)); }
  f.api.setDialog(async () => mode === 'cancel' ? null : new Map([['start', '2026-11-01']]));
  await f.api.act('settings');
  assert.deepEqual(writes(f), mode === 'confirm' ? ['configure', 'generate'] : []);
  assert.deepEqual(f.methods(), mode === 'confirm' ? ['POST', 'GET', 'POST', 'GET'] : []);
  assert.equal(f.api.s.busy, false); assert.equal(f.store.map.size, 0);
});

void test('unknown generate receipt survives idle, manual Refresh and 404 retry without second POST', async () => {
  const f = ui(), before = dirtyInput(f); f.setMode('lost');
  await assert.rejects(f.api.refresh(true));
  const retry = JSON.stringify(f.api.s.retry), receipt = JSON.stringify([...f.store.map]);
  assert.deepEqual(writes(f), ['generate']); assert.equal(f.store.map.size, 1);
  f.remote.today = '2026-11-03'; f.remote.sources = [{id: 'later-source'}];
  await f.time.advance(3 * 24 * 60 * 60 * 1000);
  await f.api.act('refresh'); await f.api.act('retry');
  assert.deepEqual(writes(f), ['generate']); assert.equal(JSON.stringify(f.api.s.retry), retry);
  assert.equal(JSON.stringify([...f.store.map]), receipt); assert.equal(inputs(f), before);
  assert(f.calls.some(call => call.method === 'GET' && call.url.includes('?operationId=')));
});

void test('late mount availability cannot generate for a superseded delivery', async () => {
  const f = ui(); f.afterRead(() => f.delivery()); await f.win.RoutineFQCUI.mount(f.root);
  assert.deepEqual(f.methods(), ['GET']); assert.deepEqual(writes(f), []);
});

void test('normal Update and separate read-only Refresh are bilingual; cache matches shell', () => {
  const source = fs.readFileSync('public/process/routine-fqc.js', 'utf8');
  assert.match(source, /btn\('update-current', t\('更新', 'Cập nhật'\)/);
  assert.match(source, /btn\('refresh', t\('重新整理', 'Làm mới'\)\)/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  const currentIndex=unified.canonicalSource(fs.readFileSync('public/process/index.html'),execFileSync('git',['show','HEAD:public/process/index.html']));
  const shell=unified.restore(currentIndex,'public/process/index.html','initial_unified').toString();
  assert.equal(shell.match(/routine-fqc\.js\?v=20261109-unified-save-choice1/g)?.length, 1);
  assert.equal(unified.restore(currentIndex,'public/process/index.html','previous_followup').toString().match(/routine-fqc\.js\?v=20261109-unified-save-choice2/g)?.length,1);
  assert.equal(currentIndex.toString().match(/routine-fqc\.js\?v=20261109-unified-main1001/g)?.length,1);
  assert.equal(unified.restore(currentIndex,'public/process/index.html','main_background').toString().match(/routine-fqc\.js\?v=20261108-manual-generate2/g)?.length,1);
});
