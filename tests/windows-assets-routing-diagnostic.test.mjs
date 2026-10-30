// Pure fakes and native JS Response only. Never construct Miniflare/workerd.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {
  CELLS,LIMITS,LOCK_HASH,RESPONSE_BODY,VERSIONS,WORKER,
  runDiagnostic,runtimeOptions,safeCode,workingLockMatches,
} from '../scripts/windows-assets-routing-diagnostic.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve = yes; reject = no; });
  return {promise,resolve,reject};
}
function fakeClock() {
  const pending = new Map();
  return {
    pending,
    set(callback,ms) { const key = {}; pending.set(key,{callback,ms}); return key; },
    clear(key) { pending.delete(key); },
    fire(ms) {
      const match = [...pending].find(([,timer]) => timer.ms === ms);
      assert.ok(match,'expected deadline is armed');
      pending.delete(match[0]); match[1].callback();
    },
  };
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail('fake did not reach expected stage');
}
function response(status = 401,body = RESPONSE_BODY) {
  let reads = 0;
  return {
    status,
    async arrayBuffer() {
      assert.equal(++reads,1,'response must be consumed once');
      return new TextEncoder().encode(body).buffer;
    },
  };
}
function fixture(overrides = {}) {
  const created = [], dispatched = [], closed = [], events = [], timers = fakeClock();
  return {
    created,dispatched,closed,events,timers,
    create(cell) {
      created.push(cell); events.push('create:'+cell);
      return {
        ready:overrides.ready ? overrides.ready(cell) : Promise.resolve(),
        async dispatchFetch(url,options) {
          dispatched.push({cell,url,options}); events.push('dispatch:'+cell);
          return overrides.dispatch ? overrides.dispatch(cell,options) : response();
        },
        async dispose() {
          closed.push(cell); events.push('dispose:'+cell);
          if (overrides.dispose) await overrides.dispose(cell);
        },
      };
    },
  };
}
function stopped(result,f,attempts) {
  assert.equal(result.ok,false);
  assert.deepEqual(f.created,['assets-off']);
  assert.deepEqual(f.closed,['assets-off']);
  assert.equal(f.dispatched.length,attempts);
  assert.equal(result.receipts.at(-1).attempts,attempts);
  assert.equal(result.receipts.at(-1).code,'INCOMPLETE_OR_FAILED');
  assert.equal(f.timers.pending.size,0);
}

void test('fixed two-cell bounds and exact locked versions',() => {
  assert.deepEqual(CELLS,['assets-off','assets-on']);
  assert.equal(Object.isFrozen(CELLS),true);
  assert.deepEqual(LIMITS,{startup:30000,request:5000,dispose:10000});
  assert.deepEqual(VERSIONS,{miniflare:'4.20260515.0',workerd:'1.20260515.1',undici:'7.30.1'});
  assert.equal(LOCK_HASH,'46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b');
});

void test('actual synthetic worker returns exact nonempty 401 without reading any request property',async () => {
  const worker = vm.runInNewContext('('+WORKER.replace('export default','').replace(/;\s*$/,'')+')',{Response});
  const request = new Proxy({}, {get() { assert.fail('request must not be read'); }});
  const reply = await worker.fetch(request);
  assert.equal(reply.status,401);
  assert.equal(await reply.text(),RESPONSE_BODY);
  assert.ok(RESPONSE_BODY.length > 0);
});

void test('ON uses native assets-first router; OFF absent; identical worker and remaining options',() => {
  class Log {}
  const sdk = {Log,LogLevel:{NONE:0}}, deny = () => {};
  const off = runtimeOptions('assets-off','synthetic-runtime','synthetic-static',sdk,deny);
  const on = runtimeOptions('assets-on','synthetic-runtime','synthetic-static',sdk,deny);
  assert.equal(Object.hasOwn(off,'assets'),false);
  assert.deepEqual(on.assets,{directory:'synthetic-static',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:false}});
  for (const key of Object.keys(off)) {
    if (['log','handleRuntimeStdio','handleStructuredLogs'].includes(key)) continue;
    assert.equal(on[key],off[key]);
  }
  assert.equal(on.script,WORKER);
  for (const key of ['bindings','d1Databases','r2Buckets','kvNamespaces']) assert.equal(Object.hasOwn(on,key),false);
  let resumed = 0;
  on.handleRuntimeStdio({resume() { resumed++; }},{resume() { resumed++; }});
  on.handleStructuredLogs(new Proxy({}, {get() { assert.fail('log must be ignored'); }}));
  assert.equal(resumed,2);
});

