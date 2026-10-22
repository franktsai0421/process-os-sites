import {createHash} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
import {snapshotTables} from './snapshot-d1-r2.mjs';
import {readBoundedBody} from './snapshot-redaction.mjs';
import {hostedAuditContext,auditHostedResource,finishHostedAudit} from './snapshot-hosted-audit.mjs';
const encoder=new TextEncoder(),partBytes=5*1024*1024;
const fail=(value,code)=>{if(!value)throw Error(code);};
const encode=value=>encoder.encode(JSON.stringify(value));
async function bootstrap(db){const r=await db.prepare('SELECT id,revision,"values",updated_at FROM shared_state LIMIT 2').all();fail(r.success&&r.results.length<=1,'IMPORT_TARGET_OCCUPIED');return r.results[0]||null;}
const bootstrapPin=row=>sha256(encode(row));
async function objectPin(bucket,key){const object=await bucket.get(key);if(!object?.body)return null;const reader=object.body.getReader(),hash=createHash('sha256');let bytes=0;try{for(;;){const next=await reader.read();if(next.done)break;hash.update(next.value);bytes+=next.value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}fail(bytes===object.size,'IMPORT_COPY_READBACK');return {bytes,sha256:hash.digest('hex'),etag:object.etag};}
function ownerCredentials(row,id){
 fail(row,'IMPORT_OWNER_CREDENTIALS_REQUIRED');const values=JSON.parse(row.values),users=typeof values.platformUsers==='string'?JSON.parse(values.platformUsers):values.platformUsers;
 fail(Array.isArray(users)&&users.length===1&&users[0].id===id&&users[0].role==='admin'&&users[0].disabled!==true,'IMPORT_OWNER_CREDENTIALS_REQUIRED');
 const user=users[0],credentials={};for(const key of ['passwordHash','password'])if(typeof user[key]==='string'&&user[key].length)credentials[key]=user[key];
 fail(Object.keys(credentials).length,'IMPORT_OWNER_CREDENTIALS_REQUIRED');return {credentials,authEpoch:Number.isSafeInteger(user.authEpoch)?user.authEpoch:0};
}
function withOwnerCredentials(row,owner,retained){
 const values=JSON.parse(row.values);
 // The legacy R2 decoder takes users from the immutable body, not this inline
 // authentication overlay. Do not mark a login ready that it cannot consume.
 fail(!values.__processR2,'IMPORT_LEGACY_R2_OWNER_ACTIVATION_UNSUPPORTED');
 fail(!values.__processRecords,'IMPORT_RECORD_OWNER_ACTIVATION_UNSUPPORTED');
 const encoded=typeof values.platformUsers==='string',users=encoded?JSON.parse(values.platformUsers):values.platformUsers,user=users.find(u=>u.id===owner);
 fail(user&&user.role==='admin'&&user.disabled!==true&&user.enabled!==false,'IMPORT_OWNER_NOT_IN_SOURCE');
 Object.assign(user,retained.credentials);user.authEpoch=Math.max(retained.authEpoch,Number.isSafeInteger(user.authEpoch)?user.authEpoch:0)+1;
 values.platformUsers=encoded?JSON.stringify(users):users;return {...row,values:JSON.stringify(values)};
}
export function createHostedActivation({transfer,store,transferStore,db,bucket,ownerId}){
 async function context(actor,id){return hostedAuditContext(await transfer.source(actor,id));}
 async function selected(id,expectedVersion,allowed){const row=await store.get(id);fail(row&&row.version===expectedVersion&&allowed.includes(row.phase),'IMPORT_VERSION_OR_PHASE');return row;}
 async function copyResource(source,resource,receipt,id){
  let row=receipt,state=row.copy_state?JSON.parse(row.copy_state):null;
  async function save(value){row=await store.copy(id,resource.name,row.copy_version,value);state=value;}
  const key=resource.name.slice(3),existing=await objectPin(bucket,key);
  if(existing){fail(existing.bytes===receipt.bytes&&existing.sha256===receipt.sha256,'IMPORT_ORIGINAL_OBJECT_CONFLICT');if(state?.phase!=='complete')await save({phase:'complete',etag:existing.etag});return true;}
  fail(state?.phase!=='complete','IMPORT_COPY_OBJECT_MISSING');
  const options={httpMetadata:{...resource.metadata.httpMetadata},customMetadata:resource.metadata.customMetadata};
  if(options.httpMetadata.expires)options.httpMetadata.expires=new Date(options.httpMetadata.expires);
  if(resource.bytes<=partBytes){
   const bytes=await readBoundedBody(source.body(resource.name),partBytes);fail(await sha256(bytes)===receipt.sha256,'IMPORT_COPY_SOURCE');
   const result=await bucket.put(key,bytes,{...options,onlyIf:{etagDoesNotMatch:'*'}});
   const pin=await objectPin(bucket,key);fail(pin&&pin.bytes===receipt.bytes&&pin.sha256===receipt.sha256,'IMPORT_COPY_READBACK');
   await save({phase:'complete',etag:pin.etag,conditionalConflict:result===null});return true;
  }
  if(!state){
   // Persist intent first. An interrupted create with no returned upload ID is
   // explicitly uncertain and must not create a second orphan automatically.
   await save({phase:'creating'});
   const upload=await bucket.createMultipartUpload(key,options);
   await save({phase:'uploading',uploadId:upload.uploadId,next:0,parts:[]});
   return false;
  }
  fail(state.phase!=='creating','IMPORT_UPLOAD_CREATION_UNCERTAIN');
  fail(state.phase==='uploading'&&typeof state.uploadId==='string','IMPORT_UPLOAD_STATE');
  const upload=bucket.resumeMultipartUpload(key,state.uploadId);
  if(state.next<resource.descriptors.length){
   let end=state.next,length=0;const pieces=[];
   while(end<resource.descriptors.length&&length<partBytes){const bytes=await source.source.readChunk(resource.descriptors[end++].id);pieces.push(bytes);length+=bytes.length;}
   fail(length<=partBytes+1048576&&state.parts.length<10000,'IMPORT_MULTIPART_LIMIT');
   const bytes=new Uint8Array(length);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
   const part=await upload.uploadPart(state.parts.length+1,bytes);fail(part.partNumber===state.parts.length+1&&typeof part.etag==='string','IMPORT_MULTIPART_RECEIPT');
   await save({...state,next:end,parts:[...state.parts,part]});return false;
  }
  await upload.complete(state.parts);
  const pin=await objectPin(bucket,key);fail(pin&&pin.bytes===receipt.bytes&&pin.sha256===receipt.sha256,'IMPORT_COPY_READBACK');
  await save({phase:'complete',etag:pin.etag});return true;
 }
 return {
  async audit(actor,id,{expectedVersion}={}){
   const source=await transfer.source(actor,id),ctx=await hostedAuditContext(source);ctx.source=source;
   let row=await store.get(id);
   if(!row){await transferStore.assertFresh(ownerId);row=await store.start(id,await bootstrapPin(await bootstrap(db)));}
   fail(row.phase==='auditing'&&(expectedVersion===undefined||row.version===expectedVersion),'IMPORT_VERSION_OR_PHASE');
   const names=[...ctx.resources.keys()];
   if(row.audit_cursor<names.length){const receipt=await auditHostedResource(ctx,names[row.audit_cursor]);await store.audit(id,row.version,row.audit_cursor,receipt);return {id,phase:'auditing',version:row.version+1,auditedResources:row.audit_cursor+1,totalResources:names.length,dataReady:false};}
   const summary=await finishHostedAudit(ctx,await store.receipts(id));
   await store.advance(id,row.version,'sealed');return {id,phase:'sealed',version:row.version+1,...summary};
  },
  async copy(actor,id,{expectedVersion}={}){
   const source=await transfer.source(actor,id),ctx=await hostedAuditContext(source);ctx.source=source;
   const row=await selected(id,expectedVersion,['sealed','copying']),objects=[...ctx.resources.values()].filter(r=>r.name.startsWith('r2/'));
   fail(await bootstrapPin(await bootstrap(db))===row.bootstrap_sha,'IMPORT_BOOTSTRAP_CHANGED');
   if(row.copy_cursor===objects.length){await store.advance(id,row.version,'restoring');return {id,phase:'restoring',version:row.version+1,dataReady:false};}
   const resource=objects[row.copy_cursor],receipt=await store.resource(id,resource.name);fail(receipt,'IMPORT_AUDIT_COVERAGE');
   const done=await copyResource(ctx,resource,receipt,id);
   await store.advance(id,row.version,'copying',{copyCursor:row.copy_cursor+(done?1:0)});
   return {id,phase:'copying',version:row.version+1,completedObjects:row.copy_cursor+(done?1:0),totalObjects:objects.length,dataReady:false};
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
   if(row?.phase==='active')return {id,phase:'active',dataReady:true,ownerLoginConfigured:true,employeeCredentialsMigrated:false};
   fail(row?.phase==='data-ready'&&row.version===expectedVersion,'IMPORT_VERSION_OR_PHASE');
   const old=await bootstrap(db);fail(await bootstrapPin(old)===row.bootstrap_sha,'IMPORT_BOOTSTRAP_CHANGED');
   const retained=ownerCredentials(old,ownerId),current=withOwnerCredentials(ctx.tables.shared_state[0],ownerId,retained);
   for(const table of ['state_backups','web_feedback_store']){
    const columns=snapshotTables[table],count=await db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).first();fail(count?.count===ctx.tables[table].length,'IMPORT_DATABASE_COVERAGE');
    const actual=await db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${table}" ORDER BY id`).all(),ordered=rows=>rows.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id),'en')).map(r=>columns.map(c=>r[c]));
    fail(actual.success&&JSON.stringify(ordered(actual.results))===JSON.stringify(ordered(ctx.tables[table])),'IMPORT_DATABASE_READBACK');
   }
   const result=await db.batch([
    db.prepare("UPDATE shared_state SET revision=?,\"values\"=?,updated_at=? WHERE id=1 AND revision=? AND \"values\"=? AND updated_at=? AND EXISTS (SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND version=? AND phase='data-ready')").bind(current.revision,current.values,current.updated_at,old.revision,old.values,old.updated_at,id,row.version),
    db.prepare("UPDATE process_snapshot_activations SET phase='active',version=version+1 WHERE transfer_id=? AND version=? AND phase='data-ready' AND EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND \"values\"=? AND updated_at=?)").bind(id,row.version,current.revision,current.values,current.updated_at),
   ]);
   fail(result.every(r=>r.success)&&result[1].meta.changes===1,'IMPORT_ACTIVATION_CONFLICT');
   return {id,phase:'active',dataReady:true,ownerLoginConfigured:true,employeeCredentialsMigrated:false,previousOwnerSessionInvalidated:true};
  },
  async status(actor,id){await transfer.source(actor,id);const row=await store.get(id);return row?{id,phase:row.phase,version:row.version,auditedResources:row.audit_cursor,completedObjects:row.copy_cursor,restoredRows:row.db_cursor,dataReady:['data-ready','active'].includes(row.phase),businessTrafficEnabled:row.phase==='active',employeeCredentialsMigrated:false}:{id,phase:'not-audited',dataReady:false,businessTrafficEnabled:false};},
 };
}
