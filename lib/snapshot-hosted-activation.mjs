import {copyPinnedObject} from './snapshot-copy-object.mjs';
import {planOwnerStorage} from './snapshot-owner-storage.mjs';
import {sha256} from './snapshot-contract.mjs';
import {snapshotTables} from './snapshot-d1-r2.mjs';
import {hostedAuditContext,auditHostedResource,finishHostedAudit} from './snapshot-hosted-audit.mjs';
import {importTargetIsActive} from './snapshot-import-gate.mjs';
const encoder=new TextEncoder();
const fail=(value,code)=>{if(!value)throw Error(code);};
const encode=value=>encoder.encode(JSON.stringify(value));
async function bootstrap(db){const r=await db.prepare('SELECT id,revision,"values",updated_at FROM shared_state LIMIT 2').all();fail(r.success&&r.results.length<=1,'IMPORT_TARGET_OCCUPIED');return r.results[0]||null;}
const bootstrapPin=row=>sha256(encode(row));

function ownerCredentials(row,id){
 fail(row,'IMPORT_OWNER_CREDENTIALS_REQUIRED');const values=JSON.parse(row.values),users=typeof values.platformUsers==='string'?JSON.parse(values.platformUsers):values.platformUsers;
 fail(Array.isArray(users)&&users.length===1&&String(users[0].id||'').trim().toLowerCase()===String(id||'').trim().toLowerCase()&&users[0].role==='admin'&&users[0].disabled!==true&&users[0].enabled!==false&&users[0].authMode!=='demo'&&!users[0].deletedAt,'IMPORT_OWNER_CREDENTIALS_REQUIRED');
 const user=users[0],credentials={};for(const key of ['passwordHash','password'])if(typeof user[key]==='string'&&user[key].length)credentials[key]=user[key];
 fail(Object.keys(credentials).length,'IMPORT_OWNER_CREDENTIALS_REQUIRED');return {credentials,authEpoch:Number.isSafeInteger(user.authEpoch)?user.authEpoch:0};
}

