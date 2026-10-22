// Incremental semantic audit of the existing V1 profile. One logical resource
// per request; payloads stay in bounded readers. No database publication here.
import {createHash} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
import {snapshotTables} from './snapshot-d1-r2.mjs';
import {cleanJson,scrubJsonBytes,objectEncoding,maximumJsonBytes,readBoundedBody} from './snapshot-redaction.mjs';
import {analyzeJsonStream} from './snapshot-json-stream.mjs';
import {prepareFeedbackArchive,validateFeedbackCoverage,feedbackStore} from './snapshot-format-plan.mjs';
import {validateAssetIndex} from './site-security.mjs';
const requireValue=(v,c)=>{if(!v)throw Error(c);};
export async function hostedAuditContext(source){
 const manifest=await source.manifest(),resources=new Map();
 for(const descriptor of manifest.chunks){let resource=resources.get(descriptor.resource);if(!resource){resource={name:descriptor.resource,bytes:descriptor.totalBytes,metadata:descriptor.metadata,descriptors:[]};resources.set(descriptor.resource,resource);}resource.descriptors.push(descriptor);}
 requireValue(resources.size<=10003,'IMPORT_RESOURCE_LIMIT');
 const knownKeys=new Set([...resources.keys()].filter(n=>n.startsWith('r2/')).map(n=>n.slice(3)));
 function body(name){const resource=resources.get(name);requireValue(resource,'IMPORT_RESOURCE_MISSING');let cursor=0;return new ReadableStream({async pull(controller){try{if(cursor===resource.descriptors.length){controller.close();return;}controller.enqueue(await source.readChunk(resource.descriptors[cursor++].id));}catch(error){controller.error(error);}}});}
 const bytes=name=>readBoundedBody(body(name),maximumJsonBytes);
 async function range(key,offset,length){const resource=resources.get('r2/'+key);requireValue(resource&&length>=0&&length<=1048576&&offset>=0&&offset+length<=resource.bytes,'IMPORT_RANGE');const output=new Uint8Array(length);let copied=0;for(const c of resource.descriptors){const from=Math.max(offset,c.offset),to=Math.min(offset+length,c.offset+c.bytes);if(from>=to)continue;const data=await source.readChunk(c.id);output.set(data.subarray(from-c.offset,to-c.offset),from-offset);copied+=to-from;}requireValue(copied===length,'IMPORT_RANGE');return output;}
 const tables={};
 for(const [table,columns]of Object.entries(snapshotTables)){
  const raw=await bytes('db/'+table);requireValue(await sha256(scrubJsonBytes(raw))===await sha256(raw),'IMPORT_CREDENTIAL_OR_NONCANONICAL_TABLE');
  const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));requireValue(Array.isArray(rows)&&rows.length<=1024&&rows.every(r=>Object.keys(r).sort().join()===columns.slice().sort().join()),'IMPORT_TABLE_COLUMNS');
  const ids=new Set();for(const row of rows){requireValue((typeof row.id==='string'||Number.isSafeInteger(row.id))&&!ids.has(row.id)&&Number.isSafeInteger(row.revision)&&row.revision>=0,'IMPORT_TABLE_ID_OR_REVISION');ids.add(row.id);for(const column of columns)if(!['id','revision'].includes(column))requireValue(typeof row[column]==='string','IMPORT_TABLE_TYPE');}tables[table]=rows;
 }
 requireValue(tables.shared_state.length===1&&tables.shared_state[0].id===1&&tables.web_feedback_store.length===1&&tables.web_feedback_store[0].id===1,'IMPORT_TABLE_SINGLETON');
 const objects=[...knownKeys].map(key=>{const resource=resources.get('r2/'+key);let encoding=objectEncoding({key,httpMetadata:resource.metadata?.httpMetadata});if(encoding==='json'&&resource.bytes>maximumJsonBytes)encoding='json-stream';requireValue(encoding===resource.metadata?.encoding,'IMPORT_ENCODING');requireValue(['json','json-stream','binary','feedback-zip'].includes(encoding),'IMPORT_CONTAINER_PROFILE_UNSUPPORTED');requireValue(JSON.stringify(cleanJson(resource.metadata))===JSON.stringify(resource.metadata),'IMPORT_METADATA_CREDENTIAL');return {key,size:resource.bytes,encoding,httpMetadata:resource.metadata.httpMetadata||{},customMetadata:resource.metadata.customMetadata||{}};});
 validateFeedbackCoverage(tables,objects);
 const refs=new Set();cleanJson(tables,{knownKeys,references:refs});requireValue([...refs].every(key=>knownKeys.has(key)),'IMPORT_REFERENCE_MISSING');
 return {manifest,resources,knownKeys,tables,objects,body,bytes,range};
}
async function digest(body){const reader=body.getReader(),hash=createHash('sha256');let bytes=0;try{for(;;){const next=await reader.read();if(next.done)break;hash.update(next.value);bytes+=next.value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return {bytes,sha256:hash.digest('hex')};}
export async function auditHostedResource(context,name){
 const resource=context.resources.get(name);requireValue(resource,'IMPORT_RESOURCE_MISSING');
 const pin=await digest(context.body(name));requireValue(pin.bytes===resource.bytes,'IMPORT_RESOURCE_SIZE');const references=new Set();
 const contentAddress=name.match(/^r2\/(?:snapshots\/|state-records\/v1\/|delivery\/v1\/)([a-f0-9]{64})\.json$/)?.[1];
 requireValue(!contentAddress||contentAddress===pin.sha256,'IMPORT_IMMUTABLE_KEY_REQUIRES_NORMALIZATION');
 if(name.startsWith('db/'))cleanJson(context.tables[name.slice(3)],{knownKeys:context.knownKeys,references});
 else{
  const key=name.slice(3),object=context.objects.find(o=>o.key===key);
  if(object.encoding==='json'){const raw=await context.bytes(name);requireValue(await sha256(scrubJsonBytes(raw,{knownKeys:context.knownKeys,references}))===pin.sha256,'IMPORT_RESOURCE_CREDENTIAL_OR_CANONICAL');}
  else if(object.encoding==='json-stream'){const result=await analyzeJsonStream(()=>context.body(name),{knownKeys:context.knownKeys});requireValue(result.bytes===pin.bytes&&result.sha256===pin.sha256,'IMPORT_RESOURCE_CREDENTIAL_OR_CANONICAL');for(const ref of result.references)references.add(ref);}
  else if(object.encoding==='feedback-zip'){const plan=await prepareFeedbackArchive({object,tables:context.tables,readRange:context.range,knownKeys:context.knownKeys}),hash=createHash('sha256');let bytes=0;for await(const part of plan.parts()){hash.update(part);bytes+=part.length;}requireValue(bytes===pin.bytes&&hash.digest('hex')===pin.sha256,'IMPORT_ARCHIVE_CREDENTIAL_OR_CANONICAL');for(const ref of plan.references)references.add(ref);}
  else if(object.encoding==='binary'&&key.startsWith('web-feedback/v1/')){const records=feedbackStore(context.tables).attachments.filter(a=>'web-feedback/v1/'+a.id===key);requireValue(records.length===1&&records[0].size===pin.bytes&&records[0].sha256===pin.sha256,'IMPORT_ATTACHMENT_INTEGRITY');}
 }
 requireValue(references.size<=10000&&[...references].every(key=>context.knownKeys.has(key)),'IMPORT_REFERENCE_MISSING');
 return {resource:name,...pin,references:[...references].sort()};
}
export async function finishHostedAudit(context,receipts){
 const byName=new Map(receipts.map(r=>[r.resource,r]));requireValue(byName.size===context.resources.size&&[...context.resources.keys()].every(name=>byName.has(name)),'IMPORT_AUDIT_COVERAGE');
 const graph=new Map();let totalRefs=0;
 for(const row of receipts){const refs=typeof row.refs==='string'?JSON.parse(row.refs):row.references;requireValue(Array.isArray(refs),'IMPORT_AUDIT_RECEIPT');totalRefs+=refs.length;requireValue(totalRefs<=100000,'IMPORT_REFERENCE_LIMIT');if(row.resource.startsWith('r2/'))graph.set(row.resource.slice(3),refs);}
 const done=new Set(),visiting=new Set();function visit(key){if(done.has(key))return;requireValue(!visiting.has(key)&&visiting.size<32,'IMPORT_REFERENCE_CYCLE');requireValue(context.knownKeys.has(key),'IMPORT_REFERENCE_MISSING');visiting.add(key);for(const ref of graph.get(key)||[])visit(ref);visiting.delete(key);done.add(key);}for(const key of context.knownKeys)visit(key);
 if(context.knownKeys.has('company-assets/index.json')){
  const index=validateAssetIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await context.bytes('r2/company-assets/index.json'))));
  for(const asset of index.assets){const row=byName.get('r2/'+asset.key);requireValue(row&&row.bytes===asset.bytes&&row.sha256===asset.sha256,'IMPORT_PRIVATE_ASSET_INTEGRITY');}
 }
 const values=JSON.parse(context.tables.shared_state[0].values),users=typeof values.platformUsers==='string'?JSON.parse(values.platformUsers):values.platformUsers;
 requireValue(Array.isArray(users)&&users.length>0&&users.every(u=>u&&typeof u.id==='string'&&typeof u.role==='string')&&new Set(users.map(u=>u.id)).size===users.length,'IMPORT_ACCOUNT_STRUCTURE');
 return {resources:context.resources.size,objects:context.knownKeys.size,accounts:users.length,histories:context.tables.state_backups.length,credentialFieldsExcluded:true,dataReady:false,authReady:false};
}
