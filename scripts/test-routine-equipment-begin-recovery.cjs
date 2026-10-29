// Real equipment UI/shared transport, synthetic HTTP and DOM; no server or browser.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fixture, tick, copy } = require('./test-routine-equipment-transfer-intent.cjs');
const results = [];
const markerKey = 'routine-equipment-begin-recovery:synthetic-editor';
async function check(name, task) { const start = performance.now(); try { await task(); results.push({ name, status: 'PASS', isolatedHandlerMs: +(performance.now() - start).toFixed(2) }); } catch (error) { results.push({ name, status: 'FAIL', error: error.stack }); } console.log(JSON.stringify(results.at(-1))); }
async function setup({ mutation = 'abort', read = 'draft', delayRead = false } = {}) {
  const f = await fixture({ openTransfer: false }), old = copy(f.test.model);
  old.versions = old.versions.filter(version => version.status === 'approved'); delete old.workflow;
  f.test.install(old);
  const content = copy(old.versions[0]); delete content.id; delete content.number; delete content.status; delete content.history;
  const next = { ...copy(old), versions: [...copy(old.versions), { id: 'shared-recovered', creatorId: 'synthetic-editor', baseVersionId: 'active', status: 'draft', number: 2, history: [], ...copy(content) }], workflow: { scope: 'routine-equipment', generation: 'recovered', baseId: 'active', active: {id:'active'}, revision: 1, working: copy(content), cases: [], saved: null, pendingId: null } };
  if (read === 'pending') { next.workflow.pendingId = 'pending-case'; next.versions[1].status = 'pending'; }
  if (read === 'active-changed') next.activeVersionId = 'new-active';
  if (read === 'wrong-scope') next.workflow.scope = 'tooling';
  if (read === 'malformed') next.workflow.working.equipment = null;
  if (read === 'no-draft') next.versions.pop();
  if (read === 'other-creator') next.versions[1].creatorId = 'other-editor';
  let release, called; const pending = new Promise(resolve => { release = resolve; }), readStarted = new Promise(resolve => { called = resolve; });
  const calls = [];
  f.c.fetch = async (url, options = {}) => {
    const method = options.method || 'GET'; calls.push({ url: String(url), method, body: options.body && JSON.parse(options.body) });
    if (method === 'POST') {
      if (mutation === 'abort') throw Object.assign(Error('signal is aborted without reason'), { name: 'AbortError' });
      if (mutation === '500') return { ok: false, status: 500, json: async () => ({ error: 'WORKFLOW_WRITE_FAILED' }) };
      if (mutation === '403') return { ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN' }) };
      return { ok: true, status: 200, json: async () => ({ revision: 11, control: copy(next) }) };
    }
    called(); if (delayRead) await pending;
    const status = read === '403' ? 403 : read === '503' ? 503 : 200;
    return { ok: status === 200, status, json: async () => status === 200 ? { revision: 11, control: copy(next), permissions: { view: true, edit: read !== 'no-edit' } } : { error: 'SYNTHETIC_READ_FAILURE' } };
  };
  return { ...f, calls, old, next, readStarted, release, posts: () => calls.filter(row => row.method === 'POST') };
}
(async () => {
  for (const mutation of ['abort', '500']) await check(`${mutation}: unknown remains after matching GET; explicit GET-only entry chooses existing draft`, async () => {
    const f = await setup({ mutation }); const result = await f.test.writeShared('begin');
    assert.equal(result, null); assert.equal(f.posts().length, 1); assert.equal(f.calls.filter(row => row.method === 'GET').length, 1);
    assert.equal(f.storage.has(markerKey), true); assert.equal(f.test.readUnavailable, true);
    assert(f.host.querySelector('#routine-begin-recheck'), 'rendered explicit GET-only entry');
    await assert.rejects(f.test.read(), /尚未確認/); assert.equal(f.storage.has(markerKey), true, 'ordinary read never adopts unknown');
    await f.test.enterExistingDraft(); assert.equal(f.test.model.workflow.generation, 'recovered'); assert.equal(f.storage.has(markerKey), false);
    assert.equal(f.posts().length, 1); assert.match(f.test.message, /沒有重送或自動套用/);
    assert.deepEqual(f.test.model.versions[0], f.old.versions[0], 'formal snapshot stays unchanged');
  });
  await check('normal Begin ACK does not add recovery GET', async () => { const f = await setup({ mutation: 'success' }); assert(await f.test.writeShared('begin')); assert.equal(f.calls.length, 1); assert.equal(f.storage.has(markerKey), false); });
  await check('known forbidden Begin clears marker without recovery or automatic retry', async () => { const f = await setup({ mutation: '403' }); assert.equal(await f.test.writeShared('begin'), null); assert.equal(f.calls.length, 1); assert.equal(f.storage.has(markerKey), false); });
  for (const read of ['pending', 'active-changed', 'wrong-scope', 'malformed', 'no-draft', '403', '503', 'no-edit', 'other-creator']) await check(`${read}: unconfirmed recovery preserves marker, content, and blocks later commands`, async () => {
    const f = await setup({ read }), before = JSON.stringify(f.test.model); assert.equal(await f.test.writeShared('begin'), null);
    assert.equal(f.posts().length, 1); assert.equal(f.storage.has(markerKey), true); assert.equal(JSON.stringify(f.test.model), before);
    assert.equal(f.test.readUnavailable, true); assert.match(f.test.message, /尚未確認/); await f.test.writeShared('apply'); await f.test.writeShared('begin'); assert.equal(f.posts().length, 1);
  });
  for (const change of ['actor', 'epoch', 'delivery', 'version', 'requiresReload']) await check(`recovery GET ${change}: no stale adoption and no retry`, async () => {
    const f = await setup({ delayRead: true }), before = JSON.stringify(f.test.model), task = f.test.writeShared('begin'); await f.readStarted;
    if (change === 'actor') f.rotateActor(); if (change === 'epoch') f.rotateEpoch(); if (change === 'delivery') f.rotateDelivery(); if (change === 'version') f.test.bumpVersion(); if (change === 'requiresReload') f.c.ProcessSync.requiresReload = true;
    f.release(); await task; assert.equal(f.posts().length, 1); assert.equal(JSON.stringify(f.test.model), before); assert.equal(f.storage.has(markerKey), true);
  });
  await check('marker already present permits only GET recheck, never another Begin POST', async () => {
    const f = await setup(); f.storage.set(markerKey, JSON.stringify({ schema: 1, actorId: 'synthetic-editor', activeVersionId: 'active', generation: null }));
    const result = await f.test.writeShared('begin'); assert.equal(result, null); assert.equal(f.posts().length, 0); assert.equal(f.calls.length, 1); assert(f.storage.has(markerKey));
  });
  await check('corrupt marker fails closed without transport', async () => { const f = await setup(); f.storage.set(markerKey, '{invalid'); assert.equal(await f.test.writeShared('begin'), null); assert.equal(f.calls.length, 0); assert.equal(f.storage.get(markerKey), '{invalid'); });
  await check('explicit existing-draft selection can clear marker without POST', async () => {
    const f = await setup(); f.storage.set(markerKey, JSON.stringify({ schema: 1, actorId: 'synthetic-editor', activeVersionId: 'active', generation: null }));
    await f.test.enterExistingDraft(); assert.equal(f.storage.has(markerKey), false); assert.equal(f.posts().length, 0); assert.equal(f.test.readUnavailable, false);
  });
  for (const value of ['false', '0', '""', 'null', '[]']) await check('corrupt present marker '+value+' is never absence', async()=>{const f=await setup();f.storage.set(markerKey,value);await f.test.writeShared('begin');await f.test.enterExistingDraft();assert.equal(f.calls.length,0);assert.equal(f.storage.get(markerKey),value);});
  for(const change of ['actor','epoch','delivery','page'])await check('explicit recovery '+change+' releases only its busy latch',async()=>{
    const f=await setup({delayRead:true});f.storage.set(markerKey,JSON.stringify({schema:1,actorId:'synthetic-editor',activeVersionId:'active',generation:null}));
    const task=f.test.enterExistingDraft();await f.readStarted;const actor=f.c.ProcessSync.identity;
    if(change==='actor')f.rotateActor();if(change==='epoch')f.rotateEpoch();if(change==='delivery')f.rotateDelivery();if(change==='page')f.host.dataset.activeTab='other';
    f.release();await task;assert(f.storage.has(markerKey));assert.equal(f.calls.length,1);
    f.c.ProcessSync.identity=actor;f.host.dataset.activeTab='quality-routine-equipment';
    await f.test.enterExistingDraft();assert.equal(f.calls.length,2);assert.equal(f.storage.has(markerKey),false);assert.equal(f.posts().length,0);
  });
  await check('explicit entry preserves unapplied legacy draft input without replay', async()=>{
    const f=await setup();const legacy=copy(f.old);legacy.versions.push({...copy(legacy.versions[0]),id:'legacy-local',status:'draft'});f.test.install(legacy);f.test.working.equipment[0].name='Unapplied local input';
    await f.test.writeShared('apply');assert(f.storage.has(markerKey));assert.equal(f.posts().length,1);
    await f.test.enterExistingDraft();assert.equal(f.storage.has(markerKey),false);assert.equal(f.test.working.equipment[0].name,'Unapplied local input');assert.equal(f.posts().length,1);
  });
  await tick(); const summary = { status: results.every(row => row.status === 'PASS') ? 'PASS_BOUNDED_BEGIN_RECOVERY' : 'FAIL_BOUNDED_BEGIN_RECOVERY', cases: results.length, passed: results.filter(row => row.status === 'PASS').length, failed: results.filter(row => row.status === 'FAIL').length, results, limits: ['Synthetic HTTP/DOM uses actual full equipment UI and shared transport, not actual API/database acceptance', 'One read-only recovery attempt; no deadline change, hidden Begin retry, Save, Submit, or approval', 'Isolated handler durations are not native page load/render timings'] }; console.log(JSON.stringify(summary)); if (summary.failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