export function createHostedActivation({transfer,store,transferStore,db,bucket,ownerId}){
 async function businessReady(id){try{return await importTargetIsActive(db,id);}catch{return false;}}
 async function context(actor,id){return hostedAuditContext(await transfer.source(actor,id));}
 async function selected(id,expectedVersion,allowed){const row=await store.get(id);fail(row&&row.version===expectedVersion&&allowed.includes(row.phase),'IMPORT_VERSION_OR_PHASE');return row;}
 async function copyResource(ctx,resource,receipt,id){
   async function readRange(offset,length){const output=new Uint8Array(length);let copied=0;for(const c of resource.descriptors){const from=Math.max(offset,c.offset),to=Math.min(offset+length,c.offset+c.bytes);if(from>=to)continue;const data=await ctx.source.readChunk(c.id);output.set(data.subarray(from-c.offset,to-c.offset),from-offset);copied+=to-from;}fail(copied===length,'IMPORT_COPY_SOURCE');return output;}
   return copyPinnedObject({store,bucket,transferId:id,resourceName:resource.name,key:resource.name.slice(3),bytes:receipt.bytes,sha256:receipt.sha256,metadata:resource.metadata,readRange});
  }
 return {
  async audit(actor,id,{expectedVersion,limit=1}={}){
   fail(Number.isSafeInteger(limit)&&limit>=1&&limit<=4,'IMPORT_AUDIT_LIMIT');
   const source=await transfer.source(actor,id),ctx=await hostedAuditContext(source);ctx.source=source;
   let row=await store.get(id);
   if(!row){await transferStore.assertFresh(ownerId,id);row=await store.start(id,await bootstrapPin(await bootstrap(db)));}
   fail(row.phase==='auditing'&&(expectedVersion===undefined||row.version===expectedVersion),'IMPORT_VERSION_OR_PHASE');
   const names=[...ctx.resources.keys()];
   if(row.audit_cursor<names.length){let checked=0,bytes=0;while(row.audit_cursor<names.length&&checked<limit){const name=names[row.audit_cursor],size=ctx.resources.get(name).bytes;if(checked&&bytes+size>8*1024*1024)break;const receipt=await auditHostedResource(ctx,name);await store.audit(id,row.version,row.audit_cursor,receipt);checked++;bytes+=size;row=await store.get(id);}return {id,phase:'auditing',version:row.version,auditedResources:row.audit_cursor,totalResources:names.length,dataReady:false};}
   const summary=await finishHostedAudit(ctx,await store.receipts(id));
   await store.advance(id,row.version,'sealed');return {id,phase:'sealed',version:row.version+1,...summary};
  },
  async copy(actor,id,{expectedVersion,limit=1}={}){
   fail(Number.isSafeInteger(limit)&&limit>=1&&limit<=4,'IMPORT_COPY_LIMIT');
   const source=await transfer.source(actor,id),ctx=await hostedAuditContext(source);ctx.source=source;
   let row=await selected(id,expectedVersion,['sealed','copying']);const objects=[...ctx.resources.values()].filter(r=>r.name.startsWith('r2/'));
   fail(await bootstrapPin(await bootstrap(db))===row.bootstrap_sha,'IMPORT_BOOTSTRAP_CHANGED');
   if(row.copy_cursor===objects.length){await store.advance(id,row.version,'restoring');return {id,phase:'restoring',version:row.version+1,dataReady:false};}
   let checked=0,bytes=0;while(row.copy_cursor<objects.length&&checked<limit){const resource=objects[row.copy_cursor];if(checked&&bytes+resource.bytes>8*1024*1024)break;const receipt=await store.resource(id,resource.name);fail(receipt,'IMPORT_AUDIT_COVERAGE');const done=await copyResource(ctx,resource,receipt,id);await store.advance(id,row.version,'copying',{copyCursor:row.copy_cursor+(done?1:0)});checked++;bytes+=resource.bytes;row=await store.get(id);if(!done)break;}
   return {id,phase:'copying',version:row.version,completedObjects:row.copy_cursor,totalObjects:objects.length,dataReady:false};
  },
  /** @param {{expectedVersion?: number, limit?: number}} [options] */
  async restore(actor,id,options={}){
   const {expectedVersion,limit=32}=options;
   const ctx=await context(actor,id),row=await selected(id,expectedVersion,['restoring']);fail(Number.isSafeInteger(limit)&&limit>0&&limit<=64,'IMPORT_RESTORE_LIMIT');
   fail(await bootstrapPin(await bootstrap(db))===row.bootstrap_sha,'IMPORT_BOOTSTRAP_CHANGED');
   const rows=[...ctx.tables.state_backups.map(value=>({table:'state_backups',value})),...ctx.tables.web_feedback_store.map(value=>({table:'web_feedback_store',value}))],end=Math.min(row.db_cursor+limit,rows.length),statements=[];
   for(const item of rows.slice(row.db_cursor,end)){
    const columns=snapshotTables[item.table],existing=await db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${item.table}" WHERE id=?`).bind(item.value.id).first();
    if(existing){
     if(JSON.stringify(columns.map(c=>existing[c]))===JSON.stringify(columns.map(c=>item.value[c])))continue;
     fail(item.table==='web_feedback_store'&&existing.id===1&&existing.revision===0&&existing.payload==='{"issues":[],"attachments":[],"batches":[],"handoffs":[]}','IMPORT_DATABASE_ROW_CONFLICT');
     statements.push(db.prepare("UPDATE web_feedback_store SET revision=?,payload=? WHERE id=1 AND revision=0 AND payload=? AND EXISTS (SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND version=? AND phase='restoring')").bind(item.value.revision,item.value.payload,existing.payload,id,row.version));
    }else statements.push(db.prepare(`INSERT INTO "${item.table}" (${columns.map(c=>'"'+c+'"').join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS (SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND version=? AND phase='restoring')`).bind(...columns.map(c=>item.value[c]),id,row.version));
   }
   const phase=end===rows.length?'data-ready':'restoring';
   statements.push(db.prepare("UPDATE process_snapshot_activations SET db_cursor=?,phase=?,version=version+1 WHERE transfer_id=? AND version=? AND phase='restoring'").bind(end,phase,id,row.version));
   const result=await db.batch(statements);fail(result.every(r=>r.success)&&result.at(-1).meta.changes===1,'IMPORT_DATABASE_VERSION_CONFLICT');
   return {id,phase,version:row.version+1,restoredRows:end,dataReady:phase==='data-ready',authReady:false,businessTrafficEnabled:false};
  },
  async activate(actor,id,{expectedVersion}={}){
   const ctx=await context(actor,id),row=await store.get(id);
   if(row?.phase==='active')return {id,phase:'active',dataReady:true,businessTrafficEnabled:await businessReady(id),ownerLoginConfigured:true,employeeCredentialsMigrated:false};
   fail(row?.phase==='data-ready'&&row.version===expectedVersion,'IMPORT_VERSION_OR_PHASE');
   const old=await bootstrap(db);fail(await bootstrapPin(old)===row.bootstrap_sha,'IMPORT_BOOTSTRAP_CHANGED');
   const retained=ownerCredentials(old,ownerId);
   for(const table of ['state_backups','web_feedback_store']){
    const columns=snapshotTables[table],count=await db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).first();fail(count?.count===ctx.tables[table].length,'IMPORT_DATABASE_COVERAGE');
    const actual=await db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${table}" ORDER BY id`).all(),ordered=rows=>rows.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id),'en')).map(r=>columns.map(c=>r[c]));
    fail(actual.success&&JSON.stringify(ordered(actual.results))===JSON.stringify(ordered(ctx.tables[table])),'IMPORT_DATABASE_READBACK');
   }
   const owner=await planOwnerStorage({row:ctx.tables.shared_state[0],ownerId,retained,bucket,knownKeys:ctx.knownKeys});
   if(owner.object){
    await store.ownerResource(id,row.version,ctx.resources.size,owner.object);
    const ready=await copyPinnedObject({store,bucket,transferId:id,resourceName:'owner/current',...owner.object});
    if(!ready){await store.advance(id,row.version,'data-ready');return {id,phase:'data-ready',version:row.version+1,ownerPreparing:true,dataReady:true,authReady:false,businessTrafficEnabled:false};}
   }
   const current=owner.row;
   const result=await db.batch([
    db.prepare("UPDATE shared_state SET revision=?,\"values\"=?,updated_at=? WHERE id=1 AND revision=? AND \"values\"=? AND updated_at=? AND EXISTS (SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND version=? AND phase='data-ready')").bind(current.revision,current.values,current.updated_at,old.revision,old.values,old.updated_at,id,row.version),
    db.prepare("UPDATE process_snapshot_activations SET phase='active',version=version+1 WHERE transfer_id=? AND version=? AND phase='data-ready' AND EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND \"values\"=? AND updated_at=?)").bind(id,row.version,current.revision,current.values,current.updated_at),
   ]);
   fail(result.every(r=>r.success)&&result[1].meta.changes===1,'IMPORT_ACTIVATION_CONFLICT');
   return {id,phase:'active',dataReady:true,businessTrafficEnabled:await businessReady(id),ownerLoginConfigured:true,employeeCredentialsMigrated:false,previousOwnerSessionInvalidated:true};
  },
  async status(actor,id){await transfer.source(actor,id);const row=await store.get(id);return row?{id,phase:row.phase,version:row.version,auditedResources:row.audit_cursor,completedObjects:row.copy_cursor,restoredRows:row.db_cursor,dataReady:['data-ready','active'].includes(row.phase),businessTrafficEnabled:row.phase==='active'&&await businessReady(id),employeeCredentialsMigrated:false}:{id,phase:'not-audited',dataReady:false,businessTrafficEnabled:false};},
 };
}
