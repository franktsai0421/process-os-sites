import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/routine-fqc-durable.mjs';

// Whole production IIFE, real read/receipt/adoption functions and history module.
// Synthetic HTTP/storage; paint is suppressed. Run with --experimental-vm-modules.
const error = f => f.win.RoutineFQCUI.navigation.error();
const paths = f => f.calls.map(c => c.method + ' ' + c.url);
const changed = (f, kind) => {
  if (kind === 'actor') f.sync.identity = {id:'other'};
  if (kind === 'epoch') f.epoch();
  if (kind === 'delivery') f.delivery();
  if (kind === 'pagehide') f.event('pagehide');
  if (kind === 'page') f.api.setRoot({isConnected:true});
  if (kind === 'reload') f.sync.requiresReload = true;
};
function responseFault(f, status, body, invalidJSON = false) {
  f.box.fetch = async (url, options = {}) => {
    f.calls.push({url, method:options.method || 'GET'});
    return invalidJSON ? new Response('{invalid', {status}) : Response.json(body, {status});
  };
}

for (const mode of ['no-start-date','no-edit','history']) void test(mode + ' mount adopts one complete read without availability or generate', async () => {
  const f = fixture({cold:true});
  if (mode === 'no-start-date') f.remote.control.startDate = '';
  if (mode === 'no-edit') f.remote.permissions.edit = false;
  f.afterImport(() => { assert.equal(f.api.getData(), undefined); assert.deepEqual(paths(f), ['GET /api/routine-fqc']); });
  await f.mount(mode === 'history');
  assert.equal(error(f), null);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.api.getData())), f.remote);
  assert.equal(f.imports.length, 1);
});

void test('generate retains one POST and its distinct fresh confirmation GET', async () => {
  const f = fixture({cold:true});
  await f.mount();
  assert.equal(error(f), null);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc','POST /api/routine-fqc','GET /api/routine-fqc']);
  assert.equal(JSON.parse(f.calls[1].body).action, 'generate');
  assert.equal(f.api.getData().control.revision, 11);
  assert.equal(f.store.map.size, 0);
  assert.equal(f.api.s.retry, null);
});

void test('normal refresh and repeated mount each issue fresh GET; history import alone is reusable', async () => {
  const f = fixture({cold:true}); f.remote.control.startDate = '';
  await f.mount(); f.remote.control.revision++;
  await f.api.refresh(); assert.equal(f.api.getData().control.revision, 11);
  f.remote.control.revision++; await f.mount();
  assert.equal(f.api.getData().control.revision, 12);
  assert.deepEqual(paths(f), Array(3).fill('GET /api/routine-fqc'));
  assert.equal(f.imports.length, 1);
});

void test('initial adoption reconciles stale selection without discarding same-actor unsaved buffers', async () => {
  const f = fixture(); f.remote.control.startDate = '';
  const d = f.api.getData().control.documents[0]; f.api.buffer(d).title = 'Unsent';
  f.api.s.checked.add('removed-job'); await f.mount();
  assert.equal(f.api.s.checked.size, 0);
  assert.equal(f.api.s.buffers.get('doc').title, 'Unsent');
  assert.equal(f.api.s.selected, 'doc');
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
});

for (const lang of ['zh','vi']) void test('only first read exact disabled response shows original ' + lang + ' empty UI', async () => {
  const f = fixture({cold:true}); f.box.document.documentElement.lang = lang;
  responseFault(f, 404, {error:'FQC_NOT_ENABLED'}); await f.mount();
  assert.equal(error(f), null); assert.equal(f.api.getData(), undefined);
  assert.equal(f.root.innerHTML, lang === 'zh'
    ? '<div class="rf-empty"><b>例行檢查準備中</b>3040 完成驗收後啟用</div>'
    : '<div class="rf-empty"><b>Đang chuẩn bị kiểm tra định kỳ</b>Kích hoạt sau nghiệm thu 3040</div>');
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']); assert.equal(f.imports.length, 0);
});

for (const [status, code] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[503,'OFFLINE'],[404,'OTHER_NOT_FOUND'],[503,'FQC_NOT_ENABLED']]) void test(status + ' ' + code + ' is not a disabled success', async () => {
  const f = fixture({cold:true}); responseFault(f, status, {error:code}); await f.mount();
  assert.equal(error(f)?.message, code); assert.equal(error(f)?.status, status);
  assert.equal(f.root.innerHTML, 'loading'); assert.equal(f.api.getData(), undefined);
  assert.equal(f.imports.length, 0); assert.equal(f.calls.length, 1);
});

