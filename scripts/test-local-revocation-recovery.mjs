import fs from'node:fs';import os from'node:os';import path from'node:path';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{createLocalBackup,restoreLocalBackup}from'../lib/local-data.mjs';
import{readRevocations,mergeRevocations}from'../lib/local-revocation-recovery.mjs';
import{createBackup,restoreBackup}from'../lib/local-backup.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'process-revocation-recovery-'));
const dir=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,'fixture.sqlite'),a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),values=JSON.stringify({platformUsers:JSON.stringify([{id:'admin',role:'admin',name:'fixture',password:'fixture-password'}])});
try{
 let db=new DatabaseSync(file);db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(values,'fixture');mergeRevocations(db,[{token_digest:a,expires_at:100,revoked_at:10}]);db.close();
 const physical=createLocalBackup(root);db=new DatabaseSync(file);mergeRevocations(db,[{token_digest:a,expires_at:200,revoked_at:20},{token_digest:b,expires_at:300,revoked_at:30}]);db.close();
 restoreLocalBackup(root,physical);assert.deepEqual(readRevocations(root,file).map(row=>({...row})).sort((x,y)=>x.token_digest.localeCompare(y.token_digest)),[{token_digest:a,expires_at:200,revoked_at:20},{token_digest:b,expires_at:300,revoked_at:30}]);
 db=new DatabaseSync(file);db.prepare('INSERT INTO process_revoked_sessions VALUES(?,?,?)').run('d'.repeat(64),1.5,40);const stateBefore=db.prepare('SELECT * FROM shared_state').all();db.close();
 assert.throws(()=>restoreLocalBackup(root,physical),/Invalid revocation recovery record/);
 db=new DatabaseSync(file);assert.deepEqual(db.prepare('SELECT * FROM shared_state').all(),stateBefore);assert.equal(db.prepare('SELECT COUNT(*) n FROM process_revoked_sessions').get().n,3);db.prepare('DELETE FROM process_revoked_sessions WHERE token_digest=?').run('d'.repeat(64));db.close();
 fs.writeFileSync(path.join(root,'app.txt'),'fixture');fs.writeFileSync(path.join(root,'local-backup.settings.json'),JSON.stringify({enabled:false,backupPath:path.join(root,'backups'),maxUnpackedBytes:10_000_000}));
 const archive=createBackup(root,{actor:'admin'});db=new DatabaseSync(file);mergeRevocations(db,[{token_digest:c,expires_at:400,revoked_at:40}]);db.close();
 restoreBackup(root,{fileName:archive.fileName,actor:'admin',password:'fixture-password',confirmText:'0988901928'});assert.equal(readRevocations(root,file).length,3);
 db=new DatabaseSync(file);db.exec('CREATE TABLE web_feedback_store(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT)');db.prepare('INSERT INTO web_feedback_store VALUES(1,1,?)').run(JSON.stringify({issues:[{id:'fixture-case'}],attachments:[],batches:[],handoffs:[]}));db.close();
 assert.throws(()=>restoreLocalBackup(root,physical),/feedback history/);
 assert.throws(()=>restoreBackup(root,{fileName:archive.fileName,actor:'admin',password:'fixture-password',confirmText:'0988901928'}),/feedback history/);
 db=new DatabaseSync(file,{readOnly:true});assert.equal(JSON.parse(db.prepare('SELECT payload FROM web_feedback_store').get().payload).issues[0].id,'fixture-case');db.close();assert.equal(readRevocations(root,file).length,3);
 console.log('PASS: physical restore unions newer revocations and failed staging leaves original active database intact; normal archive restore retains all revocations; pre-feedback physical and archive restores refused without losing current cases; rollback keeps ledger');
}finally{const resolved=fs.realpathSync(root);assert(path.dirname(resolved)===fs.realpathSync(os.tmpdir())&&path.basename(resolved).startsWith('process-revocation-recovery-'));fs.rmSync(resolved,{recursive:true,force:true});}
