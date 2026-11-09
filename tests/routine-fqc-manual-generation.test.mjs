import test from 'node:test';
import assert from 'node:assert/strict';
import { manualUI, posted, inputs, dirty, deferred } from './fixtures/routine-fqc-manual-ui.mjs';

void test('normal rendered Update button reads, generates and reads back without saving local input', async () => {
  const f = manualUI(), before = dirty(f), button = f.button();
  assert(button, 'Normal production paint must expose Update');
  assert.equal(button.textContent, '更新');
  assert.equal(typeof button.onclick, 'function');
  await button.click();
  assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']);
  assert.deepEqual(posted(f).map(x => x.action), ['generate']);
  assert.equal(inputs(f), before);
  assert.equal(f.store.map.size, 0);
});

void test('normal mount and actual Vietnamese Update share explicit generation without idle requests', async () => {
  const f = manualUI();
  await f.win.RoutineFQCUI.mount(f.root);
  assert.deepEqual(f.methods(), ['GET', 'GET', 'POST', 'GET']);
  assert.equal(f.button().disabled, false);
  f.document.documentElement.lang = 'vi'; f.paint();
  assert.equal(f.button().textContent, 'Cập nhật');
  await f.button().click();
  assert.deepEqual(f.methods().slice(4), ['GET', 'POST', 'GET']);
});

for (const mode of ['history', 'review', 'other-module']) void test(mode + ' has no Update; ordinary refresh/preview remain GET-only', async () => {
  const f = manualUI();
  if (mode === 'history') f.api.s.tab = 'history';
  if (mode === 'review') { f.root.id = 'review-routine-fqc'; f.api.s.reviewPlatform = true; }
  if (mode === 'other-module') f.api.s.module = '1';
  f.paint(); assert.equal(f.button(), null);
  if (mode === 'review') await f.button('refresh').click();
  else await f.api.act('refresh');
  await f.api.read('?search-preview=1'); await f.api.refresh(true);
  assert.deepEqual(posted(f), []);
});

for (const mode of ['read-only', 'no-start', 'disabled']) void test('Update uses fresh ' + mode + ' eligibility, without saving dirty documents', async () => {
  const f = manualUI(), before = dirty(f);
  if (mode === 'read-only') f.remote.permissions.edit = false;
  if (mode === 'no-start') f.remote.control.startDate = null;
  if (mode === 'disabled') f.remote.enabled = false;
  await f.button().click();
  assert.deepEqual(f.methods(), ['GET']); assert.equal(inputs(f), before);
});

void test('actual history navigation then normal return generates once, same normal tab does not read', async () => {
  const f = manualUI();
  f.root.querySelector('[data-tab="history"]').click();
  assert.equal(f.button(), null); assert.equal(f.calls.length, 0);
  f.root.querySelector('[data-tab="jobs"]').click();
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
  assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']);
  f.root.querySelector('[data-tab="jobs"]').click();
  assert.equal(f.calls.length, 3);
});

function delayRead(f, stage = 'body') {
  const entered = deferred(), release = deferred(), fetch = f.box.fetch;
  let used = false;
  f.box.fetch = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (used || options.method === 'POST' || url.includes('?')) return response;
    used = true;
    if (stage === 'headers') { entered.resolve(); await release.promise; return response; }
    return { ok: response.ok, status: response.status, async json() {
      const value = await response.json(); entered.resolve(); await release.promise; return value;
    } };
  };
  return { entered: entered.promise, release: release.resolve };
}

void test('double Update and other write while GET is in flight dispatch only one generation', async () => {
  const f = manualUI(), paused = delayRead(f), button = f.button();
  const running = button.click(); await paused.entered;
  await button.onclick(); await f.api.act('create-plan');
  await f.api.refresh(true);
  assert.equal(f.button().disabled, true);
  assert.deepEqual(f.methods(), ['GET']);
  paused.release(); await running;
  assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']); assert.equal(f.button().disabled, false);
});

