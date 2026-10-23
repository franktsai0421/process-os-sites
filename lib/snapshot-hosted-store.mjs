// Real D1 adapter. Schema is migration-owned; requests never CREATE/ALTER tables.
import {importNamespace} from './snapshot-hosted-transfer.mjs';
export const hostedImportSchemaSQL=`
CREATE TABLE process_snapshot_transfers (
 id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, target TEXT NOT NULL,
 manifest_sha TEXT NOT NULL, manifest_key TEXT NOT NULL, owner_id TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('receiving','integrity-verified')),
 version INTEGER NOT NULL, verify_cursor INTEGER NOT NULL,
 chunk_count INTEGER NOT NULL, total_bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE process_snapshot_target (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), target TEXT NOT NULL,
 transfer_id TEXT NOT NULL UNIQUE
);
CREATE TABLE process_snapshot_chunks (
 transfer_id TEXT NOT NULL, chunk_id TEXT NOT NULL, sequence INTEGER NOT NULL,
 bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
 PRIMARY KEY(transfer_id,chunk_id), UNIQUE(transfer_id,sequence)
);`;
const fail=(v,c)=>{if(!v)throw Error(c);};
export function createHostedTransferStore({db,bucket}){
 return {
  get(id){return db.prepare('SELECT * FROM process_snapshot_transfers WHERE id=?').bind(id).first();},
  async assertFresh(ownerId){
   const shared=await db.prepare('SELECT id,revision,"values",updated_at FROM shared_state LIMIT 2').all();fail(shared.success&&shared.results.length<=1,'IMPORT_TARGET_OCCUPIED');
   if(shared.results.length){const row=shared.results[0],values=JSON.parse(row.values),users=typeof values.platformUsers==='string'?JSON.parse(values.platformUsers):values.platformUsers;fail(row.id===1&&JSON.stringify(Object.keys(values).sort())===JSON.stringify(['maintenanceMode','platformUsers'])&&values.maintenanceMode==='1'&&Array.isArray(users)&&users.length===1&&String(users[0].id||'').trim().toLowerCase()===String(ownerId||'').trim().toLowerCase()&&users[0].role==='admin'&&users[0].disabled!==true&&users[0].enabled!==false&&users[0].authMode!=='demo'&&!users[0].deletedAt,'IMPORT_TARGET_OCCUPIED');}
   const history=await db.prepare('SELECT COUNT(*) AS count FROM state_backups').first();fail(history?.count===0,'IMPORT_TARGET_OCCUPIED');
   const feedback=await db.prepare('SELECT id,revision,payload FROM web_feedback_store').all();fail(feedback.success&&feedback.results.length<=1,'IMPORT_TARGET_OCCUPIED');
   if(feedback.results.length){const row=feedback.results[0];fail(row.id===1&&row.revision===0&&row.payload==='{"issues":[],"attachments":[],"batches":[],"handoffs":[]}','IMPORT_TARGET_OCCUPIED');}
   const inventory=await bucket.list({limit:100});fail(!inventory.truncated&&inventory.objects.every(o=>o.key.startsWith(importNamespace)),'IMPORT_TARGET_OCCUPIED');
  },
  async reserve(row){
   const statements=[
    db.prepare('INSERT INTO process_snapshot_target (id,target,transfer_id) VALUES (1,?,?) ON CONFLICT(id) DO NOTHING').bind(row.target,row.id),
    db.prepare("INSERT INTO process_snapshot_transfers (id,project_id,target,manifest_sha,manifest_key,owner_id,phase,version,verify_cursor,chunk_count,total_bytes,created_at,expires_at) SELECT ?,?,?,?,?,?,'receiving',1,0,?,?,?,? WHERE EXISTS (SELECT 1 FROM process_snapshot_target WHERE id=1 AND target=? AND transfer_id=?) ON CONFLICT(id) DO NOTHING").bind(row.id,row.project_id,row.target,row.manifest_sha,row.manifest_key,row.owner_id,row.chunk_count,row.total_bytes,row.created_at,row.expires_at,row.target,row.id),
   ];
   const result=await db.batch(statements);fail(result.every(r=>r.success),'IMPORT_LEDGER_WRITE');
   const selected=await db.prepare('SELECT transfer_id,target FROM process_snapshot_target WHERE id=1').first();fail(selected?.transfer_id===row.id&&selected.target===row.target,'IMPORT_TARGET_RESERVED');
  },
  async acknowledge(id,c){
   const result=await db.prepare("INSERT INTO process_snapshot_chunks (transfer_id,chunk_id,sequence,bytes,sha256) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM process_snapshot_transfers WHERE id=? AND phase='receiving') ON CONFLICT(transfer_id,chunk_id) DO NOTHING").bind(id,c.id,c.sequence,c.bytes,c.sha256,id).run();fail(result.success,'IMPORT_LEDGER_WRITE');
  },
  async acknowledgeMany(id,chunks){
   fail(chunks.length>0&&chunks.length<=16,'IMPORT_BATCH_COUNT');
   const items=chunks.map(c=>db.prepare("INSERT INTO process_snapshot_chunks (transfer_id,chunk_id,sequence,bytes,sha256) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM process_snapshot_transfers WHERE id=? AND phase='receiving') ON CONFLICT(transfer_id,chunk_id) DO NOTHING").bind(id,c.id,c.sequence,c.bytes,c.sha256,id));
   const result=await db.batch(items);fail(result.every(r=>r.success),'IMPORT_LEDGER_WRITE');
  },
  async chunkRange(id,start,end){const result=await db.prepare('SELECT chunk_id,sequence,bytes,sha256 FROM process_snapshot_chunks WHERE transfer_id=? AND sequence>=? AND sequence<? ORDER BY sequence').bind(id,start,end).all();fail(result.success,'IMPORT_LEDGER_READ');return result.results;},
  chunk(id,chunkId){return db.prepare('SELECT chunk_id,sequence,bytes,sha256 FROM process_snapshot_chunks WHERE transfer_id=? AND chunk_id=?').bind(id,chunkId).first();},
  async receivedCount(id){return (await db.prepare('SELECT COUNT(*) AS count FROM process_snapshot_chunks WHERE transfer_id=?').bind(id).first())?.count;},
  async receipts(id,start,end){const result=await db.prepare('SELECT chunk_id FROM process_snapshot_chunks WHERE transfer_id=? AND sequence>=? AND sequence<? ORDER BY sequence').bind(id,start,end).all();fail(result.success,'IMPORT_LEDGER_READ');return result.results;},
  async advance(id,version,cursor,phase){const result=await db.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=?,phase=? WHERE id=? AND version=? AND phase='receiving'").bind(cursor,phase,id,version).run();fail(result.success,'IMPORT_LEDGER_WRITE');return result.meta.changes===1;},
 };
}
