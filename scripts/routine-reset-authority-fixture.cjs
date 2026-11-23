// In-memory synthetic native-dispatch context only; never sends a request to this origin.
const {createHash}=require('node:crypto');
const origin='https://process-os-test.franktsai0421.chatgpt.site',project='appgprj_6ad9abaff47c8191846eb9821034696b',siteIdentity='synthetic-native-owner';
const headers={'oai-authenticated-user-id':siteIdentity,'content-type':'application/json'};
function enable(f,scopes={fqc:true,iqc:true}){
 const target='a'.repeat(64),commit='c'.repeat(40);
 f.db.prepare('INSERT OR REPLACE INTO process_snapshot_target(id,target,transfer_id) VALUES(1,?,?)').run(target,'synthetic-transfer');
 f.db.prepare('INSERT OR REPLACE INTO process_snapshot_transfers(id,project_id,target,manifest_sha,manifest_key,owner_id,phase,version,verify_cursor,chunk_count,total_bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-transfer',project,target,'b'.repeat(64),'synthetic-manifest','frank','integrity-verified',1,1,1,1,1,2);
 f.db.prepare('INSERT OR REPLACE INTO process_owner_bootstrap(id,project_id,target,manifest_sha,program_commit,owner_id,attempt_id,created_at,expires_at) VALUES(1,?,?,?,?,?,?,?,?)').run(project,target,'b'.repeat(64),commit,'frank','synthetic-bootstrap',1,2);
 f.env.PROCESS_PROGRAM_COMMIT=commit;
 return f.env.PROCESS_ROUTINE_RESET_ACTIVATION=JSON.stringify({version:1,testOnly:true,projectId:project,origin,ownerId:'frank',dbTarget:target,transferId:'synthetic-transfer',bootstrapAttemptId:'synthetic-bootstrap',programCommit:commit,expiresAt:new Date(Date.now()+3600000).toISOString(),siteOwnerIdSha256:createHash('sha256').update(siteIdentity).digest('hex'),scopes});
}
module.exports={origin,project,siteIdentity,headers,enable};