for (const phase of ['headers', 'body']) for (const mode of [
  'history', 'review', 'module', 'identity-object', 'actor', 'epoch', 'delivery',
  'reset', 'pagehide', 'disconnected', 'view-revoked', 'edit-revoked', 'reload',
]) void test('late ' + phase + ' after ' + mode + ' cannot dispatch generation', async () => {
  const f = manualUI(), before = dirty(f), paused = delayRead(f, phase);
  const running = f.button().click(); await paused.entered;
  if (mode === 'history') f.api.s.tab = 'history';
  if (mode === 'review') f.api.s.reviewPlatform = true;
  if (mode === 'module') f.api.s.module = '1';
  if (mode === 'identity-object') f.sync.identity = { ...f.sync.identity };
  if (mode === 'actor') f.sync.identity = { id: 'another-actor' };
  if (mode === 'epoch') f.epoch();
  if (mode === 'delivery') f.delivery();
  if (mode === 'reset') f.win.RoutineFQCUI.navigation.reset();
  if (mode === 'pagehide') { f.event('pagehide'); f.event('pageshow'); }
  if (mode === 'disconnected') f.root.remove();
  if (mode === 'view-revoked') f.api.getData().permissions.view = false;
  if (mode === 'edit-revoked') f.api.getData().permissions.edit = false;
  if (mode === 'reload') f.sync.requiresReload = true;
  paused.release(); await running;
  assert.deepEqual(f.methods(), ['GET']); assert.equal(posted(f).length, 0);
  if (mode !== 'reset') assert.equal(inputs(f), before);
  if (mode === 'edit-revoked') assert.equal(f.api.getData().permissions.edit, false);
});

void test('late old state cannot overwrite newer revision or restore revoked permissions', async () => {
  const f = manualUI(), before = dirty(f), paused = delayRead(f);
  const running = f.button().click(); await paused.entered;
  f.remote.revision += 2; f.remote.control.revision += 2; f.remote.permissions.edit = false;
  await f.api.refresh(); const newest = f.api.getData();
  paused.release(); await running;
  assert.equal(f.api.getData(), newest); assert.equal(inputs(f), before); assert.equal(posted(f).length, 0);
});

void test('newer denied state read prevents an older granted response from generating', async () => {
  const f = manualUI(), paused = delayRead(f), before = dirty(f);
  const running = f.button().click(); await paused.entered;
  f.setMode('read403'); await assert.rejects(f.api.read(), /FORBIDDEN/);
  paused.release(); await running;
  assert.equal(posted(f).length, 0); assert.equal(inputs(f), before);
  const recovery = f.document.querySelector('section[role="alert"] button');
  assert(recovery); f.setMode('ok'); await recovery.click();
  assert.equal(posted(f).length, 0, 'shared access recheck is read-only');
});

for (const status of ['read403', 'read503']) void test(status + ' keeps input and a usable explicit retry', async () => {
  const f = manualUI(), before = dirty(f); f.setMode(status);
  await f.button().click();
  assert.equal(posted(f).length, 0); assert.equal(inputs(f), before);
  f.setMode('ok'); await f.button().click();
  assert.deepEqual(posted(f).map(x => x.action), ['generate']);
});

void test('input during both GET and generate remains unsent and original bases unchanged', async () => {
  const f = manualUI(), paused = delayRead(f); dirty(f);
  const basis = JSON.stringify([...f.api.s.bases]);
  const running = f.button().click(); await paused.entered;
  f.api.s.buffers.get('doc').notes = 'Input while GET is pending';
  f.afterPost(() => { f.api.s.buffers.get('doc').title = 'Input while POST is pending'; });
  paused.release(); await running;
  assert.equal(f.api.s.buffers.get('doc').notes, 'Input while GET is pending');
  assert.equal(f.api.s.buffers.get('doc').title, 'Input while POST is pending');
  assert.equal(JSON.stringify([...f.api.s.bases]), basis);
  assert.deepEqual(Object.keys(posted(f)[0]).sort(), ['action', 'operationId']);
  assert.equal(f.remote.control.documents[0].flow.working.title, 'Original');
});

