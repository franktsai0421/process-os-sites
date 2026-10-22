import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:path";
import __esmImport3 from "node:vm";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
const assert = __esmImport0;
const fs = __esmImport1;
const path = __esmImport2;
const vm = __esmImport3;

class QuotaStorage {
  constructor(limit = 5 * 1024 * 1024) {
    Object.defineProperties(this, { limit: { value: limit } });
  }
  getItem(key) {
    key = String(key);
    return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null;
  }
  setItem(key, value) {
    key = String(key);
    value = String(value);
    const size = Object.keys(this).reduce(
      (total, item) =>
        total + item.length + (item === key ? 0 : String(this[item]).length),
      key.length + value.length,
    );
    if (size > this.limit) throw Error('QuotaExceededError');
    this[key] = value;
  }
  removeItem(key) {
    delete this[String(key)];
  }
}

const localStorage = new QuotaStorage();
const sessionStorage = new QuotaStorage();
const nativeGetItem = QuotaStorage.prototype.getItem.bind(localStorage);
localStorage.setItem(
  'processEditor:legacy:A',
  JSON.stringify({ category:'legacy', line:'A', stages:{'A-CUT':[{id:'legacy',media:'L'.repeat(1024 * 1024)}]} }),
);
const legacyEditor = nativeGetItem('processEditor:legacy:A');
localStorage.setItem('processEditor:conflict:A', JSON.stringify({category:'conflict',line:'A',stages:{'A-CUT':[{id:'browser'}]}}));

const initialEditor = JSON.stringify({
  category: 'quota-test',
  line: 'A',
  stages: { 'A-CUT': [{ id: 'large', media: 'A'.repeat(1024 * 1024) }] },
});
let revision = 10;
let values = {
  platformUsers: '[]',
  approvalVersions: '[]',
  'processEditor:quota-test:A': initialEditor,
  'processEditor:conflict:A': JSON.stringify({category:'conflict',line:'A',stages:{'A-CUT':[{id:'server'}]}}),
};
let lastPost = null;
let failWrites = false;
let holdWrite = null;
const listeners = new Map();

class FixtureRequest {
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  send() {
    assert.equal(this.method, 'GET');
    assert.equal(this.url, '/api/shared-state');
    this.status = 200;
    this.responseText = JSON.stringify({
      revision,
      values,
      identity: { id: 'operator', role: 'staff' },
      serverProtected: true,
    });
  }
}

const window = {
  dispatchEvent(event) {
    for (const handler of listeners.get(event.type) || []) handler(event);
  },
  addEventListener(type, handler) {
    listeners.set(type, [...(listeners.get(type) || []), handler]);
  },
};
const context = vm.createContext({
  window,
  document: { documentElement: { lang: 'zh-Hant' } },
  Storage: QuotaStorage,
  localStorage,
  sessionStorage,
  location: {
    href: 'https://example.test/process/',
    origin: 'https://example.test',
    search: '',
  },
  URL,
  URLSearchParams,
  AbortSignal,
  XMLHttpRequest: FixtureRequest,
  CustomEvent: class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  },
  console,
  clearTimeout,
  setTimeout,
  fetch: async (url, options) => {
    assert.equal(url, '/api/shared-state');
    if (!options.body) return {ok:true,status:200,json:async()=>({revision,values,identity:{id:'operator',role:'staff'},serverProtected:true})};
    lastPost = JSON.parse(options.body);
    if (holdWrite) await holdWrite;
    if (lastPost.baseRevision !== revision)
      return { ok:false, status:409, text:async()=>JSON.stringify({revision,values}) };
    if (failWrites)
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: 'fixture unavailable' }),
      };
    values = { ...values, ...lastPost.updates };
    revision += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ revision, values }),
    };
  },
});
window.window = window;

vm.runInContext(
  fs.readFileSync(path.resolve('public/process/shared-state.js'), 'utf8'),
  context,
  { filename: 'shared-state.js' },
);

