import {spawn} from 'node:child_process';
import {checkSitesSource} from './sites-source-check.mjs';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import outputSafety from '../lib/build-output-safety.cjs';
import {requireProgramCommit} from '../lib/sites-publication-readiness.mjs';

export async function runLocalBuild({spawnChild=spawn,emit=(dto)=>process.stdout.write(JSON.stringify(dto)+'\n')}={}) {
  requireProgramCommit(process.env);
  checkSitesSource();
  const capture=outputSafety.createBuildOutputSafety();
  let child,spawnCode=null,captureFailed=false;
  // A source-only fresh-Site projection can reuse the same installed ancestor
  // dependency tree. Node resolves the package normally; exact input bytes and
  // version must match. No symlink, global SDK, environment override or reinstall.
  const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.resolve('vinext'))),'..');
  const dependencyRoot=path.resolve(packageRoot,'..','..'),projectRoot=fs.realpathSync(process.cwd());
  if(projectRoot!==dependencyRoot&&!projectRoot.startsWith(dependencyRoot+path.sep))throw Error('BUILD_DEPENDENCY_ROOT_MISMATCH');
  const declared=JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8')),installed=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8'));
  if(installed.name!=='vinext'||installed.version!==declared.dependencies.vinext||!fs.readFileSync(path.join(projectRoot,'package-lock.json')).equals(fs.readFileSync(path.join(dependencyRoot,'package-lock.json'))))throw Error('BUILD_DEPENDENCY_INPUT_MISMATCH');
  const argv=['--import',pathToFileURL(path.resolve('scripts/local-network-preload.mjs')).href,path.join(packageRoot,'dist/cli.js'),'build'];
  try { child=spawnChild(process.execPath,argv,{stdio:['inherit','pipe','pipe'],env:process.env}); }
  catch(e) { spawnCode=typeof e?.code==='string'?e.code:'OTHER_SPAWN_ERROR';const dto=capture.finish(null,null,spawnCode);emit(dto);return dto.exitCode; }
  for(const channel of ['stdout','stderr']) {
    if(!child[channel]) {captureFailed=true;continue;}
    child[channel].on('data',chunk=>{try{capture.push(channel,chunk);}catch{captureFailed=true;}});
  }
  child.on('error',e=>{spawnCode=typeof e?.code==='string'?e.code:'OTHER_SPAWN_ERROR';});
  // Forward only to this exact spawned child, retain its real close/exit status, and remove only our listeners.
  // Windows child.kill is best-effort delivery, not a claim of POSIX graceful shutdown.
  let forwardedSignal=null,signalForwardFailed=false;
  const forward=signal=>{if(forwardedSignal)return;forwardedSignal=signal;try{if(!child.kill(signal))signalForwardFailed=true;}catch{signalForwardFailed=true;}};
  const onInt=()=>forward('SIGINT'),onTerm=()=>forward('SIGTERM');
  process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
  const closed=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
  const dto=capture.finish(closed.code,closed.signal,spawnCode);
  dto.forwardedSignal=forwardedSignal;dto.signalForwardFailed=signalForwardFailed;
  if(forwardedSignal||signalForwardFailed){dto.status='FAIL_BUILD_RETAIN_ARTIFACTS_AND_SAFE_DIAGNOSTICS';if(dto.exitCode===0)dto.exitCode=1;}
  if(captureFailed) {dto.status='FAIL_BUILD_RETAIN_ARTIFACTS_AND_SAFE_DIAGNOSTICS';if(dto.exitCode===0)dto.exitCode=1;dto.captureProtocolFailure=true;}
  emit(dto);return dto.exitCode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode=await runLocalBuild();
}
