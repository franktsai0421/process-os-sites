// Target owner's preconfigured verifier only; source credentials never migrate.
import {createHash} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
import {readBoundedBody,maximumJsonBytes} from './snapshot-redaction.mjs';
import {jsonTransformStream,analyzeJsonStream} from './snapshot-json-stream.mjs';
const encoder=new TextEncoder(),fail=(v,c)=>{if(!v)throw Error(c);};
const userId=value=>String(value||'').trim().toLowerCase();
const encode=v=>encoder.encode(JSON.stringify(v));
async function streamRange(open,offset,length){const reader=(await open()).getReader(),out=new Uint8Array(length);let position=0,copied=0;try{while(copied<length){const next=await reader.read();fail(!next.done,'IMPORT_OWNER_SOURCE_TRUNCATED');const from=Math.max(0,offset-position),to=Math.min(next.value.length,offset+length-position);if(to>from){out.set(next.value.subarray(from,to),copied);copied+=to-from;}position+=next.value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return out;}
function checkedRef(ref,prefix){fail(ref&&typeof ref.key==='string'&&new RegExp('^'+prefix+'/[a-f0-9]{64}\\.json$').test(ref.key)&&ref.sha256===ref.key.match(/[a-f0-9]{64}/)[0],'IMPORT_OWNER_STORAGE_REFERENCE');return ref;}
export async function planOwnerStorage({row,ownerId,retained,bucket,knownKeys}){
 const values=JSON.parse(row.values),encoded=typeof values.platformUsers==='string',original=encoded?values.platformUsers:JSON.stringify(values.platformUsers),users=JSON.parse(original),matches=users.filter(u=>userId(u.id)===userId(ownerId)),user=matches[0];
 fail(matches.length===1&&user&&user.role==='admin'&&user.disabled!==true&&user.enabled!==false&&user.authMode!=='demo'&&!user.deletedAt,'IMPORT_OWNER_NOT_IN_SOURCE');
 Object.assign(user,retained.credentials);user.authEpoch=Math.max(retained.authEpoch,Number.isSafeInteger(user.authEpoch)?user.authEpoch:0)+1;
 const replacement=JSON.stringify(users);let object=null;
 if(values.__processRecords){
  fail(values.__processRecords.version===1&&values.__processRecords.values&&typeof values.__processRecords.values==='object','IMPORT_OWNER_STORAGE_REFERENCE');
  const ref=checkedRef(values.__processRecords.values.platformUsers,'state-records/v1'),old=await bucket.get(ref.key);
  fail(old?.body&&old.size<=maximumJsonBytes,'IMPORT_OWNER_SOURCE_MISSING');const raw=await readBoundedBody(old.body);fail(await sha256(raw)===ref.sha256&&new TextDecoder('utf-8',{fatal:true}).decode(raw)===original,'IMPORT_OWNER_SOURCE_ACCOUNTS_MISMATCH');
  const bytes=encoder.encode(replacement),digest=await sha256(bytes),key='state-records/v1/'+digest+'.json';
  values.__processRecords.values.platformUsers={key,sha256:digest};
  object={key,bytes:bytes.length,sha256:digest,metadata:{httpMetadata:{contentType:'application/json'},customMetadata:{}},async readRange(offset,length){return bytes.slice(offset,offset+length);}};
 }else if(values.__processR2){
  fail(encoded,'IMPORT_OWNER_SOURCE_ACCOUNTS_MISMATCH');const ref=checkedRef(values.__processR2,'snapshots'),head=await bucket.head(ref.key);fail(head,'IMPORT_OWNER_SOURCE_MISSING');
  async function base(){const source=await bucket.get(ref.key,{onlyIf:{etagMatches:head.etag}});fail(source?.body&&source.size===head.size,'IMPORT_OWNER_SOURCE_CHANGED');const reader=source.body.getReader(),hash=createHash('sha256');let length=0;return new ReadableStream({async pull(c){try{const next=await reader.read();if(next.done){reader.releaseLock();fail(length===head.size&&hash.digest('hex')===ref.sha256,'IMPORT_OWNER_SOURCE_CHANGED');c.close();}else{length+=next.value.length;hash.update(next.value);c.enqueue(next.value);}}catch(error){c.error(error);}},async cancel(){await reader.cancel().catch(()=>{});reader.releaseLock();}});}
  const options={knownKeys,ownerAccountReplacement:{expected:original,replacement}};
  const stats=await analyzeJsonStream(base,options),key='snapshots/'+stats.sha256+'.json';values.__processR2={key,sha256:stats.sha256};
  object={key,bytes:stats.bytes,sha256:stats.sha256,metadata:{httpMetadata:{contentType:'application/json'},customMetadata:{}},readRange:(offset,length)=>streamRange(async()=>jsonTransformStream(await base(),options),offset,length)};
 }
 values.platformUsers=encoded?replacement:users;
 return {row:{...row,values:JSON.stringify(values)},object};
}
