// Diagnostic only: no application modules, credentials, storage, or product gate replacement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const CELLS = Object.freeze(['direct-unread','direct-read','service-unread','service-read']);
export const SIZES = Object.freeze([1,9000]);
export const REQUEST_LIMIT = 8;
export function workingLockMatches(canonical,working) {
 return canonical.equals(working) || Buffer.from(working.toString('utf8').replace(/\r\n/g,'\n')).equals(canonical);
}
export const WORKERS = Object.freeze({
 unread: 'export default { async fetch() { return new Response(null, {status:413}); } };',
 read: 'export default { async fetch(request) { await request.arrayBuffer(); return new Response(null, {status:413}); } };',
 forward: 'export default { async fetch(request, env) { return env.TARGET.fetch(request); } };',
 deny: 'export default { async fetch() { return new Response(null, {status:599}); } };',
});
export function configText() {
 const worker=(source,target)=>`(modules=[(name="worker.js",esModule=${JSON.stringify(source)})],compatibilityDate="2026-05-15"${target?`,bindings=[(name="TARGET",service="${target}")]`:''})`;
 return `using Workerd = import "/workerd/workerd.capnp";\nconst config :Workerd.Config = (\n services=[\n (name="internet",worker=${worker(WORKERS.deny)}),\n (name="direct-unread",worker=${worker(WORKERS.unread)}),\n (name="direct-read",worker=${worker(WORKERS.read)}),\n (name="service-unread",worker=${worker(WORKERS.forward,'direct-unread')}),\n (name="service-read",worker=${worker(WORKERS.forward,'direct-read')})\n ],\n sockets=[${CELLS.map(cell=>`(name="${cell}",address="127.0.0.1:0",http=(),service="${cell}")`).join(',')}]);\n`;
}
export function safeCode(error) {
 try {
  const code=Object.getOwnPropertyDescriptor(error,'code');
  return code && Object.hasOwn(code,'value') && ['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','EACCES','EPERM','ENOENT'].includes(code.value) ? code.value : 'UNCLASSIFIED';
 } catch { return 'UNCLASSIFIED'; }
}
export function parseListen(line) {
 const data=JSON.parse(line);
 assert.equal(data.event,'listen'); assert.ok(CELLS.includes(data.socket));
 assert.ok(Number.isInteger(data.port)&&data.port>0&&data.port<=65535);
 return {cell:data.socket,port:data.port};
}
export function requestBytes(size) {
 assert.ok(SIZES.includes(size));
 return Buffer.concat([Buffer.from(`POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${size}\r\n\r\n`),Buffer.alloc(size,120)]);
}
export function probe(port,size,{connect=net.createConnection,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
 assert.ok(Number.isInteger(port)&&port>0&&port<=65535); assert.ok(SIZES.includes(size));
 return new Promise(resolve=>{
  let socket,done=false,bytes=0,prefix='',status=null,connected=false,writes=0;
  const finish=(ending,errorCode=null)=>{
   if(done)return;done=true;clearTimer(timer);socket?.destroy();
   resolve({bodyBytes:size,connected,requestWrites:writes,status,responseBytes:bytes,ending,errorCode});
  };
  const timer=setTimer(()=>finish('OBSERVATION_DEADLINE'),1500);
  try {
   socket=connect({host:'127.0.0.1',port});
   socket.once('connect',()=>{connected=true;writes++;socket.write(requestBytes(size));});
   socket.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>8192){finish('RESPONSE_LIMIT');return;}
    if(status===null){prefix=(prefix+chunk.toString('latin1')).slice(0,32);const match=/^HTTP\/1\.[01] (\d{3})[ \r\n]/.exec(prefix);if(match)status=Number(match[1]);}
   });
   socket.once('end',()=>finish('CLEAN_END'));
   socket.once('error',error=>finish('SOCKET_ERROR',safeCode(error)));
   socket.once('close',()=>finish('CLOSED'));
  }catch(error){finish('CONNECT_THROW',safeCode(error));}
 });
}
export function classify(rows) {
 if(rows.length!==REQUEST_LIMIT)return 'INCOMPLETE';
 if(rows.some(row=>row.status!==413||row.ending==='SOCKET_ERROR'||row.ending==='CONNECT_THROW'||row.ending==='RESPONSE_LIMIT'))return 'TRANSPORT_DIFFERENCE_OBSERVED';
 if(rows.some(row=>!['CLEAN_END','OBSERVATION_DEADLINE'].includes(row.ending)))return 'INCONCLUSIVE_SOCKET_CLOSE';
 return rows.some(row=>row.ending==='OBSERVATION_DEADLINE')?'NO_RESET_OBSERVED_WITHIN_WINDOW':'NO_RESET_OBSERVED_CLEAN_ENDS';
}
async function readyPorts(child) {
 return new Promise((resolve,reject)=>{
  const ports=new Map();let pending='',settled=false;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);child.off('error',onError);child.off('exit',onExit);child.stdio[3].off('data',onData);if(error)reject(error);else resolve(ports);};
  const onError=()=>finish(new Error('RUNTIME_START_FAILED'));
  const onExit=()=>finish(new Error('RUNTIME_EXIT_BEFORE_READY'));
  const onData=chunk=>{try{pending+=chunk.toString();assert.ok(pending.length<=8192);let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);const {cell,port}=parseListen(line);assert.equal(ports.has(cell),false);ports.set(cell,port);if(ports.size===4){finish();return;}}}catch{finish(new Error('INVALID_CONTROL_MESSAGE'));}};
  const timer=setTimeout(()=>finish(new Error('RUNTIME_START_TIMEOUT')),30000);
  child.once('error',onError);child.once('exit',onExit);child.stdio[3].on('data',onData);
 });
}
async function stopChild(child) {
 if(child.exitCode!==null||child.signalCode!==null)return true;
 return new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),3000);child.once('exit',()=>{clearTimeout(timer);resolve(true);});child.kill();});
}
export async function main() {
 assert.equal(process.platform,'win32','WINDOWS_ONLY_DIAGNOSTIC_NOT_RUN');
 assert.deepEqual(process.argv.slice(2),['--run-windows-2x2']);
 assert.equal(process.versions.node.split('.')[0],'24');
 const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
 const lock=fs.readFileSync(path.join(root,'package-lock.json'));
 const canonicalLock=execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024});
 assert.equal(createHash('sha256').update(canonicalLock).digest('hex'),'46500cbf2663547b9bdace08525bc7b1b381755647055b71ca02a8617716d05b');
 assert.ok(workingLockMatches(canonicalLock,lock),'WORKING_LOCK_NOT_EQUIVALENT');
 const workerd=require('workerd');assert.equal(workerd.version,'1.20260515.1');
 const {assertLocalMode,configureOfflineLocal}=await import(pathToFileURL(path.join(root,'lib/local-runtime.mjs')));
 const {installLocalNetworkGuard}=await import(pathToFileURL(path.join(root,'lib/local-network-guard.mjs')));
 assertLocalMode();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'process-synthetic-transport-'));
 const report={schema:1,stage:'preflight-complete',workingLock:canonicalLock.equals(lock)?'EXACT_BLOB_BYTES':'CRLF_ONLY_EQUIVALENT',platform:process.platform,node:process.version,workerd:workerd.version,requestLimit:REQUEST_LIMIT,requestAttempts:0,rows:[],productGateChanged:false,applicationLoaded:false,storageBindings:false,retries:0,delayedReads:false,disposed:false};
 let child;
 try {
  configureOfflineLocal(directory);installLocalNetworkGuard(directory);
  report.stage='write-synthetic-config';
  const config=path.join(directory,'config.capnp');fs.writeFileSync(config,configText());
  report.configSha256=createHash('sha256').update(configText()).digest('hex');
  const env={};for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
  report.stage='start-runtime';
  child=spawn(workerd.default,['serve','--control-fd=3',config],{stdio:['ignore','ignore','ignore','pipe'],windowsHide:true,env});
  report.stage='await-runtime-readiness';
  const ports=await readyPorts(child);report.stage='probe-matrix';
  for(const size of SIZES)for(const cell of CELLS){
   assert.ok(report.requestAttempts<REQUEST_LIMIT);report.requestAttempts++;
   const result=await probe(ports.get(cell),size);report.rows.push({cell,...result});
   if(['EACCES','EPERM'].includes(result.errorCode))throw new Error('PERMISSION_STOP');
  }
  report.outcome=classify(report.rows);report.stage='matrix-complete';
 }catch(error){report.outcome='SETUP_OR_PERMISSION_BLOCKED';report.failedStage=report.stage;report.failureCode=safeCode(error);}
 finally {
  try{report.disposed=child?await stopChild(child):true;}catch{report.disposed=false;}
  report.cleanEnds=report.rows.filter(row=>row.ending==='CLEAN_END').length;
  report.openAtObservationDeadline=report.rows.filter(row=>row.ending==='OBSERVATION_DEADLINE'&&row.status===413).length;
  if(report.disposed){try{fs.rmSync(directory,{recursive:true,force:false});}catch{report.outcome='CLEANUP_FAILED';}}
  else report.outcome='RUNTIME_SHUTDOWN_FAILED';
  console.log(JSON.stringify(report));
 }
 return ['NO_RESET_OBSERVED_WITHIN_WINDOW','NO_RESET_OBSERVED_CLEAN_ENDS'].includes(report.outcome)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().then(code=>{process.exitCode=code;},()=>{console.error(JSON.stringify({outcome:'PREFLIGHT_BLOCKED',stage:'platform-flag-node-lock-version-environment'}));process.exitCode=1;});
}
