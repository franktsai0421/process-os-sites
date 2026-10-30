// Synthetic transport evidence only: never a product fix or CI bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export const LOCK_HASH = '46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b';
export const VERSIONS = Object.freeze({miniflare:'4.20260515.0',workerd:'1.20260515.1',undici:'7.30.1'});
export const LIMITS = Object.freeze({startup:30000,request:5000,dispose:10000});
export const CELLS = Object.freeze(['assets-off','assets-on']);
export const RESPONSE_BODY = '{"error":"LOGIN_REQUIRED"}';
export const WORKER = `export default {
  fetch() {
    return new Response(${JSON.stringify(RESPONSE_BODY)}, {
      status:401, headers:{'Content-Type':'application/json'}
    });
  }
};`;

// Own data descriptors only: no message, stack, URL, headers or error getters.
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

export function workingLockMatches(canonical,working) {
  return canonical.equals(working) || Buffer.from(working.toString('utf8').replace(/\r\n/g,'\n')).equals(canonical);
}

async function bounded(action,milliseconds,timers,onDeadline = () => {}) {
  let timer;
  const deadline = new Promise(resolve => {
    timer = timers.set(() => { onDeadline(); resolve({deadline:true}); },milliseconds);
  });
  // Observe late rejections even if the deadline wins.
  const operation = Promise.resolve().then(action).then(value => ({value}),error => ({error}));
  try { return await Promise.race([operation,deadline]); }
  finally { timers.clear(timer); }
}

async function probe(runtime,cell,timers) {
  const controller = new AbortController();
  let stage = 'dispatch', status = null, bodycomplete = false;
  const outcome = await bounded(async () => {
    const response = await runtime.dispatchFetch('http://localhost/api/synthetic-auth',{
      method:'POST',body:new Uint8Array([1]),signal:controller.signal,redirect:'error',
      headers:{'Content-Type':'application/x-process-chunk-batch'},
    });
    if (controller.signal.aborted) return;
    const observedStatus = response.status;
    status = Number.isInteger(observedStatus) && observedStatus >= 100 && observedStatus <= 599 ? observedStatus : null;
    stage = 'consume';
    const bytes = await response.arrayBuffer();
    if (controller.signal.aborted) return;
    bodycomplete = true;
    if (status !== 401) return 'STATUS_MISMATCH';
    return Buffer.from(bytes).equals(Buffer.from(RESPONSE_BODY)) ? 'COMPLETE' : 'BODY_MISMATCH';
  },LIMITS.request,timers,() => controller.abort());
  if (outcome.deadline) return {stage:'request-deadline',cell,size:1,status,bodycomplete,code:'REQUEST_DEADLINE'};
  if (Object.hasOwn(outcome,'error')) {
    controller.abort();
    return {stage,cell,size:1,status,bodycomplete,code:safeCode(outcome.error)};
  }
  return {stage:'response',cell,size:1,status,bodycomplete,code:outcome.value};
}

export async function runDiagnostic({create,timers = {set:setTimeout,clear:clearTimeout}}) {
  const receipts = [];
  let attempts = 0, failed = false, allDisposed = true;
  for (const cell of CELLS) {
    let runtime, disposed = false;
    try {
      const startup = await bounded(async () => {
        // Contract: synchronous constructor, owned BEFORE awaiting ready. A late
        // ready cannot create a second, unowned instance after startup timeout.
        runtime = create(cell);
        assert.ok(runtime && typeof runtime.dispose === 'function' && typeof runtime.dispatchFetch === 'function');
        await runtime.ready;
      },LIMITS.startup,timers);
      if (startup.deadline || Object.hasOwn(startup,'error')) {
        failed = true;
        receipts.push({stage:'startup',cell,code:startup.deadline ? 'STARTUP_DEADLINE' : safeCode(startup.error)});
      } else {
        receipts.push({stage:'startup',cell,code:'READY'});
        assert.ok(attempts < 2);
        attempts++;
        const row = await probe(runtime,cell,timers);
        receipts.push(row);
        if (row.code !== 'COMPLETE') failed = true;
      }
    } catch (error) {
      failed = true;
      receipts.push({stage:'setup',cell,code:safeCode(error)});
    } finally {
      if (runtime && typeof runtime.dispose === 'function') {
        const disposal = await bounded(() => runtime.dispose(),LIMITS.dispose,timers);
        disposed = !disposal.deadline && !Object.hasOwn(disposal,'error');
        receipts.push({stage:'dispose',cell,disposed,code:disposal.deadline ? 'DISPOSE_DEADLINE' : disposed ? 'COMPLETE' : safeCode(disposal.error)});
      } else {
        receipts.push({stage:'dispose',cell,disposed:false,code:'NO_OWNED_RUNTIME'});
      }
      if (!disposed) { allDisposed = false; failed = true; }
    }
    // Stop on EVERY failure, including body mismatch and disposal failure.
    // Never advance while a timed-out request or startup may still be pending.
    if (failed) break;
  }
  const ok = !failed && attempts === 2 && allDisposed;
  receipts.push({stage:'summary',attempts,disposed:allDisposed,code:ok ? 'TWO_ATTEMPTS_NO_RESET_OBSERVED' : 'INCOMPLETE_OR_FAILED'});
  return {ok,receipts};
}