for (const mode of ['lost', 'server500', 'other-action']) void test(mode + ' retains exact unknown operation through Update and receipt 404 without resend', async () => {
  const f = manualUI(), before = dirty(f);
  if (mode === 'server500') f.reject(500, { error: 'FQC_WRITE_FAILED' });
  else f.setMode('lost');
  if (mode === 'other-action') await assert.rejects(f.api.postOwned(f.draft()));
  else await f.button().click();
  const receipt = JSON.stringify([...f.store.map]), retry = JSON.stringify(f.api.s.retry);
  assert.equal(posted(f).length, 1);
  f.setMode('receipt404'); await f.button().click(); await f.api.act('retry');
  assert.equal(posted(f).length, 1); assert.equal(JSON.stringify([...f.store.map]), receipt);
  assert.equal(JSON.stringify(f.api.s.retry), retry); assert.equal(inputs(f), before);
});

void test('confirmed original generate receipt clears only after readback; new Update starts a new explicit operation', async () => {
  const f = manualUI(); f.setMode('commit-lost'); await f.button().click();
  assert.equal(posted(f).length, 1); assert.equal(f.store.map.size, 0);
  f.setMode('ok'); await f.button().click();
  assert.equal(posted(f).length, 2);
  assert.notEqual(posted(f)[0].operationId, posted(f)[1].operationId);
});

void test('unknown resolved during Update read does not silently authorize a second generation in that click', async () => {
  const f = manualUI(); f.setMode('lost'); await f.button().click();
  const record = f.api.record();
  f.setMode('ok'); f.remote.revision++; f.remote.control.revision++;
  f.receipts.set(record.meta.operationId, { ok: true });
  await f.api.postOwned(f.api.s.retry); // terminal receipt, still requires full readback
  assert.equal(f.store.map.size, 1);
  await f.button().click();
  assert.equal(posted(f).length, 1); assert.equal(f.store.map.size, 0);
});

void test('all documents and nested result/photo buffers retain their original full bases', async () => {
  const f = manualUI();
  const second = structuredClone(f.remote.control.documents[0]); second.id = 'second'; second.flow.scope = 'routine-fqc:second';
  f.remote.control.documents.push(second); f.api.setData(structuredClone(f.remote));
  dirty(f);
  for (const [key, content] of f.api.s.buffers) {
    content.date = '2026-11-01'; content.reason = 'unsent reason ' + key;
    content.disposition = 'unsent disposition ' + key;
    content.lines = [{ id: 'line-' + key, results: [{ id: 'result-' + key,
      samples: ['unsent-sample'], value: 'unsent measurement', notes: 'unsent result note', photos: ['unsent-photo'] }] }];
  }
  const before = inputs(f);
  await f.button().click();
  assert.equal(inputs(f), before); assert.equal(f.api.s.buffers.size, 2);
  assert.deepEqual(Object.keys(posted(f)[0]).sort(), ['action', 'operationId']);
});

void test('failed network GET leaves state/inputs intact; detached previous button cannot restart', async () => {
  const f = manualUI(), before = dirty(f), fetch = f.box.fetch.bind(f.box), button = f.button();
  f.box.fetch = async () => { throw Error('SYNTHETIC_NETWORK_DOWN'); };
  await button.click(); assert.equal(inputs(f), before); assert.equal(f.store.map.size, 0);
  f.box.fetch = fetch; await button.onclick(); assert.equal(f.calls.length, 0);
  await f.button().click(); assert.deepEqual(f.methods(), ['GET', 'POST', 'GET']);
});