(async () => {
  await window.ProcessSync.ready;
  assert.equal(
    localStorage.getItem('processEditor:quota-test:A'),
    initialEditor,
    'server state is available through the compatibility mirror',
  );
  assert.equal(
    nativeGetItem('processEditor:quota-test:A'),
    null,
    'server state is not copied into native localStorage',
  );
  assert.equal(nativeGetItem('processEditor:legacy:A'), legacyEditor, 'loading never deletes an old browser draft');
  assert.equal(localStorage.getItem('processEditor:legacy:A'), legacyEditor, 'missing backend draft remains recoverable');
  assert.match(localStorage.getItem('processEditor:conflict:A'), /server/, 'conflicting browser draft does not replace server data');
  assert.match(JSON.stringify(window.ProcessSync.readLegacyDraft('processEditor:conflict:A')), /browser/);
  assert.equal(await window.ProcessSync.flush(), true);
  assert.equal(values['processEditor:legacy:A'], legacyEditor, 'complete legacy draft migrates through the revision checked API');
  assert.equal(nativeGetItem('processEditor:legacy:A'), null, 'only verified complete migration clears the legacy cache');
  assert.ok(nativeGetItem('processEditor:conflict:A'), 'conflicting legacy draft is retained for explicit recovery');

  localStorage.setItem('device-quota-fixture', 'F'.repeat(4 * 1024 * 1024));
  const nextEditor = JSON.stringify({
    category: 'quota-test',
    line: 'A',
    stages: { 'A-CUT': [{ id: 'larger', media: 'N'.repeat(1200 * 1024) }] },
  });
  localStorage.setItem('processEditor:quota-test:A', nextEditor);
  assert.equal(await window.ProcessSync.flush(), true);
  assert.equal(
    lastPost.updates['processEditor:quota-test:A'],
    nextEditor,
    'the complete photo draft reaches the cloud write',
  );
  assert.equal(
    nativeGetItem('processEditor:quota-test:A'),
    null,
  );

  failWrites = true;
  sessionStorage.setItem('quota-fixture', 'Q'.repeat(4 * 1024 * 1024));
  localStorage.setItem(
    'processEditor:quota-test:A',
    JSON.stringify({ media: 'R'.repeat(1200 * 1024) }),
  );
  assert.equal(await window.ProcessSync.flush(), false);
  assert.equal(window.ProcessSync.status, 'offline');

  failWrites = false;
  assert.equal(await window.ProcessSync.flush(), true, 'explicit Save retries a temporary failure');
  assert.equal(window.ProcessSync.paused, false);

  const key = 'processEditor:quota-test:A';
  const baseline = localStorage.getItem(key);
  localStorage.setItem(key, '"temporary"');
  localStorage.setItem(key, baseline);
  await window.ProcessSync.flush();
  assert.equal(values[key], baseline, 'reverting a queued change does not send the obsolete value');

  let releaseWrite;
  holdWrite = new Promise(resolve => { releaseWrite = resolve; });
  localStorage.setItem(key, '"in flight"');
  const firstSave = window.ProcessSync.flush();
  localStorage.setItem(key, baseline);
  const concurrentSave = window.ProcessSync.flush();
  releaseWrite();
  holdWrite = null;
  assert.equal(await firstSave, true);
  assert.equal(await concurrentSave, true);
  assert.equal(values[key], baseline, 'changes during a write are drained before Save finishes');
  let warned = false;
  window.dispatchEvent({type:'beforeunload',preventDefault(){ warned = true; }});
  assert.equal(warned, false, 'successful Save leaves no pending update');

  // A different shared-state key may advance the global revision while the
  // editor is open. Its draft must still save without reverting that change.
  values = {...values, dispatchBoard:'{"A":["externally-updated"]}'};
  revision++;
  const disjointDraft = JSON.stringify({category:'quota-test',line:'A',stages:{'A-CUT':[{id:'disjoint'}]}});
  localStorage.setItem(key, disjointDraft);
  assert.equal(await window.ProcessSync.flush(), true, 'disjoint revision change is safely retried');
  assert.equal(values[key], disjointDraft);
  assert.equal(values.dispatchBoard, '{"A":["externally-updated"]}', 'other writer is preserved');

  values = {...values, [key]:JSON.stringify({category:'quota-test',line:'A',stages:{'A-CUT':[{id:'other-writer'}]}})};
  revision++;
  localStorage.setItem(key, JSON.stringify({category:'quota-test',line:'A',stages:{'A-CUT':[{id:'my-unsaved-work'}]}}));
  assert.equal(await window.ProcessSync.flush(), false, 'same workspace is never overwritten');
  assert.equal(window.ProcessSync.status, 'conflict');
  assert.match(window.ProcessSync.saveFailureMessage(), /資料已在其他位置更新/);
  assert.match(values[key], /other-writer/, 'server version survives the conflict');
  assert.match(localStorage.getItem(key), /my-unsaved-work/, 'unsaved editor content stays in memory');

  const safetySource = fs.readFileSync(
    path.resolve('public/process/data-safety-ui.js'),
    'utf8',
  );
  assert.match(
    safetySource,
    /currentUser\.id !== 'public-viewer' && !sync\?\.protected/,
    'a remembered hosted user must not bypass server session verification',
  );
  assert.match(
    safetySource,
    /currentUser = null;\s*persistPlatform\(\);\s*renderLogin\(\);/,
  );
  const appSource = fs.readFileSync(
    path.resolve('public/process/app.js'),
    'utf8',
  );
  assert.match(
    appSource,
    /const saved = await window\.ProcessSync\?\.flush\?\.\(\);/,
    'the save action must wait for the cloud write before showing success',
  );
  console.log(
    'PASS: shared photo drafts bypass quota, explicit retry, concurrent saves, queued/in-flight reverts, pending-update drain, and hosted session guard',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
