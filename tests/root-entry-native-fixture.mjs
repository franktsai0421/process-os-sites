// Compiled application with synthetic, nonpersistent storage and no secrets.
// Shared by the root-entry HTTP checks and the owned local browser preview.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {configureOfflineLocal} from '../lib/local-runtime.mjs';import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';import {denyLocalWorkerOutbound} from '../lib/local-worker-outbound.mjs';
export async function createRootEntryFixture({programCommit=process.env.PROCESS_PROGRAM_COMMIT}={}){
 assert.match(programCommit||'',/^[a-f0-9]{40}$/);
 const root=path.resolve(import.meta.dirname,'..'),runtime=fs.mkdtempSync(path.join(root,'.sites-runtime/root-entry-native-'));
 configureOfflineLocal(runtime);installLocalNetworkGuard(runtime);
 const require=createRequire(import.meta.url),{Miniflare,Log,LogLevel}=require('miniflare'),moduleRoot=path.join(root,'dist/server'),main=path.join(moduleRoot,'index.js'),files=[];
 function walk(directory){for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);if(stat.isDirectory())walk(file);else if(/\.(js|mjs)$/.test(name))files.push(file);}}
 walk(moduleRoot);
 const mf=new Miniflare({host:'127.0.0.1',port:0,modules:[main,...files.filter(f=>f!==main)].map(file=>({type:'ESModule',path:file})),modulesRoot:moduleRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),defaultPersistRoot:runtime,d1Databases:{DB:'synthetic-root-entry'},r2Buckets:{STATE_ARCHIVE:'synthetic-root-entry'},d1Persist:false,r2Persist:false,cachePersist:false,assets:{directory:path.join(root,'dist/client'),routerConfig:{has_user_worker:true}},bindings:{PROCESS_OWNER_BOOTSTRAP_ENABLED:'0',PROCESS_IMPORT_ENABLED:'1',DEMO_LOGIN_ENABLED:'false',PROCESS_SESSION_REVOCATION_ENABLED:'1',PROCESS_RELEASE_DISABLED:'true',PROCESS_PROGRAM_COMMIT:programCommit},outboundService:denyLocalWorkerOutbound});
 try{
  const url=await mf.ready;assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'3000');
  const db=await mf.getD1Database('DB');
  for(const name of fs.readdirSync(path.join(root,'drizzle-sites-fresh')).filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync(path.join(root,'drizzle-sites-fresh',name),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  return{mf,db,url,runtime,programCommit,buildEntrySha256:createHash('sha256').update(fs.readFileSync(main)).digest('hex'),async close(){await mf.dispose();}};
 }catch(error){await mf.dispose();throw error;}
}
