import {openLeasedLocalSQLite} from '../lib/local-storage-sqlite.mjs';
import {acquireLocalStorageLease} from '../lib/local-storage-lease.mjs';
// Explicit local-only schema upgrade. Never called by a public request or startup.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import * as sqlite from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {assertLocalMode, localPaths} from '../lib/local-runtime.mjs';
import {inspectMigrations} from './local-init.mjs';
import {verifyLocalSchema} from '../lib/local-schema.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const adapter = db => ({prepare(sql) {let values=[];return {bind(...args) {values=args;return this;},async all() {return {results:db.prepare(sql).all(...values)};}, async first() {return db.prepare(sql).get(...values);}};}});
async function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({host:'127.0.0.1',port});
    socket.once('connect', () => {socket.destroy();resolve(true);});
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => {socket.destroy();resolve(true);});
  });
}

export async function upgradeLocalFeatures(...args) {
  const storageLease = acquireLocalStorageLease(args[0]);
  try { return await upgradeLocalFeaturesUnderLease(...args); } finally { storageLease.release(); }
}
async function upgradeLocalFeaturesUnderLease(root, {port, expectedRevision, expectedValuesHash, backupDirectory}) {
  assertLocalMode([]);
  assert(Number.isInteger(port) && port > 0 && port < 65536, 'Explicit stopped Local port required');
  assert(Number.isInteger(expectedRevision) && /^[a-f0-9]{64}$/.test(expectedValuesHash), 'Pinned revision and hash required');
  assert(!(await listening(port)), 'Stop the target Local server before upgrading');
  const paths = localPaths(root), schema = inspectMigrations(root);
  const folder = path.join(paths.state,'v3/d1/miniflare-D1DatabaseObject');
  const names = fs.readdirSync(folder).filter(n => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
  assert.equal(names.length,1,'Ambiguous application database');
  assert(backupDirectory && path.isAbsolute(backupDirectory) && !fs.existsSync(backupDirectory), 'New backup directory required');
  fs.mkdirSync(backupDirectory,{recursive:true});
  const db = openLeasedLocalSQLite(root,DatabaseSync,path.join(folder,names[0]));
  const setting = path.join(paths.directory,'features.json');
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const before=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
    assert.equal(before.revision,expectedRevision);assert.equal(sha(before.values),expectedValuesHash);
    const backupFile=path.join(backupDirectory,'database-before.sqlite');
    if(typeof sqlite.backup==='function') {
      const backup=sqlite.backup;
      await backup(db,backupFile);
    } else {
      // Node 22.13 provides DatabaseSync but not the online backup API.
      db.exec(`VACUUM INTO '${backupFile.replaceAll("'","''")}'`);
    }
    if(fs.existsSync(setting))fs.copyFileSync(setting,path.join(backupDirectory,'features-before.json'));
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
      assert(current.revision===before.revision&&sha(current.values)===sha(before.values),'Concurrent state change');
      const migration=schema.migrations.find(m=>m.name==='0002_local_feedback_sessions.sql');assert(migration);
      for(const raw of migration.sql.split(';')) {
        const sql=raw.replace(/--> statement-breakpoint/g,'').trim();if(!sql)continue;
        const entity=sql.match(/^CREATE (TABLE|INDEX) `([^`]+)`/);
        if(entity && db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(entity[2]))continue;
        if(sql.startsWith('INSERT INTO') && db.prepare('SELECT id FROM web_feedback_store WHERE id=1').get())continue;
        db.exec(sql);
      }
      await verifyLocalSchema(adapter(db),schema.tables);
      const after=db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
      assert(after.revision===before.revision&&sha(after.values)===sha(before.values),'Business state changed during schema upgrade');
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
    const temp=setting+'.'+crypto.randomUUID()+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({webFeedback:true,sessionRevocation:true},null,2));fs.renameSync(temp,setting);
    const receipt={at:new Date().toISOString(),root:fs.realpathSync(root),revision:before.revision,valuesSHA256:expectedValuesHash,backupDirectory,backupSHA256:sha(fs.readFileSync(path.join(backupDirectory,'database-before.sqlite'))),tables:schema.tables.map(t=>t.name),businessStateUnchanged:true};
    fs.writeFileSync(path.join(backupDirectory,'receipt.json'),JSON.stringify(receipt,null,2));return receipt;
  } finally {db.close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),option=n=>args[args.indexOf(n)+1];
  try {console.log(JSON.stringify(await upgradeLocalFeatures(process.cwd(),{port:Number(option('--port')),expectedRevision:Number(option('--expected-revision')),expectedValuesHash:option('--expected-values-hash'),backupDirectory:option('--backup-directory')})));}
  catch(error){console.error('Local upgrade refused:',error.message);process.exitCode=1;}
}
