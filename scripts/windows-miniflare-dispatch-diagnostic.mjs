// Isolated diagnostic, not a product fix or a replacement for Local safety.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export const LOCK_HASH = '46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b';
export const VERSIONS = Object.freeze({miniflare:'4.20260515.0',workerd:'1.20260515.1'});
export const LIMITS = Object.freeze({startup:30000,cell:5000,dispose:10000});
export const CELLS = Object.freeze([1,9000].flatMap(size => ['no-read','read'].map(cell => Object.freeze({cell,size}))));
export const WORKER = `export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/no-read' && pathname !== '/read') return new Response(null, {status:404});
    if (pathname === '/read') await request.arrayBuffer();
    return new Response(null, {status:413});
  }
};`;

// Never read error messages, stacks, headers, URLs or accessor properties.
export function safeCode(error) {
  let current = error, fallback = 'UNCLASSIFIED';
  for (let depth = 0; depth < 3; depth++) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(current,'code');
      const code = descriptor && Object.hasOwn(descriptor,'value') ? descriptor.value : null;
      if (['EACCES','EPERM','ERR_ACCESS_DENIED'].includes(code)) return code;
      if (['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENOENT','UND_ERR_SOCKET','ABORT_ERR'].includes(code)) fallback = code;
      const cause = Object.getOwnPropertyDescriptor(current,'cause');
      if (!cause || !Object.hasOwn(cause,'value')) break;
      current = cause.value;
    } catch { break; }
  }
  return fallback;
}
const permissionCode = code => ['EACCES','EPERM','ERR_ACCESS_DENIED'].includes(code);
export function workingLockMatches(canonical,working) {
  return canonical.equals(working) || Buffer.from(working.toString('utf8').replace(/\r\n/g,'\n')).equals(canonical);
}

// Timeout actively aborts dispatchFetch, not just Promise.race. The caller must
// stop the matrix on timeout; disposal then bounds even an abort-ignoring peer.
async function bounded(action,milliseconds,timers,onDeadline = () => {}) {
  let timer;
  const deadline = new Promise(resolve => {
    timer = timers.set(() => { onDeadline(); resolve({deadline:true}); },milliseconds);
  });
  const operation = Promise.resolve().then(action).then(value => ({value}),error => ({error}));
  try { return await Promise.race([operation,deadline]); }
  finally { timers.clear(timer); }
}

export async function probe(runtime,{cell,size},timers) {
  assert.ok(CELLS.some(item => item.cell === cell && item.size === size));
  const controller = new AbortController();
  let stage = 'dispatch', status = null, bodycomplete = false;
  const result = await bounded(async () => {
    const response = await runtime.dispatchFetch(`http://localhost/${cell}`,{
      method:'POST',body:Buffer.alloc(size,120),signal:controller.signal,redirect:'error',
    });
    if (controller.signal.aborted) return;
    status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    stage = 'consume';
    const bytes = await response.arrayBuffer();
    if (controller.signal.aborted) return;
    bodycomplete = true;
    return status === 413 && bytes.byteLength === 0 ? 'COMPLETE' : 'UNEXPECTED_RESPONSE';
  },LIMITS.cell,timers,() => controller.abort());
  if (result.deadline) return {stage:'deadline',cell,size,status,bodycomplete,code:'CELL_DEADLINE'};
  if (Object.hasOwn(result,'error')) {
    controller.abort();
    return {stage,cell,size,status,bodycomplete,code:safeCode(result.error)};
  }
  return {stage:'complete',cell,size,status,bodycomplete,code:result.value};
}

export async function runDiagnostic({create,timers = {set:setTimeout,clear:clearTimeout}}) {
  const receipts = [];
  let runtime, attempts = 0, disposed = false, failed = false;
  try {
    // The factory must be synchronous, so a timed-out startup cannot create a
    // late, unowned runtime. Miniflare's constructor is synchronous.
    const startup = await bounded(async () => {
      runtime = create();
      assert.ok(runtime && typeof runtime.dispose === 'function' && typeof runtime.dispatchFetch === 'function');
      await runtime.ready;
    },LIMITS.startup,timers);
    if (startup.deadline || Object.hasOwn(startup,'error')) {
      failed = true;
      receipts.push({stage:'startup',code:startup.deadline ? 'STARTUP_DEADLINE' : safeCode(startup.error)});
    } else {
      receipts.push({stage:'startup',code:'READY'});
      for (const cell of CELLS) {
        assert.ok(attempts < 4);
        attempts++;
        const row = await probe(runtime,cell,timers);
        receipts.push(row);
        if (row.code !== 'COMPLETE') failed = true;
        // No warm-up or retry. Never advance after timeout or permission denial.
        if (row.code === 'CELL_DEADLINE' || permissionCode(row.code)) break;
      }
    }
  } catch (error) {
    failed = true;
    receipts.push({stage:'setup',code:safeCode(error)});
  } finally {
    if (runtime) {
      const result = await bounded(() => runtime.dispose(),LIMITS.dispose,timers);
      disposed = !result.deadline && !Object.hasOwn(result,'error');
      receipts.push({stage:'dispose',disposed,code:result.deadline ? 'DISPOSE_DEADLINE' : disposed ? 'COMPLETE' : safeCode(result.error)});
    } else {
      disposed = true;
      receipts.push({stage:'dispose',disposed,code:'NOT_CREATED'});
    }
  }
  const ok = !failed && attempts === 4 && disposed;
  receipts.push({stage:'summary',attempts,disposed,code:ok ? 'FOUR_ATTEMPTS_NO_RESET_OBSERVED' : 'INCOMPLETE_OR_FAILED'});
  return {ok,receipts};
}

