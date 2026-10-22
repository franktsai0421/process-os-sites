// Explicitly authorized 3040 isolation. Does not initialize or write source storage.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {assertLocalMode,localWorkerConfig} from '../lib/local-runtime.mjs';
assertLocalMode([]);
const root=fs.realpathSync(process.cwd()),task=path.join(root,'.wrangler/local-only/routine-fqc-3040'),runtime=path.join(task,'runtime'),baseline=path.join(task,'baseline');
if(fs.existsSync(path.join(task,'isolation.json')))throw Error('Already prepared; reuse the existing 3040 runtime without reseeding');
const resume=process.argv.includes('--resume-verified-snapshot');
if(fs.existsSync(runtime)||fs.existsSync(baseline)&&!resume)throw Error('Partial prior setup retained; inspect before retry');
const hash=x=>createHash('sha256').update(x).digest('hex');
const source=path.join(root,'.wrangler/state');
const files=fs.readdirSync(source,{recursive:true}).filter(f=>fs.statSync(path.join(source,f)).isFile()&&!/-wal$|-shm$/.test(f));
const dbfile=files.find(f=>{if(!f.endsWith('.sqlite'))return false;const d=new DatabaseSync(path.join(source,f),{readOnly:true});try{return d.prepare("SELECT name FROM sqlite_master WHERE name='shared_state'").get();}finally{d.close();}});
if(!dbfile)throw Error('Original daily D1 not found');
const read=()=>{const d=new DatabaseSync(path.join(source,dbfile),{readOnly:true});try{return d.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();}finally{d.close();}};
const before=read();fs.mkdirSync(baseline,{recursive:true});const manifest=[];
if(resume){for(const f of files.filter(f=>f.includes('r2')&&f.endsWith('.sqlite'))){const to=path.join(baseline,'.wrangler/state',f);if(fs.existsSync(to))fs.renameSync(to,path.join(task,path.basename(f)+'.prior-'+Date.now()));const live=new DatabaseSync(path.join(source,f),{readOnly:true});try{live.prepare('VACUUM INTO ?').run(to);}finally{live.close();}}for(const f of files.filter(f=>!f.endsWith('.sqlite'))){const to=path.join(baseline,'.wrangler/state',f);if(!fs.existsSync(to)){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(source,f),to);}}}
for(const f of files){const from=path.join(source,f),to=path.join(baseline,'.wrangler/state',f);if(!resume){fs.mkdirSync(path.dirname(to),{recursive:true});if(f.endsWith('.sqlite')){const d=new DatabaseSync(from,{readOnly:true});try{d.prepare('VACUUM INTO ?').run(to);}finally{d.close();}}else fs.copyFileSync(from,to);}if(!fs.existsSync(to))continue;if(f.endsWith('.sqlite')){const check=new DatabaseSync(to,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity failed');}finally{check.close();}}manifest.push({path:f,sha256:hash(fs.readFileSync(to)),bytes:fs.statSync(to).size});}
// Validate the pinned D1 snapshot against its own R2 index and immutable blobs.
// Concurrent daily writes need not stop: they cannot alter this snapshot.
const pinned=new DatabaseSync(path.join(baseline,'.wrangler/state',dbfile),{readOnly:true});
const snapshot=pinned.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();pinned.close();
const rfile=files.find(f=>f.includes('r2')&&f.endsWith('.sqlite')&&!f.endsWith('metadata.sqlite'));
const rdb=new DatabaseSync(path.join(baseline,'.wrangler/state',rfile),{readOnly:true});
const objects=rdb.prepare('SELECT key,blob_id,size FROM _mf_objects').all();rdb.close();
const blobFiles=fs.readdirSync(path.join(baseline,'.wrangler/state'),{recursive:true});
const objectMap=new Map(objects.map(o=>[o.key,o]));const checked=new Set();
function verify(value){if(!value||typeof value!=='object')return; if(typeof value.key==='string'&&/^(state-records\/v1|state-chunks\/v1|snapshots)\//.test(value.key)&&typeof value.sha256==='string'){if(checked.has(value.key))return;const o=objectMap.get(value.key);if(!o)throw Error('Pinned snapshot R2 reference missing');const f=blobFiles.find(f=>path.basename(f)===o.blob_id);if(!f)throw Error('Pinned snapshot blob missing');const bytes=fs.readFileSync(path.join(baseline,'.wrangler/state',f));if(hash(bytes)!==value.sha256)throw Error('Pinned snapshot digest mismatch');checked.add(value.key);verify(JSON.parse(bytes.toString()));return;}for(const child of Object.values(value))verify(child);}
verify(JSON.parse(snapshot.values));
for(const o of objects){if(o.blob_id&&!blobFiles.some(f=>path.basename(f)===o.blob_id))throw Error('R2 attachment snapshot incomplete');}
console.log(JSON.stringify({snapshotRevision:snapshot.revision,verifiedReferences:checked.size,objects:objects.length}));
fs.mkdirSync(runtime,{recursive:true});fs.cpSync(path.join(baseline,'.wrangler'),path.join(runtime,'.wrangler'),{recursive:true});
for(const dir of ['app','lib','public','db','drizzle','node_modules','scripts','.openai'])fs.symlinkSync(path.join(root,dir),path.join(runtime,dir),'junction');
for(const file of ['package.json','tsconfig.json','vite.config.ts','env.d.ts','postcss.config.mjs'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(runtime,file));
fs.mkdirSync(path.join(runtime,'.wrangler/local-only'),{recursive:true});fs.writeFileSync(path.join(runtime,'.wrangler/local-only/wrangler.json'),JSON.stringify(localWorkerConfig()));fs.writeFileSync(path.join(runtime,'.wrangler/local-only/session.json'),JSON.stringify({secret:randomUUID()+randomUUID()}));
const data={createdAt:new Date().toISOString(),sourceRoot:root,runtimeRoot:runtime,baselineRoot:baseline,port:3040,sourceDb:path.join(source,dbfile),runtimeDb:path.join(runtime,'.wrangler/state',dbfile),sourceRevision:snapshot.revision,sourceDigest:hash(snapshot.values),verifiedReferences:checked.size,storageIsolated:true,sourceDirectoriesShared:true,sessionCookie:'process_demo_3040',featureAvailableOnly3040UntilAcceptance:true,files:manifest};
fs.writeFileSync(path.join(task,'isolation.json'),JSON.stringify(data,null,2));console.log(JSON.stringify({runtime,baseline,sourceRevision:before.revision,files:manifest.length,integrity:'PASS'}));