for (const mode of ['history', 'review', 'identity-object', 'epoch', 'delivery', 'pagehide']) void test('sent generate then ' + mode + ' preserves original receipt and does not readback into another owner', async () => {
  const f = manualUI(), before = dirty(f);
  f.afterPost(() => {
    if (mode === 'history') f.api.s.tab = 'history';
    if (mode === 'review') f.api.s.reviewPlatform = true;
    if (mode === 'identity-object') f.sync.identity = { ...f.sync.identity };
    if (mode === 'epoch') f.epoch();
    if (mode === 'delivery') f.delivery();
    if (mode === 'pagehide') f.event('pagehide');
  });
  await f.button().click();
  assert.deepEqual(f.methods(), ['GET', 'POST']); assert.equal(f.store.map.size, 1);
  assert.equal(f.api.s.retry.operationId, posted(f)[0].operationId); assert.equal(inputs(f), before);
});

void test('lower global revision with equal aggregate is never adopted or used to generate', async () => {
  const f = manualUI(), data = f.api.getData(); f.remote.revision--;
  await f.button().click();
  assert.deepEqual(f.methods(), ['GET']); assert.equal(f.api.getData(), data);
});

void test('first normal mount without cached data exposes working Update after generation', async () => {
  const f = manualUI(); f.api.setData(null);
  await f.win.RoutineFQCUI.mount(f.root);
  assert.deepEqual(f.methods(), ['GET', 'GET', 'POST', 'GET']);
  assert.equal(f.button().disabled, false);
});

void test('busy or open dialog does not dispatch Update', async () => {
  const f = manualUI(); f.api.s.busy = true; f.paint();
  assert.equal(f.button().disabled, true); await f.button().click();
  f.api.s.busy = false; f.api.s.dialogOpen = true; f.paint(); await f.button().click();
  assert.equal(f.calls.length, 0);
});

void test('retired mount availability cannot generate under a replacement same-ID actor; explicit reentry works', async () => {
  const f = manualUI(), fetch = f.box.fetch.bind(f.box), entered = deferred(), release = deferred();
  let first = true;
  f.box.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (first && url.includes('availability')) { first = false; entered.resolve(); await release.promise; }
    return response;
  };
  const old = f.win.RoutineFQCUI.mount(f.root); await entered.promise;
  f.sync.identity = { ...f.sync.identity };
  const newer = f.win.RoutineFQCUI.mount(f.root); await newer;
  release.resolve(); await old;
  assert.deepEqual(posted(f).map(x => x.action), ['generate']);
  assert.equal(f.button().disabled, false);
});

function replaceContext(f, mode) {
  if (mode === 'history') f.api.s.tab = 'history';
  if (mode === 'review') { f.api.s.reviewPlatform = true; f.root.id = 'review-routine-fqc'; }
  if (mode === 'identity-object') f.sync.identity = { ...f.sync.identity };
  if (mode === 'epoch') f.epoch();
  if (mode === 'delivery') f.delivery();
  if (mode === 'root') {
    const replacement = f.document.createElement('section'); replacement.id = 'routine-fqc-root';
    f.document.body.append(replacement); f.root.remove(); f.api.setRoot(replacement);
  }
  f.api.s.error = 'NEW_CONTEXT_MARKER'; f.api.s.selected = 'new-context-selection';
  f.api.s.issues = [{ message: 'New context issue', path: [] }];
  f.paint();
}
function rejectRead(f, phase) {
  const fetch = f.box.fetch.bind(f.box), entered = deferred(), release = deferred();
  f.box.fetch = async (url, options) => {
    await fetch(url, options);
    if (phase === 'headers') { entered.resolve(); await release.promise; throw Error('STALE_NETWORK_FAILURE'); }
    return { ok: false, status: 403, async json() {
      entered.resolve(); await release.promise; throw Error('STALE_MALFORMED_DENIAL');
    } };
  };
  return { entered: entered.promise, release: release.resolve };
}

