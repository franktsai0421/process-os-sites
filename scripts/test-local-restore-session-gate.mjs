import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createLocalBackup,restoreLocalBackup} from '../lib/local-data.mjs';
import {readLocalFeatures} from '../lib/local-features.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'process-restore-session-gate-'));
const folder=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const settings=path.join(root,'.wrangler/local-only/features.json'),file=path.join(folder,'fixture.sqlite');
const require=createRequire(import.meta.url);
try {
 fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(path.dirname(settings),{recursive:true});
 const db=new DatabaseSync(file);
 for(const name of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
 db.close();
 const features=value=>fs.writeFileSync(settings,JSON.stringify({webFeedback:true,sessionRevocation:value}));
 features(false);const oldDisabled=createLocalBackup(root);
 features(true);const enabledBackup=createLocalBackup(root);
 fs.unlinkSync(settings);const legacySettingsBackup=createLocalBackup(root);features(true);
 const env={PROCESS_SESSION_SECRET:crypto.randomBytes(48).toString('hex'),PROCESS_SESSION_REVOCATION_ENABLED:'1',DB:{prepare(sql){
   let args=[];return{bind(...values){args=values;return this;},async first(){const handle=new DatabaseSync(file);try{return handle.prepare(sql).get(...args)||null;}finally{handle.close();}},async run(){const handle=new DatabaseSync(file);try{return {meta:{changes:Number(handle.prepare(sql).run(...args).changes)}};}finally{handle.close();}}};
 }}};
 const bundle=buildSync({entryPoints:['lib/process-state.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['cloudflare:workers']}).outputFiles[0].text;
 const load=()=>{const fixtureModule={exports:{}};vm.runInNewContext(bundle,{module:fixtureModule,exports:fixtureModule.exports,require:id=>id==='cloudflare:workers'?{env}:require(id),crypto:crypto.webcrypto,TextEncoder,TextDecoder,Request,Response,URL,atob,btoa,Date,console});return fixtureModule.exports;};
 let api=load();const request=new Request('http://127.0.0.1:3199/api/platform-login');
 const revoked=await api.demoSession(request,'fixture-platform-user',false),valid=await api.demoSession(request,'fixture-platform-user',false);
 assert(revoked&&valid);
 const withToken=token=>new Request(request.url,{headers:{Cookie:'process_demo='+token}});
 assert.equal(await api.demoSession(withToken(revoked)),'fixture-platform-user');
 await api.clearDemoSession(withToken(revoked));
 assert.equal(await api.demoSession(withToken(revoked)),null);
 const before=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 assert.throws(()=>restoreLocalBackup(root,oldDisabled),/disable session revocation/);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before);
 for(const backup of [enabledBackup,legacySettingsBackup]){
   restoreLocalBackup(root,backup);
   env.PROCESS_SESSION_REVOCATION_ENABLED=readLocalFeatures(root).sessionRevocation?'1':'0';
   assert.equal(env.PROCESS_SESSION_REVOCATION_ENABLED,'1');api=load();
   assert.equal(await api.demoSession(withToken(revoked)),null);
   assert.equal(await api.demoSession(withToken(valid)),'fixture-platform-user');
 }
 console.log('PASS: disabled-gate restore rejected before activation; enabled and legacy-settings restores preserve newer logout; real signed same-key token stays rejected after fresh module load while other session remains valid. No live workspace or credentials used.');
} finally {
 const resolved=fs.realpathSync(root);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert(path.basename(resolved).startsWith('process-restore-session-gate-'));fs.rmSync(resolved,{recursive:true,force:true});
}
