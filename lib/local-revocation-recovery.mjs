import {openLeasedLocalSQLite} from './local-storage-sqlite.mjs';
import {acquireLocalStorageLease} from './local-storage-lease.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {readLocalFeatures} from './local-features.mjs';

const definition = 'CREATE TABLE IF NOT EXISTS process_revoked_sessions (token_digest TEXT PRIMARY KEY NOT NULL CHECK(length(token_digest)=64), expires_at INTEGER NOT NULL, revoked_at INTEGER NOT NULL)';
export function assertPhysicalRecoveryCompatible(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return assertPhysicalRecoveryCompatibleUnderLease(...args); } finally { storageLease.release(); }
}
function assertPhysicalRecoveryCompatibleUnderLease(root, stagedRoot) {
  const currentFeatures=readLocalFeatures(root);
  const featureFile=path.join(stagedRoot,'.wrangler/local-only/features.json');
  // An absent settings file is not replaced during physical recovery.
  const restoredFeatures=fs.existsSync(featureFile)?readLocalFeatures(stagedRoot):currentFeatures;
  if(currentFeatures.sessionRevocation&&!restoredFeatures.sessionRevocation)throw Error('Backup would disable session revocation; restore refused');
  const targetFile=localDatabaseFile(stagedRoot);
  if(!targetFile) {
    if(localDatabaseFile(root)||restoredFeatures.sessionRevocation||restoredFeatures.webFeedback)throw Error('Missing restored database');
    return;
  }
  const target=openLeasedLocalSQLite(root,DatabaseSync,path.toNamespacedPath(targetFile),{readOnly:true});
  let current;
  try {
    const has=(db,name)=>!!db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?').get(name);
    if(restoredFeatures.sessionRevocation&&!has(target,'process_revoked_sessions'))throw Error('Backup lacks enabled session revocation schema; restore refused');
    const currentFile=localDatabaseFile(root);
    if(currentFile)current=openLeasedLocalSQLite(root,DatabaseSync,path.toNamespacedPath(currentFile),{readOnly:true});
    if(current&&has(current,'web_feedback_store')&&!has(target,'web_feedback_store')) {
      const rows=current.prepare('SELECT payload FROM web_feedback_store').all();
      if(rows.some(row=>Object.values(JSON.parse(row.payload)).some(value=>Array.isArray(value)&&value.length)))throw Error('Older backup lacks feedback history; restore refused');
    }
    if(restoredFeatures.webFeedback&&!has(target,'web_feedback_store'))throw Error('Backup lacks enabled feedback schema; restore refused');
  } finally {try{current?.close();}finally{target.close();}}
}
export function readRevocations(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return readRevocationsUnderLease(...args); } finally { storageLease.release(); }
}
function readRevocationsUnderLease(root,file) {
  if(!file||!fs.existsSync(file))return [];
  const db=openLeasedLocalSQLite(root,DatabaseSync,path.toNamespacedPath(file),{readOnly:true});
  try{return db.prepare("SELECT name FROM sqlite_master WHERE name='process_revoked_sessions'").get()?db.prepare('SELECT token_digest,expires_at,revoked_at FROM process_revoked_sessions').all():[];}
  finally{db.close();}
}
export function mergeRevocations(db, rows) {
  if(!rows.length)return;
  db.exec(definition);
  const insert=db.prepare('INSERT INTO process_revoked_sessions(token_digest,expires_at,revoked_at) VALUES(?,?,?) ON CONFLICT(token_digest) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at), revoked_at=MAX(revoked_at,excluded.revoked_at)');
  for(const row of rows){if(!/^[a-f0-9]{64}$/.test(row.token_digest)||!Number.isSafeInteger(row.expires_at)||!Number.isSafeInteger(row.revoked_at))throw Error('Invalid revocation recovery record');insert.run(row.token_digest,row.expires_at,row.revoked_at);}
}
export function localDatabaseFile(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return localDatabaseFileUnderLease(...args); } finally { storageLease.release(); }
}
function localDatabaseFileUnderLease(root) {
  const folder=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  if(!fs.existsSync(folder))return null;
  const names=fs.readdirSync(folder).filter(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
  if(names.length!==1)throw Error('Ambiguous Local database for revocation recovery');
  return path.join(folder,names[0]);
}
export function restoreRevocations(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return restoreRevocationsUnderLease(...args); } finally { storageLease.release(); }
}
function restoreRevocationsUnderLease(root,rows,storageRoot=root) {
  if(!rows.length)return;
  const file=localDatabaseFile(storageRoot);if(!file)throw Error('Missing restored database');
  const db=openLeasedLocalSQLite(root,DatabaseSync,path.toNamespacedPath(file));
  try{db.exec('BEGIN IMMEDIATE');mergeRevocations(db,rows);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
}
