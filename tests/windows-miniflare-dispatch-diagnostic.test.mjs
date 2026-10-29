import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CELLS,LIMITS,LOCK_HASH,VERSIONS,WORKER,workingLockMatches,safeCode,
  runDiagnostic,runtimeOptions,
} from '../scripts/windows-miniflare-dispatch-diagnostic.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const emptyResponse = () => ({status:413,arrayBuffer:async () => new ArrayBuffer(0)});
function harness(overrides = {}) {
  const calls = [], timers = new Map();
  let disposed = 0;
  const runtime = {
    ready:Promise.resolve(),
    dispatchFetch:async (url,init) => { calls.push({url,init}); return emptyResponse(); },
    dispose:async () => { disposed++; },
    ...overrides,
  };
  return {
    runtime,calls,get disposed() { return disposed; },
    options:{create:() => runtime,timers:{
      set:(callback,ms) => { const id = {}; timers.set(id,{callback,ms}); return id; },
      clear:id => timers.delete(id),
    }},
    fire(ms) {
      const matches = [...timers.entries()].filter(([,timer]) => timer.ms === ms);
      assert.equal(matches.length,1);
      const [id,timer] = matches[0]; timers.delete(id); timer.callback();
    },
    timers,
  };
}
const cells = result => result.receipts.filter(row => Object.hasOwn(row,'cell'));
const summary = result => result.receipts.at(-1);

void test('exactly four fixed sequential POSTs; consume each response before next',async () => {
  let active = false, consumed = 0;
  const h = harness();
  h.runtime.dispatchFetch = async (url,init) => {
    assert.equal(active,false); active = true;
    h.calls.push({url,init});
    return {status:413,arrayBuffer:async () => {
      await tick(); consumed++; active = false; return new ArrayBuffer(0);
    }};
  };
  const result = await runDiagnostic(h.options);
  assert.equal(result.ok,true);
  assert.deepEqual(CELLS,[{cell:'no-read',size:1},{cell:'read',size:1},{cell:'no-read',size:9000},{cell:'read',size:9000}]);
  assert.equal(h.calls.length,4); assert.equal(consumed,4); assert.equal(h.disposed,1);
  h.calls.forEach(({url,init},index) => {
    assert.equal(url,`http://localhost/${CELLS[index].cell}`);
    assert.equal(init.method,'POST'); assert.equal(init.redirect,'error');
    assert.equal(init.body.length,CELLS[index].size);
    assert.ok(init.body.every(byte => byte === 120));
    assert.ok(init.signal instanceof AbortSignal);
  });
  assert.ok(cells(result).every(row => row.status === 413 && row.bodycomplete && row.code === 'COMPLETE'));
  assert.equal(summary(result).code,'FOUR_ATTEMPTS_NO_RESET_OBSERVED');
  assert.equal(h.timers.size,0);
});

