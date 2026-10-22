// Schema is migration-owned. D1 batch is atomic; no request creates tables.
const emptyTables=['shared_state','state_backups','web_feedback_store','process_snapshot_target','process_snapshot_transfers','process_snapshot_chunks','process_snapshot_activations','process_snapshot_resource_audits','process_revoked_sessions','process_owner_bootstrap'];
const emptySQL=emptyTables.map(name=>'NOT EXISTS (SELECT 1 FROM "'+name+'")').join(' AND ');
const fail=(value,code)=>{if(!value)throw Error(code);};
export function createOwnerBootstrapStore(db,bucket){
 return {
  async assertEmpty(){
   const row=await db.prepare('SELECT CASE WHEN '+emptySQL+' THEN 1 ELSE 0 END AS empty').first();fail(row?.empty===1,'OWNER_SETUP_OCCUPIED');
   const inventory=await bucket.list({limit:1});fail(!inventory.truncated&&Array.isArray(inventory.objects)&&inventory.objects.length===0,'OWNER_SETUP_OCCUPIED');
  },
  async initialize(value){
   const statements=[
    db.prepare('INSERT INTO process_owner_bootstrap (id,project_id,target,manifest_sha,program_commit,owner_id,attempt_id,created_at,expires_at) SELECT 1,?,?,?,?,?,?,?,? WHERE '+emptySQL).bind(value.projectId,value.target,value.manifest,value.programCommit,value.ownerId,value.attempt,value.createdAt,value.expiresAt),
    db.prepare('INSERT INTO shared_state (id,revision,"values",updated_at) SELECT 1,0,?,? WHERE NOT EXISTS (SELECT 1 FROM shared_state) AND EXISTS (SELECT 1 FROM process_owner_bootstrap WHERE id=1 AND attempt_id=? AND project_id=? AND target=? AND owner_id=?)').bind(value.values,value.updatedAt,value.attempt,value.projectId,value.target,value.ownerId),
   ];
   const results=await db.batch(statements);fail(results.length===2&&results.every(r=>r.success&&r.meta?.changes===1),'OWNER_SETUP_WRITE_UNCERTAIN');
   const row=await db.prepare('SELECT project_id,target,owner_id,attempt_id FROM process_owner_bootstrap WHERE id=1').first();
   fail(row?.attempt_id===value.attempt&&row.project_id===value.projectId&&row.target===value.target&&row.owner_id===value.ownerId,'OWNER_SETUP_WRITE_UNCERTAIN');
  },
 };
}