export function runtimeOptions(directory,{Log,LogLevel},denyLocalWorkerOutbound) {
  return {
    host:'127.0.0.1',port:0,modules:true,script:WORKER,
    compatibilityDate:'2026-05-15',cf:false,log:new Log(LogLevel.NONE),logRequests:false,
    defaultPersistRoot:directory,cachePersist:false,d1Persist:false,r2Persist:false,
    kvPersist:false,durableObjectsPersist:false,outboundService:denyLocalWorkerOutbound,
    // Consume and discard native diagnostics; never print runtime message/stack.
    handleRuntimeStdio:(stdout,stderr) => { stdout.resume(); stderr.resume(); },
    handleStructuredLogs:() => {},
  };
}

export async function main() {
  const receipts = [];
  let directory, result, code = 1;
  try {
    assert.equal(process.platform,'win32');
    assert.equal(process.env.GITHUB_ACTIONS,'true');
    assert.deepEqual(process.argv.slice(2),['--run-windows-dispatch']);
    assert.equal(process.versions.node.split('.')[0],'24');
    const root = process.cwd(), require = createRequire(path.join(root,'package.json'));
    const canonical = execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024});
    assert.equal(createHash('sha256').update(canonical).digest('hex'),LOCK_HASH);
    assert.ok(workingLockMatches(canonical,fs.readFileSync(path.join(root,'package-lock.json'))));
    const lock = JSON.parse(canonical);
    for (const name of ['miniflare','workerd']) {
      assert.equal(lock.packages[`node_modules/${name}`].version,VERSIONS[name]);
      assert.equal(require(`${name}/package.json`).version,VERSIONS[name]);
    }
    const {assertLocalMode,configureOfflineLocal} = await import(pathToFileURL(path.join(root,'lib/local-runtime.mjs')));
    const {installLocalNetworkGuard} = await import(pathToFileURL(path.join(root,'lib/local-network-guard.mjs')));
    const {denyLocalWorkerOutbound} = await import(pathToFileURL(path.join(root,'lib/local-worker-outbound.mjs')));
    assertLocalMode();
    directory = fs.mkdtempSync(path.join(os.tmpdir(),'process-dispatch-synthetic-'));
    configureOfflineLocal(directory);
    installLocalNetworkGuard(directory);
    const miniflare = require('miniflare');
    receipts.push({stage:'preflight',code:'LOCKED_OFFLINE',versions:{node:process.version,...VERSIONS},hash:LOCK_HASH});
    result = await runDiagnostic({create:() => new miniflare.Miniflare(runtimeOptions(directory,miniflare,denyLocalWorkerOutbound))});
    receipts.push(...result.receipts);
    code = result.ok ? 0 : 1;
  } catch (error) {
    receipts.push({stage:'preflight',code:safeCode(error),attempts:0,disposed:true});
  } finally {
    if (directory && (!result || result.receipts.at(-1).disposed)) {
      try { fs.rmSync(directory,{recursive:true,force:false}); }
      catch (error) { code = 1; receipts.push({stage:'cleanup',code:safeCode(error)}); }
    }
    // Synchronous, bounded output is flushed before the explicit process exit.
    for (const receipt of receipts) fs.writeSync(1,JSON.stringify(receipt)+'\n');
  }
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Terminate lingering handles after a bounded startup/cell/dispose failure;
  // never leave a timed-out request running behind a later probe.
  main().then(code => process.exit(code),() => {
    fs.writeSync(1,JSON.stringify({stage:'fatal',code:'UNCLASSIFIED'})+'\n');
    process.exit(1);
  });
}
