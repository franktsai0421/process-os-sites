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
export const CASES=Object.freeze([
 {cell:'unread-1',read:false,bytes:1},{cell:'read-1',read:true,bytes:1},
 {cell:'unread-9000',read:false,bytes:9000},{cell:'read-9000',read:true,bytes:9000},
]);
export const WORKER='export default { async fetch(request) { if(new URL(request.url).pathname === "/read") await request.arrayBuffer(); return new Response(null,{status:413}); } };';
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
export async function runCases(dispatch,makeSignal=()=>AbortSignal.timeout(5000)){
 const rows=[];
 for(const spec of CASES){
  const row={cell:spec.cell,bodyBytes:spec.bytes,attempts:1,status:null,phase:'dispatch',responseBodyBytes:null};
  try{
   const response=await dispatch(`http://miniflare-transport.synthetic.invalid/${spec.read?'read':'unread'}`,{method:'POST',headers:{'Content-Type':'application/x-process-chunk-batch'},body:new Uint8Array(spec.bytes),signal:makeSignal()});
   row.phase='status';row.status=response.status;assert.equal(response.status,413);
   row.phase='response-body';row.responseBodyBytes=(await response.arrayBuffer()).byteLength;assert.equal(row.responseBodyBytes,0);
   row.phase='complete';row.outcome='EXPECTED_413_AND_EMPTY_BODY';
  }catch(error){row.outcome='FAILED';row.failure=safeFailure(error);}
  rows.push(row);
  if(row.failure?.codes.some(code=>['EACCES','EPERM'].includes(code)))break;
 }
 return rows;
}
export function classify(rows){
 if(rows.length!==4)return 'INCOMPLETE_OR_PERMISSION_STOP';
 return rows.every(row=>row.outcome==='EXPECTED_413_AND_EMPTY_BODY')?'NOT_REPRODUCED_IN_FOUR_SDK_REQUESTS':'SDK_TRANSPORT_OR_RESPONSE_DIFFERENCE_OBSERVED';
}
export async function main(){
 assert.equal(process.platform,'win32');assert.deepEqual(process.argv.slice(2),['--run-windows-miniflare-four']);assert.equal(process.versions.node.split('.')[0],'24');
 const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
 const canonical=execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024}),working=fs.readFileSync(path.join(root,'package-lock.json'));
 assert.equal(createHash('sha256').update(canonical).digest('hex'),'46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b');assert.ok(workingLockMatches(canonical,working));
 const versions={miniflare:require('miniflare/package.json').version,workerd:require('workerd/package.json').version,undici:require(require.resolve('undici/package.json',{paths:[require.resolve('miniflare')]})).version};
 assert.deepEqual(versions,{miniflare:'4.20260515.0',workerd:'1.20260515.1',undici:'7.30.1'});
 const {assertLocalMode,configureOfflineLocal}=await import(pathToFileURL(path.join(root,'lib/local-runtime.mjs')));
 const {installLocalNetworkGuard}=await import(pathToFileURL(path.join(root,'lib/local-network-guard.mjs')));
 const {denyLocalWorkerOutbound}=await import(pathToFileURL(path.join(root,'lib/local-worker-outbound.mjs')));
 assertLocalMode();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'process-synthetic-sdk-four-'));
 const report={schema:1,platform:process.platform,node:process.version,versions,stage:'preflight-complete',requestLimit:4,requestAttempts:0,rows:[],retries:0,productGateChanged:false,applicationLoaded:false,assets:false,storageBindings:false,disposed:false};
 let mf;
 try{
  configureOfflineLocal(directory);installLocalNetworkGuard(directory);
  const {Miniflare,Log,LogLevel}=require('miniflare');
  report.stage='runtime-start';
  mf=new Miniflare({host:'127.0.0.1',port:0,modules:true,script:WORKER,compatibilityDate:'2026-05-15',cf:false,log:new Log(LogLevel.NONE),defaultPersistRoot:directory,cachePersist:false,outboundService:denyLocalWorkerOutbound});
  report.stage='runtime-ready';const ready=await mf.ready;assert.equal(ready.hostname,'127.0.0.1');
  report.stage='four-sdk-requests';
  report.rows=await runCases((input,init)=>{report.requestAttempts++;assert.ok(report.requestAttempts<=4);return mf.dispatchFetch(input,init);});
  report.outcome=classify(report.rows);report.stage='requests-complete';
 }catch(error){report.outcome='SETUP_OR_PERMISSION_BLOCKED';report.failedStage=report.stage;report.failure=safeFailure(error);}
 finally{
  try{if(mf)await mf.dispose();report.disposed=true;}catch(error){report.outcome='DISPOSE_FAILED';report.failure=safeFailure(error);}
  if(report.disposed){try{fs.rmSync(directory,{recursive:true,force:false});}catch{report.outcome='CLEANUP_FAILED';}}
  console.log(JSON.stringify(report));
 }
 return report.outcome==='NOT_REPRODUCED_IN_FOUR_SDK_REQUESTS'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().then(code=>{process.exitCode=code;},()=>{console.error(JSON.stringify({outcome:'PREFLIGHT_BLOCKED',stage:'platform-flag-node-lock-version-environment'}));process.exitCode=1;});
}