void test('exactly two POSTs, one byte each, full consumption then disposal before next cell',async () => {
  const f = fixture();
  const result = await runDiagnostic(f);
  assert.equal(result.ok,true);
  assert.deepEqual(f.events,['create:assets-off','dispatch:assets-off','dispose:assets-off','create:assets-on','dispatch:assets-on','dispose:assets-on']);
  assert.equal(f.dispatched.length,2);
  for (const {url,options} of f.dispatched) {
    assert.equal(url,'http://localhost/api/synthetic-auth');
    assert.equal(options.method,'POST');
    assert.deepEqual([...options.body],[1]);
    assert.equal(options.signal.aborted,false);
  }
  assert.deepEqual(result.receipts.filter(row => row.stage === 'response').map(row => [row.status,row.bodycomplete,row.code]),[[401,true,'COMPLETE'],[401,true,'COMPLETE']]);
  assert.equal(result.receipts.at(-1).code,'TWO_ATTEMPTS_NO_RESET_OBSERVED');
  assert.equal(f.timers.pending.size,0);
});

void test('no next cell before complete response body and dispose',async () => {
  const body = deferred(), disposal = deferred();
  const f = fixture({dispatch:cell => cell === 'assets-off' ? {status:401,arrayBuffer:() => body.promise} : response(),dispose:cell => cell === 'assets-off' ? disposal.promise : undefined});
  const pending = runDiagnostic(f);
  await until(() => f.dispatched.length === 1);
  assert.equal(f.created.length,1);
  assert.equal(f.closed.length,0);
  body.resolve(new TextEncoder().encode(RESPONSE_BODY).buffer);
  await until(() => f.closed.length === 1);
  assert.equal(f.created.length,1);
  disposal.resolve();
  assert.equal((await pending).ok,true);
});

for (const phase of ['dispatch','consume']) {
  void test(`${phase} ECONNRESET stays FAIL and stops after one request`,async () => {
    const fault = Object.assign(new Error(),{cause:{code:'ECONNRESET'}});
    const f = fixture({dispatch:() => {
      if (phase === 'dispatch') throw fault;
      return {status:401,arrayBuffer() { throw fault; }};
    }});
    const result = await runDiagnostic(f);
    stopped(result,f,1);
    const row = result.receipts.find(item => item.stage === phase);
    assert.equal(row.code,'ECONNRESET');
    assert.equal(row.bodycomplete,false);
    assert.equal(row.status,phase === 'consume' ? 401 : null);
    assert.equal(f.dispatched[0].options.signal.aborted,true);
  });
}

for (const [status,body,code] of [[403,RESPONSE_BODY,'STATUS_MISMATCH'],[401,'','BODY_MISMATCH'],[401,RESPONSE_BODY+'\n','BODY_MISMATCH']]) {
  void test(`strict response mismatch ${status}/${body.length} consumes but fails closed`,async () => {
    const f = fixture({dispatch:() => response(status,body)});
    const result = await runDiagnostic(f);
    stopped(result,f,1);
    const row = result.receipts.find(item => item.stage === 'response');
    assert.equal(row.code,code);
    assert.equal(row.bodycomplete,true);
  });
}

for (const phase of ['dispatch','consume']) {
  void test(`${phase} deadline aborts real signal, disposes and never advances after late settlement`,async () => {
    const late = deferred(); let consuming = false;
    const f = fixture({dispatch:() => phase === 'dispatch' ? late.promise : {status:401,arrayBuffer() { consuming = true; return late.promise; }}});
    const pending = runDiagnostic(f);
    await until(() => f.dispatched.length === 1 && (phase === 'dispatch' || consuming));
    const signal = f.dispatched[0].options.signal;
    let aborts = 0;
    signal.addEventListener('abort',() => { aborts++; },{once:true});
    f.timers.fire(LIMITS.request);
    const result = await pending;
    stopped(result,f,1);
    assert.equal(signal.aborted,true);
    assert.equal(aborts,1);
    assert.equal(result.receipts.find(row => row.stage === 'request-deadline').bodycomplete,false);
    const frozenReceipt = JSON.stringify(result.receipts);
    late.resolve(phase === 'dispatch' ? response() : new TextEncoder().encode(RESPONSE_BODY).buffer);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(JSON.stringify(result.receipts),frozenReceipt);
    assert.equal(f.created.length,1);
  });
}

