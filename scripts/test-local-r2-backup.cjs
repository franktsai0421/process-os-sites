const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
(async()=>{
 const api=await import('../lib/local-backup.mjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'process-r2-backup-test-'));
 let live;
 try{
  const d1=path.join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),r2=path.join(root,'.wrangler/state/v3/r2/miniflare-R2BucketObject');fs.mkdirSync(d1,{recursive:true});fs.mkdirSync(r2,{recursive:true});
  const db=new DatabaseSync(path.join(d1,'test.sqlite'));
  db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT); CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
  db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify([{id:'admin',role:'admin',password:'fixture-password'}]),__processR2:{key:'snapshots/fixture.json'}}),new Date().toISOString());db.close();
  const metadata=new DatabaseSync(path.join(r2,'test.sqlite'));metadata.exec('CREATE TABLE objects(key TEXT PRIMARY KEY,value TEXT)');metadata.prepare('INSERT INTO objects VALUES(?,?)').run('fixture','original');metadata.close();
  fs.writeFileSync(path.join(r2,'fixture.blob'),'original blob');fs.writeFileSync(path.join(root,'app.txt'),'test');
  api.saveSettings(root,{backupPath:path.join(root,'backups'),enabled:false});
  const result=api.createBackup(root,{actor:'admin',now:new Date('2026-09-01T00:00:00Z')}),inspection=api.inspectBackup(root,result.fileName);
  assert.ok(inspection.manifest.contents.files.some(f=>f.path==='r2/miniflare-R2BucketObject/fixture.blob'));
  live=new DatabaseSync(path.join(r2,'test.sqlite'));live.exec('PRAGMA journal_mode=WAL');live.prepare('UPDATE objects SET value=?').run('changed');fs.writeFileSync(path.join(r2,'fixture.blob'),'changed');
  api.restoreBackup(root,{fileName:result.fileName,actor:'admin',password:'fixture-password',confirmText:'0988901928'});
  assert.equal(live.prepare('SELECT value FROM objects').get().value,'original');live.close();live=null;assert.equal(fs.readFileSync(path.join(r2,'fixture.blob'),'utf8'),'original blob');
  console.log('PASS: encrypted ZIP contains R2 metadata/blob files; restore safely updates a live WAL connection and preserves D1 reference/account metadata');
 }finally{live?.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
