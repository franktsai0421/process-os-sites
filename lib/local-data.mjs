import {acquireLocalStorageLease} from './local-storage-lease.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import { assertLocalMode, configureOfflineLocal, localWorkerConfig, LocalSetupError } from './local-runtime.mjs';
import { installLocalNetworkGuard } from './local-network-guard.mjs';
import { verifyLocalSchema } from './local-schema.mjs';
import { inspectMigrations } from '../scripts/local-init.mjs';
import {encodeLocalValues,decodeLocalSnapshot}from'./local-snapshot.mjs';
import {localDatabaseFile,readRevocations,restoreRevocations,assertPhysicalRecoveryCompatible}from'./local-revocation-recovery.mjs';
import {classifyLocalStopEvidence,probeLocalWindowsProcesses}from'./local-stop-gate.mjs';
const hash=raw=>crypto.createHash('sha256').update(raw).digest('hex');

export function assertDevStopped(root){const file=path.join(root,'.wrangler/local-only/dev-server.json');let data=null;try{if(fs.existsSync(file))data=JSON.parse(fs.readFileSync(file));}catch{throw new LocalSetupError('Unable to confirm Local dev server is stopped');}if(process.platform==='win32'){let evidence;try{evidence=classifyLocalStopEvidence(fs.realpathSync(root),data,probeLocalWindowsProcesses(data?.pid,root));}catch{throw new LocalSetupError('Unable to confirm Local dev server is stopped');}if(evidence.state==='STOPPED')return;if(evidence.state==='RUNNING')throw new LocalSetupError('Stop the Local dev server before export, sync or physical backup');throw new LocalSetupError('Unable to confirm Local dev server is stopped');}if(data){try{process.kill(data.pid,0);}catch(error){if(error.code==='ESRCH')return;throw new LocalSetupError('Unable to confirm Local dev server is stopped');}throw new LocalSetupError('Stop the Local dev server before export, sync or physical backup');}}
export async function openLocalData(root) {
  assertLocalMode([]);
  const storageLease = acquireLocalStorageLease(root);
  let proxy, sdkAttempted = false, disposal;
  try {
    const paths=configureOfflineLocal(root);installLocalNetworkGuard(root);
    if(!fs.existsSync(paths.state))throw new LocalSetupError('Local storage does not exist; run npm run dev first');
    fs.mkdirSync(paths.directory,{recursive:true});const config=localWorkerConfig();
    if(!fs.existsSync(paths.config))fs.writeFileSync(paths.config,JSON.stringify(config));
    else if(JSON.stringify(JSON.parse(fs.readFileSync(paths.config)))!==JSON.stringify(config))throw new LocalSetupError('Unexpected Local binding configuration; remote access refused');
    const {getPlatformProxy}=createRequire(path.join(root,'package.json'))('wrangler');
    sdkAttempted=true;
    proxy=await getPlatformProxy({configPath:paths.config,persist:{path:path.join(paths.state,'v3')},remoteBindings:false,envFiles:[]});
    const dispose=proxy.dispose.bind(proxy);
    proxy.dispose=()=>disposal??=Promise.resolve().then(()=>dispose()).then(value=>{storageLease.release();return value;});
    for(const warning of await verifyLocalSchema(proxy.env.DB,inspectMigrations(root).tables))console.warn(warning);
    return {proxy,db:proxy.env.DB,bucket:proxy.env.STATE_ARCHIVE,paths};
  } catch(error) {
    if(proxy)await proxy.dispose();else if(!sdkAttempted)storageLease.release();
    // A rejected SDK construction may leave a native instance alive. Keep the
    // lease for explicit owned cleanup/recovery rather than guessing it closed.
    throw error;
  }
}
export async function readLocalState(context){const row=await context.db.prepare('SELECT revision,"values",updated_at FROM shared_state WHERE id=1').first();if(!row)throw new LocalSetupError('Local current state is missing; no seed was run');const stored=JSON.parse(row.values),decoded=await decodeLocalSnapshot(context.bucket,stored);return{row,...decoded,storage:stored.__processRecords?'LOCAL_RECORDS':stored.__processChunks?'LOCAL_CHUNKS':stored.__processR2?'LOCAL_R2':'LOCAL_D1'};}
export async function writeLocalState(context,state,values){const encoded=await encodeLocalValues(context.bucket,values,{forceR2:state.storage==='LOCAL_R2',recordStorage:state.recordStorage,chunkStorage:state.chunkStorage});const change=await context.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=? AND "values"=?').bind(state.row.revision+1,encoded,new Date().toISOString(),state.row.revision,state.row.values).run();if(change.meta.changes!==1)throw new LocalSetupError('Local revision conflict; synchronization stopped');}
function storageManifest(root){const entries=[];function visit(dir){if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new LocalSetupError('Linked storage refused');if(stat.isDirectory())visit(file);else entries.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:stat.size,sha256:hash(fs.readFileSync(file))});}}visit(path.join(root,'.wrangler/state'));for(const name of ['session.json','wrangler.json','canonical-base.json','features.json']){const file=path.join(root,'.wrangler/local-only',name);if(fs.existsSync(file)){const b=fs.readFileSync(file);entries.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)});}}return entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));}
export function createLocalBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return createLocalBackupUnderLease(...args); } finally { storageLease.release(); }
}
function createLocalBackupUnderLease(root){assertDevStopped(root);const entries=storageManifest(root);const folder=path.join(root,'.wrangler/local-only/backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex'));fs.mkdirSync(folder,{recursive:true});for(const record of entries){const target=path.join(folder,record.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,record.path),target);if(hash(fs.readFileSync(target))!==record.sha256)throw new LocalSetupError('Local backup verification failed');}if(JSON.stringify(storageManifest(root))!==JSON.stringify(entries))throw new LocalSetupError('Local files changed during backup; operation stopped');fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({entries,sha256:hash(JSON.stringify(entries))},null,2));return folder;}
export function restoreLocalBackup(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return restoreLocalBackupUnderLease(...args); } finally { storageLease.release(); }
}
function restoreLocalBackupUnderLease(root,folder){
 assertDevStopped(root);
 const paths=configureOfflineLocal(root),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
 if(hash(JSON.stringify(manifest.entries))!==manifest.sha256)throw new LocalSetupError('Backup manifest integrity failed');
 const within=(base,relative)=>{const target=path.resolve(base,relative);if(!target.startsWith(path.resolve(base)+path.sep))throw new LocalSetupError('Backup path escapes project');let cursor=target;while(cursor!==path.resolve(base)){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw new LocalSetupError('Linked restoration path refused');cursor=path.dirname(cursor);}return target;};
 const seen=new Set();
 for(const record of manifest.entries){
  if(typeof record.path!=='string'||record.path.includes('\\')||record.path.includes(':')||record.path.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(record.path.toLowerCase()))throw new LocalSetupError('Unexpected backup path');
  seen.add(record.path.toLowerCase());
  if(!/^(?:\.wrangler\/(?:state\/|local-only\/(?:session|wrangler|canonical-base|features)\.json$)|(?:public|data\/canonical|db|drizzle)\/|(?:package(?:-lock)?\.json|vite\.config\.ts|\.openai\/hosting\.json|\.env[^/]*|local-backup\.(?:settings|state)\.json)$)/.test(record.path))throw new LocalSetupError('Unexpected backup path');
  within(root,record.path);
  const file=within(folder,record.path);if(fs.lstatSync(file).isSymbolicLink()||hash(fs.readFileSync(file))!==record.sha256)throw new LocalSetupError('Backup integrity failed; restoration refused');
 }
 const currentDb=localDatabaseFile(root),revocations=currentDb?readRevocations(root,currentDb):[];
 const staging=path.join(paths.directory,'restore-staging-'+crypto.randomUUID());fs.mkdirSync(staging,{recursive:true});
 // Prepare and verify the complete replacement before touching the active path.
 for(const record of manifest.entries){const target=within(staging,record.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(within(folder,record.path),target);const bytes=fs.readFileSync(target);if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw new LocalSetupError('Local restoration verification failed');}
 assertPhysicalRecoveryCompatible(root,staging);
 restoreRevocations(root,revocations,staging);
 const restoredRows=readRevocations(root,localDatabaseFile(staging));
 if(revocations.some(row=>!restoredRows.some(saved=>saved.token_digest===row.token_digest&&saved.expires_at>=row.expires_at&&saved.revoked_at>=row.revoked_at)))throw new LocalSetupError('Revocation restoration verification failed');
 const settings=manifest.entries.filter(r=>!r.path.startsWith('.wrangler/state/')).map(r=>({path:within(root,r.path),staged:within(staging,r.path),before:fs.existsSync(within(root,r.path))?fs.readFileSync(within(root,r.path)):null}));
 const parent=path.join(paths.directory,'failed-state');fs.mkdirSync(parent,{recursive:true});const retained=within(parent,crypto.randomUUID()),prepared=within(staging,'.wrangler/state');
 let moved=false,activated=false;
 try{
  if(fs.existsSync(paths.state)){fs.renameSync(paths.state,retained);moved=true;}
  fs.renameSync(prepared,paths.state);activated=true;
  for(const setting of settings){fs.mkdirSync(path.dirname(setting.path),{recursive:true});const temp=setting.path+'.'+crypto.randomUUID()+'.restore';fs.copyFileSync(setting.staged,temp);fs.renameSync(temp,setting.path);}
 }catch(error){
  if(activated)fs.renameSync(paths.state,within(staging,'failed-activation-state'));
  if(moved)fs.renameSync(retained,paths.state);
  for(const setting of settings){if(setting.before!==null)fs.writeFileSync(setting.path,setting.before);else if(fs.existsSync(setting.path))fs.unlinkSync(setting.path);}
  throw error;
 }
 return true;
}