export function runtimeOptions(cell,directory,assetDirectory,{Log,LogLevel},outboundService) {
  assert.ok(CELLS.includes(cell));
  return {
    host:'127.0.0.1',port:0,modules:true,script:WORKER,
    compatibilityDate:'2026-05-15',cf:false,log:new Log(LogLevel.NONE),logRequests:false,
    defaultPersistRoot:directory,cachePersist:false,d1Persist:false,r2Persist:false,
    kvPersist:false,durableObjectsPersist:false,outboundService,
    handleRuntimeStdio:(stdout,stderr) => { stdout.resume(); stderr.resume(); },
    handleStructuredLogs:() => {},
    // Native router, not worker-first/static-routing bypass. No real assets.
    ...(cell === 'assets-on' ? {assets:{directory:assetDirectory,routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:false}}} : {}),
  };
}

export async function main() {
  const receipts = [];
  let directory, result, started = false, exitCode = 1;
  try {
    assert.equal(process.platform,'win32');
    assert.equal(process.env.GITHUB_ACTIONS,'true');
    assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
    assert.deepEqual(process.argv.slice(2),['--run-windows-assets-routing']);
    assert.equal(process.versions.node,'24.22.1');
    const root = process.cwd(), require = createRequire(path.join(root,'package.json'));
    const canonical = execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024});
    assert.equal(createHash('sha256').update(canonical).digest('hex'),LOCK_HASH);
    assert.ok(workingLockMatches(canonical,fs.readFileSync(path.join(root,'package-lock.json'))));
    const lock = JSON.parse(canonical);
    for (const name of Object.keys(VERSIONS)) {
      assert.equal(lock.packages[`node_modules/${name}`].version,VERSIONS[name]);
      assert.equal(require(`${name}/package.json`).version,VERSIONS[name]);
    }
    // Also verify the actual Undici resolution used by Miniflare.
    assert.equal(require(require.resolve('undici/package.json',{paths:[require.resolve('miniflare')]})).version,VERSIONS.undici);
    const {assertLocalMode,configureOfflineLocal} = await import(pathToFileURL(path.join(root,'lib/local-runtime.mjs')));
    const {installLocalNetworkGuard} = await import(pathToFileURL(path.join(root,'lib/local-network-guard.mjs')));
    const {denyLocalWorkerOutbound} = await import(pathToFileURL(path.join(root,'lib/local-worker-outbound.mjs')));
    assertLocalMode();
    directory = fs.mkdtempSync(path.join(os.tmpdir(),'process-assets-routing-synthetic-'));
    const assetDirectory = path.join(directory,'synthetic-static');
    fs.mkdirSync(assetDirectory);
    fs.writeFileSync(path.join(assetDirectory,'diagnostic.txt'),'synthetic only\n',{flag:'wx'});
    configureOfflineLocal(directory);
    installLocalNetworkGuard(directory);
    const miniflare = require('miniflare');
    receipts.push({stage:'preflight',code:'LOCKED_OFFLINE',versions:{node:process.version,...VERSIONS},hash:LOCK_HASH});
    started = true;
    result = await runDiagnostic({create:cell => new miniflare.Miniflare(runtimeOptions(cell,directory,assetDirectory,miniflare,denyLocalWorkerOutbound))});
    receipts.push(...result.receipts);
    exitCode = result.ok ? 0 : 1;
  } catch (error) {
    receipts.push({stage:'preflight',code:safeCode(error)});
  } finally {
    // Do not remove a directory that may still belong to a failed disposal.
    if (directory && (!started || result?.receipts.at(-1).disposed === true)) {
      try { fs.rmSync(directory,{recursive:true,force:false}); }
      catch (error) { exitCode = 1; receipts.push({stage:'cleanup',code:safeCode(error)}); }
    }
    for (const receipt of receipts) fs.writeSync(1,JSON.stringify(receipt)+'\n');
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // A bounded failure must not leave native handles alive or permit a next cell.
  main().then(code => process.exit(code),() => {
    fs.writeSync(1,JSON.stringify({stage:'fatal',code:'UNCLASSIFIED'})+'\n');
    process.exit(1);
  });
}