void test('actual generated Worker only consumes read requests; same empty 413 for all four',async () => {
  const worker = (await import(`data:text/javascript,${encodeURIComponent(WORKER)}`)).default;
  for (const {cell,size} of CELLS) {
    let reads = 0;
    const response = await worker.fetch({url:`http://localhost/${cell}`,arrayBuffer:async () => {
      reads++; return new ArrayBuffer(size);
    }});
    assert.equal(reads,cell === 'read' ? 1 : 0);
    assert.equal(response.status,413);
    assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  assert.equal((await worker.fetch({url:'http://localhost/unknown',arrayBuffer:() => assert.fail()})).status,404);
});

void test('settled failure before response preserves null status and is not a pass',async () => {
  const h = harness(); let count = 0;
  h.runtime.dispatchFetch = async () => {
    count++;
    if (count === 1) throw {cause:{code:'ECONNRESET'}};
    return emptyResponse();
  };
  const result = await runDiagnostic(h.options);
  assert.equal(result.ok,false); assert.equal(count,4);
  assert.deepEqual(cells(result)[0],{stage:'dispatch',cell:'no-read',size:1,status:null,bodycomplete:false,code:'ECONNRESET'});
  assert.equal(summary(result).code,'INCOMPLETE_OR_FAILED');
});

void test('response consumption error preserves 413 but body remains incomplete and aborts signal',async () => {
  const h = harness(); let signal, count = 0;
  h.runtime.dispatchFetch = async (_url,init) => {
    if (++count !== 1) return emptyResponse();
    signal = init.signal;
    return {status:413,arrayBuffer:async () => { throw {code:'UND_ERR_SOCKET'}; }};
  };
  const result = await runDiagnostic(h.options);
  assert.equal(result.ok,false); assert.equal(signal.aborted,true);
  assert.deepEqual(cells(result)[0],{stage:'consume',cell:'no-read',size:1,status:413,bodycomplete:false,code:'UND_ERR_SOCKET'});
});

void test('wrong status or nonempty response cannot produce success',async () => {
  for (const response of [{status:200,arrayBuffer:async () => new ArrayBuffer(0)},{status:413,arrayBuffer:async () => new ArrayBuffer(1)}]) {
    const h = harness({dispatchFetch:async () => response});
    const result = await runDiagnostic(h.options);
    assert.equal(result.ok,false);
    assert.ok(cells(result).every(row => row.bodycomplete && row.code === 'UNEXPECTED_RESPONSE'));
  }
});

void test('dispatch deadline really aborts and stops at one attempt even if transport ignores abort',async () => {
  const h = harness(); let signal, resolveLate, count = 0, consumed = 0;
  h.runtime.dispatchFetch = (_url,init) => {
    count++; signal = init.signal;
    return new Promise(resolve => { resolveLate = resolve; });
  };
  const running = runDiagnostic(h.options); await tick();
  h.fire(LIMITS.cell);
  const result = await running;
  assert.equal(signal.aborted,true); assert.equal(result.ok,false);
  assert.equal(count,1); assert.equal(summary(result).attempts,1); assert.equal(h.disposed,1);
  assert.equal(cells(result)[0].code,'CELL_DEADLINE');
  const snapshot = JSON.stringify(result);
  resolveLate({status:413,arrayBuffer:async () => { consumed++; return new ArrayBuffer(0); }});
  await tick();
  assert.equal(count,1); assert.equal(consumed,0); assert.equal(JSON.stringify(result),snapshot);
});

void test('deadline includes response consumption; abort rejection cannot continue the matrix',async () => {
  const h = harness(); let signal, count = 0, cancelled = false;
  h.runtime.dispatchFetch = async (_url,init) => {
    count++; signal = init.signal;
    return {status:413,arrayBuffer:() => new Promise((_resolve,reject) => {
      signal.addEventListener('abort',() => { cancelled = true; reject({code:'ABORT_ERR'}); },{once:true});
    })};
  };
  const running = runDiagnostic(h.options); await tick(); h.fire(LIMITS.cell);
  const result = await running;
  assert.equal(cancelled,true); assert.equal(signal.aborted,true);
  assert.equal(count,1); assert.equal(result.ok,false);
  assert.equal(cells(result)[0].status,413); assert.equal(cells(result)[0].bodycomplete,false);
});

void test('permission denial stops immediately including a nested cause',async () => {
  for (const code of ['EACCES','EPERM','ERR_ACCESS_DENIED']) {
    const h = harness(); let count = 0;
    h.runtime.dispatchFetch = async () => { count++; throw {code:'UND_ERR_SOCKET',cause:{code}}; };
    const result = await runDiagnostic(h.options);
    assert.equal(count,1); assert.equal(h.disposed,1); assert.equal(result.ok,false);
    assert.equal(cells(result)[0].code,code);
  }
});

void test('startup rejection and synchronous constructor failure never dispatch',async () => {
  const h = harness();
  Object.defineProperty(h.runtime,'ready',{get() { throw {code:'EPERM'}; }});
  let result = await runDiagnostic(h.options);
  assert.equal(result.ok,false); assert.equal(h.calls.length,0); assert.equal(h.disposed,1);
  assert.equal(result.receipts[0].code,'EPERM');
  result = await runDiagnostic({...h.options,create:() => { throw {code:'EACCES'}; }});
  assert.equal(result.ok,false); assert.equal(summary(result).attempts,0);
  assert.equal(result.receipts[0].code,'EACCES');
});

void test('startup deadline disposes and never dispatches even after late readiness',async () => {
  let ready;
  const h = harness({ready:new Promise(resolve => { ready = resolve; })});
  const running = runDiagnostic(h.options); await tick(); h.fire(LIMITS.startup);
  const result = await running;
  assert.equal(result.ok,false); assert.equal(h.disposed,1);
  assert.equal(result.receipts[0].code,'STARTUP_DEADLINE');
  ready(); await tick(); assert.equal(h.calls.length,0);
});

void test('dispose rejection and deadline invalidate an otherwise complete matrix',async () => {
  const rejected = harness({dispose:async () => { throw {code:'EPERM'}; }});
  let result = await runDiagnostic(rejected.options);
  assert.equal(result.ok,false); assert.equal(summary(result).disposed,false);
  assert.equal(result.receipts.at(-2).code,'EPERM');
  const hanging = harness({dispose:() => new Promise(() => {})});
  const running = runDiagnostic(hanging.options); await tick(); hanging.fire(LIMITS.dispose);
  result = await running;
  assert.equal(result.ok,false); assert.equal(summary(result).disposed,false);
  assert.equal(result.receipts.at(-2).code,'DISPOSE_DEADLINE');
});

void test('sensitive error/response getters are not read or serialized',async () => {
  let reads = 0;
  const error = {code:'ECONNRESET'};
  for (const field of ['message','stack','url','headers','body','cause']) Object.defineProperty(error,field,{get() { reads++; throw Error('SENSITIVE'); }});
  assert.equal(safeCode(error),'ECONNRESET');
  assert.equal(safeCode(Object.create({code:'EACCES'})),'UNCLASSIFIED');
  assert.equal(safeCode({code:'SECRET_VALUE'}),'UNCLASSIFIED');
  const getterCode = {};
  Object.defineProperty(getterCode,'code',{get() { reads++; throw Error('SENSITIVE'); }});
  assert.equal(safeCode(getterCode),'UNCLASSIFIED');
  const response = emptyResponse();
  for (const field of ['url','headers','body']) Object.defineProperty(response,field,{get() { reads++; throw Error('SENSITIVE'); }});
  let count = 0;
  const h = harness({dispatchFetch:async () => { if (++count === 1) throw error; return response; }});
  const result = await runDiagnostic(h.options);
  assert.equal(reads,0);
  assert.doesNotMatch(JSON.stringify(result),/SENSITIVE|SECRET_VALUE/);
  const allowed = new Set(['stage','cell','size','status','bodycomplete','code','attempts','disposed']);
  for (const row of result.receipts) for (const key of Object.keys(row)) assert.ok(allowed.has(key));
});

void test('lock permits EOL only and versions, limits and no-storage options stay fixed',() => {
  const canonical = Buffer.from('a\nb\n');
  assert.ok(workingLockMatches(canonical,Buffer.from('a\r\nb\r\n')));
  assert.ok(workingLockMatches(canonical,canonical));
  assert.equal(workingLockMatches(canonical,Buffer.from('a\nb \n')),false);
  assert.equal(LOCK_HASH,'46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b');
  assert.deepEqual(VERSIONS,{miniflare:'4.20260515.0',workerd:'1.20260515.1'});
  assert.deepEqual(LIMITS,{startup:30000,cell:5000,dispose:10000});
  const deny = () => {}, options = runtimeOptions('synthetic-only',{Log:class {},LogLevel:{NONE:0}},deny);
  assert.equal(options.script,WORKER); assert.equal(options.outboundService,deny);
  assert.equal(options.host,'127.0.0.1'); assert.equal(options.port,0); assert.equal(options.cf,false);
  for (const key of ['cachePersist','d1Persist','r2Persist','kvPersist','durableObjectsPersist']) assert.equal(options[key],false);
  for (const key of ['assets','d1Databases','r2Buckets','kvNamespaces','bindings','serviceBindings']) assert.equal(Object.hasOwn(options,key),false);
});

void test('workflow is restricted to PR 49 and three paths, retains normal install and source guard',() => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/windows-miniflare-dispatch-diagnostic.yml',import.meta.url),'utf8');
  assert.match(workflow,/github\.event\.pull_request\.number == 49/);
  assert.equal((workflow.match(/^      - '/gm) || []).length,3);
  for (const value of ['contents: read','persist-credentials: false','timeout-minutes: 6',"node-version: '24'",'npm ci --no-audit --no-fund','node scripts/sites-ci-preflight.mjs']) assert.ok(workflow.includes(value));
  assert.doesNotMatch(workflow,/continue-on-error|pull_request_target|workflow_dispatch|ignore-scripts|\[skip ci\]/);
  assert.match(workflow,/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow,/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
});