void test('invalid JSON remains a navigation error, not disabled UI or an empty adopted state', async () => {
  const f = fixture({cold:true}); responseFault(f, 200, null, true); await f.mount();
  assert(error(f) instanceof SyntaxError); assert.equal(f.api.getData(), undefined);
  assert.equal(f.root.innerHTML, 'loading'); assert.equal(f.imports.length, 0);
});

void test('history import exact FQC_NOT_ENABLED is not mistaken for initial disabled response', async () => {
  const f = fixture({cold:true});
  f.afterImport(() => { throw Object.assign(Error('FQC_NOT_ENABLED'), {status:404}); });
  await f.mount(); assert.equal(error(f)?.message, 'FQC_NOT_ENABLED');
  assert.equal(f.root.innerHTML, 'loading'); assert.equal(f.api.getData(), undefined);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
});

void test('generate exact FQC_NOT_ENABLED stays an unknown write, never disabled UI or automatic retry', async () => {
  const f = fixture({cold:true}); f.reject(404, {error:'FQC_NOT_ENABLED'}); await f.mount();
  assert.equal(error(f)?.message, 'FQC_NOT_ENABLED'); assert.equal(f.root.innerHTML, 'loading');
  assert.deepEqual(paths(f), ['GET /api/routine-fqc','POST /api/routine-fqc']);
  assert(f.api.s.retry); assert.equal(f.store.map.size, 1);
});

for (const kind of ['actor','epoch','delivery','pagehide','page','reload']) for (const boundary of ['read','import']) void test(kind + ' change during ' + boundary + ' cannot adopt or generate', async () => {
  const f = fixture({cold:true});
  if (boundary === 'read') f.afterRead(() => changed(f, kind)); else f.afterImport(() => changed(f, kind));
  await f.mount(); assert.equal(f.api.getData(), undefined); assert.equal(f.posts(), 0);
  assert.equal(f.root.innerHTML, 'loading'); assert.equal(f.store.map.size, 0);
});

void test('newer aggregate adopted during import cannot be replaced or generate again from initial older read', async () => {
  const f = fixture({cold:true});
  f.afterImport(async () => { f.remote.control.revision = 20; await f.api.refresh(false); });
  await f.mount(); assert.equal(error(f), null); assert.equal(f.api.getData().control.revision, 20);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc','GET /api/routine-fqc']);
});

void test('cold reload discovers original unknown before import; no receipt GET, generate or metadata clearing', async () => {
  const writer = fixture(); writer.setMode('lost'); await assert.rejects(writer.api.postOwned(writer.draft()));
  const before = [...writer.store.map], f = fixture({store:writer.store, cold:true});
  f.afterImport(() => { assert(f.api.s.retry); assert.equal(f.api.s.retry.command.patches, undefined); });
  await f.mount(); assert.equal(error(f), null); assert.deepEqual([...f.store.map], before);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']); assert.match(f.api.s.error, /待確認/);
});

void test('full initial read alone does not settle a persisted receipt whose terminal proof was lost on reload', async () => {
  const writer = fixture(); await writer.api.postOwned(writer.draft());
  const f = fixture({store:writer.store, remote:writer.remote, cold:true}); await f.mount();
  assert(f.api.s.retry); assert.equal(f.store.map.size, 1); assert.equal(f.posts(), 0);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
});

void test('same-runtime terminal proof is reconciled by the real initial read before import', async () => {
  const f = fixture(); await f.api.postOwned(f.draft()); f.calls.length = 0;
  f.afterImport(() => { assert.equal(f.api.s.retry, null); assert.equal(f.store.map.size, 0); });
  await f.mount(true); assert.equal(error(f), null);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
  assert.equal(f.api.getData().control.documents[0].flow.working.title, 'Mine');
});

for (const kind of ['actor','epoch','delivery','pagehide','page','reload']) void test('late initial ' + kind + ' cannot clear existing terminal receipt', async () => {
  const f = fixture(); await f.api.postOwned(f.draft()); f.calls.length = 0;
  const original = f.api.getData(), before = [...f.store.map];
  f.afterRead(() => changed(f, kind)); await f.mount(true);
  assert.deepEqual([...f.store.map], before); assert(f.api.s.retry);
  assert.equal(f.api.getData(), original); assert.equal(f.posts(), 0); assert.equal(f.imports.length, 0);
});

