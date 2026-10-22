export const hostedActivationSchemaSQL=`
CREATE TABLE process_snapshot_activations (
 transfer_id TEXT PRIMARY KEY NOT NULL, phase TEXT NOT NULL,
 version INTEGER NOT NULL, audit_cursor INTEGER NOT NULL,
 copy_cursor INTEGER NOT NULL, db_cursor INTEGER NOT NULL,
 bootstrap_sha TEXT NOT NULL
);
CREATE TABLE process_snapshot_resource_audits (
 transfer_id TEXT NOT NULL, resource TEXT NOT NULL, ordinal INTEGER NOT NULL,
 bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, refs TEXT NOT NULL,
 copy_state TEXT, copy_version INTEGER NOT NULL,
 PRIMARY KEY(transfer_id,resource), UNIQUE(transfer_id,ordinal)
);`;
const ok=(value,code)=>{if(!value)throw Error(code);};
export function createHostedActivationStore(db){return {
 get(id){return db.prepare('SELECT * FROM process_snapshot_activations WHERE transfer_id=?').bind(id).first();},
 async start(id,bootstrapSha){const result=await db.prepare("INSERT INTO process_snapshot_activations (transfer_id,phase,version,audit_cursor,copy_cursor,db_cursor,bootstrap_sha) VALUES (?,'auditing',1,0,0,0,?) ON CONFLICT(transfer_id) DO NOTHING").bind(id,bootstrapSha).run();ok(result.success,'IMPORT_ACTIVATION_LEDGER');return this.get(id);},
 async receipts(id){const r=await db.prepare('SELECT * FROM process_snapshot_resource_audits WHERE transfer_id=? ORDER BY ordinal').bind(id).all();ok(r.success,'IMPORT_AUDIT_LEDGER');return r.results;},
 resource(id,name){return db.prepare('SELECT * FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource=?').bind(id,name).first();},
 async audit(id,version,ordinal,receipt){const results=await db.batch([
  db.prepare("INSERT INTO process_snapshot_resource_audits (transfer_id,resource,ordinal,bytes,sha256,refs,copy_version) SELECT ?,?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND phase='auditing' AND version=? AND audit_cursor=?) ON CONFLICT(transfer_id,resource) DO NOTHING").bind(id,receipt.resource,ordinal,receipt.bytes,receipt.sha256,JSON.stringify(receipt.references),id,version,ordinal),
  db.prepare("UPDATE process_snapshot_activations SET version=version+1,audit_cursor=audit_cursor+1 WHERE transfer_id=? AND phase='auditing' AND version=? AND audit_cursor=?").bind(id,version,ordinal),
 ]);ok(results.every(r=>r.success),'IMPORT_AUDIT_LEDGER');ok(results[1].meta.changes===1,'IMPORT_VERSION_CONFLICT');},
 async advance(id,version,phase,patch={}){const row=await this.get(id);ok(row&&row.version===version,'IMPORT_VERSION_CONFLICT');const result=await db.prepare('UPDATE process_snapshot_activations SET version=version+1,phase=?,copy_cursor=?,db_cursor=? WHERE transfer_id=? AND version=?').bind(phase,patch.copyCursor??row.copy_cursor,patch.dbCursor??row.db_cursor,id,version).run();ok(result.success&&result.meta.changes===1,'IMPORT_VERSION_CONFLICT');},
 async copy(id,name,version,state){const r=await db.prepare('UPDATE process_snapshot_resource_audits SET copy_state=?,copy_version=copy_version+1 WHERE transfer_id=? AND resource=? AND copy_version=?').bind(JSON.stringify(state),id,name,version).run();ok(r.success&&r.meta.changes===1,'IMPORT_COPY_VERSION_CONFLICT');return this.resource(id,name);},
};}
