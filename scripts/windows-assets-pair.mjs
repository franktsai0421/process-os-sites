// One pure-synthetic SDK experiment. This is not an application test or gate replacement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {workingLockMatches} from './windows-transport-2x2.mjs';
export const ARMS=Object.freeze(['assets-off','assets-on']);
export const EXPECTED=Object.freeze({error:'IMPORT_CAPACITY_UNVERIFIED'});
export const WORKER='export default { fetch() { return Response.json({error:"IMPORT_CAPACITY_UNVERIFIED"},{status:409}); } };';
export function optionsFor(assets,directory,assetDirectory,log,outboundService){
 return {host:'127.0.0.1',port:0,modules:true,script:WORKER,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,log,defaultPersistRoot:directory,cachePersist:false,outboundService,...(assets?{assets:{directory:assetDirectory,routerConfig:{has_user_worker:true}}}:{})};
}
export function safeFailure(error){
 const codes=[],seen=new Set();let current=error;
 for(let n=0;n<3&&current&&typeof current==='object'&&!seen.has(current);n++){
  seen.add(current);
  try{
   const code=Object.getOwnPropertyDescriptor(current,'code');
   if(code&&Object.hasOwn(code,'value')&&['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_SOCKET','UND_ERR_ABORTED','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','EACCES','EPERM'].includes(code.value)&&!codes.includes(code.value))codes.push(code.value);
   const cause=Object.getOwnPropertyDescriptor(current,'cause');current=cause&&Object.hasOwn(cause,'value')?cause.value:null;
  }catch{break;}
 }
 return {type:error instanceof TypeError?'TypeError':error instanceof assert.AssertionError?'AssertionError':'Error',codes};
}
export async function runArms(createArm,makeSignal=()=>AbortSignal.timeout(5000)){
 const rows=[];
 for(const name of ARMS){
  const row={arm:name,requestAttempts:0,phase:'runtime-start',status:null,responseBodyBytes:null,disposed:false};let arm;
  try{
   arm=createArm(name==='assets-on');row.phase='runtime-ready';await arm.ready();
   row.phase='dispatch';row.requestAttempts=1;
   const response=await arm.dispatch('http://assets-pair.synthetic.invalid/api/snapshots/import?action=begin',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://assets-pair.synthetic.invalid'},body:'{}',signal:makeSignal()});
   row.phase='status';row.status=response.status;assert.equal(response.status,409);
   row.phase='response-body';const bytes=await response.arrayBuffer();row.responseBodyBytes=bytes.byteLength;
   row.phase='response-json';assert.deepEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),EXPECTED);
   row.phase='complete';row.outcome='EXPECTED_409_AND_JSON';
  }catch(error){row.outcome='FAILED';row.failure=safeFailure(error);}
  finally{try{if(arm){await arm.dispose();row.disposed=true;}}catch(error){row.outcome='DISPOSE_FAILED';row.disposeFailure=safeFailure(error);}}
  rows.push(row);
  if(row.requestAttempts===0||!row.disposed||row.failure?.codes.some(code=>['EACCES','EPERM'].includes(code)))break;
 }
 return rows;
}
export function classify(rows){
 if(rows.length!==2||rows.some(row=>row.requestAttempts!==1||!row.disposed))return 'INCOMPLETE_OR_SETUP_DISPOSAL_STOP';
 return rows.every(row=>row.outcome==='EXPECTED_409_AND_JSON')?'NOT_REPRODUCED_IN_TWO_ASSETS_CONTROLS':'ASSETS_PAIR_DIFFERENCE_OR_FAILURE_OBSERVED';
}
export async function main(){
 assert.equal(process.platform,'win32');assert.deepEqual(process.argv.slice(2),['--run-windows-assets-pair']);assert.equal(process.versions.node.split('.')[0],'24');
 const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
 const canonical=execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024}),working=fs.readFileSync(path.join(root,'package-lock.json'));
 assert.equal(createHash('sha256').update(canonical).digest('hex'),'46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b');assert.ok(workingLockMatches(canonical,working));
 const versions={miniflare:require('miniflare/package.json').version,workerd:require('workerd/package.json').version,undici:require(require.resolve('undici/package.json',{paths:[require.resolve('miniflare')]})).version};
 assert.deepEqual(versions,{miniflare:'4.20260515.0',workerd:'1.20260515.1',undici:'7.30.1'});
 const {assertLocalMode,configureOfflineLocal}=await import(pathToFileURL(path.join(root,'lib/local-runtime.mjs')));
 const {installLocalNetworkGuard}=await import(pathToFileURL(path.join(root,'lib/local-network-guard.mjs')));
 const {denyLocalWorkerOutbound}=await import(pathToFileURL(path.join(root,'lib/local-worker-outbound.mjs')));
 assertLocalMode();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'process-synthetic-assets-pair-'));
 const assetDirectory=path.join(directory,'empty-assets');fs.mkdirSync(assetDirectory);
 const report={schema:1,platform:process.platform,node:process.version,versions,stage:'preflight-complete',requestLimit:2,requestAttempts:0,rows:[],retries:0,productGateChanged:false,applicationLoaded:false,storageBindings:false,allDisposed:false};
 try{
  configureOfflineLocal(directory);installLocalNetworkGuard(directory);
  const {Miniflare,Log,LogLevel}=require('miniflare');
  report.stage='two-assets-controls';
  report.rows=await runArms(assets=>{
   const mf=new Miniflare(optionsFor(assets,directory,assetDirectory,new Log(LogLevel.NONE),denyLocalWorkerOutbound));
   return {ready:async()=>{const ready=await mf.ready;assert.equal(ready.hostname,'127.0.0.1');},dispatch:(input,init)=>{report.requestAttempts++;assert.ok(report.requestAttempts<=2);return mf.dispatchFetch(input,init);},dispose:()=>mf.dispose()};
  });
  report.allDisposed=report.rows.length>0&&report.rows.every(row=>row.disposed);
  report.outcome=classify(report.rows);report.stage='controls-complete';
 }catch(error){report.outcome='SETUP_OR_PERMISSION_BLOCKED';report.failedStage=report.stage;report.failure=safeFailure(error);}
 finally{
  if(report.allDisposed){try{fs.rmSync(directory,{recursive:true,force:false});}catch{report.outcome='CLEANUP_FAILED';}}
  console.log(JSON.stringify(report));
 }
 return report.outcome==='NOT_REPRODUCED_IN_TWO_ASSETS_CONTROLS'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().then(code=>{process.exitCode=code;},()=>{console.error(JSON.stringify({outcome:'PREFLIGHT_BLOCKED',stage:'platform-flag-node-lock-version-environment'}));process.exitCode=1;});
}
