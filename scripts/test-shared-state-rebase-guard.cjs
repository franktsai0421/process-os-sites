/* oxlint-disable typescript/no-require-imports -- isolated browser transport fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
async function scenario(queueDuringRequest) {
  class Storage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
  }
  const localStorage = new Storage(), sessionStorage = new Storage();
  const window = {dispatchEvent() {}, addEventListener() {}};
  let revision = 1, values = {bomOverrides:'{}', dispatchBoard:'{}'}, posts = 0;
  const fetch = async (_url, options) => {
    if (options.method !== 'POST') return Response.json({revision, values, identity:{id:'fixture',role:'admin'},serverProtected:true});
    posts++;
    const body = JSON.parse(options.body);
    if (posts === 1) {
      values = {...values, dispatchBoard:'{"remote":true}'};
      revision++;
      if (queueDuringRequest) localStorage.setItem('dispatchBoard', '{"stale":true}');
    }
    if (body.baseRevision !== revision) return Response.json({revision,values},{status:409});
    values = {...values,...body.updates}; revision++;
    return Response.json({revision,values});
  };
  vm.runInNewContext(fs.readFileSync('public/process/shared-state.js','utf8'), {
    window, Storage, localStorage, sessionStorage, fetch, AbortSignal, TextEncoder,
    crypto:webcrypto, location:{search:''}, URLSearchParams, setTimeout, clearTimeout,
    CustomEvent:class {}, console, document:{documentElement:{lang:'vi'}},
  });
  const api = window.ProcessSync;
  await api.ready;
  localStorage.setItem('bomOverrides', '{"local":true}');
  assert.equal(await api.flush(), !queueDuringRequest);
  assert.equal(values.bomOverrides, '{"local":true}', 'disjoint edit saved after guarded rebase');
  if (!queueDuringRequest) localStorage.setItem('dispatchBoard', '{"stale":true}');
  assert.equal(await api.flush(), false);
  assert.equal(posts, 2, 'stale key never submitted with the newer revision');
  assert.equal(values.dispatchBoard, '{"remote":true}');
  assert.equal(api.ownRecovery().updates.dispatchBoard, '{"stale":true}');
  assert.equal(api.saveError.status, 409);
  assert.match(api.saveFailureMessage(), /đối chiếu/);
}
(async () => {
  await scenario(false);
  await scenario(true);
  console.log('PASS: safe disjoint rebase; later and already queued stale-key edits blocked; actor recovery retained');
})().catch(error => { console.error(error); process.exitCode = 1; });