for (const failure of ['missing-storage','malformed-storage']) void test(failure + ' still permits readonly mount but never generates', async () => {
  const f = fixture({cold:true});
  if (failure === 'missing-storage') delete f.win.localStorage;
  else f.store.map.set('routine-fqc-receipt-v1:owner:bad:original-operation', 'BROKEN');
  await f.mount(); assert.equal(error(f), null); assert.equal(f.api.getData().identity.id, 'owner');
  assert(f.api.s.retry); assert.match(f.api.s.error, /收據儲存/);
  assert.deepEqual(paths(f), ['GET /api/routine-fqc']);
});

for (const boundary of ['post','readback']) for (const kind of ['actor','epoch','delivery','pagehide','page','reload']) void test('late ' + kind + ' at generate ' + boundary + ' preserves receipt without late adoption', async () => {
  const f = fixture({cold:true});
  if (boundary === 'post') f.afterPost(() => changed(f, kind));
  else f.afterRead(() => { if (f.posts()) changed(f, kind); });
  await f.mount(); assert.equal(f.api.getData().control.revision, 10);
  assert(f.api.s.retry); assert.equal(f.store.map.size, 1); assert.equal(f.posts(), 1);
  assert.equal(f.calls.length, boundary === 'post' ? 2 : 3);
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
void test('root superseded during import releases only its attempt, allowing explicit new-root retry', async () => {
  const f = fixture({cold:true}); f.remote.control.startDate = '';
  const nextRoot = {isConnected:true,innerHTML:'next-loading',matches:selector=>selector==='#routine-fqc-root'};
  f.afterImport(() => f.api.setRoot(nextRoot)); await f.mount();
  assert.equal(f.api.getData(), undefined); assert.equal(f.calls.length, 1);
  f.afterImport(() => {}); await f.win.RoutineFQCUI.mount(nextRoot);
  assert.equal(error(f), null); assert.equal(f.calls.length, 2); assert(f.api.getData());
});

void test('reset and new mount remain busy when late old import finally runs, even on the same root', async () => {
  const f = fixture({cold:true}); f.remote.control.startDate = '';
  const oldImport = deferred(), releaseOld = deferred(), newRead = deferred(), releaseNew = deferred();
  f.afterImport(async () => { oldImport.resolve(); await releaseOld.promise; });
  const oldMount = f.mount(); await oldImport.promise;
  f.win.RoutineFQCUI.navigation.reset();
  f.afterRead(async () => { newRead.resolve(); await releaseNew.promise; });
  const newMount = f.mount(); await newRead.promise;
  releaseOld.resolve(); await oldMount;
  assert.equal(f.api.getData(), null); assert.equal(f.root.innerHTML, 'loading');
  await f.mount(); assert.equal(f.calls.length, 2, 'old finally must not release newer mount busy state');
  releaseNew.resolve(); await newMount;
  assert.equal(error(f), null); assert(f.api.getData()); assert.equal(f.calls.length, 2);
});

void test('same-root reset during generate POST stops old refresh before confirmation read or paint', async () => {
  const f = fixture({cold:true}), posted = deferred(), releasePost = deferred(), newRead = deferred(), releaseNew = deferred();
  f.afterPost(async () => { posted.resolve(); await releasePost.promise; });
  const oldMount = f.mount(); await posted.promise;
  const operationId = f.api.s.retry.operationId;
  f.win.RoutineFQCUI.navigation.reset();
  f.afterRead(async () => { newRead.resolve(); await releaseNew.promise; });
  const newMount = f.mount(true); await newRead.promise;
  releasePost.resolve(); await oldMount;
  assert.equal(f.api.getData(), null); assert.equal(f.calls.length, 3);
  assert.equal(f.api.s.retry.operationId, operationId); assert.equal(f.store.map.size, 1);
  await f.mount(); assert.equal(f.calls.length, 3);
  releaseNew.resolve(); await newMount;
  assert.equal(error(f), null); assert.equal(f.api.getData().control.revision, 11);
  assert.equal(f.posts(), 1, 'new mount may reconcile the prior receipt but never resend it');
  assert.deepEqual(paths(f), ['GET /api/routine-fqc','POST /api/routine-fqc','GET /api/routine-fqc']);
});
