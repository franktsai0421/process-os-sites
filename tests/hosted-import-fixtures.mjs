import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {fixture,memoryPackage,fakeDb,fakeBucket,stage} from './snapshot-fixtures.mjs';
import {restoreLocalSnapshot} from '../lib/snapshot-local.mjs';
import {addFeedbackFixture} from './snapshot-feedback-fixture.mjs';
import {createD1R2Source} from '../lib/snapshot-d1-r2.mjs';
import {exportSnapshot,sha256} from '../lib/snapshot-contract.mjs';
import {createHostedTransfer} from '../lib/snapshot-hosted-transfer.mjs';
import {createHostedTransferStore} from '../lib/snapshot-hosted-store.mjs';
import {createHostedActivationStore} from '../lib/snapshot-hosted-activation-store.mjs';
import {createHostedActivation} from '../lib/snapshot-hosted-activation.mjs';
export const actor={id:'fixture-owner',role:'admin',sessionType:'platform',exportAllowed:true};
export const encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
export function d1(sqlite){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},async run(){if(/^\s*SELECT\b/i.test(sql))return {success:true,results:sqlite.prepare(sql).all(...args),meta:{changes:0}};return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
export function fakeR2(){
 const objects=new Map(),uploads=new Map();let serial=0;
 const api={objects,uploads,failPartReceiptOnce:false,failCreateOnce:false,
  async list({cursor,limit=100}={}){const items=[...objects.values()].sort((a,b)=>a.key.localeCompare(b.key,'en')),start=Number(cursor||0);return {objects:items.slice(start,start+limit).map(o=>({key:o.key,size:o.data.length,etag:o.etag,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata})),truncated:start+limit<items.length,cursor:String(start+limit)};},
  async get(key,options={}){const o=objects.get(key);if(!o)return null;if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==o.etag)return {key,size:o.data.length,etag:o.etag};const start=options.range?.offset||0,bytes=options.range?o.data.slice(start,start+options.range.length):o.data.slice();return {key,size:o.data.length,etag:o.etag,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata,body:new Blob([bytes]).stream(),async text(){return new TextDecoder().decode(bytes);},async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};},
  async head(key){const o=objects.get(key);return o?{key,size:o.data.length,etag:o.etag}:null;},
  async put(key,bytes,options={}){if(options.onlyIf?.etagDoesNotMatch==='*'&&objects.has(key))return null;const data=bytes instanceof Uint8Array?bytes.slice():new Uint8Array(await new Response(bytes).arrayBuffer());const result={key,data,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{},etag:'fixture-'+(++serial)};objects.set(key,result);return {key,size:data.length,etag:result.etag};},
  async createMultipartUpload(key,options){const uploadId='upload-'+(++serial);uploads.set(uploadId,{key,options,parts:new Map()});if(api.failCreateOnce){api.failCreateOnce=false;throw Error('SYNTHETIC_CREATE_OUTCOME_UNCERTAIN');}return api.resumeMultipartUpload(key,uploadId);},
  resumeMultipartUpload(key,uploadId){const item=uploads.get(uploadId);if(!item||item.key!==key)throw Error('SYNTHETIC_UNKNOWN_UPLOAD');return {key,uploadId,async uploadPart(partNumber,data){const etag='fixture-part-'+partNumber;item.parts.set(partNumber,{partNumber,etag,data:data.slice()});if(api.failPartReceiptOnce){api.failPartReceiptOnce=false;throw Error('SYNTHETIC_PART_RECEIPT_LOST');}return {partNumber,etag};},async complete(parts){const selected=parts.map(p=>{const itemPart=item.parts.get(p.partNumber);if(!itemPart||itemPart.etag!==p.etag)throw Error('SYNTHETIC_PART_CONFLICT');return itemPart;});const bytes=new Uint8Array(selected.reduce((n,p)=>n+p.data.length,0));let offset=0;for(const part of selected){bytes.set(part.data,offset);offset+=part.data.length;}await api.put(key,bytes,item.options);uploads.delete(uploadId);return api.head(key);},async abort(){uploads.delete(uploadId);}};},
 };return api;
}
export async function setup({large=false,bootstrap=true,legacyR2=false,largeLegacyR2=false,disabledSourceOwner=false,canonical=true,recordEnvelope=false,feedback=false,sharedCanonical=false}={}){
 const f=await fixture();
 const current={platformUsers:JSON.stringify([{id:actor.id,username:'synthetic-owner',role:'admin',password:'SOURCE_FIXTURE_EXCLUDED',authEpoch:0}]),maintenanceMode:'1',masterDataControl:JSON.stringify({ref:f.childKey,note:'保留 / Giữ lại'})};
 f.db.tables.shared_state[0].values=JSON.stringify(current);
 if(legacyR2||largeLegacyR2){const raw=encode({...current,...(largeLegacyR2?{notes:'z'.repeat(9*1024*1024)}:{})}),digest=await sha256(raw),key='snapshots/'+digest+'.json';f.bucket.objects.set(key,{key,data:raw,etag:'fixture-owner-root',httpMetadata:{contentType:'application/json'}});f.db.tables.shared_state[0].values=JSON.stringify({platformUsers:current.platformUsers,maintenanceMode:'1',__processR2:{key,sha256:digest}});}
 if(disabledSourceOwner)f.db.tables.shared_state[0].values=JSON.stringify({...current,platformUsers:JSON.stringify([{id:actor.id,role:'admin',enabled:false}])});
 if(recordEnvelope){const refs={};for(const [field,value] of Object.entries(current)){const data=encode(value),digest=await sha256(data),key='state-records/v1/'+digest+'.json';f.bucket.objects.set(key,{key,data,etag:'fixture-record-'+field,httpMetadata:{contentType:'application/json'}});refs[field]={key,sha256:digest};}f.db.tables.shared_state[0].values=JSON.stringify({__processRecords:{version:1,values:refs,legacySources:{}},platformUsers:current.platformUsers,maintenanceMode:'1'});}
 if(sharedCanonical)for(const label of ['a','b']){const data=encode({platformUsers:current.platformUsers,note:'same business data',password:'SYNTHETIC_VARIANT_'+label}),digest=await sha256(data),key='snapshots/'+digest+'.json';f.bucket.objects.set(key,{key,data,etag:'different-source-etag-'+label,httpMetadata:{contentType:'application/json'}});f.db.tables.state_backups.push({id:'shared-canonical-'+label,revision:label==='a'?11:12,values:JSON.stringify({platformUsers:current.platformUsers,__processR2:{key,sha256:digest}}),reason:'preserve duplicate reference',actor:'fixture-owner',created_at:'fixture-'+label});}
 f.db.tables.state_backups.push({...f.db.tables.state_backups[0],id:'history-shared-reference'});
 if(large){const raw=encode({note:'z'.repeat(8*1024*1024+64),photo:'/api/iqc/photo?id='+f.imageKey.split('/').at(-1),secret:'SOURCE_FIXTURE_EXCLUDED'}),key='snapshots/'+await sha256(raw)+'.json';f.bucket.objects.set(key,{key,data:raw,etag:'fixture-large-json',httpMetadata:{contentType:'application/json'}});const image=new Uint8Array(6*1024*1024+17);image[0]=137;const imageKey='iqc/photos/'+await sha256(image);f.bucket.objects.set(imageKey,{key:imageKey,data:image,etag:'fixture-large-image',httpMetadata:{contentType:'image/png'}});}
 const assetBytes=encode('synthetic image'),assetHash=await sha256(assetBytes),assetKey='company-assets/objects/'+assetHash;
 f.bucket.objects.set(assetKey,{key:assetKey,data:assetBytes,etag:'fixture-private-image',httpMetadata:{contentType:'image/png'},customMetadata:{sha256:assetHash}});
 f.bucket.objects.set('company-assets/index.json',{key:'company-assets/index.json',data:encode({format:'PROCESS_OS_COMPANY_ASSETS_V1',assets:[{path:'/process/iqc-media/fixture.png',key:assetKey,sha256:assetHash,bytes:assetBytes.length,contentType:'image/png',permissions:['iqc.view']}]}),etag:'fixture-private-index',httpMetadata:{contentType:'application/json'}});
 if(feedback)await addFeedbackFixture(f);
 let pack=memoryPackage();await exportSnapshot(await createD1R2Source({db:f.db,bucket:f.bucket,programCommit:'a'.repeat(40)}),pack);
 if(canonical){
  // The transport preserves old content-address names after scrubbing. Exercise
  // the EXISTING isolated-local rebuilder with synthetic bindings to obtain an
  // explicitly normalized fixture. This is not proof of a true R1 conversion.
  const normalizedDb=fakeDb(),normalizedBucket=fakeBucket();
  await restoreLocalSnapshot(pack,{db:normalizedDb,bucket:normalizedBucket,staging:stage(),proof:{kind:'local-platform-proxy',remoteBindings:false,emptyTarget:true}});
  pack=memoryPackage();await exportSnapshot(await createD1R2Source({db:normalizedDb,bucket:normalizedBucket,programCommit:'a'.repeat(40)}),pack);
 }
 const bytes=encode(pack.completed),sqlite=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync(new URL('../drizzle-sites-fresh/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle-sites-fresh/'+name,import.meta.url),'utf8'));
 if(bootstrap)sqlite.prepare('INSERT INTO shared_state (id,revision,"values",updated_at) VALUES (1,0,?,?)').run(JSON.stringify({platformUsers:JSON.stringify([{id:actor.id,username:'synthetic-owner',role:'admin',password:'TARGET_FIXTURE_ONLY',authEpoch:3}]),maintenanceMode:'1'}),'synthetic-bootstrap');
 const db=d1(sqlite),bucket=fakeR2(),config={enabled:true,projectId:'appgprj_fixture',targetFingerprint:'b'.repeat(64),manifestSha256:await sha256(bytes),ownerId:actor.id};
 const transferStore=createHostedTransferStore({db,bucket}),activationStore=createHostedActivationStore(db);
 function services(){const transfer=createHostedTransfer({store:transferStore,bucket,config,now:()=>1000}),activation=createHostedActivation({transfer,store:activationStore,transferStore,db,bucket,ownerId:actor.id});return {transfer,activation};}
 return {pack,bytes,sqlite,db,bucket,config,transferStore,activationStore,services,...services(),async close(){sqlite.close();}};
}
export async function upload(f){const {id}=await f.transfer.begin(actor,f.bytes);for(const chunk of f.pack.completed.chunks)await f.transfer.receive(actor,id,chunk.id,f.pack.chunks.get(chunk.id));let row=await f.transferStore.get(id);while(row.phase!=='integrity-verified'){await f.services().transfer.verify(actor,id,{expectedVersion:row.version,limit:8});row=await f.transferStore.get(id);}return id;}
export async function seal(f,id){let row=await f.activationStore.get(id);for(;;){const result=await f.services().activation.audit(actor,id,{expectedVersion:row?.version});if(result.phase==='sealed')return result;row=await f.activationStore.get(id);}}
export async function copy(f,id){for(;;){const row=await f.activationStore.get(id),result=await f.services().activation.copy(actor,id,{expectedVersion:row.version});if(result.phase==='restoring')return result;}}
export async function restore(f,id){for(;;){const row=await f.activationStore.get(id),result=await f.services().activation.restore(actor,id,{expectedVersion:row.version,limit:1});if(result.phase==='data-ready')return result;}}
