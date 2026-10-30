// Compiled application with synthetic, nonpersistent storage and no secrets.
// Shared by the root-entry HTTP checks and the owned local browser preview.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {configureOfflineLocal} from '../lib/local-runtime.mjs';import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';import {denyLocalWorkerOutbound} from '../lib/local-worker-outbound.mjs';
export async function createRootEntryFixture({programCommit=process.env.PROCESS_PROGRAM_COMMIT,syntheticBindings={},buildDirectory=process.env.PROCESS_TEST_BUILD_DIR}={}){
 assert.match(programCommit||'',/^[a-f0-9]{40}$/);
 const root=path.resolve(import.meta.dirname,'..'),runtime=fs.mkdtempSync(path.join(root,'.sites-runtime/root-entry-native-'));
 configureOfflineLocal(runtime);installLocalNetworkGuard(runtime);
 const buildRoot=buildDirectory?path.resolve(buildDirectory):path.join(root,'dist');
 const require=createRequire(import.meta.url),{Miniflare,Log,LogLevel}=require('miniflare'),moduleRoot=path.join(buildRoot,'server'),main=path.join(moduleRoot,'index.js'),files=[];
 function walk(directory){for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);if(stat.isDirectory())walk(file);else if(/\.(js|mjs)$/.test(name))files.push(file);}}
 walk(moduleRoot);
 const mf=new Miniflare({host:'127.0.0.1',port:0,modules:[main,...files.filter(f=>f!==main)].map(file=>({type:'ESModule',path:file})),modulesRoot:moduleRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),defaultPersistRoot:runtime,d1Databases:{DB:'synthetic-root-entry'},r2Buckets:{STATE_ARCHIVE:'synthetic-root-entry'},d1Persist:false,r2Persist:false,cachePersist:false,assets:{directory:path.join(buildRoot,'client'),routerConfig:{has_user_worker:true}},bindings:{PROCESS_OWNER_BOOTSTRAP_ENABLED:'0',PROCESS_IMPORT_ENABLED:'1',DEMO_LOGIN_ENABLED:'false',PROCESS_SESSION_REVOCATION_ENABLED:'1',PROCESS_RELEASE_DISABLED:'true',PROCESS_PROGRAM_COMMIT:programCommit,...syntheticBindings},outboundService:denyLocalWorkerOutbound});
 try{
  const url=await mf.ready;assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'3000');
  const db=await mf.getD1Database('DB');
  for(const name of fs.readdirSync(path.join(root,'drizzle-sites-fresh')).filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync(path.join(root,'drizzle-sites-fresh',name),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  return{mf,db,url,runtime,programCommit,buildEntrySha256:createHash('sha256').update(fs.readFileSync(main)).digest('hex'),async close(){await mf.dispose();}};
 }catch(error){await mf.dispose();throw error;}
}

// Failure-only diagnostics: never serialize errors, messages, URLs or bodies.
export function nativeFailureDiagnostics(error){
 const codes=['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_SOCKET','UND_ERR_ABORTED','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_CONNECT_TIMEOUT'];
 const causeCodes=[],seen=[];let location=null,current=error;
 for(let depth=0;depth<3&&current!==null&&(typeof current==='object'||typeof current==='function')&&!seen.includes(current);depth++){
  seen.push(current);
  try{
   const code=Object.getOwnPropertyDescriptor(current,'code');
   if(code&&Object.hasOwn(code,'value')&&typeof code.value==='string'&&codes.includes(code.value)&&!causeCodes.includes(code.value))causeCodes.push(code.value);
   const stack=Object.getOwnPropertyDescriptor(current,'stack');
   if(!location&&stack&&Object.hasOwn(stack,'value')&&typeof stack.value==='string')for(const line of stack.value.slice(0,20000).split('\n').slice(1,16)){
    const match=line.match(/(?:^|[\\/])(sites-startup-assets-native\.test\.mjs|sites-bounded-import-native\.test\.mjs|root-entry-native-fixture\.mjs):(\d+):(\d+)\)?$/);
    if(match){const lineNumber=Number(match[2]),columnNumber=Number(match[3]);if(Number.isSafeInteger(lineNumber)&&Number.isSafeInteger(columnNumber)&&lineNumber>0&&lineNumber<=1000000&&columnNumber>0&&columnNumber<=1000000){location={file:match[1],line:lineNumber,column:columnNumber};break;}}
   }
   const cause=Object.getOwnPropertyDescriptor(current,'cause');current=cause&&Object.hasOwn(cause,'value')?cause.value:null;
  }catch{break;}
 }
 return{causeCodes,location};
}