for (const phase of ['headers', 'body']) for (const mode of ['history', 'review', 'identity-object', 'epoch', 'delivery', 'root'])
  void test('stale rejected ' + phase + ' after ' + mode + ' preserves new context and produces no denial banner', async () => {
    const f = manualUI(), before = dirty(f), pause = rejectRead(f, phase);
    const pending = f.button().click(); await pause.entered;
    replaceContext(f, mode);
    const liveRoot = f.document.querySelector('#routine-fqc-root') || f.document.querySelector('#review-routine-fqc');
    const firstNode = liveRoot.firstElementChild, issue = JSON.stringify(f.api.s.issues);
    pause.release(); await pending;
    assert.equal(posted(f).length, 0); assert.equal(inputs(f), before);
    assert.equal(f.api.s.error, 'NEW_CONTEXT_MARKER');
    assert.equal(f.api.s.selected, 'new-context-selection');
    assert.equal(JSON.stringify(f.api.s.issues), issue);
    assert.equal(liveRoot.firstElementChild, firstNode, 'retired action cannot repaint the new context');
    assert.equal(f.document.querySelector('section[role="alert"]'), null);
  });

for (const phase of ['headers', 'body']) void test('current rejected ' + phase + ' is still reported and keeps input', async () => {
  const f = manualUI(), before = dirty(f), pause = rejectRead(f, phase);
  const pending = f.button().click(); await pause.entered; pause.release(); await pending;
  assert.match(f.api.s.error, phase === 'headers' ? /STALE_NETWORK_FAILURE/ : /STALE_MALFORMED_DENIAL/);
  assert.equal(inputs(f), before); assert.equal(posted(f).length, 0);
  assert.equal(!!f.document.querySelector('section[role="alert"]'), phase === 'body');
});

for (const phase of ['headers', 'body']) void test('stale rejected ' + phase + ' retains previous unknown metadata without resend', async () => {
  const f = manualUI(); f.setMode('lost'); await f.button().click();
  const original = JSON.stringify([...f.store.map]), retry = JSON.stringify(f.api.s.retry), before = dirty(f);
  f.setMode('ok'); const pause = rejectRead(f, phase);
  const pending = f.button().click(); await pause.entered; replaceContext(f, 'history');
  pause.release(); await pending;
  assert.equal(f.api.s.error, 'NEW_CONTEXT_MARKER'); assert.equal(posted(f).length, 1);
  assert.equal(JSON.stringify([...f.store.map]), original); assert.equal(JSON.stringify(f.api.s.retry), retry);
  assert.equal(f.api.record().notSent, false); assert.equal(inputs(f), before);
  assert.equal(f.document.querySelector('section[role="alert"]'), null);
});

for (const phase of ['post', 'receipt-headers', 'receipt-body']) void test('stale rejected ' + phase + ' after sent generate keeps the original sent record and new view', async () => {
  const f = manualUI(), fetch = f.box.fetch.bind(f.box), entered = deferred(), release = deferred(), before = dirty(f);
  f.setMode('lost');
  f.box.fetch = async (url, options) => {
    if (options.method === 'POST') {
      if (phase === 'post') { try { await fetch(url, options); } catch {} entered.resolve(); await release.promise; throw Error('SENT_POST_CONNECTION_LOST'); }
      return fetch(url, options);
    }
    if (url.includes('operationId')) {
      if (phase === 'receipt-headers') { entered.resolve(); await release.promise; throw Error('LATE_RECEIPT_NETWORK_FAILURE'); }
      return { ok: false, status: 403, async json() {
        if (phase === 'receipt-body') { entered.resolve(); await release.promise; }
        throw Error('LATE_RECEIPT_BODY_FAILURE');
      } };
    }
    return fetch(url, options);
  };
  const pending = f.button().click(); await entered.promise;
  const original = JSON.stringify([...f.store.map]), retry = JSON.stringify(f.api.s.retry);
  replaceContext(f, 'history'); release.resolve(); await pending;
  assert.equal(posted(f).length, 1); assert.equal(f.api.s.error, 'NEW_CONTEXT_MARKER');
  assert.equal(JSON.stringify([...f.store.map]), original); assert.equal(JSON.stringify(f.api.s.retry), retry);
  assert.equal(f.api.record().notSent, false); assert.equal(inputs(f), before);
  assert.equal(f.document.querySelector('section[role="alert"]'), null);
});