void test('abort-driven rejection is observed; no unhandled late rejection or second dispatch',async () => {
  const f = fixture({dispatch:(_cell,options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort',() => reject({code:'ABORT_ERR'}),{once:true}))});
  const pending = runDiagnostic(f);
  await until(() => f.dispatched.length === 1);
  f.timers.fire(LIMITS.request);
  stopped(await pending,f,1);
});

void test('startup rejection disposes known instance and dispatches zero',async () => {
  const f = fixture({ready:() => Promise.reject({code:'EPIPE'})});
  const result = await runDiagnostic(f);
  stopped(result,f,0);
  assert.equal(result.receipts[0].code,'EPIPE');
});

void test('startup deadline owns and disposes instance even when ready resolves late',async () => {
  const lateReady = deferred();
  const f = fixture({ready:() => lateReady.promise});
  const pending = runDiagnostic(f);
  await until(() => f.created.length === 1);
  f.timers.fire(LIMITS.startup);
  const result = await pending;
  stopped(result,f,0);
  assert.equal(result.receipts[0].code,'STARTUP_DEADLINE');
  assert.equal(result.receipts.at(-1).disposed,true);
  lateReady.resolve();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(f.created.length,1);
  assert.equal(f.closed.length,1);
  assert.equal(f.dispatched.length,0);
});

void test('startup deadline plus disposal waiting on late ready stays bounded and FAIL',async () => {
  const lateReady = deferred();
  const f = fixture({ready:() => lateReady.promise,dispose:() => lateReady.promise});
  const pending = runDiagnostic(f);
  await until(() => f.created.length === 1);
  f.timers.fire(LIMITS.startup);
  await until(() => f.closed.length === 1);
  f.timers.fire(LIMITS.dispose);
  const result = await pending;
  stopped(result,f,0);
  assert.equal(result.receipts.at(-1).disposed,false);
  lateReady.resolve();
});

void test('synchronous constructor failure is not a PASS or a completed disposal',async () => {
  const timers = fakeClock(); let creates = 0;
  const result = await runDiagnostic({timers,create() { creates++; throw {code:'EPERM'}; }});
  assert.equal(result.ok,false);
  assert.equal(creates,1);
  assert.equal(result.receipts[0].code,'EPERM');
  assert.equal(result.receipts.at(-1).attempts,0);
  assert.equal(result.receipts.at(-1).disposed,false);
});

for (const code of ['EACCES','EPERM','ERR_ACCESS_DENIED']) {
  void test(`permission denial ${code} immediately stops after first cell`,async () => {
    const f = fixture({dispatch:() => { throw {cause:{code}}; }});
    const result = await runDiagnostic(f);
    stopped(result,f,1);
    assert.equal(result.receipts.find(row => row.stage === 'dispatch').code,code);
  });
}

void test('dispose failure stops before second startup and prevents PASS',async () => {
  const f = fixture({dispose:() => { throw {code:'EPIPE'}; }});
  const result = await runDiagnostic(f);
  stopped(result,f,1);
  assert.equal(result.receipts.at(-1).disposed,false);
});

void test('dispose deadline stops before second startup and prevents PASS',async () => {
  const late = deferred(), f = fixture({dispose:() => late.promise});
  const pending = runDiagnostic(f);
  await until(() => f.closed.length === 1);
  f.timers.fire(LIMITS.dispose);
  const result = await pending;
  stopped(result,f,1);
  assert.equal(result.receipts.find(row => row.stage === 'dispose').code,'DISPOSE_DEADLINE');
  assert.equal(result.receipts.at(-1).disposed,false);
  late.resolve();
});

void test('sensitive error getters are never evaluated and no contents escape into receipts',async () => {
  const secret = 'SENSITIVE_GETTER_SENTINEL'; let reads = 0;
  const error = {};
  for (const key of ['code','cause','message','stack','headers','body','url','constructor']) {
    Object.defineProperty(error,key,{get() { reads++; throw new Error(secret); }});
  }
  assert.equal(safeCode(error),'UNCLASSIFIED');
  assert.equal(safeCode({code:secret,cause:{code:'ECONNRESET'}}),'ECONNRESET');
  const f = fixture({dispatch:() => { throw error; }});
  const result = await runDiagnostic(f);
  stopped(result,f,1);
  assert.equal(reads,0);
  assert.equal(JSON.stringify(result).includes(secret),false);
  for (const row of result.receipts) {
    assert.ok(Object.keys(row).every(key => ['stage','cell','size','status','bodycomplete','code','attempts','disposed'].includes(key)));
  }
});

void test('working lock permits only CRLF conversion, not content changes',() => {
  const canonical = Buffer.from('{\n"locked":true\n}\n');
  assert.equal(workingLockMatches(canonical,canonical),true);
  assert.equal(workingLockMatches(canonical,Buffer.from(canonical.toString().replace(/\n/g,'\r\n'))),true);
  assert.equal(workingLockMatches(canonical,Buffer.from('{\n"locked":false\n}\n')),false);
});

function assertWorkflowSource(raw) {
  // Accept checkout EOL conversion only, never erase semantic differences.
  assert.doesNotMatch(raw,/\r(?!\n)/);
  const workflow = raw.replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(workflow).digest('hex'),
    '223812f4b1c1a05096ea78c30aa488eecbc52d847e2d0f66fca699eae58d8d7a');
  assert.match(workflow,/on:\n  push:\n    branches: \['diagnostic\/windows-assets-pair-20261030'\]/);
  assert.equal((workflow.match(/^      - '(?:scripts|tests|\.github)\//gm) || []).length,3);
  assert.doesNotMatch(workflow,/^  (pull_request|workflow_dispatch|schedule):/m);
  assert.doesNotMatch(workflow,/continue-on-error|skip.?ci/i);
  assert.match(workflow,/timeout-minutes: 6/);
  assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow,/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow,/node-version: '24\.22\.1'/);
  const script = fs.readFileSync(new URL('../scripts/windows-assets-routing-diagnostic.mjs',import.meta.url),'utf8');
  assert.match(script,/assert\.equal\(process\.versions\.node,'24\.22\.1'\)/);
  assert.match(workflow,/npm ci --no-audit --no-fund/);
  assert.match(workflow,/node scripts\/sites-ci-preflight.mjs/);
}

void test('workflow has only exact diagnostic push, pinned actions, six-minute job and no bypass',() => {
  const source = fs.readFileSync(new URL('../.github/workflows/windows-assets-routing-diagnostic.yml',import.meta.url),'utf8');
  const lf = source.replace(/\r\n/g,'\n');
  assertWorkflowSource(source);
  assertWorkflowSource(lf);
  assertWorkflowSource(lf.replace(/\n/g,'\r\n'));
});

void test('EOL compatibility never accepts workflow trigger, limits, permissions or command mutations',() => {
  const source = fs.readFileSync(new URL('../.github/workflows/windows-assets-routing-diagnostic.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const mutations = [
    ['  push:', '  workflow_dispatch:'],
    ["branches: ['diagnostic/windows-assets-pair-20261030']", "branches: ['main']"],
    ['timeout-minutes: 6', 'timeout-minutes: 60'],
    ['contents: read', 'contents: write'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['node scripts/sites-ci-preflight.mjs', 'echo skip-preflight'],
    ['--run-windows-assets-routing', '--run-windows-assets-routing --retry'],
    ["node-version: '24.22.1'", "node-version: '24'"],
  ];
  for (const [before,after] of mutations) {
    assert.equal(source.split(before).length,2,'mutation anchor must be unique');
    const changed = source.replace(before,after);
    for (const value of [changed,changed.replace(/\n/g,'\r\n')]) {
      assert.throws(() => assertWorkflowSource(value),{code:'ERR_ASSERTION'});
    }
  }
  assert.throws(() => assertWorkflowSource(source.replace('on:\n','on:\r')),{code:'ERR_ASSERTION'});
});
